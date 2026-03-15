#!/bin/bash
[ -n "${_LOCK_SH_LOADED:-}" ] && return 0
_LOCK_SH_LOADED=1

LOCK_FILE="${LOCK_FILE:-/tmp/edge-client.lock}"

acquire_lock() {
	if [ -f "$LOCK_FILE" ]; then
		local pid
		pid=$(cat "$LOCK_FILE" 2>/dev/null || echo "")
		if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
			log_warn "Already running (PID $pid). Exiting."
			exit 0
		fi
		log_warn "Stale lock found, removing."
		rm -f "$LOCK_FILE"
	fi

	echo $$ > "$LOCK_FILE"
	log_ok "Lock acquired: $LOCK_FILE"
}

release_lock() {
	rm -f "$LOCK_FILE"
	log_info "Lock released"
}
