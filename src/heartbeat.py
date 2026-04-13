import os
import shutil
import time
from pathlib import Path
from typing import Optional

import requests

API_BASE_URL = os.getenv("API_BASE_URL", "").rstrip("/")
API_HEARTBEAT_PATH = os.getenv("API_HEARTBEAT_PATH", "/devices/heartbeat")
DEVICE_ID = os.getenv("DEVICE_ID", "pi-001")
INTERVAL = int(os.getenv("HEARTBEAT_INTERVAL_SECONDS", "60"))
TIMEOUT = int(os.getenv("API_TIMEOUT_SECONDS", "30"))
QUEUE_FILE = Path(os.getenv("QUEUE_FILE", str(Path(__file__).resolve().parent.parent / "data" / "upload_queue.json")))


def _read_queue_depth() -> Optional[int]:
    if not QUEUE_FILE.exists():
        return 0
    try:
        import json

        data = json.loads(QUEUE_FILE.read_text())
        if isinstance(data, list):
            return len(data)
    except Exception:
        return None
    return None


def _read_memory_percent() -> Optional[float]:
    try:
        mem_total = None
        mem_available = None
        with open("/proc/meminfo", "r", encoding="utf-8") as meminfo:
            for line in meminfo:
                if line.startswith("MemTotal:"):
                    mem_total = float(line.split()[1])
                elif line.startswith("MemAvailable:"):
                    mem_available = float(line.split()[1])
        if not mem_total or mem_available is None:
            return None
        used_percent = ((mem_total - mem_available) / mem_total) * 100
        return round(max(min(used_percent, 100.0), 0.0), 2)
    except Exception:
        return None


def _read_cpu_percent() -> Optional[float]:
    try:
        load_1m = os.getloadavg()[0]
        cpu_count = os.cpu_count() or 1
        cpu_percent = (load_1m / cpu_count) * 100
        return round(max(min(cpu_percent, 100.0), 0.0), 2)
    except Exception:
        return None


def _read_storage_percent() -> Optional[float]:
    try:
        usage = shutil.disk_usage("/")
        if usage.total <= 0:
            return None
        return round((usage.used / usage.total) * 100, 2)
    except Exception:
        return None


def _read_temperature_celsius() -> Optional[float]:
    try:
        with open("/sys/class/thermal/thermal_zone0/temp", "r", encoding="utf-8") as handle:
            milli_c = float(handle.read().strip())
        return round(milli_c / 1000.0, 2)
    except Exception:
        return None


def _collect_telemetry() -> dict:
    return {
        "cpu_percent": _read_cpu_percent(),
        "memory_percent": _read_memory_percent(),
        "storage_percent": _read_storage_percent(),
        "temperature_celsius": _read_temperature_celsius(),
        "queue_depth": _read_queue_depth(),
    }


def post_heartbeat() -> None:
    if not API_BASE_URL:
        return

    telemetry = _collect_telemetry()
    requests.post(
        f"{API_BASE_URL}{API_HEARTBEAT_PATH}",
        json={"device_id": DEVICE_ID, "status": "online", **telemetry},
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
