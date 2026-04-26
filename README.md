# Hum.ai — Edge Client

Touchscreen kiosk that runs on a Raspberry Pi to grade rice quality. Operator
captures images with the physical button, the Pi forwards them to the cloud
api-server, and the cloud returns a grade.

---

## What this device actually does

```
Operator                Pi (this repo)               Cloud
   │                          │                         │
   │ tap "Grade Rice"         │  POST /edge/v1/sessions │
   │─────────────────────────▶│────────────────────────▶│
   │                          │                         │
   │ press capture button     │  capture.sh --once      │
   │─────────────────────────▶│  (rpicam-still ×2)      │
   │                          │  POST /sessions/{id}/batches
   │                          │────────────────────────▶│
   │                          │                         │
   │ tap "Submit"             │  POST /sessions/{id}/submit
   │─────────────────────────▶│  (multipart images)     │
   │                          │────────────────────────▶│  ← AI grades
   │                          │                         │
   │ result on screen ◀───────│ ◀───────────────────────│
```

There is **no Flask server** on the Pi anymore. The Electron app is a thin
client that talks directly to `https://hum-ai-api.onrender.com`. The only
Python process on the Pi is `mqtt_agent.py` for telemetry + a tiny embedded
preview HTTP server on port 5056.

---

## Repo layout

```
edge-client/
├── electron-app/              ← React 19 + Electron 39 kiosk UI
│   ├── src/main/              ← Electron main process (IPC, capture, auto-update)
│   ├── src/preload/           ← contextBridge IPC surface
│   ├── src/renderer/src/      ← React UI (atomic design)
│   └── electron-builder.yml   ← .deb packaging + GitHub Releases publish config
├── src/                       ← Pi-side Python
│   ├── mqtt_agent.py          ← MQTT telemetry + preview HTTP server (port 5056)
│   ├── training_uploader.py   ← Roboflow upload helper
│   ├── commands.py            ← MQTT command handlers
│   └── event_client.py        ← Event log forwarding
├── scripts/
│   ├── capture.sh             ← rpicam-still IR + white LED dual capture
│   └── after-install.sh       ← .deb postinstall (Python deps, .env, autostart)
├── .env.example               ← Shipped inside .deb, copied to ~/.config/Hum.ai/.env
├── requirements.txt           ← paho-mqtt, requests
└── setup.sh                   ← One-time dev setup (apt + npm install + .env)
```

---

## Install on a Raspberry Pi

Target: Raspberry Pi 4/5 (arm64) running **Raspberry Pi OS Bookworm 64-bit**,
with the touchscreen attached and the dual cameras enabled in `raspi-config`.

### Prerequisites (one time per Pi)

```bash
sudo apt-get update
sudo apt-get install -y python3 python3-pip libcamera-apps
# Verify camera works
rpicam-still -o /tmp/test.jpg && echo "✔ camera OK"
```

### Option A — `.deb` install (production, "Discord-style" updates)

```bash
# 1. Download the latest release
wget https://github.com/YOUR_GITHUB_USER/YOUR_REPO_NAME/releases/latest/download/Hum.ai-X.Y.Z-arm64.deb

# 2. Install (postinstall handles everything: python deps, .env seed, autostart)
sudo dpkg -i Hum.ai-*.deb
sudo apt-get install -f   # auto-resolves any missing system deps

# 3. Reboot — kiosk launches on login
sudo reboot
```

What the postinstall does, in order:
1. `pip3 install -r requirements.txt` — installs `paho-mqtt`, `requests`
2. Copies the shipped `env.example` → `~/.config/Hum.ai/.env` (only if no `.env` exists yet — your existing one is preserved on upgrade)
3. Drops a `~/.config/autostart/hum-ai.desktop` entry so the kiosk launches on login
4. Future updates: just install the new `.deb`, no reconfiguration

After install, the device handles everything itself — no SSH needed for
provisioning. See **[First-boot provisioning](#first-boot-provisioning-one-time-per-pi)** below.

### Option B — Dev / from source (laptop or Pi)

```bash
git clone <this-repo>
cd edge-client
./setup.sh                        # apt + npm + .env + Python deps
cd electron-app && npm run dev    # hot-reload kiosk UI
```

On a laptop: UI, cloud calls, and the Setup flow all work. The capture button
does nothing because there's no `rpicam-still` or GPIO. Everything else is
testable.

### Updating an existing install

```bash
# Manual upgrade (or just wait — auto-updater pulls within 4 hours)
sudo dpkg -i Hum.ai-NEW-VERSION-arm64.deb
sudo systemctl restart hum-ai 2>/dev/null || pkill -f hum-ai  # restart kiosk
```

Your `.env` is preserved across upgrades.

---

## First-boot provisioning (one time per Pi)

After install, the kiosk launches with an empty `DEVICE_ID` and routes to
the **Setup** screen:

1. Operator picks a region and enters the `PROVISION_TOKEN` (from the admin).
2. The app calls `POST /edge/v1/devices/provision` on the api-server.
3. The cloud returns a `device_id` + `device_secret`.
4. The app writes both to `~/.config/Hum.ai/.env` via the preload `saveConfig` IPC.
5. On next boot the splash sees the `DEVICE_ID` and goes straight to Home.

No SSH required.

---

## Updates — how the auto-updater works

Built on `electron-updater` + GitHub Releases. **Discord-style** — Pi checks
on boot and every 4 hours, downloads the new `.deb` in the background, shows
a banner on Home, and installs on next quit.

### Publishing a new version

```bash
cd electron-app
# 1. Bump version
npm version patch                 # 1.0.1 → 1.0.2
# 2. Build + publish to GitHub Releases (needs a GitHub PAT with `repo` scope)
GH_TOKEN=ghp_xxx npm run build:publish
```

This produces:
- `Hum.ai-1.0.2-arm64.deb`
- `latest-linux-arm64.yml` (electron-updater manifest)

…and uploads both to a GitHub release. Pis on `1.0.1` notice within 4 hours,
download in the background, show the banner, and install on next quit.

### Required: set the GitHub repo

`electron-app/electron-builder.yml` currently has placeholders:
```yaml
publish:
  provider: github
  owner: YOUR_GITHUB_USER
  repo: YOUR_REPO_NAME
```
Replace these before your first publish.

---

## Environment variables

The shipped `.env.example` documents every variable. The required ones for a
working device:

| Variable | Source | Purpose |
|----------|--------|---------|
| `API_BASE_URL` | Pre-filled in `.env.example` | Cloud api-server URL |
| `DEVICE_ID` | Auto-set by SetupPage | UUID identifying this Pi |
| `DEVICE_SECRET` | Auto-set by SetupPage | Auth header for `/edge/v1/...` |
| `PROVISION_TOKEN` | Operator types into SetupPage | Shared admin secret |
| `REGION_CODE` | Operator picks in SetupPage | Region this Pi belongs to |
| `MQTT_HOST` / `MQTT_PORT` | Pre-filled | Telemetry broker |

Roboflow keys (`ROBOFLOW_*`) are only needed if the Pi uploads training
images directly. The api-server has its own copies for forwarded uploads —
the production flow doesn't need them on the Pi.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| Splash hangs forever | `~/.config/Hum.ai/.env` missing or `API_BASE_URL` empty | Re-run postinstall: `sudo dpkg-reconfigure Hum.ai` or copy `env.example` manually |
| "Cannot reach the server" on Home | Pi has no internet, or api-server is down | Check `curl https://hum-ai-api.onrender.com/edge/v1/devices/regions` |
| Capture button does nothing | Not on Pi hardware, or `capture.sh` permissions | `chmod +x scripts/capture.sh` and check `journalctl -u hum-ai` |
| Auto-updates never trigger | `publish.owner`/`repo` still placeholder, or no release published | Set them in `electron-builder.yml` and run `npm run build:publish` |
| MQTT telemetry missing in dashboard | `mqtt_agent.py` not running | `journalctl -u hum-ai-mqtt -f` (or check the sidecar logs in Electron) |

Logs:
```bash
journalctl -u hum-ai -f                          # Electron / kiosk
~/.config/Hum.ai/logs/                           # app logs
```

---

## See also

- `CLAUDE.md` — guidance for working on this codebase with Claude Code
- `electron-app/CLAUDE.md` — Electron app conventions
- Cloud api-server: `../api-server/`
- Migration history / decisions: `~/.claude/plans/plan-first-i-want-ethereal-shannon.md`
