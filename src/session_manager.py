from __future__ import annotations

import json
import os
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

_ROOT = Path(__file__).resolve().parent.parent
SESSIONS_DIR = Path(os.getenv("SESSIONS_DIR", str(_ROOT / "data" / "sessions")))


def _session_path(session_id: str) -> Path:
    return SESSIONS_DIR / f"{session_id}.json"


def _load(session_id: str) -> dict[str, Any] | None:
    path = _session_path(session_id)
    if not path.exists():
        return None
    return json.loads(path.read_text())


def _save(session: dict[str, Any]) -> None:
    SESSIONS_DIR.mkdir(parents=True, exist_ok=True)
    _session_path(session["id"]).write_text(json.dumps(session, indent=2))


def create_session(
    mode: str,
    operator_name: str = "",
    rice_variety: str | None = None,
) -> dict[str, Any]:
    session: dict[str, Any] = {
        "id": str(uuid.uuid4()),
        "mode": mode,
        "operator_name": operator_name,
        "rice_variety": rice_variety,
        "batches": [],
        "status": "capturing",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    _save(session)
    return session


def get_session(session_id: str) -> dict[str, Any] | None:
    return _load(session_id)


def update_session(session_id: str, **fields: Any) -> dict[str, Any] | None:
    session = _load(session_id)
    if session is None:
        return None
    session.update(fields)
    _save(session)
    return session


def append_batch(
    session_id: str,
    ir_path: str,
    white_path: str,
) -> dict[str, Any] | None:
    session = _load(session_id)
    if session is None:
        return None
    batch_number = len(session["batches"]) + 1
    session["batches"].append(
        {
            "batch_number": batch_number,
            "ir_path": ir_path,
            "white_path": white_path,
            "captured_at": datetime.now(timezone.utc).isoformat(),
        }
    )
    _save(session)
    return session
