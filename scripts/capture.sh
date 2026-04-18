#!/usr/bin/env bash
set -euo pipefail

RELAY=17
BUTTON=27

# ── Runtime paths ──────────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

# Respect IMAGE_DIR from .env if already exported, otherwise default.
IMAGE_DIR="${IMAGE_DIR:-$ROOT_DIR/data/images}"
QUEUE_FILE="$ROOT_DIR/data/upload_queue.json"
DEVICE_ID="${DEVICE_ID:-pi-001}"

mkdir -p "$IMAGE_DIR" "$(dirname "$QUEUE_FILE")"

# ── GPIO setup ─────────────────────────────────────────────────────────────────
# op  = output push-pull (controls relay)
# ip pu = input with pull-up resistor (button reads HIGH at rest, LOW when pressed)
pinctrl set $RELAY op
pinctrl set $BUTTON ip pu

# ── Core capture function ──────────────────────────────────────────────────────
# Sets IR_PATH and WHITE_PATH in the calling scope.
# All diagnostic output goes to stderr so stdout stays clean for --once mode.
IR_PATH=""
WHITE_PATH=""

do_capture() {
    local TS
    TS=$(date +"%Y%m%d_%H%M%S")
    IR_PATH="$IMAGE_DIR/${TS}_ir.jpg"
    WHITE_PATH="$IMAGE_DIR/${TS}_white.jpg"

    # ── IR Capture ──────────────────────────────────────────────────────────────
    >&2 echo "Switching to IR"
    pinctrl set $RELAY dl   # relay closes → IR illumination active
    sleep 0.6               # relay settle
    sleep 7                 # autofocus settle

    rpicam-still -o "$IR_PATH" -t 6500 --ev -3.0 --gain 2.0 --shutter 4500 --width 1024 --height 1024

    sleep 2

    # ── White Capture ───────────────────────────────────────────────────────────
    >&2 echo "Switching to White"
    pinctrl set $RELAY dh   # relay opens → White illumination active
    sleep 0.5               # relay settle
    sleep 5                 # autofocus settle

    rpicam-still -o "$WHITE_PATH" -t 6000 --ev -1.3 --gain 4 --shutter 6000 --width 1024 --height 1024

    >&2 echo "Capture complete."
}

# ── One-shot mode (triggered by Flask UI-button endpoint) ─────────────────────
# Outputs {"ir_path":"...","white_path":"..."} to stdout and exits.
if [[ "${1:-}" == "--once" ]]; then
    do_capture
    if [[ -f "$IR_PATH" ]] && [[ -f "$WHITE_PATH" ]]; then
        printf '{"ir_path":"%s","white_path":"%s"}\n' "$IR_PATH" "$WHITE_PATH"
        exit 0
    else
        >&2 echo "ERROR: capture files missing after --once"
        exit 1
    fi
fi

# ── GPIO polling loop ──────────────────────────────────────────────────────────
echo "System Ready. Waiting for button..."

while true; do
    state=$(pinctrl get $BUTTON | grep -o "hi\|lo" || true)

    # Button pressed — active LOW means "lo" = pressed
    if [[ "$state" == "lo" ]]; then
        echo "Button pressed - Starting capture sequence"

        SESSION_ID=$(python3 -c "import uuid; print(uuid.uuid4())")
        CAPTURED_AT=$(date -u '+%Y-%m-%dT%H:%M:%SZ')

        # Wrap in if so set -e does not exit the loop on capture failure
        if do_capture; then
            # ── Enqueue for upload ──────────────────────────────────────────────
            # Both files must exist before we enqueue.
            # The uploader worker reads this queue and routes to API or Roboflow
            # depending on EDGE_MODE in .env (production | training).
            if [[ -f "$IR_PATH" ]] && [[ -f "$WHITE_PATH" ]]; then
                python3 "$ROOT_DIR/src/enqueue_capture.py" \
                    --raw    "$WHITE_PATH" \
                    --ir     "$IR_PATH" \
                    --session "$SESSION_ID" \
                    --device  "$DEVICE_ID" \
                    --captured-at "$CAPTURED_AT" \
                    --queue "$QUEUE_FILE" \
                && echo "Queued session $SESSION_ID for upload." \
                || echo "WARNING: enqueue failed — files saved locally at $IMAGE_DIR"
            else
                echo "ERROR: one or both capture files missing — skipping upload queue"
            fi
        else
            echo "ERROR: capture failed for this cycle — will retry on next button press"
        fi

        # ── Wait for button release (prevents retrigger on hold) ───────────────
        while [[ "$(pinctrl get $BUTTON | grep -o "hi\|lo" || true)" == "lo" ]]; do
            sleep 0.1
        done

        sleep 0.3   # extra debounce delay
        echo "Ready again..."
    fi

    sleep 0.1
done
