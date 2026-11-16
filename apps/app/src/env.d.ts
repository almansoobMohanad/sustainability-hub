/// <reference types="vite/client" />

// Types for this app's VITE_* environment variables (read via import.meta.env)
interface ImportMetaEnv {
  /** Address of the public website, e.g. https://example.com/ */
  readonly VITE_SITE_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
