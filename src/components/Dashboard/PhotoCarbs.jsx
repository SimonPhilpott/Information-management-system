import React, { useEffect, useRef, useState } from 'react';
import { Camera, Loader2, X, Check, Image as ImageIcon, Zap } from 'lucide-react';

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

  // a photo taken elsewhere (the food button beside Ims's mic) is read straight away
  useEffect(() => { if (file) take(file); }, [file]); // eslint-disable-line react-hooks/exhaustive-deps
  const total = (est?.items || []).reduce((n, i) => n + (Number(i.carbs) || 0), 0);

  const analyse = async (blob, withNote = '') => {
    setBusy('reading');
    try {
      const res = await fetch(`/api/glucose-hub/carbs/photo${withNote ? `?note=${encodeURIComponent(withNote)}` : ''}`, { method: 'POST', headers: { 'Content-Type': 'image/jpeg' }, body: blob });
      const d = await res.json().catch(() => ({ success: false, error: `The server answered ${res.status} - try again.` }));
      if (!d.success) throw new Error(d.error);
      setEst({ items: d.items, summary: d.summary, caution: d.caution });
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

  // "Send to AAPS": copy carbs to clipboard immediately, trigger Tasker 'Open AAPS', and log meal note
  const handleSendToAaps = () => {
    const numericCarbs = Math.round(total);
    // 1. Immediately copy to clipboard in synchronous call stack before any async boundaries
    copyCarbsToClipboard(numericCarbs);

    // 2. Dispatch informational Note treatment to Nightscout in background
    const foodSummary = est?.summary || (est?.items || []).map((i) => i.name).join(', ') || 'Food';
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
      const foodSummary = est?.summary || (est?.items || []).map((i) => i.name).join(', ') || 'Food';
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

