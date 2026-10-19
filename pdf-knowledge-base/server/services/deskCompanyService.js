import db from '../db/database.js';
import { getPresence } from './presenceService.js';

// Who's at the desk that Ims should mind his language for: anyone the camera recognises whose saved birthday makes
// them under 16 (Rowan). While a child is there, Ims is child-safe whatever the humour slider says (it's on Dark).

const CHILD_UNDER = 16;
const first = (n) => String(n || '').trim().split(/\s+/)[0].toLowerCase();

function ageOf(r, now = new Date()) {
  if (!r.birth_year) return null;
  let age = now.getFullYear() - r.birth_year;
  if (r.birth_month && (now.getMonth() + 1 < r.birth_month || (now.getMonth() + 1 === r.birth_month && now.getDate() < (r.birth_day || 1)))) age--;
  return age;
}

// [{ name, age }] for names given (or, by default, whoever the camera sees now) who are children
export function childrenAmong(names) {
  if (!names?.length) return [];
  const rows = db.prepare('SELECT name, birth_year, birth_month, birth_day FROM birthdays WHERE deleted_at IS NULL').all();
  const out = [];
  for (const n of names) {
    const r = rows.find((x) => first(x.name) === first(n));
    const age = r ? ageOf(r) : null;
    if (age !== null && age < CHILD_UNDER) out.push({ name: String(n).trim().split(/\s+/)[0], age });
  }
  return out;
}

export function childrenAtDesk() {
  try {
    const p = getPresence();
    return p.present ? childrenAmong(p.names) : [];
  } catch (_) { return []; }
}

export const childNote = (kids) => kids.length
  ? `${kids.map((k) => `${k.name} (${k.age})`).join(' and ')} ${kids.length === 1 ? 'is' : 'are'} at the desk - a child. CHILD AT THE DESK - until they've gone, follow your how-to for when a child is at the desk: child-safe, whatever your humour setting.`
  : 'No children at the desk now - back to your usual self.';
