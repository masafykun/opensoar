"""汎用SMTPメール送信（OTP・アラート通知で共用）。SMTP_* 環境変数を使用。"""
import os
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart


def smtp_configured() -> bool:
    return bool(os.getenv("SMTP_USER") and os.getenv("SMTP_PASS"))


def send_email(to: str, subject: str, html: str, text: str = "") -> None:
    host = os.getenv("SMTP_HOST", "smtp.gmail.com")
    port = int(os.getenv("SMTP_PORT", "587"))
    user = os.getenv("SMTP_USER", "")
    pw = os.getenv("SMTP_PASS", "")
    if not (user and pw):
        raise RuntimeError("SMTP_USER / SMTP_PASS が未設定です")
    if not to:
        raise RuntimeError("宛先メールアドレスが空です")

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = user
    msg["To"] = to
    msg.attach(MIMEText(text or "", "plain", "utf-8"))
    msg.attach(MIMEText(html, "html", "utf-8"))

    with smtplib.SMTP(host, port, timeout=15) as server:
        server.starttls()
        server.login(user, pw)
        server.send_message(msg)
