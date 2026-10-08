// Holds the most recent camera frame (JPEG) and the camera's state, which
// drives the camera icon on the IMS footer:
//   attached - a camera is present: frames or a device heartbeat arrived
//              recently. Attached but not awake = YELLOW icon.
//   awake    - the camera has been woken and is ready: GREEN icon. It is woken
//              when IMS boots, when someone asks IMS what it can see, and
//              whenever /ims/look or /ims/faces is used, and it goes back to
//              sleep after AWAKE_MS with no further use.
// The device is told the state on every status push; when its camera driver
// exists it should start streaming on "awake" and suspend the UVC stream on
// "asleep". Until then this tracks the same lifecycle for frames arriving from
// any source (device, the browser's webcam, uploads). Frames live in memory
// only - nothing is written to disk unless the user takes a snapshot.
const ATTACHED_WINDOW_MS = 30000; // > the 15s device status-push cadence, so the icon doesn't flicker
export const AWAKE_MS = 24 * 60 * 60 * 1000; // Keep camera permanently hot for active testing

let latest = { buffer: null, at: 0, source: null };
let heartbeatAt = 0;
let awakeUntil = Date.now() + AWAKE_MS; // Start hot

const cameraListeners = new Set();
const mjpegClients = new Set();

export function onCameraChange(listener) {
  if (typeof listener === 'function') {
    cameraListeners.add(listener);
    return () => cameraListeners.delete(listener);
  }
}

function notifyCameraChange() {
  for (const l of cameraListeners) {
    try { l(); } catch (_) { }
  }
}

export function streamMjpeg(req, res) {
  res.writeHead(200, {
    'Content-Type': 'multipart/x-mixed-replace; boundary=frame',
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'Connection': 'close',
    'Pragma': 'no-cache'
  });

  if (latest.buffer) {
    try {
      res.write(`--frame\r\nContent-Type: image/jpeg\r\nContent-Length: ${latest.buffer.length}\r\n\r\n`);
      res.write(latest.buffer);
      res.write('\r\n');
    } catch (_) {}
  }

  mjpegClients.add(res);

  req.on('close', () => {
    mjpegClients.delete(res);
  });
}

export function setFrame(buffer, source = 'unknown') {
  latest = { buffer, at: Date.now(), source };
  notifyCameraChange();

  if (mjpegClients.size > 0) {
    const header = Buffer.from(`--frame\r\nContent-Type: image/jpeg\r\nContent-Length: ${buffer.length}\r\n\r\n`);
    const footer = Buffer.from('\r\n');
    for (const client of mjpegClients) {
      try {
        client.write(header);
        client.write(buffer);
        client.write(footer);
      } catch (_) {
        mjpegClients.delete(client);
      }
    }
  }
}

// Wakes the camera (or extends its awake period) for another AWAKE_MS.
export function wakeCamera() {
  awakeUntil = Date.now() + AWAKE_MS;
  notifyCameraChange();
}
// Anything that uses the camera counts as a reason to keep it awake.
export const markInUse = wakeCamera;

// A device with a camera plugged in reports here. `boot` is sent once as the
// device (re)starts, which always initialises - and so wakes - the camera.
export function heartbeat({ boot = false } = {}) {
  heartbeatAt = Date.now();
  if (boot) wakeCamera();
  else notifyCameraChange();
}

export function getFrame() {
  return latest.buffer ? { buffer: latest.buffer, at: latest.at, source: latest.source } : null;
}

export function getCameraStatus() {
  const now = Date.now();
  const attached = Boolean((latest.buffer && now - latest.at < ATTACHED_WINDOW_MS) || (heartbeatAt && now - heartbeatAt < ATTACHED_WINDOW_MS));
  const isAwake = now < awakeUntil;
  return {
    attached,
    awake: attached && isAwake,
    deviceAwakeWanted: isAwake,
    sleepsInSeconds: isAwake ? Math.round((awakeUntil - now) / 1000) : 0,
    lastFrameAt: latest.buffer ? new Date(latest.at).toISOString() : null,
    lastHeartbeatAt: heartbeatAt ? new Date(heartbeatAt).toISOString() : null,
    source: latest.source,
    isAwakeRequested: isAwake,
    recentLogs: readDeviceLog(5)
  };
}

// Diagnostic lines the box posts about its camera (USB enumeration, stream
// formats, errors). Needed because while the camera is running the box is
// powered from the dock, not the PC, so there is no serial port to read.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const DEVICE_LOG = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data', 'camera_device.log');

export function appendDeviceLog(text) {
  fs.mkdirSync(path.dirname(DEVICE_LOG), { recursive: true });
  const line = `[${new Date().toISOString()}] ${String(text).trim()}\n`;
  fs.appendFileSync(DEVICE_LOG, line);
  console.log('[CameraDevice]', String(text).trim());
}

export function readDeviceLog(maxLines = 200) {
  try {
    return fs.readFileSync(DEVICE_LOG, 'utf8').split('\n').filter(Boolean).slice(-maxLines);
  } catch (_) {
    return [];
  }
}
