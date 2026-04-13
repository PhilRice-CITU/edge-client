#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LIB_DIR="$SCRIPT_DIR/lib"
APP_DIR="$SCRIPT_DIR/src"
SCRIPTS_DIR="$SCRIPT_DIR/scripts"

export LOG_DIR="${LOG_DIR:-$SCRIPT_DIR/data/logs}"
export LOG_FILE="$LOG_DIR/startup.log"
export IMAGE_DIR="${IMAGE_DIR:-$SCRIPT_DIR/data/images}"
export QUEUE_FILE="${QUEUE_FILE:-$SCRIPT_DIR/data/upload_queue.json}"

mkdir -p "$LOG_DIR" "$IMAGE_DIR" "$(dirname "$QUEUE_FILE")"

source "$LIB_DIR/log.sh"
source "$LIB_DIR/env.sh"
source "$LIB_DIR/lock.sh"
source "$LIB_DIR/services.sh"
source "$LIB_DIR/display.sh"

log_section "Lock"
acquire_lock
trap 'release_lock; shutdown_all' EXIT INT TERM

log_section "Environment"
load_env "$SCRIPT_DIR/.env"
apply_defaults
require_vars API_BASE_URL DEVICE_SECRET

log_section "Provisioning"
python3 "$APP_DIR/provision.py" || log_fatal "Device provisioning failed — check .env and API server"
# Re-source .env so DEVICE_ID written by provision.py is visible to child processes
load_env "$SCRIPT_DIR/.env"
require_vars DEVICE_ID

log_section "Flask"
start_python_service "flask" "$APP_DIR/app.py"
wait_for_flask "${FLASK_PORT:-5000}"

log_section "Uploader"
start_python_service "uploader" "$APP_DIR/uploader.py"

log_section "Heartbeat"
start_python_service "heartbeat" "$APP_DIR/heartbeat.py"

log_section "Command Consumer"
start_python_service "command-consumer" "$APP_DIR/command_consumer.py"

log_section "Capture Button Loop"
start_shell_service "capture" "$SCRIPTS_DIR/capture.sh"

log_section "Electron build"
ELECTRON_OUT="$SCRIPT_DIR/electron-app/out"
ELECTRON_NODE_MODULES="$SCRIPT_DIR/electron-app/node_modules"
if [[ ! -d "$ELECTRON_NODE_MODULES" ]]; then
    log_info "Electron dependencies missing — installing with npm ci"
    npm --prefix "$SCRIPT_DIR/electron-app" ci --prefer-offline \
        || log_fatal "Electron dependency install failed — check npm output above"
    log_ok "Electron dependencies installed"
fi

if [[ ! -d "$ELECTRON_OUT" ]]; then
    log_info "No built Electron app found — building now (this may take a few minutes)…"
    npm --prefix "$SCRIPT_DIR/electron-app" run build:linux \
        || log_fatal "Electron build failed — check npm output above"
    log_ok "Electron app built"
else
    log_ok "Electron app already built"
fi

log_section "Kiosk"
if ensure_display; then
    launch_kiosk
fi

log_section "Running"
log_info "Services are up. Press Ctrl+C to stop."

while true; do
    sleep 5

done
