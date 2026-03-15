# Edge Client: What We Use and How Everything Works Together

This guide explains the Edge Client in simple terms.

## 1) What the Edge Client is

The Edge Client is the software that runs on the Raspberry Pi device.
Its job is to:
- capture rice sample images,
- show a kiosk UI on the touchscreen,
- send data to the cloud API,
- keep running reliably even if one process fails.

## 2) Folder structure and purpose

```text
edge-client/
├── lib/                  # shared Bash helper modules (logging, env, lock, display, services)
├── src/                  # Python services (Flask API, uploader, heartbeat, queue manager)
├── scripts/              # capture scripts called by Python (camera capture)
├── electron/             # local kiosk UI (Electron main/preload/renderer)
│   └── renderer/         # HTML/CSS/JS user interface files
├── data/
│   ├── images/           # captured images waiting for upload
│   └── logs/             # local logs (optional, can also use /tmp/logs)
└── ansible/              # provisioning/deployment automation files
```

## 3) Main technologies used

- Bash: boot orchestration and process management (`startup.sh`, helper modules in `lib/`).
- Python: edge backend services in `src/`.
- Flask: local HTTP API on the Pi (`localhost`, default port 5000).
- Electron: touchscreen kiosk application and user flow.
- Camera stack (Picamera2): image capture pipeline from the Pi camera.
- HTTPS API calls: uploader/heartbeat communication with cloud backend.

## 4) How orchestration works (startup order)

When the device starts, `startup.sh` orchestrates everything in this order:

1. Initialize paths, logging, and runtime directories.
2. Load shared modules from `lib/`.
3. Acquire a lock so only one instance runs.
4. Load and validate environment variables from `.env`.
5. Start Flask service (`src/app.py`) and wait for health check success.
6. Start uploader service (`src/uploader.py`) for background upload work.
7. Start heartbeat service (`src/heartbeat.py`) for device status updates.
8. If a display exists, launch Electron kiosk.
9. Enter supervisor loop to restart Flask if it crashes.

## 5) Runtime interaction between parts

- Electron UI calls local Flask endpoints to trigger actions.
- Flask endpoint triggers `scripts/capture.sh` for camera capture.
- `capture.sh` returns JSON file paths for captured image pair.
- Flask stores metadata and queues files for upload.
- Uploader reads queued files and sends them to cloud API.
- Heartbeat periodically posts device health/status.
- Logs are written by each service for diagnostics.

## 6) End-to-end data flow

1. Operator starts scan on touchscreen.
2. Electron sends request to Flask local API.
3. Flask calls capture script and receives image paths.
4. Flask creates a scan/session record.
5. Uploader sends images + metadata to cloud backend.
6. Cloud processes and stores results.
7. Device can fetch status/result if needed.

## 7) Reliability design

- Lock file prevents duplicate processes.
- Service logs make troubleshooting easier.
- Health checks ensure Flask is ready before UI starts.
- Supervisor loop restarts failed Flask process.
- Background uploader decouples capture from internet speed.

## 8) Quick mental model

Think of the system as three local layers:

- UI layer: Electron (what user touches)
- Local API layer: Flask (local brain/orchestrator)
- Worker layer: capture script + uploader + heartbeat (background jobs)

And one remote layer:

- Cloud API/backend (storage, inference, dashboard data)

If you want, the next step is I can generate starter placeholder files for each module (`startup.sh`, `lib/*.sh`, `src/*.py`, `electron/*`) so your project is immediately runnable with TODO stubs.
