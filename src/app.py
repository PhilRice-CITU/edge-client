from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

from flask import Flask, jsonify

app = Flask(__name__)

_ROOT = Path(__file__).resolve().parent.parent
QUEUE_FILE = Path(os.getenv("QUEUE_FILE", str(_ROOT / "data" / "upload_queue.json")))
IMAGE_DIR = Path(os.getenv("IMAGE_DIR", str(_ROOT / "data" / "images")))


@app.get("/health")
def health() -> Any:
    return jsonify({"status": "ok"})


@app.get("/mode")
def mode() -> Any:
    return jsonify(
        {
            "edge_mode": os.getenv("EDGE_MODE", "production"),
            "production_upload_target": os.getenv("PRODUCTION_UPLOAD_TARGET", "api"),
            "training_upload_target": os.getenv("TRAINING_UPLOAD_TARGET", "roboflow"),
        }
    )


@app.get("/queue-size")
def queue_size() -> Any:
    if not QUEUE_FILE.exists():
        return jsonify({"size": 0})

    items = json.loads(QUEUE_FILE.read_text())
    return jsonify({"size": len(items)})


@app.get("/status")
def status() -> Any:
    images_count = len(list(IMAGE_DIR.glob("*.jpg"))) if IMAGE_DIR.exists() else 0
    queue_count = 0
    if QUEUE_FILE.exists():
        queue_count = len(json.loads(QUEUE_FILE.read_text()))

    return jsonify(
        {
            "device_id": os.getenv("DEVICE_ID", "pi-001"),
            "edge_mode": os.getenv("EDGE_MODE", "production"),
            "images_on_disk": images_count,
            "queued_uploads": queue_count,
        }
    )


if __name__ == "__main__":
    port = int(os.getenv("FLASK_PORT", "5055"))
    app.run(host="0.0.0.0", port=port, debug=False)
