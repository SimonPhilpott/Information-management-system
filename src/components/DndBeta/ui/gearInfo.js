// What a piece of gear is and does, for its hover and tap summary wherever it appears (the sheet, the slots, the
// mannequin). Weapons say their type: damage type, Skill, Speed, damage and traits (pp. 207-209); armour its
// protection, Integrity and penalties (pp. 210-211); found things their own words; common gear the book's (p. 212).
import { weaponByName, armourByName, gearByName } from '../kn/loot';
import { weaponType, skillOf } from '../kn/engine';
import { lookupItem } from '../../Material/itemCatalog';

export const TRAIT_TEXT = {
  Defensive: '+10 to defend while you also carry a shield.', Quick: '+10 to your Initiative.', Parrying: 'You can parry with your weapon Skill instead of dodging.',
  Powerful: '+1 damage.', Simple: '+10 to your attack.', 'Two-Handed': 'Needs both hands; +2 damage.', Versatile: '+1 damage when used two-handed (no shield).',
};
const LIGHT = { torch: ['Torch', 'A lightsource for 20 rooms. Without light you are Blinded and each new room asks a Resolve check or costs 1 Sanity.'], candle: ['Candle', 'A lightsource for 10 rooms.'], oil: ['Lamp', 'A lightsource for 20 rooms on its oil.'], lamp: ['Lamp', 'A lightsource for 20 rooms on its oil.'] };

export function weaponInfo(h, w) {
  const base = weaponByName(w.base || w.name);
  const traits = w.traits || base?.traits || [];
  const dtype = w.dtype || base?.dtype || weaponType(w);
  const lines = [
    `${dtype} damage: ${String(w.dmg || 'd6').toUpperCase()}${w.bonus ? ` + ${w.bonus.toUpperCase()} (Mastery)` : ''}${w.plus ? `, +${w.plus}` : ''}, keeping the best die.`,
    `Uses ${w.skill} (${skillOf(h, w.skill)}%). Speed ${w.speed ?? base?.speed ?? 0}${(w.speed ?? 0) ? `: lowers the defender's Combat Skill by ${w.speed}` : ''}.`,
    w.parry || traits.includes('Parrying') ? 'Can parry.' : 'Cannot parry: you Dodge instead (unless you carry a shield).',
    ...traits.filter((t) => TRAIT_TEXT[t]).map((t) => `${t}: ${TRAIT_TEXT[t]}`),
    ...(w.extra || []).map((x) => `Also ${String(x.die).toUpperCase()} ${x.dtype} damage.`),
    w.ignoreArmor ? 'Ignores Armor.' : null, w.broken ? 'Broken: it hits for D4 until you repair it at Camp.' : null,
  ].filter(Boolean);
  return { title: w.name, badge: `${dtype} · ${w.skill.replace(' & Fist Weapons', '')}`, body: lines.join(' '), page: base ? 208 : 207, icon: 'sword' };
}
export function lightInfo(kind) { const [t, b] = LIGHT[kind] || LIGHT.torch; return { title: t, badge: 'Light, in hand', body: b, page: 96, icon: 'torch' }; }

// any named thing the survivor has: their weapons, what they wear or carry, common gear, or the old catalogue's notes
export function itemInfo(h, name) {
  const w = (h.weapons || []).find((x) => x.name === name);
  if (w) return weaponInfo(h, w);
  const worn = Object.entries(h.worn || {}).find(([, x]) => x?.name === name);
  const it = worn?.[1] || (h.pack || []).find((x) => x.name === name);
  if (it) {
    const a = armourByName(it.base || it.name);
    const bits = [it.t];
    if (worn) bits.push(`Worn (${worn[0]}).`);
    if (it.die && a?.integ) bits.push(`Integrity now D${it.die} (D${a.integ} at its best).`);
    for (const p of it.properties || []) bits.push(p.t);
    for (const p of it.powers || []) bits.push(p);
    if (it.kind === 'magic' && !it.attuned) bits.push('Not attuned yet: it acts as an ordinary one until you attune to it at Camp.');
    const badge = it.kind === 'weapon' ? `Weapon · ${weaponByName(it.base)?.dtype || ''}` : it.kind === 'armour' ? `Armour · ${a?.part || ''}` : it.kind === 'magic' ? `Magic ${it.type || ''} · ${it.rarity || ''}` : it.kind === 'relic' ? `Relic · ${it.type}` : it.kind;
    return { title: it.name, badge, body: bits.filter(Boolean).join(' '), page: it.page };
  }
  if (name && h.armorName === name) return { title: name, badge: 'Armour · Torso', body: `Protection ${h.armor?.Torso || 0} on the chest and abdomen: taken off each blow that lands there.`, page: 83 };
  const g = gearByName(name);
  if (g) return { title: name, badge: `${g.weight} gear`, body: g.t, page: 212 };
  const c = lookupItem(name);
  return { title: name, badge: c?.category, body: c?.description || 'Something you carry. The book gives it no special rules.', live: c?.passive || null };
}
