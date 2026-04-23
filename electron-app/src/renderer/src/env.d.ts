/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_EDGE_MODE: 'production' | 'training'
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

interface Window {
  api: {
    openExternal: (url: string) => Promise<void>
    getFlaskUrl: () => Promise<string>
    getDataRoot: () => Promise<string>
    saveConfig: (fields: Record<string, string>) => Promise<{ ok: boolean; error?: string }>
    getConfig: () => Promise<Record<string, string>>
    onGpioButtonPressed: (cb: () => void) => () => void
    setGpioMode: (mode: 'training' | 'session' | 'idle') => void
  }
}
