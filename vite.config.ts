import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

const root = path.dirname(fileURLToPath(import.meta.url))

function sessionPlugin(): Plugin {
  const file = path.join(root, 'session.json')
  const middleware = (
    req: { url?: string },
    res: { setHeader: (k: string, v: string) => void; end: (d: string | Buffer) => void },
    next: () => void,
  ) => {
    const url = req.url?.split('?')[0]
    if (url !== '/session.json') {
      next()
      return
    }
    if (!fs.existsSync(file)) {
      next()
      return
    }
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.setHeader('Cache-Control', 'no-store')
    res.end(fs.readFileSync(file))
  }
  return {
    name: 'session-json',
    configureServer(server) {
      server.middlewares.use(middleware)
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware)
    },
  }
}

export default defineConfig({
  base: './',
  plugins: [react(), sessionPlugin()],
  assetsInclude: ['**/*.wasm'],
  optimizeDeps: { exclude: ['sql.js'] },
  server: {
    host: '127.0.0.1',
    port: 8765,
    strictPort: true,
    proxy: {
      '/memo-api': {
        target: 'http://127.0.0.1:5280',
        changeOrigin: true,
        timeout: 300_000,
        proxyTimeout: 300_000,
        rewrite: (p) => p.replace(/^\/memo-api/, '') || '/',
      },
    },
  },
  preview: {
    host: '127.0.0.1',
    port: 8765,
    strictPort: true,
    proxy: {
      '/memo-api': {
        target: 'http://127.0.0.1:5280',
        changeOrigin: true,
        timeout: 300_000,
        proxyTimeout: 300_000,
        rewrite: (p) => p.replace(/^\/memo-api/, '') || '/',
      },
    },
  },
})
