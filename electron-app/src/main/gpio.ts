import { execSync } from 'child_process'
import { BrowserWindow, globalShortcut } from 'electron'

const BUTTON_PIN = 27
const POLL_INTERVAL_MS = 100

type GpioMode = 'idle' | 'training' | 'session'

let currentMode: GpioMode = 'idle'
let pollTimer: ReturnType<typeof setInterval> | null = null
let targetWindow: BrowserWindow | null = null
let pinctrlAvailable = true
let buttonHeld = false

function tryPinctrl(args: string): string | null {
  if (!pinctrlAvailable) return null
  try {
    return execSync(`pinctrl ${args}`, { encoding: 'utf-8', timeout: 2000 }).trim()
  } catch (err: unknown) {
    const error = err as NodeJS.ErrnoException & { stderr?: string }
    const msg = error.message ?? ''
    // Treat any "command not found" variant as a permanent unavailability
    if (
      error.code === 'ENOENT' ||
      msg.includes('command not found') ||
      msg.includes('not found') ||
      msg.includes('No such file')
    ) {
      pinctrlAvailable = false
      console.warn('[gpio] pinctrl not found — GPIO polling disabled (non-Pi environment)')
      return null
    }
    console.warn(`[gpio] pinctrl error: ${error.message}`)
    return null
  }
}

function readButtonState(): 'hi' | 'lo' | null {
  const output = tryPinctrl(`get ${BUTTON_PIN}`)
  if (!output) return null

  if (output.includes('lo')) return 'lo'
  if (output.includes('hi')) return 'hi'
  return null
}

function emitButtonPressed(): void {
  if (!targetWindow || targetWindow.isDestroyed()) return
  console.log(`[gpio] Button pressed — mode=${currentMode}`)
  targetWindow.webContents.send('gpio:button-pressed')
}

function pollTick(): void {
  if (currentMode === 'idle') return

  const state = readButtonState()
  if (state === null) return

  if (state === 'lo' && !buttonHeld) {
    buttonHeld = true
    emitButtonPressed()
  } else if (state === 'hi' && buttonHeld) {
    buttonHeld = false
  }
}

export function startGpioPoller(window: BrowserWindow): void {
  targetWindow = window

  const setupResult = tryPinctrl(`set ${BUTTON_PIN} ip pu`)
  if (setupResult === null && !pinctrlAvailable) {
    console.log('[gpio] Skipping GPIO setup (pinctrl unavailable)')
    console.log('[gpio] Dev mode: press F9 to simulate GPIO button press')

    try {
      globalShortcut.register('F9', () => {
        if (currentMode !== 'idle') {
          console.log(`[gpio] F9 pressed — simulating GPIO button (mode=${currentMode})`)
          emitButtonPressed()
        } else {
          console.log('[gpio] F9 pressed — ignored (mode=idle)')
        }
      })
    } catch (err) {
      console.warn(`[gpio] Failed to register F9 shortcut: ${err}`)
    }
    return
  }

  console.log(`[gpio] Pin ${BUTTON_PIN} configured as input with pull-up`)

  pollTimer = setInterval(pollTick, POLL_INTERVAL_MS)
  console.log(`[gpio] Polling started (${POLL_INTERVAL_MS}ms interval)`)
}

export function stopGpioPoller(): void {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
    console.log('[gpio] Polling stopped')
  }
  globalShortcut.unregisterAll()
  targetWindow = null
  buttonHeld = false
  currentMode = 'idle'
}

export function setGpioMode(mode: GpioMode): void {
  if (mode !== currentMode) {
    console.log(`[gpio] Mode changed: ${currentMode} → ${mode}`)
    currentMode = mode
    buttonHeld = false
  }
}
