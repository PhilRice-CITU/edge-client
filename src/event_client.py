from __future__ import annotations

import os
from typing import Any

import requests

API_BASE_URL = os.getenv("API_BASE_URL", "").rstrip("/")
DEVICE_ID = os.getenv("DEVICE_ID", "")
DEVICE_SECRET = os.getenv("DEVICE_SECRET", "")
TIMEOUT = int(os.getenv("API_TIMEOUT_SECONDS", "30"))
EVENT_PATH = os.getenv("API_DEVICE_EVENT_INGEST_PATH", "/device-events/ingest")


def emit_event(level: str, message: str, meta: dict[str, Any] | None = None) -> bool:
    """Best-effort device event publishing. Never raises to callers."""
    if not API_BASE_URL or not DEVICE_ID or not DEVICE_SECRET:
        return False

    payload = {
        "device_id": DEVICE_ID,
        "level": str(level or "INFO").upper(),
        "message": message,
        "meta": meta or {},
    }

    try:
        response = requests.post(
            f"{API_BASE_URL}{EVENT_PATH}",
            json=payload,
            headers={"X-Device-Secret": DEVICE_SECRET},
            timeout=TIMEOUT,
        )
        return response.ok
    except Exception:
        return False
