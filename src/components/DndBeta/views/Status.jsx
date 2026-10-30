// What is going on with your survivor, as icons in the top bar (29 Oct 2026, Simon: "encumbrance, any condition like
// rot, encumbered, (in the) Darkness, nearly dead, Level up etc be shown as icons ... that when clicked take you to
// the relevant place or show a summary as to what's caused the icon to show"). Hover for the summary; tap for the
// whole of it and a way to deal with it.
import React, { useState } from 'react';
import * as E from '../kn/engine';
import { GLOSSARY } from '../kn/glossary';
import { encumbrance } from '../kn/loot';
import { levelDue, ROT } from '../kn/progress';
import Ico from '../ui/Ico';
import { Tip } from '../ui/Tip';
import { Sheet } from '../ui/Bits';

const COND_ICON = { Bleeding: 'drop', Poisoned: 'vial', Burning: 'flame', Restrained: 'chain', Stunned: 'star', Dazed: 'star', Paralyzed: 'chain', Prone: 'run', Blinded: 'eye', Frightened: 'ghost', Sickened: 'vial', Charmed: 'heart', Cursed: 'skull', Freezing: 'spark', Enfeebled: 'hand', 'Festering wound': 'drop' };
const EXH = ['', 'You heal only half of every Wound (rounded up).', 'Disadvantage on every check, and you heal half.', 'At 21 Exhaustion you die.'];

export function statusesOf(game) {
  const h = game.hero, v = h.vit, d = game.domain; const out = [];
  const lowHealth = v.health <= Math.max(2, Math.ceil(v.maxHealth * 0.25));
  if (game.over) out.push({ id: 'over', icon: 'skull', tone: 'bad', label: game.over === 'mad' ? 'Mad' : game.over === 'rot' ? 'Taken by the Rot' : 'Dead', body: 'The run has ended.', go: null });
  else if (lowHealth) out.push({ id: 'dying', icon: 'heart', tone: 'bad', label: 'Nearly dead', body: `Health ${v.health} of ${v.maxHealth}, with ${v.tough} Toughness left to soak blows. At 0 Health you die.`, what: 'Toughness heals at once after a fight and fully at Camp; Health only with potions, magic, a Breather (1) or Camp (1). Drink a healing potion if you have one, or rest before going on.', go: 'camp', goLabel: 'Set camp' });
  for (const e of h.effects || []) {
    const g = GLOSSARY[e.name] || {};
    out.push({ id: `c-${e.name}`, icon: COND_ICON[e.name] || 'drop', tone: 'bad', label: `${e.name}${e.n > 1 ? ` ${e.n}` : ''}`, body: g.body || 'A condition on you.', page: g.page || 88,
      what: e.name === 'Bleeding' || e.name === 'Poisoned' ? 'A Bandage and a Medicine check out of combat, or Heal Condition at Camp (a Bandage, no check), or the right potion.' : e.name === 'Burning' ? 'Put it out: your Standard Action in a fight, or 2 Exhaustion out of one.' : e.name === 'Restrained' ? 'Break free with Athletics (a Free Action, or your Standard Action for +20).' : null,
      go: E.LASTING.includes(e.name) && !game.combat ? 'pack' : null, goLabel: 'Your pack' });
  }
  if (v.light === 0 && !(h.rot >= 3)) out.push({ id: 'dark', icon: 'torch', tone: 'bad', label: 'In the dark', body: 'No light: you are Blinded (Disadvantage on every check but Reason), and each new room asks a Resolve check or costs 1 Sanity.', page: 96, what: `Light a Torch (${h.items.torches || 0}), a Candle (${h.items.candles || 0}) or a Lamp with oil (${h.items.oil || 0}).`, go: 'light', goLabel: 'Light something' });
  else if (v.light <= 3 && !(h.rot >= 3)) out.push({ id: 'light', icon: 'torch', tone: 'warn', label: `Light ${v.light}`, body: `${v.light} room${v.light === 1 ? '' : 's'} of light left.`, page: 96, what: `You carry ${h.items.torches || 0} Torches, ${h.items.candles || 0} Candles and ${h.items.oil || 0} Lamp Oil.`, go: 'light', goLabel: 'Light something' });
  if (h.shield?.broken) out.push({ id: 'shieldbroken', icon: 'shield', tone: 'warn', label: 'Shield broken', body: `Your ${h.shield.name} took a Critical Strike for you and is broken: no Parry bonus until it is mended.`, page: 85, what: 'Mend it at Camp: Repair, 2 Crafting Supplies.' });
  if (E.handFull(h) && (h.shield || h.weapons?.[h.wield]?.twoHanded || h.dual)) out.push({ id: 'hands', icon: 'hand', tone: 'warn', label: 'Hand full', body: `Your ${h.lightSource === 'oil' ? 'Lamp' : h.lightSource === 'candle' ? 'Candle' : 'Torch'} fills a hand, so your shield, two-handed weapon or second weapon cannot be used.`, page: 96, what: 'A Belt Lamp, a light spell, or setting a Lamp down in a fight frees the hand.' });
  if (h.madPick > 0) out.push({ id: 'madpick', icon: 'brain', tone: 'bad', label: 'Lose 10 from a Skill', body: 'Madness or the Growing Darkness has taken a memory: choose which Skill falls by 10.', page: 91, go: 'madness', goLabel: 'Choose the Skill' });
  if (h.madFx && Object.values(h.madFx).some((n) => n > 0)) out.push({ id: 'madness', icon: 'brain', tone: 'warn', label: 'Madness', body: 'What your Madness left behind:', list: h.madness || [], page: 91, ...(h.madPick > 0 ? { go: 'madness', goLabel: 'Choose the Skill' } : {}) });
  if ((d.darkness || []).length) out.push({ id: 'gd', icon: 'eye', tone: 'bad', label: `Darkness ${d.darkness.length}`, body: 'Growing Darkness in this Domain:', list: d.darkness.map((x) => `D100 ${x.roll}: ${x.text}`), page: 120, what: 'They last until you leave the Domain. You are reminded of each one when it matters (a trap, a fight, camp...).' });
  try { const enc = encumbrance(h); if (enc.used > enc.cap) out.push({ id: 'enc', icon: 'pack', tone: 'warn', label: 'Overloaded', body: `You carry ${enc.used} slots' worth with room for ${enc.cap}.`, page: 206, what: 'Leave something behind, or find a Backpack (+20) or Pouches (+5 each, up to 3).', go: 'pack', goLabel: 'Your pack' }); } catch { /* no pack yet */ }
  const tier = E.exhTier(h);
  if (tier > 0) out.push({ id: 'exh', icon: 'hourglass', tone: tier >= 2 ? 'bad' : 'warn', label: tier >= 2 ? 'Exhausted' : 'Weary', body: `Exhaustion ${v.exh}. ${EXH[tier]}`, page: 90, what: 'A Ration takes off 1; a Breather 2; Camp 10 (15 if you Sleep).', go: 'camp', goLabel: 'Set camp' });
  if (v.sanity <= 3 && !game.over) out.push({ id: 'san', icon: 'brain', tone: 'bad', label: 'On the edge', body: `Sanity ${v.sanity} of ${v.maxSanity}. At 0 you roll on the Madness table.`, page: 91, what: 'Camp restores D4 Sanity; some potions and Abilities more.', go: 'camp', goLabel: 'Set camp' });
  if (h.rot > 0) out.push({ id: 'rot', icon: 'rot', tone: 'bad', label: `Rot ${h.rot}`, body: `The Rot, stage ${h.rot}: ${ROT[h.rot]}`, page: 87, what: 'Each rest asks an Endurance check or the Rot spreads a stage. Stage 8 ends the run.', go: 'sheet:three', goLabel: 'Your sheet' });
  if ((h.madness || []).length) out.push({ id: 'mad', icon: 'brain', tone: 'warn', label: `Madness ${h.madness.length}`, body: 'Lasting madness:', list: h.madness, page: 91, go: 'sheet:three', goLabel: 'Your sheet' });
  for (const t of (h.timed || []).filter((x) => x.rooms > 0 || x.rounds > 0)) out.push({ id: `t-${t.name}`, icon: 'spark', tone: 'ok', label: t.name, body: `${t.name}: ${t.rounds > 0 && t.rounds < 90 ? `${t.rounds} round${t.rounds > 1 ? 's' : ''}` : `${t.rooms} room${t.rooms > 1 ? 's' : ''}`} left.`, what: 'From a potion, a Fragment or an event.' });
  if (levelDue(h)) out.push({ id: 'lvl', icon: 'star', tone: 'gilt', label: 'Level up', body: `${v.xp} XP: level ${(h.level || 1) + 1} is yours to take, with an Ability Point and a benefit.`, page: 62, go: 'level', goLabel: 'Level up' });
  if ((h.abilityPoints || 0) > 0) out.push({ id: 'ap', icon: 'spark', tone: 'gilt', label: `${h.abilityPoints} Ability Point${h.abilityPoints > 1 ? 's' : ''}`, body: 'Unspent: each opens the next Tier of a Mastery.', page: 21, go: 'sheet:points', goLabel: 'Spend them' });
  if (d.overseer && !d.overseerSlain && d.lairFound) out.push({ id: 'lair', icon: 'star', tone: 'warn', label: 'Lair found', body: `${d.overseer.name}'s lair is on the map.`, page: 179, what: 'Beat the Overseer for 200 XP and D4 Sanity, and its Influence lifts from the Domain.' });
  return out;
}

export function StatusStrip({ game, onGo }) {
  const [open, setOpen] = useState(null);
  const list = statusesOf(game);
  const cur = list.find((x) => x.id === open);
  if (!list.length) return null;
  return (
    <>
      <span className="dbt-status" role="list" aria-label="How you are">
        {list.map((st) => (
          <Tip key={st.id} as="button" type="button" role="listitem" className={`dbt-stat ${st.tone}`} onClick={() => setOpen(st.id)} aria-label={`${st.label}: ${st.body}`}
            tip={{ title: st.label, icon: st.icon, body: `${st.body}${st.list ? ` ${st.list.join(' · ')}` : ''}`, live: st.what || null, page: st.page }}>
            <Ico n={st.icon} size={15} /><span>{st.label}</span>
          </Tip>
        ))}
      </span>
      <Sheet open={Boolean(cur)} onClose={() => setOpen(null)} title={cur?.label || ''} icon={cur?.icon}>
        {cur && (
          <div className="dbt-statsheet">
            <p className="dbt-fell">{cur.body}</p>
            {cur.list && <ul className="dbt-slist">{cur.list.map((x) => <li key={x}>{x}</li>)}</ul>}
            {cur.what && <p className="dbt-note"><b>What to do:</b> {cur.what}</p>}
            {cur.page && <p className="dbt-note">The book, page {cur.page}.</p>}
            <div className="dbt-row">{cur.go && onGo && <button type="button" className="dbt-btn primary" onClick={() => { setOpen(null); onGo(cur.go); }}>{cur.goLabel || 'Take me there'}</button>}
              <button type="button" className="dbt-btn ghost" onClick={() => setOpen(null)}>Close</button></div>
          </div>
        )}
      </Sheet>
    </>
  );
}
