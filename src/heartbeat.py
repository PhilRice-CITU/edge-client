import os
import time

import requests

API_BASE_URL = os.getenv("API_BASE_URL", "").rstrip("/")
API_HEARTBEAT_PATH = os.getenv("API_HEARTBEAT_PATH", "/devices/heartbeat")
DEVICE_ID = os.getenv("DEVICE_ID", "pi-001")
INTERVAL = int(os.getenv("HEARTBEAT_INTERVAL_SECONDS", "60"))
TIMEOUT = int(os.getenv("API_TIMEOUT_SECONDS", "30"))


def post_heartbeat() -> None:
    if not API_BASE_URL:
        return

    requests.post(
        f"{API_BASE_URL}{API_HEARTBEAT_PATH}",
        json={"device_id": DEVICE_ID, "status": "online"},
        timeout=TIMEOUT,
    )


def main() -> None:
    while True:
        try:
            post_heartbeat()
        except Exception:
            # Keep heartbeat worker resilient; errors are expected on unstable networks.
            pass

        time.sleep(INTERVAL)


if __name__ == "__main__":
    main()
