import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { exec } from 'child_process'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ports = JSON.parse(fs.readFileSync(path.join(__dirname, 'ports.json'), 'utf8'))

const backupPlugin = () => ({
  name: 'backup-plugin',
  configureServer(server) {
    server.middlewares.use((req, res, next) => {
      if (req.url === '/api/backup') {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupDir = "D:/Information management system/backups";
        const zipFile = `${backupDir}/hive_mesh_checkpoint_${timestamp}.zip`;
        
        const psCommand = `
          if (!(Test-Path '${backupDir}')) { New-Item -ItemType Directory -Path '${backupDir}' };
          Compress-Archive -Path src, index.html, package.json, tailwind.config.js, vite.config.js, public -DestinationPath '${zipFile}' -Force
        `.trim().replace(/\n/g, ' ');

        exec(`powershell.exe -NoProfile -Command "${psCommand}"`, (err, stdout, stderr) => {
          res.setHeader('Content-Type', 'application/json');
          if (err) {
            console.error('Backup Engine Error:', stderr);
            res.statusCode = 500;
            res.end(JSON.stringify({ error: err.message, details: stderr }));
          } else {
            res.end(JSON.stringify({ success: true, file: zipFile }));
          }
        });
      } else {
        next();
      }
    });
  }
});

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), backupPlugin()],
  server: {
    host: true,
    port: ports.ims.port,
    strictPort: false,
    proxy: {
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
