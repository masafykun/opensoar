"""IP -> 緯度経度ジオロケーション（GeoIP バッチ + SQLite キャッシュ）。

既定では ip-api.com（無料・非商用・平文HTTP・45req/分）を使用。`GEOIP_BATCH_URL` で
HTTPS版/MaxMind等のプロキシに差し替え可能。結果はキャッシュDBに永続化し再問い合わせを抑制。
"""
import ipaddress
import os
import sqlite3
import time
from typing import Iterable

import httpx

# 永続データの保存先（ソースと分離。既定はモジュール同階層＝既存DBを維持）
_DATA_DIR = os.getenv("SOAR_DATA_DIR", os.path.dirname(__file__))
os.makedirs(_DATA_DIR, exist_ok=True)
_DB = os.path.join(_DATA_DIR, "geoip_cache.db")
_TTL = 30 * 24 * 3600          # 30日でキャッシュ失効（成功）
_NEG_TTL = 6 * 3600            # 解決不能/失敗は6hで再試行（恒久ネガティブキャッシュ回避）
_BATCH_URL = os.getenv("GEOIP_BATCH_URL", "http://ip-api.com/batch")


def _conn() -> sqlite3.Connection:
    c = sqlite3.connect(_DB, timeout=10)
    c.execute("PRAGMA journal_mode=WAL")
    c.execute("PRAGMA busy_timeout=5000")
    c.execute(
        "CREATE TABLE IF NOT EXISTS geo ("
        "ip TEXT PRIMARY KEY, lat REAL, lon REAL, city TEXT, country TEXT, ts INTEGER)"
    )
    return c


def _is_geolocatable(ip: str) -> bool:
    try:
        addr = ipaddress.ip_address(ip)
    except ValueError:
        return False
    return addr.is_global  # プライベート/ループバック/予約は地図化しない


def locate(ips: Iterable[str]) -> dict[str, dict]:
    """IP群 -> {ip: {lat, lon, city, country}}。キャッシュ優先、不足分のみ API。"""
    wanted = [ip for ip in dict.fromkeys(ips) if _is_geolocatable(ip)]
    if not wanted:
        return {}

    now = int(time.time())
    out: dict[str, dict] = {}
    conn = _conn()
    try:
        missing: list[str] = []
        for ip in wanted:
            row = conn.execute(
                "SELECT lat, lon, city, country, ts FROM geo WHERE ip=?", (ip,)
            ).fetchone()
            if row and row[0] is not None and now - row[4] < _TTL:
                out[ip] = {"lat": row[0], "lon": row[1], "city": row[2], "country": row[3]}
            elif row and row[0] is None and now - row[4] < _NEG_TTL:
                pass  # ネガティブキャッシュ有効中（短TTL）→ 再問い合わせしない
            else:
                missing.append(ip)

        # 不足分を GeoIP バッチで取得（最大100件/リクエスト）
        for i in range(0, len(missing), 100):
            chunk = missing[i:i + 100]
            resolved: set[str] = set()
            try:
                resp = httpx.post(
                    _BATCH_URL,
                    json=[{"query": ip, "fields": "status,country,city,lat,lon,query"} for ip in chunk],
                    timeout=8,
                )
                data = resp.json() if resp.status_code == 200 else None
            except Exception:
                data = None
            # 正規応答(list)が返った時だけ確定的に処理する。
            # 429/タイムアウト/HTML等の一時障害(data is None)では「解決不能」を確定できないため
            # ネガティブキャッシュを書かない（一時障害で地図が6h空白になるのを防止＝次回ポーリングで再試行）。
            if isinstance(data, list):
                for item in data:
                    if not isinstance(item, dict):
                        continue
                    ip = item.get("query")
                    if not ip:
                        continue
                    if item.get("status") == "success" and item.get("lat") is not None:
                        rec = {
                            "lat": item.get("lat"),
                            "lon": item.get("lon"),
                            "city": item.get("city") or "Unknown",
                            "country": item.get("country") or "Unknown",
                        }
                        out[ip] = rec
                        resolved.add(ip)
                        conn.execute(
                            "INSERT OR REPLACE INTO geo VALUES (?,?,?,?,?,?)",
                            (ip, rec["lat"], rec["lon"], rec["city"], rec["country"], now),
                        )
                # この応答で解決できなかったIP＝本当に不明 → 短TTLネガティブを backfill
                for ip in chunk:
                    if ip not in resolved:
                        conn.execute(
                            "INSERT OR REPLACE INTO geo VALUES (?,?,?,?,?,?)",
                            (ip, None, None, None, None, now),
                        )
            conn.commit()  # chunk毎にコミット（途中失敗で書込み消失を防ぐ）
    finally:
        conn.close()
    return out
