// A door, step by step (pp. 99, 117-119): is there a door at all, study it or not, then whatever it turns out to be:
// a spotted trap to disarm or set off, a lock to pick or force, or simply the way through.
import React from 'react';
import * as E from '../kn/engine';
import { TRAPS } from '../kn/tables';
import { GLOSSARY } from '../kn/glossary';
import Ico from '../ui/Ico';
import { Action, Sheet } from '../ui/Bits';
import { Term } from '../ui/Tip';

const DIR = ['north', 'east', 'south', 'west'];

export default function DoorSheet({ game, doorId, onClose, act, commit, go, reopen }) {
  const d = doorId ? E.findDoor(game, doorId) : null;
  if (!d) return null;
  const h = game.hero; const dir = DIR[d.dir];
  const per = E.skillOf(h, 'Perception'), thv = E.skillOf(h, 'Thievery'), ath = E.skillOf(h, 'Athletics');
  const hidden = d.trapped && !d.spotted; // a trap you have not seen springs when you touch the door
  // each roll closes the sheet so the dice can be thrown on the scroll; the sheet comes back with the result
  const step = (plan, apply, hint) => { onClose(); act(plan, apply, () => reopen?.(d.id), { ...hint, onCancel: () => reopen?.(d.id) }); };
  const spring = (voluntary) => step(E.trapPlan(), (f) => E.springTrap(game, d.id, f, { voluntary, knew: d.spotted }), { title: voluntary ? 'Set off the trap' : 'The trap goes off', trap: d.trap || 1, knew: d.spotted || voluntary });
  const status = [];
  if (d.kind === 'arch') status.push(['ok', 'door', 'An open archway']);
  if (d.kind === 'door') {
    status.push(d.spotted ? ['bad', 'eye', `Trap: ${TRAPS[d.trap - 1].t}`] : d.safe || d.sprung ? ['ok', 'check', d.sprung ? 'Its trap is spent' : 'No trap that you can see'] : ['warn', 'eye', 'You cannot tell whether it is trapped']);
    status.push(d.locked ? ['bad', 'lock', 'Locked'] : ['ok', 'lock', 'Not locked']);
  }
  return (
    <Sheet open onClose={onClose} title={`The ${dir} way`} icon="door">
      {status.length > 0 && <div className="dbt-chiprow">{status.map(([tone, ic, t]) => <span key={t} className={`dbt-chip ${tone}`}><Ico n={ic} size={14} />{t}</span>)}</div>}
      {!d.kind && (
        <>
          <p className="dbt-note">An unexplored way out. A D10 decides whether there is a door at all (1-5). If there is, studying it first is a <Term name="Perception">Perception</Term> check ({per}%) at a random Difficulty: it can reveal a trap before it reveals you. Going straight through risks springing one (pp. 99, 117).</p>
          <div className="dbt-dock-grid">
            <Action icon="eye" title="Study it first" sub={`Perception ${per}% at a random Difficulty`} tone="primary" onClick={() => step(E.approachPlan(), (f) => E.approachDoor(game, d.id, f, { look: true }), { title: 'Study the door' })} />
            <Action icon="run" title="Go straight to it" sub="No Perception check: a trap would catch you" onClick={() => step(E.approachPlan(), (f) => E.approachDoor(game, d.id, f, { look: false }), { title: 'Go to the door', look: false })} />
          </div>
        </>
      )}
      {d.kind === 'arch' && <div className="dbt-dock-grid"><Action icon="next" title="Go through" sub="The room beyond: shape, Lair, Tension and encounter" tone="primary" onClick={() => { onClose(); go(d.id); }} /></div>}
      {d.kind === 'door' && (
        <div className="dbt-dock-grid">
          {d.spotted && <Action icon="hand" title="Disarm the trap" sub={`Thieves' Tools · Thievery ${thv}% at a random Difficulty`} disabled={!(h.items.tools > 0) || thv === 0} why={!(h.items.tools > 0) ? 'You need a set of Thieves\' Tools.' : 'Your Thievery is 0: the check cannot succeed.'} onClick={() => step(E.thieveryPlan(), (f) => E.disarmTrap(game, d.id, f), { title: 'Disarm the trap', skill: 'Thievery' })} tip={{ title: 'Disarm', body: 'A success disables the trap and earns 10 XP. A failure sets it off in your hands (with +20 to avoid it, since you knew).', page: 117 }} />}
          {d.spotted && <Action icon="spark" title="Set it off on purpose" sub={`+20 to avoid it with ${TRAPS[d.trap - 1].avoid}`} tone="warn" onClick={() => spring(true)} tip={{ title: 'Trigger it', body: 'You deliberately spring the trap from where you stand. It goes off once and never again.', page: 118 }} />}
          {!d.spotted && d.locked && <Action icon="lock" title="Pick the lock" sub={`Lockpick · Thievery ${thv}%`} disabled={!(h.items.lockpicks > 0) || thv === 0} why={!(h.items.lockpicks > 0) ? 'You need a Lockpick: craft one at Camp from Crafting Supplies.' : 'Your Thievery is 0: the check cannot succeed.'}
            onClick={() => (hidden ? spring(false) : step(E.thieveryPlan(), (f) => E.pickLock(game, d.id, f), { title: 'Pick the lock', skill: 'Thievery' }))} tip={{ title: 'Pick the lock', body: 'A failure snaps the Lockpick, but the next attempt is a step easier.', page: 118 }} />}
          {!d.spotted && d.locked && <Action icon="fist" title="Force it" sub={`Athletics ${ath + 20 * (d.forceTries || 0)}% · noisy: a Tension Check`} onClick={() => (hidden ? spring(false) : step(E.forcePlan(game), (f) => E.forceDoor(game, d.id, f), { title: 'Force the door', skill: 'Athletics', bonus: 20 * (d.forceTries || 0) }))} tip={{ title: 'Brute force', body: 'Each attempt after the first gets +20, and every attempt makes enough noise for a Tension Check.', page: 118 }} />}
          {!d.spotted && !d.locked && !d.open && <Action icon="door" title="Open it" sub={hidden ? 'Whatever is set on it will go off' : 'And see what lies beyond'} tone="primary" onClick={() => (hidden ? spring(false) : commit(E.openDoor(game, d.id)))} />}
          {d.open && <Action icon="next" title="Go through" sub="The room beyond: shape, Lair, Tension and encounter" tone="primary" onClick={() => { onClose(); go(d.id); }} />}
          <Action icon="back" title="Leave it" sub="Try another way" onClick={onClose} />
        </div>
      )}
      <p className="dbt-note">Unlocking a door or disarming its trap earns 10 XP. You carry {h.items.tools || 0} Thieves&apos; Tools and {h.items.lockpicks || 0} Lockpick{h.items.lockpicks === 1 ? '' : 's'}.</p>
    </Sheet>
  );
}
