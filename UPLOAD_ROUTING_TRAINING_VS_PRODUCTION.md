# Upload Routing: Training vs Production (Edge Client)

This document solves your current issue: your capture flow saves images for testing, but does not upload.

## 1) Your Current Situation

You have captured images such as:
- `8f81314a-4d0b-4b15-aeb9-1e1f208a2dee.jpeg`
- `9b7ea77b-a92c-449e-8f6c-7c92f309ead2.jpeg`
- `41c787fd-e738-4594-b56c-aa6b7553e1e1.jpeg`

Right now the flow is download/save-only (good for testing), but upload is not connected.

## 2) Recommended Behavior by Mode

Use one runtime switch: `EDGE_MODE`.

- `EDGE_MODE=production`
  Upload target should be your API backend.
  Reason: production needs stable business flow, auth, and result pipeline.

- `EDGE_MODE=training`
  Upload target should be Roboflow by default (or API if you need auditing first).
  Reason: training mode is dataset collection oriented.

## 3) How the Upload Decision Works

The decision logic is now implemented in:
- [src/upload_router.py](src/upload_router.py)
- [src/uploader.py](src/uploader.py)

Resolution order:
1. Read `EDGE_MODE`
2. Resolve target using:
   - `PRODUCTION_UPLOAD_TARGET` for production
   - `TRAINING_UPLOAD_TARGET` for training
3. Route to:
   - API uploader
   - Roboflow uploader

## 4) Required Environment Variables

Defined in:
- [.env.example](.env.example)

Key variables:
- `EDGE_MODE=production|training`
- `PRODUCTION_UPLOAD_TARGET=api`
- `TRAINING_UPLOAD_TARGET=roboflow`
- `API_BASE_URL`, `API_UPLOAD_PATH`
- `ROBOFLOW_API_KEY`, `ROBOFLOW_WORKSPACE`, `ROBOFLOW_PROJECT`

## 5) What Your Capture Script Must Output

Your capture script should output JSON like this to stdout:

```json
{
  "raw": "data/images/8f81314a-4d0b-4b15-aeb9-1e1f208a2dee.jpeg",
  "ir": "data/images/9b7ea77b-a92c-449e-8f6c-7c92f309ead2.jpeg",
  "session_id": "41c787fd-e738-4594-b56c-aa6b7553e1e1",
  "device_id": "pi-001",
  "captured_at": "2026-03-16T10:30:00Z"
}
```

Why this exact shape is needed:
- `raw` and `ir` are actual file paths for upload worker
- `session_id` ties the pair together
- `device_id` supports traceability
- `captured_at` preserves event time

## 6) Where Upload Should Happen (Important)

Do not upload inside capture script directly.

Best practice:
1. capture script only captures and returns paths
2. Flask enqueues metadata
3. uploader worker uploads asynchronously

Why:
- Capture stays fast and deterministic
- Upload retries can happen safely
- UI remains responsive even without internet

## 7) API vs Roboflow Routing Examples

Production example:

```env
EDGE_MODE=production
PRODUCTION_UPLOAD_TARGET=api
TRAINING_UPLOAD_TARGET=roboflow
API_BASE_URL=https://your-api-server.com
API_UPLOAD_PATH=/scans
```

Training example:

```env
EDGE_MODE=training
PRODUCTION_UPLOAD_TARGET=api
TRAINING_UPLOAD_TARGET=roboflow
ROBOFLOW_API_KEY=...
ROBOFLOW_WORKSPACE=...
ROBOFLOW_PROJECT=...
```

## 8) How This Connects to Kiosk

Kiosk does not need to know upload vendor details.

Kiosk behavior should be:
- call local Flask `/capture`
- show "capture queued"
- optionally show "mode: production" or "mode: training" in UI

Upload destination is controlled by environment + worker layer.

## 9) Quick Verification Checklist

1. Create `.env` from `.env.example`
2. Set mode and target
3. Ensure queue file exists after capture request
4. Run uploader worker
5. Confirm files reach API or Roboflow

Minimal local check commands:

```bash
python3 src/uploader.py
```

```bash
python3 - <<'PY'
import json
from pathlib import Path
q = Path('data/upload_queue.json')
print('queue exists:', q.exists())
print('items:', len(json.loads(q.read_text())) if q.exists() else 0)
PY
```

## 10) Clean Code Notes for This Design

- Single responsibility:
  capture != upload routing != queue logic
- Config-driven behavior:
  no hardcoded upload target in business logic
- Retry safety:
  failed uploads requeue with retry count
- Extendable:
  later you can add `s3` or `azure` targets without touching capture flow

## 11) If You Want to Plug Your Existing Script Now

Use this integration rule:
- Keep your current capture command
- Ensure it returns the JSON contract above
- Enqueue output in Flask
- Let [src/uploader.py](src/uploader.py) process uploads

This gives you testing and production behavior from the same kiosk flow, with only `.env` mode changes.
