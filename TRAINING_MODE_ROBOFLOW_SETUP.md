# Rice Vision Edge Client - Training Mode Roboflow Setup Guide

This guide is based on the current edge-client flow in this workspace.

## What Happens In Training Mode

When you capture on the Pi:

1. `scripts/capture.sh` captures two files:
   - `IR_*.jpg`
   - `WHITE_*.jpg` (your normal/white image)
2. Both files are saved locally to `IMAGE_DIR` (currently `./data/images`).
3. A queue item is added to `QUEUE_FILE` (currently `./data/upload_queue.json`).
4. `src/uploader.py` reads the queue.
5. `src/upload_router.py` sends both images to Roboflow when:
   - `EDGE_MODE=training`
   - `TRAINING_UPLOAD_TARGET=roboflow`

So you always have two destinations:

- Local copy on Pi: `data/images`
- Remote copy in Roboflow dataset/project

## Required Environment Setup

Edit `edge-client/.env` and confirm these values:

```env
# Mode routing
EDGE_MODE=training
TRAINING_UPLOAD_TARGET=roboflow
PRODUCTION_UPLOAD_TARGET=api

# Local paths
IMAGE_DIR=./data/images
QUEUE_FILE=./data/upload_queue.json
LOG_DIR=./data/logs

# Roboflow (required in training + roboflow target)
ROBOFLOW_API_KEY=YOUR_KEY
ROBOFLOW_WORKSPACE=YOUR_WORKSPACE
ROBOFLOW_DATASET_NAME=edge-captures
ROBOFLOW_PROJECT_NORMAL=rice-grading-normal
ROBOFLOW_PROJECT_IR=rice-grading-ir

# Worker behavior
UPLOADER_POLL_SECONDS=3
UPLOADER_MAX_RETRIES=5
```

Also keep Electron UI mode aligned:

- In `edge-client/electron-app/.env` set `VITE_EDGE_MODE=training`
- Ensure `FLASK_PORT` matches between both env files

## One-Time Setup On Pi (If Needed)

From `edge-client/`:

```bash
bash setup.sh
```

This installs system deps, Python venv deps, Electron deps/build, and prepares `.env`.

## Start Services

From `edge-client/`:

```bash
bash startup.sh
```

This starts:

- Flask API (`src/app.py`)
- Uploader worker (`src/uploader.py`)
- Heartbeat worker (`src/heartbeat.py`)
- Capture loop (`scripts/capture.sh`)
- Electron kiosk (if display is available)

## Quick Validation Before Capturing

Open these local endpoints:

- `GET http://localhost:5055/mode`
- `GET http://localhost:5055/status`
- `GET http://localhost:5055/queue-size`

Expected in `/mode`:

- `edge_mode: training`
- `training_upload_target: roboflow`

Expected in `/status` after captures:

- `images_on_disk` increases
- `queued_uploads` goes up briefly, then down as uploader sends

## Capture and Upload Flow (Step-by-Step)

1. Press the physical capture button (or trigger capture path used by your UI flow).
2. Pi captures IR + WHITE images.
3. Confirm local files:
   - `edge-client/data/images/IR_*.jpg`
   - `edge-client/data/images/WHITE_*.jpg`
4. Confirm queue behavior:
   - `edge-client/data/upload_queue.json` gets a new item, then uploader drains it.
5. Confirm Roboflow:
   - Open your Roboflow project and verify new uploads in your dataset.

## Naming In Roboflow Uploads

Uploader sends each file with names like:

- `<device_id>_<session_id>_raw.jpg` (WHITE image)
- `<device_id>_<session_id>_ir.jpg`

## Troubleshooting

### 1) Images save locally but never appear in Roboflow

Check:

- `ROBOFLOW_API_KEY`, `ROBOFLOW_WORKSPACE`, `ROBOFLOW_PROJECT_NORMAL`, and `ROBOFLOW_PROJECT_IR` are not empty
- Pi has internet access
- Worker is running (`startup.sh` started uploader)
- Logs in `edge-client/data/logs`

### 2) Queue keeps growing

Possible causes:

- Roboflow credentials invalid
- Network/API timeout
- Roboflow endpoint/account mismatch

Check `UPLOADER_MAX_RETRIES` and uploader logs to see repeated failures.

### 3) UI says training, but behavior seems different

Ensure mode is synced:

- `edge-client/.env`: `EDGE_MODE=training`
- `edge-client/electron-app/.env`: `VITE_EDGE_MODE=training`

### 4) Capture works on laptop but camera fails

Expected in dev environments without Pi camera/GPIO. Real capture pipeline requires Raspberry Pi camera + `pinctrl` + `rpicam-still`.

## Operational Checklist (Fast)

Use this each time:

1. Confirm `.env` has training + Roboflow vars.
2. Start with `bash startup.sh`.
3. Verify `/mode` and `/status`.
4. Capture once.
5. Verify `data/images` got IR + WHITE files.
6. Verify queue drains.
7. Verify files appear in Roboflow.
