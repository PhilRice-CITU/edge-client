from __future__ import annotations

import json
import os
import time
from pathlib import Path

from event_client import emit_event
from upload_router import upload_item

# Resolve queue path relative to this file's location so uploader works
# regardless of which directory it is launched from.
_ROOT = Path(__file__).resolve().parent.parent
QUEUE_FILE = Path(os.getenv("QUEUE_FILE", str(_ROOT / "data" / "upload_queue.json")))
POLL_SECONDS = int(os.getenv("UPLOADER_POLL_SECONDS", "3"))
MAX_RETRIES = int(os.getenv("UPLOADER_MAX_RETRIES", "5"))


def _log(message: str) -> None:
    print(f"[uploader] {message}", flush=True)


def _read_queue():
    if not QUEUE_FILE.exists():
        return []
    return json.loads(QUEUE_FILE.read_text())


def _write_queue(items):
    QUEUE_FILE.parent.mkdir(parents=True, exist_ok=True)
    QUEUE_FILE.write_text(json.dumps(items, indent=2))


def _dequeue():
    items = _read_queue()
    if not items:
        return None

    item = items.pop(0)
    _write_queue(items)
    return item


def _requeue_with_retry(item):
    session_id = item.get("session_id", "unknown")
    retries = int(item.get("retries", 0)) + 1
    item["retries"] = retries

    if retries > MAX_RETRIES:
        _log(f"dropping session={session_id} after retries={retries - 1} (max={MAX_RETRIES})")
        emit_event(
            "ERROR",
            "upload dropped after max retries",
            {"session_id": session_id, "max_retries": MAX_RETRIES},
        )
        return

    items = _read_queue()
    items.append(item)
    _write_queue(items)
    _log(f"requeued session={session_id} retries={retries}/{MAX_RETRIES}")


def main():
    _log(
        f"started queue_file={QUEUE_FILE} poll_seconds={POLL_SECONDS} "
        f"max_retries={MAX_RETRIES}"
    )
    emit_event(
        "INFO",
        "uploader started",
        {
            "queue_file": str(QUEUE_FILE),
            "poll_seconds": POLL_SECONDS,
            "max_retries": MAX_RETRIES,
        },
    )
    while True:
        item = _dequeue()
        if item is None:
            time.sleep(POLL_SECONDS)
            continue

        session_id = item.get("session_id", "unknown")
        _log(f"processing session={session_id}")

        try:
            ok = upload_item(item)
        except Exception as exc:
            _log(f"upload exception session={session_id}: {exc}")
            emit_event(
                "ERROR",
                "upload exception",
                {"session_id": session_id, "error": str(exc)},
            )
            ok = False

        if ok:
            _log(f"upload success session={session_id}")
            emit_event("INFO", "upload success", {"session_id": session_id})
        else:
            _log(f"upload failed session={session_id}")
            emit_event("WARN", "upload failed", {"session_id": session_id})
            _requeue_with_retry(item)


if __name__ == "__main__":
    main()
