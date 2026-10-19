import React, { useState, useEffect, useCallback } from 'react';
import { useFocusItem } from '../../hooks/useFocusItem';
import { FlaskConical, Plus, Save, Trash2, RotateCw, Sparkles, Bell, X, Wand2 } from 'lucide-react';
import PortalShell from './PortalShell';

// Homebrew: Simon's meads, braggots and other brews - the recipe, what happened to each batch, how it tasted as
// it aged, and insights (the flavour profile it's heading for, what to tweak, what a change would do).
const GRADIENT = 'from-amber-500 to-orange-600';
const ING_TYPES = ['honey', 'malt', 'fruit', 'spice', 'hops', 'sugar', 'acid', 'tannin', 'other'];
const ING_STAGES = ['primary', 'secondary', 'backsweeten', 'bottling'];
const KIND_LABEL = { reading: 'Reading', nutrient: 'Nutrient', degas: 'Degas', addition: 'Addition', rack: 'Racked', stabilise: 'Stabilised', backsweeten: 'Backsweetened', bottle: 'Bottled', note: 'Note' };
const STATUS_CLS = { planning: 'text-slate-500', fermenting: 'text-amber-500', conditioning: 'text-sky-500', bottled: 'text-emerald-500', finished: 'text-emerald-600', dumped: 'text-red-500' };
const when = (t) => (t ? new Date(t).toLocaleString('en-GB', { timeZone: 'Europe/London', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '');
const g3 = (g) => (g ? Number(g).toFixed(3) : '-');
const EMPTY_BREW = { name: '', style: 'Traditional mead', status: 'planning', batchLitres: '', startedOn: '', bottledOn: '', targetOg: '', targetFg: '', og: '', fg: '', sweetness: '', carbonation: '', yeast: '', yeastNotes: '', nutrients: '', water: '', method: '', notes: '', ingredients: [] };
const PROFILE_KEYS = [['sweetness', 'Sweetness'], ['body', 'Body'], ['acidity', 'Acidity'], ['alcoholHeat', 'Alcohol heat'], ['aromaIntensity', 'Aroma'], ['tannin', 'Tannin']];

function Bars({ values, compare, isDark }) {
  return (
    <div className="flex flex-col gap-1.5">
      {PROFILE_KEYS.filter(([k]) => values?.[k] != null || compare?.[k] != null).map(([k, label]) => (
        <div key={k} className="flex items-center gap-2 text-[11px]">
          <span className="w-24 shrink-0 text-slate-500">{label}</span>
          <div className={`flex-1 h-2 rounded-full relative ${isDark ? 'bg-white/10' : 'bg-[#2E2B27]/10'}`}>
            {compare?.[k] != null && <div className="absolute inset-y-0 left-0 rounded-full bg-slate-400/50" style={{ width: `${(compare[k] / 5) * 100}%` }} />}
            {values?.[k] != null && <div className={`absolute inset-y-0 left-0 rounded-full bg-gradient-to-r ${GRADIENT} ${compare ? 'h-1 top-0.5' : ''}`} style={{ width: `${(values[k] / 5) * 100}%` }} />}
          </div>
          <span className="w-10 shrink-0 text-right">{compare?.[k] != null ? `${compare[k]}→` : ''}{values?.[k] ?? '-'}</span>
        </div>
      ))}
    </div>
  );
}

function GravityChart({ logs, og, thirdBreak, isDark }) {
  const pts = logs.filter((l) => l.gravity).map((l) => ({ t: l.at, g: l.gravity }));
  if (pts.length < 2) return <p className="text-[11px] text-slate-500">Log two or more gravity readings to see the fermentation curve.</p>;
  const W = 600, H = 160, pad = 28;
  const t0 = pts[0].t, t1 = pts[pts.length - 1].t || t0 + 1;
  const gs = pts.map((p) => p.g).concat(thirdBreak ? [thirdBreak] : []);
  const gMax = Math.max(...gs, og || 0) + 0.003, gMin = Math.min(...gs) - 0.003;
  const x = (t) => pad + ((t - t0) / Math.max(1, t1 - t0)) * (W - pad * 2);
  const y = (g) => pad / 2 + ((gMax - g) / Math.max(0.001, gMax - gMin)) * (H - pad);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto">
      {thirdBreak && <><line x1={pad} x2={W - pad} y1={y(thirdBreak)} y2={y(thirdBreak)} stroke="#f59e0b" strokeDasharray="4 4" strokeOpacity="0.6" />
        <text x={W - pad} y={y(thirdBreak) - 4} textAnchor="end" fontSize="10" fill="#f59e0b">1/3 break {thirdBreak.toFixed(3)}</text></>}
      <polyline fill="none" stroke="#f97316" strokeWidth="2.5" points={pts.map((p) => `${x(p.t)},${y(p.g)}`).join(' ')} />
      {pts.map((p, i) => <circle key={i} cx={x(p.t)} cy={y(p.g)} r="3.5" fill="#f97316" />)}
      <text x={pad} y={H - 4} fontSize="10" fill={isDark ? '#94a3b8' : '#64748b'}>{new Date(t0).toLocaleDateString('en-GB')}</text>
      <text x={W - pad} y={H - 4} textAnchor="end" fontSize="10" fill={isDark ? '#94a3b8' : '#64748b'}>{new Date(t1).toLocaleDateString('en-GB')}</text>
      <text x={4} y={y(gMax - 0.003) + 3} fontSize="10" fill={isDark ? '#94a3b8' : '#64748b'}>{(gMax - 0.003).toFixed(3)}</text>
      <text x={4} y={y(gMin + 0.003) + 3} fontSize="10" fill={isDark ? '#94a3b8' : '#64748b'}>{(gMin + 0.003).toFixed(3)}</text>
    </svg>
  );
}

export default function HomebrewPortal({ theme = 'dark', onThemeToggle, setCurrentPath }) {
  const isDark = theme === 'dark';
  const [brews, setBrews] = useState([]);
  const [meta, setMeta] = useState({ styles: [], statuses: [], logKinds: [] });
  useFocusItem(brews.length);
  const [selId, setSelId] = useState(null);
  const [brew, setBrew] = useState(null);
  const [form, setForm] = useState(EMPTY_BREW);
  const [tab, setTab] = useState('recipe');
  const [busy, setBusy] = useState('');
  const [logForm, setLogForm] = useState({ kind: 'reading', gravity: '', tempC: '', ph: '', text: '', at: '' });
  const [taste, setTaste] = useState({ stage: '', rating: 7, sweetness: 3, body: 3, acidity: 3, heat: 2, aroma: '', flavour: '', clarity: '', carbonation: '', verdict: '', changeNext: '' });
  const [change, setChange] = useState('');
  const [whatIf, setWhatIf] = useState(null);
  const [notification, setNotification] = useState(null);
  const notify = (msg, type = 'success') => { setNotification({ msg, type }); setTimeout(() => setNotification(null), 3500); };

  const panel = `rounded-2xl border p-5 min-w-0 ${isDark ? 'bg-slate-900/40 border-white/5' : 'bg-white/70 border-[#2E2B27]/10 shadow-sm'}`;
  const border = isDark ? 'border-white/10' : 'border-[#2E2B27]/10';
  const field = `w-full px-3 py-2 rounded-lg text-xs outline-none border ${isDark ? 'bg-slate-950/60 border-white/10 text-slate-100' : 'bg-white border-[#2E2B27]/15 text-[#2E2B27]'}`;
  const label = 'text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1 block';
  const btn = `px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 border ${border}`;
  const primary = `px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 bg-gradient-to-r ${GRADIENT} text-white disabled:opacity-40`;

  const api = async (url, method = 'GET', body) => {
    const res = await fetch(url, { method, headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined });
    const d = await res.json().catch(() => ({}));
    if (!res.ok || d.success === false) throw new Error(d.error || 'That did not work.');
    return d;
  };
  const loadList = useCallback(async () => {
    try { const d = await api('/api/homebrew'); setBrews(d.brews); setMeta({ styles: d.styles, statuses: d.statuses, logKinds: d.logKinds }); } catch (err) { notify(err.message, 'error'); }
  }, []);
  const loadBrew = useCallback(async (id) => {
    if (!id) { setBrew(null); setForm(EMPTY_BREW); return; }
    try {
      const d = await api(`/api/homebrew/${id}`);
      setBrew(d.brew);
      const b = d.brew;
      setForm({ ...EMPTY_BREW, ...Object.fromEntries(Object.keys(EMPTY_BREW).map((k) => [k, b[k] ?? EMPTY_BREW[k]])), ingredients: b.ingredients || [] });
    } catch (err) { notify(err.message, 'error'); }
  }, []);
  useEffect(() => { loadList(); }, [loadList]);
  useEffect(() => { loadBrew(selId); }, [selId, loadBrew]);

  const run = async (key, fn, ok) => { setBusy(key); try { await fn(); if (ok) notify(ok); } catch (err) { notify(err.message, 'error'); } finally { setBusy(''); } };
  const saveBrew = () => run('save', async () => {
    const d = await api(brew ? `/api/homebrew/${brew.id}` : '/api/homebrew', brew ? 'PUT' : 'POST', form);
    await loadList(); setSelId(d.brew.id); setBrew(d.brew);
  }, 'Brew saved.');
  const removeBrew = () => { if (!window.confirm(`Delete "${brew.name}" and everything logged for it?`)) return; run('del', async () => { await api(`/api/homebrew/${brew.id}`, 'DELETE'); setSelId(null); await loadList(); }, 'Deleted.'); };
  const addLog = () => run('log', async () => {
    const d = await api(`/api/homebrew/${brew.id}/logs`, 'POST', { ...logForm, at: logForm.at || undefined });
    setBrew(d.brew); setLogForm({ kind: logForm.kind, gravity: '', tempC: '', ph: '', text: '', at: '' }); loadList();
  }, 'Logged.');
  const delLog = (id) => run('dlog', async () => { await api(`/api/homebrew/logs/${id}`, 'DELETE'); loadBrew(brew.id); });
  const addTaste = () => run('taste', async () => { const d = await api(`/api/homebrew/${brew.id}/tastings`, 'POST', taste); setBrew(d.brew); loadList(); }, 'Tasting saved.');
  const delTaste = (id) => run('dtaste', async () => { await api(`/api/homebrew/tastings/${id}`, 'DELETE'); loadBrew(brew.id); });
  const getInsight = () => run('insight', async () => { const d = await api(`/api/homebrew/${brew.id}/insight`, 'POST', {}); setBrew(d.brew); });
  const askWhatIf = () => run('whatif', async () => { const d = await api(`/api/homebrew/${brew.id}/what-if`, 'POST', { change }); setWhatIf(d.result); });
  const pitched = () => { if (!window.confirm('Set reminders for the staggered nutrient doses - 24, 48 and 72 hours from now, and a 1/3-break check on day 6?')) return; run('remind', async () => { await api(`/api/homebrew/${brew.id}/nutrient-reminders`, 'POST', {}); loadBrew(brew.id); }, 'Nutrient reminders set - see Reminders.'); };

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const setIng = (i, k, v) => setForm({ ...form, ingredients: form.ingredients.map((x, j) => (j === i ? { ...x, [k]: v } : x)) });
  const c = brew?.calc || {};
  const ins = brew?.insight;

  return (
    <PortalShell title="Homebrew" subtitle="/ims/homebrew • your meads, braggots and brews"
      icon={FlaskConical} gradient={GRADIENT} glow="rgba(245,158,11,0.3)"
      isDark={isDark} onThemeToggle={onThemeToggle} setCurrentPath={setCurrentPath} notification={notification} maxWidth="max-w-6xl">
      <div className="grid grid-cols-1 lg:grid-cols-[17rem_minmax(0,1fr)] gap-5 items-start">
        <div className={panel}>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-black uppercase tracking-wider">Brews ({brews.length})</h2>
            <button onClick={() => { setSelId(null); setBrew(null); setForm(EMPTY_BREW); setTab('recipe'); }} className={primary}><Plus size={13} /> New</button>
          </div>
          <div className="flex flex-col gap-2">
            {brews.map((b) => (
              <button key={b.id} id={`brew-${b.id}`} onClick={() => { setSelId(b.id); setWhatIf(null); }}
                className={`text-left rounded-xl border px-3 py-2.5 ${border} ${selId === b.id ? (isDark ? 'bg-amber-500/10 border-amber-500/40' : 'bg-amber-50 border-amber-400/50') : isDark ? 'bg-slate-950/40' : 'bg-white'}`}>
                <div className="text-xs font-bold break-words">{b.name}</div>
                <div className="text-[11px] text-slate-500">{b.style || 'Brew'}{b.startedOn ? ` · ${b.startedOn}` : ''}</div>
                <div className="text-[11px] flex gap-2 mt-0.5"><span className={`font-semibold ${STATUS_CLS[b.status] || ''}`}>{b.status}</span>{b.calc.abv ? <span>{b.calc.abv}%{b.calc.abvFinal ? '' : ' so far'}</span> : null}{b.rating ? <span>★ {b.rating}/10</span> : null}</div>
              </button>
            ))}
            {!brews.length && <p className="text-xs text-slate-500">No brews yet - add your first with New.</p>}
          </div>
        </div>

        <div className="flex flex-col gap-5 min-w-0">
          {brew && (
            <div className={panel}>
              <div className="flex flex-wrap gap-2 text-[11px]">
                {[['ABV', c.abv ? `${c.abv}%${c.abvFinal ? '' : ' so far'}` : '-'], ['Potential', c.potentialAbv ? `${c.potentialAbv}%` : '-'], ['OG', g3(brew.og)], ['Latest', g3(c.latestGravity)],
                  ['1/3 break', g3(c.thirdBreak)], ['Attenuation', c.attenuation != null ? `${c.attenuation}%` : '-'], ['Sweetness', c.sweetnessClass || '-'], ['Strength', c.strengthClass || '-'], ['Day', c.daysSinceStart ?? '-']].map(([k, v]) => (
                  <span key={k} className={`px-2.5 py-1 rounded-full border ${border}`}><b>{k}</b> {v}</span>
                ))}
              </div>
              <div className="flex flex-wrap gap-2 mt-3">
                {['recipe', 'log', 'tastings', 'insights'].map((t) => (
                  <button key={t} onClick={() => setTab(t)} className={`${btn} ${tab === t ? `bg-gradient-to-r ${GRADIENT} text-white border-transparent` : ''}`}>{t[0].toUpperCase() + t.slice(1)}</button>
                ))}
                {(brew.status === 'planning' || brew.status === 'fermenting') && <button onClick={pitched} disabled={busy === 'remind'} className={`${btn} ml-auto`}><Bell size={13} /> I've just pitched</button>}
              </div>
            </div>
          )}

          {(!brew || tab === 'recipe') && (
            <div className={panel}>
              <h2 className="text-xs font-black uppercase tracking-wider mb-3">{brew ? 'Recipe' : 'New brew'}</h2>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2"><span className={label}>Name</span><input value={form.name} onChange={set('name')} placeholder="e.g. Christmas braggot for Dad" className={field} /></div>
                <div><span className={label}>Style</span><select value={form.style || ''} onChange={set('style')} className={field}>{meta.styles.map((s) => <option key={s}>{s}</option>)}</select></div>
                <div><span className={label}>Status</span><select value={form.status} onChange={set('status')} className={field}>{meta.statuses.map((s) => <option key={s}>{s}</option>)}</select></div>
                <div><span className={label}>Batch (litres)</span><input type="number" step="0.1" value={form.batchLitres ?? ''} onChange={set('batchLitres')} className={field} /></div>
                <div><span className={label}>Pitched on</span><input type="date" value={form.startedOn || ''} onChange={set('startedOn')} className={field} /></div>
                <div><span className={label}>Target OG</span><input type="number" step="0.001" value={form.targetOg ?? ''} onChange={set('targetOg')} placeholder="1.100" className={field} /></div>
                <div><span className={label}>Target FG</span><input type="number" step="0.001" value={form.targetFg ?? ''} onChange={set('targetFg')} placeholder="1.015" className={field} /></div>
                <div><span className={label}>Bottled on</span><input type="date" value={form.bottledOn || ''} onChange={set('bottledOn')} className={field} /></div>
                <div><span className={label}>Actual OG</span><input type="number" step="0.001" value={form.og ?? ''} onChange={set('og')} placeholder="first reading" className={field} /></div>
                <div><span className={label}>Actual FG</span><input type="number" step="0.001" value={form.fg ?? ''} onChange={set('fg')} className={field} /></div>
                <div><span className={label}>Aiming for</span><select value={form.sweetness || ''} onChange={set('sweetness')} className={field}><option value="">-</option><option>dry</option><option>semi-sweet</option><option>sweet</option></select></div>
                <div><span className={label}>Carbonation</span><select value={form.carbonation || ''} onChange={set('carbonation')} className={field}><option value="">-</option><option>still</option><option>petillant</option><option>sparkling</option></select></div>
                <div className="sm:col-span-2"><span className={label}>Yeast</span><input value={form.yeast || ''} onChange={set('yeast')} placeholder="e.g. Lalvin 71B, 1 sachet" className={field} /></div>
                <div className="sm:col-span-3"><span className={label}>Yeast - how it was pitched</span><input value={form.yeastNotes || ''} onChange={set('yeastNotes')} placeholder="rehydrated with Go-Ferm at 40°C, pitched at 20°C" className={field} /></div>
                <div className="sm:col-span-3"><span className={label}>Nutrients</span><input value={form.nutrients || ''} onChange={set('nutrients')} placeholder="Fermaid-O, TOSNA 4 doses of 1.5 g" className={field} /></div>
                <div className="sm:col-span-3"><span className={label}>Water</span><input value={form.water || ''} onChange={set('water')} placeholder="tap, Campden-treated / bottled spring" className={field} /></div>
              </div>
              <div className="mt-4">
                <span className={label}>Ingredients</span>
                <div className="flex flex-col gap-2">
                  {form.ingredients.map((g, i) => (
                    <div key={i} className="grid grid-cols-2 sm:grid-cols-[7rem_minmax(0,1fr)_5rem_5rem_7rem_2rem] gap-2 items-center">
                      <select value={g.type || 'honey'} onChange={(e) => setIng(i, 'type', e.target.value)} className={field}>{ING_TYPES.map((t) => <option key={t}>{t}</option>)}</select>
                      <input value={g.name || ''} onChange={(e) => setIng(i, 'name', e.target.value)} placeholder="e.g. Heather honey" className={field} />
                      <input value={g.amount || ''} onChange={(e) => setIng(i, 'amount', e.target.value)} placeholder="1.5" className={field} />
                      <input value={g.unit || ''} onChange={(e) => setIng(i, 'unit', e.target.value)} placeholder="kg" className={field} />
                      <select value={g.stage || 'primary'} onChange={(e) => setIng(i, 'stage', e.target.value)} className={field}>{ING_STAGES.map((t) => <option key={t}>{t}</option>)}</select>
                      <button onClick={() => setForm({ ...form, ingredients: form.ingredients.filter((_, j) => j !== i) })} title="Remove" className="text-slate-500 hover:text-red-500 justify-self-center"><X size={14} /></button>
                    </div>
                  ))}
                  <button onClick={() => setForm({ ...form, ingredients: [...form.ingredients, { type: 'honey', name: '', amount: '', unit: 'kg', stage: 'primary' }] })} className={`${btn} self-start`}><Plus size={13} /> Ingredient</button>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
                <div><span className={label}>Method</span><textarea rows={4} value={form.method || ''} onChange={set('method')} placeholder="How you made it - steps, temperatures, timings" className={`${field} resize-y`} /></div>
                <div><span className={label}>Notes</span><textarea rows={4} value={form.notes || ''} onChange={set('notes')} placeholder="Anything else worth remembering" className={`${field} resize-y`} /></div>
              </div>
              <div className="flex gap-2 mt-4">
                <button onClick={saveBrew} disabled={!form.name.trim() || busy === 'save'} className={primary}>{busy === 'save' ? <RotateCw size={13} className="animate-spin" /> : <Save size={13} />} Save</button>
                {brew && <button onClick={removeBrew} className={`${btn} text-red-500`}><Trash2 size={13} /> Delete</button>}
              </div>
            </div>
          )}

          {brew && tab === 'log' && (
            <div className={panel}>
              <h2 className="text-xs font-black uppercase tracking-wider mb-3">Fermentation log</h2>
              <GravityChart logs={brew.logs} og={brew.og} thirdBreak={c.thirdBreak} isDark={isDark} />
              <div className="grid grid-cols-2 sm:grid-cols-[8rem_6rem_5rem_5rem_minmax(0,1fr)] gap-2 mt-4 items-end">
                <div><span className={label}>What</span><select value={logForm.kind} onChange={(e) => setLogForm({ ...logForm, kind: e.target.value })} className={field}>{meta.logKinds.map((k) => <option key={k} value={k}>{KIND_LABEL[k] || k}</option>)}</select></div>
                <div><span className={label}>Gravity</span><input type="number" step="0.001" value={logForm.gravity} onChange={(e) => setLogForm({ ...logForm, gravity: e.target.value })} placeholder="1.042" className={field} /></div>
                <div><span className={label}>°C</span><input type="number" step="0.5" value={logForm.tempC} onChange={(e) => setLogForm({ ...logForm, tempC: e.target.value })} className={field} /></div>
                <div><span className={label}>pH</span><input type="number" step="0.1" value={logForm.ph} onChange={(e) => setLogForm({ ...logForm, ph: e.target.value })} className={field} /></div>
                <div className="col-span-2 sm:col-span-1"><span className={label}>Note</span><input value={logForm.text} onChange={(e) => setLogForm({ ...logForm, text: e.target.value })} placeholder="e.g. 1.5 g Fermaid-O, degassed" className={field} /></div>
              </div>
              <div className="flex flex-wrap gap-2 mt-2 items-end">
                <div><span className={label}>When (blank = now)</span><input type="datetime-local" value={logForm.at} onChange={(e) => setLogForm({ ...logForm, at: e.target.value })} className={field} /></div>
                <button onClick={addLog} disabled={busy === 'log'} className={primary}><Plus size={13} /> Log it</button>
              </div>
              <div className="flex flex-col gap-1.5 mt-4">
                {[...brew.logs].reverse().map((l) => (
                  <div key={l.id} className={`flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs border-b ${border} pb-1.5`}>
                    <span className="text-slate-500 w-28 shrink-0">{when(l.at)}</span>
                    <span className="font-semibold w-24 shrink-0">{KIND_LABEL[l.kind] || l.kind}</span>
                    {l.gravity && <span>{g3(l.gravity)}</span>}{l.tempC != null && <span>{l.tempC}°C</span>}{l.ph != null && <span>pH {l.ph}</span>}
                    <span className="min-w-0 flex-1 break-words text-slate-500">{l.text}{l.source === 'desk' ? ' · said on the desk' : ''}</span>
                    <button onClick={() => delLog(l.id)} className="text-slate-500 hover:text-red-500"><Trash2 size={12} /></button>
                  </div>
                ))}
                {!brew.logs.length && <p className="text-xs text-slate-500">Nothing logged yet. Or just tell Ims - "log a reading of ten forty-two on the mead".</p>}
              </div>
            </div>
          )}

          {brew && tab === 'tastings' && (
            <div className={panel}>
              <h2 className="text-xs font-black uppercase tracking-wider mb-3">How it tasted</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div><span className={label}>Stage</span><input value={taste.stage} onChange={(e) => setTaste({ ...taste, stage: e.target.value })} placeholder="e.g. at racking / bottled / 3 months" className={field} /></div>
                <div><span className={label}>Rating: {taste.rating}/10</span><input type="range" min="1" max="10" value={taste.rating} onChange={(e) => setTaste({ ...taste, rating: Number(e.target.value) })} className="w-full accent-amber-500" /></div>
                {[['sweetness', 'Sweetness', 'dry', 'sweet'], ['body', 'Body', 'thin', 'full'], ['acidity', 'Acidity', 'flat', 'tart'], ['heat', 'Alcohol heat', 'smooth', 'hot']].map(([k, l, lo, hi]) => (
                  <div key={k}><span className={label}>{l}: {taste[k]}/5 <span className="normal-case font-normal">({lo} → {hi})</span></span><input type="range" min="1" max="5" value={taste[k]} onChange={(e) => setTaste({ ...taste, [k]: Number(e.target.value) })} className="w-full accent-amber-500" /></div>
                ))}
                <div><span className={label}>Aroma</span><input value={taste.aroma} onChange={(e) => setTaste({ ...taste, aroma: e.target.value })} placeholder="honey, pear, floral" className={field} /></div>
                <div><span className={label}>Flavour</span><input value={taste.flavour} onChange={(e) => setTaste({ ...taste, flavour: e.target.value })} placeholder="what it tastes like" className={field} /></div>
                <div><span className={label}>Clarity</span><input value={taste.clarity} onChange={(e) => setTaste({ ...taste, clarity: e.target.value })} placeholder="hazy / clear / brilliant" className={field} /></div>
                <div><span className={label}>Carbonation</span><input value={taste.carbonation} onChange={(e) => setTaste({ ...taste, carbonation: e.target.value })} placeholder="still / petillant / sparkling" className={field} /></div>
                <div><span className={label}>Was it nice?</span><input value={taste.verdict} onChange={(e) => setTaste({ ...taste, verdict: e.target.value })} placeholder="your verdict" className={field} /></div>
                <div><span className={label}>Change next time</span><input value={taste.changeNext} onChange={(e) => setTaste({ ...taste, changeNext: e.target.value })} placeholder="e.g. a bit more acid, ferment cooler" className={field} /></div>
              </div>
              <button onClick={addTaste} disabled={busy === 'taste'} className={`${primary} mt-3`}><Plus size={13} /> Save tasting</button>
              <div className="flex flex-col gap-2 mt-4">
                {[...brew.tastings].reverse().map((t) => (
                  <div key={t.id} className={`rounded-xl border ${border} px-3 py-2 text-xs flex flex-col gap-1`}>
                    <div className="flex items-center gap-2"><b>{t.rating ? `★ ${t.rating}/10` : 'Tasting'}</b><span className="text-slate-500">{when(t.at)}{t.stage ? ` · ${t.stage}` : ''}</span>
                      <button onClick={() => delTaste(t.id)} className="ml-auto text-slate-500 hover:text-red-500"><Trash2 size={12} /></button></div>
                    <span className="text-slate-500">Sweetness {t.sweetness ?? '-'} · Body {t.body ?? '-'} · Acidity {t.acidity ?? '-'} · Heat {t.heat ?? '-'}{t.clarity ? ` · ${t.clarity}` : ''}{t.carbonation ? ` · ${t.carbonation}` : ''}</span>
                    {(t.aroma || t.flavour) && <span>{[t.aroma && `Aroma: ${t.aroma}`, t.flavour && `Flavour: ${t.flavour}`].filter(Boolean).join(' · ')}</span>}
                    {t.verdict && <span>{t.verdict}</span>}
                    {t.changeNext && <span className="text-amber-500">Next time: {t.changeNext}</span>}
                  </div>
                ))}
                {!brew.tastings.length && <p className="text-xs text-slate-500">No tastings yet - taste it at racking, at bottling and as it ages, so you can see it change.</p>}
              </div>
            </div>
          )}

          {brew && tab === 'insights' && (
            <>
              <div className={panel}>
                <div className="flex items-center justify-between mb-3 gap-2">
                  <h2 className="text-xs font-black uppercase tracking-wider">Flavour profile and insight</h2>
                  <button onClick={getInsight} disabled={busy === 'insight'} className={primary}>{busy === 'insight' ? <RotateCw size={13} className="animate-spin" /> : <Sparkles size={13} />} {ins ? 'Refresh' : 'Get insight'}</button>
                </div>
                {!ins && <p className="text-xs text-slate-500">Reads the recipe, the log and your tastings (and your other brews, to learn what you like) and says where this one is heading and what to tweak. Takes about 15 seconds.</p>}
                {ins && (
                  <div className="flex flex-col gap-4 text-xs">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <p className="font-bold mb-2">{ins.profile?.style}{ins.profile?.expectedAbv ? ` · ~${ins.profile.expectedAbv}%` : ''}{ins.profile?.expectedFg ? ` · FG ~${g3(ins.profile.expectedFg)}` : ''}</p>
                        <Bars values={ins.profile} isDark={isDark} />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        {ins.profile?.aroma && <p><b>Aroma:</b> {ins.profile.aroma}</p>}
                        {ins.profile?.flavour && <p><b>Flavour:</b> {ins.profile.flavour}</p>}
                        {ins.profile?.finish && <p><b>Finish:</b> {ins.profile.finish}</p>}
                        {ins.progress && <p className="text-slate-500">{ins.progress}</p>}
                      </div>
                    </div>
                    {ins.watchOuts?.length > 0 && <div><p className="font-bold mb-1 text-amber-500">Watch out</p><ul className="list-disc pl-5 flex flex-col gap-1">{ins.watchOuts.map((w, i) => <li key={i}>{w}</li>)}</ul></div>}
                    {ins.nextSteps?.length > 0 && <div><p className="font-bold mb-1">Next steps</p><ul className="list-disc pl-5 flex flex-col gap-1">{ins.nextSteps.map((w, i) => <li key={i}>{w}</li>)}</ul></div>}
                    {ins.tweaks?.length > 0 && (
                      <div><p className="font-bold mb-1">Tweaks for next time</p>
                        <div className="flex flex-col gap-2">{ins.tweaks.map((t, i) => (
                          <div key={i} className={`rounded-xl border ${border} px-3 py-2`}>
                            <p className="font-semibold">{t.change}</p><p>{t.effect}</p>{t.why && <p className="text-slate-500">{t.why}</p>}
                            <button onClick={() => { setChange(t.change); setWhatIf(null); }} className="text-[11px] text-amber-500 mt-1">Try it in what-if →</button>
                          </div>))}</div>
                      </div>
                    )}
                    {ins.whatHeLikes && <p className="text-slate-500"><b>What you seem to like:</b> {ins.whatHeLikes}</p>}
                    <p className="text-[10px] text-slate-500">{when(brew.insightAt)}</p>
                  </div>
                )}
              </div>
              <div className={panel}>
                <h2 className="text-xs font-black uppercase tracking-wider mb-1">What if...</h2>
                <p className="text-[11px] text-slate-500 mb-3">Describe a change for next time and see what it would do to the brew.</p>
                <div className="flex flex-wrap gap-2">
                  <input value={change} onChange={(e) => setChange(e.target.value)} placeholder="e.g. swap 71B for EC-1118 and add 2 tsp acid blend" onKeyDown={(e) => { if (e.key === 'Enter' && change.trim()) askWhatIf(); }} className={`${field} flex-1 min-w-[14rem]`} />
                  <button onClick={askWhatIf} disabled={!change.trim() || busy === 'whatif'} className={primary}>{busy === 'whatif' ? <RotateCw size={13} className="animate-spin" /> : <Wand2 size={13} />} Predict</button>
                </div>
                {whatIf && (
                  <div className="flex flex-col gap-3 mt-4 text-xs">
                    <p className="font-semibold">{whatIf.summary}</p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div><p className="text-[11px] text-slate-500 mb-2">Now (grey) → with the change{whatIf.before?.abv || whatIf.after?.abv ? ` · ABV ${whatIf.before?.abv ?? '?'}% → ${whatIf.after?.abv ?? '?'}%` : ''}{whatIf.after?.fg ? ` · FG → ${g3(whatIf.after.fg)}` : ''}</p>
                        <Bars values={whatIf.after} compare={whatIf.before} isDark={isDark} /></div>
                      <div className="flex flex-col gap-1.5">
                        {whatIf.flavour && <p><b>Taste:</b> {whatIf.flavour}</p>}
                        {whatIf.process && <p><b>What you'd do differently:</b> {whatIf.process}</p>}
                        {whatIf.risks && <p className="text-amber-500"><b>Risks:</b> {whatIf.risks}</p>}
                        {whatIf.confidence && <p className="text-slate-500">Confidence: {whatIf.confidence}</p>}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </PortalShell>
  );
}
