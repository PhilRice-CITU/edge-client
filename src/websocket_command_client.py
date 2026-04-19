from __future__ import annotations

import json
import os
import time
from collections import deque
from pathlib import Path
from typing import Any

import requests
from websocket import WebSocket, create_connection
from websocket import WebSocketConnectionClosedException, WebSocketTimeoutException

from commands import execute_command
from event_client import emit_event

API_BASE_URL = os.getenv("API_BASE_URL", "").rstrip("/")
DEVICE_ID = os.getenv("DEVICE_ID", "")
DEVICE_SECRET = os.getenv("DEVICE_SECRET", "")
TIMEOUT = int(os.getenv("API_TIMEOUT_SECONDS", "30"))
POLL_SECONDS = int(os.getenv("COMMAND_POLL_SECONDS", "5"))
MAX_COMMAND_FAILURES = int(os.getenv("COMMAND_MAX_FAILURES", "5"))

WS_PATH_TEMPLATE = os.getenv(
    "API_COMMANDS_STREAM_PATH_TEMPLATE",
    "/devices/{device_id}/commands/stream",
)
WS_CONNECT_TIMEOUT_SECONDS = int(os.getenv("COMMAND_WS_CONNECT_TIMEOUT_SECONDS", "15"))
WS_HEARTBEAT_INTERVAL_SECONDS = int(os.getenv("COMMAND_WS_HEARTBEAT_INTERVAL_SECONDS", "30"))
WS_BACKOFF_MAX_SECONDS = int(os.getenv("COMMAND_WS_BACKOFF_MAX_SECONDS", "30"))

DEAD_LETTER_FILE = Path(
    os.getenv(
        "COMMAND_DEAD_LETTER_FILE",
        str(Path(__file__).resolve().parent.parent / "data" / "command_dead_letter.json"),
    )
)
PENDING_PATH_TEMPLATE = os.getenv(
    "API_COMMANDS_PENDING_PATH_TEMPLATE",
    "/devices/{device_id}/commands/pending?limit=10",
)
STATUS_PATH_TEMPLATE = os.getenv(
    "API_COMMANDS_STATUS_PATH_TEMPLATE",
    "/devices/{device_id}/commands/{command_id}/status",
)


def _log(message: str) -> None:
    print(f"[ws-command-client] {message}", flush=True)


def _headers() -> dict[str, str]:
    return {"X-Device-Secret": DEVICE_SECRET}


def _ws_url() -> str:
    ws_base = API_BASE_URL
    if ws_base.startswith("https://"):
        ws_base = "wss://" + ws_base[len("https://") :]
    elif ws_base.startswith("http://"):
        ws_base = "ws://" + ws_base[len("http://") :]
    return f"{ws_base}{WS_PATH_TEMPLATE.format(device_id=DEVICE_ID)}"


def _pending_url() -> str:
    return f"{API_BASE_URL}{PENDING_PATH_TEMPLATE.format(device_id=DEVICE_ID)}"


def _status_url(command_id: str) -> str:
    return f"{API_BASE_URL}{STATUS_PATH_TEMPLATE.format(device_id=DEVICE_ID, command_id=command_id)}"


def _fetch_pending() -> list[dict[str, Any]]:
    response = requests.get(_pending_url(), headers=_headers(), timeout=TIMEOUT)
    response.raise_for_status()
    payload = response.json()
    if isinstance(payload, list):
        return payload
    return []


def _set_status(command_id: str, status: str) -> bool:
    response = requests.patch(
        _status_url(command_id),
        headers=_headers(),
        json={"status": status},
        timeout=TIMEOUT,
    )
    return response.ok


def _record_dead_letter(command: dict[str, Any], reason: str, attempts: int) -> None:
    DEAD_LETTER_FILE.parent.mkdir(parents=True, exist_ok=True)
    payload: list[dict[str, Any]] = []
    if DEAD_LETTER_FILE.exists():
        try:
            existing = json.loads(DEAD_LETTER_FILE.read_text())
            if isinstance(existing, list):
                payload = existing
        except Exception:
            payload = []

    payload.append(
        {
            "id": command.get("id"),
            "device_id": command.get("device_id"),
            "command": command.get("command"),
            "args": command.get("args"),
            "reason": reason,
            "attempts": attempts,
            "failed_at": int(time.time()),
        }
    )
    DEAD_LETTER_FILE.write_text(json.dumps(payload, indent=2))


def _send_ack(websocket: WebSocket, command_id: str, status: str) -> None:
    try:
        websocket.send(json.dumps({"type": "ack", "id": command_id, "status": status}))
    except Exception:
        pass


def _process_command(
    command: dict[str, Any],
    *,
    seen: deque[str],
    failures: dict[str, int],
    websocket: WebSocket | None = None,
) -> None:
    command_id = str(command.get("id", ""))
    if not command_id or command_id in seen:
        return

    attempt = failures.get(command_id, 0) + 1

    if websocket is not None:
        _send_ack(websocket, command_id, "received")

    if not _set_status(command_id, "processing"):
        failures[command_id] = attempt
        if attempt >= MAX_COMMAND_FAILURES:
            _record_dead_letter(command, "status update to processing failed", attempt)
            _set_status(command_id, "failed")
            emit_event(
                "ERROR",
                "command failed before execution",
                {
                    "command_id": command_id,
                    "command": command.get("command"),
                    "attempt": attempt,
                },
            )
            seen.append(command_id)
            if websocket is not None:
                _send_ack(websocket, command_id, "failed")
        return

    ok, detail = execute_command(
        str(command.get("command", "")),
        command.get("args") if isinstance(command.get("args"), dict) else {},
    )

    if ok:
        if not _set_status(command_id, "completed"):
            _log(f"failed to mark completed command_id={command_id}")
        failures.pop(command_id, None)
        seen.append(command_id)
        emit_event(
            "INFO",
            "command completed",
            {
                "command_id": command_id,
                "command": command.get("command"),
                "detail": detail,
                "source": "ws-command-client",
            },
        )
        if websocket is not None:
            _send_ack(websocket, command_id, "completed")
        return

    failures[command_id] = attempt
    if attempt < MAX_COMMAND_FAILURES:
        _set_status(command_id, "queued")
        emit_event(
            "WARN",
            "command retry scheduled",
            {
                "command_id": command_id,
                "command": command.get("command"),
                "attempt": attempt,
                "max_failures": MAX_COMMAND_FAILURES,
                "detail": detail,
                "source": "ws-command-client",
            },
        )
        if websocket is not None:
            _send_ack(websocket, command_id, "failed")
        return

    _record_dead_letter(command, detail, attempt)
    if not _set_status(command_id, "failed"):
        _log(f"failed to mark failed command_id={command_id}")
    seen.append(command_id)
    emit_event(
        "ERROR",
        "command failed",
        {
            "command_id": command_id,
            "command": command.get("command"),
            "attempt": attempt,
            "detail": detail,
            "source": "ws-command-client",
        },
    )
    if websocket is not None:
        _send_ack(websocket, command_id, "failed")


def _poll_fallback_cycle(*, seen: deque[str], failures: dict[str, int]) -> None:
    try:
        commands = _fetch_pending()
    except Exception as exc:
        emit_event(
            "WARN",
            "command fallback poll failed",
            {"error": str(exc), "source": "ws-command-client"},
        )
        return

    for command in commands:
        _process_command(command, seen=seen, failures=failures, websocket=None)


def main() -> None:
    if not API_BASE_URL or not DEVICE_ID or not DEVICE_SECRET:
        _log("missing API_BASE_URL, DEVICE_ID, or DEVICE_SECRET; websocket client disabled")
        return

    seen: deque[str] = deque(maxlen=500)
    failures: dict[str, int] = {}
    reconnect_attempt = 0

    emit_event(
        "INFO",
        "websocket command client started",
        {
            "heartbeat_interval_seconds": WS_HEARTBEAT_INTERVAL_SECONDS,
            "poll_fallback_seconds": POLL_SECONDS,
            "connect_timeout_seconds": WS_CONNECT_TIMEOUT_SECONDS,
        },
    )

    while True:
        websocket: WebSocket | None = None
        try:
            websocket = create_connection(
                _ws_url(),
                timeout=WS_CONNECT_TIMEOUT_SECONDS,
                header=[f"X-Device-Secret: {DEVICE_SECRET}"],
            )
            websocket.settimeout(1)
            reconnect_attempt = 0
            emit_event("INFO", "websocket command channel connected", {})

            last_ping = time.monotonic()
            while True:
                try:
                    raw_message = websocket.recv()
                    if raw_message is None:
                        raise WebSocketConnectionClosedException()
                    if not isinstance(raw_message, str):
                        continue

                    payload = json.loads(raw_message)
                    if not isinstance(payload, dict):
                        continue

                    message_type = str(payload.get("type") or "").lower()
                    if message_type == "pong":
                        continue
                    if message_type != "command":
                        continue
                    _process_command(payload, seen=seen, failures=failures, websocket=websocket)
                except WebSocketTimeoutException:
                    pass

                if (time.monotonic() - last_ping) >= WS_HEARTBEAT_INTERVAL_SECONDS:
                    websocket.send(json.dumps({"type": "ping", "device_id": DEVICE_ID}))
                    last_ping = time.monotonic()

        except Exception as exc:
            reconnect_attempt += 1
            backoff_seconds = min(max(2 ** (reconnect_attempt - 1), 1), WS_BACKOFF_MAX_SECONDS)
            emit_event(
                "WARN",
                "websocket command channel disconnected",
                {
                    "error": str(exc),
                    "reconnect_attempt": reconnect_attempt,
                    "reconnect_backoff_seconds": backoff_seconds,
                },
            )

            fallback_deadline = time.time() + backoff_seconds
            while time.time() < fallback_deadline:
                _poll_fallback_cycle(seen=seen, failures=failures)
                time.sleep(POLL_SECONDS)
        finally:
            if websocket is not None:
                try:
                    websocket.close()
                except Exception:
                    pass


if __name__ == "__main__":
    main()