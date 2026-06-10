import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { exec, spawn } from 'child_process'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import http from 'http'


const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ports = JSON.parse(fs.readFileSync(path.join(__dirname, 'ports.json'), 'utf8'))

const parseSharePointXml = (xmlStr) => {
  const items = [];
  let pos = 0;
  while (true) {
    const entryStart = xmlStr.indexOf('<entry>', pos);
    if (entryStart === -1) break;
    
    let entryEnd = -1;
    let depth = 0;
    let scanPos = entryStart;
    while (scanPos < xmlStr.length) {
      const nextOpen = xmlStr.indexOf('<entry>', scanPos);
      const nextClose = xmlStr.indexOf('</entry>', scanPos);
      if (nextClose === -1) break;
      if (nextOpen !== -1 && nextOpen < nextClose) {
        depth++;
        scanPos = nextOpen + 7;
      } else {
        depth--;
        if (depth === 0) {
          entryEnd = nextClose + 8;
          break;
        }
        scanPos = nextClose + 8;
      }
    }
    if (entryEnd === -1) {
      pos = entryStart + 7;
      continue;
    }
    const entryContent = xmlStr.substring(entryStart, entryEnd);
    const titleMatch = entryContent.match(/<d:Title[^>]*>([\s\S]*?)<\/d:Title>/);
    const urlMatch = entryContent.match(/<d:Url[^>]*>([\s\S]*?)<\/d:Url>/);
    const idMatch = entryContent.match(/<d:Id[^>]*>([\s\S]*?)<\/d:Id>/);
    
    if (titleMatch && urlMatch) {
      const title = titleMatch[1].replace(/&amp;/g, '&').trim();
      const url = urlMatch[1].trim();
      const id = idMatch ? idMatch[1].trim() : '';
      
      const item = { id, title, url, children: [] };
      const inlineStart = entryContent.indexOf('<m:inline>');
      const inlineEnd = entryContent.indexOf('</m:inline>');
      if (inlineStart !== -1 && inlineEnd !== -1) {
        const inlineContent = entryContent.substring(inlineStart + 10, inlineEnd);
        item.children = parseSharePointXml(inlineContent);
      }
      items.push(item);
    }
    pos = entryEnd;
  }
  return items;
};

const flattenSharePointItems = (items, prefix = '') => {
  let flat = [];
  items.forEach((item) => {
    const fullTitle = prefix ? `${prefix} > ${item.title}` : item.title;
    if (item.url && item.url !== 'http://linkless.header/') {
      flat.push({
        title: fullTitle,
        url: item.url,
        type: 'CONCEPT'
      });
    }
    if (item.children && item.children.length > 0) {
      flat = flat.concat(flattenSharePointItems(item.children, item.title));
    }
  });
  return flat;
};

const findNodeInTreeByUrl = (nodes, siteUrl) => {
  const targetPath = siteUrl.toLowerCase().replace(/https?:\/\/turntown\.sharepoint\.com/, '').trim();
  for (const node of nodes) {
    const nodePath = node.url.toLowerCase().replace(/https?:\/\/turntown\.sharepoint\.com/, '').trim();
    if (nodePath && targetPath && (nodePath === targetPath || nodePath.includes(targetPath) || targetPath.includes(nodePath))) {
      return node;
    }
    if (node.children && node.children.length > 0) {
      const found = findNodeInTreeByUrl(node.children, siteUrl);
      if (found) return found;
    }
  }
  return null;
};

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

const tunnelPlugin = () => {
  let tunnelProcess = null;
  let tunnelUrl = 'https://simon-ims.ngrok-free.app';
  let tunnelStatus = 'disconnected';
  let tunnelError = '';
  let tunnelLogs = [];

  const getNgrokAuthToken = () => {
    try {
      const envPath = path.join(__dirname, '.env');
      if (fs.existsSync(envPath)) {
        const envContent = fs.readFileSync(envPath, 'utf8');
        const match = envContent.match(/NGROK_AUTHTOKEN\s*=\s*(.*)/);
        if (match) {
          return match[1].trim().replace(/^["']|["']$/g, '');
        }
      }
    } catch (e) {
      console.error('Error reading NGROK_AUTHTOKEN from .env:', e);
    }
    return '';
  };

  const fetchTunnelUrl = () => {
    return new Promise((resolve) => {
      http.get('http://127.0.0.1:4040/api/tunnels', (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            if (parsed.tunnels && parsed.tunnels.length > 0) {
              resolve(parsed.tunnels[0].public_url);
              return;
            }
          } catch (e) {
            // ignore
          }
          resolve(null);
        });
      }).on('error', () => {
        resolve(null);
      });
    });
  };

  return {
    name: 'tunnel-plugin',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url === '/api/tunnel/status') {
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({
            status: tunnelStatus,
            url: tunnelUrl,
            error: tunnelError,
            logs: tunnelLogs.slice(-20)
          }));
        } else if (req.url === '/api/tunnel/start' && req.method === 'POST') {
          res.setHeader('Content-Type', 'application/json');
          if (tunnelProcess) {
            res.end(JSON.stringify({ success: true, status: tunnelStatus, url: tunnelUrl }));
            return;
          }

          try {
            tunnelStatus = 'connecting';
            tunnelError = '';
            tunnelLogs = [`[System] Starting ngrok Tunnel to port ${ports.ims.port}...`];

            const authtoken = getNgrokAuthToken();
            const spawnEnv = { ...process.env };
            if (authtoken) {
              spawnEnv.NGROK_AUTHTOKEN = authtoken;
              tunnelLogs.push('[System] Custom NGROK_AUTHTOKEN environment variable loaded.');
            } else {
              tunnelLogs.push('[System] Warning: No NGROK_AUTHTOKEN found in .env file.');
            }

            // Spawn ngrok CLI with custom static URL
            tunnelProcess = spawn('ngrok', [
              'http',
              ports.ims.port.toString(),
              '--url=https://simon-ims.ngrok-free.app'
            ], { env: spawnEnv });

            let checkCount = 0;
            const checkInterval = setInterval(async () => {
              if (!tunnelProcess) {
                clearInterval(checkInterval);
                return;
              }
              const url = await fetchTunnelUrl();
              if (url) {
                tunnelUrl = url;
                tunnelStatus = 'connected';
                tunnelLogs.push(`[System] Tunnel running at: ${tunnelUrl}`);
                clearInterval(checkInterval);
              } else if (checkCount > 15) {
                clearInterval(checkInterval);
                if (tunnelStatus === 'connecting') {
                  tunnelStatus = 'error';
                  tunnelError = 'Timed out waiting for ngrok public URL';
                  tunnelLogs.push('[System] Error: Timed out waiting for ngrok public URL');
                }
              }
              checkCount++;
            }, 1000);

            tunnelProcess.stdout.on('data', (data) => {
              tunnelLogs.push(data.toString());
              if (tunnelLogs.length > 100) tunnelLogs.shift();
            });

            tunnelProcess.stderr.on('data', (data) => {
              tunnelLogs.push(data.toString());
              if (tunnelLogs.length > 100) tunnelLogs.shift();
            });

            tunnelProcess.on('close', (code) => {
              tunnelProcess = null;
              tunnelStatus = 'disconnected';
              tunnelLogs.push(`[System] Process closed with exit code ${code}`);
            });

            tunnelProcess.on('error', (err) => {
              tunnelStatus = 'error';
              tunnelError = err.message;
              tunnelProcess = null;
              tunnelLogs.push(`[System] Error: ${err.message}`);
            });

            res.end(JSON.stringify({ success: true, status: tunnelStatus }));
          } catch (e) {
            tunnelStatus = 'error';
            tunnelError = e.message;
            tunnelProcess = null;
            res.statusCode = 500;
            res.end(JSON.stringify({ error: e.message }));
          }
        } else if (req.url === '/api/tunnel/stop' && req.method === 'POST') {
          res.setHeader('Content-Type', 'application/json');
          if (tunnelProcess) {
            tunnelLogs.push('[System] Stopping ngrok tunnel...');
            tunnelProcess.kill('SIGKILL');
            tunnelProcess = null;
            tunnelStatus = 'disconnected';
          }
          res.end(JSON.stringify({ success: true, status: 'disconnected' }));
        } else {
          next();
        }
      });

      server.httpServer?.on('close', () => {
        if (tunnelProcess) {
          try {
            tunnelProcess.kill('SIGKILL');
          } catch (e) {
            // ignore
          }
        }
      });
    }
  };
};

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), backupPlugin(), tunnelPlugin()],
  server: {
    host: true,
    port: ports.ims.port,
    strictPort: false,
    allowedHosts: [
      'simon-ims.ngrok-free.app',
      '.ngrok-free.app',
      '.ngrok.io',
      'localhost',
      '127.0.0.1'
    ],
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
