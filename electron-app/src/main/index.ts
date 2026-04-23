import { app, shell, BrowserWindow, ipcMain, screen } from 'electron'
import { join } from 'path'
import { writeFileSync, readFileSync, existsSync } from 'fs'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'

import { loadEnv, getConfig, ENV_PATH, PYTHON_ROOT, DATA_ROOT } from './env'

import { spawnSidecar, waitForHealth, shutdownAll } from './sidecar'
import { startGpioPoller, stopGpioPoller, setGpioMode } from './gpio'

function createWindow(): BrowserWindow {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize

  const mainWindow = new BrowserWindow({
    width: Math.max(width, 800),
    height: Math.max(height, 480),
    minWidth: 800,
    minHeight: 480,
    resizable: true,
    frame: true,
    show: false,
    autoHideMenuBar: true,
    icon,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
    },
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return mainWindow
}

app.whenReady().then(async () => {
  loadEnv()
  const config = getConfig()

  electronApp.setAppUserModelId('com.ricevision.humai')

  if (process.platform === 'darwin' && app.dock) {
    app.dock.setIcon(icon)
  }

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // ── Ensure runtime data directories exist ─────────────────────────────────
  const { mkdirSync } = await import('fs')
  mkdirSync(config.IMAGE_DIR, { recursive: true })
  mkdirSync(config.LOG_DIR, { recursive: true })

  // ── Start Python sidecars ─────────────────────────────────────────────────
  console.log('[main] Starting Python sidecars...')

  spawnSidecar('flask', join(PYTHON_ROOT, 'app.py'))
  try {
    await waitForHealth(`http://127.0.0.1:${config.FLASK_PORT}/health`)
  } catch (err) {
    console.error(`[main] Flask health check failed: ${err}`)
  }

  spawnSidecar('mqtt-agent', join(PYTHON_ROOT, 'mqtt_agent.py'))
  console.log('[main] All sidecars started')

  // ── IPC handlers ──────────────────────────────────────────────────────────
  ipcMain.handle('open-external', (_, url: string) => shell.openExternal(url))

  ipcMain.handle('get-flask-url', () => `http://127.0.0.1:${config.FLASK_PORT}`)

  ipcMain.handle('get-data-root', () => DATA_ROOT)

  // GPIO mode control from renderer pages
  ipcMain.on('gpio:set-mode', (_, mode: string) => {
    if (mode === 'training' || mode === 'session' || mode === 'idle') {
      setGpioMode(mode)
    }
  })

  // Save config fields to the userData .env file
  ipcMain.handle('save-config', (_, fields: Record<string, string>) => {
    try {
      let text = existsSync(ENV_PATH) ? readFileSync(ENV_PATH, 'utf-8') : ''
      for (const [key, value] of Object.entries(fields)) {
        const line = `${key}=${value}`
        const regex = new RegExp(`^${key}\\s*=.*$`, 'm')
        if (regex.test(text)) {
          text = text.replace(regex, line)
        } else {
          text = text.trimEnd() + `\n${line}\n`
        }
      }
      writeFileSync(ENV_PATH, text, 'utf-8')
      return { ok: true }
    } catch (err) {
      console.error('[main] save-config failed:', err)
      return { ok: false, error: String(err) }
    }
  })

  // Expose current config snapshot to renderer (for Settings page prefill)
  ipcMain.handle('get-config', () => {
    const cfg = getConfig()
    return {
      API_BASE_URL: cfg.API_BASE_URL,
      MQTT_HOST: cfg.MQTT_HOST,
      MQTT_PORT: String(cfg.MQTT_PORT),
      EDGE_MODE: cfg.EDGE_MODE,
      ROBOFLOW_API_KEY: cfg.ROBOFLOW_API_KEY,
      ROBOFLOW_WORKSPACE: cfg.ROBOFLOW_WORKSPACE,
      ROBOFLOW_PROJECT_NORMAL: cfg.ROBOFLOW_PROJECT_NORMAL,
      ROBOFLOW_PROJECT_IR: cfg.ROBOFLOW_PROJECT_IR,
    }
  })

  // ── Create window + GPIO ──────────────────────────────────────────────────
  const mainWindow = createWindow()
  startGpioPoller(mainWindow)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('before-quit', () => {
  console.log('[main] Shutting down...')
  stopGpioPoller()
  shutdownAll()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})