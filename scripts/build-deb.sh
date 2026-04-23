#!/bin/bash
# Builds a .deb package using dpkg-deb, bypassing electron-builder's broken fpm on ARM64.
# Run from electron-app/ after: electron-builder --linux dir
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ELECTRON_APP_DIR="$(cd "$SCRIPT_DIR/../electron-app" && pwd)"
UNPACKED="$ELECTRON_APP_DIR/dist/linux-arm64-unpacked"
STAGING="$HOME/hum-ai-deb-staging"
OUTPUT="$ELECTRON_APP_DIR/dist/hum-ai_1.0.0_arm64.deb"

if [[ ! -d "$UNPACKED" ]]; then
    echo "[build-deb] ERROR: $UNPACKED not found. Run electron-builder --linux dir first."
    exit 1
fi

echo "[build-deb] Cleaning staging directory..."
rm -rf "$STAGING"
mkdir -p "$STAGING/opt/Hum.ai"
mkdir -p "$STAGING/DEBIAN"
mkdir -p "$STAGING/usr/share/applications"
mkdir -p "$STAGING/usr/share/icons/hicolor/512x512/apps"

echo "[build-deb] Copying unpacked app..."
cp -r "$UNPACKED/." "$STAGING/opt/Hum.ai/"

echo "[build-deb] Writing DEBIAN/control..."
cat > "$STAGING/DEBIAN/control" <<EOF
Package: hum-ai
Version: 1.0.0
Architecture: arm64
Maintainer: PhilRice-CITU <philricecitu@gmail.com>
Depends: python3, python3-pip, libgtk-3-0, libnss3, libxss1, libxtst6, xdg-utils, libatspi2.0-0, libsecret-1-0
Description: Hum.ai Rice Vision kiosk app
 Automated rice quality grading system for Raspberry Pi.
EOF

echo "[build-deb] Writing DEBIAN/postinst..."
cat > "$STAGING/DEBIAN/postinst" <<'EOF'
#!/bin/bash
set -e

RESOURCES_DIR="/opt/Hum.ai/resources"
REQUIREMENTS="$RESOURCES_DIR/python/requirements.txt"

if [[ -f "$REQUIREMENTS" ]]; then
    echo "[postinst] Installing Python dependencies..."
    pip3 install --quiet -r "$REQUIREMENTS" --break-system-packages 2>/dev/null \
        || pip3 install --quiet -r "$REQUIREMENTS" 2>/dev/null \
        || echo "[postinst] WARNING: pip install failed — run manually: pip3 install -r $REQUIREMENTS"
    echo "[postinst] Python dependencies installed."
else
    echo "[postinst] WARNING: requirements.txt not found at $REQUIREMENTS"
fi

REAL_USER="${SUDO_USER:-$USER}"
REAL_HOME=$(getent passwd "$REAL_USER" | cut -d: -f6)
AUTOSTART_DIR="$REAL_HOME/.config/autostart"
mkdir -p "$AUTOSTART_DIR"

cat > "$AUTOSTART_DIR/hum-ai.desktop" <<DESKTOP
[Desktop Entry]
Type=Application
Name=Hum.ai
Exec=/opt/Hum.ai/hum-ai --no-sandbox
X-GNOME-Autostart-enabled=true
DESKTOP

chown "$REAL_USER:$REAL_USER" "$AUTOSTART_DIR/hum-ai.desktop"
echo "[postinst] Autostart entry installed for $REAL_USER."
EOF

echo "[build-deb] Writing .desktop file..."
cat > "$STAGING/usr/share/applications/hum-ai.desktop" <<EOF
[Desktop Entry]
Name=Hum.ai
Exec=/opt/Hum.ai/hum-ai --no-sandbox
Icon=hum-ai
Type=Application
Categories=Science;
EOF

# Copy icon if it exists
ICON_SRC="$ELECTRON_APP_DIR/build/icons/512x512.png"
if [[ -f "$ICON_SRC" ]]; then
    cp "$ICON_SRC" "$STAGING/usr/share/icons/hicolor/512x512/apps/hum-ai.png"
fi

echo "[build-deb] Setting permissions..."
find "$STAGING" -type d -exec chmod 755 {} \;
find "$STAGING" -type f -exec chmod 644 {} \;
chmod 755 "$STAGING/DEBIAN/postinst"
chmod 755 "$STAGING/DEBIAN/control"
# Make the main executable and any binaries executable
find "$STAGING/opt/Hum.ai" -type f -name "hum-ai" -exec chmod 755 {} \;
find "$STAGING/opt/Hum.ai" -type f -name "*.so*" -exec chmod 755 {} \;
find "$STAGING/opt/Hum.ai" -type f -name "*.sh" -exec chmod 755 {} \;
find "$STAGING/opt/Hum.ai/resources/python" -type f -name "*.py" -exec chmod 644 {} \;

echo "[build-deb] Building .deb with dpkg-deb..."
dpkg-deb -Zgzip --build --root-owner-group "$STAGING" "$OUTPUT"

echo "[build-deb] Done: $OUTPUT"
echo "[build-deb] Install with: sudo dpkg -i $OUTPUT"
