/// <reference types="vite/client" />

// Types for this app's VITE_* environment variables (read via import.meta.env)
interface ImportMetaEnv {
  /** Address of the product app, e.g. https://app.example.com/ */
  readonly VITE_APP_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
