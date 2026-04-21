#!/bin/bash
#
# VM startup script — installs Docker + Compose plugin.
# Idempotent: re-running on an already-set-up box is a no-op.
#
set -euo pipefail

if ! command -v docker >/dev/null 2>&1; then
    apt-get update
    apt-get install -y ca-certificates curl gnupg
    install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/debian/gpg \
        | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    chmod a+r /etc/apt/keyrings/docker.gpg
    . /etc/os-release
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/debian ${VERSION_CODENAME} stable" \
        > /etc/apt/sources.list.d/docker.list
    apt-get update
    apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
    systemctl enable --now docker
fi

# Let the default GCE user run docker without sudo.
if id -u iveaghlow >/dev/null 2>&1; then
    usermod -aG docker iveaghlow || true
fi

mkdir -p /opt/inflect
chmod 755 /opt/inflect

echo "[startup] Docker installed. Version: $(docker --version)"
