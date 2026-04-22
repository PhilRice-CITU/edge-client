# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Purpose

Complete runtime for the Rice Vision grading device. Ships on a Raspberry Pi with a touchscreen, dual cameras, relay-controlled LEDs, and a physical capture button. Most code can be developed and tested on macOS/Linux without Pi hardware.

## Commands

```bash
# --- Python backend ---
python3 -m venv .venv && source .venv/bin/activate
pip install flask requests
cp .env.example .env    # set DEVICE_ID and API_BASE_URL at minimum
python3 src/app.py      # Flask API on http://127.0.0.1:5055

# --- Electron UI (separate terminal) ---
cd electron-app
npm install
npm run dev             # hot-reload kiosk UI

# --- Verify Flask ---
curl http://localhost:5055/health
curl http://localhost:5055/status

# --- Python tests ---
source .venv/bin/activate
pytest tests/ -v        # 2 files, 19 tests

# --- Electron/React tests ---
cd electron-app
npm test                # 10 files, 39 tests (Vitest)
npm run test:watch
npm run test:coverage

# --- Pi deployment ---
./setup.sh              # one-time: apt, venv, npm build, systemd unit install
sudo systemctl start rice-vision
journalctl -u rice-vision -f
```

**Note**: `rpicam-still` and `pinctrl` (GPIO) only exist on Pi hardware. Camera capture fails on a laptop — everything else works.

## Three-Layer Architecture

```
LAYER 3: Electron (electron-app/)          ← touchscreen kiosk UI
  React 19 + TanStack Router + TanStack Query
  Polls Flask on localhost:5055. Never calls cloud API directly.

LAYER 2: Python services (src/)            ← "the brain"
  Flask API: session CRUD, capture trigger, grade webhooks
  uploader.py: polls upload_queue.json → routes to API or Roboflow
  Session state: one JSON file per session in data/sessions/

LAYER 1: Bash (startup.sh + lib/)          ← boot orchestration
  Starts all services in order, tracks PIDs, handles crashes
  acquire_lock → starts Flask → waits for health → starts workers → launches Electron
```

Each layer is independently testable. Python services run without Electron; Electron runs without Pi hardware.

## Data Flow

1. Operator taps "Grade Rice" → Electron calls `POST /sessions` on Flask
2. Operator presses physical button → `capture.sh --once` runs `rpicam-still` twice (IR + white LED)
3. `enqueue_capture.py` appends image pair to `data/upload_queue.json`
4. `uploader.py` picks up the queue entry → POSTs to cloud `api-server/POST /scans`
5. Cloud API grades the batch → POSTs grade result back to Flask webhook `POST /sessions/{id}/grade`
6. Electron polls `GET /sessions/{id}` → shows result on screen

## Session State

Sessions are stored as JSON files in `data/sessions/`. `session_manager.py` is the only code that reads/writes them — treat it as the single source of truth for session state. There is no database on the edge device.

## Key Files

| File | Role |
|------|------|
| `src/app.py` | Flask API — 11 endpoints, all session/capture/status operations |
| `src/session_manager.py` | JSON-backed session CRUD (the only place sessions are persisted) |
| `src/upload_router.py` | Decides whether to send to cloud API or Roboflow training pipeline |
| `scripts/capture.sh` | GPIO relay control + `rpicam-still` dual capture |
| `startup.sh` | Main orchestrator — do not start services manually in production |
| `lib/env.sh` | `.env` loading; `require_vars` exits if `DEVICE_ID` or `API_BASE_URL` missing |

## Environment Variables

Critical ones (`DEVICE_ID` and `API_BASE_URL` are required — startup fails without them):

| Variable | Purpose |
|----------|---------|
| `DEVICE_ID` | UUID identifying this Pi to the API server |
| `API_BASE_URL` | Cloud API server URL |
| `FLASK_PORT` | Local Flask port (default: 5055) |
| `DEVICE_HOST` | This Pi's LAN IP — used for grade result callbacks |
| `EDGE_MODE` | `production` (upload to API) or `training` (upload to Roboflow) |

## Electron App Structure

`electron-app/src/renderer/src/` follows Atomic Design:
- `components/atoms/`, `molecules/`, `organisms/` — UI primitives
- `pages/` — full page components (`SplashPage`, `HomePage`, etc.)
- `hooks/` — `useDeviceStatus`, `useSession`, `useCapture` (all tested)
- `src/main/` — Electron main process
- `src/preload/` — contextBridge IPC security layer
