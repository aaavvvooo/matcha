#!/usr/bin/env bash
# Start the stack on this machine's LAN address (see docker-compose.lan.yaml).
# Usage: scripts/lan-up.sh [LAN_IP] [extra docker compose up args]
set -euo pipefail

cd "$(dirname "$0")/.."

detect_ip() {
  # WSL + Docker Desktop: the reachable address is the Windows host's, not WSL's.
  if command -v powershell.exe >/dev/null 2>&1; then
    powershell.exe -NoProfile -Command \
      "(Get-NetIPConfiguration | Where-Object { \$_.IPv4DefaultGateway -ne \$null -and \$_.NetAdapter.Status -eq 'Up' } | Select-Object -First 1).IPv4Address.IPAddress" \
      2>/dev/null | tr -d '\r'
    return
  fi
  # Native Linux: source address of the default route.
  ip -4 route get 1.1.1.1 2>/dev/null | awk '{for (i = 1; i < NF; i++) if ($i == "src") print $(i + 1)}'
}

if [[ $# -gt 0 && $1 =~ ^[0-9]+(\.[0-9]+){3}$ ]]; then
  LAN_IP=$1
  shift
else
  LAN_IP=$(detect_ip)
fi

if [[ ! ${LAN_IP:-} =~ ^[0-9]+(\.[0-9]+){3}$ ]]; then
  echo "Could not detect the LAN IP. Pass it explicitly: scripts/lan-up.sh 192.168.x.x" >&2
  exit 1
fi

port=$(grep -E '^BACKEND_PORT=' .env 2>/dev/null | cut -d= -f2 | tr -d '"\r' || true)
port=${port:-8000}

cat <<EOF

  App:  http://$LAN_IP:3000   (open this on EVERY device, including this one)

  On each device's Chrome, open chrome://flags/#unsafely-treat-insecure-origin-as-secure,
  enable it, paste the line below, then Relaunch:

      http://$LAN_IP:3000,http://$LAN_IP:$port

  Other device can't load the page? Allow inbound TCP 3000 and $port in Windows Firewall
  (Private network) and make sure both devices are on the same Wi-Fi.

EOF

export LAN_IP
exec docker compose -f docker-compose.yaml -f docker-compose.lan.yaml up --build "$@"
