import { Router } from 'express';
import { google } from 'googleapis';
import { createOAuth2Client, storeTokens, getAuthStatus } from '../services/driveService.js';
import config from '../config.js';

const router = Router();

/**
 * GET /api/auth/url - Generate OAuth consent URL
 */
router.get('/url', (req, res) => {
  const dynamicRedirectUri = config.google.redirectUri;
  
  // Store the redirect URI in session for the callback
  req.session.redirectUri = dynamicRedirectUri;
  
  const oauth2Client = new google.auth.OAuth2(
    config.google.clientId,
    config.google.clientSecret,
    dynamicRedirectUri
  );
  
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: config.google.scopes,
    prompt: 'consent'
  });
  res.json({ url: authUrl });
});

/**
 * GET /api/auth/callback - Handle OAuth callback
 */
router.get('/callback', async (req, res) => {
  const { code } = req.query;
  if (!code) {
    return res.status(400).send('Missing authorization code');
  }

  // Use the redirect URI stored in the session, or fallback to config
  const redirectUri = req.session.redirectUri || config.google.redirectUri;

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

    // RESTRICTION: Only allow the configured admin email
    if (config.adminEmail && userEmail !== config.adminEmail) {
      console.warn(`Unauthorized login attempt from: ${userEmail}`);
      return res.redirect(`${config.clientUrl}?auth=error&message=${encodeURIComponent('Unauthorized: This application is restricted to a specific user.')}`);
    }

    req.session.user = {
      email: userEmail,
      name: userInfo.data.name,
      picture: userInfo.data.picture
    };

    storeTokens(tokens, userInfo.data);

    // Redirect back to client
    res.redirect(`${config.clientUrl}?auth=success`);
  } catch (err) {
    console.error('OAuth callback error:', err);
    res.redirect(`${config.clientUrl}?auth=error&message=${encodeURIComponent(err.message)}`);
  }
});

/**
 * GET /api/auth/status - Check authentication status
 */
router.get('/status', (req, res) => {
  const status = getAuthStatus();
  const isAdmin = !config.adminEmail || status.email === config.adminEmail;

  res.json({
    ...status,
    user: req.session.user || null,
    isAuthorized: isAdmin && (!!req.session.user || !!status.email)
  });
});

/**
 * POST /api/auth/logout - Clear tokens
 */
router.post('/logout', async (req, res) => {
  try {
    req.session.destroy();
    const { default: db } = await import('../db/database.js');
    db.prepare('DELETE FROM oauth_tokens WHERE id = 1').run();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
