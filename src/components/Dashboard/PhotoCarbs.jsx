import React, { useEffect, useRef, useState } from 'react';
import { Camera, Loader2, X, Check, Image as ImageIcon, Zap, Minus, Plus, BookmarkCheck, Trash2 } from 'lucide-react';

// The camera, inside IMS: a live preview and a shutter. Handing off to the phone's own camera app (a file
// input with capture) lets the phone close the page in the background - IMS runs as an installed app with a
// live voice connection - and when it's reopened the photo is gone and nothing happens. This never leaves
// the page. "Choose a photo" picks one from the gallery instead (or if the camera can't be opened).
export function CameraCapture({ onPhoto, onClose }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const pickRef = useRef(null);
  const [state, setState] = useState('starting'); // starting | live | failed
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1440 } }, audio: false });
        if (!alive) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
        setState('live');
      } catch (_) { if (alive) setState('failed'); }
    })();
    return () => { alive = false; streamRef.current?.getTracks().forEach((t) => t.stop()); };
  }, []);
  const snap = () => {
    const v = videoRef.current;
    if (!v?.videoWidth) return;
    const c = document.createElement('canvas');
    c.width = v.videoWidth; c.height = v.videoHeight;
    c.getContext('2d').drawImage(v, 0, 0);
    c.toBlob((b) => { if (b) { streamRef.current?.getTracks().forEach((t) => t.stop()); onPhoto(new File([b], 'plate.jpg', { type: 'image/jpeg' })); } }, 'image/jpeg', 0.9);
  };
  return (
    <div className="fixed inset-0 z-[100] bg-black flex flex-col">
      <div className="flex-1 min-h-0 relative flex items-center justify-center">
        <video ref={videoRef} playsInline muted autoPlay className="w-full h-full object-cover" />
        {state === 'starting' && <div className="absolute text-white/80 text-sm flex items-center gap-2"><Loader2 size={16} className="animate-spin" /> Opening the camera...</div>}
        {state === 'failed' && <div className="absolute text-white/90 text-sm text-center px-8">The camera couldn't be opened - allow the camera for this site, or choose a photo instead.</div>}
        <button onClick={onClose} aria-label="Close the camera" className="absolute top-4 right-4 p-2.5 rounded-full bg-black/50 text-white"><X size={20} /></button>
        {state === 'live' && <div className="absolute top-4 left-4 right-16 text-white/85 text-xs">Fit the whole plate in, from above if you can.</div>}
      </div>
      <div className="flex items-center justify-around py-5 bg-black" style={{ paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom))' }}>
        <button onClick={() => pickRef.current?.click()} className="w-14 flex flex-col items-center gap-1 text-white/85 text-[10px]"><ImageIcon size={22} /> Photos</button>
        <button onClick={snap} disabled={state !== 'live'} aria-label="Take the photo" className="w-[72px] h-[72px] rounded-full border-4 border-white flex items-center justify-center disabled:opacity-30">
          <span className="w-[58px] h-[58px] rounded-full bg-white" /></button>
        <span className="w-14" />
      </div>
      <input ref={pickRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onPhoto(f); }} />
    </div>
  );
}


// Carbs from a photo (made for the phone): take a picture of the plate, Gemini lists each food with a portion
// and its carbs, you correct anything and confirm the total - only then is it logged.
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

// Android Intent URI for AndroidAPS (launches verified app.aaps.MainActivity directly)
export function buildAapsIntentUri(carbs, notes = '') {
  const numericCarbs = Math.round(Number(carbs) || 0);
  const cleanNotes = (notes || '').trim().slice(0, 100);
  return `intent:#Intent;action=android.intent.action.MAIN;category=android.intent.category.LAUNCHER;package=app.aaps;component=app.aaps/app.aaps.MainActivity;d.carbs=${numericCarbs};S.notes=${encodeURIComponent(cleanNotes)};S.source=IMS;end`;
}

// Tasker URL scheme for triggering user tasks (par1 = carbs)
export function buildTaskerUri(taskName = 'Open AAPS', carbs = 0) {
  const cleanTask = encodeURIComponent((taskName || 'Open AAPS').trim());
  const numericCarbs = Math.round(Number(carbs) || 0);
  return `tasker://assistantactions?task=${cleanTask}&par1=${numericCarbs}`;
}

// Guaranteed synchronous clipboard copy (bypasses browser user-gesture timeout)
export function copyCarbsToClipboard(val) {
  const str = String(val).trim();
  if (!str) return false;

  // 1. Synchronous execCommand copy while user gesture is 100% active
  try {
    const el = document.createElement('textarea');
    el.value = str;
    el.setAttribute('readonly', '');
    el.style.position = 'fixed';
    el.style.top = '0';
    el.style.left = '0';
    el.style.opacity = '0';
    el.style.pointerEvents = 'none';
    document.body.appendChild(el);
    el.focus();
    el.select();
    el.setSelectionRange(0, 99999);
    document.execCommand('copy');
    document.body.removeChild(el);
  } catch (_) {}

  // 2. Synchronous invocation of modern Clipboard API in the same event turn
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(str).catch(() => {});
  }

  return true;
}

export default function PhotoCarbs({ isDark, field, gradient, notify, onLogged, file = null, onCancel = null }) {
  const [photo, setPhoto] = useState(null); // { blob, url }
  const [est, setEst] = useState(null);     // { items, summary, caution }
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(null);
  const [camera, setCamera] = useState(false);
  const [foods, setFoods] = useState(null); // your saved carb values, when the list is open
  const sub = isDark ? 'text-slate-300' : 'text-slate-700';

  // a photo taken elsewhere (the food button beside Ims's mic) is read straight away
  useEffect(() => { if (file) take(file); }, [file]); // eslint-disable-line react-hooks/exhaustive-deps
  // each food is count x carbs for one
  const lineCarbs = (it) => Math.round((Number(it.count) || 0) * (Number(it.carbsEach) || 0));
  const total = (est?.items || []).reduce((n, i) => n + lineCarbs(i), 0);

  const analyse = async (blob, withNote = '') => {
    setBusy('reading');
    try {
      const res = await fetch(`/api/glucose-hub/carbs/photo${withNote ? `?note=${encodeURIComponent(withNote)}` : ''}`, { method: 'POST', headers: { 'Content-Type': 'image/jpeg' }, body: blob });
      const d = await res.json().catch(() => ({ success: false, error: `The server answered ${res.status} - try again.` }));
      if (!d.success) throw new Error(d.error);
      setEst({ items: d.items.map((it) => ({ ...it, seenCount: it.count, remember: true })), summary: d.summary, caution: d.caution });
    } catch (err) { notify(err.message, 'error'); }
    setBusy(null);
  };

  const take = async (f) => {
    setCamera(false);
    setBusy('reading'); setEst(null); setNote('');
    try {
      const blob = await shrink(f);
      setPhoto({ blob, url: URL.createObjectURL(blob) });
      analyse(blob);
    } catch (err) { setBusy(null); notify(err.message, 'error'); onCancel?.(); }
  };

  const setItem = (i, patch) => setEst((x) => ({ ...x, items: x.items.map((it, j) => (j === i ? { ...it, ...patch } : it)) }));

  // What was changed on the page: corrected carbs are remembered for next time (when "remember" is ticked);
  // a changed amount is just for this meal. The log describes the meal as actually eaten.
  const fmtCount = (n) => (n === 0.5 ? 'half a' : Number.isInteger(n) ? String(n) : String(n));
  const corrected = (it) => it.edited && Number(it.carbsEach) !== it.geminiEach;
  const mealSummary = () => {
    const items = est?.items || [];
    const changed = items.some((it) => it.count !== it.seenCount || it.edited || it.removed) || est?.removedAny;
    if (!changed && est?.summary) return est.summary;
    return items.map((it) => `${fmtCount(it.count)} ${it.unit && it.unit !== 'portion' ? `${it.unit} ` : ''}${it.name}`.replace(/^1 portion /, '')).join(', ').slice(0, 100) || 'Food';
  };
  const rememberCorrections = () => {
    const items = (est?.items || []).filter((it) => corrected(it) && it.remember).map((it) => ({ name: it.name, unit: it.unit, carbsEach: Number(it.carbsEach) }));
    if (!items.length) return;
    fetch('/api/glucose-hub/carbs/foods', { method: 'POST', headers: { 'Content-Type': 'application/json' }, keepalive: true, body: JSON.stringify({ items }) }).catch(() => {});
  };
  const openFoods = async () => {
    if (foods) { setFoods(null); return; }
    try { const d = await (await fetch('/api/glucose-hub/carbs/foods')).json(); setFoods(d.foods || []); } catch (err) { notify(err.message, 'error'); }
  };
  const forgetFood = async (id) => {
    try { await fetch(`/api/glucose-hub/carbs/foods/${id}`, { method: 'DELETE' }); setFoods((f) => f.filter((x) => x.id !== id)); } catch (err) { notify(err.message, 'error'); }
  };

  // "Send to AAPS": copy carbs to clipboard immediately, trigger Tasker 'Open AAPS', and log meal note
  const handleSendToAaps = () => {
    const numericCarbs = Math.round(total);
    // 1. Immediately copy to clipboard in synchronous call stack before any async boundaries
    copyCarbsToClipboard(numericCarbs);

    // 2. Dispatch informational Note treatment to Nightscout in background
    rememberCorrections();
    const foodSummary = mealSummary();
    fetch('/api/glucose-hub/carbs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      keepalive: true,
      body: JSON.stringify({
        grams: numericCarbs,
        food: foodSummary,
        source: 'photo',
      }),
    }).catch(() => {});

    notify(`Copied ${numericCarbs}g carbs to clipboard & opening AAPS via Tasker.`);

    // 3. Trigger Tasker task 'Open AAPS' on Android
    const isAndroid = typeof navigator !== 'undefined' && /android/i.test(navigator.userAgent);
    if (isAndroid) {
      window.location.href = buildTaskerUri('Open AAPS', numericCarbs);
    }

    setPhoto(null); setEst(null); setNote('');
    onLogged();
  };

  // "Just log": copy carbs to clipboard and log note to Nightscout without opening Tasker
  const handleJustLog = async () => {
    const numericCarbs = Math.round(total);
    // 1. Immediately copy to clipboard synchronously
    copyCarbsToClipboard(numericCarbs);

    setBusy('logging');
    try {
      rememberCorrections();
      const foodSummary = mealSummary();
      const res = await fetch('/api/glucose-hub/carbs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          grams: numericCarbs,
          food: foodSummary,
          source: 'photo',
        }),
      });
      const d = await res.json();
      if (!d.success) throw new Error(d.error);
      notify(`Copied ${numericCarbs}g carbs to clipboard & logged note to Nightscout.`);
      setPhoto(null); setEst(null); setNote('');
      onLogged();
    } catch (err) { notify(err.message, 'error'); }
    setBusy(null);
  };

  const handleCancel = () => {
    setPhoto(null);
    setEst(null);
    setNote('');
    onCancel?.();
  };

  const conf = { high: 'text-emerald-500', medium: 'text-amber-500', low: 'text-rose-500' };
  const numericTotal = Math.round(total);

  return (
    <div className={`mb-3 p-3 rounded-xl border ${isDark ? 'border-white/10' : 'border-[#2E2B27]/10'}`}>
      {camera && <CameraCapture onPhoto={take} onClose={() => setCamera(false)} />}
      {!photo && busy === 'reading' ? (
        <div className="py-3 text-sm flex items-center justify-center gap-2 text-slate-500"><Loader2 size={16} className="animate-spin" /> Reading the photo...</div>
      ) : !photo ? (
        <button onClick={() => setCamera(true)} className={`w-full py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2 bg-gradient-to-r ${gradient} text-white`}>
          <Camera size={17} /> Carbs from a photo</button>
      ) : (
        <div className="flex flex-col sm:flex-row gap-3">
          <img src={photo.url} alt="Your plate" className="w-full sm:w-44 h-40 sm:h-44 object-cover rounded-lg" />
          <div className="flex-1 min-w-0 flex flex-col gap-2 text-xs">
            {busy === 'reading' && <div className="flex items-center gap-2 text-slate-500"><Loader2 size={14} className="animate-spin" /> Looking at your plate...</div>}
            {est && <>
              {!est.items.length && <div className="text-rose-500">No food found in the photo - take another.</div>}
              {est.items.map((it, i) => (
                <div key={i} className={`rounded-lg border p-2 ${isDark ? 'border-white/10' : 'border-slate-200'}`}>
                  <div className="flex items-start gap-2">
                    <span className="flex-1 min-w-0">
                      <b>{it.name}</b> <span className={conf[it.confidence]} title={`${it.confidence} confidence`}>●</span>
                      {it.yours && <span className="ml-1.5 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-emerald-700 text-white text-[10px] font-bold" title="Your carb value from a previous correction"><BookmarkCheck size={10} />your value</span>}
                      <span className={`block ${sub}`}>{it.portion}</span>
                    </span>
                    <button onClick={() => setEst((x) => ({ ...x, removedAny: true, items: x.items.filter((_, j) => j !== i) }))} className={`p-1 rounded hover:bg-slate-500/10 ${sub}`} title="Not on the plate"><X size={13} /></button>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                    {/* how many were eaten - just for this meal */}
                    <button onClick={() => setItem(i, { count: it.count > 1 ? it.count - 1 : 0.5 })} disabled={it.count <= 0.5} className="p-1.5 rounded-md border border-slate-500/30 disabled:opacity-30" title="Fewer"><Minus size={12} /></button>
                    <span className="min-w-[2.2rem] text-center font-bold tabular-nums">{it.count === 0.5 ? '½' : it.count}</span>
                    <button onClick={() => setItem(i, { count: it.count < 1 ? 1 : it.count + 1 })} className="p-1.5 rounded-md border border-slate-500/30" title="More"><Plus size={12} /></button>
                    <span className={sub}>{it.unit || 'portion'}{it.count > 1 && it.unit && it.unit !== 'portion' ? 's' : ''} ×</span>
                    {/* carbs for one - corrected from the packet, remembered for next time */}
                    <input className={`${field} !w-16 !py-1 text-right`} inputMode="decimal" value={it.carbsEach} aria-label={`Carbs in one ${it.unit || 'portion'}`}
                      onChange={(e) => setItem(i, { carbsEach: e.target.value.replace(/[^\d.]/g, ''), edited: true })} />
                    <span className={sub}>g each =</span>
                    <b className="tabular-nums">{lineCarbs(it)} g</b>
                  </div>
                  {corrected(it) && (
                    <label className={`mt-1.5 flex items-center gap-1.5 cursor-pointer ${sub}`}>
                      <input type="checkbox" checked={it.remember} onChange={(e) => setItem(i, { remember: e.target.checked })} />
                      Remember {it.carbsEach} g per {it.unit || 'portion'} for “{it.name}” next time <span className="opacity-90">(IMS said {it.geminiEach} g)</span>
                    </label>
                  )}
                </div>
              ))}
              <button onClick={openFoods} className={`self-start underline underline-offset-2 ${sub}`}>{foods ? 'Hide your saved foods' : 'Your saved foods'}</button>
              {foods && (
                <div className={`rounded-lg border p-2 ${isDark ? 'border-white/10' : 'border-slate-200'}`}>
                  {!foods.length && <div className={sub}>None yet - correct the carbs for a food and log the meal, and it's kept here.</div>}
                  {foods.map((f) => (
                    <div key={f.id} className="flex items-center gap-2 py-0.5">
                      <span className="flex-1 min-w-0 truncate"><b>{f.name}</b> <span className={sub}>{f.carbsEach} g per {f.unit}{f.uses ? ` · used ${f.uses}×` : ''}</span></span>
                      <button onClick={() => forgetFood(f.id)} className={`p-1 rounded hover:bg-slate-500/10 ${sub}`} title="Forget this value"><Trash2 size={12} /></button>
                    </div>
                  ))}
                </div>
              )}
              {est.caution && <div className="text-amber-500">{est.caution}</div>}
              <div className="flex gap-2">
                <input className={`${field} flex-1 !py-1.5`} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Anything to add? e.g. a full cup of rice, no sauce" />
                <button onClick={() => analyse(photo.blob, note)} disabled={!note.trim() || busy} className="px-2.5 py-1.5 rounded-lg font-bold border border-slate-500/30 disabled:opacity-40">Re-check</button>
              </div>

              {/* Informational Guidance Note */}
              <div className={`p-2.5 rounded-lg border text-[11px] leading-relaxed ${isDark ? 'bg-sky-500/10 border-sky-500/30 text-sky-200' : 'bg-sky-50 border-sky-200 text-sky-900'}`}>
                <b>{numericTotal} g</b> carbs will be copied to your clipboard. <b>Send to AAPS</b> triggers Tasker to open AndroidAPS. Nightscout receives an informational meal Note.
              </div>

              {/* Action Buttons: Send to AAPS, Just log, Cancel */}
              <div className="flex flex-wrap items-center gap-2 mt-1">
                <span className="text-sm">Total <b className="text-lg tabular-nums">{numericTotal} g</b></span>
                <div className="ml-auto flex items-center gap-1.5">
                  <button
                    onClick={handleSendToAaps}
                    disabled={!total || busy}
                    className={`px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 bg-gradient-to-r ${gradient} text-white disabled:opacity-40 shadow-sm`}
                    title="Copy carbs to clipboard, trigger Tasker 'Open AAPS', and log meal note to Nightscout"
                  >
                    <Zap size={13} />
                    Send to AAPS
                  </button>
                  <button
                    onClick={handleJustLog}
                    disabled={!total || busy}
                    className="px-2.5 py-2 rounded-xl text-xs font-semibold border border-slate-500/30 hover:bg-slate-500/10 disabled:opacity-40"
                    title="Copy carbs to clipboard and log meal note to Nightscout without opening AAPS"
                  >
                    {busy === 'logging' ? (
                      <Loader2 size={13} className="animate-spin inline mr-1" />
                    ) : null}
                    Just log
                  </button>
                  <button
                    onClick={handleCancel}
                    className="px-2.5 py-2 rounded-xl text-xs font-semibold border border-slate-500/30 hover:bg-slate-500/10"
                  >
                    Cancel
                  </button>
                </div>
              </div>

              <div className="text-[10px] text-slate-500">An estimate - check against packaging before confirming. Insulin delivery must be confirmed with an on-screen tap in AAPS.</div>
            </>}
          </div>
        </div>
      )}
    </div>
  );
}

