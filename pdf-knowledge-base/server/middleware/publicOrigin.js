// The address the browser is really using. Behind ngrok (and Vite's proxy) the server itself
// only sees localhost, so the original host and protocol come from the forwarded headers.
// Only ngrok addresses (or the one named in NGROK_DOMAIN) are trusted - anything else is
// treated as "local" (null) so a forged Host header cannot point a login at another site.
const NGROK_RE = /^https:\/\/[a-z0-9-]+\.(?:ngrok-free\.(?:app|dev)|ngrok\.(?:app|dev|io))$/i;

export function publicOrigin(req) {
  const first = (v) => String(v || '').split(',')[0].trim();
  const host = first(req.headers['x-forwarded-host']) || first(req.headers.host);
  if (!host) return null;
  const proto = first(req.headers['x-forwarded-proto']) || 'http';
  const origin = `${proto}://${host}`.toLowerCase();
  const custom = process.env.NGROK_DOMAIN ? `https://${process.env.NGROK_DOMAIN}`.toLowerCase() : null;
  return NGROK_RE.test(origin) || origin === custom ? origin : null;
}

// A same-site path to come back to after signing in (never an external address).
export function safeReturnPath(p) {
  const s = String(p || '');
  return s.startsWith('/') && !s.startsWith('//') && !s.includes('\\') && s.length < 200 ? s : '/';
}
