import os
from pathlib import Path
from typing import Dict

import requests


def _log(message: str) -> None:
    print(f"[training_uploader] {message}", flush=True)


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
        f"roboflow upload workspace={workspace} dataset={dataset_name} "
        f"normal_project={project_normal} ir_project={project_ir}"
    )

    ok_raw = _upload_file_to_roboflow(
        workspace, api_key, dataset_name, raw_path, suffix="raw",
        project_normal=project_normal, project_ir=project_ir,
    )
    ok_ir = _upload_file_to_roboflow(
        workspace, api_key, dataset_name, ir_path, suffix="ir",
        project_normal=project_normal, project_ir=project_ir,
    )
    return ok_raw and ok_ir


def _select_roboflow_project(file_path: Path, suffix: str, project_normal: str, project_ir: str) -> str:
    filename = file_path.name.upper()
    if filename.startswith("IR_"):
        return project_ir
    if filename.startswith("WHITE_"):
        return project_normal
    return project_ir if suffix == "ir" else project_normal


def _upload_file_to_roboflow(
    workspace: str,
    api_key: str,
    dataset_name: str,
    file_path: Path,
    suffix: str,
    project_normal: str,
    project_ir: str,
) -> bool:
    _ = dataset_name
    image_name = file_path.name
    target_project = _select_roboflow_project(file_path, suffix, project_normal, project_ir)
    endpoint_candidates = [
        f"https://api.roboflow.com/dataset/{workspace}/{target_project}/upload",
        f"https://api.roboflow.com/dataset/{target_project}/upload",
        f"https://api.roboflow.com/{workspace}/{target_project}/upload",
    ]
    query_params = {"api_key": api_key, "name": image_name}

    response = None
    used_endpoint = ""
    candidate_response = None
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
            continue

        response = candidate_response
        used_endpoint = endpoint
        break

    if response is None:
        response = candidate_response
        used_endpoint = endpoint_candidates[-1]

    accepted = response.ok
    details = ""
    try:
        payload = response.json()
        if isinstance(payload, dict):
            if payload.get("error"):
                accepted = False
            elif "success" in payload:
                accepted = bool(payload.get("success"))
        details = str(payload)[:300]
    except ValueError:
        details = response.text[:300]
        if "endpoint not found" in details.lower():
            accepted = False

    if not accepted:
        _log(
            f"roboflow upload FAILED status={response.status_code} "
            f"project={target_project} file={file_path.name} endpoint={used_endpoint} response={details}"
        )
    else:
        _log(
            f"roboflow upload OK status={response.status_code} "
            f"project={target_project} file={file_path.name} endpoint={used_endpoint}"
        )
    return accepted
