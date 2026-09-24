import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

// Wi-Fi networks IMS may use. Passwords are ENCRYPTED AT REST (AES-256-GCM,
// a fresh random IV per password, authenticated) - the data file never holds a
// plaintext password, and the API only ever returns one through the explicit
// per-network "reveal" call, which is behind the strict Google sign-in check.
//
// The key lives in server/data/.wifi_key (created on first use, or supply
// WIFI_ENCRYPTION_KEY = 64 hex chars in .env to keep it off the disk entirely).
// Be clear about what this protects: it keeps passwords out of anything that
// copies or leaks the data file on its own (a backup, a stray commit, a screen
// share of the JSON) - it does not protect against someone who already has both
// this machine's data folder and its key. server/data is git-ignored.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'data');
const FILE = path.join(DATA_DIR, 'wifi_networks.json');
const KEY_FILE = path.join(DATA_DIR, '.wifi_key');
const AUDIT_FILE = path.join(DATA_DIR, 'wifi_access.log');

function getKey() {
  const fromEnv = process.env.WIFI_ENCRYPTION_KEY;
  if (fromEnv) {
    if (!/^[0-9a-fA-F]{64}$/.test(fromEnv)) throw new Error('WIFI_ENCRYPTION_KEY must be 64 hex characters.');
    return Buffer.from(fromEnv, 'hex');
  }
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (fs.existsSync(KEY_FILE)) return Buffer.from(fs.readFileSync(KEY_FILE, 'utf8').trim(), 'hex');
  const key = crypto.randomBytes(32);
  fs.writeFileSync(KEY_FILE, key.toString('hex'), { mode: 0o600 });
  return key;
}

function encrypt(plain) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getKey(), iv);
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return { iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), data: data.toString('base64') };
}

function decrypt(blob) {
  const decipher = crypto.createDecipheriv('aes-256-gcm', getKey(), Buffer.from(blob.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(blob.tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(blob.data, 'base64')), decipher.final()]).toString('utf8');
}

function read() {
  try {
    if (fs.existsSync(FILE)) return JSON.parse(fs.readFileSync(FILE, 'utf8'));
  } catch (_) { /* treat as empty */ }
  return { networks: [] };
}

function write(db) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(db, null, 2), 'utf8');
}

// Never includes the password - only whether one is stored.
const present = (n, index) => ({
  id: n.id, ssid: n.ssid, hasPassword: Boolean(n.password), priority: index + 1,
  createdAt: n.createdAt, updatedAt: n.updatedAt || null,
});

export function listNetworks() {
  return read().networks.map(present);
}

function validate({ ssid, password }, { requireSsid = true } = {}) {
  if (requireSsid) {
    const s = String(ssid || '');
    if (!s.trim() || Buffer.byteLength(s) > 32) throw new Error('The network name must be 1-32 characters.');
  }
  if (password !== undefined && password !== null && password !== '') {
    const p = String(password);
    if (p.length < 8 || p.length > 63) throw new Error('A WPA password must be 8-63 characters (leave it blank for an open network).');
  }
}

export function addNetwork({ ssid, password }) {
  validate({ ssid, password });
  const db = read();
  const name = String(ssid).trim();
  if (db.networks.some((n) => n.ssid.toLowerCase() === name.toLowerCase())) throw new Error(`"${name}" is already saved - edit it instead.`);
  const net = {
    id: crypto.randomUUID(), ssid: name,
    password: password ? encrypt(String(password)) : null,
    createdAt: new Date().toISOString(),
  };
  db.networks.push(net);
  write(db);
  return present(net, db.networks.length - 1);
}

// A blank/omitted password keeps the stored one; send a value to replace it,
// or `clearPassword: true` to make it an open network.
export function updateNetwork(id, { ssid, password, clearPassword }) {
  validate({ ssid, password }, { requireSsid: ssid !== undefined });
  const db = read();
  const i = db.networks.findIndex((n) => n.id === id);
  if (i < 0) throw new Error('Network not found.');
  const net = db.networks[i];
  if (ssid !== undefined) {
    const name = String(ssid).trim();
    if (db.networks.some((n, k) => k !== i && n.ssid.toLowerCase() === name.toLowerCase())) throw new Error(`"${name}" is already saved.`);
    net.ssid = name;
  }
  if (clearPassword) net.password = null;
  else if (password) net.password = encrypt(String(password));
  net.updatedAt = new Date().toISOString();
  write(db);
  return present(net, i);
}

export function removeNetwork(id) {
  const db = read();
  const before = db.networks.length;
  db.networks = db.networks.filter((n) => n.id !== id);
  if (db.networks.length === before) return false;
  write(db);
  return true;
}

// Move a network up (-1) or down (+1) the try-in-this-order list.
export function moveNetwork(id, delta) {
  const db = read();
  const i = db.networks.findIndex((n) => n.id === id);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= db.networks.length) return listNetworks();
  [db.networks[i], db.networks[j]] = [db.networks[j], db.networks[i]];
  write(db);
  return listNetworks();
}

// The one place a plaintext password leaves the store. Each reveal is recorded
// (who/when, never the password) so unexpected access can be spotted.
export function revealPassword(id, who = 'unknown') {
  const net = read().networks.find((n) => n.id === id);
  if (!net) throw new Error('Network not found.');
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.appendFileSync(AUDIT_FILE, `${new Date().toISOString()} password revealed for "${net.ssid}" by ${who}\n`);
  } catch (_) { /* auditing is best effort */ }
  return net.password ? decrypt(net.password) : '';
}
