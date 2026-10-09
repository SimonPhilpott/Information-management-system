// Local-only middleware ensuring endpoints (backups, tunnels, SharePoint proxy, port status)
// can only be triggered from the local host, never across an external tunnel (ngrok, cloudflared).

export function isThisPc(req) {
  const host = String(req.headers.host || '').replace(/:\d+$/, '').toLowerCase();
  const addr = String(req.socket?.remoteAddress || '');
  return ['localhost', '127.0.0.1', '[::1]'].includes(host) &&
    /^(::1$|127\.|::ffff:127\.)/.test(addr) &&
    !req.headers['x-forwarded-for'] &&
    !req.headers['x-forwarded-host'];
}

export function localOnly(req, res, next) {
  if (isThisPc(req)) {
    return next();
  }
  res.status(403).json({ error: 'Only available on this PC.' });
}

export default localOnly;
