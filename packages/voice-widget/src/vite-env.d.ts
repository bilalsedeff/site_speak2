/// <reference types="vite/client" />

declare const __APP_VERSION__: string

interface ImportMetaEnv {
  readonly NODE_ENV: string
  readonly VITE_API_ENDPOINT?: string
  readonly VITE_WS_ENDPOINT?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}