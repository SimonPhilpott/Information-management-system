// Reading an Event's own words (Events table, p. 108) into what it asks of you: each check it names, what a pass and
// a fail bring, whether you may decline, and what declining costs. 54 of the book's 73 events ask for a check; their
// wording follows a handful of patterns ("Make a Reason check: if you pass it ... If you fail ...", "... to avoid
// losing 1 Sanity", "... check or lose D100 coins", "If you choose to help him ..."). Whatever is not recognised is
// still shown in the book's words for you to settle.
const SKILL = '(Resolve|Endurance|Spellward|Dodge|Perception|Stealth|Reason|Athletics|Acrobatics|Medicine|Thievery|Scavenge|weapon Skill|Body|Mind)';
const CHECK = new RegExp(`\\b${SKILL}\\b(?: or [A-Z][a-z]+)? check`, 'i');
const ALIAS = { Body: 'Athletics', Mind: 'Perception', 'weapon Skill': 'weapon' };
const COND = 'Bleeding|Poisoned|Burning|Restrained|Frightened|Sickened|Blinded|Stunned|Dazed|Cursed|Freezing|Prone';

// the effects a phrase describes, as the engine can apply them
export function effectsOf(t = '') {
  const fx = []; let m;
  const s = String(t);
  if ((m = s.match(/(?:gain|earn|receive)s? (\d+) XP/i))) fx.push({ k: 'xp', n: Number(m[1]) });
  if ((m = s.match(/\b(\d+) XP\b/)) && !fx.some((x) => x.k === 'xp')) fx.push({ k: 'xp', n: Number(m[1]) });
  if ((m = s.match(/los(?:e|ing|es) (\d*D\d+|\d+) Sanity/i))) fx.push({ k: 'sanity', n: m[1] });
  if ((m = s.match(/(?:recover|regain|heal|gain)s? (\d*D\d+|\d+) Sanity/i))) fx.push({ k: 'sanity+', n: m[1] });
  if ((m = s.match(/(?:gain|gaining|suffer|increase your Exhaustion by|accrue) \+?(\d*D\d+|\d+) Exhaustion/i))) fx.push({ k: 'exh', n: m[1] });
  if ((m = s.match(/(?:receive|receiving|take|taking|suffer|suffering|deals?|dealing)s? (\d*D\d+(?:\s*\+\s*\d+)?|\d+) (\w+) damage/i))) fx.push({ k: 'dmg', n: m[1].replace(/\s+/g, ''), type: m[2] });
  if ((m = s.match(/los(?:e|ing) (\d*D\d+|\d+)\s*(?:₵|coins)/i))) fx.push({ k: 'coins-', n: m[1] });
  if ((m = s.match(/(?:find|gain|receive|discover)s? (\d*D\d+|\d+)\s*(?:₵|coins)/i))) fx.push({ k: 'coins+', n: m[1] });
  if ((m = s.match(/(?:lose|sacrifice|losing) (\d*D\d+|\d+) Health/i))) fx.push({ k: 'health', n: m[1] });
  if ((m = s.match(/(?:recover|heal|regain)s?(?: you)? (\d*D\d+|\d+) (?:Health|Wounds)/i))) fx.push({ k: 'heal', n: m[1] });
  for (const f of s.matchAll(/(?:find|gain|receive|obtain)s? (?:a |an )?(\d*D\d+|\d+)?\s*(?:x )?(Torch(?:es)?|Crafting Supplies|Cooking Ingredients|Rations?|Bandages?|Potions?|Lockpicks?|Candles?|Flares?|Attunement Crystals?)\b/gi)) fx.push({ k: 'item', n: f[1] || '1', name: f[2] });
  if (/you still find an intact one/i.test(s)) fx.push({ k: 'item', n: '1', name: 'Potion' });
  if ((m = s.match(/increase your ([A-Z][\w &]+?) Skill by (\d+)/))) fx.push({ k: 'skill', name: m[1], n: Number(m[2]) });
  if (/Stun them in the first round/i.test(s)) fx.push({ k: 'stunOverseer' });
  if ((m = s.match(/add \+?(D\d+) (\w+) damage to your Damage Pool/i))) fx.push({ k: 'rider', die: m[1].toLowerCase(), dtype: m[2], next: /next (?:melee )?attack/i.test(s) });
  if (/ignore the next Growing Darkness/i.test(s)) fx.push({ k: 'skipDarkness' });
  if ((m = s.match(/\+(\d+) Initiative/i))) fx.push({ k: 'initBonus', n: Number(m[1]) });
  if ((m = s.match(/(?:recover|heal|regain)s? (\d*D\d+|\d+) Toughness/i))) fx.push({ k: 'tough', n: m[1] });
  if (/Spoils table|something of value/i.test(s)) fx.push({ k: 'spoils', which: (s.match(/(Resources|Valuable Items|Precious Items) table/) || [])[1] ? `${s.match(/(Resources|Valuable Items|Precious Items) table/)[1]} table` : 'Spoils table' });
  if (/Growing Darkness table/i.test(s)) fx.push({ k: 'darkness' });
  if (/Combat Encounter table|being attacked|you are attacked|you're attacked|attacked by surprise/i.test(s)) fx.push({ k: 'fight', surprised: /surprised/i.test(s) });
  if (/\bthe Rot\b/.test(s)) fx.push({ k: 'rot' });
  for (const c of s.matchAll(new RegExp(`\\b(${COND})\\b(?: \\((\\d+)\\))?`, 'g'))) if (!fx.some((x) => x.k === 'cond' && x.name === c[1])) fx.push({ k: 'cond', name: c[1], n: Number(c[2]) || 1 });
  return fx;
}
const sentences = (t) => String(t).replace(/\s+/g, ' ').match(/[^.!?]+[.!?]+(?:["”’])?|[^.!?]+$/g)?.map((x) => x.trim()).filter(Boolean) || [];
const between = (t, re, stop) => { const m = t.match(re); if (!m) return ''; let rest = t.slice(m.index + m[0].length); if (stop) { const k = rest.search(stop); if (k >= 0) rest = rest.slice(0, k); } return rest.trim(); };

export function parseEvent(text = '') {
  const ss = sentences(text); const asks = [];
  let cur = null;
  ss.forEach((sen, i) => {
    const m = sen.match(CHECK);
    if (m) {
      const optional = /^(?:If you (?:choose|insist|attempt|decide|want|wish)|You (?:can|may) (?:attempt|try|choose))/i.test(sen) || /^If you /i.test(sen) && !/^If you (?:pass|fail|succeed)/i.test(sen);
      cur = { skill: ALIAS[m[1]] || (m[1][0].toUpperCase() + m[1].slice(1)), text: sen, optional, at: i }; asks.push(cur);
    } else if (cur) cur.text += ` ${sen}`;
  });
  for (const a of asks) {
    const t = a.text;
    let pass = between(t, /if (?:you (?:pass|succeed|manage)(?: it| the check| this check)?|(?:you are |you're )?successful)[,:]?\s*/i, /If you (?:fail|can't|cannot|decide not|choose not|simply|don't)/i);
    let fail = between(t, /if you fail(?: it| the check)?[,:]?\s*/i, /If you (?:pass|succeed|can't|cannot|decide|choose|simply)/i);
    let m;
    if (!fail && (m = t.match(/check[^.:]*? to avoid ([^.:]+)/i))) fail = m[1].replace(/^(losing|gaining|being|becoming)\b/, (w) => ({ losing: 'lose', gaining: 'gain', being: 'be', becoming: 'become' }[w.toLowerCase()]));
    if (!fail && (m = t.match(/check,? or (?:you )?((?:lose|become|receive|be|take|gain|suffer|contract)[^.]+)/i))) fail = m[1];
    if (!pass && !fail && (m = t.match(/check[^:]*:\s*([^.]+(?:\.[^.]+)?)/i))) pass = m[1];
    if (!pass && (m = t.match(/If you succeed[^,]*,?\s*([^.]+)/i))) pass = m[1];
    const skip = (t.match(/If you (?:can't|cannot|decide not|choose not|simply decide to ignore|ignore|don't)[^,]*,\s*([^.]+)/i) || [])[1] || '';
    const cost = (t.match(/remove (\d+)x Bandage/i) || [])[1];
    Object.assign(a, { passText: tidyLine(pass), failText: tidyLine(fail), skipText: tidyLine(skip), pass: effectsOf(pass), fail: effectsOf(fail), skip: effectsOf(skip), cost: cost ? { bandages: Number(cost) } : null });
    // a phrase like "to avoid losing 1 Sanity" read as a fail must not also count as a pass
    if (a.failText && a.passText === a.failText) { a.passText = ''; a.pass = []; }
  }
  return asks;
}
// the sentence of the event that asks for the check, for the prompt
export function purposeOf(a) {
  const t = a.text.replace(/\s+/g, ' ');
  const first = (t.match(/^[^.!?]*[.!?]/) || [t])[0].trim();
  return first.length > 170 ? `${first.slice(0, 167).replace(/\s+\S*$/, '')}…` : first;
}
// a pass or fail line, tidied: no trailing comma, a capital to start, a full stop to end
export const tidyLine = (s = '') => { const t = String(s).trim().replace(/[,;:\s]+$/, ''); return t ? `${t[0].toUpperCase()}${t.slice(1)}${/[.!?…]$/.test(t) ? '' : '.'}` : ''; };
