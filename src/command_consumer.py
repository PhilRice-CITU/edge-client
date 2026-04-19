from __future__ import annotations

import os
import time
from collections import deque
from pathlib import Path
from typing import Any

import requests

from commands import execute_command
from event_client import emit_event

API_BASE_URL = os.getenv("API_BASE_URL", "").rstrip("/")
DEVICE_ID = os.getenv("DEVICE_ID", "")
DEVICE_SECRET = os.getenv("DEVICE_SECRET", "")
TIMEOUT = int(os.getenv("API_TIMEOUT_SECONDS", "30"))
POLL_SECONDS = int(os.getenv("COMMAND_POLL_SECONDS", "5"))
MAX_COMMAND_FAILURES = int(os.getenv("COMMAND_MAX_FAILURES", "5"))
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


def _headers() -> dict[str, str]:
    return {"X-Device-Secret": DEVICE_SECRET}


def _log(message: str) -> None:
    print(f"[command-consumer] {message}", flush=True)


def _pending_url() -> str:
    return f"{API_BASE_URL}{PENDING_PATH_TEMPLATE.format(device_id=DEVICE_ID)}"


def _status_url(command_id: str) -> str:
    return (
        f"{API_BASE_URL}"
        f"{STATUS_PATH_TEMPLATE.format(device_id=DEVICE_ID, command_id=command_id)}"
    )


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
            import json

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

    import json

    DEAD_LETTER_FILE.write_text(json.dumps(payload, indent=2))


def main() -> None:
    if not API_BASE_URL or not DEVICE_ID or not DEVICE_SECRET:
        _log("missing API_BASE_URL, DEVICE_ID, or DEVICE_SECRET; consumer disabled")
        return

    emit_event("INFO", "command consumer started", {"poll_seconds": POLL_SECONDS})

    seen = deque(maxlen=500)
    failures: dict[str, int] = {}

    while True:
        try:
            commands = _fetch_pending()
        except Exception as exc:
            _log(f"poll failed: {exc}")
            emit_event("WARN", "command poll failed", {"error": str(exc)})
            time.sleep(POLL_SECONDS)
            continue

        for cmd in commands:
            command_id = str(cmd.get("id", ""))
            if not command_id or command_id in seen:
                continue

            command_name = str(cmd.get("command", ""))
            if command_name == "capture":
                emit_event(
                    "INFO",
                    "capture task received",
                    {
                        "command_id": command_id,
                        "command": command_name,
                        "source": "command-consumer",
                    },
                )

            attempt = failures.get(command_id, 0) + 1

            if not _set_status(command_id, "processing"):
                failures[command_id] = attempt
                _log(
                    f"failed to mark processing command_id={command_id} "
                    f"attempt={attempt}/{MAX_COMMAND_FAILURES}"
                )
                if attempt >= MAX_COMMAND_FAILURES:
                    _record_dead_letter(cmd, "status update to processing failed", attempt)
                    _set_status(command_id, "failed")
                    emit_event(
                        "ERROR",
                        "command failed before execution",
                        {
                            "command_id": command_id,
                            "command": cmd.get("command"),
                            "attempt": attempt,
                        },
                    )
                    seen.append(command_id)
                continue

            ok, detail = execute_command(
                str(cmd.get("command", "")),
                cmd.get("args") if isinstance(cmd.get("args"), dict) else {},
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
                        "command": cmd.get("command"),
                        "detail": detail,
                    },
                )
            else:
                failures[command_id] = attempt
                if attempt < MAX_COMMAND_FAILURES:
                    _set_status(command_id, "queued")
                    _log(
                        f"command retry scheduled command_id={command_id} "
                        f"attempt={attempt}/{MAX_COMMAND_FAILURES} detail={detail}"
                    )
                    emit_event(
                        "WARN",
                        "command retry scheduled",
                        {
                            "command_id": command_id,
                            "command": cmd.get("command"),
                            "attempt": attempt,
                            "max_failures": MAX_COMMAND_FAILURES,
                            "detail": detail,
                        },
                    )
                    continue

                _record_dead_letter(cmd, detail, attempt)
                if not _set_status(command_id, "failed"):
                    _log(f"failed to mark failed command_id={command_id}")
                seen.append(command_id)
                emit_event(
                    "ERROR",
                    "command failed",
                    {
                        "command_id": command_id,
                        "command": cmd.get("command"),
                        "attempt": attempt,
                        "detail": detail,
                    },
                )

            _log(
                f"command_id={command_id} command={cmd.get('command')} "
                f"status={'completed' if ok else 'failed'} detail={detail}"
            )

        time.sleep(POLL_SECONDS)


if __name__ == "__main__":
    main()
