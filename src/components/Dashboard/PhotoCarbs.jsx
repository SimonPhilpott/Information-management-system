import React, { useEffect, useState } from 'react';
import { Camera, Loader2, X, Check } from 'lucide-react';

// Carbs from a photo (made for the phone): take a picture of the plate, Gemini lists each food with a portion
// and its carbs, you correct anything and confirm the total - only then is it logged (and sent to Nightscout).
// The photo is shrunk in the browser first, so it's quick over mobile data.
function shrink(file, max = 1280) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      c.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not read the photo'))), 'image/jpeg', 0.85);
      URL.revokeObjectURL(img.src);
    };
    img.onerror = () => reject(new Error('Could not read the photo'));
    img.src = URL.createObjectURL(file);
  });
}
export default function PhotoCarbs({ isDark, field, gradient, notify, onLogged, file = null, onCancel = null }) {
  const [photo, setPhoto] = useState(null); // { blob, url }
  const [est, setEst] = useState(null);     // { items, summary, caution }
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(null);
  const inputRef = React.useRef(null);
  // a photo taken elsewhere (the food button beside Ims's mic) is read straight away
  useEffect(() => { if (file) pick({ target: { files: [file], value: '' } }); }, [file]); // eslint-disable-line react-hooks/exhaustive-deps
  const total = (est?.items || []).reduce((n, i) => n + (Number(i.carbs) || 0), 0);
  const analyse = async (blob, withNote = '') => {
    setBusy('reading');
    try {
      const res = await fetch(`/api/glucose-hub/carbs/photo${withNote ? `?note=${encodeURIComponent(withNote)}` : ''}`, { method: 'POST', headers: { 'Content-Type': 'image/jpeg' }, body: blob });
      const d = await res.json();
      if (!d.success) throw new Error(d.error);
      setEst({ items: d.items, summary: d.summary, caution: d.caution });
    } catch (err) { notify(err.message, 'error'); }
    setBusy(null);
  };
  const pick = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    try {
      const blob = await shrink(f);
      setPhoto({ blob, url: URL.createObjectURL(blob) }); setEst(null); setNote('');
      analyse(blob);
    } catch (err) { notify(err.message, 'error'); }
  };
  const setItem = (i, patch) => setEst((x) => ({ ...x, items: x.items.map((it, j) => (j === i ? { ...it, ...patch } : it)) }));
  const confirm = async () => {
    setBusy('logging');
    try {
      const res = await fetch('/api/glucose-hub/carbs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ grams: Math.round(total), food: est.summary || est.items.map((i) => i.name).join(', '), source: 'photo' }) });
      const d = await res.json();
      if (!d.success) throw new Error(d.error);
      notify(`Logged ${Math.round(total)} g carbs.`);
      setPhoto(null); setEst(null); setNote('');
      onLogged();
    } catch (err) { notify(err.message, 'error'); }
    setBusy(null);
  };
  const conf = { high: 'text-emerald-500', medium: 'text-amber-500', low: 'text-rose-500' };
  return (
    <div className={`mb-3 p-3 rounded-xl border ${isDark ? 'border-white/10' : 'border-[#2E2B27]/10'}`}>
      <input ref={inputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={pick} />
      {!photo ? (
        <button onClick={() => inputRef.current?.click()} className={`w-full py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2 bg-gradient-to-r ${gradient} text-white`}>
          <Camera size={17} /> Carbs from a photo</button>
      ) : (
        <div className="flex flex-col sm:flex-row gap-3">
          <img src={photo.url} alt="Your plate" className="w-full sm:w-44 h-40 sm:h-44 object-cover rounded-lg" />
          <div className="flex-1 min-w-0 flex flex-col gap-2 text-xs">
            {busy === 'reading' && <div className="flex items-center gap-2 text-slate-500"><Loader2 size={14} className="animate-spin" /> Looking at your plate...</div>}
            {est && <>
              {!est.items.length && <div className="text-rose-500">No food found in the photo - take another.</div>}
              {est.items.map((it, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="flex-1 min-w-0"><b>{it.name}</b> <span className="text-slate-500">{it.portion}</span> <span className={conf[it.confidence]} title={`${it.confidence} confidence`}>●</span></span>
                  <input className={`${field} !w-16 !py-1 text-right`} inputMode="decimal" value={it.carbs} onChange={(e) => setItem(i, { carbs: e.target.value.replace(/[^\d.]/g, '') })} />
                  <span className="text-slate-500">g</span>
                  <button onClick={() => setEst((x) => ({ ...x, items: x.items.filter((_, j) => j !== i) }))} className="p-1 rounded hover:bg-slate-500/10 text-slate-500" title="Not on the plate"><X size={12} /></button>
                </div>
              ))}
              {est.caution && <div className="text-amber-500">{est.caution}</div>}
              <div className="flex gap-2">
                <input className={`${field} flex-1 !py-1.5`} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Anything to add? e.g. a full cup of rice, no sauce" />
                <button onClick={() => analyse(photo.blob, note)} disabled={!note.trim() || busy} className="px-2.5 py-1.5 rounded-lg font-bold border border-slate-500/30 disabled:opacity-40">Re-check</button>
              </div>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-sm">Total <b className="text-lg tabular-nums">{Math.round(total)} g</b></span>
                <button onClick={confirm} disabled={!total || busy} className={`ml-auto px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 bg-gradient-to-r ${gradient} text-white disabled:opacity-40`}>
                  {busy === 'logging' ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} Log {Math.round(total)} g</button>
                <button onClick={() => { setPhoto(null); setEst(null); onCancel?.(); }} className="px-3 py-2 rounded-xl text-xs font-bold border border-slate-500/30">Cancel</button>
              </div>
              <div className="text-[10px] text-slate-500">An estimate - check it against the packet or your own judgement before confirming. It's logged only when you press Log.</div>
            </>}
          </div>
        </div>
      )}
    </div>
  );
}

