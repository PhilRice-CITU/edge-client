import json
import os
import time
from pathlib import Path

from upload_router import upload_item

# Resolve queue path relative to this file's location so uploader works
# regardless of which directory it is launched from.
_ROOT = Path(__file__).resolve().parent.parent
QUEUE_FILE = Path(os.getenv("QUEUE_FILE", str(_ROOT / "data" / "upload_queue.json")))
POLL_SECONDS = int(os.getenv("UPLOADER_POLL_SECONDS", "3"))
MAX_RETRIES = int(os.getenv("UPLOADER_MAX_RETRIES", "5"))


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
    retries = int(item.get("retries", 0)) + 1
    item["retries"] = retries

    if retries > MAX_RETRIES:
        # Dead-letter behavior can be added here.
        return

    items = _read_queue()
    items.append(item)
    _write_queue(items)


def main():
    while True:
        item = _dequeue()
        if item is None:
            time.sleep(POLL_SECONDS)
            continue

        try:
            ok = upload_item(item)
        except Exception:
            ok = False

        if not ok:
            _requeue_with_retry(item)


if __name__ == "__main__":
    main()
