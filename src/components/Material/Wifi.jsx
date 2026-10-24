// Wi-Fi in the IMS design (24 Oct 2026): the networks Ims connects to, in the order he tries them. Each a card (show
// the password for 10 seconds, move up or down, change, delete); Add a network is the button in the bottom right.
// Passwords are encrypted on disk and only fetched one at a time when you press the eye. The same /api/wifi requests
// as before (Dashboard/WifiPortal.jsx); signed-in only.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import ServicePage, { ItemCard, Empty, Fab } from './ServicePage';
import { Icon, IconButton, Btn, Sheet, TextField, Confirm, useSnack, Spinner } from '../HomebrewBeta/ui';

const REVEAL = 10;

function Secret({ label, value, onChange, placeholder, help }) {
  const [shown, setShown] = useState(false);
  return (
    <div className="imsm-secret">
      <TextField label={label} type={shown ? 'text' : 'password'} autoComplete="new-password" value={value} onChange={onChange} placeholder={placeholder} help={help} />
      <IconButton icon={shown ? 'close' : 'info'} label={shown ? 'Hide it' : 'Show it'} onClick={() => setShown(!shown)} />
    </div>
  );
}

function Body() {
  const snack = useSnack();
  const [list, setList] = useState(null);
  const [needsSignIn, setNeedsSignIn] = useState(false);
  const [form, setForm] = useState(null);
  const [shown, setShown] = useState({});
  const [confirm, setConfirm] = useState(null);
  const timers = useRef({});
  const call = useCallback(async (url, options) => {
    const r = await fetch(url, { credentials: 'same-origin', ...options });
    const d = await r.json().catch(() => ({}));
    if (r.status === 401) { setNeedsSignIn(true); throw new Error(d.error || 'Sign in first.'); }
    if (!r.ok || d.success === false) throw new Error(d.error || 'That didn\'t work.');
    return d;
  }, []);
  const post = (url, method, body) => call(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
  const load = useCallback(async () => { try { const d = await call('/api/wifi'); setNeedsSignIn(false); setList(d.networks || []); } catch { /* sign-in shown */ } }, [call]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => () => Object.values(timers.current).forEach(clearTimeout), []);
  const signIn = async () => { try { const d = await (await fetch(`/api/auth/url?returnTo=${encodeURIComponent(window.location.pathname)}`)).json(); if (d.url) window.location.href = d.url; } catch (e) { snack(e.message, { error: true }); } };

  const save = async () => {
    try {
      if (form.id) {
        const body = { ssid: form.ssid };
        if (form.password) body.password = form.password;
        if (form.clear) body.clearPassword = true;
        await post(`/api/wifi/${form.id}`, 'PUT', body); snack('Saved.');
      } else { await post('/api/wifi', 'POST', { ssid: form.ssid, password: form.password }); snack('Network saved. Its password is encrypted.'); }
      setForm(null); load();
    } catch (e) { snack(e.message, { error: true }); }
  };
  const remove = (n) => setConfirm({ title: `Delete "${n.ssid}"?`, body: 'Its saved password goes too.', okLabel: 'Delete', danger: true, onOk: async () => { try { await call(`/api/wifi/${n.id}`, { method: 'DELETE' }); snack('Deleted.'); load(); } catch (e) { snack(e.message, { error: true }); } } });
  const move = async (n, delta) => { try { setList((await post(`/api/wifi/${n.id}/move`, 'POST', { delta })).networks); } catch (e) { snack(e.message, { error: true }); } };
  const reveal = async (n) => {
    if (shown[n.id] !== undefined) { clearTimeout(timers.current[n.id]); setShown(({ [n.id]: _x, ...rest }) => rest); return; } // eslint-disable-line no-unused-vars
    try {
      const d = await post(`/api/wifi/${n.id}/reveal`, 'POST');
      setShown((s) => ({ ...s, [n.id]: d.password }));
      timers.current[n.id] = setTimeout(() => setShown(({ [n.id]: _x, ...rest }) => rest), REVEAL * 1000); // eslint-disable-line no-unused-vars
    } catch (e) { snack(e.message, { error: true }); }
  };

  if (needsSignIn) return <Empty icon="person" title="Sign in to see your Wi-Fi networks">The passwords are only shown to your own signed-in Google account.<br /><br /><Btn icon="person" onClick={signIn}>Sign in with Google</Btn></Empty>;
  return (
    <>
      <div className="imsm-banner info"><Icon n="check" size={20} /><span>Passwords are <b>encrypted on disk</b> and never sent to this page. Press the eye to see one for {REVEAL} seconds; each look is recorded.</span></div>
      {list == null ? <div className="imsm-empty"><Spinner /></div> : !list.length ? <Empty icon="sync" title="No networks yet" /> : (
        <>
          <p className="muted" style={{ margin: 0 }}>Ims tries them in this order.</p>
          <div className="imsm-list">
            {list.map((n, i) => (
              <ItemCard key={n.id} icon={null} title={<><span className="imsm-num">{i + 1}</span>{n.ssid}</>}
                meta={<span className="imsm-mono">{!n.hasPassword ? 'Open network, no password' : shown[n.id] !== undefined ? shown[n.id] : '••••••••••••'}</span>}>
                {n.hasPassword && <IconButton icon={shown[n.id] !== undefined ? 'close' : 'info'} label={shown[n.id] !== undefined ? 'Hide the password' : `Show the password for ${REVEAL} seconds`} onClick={() => reveal(n)} />}
                <IconButton icon="up" label="Try it earlier" onClick={() => move(n, -1)} disabled={i === 0} />
                <IconButton icon="down" label="Try it later" onClick={() => move(n, 1)} disabled={i === list.length - 1} />
                <IconButton icon="edit" label={`Change ${n.ssid}`} onClick={() => setForm({ id: n.id, ssid: n.ssid, password: '', hasPassword: n.hasPassword })} />
                <IconButton icon="del" label={`Delete ${n.ssid}`} onClick={() => remove(n)} />
              </ItemCard>
            ))}
          </div>
        </>
      )}
      <Sheet open={Boolean(form)} onClose={() => setForm(null)} title={form?.id ? `Change ${form.ssid}` : 'Add a network'}
        footer={<div className="imsm-row end"><Btn kind="text" onClick={() => setForm(null)}>Cancel</Btn><Btn icon="check" disabled={!form?.ssid.trim()} onClick={save}>Save</Btn></div>}>
        {form && (
          <div className="imsm-form">
            <TextField label="Network name (SSID)" value={form.ssid} onChange={(v) => setForm({ ...form, ssid: v })} autoComplete="off" autoFocus />
            <Secret label={form.id ? 'New password' : 'Password'} value={form.password} onChange={(v) => setForm({ ...form, password: v, clear: false })} help={form.id ? 'Blank keeps the current one' : '8 to 63 characters; blank for an open network'} />
            {form.id && form.hasPassword && <label className="imsm-row" style={{ cursor: 'pointer' }}><span className="imsm-switch"><input type="checkbox" checked={Boolean(form.clear)} onChange={(e) => setForm({ ...form, clear: e.target.checked, password: '' })} /><i /></span>Make it an open network (no password)</label>}
          </div>
        )}
      </Sheet>
      <Confirm open={Boolean(confirm)} {...(confirm || {})} onClose={() => setConfirm(null)} onOk={confirm?.onOk || (() => {})} />
      {list != null && <Fab label="Add a network" onClick={() => setForm({ ssid: '', password: '' })} />}
    </>
  );
}

export default function Wifi({ theme = 'light', onThemeToggle, setCurrentPath }) {
  return (
    <ServicePage title="Wi-Fi" icon="sync" accent="sky" theme={theme} onThemeToggle={onThemeToggle} setCurrentPath={setCurrentPath} sub="The networks Ims can connect to.">
      <Body />
    </ServicePage>
  );
}
