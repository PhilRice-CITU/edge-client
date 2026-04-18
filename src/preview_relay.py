from __future__ import annotations

import os
import time
from typing import Optional

import requests

from event_client import emit_event

API_BASE_URL = os.getenv("API_BASE_URL", "").rstrip("/")
DEVICE_ID = os.getenv("DEVICE_ID", "").strip()
DEVICE_SECRET = os.getenv("DEVICE_SECRET", "").strip()
TIMEOUT = int(os.getenv("API_TIMEOUT_SECONDS", "30"))
FLASK_PORT = int(os.getenv("FLASK_PORT", "5055"))

REQUEST_PATH_TEMPLATE = os.getenv(
    "API_PREVIEW_REQUEST_PATH_TEMPLATE",
    "/devices/{device_id}/preview/request",
)
UPLOAD_PATH_TEMPLATE = os.getenv(
    "API_PREVIEW_UPLOAD_PATH_TEMPLATE",
    "/devices/{device_id}/preview/frame",
)

LOCAL_FRAME_URL = os.getenv(
    "PREVIEW_LOCAL_FRAME_URL",
    f"http://127.0.0.1:{FLASK_PORT}/preview/frame",
)

REQUEST_POLL_SECONDS = float(os.getenv("PREVIEW_REQUEST_POLL_SECONDS", "2"))
ACTIVE_FPS = float(os.getenv("PREVIEW_ACTIVE_FPS", "3"))


def _headers() -> dict[str, str]:
    return {"X-Device-Secret": DEVICE_SECRET}


def _request_url() -> str:
    return f"{API_BASE_URL}{REQUEST_PATH_TEMPLATE.format(device_id=DEVICE_ID)}"


def _upload_url() -> str:
    return f"{API_BASE_URL}{UPLOAD_PATH_TEMPLATE.format(device_id=DEVICE_ID)}"


def _is_active_requested() -> bool:
    response = requests.get(_request_url(), headers=_headers(), timeout=TIMEOUT)
    response.raise_for_status()
    payload = response.json()
    return bool(isinstance(payload, dict) and payload.get("active"))


def _fetch_local_frame() -> Optional[bytes]:
    response = requests.get(LOCAL_FRAME_URL, timeout=5)
    if response.status_code != 200:
        return None
    content_type = response.headers.get("content-type", "")
    if "image/" not in content_type:
        return None
    return response.content


def _upload_frame(frame_bytes: bytes) -> bool:
    response = requests.post(
        _upload_url(),
        headers=_headers(),
        files={"frame": ("preview.jpg", frame_bytes, "image/jpeg")},
        timeout=TIMEOUT,
    )
    return response.ok


def _safe_sleep(seconds: float) -> None:
    time.sleep(max(seconds, 0.05))


def main() -> None:
    if not API_BASE_URL or not DEVICE_ID or not DEVICE_SECRET:
        return

    emit_event(
        "INFO",
        "preview relay started",
        {
            "request_poll_seconds": REQUEST_POLL_SECONDS,
            "active_fps": ACTIVE_FPS,
        },
    )

    was_active = False
    active_interval = 1.0 / max(ACTIVE_FPS, 0.5)

    while True:
        try:
            active = _is_active_requested()
        except Exception as exc:
            emit_event("WARN", "preview request poll failed", {"error": str(exc)})
            _safe_sleep(REQUEST_POLL_SECONDS)
            continue

        if active and not was_active:
            emit_event("INFO", "preview relay active")
        if not active and was_active:
            emit_event("INFO", "preview relay idle")
        was_active = active

        if not active:
            _safe_sleep(REQUEST_POLL_SECONDS)
            continue

        frame = _fetch_local_frame()
        if not frame:
            _safe_sleep(active_interval)
            continue

        ok = False
        try:
            ok = _upload_frame(frame)
        except Exception:
            ok = False

        if not ok:
            _safe_sleep(active_interval)
            continue

        _safe_sleep(active_interval)


if __name__ == "__main__":
    main()
