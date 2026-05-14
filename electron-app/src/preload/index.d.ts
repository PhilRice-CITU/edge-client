import { ElectronAPI } from '@electron-toolkit/preload'

declare global {
  interface Window {
    electron: ElectronAPI
    api: {
      openExternal: (url: string) => Promise<void>
      getDataRoot: () => Promise<string>
      getDeviceId: () => Promise<string>
      getDeviceSecret: () => Promise<string>
      getApiBaseUrl: () => Promise<string>
      getLocalStats: () => Promise<{ images_on_disk: number; queued_uploads: number }>
      runCapture: () => Promise<{ ir_path: string; white_path: string }>
      deleteFiles: (paths: string[]) => Promise<void>
      saveConfig: (fields: Record<string, string>) => Promise<{ ok: boolean; error?: string }>
      getConfig: () => Promise<Record<string, string>>
      getRoboflowConfig: () => Promise<{
        apiKey: string
        workspace: string
        projectNormal: string
        projectIr: string
      }>
      onGpioButtonPressed: (cb: () => void) => () => void
      setGpioMode: (mode: 'training' | 'session' | 'idle') => void
      onUpdateAvailable: (cb: (version: string) => void) => () => void
      onUpdateDownloaded: (cb: (version: string) => void) => () => void
      installUpdate: () => Promise<void>
    }
  }
}
