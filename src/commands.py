from __future__ import annotations

import os
import subprocess
from pathlib import Path
from typing import Any

_ROOT = Path(__file__).resolve().parent.parent
_CAPTURE_SCRIPT = _ROOT / "scripts" / "capture.sh"
_CAPTURE_LOCK = Path(os.getenv("CAPTURE_LOCK_FILE", "/tmp/edge-capture.lock"))


def _acquire_capture_lock() -> int | None:
    _CAPTURE_LOCK.parent.mkdir(parents=True, exist_ok=True)
    try:
        return os.open(_CAPTURE_LOCK, os.O_CREAT | os.O_EXCL | os.O_RDWR)
    except FileExistsError:
        return None


def _release_capture_lock(lock_fd: int) -> None:
    try:
        os.close(lock_fd)
    except Exception:
        pass
    try:
        _CAPTURE_LOCK.unlink(missing_ok=True)
    except Exception:
        pass


def _run_capture_once() -> tuple[bool, str]:
    lock_fd = _acquire_capture_lock()
    if lock_fd is None:
        return False, "Capture already in progress"

    try:
        result = subprocess.run(
            ["bash", str(_CAPTURE_SCRIPT), "--once"],
            capture_output=True,
            text=True,
            timeout=90,
        )
    except subprocess.TimeoutExpired:
        _release_capture_lock(lock_fd)
        return False, "Capture timed out"

    _release_capture_lock(lock_fd)

    if result.returncode != 0:
        return False, f"Capture failed: {result.stderr[-180:]}"

    return True, "Capture completed"


def _run_power_command(command: list[str], label: str) -> tuple[bool, str]:
    allow_power = os.getenv("ALLOW_POWER_COMMANDS", "false").strip().lower() == "true"
    if not allow_power:
        return False, f"{label} blocked (ALLOW_POWER_COMMANDS=false)"

    try:
        subprocess.run(command, check=True)
    except Exception as exc:
        return False, f"{label} failed: {exc}"

    return True, f"{label} requested"


def execute_command(command: str, args: dict[str, Any] | None = None) -> tuple[bool, str]:
    _ = args or {}

    if command == "capture":
        return _run_capture_once()

    if command == "restart-app":
        # Startup supervisor handles process restarts; this marks intent.
        return True, "App restart acknowledged"

    if command == "restart-device":
        return _run_power_command(["sudo", "systemctl", "reboot"], "Reboot")

    if command == "shutdown-device":
        return _run_power_command(["sudo", "systemctl", "poweroff"], "Shutdown")

    return False, f"Unsupported command: {command}"
