"""ユーザー管理（SQLite）。email + role(admin/viewer)。
admin のみ登録/削除可能。SOAR_ADMIN_EMAIL を起動時に admin として seed。"""
import os
import sqlite3
from datetime import datetime, timezone

_DATA_DIR = os.getenv("SOAR_DATA_DIR", os.path.dirname(__file__))
os.makedirs(_DATA_DIR, exist_ok=True)
_DB = os.path.join(_DATA_DIR, "users.db")
_ROLES = {"admin", "viewer"}


def _now() -> str:
    return datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds")


def _conn() -> sqlite3.Connection:
    c = sqlite3.connect(_DB, timeout=10)
    c.execute("PRAGMA journal_mode=WAL")
    c.execute(
        "CREATE TABLE IF NOT EXISTS users ("
        "email TEXT PRIMARY KEY, role TEXT, created_at TEXT, created_by TEXT)"
    )
    return c


def seed_admin(email: str) -> None:
    """SOAR_ADMIN_EMAIL を admin として確実に登録（無ければ作成、role違えば昇格）。"""
    email = (email or "").strip().lower()
    if not email:
        return
    c = _conn()
    try:
        row = c.execute("SELECT role FROM users WHERE email=?", (email,)).fetchone()
        if row is None:
            c.execute("INSERT INTO users VALUES (?,?,?,?)", (email, "admin", _now(), "seed"))
        elif row[0] != "admin":
            c.execute("UPDATE users SET role='admin' WHERE email=?", (email,))
        c.commit()
    finally:
        c.close()


def get_role(email: str):
    email = (email or "").strip().lower()
    c = _conn()
    try:
        r = c.execute("SELECT role FROM users WHERE email=?", (email,)).fetchone()
        return r[0] if r else None
    finally:
        c.close()


def is_registered(email: str) -> bool:
    return get_role(email) is not None


def list_users() -> list:
    c = _conn()
    try:
        rows = c.execute(
            "SELECT email, role, created_at, created_by FROM users ORDER BY created_at"
        ).fetchall()
        return [{"email": e, "role": ro, "createdAt": ca, "createdBy": cb} for e, ro, ca, cb in rows]
    finally:
        c.close()


def add_user(email: str, role: str, by: str) -> dict:
    email = (email or "").strip().lower()
    if "@" not in email:
        return {"ok": False, "error": "メールアドレスが不正です"}
    role = role if role in _ROLES else "viewer"
    c = _conn()
    try:
        exists = c.execute("SELECT 1 FROM users WHERE email=?", (email,)).fetchone()
        if exists:
            return {"ok": False, "error": "既に登録済みです"}
        c.execute("INSERT INTO users VALUES (?,?,?,?)", (email, role, _now(), by))
        c.commit()
        return {"ok": True, "email": email, "role": role}
    finally:
        c.close()


def delete_user(email: str) -> dict:
    email = (email or "").strip().lower()
    c = _conn()
    try:
        # 最後の admin は削除させない（ロックアウト防止）
        admins = c.execute("SELECT COUNT(*) FROM users WHERE role='admin'").fetchone()[0]
        target = c.execute("SELECT role FROM users WHERE email=?", (email,)).fetchone()
        if target and target[0] == "admin" and admins <= 1:
            return {"ok": False, "error": "最後の管理者は削除できません"}
        c.execute("DELETE FROM users WHERE email=?", (email,))
        c.commit()
        return {"ok": True}
    finally:
        c.close()


# 起動時に管理者を seed
seed_admin(os.getenv("SOAR_ADMIN_EMAIL", ""))
