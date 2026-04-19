#!/bin/bash
[ -n "${_ENV_SH_LOADED:-}" ] && return 0
_ENV_SH_LOADED=1

load_env() {
	local env_file="${1:-$SCRIPT_DIR/.env}"
	[ -f "$env_file" ] || log_fatal ".env not found at $env_file"
	log_info "Loading environment from $env_file"
	set -o allexport
	# shellcheck source=/dev/null
	source "$env_file"
	set +o allexport
	log_ok "Environment loaded"
}

require_vars() {
	local missing=0
	for var in "$@"; do
		if [ -z "${!var:-}" ]; then
			log_error "Required variable not set: $var"
			missing=1
		fi
	done
	[ "$missing" -eq 0 ] || log_fatal "Fix missing variables in .env"
}

apply_defaults() {
	: "${FLASK_PORT:=5000}"
	: "${IMAGE_DIR:=$SCRIPT_DIR/data/images}"
	: "${LOG_DIR:=/tmp/logs}"
	: "${EDGE_MODE:=production}"
	: "${PRODUCTION_UPLOAD_TARGET:=api}"
	: "${TRAINING_UPLOAD_TARGET:=roboflow}"
	: "${API_UPLOAD_PATH:=/scans}"
	: "${API_TIMEOUT_SECONDS:=30}"
	: "${UPLOADER_POLL_SECONDS:=3}"
	: "${UPLOADER_MAX_RETRIES:=5}"
	: "${MQTT_ENABLED:=false}"
	: "${MQTT_HOST:=localhost}"
	: "${MQTT_PORT:=1883}"
	: "${MQTT_TLS_ENABLED:=false}"
	: "${MQTT_TLS_CA_CERT_PATH:=}"
	: "${MQTT_TLS_INSECURE:=false}"
	: "${MQTT_TOPIC_PREFIX:=ricevision}"
	: "${MQTT_KEEPALIVE_SECONDS:=30}"
	: "${MQTT_RECONNECT_MIN_SECONDS:=1}"
	: "${MQTT_RECONNECT_MAX_SECONDS:=30}"
	: "${MQTT_TELEMETRY_INTERVAL_SECONDS:=15}"
	: "${MQTT_SCHEMA_VERSION:=1}"
	: "${MQTT_CAMERA_MAX_FRAME_BYTES:=250000}"
}
