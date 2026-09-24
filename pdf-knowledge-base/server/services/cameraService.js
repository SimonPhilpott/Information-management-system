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
export const AWAKE_MS = 10 * 60 * 1000;

let latest = { buffer: null, at: 0, source: null };
let heartbeatAt = 0;
let awakeUntil = 0;

export function setFrame(buffer, source = 'unknown') {
  latest = { buffer, at: Date.now(), source };
}

// Wakes the camera (or extends its awake period) for another AWAKE_MS.
export function wakeCamera() {
  awakeUntil = Date.now() + AWAKE_MS;
}
// Anything that uses the camera counts as a reason to keep it awake.
export const markInUse = wakeCamera;

// A device with a camera plugged in reports here. `boot` is sent once as the
// device (re)starts, which always initialises - and so wakes - the camera.
export function heartbeat({ boot = false } = {}) {
  heartbeatAt = Date.now();
  if (boot) wakeCamera();
}

export function getFrame() {
  return latest.buffer ? { buffer: latest.buffer, at: latest.at, source: latest.source } : null;
}

export function getCameraStatus() {
  const now = Date.now();
  const attached = Boolean((latest.buffer && now - latest.at < ATTACHED_WINDOW_MS) || (heartbeatAt && now - heartbeatAt < ATTACHED_WINDOW_MS));
  const awake = attached && now < awakeUntil;
  return {
    attached,
    awake,
    sleepsInSeconds: awake ? Math.round((awakeUntil - now) / 1000) : 0,
    lastFrameAt: latest.buffer ? new Date(latest.at).toISOString() : null,
    source: latest.source
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
