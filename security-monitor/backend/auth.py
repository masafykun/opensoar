"""認証: 登録ユーザー宛メールOTP → JWT 発行。
単一uvicornワーカー前提でOTPはメモリ保持（複数ワーカー時はSQLite化が必要）。"""
import os
import time
import secrets
import asyncio
from concurrent.futures import ThreadPoolExecutor
from typing import Optional

from fastapi import HTTPException, status
from jose import JWTError, jwt

import users_store
import mailer

JWT_SECRET = os.getenv("JWT_SECRET", "")
JWT_ALGORITHM = "HS256"
JWT_EXPIRE_SECONDS = 86400  # 24h

OTP_STORE: dict[str, tuple[str, float]] = {}   # otp -> (email, expiry)
OTP_RATE: dict[str, float] = {}                # email -> last_sent
OTP_FAILS: dict[str, int] = {}                 # email -> 連続失敗回数（email単位の総当たり対策）
_LOCK_THRESHOLD = 10
_executor = ThreadPoolExecutor(max_workers=2)


def _require_secret() -> str:
    # 未設定はサーバ設定エラー。HTTPException(503) にして認証ミドルウェアが 500 で落ちないようにする
    if not JWT_SECRET or JWT_SECRET == "security-monitor-change-this":
        raise HTTPException(status_code=503, detail="サーバー設定エラー: JWT_SECRET 未設定")
    return JWT_SECRET


def _drop_email_otps(email: str) -> None:
    for k, (e, _) in list(OTP_STORE.items()):
        if e == email:
            del OTP_STORE[k]


def _otp_html(otp: str) -> str:
    return f"""
    <div style="font-family:sans-serif;max-width:400px;margin:0 auto;padding:24px;border:1px solid #e2e8f0;border-radius:8px;">
      <h2 style="color:#1e293b;margin-top:0;">🔐 SOAR ログイン認証</h2>
      <p style="color:#475569;">ワンタイムパスワード</p>
      <div style="background:#0f172a;color:#22c55e;font-size:32px;font-weight:bold;letter-spacing:8px;text-align:center;padding:20px;border-radius:6px;margin:16px 0;">{otp}</div>
      <p style="color:#94a3b8;font-size:13px;">5分間有効。心当たりがなければ無視してください。</p>
    </div>"""


def _send_otp_sync(email: str, otp: str) -> None:
    mailer.send_email(email, f"[SOAR] ワンタイムパスワード: {otp}",
                      _otp_html(otp), f"ワンタイムパスワード: {otp}（5分間有効）")
    if os.getenv("SOAR_OTP_DEBUG") == "1":  # テスト用（本番/公開では未設定）
        try:
            with open(os.path.join(os.path.dirname(__file__), "otp_debug.log"), "a") as f:
                f.write(f"{int(time.time())} {email} {otp}\n")
        except Exception:
            pass


async def request_otp(email: str) -> dict:
    email = (email or "").strip().lower()
    # ユーザー列挙を防ぐため、どの分岐でも常に同じ応答を返す（status code も 200 固定）。
    resp = {"ok": True, "message": "登録済みのメールなら送信しました"}
    # 未登録 / SMTP未設定 → 送信せず同一応答（500 にしない＝登録有無を漏らさない）
    if not users_store.is_registered(email) or not mailer.smtp_configured():
        return resp
    now = time.time()
    # 直近60秒に送信済みなら再送しない（が応答は同一＝レート差で登録を推測されない）
    if now - OTP_RATE.get(email, 0) < 60:
        return resp
    for k, (_, exp) in list(OTP_STORE.items()):
        if exp < now:
            del OTP_STORE[k]
    otp = str(secrets.randbelow(900000) + 100000)  # 6桁・CSPRNG
    OTP_STORE[otp] = (email, now + 300)
    try:
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(_executor, _send_otp_sync, email, otp)
        OTP_RATE[email] = now  # 送信成功後にのみレート記録
    except Exception:
        OTP_STORE.pop(otp, None)  # 送信失敗ならOTP破棄（が応答は同一に保つ）
    return resp


def verify_otp(email: str, otp: str) -> str:
    email = (email or "").strip().lower()
    now = time.time()
    # 失敗カウントは email 単位。閾値超過時はその email の OTP のみ失効（全体 clear はしない＝
    # 匿名クライアントが全ユーザーのログインを妨害する DoS を防止）。
    if OTP_FAILS.get(email, 0) >= _LOCK_THRESHOLD:
        _drop_email_otps(email)
        raise HTTPException(status_code=429, detail="試行回数が多すぎます。再度OTPを請求してください")
    rec = OTP_STORE.get(otp)
    if not rec or rec[0] != email or rec[1] < now:
        OTP_FAILS[email] = OTP_FAILS.get(email, 0) + 1
        raise HTTPException(status_code=400, detail="OTPが無効または期限切れです")
    del OTP_STORE[otp]
    OTP_FAILS.pop(email, None)
    role = users_store.get_role(email) or "viewer"
    payload = {"sub": email, "role": role, "exp": int(now) + JWT_EXPIRE_SECONDS}
    return jwt.encode(payload, _require_secret(), algorithm=JWT_ALGORITHM)


def decode_token(token: Optional[str]) -> dict:
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="認証が必要です")
    try:
        return jwt.decode(token, _require_secret(), algorithms=[JWT_ALGORITHM])
    except JWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="セッションが無効です")
