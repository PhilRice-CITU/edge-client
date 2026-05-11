# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Purpose

Complete runtime for the Rice Vision grading device. Ships on a Raspberry Pi with a touchscreen, dual cameras, relay-controlled LEDs, and a physical capture button. Most code can be developed and tested on macOS/Linux without Pi hardware.

## Commands

```bash
# --- Electron UI ---
cd electron-app
npm install
npm run dev             # hot-reload kiosk UI

# --- Electron/React tests ---
cd electron-app
npm test                # Vitest
npm run test:watch
npm run test:coverage

# --- Build .deb for Pi (local, no CI) ---
cd electron-app
npm run package:deb     # outputs arm64 .deb to dist/

# --- Release (triggers CI → builds .deb → publishes GitHub Release → Pi auto-updates) ---
cd electron-app
npm run release:patch   # bumps patch (1.0.x → 1.0.x+1), commits, tags, pushes
npm run release:minor   # bumps minor
npm run release:major   # bumps major

# IMPORTANT: always run release:* from electron-app/, NOT from repo root.
# The script (scripts/release.sh) handles committing and tagging from the repo root automatically.
# Do NOT use `npm version patch` directly — it won't create the git tag correctly in this monorepo layout.

# --- Manual Pi install (when auto-update hasn't fired yet) ---
# On Mac:
scp electron-app/dist/hum-ai_<version>_arm64.deb humai@raspberrypi:~/
# On Pi:
sudo dpkg -i ~/hum-ai_<version>_arm64.deb

# --- Pi deployment ---
./setup.sh              # one-time: apt, venv, npm build, systemd unit install
sudo systemctl start rice-vision
journalctl -u rice-vision -f
```

**Note**: `rpicam-still` and `pinctrl` (GPIO) only exist on Pi hardware. Camera capture fails on a laptop — everything else works.

## Architecture

```
Electron (electron-app/)          ← touchscreen kiosk UI
  React 19 + TanStack Router + TanStack Query
  Talks directly to cloud api-server at /edge/v1/...
  Calls capture.sh via IPC for image capture
  Uses local-image:// custom protocol to display local JPEGs
```

Electron is a thin client — it talks directly to the cloud `api-server` at `/edge/v1/...` using `X-Device-ID` + `X-Device-Secret` headers. No local Python sidecar runs on the Pi; the only Python on the device is the bash-invoked `capture.sh` plus standalone training scripts under `scripts/`.

## Data Flow

1. Operator taps "Grade Rice" → Electron calls `POST /edge/v1/sessions` on cloud api-server
2. Operator presses physical button → `capture.sh --once` runs via Electron IPC (`capture:run`)
3. Electron records the batch via `POST /edge/v1/sessions/{id}/batches`
4. Operator taps "Submit" → Electron reads local images, posts multipart to `POST /edge/v1/sessions/{id}/submit`
5. Cloud API runs inference → stores result in Supabase
6. React dashboard fetches results

## Device Identity

Each Pi has `DEVICE_ID` and `DEVICE_SECRET` in its `.env`. These are set during provisioning via the Setup page in the Electron UI (calls `POST /edge/v1/devices/provision`). Electron main process exposes them via IPC to the renderer.

## Key Files

| File | Role |
|------|------|
| `scripts/capture.sh` | GPIO relay control + `rpicam-still` dual capture |
| `electron-app/src/main/index.ts` | Electron main — IPC handlers, local-image:// protocol, auto-updater |
| `electron-app/src/renderer/src/lib/api.ts` | Cloud API helpers: `apiUrl()`, `edgeHeaders()`, `initDeviceConfig()` |

## Environment Variables

| Variable | Purpose |
|----------|---------|
| `DEVICE_ID` | UUID identifying this Pi to the cloud api-server |
| `DEVICE_SECRET` | Secret for authenticating edge API requests |
| `API_BASE_URL` | Cloud api-server URL (e.g. `https://api.example.com`) |
| `ROBOFLOW_API_KEY` | Roboflow key for training uploads |
| `ROBOFLOW_WORKSPACE` | Roboflow workspace slug |
| `ROBOFLOW_PROJECT_NORMAL` | Roboflow project for white-LED images |
| `ROBOFLOW_PROJECT_IR` | Roboflow project for IR images |

## Electron App Structure

`electron-app/src/renderer/src/` follows Atomic Design:
- `components/atoms/`, `molecules/`, `organisms/` — UI primitives
- `pages/` — full page components (`SplashPage`, `HomePage`, `SessionPage`, `TrainingPage`, `SetupPage`)
- `hooks/` — `useDeviceStatus`, `useSession`, `useCapture`, `useProvision` (all tested)
- `lib/api.ts` — `initDeviceConfig()`, `apiUrl()`, `edgeHeaders()`, `getDeviceId()`
- `src/main/` — Electron main process
- `src/preload/` — contextBridge IPC security layer
