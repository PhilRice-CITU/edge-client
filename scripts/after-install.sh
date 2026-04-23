#!/bin/bash
# Post-install hook for Hum.ai .deb package.
# Installs Python dependencies and sets up desktop autostart.
set -euo pipefail

RESOURCES_DIR="/opt/Hum.ai/resources"
REQUIREMENTS="$RESOURCES_DIR/python/requirements.txt"

if [[ -f "$REQUIREMENTS" ]]; then
    echo "[after-install] Installing Python dependencies..."
    pip3 install --quiet -r "$REQUIREMENTS" --break-system-packages 2>/dev/null \
        || pip3 install --quiet -r "$REQUIREMENTS" 2>/dev/null \
        || echo "[after-install] WARNING: pip install failed — install manually: pip3 install -r $REQUIREMENTS"
    echo "[after-install] Python dependencies installed."
else
    echo "[after-install] WARNING: requirements.txt not found at $REQUIREMENTS"
fi

# ── Desktop autostart ─────────────────────────────────────────────────────────
# Installs for the user who invoked sudo (the actual Pi operator, not root).
REAL_USER="${SUDO_USER:-$USER}"
REAL_HOME=$(getent passwd "$REAL_USER" | cut -d: -f6)
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
