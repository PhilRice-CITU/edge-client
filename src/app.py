from __future__ import annotations

import json
import os
import subprocess
import time
from pathlib import Path
from typing import Any

import requests as http
from flask import Flask, Response, jsonify, request
from flask_cors import CORS

from event_client import emit_event
import provision as _provision
import session_manager
import upload_router

app = Flask(__name__)
CORS(app, origins=["http://localhost:5173", "http://127.0.0.1:5173"])

_ROOT = Path(__file__).resolve().parent.parent
_DATA_ROOT = (
    Path.home() / ".config" / "hum-ai" / "data"
    if not os.access(_ROOT / "data" if (_ROOT / "data").exists() else _ROOT, os.W_OK)
    else _ROOT / "data"
)
IMAGE_DIR = Path(os.getenv("IMAGE_DIR", str(_DATA_ROOT / "images")))
API_BASE_URL = os.getenv("API_BASE_URL", "http://localhost:3001")
API_TIMEOUT = int(os.getenv("API_TIMEOUT_SECONDS", "30"))
FLASK_PORT = int(os.getenv("FLASK_PORT", "5055"))
CAPTURE_SCRIPT = _ROOT / "scripts" / "capture.sh"
CAPTURE_LOCK_FILE = Path(os.getenv("CAPTURE_LOCK_FILE", "/tmp/edge-capture.lock"))
QUEUE_FILE = Path(os.getenv("QUEUE_FILE", str(_DATA_ROOT / "upload_queue.json")))
PREVIEW_FRAME_TIMEOUT_SECONDS = int(os.getenv("PREVIEW_FRAME_TIMEOUT_SECONDS", "6"))


def _is_grade_mode(session: dict[str, Any] | None) -> bool:
    return bool(session and str(session.get("mode", "")).strip().lower() == "grade")


def _emit_grade_event(
    *,
    level: str,
    message: str,
    session: dict[str, Any] | None = None,
    session_id: str | None = None,
    meta: dict[str, Any] | None = None,
) -> None:
    if not _is_grade_mode(session):
        return

    payload = dict(meta or {})
    payload["session_id"] = session_id or str(session.get("id", ""))
    payload["mode"] = "grade"
    print(
        f"[grade-session] level={level} message={message} "
        f"session_id={payload['session_id']}",
        flush=True,
    )

    published = emit_event(level, message, payload)
    if not published:
        print(
            f"[grade-session] remote event publish failed message={message} "
            f"session_id={payload['session_id']}",
            flush=True,
        )


def _capture_lock_pid() -> int | None:
    if not CAPTURE_LOCK_FILE.exists():
        return None

    try:
        raw = CAPTURE_LOCK_FILE.read_text().strip()
    except OSError:
        return None

    if not raw:
        return None

    try:
        return int(raw)
    except ValueError:
        return None


def _pid_running(pid: int) -> bool:
    if pid <= 0:
        return False
    try:
        os.kill(pid, 0)
        return True
    except ProcessLookupError:
        return False
    except PermissionError:
        return True


def _capture_in_progress() -> bool:
    if not CAPTURE_LOCK_FILE.exists():
        return False

    pid = _capture_lock_pid()
    if pid is not None:
        if _pid_running(pid):
            return True
    else:
        # A newly created lock may not have a PID yet; treat it as active briefly.
        try:
            lock_age_seconds = time.time() - CAPTURE_LOCK_FILE.stat().st_mtime
        except OSError:
            return True
        if lock_age_seconds < 120:
            return True

    try:
        CAPTURE_LOCK_FILE.unlink(missing_ok=True)
    except OSError:
        return True

    return False


def _preview_commands() -> list[list[str]]:
    width = os.getenv("PREVIEW_FRAME_WIDTH", "640")
    height = os.getenv("PREVIEW_FRAME_HEIGHT", "480")
    duration_ms = os.getenv("PREVIEW_FRAME_DURATION_MS", "700")

    return [
        [
            "rpicam-still",
            "-o",
            "-",
            "-t",
            duration_ms,
            "-n",
            "--width",
            width,
            "--height",
            height,
        ],
        [
            "libcamera-still",
            "-o",
            "-",
            "-t",
            duration_ms,
            "-n",
            "--width",
            width,
            "--height",
            height,
        ],
    ]


def _capture_preview_frame() -> tuple[bytes | None, str]:
    last_error = "camera command unavailable"

    for command in _preview_commands():
        try:
            result = subprocess.run(
                command,
                capture_output=True,
                timeout=PREVIEW_FRAME_TIMEOUT_SECONDS,
            )
        except FileNotFoundError:
            continue
        except subprocess.TimeoutExpired:
            last_error = f"{command[0]} timed out"
            continue

        if result.returncode == 0 and result.stdout:
            return result.stdout, ""

        stderr_text = result.stderr.decode("utf-8", errors="ignore").strip()
        if stderr_text:
            last_error = stderr_text[-300:]
        else:
            last_error = f"{command[0]} failed with code {result.returncode}"

    return None, last_error


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


_image_count_cache: dict[str, object] = {"count": 0, "expires": 0.0}


@app.get("/status")
def status() -> Any:
    now = time.time()
    if now > float(_image_count_cache["expires"]):
        _image_count_cache["count"] = (
            len(list(IMAGE_DIR.glob("*.jpg"))) if IMAGE_DIR.exists() else 0
        )
        _image_count_cache["expires"] = now + 30.0
    images_count = int(_image_count_cache["count"])

    queue_count = 0
    if QUEUE_FILE.exists():
        try:
            queue_count = len(json.loads(QUEUE_FILE.read_text()))
        except (json.JSONDecodeError, OSError):
            queue_count = 0

    return jsonify(
        {
            "device_id": os.getenv("DEVICE_ID", ""),
            "display_name": os.getenv("DEVICE_DISPLAY_NAME", ""),
            "edge_mode": os.getenv("EDGE_MODE", "production"),
            "images_on_disk": images_count,
            "queued_uploads": queue_count,
            "qr_url": os.getenv("DEVICE_QR_URL", ""),
        }
    )


@app.get("/preview/image")
def preview_image() -> Any:
    raw_path = request.args.get("path", "").strip()
    if not raw_path:
        return jsonify({"error": "path required"}), 400
    target = Path(raw_path).resolve()
    allowed = IMAGE_DIR.resolve()
    if not str(target).startswith(str(allowed)):
        return jsonify({"error": "forbidden"}), 403
    if not target.exists() or not target.is_file():
        return jsonify({"error": "not found"}), 404
    return Response(target.read_bytes(), mimetype="image/jpeg")


@app.get("/preview/frame")
def preview_frame() -> Any:
    """
    Return a single low-resolution JPEG from the Pi camera for live preview.
    Used by the Electron renderer to show a viewfinder in the session screen.
    Returns 503 when rpicam-still is unavailable (e.g. dev environment).
    """
    if _capture_in_progress():
        return jsonify({"error": "camera busy", "detail": "capture in progress"}), 503

    frame_bytes, detail = _capture_preview_frame()
    if frame_bytes is None:
        return jsonify({"error": "camera unavailable", "detail": detail}), 503

    return Response(frame_bytes, mimetype="image/jpeg")


# ── Session management ────────────────────────────────────────────────────────


@app.post("/sessions")
def create_session() -> Any:
    body = request.get_json() or {}
    mode = body.get("mode", "grade")
    operator_name = body.get("operator_name", "")
    rice_variety = body.get("rice_variety")
    session = session_manager.create_session(mode, operator_name, rice_variety)
    _emit_grade_event(
        level="INFO",
        message="grade session created",
        session=session,
        meta={
            "operator_name": operator_name,
            "rice_variety": rice_variety or "",
        },
    )
    return jsonify(session), 201


@app.get("/sessions/<session_id>")
def get_session(session_id: str) -> Any:
    session = session_manager.get_session(session_id)
    if not session:
        return jsonify({"error": "session not found"}), 404
    return jsonify(session)


@app.patch("/sessions/<session_id>")
def patch_session(session_id: str) -> Any:
    body = request.get_json() or {}
    allowed = {"operator_name", "rice_variety", "status"}
    fields = {k: v for k, v in body.items() if k in allowed}
    existing = session_manager.get_session(session_id)
    updated = session_manager.update_session(session_id, **fields)
    if not updated:
        return jsonify({"error": "session not found"}), 404

    _emit_grade_event(
        level="INFO",
        message="grade session updated",
        session=existing,
        session_id=session_id,
        meta={"fields": fields},
    )
    return jsonify(updated)


@app.post("/sessions/<session_id>/capture")
def session_capture(session_id: str) -> Any:
    print(f"[grade-session] capture request received session_id={session_id}", flush=True)

    session = session_manager.get_session(session_id)
    if not session:
        print(f"[grade-session] capture request missing session session_id={session_id}", flush=True)
        return jsonify({"error": "session not found"}), 404

    _emit_grade_event(
        level="INFO",
        message="grade capture requested",
        session=session,
        session_id=session_id,
    )

    if _capture_in_progress():
        _emit_grade_event(
            level="WARN",
            message="grade capture skipped because camera is busy",
            session=session,
            session_id=session_id,
        )
        return jsonify({"error": "capture already in progress"}), 409

    try:
        result = subprocess.run(
            ["bash", str(CAPTURE_SCRIPT), "--once"],
            capture_output=True,
            text=True,
            timeout=90,
        )
    except subprocess.TimeoutExpired:
        _emit_grade_event(
            level="ERROR",
            message="grade capture timed out",
            session=session,
            session_id=session_id,
            meta={"timeout_seconds": 90},
        )
        return jsonify({"error": "capture timed out after 90s"}), 504

    if result.returncode != 0:
        _emit_grade_event(
            level="ERROR",
            message="grade capture script failed",
            session=session,
            session_id=session_id,
            meta={
                "return_code": result.returncode,
                "stderr_tail": result.stderr[-500:],
                "stdout_tail": result.stdout[-500:],
            },
        )
        detail = result.stderr[-500:] if result.stderr else result.stdout[-500:]
        return jsonify({"error": "capture script failed", "detail": detail}), 500

    try:
        capture_data = json.loads(result.stdout.strip())
    except json.JSONDecodeError:
        _emit_grade_event(
            level="ERROR",
            message="grade capture output invalid json",
            session=session,
            session_id=session_id,
            meta={"stdout_head": result.stdout[:200]},
        )
        return jsonify({"error": "invalid capture output", "raw": result.stdout[:200]}), 500

    ir_path = capture_data.get("ir_path")
    white_path = capture_data.get("white_path")
    if not ir_path or not white_path:
        _emit_grade_event(
            level="ERROR",
            message="grade capture output missing paths",
            session=session,
            session_id=session_id,
            meta={"capture_data": capture_data},
        )
        return jsonify({"error": "capture output missing paths"}), 500

    updated = session_manager.append_batch(session_id, ir_path, white_path)
    batch_number = len(updated.get("batches", [])) if updated else None
    _emit_grade_event(
        level="INFO",
        message="grade capture stored",
        session=session,
        session_id=session_id,
        meta={
            "batch_number": batch_number,
            "ir_path": ir_path,
            "white_path": white_path,
        },
    )
    return jsonify(updated)


@app.post("/sessions/<session_id>/upload-training")
def session_upload_training(session_id: str) -> Any:
    """Upload the most-recent training batch (ir + white) to Roboflow immediately."""
    session = session_manager.get_session(session_id)
    if not session:
        return jsonify({"error": "session not found"}), 404

    batches = session.get("batches", [])
    if not batches:
        return jsonify({"error": "no batches to upload"}), 400

    batch = batches[-1]
    ir_path = batch.get("ir_path") or batch.get("ir")
    white_path = batch.get("white_path") or batch.get("raw")

    if not ir_path or not white_path:
        return jsonify({"error": "batch missing image paths"}), 500

    item = {
        "session_id": session_id,
        "ir": ir_path,
        "raw": white_path,
        "captured_at": batch.get("captured_at", ""),
    }

    try:
        ok = upload_router.upload_to_roboflow(item)
    except Exception as exc:
        print(f"[training-upload] roboflow upload failed session_id={session_id} error={exc}", flush=True)
        return jsonify({"error": "upload failed", "detail": str(exc)}), 500

    if ok:
        print(f"[training-upload] roboflow upload success session_id={session_id}", flush=True)
        return jsonify({"uploaded": True, "session_id": session_id, "batch_number": batch.get("batch_number")})
    else:
        return jsonify({"error": "roboflow rejected the upload"}), 502


@app.post("/sessions/<session_id>/submit")
def session_submit(session_id: str) -> Any:

    session = session_manager.get_session(session_id)
    if not session:
        return jsonify({"error": "session not found"}), 404

    _emit_grade_event(
        level="INFO",
        message="grade submit requested",
        session=session,
        session_id=session_id,
        meta={"batch_count": len(session.get("batches", []))},
    )

    if session["status"] != "capturing":
        _emit_grade_event(
            level="WARN",
            message="grade submit skipped due to session status",
            session=session,
            session_id=session_id,
            meta={"status": session.get("status")},
        )
        return jsonify({"error": f"session is already {session['status']}"}), 409
    if not session["batches"]:
        _emit_grade_event(
            level="WARN",
            message="grade submit skipped with no batches",
            session=session,
            session_id=session_id,
        )
        return jsonify({"error": "no batches captured yet"}), 400

    files: list[tuple[str, tuple[str, bytes, str]]] = []
    for batch in session["batches"]:
        ir_file = Path(batch["ir_path"])
        raw_file = Path(batch["white_path"])
        if not ir_file.exists() or not raw_file.exists():
            _emit_grade_event(
                level="ERROR",
                message="grade submit missing batch files",
                session=session,
                session_id=session_id,
                meta={
                    "batch_number": batch["batch_number"],
                    "ir_exists": ir_file.exists(),
                    "raw_exists": raw_file.exists(),
                },
            )
            return jsonify({"error": f"batch {batch['batch_number']} images missing from disk"}), 400
        files.append(("ir_images", (ir_file.name, ir_file.read_bytes(), "image/jpeg")))
        files.append(("raw_images", (raw_file.name, raw_file.read_bytes(), "image/jpeg")))

    data = {
        "device_id": os.getenv("DEVICE_ID", "pi-001"),
        "session_id": session_id,
        "captured_at": session["batches"][-1]["captured_at"],
        "operator_name": session["operator_name"],
        "rice_variety": session.get("rice_variety") or "",
        "batch_name": session.get("operator_name") or "",
        "batch_count": str(len(session["batches"])),
        "batch_metadata": json.dumps(
            [
                {"batch_number": b["batch_number"], "captured_at": b["captured_at"]}
                for b in session["batches"]
            ]
        ),
    }

    try:
        resp = http.post(
            f"{API_BASE_URL}/scans/batch",
            data=data,
            files=files,
            timeout=API_TIMEOUT,
        )
        resp.raise_for_status()
        result_data = resp.json()
    except http.exceptions.RequestException as exc:
        _emit_grade_event(
            level="ERROR",
            message="grade submit failed reaching api",
            session=session,
            session_id=session_id,
            meta={"error": str(exc)},
        )
        return jsonify({"error": "API server unreachable", "detail": str(exc)}), 502

    result_id = result_data.get("id")
    session_manager.update_session(session_id, status="submitted")
    _emit_grade_event(
        level="INFO",
        message="grade submit accepted",
        session=session,
        session_id=session_id,
        meta={"result_id": result_id},
    )
    return jsonify({"result_id": result_id})


# ── Setup / Provisioning ───────────────────────────────────────────────


@app.get("/setup/regions")
def setup_regions() -> Any:
    """Proxy the public region list from the API server — no auth required."""
    try:
        resp = http.get(f"{API_BASE_URL}/regions/public", timeout=API_TIMEOUT)
        resp.raise_for_status()
        return jsonify(resp.json())
    except http.exceptions.RequestException as exc:
        return jsonify({"error": "Could not reach API server", "detail": str(exc)}), 502


@app.post("/setup/register")
def setup_register() -> Any:
    """Register this device with the API server. Writes DEVICE_ID to .env."""
    body = request.get_json() or {}
    region_code = body.get("region_code", "").strip()
    if not region_code:
        return jsonify({"error": "region_code is required"}), 400

    provision_token = os.getenv("PROVISION_TOKEN", "").strip()
    if not provision_token:
        return jsonify({"error": "PROVISION_TOKEN not set in .env"}), 500

    try:
        resp = http.post(
            f"{API_BASE_URL}/devices/provision",
            json={
                "provision_token": provision_token,
                "region_code": region_code,
                "mac_address": _provision._mac_address(),
                "hostname": _provision._hostname_hint(),
            },
            timeout=API_TIMEOUT,
        )
        resp.raise_for_status()
    except http.exceptions.RequestException as exc:
        return jsonify({"error": "Registration failed", "detail": str(exc)}), 502

    data = resp.json()
    device_id: str = data["device_id"]
    display_name: str = data["display_name"]
    qr_url: str = data.get("qr_url", "")

    _provision.write_device_identity(device_id, display_name, qr_url)

    return jsonify({"device_id": device_id, "display_name": display_name, "qr_url": qr_url})


@app.post("/setup/claim")
def setup_claim() -> Any:
    """Write a known device_id to .env (re-imaged Pi claiming its prior identity)."""
    body = request.get_json() or {}
    device_id = body.get("device_id", "").strip()
    if not device_id:
        return jsonify({"error": "device_id is required"}), 400

    existing_display_name = os.getenv("DEVICE_DISPLAY_NAME", "")
    _provision.write_device_identity(device_id, existing_display_name, "")

    return jsonify({"device_id": device_id, "display_name": existing_display_name or "claimed"})


if __name__ == "__main__":
    port = int(os.getenv("FLASK_PORT", "5055"))
    app.run(host="0.0.0.0", port=port, debug=False, threaded=True)
