// Thin wrapper that caches device identity from IPC and builds edge API URLs + auth headers.
// Call initDeviceConfig() once at app startup (e.g. in main.tsx) before any hooks fire.

let _deviceId = ''
let _deviceSecret = ''
let _apiBaseUrl = ''
let _ready = false

export async function initDeviceConfig(): Promise<void> {
  if (_ready) return
  _deviceId = await window.api.getDeviceId()
  _deviceSecret = await window.api.getDeviceSecret()
  _apiBaseUrl = (await window.api.getApiBaseUrl()).replace(/\/$/, '')
  _ready = true
}

export function edgeHeaders(): HeadersInit {
  return {
    'X-Device-ID': _deviceId,
    'X-Device-Secret': _deviceSecret,
  }
}

export function apiUrl(path: string): string {
  return `${_apiBaseUrl}/edge/v1${path}`
}

export function getDeviceId(): string {
  return _deviceId
}
