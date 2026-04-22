// CameraPreview is no longer used by the Electron UI.
//
// Reason: /preview/frame spawns `rpicam-still` every 800ms, which competes
// directly with real captures for exclusive camera access on the Pi 3. The
// component was also collapsed (rendered nothing) on every non-Pi environment
// because rpicam-still doesn't exist there.
//
// The Flask /preview/frame endpoint is intentionally kept alive because
// mqtt_agent.py uses it to stream frames to the dashboard over MQTT.
//
// If hardware-accelerated MJPEG streaming is added to the Flask backend in
// future (e.g. via a libcamera streaming server), this component can be
// reinstated with a plain <img src={mjpegUrl} /> — no polling loop needed.

export {}
