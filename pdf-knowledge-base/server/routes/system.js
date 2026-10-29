import { Router } from 'express';
import net from 'net';
import { exec, spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { pushPhoneNotification } from '../services/runAlertsService.js';
import { getAntigravityQuotas } from '../services/aiQuotaService.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '../../..');

const router = Router();

router.get('/ai-quotas', (req, res) => {
  res.json(getAntigravityQuotas());
});

const PORTS = [
  { id: '6001', name: 'IMS Main UI', port: 6001, host: '127.0.0.1' },
  { id: '3001', name: 'PDF KB API Server', port: 3001, host: '127.0.0.1' },
  { id: '3002', name: 'Hardware Raw TCP (Box-3)', port: 3002, host: '127.0.0.1' },
  { id: '3003', name: 'Device HTTP / Camera', port: 3003, host: '127.0.0.1' },
  { id: '3232', name: 'ESP32 Wi-Fi OTA', port: 3232, host: '192.168.1.92' }
];

function probePort(host, port, timeoutMs = 800) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let status = false;
    socket.setTimeout(timeoutMs);

    socket.on('connect', () => {
      status = true;
      socket.destroy();
      resolve(true);
    });

    socket.on('timeout', () => {
      socket.destroy();
      resolve(false);
    });

    socket.on('error', () => {
      socket.destroy();
      resolve(false);
    });

    socket.connect(port, host);
  });
}

/**
 * GET /api/system/ports
 * Returns live status of all system ports and Ngrok tunnel
 */
router.get('/ports', async (req, res) => {
  try {
    const portResults = await Promise.all(
      PORTS.map(async (p) => {
        const isListening = await probePort(p.host, p.port, p.id === '3232' ? 1200 : 600);
        return {
          id: p.id,
          name: p.name,
          port: p.port,
          host: p.host,
          status: isListening ? 'online' : 'offline'
        };
      })
    );

    // Probe public ngrok address
    let ngrokOnline = false;
    try {
      const ngrokRes = await fetch('https://simon-ims.ngrok-free.app/api/health', {
        signal: AbortSignal.timeout(2500),
        headers: { 'ngrok-skip-browser-warning': '1' }
      }).catch(() => null);
      ngrokOnline = Boolean(ngrokRes && ngrokRes.status < 500);
    } catch (_) {
      ngrokOnline = false;
    }

    res.json({
      success: true,
      timestamp: Date.now(),
      ports: portResults,
      ngrok: {
        url: 'https://simon-ims.ngrok-free.app',
        status: ngrokOnline ? 'online' : 'offline'
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/system/restart/:target
 * Targets: 'all' | 'ngrok' | '3001' | '3002' | '3003' | '6001'
 */
router.post('/restart/:target', async (req, res) => {
  const { target } = req.params;
  console.log(`[SystemControl] Received remote restart request for target: "${target}"`);

  if (target === 'all') {
    // Send immediate response before executing restart cycle
    res.json({ success: true, message: 'Restarting all IMS services on host...' });

    // Spawn PowerShell to execute start-all.bat cleanly in a detached process
    setTimeout(() => {
      spawn('cmd.exe', ['/c', 'start-all.bat'], {
        cwd: PROJECT_ROOT,
        detached: true,
        stdio: 'ignore'
      }).unref();
    }, 500);
    return;
  }

  if (target === 'ngrok') {
    exec('taskkill /f /im ngrok.exe', () => {
      setTimeout(() => {
        spawn('cmd.exe', ['/c', 'ngrok http 6001 --url=https://simon-ims.ngrok-free.app'], {
          cwd: PROJECT_ROOT,
          detached: true,
          stdio: 'ignore'
        }).unref();
      }, 1000);
    });
    return res.json({ success: true, message: 'Restarting Ngrok tunnel...' });
  }

  if (['6001', '3001', '3002', '3003'].includes(target)) {
    // Terminate process on specified port
    const psCmd = `Get-NetTCPConnection -LocalPort ${target} -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }`;
    exec(`powershell -NoProfile -Command "${psCmd}"`, () => {
      console.log(`[SystemControl] Port ${target} process terminated.`);
      if (target === '6001') {
        spawn('cmd.exe', ['/c', 'npm run dev'], {
          cwd: PROJECT_ROOT,
          detached: true,
          stdio: 'ignore'
        }).unref();
      } else if (target === '3001' || target === '3002' || target === '3003') {
        spawn('cmd.exe', ['/c', 'npm run dev:server'], {
          cwd: path.join(PROJECT_ROOT, 'pdf-knowledge-base'),
          detached: true,
          stdio: 'ignore'
        }).unref();
      }
    });
    return res.json({ success: true, message: `Port ${target} reset triggered.` });
  }

  res.status(400).json({ success: false, error: `Unknown restart target: ${target}` });
});

export default router;
