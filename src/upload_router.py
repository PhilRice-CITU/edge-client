import os
from pathlib import Path
from typing import Dict, Tuple

import requests


def _edge_mode() -> str:
    return os.getenv("EDGE_MODE", "production").strip().lower()


def _target_for_mode(mode: str) -> str:
    if mode == "training":
        return os.getenv("TRAINING_UPLOAD_TARGET", "roboflow").strip().lower()
    return os.getenv("PRODUCTION_UPLOAD_TARGET", "api").strip().lower()


def resolve_upload_target() -> Tuple[str, str]:
    mode = _edge_mode()
    if mode not in {"production", "training"}:
        raise ValueError(f"Invalid EDGE_MODE: {mode}")

    target = _target_for_mode(mode)
    if target not in {"api", "roboflow"}:
        raise ValueError(f"Invalid upload target: {target}")

    return mode, target


def upload_to_api(item: Dict) -> bool:
    base_url = os.getenv("API_BASE_URL", "").rstrip("/")
    path = os.getenv("API_UPLOAD_PATH", "/scans")
    timeout = int(os.getenv("API_TIMEOUT_SECONDS", "30"))

    if not base_url:
        raise ValueError("API_BASE_URL is required for API uploads")

    raw_path = Path(item["raw"])
    ir_path = Path(item["ir"])

    if not raw_path.exists() or not ir_path.exists():
        raise FileNotFoundError("Capture files not found for API upload")

    files = {
        "raw": open(raw_path, "rb"),
        "ir": open(ir_path, "rb"),
    }
    data = {
        "device_id": item.get("device_id", ""),
        "session_id": item.get("session_id", ""),
        "captured_at": item.get("captured_at", ""),
        "mode": "production",
    }

    try:
        response = requests.post(f"{base_url}{path}", files=files, data=data, timeout=timeout)
        return response.ok
    finally:
        files["raw"].close()
        files["ir"].close()


def upload_to_roboflow(item: Dict) -> bool:
    api_key = os.getenv("ROBOFLOW_API_KEY", "").strip()
    workspace = os.getenv("ROBOFLOW_WORKSPACE", "").strip()
    project = os.getenv("ROBOFLOW_PROJECT", "").strip()
    dataset_name = os.getenv("ROBOFLOW_DATASET_NAME", "edge-captures").strip()

    if not api_key or not workspace or not project:
        raise ValueError("ROBOFLOW_API_KEY, ROBOFLOW_WORKSPACE, and ROBOFLOW_PROJECT are required")

    # Simple upload endpoint pattern for dataset ingestion. Adjust to your exact Roboflow API version.
    endpoint = (
        f"https://api.roboflow.com/dataset/{workspace}/{project}/upload"
        f"?api_key={api_key}&name={dataset_name}"
    )

    raw_path = Path(item["raw"])
    ir_path = Path(item["ir"])

    if not raw_path.exists() or not ir_path.exists():
        raise FileNotFoundError("Capture files not found for Roboflow upload")

    # Upload both images as separate entries with stable names.
    ok_raw = _upload_file_to_roboflow(endpoint, raw_path, item, suffix="raw")
    ok_ir = _upload_file_to_roboflow(endpoint, ir_path, item, suffix="ir")
    return ok_raw and ok_ir


def _upload_file_to_roboflow(endpoint: str, file_path: Path, item: Dict, suffix: str) -> bool:
    image_name = f"{item.get('device_id', 'device')}_{item.get('session_id', 'session')}_{suffix}.jpg"

    with open(file_path, "rb") as file_obj:
        response = requests.post(
            endpoint,
            files={"file": (image_name, file_obj, "image/jpeg")},
            timeout=int(os.getenv("API_TIMEOUT_SECONDS", "30")),
        )
    return response.ok


def upload_item(item: Dict) -> bool:
    mode, target = resolve_upload_target()

    if target == "api":
        return upload_to_api(item)

    if target == "roboflow":
        return upload_to_roboflow(item)

    raise ValueError(f"Unsupported target {target} in mode {mode}")
