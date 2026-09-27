import config from '../config.js';

// Strict per-browser sign-in check. Unlike the app-wide requireAdmin in
// index.js (which lets any request through once the SERVER has been authorised
// against Google Drive), this needs THIS request's session to belong to a
// Google account that signed in through the login flow - and, when ADMIN_EMAIL
// is set, to be on that approved list. Used for anything genuinely secret
// (e.g. the Wi-Fi passwords).
export function isApprovedSession(req) {
  const email = req.session?.user?.email;
  if (!email) return false;
  if (!config.adminEmail) return true;
  const approved = config.adminEmail.split(',').map((e) => e.trim().toLowerCase());
  return approved.includes(email.toLowerCase());
}

// Someone the owner invited to the deck builder (routes/auth.js guest sign-in). They only ever get
// the deck builder's API; revoking the invite locks them out on their next request.
export function isGuestSession(req) {
  const u = req.session?.user;
  return Boolean(u?.email && u.role === 'guest' && guestCheck && guestCheck(u.email));
}
let guestCheck = null;
export const setGuestCheck = (fn) => { guestCheck = fn; };

export function requireSession(req, res, next) {
  if (isApprovedSession(req)) return next();
  res.status(401).json({ error: 'Sign in with your Google account to use this.', signInRequired: true });
}
