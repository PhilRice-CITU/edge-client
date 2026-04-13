import os
from pathlib import Path
from typing import Dict, Tuple

import requests


def _log(message: str) -> None:
    print(f"[upload_router] {message}", flush=True)


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
        if not response.ok:
            _log(
                f"api upload failed status={response.status_code} "
                f"session={item.get('session_id', 'unknown')}"
            )
        return response.ok
    finally:
        files["raw"].close()
        files["ir"].close()


def upload_to_roboflow(item: Dict) -> bool:
    api_key = os.getenv("ROBOFLOW_API_KEY", "").strip()
    workspace = os.getenv("ROBOFLOW_WORKSPACE", "").strip()
    legacy_project = os.getenv("ROBOFLOW_PROJECT", "").strip()
    project_normal = os.getenv("ROBOFLOW_PROJECT_NORMAL", "").strip() or legacy_project
    project_ir = os.getenv("ROBOFLOW_PROJECT_IR", "").strip() or legacy_project
    dataset_name = os.getenv("ROBOFLOW_DATASET_NAME", "edge-captures").strip()

    if not api_key or not workspace:
        raise ValueError("ROBOFLOW_API_KEY and ROBOFLOW_WORKSPACE are required")
    if not project_normal or not project_ir:
        raise ValueError(
            "ROBOFLOW_PROJECT_NORMAL and ROBOFLOW_PROJECT_IR are required "
            "(or set legacy ROBOFLOW_PROJECT for both)"
        )

    raw_path = Path(item["raw"])
    ir_path = Path(item["ir"])

    if not raw_path.exists() or not ir_path.exists():
        raise FileNotFoundError("Capture files not found for Roboflow upload")

    _log(
        f"roboflow upload session={item.get('session_id', 'unknown')} "
        f"workspace={workspace} dataset={dataset_name} "
        f"normal_project={project_normal} ir_project={project_ir}"
    )

    # Upload both images as separate entries, routing WHITE/raw and IR to different projects.
    ok_raw = _upload_file_to_roboflow(
        workspace,
        api_key,
        dataset_name,
        raw_path,
        item,
        suffix="raw",
        project_normal=project_normal,
        project_ir=project_ir,
    )
    ok_ir = _upload_file_to_roboflow(
        workspace,
        api_key,
        dataset_name,
        ir_path,
        item,
        suffix="ir",
        project_normal=project_normal,
        project_ir=project_ir,
    )
    return ok_raw and ok_ir


def _select_roboflow_project(file_path: Path, suffix: str, project_normal: str, project_ir: str) -> str:
    filename = file_path.name.upper()

    if filename.startswith("IR_"):
        return project_ir
    if filename.startswith("WHITE_"):
        return project_normal

    # Fallback to queue field semantics when prefixes are unavailable.
    if suffix == "ir":
        return project_ir
    return project_normal


def _upload_file_to_roboflow(
    workspace: str,
    api_key: str,
    dataset_name: str,
    file_path: Path,
    item: Dict,
    suffix: str,
    project_normal: str,
    project_ir: str,
) -> bool:
    image_name = (
        f"{dataset_name}_{item.get('device_id', 'device')}_"
        f"{item.get('session_id', 'session')}_{suffix}.jpg"
    )
    target_project = _select_roboflow_project(file_path, suffix, project_normal, project_ir)
    endpoint_candidates = [
        f"https://api.roboflow.com/dataset/{workspace}/{target_project}/upload",
        f"https://api.roboflow.com/dataset/{target_project}/upload",
        f"https://api.roboflow.com/{workspace}/{target_project}/upload",
    ]
    query_params = {
        "api_key": api_key,
        "name": image_name,
    }

    response = None
    used_endpoint = ""
    for endpoint in endpoint_candidates:
        with open(file_path, "rb") as file_obj:
            candidate_response = requests.post(
                endpoint,
                params=query_params,
                files={"file": (image_name, file_obj, "image/jpeg")},
                timeout=int(os.getenv("API_TIMEOUT_SECONDS", "30")),
            )
        if candidate_response.status_code == 404:
            continue

        payload_error = ""
        try:
            payload = candidate_response.json()
            if isinstance(payload, dict):
                payload_error = str(payload.get("error", "")).strip().lower()
        except ValueError:
            payload_error = candidate_response.text[:200].strip().lower()

        if "endpoint not found" in payload_error:
            # Some invalid Roboflow paths return HTTP 200 with an error payload.
            continue

        response = candidate_response
        used_endpoint = endpoint
        break

    if response is None:
        # Keep the last response for downstream logging/details.
        response = candidate_response
        used_endpoint = endpoint_candidates[-1]

    accepted = response.ok
    details = ""
    try:
        payload = response.json()
        if isinstance(payload, dict):
            # Explicit API error payloads should always be treated as failure.
            if payload.get("error"):
                accepted = False
            elif "success" in payload:
                # Roboflow commonly returns HTTP 200 with a JSON "success" flag.
                accepted = bool(payload.get("success"))
        details = str(payload)[:300]
    except ValueError:
        # Not JSON; keep HTTP status-based acceptance and capture a small body preview.
        details = response.text[:300]
        if "endpoint not found" in details.lower():
            accepted = False

    if not accepted:
        _log(
            f"roboflow file upload failed status={response.status_code} "
            f"project={target_project} file={file_path.name} image_name={image_name} "
            f"endpoint={used_endpoint} response={details}"
        )
    else:
        _log(
            f"roboflow file upload accepted status={response.status_code} "
            f"project={target_project} file={file_path.name} image_name={image_name} "
            f"endpoint={used_endpoint} response={details}"
        )
    return accepted


def upload_item(item: Dict) -> bool:
    mode, target = resolve_upload_target()
    _log(
        f"route mode={mode} target={target} "
        f"session={item.get('session_id', 'unknown')}"
    )

    if target == "api":
        return upload_to_api(item)

    if target == "roboflow":
        return upload_to_roboflow(item)

    raise ValueError(f"Unsupported target {target} in mode {mode}")
