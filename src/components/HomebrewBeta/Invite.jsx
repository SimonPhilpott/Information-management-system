// Homebrew: inviting friends and family (22 Oct, carried over from the retired classic portal). An invited person signs
// in with the Google account the invite names and sees Homebrew only - basic sign-in, nothing else of IMS. Same
// /api/homebrew/invites service as before.
import React, { useCallback, useEffect, useState } from 'react';
import { Sheet, Btn, IconButton, TextField, Confirm, useSnack } from './ui';

const when = (t) => new Date(t).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' });

export default function InviteSheet({ open, onClose }) {
  const snack = useSnack();
  const [list, setList] = useState([]);
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [stopping, setStopping] = useState(null);
  const link = `${window.location.origin}/ims/homebrew?invite=1`;

  const load = useCallback(async () => {
    try {
      const d = await (await fetch('/api/homebrew/invites')).json();
      if (d.success) setList(d.invites || []);
    } catch { /* the list just stays as it was */ }
  }, []);
  useEffect(() => { if (open) load(); }, [open, load]);

  const invite = async (to = email) => {
    const e = String(to || '').trim();
    if (!e) return;
    setBusy(true);
    try {
      const d = await (await fetch('/api/homebrew/invites', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: e }) })).json();
      if (!d.success) throw new Error(d.error || 'Couldn\'t invite them.');
      setEmail('');
      load();
      snack(`${d.invite.email} can now sign in to Homebrew.`);
    } catch (err) { snack(err.message, { error: true }); } finally { setBusy(false); }
  };
  const stop = async (e) => {
    try {
      const d = await (await fetch(`/api/homebrew/invites/${encodeURIComponent(e)}`, { method: 'DELETE' })).json();
      if (!d.success) throw new Error(d.error || 'Couldn\'t withdraw it.');
      load();
      snack(`${e} can no longer get in.`);
    } catch (err) { snack(err.message, { error: true }); }
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(link); snack('Invite link copied.'); } catch { snack('Couldn\'t copy it - the link is ' + link, { error: true }); }
  };

  return (
    <Sheet open={open} onClose={onClose} title="Invite someone">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <p className="muted t-bm" style={{ margin: 0 }}>They sign in with the Google account you name here and see Homebrew only, nothing else of IMS. They can read every recipe and brew, start brews of their own and keep their own favourites, but can't change your recipes or brews. You'll see their brews too.</p>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
          <TextField label="Their email" value={email} onChange={setEmail} type="email" style={{ flex: 1 }} onKeyDown={(e) => { if (e.key === 'Enter') invite(); }} />
          <Btn kind="filled" icon="add" busy={busy} onClick={() => invite()} style={{ marginTop: 8 }} disabled={!email.trim()}>Invite</Btn>
        </div>
        <div className="inv-link">
          <span className="t-bm" style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{link}</span>
          <Btn kind="tonal" icon="copy" onClick={copy}>Copy link</Btn>
        </div>
        <h3 className="t-ts muted" style={{ margin: '4px 0 0' }}>People you've invited</h3>
        {list.length ? (
          <ul className="inv-list">
            {list.map((inv) => (
              <li key={inv.email} className={inv.revokedAt ? 'off' : ''}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div className="t-tm" style={{ overflowWrap: 'anywhere' }}>{inv.name || inv.email}{inv.revokedAt ? <span className="tag" style={{ marginLeft: 8 }}>Withdrawn</span> : null}</div>
                  <div className="muted t-bs">{inv.name ? `${inv.email} · ` : ''}{inv.lastSignInAt ? `Last in ${when(inv.lastSignInAt)}` : 'Not signed in yet'}</div>
                </div>
                {inv.revokedAt
                  ? <Btn kind="text" onClick={() => invite(inv.email)}>Invite again</Btn>
                  : <IconButton icon="close" label={`Stop ${inv.email} getting in`} onClick={() => setStopping(inv.email)} />}
              </li>
            ))}
          </ul>
        ) : <p className="muted t-bm" style={{ margin: 0 }}>No one yet.</p>}
      </div>
      <Confirm open={Boolean(stopping)} title={`Stop ${stopping} getting in?`} body="They won't be able to open Homebrew any more. You can invite them again later." okLabel="Withdraw" danger
        onClose={() => setStopping(null)} onOk={() => { const e = stopping; setStopping(null); stop(e); }} />
    </Sheet>
  );
}
