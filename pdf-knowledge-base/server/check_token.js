import db from './db/database.js';

const token = db.prepare('SELECT * FROM oauth_tokens WHERE id = 1').get();
console.log('Token data:', {
  ...token,
  access_token: token.access_token.substring(0, 10) + '...',
  refresh_token: token.refresh_token ? token.refresh_token.substring(0, 10) + '...' : 'MISSING'
});
