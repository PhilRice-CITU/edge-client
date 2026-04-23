#!/usr/bin/env python3
"""
Standalone training capture script.
Runs capture.sh --once then uploads both images to Roboflow directly.
No Flask, no session, no Electron required.

Usage: python3 scripts/capture_and_upload.py
"""
import json
import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "src"))

from dotenv import load_dotenv as _load  # type: ignore
_load(ROOT / ".env", override=False)

import upload_router

CAPTURE_SCRIPT = ROOT / "scripts" / "capture.sh"

def main() -> None:
    print("[capture_and_upload] Running capture.sh --once...", flush=True)
    try:
        result = subprocess.run(
            ["bash", str(CAPTURE_SCRIPT), "--once"],
            capture_output=True,
            text=True,
            timeout=90,
        )
    except subprocess.TimeoutExpired:
        print("[capture_and_upload] ERROR: capture timed out", flush=True)
        sys.exit(1)

    if result.returncode != 0:
        print(f"[capture_and_upload] ERROR: capture failed\n{result.stderr}", flush=True)
        sys.exit(1)

    try:
        data = json.loads(result.stdout.strip())
    except json.JSONDecodeError:
        print(f"[capture_and_upload] ERROR: invalid output: {result.stdout!r}", flush=True)
        sys.exit(1)

    ir_path = data.get("ir_path")
    white_path = data.get("white_path")
    if not ir_path or not white_path:
        print(f"[capture_and_upload] ERROR: missing paths in output: {data}", flush=True)
        sys.exit(1)

    print(f"[capture_and_upload] Captured ir={ir_path} white={white_path}", flush=True)
    print("[capture_and_upload] Uploading to Roboflow...", flush=True)

    item = {"ir": ir_path, "raw": white_path}
    try:
        ok = upload_router.upload_to_roboflow(item)
    except Exception as exc:
        print(f"[capture_and_upload] ERROR: upload failed: {exc}", flush=True)
        sys.exit(1)

    if ok:
        print("[capture_and_upload] Upload successful.", flush=True)
    else:
        print("[capture_and_upload] ERROR: Roboflow rejected the upload.", flush=True)
        sys.exit(1)

if __name__ == "__main__":
    main()
