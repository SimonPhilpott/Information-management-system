// Service worker for installing IMS as an app on a phone. It deliberately caches nothing and has
// no fetch handler: IMS is live data (voice, glucose, calendar) behind a sign-in, so every request
// goes straight to the network and an update to the app shows up on the next open.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
