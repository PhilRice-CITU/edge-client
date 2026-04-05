from __future__ import annotations

import os
import re
import socket
import sys
import uuid
from pathlib import Path

import requests

_ROOT = Path(__file__).resolve().parent.parent
_ENV_FILE = _ROOT / ".env"


def _read_env() -> dict[str, str]:
    if not _ENV_FILE.exists():
        return {}
    env: dict[str, str] = {}
    for line in _ENV_FILE.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        env[key.strip()] = value.strip()
    return env


def _write_back(device_id: str, display_name: str, qr_url: str) -> None:
    text = _ENV_FILE.read_text() if _ENV_FILE.exists() else ""

    for key, value in (
        ("DEVICE_ID", device_id),
        ("DEVICE_DISPLAY_NAME", display_name),
        ("DEVICE_QR_URL", qr_url),
    ):
        if re.search(rf"^{key}\s*=", text, re.MULTILINE):
            text = re.sub(rf"^{key}\s*=.*$", f"{key}={value}", text, flags=re.MULTILINE)
        else:
            text = text.rstrip("\n") + f"\n{key}={value}\n"

    _ENV_FILE.write_text(text)


def write_device_identity(device_id: str, display_name: str, qr_url: str) -> None:
    """Public entry point — persist provisioned device identity to .env."""
    _write_back(device_id, display_name, qr_url)


def _mac_address() -> str:
    try:
        mac = uuid.getnode()
        return ":".join(f"{(mac >> i) & 0xFF:02x}" for i in range(40, -1, -8))
    except Exception:
        return ""


def _hostname_hint() -> str:
    try:
        return socket.gethostname()
    except Exception:
        return ""


def main() -> None:
    env = _read_env()

    if env.get("DEVICE_ID", "").strip():
        print(f"[provision] DEVICE_ID already set ({env['DEVICE_ID']}), skipping.")
        return

    api_base_url = env.get("API_BASE_URL", "").rstrip("/")
    provision_token = env.get("PROVISION_TOKEN", "").strip()
    region_code = env.get("REGION_CODE", "").strip()

    # REGION_CODE is optional — if absent, skip headless registration and let
    # the Electron setup UI handle provisioning on first boot.
    if not region_code:
        print("[provision] No REGION_CODE set — skipping headless registration (UI will handle it).")
        return

    missing = [k for k, v in [("API_BASE_URL", api_base_url), ("PROVISION_TOKEN", provision_token)] if not v]
    if missing:
        print(f"[provision] ERROR: Missing required .env keys: {', '.join(missing)}", file=sys.stderr)
        sys.exit(1)

    print(f"[provision] No DEVICE_ID found — registering with {api_base_url} ...")

    try:
        resp = requests.post(
            f"{api_base_url}/devices/provision",
            json={
                "provision_token": provision_token,
                "region_code": region_code,
                "display_name_hint": _hostname_hint(),
                "mac_address": _mac_address(),
                "hostname": _hostname_hint(),
            },
            timeout=15,
        )
        resp.raise_for_status()
    except requests.RequestException as exc:
        print(f"[provision] ERROR: Registration failed: {exc}", file=sys.stderr)
        sys.exit(1)

    data = resp.json()
    device_id: str = data["device_id"]
    display_name: str = data["display_name"]
    qr_url: str = data.get("qr_url", "")

    _write_back(device_id, display_name, qr_url)
    print(f"[provision] Registered as '{display_name}' — DEVICE_ID={device_id}")


if __name__ == "__main__":
    main()
