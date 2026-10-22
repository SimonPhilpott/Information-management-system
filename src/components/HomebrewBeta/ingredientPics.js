// Homebrew (beta): the picture for each ingredient - the one chosen in Ingredient pictures (admin), else the one made
// for it - looked up the way the server does: the name without its brackets, tidied by a copy of the server's
// canonicalisation (canonical.js, so merged names like "sweet cider" -> "Apple juice" agree), then normalised.
import { useEffect, useSyncExternalStore } from 'react';
import { canonicalizeMain, normIngredient } from './canonical';

let data = null;     // the admin listing: { ingredients: [...], totalCount, withImageCount, customCount, mainCount }
let loading = null;
const listeners = new Set();
const notify = () => listeners.forEach((l) => l());

export function loadIngredientPictures(force = false) {
  if (loading && !force) return loading;
  // never from the browser's cache: straight after a new picture is saved, a cached copy showed the old one
  loading = fetch('/api/homebrew/admin/ingredients', { cache: 'no-store' })
    .then((r) => (r.ok ? r.json() : null))
    // every ingredient starts with a capital letter, whatever a recipe added later wrote (matching ignores case)
    .then((d) => {
      data = d && Array.isArray(d.ingredients)
        ? { ...d, ingredients: d.ingredients.map((i) => ({ ...i, name: String(i.name || '').replace(/^(\s*["'(]*)([a-z])/, (m, lead, ch) => lead + ch.toUpperCase()) })) }
        : { ingredients: [] };
      notify();
      return data;
    })
    .catch(() => { data = { ingredients: [] }; notify(); return data; });
  return loading;
}
export const refreshIngredientPictures = () => loadIngredientPictures(true);
// A picture has just been saved for an ingredient: every screen shows it at once (the server said which), before
// the list is fetched again
export function showNewPicture(ingName, key) {
  if (!data || !key) return;
  const n = ingredientNorm(ingName);
  data = { ...data, ingredients: data.ingredients.map((i) => (i.norm === n || i.name === ingName ? { ...i, currentKey: key, customKey: key, hasImage: true, hasCustom: true } : i)) };
  notify();
}

export const ingredientNorm = (name) => normIngredient(canonicalizeMain(String(name || '').replace(/\(.*?\)/g, '').trim()));
export const ingredientLabel = (name) => canonicalizeMain(String(name || '').replace(/\(.*?\)/g, '').trim());

// the admin listing, kept up to date for every screen that shows ingredient pictures. Read straight from the store
// on every render (useSyncExternalStore), so a screen can't miss a change - a new picture shows at once, and an
// ingredient leaves "No picture" the moment it has one
const subscribe = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
const snapshot = () => data;
export function useIngredientPictures() {
  const d = useSyncExternalStore(subscribe, snapshot);
  useEffect(() => { if (!data) loadIngredientPictures(); }, []);
  return d;
}
// norm -> the ingredient's entry ({ key, count, name }), for ingredients that have a picture ready
export function picMapOf(d) {
  const m = new Map();
  for (const i of d?.ingredients || []) if (i.hasImage && i.currentKey) m.set(i.norm, { key: i.currentKey, count: i.count, name: i.name });
  return m;
}

// The picture for a recipe line. A line is often a whole phrase ("beetroot, peeled and grated - 0.32 lb per gallon"),
// so if the whole line has no picture: the part before its first comma or dash, tidied the same way; then the longest
// pictured ingredient named as whole words in that part ("fresh thyme - during the mash" -> Thyme).
const byLength = new WeakMap();
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export function pictureFor(pics, name) {
  if (!pics.size) return null;
  const whole = pics.get(ingredientNorm(name));
  if (whole) return whole;
  const head = String(name || '').replace(/\(.*?\)/g, '').split(/,|\s[-–—]\s|;/)[0].trim();
  const headKey = pics.get(ingredientNorm(head));
  if (headKey) return headKey;
  if (!byLength.has(pics)) {
    byLength.set(pics, [...pics.keys()].filter((k) => k.length >= 3).sort((a, b) => b.length - a.length)
      .map((k) => [new RegExp(`(^|\\s)${esc(k)}(s|es)?(\\s|$)`), k]));
  }
  const text = normIngredient(head);
  for (const [re, k] of byLength.get(pics)) if (re.test(text)) return pics.get(k);
  const canon = normIngredient(canonicalizeMain(head));
  for (const [re, k] of byLength.get(pics)) if (re.test(canon)) return pics.get(k);
  return null;
}
