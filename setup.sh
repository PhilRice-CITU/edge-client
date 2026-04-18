#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Rice Vision — Raspberry Pi First-Time Setup
#
# Run once after cloning the repo:
#   chmod +x setup.sh && ./setup.sh
#
# What it does:
#   1. Installs system packages (Node.js, Python 3, pip, rpicam tools, curl)
#   2. Creates the Python virtual environment and installs pip deps
#   3. Installs Electron app node_modules and builds the production bundle
#   4. Copies .env.example → .env if no .env exists yet
#   5. Installs the .desktop launcher for the Pi desktop environment
#   6. Installs the systemd unit (rice-vision.service) and enables it on boot
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVICE_FILE="$SCRIPT_DIR/rice-vision.service"
UNIT_DEST="/etc/systemd/system/rice-vision.service"

# ── Colour helpers ─────────────────────────────────────────────────────────────
_green()  { echo -e "\033[0;32m✔  $*\033[0m"; }
_yellow() { echo -e "\033[0;33m→  $*\033[0m"; }
_red()    { echo -e "\033[0;31m✖  $*\033[0m"; }
_section(){ echo -e "\n\033[1;34m── $* ──────────────────────────────────\033[0m"; }

# ── Sanity checks ──────────────────────────────────────────────────────────────
if [[ "$(uname -m)" != aarch64* ]] && [[ "$(uname -m)" != armv* ]]; then
    _yellow "Not running on ARM — skipping system package install (dev mode)."
    SKIP_APT=1
else
    SKIP_APT=0
fi

# ── 1. System packages ─────────────────────────────────────────────────────────
if [[ "$SKIP_APT" -eq 0 ]]; then
    _section "System packages"
    sudo apt-get update -qq
    sudo apt-get install -y --no-install-recommends \
        python3 python3-pip python3-venv \
        curl git \
        libgtk-3-0 libnotify4 libnss3 libxss1 \
        libxtst6 xdg-utils libatspi2.0-0 \
        libappindicator3-1 libsecret-1-0
    _green "System packages installed"
fi

# ── 2. Python virtual environment ─────────────────────────────────────────────
_section "Python virtualenv"
VENV="$SCRIPT_DIR/.venv"
if [[ ! -d "$VENV" ]]; then
    python3 -m venv "$VENV"
    _green "Created .venv"
fi
source "$VENV/bin/activate"
pip install --quiet --upgrade pip
pip install --quiet flask flask-cors requests
_green "Python dependencies installed"

# ── 3. Node.js + Electron app ─────────────────────────────────────────────────
_section "Node.js / Electron"
if ! command -v node >/dev/null 2>&1; then
    if [[ "$SKIP_APT" -eq 0 ]]; then
        # Install Node.js 20 LTS via NodeSource
        curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
        sudo apt-get install -y nodejs
        _green "Node.js installed"
    else
        _red "Node.js not found and not on Pi — install it manually"
        exit 1
    fi
fi

ELECTRON_DIR="$SCRIPT_DIR/electron-app"
_yellow "Installing npm dependencies…"
npm --prefix "$ELECTRON_DIR" ci --prefer-offline
_yellow "Building Electron production bundle…"
npm --prefix "$ELECTRON_DIR" run build:linux
_green "Electron app built"

# ── 4. .env file ──────────────────────────────────────────────────────────────
_section ".env"
if [[ ! -f "$SCRIPT_DIR/.env" ]]; then
    cp "$SCRIPT_DIR/.env.example" "$SCRIPT_DIR/.env"
    _yellow ".env created from .env.example — EDIT IT NOW before starting the service"
    _yellow "  nano $SCRIPT_DIR/.env"
else
    _green ".env already exists — skipping copy"
fi

# ── 5. Desktop launcher (.desktop file) ───────────────────────────────────────
_section "Desktop launcher"
DESKTOP_DIR="$HOME/.local/share/applications"
DESKTOP_FILE="$DESKTOP_DIR/rice-vision.desktop"
mkdir -p "$DESKTOP_DIR"
cat > "$DESKTOP_FILE" <<EOF
[Desktop Entry]
Type=Application
Name=Hum.ai
Comment=Hum.ai rice grain quality grading system
Exec=$SCRIPT_DIR/startup.sh
Icon=$SCRIPT_DIR/electron-app/build/icon.png
Terminal=false
Categories=Science;
EOF
chmod +x "$DESKTOP_FILE"
_green "Desktop launcher installed at $DESKTOP_FILE"

# ── 6. systemd service ────────────────────────────────────────────────────────
_section "systemd"
if [[ ! -f "$SERVICE_FILE" ]]; then
    _red "rice-vision.service not found at $SERVICE_FILE"
    exit 1
fi

if [[ "$SKIP_APT" -eq 0 ]]; then
    sudo cp "$SERVICE_FILE" "$UNIT_DEST"
    sudo systemctl daemon-reload
    sudo systemctl enable rice-vision.service
    _green "rice-vision.service enabled (will start on next boot)"
    _yellow "To start it now:  sudo systemctl start rice-vision"
    _yellow "To watch logs:    journalctl -u rice-vision -f"
else
    _yellow "Skipping systemd install (not on Pi)"
    _yellow "To run manually:  cd $SCRIPT_DIR && ./startup.sh"
fi

echo ""
_green "Setup complete!"
