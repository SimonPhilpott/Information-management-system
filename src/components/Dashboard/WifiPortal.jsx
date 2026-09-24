import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Wifi, Plus, Trash2, Pencil, Save, X, Eye, EyeOff, ArrowUp, ArrowDown, ShieldCheck, LogIn, Lock, RotateCw } from 'lucide-react';
import PortalShell from './PortalShell';

// A password box that is masked until the eye is pressed.
function SecretInput({ value, onChange, placeholder, className }) {
  const [shown, setShown] = useState(false);
  return (
    <div className="relative">
      <input type={shown ? 'text' : 'password'} autoComplete="new-password" value={value} placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)} className={`${className} pr-9`} />
      <button type="button" onClick={() => setShown(!shown)} title={shown ? 'Hide password' : 'Show password'}
        className="absolute right-2 top-1/2 -translate-y-1/2 opacity-60 hover:opacity-100">
        {shown ? <EyeOff size={14} /> : <Eye size={14} />}
      </button>
    </div>
  );
}

const REVEAL_SECONDS = 10;

export default function WifiPortal({ theme = 'dark', onThemeToggle, setCurrentPath }) {
  const isDark = theme === 'dark';
  const [networks, setNetworks] = useState([]);
  const [needsSignIn, setNeedsSignIn] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [ssid, setSsid] = useState('');
  const [password, setPassword] = useState('');
  const [editing, setEditing] = useState(null);           // { id, ssid, password }
  const [revealed, setRevealed] = useState({});           // id -> plaintext, cleared automatically
  const timers = useRef({});
  const [notification, setNotification] = useState(null);

  const showToast = useCallback((msg, type = 'success') => {
    setNotification({ msg, type });
    setTimeout(() => setNotification((prev) => (prev?.msg === msg ? null : prev)), 3500);
  }, []);

  const call = useCallback(async (url, options) => {
    const res = await fetch(url, { credentials: 'same-origin', ...options });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) { setNeedsSignIn(true); throw new Error(data.error || 'Sign in required.'); }
    if (!res.ok || data.success === false) throw new Error(data.error || 'Request failed.');
    return data;
  }, []);

  const load = useCallback(async () => {
    try {
      const d = await call('/api/wifi');
      setNeedsSignIn(false);
      setNetworks(d.networks);
    } catch (_) { /* needsSignIn is set by call() */ }
    finally { setIsLoading(false); }
  }, [call]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => () => Object.values(timers.current).forEach(clearTimeout), []);

  const signIn = async () => {
    try {
      const d = await (await fetch('/api/auth/url')).json();
      if (d.url) window.location.href = d.url;
    } catch (err) { showToast(err.message, 'error'); }
  };

  const post = (url, method, body) => call(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });

  const add = async () => {
    try {
      await post('/api/wifi', 'POST', { ssid, password });
      setSsid(''); setPassword('');
      showToast('Network saved - its password is encrypted.');
      load();
    } catch (err) { showToast(err.message, 'error'); }
  };

  const saveEdit = async () => {
    try {
      const body = { ssid: editing.ssid };
      if (editing.password) body.password = editing.password;
      if (editing.clear) body.clearPassword = true;
      await post(`/api/wifi/${editing.id}`, 'PUT', body);
      setEditing(null);
      showToast('Saved.');
      load();
    } catch (err) { showToast(err.message, 'error'); }
  };

  const remove = async (n) => {
    if (!window.confirm(`Delete "${n.ssid}" and its saved password?`)) return;
    try { await call(`/api/wifi/${n.id}`, { method: 'DELETE' }); showToast('Deleted.'); load(); }
    catch (err) { showToast(err.message, 'error'); }
  };

  const move = async (n, delta) => {
    try { const d = await post(`/api/wifi/${n.id}/move`, 'POST', { delta }); setNetworks(d.networks); }
    catch (err) { showToast(err.message, 'error'); }
  };

  // Fetch the plaintext only when the eye is pressed, and put the mask back after a few seconds.
  const toggleReveal = async (n) => {
    if (revealed[n.id] !== undefined) {
      clearTimeout(timers.current[n.id]);
      setRevealed(({ [n.id]: _gone, ...rest }) => rest);
      return;
    }
    try {
      const d = await post(`/api/wifi/${n.id}/reveal`, 'POST');
      setRevealed((r) => ({ ...r, [n.id]: d.password }));
      timers.current[n.id] = setTimeout(() => setRevealed(({ [n.id]: _gone, ...rest }) => rest), REVEAL_SECONDS * 1000);
    } catch (err) { showToast(err.message, 'error'); }
  };

  const panel = `rounded-2xl border p-5 ${isDark ? 'bg-slate-900/40 border-white/5' : 'bg-white/70 border-[#2E2B27]/10 shadow-sm'}`;
  const field = `w-full px-3 py-2 rounded-lg text-xs outline-none border ${isDark ? 'bg-slate-950/60 border-white/10 text-slate-100' : 'bg-white border-[#2E2B27]/10 text-slate-900'}`;
  const iconBtn = `p-1.5 rounded-lg disabled:opacity-30 ${isDark ? 'hover:bg-white/10' : 'hover:bg-black/5'}`;
  const gradient = 'from-sky-400 to-blue-600';

  return (
    <PortalShell title="Wi-Fi" subtitle="/ims/wifi • the networks Ims can connect to"
      icon={Wifi} gradient={gradient} glow="rgba(56,189,248,0.3)"
      isDark={isDark} onThemeToggle={onThemeToggle} setCurrentPath={setCurrentPath} notification={notification} maxWidth="max-w-3xl">

      <div className={`p-3 rounded-xl border flex items-start gap-3 text-[11px] leading-relaxed ${isDark ? 'bg-slate-900/40 border-white/5 text-slate-400' : 'bg-white/70 border-[#2E2B27]/10 text-slate-600'}`}>
        <ShieldCheck size={15} className="shrink-0 mt-0.5 text-emerald-500" />
        <span>
          Passwords are <strong>encrypted on disk</strong> (AES-256-GCM) and never sent to this page - they show as dots until you press the eye, which fetches that one password for {REVEAL_SECONDS} seconds and is recorded in an access log.
          This page only works while you are signed in with your Google account.
        </span>
      </div>

      {needsSignIn ? (
        <div className={`${panel} text-center py-10 flex flex-col items-center gap-4`}>
          <Lock size={28} className="opacity-60" />
          <p className="text-xs text-slate-500 max-w-sm">Wi-Fi passwords are only available to your signed-in Google account. Sign in to view or change them.</p>
          <button onClick={signIn} className={`px-5 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 bg-gradient-to-r ${gradient} text-white active:scale-95`}>
            <LogIn size={14} /> Sign in with Google
          </button>
        </div>
      ) : isLoading ? (
        <div className="py-16 flex justify-center"><RotateCw size={22} className="animate-spin opacity-50" /></div>
      ) : (
        <>
          <div className={panel}>
            <h2 className="text-xs font-black uppercase tracking-wider mb-3">Add a network</h2>
            <div className="grid grid-cols-1 sm:grid-cols-5 gap-3 items-end">
              <div className="sm:col-span-2">
                <label className="text-[10px] font-bold uppercase tracking-wider mb-1 block opacity-70">Network name (SSID)</label>
                <input className={field} value={ssid} onChange={(e) => setSsid(e.target.value)} placeholder="e.g. HomeWiFi" autoComplete="off" />
              </div>
              <div className="sm:col-span-2">
                <label className="text-[10px] font-bold uppercase tracking-wider mb-1 block opacity-70">Password</label>
                <SecretInput className={field} value={password} onChange={setPassword} placeholder="8-63 characters (blank = open network)" />
              </div>
              <button onClick={add} disabled={!ssid.trim()} className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-2 bg-gradient-to-r ${gradient} text-white active:scale-95 disabled:opacity-40`}>
                <Plus size={14} /> Add
              </button>
            </div>
          </div>

          <div className={panel}>
            <h2 className="text-xs font-black uppercase tracking-wider mb-1">Saved networks ({networks.length})</h2>
            <p className="text-[11px] text-slate-500 mb-3">Ims tries them in this order.</p>
            {networks.length === 0 ? (
              <p className="text-xs text-slate-500 py-6 text-center">No networks saved yet.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {networks.map((n, i) => (
                  <div key={n.id} className={`p-3 rounded-xl border text-xs ${isDark ? 'bg-slate-950/40 border-white/5' : 'bg-white border-[#2E2B27]/10'}`}>
                    {editing?.id === n.id ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="text-[10px] font-bold uppercase tracking-wider mb-1 block opacity-70">Network name</label>
                          <input className={field} value={editing.ssid} onChange={(e) => setEditing({ ...editing, ssid: e.target.value })} />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold uppercase tracking-wider mb-1 block opacity-70">New password (blank keeps the current one)</label>
                          <SecretInput className={field} value={editing.password} onChange={(v) => setEditing({ ...editing, password: v, clear: false })} placeholder="unchanged" />
                        </div>
                        <div className="sm:col-span-2 flex items-center gap-2">
                          <button onClick={saveEdit} className={`px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-2 bg-gradient-to-r ${gradient} text-white`}><Save size={13} />Save</button>
                          <button onClick={() => setEditing(null)} className={`px-3 py-2 rounded-xl text-xs font-bold ${isDark ? 'bg-white/5' : 'bg-black/5'}`}><X size={13} /></button>
                          {n.hasPassword && (
                            <label className="ml-auto flex items-center gap-2 text-[11px] cursor-pointer">
                              <input type="checkbox" checked={Boolean(editing.clear)} onChange={(e) => setEditing({ ...editing, clear: e.target.checked, password: '' })} /> Make this an open network
                            </label>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-3">
                        <span className="w-6 h-6 rounded-md bg-sky-500/15 text-sky-400 text-[11px] font-black flex items-center justify-center shrink-0">{i + 1}</span>
                        <div className="min-w-0 flex-1">
                          <div className="font-bold text-sm truncate">{n.ssid}</div>
                          <div className="font-mono text-[11px] text-slate-500 flex items-center gap-1.5">
                            <Lock size={10} />
                            {!n.hasPassword ? 'open network (no password)' : revealed[n.id] !== undefined ? revealed[n.id] : '••••••••••••'}
                          </div>
                        </div>
                        {n.hasPassword && (
                          <button onClick={() => toggleReveal(n)} className={iconBtn} title={revealed[n.id] !== undefined ? 'Hide password' : 'Show password'}>
                            {revealed[n.id] !== undefined ? <EyeOff size={15} /> : <Eye size={15} />}
                          </button>
                        )}
                        <button onClick={() => move(n, -1)} disabled={i === 0} className={iconBtn} title="Try earlier"><ArrowUp size={14} /></button>
                        <button onClick={() => move(n, 1)} disabled={i === networks.length - 1} className={iconBtn} title="Try later"><ArrowDown size={14} /></button>
                        <button onClick={() => setEditing({ id: n.id, ssid: n.ssid, password: '' })} className={iconBtn} title="Edit"><Pencil size={14} /></button>
                        <button onClick={() => remove(n)} className={`${iconBtn} text-red-400`} title="Delete"><Trash2 size={14} /></button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </PortalShell>
  );
}
