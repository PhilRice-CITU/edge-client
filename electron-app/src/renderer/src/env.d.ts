/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_EDGE_MODE: 'production' | 'training'
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
