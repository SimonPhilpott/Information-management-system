import db from '../db/database.js';

db.exec(`
  CREATE TABLE IF NOT EXISTS birthdays (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    birth_year INTEGER,
    birth_month INTEGER NOT NULL,
    birth_day INTEGER NOT NULL,
    created_at INTEGER NOT NULL
  );
`);
// Deleting a birthday archives it (deleted_at) rather than destroying it, so it
// can be reviewed or restored from the /ims/birthday archive.
try { db.exec(`ALTER TABLE birthdays ADD COLUMN deleted_at INTEGER`); } catch (_) { }
try { db.exec(`ALTER TABLE birthdays ADD COLUMN updated_at INTEGER`); } catch (_) { }

const LONDON_TZ = 'Europe/London';
const londonPartsFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: LONDON_TZ, year: 'numeric', month: '2-digit', day: '2-digit', hourCycle: 'h23'
});

function todayLondonParts() {
  const parts = Object.fromEntries(londonPartsFormatter.formatToParts(new Date()).map((p) => [p.type, p.value]));
  return { year: Number(parts.year), month: Number(parts.month), day: Number(parts.day) };
}

// Days from today (London) to the next occurrence of month/day, 0 = today,
// wrapping to next year once the date's already passed this year.
function daysUntilNext(month, day, today) {
  const thisYearMs = Date.UTC(today.year, month - 1, day);
  const todayMs = Date.UTC(today.year, today.month - 1, today.day);
  let diffDays = Math.round((thisYearMs - todayMs) / 86400000);
  if (diffDays < 0) {
    const nextYearMs = Date.UTC(today.year + 1, month - 1, day);
    diffDays = Math.round((nextYearMs - todayMs) / 86400000);
  }
  return diffDays;
}

function rowToBirthday(row, today) {
  const daysUntil = daysUntilNext(row.birth_month, row.birth_day, today);
  const nextYear = daysUntil === 0 ? today.year : (row.birth_month < today.month || (row.birth_month === today.month && row.birth_day < today.day) ? today.year + 1 : today.year);
  return {
    id: row.id,
    name: row.name,
    birthYear: row.birth_year,
    month: row.birth_month,
    day: row.birth_day,
    daysUntil,
    isToday: daysUntil === 0,
    turningAge: row.birth_year ? (nextYear - row.birth_year) : null
  };
}

export function listBirthdays() {
  const today = todayLondonParts();
  const rows = db.prepare(`SELECT * FROM birthdays WHERE deleted_at IS NULL ORDER BY birth_month ASC, birth_day ASC`).all();
  return rows.map((r) => rowToBirthday(r, today)).sort((a, b) => a.daysUntil - b.daysUntil);
}

export function addBirthday({ name, birthYear, month, day }) {
  if (!name || !String(name).trim()) throw new Error('name is required');
  const m = Number(month), d = Number(day);
  if (!(m >= 1 && m <= 12)) throw new Error('month must be 1-12');
  if (!(d >= 1 && d <= 31)) throw new Error('day must be 1-31');
  const y = birthYear ? Number(birthYear) : null;
  if (y && (y < 1900 || y > new Date().getFullYear())) throw new Error('birthYear looks invalid');
  const info = db.prepare(
    `INSERT INTO birthdays (name, birth_year, birth_month, birth_day, created_at) VALUES (?, ?, ?, ?, ?)`
  ).run(String(name).trim(), y, m, d, Date.now());
  return rowToBirthday({ id: info.lastInsertRowid, name: String(name).trim(), birth_year: y, birth_month: m, birth_day: d }, todayLondonParts());
}

export function updateBirthday(id, { name, birthYear, month, day }) {
  const existing = db.prepare(`SELECT * FROM birthdays WHERE id = ? AND deleted_at IS NULL`).get(id);
  if (!existing) throw new Error('Birthday not found');
  const updated = {
    name: name !== undefined ? String(name).trim() : existing.name,
    birth_year: birthYear !== undefined ? (birthYear ? Number(birthYear) : null) : existing.birth_year,
    birth_month: month !== undefined ? Number(month) : existing.birth_month,
    birth_day: day !== undefined ? Number(day) : existing.birth_day,
  };
  db.prepare(`UPDATE birthdays SET name = ?, birth_year = ?, birth_month = ?, birth_day = ?, updated_at = ? WHERE id = ?`)
    .run(updated.name, updated.birth_year, updated.birth_month, updated.birth_day, Date.now(), id);
  return rowToBirthday({ id, ...updated }, todayLondonParts());
}

export function deleteBirthday(id) {
  return db.prepare(`UPDATE birthdays SET deleted_at = ? WHERE id = ? AND deleted_at IS NULL`).run(Date.now(), id).changes > 0;
}

export function restoreBirthday(id) {
  return db.prepare(`UPDATE birthdays SET deleted_at = NULL WHERE id = ? AND deleted_at IS NOT NULL`).run(id).changes > 0;
}

// Deleted birthdays, most recently deleted first.
export function getArchivedBirthdays() {
  const today = todayLondonParts();
  return db.prepare(`SELECT * FROM birthdays WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC`).all().map((r) => ({
    ...rowToBirthday(r, today),
    createdAt: new Date(r.created_at).toISOString(),
    deletedAt: new Date(r.deleted_at).toISOString(),
  }));
}

// Birthdays that have already happened in the last `days` days (not counting
// today, which is still "upcoming"): a record of who you've recently passed.
export function getRecentlyPassedBirthdays(days = 30) {
  const today = todayLondonParts();
  const todayMs = Date.UTC(today.year, today.month - 1, today.day);
  const out = [];
  for (const b of listBirthdays()) {
    let last = Date.UTC(today.year, b.month - 1, b.day);
    if (last > todayMs) last = Date.UTC(today.year - 1, b.month - 1, b.day);
    const daysSince = Math.round((todayMs - last) / 86400000);
    if (daysSince >= 1 && daysSince <= days) out.push({ ...b, daysSince, turnedAge: b.birthYear ? new Date(last).getUTCFullYear() - b.birthYear : null });
  }
  return out.sort((a, b) => a.daysSince - b.daysSince);
}

// Within the next 7 days INCLUDING today. Used for both the footer cake icon
// and the morning report - "coming up within a week".
export function getUpcomingBirthdays() {
  return listBirthdays().filter((b) => b.daysUntil <= 7);
}

// Footer icon rule: green wins outright whenever at least one birthday is
// TODAY, regardless of how many others are merely upcoming this week - never
// shown as yellow+green at once, just one icon, one colour, one count of
// everything in the 0-7 day window.
export function getBirthdayFooterStatus() {
  const upcoming = getUpcomingBirthdays();
  if (upcoming.length === 0) return { count: 0, color: null };
  const anyToday = upcoming.some((b) => b.isToday);
  return { count: upcoming.length, color: anyToday ? 'green' : 'yellow' };
}
