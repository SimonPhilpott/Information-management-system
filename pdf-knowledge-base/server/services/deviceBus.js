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
