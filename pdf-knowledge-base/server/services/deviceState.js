// Live state reported by the Box-3 that other parts of the server need.
//  micMuted - the top button: MIC MUTED is Ims's "stay silent and don't listen" mode, so nothing
//             should make him speak anywhere (the web app's doorbell voice included).
let micMuted = false;
let connected = false;

export function setDeviceMicMuted(v) { micMuted = !!v; }
export function setDeviceConnected(v) { connected = !!v; if (!connected) micMuted = false; }
// Only counts while the device is actually connected.
export const isDeviceMicMuted = () => connected && micMuted;
