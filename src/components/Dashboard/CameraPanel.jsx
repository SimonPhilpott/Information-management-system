import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Camera, Monitor, Upload, RotateCw, Video } from 'lucide-react';

// Shared live view + snapshot button for /ims/look and /ims/faces. Three
// frame sources, all feeding the same server-side "latest frame":
//   device  - the IMS dock camera (frames arrive at the server from the box)
//   browser - this computer's webcam, pushed to the server from here
//   upload  - a photo picked from disk
// Snapshots are always taken server-side from that latest frame, so every
// source behaves identically from there on.
const SOURCES = [
  { key: 'device', label: 'IMS camera', icon: Video },
  { key: 'browser', label: 'This computer', icon: Monitor },
  { key: 'upload', label: 'Upload photo', icon: Upload }
];

export default function CameraPanel({ isDark, onSnapshot, onError, snapshotLabel = 'Take snapshot' }) {
  const [source, setSource] = useState('device');
  const [frameSrc, setFrameSrc] = useState(null);
  const [noFrame, setNoFrame] = useState(true);
  const [busy, setBusy] = useState(false);
  const [camError, setCamError] = useState(null);
  const [camStatus, setCamStatus] = useState(null);
  const videoRef = useRef(null);
  const fileRef = useRef(null);

  // Opening a camera page wakes the camera for another 10 minutes; the server
  // puts it back to sleep after that with no further use. Status is polled so
  // the panel can say whether it's awake.
  useEffect(() => {
    let stopped = false;
    const load = () => fetch('/api/camera/status').then((r) => r.json()).then((d) => { if (!stopped && d.success) setCamStatus(d); }).catch(() => {});
    fetch('/api/camera/wake', { method: 'POST' }).then(load).catch(() => {});
    const id = setInterval(load, 5000);
    return () => { stopped = true; clearInterval(id); };
  }, []);

  // Device mode: poll the server's latest frame (also what marks the camera
  // "in use" on the IMS footer icon while someone is watching).
  useEffect(() => {
    if (source !== 'device') return;
    let stopped = false;
    const tick = () => {
      const img = new Image();
      const url = `/api/camera/latest.jpg?t=${Date.now()}`;
      img.onload = () => { if (!stopped) { setFrameSrc(url); setNoFrame(false); } };
      img.onerror = () => { if (!stopped) setNoFrame(true); };
      img.src = url;
    };
    tick();
    const id = setInterval(tick, 800);
    return () => { stopped = true; clearInterval(id); };
  }, [source]);

  // Browser webcam: show it locally and push a frame to the server ~1/sec.
  useEffect(() => {
    if (source !== 'browser') return;
    let stream = null, timer = null, stopped = false, posting = false;
    setCamError(null);
    navigator.mediaDevices?.getUserMedia({ video: { width: 640, height: 480 }, audio: false })
      .then((s) => {
        if (stopped) { s.getTracks().forEach((t) => t.stop()); return; }
        stream = s;
        if (videoRef.current) videoRef.current.srcObject = s;
        const canvas = document.createElement('canvas');
        timer = setInterval(() => {
          const v = videoRef.current;
          if (!v || !v.videoWidth || posting) return;
          canvas.width = v.videoWidth; canvas.height = v.videoHeight;
          canvas.getContext('2d').drawImage(v, 0, 0);
          posting = true;
          canvas.toBlob((blob) => {
            if (!blob) { posting = false; return; }
            fetch('/api/camera/frame?source=browser', { method: 'POST', headers: { 'Content-Type': 'image/jpeg' }, body: blob })
              .finally(() => { posting = false; });
          }, 'image/jpeg', 0.85);
        }, 1000);
      })
      .catch((err) => setCamError(err.message || 'Could not open the webcam.'));
    return () => {
      stopped = true;
      clearInterval(timer);
      if (stream) stream.getTracks().forEach((t) => t.stop());
    };
  }, [source]);

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const res = await fetch('/api/camera/frame?source=upload', { method: 'POST', headers: { 'Content-Type': 'image/jpeg' }, body: file });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Upload failed (JPEG photos only).');
      setFrameSrc(URL.createObjectURL(file));
      setNoFrame(false);
    } catch (err) {
      onError?.(err.message);
    }
  };

  const snapshot = useCallback(async () => {
    setBusy(true);
    try {
      const res = await fetch('/api/look/snapshot', { method: 'POST' });
      const d = await res.json();
      if (!res.ok || !d.success) throw new Error(d.error || 'Snapshot failed.');
      onSnapshot(d.snapshot);
    } catch (err) {
      onError?.(err.message);
    } finally {
      setBusy(false);
    }
  }, [onSnapshot, onError]);

  const btn = (active) => `px-3 py-1.5 rounded-lg text-[11px] font-bold flex items-center gap-1.5 transition-all ${
    active ? 'bg-gradient-to-r from-cyan-500 to-indigo-600 text-white'
      : isDark ? 'bg-white/5 hover:bg-white/10 text-slate-300' : 'bg-black/5 hover:bg-black/10 text-slate-700'
  }`;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {SOURCES.map(({ key, label, icon: Icon }) => (
          <button key={key} onClick={() => setSource(key)} className={btn(source === key)}><Icon size={13} />{label}</button>
        ))}
      </div>

      <div className="text-[11px] font-semibold flex items-center gap-2 text-slate-500">
        <span className={`w-2 h-2 rounded-full ${!camStatus?.attached ? 'bg-slate-500' : camStatus.awake ? 'bg-emerald-500' : 'bg-amber-400'}`} />
        {!camStatus?.attached ? 'No camera attached yet'
          : camStatus.awake ? `Camera awake - sleeps after ${Math.max(1, Math.ceil(camStatus.sleepsInSeconds / 60))} min idle`
          : 'Camera asleep - wakes when used'}
      </div>

      <div className={`relative w-full aspect-[4/3] rounded-xl overflow-hidden border flex items-center justify-center ${isDark ? 'bg-black border-white/10' : 'bg-slate-900 border-[#2E2B27]/10'}`}>
        {source === 'browser' && !camError && <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-contain" />}
        {source === 'browser' && camError && <p className="text-xs text-red-300 p-4 text-center">{camError}</p>}
        {source !== 'browser' && !noFrame && frameSrc && <img src={frameSrc} alt="Camera view" className="w-full h-full object-contain" />}
        {source === 'device' && noFrame && (
          <p className="text-xs text-slate-400 p-4 text-center">
            No frames from the IMS camera yet. The dock camera isn't streaming to the server, so use "This computer" or "Upload photo" for now.
          </p>
        )}
        {source === 'upload' && noFrame && (
          <button onClick={() => fileRef.current?.click()} className="text-xs text-slate-300 flex flex-col items-center gap-2">
            <Upload size={22} /> Choose a JPEG photo
          </button>
        )}
      </div>

      {source === 'upload' && (
        <>
          <input ref={fileRef} type="file" accept="image/jpeg" className="hidden" onChange={onFile} />
          {!noFrame && <button onClick={() => fileRef.current?.click()} className={btn(false)}><Upload size={13} />Choose a different photo</button>}
        </>
      )}

      <button onClick={snapshot} disabled={busy || (source !== 'browser' && noFrame)}
        className="px-4 py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-2 bg-gradient-to-r from-cyan-500 to-indigo-600 text-white active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed">
        {busy ? <RotateCw size={14} className="animate-spin" /> : <Camera size={14} />}{snapshotLabel}
      </button>
    </div>
  );
}
