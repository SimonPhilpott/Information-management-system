import db from './db/database.js';

const count = db.prepare('SELECT COUNT(*) as count FROM documents').get();
console.log('Total documents:', count.count);

const auth = db.prepare('SELECT * FROM oauth_tokens WHERE id = 1').get();
console.log('Auth email:', auth?.user_email);
console.log('Has refresh token:', !!auth?.refresh_token);
