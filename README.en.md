# OpenSOAR

> A self-hosted, real-time threat-monitoring dashboard powered by your actual server logs

**English** | **[日本語](README.md)**

![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)
![Python](https://img.shields.io/badge/Python-3.12%2B-3776AB?logo=python&logoColor=white)
![Next.js](https://img.shields.io/badge/Next.js-14-000000?logo=next.js&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-009688?logo=fastapi&logoColor=white)
[![Live Demo](https://img.shields.io/badge/🔗_Live_Demo-soar--demo.1qaz.jp-14b8a6?logo=leaflet&logoColor=white)](https://soar-demo.1qaz.jp)

> **🔗 Live demo: [soar-demo.1qaz.jp](https://soar-demo.1qaz.jp)** — a public instance visualizing real attacks against a live server in real time. The data is anonymized (source IPs have their last two octets redacted; domains, product and environment names are masked; write actions are disabled).

OpenSOAR aggregates your server's **nginx access logs, SSH login failures and fail2ban**,
and draws "attacker → your server" arcs on a world map in real time — a lightweight,
**SOAR-style** security dashboard.

> 🛰️ **It visualizes your real logs, not sample data.** Attacker IPs are geolocated and plotted
> on the map, alerts are persisted to a history DB, and daily / weekly / monthly summaries are
> generated. An AI summary chat is built in (optional).

---

## ✨ Features

- 🗺️ **Threat Intelligence Map** — geolocates attacker IPs and animates attacks toward your server
- ⏱️ **Time-window selector** — `1h / 24h / 7d / 30d / all` (default 24h), with the actual oldest–newest range shown
- 🚨 **Alerts** — suspicious requests grouped per IP, with severity, AI summary, recommended actions and a real-log timeline. Sort by `severity / most-recent`, manage Investigating/Resolved status (persisted to a history DB)
- 📦 **Per-product view** — see "what kind of attacks" each site (vhost) is receiving
- 📈 **Reports** — today / this week / this month summaries plus an incident-response history
- 🤖 **AI summary chat** — answers questions with the alert context (OpenAI-compatible; swap in Ollama / Azure / vLLM; **optional**)
- 📧 **Email notifications** — digests of critical alerts (default: Critical) via cron
- 🌐 **Multi-server aggregation** — pull logs from remote hosts via a read-only forced-command key, merged into one map
- 🔐 **Optional built-in auth** — email OTP + JWT to gate `/api/*`, with user management (off by default)
- 🪶 **Lightweight & self-hosted** — no extra middleware; runs off standard logs + systemd

---

## 🏗️ Architecture

```
                      ┌──────────────────  your server  ──────────────────┐
browser ──/──> nginx ─┤  /api/* → FastAPI backend (:8004)                  │
       (Basic auth…)   │            ├─ log aggregation (nginx / SSH / fail2ban)│
                      │            ├─ GeoIP (ip-api.com, etc.)             │
                      │            ├─ SQLite (alert history / GeoIP cache) │
                      │            └─ AI summary (OpenAI-compatible, opt.)  │
                      │  /     → Next.js frontend (:3002)                  │
                      │            └─ Leaflet map / dashboard              │
                      └────────────────────────────────────────────────────┘
                           ▲ optional: pull & merge logs from multiple servers
```

- **backend** [`security-monitor/backend/`](security-monitor/backend/) — FastAPI. Aggregates nginx/SSH/fail2ban/systemd and serves JSON
- **frontend** [`soar/`](soar/) — Next.js 14 + react-leaflet. Polls `/api/*` and renders

---

## 🖼️ Screenshots

**Dashboard — Threat Intelligence Map**

![OpenSOAR dashboard](docs/dashboard.png)

Real attacker IPs geolocated on a world map, with a severity-tagged source list. Switch the time window from `1h` to `all`.

**Reports — period summaries & response history**

![OpenSOAR reports](docs/reports.png)

Today / this week / this month aggregates (severity breakdown, resolved/open, total requests, top attackers) plus the alert-response history.

> ※ The protected host name/IP are masked for the demo (`203.0.113.10` is an RFC 5737 documentation IP). The attacker IPs are real scanner sources.

---

## 📋 Requirements

- **Linux** (tested on Ubuntu). nginx access logs in the **combined** format
- **Python 3.12+** / **Node.js 18+**
- Optional: `fail2ban`, `systemd` (works without them — the related panels just stay empty)
- Optional: an OpenAI API key (for the AI chat; if unset, the chat is automatically disabled)

---

## 🚀 Quick start

```bash
# 1) backend
cd security-monitor/backend
python3 -m venv venv && ./venv/bin/pip install -r requirements.txt
cp .env.example .env                       # edit (SOAR_PROTECTED_HOST / lat-lon / optional OPENAI_API_KEY)
cp services.example.json services.json     # optional: list the systemd services to watch (falls back to a generic default)
./venv/bin/uvicorn main:app --host 127.0.0.1 --port 8004

# 2) frontend
cd soar
npm install
npm run dev                                # http://localhost:3002  (/api is auto-proxied to :8004)
```

For production, run `npm run build && npm start` and proxy `/api/` to `127.0.0.1:8004` with nginx.
**Always put some access control (Basic auth / VPN / trusted network) in front** — see Security below.

---

## ⚙️ Configuration (key environment variables)

| Variable | Purpose |
|---|---|
| `SOAR_SITE_NAME` / `SOAR_PROTECTED_HOST` | Display name / IP of the monitored host |
| `SOAR_DEFENDER_LAT/LON/LABEL` | The map's impact point (your server's location) |
| `SOAR_SERVICES_FILE` | Monitored-services JSON (default: `services.json`; generic default if unset) |
| `SOAR_DEFAULT_WINDOW` | Default map window (`1h`/`24h`/`7d`/`30d`/`all`) |
| `SOAR_DATA_DIR` | SQLite location (default: alongside the source) |
| `OPENAI_API_KEY` / `SOAR_CHAT_MODEL` / `OPENAI_BASE_URL` | AI chat (optional; Ollama etc. supported) |
| `GEOIP_BATCH_URL` | GeoIP endpoint (default: ip-api.com) |
| `SOAR_ALERT_EMAIL` / `SOAR_ALERT_SEVERITIES` | Email recipient / severities to notify (default: Critical) |
| `SOAR_REMOTE_ENVS` / `SOAR_REMOTE_DIR` | Multi-server aggregation (`pull_remote.sh`) |
| `SOAR_REQUIRE_AUTH` / `JWT_SECRET` / `SOAR_ADMIN_EMAIL` | Built-in OTP/JWT auth (optional; off by default) |

See [`security-monitor/backend/.env.example`](security-monitor/backend/.env.example) for the full list.

---

## 🌐 Multi-server aggregation (optional)

Copy `pull_remote.sh.example` to `pull_remote.sh`, register a **read-only forced-command key** on the
remote host, pull logs periodically via cron, and aggregate the local cache. Remote `authorized_keys`:

```
command="/home/USER/.ssh/soar-collect.sh",no-port-forwarding,no-pty,no-X11-forwarding ssh-ed25519 AAAA... soar-pull
```

This merges attacks against multiple servers onto **a single world map**.

---

## ⚠️ Security notes (read before exposing)

- **App-layer auth is OFF by default** (`SOAR_REQUIRE_AUTH=false`). Always place nginx Basic auth / VPN /
  a trusted network in front. Bind `uvicorn` to `127.0.0.1`.
- A **built-in email-OTP + JWT auth** is available. Set `SOAR_REQUIRE_AUTH=true` to require login for `/api/*`
  (configure `JWT_SECRET` / SMTP / `SOAR_ADMIN_EMAIL`). It can layer on top of front-end auth.
- If you set `OPENAI_API_KEY`, **enable auth first**. Leaving `/api/chat` open risks API-billing abuse.
- The default GeoIP **ip-api.com is free, non-commercial, plain HTTP, 45 req/min**. For commercial or
  high-volume use, switch to a local DB (e.g. MaxMind GeoLite2) via `GEOIP_BATCH_URL`.
- `.env`, `*.db` (which contain attacker IPs / history), `services.json` (your infra list) and
  `pull_remote.sh` are `.gitignore`d. **Run `git status --ignored` before committing.**

---

## 🧱 Tech stack

- **Backend**: Python / FastAPI / uvicorn / httpx / SQLite (standard library)
- **Frontend**: TypeScript / Next.js 14 (App Router) / React / react-leaflet / Tailwind
- **Data sources**: nginx access log / `lastb` (btmp) / `fail2ban-client` / `systemctl`
- **GeoIP**: ip-api.com batch (swappable)

---

## 📄 License

[MIT](LICENSE) © 2026 Masafy
