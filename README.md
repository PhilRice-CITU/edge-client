# Rice Vision — Edge Client

The complete runtime for the Rice Vision grading device. Ships on a Raspberry Pi with a touchscreen, camera module, relay-controlled IR/white LEDs, and a physical capture button.

If you are handing this repo to someone else, start with [EDGE_CLIENT_HANDOFF.md](EDGE_CLIENT_HANDOFF.md).

---

## Quick Start (Developer Laptop)

You do **not** need a Raspberry Pi to work on most of this code. The Flask API, session manager, upload queue, and the entire Electron UI all run on macOS/Linux.

```bash
# 1. Clone and enter
cd edge-client

# 2. Python backend
python3 -m venv .venv
source .venv/bin/activate
pip install flask requests

# 3. Create your env file
cp .env.example .env
# Edit .env — at minimum set DEVICE_ID and API_BASE_URL

# 4. Start the local Flask API
python3 src/app.py
# → runs on http://127.0.0.1:5055

# 5. Electron UI (separate terminal)
cd electron-app
npm install
npm run dev
# → opens the kiosk UI connecting to Flask on port 5055
```

### Verify it works

```bash
# Flask health
curl http://localhost:5055/health
# → {"status":"ok"}

# Device status (what the Electron UI polls)
curl http://localhost:5055/status
# → {"device_id":"pi-001","edge_mode":"production","images_on_disk":0,"queued_uploads":0}

# Create a session (what "Grade Rice" does)
curl -X POST http://localhost:5055/sessions \
  -H 'Content-Type: application/json' \
  -d '{"mode":"grade","operator_name":"","rice_variety":null}'
# → {"id":"<uuid>","mode":"grade","status":"capturing","batches":[],...}
```

> **Note:** The Capture button will fail on a laptop because `rpicam-still` and `pinctrl` are Pi-only. That is expected. Everything else (session flow, status polling, upload submit) works fine.

---

## Quick Start (Raspberry Pi)

```bash
# 1. Clone the repo
git clone <your-repo-url> ~/rice-vision
cd ~/rice-vision/edge-client

# 2. Run the one-time setup script
chmod +x setup.sh
./setup.sh

# 3. Edit your .env
nano .env
# → Set DEVICE_ID and API_BASE_URL

# 4. Edit rice-vision.service if your username or path differs from pi / /home/pi/rice-vision
nano rice-vision.service

# 5. Start the service
sudo systemctl start rice-vision

# 6. Watch logs
journalctl -u rice-vision -f
```

The `setup.sh` script installs system packages, creates the Python venv, builds the Electron app, copies `.env.example` → `.env`, and registers the systemd unit.

---

## Running Tests

### Electron / React (Vitest)

```bash
cd electron-app
npm test              # single run — 10 files, 39 tests
npm run test:watch    # watch mode
npm run test:coverage # with coverage report
```

### Python (pytest)

```bash
source .venv/bin/activate
pytest tests/ -v      # 2 files, 19 tests
```

### What the tests cover

| Layer    | File                       | Tests                                          |
| -------- | -------------------------- | ---------------------------------------------- |
| Hook     | `useDeviceStatus.test.tsx` | Fetch success, connection error, non-200       |
| Hook     | `useSession.test.tsx`      | Create, update, submit, disabled-when-null     |
| Hook     | `useCapture.test.tsx`      | POST + cache update, error state               |
| Molecule | `CaptureButton.test.tsx`   | Label states, disabled, onClick                |
| Molecule | `StatusBadge.test.tsx`     | Offline, online with device_id                 |
| Organism | `BatchGallery.test.tsx`    | Empty state, card rendering                    |
| Organism | `CameraPreview.test.tsx`   | Image renders, 503 fallback, capture overlay   |
| Organism | `ResultCard.test.tsx`      | Grade display, batch count, dashboard link     |
| Page     | `SplashPage.test.tsx`      | Branding, device_id, timer navigation          |
| Page     | `HomePage.test.tsx`        | Mode buttons, session creation, Flask error    |
| Python   | `test_session_manager.py`  | CRUD, batch append, unknown-id handling        |
| Python   | `test_app.py`              | All Flask endpoints, error codes, mock capture |

---

## Environment Variables

All variables live in `.env` (copied from `.env.example`). The critical ones:

| Variable                      | Default                    | Purpose                                       |
| ----------------------------- | -------------------------- | --------------------------------------------- |
| `DEVICE_ID`                   | `pi-001`                   | Identifies this Pi to the API server          |
| `API_BASE_URL`                | _(required)_               | Cloud API server URL                          |
| `FLASK_PORT`                  | `5055`                     | Port for the local Flask API                  |
| `EDGE_MODE`                   | `production` or `training` | Controls upload destination                   |
| `DEVICE_SECRET`               | _(empty)_                  | Auth token for API server                     |
| `MQTT_HOST`                   | _(required)_               | MQTT broker host                              |
| `MQTT_PORT`                   | `1883`                     | MQTT broker port                              |
| `MQTT_CAMERA_MAX_FRAME_BYTES` | `250000`                   | Drops oversized preview frames before publish |

See [`.env.example`](.env.example) for the full list with comments.

---

## Architecture Overview

```
┌───────────────────────────────────────────────────────┐
│  Touchscreen (Electron Kiosk)                         │
│  React 19 + TanStack Router + TanStack Query          │
│  Polls Flask API on localhost:5055                     │
└─────────────────────┬─────────────────────────────────┘
                      │ HTTP (fetch)
┌─────────────────────▼─────────────────────────────────┐
│  Flask API  (src/app.py)  — port 5055                 │
│  Session CRUD, capture trigger, submit                │
│  │                                                    │
│  ├── src/session_manager.py  (JSON file per session)  │
│  └── scripts/capture.sh --once  (subprocess)          │
└─────────────────────┬─────────────────────────────────┘
                      │ HTTP POST
┌─────────────────────▼─────────────────────────────────┐
│  Cloud API Server  (api-server/)                      │
│  Receives batch scans, runs AI grading.               │
│  Operators check results in web dashboard.            │
└───────────────────────────────────────────────────────┘

Background workers (started by startup.sh):
  ├── src/uploader.py      — polls upload_queue.json, routes to API or Roboflow
  ├── src/mqtt_agent.py    — MQTT presence, telemetry, logs, commands, camera stream
  └── scripts/capture.sh   — GPIO button polling loop (Pi only)
```

---

## Folder Structure

```
edge-client/
├── .env.example           # All environment variables with defaults
├── startup.sh             # Main orchestration — starts all services
├── setup.sh               # One-time Pi installer (apt, venv, npm, systemd)
├── rice-vision.service    # systemd unit file for auto-start on boot
│
├── lib/                   # Bash helper modules (sourced by startup.sh)
│   ├── log.sh             #   Coloured logging: log_info, log_warn, log_error
│   ├── env.sh             #   .env loading + require_vars + apply_defaults
│   ├── lock.sh            #   PID lock file — prevents double-start
│   ├── services.sh        #   start/stop/track background service PIDs
│   └── display.sh         #   X11/Wayland detection + Electron kiosk launch
│
├── scripts/
│   └── capture.sh         # GPIO relay + camera capture (--once for Flask)
│
├── src/                   # Python services
│   ├── app.py             #   Flask API (11 endpoints)
│   ├── session_manager.py #   JSON-backed session CRUD
│   ├── enqueue_capture.py #   CLI: append capture pair to upload queue
│   ├── uploader.py        #   Worker: poll queue → upload_router
│   ├── upload_router.py   #   Routes uploads to API backend or Roboflow
│   ├── event_client.py    #   App-side event writer to local MQTT log queue
│   └── mqtt_agent.py      #   MQTT runtime: live telemetry/commands/logs/camera
│
├── electron-app/          # Touchscreen kiosk UI (see TECHNICAL.md)
│   ├── src/main/          #   Electron main process
│   ├── src/preload/       #   contextBridge (IPC security layer)
│   └── src/renderer/src/  #   React app (Atomic Design)
│
├── tests/                 # Python tests (pytest)
│   ├── test_session_manager.py
│   └── test_app.py
│
└── data/                  # Runtime data (gitignored)
    ├── images/            #   Captured IR + white JPEGs
    ├── sessions/          #   JSON session files
    ├── upload_queue.json  #   Pending uploads
    └── logs/              #   Service log files
```

---

## Common Issues

| Symptom                                 | Cause                                    | Fix                                               |
| --------------------------------------- | ---------------------------------------- | ------------------------------------------------- |
| "Grade Rice" shows Flask error          | Flask not running                        | `source .venv/bin/activate && python3 src/app.py` |
| Capture fails with "camera unavailable" | `rpicam-still` not found (laptop)        | Expected on macOS; camera works on Pi only        |
| Electron shows blank white screen       | `npm run dev` not started                | Run `npm run dev` inside `electron-app/`          |
| `startup.sh` exits immediately          | Missing MQTT/API settings or `DEVICE_ID` | Edit `.env` with valid MQTT broker + API values   |
| Port 5055 already in use                | Another Flask instance running           | `lsof -i :5055` and kill it                       |
| Tests fail with module not found        | Missing dependencies                     | `pip install flask requests` / `npm install`      |

---

## Useful Commands

```bash
# Flask API only
source .venv/bin/activate && python3 src/app.py

# Electron dev mode (hot reload)
cd electron-app && npm run dev

# Full stack on Pi
bash startup.sh

# Full stack via systemd
sudo systemctl start rice-vision
journalctl -u rice-vision -f

# Run all tests
cd electron-app && npm test
cd .. && .venv/bin/pytest tests/ -v
```
