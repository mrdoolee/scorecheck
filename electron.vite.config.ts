import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'

// Shown in the footer so a teacher can tell which version they run when asking for help.
const appVersion = (JSON.parse(readFileSync(resolve('package.json'), 'utf8')) as { version: string }).version

export default defineConfig({
  main: {
    build: {
      // SheetJS, pdf-lib and qrcode are bundled into main. pdf.js stays external (its worker is loaded from node_modules).
      externalizeDeps: { exclude: ['xlsx', 'pdf-lib', 'qrcode'] }
    },
    resolve: { alias: { '@core': resolve('src/core') } }
  },
  preload: {},
  renderer: {
    define: { __APP_VERSION__: JSON.stringify(appVersion) },
    resolve: { alias: { '@core': resolve('src/core') } },
    plugins: [react()]
  }
})
