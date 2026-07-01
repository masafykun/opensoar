"""検証VPSからpullしてキャッシュしたリモートログを読む。
pull_remote.sh が /var/log/soar-remote/<env>.txt に保存したバンドル
（===NGINX=== / ##SITE: / ===SSHFAIL=== 区切り）をパースする。"""
import os
import re

# pull_remote.sh の出力先と揃える（同一の SOAR_REMOTE_DIR を共有）
_REMOTE_DIR = os.getenv("SOAR_REMOTE_DIR", "/var/log/soar-remote")
# 連携するリモート環境名（カンマ区切り）。空なら無効。
_ENVS = [e.strip() for e in os.getenv("SOAR_REMOTE_ENVS", "").split(",") if e.strip()]
# サイト名から剥がすドメインサフィックス（表示用、任意）
_DOMAIN_SUFFIX = os.getenv("SOAR_DOMAIN_SUFFIX", "")


def _read_bundle(env: str):
    path = os.path.join(_REMOTE_DIR, f"{env}.txt")
    if not os.path.exists(path):
        return [], []
    try:
        with open(path, encoding="utf-8", errors="replace") as f:
            text = f.read()
    except Exception:
        return [], []

    nginx: list[tuple[str, str]] = []
    sshfail: list[str] = []
    section = None
    site = "共通"
    for line in text.splitlines():
        if line == "===NGINX===":
            section = "nginx"
            continue
        if line == "===SSHFAIL===":
            section = "ssh"
            continue
        if line.startswith("##SITE:"):
            s = re.sub(r"_?access\.log$", "", line[7:]) or "共通"
            site = s[:-len(_DOMAIN_SUFFIX)] if _DOMAIN_SUFFIX and s.endswith(_DOMAIN_SUFFIX) else s
            continue
        if section == "nginx":
            nginx.append((site, line))
        elif section == "ssh":
            sshfail.append(line)
    return nginx, sshfail


def remote_nginx_lines() -> list[tuple[str, str, str]]:
    """[(env, site, line), ...]"""
    out: list[tuple[str, str, str]] = []
    for env in _ENVS:
        nginx, _ = _read_bundle(env)
        for site, line in nginx:
            out.append((env, site, line))
    return out


def remote_ssh_fail_lines() -> list[str]:
    """全リモートの SSH 失敗ログ行（lastb 形式）をそのまま返す。
    時刻付きで期間フィルタしたい呼び出し側（threats._ssh_fail_counts）が使う。"""
    out: list[str] = []
    for env in _ENVS:
        _, sshfail = _read_bundle(env)
        out.extend(sshfail)
    return out


def remote_ssh_fail_counts() -> dict[str, int]:
    """{ip: count}（全リモート合算）。後方互換用。
    IP抽出は threats._lastb_event（行末の日時直前=本物のIP欄を採用）に委譲し、
    ユーザー名欄へIP風文字列を仕込む偽装を無効化する。"""
    from datetime import datetime
    import threats  # 遅延importで循環参照を回避
    now_dt = datetime.now()
    counts: dict[str, int] = {}
    for line in remote_ssh_fail_lines():
        ip, _ = threats._lastb_event(line, now_dt)
        if ip:
            counts[ip] = counts.get(ip, 0) + 1
    return counts
