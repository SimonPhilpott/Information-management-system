import { Router } from 'express';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import localOnly from '../middleware/localOnly.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '../../..');

const getPorts = () => {
  try {
    const portsPath = path.join(projectRoot, 'ports.json');
    if (fs.existsSync(portsPath)) {
      return JSON.parse(fs.readFileSync(portsPath, 'utf8'));
    }
  } catch (_) {}
  return {
    ims: { port: 6001 },
    pdf_knowledge_base: { client: { port: 5173 }, server: { port: 3001 } }
  };
};

const probePort = (host, port, reqPath = '/') =>
  new Promise((resolve) => {
    const timeoutId = setTimeout(() => {
      req_.destroy();
      resolve('offline');
    }, 1500);

    const req_ = http.get({ host, port, path: reqPath, headers: { connection: 'close' } }, () => {
      clearTimeout(timeoutId);
      req_.destroy();
      resolve('online');
    });

    req_.on('error', () => {
      clearTimeout(timeoutId);
      resolve('offline');
    });
  });

const probeNgrok = async () => {
  try {
    const status = await new Promise((resolve) => {
      const timeoutId = setTimeout(() => {
        req_.destroy();
        resolve('offline');
      }, 1500);

      const req_ = http.get(
        { host: '127.0.0.1', port: 4040, path: '/api/tunnels', headers: { connection: 'close' } },
        (ngrokRes) => {
          let body = '';
          ngrokRes.on('data', (chunk) => { body += chunk; });
          ngrokRes.on('end', () => {
            clearTimeout(timeoutId);
            try {
              const parsed = JSON.parse(body);
              const hasTunnel = parsed.tunnels?.some(
                (t) => t.public_url?.includes('simon-ims') || t.public_url?.includes('ngrok')
              );
              resolve(hasTunnel ? 'online' : 'offline');
            } catch {
              resolve('online');
            }
          });
        }
      );

      req_.on('error', () => {
        clearTimeout(timeoutId);
        resolve('offline');
      });
    });

    return status;
  } catch {
    return 'offline';
  }
};

const router = Router();
router.use(localOnly);

router.get('/', async (req, res) => {
  const ports = getPorts();
  try {
    const [mainApp, authServer, kbClient, ngrok] = await Promise.all([
      probePort('127.0.0.1', ports.ims?.port || 6001),
      probePort('127.0.0.1', ports.pdf_knowledge_base?.server?.port || 3001, '/api/auth/status'),
      probePort('127.0.0.1', ports.pdf_knowledge_base?.client?.port || 5173),
      probeNgrok()
    ]);

    res.setHeader('Cache-Control', 'no-store');
    res.json({ mainApp, authServer, kbClient, ngrok });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
