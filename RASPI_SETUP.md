# Rice Vision — Raspberry Pi Setup Guide

## How provisioning works

When a Pi boots for the first time it has no Device ID. Here is the full journey from a fresh image to an active kiosk:

```
Pi boots
  └─ startup.sh
       ├─ Loads .env
       ├─ provision.py  ← headless path: registers only if REGION_CODE
       │                   is already in .env (automated fleet deployments).
       │                   Skips gracefully if REGION_CODE is absent.
       ├─ Starts Flask API  (http://127.0.0.1:5055)
       ├─ Starts uploader worker
       ├─ Starts heartbeat worker
       └─ Launches Electron kiosk

Electron kiosk opens
  └─ SplashPage
       ├─ Calls Flask /status
       ├─ device_id = ""  →  navigate to /setup  ← UI provisioning
       └─ device_id set   →  navigate to /home   ← normal operation

/setup  (shown only on first boot)
  ├─ Region picker  ← fetches list from API /regions/public
  ├─ User taps a region
  ├─ Flask /setup/register  →  API /devices/provision
  │     • MAC-address idempotency: same Pi always gets the same device record
  │     • Writes DEVICE_ID, DEVICE_DISPLAY_NAME, DEVICE_QR_URL back to .env
  └─ QR code screen  ← shows the web-dashboard URL for this device
       └─ "Start Using →"  →  /home
```

After `/setup` completes, `DEVICE_ID` is permanently written to `.env`. Every subsequent boot goes straight to `/home`.

---

## Prerequisites

- Raspberry Pi 4 (4 GB+ recommended) running Raspberry Pi OS (64-bit, Bookworm)
- Pi camera module connected and enabled (`raspi-config` → Interface Options → Camera)
- Internet connection (Wi-Fi or Ethernet)
- SSH access or a connected keyboard/monitor

---

## 1. Clone the repository

```bash
git clone https://github.com/your-org/rice-vision.git ~/rice-vision
cd ~/rice-vision/edge-client
```

---

## 2. Run the one-time setup script

```bash
chmod +x setup.sh
./setup.sh
```

This installs system packages, creates the Python virtual environment, builds the Electron app, copies `.env.example` → `.env`, and registers the systemd service.

---

## 3. Configure environment variables

You need to fill in **two** `.env` files.

### 3a. Python services — `edge-client/.env`

```bash
nano ~/rice-vision/edge-client/.env
```

**Minimum required (all deployments):**

| Variable | What to set |
|---|---|
| `API_BASE_URL` | Full URL of the Rice Vision API, e.g. `https://api.ricevision.app` |
| `PROVISION_TOKEN` | Shared secret from the API server admin |
| `DEVICE_HOST` | LAN IP of this Pi, e.g. `192.168.1.100` |
| `EDGE_MODE` | `production` or `training` (see [Mode Switch](#mode-switch) below) |
| `FLASK_PORT` | Leave as `5055` unless you have a conflict |

> **`DEVICE_ID` is set automatically** — either written by the Electron setup UI on first boot (standard workflow), or by `provision.py` during startup if `REGION_CODE` is also present in `.env` (headless/automated workflow).

**Optional — only needed for headless fleet provisioning (no screen):**

| Variable | What to set |
|---|---|
| `REGION_CODE` | Short region code, e.g. `cebu` — if set, `startup.sh` registers the device automatically without the UI |

**Training mode only:**

| Variable | What to set |
|---|---|
| `ROBOFLOW_API_KEY` | Your Roboflow API key |
| `ROBOFLOW_WORKSPACE` | Workspace slug |
| `ROBOFLOW_PROJECT` | Project slug |

### 3b. Electron UI — `edge-client/electron-app/.env`

```bash
nano ~/rice-vision/edge-client/electron-app/.env
```

| Variable | What to set |
|---|---|
| `VITE_EDGE_MODE` | Same value as `EDGE_MODE` above (`production` or `training`) |
| `FLASK_PORT` | Same value as `FLASK_PORT` above (`5055`) |

> **Keep both files in sync.** `EDGE_MODE` controls the Python workers; `VITE_EDGE_MODE` controls the Electron UI buttons. They must match.

---

## 4. Rebuild the Electron app after changing `.env`

`VITE_EDGE_MODE` is baked in at build time by Vite. Any time you change it you must rebuild:

```bash
cd ~/rice-vision/edge-client/electron-app
npm run build:linux
```

---

## 5. Start the service

### Via systemd (recommended — starts automatically on every boot)

```bash
sudo systemctl enable rice-vision   # enable auto-start on boot
sudo systemctl start rice-vision    # start now
sudo systemctl status rice-vision   # verify it's running
```

Watch live logs:

```bash
journalctl -u rice-vision -f
```

### Manually (useful for debugging)

```bash
cd ~/rice-vision/edge-client
./startup.sh
```

---

## 6. First-boot walk-through (with a screen)

When the Electron kiosk opens for the first time it will show the **Setup screen** instead of the home screen.

1. **Pick your region** — a list is fetched live from the API server. Tap the region this Pi belongs to.
2. The Pi registers itself over the network. The MAC address is used so a power-cut can never create a duplicate record.
3. A **QR code** appears on screen. Scan it with any phone to open this device's page in the web dashboard. You can also screenshot it for your records.
4. Tap **Start Using →** — the kiosk goes directly to the home screen and is fully operational.

> If the region list fails to load, check that `API_BASE_URL` is reachable from the Pi and that the API server is running.

### Re-imaging a Pi that was previously registered

If you flash a new SD card for a Pi that already exists in the database, use the **Claim existing device** link at the bottom of the setup screen. Enter the old device UUID (visible in the web dashboard's fleet list) and the Pi will reuse its existing record without creating a duplicate.

---

## 7. Mode switch

| | `production` | `training` |
|---|---|---|
| **`edge-client/.env`** | `EDGE_MODE=production` | `EDGE_MODE=training` |
| **`electron-app/.env`** | `VITE_EDGE_MODE=production` | `VITE_EDGE_MODE=training` |
| **Electron UI** | Grade Rice only | Grade Rice + Training Mode |
| **Uploader** | Sends to API server | Sends to Roboflow |

After switching mode, rebuild the Electron app (step 4) and restart the service.

---

## 8. Fetching updates from Git

```bash
cd ~/rice-vision
git fetch origin
git pull origin main

# Rebuild Electron app if any renderer code changed
cd edge-client/electron-app
npm ci
npm run build:linux

# Restart the service
sudo systemctl restart rice-vision
```

---

## 9. Verify everything is running

```bash
# Flask health check
curl http://localhost:5055/health

# Device status — shows device_id, display_name, qr_url
curl http://localhost:5055/status

# Systemd service state
sudo systemctl status rice-vision
```

---

## Troubleshooting

| Symptom | Check |
|---|---|
| Setup screen shows "Could not reach server" | `API_BASE_URL` is wrong or API server is down |
| Setup screen region list is empty | No regions in the database — ask the admin to add them |
| Setup screen appears on every boot | `DEVICE_ID` was never written; check `edge-client/.env` |
| Claim flow says "Device not found" | Wrong UUID, or the device belongs to a different region |
| Electron shows blank screen | Flask not running — check `journalctl -u rice-vision -f` |
| "Cannot reach device service" | `FLASK_PORT` mismatch between the two `.env` files |
| Training Mode button missing | `VITE_EDGE_MODE` not set to `training`, or Electron app not rebuilt |
| Uploads failing | `API_BASE_URL` or `DEVICE_ID` missing/wrong in `edge-client/.env` |
| Camera not working | `raspi-config` → Interface Options → Camera → Enable |
