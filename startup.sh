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
require_vars API_BASE_URL

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

log_section "Capture Button Loop"
start_shell_service "capture" "$SCRIPTS_DIR/capture.sh"

log_section "Kiosk"
if ensure_display; then
    launch_kiosk
fi

log_section "Running"
log_info "Services are up. Press Ctrl+C to stop."

while true; do
    sleep 5

done
