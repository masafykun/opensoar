"""アラート履歴の永続化（SQLite）。
- alerts: ライブ検知をupsertし、対応ステータス(New/Investigating/Resolved)を保持
- daily_stats: 日次スナップショット（リクエスト/攻撃/アラート/解決数）
- summary(): 日次・週次・月次の総まとめを実データから集計
"""
import os
import sqlite3
from datetime import datetime, timedelta, timezone

_DATA_DIR = os.getenv("SOAR_DATA_DIR", os.path.dirname(__file__))
os.makedirs(_DATA_DIR, exist_ok=True)
_DB = os.path.join(_DATA_DIR, "alerts_history.db")
_VALID_STATUS = {"New", "Investigating", "Resolved"}


def _now() -> str:
    return datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds")


def _today() -> str:
    return datetime.now(timezone.utc).astimezone().strftime("%Y-%m-%d")


def _conn() -> sqlite3.Connection:
    c = sqlite3.connect(_DB, timeout=5)
    c.execute("PRAGMA journal_mode=WAL")
    c.execute("""CREATE TABLE IF NOT EXISTS alerts (
        id TEXT PRIMARY KEY,
        title TEXT, severity TEXT, log_source TEXT, source_ip TEXT, location TEXT,
        first_seen TEXT, last_seen TEXT, events INTEGER,
        status TEXT DEFAULT 'New', resolved_at TEXT, note TEXT
    )""")
    c.execute("""CREATE TABLE IF NOT EXISTS daily_stats (
        date TEXT PRIMARY KEY,
        requests INTEGER, attacks INTEGER, alerts INTEGER, resolved INTEGER, updated TEXT
    )""")
    # メール通知済みフラグ（既存DBには後付けでカラム追加）
    cols = [r[1] for r in c.execute("PRAGMA table_info(alerts)").fetchall()]
    if "notified_at" not in cols:
        c.execute("ALTER TABLE alerts ADD COLUMN notified_at TEXT")
    return c


def get_unnotified(severities=("Critical", "High")) -> list:
    """未通知の重大アラート（メール通知対象）。"""
    conn = _conn()
    try:
        ph = ",".join("?" * len(severities))
        rows = conn.execute(
            f"SELECT id,title,severity,source_ip,location,first_seen,events "
            f"FROM alerts WHERE notified_at IS NULL AND status!='Resolved' "
            f"AND severity IN ({ph}) ORDER BY first_seen DESC",
            tuple(severities),
        ).fetchall()
        cols = ["id", "title", "severity", "sourceIp", "location", "firstSeen", "events"]
        return [dict(zip(cols, r)) for r in rows]
    finally:
        conn.close()


def mark_notified(ids: list) -> None:
    if not ids:
        return
    now = _now()
    conn = _conn()
    try:
        conn.executemany("UPDATE alerts SET notified_at=? WHERE id=?", [(now, i) for i in ids])
        conn.commit()
    finally:
        conn.close()


def upsert_alerts(alerts: list) -> None:
    if not alerts:
        return
    now = _now()
    conn = _conn()
    try:
        for a in alerts:
            row = conn.execute("SELECT id FROM alerts WHERE id=?", (a["id"],)).fetchone()
            if row is None:
                # 初回検知時は計算済みステータス(New/Escalated)を保存（履歴の整合）
                init_status = a.get("status", "New")
                if init_status not in ("New", "Escalated"):
                    init_status = "New"
                conn.execute(
                    "INSERT INTO alerts (id,title,severity,log_source,source_ip,location,"
                    "first_seen,last_seen,events,status) VALUES (?,?,?,?,?,?,?,?,?,?)",
                    (a["id"], a["title"], a["severity"], a.get("logSource", ""), a.get("sourceIp", ""),
                     a.get("host", ""), now, now, a.get("evidenceLogs", 0), init_status),
                )
            else:
                conn.execute(
                    "UPDATE alerts SET title=?, severity=?, log_source=?, location=?, "
                    "last_seen=?, events=MAX(events,?) WHERE id=?",
                    (a["title"], a["severity"], a.get("logSource", ""), a.get("host", ""),
                     now, a.get("evidenceLogs", 0), a["id"]),
                )
        conn.commit()
    finally:
        conn.close()


def status_map() -> dict:
    conn = _conn()
    try:
        return {r[0]: r[1] for r in conn.execute("SELECT id, status FROM alerts").fetchall()}
    finally:
        conn.close()


def set_status(alert_id: str, status: str, note: str = "") -> dict:
    if status not in _VALID_STATUS:
        return {"ok": False, "error": "invalid status"}
    now = _now()
    resolved_at = now if status == "Resolved" else None
    conn = _conn()
    try:
        cur = conn.execute(
            "UPDATE alerts SET status=?, resolved_at=?, note=? WHERE id=?",
            (status, resolved_at, note, alert_id),
        )
        conn.commit()
        if cur.rowcount == 0:
            return {"ok": False, "error": "alert not found"}
        return {"ok": True, "id": alert_id, "status": status, "resolvedAt": resolved_at}
    finally:
        conn.close()


def history(limit: int = 100, status: str = None) -> list:
    conn = _conn()
    try:
        q = ("SELECT id,title,severity,log_source,source_ip,location,first_seen,"
             "last_seen,events,status,resolved_at,note FROM alerts")
        params = []
        if status:
            q += " WHERE status=?"
            params.append(status)
        q += " ORDER BY last_seen DESC LIMIT ?"
        params.append(limit)
        cols = ["id", "title", "severity", "logSource", "sourceIp", "location",
                "firstSeen", "lastSeen", "events", "status", "resolvedAt", "note"]
        return [dict(zip(cols, r)) for r in conn.execute(q, params).fetchall()]
    finally:
        conn.close()


def record_daily(requests: int, attacks: int, alerts_total: int, resolved: int) -> None:
    """今日のスナップショットを更新（最新値で上書き）。"""
    conn = _conn()
    try:
        conn.execute(
            "INSERT INTO daily_stats (date,requests,attacks,alerts,resolved,updated) "
            "VALUES (?,?,?,?,?,?) ON CONFLICT(date) DO UPDATE SET "
            "requests=excluded.requests, attacks=excluded.attacks, alerts=excluded.alerts, "
            "resolved=excluded.resolved, updated=excluded.updated",
            (_today(), requests, attacks, alerts_total, resolved, _now()),
        )
        conn.commit()
    finally:
        conn.close()


def summary(days: int) -> dict:
    """直近 days 日の総まとめ（アラート履歴＋日次スナップショットから実集計）。"""
    since = (datetime.now(timezone.utc).astimezone() - timedelta(days=days)).isoformat()
    conn = _conn()
    try:
        # アラート（last_seen が期間内）
        rows = conn.execute(
            "SELECT severity,status,source_ip,events,title FROM alerts WHERE last_seen>=?",
            (since,),
        ).fetchall()
        by_sev = {"Critical": 0, "High": 0, "Medium": 0, "Low": 0}
        resolved = 0
        for sev, status, ip, events, title in rows:
            by_sev[sev] = by_sev.get(sev, 0) + 1
            if status == "Resolved":
                resolved += 1
        top = sorted(rows, key=lambda r: r[3] or 0, reverse=True)[:5]
        top_attackers = [{"ip": r[2], "events": r[3], "title": r[4]} for r in top]

        # 日次スナップショット（期間内の合算/平均）
        since_date = (datetime.now(timezone.utc).astimezone() - timedelta(days=days)).strftime("%Y-%m-%d")
        drows = conn.execute(
            "SELECT requests,attacks FROM daily_stats WHERE date>=?", (since_date,),
        ).fetchall()
        total_requests = sum((r[0] or 0) for r in drows)
        total_attacks = sum((r[1] or 0) for r in drows)

        return {
            "periodDays": days,
            "alerts": len(rows),
            "bySeverity": by_sev,
            "resolved": resolved,
            "unresolved": len(rows) - resolved,
            "topAttackers": top_attackers,
            "requests": total_requests,
            "attacks": total_attacks,
            "daysWithData": len(drows),
        }
    finally:
        conn.close()
