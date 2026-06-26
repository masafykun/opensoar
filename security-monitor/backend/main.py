import os
from typing import Optional
from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI, Request, Response, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

import monitor
import threats
import dashboard
import chat as chat_mod
import auth
import users_store

app = FastAPI(title="SOAR Monitor API", docs_url=None, redoc_url=None)

# 許可オリジンは環境変数で（既定はローカル開発。本番は同一オリジン構成のため通常CORSは不発火）
_origins = [o.strip() for o in os.getenv("SOAR_CORS_ORIGINS", "http://localhost:3002").split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── 認証設定 ───────────────────────────────────────────────
REQUIRE_AUTH = os.getenv("SOAR_REQUIRE_AUTH", "false").lower() in ("1", "true", "yes")
COOKIE_SECURE = os.getenv("SOAR_COOKIE_SECURE", "true").lower() in ("1", "true", "yes")
COOKIE_NAME = "soar_token"
# 認証不要パス（ヘルス・ログイン系）
_AUTH_EXEMPT = {"/api/health"}


def _current_user(request: Request) -> Optional[dict]:
    token = request.cookies.get(COOKIE_NAME)
    if not token:
        return None
    try:
        return auth.decode_token(token)
    except HTTPException:
        return None


@app.middleware("http")
async def auth_guard(request: Request, call_next):
    path = request.url.path
    if REQUIRE_AUTH and path.startswith("/api/") and path not in _AUTH_EXEMPT \
            and not path.startswith("/api/auth/"):
        if _current_user(request) is None:
            return JSONResponse({"detail": "認証が必要です"}, status_code=401)
    return await call_next(request)


def _require_admin(request: Request) -> dict:
    user = _current_user(request)
    # 認証無効時はローカル運用としてadmin扱い（nginx等の前段認証に委ねる）
    if not REQUIRE_AUTH:
        return user or {"sub": "local", "role": "admin"}
    if not user:
        raise HTTPException(status_code=401, detail="認証が必要です")
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="管理者権限が必要です")
    return user


class ChatReq(BaseModel):
    message: str = Field(max_length=2000)
    history: list | None = None


class StatusReq(BaseModel):
    id: str = Field(max_length=64)
    status: str
    note: str | None = Field(default="", max_length=500)


class OtpReq(BaseModel):
    email: str = Field(max_length=200)


class LoginReq(BaseModel):
    email: str = Field(max_length=200)
    otp: str = Field(max_length=10)


class UserReq(BaseModel):
    email: str = Field(max_length=200)
    role: str = Field(default="viewer", max_length=20)


# ── 認証エンドポイント ─────────────────────────────────────
@app.post("/api/auth/request-otp")
async def request_otp(req: OtpReq):
    return await auth.request_otp(req.email)


@app.post("/api/auth/login")
async def login(req: LoginReq, response: Response):
    token = auth.verify_otp(req.email, req.otp)
    response.set_cookie(COOKIE_NAME, token, httponly=True, samesite="lax",
                        secure=COOKIE_SECURE, max_age=auth.JWT_EXPIRE_SECONDS, path="/")
    role = users_store.get_role(req.email.strip().lower()) or "viewer"
    return {"ok": True, "email": req.email.strip().lower(), "role": role}


@app.post("/api/auth/logout")
async def logout(response: Response):
    response.delete_cookie(COOKIE_NAME, path="/")
    return {"ok": True}


@app.get("/api/auth/me")
def me(request: Request):
    if not REQUIRE_AUTH:
        return {"authed": True, "email": "local", "role": "admin", "enforced": False}
    user = _current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="未認証")
    return {"authed": True, "email": user.get("sub"), "role": user.get("role", "viewer"), "enforced": True}


# ── ユーザー管理（admin のみ変更可能）─────────────────────
@app.get("/api/users")
def get_users(request: Request):
    if REQUIRE_AUTH and _current_user(request) is None:
        raise HTTPException(status_code=401, detail="認証が必要です")
    return {"users": users_store.list_users()}


@app.post("/api/users")
def post_user(req: UserReq, request: Request):
    _require_admin(request)
    return users_store.add_user(req.email, req.role, _current_user(request).get("sub") if _current_user(request) else "local")


@app.delete("/api/users")
def del_user(req: UserReq, request: Request):
    _require_admin(request)
    return users_store.delete_user(req.email)


# 以下の GET は subprocess/tail/sqlite 等のブロッキングIOを行うため `def`（同期）で定義する。
# Starlette が自動でスレッドプールに逃がし、イベントループを塞がない（多クライアント時の直列化を回避）。
@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.get("/api/services")
def get_services():
    return monitor.get_services()


@app.get("/api/attacks")
def get_attacks():
    return monitor.get_attacks()


@app.get("/api/system")
def get_system():
    return monitor.get_system()


@app.get("/api/ssl")
def get_ssl():
    return monitor.get_ssl()


@app.get("/api/fail2ban")
def get_fail2ban():
    return monitor.get_fail2ban()


@app.get("/api/errors")
def get_errors():
    return monitor.get_recent_errors()


@app.get("/api/zip-attacks")
def get_zip_attacks():
    return monitor.get_zip_domain_attacks()


@app.get("/api/threats")
def get_threats(window: str = "24h"):
    return threats.get_threats(window)


@app.get("/api/logs")
def get_logs(page: int = 1, size: int = 50):
    return monitor.get_suspicious_log(page, size)


@app.get("/api/dashboard")
def get_dashboard():
    return dashboard.get_dashboard()


@app.get("/api/products")
def get_products():
    return dashboard.get_by_product()


@app.post("/api/chat")
async def post_chat(req: ChatReq):
    return await chat_mod.chat(req.message, req.history)


@app.post("/api/alerts/status")
def post_alert_status(req: StatusReq):
    import alerts_store
    return alerts_store.set_status(req.id, req.status, (req.note or "")[:500])


@app.get("/api/alerts/history")
def get_alert_history(limit: int = 100, status: str = None):
    import alerts_store
    return {"alerts": alerts_store.history(limit, status)}


@app.get("/api/reports/summary")
def get_reports_summary():
    import alerts_store
    return {
        "day": alerts_store.summary(1),
        "week": alerts_store.summary(7),
        "month": alerts_store.summary(30),
    }
