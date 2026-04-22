# Rice Vision Edge Client — Technical Reference

> **Audience:** The developer (you). This document explains every file, every data flow, and every design decision so you can maintain, debug, and extend the edge client without reverse-engineering anything.

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Boot Sequence — What Happens When the Pi Starts](#2-boot-sequence)
3. [Bash Layer — lib/ and startup.sh](#3-bash-layer)
4. [Python Layer — src/](#4-python-layer)
5. [Electron Layer — electron-app/](#5-electron-layer)
6. [Data Flow — End to End](#6-data-flow)
7. [Environment Variables — Complete Reference](#7-environment-variables)
8. [Testing](#8-testing)
9. [Deployment](#9-deployment)
10. [Debugging Guide](#10-debugging-guide)

---

## 1. System Overview

The edge client is three layers stacked on top of each other:

```
┌─────────────────────────────────────────────────────────────────┐
│ LAYER 3: Electron App (TypeScript / React)                      │
│ What the user sees. Touchscreen kiosk UI.                       │
│ Talks ONLY to Flask on localhost. Never to the cloud directly.  │
├─────────────────────────────────────────────────────────────────┤
│ LAYER 2: Python Services (Flask + workers)                      │
│ The "brain." Manages sessions, triggers captures, uploads       │
│ images, reports heartbeat. All state lives on disk as JSON.     │
├─────────────────────────────────────────────────────────────────┤
│ LAYER 1: Bash Orchestration (startup.sh + lib/)                 │
│ The "boot loader." Starts everything in the right order,        │
│ manages PIDs, handles crashes, acquires locks.                  │
└─────────────────────────────────────────────────────────────────┘
```

**Why three layers?** So you can test each one independently:

- Bash scripts work without Python or Node.
- Python services work without Electron.
- Electron UI works without the Pi hardware (just needs Flask running).

---

## 2. Boot Sequence

When `startup.sh` runs (either manually or via systemd), this is the exact order of operations:

```
1.  Set strict mode:  set -euo pipefail
2.  Resolve SCRIPT_DIR  (the edge-client/ folder)
3.  Create directories:  data/logs/, data/images/
4.  Source lib/log.sh    → logging functions available
5.  Source lib/env.sh    → load_env, apply_defaults, require_vars available
6.  Source lib/lock.sh   → acquire_lock, release_lock available
7.  Source lib/services.sh → start_python_service, shutdown_all available
8.  Source lib/display.sh  → ensure_display, launch_kiosk available
9.  acquire_lock          → writes PID to /tmp/edge-client.lock
10. trap 'release_lock; shutdown_all' EXIT INT TERM
11. load_env .env         → exports all .env vars
12. apply_defaults        → fills in missing vars with sensible defaults
13. require_vars DEVICE_ID API_BASE_URL → exits if either is empty
14. start_python_service "flask" src/app.py   → background, PID tracked
15. wait_for_flask 5055   → curl /health in a loop, up to 30 retries
16. start_python_service "uploader" src/uploader.py
17. start_python_service "heartbeat" src/heartbeat.py
18. start_shell_service "capture" scripts/capture.sh
19. ensure_display        → check if X11/Wayland is available
20. launch_kiosk          → cd electron-app && npm run start (if display found)
21. Sleep loop forever    → keeps the script alive so systemd doesn't restart it
```

If any service crashes, the PID disappears. When the main script is killed (Ctrl+C or `systemctl stop`), the EXIT trap fires → `release_lock` removes the lock file → `shutdown_all` sends SIGTERM to every tracked PID.

---

## 3. Bash Layer

### `lib/log.sh` — Logging

Provides five functions:

| Function          | Level | Behaviour                              |
| ----------------- | ----- | -------------------------------------- |
| `log_info "msg"`  | INFO  | Cyan text, also appends to `$LOG_FILE` |
| `log_ok "msg"`    | OK    | Green text                             |
| `log_warn "msg"`  | WARN  | Yellow text                            |
| `log_error "msg"` | ERROR | Red text                               |
| `log_fatal "msg"` | ERROR | Red text, then **`exit 1`**            |

Every call writes to both the terminal (with ANSI colours if TTY is detected) and to the log file at `$LOG_DIR/startup.log`.

`log_section "name"` prints a visual divider: `-- name --`.

### `lib/env.sh` — Environment

Three functions:

- **`load_env "$path"`** — Sources the `.env` file. Uses `set -o allexport` so every line becomes an exported environment variable. Calls `log_fatal` if the file doesn't exist.

- **`apply_defaults`** — Uses the bash `${VAR:=default}` pattern to fill in any variable that wasn't set. This is where defaults like `FLASK_PORT=5000` live.

- **`require_vars VAR1 VAR2 ...`** — Checks each variable is non-empty. If any are missing, logs an error for each one and then calls `log_fatal`.

### `lib/lock.sh` — PID Lock

Prevents two instances of `startup.sh` from running simultaneously.

- **`acquire_lock`** — If `/tmp/edge-client.lock` exists AND the PID inside it is still alive (`kill -0`), exits gracefully. If it's a stale lock (PID dead), removes it and writes the current PID.
- **`release_lock`** — Removes the lock file. Called by the EXIT trap.

### `lib/services.sh` — Process Management

Uses a bash associative array `SERVICE_PIDS` to track every background process.

- **`start_python_service "name" "script.py"`** — Runs `python3 script.py` in the background, redirects stdout/stderr to `$LOG_DIR/name.log`, stores the PID in `SERVICE_PIDS["name"]`.
- **`start_shell_service "name" "script.sh"`** — Same but with `bash`.
- **`wait_for_flask $port`** — Polls `curl http://localhost:$port/health` once per second, up to 30 times. Calls `log_fatal` if it never responds.
- **`service_alive "name"`** — Returns 0 if the named service's PID is still running.
- **`shutdown_all`** — Iterates `SERVICE_PIDS`, sends `SIGTERM` to each alive process.

### `lib/display.sh` — Kiosk Launcher

- **`display_is_available`** — Returns 0 if either `$DISPLAY` or `$WAYLAND_DISPLAY` is set.
- **`ensure_display`** — If no display, tries `startx -- :0 -nocursor` as a fallback (headless Pi with no desktop environment). Returns 1 if truly headless.
- **`launch_kiosk`** — `cd electron-app && npm run start -- --no-sandbox`. Runs in a subshell so it doesn't block the main script. Output goes to `$LOG_DIR/electron.log`.

### `scripts/capture.sh` — Camera + GPIO

This script has **two modes**:

#### Mode 1: `--once` (called by Flask)

When the Electron UI's "Capture" button is pressed:

1. Flask's `/sessions/<id>/capture` endpoint calls `bash capture.sh --once` via `subprocess.run()`.
2. `do_capture()` runs once: relay → IR → `rpicam-still` → relay → white → `rpicam-still`.
3. Prints `{"ir_path":"/path/to/IR.jpg","white_path":"/path/to/WHITE.jpg"}` to stdout.
4. Flask parses this JSON and appends the batch to the session.

#### Mode 2: GPIO loop (default, started by `startup.sh`)

Runs forever. Polls GPIO pin 27 every 100ms. When the physical button is pressed (pin reads LOW):

1. Calls `do_capture()`.
2. Calls `enqueue_capture.py` to add the pair to `upload_queue.json`.
3. Waits for button release (debounce).
4. Ready for next press.

#### Hardware details

| Pin              | Role               | State                              |
| ---------------- | ------------------ | ---------------------------------- |
| GPIO 17 (relay)  | Output push-pull   | `dl` = IR on, `dh` = white on      |
| GPIO 27 (button) | Input with pull-up | `hi` = not pressed, `lo` = pressed |

The `pinctrl` tool is Raspberry Pi OS specific. On macOS, the script will fail at `pinctrl set` — this is expected.

---

## 4. Python Layer

### `src/app.py` — Flask API

The central API that both the Electron UI and the background workers depend on. Runs on port `$FLASK_PORT` (default 5055).

#### Endpoints

| Method  | Path                     | What it does                                                                                                                                          |
| ------- | ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET`   | `/health`                | Returns `{"status":"ok"}`. Used by `wait_for_flask`.                                                                                                  |
| `GET`   | `/mode`                  | Returns `edge_mode`, `production_upload_target`, `training_upload_target`.                                                                            |
| `GET`   | `/queue-size`            | Counts items in `upload_queue.json`.                                                                                                                  |
| `GET`   | `/status`                | Returns `device_id`, `edge_mode`, `images_on_disk`, `queued_uploads`. Polled by Electron every 5 seconds.                                             |
| `GET`   | `/preview/frame`         | Calls `rpicam-still` to grab a single JPEG frame. Returns `image/jpeg` or `503` if camera unavailable. Polled by Electron every 800ms during capture. |
| `POST`  | `/sessions`              | Creates a new grading session. Returns the session JSON with status `"capturing"`.                                                                    |
| `GET`   | `/sessions/<id>`         | Returns the session JSON, or `404`.                                                                                                                   |
| `PATCH` | `/sessions/<id>`         | Updates `operator_name`, `rice_variety`, or `status`.                                                                                                 |
| `POST`  | `/sessions/<id>/capture` | Calls `capture.sh --once`, appends the batch to the session.                                                                                          |
| `POST`  | `/sessions/<id>/submit`  | Reads all batch images from disk, POSTs them to the cloud API's `/scans/batch` endpoint, sets session status to `"submitted"`.                        |

#### Key design decisions

- **Stateless**: Every request reads from disk (session JSON files). No in-memory caches. This means if Flask restarts, all sessions survive.
- **`import requests as http`**: Aliased to avoid conflict with Flask's `request` object.
- **Dashboard-owned results**: After upload submission, grading results are viewed in the web dashboard instead of the kiosk.

### `src/session_manager.py` — Session CRUD

Pure functions that read and write JSON files in `data/sessions/`.

| Function         | Signature                                          | What it does                                                         |
| ---------------- | -------------------------------------------------- | -------------------------------------------------------------------- |
| `create_session` | `(mode, operator_name, rice_variety) → dict`       | Creates a UUID, writes `data/sessions/{uuid}.json`                   |
| `get_session`    | `(session_id) → dict \| None`                      | Reads the JSON file, returns None if missing                         |
| `update_session` | `(session_id, **fields) → dict \| None`            | Patches arbitrary fields and rewrites the file                       |
| `append_batch`   | `(session_id, ir_path, white_path) → dict \| None` | Appends to the `batches` array with auto-incrementing `batch_number` |

Session JSON structure:

```json
{
  "id": "uuid-string",
  "mode": "grade",
  "operator_name": "Juan",
  "rice_variety": "Sinandomeng",
  "batches": [
    {
      "batch_number": 1,
      "ir_path": "/path/to/IR.jpg",
      "white_path": "/path/to/WHITE.jpg",
      "captured_at": "2026-04-05T12:00:00+00:00"
    }
  ],
  "status": "capturing",
  "created_at": "2026-04-05T12:00:00+00:00"
}
```

### `src/enqueue_capture.py` — Queue Writer (CLI)

Used by the GPIO button loop (not by the kiosk UI). Takes `--raw`, `--ir`, `--session`, `--device`, `--captured-at`, `--queue` arguments. Appends a JSON object to `upload_queue.json`.

### `src/uploader.py` — Upload Worker

Long-running daemon started by `startup.sh`. Does this in a loop:

1. Pop the first item from `upload_queue.json`.
2. Call `upload_router.upload_item(item)`.
3. If it fails, increment `retries` and push to the back of the queue.
4. If `retries > MAX_RETRIES` (default 5), drop it (dead-letter).
5. If the queue is empty, sleep for `UPLOADER_POLL_SECONDS` (default 3).

The entire loop body is wrapped in `try/except Exception` so a single bad item can never crash the worker.

### `src/upload_router.py` — Upload Destination Router

Reads `EDGE_MODE` to determine where to send images:

| EDGE_MODE    | Target var                        | Destination                                     |
| ------------ | --------------------------------- | ----------------------------------------------- |
| `production` | `PRODUCTION_UPLOAD_TARGET=api`    | `POST $API_BASE_URL/scans` with multipart files |
| `training`   | `TRAINING_UPLOAD_TARGET=roboflow` | Roboflow upload API                             |

Two upload functions: `upload_to_api(item)` and `upload_to_roboflow(item)`. Both return `True`/`False`.

### `src/heartbeat.py` — Liveness Reporter

Every `HEARTBEAT_INTERVAL_SECONDS` (default 15), POSTs `{"device_id": "...", "status": "online"}` to `$API_BASE_URL/devices/heartbeat`. Swallows all exceptions — it must never crash.

---

## 5. Electron Layer

### Architecture

```
electron-app/
├── src/
│   ├── main/index.ts        ← Electron main process (Node.js)
│   ├── preload/index.ts      ← Bridge between main and renderer
│   └── renderer/src/         ← React app (runs in Chromium)
```

These three folders are **isolated security contexts** enforced by Electron:

| Process                 | Can use                                     | Cannot use               |
| ----------------------- | ------------------------------------------- | ------------------------ |
| **Main** (Node.js)      | `fs`, `child_process`, `electron` APIs      | React, DOM               |
| **Preload** (bridge)    | `contextBridge`, `ipcRenderer`              | Full Node.js, DOM        |
| **Renderer** (Chromium) | React, DOM, `window.api`, `window.electron` | Node.js, `fs`, `require` |

The renderer communicates with the main process ONLY through `window.api` (exposed by the preload script via `contextBridge.exposeInMainWorld`).

### Main Process (`src/main/index.ts`)

What it does:

1. Creates the BrowserWindow. If the primary display is ≤640px wide (Pi touchscreen), enables **kiosk mode** (fullscreen, no frame).
2. Registers two IPC handlers:
   - `open-external` — opens a URL in the system browser (used by the "View on Dashboard" button).
   - `get-flask-url` — returns `http://127.0.0.1:$FLASK_PORT` (so the renderer knows where Flask is).
3. Loads the renderer: Vite dev server URL in development, compiled `index.html` in production.

### Preload (`src/preload/index.ts`)

Exposes two things to `window.api`:

```typescript
api.openExternal(url: string): Promise<void>
api.getFlaskUrl(): Promise<string>
```

The standard Electron toolkit APIs are also exposed on `window.electron`.

Type declarations are in `src/preload/index.d.ts`.

### Renderer (`src/renderer/src/`)

The React application that the user interacts with on the touchscreen.

**Tech stack:**

- React 19
- TypeScript 5.7 (strict mode)
- TanStack Router (client-side routing)
- TanStack Query (data fetching + cache)
- Tailwind CSS v4
- shadcn/ui components
- Lucide React icons

#### File structure (Atomic Design)

```
src/renderer/src/
├── main.tsx                  ← Entry point. Creates QueryClient + RouterProvider.
├── App.tsx                   ← Root layout. Just renders <Outlet />.
├── router.ts                 ← All routes defined. 6 routes total.
│
├── types/session.ts          ← TypeScript types: Session, Batch, DeviceStatus, etc.
├── lib/constants.ts          ← FLASK_BASE_URL, poll intervals, splash duration
├── lib/utils.ts              ← cn() helper for Tailwind class merging
│
├── hooks/
│   ├── useDeviceStatus.ts    ← useQuery: polls GET /status every 5s
│   ├── useSession.ts         ← useQuery + 3 useMutations for session CRUD
│   └── useCapture.ts         ← useMutation: POST /sessions/:id/capture
│
├── components/
│   ├── atoms/                ← Smallest UI primitives
│   │   ├── Button.tsx        ←   cva-styled button with size/variant props
│   │   ├── Badge.tsx         ←   Status badges (success, warning, etc.)
│   │   └── Input.tsx         ←   Styled text input
│   │
│   ├── molecules/            ← Composed from atoms
│   │   ├── KioskButton.tsx   ←   Full-width kiosk-sized button
│   │   ├── StatusBadge.tsx   ←   Shows device_id with green dot, or "Offline"
│   │   ├── BatchCard.tsx     ←   IR + LED placeholder squares for one batch
│   │   ├── BatchNameInput.tsx ←  Wraps Input for operator name
│   │   └── CaptureButton.tsx ←   Camera button with pending state
│   │
│   └── organisms/            ← Composed from molecules
│       ├── BatchGallery.tsx  ←   Grid of BatchCards, empty state fallback
│       ├── CameraPreview.tsx ←   Polls /preview/frame, shows live JPEG stream
│       ├── UploadProgress.tsx ←  Spinner shown during submission
│       └── ResultCard.tsx    ←   Reusable grade card component (not part of kiosk submit flow)
│
└── pages/                    ← Full-screen page components, one per route
    ├── SplashPage.tsx        ←   2s splash + waits for /status, then → /home
    ├── HomePage.tsx          ←   "Grade Rice" / "Training Mode" selection
    ├── SessionPage.tsx       ←   Camera preview + capture + batch gallery + submit
    └── TrainingPage.tsx      ←   Info screen for GPIO training mode
```

#### Routes

| Path                         | Page           | Description                                                          |
| ---------------------------- | -------------- | -------------------------------------------------------------------- |
| `/`                          | —              | Redirects to `/splash`                                               |
| `/splash`                    | `SplashPage`   | Shows branding, polls `/status`, waits 2s, then navigates to `/home` |
| `/home`                      | `HomePage`     | Two big buttons: "Grade Rice" and "Training Mode"                    |
| `/session/$sessionId`        | `SessionPage`  | Camera preview, capture button, batch gallery, submit button         |
| `/training`                  | `TrainingPage` | Shows "GPIO Button Active" notice + queued uploads count             |

#### How the Electron UI talks to Flask

All communication is via `fetch()` to `http://127.0.0.1:5055`. The base URL comes from `lib/constants.ts`.

TanStack Query manages all requests:

- `useQuery` for GET endpoints (automatic polling via `refetchInterval`)
- `useMutation` for POST/PATCH endpoints (with `onSuccess` cache updates)

The UI **never calls the cloud API directly**. It always goes through Flask.

#### How data flows through the kiosk UI

```
User taps "Grade Rice"
  → useCreateSession.mutateAsync({ mode: 'grade' })
  → POST /sessions  → Flask creates session JSON file
  → Navigate to /session/$sessionId

User sees camera preview
  → CameraPreview polls GET /preview/frame every 800ms
  → Flask calls rpicam-still, returns JPEG bytes

User taps "Capture"
  → useCapture.mutate()
  → POST /sessions/$id/capture
  → Flask calls capture.sh --once (subprocess)
  → capture.sh fires relay + camera, returns JSON
  → Flask appends batch to session
  → Query cache updated → BatchGallery re-renders with new card

User taps "Submit for Grading"
  → useUpdateSession.mutateAsync({ operator_name: "..." })
  → useSubmitSession.mutateAsync()
  → POST /sessions/$id/submit
  → Flask reads all batch images from disk
  → Flask POSTs multipart form to API_BASE_URL/scans/batch
  → SessionPage shows "Upload sent" confirmation
  → Operator checks grading result in web dashboard
```

---

## 6. Data Flow — End to End

### Grading flow (kiosk touchscreen)

```
Electron UI → Flask:5055 → capture.sh --once → camera hardware
                         → data/sessions/uuid.json
                         → API server /scans/batch
              ↓
            AI grading
              ↓
            Dashboard displays final result
```

### Training flow (physical button)

```
GPIO button → capture.sh → enqueue_capture.py → data/upload_queue.json
                                                      ↓
                                              uploader.py polls
                                                      ↓
                                              upload_router.py
                                                      ↓
                                              Roboflow API
```

### Heartbeat flow

```
heartbeat.py → POST API_BASE_URL/devices/heartbeat every 60s
             → {"device_id": "pi-001", "status": "online"}
```

---

## 7. Environment Variables — Complete Reference

| Variable                     | Default              | Used by                     | Description                               |
| ---------------------------- | -------------------- | --------------------------- | ----------------------------------------- |
| `DEVICE_ID`                  | `pi-001`             | app.py, heartbeat, capture  | Unique identifier for this Pi             |
| `DEVICE_SECRET`              | _(empty)_            | uploader                    | Auth token (future use)                   |
| `API_BASE_URL`               | _(required)_         | app.py, uploader, heartbeat | Cloud API URL                             |
| `API_UPLOAD_PATH`            | `/scans`             | upload_router               | Path appended to API_BASE_URL for uploads |
| `API_HEARTBEAT_PATH`         | `/devices/heartbeat` | heartbeat                   | Path for heartbeat POSTs                  |
| `API_TIMEOUT_SECONDS`        | `30`                 | upload_router, heartbeat    | HTTP request timeout                      |
| `FLASK_PORT`                 | `5055`               | app.py, Electron main       | Local Flask API port                      |
| `IMAGE_DIR`                  | `./data/images`      | capture.sh, app.py          | Where captured JPEGs are saved            |
| `LOG_DIR`                    | `/tmp/logs`          | all scripts                 | Log file directory                        |
| `EDGE_MODE`                  | `production`         | upload_router, app.py       | `production` or `training`                |
| `PRODUCTION_UPLOAD_TARGET`   | `api`                | upload_router               | Where production scans go                 |
| `TRAINING_UPLOAD_TARGET`     | `roboflow`           | upload_router               | Where training captures go                |
| `ROBOFLOW_API_KEY`           | _(empty)_            | upload_router               | Roboflow auth (training mode)             |
| `ROBOFLOW_WORKSPACE`         | _(empty)_            | upload_router               | Roboflow workspace slug                   |
| `ROBOFLOW_PROJECT`           | _(empty)_            | upload_router               | Roboflow project slug                     |
| `ROBOFLOW_DATASET_NAME`      | `edge-captures`      | upload_router               | Dataset name on Roboflow                  |
| `HEARTBEAT_INTERVAL_SECONDS` | `15`                 | heartbeat                   | Seconds between heartbeat POSTs           |
| `UPLOADER_POLL_SECONDS`      | `3`                  | uploader                    | Seconds between queue polls               |
| `UPLOADER_MAX_RETRIES`       | `5`                  | uploader                    | Max retries before dropping an item       |

---

## 8. Testing

### Electron tests (Vitest + React Testing Library)

Located next to the files they test (co-located pattern). Use `@renderer/*` path alias.

**Stack:** Vitest 4, jsdom, @testing-library/react, @testing-library/user-event, @testing-library/jest-dom.

**Config:** `electron-app/vitest.config.ts` — sets environment to `jsdom`, registers setup file, maps `@renderer/*` alias.

**Setup file:** `electron-app/src/test/setup.ts` — imports jest-dom matchers globally.

**Common patterns used in tests:**

1. **Hook tests** — wrap in `QueryClientProvider` with `retry: false`, mock `fetch` via `vi.stubGlobal`.
2. **Component tests** — `render()` + `screen.getByText()` / `userEvent.click()`.
3. **Page tests** — mock TanStack Router's `useNavigate` and custom hooks via `vi.mock()`.
4. **Mutation assertions** — use `mutateAsync()` return value (not `result.current.data`) because the renderHook ref may be stale.
5. **Fake timers** — `vi.useFakeTimers()` + `vi.runAllTimersAsync()` for splash screen timer tests.

### Python tests (pytest)

Located at `edge-client/tests/`.

**`test_session_manager.py`** — uses `tmp_path` fixture + `monkeypatch.setenv("SESSIONS_DIR")` so each test gets a fresh isolated directory. Tests all CRUD functions.

**`test_app.py`** — uses Flask's `test_client()`. Resets module imports per test (because `session_manager` caches `SESSIONS_DIR` at import time). Tests all HTTP endpoints. Uses `unittest.mock.patch` to mock `subprocess.run` for capture tests.

---

## 9. Deployment

### First-time Pi setup

```bash
git clone <repo-url> ~/rice-vision
cd ~/rice-vision/edge-client
chmod +x setup.sh
./setup.sh
nano .env  # edit DEVICE_ID, API_BASE_URL
```

`setup.sh` does:

1. `apt-get install` system packages (Python3, Node.js, Electron deps) — skipped on non-ARM
2. Creates `.venv`, installs `flask` and `requests`
3. `npm ci` + `npm run build:linux` in `electron-app/`
4. Copies `.env.example` → `.env`
5. Installs `rice-vision.service` to systemd, enables it on boot

### `rice-vision.service` (systemd)

- **User:** `pi` (edit if different)
- **WorkingDirectory:** `/home/pi/rice-vision/edge-client` (edit if different)
- **ExecStart:** `./startup.sh`
- **Restart:** `on-failure` with 5s delay
- **PATH:** Includes `.venv/bin` so Python dependencies work

```bash
# Start / stop / restart
sudo systemctl start rice-vision
sudo systemctl stop rice-vision
sudo systemctl restart rice-vision

# View live logs
journalctl -u rice-vision -f

# Check status
sudo systemctl status rice-vision
```

### Updating code on the Pi

```bash
cd ~/rice-vision
git pull
cd edge-client

# If Python deps changed:
source .venv/bin/activate && pip install flask requests

# If Electron code changed:
cd electron-app && npm ci && npm run build:linux

# Restart the service
sudo systemctl restart rice-vision
```

---

## 10. Debugging Guide

### Flask isn't starting

```bash
source .venv/bin/activate
python3 src/app.py
# → Check the error output
# Common: flask not installed, port in use, .env missing
```

### Camera preview returns 503

This means `rpicam-still` is not available. Either you're on macOS (expected) or the camera module isn't enabled on the Pi.

```bash
# On Pi — check camera:
rpicam-still -o /tmp/test.jpg -t 1000
# If this fails, run: sudo raspi-config → Interface Options → Camera → Enable
```

### Session shows "submitted"

This is expected in upload-only mode. It means the edge device already sent the batch to the API.

Next steps:

1. Check dashboard for grading result.
2. If result is missing there, inspect API server logs for the `/scans` or `/scans/batch` request.

### Upload queue keeps growing

```bash
# Check queue size
curl http://localhost:5055/queue-size

# Check uploader logs
cat data/logs/uploader.log | tail -50

# Common causes:
# - API_BASE_URL is wrong or unreachable
# - ROBOFLOW_API_KEY is empty (training mode)
# - Network is down
```

### Electron UI won't open on Pi

```bash
# Check if a display session exists
echo $DISPLAY
echo $WAYLAND_DISPLAY

# Check the Electron log
cat data/logs/electron.log | tail -50

# Try running manually
cd electron-app
npm run start -- --no-sandbox

# Common causes:
# - No X11 or Wayland session (headless Pi)
# - npm run build:linux wasn't run
# - Missing Electron system dependencies (libgtk, etc.)
```

### Tests are failing

```bash
# Electron tests — see exact error:
cd electron-app && npx vitest run --reporter=verbose

# Python tests — see exact error:
source .venv/bin/activate && pytest tests/ -v --tb=long

# Common causes:
# - node_modules not installed (npm install)
# - Python deps missing (pip install flask requests)
# - Stale module cache (Python) — fixed by test fixtures automatically
```
