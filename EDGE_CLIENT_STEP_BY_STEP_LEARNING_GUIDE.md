# Edge Client Step-by-Step Learning Guide

This guide is written so you can type the project manually and understand each part.

You asked for three things:
1. The order of what to build first
2. Why each code file is needed
3. What important lines mean and why they matter

This document gives you all three.

## 1) Big Picture First

The Edge Client is one local system with 4 layers:

1. Boot and orchestration layer (Bash)
2. Local API layer (Python Flask)
3. Background worker layer (uploader, heartbeat, queue manager)
4. Touchscreen UI layer (Electron)

Flow summary:
- User taps in Electron UI
- Electron calls local Flask API
- Flask triggers camera capture script
- Captured images are queued for upload
- Uploader sends to cloud backend
- Heartbeat reports device health periodically

You are building a reliable local mini-platform, not just one script.

## 2) Build Order (Important)

Build in this exact order so dependencies are always ready.

1. Project skeleton folders
2. Environment and logging foundation
3. Process lock and service manager
4. Capture script and minimal Flask app
5. Uploader and heartbeat workers
6. Electron app shell
7. Startup orchestrator script
8. Provision script and optional Ansible files
9. End-to-end local test

Why this order:
- If logging/env is missing, everything is hard to debug.
- If Flask is not stable first, Electron has nothing to talk to.
- If startup orchestration comes too early, you will debug too many things at once.

## 2.1) Current Progress Status (March 16, 2026)

The project is no longer only templates. These are the real status markers.

Done now:
- [x] Project folder skeleton
- [x] `.gitignore`
- [x] `.env.example` with mode-based upload routing vars
- [x] `lib/log.sh`
- [x] `lib/env.sh`
- [x] `lib/lock.sh`
- [x] `lib/services.sh`
- [x] `lib/display.sh` (safe headless behavior)
- [x] `scripts/capture.sh` using button + relay + `rpicam-still`
- [x] `src/uploader.py` with queue + retry
- [x] `src/upload_router.py` for production/training destination routing
- [x] `src/enqueue_capture.py` queue writer
- [x] `src/app.py` local status API (`/health`, `/mode`, `/queue-size`, `/status`)
- [x] `src/heartbeat.py`
- [x] `startup.sh` full service orchestration

Pending by choice (for your manual learning):
- [ ] Electron app files (`electron/*`)
- [ ] `provision.sh`
- [ ] `ansible/inventory.ini`
- [ ] `ansible/playbook.yml`

Why this is already meaningful progress:
- The core backend pipeline is already running architecture, not mock-only architecture.
- Capture, queue, upload, heartbeat, and boot orchestration are now split by responsibility.
- You can validate most reliability behavior without UI first, which is the best engineering order.

## 2.2) Why We Implemented These First and How They Fit Together

Think of the running system as one event pipeline:

1. `startup.sh` boots everything in controlled order.
2. `lib/*.sh` provides safety features (logs, lock, env defaults, process supervision).
3. `scripts/capture.sh` watches the hardware button forever.
4. On button press, two images are captured (IR then White).
5. `src/enqueue_capture.py` writes one upload job into queue JSON.
6. `src/uploader.py` polls queue and tries to upload each job.
7. `src/upload_router.py` decides destination using mode:
  - `EDGE_MODE=production` -> normally API
  - `EDGE_MODE=training` -> normally Roboflow
8. `src/heartbeat.py` periodically reports liveness to backend.
9. `src/app.py` gives observability endpoints so you can inspect state during testing.

Why this composition is important:
- Capture is real-time and hardware-sensitive, so it must stay minimal and deterministic.
- Upload is network-sensitive, so it must be asynchronous and retryable.
- Routing logic must be centralized so switching modes does not require changing capture code.
- Startup script must be strict so failures happen early and are visible in logs.

## 3) Files You Should Create, in Order

Use this as your typing checklist.

Important note: the sections below remain your learning templates, but the current repository already has several real implementations that evolved beyond the initial starter snippets.

### Phase A: Foundation

- .gitignore
- .env.example
- lib/log.sh
- lib/env.sh
- lib/lock.sh
- lib/services.sh

### Phase B: Core functionality

- scripts/capture.sh
- src/app.py
- src/queue_manager.py
- src/uploader.py
- src/heartbeat.py

### Phase C: UI

- electron/package.json
- electron/main.js
- electron/preload.js
- electron/renderer/index.html
- electron/renderer/styles.css
- electron/renderer/index.js

### Phase D: Startup and deployment

- startup.sh
- provision.sh
- ansible/inventory.ini
- ansible/playbook.yml

## 4) Clean Code Rules for This Project

Follow these rules while typing:

1. One responsibility per file
2. Validate inputs early
3. Fail fast with clear errors
4. Keep functions small and explicit
5. Use consistent naming
6. Keep logs structured and useful
7. Avoid hidden global state
8. Use environment variables, never hardcoded secrets
9. Return predictable JSON contracts from API endpoints
10. Keep shell scripts strict: set -euo pipefail

## 5) Essential Starter Content (Type Manually)

Below are practical starter templates.

## 5.1 .gitignore

Why needed:
- Prevent secrets, runtime data, and dependencies from entering git history.

~~~gitignore
.env
data/
*.pyc
__pycache__/
electron/node_modules/
electron/dist/
~~~

## 5.2 .env.example

Why needed:
- Defines required configuration contract for every environment.

~~~env
DEVICE_ID=pi-001
DEVICE_SECRET=
API_BASE_URL=https://your-api-server.com
FLASK_PORT=5000
DISPLAY_MODE=auto
CAPTURE_WIDTH=1920
CAPTURE_HEIGHT=1080
CAPTURE_QUALITY=90
CAMERA_WARMUP_MS=2000
CAPTURE_DELAY_MS=500
HEARTBEAT_INTERVAL_SECONDS=60
IMAGE_DIR=./data/images
LOG_LEVEL=INFO
LOG_DIR=/tmp/logs
ELECTRON_DEV=false
~~~

## 5.3 lib/log.sh

Why needed:
- Centralized logging for all scripts.
- Keeps console logs and file logs consistent.

~~~bash
#!/bin/bash
[ -n "${_LOG_SH_LOADED:-}" ] && return 0
_LOG_SH_LOADED=1

if [ -t 1 ]; then
    _RED='\033[0;31m'; _GREEN='\033[0;32m'
    _YELLOW='\033[1;33m'; _CYAN='\033[0;36m'
    _DIM='\033[2m'; _NC='\033[0m'
else
    _RED=''; _GREEN=''; _YELLOW=''; _CYAN=''; _DIM=''; _NC=''
fi

LOG_DIR="${LOG_DIR:-/tmp/logs}"
LOG_FILE="${LOG_FILE:-$LOG_DIR/startup.log}"

_log() {
    local level="$1" color="$2"; shift 2
    local ts; ts=$(date '+%Y-%m-%d %H:%M:%S')
    mkdir -p "$LOG_DIR"
    echo -e "${_DIM}${ts}${_NC} ${color}[${level}]${_NC} $*"
    echo "${ts} [${level}] $*" >> "$LOG_FILE"
}

log_info()    { _log "INFO " "$_CYAN"   "$@"; }
log_ok()      { _log "OK   " "$_GREEN"  "$@"; }
log_warn()    { _log "WARN " "$_YELLOW" "$@"; }
log_error()   { _log "ERROR" "$_RED"    "$@"; }
log_section() { _log "-----" "$_DIM" "-- $* --"; }
log_fatal()   { log_error "$@"; exit 1; }
~~~

Line meaning highlights:
- set of color vars: readable console output
- LOG_DIR default /tmp/logs: RAM logging reduces SD wear on Pi
- _log function: single formatting function used by all log levels
- log_fatal exits immediately so broken states do not continue silently

## 5.4 lib/env.sh

Why needed:
- Loads configuration and prevents missing required values at runtime.

~~~bash
#!/bin/bash
[ -n "${_ENV_SH_LOADED:-}" ] && return 0
_ENV_SH_LOADED=1

load_env() {
    local env_file="${1:-$SCRIPT_DIR/.env}"
    [ -f "$env_file" ] || log_fatal ".env not found at $env_file"
    set -o allexport
    source "$env_file"
    set +o allexport
}

require_vars() {
    local missing=0
    for var in "$@"; do
        if [ -z "${!var:-}" ]; then
            log_error "Required variable not set: $var"
            missing=1
        fi
    done
    [ "$missing" -eq 0 ] || log_fatal "Fix missing variables in .env"
}

apply_defaults() {
    : "${FLASK_PORT:=5000}"
    : "${DISPLAY_MODE:=auto}"
    : "${IMAGE_DIR:=$SCRIPT_DIR/data/images}"
    : "${LOG_DIR:=/tmp/logs}"
    : "${HEARTBEAT_INTERVAL_SECONDS:=60}"
}
~~~

Line meaning highlights:
- set -o allexport: exports all loaded vars automatically
- ${!var:-}: indirect expansion used to check variable by name
- : "${VAR:=default}": safe Bash pattern for default assignment

## 5.5 lib/lock.sh

Why needed:
- Prevents two startup processes from running at once.

~~~bash
#!/bin/bash
[ -n "${_LOCK_SH_LOADED:-}" ] && return 0
_LOCK_SH_LOADED=1

LOCK_FILE="${LOCK_FILE:-/tmp/edge-client.lock}"

acquire_lock() {
    if [ -f "$LOCK_FILE" ]; then
        local pid; pid=$(cat "$LOCK_FILE" 2>/dev/null || echo "")
        if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
            log_warn "Already running (PID $pid). Exiting."
            exit 0
        else
            log_warn "Stale lock found. Removing."
            rm -f "$LOCK_FILE"
        fi
    fi
    echo $$ > "$LOCK_FILE"
}

release_lock() {
    rm -f "$LOCK_FILE"
}
~~~

Line meaning highlights:
- kill -0 PID: checks process existence without killing it
- stale lock cleanup avoids permanent startup block after crash
- $$ writes current process ID

## 5.6 lib/services.sh

Why needed:
- Starts Python workers, tracks PIDs, handles shutdown and health wait.

~~~bash
#!/bin/bash
[ -n "${_SERVICES_SH_LOADED:-}" ] && return 0
_SERVICES_SH_LOADED=1

declare -A SERVICE_PIDS

wait_for_flask() {
    local port="${1:-5000}" retries="${2:-20}"
    local i=0
    while [ "$i" -lt "$retries" ]; do
        curl -sf "http://localhost:${port}/health" >/dev/null 2>&1 && return 0
        sleep 1
        i=$((i+1))
    done
    log_fatal "Flask failed health check on port ${port}"
}

start_service() {
    local name="$1" script="$2"; shift 2
    local log_file="${LOG_DIR:-/tmp}/${name}.log"
    python3 "$script" "$@" >> "$log_file" 2>&1 &
    SERVICE_PIDS["$name"]=$!
}

service_alive() {
    local pid="${SERVICE_PIDS[$1]:-}"
    [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null
}

shutdown_all() {
    for name in "${!SERVICE_PIDS[@]}"; do
        local pid="${SERVICE_PIDS[$name]}"
        kill -0 "$pid" 2>/dev/null && kill -TERM "$pid" 2>/dev/null || true
    done
}
~~~

Line meaning highlights:
- declare -A SERVICE_PIDS: map service name to process ID
- $! is PID of last background process
- graceful shutdown uses TERM so process can cleanup

## 5.7 scripts/capture.sh

Why needed:
- Single script contract for image capture.
- Flask calls this as a subprocess and expects JSON output.

~~~bash
#!/bin/bash
set -euo pipefail

DEVICE_ID="${1:?Usage: capture.sh <device_id> <session_id> <output_dir>}"
SESSION_ID="${2:?session_id required}"
OUTPUT_DIR="${3:?output_dir required}"

TIMESTAMP=$(date '+%Y%m%d_%H%M%S')
RAW_PATH="${OUTPUT_DIR}/${DEVICE_ID}_${SESSION_ID}_${TIMESTAMP}_raw.jpg"
IR_PATH="${OUTPUT_DIR}/${DEVICE_ID}_${SESSION_ID}_${TIMESTAMP}_ir.jpg"

mkdir -p "$OUTPUT_DIR"

# Placeholder capture for initial dev on laptop
# Replace with Picamera2 logic on Raspberry Pi
: > "$RAW_PATH"
: > "$IR_PATH"

cat <<JSON
{"raw":"$RAW_PATH","ir":"$IR_PATH","session_id":"$SESSION_ID","device_id":"$DEVICE_ID","captured_at":"$(date -u '+%Y-%m-%dT%H:%M:%SZ')"}
JSON
~~~

Line meaning highlights:
- ${1:?message}: immediate validation for required args
- : > file creates empty file placeholder safely
- heredoc JSON is machine-readable output for app.py

## 5.8 src/queue_manager.py

Why needed:
- Central place for queue operations and retry-safe behavior.

~~~python
from pathlib import Path
import json

QUEUE_FILE = Path("data/upload_queue.json")


def _read_queue():
    if not QUEUE_FILE.exists():
        return []
    return json.loads(QUEUE_FILE.read_text())


def _write_queue(items):
    QUEUE_FILE.parent.mkdir(parents=True, exist_ok=True)
    QUEUE_FILE.write_text(json.dumps(items, indent=2))


def enqueue(item):
    items = _read_queue()
    items.append(item)
    _write_queue(items)


def pop_next():
    items = _read_queue()
    if not items:
        return None
    item = items.pop(0)
    _write_queue(items)
    return item
~~~

Why needed:
- Uploader and Flask should not both invent queue behavior separately.

## 5.9 src/app.py

Why needed:
- Local API for Electron UI and orchestrating capture + queue.

~~~python
from flask import Flask, jsonify, request
from pathlib import Path
import argparse
import json
import subprocess
import uuid

from queue_manager import enqueue

app = Flask(__name__)
IMAGE_DIR = Path("data/images")
DEVICE_ID = "pi-001"


@app.get("/health")
def health():
    return jsonify({"status": "ok"})


@app.post("/capture")
def capture():
    session_id = str(uuid.uuid4())
    cmd = [
        "bash",
        "scripts/capture.sh",
        DEVICE_ID,
        session_id,
        str(IMAGE_DIR),
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        return jsonify({"ok": False, "error": result.stderr.strip()}), 500

    payload = json.loads(result.stdout.strip())
    enqueue(payload)
    return jsonify({"ok": True, "capture": payload})


@app.get("/queue-size")
def queue_size():
    queue_file = Path("data/upload_queue.json")
    if not queue_file.exists():
        return jsonify({"size": 0})
    items = json.loads(queue_file.read_text())
    return jsonify({"size": len(items)})


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=5000)
    parser.add_argument("--image-dir", type=str, default="data/images")
    args = parser.parse_args()

    IMAGE_DIR = Path(args.image_dir)
    IMAGE_DIR.mkdir(parents=True, exist_ok=True)

    app.run(host="0.0.0.0", port=args.port, debug=False)
~~~

Line meaning highlights:
- /health endpoint enables startup health checks
- subprocess.run for capture script keeps camera logic outside Flask route code
- enqueue(payload) decouples capture from cloud upload timing
- app.run host 0.0.0.0 allows local network debugging when needed

## 5.10 src/uploader.py

Why needed:
- Sends queued captures to API in background.
- Keeps UI responsive even on weak internet.

~~~python
import os
import time
import requests

from queue_manager import pop_next

API_BASE_URL = os.getenv("API_BASE_URL", "http://localhost:8000")
INTERVAL_SECONDS = 3


def upload_item(item):
    # Placeholder endpoint and payload shape
    files = {
        "raw": open(item["raw"], "rb"),
        "ir": open(item["ir"], "rb"),
    }
    data = {
        "device_id": item["device_id"],
        "session_id": item["session_id"],
        "captured_at": item["captured_at"],
    }
    try:
        response = requests.post(f"{API_BASE_URL}/scans", files=files, data=data, timeout=30)
        return response.ok
    finally:
        files["raw"].close()
        files["ir"].close()


def main():
    while True:
        item = pop_next()
        if item is None:
            time.sleep(INTERVAL_SECONDS)
            continue

        ok = upload_item(item)
        if not ok:
            # Minimal approach: if failed, place back strategy can be added later
            pass


if __name__ == "__main__":
    main()
~~~

Line meaning highlights:
- Separate upload_item function keeps side effects isolated and testable
- timeout prevents hanging forever on dead network
- file handles always closed in finally

## 5.11 src/heartbeat.py

Why needed:
- Device alive signal for monitoring and fleet health.

~~~python
import os
import time
import requests

API_BASE_URL = os.getenv("API_BASE_URL", "http://localhost:8000")
DEVICE_ID = os.getenv("DEVICE_ID", "pi-001")
INTERVAL = int(os.getenv("HEARTBEAT_INTERVAL_SECONDS", "60"))


def main():
    while True:
        try:
            requests.post(
                f"{API_BASE_URL}/devices/heartbeat",
                json={"device_id": DEVICE_ID, "status": "online"},
                timeout=10,
            )
        except Exception:
            pass
        time.sleep(INTERVAL)


if __name__ == "__main__":
    main()
~~~

## 5.12 Electron files

Why needed:
- This is your local kiosk user interface.

### electron/package.json

~~~json
{
  "name": "edge-client-kiosk",
  "version": "0.1.0",
  "main": "main.js",
  "scripts": {
    "start": "electron ."
  },
  "devDependencies": {
    "electron": "^31.0.0"
  }
}
~~~

### electron/main.js

~~~javascript
const { app, BrowserWindow } = require("electron");
const path = require("path");

const flaskPort = process.env.GRAINSCAN_FLASK_PORT || "5000";
const isDev = (process.env.GRAINSCAN_DEV || "false") === "true";

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    kiosk: !isDev,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.loadFile(path.join(__dirname, "renderer", "index.html"));
  if (isDev) {
    win.webContents.openDevTools({ mode: "detach" });
  }

  win.webContents.on("did-finish-load", () => {
    win.webContents.send("config", { flaskPort });
  });
}

app.whenReady().then(createWindow);
app.on("window-all-closed", () => app.quit());
~~~

Line meaning highlights:
- contextIsolation true and nodeIntegration false are security best practices
- preload acts as controlled bridge to renderer
- kiosk mode only outside dev for easier local debugging

### electron/preload.js

~~~javascript
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("edgeConfig", {
  onConfig: (callback) => ipcRenderer.on("config", (_event, data) => callback(data)),
});
~~~

Why needed:
- Safe, explicit API from Electron main process to browser UI.

### electron/renderer/index.html

~~~html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>Edge Client Kiosk</title>
    <link rel="stylesheet" href="styles.css" />
  </head>
  <body>
    <main>
      <h1>Rice Scanner</h1>
      <button id="captureBtn">Capture</button>
      <pre id="output"></pre>
    </main>
    <script src="index.js"></script>
  </body>
</html>
~~~

### electron/renderer/styles.css

~~~css
:root {
  --bg: #f4f7f1;
  --ink: #1e2a1b;
  --accent: #2f6f3e;
}

body {
  margin: 0;
  font-family: "Segoe UI", sans-serif;
  background: radial-gradient(circle at top, #ffffff, var(--bg));
  color: var(--ink);
}

main {
  max-width: 720px;
  margin: 48px auto;
  padding: 24px;
  background: #ffffff;
  border-radius: 16px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.08);
}

button {
  background: var(--accent);
  border: none;
  color: white;
  padding: 12px 18px;
  border-radius: 10px;
  cursor: pointer;
}
~~~

### electron/renderer/index.js

~~~javascript
let flaskPort = "5000";

window.edgeConfig.onConfig((cfg) => {
  flaskPort = cfg.flaskPort || "5000";
});

const output = document.getElementById("output");
const captureBtn = document.getElementById("captureBtn");

captureBtn.addEventListener("click", async () => {
  output.textContent = "Capturing...";
  try {
    const response = await fetch(`http://localhost:${flaskPort}/capture`, {
      method: "POST",
    });
    const data = await response.json();
    output.textContent = JSON.stringify(data, null, 2);
  } catch (error) {
    output.textContent = `Error: ${error.message}`;
  }
});
~~~

Why needed:
- UI stays simple and calls only local Flask endpoint.

## 5.13 startup.sh (Most Important File)

Why needed:
- This is the orchestrator. It defines the full boot lifecycle.

~~~bash
#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LIB_DIR="$SCRIPT_DIR/lib"
APP_DIR="$SCRIPT_DIR/src"

export LOG_DIR="$SCRIPT_DIR/data/logs"
export LOG_FILE="$LOG_DIR/startup.log"
export IMAGE_DIR="$SCRIPT_DIR/data/images"

mkdir -p "$LOG_DIR" "$IMAGE_DIR"

source "$LIB_DIR/log.sh"
source "$LIB_DIR/env.sh"
source "$LIB_DIR/lock.sh"
source "$LIB_DIR/services.sh"

log_section "Lock"
acquire_lock
trap 'release_lock; shutdown_all' EXIT INT TERM

log_section "Environment"
load_env "$SCRIPT_DIR/.env"
require_vars DEVICE_ID API_BASE_URL
apply_defaults

log_section "Flask"
start_service "flask" "$APP_DIR/app.py" --port "${FLASK_PORT:-5000}" --image-dir "$IMAGE_DIR"
wait_for_flask "${FLASK_PORT:-5000}"

log_section "Uploader"
start_service "uploader" "$APP_DIR/uploader.py"

log_section "Heartbeat"
start_service "heartbeat" "$APP_DIR/heartbeat.py"

log_section "Electron"
(
  cd "$SCRIPT_DIR/electron"
  npx electron . --no-sandbox >> "${LOG_DIR}/electron.log" 2>&1 &
)

wait
~~~

Line-by-line explanation:
- set -euo pipefail: strict mode, safer shell behavior
- SCRIPT_DIR block: makes script path-safe regardless of where command is run
- export LOG_DIR/IMAGE_DIR: shared runtime config for child processes
- source lib files: imports reusable functions and keeps startup.sh clean
- acquire_lock: prevents duplicate startup process
- trap line: guarantees cleanup even on Ctrl+C or kill signal
- require_vars: stops boot early if critical config is missing
- start_service for Flask first: all other parts depend on local API
- wait_for_flask: avoid race condition where UI starts before API is ready
- uploader and heartbeat next: background workers after API is alive
- Electron launched in subshell so working directory is correct
- wait: keeps parent script alive and tied to child lifecycle

## 5.14 provision.sh

Why needed:
- One-time setup for dependencies on Raspberry Pi.

~~~bash
#!/bin/bash
set -euo pipefail

sudo apt update
sudo apt install -y python3 python3-pip curl jq age

pip3 install flask requests

cd electron
npm install
~~~

## 6) How to Run in Correct Order (Mac-First, Then Pi)

Yes, you can test a lot on macOS now, but not hardware GPIO/camera parts.

What works on macOS:
- Flask API endpoints (`/health`, `/mode`, `/queue-size`, `/status`)
- Queue writer and uploader logic
- Upload routing logic (API vs Roboflow mode)
- Startup dependency orchestration (except physical camera/button behavior)

What does not work on macOS without Raspberry Pi hardware stack:
- `pinctrl` commands
- `rpicam-still`
- Relay switching and physical button interrupts

### 6.1) Prepare environment

~~~bash
cd edge-client
cp .env.example .env
python3 -m pip install flask requests
~~~

### 6.2) Start only Flask first

~~~bash
python3 src/app.py
~~~

Check endpoints:

~~~bash
curl http://localhost:5000/health
curl http://localhost:5000/mode
curl http://localhost:5000/queue-size
curl http://localhost:5000/status
~~~

### 6.3) Test queue writing manually (Mac-safe)

~~~bash
python3 src/enqueue_capture.py \
  --raw data/images/WHITE_test.jpg \
  --ir data/images/IR_test.jpg \
  --session test-session-1 \
  --device pi-001 \
  --captured-at 2026-03-16T12:00:00Z \
  --queue data/upload_queue.json
~~~

Then inspect queue:

~~~bash
cat data/upload_queue.json
~~~

### 6.4) Test uploader worker

~~~bash
python3 src/uploader.py
~~~

If your API/Roboflow config is placeholder, uploads will fail and retry, which is still useful for validating queue retry behavior.

### 6.5) Full startup test notes

`bash startup.sh` on macOS will start Flask/uploader/heartbeat, but capture service will fail unless Pi commands are available.

For full end-to-end button + camera test, run on Raspberry Pi.

## 7) Common Mistakes and Why They Happen

1. Flask starts but Electron shows fetch error
Reason: wrong port or Flask not ready
Fix: verify /health endpoint and FLASK_PORT

2. startup.sh exits immediately
Reason: strict mode caught an unset variable
Fix: check .env and require_vars list

3. capture endpoint returns script error
Reason: capture.sh arg mismatch or permissions
Fix: run capture.sh manually with 3 args

4. uploader crashes on file open
Reason: placeholder capture files missing
Fix: ensure capture.sh writes valid file paths

## 8) What You Should Learn First (Priority)

If you want fastest progress with deep understanding:

1. startup.sh orchestration lifecycle
2. Flask route to subprocess contract
3. Queue pattern for offline-first behavior
4. Electron preload security model
5. Environment-driven configuration

## 9) Next Learning Upgrade After This

After you manually type these starter files, improve in this order:

1. Add retry/backoff and dead-letter handling in uploader
2. Add structured JSON logging in Python services
3. Add unit tests for queue_manager and app endpoints
4. Add schema validation for capture JSON payload
5. Add systemd service file for auto-start on boot

## 10) Final Notes

You requested clean code and good practice. If you follow this guide exactly:
- responsibilities stay separated,
- orchestration stays predictable,
- runtime failures are observable,
- and scaling to real Pi deployment becomes much easier.

When you finish typing, you can ask for a review and I will check your implementation file by file and point out exact improvements.
