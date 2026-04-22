from __future__ import annotations

import json
import os
import subprocess
from pathlib import Path
from typing import Any

import requests as http
from flask import Flask, Response, jsonify, request
from flask_cors import CORS

from event_client import emit_event
import provision as _provision
import session_manager

app = Flask(__name__)
CORS(app, origins=["http://localhost:5173", "http://127.0.0.1:5173"])

_ROOT = Path(__file__).resolve().parent.parent
QUEUE_FILE = Path(os.getenv("QUEUE_FILE", str(_ROOT / "data" / "upload_queue.json")))
IMAGE_DIR = Path(os.getenv("IMAGE_DIR", str(_ROOT / "data" / "images")))
API_BASE_URL = os.getenv("API_BASE_URL", "http://localhost:3001")
API_TIMEOUT = int(os.getenv("API_TIMEOUT_SECONDS", "30"))
FLASK_PORT = int(os.getenv("FLASK_PORT", "5055"))
DEVICE_HOST = os.getenv("DEVICE_HOST", "127.0.0.1")
CAPTURE_SCRIPT = _ROOT / "scripts" / "capture.sh"


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


def _callback_url(session_id: str) -> str:
    return f"http://{DEVICE_HOST}:{FLASK_PORT}/webhook/result/{session_id}"


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
    try:
        result = subprocess.run(
            [
                "rpicam-still",
                "-o", "-",         # output JPEG bytes to stdout
                "-t", "500",       # capture within 500 ms
                "-n",              # no preview window (headless)
                "--immediate",
                "--width", "640",
                "--height", "480",
            ],
            capture_output=True,
            timeout=5,
        )
        if result.returncode != 0 or not result.stdout:
            return jsonify({"error": "camera unavailable"}), 503
        return Response(result.stdout, mimetype="image/jpeg")
    except (subprocess.TimeoutExpired, FileNotFoundError):
        return jsonify({"error": "camera unavailable"}), 503


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

    try:
        result = subprocess.run(
            ["bash", str(CAPTURE_SCRIPT), "--once"],
            capture_output=True,
            text=True,
            timeout=60,
        )
    except subprocess.TimeoutExpired:
        _emit_grade_event(
            level="ERROR",
            message="grade capture timed out",
            session=session,
            session_id=session_id,
            meta={"timeout_seconds": 60},
        )
        return jsonify({"error": "capture timed out after 60s"}), 504

    if result.returncode != 0:
        _emit_grade_event(
            level="ERROR",
            message="grade capture script failed",
            session=session,
            session_id=session_id,
            meta={
                "return_code": result.returncode,
                "stderr_tail": result.stderr[-500:],
            },
        )
        return jsonify({"error": "capture script failed", "detail": result.stderr[-500:]}), 500

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
        "callback_url": _callback_url(session_id),
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
    session_manager.update_session(session_id, status="submitted", result_id=result_id)
    _emit_grade_event(
        level="INFO",
        message="grade submit accepted",
        session=session,
        session_id=session_id,
        meta={"result_id": result_id},
    )
    return jsonify({"result_id": result_id})


@app.get("/sessions/<session_id>/result")
def session_result(session_id: str) -> Any:
    session = session_manager.get_session(session_id)
    if not session:
        return jsonify({"error": "session not found"}), 404

    return jsonify(
        {
            "status": session["status"],
            "result_id": session.get("result_id"),
            "result_grade": session.get("result_grade"),
            "dashboard_url": session.get("dashboard_url"),
        }
    )


@app.post("/webhook/result/<session_id>")
def webhook_result(session_id: str) -> Any:
    existing = session_manager.get_session(session_id)
    body = request.get_json() or {}
    session_manager.update_session(
        session_id,
        status="graded",
        result_grade=body.get("grade"),
        dashboard_url=body.get("dashboard_url"),
    )
    _emit_grade_event(
        level="INFO",
        message="grade result webhook received",
        session=existing,
        session_id=session_id,
        meta={
            "grade": body.get("grade"),
            "dashboard_url": body.get("dashboard_url"),
        },
    )
    return jsonify({"ok": True})


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
    app.run(host="0.0.0.0", port=port, debug=False)
