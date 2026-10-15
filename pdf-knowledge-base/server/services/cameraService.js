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
// Recording a call or meeting: no camera activity at all. The device is told
// to stop its camera (deviceAwakeWanted is false), any frame still arriving is
// dropped, the last picture is forgotten, and Look / Faces / desk presence all
// see "no frame" until the recording stops.
import { isRecordingActive, onRecordingChange } from './recordingService.js';
import { getSetting, setSetting } from '../db/database.js';

const ATTACHED_WINDOW_MS = 30000; // > the 15s device status-push cadence, so the icon doesn't flicker
export const AWAKE_MS = 10 * 60 * 1000; // 10 minutes idle sleep (refreshed by presence, interaction, or vision Q&A)

// Desk hours (UK time): the camera stays on so desk presence can see Simon leave and come back - otherwise it
// slept 10 minutes after he left and never saw him return, so no "Hello Simon". Outside a wake (someone at the
// desk, a look, a tap) it runs "idle": the Box-3 sends about one picture a second instead of six, sparing the
// Wi-Fi Ims's voice uses. Everything it sees is processed on this PC. Set on /ims/look (Camera hours); saved
// as the camera_desk_hours setting. Simon's starting hours (13 Oct): weekdays 08:00-18:00, weekends 09:00-21:00.
const DEFAULT_DESK_HOURS = { weekday: { on: true, from: '08:00', until: '18:00' }, weekend: { on: true, from: '09:00', until: '21:00' } };
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const minutesOf = (hhmm) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

export function getDeskHours() {
  let saved = null;
  try { saved = JSON.parse(getSetting('camera_desk_hours') || 'null'); } catch (_) { }
  const out = {};
  for (const k of ['weekday', 'weekend']) {
    const d = DEFAULT_DESK_HOURS[k], v = saved?.[k] || {};
    out[k] = { on: typeof v.on === 'boolean' ? v.on : d.on, from: HHMM.test(v.from) ? v.from : d.from, until: HHMM.test(v.until) ? v.until : d.until };
  }
  return out;
}

export function setDeskHours(hours) {
  const clean = {};
  for (const k of ['weekday', 'weekend']) {
    const v = hours?.[k];
    if (!v || typeof v.on !== 'boolean' || !HHMM.test(v.from) || !HHMM.test(v.until)) throw new Error(`Give ${k === 'weekday' ? 'weekday' : 'weekend'} hours as on/off and HH:MM times.`);
    if (v.on && minutesOf(v.until) <= minutesOf(v.from)) throw new Error(`${k === 'weekday' ? 'Weekday' : 'Weekend'} hours must finish after they start.`);
    clean[k] = { on: v.on, from: v.from, until: v.until };
  }
  setSetting('camera_desk_hours', JSON.stringify(clean));
  notifyCameraChange(); // the Box-3 is told at once
  return getDeskHours();
}

export function inDeskHours(date = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(date).map((x) => [x.type, x.value]));
  const day = getDeskHours()[['Sat', 'Sun'].includes(parts.weekday) ? 'weekend' : 'weekday'];
  if (!day.on) return false;
  const now = Number(parts.hour) * 60 + Number(parts.minute);
  return now >= minutesOf(day.from) && now < minutesOf(day.until);
}

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

onRecordingChange((status) => {
  if (status?.active ?? isRecordingActive()) latest = { buffer: null, at: 0, source: null };
  notifyCameraChange();
});

// The last few seconds of frames, for questions about movement (waving, pointing, nodding): one still can't
// show an action (15 Oct: "what am I doing right now?" while waving).
let recentFrames = []; // { buffer, at }
export function setFrame(buffer, source = 'unknown') {
  if (isRecordingActive()) return;
  latest = { buffer, at: Date.now(), source };
  recentFrames.push({ buffer, at: latest.at });
  if (recentFrames.length > 40) recentFrames.shift();
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

// Wakes the camera (or extends its awake period) for another AWAKE_MS, at full speed (~6 pictures a second)
// for the next minute: someone is using a picture - Ims looking, the live view, a tap on the camera icon.
// Full speed only then: at ~6 uploads a second all the time the Box-3's Wi-Fi couldn't keep up with Ims's voice
// link as well, and it dropped and reconnected about once a minute (13 Oct, "Connecting to IMS backend").
// 12 s, not 60 (15 Oct): full speed is for a look, and every second of it competes with Ims's voice link. The
// Box-3 also switches to 640x480 for it (320x240 otherwise).
const FULL_SPEED_MS = 12 * 1000;
let fullSpeedUntil = 0;
export function wakeCamera() {
  awakeUntil = Date.now() + AWAKE_MS;
  fullSpeedUntil = Date.now() + FULL_SPEED_MS;
  notifyCameraChange();
}
// Keeps the camera awake without asking for full speed - desk presence while someone is at the desk: about
// one picture a second is enough for the eyes to follow and for the sit-down hello.
export function keepCameraAwake() {
  awakeUntil = Date.now() + AWAKE_MS;
}

// Camera off for a while, whatever the hours or who's at the desk (POST /api/camera/pause {minutes}; 0 resumes)
let pausedUntil = 0;
export function pauseCamera(minutes) {
  pausedUntil = minutes > 0 ? Date.now() + Math.min(24 * 60, minutes) * 60000 : 0;
  notifyCameraChange();
  return pausedUntil ? new Date(pausedUntil).toISOString() : null;
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

/** A burst of frames over the next `ms` (camera at full speed), `count` of them evenly spaced in time order.
 *  Includes the second or so just before, so a wave that started as he asked is caught too. */
export async function captureBurst({ ms = 2500, count = 8 } = {}) {
  if (isRecordingActive()) return [];
  await getSharpFrame(2500); // the switch to full size first
  const start = Date.now() - 1000;
  await new Promise((r) => setTimeout(r, ms));
  let pool = recentFrames.filter((f) => f.at >= start);
  const sharp = pool.filter((f) => jpegWidth(f.buffer) >= 600); // the Box-3 switches to 640x480 for a look
  if (sharp.length >= 3) pool = sharp;
  if (pool.length <= count) return pool;
  const step = (pool.length - 1) / (count - 1);
  return Array.from({ length: count }, (_, i) => pool[Math.round(i * step)]);
}

// A JPEG's width, from its start-of-frame marker (0 if it can't be read)
export function jpegWidth(buf) {
  try {
    for (let i = 2; i + 9 < buf.length;) {
      if (buf[i] !== 0xff) { i++; continue; }
      const m = buf[i + 1];
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return buf.readUInt16BE(i + 7);
      i += 2 + buf.readUInt16BE(i + 2);
    }
  } catch (_) { /* not a readable JPEG */ }
  return 0;
}
/** For a look: wake the camera to full size and wait (up to `ms`) for a 640-wide picture; else the latest. */
export async function getSharpFrame(ms = 3000) {
  wakeCamera();
  const asked = Date.now();
  while (Date.now() - asked < ms) {
    if (latest.buffer && latest.at > asked && jpegWidth(latest.buffer) >= 600) break;
    await new Promise((r) => setTimeout(r, 100));
  }
  return getFrame();
}

export function getFrame() {
  if (isRecordingActive()) return null;
  return latest.buffer ? { buffer: latest.buffer, at: latest.at, source: latest.source } : null;
}

export function getCameraStatus() {
  const now = Date.now();
  const attached = Boolean((latest.buffer && now - latest.at < ATTACHED_WINDOW_MS) || (heartbeatAt && now - heartbeatAt < ATTACHED_WINDOW_MS));
  const recording = isRecordingActive();
  const woken = now < awakeUntil;
  const fullSpeed = now < fullSpeedUntil;
  const deskHours = inDeskHours();
  const paused = now < pausedUntil;
  const isAwake = (woken || deskHours) && !recording && !paused;
  return {
    attached,
    awake: attached && isAwake,
    deviceAwakeWanted: isAwake,
    idle: isAwake && !fullSpeed, // about one picture a second unless a picture is being used right now
    deskHours,
    pausedUntil: paused ? new Date(pausedUntil).toISOString() : null,
    sleepsInSeconds: isAwake ? Math.round((awakeUntil - now) / 1000) : 0,
    lastFrameAt: latest.buffer ? new Date(latest.at).toISOString() : null,
    lastHeartbeatAt: heartbeatAt ? new Date(heartbeatAt).toISOString() : null,
    source: latest.source,
    isAwakeRequested: isAwake,
    recording,
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
