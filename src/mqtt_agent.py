from __future__ import annotations

import base64
import json
import os
import shutil
import signal
import ssl
import subprocess
import time
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from threading import Event, Thread
from typing import Any

import paho.mqtt.client as mqtt
import requests

from commands import execute_command

DEVICE_ID = os.getenv("DEVICE_ID", "").strip()
MQTT_HOST = os.getenv("MQTT_HOST", "localhost").strip()
MQTT_PORT = int(os.getenv("MQTT_PORT", "1883"))
MQTT_USERNAME = os.getenv("MQTT_USERNAME", "").strip()
MQTT_PASSWORD = os.getenv("MQTT_PASSWORD", "").strip()
MQTT_TLS_ENABLED = os.getenv("MQTT_TLS_ENABLED", "false").strip().lower() == "true"
MQTT_TLS_CA_CERT_PATH = os.getenv("MQTT_TLS_CA_CERT_PATH", "").strip()
MQTT_TLS_INSECURE = os.getenv("MQTT_TLS_INSECURE", "false").strip().lower() == "true"
MQTT_TOPIC_PREFIX = os.getenv("MQTT_TOPIC_PREFIX", "ricevision").strip().strip("/")
MQTT_KEEPALIVE_SECONDS = int(os.getenv("MQTT_KEEPALIVE_SECONDS", "30"))
MQTT_RECONNECT_MIN_SECONDS = int(os.getenv("MQTT_RECONNECT_MIN_SECONDS", "1"))
MQTT_RECONNECT_MAX_SECONDS = int(os.getenv("MQTT_RECONNECT_MAX_SECONDS", "30"))
MQTT_CLIENT_ID = os.getenv("MQTT_CLIENT_ID", f"edge-{DEVICE_ID}").strip() or f"edge-{DEVICE_ID}"
MQTT_TELEMETRY_INTERVAL_SECONDS = int(os.getenv("MQTT_TELEMETRY_INTERVAL_SECONDS", "15"))
MQTT_SCHEMA_VERSION = int(os.getenv("MQTT_SCHEMA_VERSION", "1"))
MQTT_CAMERA_MAX_FRAME_BYTES = int(os.getenv("MQTT_CAMERA_MAX_FRAME_BYTES", "250000"))

# Preview server — embeds a minimal HTTP server so Electron/MQTT can grab camera frames
# without depending on Flask.
PREVIEW_PORT = int(os.getenv("PREVIEW_PORT", "5056"))
PREVIEW_FRAME_TIMEOUT_SECONDS = int(os.getenv("PREVIEW_FRAME_TIMEOUT_SECONDS", "6"))
PREVIEW_FRAME_WIDTH = os.getenv("PREVIEW_FRAME_WIDTH", "640")
PREVIEW_FRAME_HEIGHT = os.getenv("PREVIEW_FRAME_HEIGHT", "480")
PREVIEW_FRAME_DURATION_MS = os.getenv("PREVIEW_FRAME_DURATION_MS", "700")
CAPTURE_LOCK_FILE = Path(os.getenv("CAPTURE_LOCK_FILE", "/tmp/edge-capture.lock"))

MQTT_LOG_QUEUE_FILE = Path(
    os.getenv(
        "MQTT_LOG_QUEUE_FILE",
        str(Path(__file__).resolve().parent.parent / "data" / "event_queue.jsonl"),
    )
)
QUEUE_FILE = Path(
    os.getenv("QUEUE_FILE", str(Path(__file__).resolve().parent.parent / "data" / "upload_queue.json"))
)

_shutdown_event = Event()
_processed_command_ids: list[str] = []
_camera_stream_session: dict[str, Any] | None = None
_last_camera_size_warn_at = 0.0


# ── Camera preview helpers ────────────────────────────────────────────────────

def _capture_in_progress() -> bool:
    if not CAPTURE_LOCK_FILE.exists():
        return False
    try:
        lock_age_seconds = time.time() - CAPTURE_LOCK_FILE.stat().st_mtime
    except OSError:
        return True
    return lock_age_seconds < 120


def _preview_commands() -> list[list[str]]:
    return [
        [
            "rpicam-still", "-o", "-", "-t", PREVIEW_FRAME_DURATION_MS, "-n",
            "--width", PREVIEW_FRAME_WIDTH, "--height", PREVIEW_FRAME_HEIGHT,
        ],
        [
            "libcamera-still", "-o", "-", "-t", PREVIEW_FRAME_DURATION_MS, "-n",
            "--width", PREVIEW_FRAME_WIDTH, "--height", PREVIEW_FRAME_HEIGHT,
        ],
    ]


def _capture_preview_frame() -> tuple[bytes | None, str]:
    last_error = "camera command unavailable"

    for command in _preview_commands():
        try:
            result = subprocess.run(
                command,
                capture_output=True,
                timeout=PREVIEW_FRAME_TIMEOUT_SECONDS,
            )
        except FileNotFoundError:
            continue
        except subprocess.TimeoutExpired:
            last_error = f"{command[0]} timed out"
            continue

        if result.returncode == 0 and result.stdout:
            return result.stdout, ""

        stderr_text = result.stderr.decode("utf-8", errors="ignore").strip()
        last_error = stderr_text[-300:] if stderr_text else f"{command[0]} failed with code {result.returncode}"

    return None, last_error


# ── Embedded preview HTTP server (port 5056) ──────────────────────────────────

class _PreviewHandler(BaseHTTPRequestHandler):
    def do_GET(self) -> None:
        if self.path != "/preview/frame":
            self.send_response(404)
            self.end_headers()
            return

        if _capture_in_progress():
            self.send_response(503)
            self.end_headers()
            return

        frame_bytes, _ = _capture_preview_frame()
        if frame_bytes is None:
            self.send_response(503)
            self.end_headers()
            return

        self.send_response(200)
        self.send_header("Content-Type", "image/jpeg")
        self.send_header("Content-Length", str(len(frame_bytes)))
        self.end_headers()
        self.wfile.write(frame_bytes)

    def log_message(self, *args: Any) -> None:
        pass  # suppress access log noise


def _start_preview_server() -> None:
    srv = HTTPServer(("127.0.0.1", PREVIEW_PORT), _PreviewHandler)
    Thread(target=srv.serve_forever, daemon=True).start()
    print(f"[preview] HTTP server listening on http://127.0.0.1:{PREVIEW_PORT}/preview/frame", flush=True)


# ── MQTT helpers ──────────────────────────────────────────────────────────────

def _handle_shutdown(signum: int, _frame: Any) -> None:
    _ = signum, _frame
    _shutdown_event.set()


def _topic(channel: str) -> str:
    return f"{MQTT_TOPIC_PREFIX}/devices/{DEVICE_ID}/{channel}"


def _read_queue_depth() -> int | None:
    if not QUEUE_FILE.exists():
        return 0
    try:
        data = json.loads(QUEUE_FILE.read_text())
    except Exception:
        return None
    if isinstance(data, list):
        return len(data)
    return None


def _read_memory_percent() -> float | None:
    try:
        mem_total = None
        mem_available = None
        with open("/proc/meminfo", "r", encoding="utf-8") as meminfo:
            for line in meminfo:
                if line.startswith("MemTotal:"):
                    mem_total = float(line.split()[1])
                elif line.startswith("MemAvailable:"):
                    mem_available = float(line.split()[1])
        if not mem_total or mem_available is None:
            return None
        used_percent = ((mem_total - mem_available) / mem_total) * 100
        return round(max(min(used_percent, 100.0), 0.0), 2)
    except Exception:
        return None


def _read_cpu_percent() -> float | None:
    try:
        load_1m = os.getloadavg()[0]
        cpu_count = os.cpu_count() or 1
        cpu_percent = (load_1m / cpu_count) * 100
        return round(max(min(cpu_percent, 100.0), 0.0), 2)
    except Exception:
        return None


def _read_storage_percent() -> float | None:
    try:
        usage = shutil.disk_usage("/")
        if usage.total <= 0:
            return None
        return round((usage.used / usage.total) * 100, 2)
    except Exception:
        return None


def _read_temperature_celsius() -> float | None:
    try:
        with open("/sys/class/thermal/thermal_zone0/temp", "r", encoding="utf-8") as handle:
            milli_c = float(handle.read().strip())
        return round(milli_c / 1000.0, 2)
    except Exception:
        return None


def _collect_telemetry() -> dict[str, Any]:
    return {
        "schema_version": MQTT_SCHEMA_VERSION,
        "status": "online",
        "cpu_percent": _read_cpu_percent(),
        "memory_percent": _read_memory_percent(),
        "storage_percent": _read_storage_percent(),
        "temperature_celsius": _read_temperature_celsius(),
        "queue_depth": _read_queue_depth(),
        "timestamp": int(time.time()),
    }


def _append_log_event(level: str, message: str, meta: dict[str, Any] | None = None) -> None:
    MQTT_LOG_QUEUE_FILE.parent.mkdir(parents=True, exist_ok=True)
    entry = {
        "schema_version": MQTT_SCHEMA_VERSION,
        "level": str(level or "INFO").upper(),
        "message": message,
        "meta": meta or {},
        "timestamp": int(time.time()),
    }
    with MQTT_LOG_QUEUE_FILE.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(entry) + "\n")


def _flush_logs(client: mqtt.Client) -> None:
    if not MQTT_LOG_QUEUE_FILE.exists():
        return

    try:
        lines = MQTT_LOG_QUEUE_FILE.read_text(encoding="utf-8").splitlines()
    except Exception:
        return

    if not lines:
        try:
            MQTT_LOG_QUEUE_FILE.unlink(missing_ok=True)
        except Exception:
            pass
        return

    remaining: list[str] = []
    for line in lines:
        if not line.strip():
            continue
        try:
            payload = json.loads(line)
        except Exception:
            continue
        msg = client.publish(_topic("logs"), json.dumps(payload), qos=0, retain=False)
        if msg.rc != mqtt.MQTT_ERR_SUCCESS:
            remaining.append(line)

    if remaining:
        MQTT_LOG_QUEUE_FILE.write_text("\n".join(remaining) + "\n", encoding="utf-8")
    else:
        try:
            MQTT_LOG_QUEUE_FILE.unlink(missing_ok=True)
        except Exception:
            pass


def _publish_ack(client: mqtt.Client, *, command_id: str, status: str, detail: str) -> None:
    payload = {
        "schema_version": MQTT_SCHEMA_VERSION,
        "id": command_id,
        "status": status,
        "detail": detail,
        "timestamp": int(time.time()),
    }
    client.publish(_topic("acks"), json.dumps(payload), qos=1, retain=False)


def _fetch_local_frame() -> bytes | None:
    url = f"http://127.0.0.1:{PREVIEW_PORT}/preview/frame"
    try:
        response = requests.get(url, timeout=5)
    except Exception:
        return None

    if response.status_code != 200:
        return None
    content_type = response.headers.get("content-type", "")
    if "image/" not in content_type:
        return None
    return response.content


def _publish_camera_frame(client: mqtt.Client, session_id: str) -> None:
    global _last_camera_size_warn_at
    frame = _fetch_local_frame()
    if not frame:
        return

    max_frame_bytes = max(1024, MQTT_CAMERA_MAX_FRAME_BYTES)
    if len(frame) > max_frame_bytes:
        now = time.time()
        if now - _last_camera_size_warn_at >= 30:
            _append_log_event(
                "WARN",
                "camera frame dropped due to size limit",
                {
                    "session_id": session_id,
                    "frame_bytes": len(frame),
                    "max_frame_bytes": max_frame_bytes,
                },
            )
            _last_camera_size_warn_at = now
        return

    payload = {
        "schema_version": MQTT_SCHEMA_VERSION,
        "session_id": session_id,
        "content_type": "image/jpeg",
        "frame_base64": base64.b64encode(frame).decode("ascii"),
        "timestamp": int(time.time()),
    }
    client.publish(_topic("camera"), json.dumps(payload), qos=0, retain=False)


def _on_connect(client: mqtt.Client, userdata: Any, flags: Any, reason_code: Any, properties: Any) -> None:
    _ = userdata, flags, properties
    rc = int(getattr(reason_code, "value", reason_code))
    if rc != 0:
        _append_log_event("ERROR", "mqtt connect failed", {"reason_code": rc})
        return

    client.subscribe(_topic("commands/+"), qos=1)
    client.publish(
        _topic("presence"),
        json.dumps({"schema_version": MQTT_SCHEMA_VERSION, "status": "online", "timestamp": int(time.time())}),
        qos=1,
        retain=True,
    )
    _append_log_event("INFO", "mqtt connected")


def _on_message(client: mqtt.Client, userdata: Any, message: mqtt.MQTTMessage) -> None:
    global _camera_stream_session
    _ = userdata
    try:
        payload = json.loads(message.payload.decode("utf-8"))
    except Exception:
        return

    if not isinstance(payload, dict):
        return

    command_id = str(payload.get("id") or "")
    command_name = str(payload.get("command") or "")
    args = payload.get("args") if isinstance(payload.get("args"), dict) else {}

    if not command_id or not command_name:
        return

    if command_id in _processed_command_ids:
        _publish_ack(client, command_id=command_id, status="completed", detail="duplicate command ignored")
        return

    if command_name == "camera-stream-start":
        session_id = str(args.get("session_id") or command_id)
        fps = int(args.get("fps") or 1)
        duration_seconds = int(args.get("duration_seconds") or 30)
        _camera_stream_session = {
            "session_id": session_id,
            "fps": max(1, min(fps, 5)),
            "expires_at": time.time() + max(5, min(duration_seconds, 120)),
            "next_frame_at": 0.0,
        }
        _publish_ack(client, command_id=command_id, status="completed", detail="camera stream started")
        _append_log_event(
            "INFO",
            "camera stream started",
            {"command_id": command_id, "session_id": session_id},
        )
        _processed_command_ids.append(command_id)
        if len(_processed_command_ids) > 500:
            del _processed_command_ids[0]
        return

    if command_name == "camera-stream-stop":
        requested_session_id = str(args.get("session_id") or "").strip()
        if _camera_stream_session is not None:
            current_session_id = str(_camera_stream_session.get("session_id") or "")
            if not requested_session_id or requested_session_id == current_session_id:
                _camera_stream_session = None
        _publish_ack(client, command_id=command_id, status="completed", detail="camera stream stopped")
        _append_log_event(
            "INFO",
            "camera stream stopped",
            {"command_id": command_id, "session_id": requested_session_id},
        )
        _processed_command_ids.append(command_id)
        if len(_processed_command_ids) > 500:
            del _processed_command_ids[0]
        return

    _publish_ack(client, command_id=command_id, status="processing", detail="received")
    ok, detail = execute_command(command_name, args)
    if ok:
        _publish_ack(client, command_id=command_id, status="completed", detail=detail)
        _append_log_event("INFO", "command completed", {"command_id": command_id, "command": command_name})
        _processed_command_ids.append(command_id)
        if len(_processed_command_ids) > 500:
            del _processed_command_ids[0]
    else:
        _publish_ack(client, command_id=command_id, status="failed", detail=detail)
        _append_log_event("ERROR", "command failed", {"command_id": command_id, "command": command_name, "detail": detail})
        _processed_command_ids.append(command_id)
        if len(_processed_command_ids) > 500:
            del _processed_command_ids[0]


def main() -> None:
    signal.signal(signal.SIGTERM, _handle_shutdown)
    signal.signal(signal.SIGINT, _handle_shutdown)

    if not DEVICE_ID:
        _append_log_event("ERROR", "missing DEVICE_ID")
        raise SystemExit(1)

    _start_preview_server()

    client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id=MQTT_CLIENT_ID)
    if MQTT_USERNAME:
        client.username_pw_set(MQTT_USERNAME, MQTT_PASSWORD)
    if MQTT_TLS_ENABLED:
        client.tls_set(
            ca_certs=MQTT_TLS_CA_CERT_PATH or None,
            cert_reqs=ssl.CERT_NONE if MQTT_TLS_INSECURE else ssl.CERT_REQUIRED,
        )
        client.tls_insecure_set(MQTT_TLS_INSECURE)
    client.reconnect_delay_set(
        min_delay=max(1, MQTT_RECONNECT_MIN_SECONDS),
        max_delay=max(1, MQTT_RECONNECT_MAX_SECONDS),
    )

    client.will_set(
        _topic("presence"),
        payload=json.dumps({"schema_version": MQTT_SCHEMA_VERSION, "status": "offline", "timestamp": int(time.time())}),
        qos=1,
        retain=True,
    )
    client.on_connect = _on_connect
    client.on_message = _on_message

    try:
        client.connect(MQTT_HOST, MQTT_PORT, MQTT_KEEPALIVE_SECONDS)
    except Exception as exc:
        _append_log_event(
            "ERROR",
            "mqtt initial connect failed",
            {
                "host": MQTT_HOST,
                "port": MQTT_PORT,
                "tls_enabled": MQTT_TLS_ENABLED,
                "detail": str(exc),
            },
        )
        raise SystemExit(1) from exc
    client.loop_start()
    _append_log_event("INFO", "mqtt agent started")

    try:
        while not _shutdown_event.is_set():
            telemetry = _collect_telemetry()
            client.publish(_topic("telemetry"), json.dumps(telemetry), qos=1, retain=False)

            if _camera_stream_session is not None:
                now = time.time()
                expires_at = float(_camera_stream_session.get("expires_at") or 0)
                if now >= expires_at:
                    _append_log_event(
                        "INFO",
                        "camera stream expired",
                        {"session_id": _camera_stream_session.get("session_id")},
                    )
                    _camera_stream_session = None
                else:
                    next_frame_at = float(_camera_stream_session.get("next_frame_at") or 0)
                    if now >= next_frame_at:
                        session_id = str(_camera_stream_session.get("session_id") or "")
                        fps = int(_camera_stream_session.get("fps") or 1)
                        _publish_camera_frame(client, session_id)
                        _camera_stream_session["next_frame_at"] = now + (1.0 / max(1, fps))

            _flush_logs(client)
            _shutdown_event.wait(MQTT_TELEMETRY_INTERVAL_SECONDS)
    finally:
        client.publish(
            _topic("presence"),
            json.dumps({"schema_version": MQTT_SCHEMA_VERSION, "status": "offline", "timestamp": int(time.time())}),
            qos=1,
            retain=True,
        )
        client.loop_stop()
        client.disconnect()


if __name__ == "__main__":
    main()
