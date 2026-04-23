#!/usr/bin/env bash
set -euo pipefail

RELAY=17

# ── Runtime paths ──────────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

_DEFAULT_IMAGE_DIR="$ROOT_DIR/data/images"
if [[ ! -w "$ROOT_DIR/data" ]] && [[ ! -w "$ROOT_DIR" ]]; then
    _DEFAULT_IMAGE_DIR="$HOME/.config/hum-ai/data/images"
fi
IMAGE_DIR="${IMAGE_DIR:-$_DEFAULT_IMAGE_DIR}"
CAPTURE_LOCK_FILE="${CAPTURE_LOCK_FILE:-/tmp/edge-capture.lock}"

mkdir -p "$IMAGE_DIR"

IR_PATH=""
WHITE_PATH=""

acquire_capture_lock() {
    mkdir -p "$(dirname "$CAPTURE_LOCK_FILE")"

    if [[ -f "$CAPTURE_LOCK_FILE" ]]; then
        local existing_pid=""
        existing_pid="$(cat "$CAPTURE_LOCK_FILE" 2>/dev/null || true)"
        if [[ -n "$existing_pid" ]] && kill -0 "$existing_pid" 2>/dev/null; then
            >&2 echo "ERROR: capture already in progress (pid=$existing_pid)"
            return 1
        fi
        rm -f "$CAPTURE_LOCK_FILE"
    fi

    if ! (set -o noclobber; echo "$$" > "$CAPTURE_LOCK_FILE") 2>/dev/null; then
        >&2 echo "ERROR: capture already in progress"
        return 1
    fi

    return 0
}

release_capture_lock() {
    rm -f "$CAPTURE_LOCK_FILE"
}

run_capture_with_lock() {
    if ! acquire_capture_lock; then
        return 1
    fi

    if do_capture; then
        release_capture_lock
        return 0
    fi

    release_capture_lock
    return 1
}

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

# ── One-shot mode (triggered by Flask session capture endpoint) ────────────────
# Outputs {"ir_path":"...","white_path":"..."} to stdout and exits.
# Usage: bash capture.sh --once
if [[ "${1:-}" == "--once" ]]; then
    run_capture_with_lock
    if [[ -f "$IR_PATH" ]] && [[ -f "$WHITE_PATH" ]]; then
        printf '{"ir_path":"%s","white_path":"%s"}\n' "$IR_PATH" "$WHITE_PATH"
        exit 0
    else
        >&2 echo "ERROR: capture files missing after --once"
        exit 1
    fi
fi

echo "Usage: capture.sh --once"
exit 1
