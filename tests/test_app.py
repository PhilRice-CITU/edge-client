from __future__ import annotations

import json
import os
import sys
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

# Ensure src/ is on sys.path and reload app cleanly each test session
_SRC = str(Path(__file__).resolve().parent.parent / "src")
if _SRC not in sys.path:
    sys.path.insert(0, _SRC)


@pytest.fixture(autouse=True)
def reset_modules(tmp_path, monkeypatch):
    sessions_dir = tmp_path / "sessions"
    sessions_dir.mkdir()
    monkeypatch.setenv("SESSIONS_DIR", str(sessions_dir))
    monkeypatch.setenv("DEVICE_ID", "pi-test")
    monkeypatch.setenv("API_BASE_URL", "http://localhost:9999")
    for mod in ("session_manager", "app"):
        sys.modules.pop(mod, None)
    yield
    for mod in ("session_manager", "app"):
        sys.modules.pop(mod, None)


@pytest.fixture
def client():
    import app as flask_app  # noqa: PLC0415 — intentional late import after env setup

    flask_app.app.config["TESTING"] = True
    with flask_app.app.test_client() as c:
        yield c


# ── Health / status ──────────────────────────────────────────────────────────


def test_health_returns_ok(client):
    resp = client.get("/health")
    assert resp.status_code == 200
    assert resp.get_json() == {"status": "ok"}


def test_status_returns_device_info(client):
    resp = client.get("/status")
    assert resp.status_code == 200
    data = resp.get_json()
    assert data["device_id"] == "pi-test"
    assert "edge_mode" in data


# ── Session endpoints ────────────────────────────────────────────────────────


def test_post_sessions_returns_201(client):
    resp = client.post(
        "/sessions",
        data=json.dumps({"mode": "grading", "operator_name": "Juan", "rice_variety": None}),
        content_type="application/json",
    )
    assert resp.status_code == 201
    data = resp.get_json()
    assert data["mode"] == "grading"
    assert "id" in data


def test_get_session_returns_404_for_unknown_id(client):
    resp = client.get("/sessions/does-not-exist")
    assert resp.status_code == 404


def test_get_session_returns_session_after_creation(client):
    create_resp = client.post(
        "/sessions",
        data=json.dumps({"mode": "grading", "operator_name": "Maria"}),
        content_type="application/json",
    )
    session_id = create_resp.get_json()["id"]
    resp = client.get(f"/sessions/{session_id}")
    assert resp.status_code == 200
    assert resp.get_json()["id"] == session_id


def test_patch_session_updates_operator_name(client):
    create_resp = client.post(
        "/sessions",
        data=json.dumps({"mode": "grading", "operator_name": "Old"}),
        content_type="application/json",
    )
    session_id = create_resp.get_json()["id"]
    resp = client.patch(
        f"/sessions/{session_id}",
        data=json.dumps({"operator_name": "New"}),
        content_type="application/json",
    )
    assert resp.status_code == 200
    assert resp.get_json()["operator_name"] == "New"


def test_patch_session_returns_404_for_unknown_id(client):
    resp = client.patch(
        "/sessions/ghost-id",
        data=json.dumps({"operator_name": "X"}),
        content_type="application/json",
    )
    assert resp.status_code == 404


def test_capture_returns_404_for_unknown_session(client):
    resp = client.post("/sessions/ghost-id/capture")
    assert resp.status_code == 404


def test_capture_returns_500_when_script_fails(client, tmp_path):
    import subprocess

    create_resp = client.post(
        "/sessions",
        data=json.dumps({"mode": "grading"}),
        content_type="application/json",
    )
    session_id = create_resp.get_json()["id"]

    mock_result = MagicMock()
    mock_result.returncode = 1
    mock_result.stderr = "camera not found"
    mock_result.stdout = ""

    with patch("subprocess.run", return_value=mock_result):
        resp = client.post(f"/sessions/{session_id}/capture")
    assert resp.status_code == 500


def test_submit_returns_400_with_no_batches(client):
    create_resp = client.post(
        "/sessions",
        data=json.dumps({"mode": "grading"}),
        content_type="application/json",
    )
    session_id = create_resp.get_json()["id"]
    resp = client.post(f"/sessions/{session_id}/submit")
    assert resp.status_code == 400
    assert "no batches" in resp.get_json()["error"]
