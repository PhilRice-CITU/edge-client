import { app } from 'electron'
import { resolve, join } from 'path'
import { config as dotenvConfig } from 'dotenv'

// ── Path resolution: packaged app vs dev ──────────────────────────────────────
// In dev:      Python scripts are siblings of electron-app/ in the repo
// In packaged: Python scripts are bundled as extraResources → resources/python/
export const PYTHON_ROOT = app.isPackaged
  ? join(process.resourcesPath, 'python', 'src')
  : resolve(__dirname, '..', '..', '..', 'src')

export const SCRIPTS_ROOT = app.isPackaged
  ? join(process.resourcesPath, 'python', 'scripts')
  : resolve(__dirname, '..', '..', '..', 'scripts')

// .env lives in userData when packaged (~/.config/hum-ai/.env) so it persists
// across app updates; in dev it stays at the repo root.
export const ENV_PATH = app.isPackaged
  ? join(app.getPath('userData'), '.env')
  : resolve(__dirname, '..', '..', '..', '.env')

// Data directories — writable by the app at runtime
export const DATA_ROOT = app.isPackaged
  ? join(app.getPath('userData'), 'data')
  : resolve(__dirname, '..', '..', '..', 'data')

export interface EdgeConfig {
  DEVICE_ID: string
  DEVICE_SECRET: string
  DEVICE_DISPLAY_NAME: string
  DEVICE_QR_URL: string

  API_BASE_URL: string
  API_UPLOAD_PATH: string
  API_TIMEOUT_SECONDS: number

  FLASK_PORT: number
  IMAGE_DIR: string
  LOG_DIR: string
  CAPTURE_LOCK_FILE: string

  EDGE_MODE: 'production' | 'training'
  PRODUCTION_UPLOAD_TARGET: string
  TRAINING_UPLOAD_TARGET: string

  ROBOFLOW_API_KEY: string
  ROBOFLOW_WORKSPACE: string
  ROBOFLOW_PROJECT_NORMAL: string
  ROBOFLOW_PROJECT_IR: string

  MQTT_HOST: string
  MQTT_PORT: number
}

let _config: EdgeConfig | null = null
let _childEnv: Record<string, string> = {}

export function loadEnv(): void {
  const result = dotenvConfig({ path: ENV_PATH })

  if (result.error) {
    console.warn(`[env] Failed to load ${ENV_PATH}: ${result.error.message}`)
  }

  const env = process.env
  const d = (key: string, fallback: string): string => {
    if (!env[key]) env[key] = fallback
    return env[key]!
  }

  d('FLASK_PORT', '5055')
  d('IMAGE_DIR', join(DATA_ROOT, 'images'))
  d('LOG_DIR', join(DATA_ROOT, 'logs'))
  d('CAPTURE_LOCK_FILE', '/tmp/edge-capture.lock')
  d('EDGE_MODE', 'production')
  d('PRODUCTION_UPLOAD_TARGET', 'api')
  d('TRAINING_UPLOAD_TARGET', 'roboflow')
  d('API_UPLOAD_PATH', '/scans')
  d('API_TIMEOUT_SECONDS', '30')
  d('MQTT_HOST', 'localhost')
  d('MQTT_PORT', '1883')
  d('ROBOFLOW_API_KEY', '')
  d('ROBOFLOW_WORKSPACE', '')
  d('ROBOFLOW_PROJECT_NORMAL', '')
  d('ROBOFLOW_PROJECT_IR', '')

  _config = {
    DEVICE_ID: env['DEVICE_ID'] ?? '',
    DEVICE_SECRET: env['DEVICE_SECRET'] ?? '',
    DEVICE_DISPLAY_NAME: env['DEVICE_DISPLAY_NAME'] ?? '',
    DEVICE_QR_URL: env['DEVICE_QR_URL'] ?? '',

    API_BASE_URL: env['API_BASE_URL'] ?? '',
    API_UPLOAD_PATH: env['API_UPLOAD_PATH']!,
    API_TIMEOUT_SECONDS: parseInt(env['API_TIMEOUT_SECONDS']!, 10),

    FLASK_PORT: parseInt(env['FLASK_PORT']!, 10),
    IMAGE_DIR: env['IMAGE_DIR']!,
    LOG_DIR: env['LOG_DIR']!,
    CAPTURE_LOCK_FILE: env['CAPTURE_LOCK_FILE']!,

    EDGE_MODE: (env['EDGE_MODE'] as 'production' | 'training') ?? 'production',
    PRODUCTION_UPLOAD_TARGET: env['PRODUCTION_UPLOAD_TARGET']!,
    TRAINING_UPLOAD_TARGET: env['TRAINING_UPLOAD_TARGET']!,

    ROBOFLOW_API_KEY: env['ROBOFLOW_API_KEY']!,
    ROBOFLOW_WORKSPACE: env['ROBOFLOW_WORKSPACE']!,
    ROBOFLOW_PROJECT_NORMAL: env['ROBOFLOW_PROJECT_NORMAL']!,
    ROBOFLOW_PROJECT_IR: env['ROBOFLOW_PROJECT_IR']!,

    MQTT_HOST: env['MQTT_HOST']!,
    MQTT_PORT: parseInt(env['MQTT_PORT']!, 10),
  }

  _childEnv = { ...process.env } as Record<string, string>

  console.log(
    `[env] Loaded .env — DEVICE_ID=${_config.DEVICE_ID || '(empty)'} ` +
    `EDGE_MODE=${_config.EDGE_MODE} FLASK_PORT=${_config.FLASK_PORT}`
  )
}

export function getConfig(): EdgeConfig {
  if (!_config) throw new Error('[env] loadEnv() has not been called yet')
  return _config
}

export function getChildEnv(): Record<string, string> {
  return _childEnv
}
