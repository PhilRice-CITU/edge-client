import { app, shell, BrowserWindow, ipcMain, screen, protocol, net } from 'electron'
import { join } from 'path'
import { writeFileSync, readFileSync, existsSync, readdirSync } from 'fs'
import { spawn } from 'child_process'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { autoUpdater } from 'electron-updater'
import icon from '../../resources/icon.png?asset'

import { loadEnv, getConfig, ENV_PATH, PYTHON_ROOT, DATA_ROOT, SCRIPTS_ROOT } from './env'
import { spawnSidecar, shutdownAll } from './sidecar'
import { startGpioPoller, stopGpioPoller, setGpioMode } from './gpio'

// Lock userData to "Hum.ai" regardless of how the OS derives it from package.json name.
// On Linux, app.getPath('userData') defaults to ~/.config/hum-ai (lowercase) which
// doesn't match the path seeded by after-install.sh (~/.config/Hum.ai).
app.setPath('userData', join(app.getPath('appData'), 'Hum.ai'))

// Must be called before app.whenReady() — registers the custom protocol
protocol.registerSchemesAsPrivileged([
  { scheme: 'local-image', privileges: { secure: true, supportFetchAPI: true } },
])

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

function setupAutoUpdater(win: BrowserWindow): void {
  if (!app.isPackaged) return
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.on('update-available', (info) => {
    win.webContents.send('update:available', info.version)
  })
  autoUpdater.on('update-downloaded', (info) => {
    win.webContents.send('update:downloaded', info.version)
  })
  autoUpdater.on('error', (err) => {
    console.error('[updater]', err.message)
  })
  autoUpdater.checkForUpdates()
  setInterval(() => autoUpdater.checkForUpdates(), 4 * 60 * 60 * 1000)
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

  const { mkdirSync } = await import('fs')
  mkdirSync(config.IMAGE_DIR, { recursive: true })
  mkdirSync(config.LOG_DIR, { recursive: true })

  // Serve Pi-local JPEG files through a safe custom protocol.
  // Renderer uses local-image:///absolute/path/to/file.jpg in <img> tags.
  protocol.handle('local-image', (req) => {
    const filePath = decodeURIComponent(new URL(req.url).pathname)
    if (!filePath.startsWith(config.IMAGE_DIR)) {
      return new Response('Forbidden', { status: 403 })
    }
    return net.fetch(`file://${filePath}`)
  })

  // ── IPC handlers ────────────────────────────────────────────────────────────

  ipcMain.handle('open-external', (_, url: string) => shell.openExternal(url))

  ipcMain.handle('get-data-root', () => DATA_ROOT)

  // Device identity — renderer uses these to build X-Device-ID / X-Device-Secret headers
  ipcMain.handle('get-device-id', () => config.DEVICE_ID)
  ipcMain.handle('get-device-secret', () => config.DEVICE_SECRET)
  ipcMain.handle('get-api-base-url', () => config.API_BASE_URL)

  // Local filesystem stats (images on disk + upload queue depth)
  ipcMain.handle('get-local-stats', () => {
    const imageDir = config.IMAGE_DIR
    const images = existsSync(imageDir)
      ? readdirSync(imageDir).filter((f) => f.endsWith('.jpg')).length
      : 0
    let queued = 0
    const queueFile = join(DATA_ROOT, 'upload_queue.json')
    if (existsSync(queueFile)) {
      try {
        queued = (JSON.parse(readFileSync(queueFile, 'utf-8')) as unknown[]).length
      } catch {
        queued = 0
      }
    }
    return { images_on_disk: images, queued_uploads: queued }
  })

  // Run capture.sh --once, returns { ir_path, white_path } parsed from stdout JSON
  ipcMain.handle('capture:run', () => {
    return new Promise<{ ir_path: string; white_path: string }>((resolve, reject) => {
      const child = spawn('bash', [join(SCRIPTS_ROOT, 'capture.sh'), '--once'], {
        env: process.env as Record<string, string>,
      })
      let out = ''
      let err = ''
      child.stdout.on('data', (d: Buffer) => {
        out += d.toString()
      })
      child.stderr.on('data', (d: Buffer) => {
        err += d.toString()
      })
      child.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(err.slice(-500) || `capture.sh exited ${code}`))
          return
        }
        try {
          resolve(JSON.parse(out.trim()) as { ir_path: string; white_path: string })
        } catch {
          reject(new Error(`Bad capture output: ${out.slice(0, 200)}`))
        }
      })
      child.on('error', reject)
    })
  })

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

  ipcMain.handle('update:install-now', () => autoUpdater.quitAndInstall())

  ipcMain.on('gpio:set-mode', (_, mode: string) => {
    if (mode === 'training' || mode === 'session' || mode === 'idle') {
      setGpioMode(mode)
    }
  })

  // ── Sidecars ────────────────────────────────────────────────────────────────

  // Flask is gone — only the MQTT agent runs as a sidecar
  console.log('[main] Starting Python sidecar...')
  spawnSidecar('mqtt-agent', join(PYTHON_ROOT, 'mqtt_agent.py'))
  console.log('[main] Sidecar started')

  // ── Window ──────────────────────────────────────────────────────────────────

  const mainWindow = createWindow()
  startGpioPoller(mainWindow)
  setupAutoUpdater(mainWindow)

  if (config.EDGE_MODE === 'training') {
    setGpioMode('training')
  }

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
