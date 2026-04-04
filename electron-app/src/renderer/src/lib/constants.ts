// Flask API runs on the same host as Electron (localhost).
// In dev the renderer uses window.api.getFlaskUrl() via IPC; in prod this default applies.
export const FLASK_PORT = 5055
export const FLASK_BASE_URL = `http://127.0.0.1:${FLASK_PORT}`

// How often to poll for device status (ms)
export const STATUS_POLL_INTERVAL = 5_000

// How often to poll a session while waiting for grade (ms)
export const SESSION_POLL_INTERVAL = 2_000

// Minimum time to show the splash screen before navigating (ms)
export const SPLASH_DURATION_MS = 2_000
