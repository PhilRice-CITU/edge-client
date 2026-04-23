#!/bin/bash
# Post-install hook for Hum.ai .deb package.
# Installs Python dependencies from the bundled requirements.txt.
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
