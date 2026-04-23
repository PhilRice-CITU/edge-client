import { spawn, ChildProcess } from 'child_process'
import { createWriteStream, mkdirSync } from 'fs'
import { resolve } from 'path'
import { app } from 'electron'
import { getConfig, getChildEnv } from './env'


interface Sidecar {
  name: string
  process: ChildProcess
  logPath: string
}

const sidecars: Sidecar[] = []

export function spawnSidecar(name: string, scriptPath: string): Sidecar {
  const config = getConfig()
  const logDir = app.isPackaged
    ? resolve(app.getPath('userData'), 'data', 'logs')
    : config.LOG_DIR
  mkdirSync(logDir, { recursive: true })


  const logPath = resolve(logDir, `${name}.log`)
  const logStream = createWriteStream(logPath, { flags: 'a' })

  const child = spawn('python3', [scriptPath], {
    env: getChildEnv(),
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: false,
  })

  child.stdout?.pipe(logStream)
  child.stderr?.pipe(logStream)

  child.on('exit', (code, signal) => {
    console.log(`[sidecar] ${name} exited code=${code} signal=${signal}`)
    logStream.end()
  })

  child.on('error', (err) => {
    console.error(`[sidecar] ${name} spawn error: ${err.message}`)
    logStream.end()
  })

  const sidecar: Sidecar = { name, process: child, logPath }
  sidecars.push(sidecar)

  console.log(`[sidecar] ${name} started (PID ${child.pid}) → ${logPath}`)
  return sidecar
}

export async function waitForHealth(
  url: string,
  retries = 30,
  intervalMs = 1000,
): Promise<void> {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url)
      if (response.ok) {
        console.log(`[sidecar] Health check passed: ${url}`)
        return
      }
    } catch {
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs))
  }
  throw new Error(`[sidecar] Health check failed after ${retries} attempts: ${url}`)
}

export function shutdownAll(): void {
  console.log(`[sidecar] Shutting down ${sidecars.length} sidecar(s)...`)

  for (const sidecar of sidecars) {
    if (sidecar.process.pid && !sidecar.process.killed) {
      try {
        sidecar.process.kill('SIGTERM')
        console.log(`[sidecar] Sent SIGTERM to ${sidecar.name} (PID ${sidecar.process.pid})`)
      } catch (err) {
        console.warn(`[sidecar] Failed to SIGTERM ${sidecar.name}: ${err}`)
      }
    }
  }

  setTimeout(() => {
    for (const sidecar of sidecars) {
      if (sidecar.process.pid && !sidecar.process.killed) {
        try {
          sidecar.process.kill('SIGKILL')
          console.log(`[sidecar] Sent SIGKILL to ${sidecar.name} (PID ${sidecar.process.pid})`)
        } catch {
        }
      }
    }
  }, 5000)
}
