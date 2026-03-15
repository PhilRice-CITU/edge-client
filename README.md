# Edge Client

Local runtime for the rice evaluation device.

This repository is the software that lives on the edge device and is responsible for:
- watching the physical capture button,
- switching relay-based lighting modes,
- capturing IR and White images,
- queueing captures locally,
- uploading to the correct destination based on mode,
- reporting device health,
- exposing local status endpoints for the kiosk and debugging.

## Architecture At A Glance

```text
Button press
	-> scripts/capture.sh
	-> src/enqueue_capture.py
	-> data/upload_queue.json
	-> src/uploader.py
	-> src/upload_router.py
			-> Production: API backend
			-> Training: Roboflow

Meanwhile:
	startup.sh boots services
	src/heartbeat.py reports liveness
	src/app.py exposes local status endpoints
```

## Repository Status

Implemented now:

| Area | Status | Notes |
|---|---|---|
| Environment config | Ready | `.env.example` exists |
| Logging and shell helpers | Ready | `lib/` foundation is implemented |
| Capture pipeline | Ready on Pi | `scripts/capture.sh` uses `pinctrl` + `rpicam-still` |
| Queueing | Ready | JSON queue writer and worker are implemented |
| Upload routing | Ready | Supports `production` and `training` modes |
| Heartbeat | Ready | Sends online status to backend |
| Local API | Ready | `src/app.py` exposes status endpoints |
| Startup orchestration | Ready | `startup.sh` wires services together |
| Electron kiosk | Not implemented here yet | Intentionally skipped for manual learning |
| Provisioning / Ansible | Not implemented yet | Planned later |

## If You Fork This Repository

After forking, do these first:

1. Clone your fork.
2. Create your local environment file from `.env.example`.
3. Install Python dependencies.
4. Validate the local API and queue flow on your laptop.
5. Move to Raspberry Pi only when laptop-side flow is understood.

Recommended mindset:
- Use macOS or another laptop first to validate Python logic.
- Use Raspberry Pi only for hardware-specific testing.
- Do not start with full boot orchestration before you can explain each worker.

## 1. What You Can Check Right Now

This section is for the current project progress.

Even if you have not installed anything yet, this is what the code is already designed to do and what parts can be tested on a normal laptop.

### What works on macOS right now

- `src/app.py` local API endpoints
- `src/enqueue_capture.py` queue writing
- `src/uploader.py` queue polling and retry behavior
- `src/upload_router.py` mode-based routing logic
- `src/heartbeat.py` request flow
- `startup.sh` orchestration logic, except hardware capture

### What does not fully work on macOS

- `pinctrl`
- `rpicam-still`
- relay switching
- physical GPIO button polling

Those parts require Raspberry Pi OS and the actual device wiring.

### Install only what you need to start learning

From the repository root:

```bash
cd edge-client
python3 -m venv .venv
source .venv/bin/activate
python3 -m pip install --upgrade pip
python3 -m pip install flask requests
cp .env.example .env
```

### Minimal `.env` values for laptop testing

At minimum, review these values in `.env`:

```env
DEVICE_ID=pi-001
API_BASE_URL=https://your-api-server.com
EDGE_MODE=production
PRODUCTION_UPLOAD_TARGET=api
TRAINING_UPLOAD_TARGET=roboflow
```

If you do not yet have a real API or Roboflow setup, that is fine. You can still test the queue and routing flow. Uploads will simply fail and retry, which is expected behavior.

### Current test flow

Start the local API:

```bash
source .venv/bin/activate
python3 src/app.py
```

Check the endpoints:

```bash
curl http://localhost:5000/health
curl http://localhost:5000/mode
curl http://localhost:5000/queue-size
curl http://localhost:5000/status
```

Write a test queue item manually:

```bash
mkdir -p data/images
touch data/images/WHITE_test.jpg data/images/IR_test.jpg

python3 src/enqueue_capture.py \
	--raw data/images/WHITE_test.jpg \
	--ir data/images/IR_test.jpg \
	--session test-session-1 \
	--device pi-001 \
	--captured-at 2026-03-16T12:00:00Z \
	--queue data/upload_queue.json
```

Inspect the queue:

```bash
cat data/upload_queue.json
curl http://localhost:5000/queue-size
```

Run the uploader worker:

```bash
source .venv/bin/activate
python3 src/uploader.py
```

What you are proving with this test:
- the queue file is written correctly,
- the uploader polls and reads jobs,
- retry behavior works,
- routing mode resolution works.

### Why this stage matters

This stage gives the team a safe way to validate the architecture before mixing in Raspberry Pi hardware concerns.

That is good engineering practice because it isolates failure domains:
- Python logic problems are found on laptop.
- GPIO/camera problems are found on Pi.
- Cloud integration problems are found through uploader logs and API responses.

## 2. Final Run Flow

This section is the target operating flow once dependencies are installed and the code is deployed to the Raspberry Pi.

### Final prerequisites on Raspberry Pi

You will need:

- Raspberry Pi OS
- Python 3
- `flask`
- `requests`
- `pinctrl`
- `rpicam-still`
- camera module configured and working
- relay wired correctly
- button wired correctly
- valid `.env`

### Expected environment configuration

Important variables from `.env.example`:

```env
DEVICE_ID=pi-001
FLASK_PORT=5000
IMAGE_DIR=./data/images
LOG_DIR=/tmp/logs

EDGE_MODE=production
PRODUCTION_UPLOAD_TARGET=api
TRAINING_UPLOAD_TARGET=roboflow

API_BASE_URL=https://your-api-server.com
API_UPLOAD_PATH=/scans
API_HEARTBEAT_PATH=/devices/heartbeat

ROBOFLOW_API_KEY=
ROBOFLOW_WORKSPACE=
ROBOFLOW_PROJECT=
ROBOFLOW_DATASET_NAME=edge-captures
```

### Final boot command

```bash
bash startup.sh
```

### What `startup.sh` does

In order, it:

1. Creates runtime directories.
2. Loads helper libraries from `lib/`.
3. Acquires a lock so only one instance runs.
4. Loads `.env` and applies defaults.
5. Starts Flask local API.
6. Waits until `/health` responds.
7. Starts uploader worker.
8. Starts heartbeat worker.
9. Starts the hardware capture loop.
10. Tries to launch kiosk only if display tooling exists.

### Final runtime behavior

When the button is pressed:

1. `scripts/capture.sh` detects active-low button press.
2. Relay switches to IR.
3. `rpicam-still` captures IR image.
4. Relay switches to White.
5. `rpicam-still` captures White image.
6. `src/enqueue_capture.py` appends the capture pair to `data/upload_queue.json`.
7. `src/uploader.py` picks up that job.
8. `src/upload_router.py` decides the upload destination.
9. Upload goes either to API backend or Roboflow.

At the same time:
- `src/heartbeat.py` posts liveness on an interval.
- `src/app.py` exposes status endpoints for inspection and kiosk use.

## Useful Commands

Activate environment:

```bash
source .venv/bin/activate
```

Run API only:

```bash
python3 src/app.py
```

Run uploader only:

```bash
python3 src/uploader.py
```

Run heartbeat only:

```bash
python3 src/heartbeat.py
```

Run full stack:

```bash
bash startup.sh
```

Check API status:

```bash
curl http://localhost:5000/health
curl http://localhost:5000/status
curl http://localhost:5000/mode
curl http://localhost:5000/queue-size
```

## Common First Problems

| Problem | Likely cause | Fix |
|---|---|---|
| `flask` import error | dependency not installed | install `flask` in your venv |
| `requests` import error | dependency not installed | install `requests` in your venv |
| upload keeps retrying | placeholder API/Roboflow config | expected until real credentials exist |
| `pinctrl: command not found` | running on macOS | expected, test this on Pi |
| `rpicam-still: command not found` | not on Raspberry Pi camera stack | expected, test this on Pi |
| startup exits early | `.env` missing required values | create `.env` from `.env.example` |

## Team Notes

- This repository is already at the stage where backend workers and orchestration can be reviewed as a team.
- UI work can proceed separately later without blocking capture, upload, and health reporting.
- The best next step for the team is to validate the laptop-safe flow first, then move to device testing.
