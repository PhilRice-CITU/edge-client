#!/bin/bash
[ -n "${_DISPLAY_SH_LOADED:-}" ] && return 0
_DISPLAY_SH_LOADED=1

display_is_available() {
    [ -n "${DISPLAY:-}" ] || [ -n "${WAYLAND_DISPLAY:-}" ]
}

ensure_display() {
    if display_is_available; then
        log_ok "Display available: ${DISPLAY:-$WAYLAND_DISPLAY}"
        return 0
    fi

    if command -v startx >/dev/null 2>&1; then
        log_warn "No display session found; trying startx on :0"
        export DISPLAY=:0
        startx -- :0 -nocursor >/dev/null 2>&1 &
        sleep 3
        display_is_available && log_ok "X started on :0" && return 0
    fi

    log_warn "No display available. Running headless mode."
    return 1
}

launch_kiosk() {
    local electron_dir="$SCRIPT_DIR/electron-app"

    if [ ! -d "$electron_dir" ]; then
        log_warn "Electron folder not found at $electron_dir; skipping kiosk launch"
        return 0
    fi

    if ! command -v npx >/dev/null 2>&1; then
        log_warn "npx not found; skipping kiosk launch"
        return 0
    fi

    log_info "Launching Electron kiosk"
    local electron_log="$SCRIPT_DIR/data/logs/electron.log"
    mkdir -p "$(dirname "$electron_log")"
    (
        cd "$electron_dir" || exit 1
        npm run start -- --no-sandbox >> "$electron_log" 2>&1 &
    )
}
