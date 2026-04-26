#!/bin/bash
# Post-install hook for Hum.ai .deb package.
# Installs Python dependencies, seeds .env on first install, sets up desktop autostart.
set -euo pipefail

RESOURCES_DIR="/opt/Hum.ai/resources"
REQUIREMENTS="$RESOURCES_DIR/python/requirements.txt"

# Resolve the actual operator user (the one who invoked sudo, not root).
REAL_USER="${SUDO_USER:-$USER}"
REAL_HOME=$(getent passwd "$REAL_USER" | cut -d: -f6)

# ── Python dependencies ──────────────────────────────────────────────────────
if [[ -f "$REQUIREMENTS" ]]; then
    echo "[after-install] Installing Python dependencies..."
    pip3 install --quiet -r "$REQUIREMENTS" --break-system-packages 2>/dev/null \
        || pip3 install --quiet -r "$REQUIREMENTS" 2>/dev/null \
        || echo "[after-install] WARNING: pip install failed — install manually: pip3 install -r $REQUIREMENTS"
    echo "[after-install] Python dependencies installed."
else
    echo "[after-install] WARNING: requirements.txt not found at $REQUIREMENTS"
fi

# ── Seed .env on first install ───────────────────────────────────────────────
# The Electron app reads from ~/.config/Hum.ai/.env (app.getPath('userData')).
# Copy the shipped env.example into place if no .env exists yet — operator then
# completes provisioning via the in-app Setup screen.
ENV_EXAMPLE="$RESOURCES_DIR/env.example"
USER_ENV_DIR="$REAL_HOME/.config/Hum.ai"
USER_ENV_FILE="$USER_ENV_DIR/.env"

if [[ -f "$ENV_EXAMPLE" && ! -f "$USER_ENV_FILE" ]]; then
    mkdir -p "$USER_ENV_DIR"
    cp "$ENV_EXAMPLE" "$USER_ENV_FILE"
    chown -R "$REAL_USER:$REAL_USER" "$USER_ENV_DIR"
    echo "[after-install] Seeded $USER_ENV_FILE — operator will provision via Setup screen on first launch."
elif [[ -f "$USER_ENV_FILE" ]]; then
    echo "[after-install] Existing $USER_ENV_FILE preserved."
fi

# ── Desktop autostart ─────────────────────────────────────────────────────────
AUTOSTART_DIR="$REAL_HOME/.config/autostart"

mkdir -p "$AUTOSTART_DIR"
cat > "$AUTOSTART_DIR/hum-ai.desktop" <<EOF
[Desktop Entry]
Type=Application
Name=Hum.ai
Exec=/opt/Hum.ai/hum-ai --no-sandbox
X-GNOME-Autostart-enabled=true
EOF

chown "$REAL_USER:$REAL_USER" "$AUTOSTART_DIR/hum-ai.desktop"
echo "[after-install] Autostart entry installed for $REAL_USER — app will launch on next login."
