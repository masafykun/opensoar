"""SOAR ダッシュボード用の集約データ（KPI / ログソース / アラート / 月次）を
本番の実ログ（nginx不正アクセス・SSH失敗・fail2ban・systemd）から構築する。"""
import hashlib
import os
import re
from collections import defaultdict
from datetime import datetime, timedelta, timezone

import monitor
import threats

# 監視対象の表示名・ホスト（環境変数で各自の環境に合わせる）
SITE_NAME = os.getenv("SOAR_SITE_NAME", "SOAR Dashboard")
PROTECTED_HOST = os.getenv("SOAR_PROTECTED_HOST", "")

# 攻撃種別ごとのメタ（重大度・AI要約・推奨対応）。monitor.ATTACK_PATTERNS のラベルに対応
_TYPE_META = {
    "機密ファイルアクセス": {
        "sev": "High",
        "summary": "公開資産に対し管理画面・認証情報・既知の脆弱パスを狙った探索アクセスが検知されています。自動化スキャナによる無差別探索の可能性が高く、現時点で成功応答(2xx)は確認されていません。",
        "recs": ["対象IPのFW/Fail2banブロックを検討", "該当パスが404を返す（非公開である）ことを確認", "WAF/nginxでスキャナパターンを遮断", "アクセスログの保全"],
    },
    "SQLインジェクション": {
        "sev": "Critical",
        "summary": "クエリパラメータにSQL構文を注入する試行が検知されています。DBを直接狙う攻撃で、成功するとデータ漏洩・改ざんに繋がります。",
        "recs": ["対象IPを即時ブロック", "該当エンドポイントのパラメータ化クエリを確認", "DBエラーログを確認", "WAFのSQLiルールを強化"],
    },
    "XSS": {
        "sev": "High",
        "summary": "リクエストにスクリプトインジェクションのパターンが含まれています。反射型/格納型XSSを狙った試行の可能性があります。",
        "recs": ["対象IPをブロック", "出力エスケープの実装を確認", "CSPヘッダの適用状況を確認"],
    },
    "システムファイルアクセス": {
        "sev": "Critical",
        "summary": "/etc/passwd や .ssh、proc/self 等のシステムファイルへのパストラバーサル試行が検知されています。",
        "recs": ["対象IPを即時ブロック", "パストラバーサル防御を確認", "該当アプリのファイルアクセス権限を確認"],
    },
    "SSH失敗": {
        "sev": "High",
        "summary": "SSHへのログイン失敗が多数発生しています。辞書攻撃・ブルートフォースによる不正ログイン試行で、Fail2banの自動BAN対象です。",
        "recs": ["公開鍵認証のみに限定（パスワード認証を無効化）", "Fail2banのban時間延長を検討", "SSHポートの限定 / Tailnet化を検討"],
    },
}
_DEFAULT_META = {
    "sev": "Medium",
    "summary": "通常と異なるアクセスパターンが検知されています。継続監視を推奨します。",
    "recs": ["送信元IPの挙動を継続監視", "アクセスログの保全"],
}

_MONTHS = {"Jan": 1, "Feb": 2, "Mar": 3, "Apr": 4, "May": 5, "Jun": 6,
           "Jul": 7, "Aug": 8, "Sep": 9, "Oct": 10, "Nov": 11, "Dec": 12}


def _parse_nginx_time(s: str):
    # 例: 25/Jun/2026:23:09:57 +0900
    m = re.match(r"(\d+)/(\w+)/(\d+):(\d+):(\d+):(\d+) ([+-]\d{4})", s or "")
    if not m:
        return None
    d, mon, y, hh, mm, ss, tz = m.groups()
    try:
        tzoff = int(tz[:3]) * 3600 + (1 if tz[0] == "+" else -1) * int(tz[3:]) * 60
        return datetime(int(y), _MONTHS.get(mon, 1), int(d), int(hh), int(mm), int(ss),
                        tzinfo=timezone(timedelta(seconds=tzoff)))
    except Exception:
        return None


def _rel_time(dt) -> str:
    if not dt:
        return "—"
    sec = (datetime.now(dt.tzinfo) - dt).total_seconds()
    if sec < 60:
        return "たった今"
    if sec < 3600:
        return f"{int(sec // 60)}分前"
    if sec < 86400:
        return f"{int(sec // 3600)}時間前"
    return f"{int(sec // 86400)}日前"


def _sev_rank(s):
    return {"Critical": 3, "High": 2, "Medium": 1, "Low": 0}.get(s, 0)


def _ai_score(sev, events):
    base = {"Critical": 88, "High": 74, "Medium": 60, "Low": 45}.get(sev, 50)
    return min(99, base + min(11, events // 3))


def _alert_id(kind: str, ip: str) -> str:
    # 48bit に拡張し種別prefixで衝突を回避（旧[:4]=16bitは100IPで衝突多発）
    return "ALT-" + hashlib.md5(f"{kind}:{ip}".encode()).hexdigest()[:12].upper()


def _build_alerts(suspicious: list, f2b: dict):
    """不審リクエスト全件(打ち切りなし)＋SSH失敗(本番+リモート統合)からアラートを構築。
    重大度は地図(/api/threats)と同一の件数連動ロジック。lastEpoch を付与し、
    フロント側で「新しい順」並べ替えを可能にする。"""
    banned = set(f2b.get("banned_ips", []))
    now_ep = datetime.now(timezone.utc).timestamp()

    by_ip = defaultdict(list)
    for r in suspicious:
        by_ip[r["ip"]].append(r)

    alerts = []
    for ip, reqs in by_ip.items():
        types = defaultdict(int)
        for r in reqs:
            types[r["type"]] += 1
        top_type = max(types, key=types.get)
        meta = _TYPE_META.get(top_type, _DEFAULT_META)
        events = len(reqs)
        # 地図(/api/threats)と同一の件数連動ロジックで重大度を算出（種別固定だと地図と食い違う）
        dangerous = (ip in banned) or any(t in threats._DANGEROUS_TYPES for t in types)
        sev = threats._severity(events, dangerous)
        latest = max((_parse_nginx_time(r["time"]) for r in reqs if _parse_nginx_time(r["time"])), default=None)
        last_ep = latest.timestamp() if latest else 0.0
        locs = sorted({f'{r.get("env", "prod")}:{r.get("site", "共通")}' for r in reqs})
        host_label = "／".join(locs)[:48] or PROTECTED_HOST
        tl = []
        # 実時刻(ts)で降順（文字列ソートは月跨ぎで誤順）
        for r in sorted(reqs, key=lambda x: x.get("ts") if x.get("ts") is not None else 0.0, reverse=True)[:6]:
            dt = _parse_nginx_time(r["time"])
            hhmm = dt.strftime("%H:%M:%S") if dt else (r["time"] or "—")
            tl.append({"time": hhmm, "event": f'[{r.get("env", "prod")}:{r.get("site", "共通")}] {r["method"]} {r["path"]} → {r["status"]}'})
        alerts.append({
            "id": _alert_id("nginx", ip),
            "title": f"{top_type}の探索アクセス ({ip})",
            "severity": sev,
            "status": "Escalated" if ip in banned else "New",
            "logSource": "nginx Access Log",
            "user": "—",
            "host": host_label,
            "sourceIp": ip,
            "time": _rel_time(latest),
            "lastEpoch": last_ep,
            "aiScore": _ai_score(sev, events),
            "aiSummary": meta["summary"],
            "confidence": min(98, 70 + events),
            "evidenceLogs": events,
            "timeline": tl,
            "recommendations": meta["recs"],
            "_rank": _sev_rank(sev),
            "_events": events,
        })

    # SSH ブルートフォース（本番lastb + リモート検証を統合、上位 _MAX_SOURCES で地図と同じ範囲）
    ssh_counts, _, _ = threats._ssh_fail_counts()
    for ip, cnt in sorted(ssh_counts.items(), key=lambda kv: kv[1], reverse=True)[:threats._MAX_SOURCES]:
        meta = _TYPE_META["SSH失敗"]
        sev = threats._severity(cnt, ip in banned)  # 地図と同一ロジック（BAN中は格上げ）
        alerts.append({
            "id": _alert_id("ssh", ip),
            "title": f"SSHブルートフォース ({ip})",
            "severity": sev,
            "status": "Escalated" if ip in banned else "New",
            "logSource": "SSH / auth.log",
            "user": "root ほか",
            "host": PROTECTED_HOST,
            "sourceIp": ip,
            "time": "直近",
            "lastEpoch": now_ep,
            "aiScore": _ai_score(sev, cnt),
            "aiSummary": meta["summary"],
            "confidence": min(98, 75 + cnt // 50),
            "evidenceLogs": cnt,
            "timeline": [{"time": "—", "event": f"SSHログイン失敗 {cnt} 回（lastb 集計）"}],
            "recommendations": meta["recs"],
            "_rank": _sev_rank(sev),
            "_events": cnt,
        })

    alerts.sort(key=lambda a: (a["_rank"], a["_events"]), reverse=True)
    for a in alerts:
        a.pop("_rank", None)
        a.pop("_events", None)
    return alerts


def _log_sources(attacks: dict, f2b: dict):
    susp = attacks.get("suspicious_count", len(attacks.get("suspicious_requests", [])))
    return [
        {"name": "nginx Access Log", "status": "Healthy", "events": attacks.get("total_requests", 0), "icon": "📋"},
        {"name": "不審リクエスト検知", "status": "Healthy", "events": susp, "icon": "🚨"},
        {"name": "SSH / auth.log", "status": "Healthy", "events": f2b.get("total_failed", 0), "icon": "🔑"},
        {"name": "Fail2ban", "status": "Healthy", "events": f2b.get("total_banned", 0), "icon": "🛡"},
    ]


def _services_uptime():
    try:
        services = monitor.get_services()
        total = len(services)
        healthy = sum(1 for s in services if s.get("running"))
        return total, (f"{healthy / total * 100:.1f}%" if total else "—")
    except Exception:
        return 0, "—"


def _fmt_k(n):
    return f"{n / 1000:.0f}K" if n >= 1000 else str(n)


def get_dashboard():
    # 重いログ集計は1回だけ実行（_scan_attacks はキャッシュ）。KPIは集計値、アラートは全件から
    attacks = monitor.get_attacks()         # total_requests / suspicious_count など
    scan = monitor._scan_attacks()          # 打ち切りなしの不審リクエスト全件
    f2b = monitor.get_fail2ban()
    alerts = _build_alerts(scan["suspicious"], f2b)
    log_sources = _log_sources(attacks, f2b)

    # 履歴DBに永続化。手動対応ステータス(Investigating/Resolved)のみライブへ反映し、
    # New/Escalated は毎回ライブ再計算する（BAN中=Escalated を確実に表示／不要な固着を回避）
    try:
        import alerts_store
        alerts_store.upsert_alerts(alerts)
        smap = alerts_store.status_map()
        for a in alerts:
            stored = smap.get(a["id"])
            if stored in ("Investigating", "Resolved"):
                a["status"] = stored
    except Exception:
        pass

    active = [a for a in alerts if a.get("status") != "Resolved"]
    critical = sum(1 for a in active if a["severity"] in ("Critical", "High"))
    resolved_count = sum(1 for a in alerts if a.get("status") == "Resolved")
    total_req = attacks.get("total_requests", 0)
    protected, uptime = _services_uptime()
    if not protected:
        protected = len(log_sources)
        uptime = "100.0%"

    try:
        alerts_store.record_daily(total_req, attacks.get("suspicious_count", 0), len(alerts), resolved_count)
    except Exception:
        pass

    detection_rules = len(getattr(monitor, "ATTACK_PATTERNS", [])) + len(getattr(monitor, "ZIP_ATTACK_PATTERNS", []))

    kpi = {
        "unresolvedAlerts": len(active),
        "criticalAlerts": critical,
        "aiRiskScore": min(100, 30 + len(alerts) * 3 + critical * 4),
        "logsLast24h": _fmt_k(total_req),
        "protectedAssets": protected,
        "logSourceUptime": uptime,
    }

    monthly = {
        "totalEvents": _fmt_k(total_req),
        "highSeverity": critical,
        "bannedIps": f2b.get("total_banned", 0),
        "uniqueSources": len({a["sourceIp"] for a in alerts}),
        "logSourceUptime": uptime,
        "detectionRules": detection_rules,
    }

    return {
        "siteName": SITE_NAME,
        "protectedHost": PROTECTED_HOST,
        "updated": datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds"),
        "kpi": kpi,
        "logSources": log_sources,
        "alerts": alerts,
        "monthly": monthly,
    }


def get_by_product() -> dict:
    """プロダクト(サイト)別に「どんな攻撃が来ているか」を集計する。"""
    s = monitor._scan_attacks()
    banned = set(monitor.get_fail2ban().get("banned_ips", []))

    agg: dict = {}
    for r in s["suspicious"]:
        key = (r.get("env", "prod"), r.get("site", "共通"))
        a = agg.setdefault(key, {
            "env": key[0], "site": key[1],
            "attacks": 0, "ips": set(), "types": {}, "ipcount": {},
            "dangerous": False, "latest": None,
        })
        a["attacks"] += 1
        a["ips"].add(r["ip"])
        a["types"][r["type"]] = a["types"].get(r["type"], 0) + 1
        a["ipcount"][r["ip"]] = a["ipcount"].get(r["ip"], 0) + 1
        if r["type"] in threats._DANGEROUS_TYPES or r["ip"] in banned:
            a["dangerous"] = True
        dt = _parse_nginx_time(r["time"])
        if dt and (a["latest"] is None or dt > a["latest"]):
            a["latest"] = dt

    products = []
    for a in agg.values():
        top_types = sorted(a["types"].items(), key=lambda x: x[1], reverse=True)
        top_ips = sorted(a["ipcount"].items(), key=lambda x: x[1], reverse=True)[:5]
        products.append({
            "env": a["env"],
            "site": a["site"],
            "label": f'{a["env"]} / {a["site"]}',
            "attacks": a["attacks"],
            "uniqueIps": len(a["ips"]),
            "severity": threats._severity(a["attacks"], a["dangerous"]),
            "types": [{"type": t, "count": c} for t, c in top_types],
            "topAttackers": [{"ip": ip, "count": c} for ip, c in top_ips],
            "lastSeen": _rel_time(a["latest"]),
        })
    products.sort(key=lambda p: p["attacks"], reverse=True)

    return {
        "products": products,
        "totalProducts": len(products),
        "totalAttacks": sum(p["attacks"] for p in products),
        "updated": datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds"),
    }
