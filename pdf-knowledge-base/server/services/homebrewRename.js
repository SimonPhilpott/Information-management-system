// Rename an ingredient everywhere (22 Oct 2026, Simon - Ingredient pictures in the Homebrew beta): every recipe and brew
// line whose ingredient is the old name (the part before its first comma or dash, without brackets, matched the same
// way as Ingredient pictures) gets the new name, keeping the rest of the line - amount, notes, brackets. The same goes
// for "also counts as" alternatives and each recipe's main ingredients. If the new name is already an ingredient the
// two merge; the picture follows (the new name's own picture is kept if it has one). Each rename saves what it
// changed, so it can be undone.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import db from '../db/database.js';
import { canonicalizeMain, normIngredient } from './homebrewCanonical.js';

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data', 'ingredient_renames');
const keyOf = (name) => normIngredient(canonicalizeMain(String(name || '').replace(/\(.*?\)/g, '').trim()));
// the ingredient part of a line: before its first bracket, comma or dash
const headOf = (name) => {
  const s = String(name || '');
  const m = s.match(/^\s*([^(,;]*?)(?=\s*(?:\(|,|;|\s[-–—]\s|$))/);
  return m ? m[1] : s;
};

function swapHead(name, from, to) {
  const head = headOf(name);
  if (!head || keyOf(head) !== from) return null;
  const at = String(name).indexOf(head);
  return `${String(name).slice(0, at)}${to}${String(name).slice(at + head.length)}`;
}

export function renameIngredient(fromName, toName) {
  const to = String(toName || '').trim();
  const from = keyOf(fromName);
  if (!from) throw new Error('Which ingredient?');
  if (!to) throw new Error('Type the new name.');
  if (keyOf(to) === from && String(fromName).trim() === to) throw new Error('That\'s already its name.');

  const brews = db.prepare('SELECT id, ingredients FROM brews').all();
  const mains = db.prepare('SELECT brew_id, items FROM brew_main_ingredients').all();
  const changedBrews = [];
  const changedMains = [];
  let lines = 0;
  for (const r of brews) {
    let ings;
    try { ings = JSON.parse(r.ingredients || '[]'); } catch { continue; }
    let any = false;
    const after = ings.map((g) => {
      const name = swapHead(g.name, from, to);
      const also = Array.isArray(g.also) ? g.also.map((a) => (keyOf(a) === from ? to : a)) : g.also;
      const alsoChanged = Array.isArray(g.also) && also.some((a, i) => a !== g.also[i]);
      if (name == null && !alsoChanged) return g;
      any = true; lines++;
      return { ...g, ...(name != null ? { name } : {}), ...(alsoChanged ? { also } : {}) };
    });
    if (any) changedBrews.push({ id: r.id, before: r.ingredients, after: JSON.stringify(after) });
  }
  for (const r of mains) {
    let items;
    try { items = JSON.parse(r.items || '[]'); } catch { continue; }
    let any = false;
    const after = items.map((it) => (keyOf(it.name) === from ? (any = true, { ...it, name: to }) : it));
    // a recipe could now list the same main ingredient twice
    const uniq = [...new Map(after.map((it) => [keyOf(it.name), it])).values()];
    if (any) changedMains.push({ brew_id: r.brew_id, before: r.items, after: JSON.stringify(uniq) });
  }

  const toKey = keyOf(to);
  const pics = db.prepare('SELECT * FROM brew_ingredient_pictures WHERE name_norm IN (?, ?)').all(from, toKey);
  const fromPic = pics.find((p) => p.name_norm === from);
  const toPic = pics.find((p) => p.name_norm === toKey);
  // a merge if the new name was already an ingredient somewhere (or had its own picture)
  const merged = Boolean(toPic) || brews.some((r) => { try { return JSON.parse(r.ingredients || '[]').some((g) => keyOf(headOf(g.name)) === toKey); } catch { return false; } });

  const id = `${Date.now()}`;
  fs.mkdirSync(DIR, { recursive: true });
  fs.writeFileSync(path.join(DIR, `${id}.json`), JSON.stringify({ from: fromName, to, brews: changedBrews.map(({ id: bid, before }) => ({ id: bid, ingredients: before })), mains: changedMains.map(({ brew_id, before }) => ({ brew_id, items: before })), pictures: pics }, null, 1));

  const updBrew = db.prepare('UPDATE brews SET ingredients = ? WHERE id = ?');
  const updMain = db.prepare('UPDATE brew_main_ingredients SET items = ? WHERE brew_id = ?');
  db.transaction(() => {
    for (const c of changedBrews) updBrew.run(c.after, c.id);
    for (const c of changedMains) updMain.run(c.after, c.brew_id);
    // the picture follows: the new name keeps its own if it has one, else takes the old name's
    if (fromPic) {
      if (!toPic) {
        db.prepare('INSERT INTO brew_ingredient_pictures (name_norm, name_display, key, updated_at) VALUES (?, ?, ?, ?)').run(toKey, canonicalizeMain(to) || to, fromPic.key, Date.now());
      }
      if (from !== toKey) db.prepare('DELETE FROM brew_ingredient_pictures WHERE name_norm = ?').run(from);
    }
  })();
  return { undoId: id, lines, recipes: changedBrews.length, mainLists: changedMains.length, merged };
}

// put back exactly what one rename changed
export function undoRename(undoId) {
  if (!/^\d+$/.test(String(undoId))) throw new Error('Nothing to undo.');
  const file = path.join(DIR, `${undoId}.json`);
  if (!fs.existsSync(file)) throw new Error('That rename can\'t be undone any more.');
  const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
  const from = keyOf(saved.from);
  const toKey = keyOf(saved.to);
  db.transaction(() => {
    for (const b of saved.brews) db.prepare('UPDATE brews SET ingredients = ? WHERE id = ?').run(b.ingredients, b.id);
    for (const m of saved.mains) db.prepare('UPDATE brew_main_ingredients SET items = ? WHERE brew_id = ?').run(m.items, m.brew_id);
    db.prepare('DELETE FROM brew_ingredient_pictures WHERE name_norm IN (?, ?)').run(from, toKey);
    for (const p of saved.pictures) db.prepare('INSERT INTO brew_ingredient_pictures (name_norm, name_display, key, updated_at) VALUES (?, ?, ?, ?)').run(p.name_norm, p.name_display, p.key, p.updated_at);
  })();
  fs.renameSync(file, `${file}.undone`);
  return { restored: saved.brews.length };
}
