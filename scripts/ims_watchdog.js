/**
 * IMS Autonomous Watchdog & Cloud Remote Control Daemon
 *
 * Runs on the host PC independently of the web apps.
 * 1. Subscribes to ntfy.sh/ims-cmd-78009e9382f1a6cb61 via SSE for remote commands from Simon's phone.
 * 2. Executes remote restarts even if Ngrok, Vite, or Express are dead (Out-of-Band Cloud Relay).
 * 3. Probes ports 6001, 3001, 3002, 3003 and the public Ngrok URL every 45 seconds for self-healing.
 */

import net from 'net';
import { exec, spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');

const CMD_TOPIC = 'ims-cmd-78009e9382f1a6cb61';
const NOTIFY_TOPIC = 'ims-run-78009e9382f1a6cb61';
const NTFY_SERVER = 'https://ntfy.sh';
const NGROK_URL = 'https://simon-ims.ngrok-free.app';

let consecutiveFailures = {
  ngrok: 0,
  mainUi: 0,
  server: 0
};

let lastRestartTime = 0;

async function notifyPhone({ title, message, priority = 4, tags = 'robot', actions = null }) {
  try {
    const cleanTitle = Buffer.from(title).toString('latin1') === title ? title : encodeURIComponent(title);
    const headers = {
      'Title': cleanTitle,
      'Priority': String(priority),
      'Tags': tags
    };
    if (actions) headers['Actions'] = actions;

    await fetch(`${NTFY_SERVER}/${NOTIFY_TOPIC}`, {
      method: 'POST',
      body: message,
      headers
    });
    console.log(`[Watchdog] 📲 Sent notification to phone: "${title}"`);
  } catch (err) {
    console.error('[Watchdog] Failed to push notification:', err.message);
  }
}

function probePort(host, port, timeoutMs = 1000) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(timeoutMs);

    socket.on('connect', () => {
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

async function probeNgrok() {
  try {
    const res = await fetch(NGROK_URL, {
      signal: AbortSignal.timeout(4000),
      headers: { 'ngrok-skip-browser-warning': '1' }
    });
    // Ngrok is online if it answers with any valid HTTP status < 502
    return res.status < 502;
  } catch (_) {
    return false;
  }
}

function restartAllServices() {
  const now = Date.now();
  if (now - lastRestartTime < 30000) {
    console.log('[Watchdog] Restart debounced (already triggered <30s ago).');
    return;
  }
  lastRestartTime = now;
  console.log('[Watchdog] 🔄 Executing full service restart cycle...');

  // Terminate other node processes (exclude self) and ngrok cleanly
  const myPid = process.pid;
  const psKill = `Get-Process -Name node -ErrorAction SilentlyContinue | Where-Object { $_.Id -ne ${myPid} } | Stop-Process -Force -ErrorAction SilentlyContinue; Stop-Process -Name ngrok -Force -ErrorAction SilentlyContinue`;

  exec(`powershell -NoProfile -Command "${psKill}"`, () => {
    setTimeout(() => {
      spawn('cmd.exe', ['/c', 'start-all.bat'], {
        cwd: PROJECT_ROOT,
        detached: true,
        stdio: 'ignore'
      }).unref();

      notifyPhone({
        title: '🔄 IMS Restarted',
        message: 'All services and the Ngrok tunnel have been restarted from your phone.',
        tags: 'white_check_mark,gear',
        priority: 4,
        actions: 'view, Open Side Dock, ims-dock://open'
      });
    }, 2000);
  });
}

function restartNgrokTunnel() {
  console.log('[Watchdog] 🔄 Restarting Ngrok tunnel...');
  exec('taskkill /f /im ngrok.exe', () => {
    setTimeout(() => {
      spawn('cmd.exe', ['/c', 'ngrok http 6001 --url=https://simon-ims.ngrok-free.app'], {
        cwd: PROJECT_ROOT,
        detached: true,
        stdio: 'ignore'
      }).unref();

      notifyPhone({
        title: '🔄 Ngrok Rebound',
        message: 'Ngrok tunnel restarted on https://simon-ims.ngrok-free.app',
        tags: 'globe_with_meridians,recycle',
        priority: 3,
        actions: 'view, Open Side Dock, ims-dock://open'
      });
    }, 1000);
  });
}

function restartTargetPort(port) {
  console.log(`[Watchdog] 🔄 Restarting target port ${port}...`);
  const psCmd = `Get-NetTCPConnection -LocalPort ${port} -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }`;
  exec(`powershell -NoProfile -Command "${psCmd}"`, () => {
    setTimeout(() => {
      if (port === '6001') {
        spawn('cmd.exe', ['/c', 'npm run dev'], { cwd: PROJECT_ROOT, detached: true, stdio: 'ignore' }).unref();
      } else if (['3001', '3002', '3003'].includes(String(port))) {
        spawn('cmd.exe', ['/c', 'npm run dev:server'], { cwd: path.join(PROJECT_ROOT, 'pdf-knowledge-base'), detached: true, stdio: 'ignore' }).unref();
      }
      notifyPhone({
        title: `🔄 Port ${port} Restarted`,
        message: `Process on Port ${port} has been rebound.`,
        tags: 'hammer_and_wrench',
        priority: 3
      });
    }, 1000);
  });
}

async function handleRemoteCommand(rawCmd) {
  const cmd = String(rawCmd || '').trim().toLowerCase();
  console.log(`[Watchdog] 📥 Received cloud command: "${cmd}"`);

  if (cmd.includes('restart-all') || cmd.includes('restart all') || cmd === 'restart') {
    restartAllServices();
  } else if (cmd.includes('restart-ngrok') || cmd.includes('restart ngrok')) {
    restartNgrokTunnel();
  } else if (cmd.includes('restart-port') || cmd.includes('port')) {
    const m = cmd.match(/\b(6001|3001|3002|3003|3232)\b/);
    if (m) restartTargetPort(m[1]);
  } else if (cmd === 'status' || cmd === 'ping') {
    const p6001 = await probePort('127.0.0.1', 6001);
    const p3001 = await probePort('127.0.0.1', 3001);
    const p3002 = await probePort('127.0.0.1', 3002);
    const ngrokOk = await probeNgrok();

    notifyPhone({
      title: '📊 IMS Status Report',
      message: `UI: ${p6001 ? '🟢' : '🔴'} | Server: ${p3001 ? '🟢' : '🔴'} | Audio: ${p3002 ? '🟢' : '🔴'} | Ngrok: ${ngrokOk ? '🟢' : '🔴'}`,
      tags: 'satellite',
      priority: 3,
      actions: 'http, Restart All, https://ntfy.sh/' + CMD_TOPIC + ', method=POST, body=restart-all'
    });
  }
}

/**
 * Connect to ntfy cloud SSE stream for remote phone instructions
 */
async function connectCommandStream() {
  const streamUrl = `${NTFY_SERVER}/${CMD_TOPIC}/sse`;
  console.log(`[Watchdog] 🛰️ Connecting to cloud control relay: ${streamUrl}`);

  try {
    const res = await fetch(streamUrl, {
      headers: { 'Accept': 'text/event-stream' }
    });

    if (!res.ok) throw new Error(`ntfy returned status ${res.status}`);

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop(); // keep remainder

      for (const line of lines) {
        if (line.startsWith('data:')) {
          try {
            const data = JSON.parse(line.slice(5).trim());
            if (data.event === 'message' && data.message) {
              handleRemoteCommand(data.message);
            }
          } catch (_) {}
        }
      }
    }
  } catch (err) {
    console.error(`[Watchdog] Cloud control stream disconnected: ${err.message}. Retrying in 5s...`);
  }

  setTimeout(connectCommandStream, 5000);
}

/**
 * Autonomous Health Probe Loop (Every 45 seconds)
 */
async function runHealthCheck() {
  try {
    const [p6001, p3001, ngrokOk] = await Promise.all([
      probePort('127.0.0.1', 6001, 1000),
      probePort('127.0.0.1', 3001, 1000),
      probeNgrok()
    ]);

    if (!p6001) consecutiveFailures.mainUi++;
    else consecutiveFailures.mainUi = 0;

    if (!p3001) consecutiveFailures.server++;
    else consecutiveFailures.server = 0;

    if (!ngrokOk) consecutiveFailures.ngrok++;
    else consecutiveFailures.ngrok = 0;

    // Self-healing trigger: 2 consecutive failures
    if (consecutiveFailures.ngrok >= 2 || consecutiveFailures.mainUi >= 2 || consecutiveFailures.server >= 2) {
      console.warn('[Watchdog] ⚠️ Service failure threshold reached. Triggering autonomous self-healing...');
      consecutiveFailures.ngrok = 0;
      consecutiveFailures.mainUi = 0;
      consecutiveFailures.server = 0;

      notifyPhone({
        title: '⚠️ IMS Watchdog: Self-Healing Triggered',
        message: 'A backend port or Ngrok tunnel was unresponsive. Automatically restarting services now.',
        tags: 'warning,recycle',
        priority: 4,
        actions: 'view, Open Side Dock, ims-dock://open; http, Force Restart All, https://ntfy.sh/' + CMD_TOPIC + ', method=POST, body=restart-all'
      });

      restartAllServices();
    }
  } catch (err) {
    console.error('[Watchdog] Error during health check:', err.message);
  }
}

// Start Daemon
console.log('====================================================');
console.log('  IMS Autonomous Watchdog & Cloud Relay Started');
console.log(`  Cloud Control Topic: ${CMD_TOPIC}`);
console.log(`  Notification Topic:  ${NOTIFY_TOPIC}`);
console.log('====================================================');

connectCommandStream();
setInterval(runHealthCheck, 45000);
