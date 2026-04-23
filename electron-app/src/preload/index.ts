import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// Custom APIs for renderer
const api = {
  openExternal: (url: string): Promise<void> => ipcRenderer.invoke('open-external', url),
  getFlaskUrl: (): Promise<string> => ipcRenderer.invoke('get-flask-url'),
  getDataRoot: (): Promise<string> => ipcRenderer.invoke('get-data-root'),

  saveConfig: (fields: Record<string, string>): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke('save-config', fields),

  getConfig: (): Promise<Record<string, string>> => ipcRenderer.invoke('get-config'),

  // GPIO IPC bridge
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
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
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
