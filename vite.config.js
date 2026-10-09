import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ports = JSON.parse(fs.readFileSync(path.join(__dirname, 'ports.json'), 'utf8'))

// Security guard (review of 8 Oct 2026). When the dev server is published over ngrok:
//  1. It serves the frontend app and nothing else: src/, public/, node_modules/ and index.html. Any other real file or
//     folder in the project (the database, server code, logs, backups, firmware...) and any dot-file is "not found".
//  2. Device/internal endpoints only answer requests made on this PC - never ones arriving through the tunnel.
const SERVED_DIRS = ['src', 'public', 'node_modules']
const LOCAL_ONLY = [/^\/api\/(backup|mesh-backups|tunnel|sharepoint-nav)(\/|\?|$)/, /^\/ims\/port-status(\?|$)/]
const isThisPc = (req) => {
  const host = String(req.headers.host || '').replace(/:\d+$/, '').toLowerCase()
  const addr = String(req.socket?.remoteAddress || '')
  return ['localhost', '127.0.0.1', '[::1]'].includes(host) && /^(::1$|127\.|::ffff:127\.)/.test(addr) &&
    !req.headers['x-forwarded-for'] && !req.headers['x-forwarded-host']
}
const notFound = (res) => { res.statusCode = 404; res.setHeader('Content-Type', 'text/plain'); res.end('Not found') }

const securityGuardPlugin = () => ({
  name: 'security-guard',
  configureServer(server) {
    server.middlewares.use((req, res, next) => {
      let p
      try { p = decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/\\/g, '/') } catch { return notFound(res) }
      if (LOCAL_ONLY.some((re) => re.test(req.url)) && !isThisPc(req)) {
        res.statusCode = 403
        res.setHeader('Content-Type', 'text/plain')
        return res.end('Only available on this PC.')
      }
      if (p.split('/').some((seg) => seg === '..' || (seg.startsWith('.') && seg.length > 1 && seg !== '.vite'))) return notFound(res)
      if (p.startsWith('/@fs/')) return /\/node_modules\//.test(p) ? next() : notFound(res)
      if (p === '/' || p.startsWith('/@') || p.startsWith('/api/') || p.startsWith('/__')) return next()
      const rel = path.posix.normalize(p).replace(/^\/+/, '')
      if (rel === 'index.html' || SERVED_DIRS.includes(rel.split('/')[0])) return next()
      // a real file or folder in the project that isn't the app: private
      if (fs.existsSync(path.join(__dirname, rel))) return notFound(res)
      next() // app routes (/ims/...) and public/ assets
    })
  }
})

// https://vite.dev/config/
export default defineConfig({
  plugins: [securityGuardPlugin(), react()],
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      'react-dom/client',
      'framer-motion',
      'lucide-react',
      'clsx',
      'tailwind-merge'
    ]
  },
  server: {
    fs: {
      // second line of defence for Vite's own file serving
      deny: ['.env', '.env.*', '*.{crt,pem,key}', '**/*.db', '**/*.sqlite', '**/pdf-knowledge-base/**', '**/firmware/**', '**/backups/**']
    },
    host: true,
    port: ports.ims.port,
    strictPort: false,
    allowedHosts: [
      'simon-ims.ngrok-free.app',
      '.ngrok-free.app',
      '.ngrok-free.dev', // static domain ends .dev - without it Vite refused every request through ngrok (403)
      '.ngrok.app',
      '.ngrok.dev',
      '.ngrok.io',
      'localhost',
      '127.0.0.1'
    ],
    proxy: {
      '/api/live': {
        target: `ws://127.0.0.1:${ports.pdf_knowledge_base.server.port}`,
        ws: true,
        changeOrigin: true,
        configure: (proxy, _options) => {
          proxy.on('error', (err, _req, _res) => {
            if (err.code !== 'ECONNRESET') {
              console.error('Vite WS Proxy Error:', err);
            }
          });
        }
      },
      '/api/ims-live': {
        target: `ws://127.0.0.1:${ports.pdf_knowledge_base.server.port}`,
        ws: true,
        changeOrigin: true,
        configure: (proxy, _options) => {
          proxy.on('error', (err, _req, _res) => {
            if (err.code !== 'ECONNRESET') {
              console.error('Vite WS Ims Proxy Error:', err);
            }
          });
        }
      },
      '/api/hardware-live': {
        target: `ws://127.0.0.1:${ports.pdf_knowledge_base.server.port}`,
        ws: true,
        changeOrigin: true,
        configure: (proxy, _options) => {
          proxy.on('error', (err, _req, _res) => {
            if (err.code !== 'ECONNRESET') {
              console.error('Vite WS Hardware Proxy Error:', err);
            }
          });
        }
      },
      '/ims/port-status': {
        target: `http://127.0.0.1:${ports.pdf_knowledge_base.server.port}`,
        changeOrigin: true,
        configure: (proxy, _options) => {
          proxy.on('error', (err, _req, _res) => {
            console.error('Vite Port Status Proxy Error:', err);
          });
        }
      },
      '/api': {
        target: `http://127.0.0.1:${ports.pdf_knowledge_base.server.port}`,
        changeOrigin: true,
        configure: (proxy, _options) => {
          proxy.on('error', (err, _req, _res) => {
            console.error('Vite Proxy Error:', err);
          });
        }
      }
    },
    watch: {
      ignored: ['**/backups/**']
    }
  }
})
