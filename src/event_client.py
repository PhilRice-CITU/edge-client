from __future__ import annotations

import json
import time
from pathlib import Path
from typing import Any

_EVENT_QUEUE_FILE = Path(__file__).resolve().parent.parent / "data" / "event_queue.jsonl"


def emit_event(level: str, message: str, meta: dict[str, Any] | None = None) -> bool:
    """Append events to local queue; mqtt_agent publishes them to broker."""
    try:
        _EVENT_QUEUE_FILE.parent.mkdir(parents=True, exist_ok=True)
        payload = {
            "level": str(level or "INFO").upper(),
            "message": message,
            "meta": meta or {},
            "timestamp": int(time.time()),
        }
        with _EVENT_QUEUE_FILE.open("a", encoding="utf-8") as handle:
            handle.write(json.dumps(payload) + "\n")
        return True
    except Exception:
        return False
