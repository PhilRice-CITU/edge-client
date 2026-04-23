# Hum.ai Edge Client — Technical Reference

> **Audience:** The developer (you). This document explains every file, every data flow, and every design decision so you can maintain, debug, and extend the edge client without reverse-engineering anything.

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Getting Started](#2-getting-started)
   - [Fresh Install (New Pi)](#21-fresh-install-new-pi)
   - [Already Installed (Old Architecture)](#22-migrating-from-old-architecture)
3. [App Startup — What Happens When You Open the App](#3-app-startup)
4. [Electron Main Process](#4-electron-main-process)
5. [Python Sidecars](#5-python-sidecars)
6. [Electron UI (Renderer)](#6-electron-ui-renderer)
7. [Data Flow — End to End](#7-data-flow)
8. [Environment Variables — Complete Reference](#8-environment-variables)
9. [Testing](#9-testing)
10. [Packaging & Distribution](#10-packaging--distribution)
11. [Debugging Guide](#11-debugging-guide)

---

## 1. System Overview

The edge client is now a **single self-contained Electron app**. When you open it, everything starts. When you close it, everything stops.

```
┌─────────────────────────────────────────────────────────────────┐
│  Electron App (the master process)                              │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Renderer  — React UI (Chromium)                         │  │
│  │  Talks ONLY to Flask on localhost via fetch()            │  │
│  └──────────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Main Process  — Node.js / Electron APIs                 │  │
│  │  • Spawns Python sidecars as child processes             │  │
│  │  • Polls GPIO pin 27 via pinctrl                         │  │
│  │  • Handles IPC bridge (gpio, config, flask-url)          │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
│  Child Processes (spawned on startup, killed on quit):         │
│    ├── python3 src/app.py          (Flask API on :5055)        │
│    └── python3 src/mqtt_agent.py  (MQTT telemetry + cmds)     │
└─────────────────────────────────────────────────────────────────┘
```

**What changed from the old architecture:**

| Old | New |
|---|---|
| `startup.sh` orchestrates services | Electron main process orchestrates everything |
| `capture.sh` GPIO loop runs forever in background | GPIO polling is TypeScript inside the main process |
| Kiosk mode launched by display.sh | Normal resizable app window (min 800×480) |
| `uploader.py` watches upload queue | Training uploads happen immediately via Flask endpoint |
| `lib/*.sh` bash helpers | Deleted — no longer needed |
| `rice-vision.service` systemd unit | Not needed for the app (optional for headless Pi auto-start) |

---

## 2. Getting Started

### 2.1 Fresh Install (New Pi)

If you are setting up a Pi that has never had this app:

```bash
git clone <repo-url> ~/edge-client
cd ~/edge-client
chmod +x setup.sh
./setup.sh
```

`setup.sh` does:
1. Installs system packages (python3, pip, Electron GTK deps) — ARM only
2. Installs Node.js 20 via NodeSource — if not already present
3. Installs Python dependencies from `requirements.txt` via pip3
4. Installs Electron npm dependencies (`npm ci`)
5. Copies `.env.example` → `.env` — **edit this file before launching**

After setup, configure the app:

```bash
nano .env
# Set at minimum:
#   API_BASE_URL=https://your-api-server.com
#   MQTT_HOST=your.mqtt.broker
```

Then launch:

```bash
cd electron-app
npm run dev        # development (hot-reload)
# OR
npm run build:linux && npm run start   # production build
```

The app will walk you through device registration (Setup page) on first launch if `DEVICE_ID` is not yet set.

---

### 2.2 Migrating From Old Architecture

If you previously had the old setup (`startup.sh` / `rice-vision.service` / `lib/` directory), do the following:

**Step 1 — Stop the old service:**
```bash
sudo systemctl stop rice-vision
sudo systemctl disable rice-vision
```

**Step 2 — Pull the latest code:**
```bash
cd ~/edge-client
git pull
```

**Step 3 — Update Python dependencies:**
```bash
pip3 install -r requirements.txt --break-system-packages
# or if you used a venv before:
source .venv/bin/activate && pip install -r requirements.txt
```

**Step 4 — Reinstall npm dependencies** (package.json changed):
```bash
cd electron-app && npm ci
```

**Step 5 — Copy your `.env` values**  
Your existing `.env` at `~/edge-client/.env` still works in **dev mode**. In packaged mode, the app reads from `~/.config/hum-ai/.env`. Copy it there:
```bash
mkdir -p ~/.config/hum-ai
cp ~/edge-client/.env ~/.config/hum-ai/.env
```

**Step 6 — Launch:**
```bash
cd ~/edge-client/electron-app
npm run dev        # development mode
```

**What you can safely delete** (already removed from the repo, but may exist locally if you had local changes):
- `startup.sh`
- `lib/` directory
- `rice-vision.service`
- `src/enqueue_capture.py`
- `src/uploader.py`

> [!NOTE]
> The `.venv/` virtual environment is no longer required. Python dependencies are now installed system-wide (`pip3 install`). You can delete `.venv/` to save disk space.

---

## 3. App Startup

When you launch the Electron app (double-click icon or `npm run start`), this is the exact order of operations:

```
1. Electron starts  →  app.whenReady() fires
2. loadEnv()        →  reads ~/.config/hum-ai/.env (packaged) or
                        edge-client/.env (dev)
                     →  applies defaults for any missing variables
3. mkdirSync()      →  ensures data/images/ and data/logs/ exist
4. spawnSidecar('flask', 'src/app.py')
                     →  python3 src/app.py started as child process
                     →  stdout/stderr piped to data/logs/flask.log
5. waitForHealth()  →  polls GET /health up to 30 times (1s apart)
                     →  continues even if Flask is slow (logs warning)
6. spawnSidecar('mqtt-agent', 'src/mqtt_agent.py')
                     →  python3 src/mqtt_agent.py started as child process
                     →  stdout/stderr piped to data/logs/mqtt-agent.log
7. createWindow()   →  BrowserWindow shown (resizable, min 800×480)
8. startGpioPoller()→  pinctrl configured, interval polling starts
                     →  if pinctrl unavailable: F9 keyboard shortcut active
9. Renderer loads   →  SplashPage → /home (or /setup if no DEVICE_ID)
```

**On quit:**
```
app.before-quit fires
  → stopGpioPoller()    clears interval, unregisters shortcuts
  → shutdownAll()       SIGTERM → 5s grace → SIGKILL all child processes
```

---

## 4. Electron Main Process

### `src/main/env.ts` — Environment Loader

Loads the `.env` file and computes path constants for the rest of the main process.

**Key exports:**

| Export | Dev value | Packaged value |
|---|---|---|
| `PYTHON_ROOT` | `../src/` (repo) | `resources/python/src/` |
| `SCRIPTS_ROOT` | `../scripts/` (repo) | `resources/python/scripts/` |
| `ENV_PATH` | `../edge-client/.env` | `~/.config/hum-ai/.env` |
| `DATA_ROOT` | `../data/` (repo) | `~/.config/hum-ai/data/` |

`loadEnv()` must be called once before `getConfig()` or spawning sidecars. It sets process.env defaults (same values as the old `lib/env.sh apply_defaults`).

### `src/main/sidecar.ts` — Child Process Manager

Spawns and tracks Python processes as Electron child processes.

- **`spawnSidecar(name, scriptPath)`** — runs `python3 scriptPath`, pipes output to `data/logs/{name}.log`, adds to tracked list.
- **`waitForHealth(url)`** — polls a health URL with retries.
- **`shutdownAll()`** — sends SIGTERM to all tracked processes; SIGKILL after 5 seconds.

### `src/main/gpio.ts` — GPIO Poller

Replaces the old `capture.sh` GPIO loop. Runs inside Node.js (no bash required).

- Polls GPIO pin 27 via `pinctrl get 27` every 200ms.
- Fires `gpio:button-pressed` IPC event to the renderer when pin reads `lo`.
- Includes debounce: held-down button only fires once.
- On non-Pi hardware (pinctrl unavailable): logs a warning, disables GPIO, registers **F9** as a simulator key for development.
- Mode-gated: only fires events when mode is `session` or `training`. On all other pages, button presses are silently ignored.

**IPC messages:**

| Direction | Channel | Payload | Description |
|---|---|---|---|
| Renderer → Main | `gpio:set-mode` | `'session' \| 'training' \| 'idle'` | Page mounts/unmounts |
| Main → Renderer | `gpio:button-pressed` | _(none)_ | Button was pressed |

### `src/main/index.ts` — App Entry Point

**IPC handlers registered:**

| Handle | Returns | Description |
|---|---|---|
| `open-external` | `void` | Opens URL in system browser |
| `get-flask-url` | `string` | `http://127.0.0.1:{FLASK_PORT}` |
| `get-data-root` | `string` | Data directory path |
| `get-config` | `Record<string,string>` | Current config snapshot for Settings page |
| `save-config` | `{ok, error?}` | Writes key=value pairs to userData `.env` |

### `src/preload/index.ts` — IPC Bridge

Exposes the `window.api` object to the renderer via `contextBridge`:

```typescript
window.api = {
  openExternal(url)           // open URL in browser
  getFlaskUrl()               // → http://127.0.0.1:5055
  getDataRoot()               // → path to data directory
  getConfig()                 // → current env config
  saveConfig(fields)          // → writes to userData .env
  onGpioButtonPressed(cb)     // → subscribe, returns unsubscribe fn
  setGpioMode(mode)           // → 'session' | 'training' | 'idle'
}
```

---

## 5. Python Sidecars

These run as child processes of Electron. They are identical Python scripts — the only change is how they are started.

### `src/app.py` — Flask API

Runs on `$FLASK_PORT` (default 5055). The central API that the renderer talks to.

#### Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | `{"status":"ok"}` — used by startup health check |
| `GET` | `/status` | `device_id`, `edge_mode`, `images_on_disk` — polled by UI every 5s |
| `GET` | `/mode` | Current edge_mode and upload targets |
| `GET` | `/preview/frame` | Single JPEG from rpicam-still — polled during session |
| `POST` | `/sessions` | Create a new session |
| `GET` | `/sessions/<id>` | Get session JSON |
| `PATCH` | `/sessions/<id>` | Update operator_name, rice_variety, status |
| `POST` | `/sessions/<id>/capture` | Run `capture.sh --once`, append batch to session |
| `POST` | `/sessions/<id>/upload-training` | Upload latest batch IR + white to Roboflow immediately |
| `POST` | `/sessions/<id>/submit` | Submit all batches to cloud API for grading |
| `GET` | `/setup/status` | Provisioning status |
| `POST` | `/setup/register` | Register this device with the cloud |

### `src/mqtt_agent.py` — MQTT Agent

Connects to `$MQTT_HOST:$MQTT_PORT`. Provides:
- **Live telemetry** — publishes device status to the dashboard
- **Remote commands** — receives commands from the dashboard (e.g., trigger capture remotely)

### `src/session_manager.py` — Session CRUD

Pure functions. Reads and writes JSON files in `data/sessions/`.

```json
{
  "id": "uuid",
  "mode": "grade",
  "operator_name": "Juan",
  "rice_variety": "Sinandomeng",
  "batches": [
    {
      "batch_number": 1,
      "ir_path": "/path/to/IR.jpg",
      "white_path": "/path/to/WHITE.jpg",
      "captured_at": "2026-04-23T12:00:00+00:00"
    }
  ],
  "status": "capturing",
  "created_at": "2026-04-23T12:00:00+00:00"
}
```

### `src/upload_router.py` — Upload Router

Routes images to the right backend based on `EDGE_MODE`:

| EDGE_MODE | Destination |
|---|---|
| `production` | Cloud API at `$API_BASE_URL/scans` |
| `training` | Roboflow upload API |

### `scripts/capture.sh` — Camera Script (`--once` mode only)

Called by Flask via `subprocess.run(['bash', 'capture.sh', '--once'])`.

1. Acquires a lock file (prevents concurrent captures)
2. Closes relay (pin 17 `dl`) → IR illumination active → `rpicam-still` → IR JPEG
3. Opens relay (pin 17 `dh`) → white illumination active → `rpicam-still` → white JPEG
4. Prints `{"ir_path":"...","white_path":"..."}` to stdout
5. Releases lock

> The old GPIO polling loop that ran forever has been removed. GPIO is now handled by the Electron main process (`gpio.ts`).

---

## 6. Electron UI (Renderer)

### Tech Stack

- React 19, TypeScript 5 (strict)
- TanStack Router (client-side routing)
- TanStack Query (data fetching + caching)
- Tailwind CSS v4 + shadcn/ui

### File Structure (Atomic Design)

```
src/renderer/src/
├── main.tsx                   ← Entry. QueryClient + RouterProvider.
├── App.tsx                    ← Root layout. Renders <Outlet />.
├── router.ts                  ← Route definitions.
│
├── types/session.ts           ← TypeScript types (Session, Batch, DeviceStatus…)
├── lib/constants.ts           ← FLASK_BASE_URL, poll intervals
├── lib/utils.ts               ← cn() Tailwind class helper
│
├── hooks/
│   ├── useDeviceStatus.ts     ← polls GET /status every 5s
│   ├── useSession.ts          ← session CRUD mutations
│   ├── useCapture.ts          ← POST /sessions/:id/capture
│   ├── useGpioButton.ts       ← subscribes to GPIO events from main process
│   └── useTheme.ts            ← dark/light mode toggle
│
├── components/
│   ├── atoms/                 ← Button, Badge, Input
│   ├── molecules/             ← KioskButton, StatusBadge, BatchCard, CameraPreview…
│   └── organisms/             ← BatchGallery, UploadProgress, ResultCard
│
└── pages/
    ├── SplashPage.tsx         ← 2s splash → /home or /setup
    ├── HomePage.tsx           ← Grade Rice / Training Mode selection
    ├── SessionPage.tsx        ← Camera preview + capture + batch gallery + submit
    ├── TrainingPage.tsx       ← GPIO active, captures + uploads to Roboflow
    ├── SettingsPage.tsx       ← Theme, device info, config editor, QR code
    └── SetupPage.tsx          ← First-time device registration
```

### Routes

| Path | Page | Description |
|---|---|---|
| `/` | — | Redirects to `/splash` |
| `/splash` | `SplashPage` | Branding + waits for `/status` → `/home` |
| `/home` | `HomePage` | Mode selection |
| `/session/$sessionId` | `SessionPage` | Grading session |
| `/training` | `TrainingPage` | GPIO training capture + Roboflow upload |
| `/settings` | `SettingsPage` | Config + appearance |
| `/setup` | `SetupPage` | First-time registration |

### GPIO Page Gating

The `useGpioButton(mode, onPress)` hook controls which pages receive GPIO events:

```typescript
// On mount: tells main process to enable GPIO for this mode
window.api.setGpioMode('session')

// On unmount: resets to idle (GPIO button silently ignored)
window.api.setGpioMode('idle')
```

Only `SessionPage` (mode: `session`) and `TrainingPage` (mode: `training`) subscribe. On all other pages the button does nothing.

### Training Flow (UI)

On `TrainingPage`, each GPIO button press goes through 4 phases:

```
1. 'capturing'  → POST /sessions/{id}/capture   → capture.sh --once → IR + white saved
2. 'uploading'  → POST /sessions/{id}/upload-training → upload_router → Roboflow
3. 'done'       → ✓ shown briefly → resets to idle
4. 'error'      → error message shown → resets to idle after 3s
```

Stats (Captured / Uploaded counts) are shown on the page.

---

## 7. Data Flow — End to End

### Grading Session

```
User taps "Grade Rice"
  → POST /sessions  →  session JSON created
  → navigate /session/$id

Camera preview:
  → GET /preview/frame (every 800ms)  →  rpicam-still  →  JPEG bytes

User presses GPIO button (or taps Capture):
  → POST /sessions/$id/capture
  → Flask runs capture.sh --once (subprocess)
  → capture.sh: relay IR → rpicam-still → relay white → rpicam-still
  → Flask: append_batch() → session JSON updated
  → Renderer: batch gallery re-renders

User taps "Submit":
  → POST /sessions/$id/submit
  → Flask reads all batch images
  → POST multipart to $API_BASE_URL/scans/batch
  → AI grading runs on server
  → Result viewed in web dashboard
```

### Training Session

```
User enters Training Mode
  → TrainingPage mounts → setGpioMode('training')

User presses GPIO button:
  → gpio:button-pressed IPC → TrainingPage.handleTrainingCapture()
  → POST /sessions/$id/capture  →  IR + white saved to disk
  → POST /sessions/$id/upload-training  →  upload_router.upload_to_roboflow()
  →  → Roboflow API
  → Page shows ✓ Uploaded, increments counters

User presses Done:
  → navigate /home  →  setGpioMode('idle')
```

### Config Save Flow

```
User edits fields in Settings page → clicks Save
  → window.api.saveConfig({ API_BASE_URL: '...', MQTT_HOST: '...', ... })
  → IPC: save-config handler in main process
  → reads ~/.config/hum-ai/.env
  → finds/replaces or appends each key=value line
  → writes file back
  → shows "Saved — restart app for changes"
```

---

## 8. Environment Variables — Complete Reference

All variables are loaded from `.env` (dev: repo root, packaged: `~/.config/hum-ai/.env`).

| Variable | Default | Description |
|---|---|---|
| `DEVICE_ID` | _(empty)_ | Set by provisioning. Required for grading. |
| `DEVICE_SECRET` | _(empty)_ | Auth token set by provisioning. |
| `DEVICE_DISPLAY_NAME` | _(empty)_ | Human-friendly device name. |
| `DEVICE_QR_URL` | _(empty)_ | QR code URL for the Settings page. |
| `API_BASE_URL` | _(empty)_ | Cloud API URL. Required for grading uploads. |
| `API_UPLOAD_PATH` | `/scans` | Path appended to API_BASE_URL for uploads. |
| `API_TIMEOUT_SECONDS` | `30` | HTTP request timeout for uploads. |
| `FLASK_PORT` | `5055` | Port the Flask sidecar listens on. |
| `IMAGE_DIR` | `data/images` | Where captured JPEGs are saved. |
| `LOG_DIR` | `data/logs` | Where sidecar logs are written. |
| `CAPTURE_LOCK_FILE` | `/tmp/edge-capture.lock` | Prevents concurrent captures. |
| `EDGE_MODE` | `production` | `production` or `training`. |
| `PRODUCTION_UPLOAD_TARGET` | `api` | Where production scans go. |
| `TRAINING_UPLOAD_TARGET` | `roboflow` | Where training captures go. |
| `ROBOFLOW_API_KEY` | _(empty)_ | Required for training mode uploads. |
| `ROBOFLOW_WORKSPACE` | _(empty)_ | Roboflow workspace slug. |
| `ROBOFLOW_PROJECT_NORMAL` | _(empty)_ | Roboflow project for white-light images. |
| `ROBOFLOW_PROJECT_IR` | _(empty)_ | Roboflow project for IR images. |
| `MQTT_HOST` | `localhost` | MQTT broker hostname. |
| `MQTT_PORT` | `1883` | MQTT broker port. |

> **Tip:** You can edit all of these from the **Settings page** → Configuration section. Click Save and restart the app.

---

## 9. Testing

### Electron Tests (Vitest + React Testing Library)

```bash
cd electron-app
npm test              # run all tests
npm run test:watch    # watch mode
npm run typecheck     # TypeScript check (both main + renderer)
```

Tests are co-located with the files they test. The test setup:
- **Vitest 4** with `jsdom` environment
- `@testing-library/react` + `@testing-library/jest-dom`
- `window.api` is automatically mocked (see `src/test/setup.ts`)

Common patterns:
1. **Hook tests** — wrap in `QueryClientProvider`, mock `fetch` via `vi.stubGlobal`
2. **Page tests** — mock TanStack Router's `useNavigate` and custom hooks via `vi.mock()`
3. **Fake timers** — `vi.useFakeTimers()` + `vi.runAllTimersAsync()` for splash/timer tests

### Python Tests (pytest)

```bash
cd edge-client
pytest tests/ -v
```

- `test_session_manager.py` — uses `tmp_path` fixture + `monkeypatch.setenv("SESSIONS_DIR")`
- `test_app.py` — uses Flask `test_client()`, mocks `subprocess.run` for capture tests

---

## 10. Packaging & Distribution

### Build & Package (on Pi or Linux)

```bash
cd electron-app

# Full package (AppImage + .deb):
npm run build:linux

# Just .deb:
npm run package:deb

# Just AppImage:
npm run package:appimage

# Output is in electron-app/dist/
```

The build bundles Python scripts as `extraResources`. When installed, the packaged app finds them at `resources/python/src/` and `resources/python/scripts/`.

### Installing the .deb on Pi

```bash
sudo dpkg -i dist/hum-ai_1.0.0_arm64.deb

# The post-install hook automatically runs:
# pip3 install -r /opt/Hum.ai/resources/python/requirements.txt
```

After install, the app appears in the Pi application menu. Double-click to launch.

### Config File (packaged mode)

The app reads/writes config at `~/.config/hum-ai/.env`. Edit it directly or use the Settings page in the app.

```bash
nano ~/.config/hum-ai/.env
```

### Updating

#### Packaged install (Pi has a .deb installed)

Run these steps on the Pi to deploy the latest code:

```bash
# 1. Pull latest code
cd ~/edge-client
git pull

# 2. Update dependencies (only needed if package.json or requirements.txt changed)
pip3 install -r requirements.txt --break-system-packages
cd electron-app && npm install

# 3. Rebuild the .deb
npm run package:deb

# 4. Check the output filename
ls dist/*.deb

# 5. Reinstall over the existing version
sudo dpkg -i dist/hum-ai_1.0.0_arm64.deb

# 6. Relaunch the app (or reboot)
```

`dpkg -i` over an existing install upgrades in-place — your `~/.config/hum-ai/.env` is not touched.

If the build fails with `tar failed (exit code 2)`, install `fakeroot` first:
```bash
sudo apt install fakeroot
```
Then retry `npm run package:deb`.

#### Dev/repo installs

```bash
cd ~/edge-client
git pull
pip3 install -r requirements.txt --break-system-packages
cd electron-app && npm ci
# Then relaunch or rebuild
```

---

## 11. Debugging Guide

### App won't launch / blank screen

```bash
# Run from terminal to see errors:
cd electron-app && npm run dev
# or for the packaged version:
/opt/Hum.ai/hum-ai --no-sandbox
```

### Flask sidecar not starting

```bash
# Check log:
cat ~/.config/hum-ai/data/logs/flask.log   # packaged
cat data/logs/flask.log                    # dev

# Run manually to see error:
python3 src/app.py
# Common: missing Python deps, port 5055 already in use
```

### Camera preview returns 503

```bash
# On Pi — check camera is enabled:
rpicam-still -o /tmp/test.jpg -t 1000
# If fails: sudo raspi-config → Interface Options → Camera → Enable
```

### GPIO button does nothing

```bash
# Is the app open? GPIO only works while Electron is running.
# Is it on SessionPage or TrainingPage? Those are the only pages that listen.

# Test on non-Pi:
# Press F9 (registered as GPIO simulator in dev mode)

# Check pinctrl:
pinctrl get 27   # should show 'ip pu hi' when not pressed

# Check GPIO log:
cat data/logs/flask.log | grep gpio
```

### Training captures not uploading to Roboflow

```bash
# Check ROBOFLOW_* vars are set:
cat ~/.config/hum-ai/.env | grep ROBOFLOW

# Or set them in Settings page → Configuration

# Check Flask log for upload errors:
cat data/logs/flask.log | grep "training-upload"
```

### MQTT agent not connecting

```bash
cat data/logs/mqtt-agent.log | tail -30
# Common: MQTT_HOST/MQTT_PORT wrong, broker unreachable
```

### Settings saved but app not picking them up

Config changes take effect on **next launch**. The app reads `.env` once at startup.

```bash
# Restart the app after saving settings.
```

### Tests are failing

```bash
# TypeScript errors:
cd electron-app && npm run typecheck

# Test failures:
npm test -- --reporter=verbose

# Python tests:
pytest tests/ -v --tb=long
```
