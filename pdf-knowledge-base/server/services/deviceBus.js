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
