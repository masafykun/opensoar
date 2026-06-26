import subprocess
import re
import os
import glob
import json
import time
from datetime import datetime, timezone
from typing import Any

import psutil
from cryptography import x509
from cryptography.hazmat.backends import default_backend


# 監視対象サービスは各自の環境固有。実リストは services.json（gitignore）に置き、
# リポジトリには汎用例(services.example.json)のみ。未設定なら下記の汎用既定を使う。
# パスは SOAR_SERVICES_FILE で変更可（既定: ソース同階層の services.json）。
_DEFAULT_SERVICES = [
    {"name": "Nginx", "service": "nginx", "url": "", "domain": ""},
    {"name": "Fail2ban", "service": "fail2ban", "url": "", "domain": ""},
    {"name": "SSH", "service": "ssh", "url": "", "domain": ""},
    {"name": "PostgreSQL", "service": "postgresql", "url": "", "domain": ""},
]


def _load_services() -> list[dict]:
    path = os.getenv("SOAR_SERVICES_FILE", os.path.join(os.path.dirname(__file__), "services.json"))
    try:
        if path and os.path.exists(path):
            with open(path, encoding="utf-8") as f:
                data = json.load(f)
            if isinstance(data, list) and data:
                return data
    except Exception:
        pass
    return _DEFAULT_SERVICES


SERVICES = _load_services()

ATTACK_PATTERNS = [
    (r"\.\./", "パストラバーサル"),
    (r"(?i)(union\s+select|select\s+.*\s+from|drop\s+table|insert\s+into|delete\s+from|exec\s*\()", "SQLインジェクション"),
    (r"(?i)(<script|javascript:|onerror=|onload=|eval\()", "XSS"),
    (r"(?i)(\.env|\.git|wp-admin|phpmyadmin|adminer|manager|console)", "機密ファイルアクセス"),
    (r"(?i)(passwd|shadow|etc/|proc/self)", "システムファイルアクセス"),
    (r"(?i)(cmd=|shell=|exec=|system\(|passthru\()", "コマンドインジェクション"),
]


def _run(cmd: list[str]) -> str:
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=5)
        return result.stdout.strip()
    except Exception:
        return ""


def get_services() -> list[dict]:
    results = []
    for svc in SERVICES:
        name = svc["service"]
        out = _run(["systemctl", "show", name, "--property=ActiveState,SubState,ExecMainStartTimestampMonotonic,ExecMainStartTimestampUSec"])
        info: dict[str, str] = {}
        for line in out.splitlines():
            if "=" in line:
                k, _, v = line.partition("=")
                info[k.strip()] = v.strip()

        active = info.get("ActiveState", "unknown")
        sub = info.get("SubState", "unknown")
        running = active == "active" and sub == "running"

        # epoch(μs, UTC) を使う。ローカルタイムゾーン文字列(%Z)の解釈ズレを避ける
        usec_str = info.get("ExecMainStartTimestampUSec", "")
        uptime_str = ""
        if usec_str and usec_str.isdigit() and usec_str != "0":
            try:
                ts = datetime.fromtimestamp(int(usec_str) / 1_000_000, tz=timezone.utc)
                delta = datetime.now(timezone.utc) - ts
                s = max(0, int(delta.total_seconds()))
                if s < 3600:
                    uptime_str = f"{s // 60}分"
                elif s < 86400:
                    uptime_str = f"{s // 3600}時間{(s % 3600) // 60}分"
                else:
                    uptime_str = f"{s // 86400}日{(s % 86400) // 3600}時間"
            except Exception:
                uptime_str = ""

        results.append({
            "name": svc["name"],
            "service": name,
            "url": svc["url"],
            "running": running,
            "state": f"{active}/{sub}",
            "uptime": uptime_str,
        })
    return results


def get_fail2ban() -> dict:
    out = _run(["fail2ban-client", "status", "sshd"])
    banned_ips: list[str] = []
    total_banned = 0
    total_failed = 0

    for line in out.splitlines():
        if "Banned IP list:" in line:
            ips_str = line.split(":", 1)[1].strip()
            banned_ips = [ip.strip() for ip in ips_str.split() if ip.strip()]
        elif "Total banned:" in line:
            try:
                total_banned = int(line.split(":", 1)[1].strip())
            except ValueError:
                pass
        elif "Total failed:" in line:
            try:
                total_failed = int(line.split(":", 1)[1].strip())
            except ValueError:
                pass

    currently_banned = len(banned_ips)
    return {
        "currently_banned": currently_banned,
        "total_banned": total_banned,
        "total_failed": total_failed,
        "banned_ips": banned_ips,
    }


def _parse_nginx_log(path: str, limit: int = 2000) -> list[str]:
    if not os.path.exists(path):
        return []
    try:
        result = subprocess.run(["tail", "-n", str(limit), path], capture_output=True, text=True, timeout=5)
        return result.stdout.splitlines()
    except Exception:
        return []


# 全サイトの nginx アクセスログ（共通 access.log + サイト別 *_access.log）。
# ローテート済み(.1/.gz)は除外。
NGINX_ACCESS_GLOB = "/var/log/nginx/*access*.log"
_PER_FILE_LIMIT = 3000  # 1ファイルあたりの tail 行数


def _site_from_logname(path: str) -> str:
    """ログファイル名 -> サービス名（access.log→共通、factura_access.log→factura）。"""
    name = os.path.basename(path)
    if name == "access.log":
        return "共通"
    return re.sub(r"_?access\.log$", "", name) or "共通"


def _all_access_lines() -> list[tuple[str, str]]:
    """全アクセスログを tail し (site, line) のリストで返す。"""
    out: list[tuple[str, str]] = []
    for path in sorted(glob.glob(NGINX_ACCESS_GLOB)):
        site = _site_from_logname(path)
        for line in _parse_nginx_log(path, _PER_FILE_LIMIT):
            out.append((site, line))
    return out


_MONTHS = {"Jan": 1, "Feb": 2, "Mar": 3, "Apr": 4, "May": 5, "Jun": 6,
           "Jul": 7, "Aug": 8, "Sep": 9, "Oct": 10, "Nov": 11, "Dec": 12}


def _parse_log_dt(s: str):
    """nginx時刻 '26/Jun/2026:12:16:06 +0900' を datetime に（並べ替え用、naive）。"""
    m = re.match(r"(\d+)/(\w+)/(\d+):(\d+):(\d+):(\d+)", s or "")
    if not m:
        return None
    d, mon, y, hh, mm, ss = m.groups()
    try:
        return datetime(int(y), _MONTHS.get(mon, 1), int(d), int(hh), int(mm), int(ss))
    except Exception:
        return None


def _epoch(s: str):
    """nginxログ時刻 -> epoch秒（サーバのローカルtz基準、並べ替え/期間フィルタ用）。失敗時 None。"""
    dt = _parse_log_dt(s)
    if not dt:
        return None
    try:
        return dt.timestamp()
    except Exception:
        return None


_ATTACK_LOG_RE = re.compile(
    r'(?P<ip>\S+) \S+ \S+ \[(?P<time>[^\]]+)\] "(?P<method>\S+) (?P<path>\S+) \S+" (?P<status>\d+) (?P<size>\S+)'
)

# 不審リクエスト詳細リストの上限（アラート/地図用）。env で調整可
_SUSPICIOUS_DETAIL = int(os.getenv("SOAR_MAX_SUSPICIOUS", "200"))

# 重いログ走査の結果を数秒キャッシュ（ポーリング多発・ページ送り時のfork/走査を抑制）
_SCAN_TTL = float(os.getenv("SOAR_SCAN_TTL", "5"))
_scan_cache: dict = {"ts": 0.0, "data": None}


def _scan_attacks() -> dict:
    """全アクセスログ(本番+リモート)を1回走査して不審リクエスト等を抽出。数秒キャッシュ。"""
    now = time.time()
    if _scan_cache["data"] is not None and now - _scan_cache["ts"] < _SCAN_TTL:
        return _scan_cache["data"]

    tagged: list[tuple[str, str, str]] = [("prod", site, line) for site, line in _all_access_lines()]
    try:
        import remote_logs
        tagged += remote_logs.remote_nginx_lines()
    except Exception:
        pass

    status_counts: dict[str, int] = {}
    suspicious: list[dict] = []
    ip_counts: dict[str, int] = {}
    env_counts: dict[str, int] = {}

    for env, site, line in tagged:
        m = _ATTACK_LOG_RE.match(line)
        if not m:
            continue
        ip = m.group("ip")
        path = m.group("path")
        status_code = m.group("status")
        ip_counts[ip] = ip_counts.get(ip, 0) + 1
        sc_group = status_code[0] + "xx"
        status_counts[sc_group] = status_counts.get(sc_group, 0) + 1
        for pattern, label in ATTACK_PATTERNS:
            if re.search(pattern, path):
                suspicious.append({
                    "time": m.group("time"),
                    "ts": _epoch(m.group("time")),  # 期間フィルタ/ソート用 epoch秒
                    "ip": ip,
                    "method": m.group("method"),
                    "path": path[:120],
                    "status": status_code,
                    "type": label,
                    "site": site,
                    "env": env,
                })
                env_counts[env] = env_counts.get(env, 0) + 1
                break

    # 実時刻で降順ソート（文字列ソートだと月跨ぎで誤順）。ts は _epoch で算出済み
    suspicious.sort(key=lambda x: x["ts"] if x["ts"] is not None else 0.0, reverse=True)

    data = {
        "status_counts": status_counts,
        "suspicious": suspicious,
        "ip_counts": ip_counts,
        "env_counts": env_counts,
        "total_lines": len(tagged),
    }
    _scan_cache["ts"] = now
    _scan_cache["data"] = data
    return data


def get_attacks() -> dict:
    s = _scan_attacks()
    top_ips = sorted(s["ip_counts"].items(), key=lambda x: x[1], reverse=True)[:10]
    top_envs = sorted(s["env_counts"].items(), key=lambda x: x[1], reverse=True)
    return {
        "status_counts": s["status_counts"],
        "suspicious_requests": s["suspicious"][:_SUSPICIOUS_DETAIL],
        "suspicious_count": len(s["suspicious"]),
        "top_ips": [{"ip": ip, "count": cnt} for ip, cnt in top_ips],
        "targeted_envs": [{"env": e, "count": c} for e, c in top_envs],
        "total_requests": s["total_lines"],
    }


def get_suspicious_log(page: int = 1, size: int = 50) -> dict:
    """不審リクエスト全件をページング（ログ管理画面用）。"""
    s = _scan_attacks()
    rows = s["suspicious"]
    total = len(rows)
    size = max(1, min(size, 200))
    page = max(1, page)
    start = (page - 1) * size
    return {
        "entries": rows[start:start + size],
        "total": total,
        "page": page,
        "size": size,
        "pages": max(1, (total + size - 1) // size),
        "total_requests": s["total_lines"],
    }


def get_system() -> dict:
    cpu = psutil.cpu_percent(interval=0.5)
    mem = psutil.virtual_memory()
    disk = psutil.disk_usage("/")
    load = os.getloadavg()
    boot_time = datetime.fromtimestamp(psutil.boot_time(), tz=timezone.utc)
    uptime_delta = datetime.now(timezone.utc) - boot_time
    uptime_days = uptime_delta.days
    uptime_hours = uptime_delta.seconds // 3600

    net = psutil.net_io_counters()

    return {
        "cpu_percent": round(cpu, 1),
        "memory": {
            "total_gb": round(mem.total / 1024**3, 1),
            "used_gb": round(mem.used / 1024**3, 1),
            "percent": mem.percent,
        },
        "disk": {
            "total_gb": round(disk.total / 1024**3, 1),
            "used_gb": round(disk.used / 1024**3, 1),
            "percent": disk.percent,
        },
        "load_avg": [round(x, 2) for x in load],
        "uptime": f"{uptime_days}日 {uptime_hours}時間",
        "network": {
            "bytes_sent_gb": round(net.bytes_sent / 1024**3, 2),
            "bytes_recv_gb": round(net.bytes_recv / 1024**3, 2),
        },
    }


def get_ssl() -> list[dict]:
    results = []
    cert_paths = glob.glob("/etc/letsencrypt/live/*/cert.pem")
    now = datetime.now(timezone.utc)

    for cert_path in sorted(cert_paths):
        domain = cert_path.split("/")[-2]
        try:
            with open(cert_path, "rb") as f:
                cert = x509.load_pem_x509_certificate(f.read(), default_backend())
            expiry = cert.not_valid_after_utc
            days_left = (expiry - now).days
            results.append({
                "domain": domain,
                "expiry": expiry.strftime("%Y-%m-%d"),
                "days_left": days_left,
                "status": "ok" if days_left > 30 else ("warning" if days_left > 7 else "critical"),
            })
        except Exception:
            results.append({
                "domain": domain,
                "expiry": "不明",
                "days_left": -1,
                "status": "critical",
            })

    return results


def get_recent_errors() -> list[dict]:
    lines = _parse_nginx_log("/var/log/nginx/error.log", 200)
    errors = []
    for line in reversed(lines[-100:]):
        if line.strip():
            errors.append({"message": line[:200]})
    return errors[:30]


# .zip/.mov 等のTLDドメイン監視（任意機能）。SOAR_ZIP_DOMAINS（カンマ区切り）で指定。
# 未設定なら機能オフ。ログは SOAR_ZIP_LOG（環境固有のため env 化）。
ZIP_DOMAINS = [d.strip() for d in os.getenv("SOAR_ZIP_DOMAINS", "").split(",") if d.strip()]
_ZIP_LOG = os.getenv("SOAR_ZIP_LOG", "/var/log/nginx/zip-mov-domains_access.log")

ZIP_ATTACK_PATTERNS = [
    (r"\.\./", "パストラバーサル"),
    (r"(?i)(union\s+select|select\s+.*\s+from|drop\s+table)", "SQLインジェクション"),
    (r"(?i)(<script|javascript:|onerror=|onload=|eval\()", "XSS"),
    (r"(?i)(\.env|\.git|wp-admin|phpmyadmin|secrets|credentials|serviceAccount)", "機密ファイルアクセス"),
    (r"(?i)(\.aws|\.ssh|passwd|shadow|proc/self)", "システムファイルアクセス"),
    (r"(?i)(cmd=|shell=|exec=|system\(|passthru\()", "コマンドインジェクション"),
]

ZIP_LOG_RE = re.compile(
    r'(?P<ip>\S+) (?P<host>\S+) \[(?P<time>[^\]]+)\] "(?P<method>\S+) (?P<path>\S+) \S+" (?P<status>\d+) "(?P<ua>[^"]*)"'
)


def get_zip_domain_attacks() -> dict:
    if not ZIP_DOMAINS:  # 未設定なら機能オフ（空の結果を返す）
        return {"total_requests": 0, "domain_counts": [], "status_counts": {},
                "suspicious_requests": [], "suspicious_count": 0, "top_ips": []}
    lines = _parse_nginx_log(_ZIP_LOG, 5000)

    domain_counts: dict[str, int] = {}
    ip_counts: dict[str, int] = {}
    suspicious: list[dict] = []
    status_counts: dict[str, int] = {}

    for line in lines:
        m = ZIP_LOG_RE.match(line)
        if not m:
            continue

        ip = m.group("ip")
        host = m.group("host")
        path = m.group("path")
        status_code = m.group("status")
        method = m.group("method")
        time_str = m.group("time")
        ua = m.group("ua")

        domain_counts[host] = domain_counts.get(host, 0) + 1
        ip_counts[ip] = ip_counts.get(ip, 0) + 1

        sc_group = status_code[0] + "xx"
        status_counts[sc_group] = status_counts.get(sc_group, 0) + 1

        for pattern, label in ZIP_ATTACK_PATTERNS:
            if re.search(pattern, path):
                suspicious.append({
                    "time": time_str,
                    "ip": ip,
                    "host": host,
                    "method": method,
                    "path": path[:120],
                    "status": status_code,
                    "ua": ua[:80],
                    "type": label,
                })
                break

    # 実時刻で降順（文字列ソートは月跨ぎで誤順になるため _parse_log_dt を使う）
    suspicious_sorted = sorted(
        suspicious, key=lambda x: _parse_log_dt(x["time"]) or datetime.min, reverse=True
    )[:50]
    top_ips = sorted(ip_counts.items(), key=lambda x: x[1], reverse=True)[:10]
    domain_list = [{"domain": d, "count": domain_counts.get(d, 0)} for d in ZIP_DOMAINS]

    return {
        "total_requests": len(lines),
        "domain_counts": domain_list,
        "status_counts": status_counts,
        "suspicious_requests": suspicious_sorted,
        "suspicious_count": len(suspicious),
        "top_ips": [{"ip": ip, "count": cnt} for ip, cnt in top_ips],
    }
