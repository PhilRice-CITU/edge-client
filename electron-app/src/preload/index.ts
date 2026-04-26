import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

const api = {
  openExternal: (url: string): Promise<void> => ipcRenderer.invoke('open-external', url),
  getDataRoot: (): Promise<string> => ipcRenderer.invoke('get-data-root'),

  getDeviceId: (): Promise<string> => ipcRenderer.invoke('get-device-id'),
  getDeviceSecret: (): Promise<string> => ipcRenderer.invoke('get-device-secret'),
  getApiBaseUrl: (): Promise<string> => ipcRenderer.invoke('get-api-base-url'),

  getLocalStats: (): Promise<{ images_on_disk: number; queued_uploads: number }> =>
    ipcRenderer.invoke('get-local-stats'),

  runCapture: (): Promise<{ ir_path: string; white_path: string }> =>
    ipcRenderer.invoke('capture:run'),

  deleteFiles: (paths: string[]): Promise<void> => ipcRenderer.invoke('delete-files', paths),

  saveConfig: (fields: Record<string, string>): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke('save-config', fields),

  getConfig: (): Promise<Record<string, string>> => ipcRenderer.invoke('get-config'),

  onGpioButtonPressed: (cb: () => void): (() => void) => {
    const handler = (): void => cb()
    ipcRenderer.on('gpio:button-pressed', handler)
    return () => {
      ipcRenderer.removeListener('gpio:button-pressed', handler)
    }
  },
  setGpioMode: (mode: 'training' | 'session' | 'idle'): void => {
    ipcRenderer.send('gpio:set-mode', mode)
  },

  // Auto-updater events
  onUpdateAvailable: (cb: (version: string) => void): (() => void) => {
    const handler = (_: Electron.IpcRendererEvent, version: string): void => cb(version)
    ipcRenderer.on('update:available', handler)
    return () => {
      ipcRenderer.removeListener('update:available', handler)
    }
  },
  onUpdateDownloaded: (cb: (version: string) => void): (() => void) => {
    const handler = (_: Electron.IpcRendererEvent, version: string): void => cb(version)
    ipcRenderer.on('update:downloaded', handler)
    return () => {
      ipcRenderer.removeListener('update:downloaded', handler)
    }
  },
  installUpdate: (): Promise<void> => ipcRenderer.invoke('update:install-now'),
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
