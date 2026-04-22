# Edge Client Handoff

Use this if you are handing the edge client to someone else and they need to get it running on a Pi or a dev machine.

## What this repo needs

The edge client is not self-contained. It needs all of these pieces working together:

- The local Flask service on the Pi
- The edge `.env` file with real backend values
- A reachable API server at `API_BASE_URL`
- A working MQTT broker for live presence, telemetry, logs, and commands

If any of those are missing, `startup.sh` will fail fast or the dashboard live stream will return `503`.

## Minimum `.env` values

Start from [`.env.example`](.env.example) and fill in these values at minimum:

- `DEVICE_ID`
- `API_BASE_URL`
- `DEVICE_HOST`
- `MQTT_HOST`
- `MQTT_PORT`

Depending on how the Pi is provisioned, these may also be needed:

- `PROVISION_TOKEN`
- `REGION_CODE`
- `DEVICE_SECRET`

If the device is using training mode, `EDGE_MODE=training` must match `VITE_EDGE_MODE` in `electron-app/.env`.

## MQTT setup

The edge client only knows how to connect to a broker. The API server must also be configured to listen to that same broker, or the dashboard live endpoint will stay at `503`.

### On the edge client

Set these in `edge-client/.env`:

- `MQTT_HOST`
- `MQTT_PORT`
- `MQTT_USERNAME`
- `MQTT_PASSWORD`
- `MQTT_TLS_ENABLED`
- `MQTT_TLS_CA_CERT_PATH`
- `MQTT_TLS_INSECURE`
- `MQTT_TOPIC_PREFIX`
- `MQTT_KEEPALIVE_SECONDS`
- `MQTT_RECONNECT_MIN_SECONDS`
- `MQTT_RECONNECT_MAX_SECONDS`
- `MQTT_TELEMETRY_INTERVAL_SECONDS`
- `MQTT_SCHEMA_VERSION`
- `MQTT_CLIENT_ID`
- `MQTT_CAMERA_MAX_FRAME_BYTES`

At minimum, `MQTT_HOST` and `MQTT_PORT` must point to a broker the Pi can reach.

### On the API server

Set these in `api-server/.env`:

- `MQTT_ENABLED=true`
- `MQTT_HOST`
- `MQTT_PORT`
- `MQTT_USERNAME`
- `MQTT_PASSWORD`
- `MQTT_TLS_ENABLED`
- `MQTT_TLS_CA_CERT_PATH`
- `MQTT_TLS_INSECURE`
- `MQTT_TOPIC_PREFIX`
- `MQTT_KEEPALIVE_SECONDS`
- `MQTT_RECONNECT_MIN_SECONDS`
- `MQTT_RECONNECT_MAX_SECONDS`
- `MQTT_CLIENT_ID`
- `MQTT_SCHEMA_VERSION`
- `MQTT_CAMERA_MAX_FRAME_BYTES`
- `MQTT_CAMERA_STREAM_MAX_FPS`
- `MQTT_CAMERA_STREAM_MIN_DURATION_SECONDS`
- `MQTT_CAMERA_STREAM_MAX_DURATION_SECONDS`

The edge client and API server should use the same broker, topic prefix, and TLS/auth settings.

## How to run it

### On a developer machine

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install flask requests
cp .env.example .env
python3 src/app.py
```

In another terminal:

```bash
cd electron-app
npm install
npm run dev
```

### On the Raspberry Pi

```bash
chmod +x setup.sh
./setup.sh
sudo systemctl start rice-vision
journalctl -u rice-vision -f
```

## How to verify it is healthy

Check the local Flask service first:

```bash
curl http://localhost:5055/health
curl http://localhost:5055/status
```

If the Pi booted through `startup.sh`, also check the logs under `data/logs/`:

- `startup.log`
- `flask.log`
- `uploader.log`
- `mqtt-agent.log`

The most useful failure check is `mqtt-agent.log`. If the MQTT broker, username/password, TLS, or topic prefix is wrong, the MQTT worker will exit early.

## What the current 503 means

If the dashboard calls `/live/events` and gets `503 Service Unavailable`, the API server is telling you the MQTT bridge is not enabled.

That is not the edge client crashing. It means:

- the edge client may still be fine,
- but the API server is not exposing the live MQTT bridge yet,
- so the web dashboard cannot subscribe to live events, or
- the MQTT bridge cannot connect to the broker with the values in `api-server/.env`.

## Common mistakes

- Leaving `API_BASE_URL` as the placeholder value.
- Forgetting `MQTT_HOST` and `MQTT_PORT`.
- Using one `EDGE_MODE` in `.env` and a different `VITE_EDGE_MODE` in `electron-app/.env`.
- Starting the Pi without provisioning a `DEVICE_ID`.
- Expecting live dashboard events to work before the API server MQTT bridge is enabled.
- Using different MQTT brokers or topic prefixes on the edge and API sides.

## Quick handoff checklist

Before sending this to another person, confirm:

- `.env` has real values, not placeholders
- `startup.sh` reaches `mqtt-agent`
- `curl http://localhost:5055/health` returns `{"status":"ok"}`
- `curl http://localhost:5055/status` returns a device object
- The API server is already configured for MQTT if they need live dashboard updates
