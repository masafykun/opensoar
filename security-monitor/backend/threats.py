"""本番の実ログ（nginx不正アクセス + SSH失敗 + fail2ban）から攻撃元を集計し、
SOAR フロント（AttackSource 形式）が描画できる JSON に変換する。"""
import os
import re
import subprocess
import time
from collections import defaultdict
from datetime import datetime, timezone

import geoip
import monitor


def _defender() -> dict:
    """地図の着弾点（保護対象の所在地）。環境変数で各自の所在地に合わせる。"""
    try:
        lat = float(os.getenv("SOAR_DEFENDER_LAT", "35.68"))
        lon = float(os.getenv("SOAR_DEFENDER_LON", "139.69"))
    except ValueError:
        lat, lon = 35.68, 139.69
    return {"lat": lat, "lon": lon, "label": os.getenv("SOAR_DEFENDER_LABEL", "保護拠点")}

# 危険度の高い攻撃種別（severity 引き上げ用）。monitor.ATTACK_PATTERNS のラベルに対応
_DANGEROUS_TYPES = {
    "SQLインジェクション", "XSS", "機密ファイルアクセス",
    "システムファイルアクセス", "ディレクトリトラバーサル", "コマンドインジェクション",
}

_MAX_SOURCES = 30  # 地図が見やすい上限


def _severity(events: int, dangerous: bool) -> str:
    if dangerous and events >= 20:
        return "Critical"
    if events >= 50 or dangerous:
        return "High"
    if events >= 10:
        return "Medium"
    return "Low"


# ── 期間ウィンドウ（地図の対象期間）─────────────────────────
# 既定は直近24時間。フロントの期間セレクタから window= で切替。
_WINDOWS = {"1h": 3600, "24h": 86400, "7d": 604800, "30d": 2592000, "all": None}
_DEFAULT_WINDOW = os.getenv("SOAR_DEFAULT_WINDOW", "24h")

_MONTHS_T = {"Jan": 1, "Feb": 2, "Mar": 3, "Apr": 4, "May": 5, "Jun": 6,
             "Jul": 7, "Aug": 8, "Sep": 9, "Oct": 10, "Nov": 11, "Dec": 12}
# lastb -i 行の「攻撃元IP ＋ 日時」を1つのパターンで拾う（IP欄は必ず日時の直前）。
# 形式: <IP> <曜日> <月> <日> <HH:MM>。ユーザー名欄は攻撃者が任意指定でき
# "1.2.3.4 Mon Jan 1 00:00" のような偽IP/日時を仕込めるが、攻撃者が制御できるのは
# 行頭のユーザー名欄のみで本物の日時は常に行末に来る。よって finditer の
# 「最後の一致」を採るだけで、ユーザー名欄への偽装（データ汚染）を無効化できる。
_LASTB_EVENT_RE = re.compile(
    r"(?P<ip>\d{1,3}(?:\.\d{1,3}){3})\s+"
    r"(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+"
    r"(?P<mon>Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+"
    r"(?P<day>\d{1,2})\s+(?P<hh>\d{1,2}):(?P<mm>\d{2})\b"
)


def _window_since(window: str, now: float):
    """window 名 -> 起点epoch（None=全期間）。"""
    sec = _WINDOWS.get(window, 86400)
    return None if sec is None else now - sec


def _iso(ep):
    if ep is None:
        return None
    try:
        return datetime.fromtimestamp(ep).astimezone().isoformat(timespec="minutes")
    except Exception:
        return None


def _lastb_event(line: str, now_dt: datetime):
    """lastb -i 行から (攻撃元IP, epoch秒) を抽出。年は当年と仮定し未来なら前年に補正。
    末尾の「IP＋日時」一致（＝本物）を採用し、ユーザー名欄へのIP/日時偽装を無効化する。
    一致しない / 0.0.0.0 の行は (None, None) を返し集計から除外する。"""
    m = None
    for m in _LASTB_EVENT_RE.finditer(line):
        pass  # 最後の一致＝行末の本物の日時（＋その直前の本物のIP）を採用
    if m is None or m.group("ip") == "0.0.0.0":
        return None, None
    ip = m.group("ip")
    try:
        dt = datetime(now_dt.year, _MONTHS_T[m.group("mon")], int(m.group("day")),
                      int(m.group("hh")), int(m.group("mm")))
        ep = dt.timestamp()
    except Exception:
        return ip, None
    if ep > now_dt.timestamp() + 86400:  # 年跨ぎ（1月に12月の行を読んだ等）
        try:
            ep = dt.replace(year=now_dt.year - 1).timestamp()
        except Exception:
            pass
    return ip, ep


def _ssh_fail_counts(since: float = None):
    """SSH ログイン失敗を本番(lastb)＋リモート(検証)から集計。
    since 指定時はその epoch 以降のみ。戻り値 (counts, tmin, tmax)。"""
    counts: dict[str, int] = defaultdict(int)
    now_dt = datetime.now()
    tmin = tmax = None

    def _consume(lines):
        nonlocal tmin, tmax
        for line in lines:
            if not line or line.startswith("btmp") or line.startswith("Failed"):
                continue
            ip, ep = _lastb_event(line, now_dt)
            if ip is None:  # IP＋日時が末尾に無い行（偽装のみ/解析不能）は除外
                continue
            if since is not None and (ep is None or ep < since):
                continue  # 期間外（時刻不明含む）は除外
            counts[ip] += 1
            if ep is not None:
                tmin = ep if tmin is None else min(tmin, ep)
                tmax = ep if tmax is None else max(tmax, ep)

    # 本番 lastb
    try:
        out = subprocess.run(
            ["lastb", "-i", "-n", "3000"], capture_output=True, text=True, timeout=8
        ).stdout
        _consume(out.splitlines())
    except Exception:
        pass
    # リモート（検証VPS）バンドル
    try:
        import remote_logs
        _consume(remote_logs.remote_ssh_fail_lines())
    except Exception:
        pass
    return counts, tmin, tmax


_WINDOW_LABELS = {"1h": "直近1時間", "24h": "直近24時間", "7d": "直近7日間", "30d": "直近30日間", "all": "全期間"}


def get_threats(window: str = None) -> dict:
    """地図用の攻撃元集計。window で対象期間を切替（既定=直近24時間）。
    nginx 不審リクエストは打ち切りなしの全件を期間フィルタ、SSH も期間内のみ集計、
    fail2ban BAN は"現在"の確定脅威として常時含める。range に実際の最古〜最新を返す。"""
    window = window if window in _WINDOWS else _DEFAULT_WINDOW
    now = time.time()
    since = _window_since(window, now)

    agg: dict[str, dict] = {}

    def _entry(ip: str) -> dict:
        return agg.setdefault(ip, {"events": 0, "types": set(), "dangerous": False})

    nmin = nmax = None  # nginx 側の時刻レンジ

    # 1) nginx 不審リクエスト（全件＝打ち切りなし。地図/アラートと per-product の不一致を解消）
    for r in monitor._scan_attacks().get("suspicious", []):
        ts = r.get("ts")
        if since is not None and (ts is None or ts < since):
            continue  # 期間外（時刻不明含む）は除外
        e = _entry(r["ip"])
        e["events"] += 1
        e["types"].add(r["type"])
        if r["type"] in _DANGEROUS_TYPES:
            e["dangerous"] = True
        if ts is not None:
            nmin = ts if nmin is None else min(nmin, ts)
            nmax = ts if nmax is None else max(nmax, ts)

    # 2) SSH ログイン失敗（本番lastb + リモート検証を統合。期間内のみ）
    ssh_counts, smin, smax = _ssh_fail_counts(since)
    for ip, cnt in ssh_counts.items():
        e = _entry(ip)
        e["events"] += cnt
        e["types"].add("SSH失敗")

    # 3) fail2ban で現在 BAN 中のIP（"現在"の確定脅威 → 期間に関わらず表示）
    for ip in monitor.get_fail2ban().get("banned_ips", []):
        e = _entry(ip)
        e["types"].add("Fail2ban BAN")
        e["dangerous"] = True

    # events 降順で上位を採用 → ジオロケーション
    ranked = sorted(agg.items(), key=lambda kv: kv[1]["events"], reverse=True)[:_MAX_SOURCES]
    geo = geoip.locate([ip for ip, _ in ranked])

    sources = []
    for ip, e in ranked:
        g = geo.get(ip)
        if not g:
            continue  # 座標が取れないIP（プライベート/解決不能）は地図に出せない
        sources.append({
            "ip": ip,
            "city": g["city"],
            "country": g["country"],
            "lat": g["lat"],
            "lon": g["lon"],
            "severity": _severity(e["events"], e["dangerous"]),
            "events": e["events"],
            "logTypes": "、".join(sorted(e["types"])),
        })

    eps = [x for x in (nmin, nmax, smin, smax) if x is not None]
    return {
        "sources": sources,
        "defender": _defender(),
        "total_events": sum(s["events"] for s in sources),
        "updated": datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds"),
        "window": window,
        "windowLabel": _WINDOW_LABELS.get(window, window),
        "windows": [{"key": k, "label": _WINDOW_LABELS[k]} for k in ("1h", "24h", "7d", "30d", "all")],
        "range": {"oldest": _iso(min(eps)) if eps else None,
                  "newest": _iso(max(eps)) if eps else None},
    }
