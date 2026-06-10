import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { exec } from 'child_process'

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
    port: 5173,
    strictPort: false,
    watch: {
      ignored: ['**/backups/**']
    }
  }
})
