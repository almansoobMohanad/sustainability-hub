import { fileURLToPath, URL } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import { tanstackRouter } from '@tanstack/router-plugin/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

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
    },
  },
  server: {
    port: 5173,
    // In development, forward /api/* calls to the Hono API so the browser
    // sees one origin (no CORS setup needed, cookies just work).
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
})
