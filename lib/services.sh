#!/bin/bash
[ -n "${_SERVICES_SH_LOADED:-}" ] && return 0
_SERVICES_SH_LOADED=1

declare -A SERVICE_PIDS

start_python_service() {
	local name="$1" script="$2"; shift 2
	local log_file="${LOG_DIR:-/tmp}/${name}.log"
	log_info "Starting service: $name"
	python3 "$script" "$@" >> "$log_file" 2>&1 &
	SERVICE_PIDS["$name"]=$!
	log_ok "$name started (PID ${SERVICE_PIDS[$name]})"
}

start_shell_service() {
	local name="$1" script="$2"; shift 2
	local log_file="${LOG_DIR:-/tmp}/${name}.log"
	log_info "Starting service: $name"
	bash "$script" "$@" >> "$log_file" 2>&1 &
	SERVICE_PIDS["$name"]=$!
	log_ok "$name started (PID ${SERVICE_PIDS[$name]})"
}

wait_for_flask() {
	local port="${1:-5000}" retries="${2:-30}"
	local i=0
	log_info "Waiting for Flask on port $port"
	while [ "$i" -lt "$retries" ]; do
		curl -sf "http://localhost:${port}/health" >/dev/null 2>&1 && log_ok "Flask is ready" && return 0
		i=$((i + 1))
		sleep 1
	done
	log_fatal "Flask did not become ready in ${retries}s"
}

service_alive() {
	local pid="${SERVICE_PIDS[$1]:-}"
	[ -n "$pid" ] && kill -0 "$pid" 2>/dev/null
}

shutdown_all() {
	log_warn "Stopping services"
	for name in "${!SERVICE_PIDS[@]}"; do
		local pid="${SERVICE_PIDS[$name]}"
		if kill -0 "$pid" 2>/dev/null; then
			kill -TERM "$pid" 2>/dev/null || true
			log_info "Stopped $name (PID $pid)"
		fi
	done
}
