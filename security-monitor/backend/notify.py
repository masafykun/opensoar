"""新規の重大アラート(Critical/High)をメールでダイジェスト通知する。
cron で定期実行（例: 5分毎）。送信済みは notified_at で重複防止。
宛先: SOAR_ALERT_EMAIL（無ければ SOAR_ADMIN_EMAIL → OTP_EMAIL）。
"""
import os
from dotenv import load_dotenv
load_dotenv()

import alerts_store
import mailer

# メール通知する重大度（カンマ区切り、env可変）。既定は Critical のみ＝ノイズ抑制。
# High も通知したい場合は SOAR_ALERT_SEVERITIES=Critical,High
_SEVERITIES = tuple(
    s.strip() for s in os.getenv("SOAR_ALERT_SEVERITIES", "Critical").split(",") if s.strip()
) or ("Critical",)


def _recipients() -> list:
    to = os.getenv("SOAR_ALERT_EMAIL") or os.getenv("SOAR_ADMIN_EMAIL") or os.getenv("OTP_EMAIL")
    return [to] if to else []


def _html(site: str, alerts: list) -> str:
    rows = "".join(
        f'<tr><td style="padding:6px 10px;border-bottom:1px solid #eee;color:'
        f'{"#ef4444" if a["severity"]=="Critical" else "#f97316"};font-weight:bold;">{a["severity"]}</td>'
        f'<td style="padding:6px 10px;border-bottom:1px solid #eee;">{a["title"]}</td>'
        f'<td style="padding:6px 10px;border-bottom:1px solid #eee;font-family:monospace;">{a["sourceIp"]}</td>'
        f'<td style="padding:6px 10px;border-bottom:1px solid #eee;">{a["events"]}件</td></tr>'
        for a in alerts
    )
    return f"""
    <div style="font-family:sans-serif;max-width:640px;margin:0 auto;">
      <h2 style="color:#0f172a;">🚨 SOAR セキュリティアラート（{len(alerts)}件）</h2>
      <p style="color:#475569;">監視対象 <b>{site}</b> で新規の重大アラートを検知しました。</p>
      <table style="border-collapse:collapse;width:100%;font-size:13px;">
        <tr style="background:#f8fafc;"><th style="text-align:left;padding:6px 10px;">重大度</th>
        <th style="text-align:left;padding:6px 10px;">内容</th>
        <th style="text-align:left;padding:6px 10px;">送信元IP</th>
        <th style="text-align:left;padding:6px 10px;">件数</th></tr>
        {rows}
      </table>
      <p style="color:#94a3b8;font-size:12px;margin-top:16px;">ダッシュボードで詳細を確認してください。</p>
    </div>"""


def main():
    alerts = alerts_store.get_unnotified(_SEVERITIES)
    if not alerts:
        return
    to_list = _recipients()
    if not to_list or not mailer.smtp_configured():
        return  # 宛先/SMTP未設定なら何もしない（通知OFF）
    site = os.getenv("SOAR_SITE_NAME", "SOAR")
    subject = f"[SOAR] 重大アラート {len(alerts)}件 — {site}"
    text = "\n".join(f'{a["severity"]} {a["title"]} {a["sourceIp"]} {a["events"]}件' for a in alerts)
    try:
        for to in to_list:
            mailer.send_email(to, subject, _html(site, alerts), text)
        alerts_store.mark_notified([a["id"] for a in alerts])
        print(f"notified {len(alerts)} alerts to {to_list}")
    except Exception as e:
        print(f"notify failed: {type(e).__name__}: {e}")


if __name__ == "__main__":
    main()
