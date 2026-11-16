import { fileURLToPath, URL } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import { tanstackRouter } from '@tanstack/router-plugin/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// The product app (dashboard, emissions, ...). The marketing site is apps/site.
// https://vite.dev/config/
export default defineConfig({
  plugins: [
    // File-based routing: every file in src/routes/ is a page. The plugin keeps
    // src/routeTree.gen.ts up to date. It must come before the React plugin.
    tanstackRouter({ target: 'react', autoCodeSplitting: true }),
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      // Shared UI package, used straight from its source (no build step)
      '@hub/ui': fileURLToPath(new URL('../../packages/ui/src', import.meta.url)),
    },
  },
  server: {
    // 5173 is the marketing site; the app runs next to it
    port: 5174,
    // In development, forward /api/* calls to the Hono API so the browser
    // sees one origin (no CORS setup needed, cookies just work).
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3000',
        // Adds X-Forwarded-For with the browser's address, so the API can rate
        // limit per client (it trusts exactly one proxy hop in development).
        xfwd: true,
      },
    },
  },
  preview: {
    port: 4174,
  },
})
