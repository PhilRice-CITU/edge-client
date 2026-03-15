#!/bin/bash
[ -n "${_LOG_SH_LOADED:-}" ] && return 0
_LOG_SH_LOADED=1

if [ -t 1 ]; then
	_RED='\033[0;31m'; _GREEN='\033[0;32m'
	_YELLOW='\033[1;33m'; _CYAN='\033[0;36m'
	_DIM='\033[2m'; _NC='\033[0m'
else
	_RED=''; _GREEN=''; _YELLOW=''; _CYAN=''; _DIM=''; _NC=''
fi

LOG_DIR="${LOG_DIR:-/tmp/logs}"
LOG_FILE="${LOG_FILE:-$LOG_DIR/startup.log}"

_log() {
	local level="$1" color="$2"; shift 2
	local ts; ts=$(date '+%Y-%m-%d %H:%M:%S')
	mkdir -p "$LOG_DIR"
	echo -e "${_DIM}${ts}${_NC} ${color}[${level}]${_NC} $*"
	echo "${ts} [${level}] $*" >> "$LOG_FILE"
}

log_info()    { _log "INFO " "$_CYAN" "$@"; }
log_ok()      { _log "OK   " "$_GREEN" "$@"; }
log_warn()    { _log "WARN " "$_YELLOW" "$@"; }
log_error()   { _log "ERROR" "$_RED" "$@"; }
log_section() { _log "-----" "$_DIM" "-- $* --"; }
log_fatal()   { log_error "$@"; exit 1; }
