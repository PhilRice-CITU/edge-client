#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Hum.ai — First-Time Setup (dev / pre-package install)
#
# Run this once after cloning the repo on a new Pi:
#   chmod +x setup.sh && ./setup.sh
#
# For end-users: install the .deb or AppImage instead.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ELECTRON_DIR="$SCRIPT_DIR/electron-app"

_green()   { echo -e "\033[0;32m✔  $*\033[0m"; }
_yellow()  { echo -e "\033[0;33m→  $*\033[0m"; }
_red()     { echo -e "\033[0;31m✖  $*\033[0m"; }
_section() { echo -e "\n\033[1;34m── $* ──────────────────────────────────\033[0m"; }

# Detect platform
if [[ "$(uname -m)" == aarch64* ]] || [[ "$(uname -m)" == armv* ]]; then
    IS_PI=1
else
    IS_PI=0
    _yellow "Not running on ARM — skipping system package install (dev mode)."
fi

# ── 1. System packages (Pi only) ──────────────────────────────────────────────
if [[ "$IS_PI" -eq 1 ]]; then
    _section "System packages"
    sudo apt-get update -qq
    sudo apt-get install -y --no-install-recommends \
        python3 python3-pip \
        curl git \
        libgtk-3-0 libnotify4 libnss3 libxss1 \
        libxtst6 xdg-utils libatspi2.0-0 \
        libappindicator3-1 libsecret-1-0
    _green "System packages installed"
fi

# ── 2. Node.js (Pi only, if missing) ──────────────────────────────────────────
if ! command -v node >/dev/null 2>&1; then
    if [[ "$IS_PI" -eq 1 ]]; then
        _section "Node.js"
        curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
        sudo apt-get install -y nodejs
        _green "Node.js installed"
    else
        _red "Node.js not found — install it manually then re-run this script"
        exit 1
    fi
fi

# ── 3. Python dependencies ─────────────────────────────────────────────────────
_section "Python dependencies"
pip3 install --quiet -r "$SCRIPT_DIR/requirements.txt" --break-system-packages 2>/dev/null \
    || pip3 install --quiet -r "$SCRIPT_DIR/requirements.txt"
_green "Python dependencies installed"

# ── 4. Electron npm dependencies ──────────────────────────────────────────────
_section "Electron npm dependencies"
npm --prefix "$ELECTRON_DIR" ci --prefer-offline
_green "Electron npm dependencies installed"

# ── 5. .env file ──────────────────────────────────────────────────────────────
_section ".env"
if [[ ! -f "$SCRIPT_DIR/.env" ]]; then
    cp "$SCRIPT_DIR/.env.example" "$SCRIPT_DIR/.env"
    _yellow ".env created from .env.example — edit it now:"
    _yellow "  nano $SCRIPT_DIR/.env"
else
    _green ".env already exists — skipping"
fi

echo ""
_green "Setup complete!"
echo ""
echo "  To run in development mode:"
echo "    cd $ELECTRON_DIR && npm run dev"
echo ""
echo "  To build a distributable package:"
echo "    cd $ELECTRON_DIR && npm run build:linux"
echo ""
