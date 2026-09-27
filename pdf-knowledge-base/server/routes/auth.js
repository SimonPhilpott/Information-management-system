import { Router } from 'express';
import { google } from 'googleapis';
import { createOAuth2Client, storeTokens, getAuthStatus, checkTokenHealth } from '../services/driveService.js';
import config from '../config.js';
import { publicOrigin, safeReturnPath } from '../middleware/publicOrigin.js';
import { isApprovedSession, isGuestSession } from '../middleware/requireSession.js';
import { isInvited, rememberPerson, logSignIn, canonEmail, personName } from '../services/decksService.js';

const router = Router();

// Where to send the browser after the Google round trip: the address it started on, and the page it was on.
const backTo = (req, query) => {
  const base = req.session?.returnBase || config.clientUrl;
  const p = req.session?.returnTo || '/';
  return `${base}${p}${p.includes('?') ? '&' : '?'}${query}`;
};

/**
 * GET /api/auth/url - Generate OAuth consent URL
 */
router.get('/url', (req, res) => {
  // Sign in on the address the browser is actually using: through ngrok that is the ngrok
  // address (which must be listed as an authorised redirect URI in the Google Cloud console),
  // otherwise localhost. The same address is where the browser is sent back afterwards, so the
  // session cookie lands on the right site.
  const origin = publicOrigin(req);
  const dynamicRedirectUri = origin ? `${origin}/api/auth/callback` : config.google.redirectUri;

  // Store the redirect URI in session for the callback
  req.session.redirectUri = dynamicRedirectUri;
  req.session.returnBase = origin || config.clientUrl;
  req.session.returnTo = safeReturnPath(req.query.returnTo);
  
  const oauth2Client = new google.auth.OAuth2(
    config.google.clientId,
    config.google.clientSecret,
    dynamicRedirectUri
  );
  
  // Every sign-in asks Google for name and email only. The Drive and Calendar consent that IMS
  // itself runs on is a second step for the owner alone - when they ask for it (?full=1) or when
  // IMS's Google connection is missing (see the callback) - so nobody else is ever shown it.
  req.session.fullFlow = req.query.full === '1';
  res.json({ url: authUrlFor(oauth2Client, req.session.fullFlow) });
});

const ownerEmails = () => (config.adminEmail ? config.adminEmail.split(',').map(canonEmail) : []);
function authUrlFor(client, full) {
  return full
    ? client.generateAuthUrl({ access_type: 'offline', scope: config.google.scopes, prompt: 'consent', login_hint: ownerEmails()[0] || undefined })
    : client.generateAuthUrl({ scope: ['openid', 'email', 'profile'], prompt: 'select_account' });
}


/**
 * GET /api/auth/callback - Handle OAuth callback
 */
router.get('/callback', async (req, res) => {
  const { code, error } = req.query;

  // Handle user denying access
  if (error) {
    console.warn('[Auth] OAuth error:', error);
    logSignIn(null, 'google-error', error);
    return res.redirect(backTo(req, `auth=error&message=${encodeURIComponent(error)}`));
  }

  if (!code) {
    logSignIn(null, 'no-code', 'Google sent no authorisation code');
    return res.redirect(backTo(req, `auth=error&message=${encodeURIComponent('No authorisation code received')}`));
  }

  // Use the redirect URI stored in the session, or fallback to config
  const redirectUri = req.session?.redirectUri || config.google.redirectUri;

  try {
    const oauth2Client = new google.auth.OAuth2(
      config.google.clientId,
      config.google.clientSecret,
      redirectUri
    );
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    // Get user info
    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
    const userInfo = await oauth2.userinfo.get();
    const userEmail = userInfo.data.email;

    const isOwner = !config.adminEmail || ownerEmails().includes(canonEmail(userEmail));
    const full = Boolean(req.session.fullFlow);
    delete req.session.fullFlow;

    if (!isOwner) {
      // Invited to the deck builder: name and email only, no tokens kept.
      if (!full && isInvited(userEmail)) {
        req.session.user = { email: userEmail, name: userInfo.data.name, picture: userInfo.data.picture, role: 'guest' };
        rememberPerson({ email: userEmail, name: userInfo.data.name, picture: userInfo.data.picture });
        req.session.returnTo = '/campaigns';
        console.log(`[Auth] Deck builder sign-in (guest): ${userEmail}`);
        logSignIn(userEmail, 'signed-in', 'Deck builder guest');
        return res.redirect(backTo(req, 'auth=success'));
      }
      console.warn(`[Auth] Sign-in refused: ${userEmail}`);
      logSignIn(userEmail, 'refused', full ? 'Tried the owner-only Google connection' : 'Not invited - wrong Google account?');
      return res.redirect(backTo(req, `auth=error&message=${encodeURIComponent(`${userEmail} doesn't have access. If you were invited, sign in again and choose the Google account the invite was sent to.`)}`));
    }

    rememberPerson({ email: userEmail, name: userInfo.data.name, picture: userInfo.data.picture }, 'owner');
    // the owner's own name (Simon Philpott), not the Google account's display name
    req.session.user = { email: userEmail, name: personName(userEmail), picture: userInfo.data.picture };

    if (full) {
      storeTokens(tokens, userInfo.data);   // IMS's own Drive/Calendar connection
    } else {
      // The owner signed in with name and email; if IMS has no working Google connection, go straight
      // on to the full consent (their account is pre-selected).
      const status = getAuthStatus();
      if (!status.authenticated || status.authError) {
        req.session.fullFlow = true;
        console.log('[Auth] Owner signed in; Google connection needs renewing - asking for Drive/Calendar consent');
        return res.redirect(authUrlFor(new google.auth.OAuth2(config.google.clientId, config.google.clientSecret, redirectUri), true));
      }
    }

    // Redirect back to client
    res.redirect(backTo(req, "auth=success"));
  } catch (err) {
    console.error('OAuth callback error:', err);
    logSignIn(null, 'error', `${err.message}${req.session?.redirectUri ? '' : ' (no sign-in session - cookie lost between starting and finishing)'}`);
    res.redirect(backTo(req, `auth=error&message=${encodeURIComponent(err.message)}`));
  }
});

/**
 * GET /api/auth/status - Check authentication status
 */
router.get('/status', (req, res) => {
  // Trigger background health check (async, non-blocking)
  checkTokenHealth().catch(err => console.error('[Auth Status] Health check failed:', err));

  const status = getAuthStatus();
  const approvedEmails = config.adminEmail ? config.adminEmail.split(',').map(email => email.trim().toLowerCase()) : [];
  const isAdmin = !config.adminEmail || (status.email && approvedEmails.includes(status.email.toLowerCase()));

  res.json({
    ...status,
    // names come from IMS's own record (e.g. Simon Philpott), not the Google display name
    user: req.session.user ? { ...req.session.user, name: personName(req.session.user.email) || req.session.user.name } : null,
    signedIn: isApprovedSession(req),
    guest: !isApprovedSession(req) && isGuestSession(req),   // an invited deck builder user
    isAuthorized: isAdmin && (!!req.session.user || !!status.email)
  });
});

/**
 * POST /api/auth/logout - Clear tokens
 */
router.post('/logout', async (req, res) => {
  try {
    // Signing out ends this browser's session only; the server keeps its own Google connection
    // so the calendar, Drive and the device carry on working.
    req.session.destroy(() => res.json({ success: true }));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
