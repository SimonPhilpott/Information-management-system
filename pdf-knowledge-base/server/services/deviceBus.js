import { EventEmitter } from 'events';

// A tiny pub/sub so route files can push a message to the connected IMS device
// without importing index.js (which owns the device socket, and imports the
// routes - a circular import). index.js subscribes once; routes just emit.
const bus = new EventEmitter();
export const pushToDevice = (message) => bus.emit('push', message);
export const onDevicePush = (handler) => bus.on('push', handler);
// "Re-send the status icons now" (e.g. after a calendar rule changes).
export const pushScheduleNow = () => bus.emit('schedule');
export const onSchedulePush = (handler) => bus.on('schedule', handler);

// "Record a few seconds from the device microphone" (the Wake and Stop Phrases page). index.js
// answers with the raw 16 kHz PCM the device streamed.
export const requestDeviceCapture = (seconds) => new Promise((resolve, reject) => {
  if (!bus.listenerCount('capture')) return reject(new Error('The IMS device is not connected.'));
  bus.emit('capture', { seconds, resolve, reject });
});
export const onDeviceCapture = (handler) => bus.on('capture', handler);
// "Stop now" - the Stop button on the phrases page ends the recording early
export const stopDeviceCapture = () => bus.emit('captureStop');
export const onDeviceCaptureStop = (handler) => bus.on('captureStop', handler);

// A phrase-recording session (the Phrases page): while it lasts, Ims ignores wake phrases - including the
// 3-2-1 countdown and the gaps between recordings - so he doesn't answer the phrases being recorded. Each
// recording renews it; it ends 3 minutes after the last one, or when the page ends it. (Simon, 15 Oct)
const PHRASE_SESSION_MS = 3 * 60000;
let phraseSessionUntil = 0;
export const startPhraseSession = () => { phraseSessionUntil = Date.now() + PHRASE_SESSION_MS; return phraseSessionStatus(); };
export const endPhraseSession = () => { phraseSessionUntil = 0; return phraseSessionStatus(); };
export const isPhraseSession = () => Date.now() < phraseSessionUntil;
export const phraseSessionStatus = () => ({ active: isPhraseSession(), until: isPhraseSession() ? phraseSessionUntil : null });
