from __future__ import annotations

import json
import os

import pytest

# Override SESSIONS_DIR to a temp dir before importing session_manager
@pytest.fixture(autouse=True)
def sessions_dir(tmp_path, monkeypatch):
    sessions = tmp_path / "sessions"
    sessions.mkdir()
    monkeypatch.setenv("SESSIONS_DIR", str(sessions))
    # Reload the module so SESSIONS_DIR picks up the new env var
    import importlib
    import sys

    if "session_manager" in sys.modules:
        del sys.modules["session_manager"]
    yield sessions


@pytest.fixture
def sm():
    import importlib
    import sys

    if "session_manager" in sys.modules:
        del sys.modules["session_manager"]

    # Ensure src/ is on sys.path
    src_dir = os.path.join(os.path.dirname(__file__), "..", "src")
    sys.path.insert(0, src_dir)
    import session_manager

    return session_manager


def test_create_session_returns_session_dict(sm, sessions_dir):
    session = sm.create_session("grading", "Juan", "Sinandomeng")
    assert session["mode"] == "grading"
    assert session["operator_name"] == "Juan"
    assert session["rice_variety"] == "Sinandomeng"
    assert session["status"] == "capturing"
    assert session["batches"] == []
    assert "id" in session


def test_create_session_writes_json_file(sm, sessions_dir):
    session = sm.create_session("training")
    path = sessions_dir / f"{session['id']}.json"
    assert path.exists()
    on_disk = json.loads(path.read_text())
    assert on_disk["id"] == session["id"]


def test_get_session_returns_none_for_unknown_id(sm):
    result = sm.get_session("does-not-exist")
    assert result is None


def test_get_session_returns_existing_session(sm):
    session = sm.create_session("grading")
    loaded = sm.get_session(session["id"])
    assert loaded is not None
    assert loaded["id"] == session["id"]


def test_update_session_patches_allowed_fields(sm):
    session = sm.create_session("grading", operator_name="Old Name")
    updated = sm.update_session(session["id"], operator_name="New Name", rice_variety="IR64")
    assert updated is not None
    assert updated["operator_name"] == "New Name"
    assert updated["rice_variety"] == "IR64"


def test_update_session_returns_none_for_unknown_id(sm):
    result = sm.update_session("ghost-id", operator_name="No One")
    assert result is None


def test_append_batch_increments_batch_number(sm):
    session = sm.create_session("grading")
    sm.append_batch(session["id"], "/tmp/ir1.jpg", "/tmp/white1.jpg")
    updated = sm.append_batch(session["id"], "/tmp/ir2.jpg", "/tmp/white2.jpg")
    assert updated is not None
    assert len(updated["batches"]) == 2
    assert updated["batches"][0]["batch_number"] == 1
    assert updated["batches"][1]["batch_number"] == 2


def test_append_batch_stores_correct_paths(sm):
    session = sm.create_session("grading")
    updated = sm.append_batch(session["id"], "/tmp/ir.jpg", "/tmp/white.jpg")
    assert updated is not None
    batch = updated["batches"][0]
    assert batch["ir_path"] == "/tmp/ir.jpg"
    assert batch["white_path"] == "/tmp/white.jpg"


def test_append_batch_returns_none_for_unknown_session(sm):
    result = sm.append_batch("ghost-id", "/tmp/ir.jpg", "/tmp/white.jpg")
    assert result is None
