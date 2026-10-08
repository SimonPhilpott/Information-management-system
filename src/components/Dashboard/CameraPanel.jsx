import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Camera, Monitor, Upload, RotateCw, Video, Zap, Activity, Info, RefreshCw } from 'lucide-react';

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
  const [waking, setWaking] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [camError, setCamError] = useState(null);
  const [camStatus, setCamStatus] = useState(null);
  const videoRef = useRef(null);
  const fileRef = useRef(null);
  const hasFrameRef = useRef(false);
  const errorCountRef = useRef(0);

  // Opening a camera page wakes the camera for another 10 minutes; the server
  // puts it back to sleep after that with no further use. Status is polled so
  // the panel can say whether it's awake.
  const loadStatus = useCallback(() => {
    return fetch('/api/camera/status')
      .then((r) => r.json())
      .then((d) => { if (d.success) setCamStatus(d); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    let stopped = false;
    const poll = () => { if (!stopped) loadStatus(); };
    fetch('/api/camera/wake', { method: 'POST' }).then(poll).catch(() => {});
    const id = setInterval(poll, 4000);
    return () => { stopped = true; clearInterval(id); };
  }, [loadStatus]);

  const handleWakeCamera = async () => {
    setWaking(true);
    try {
      const res = await fetch('/api/camera/wake', { method: 'POST' });
      const d = await res.json();
      if (d.success) {
        setCamStatus(d);
      }
    } catch (err) {
      onError?.('Wake command failed: ' + err.message);
    } finally {
      setWaking(false);
    }
  };

  // Device mode: poll the server's latest frame with frame retention
  // (prevents unmounting the image and flashing black on transient packet drops).
  useEffect(() => {
    if (source !== 'device') return;
    let stopped = false;
    let inFlight = false;

    const tick = () => {
      if (inFlight) return;
      inFlight = true;
      const img = new Image();
      const url = `/api/camera/latest.jpg?t=${Date.now()}`;
      img.onload = () => {
        inFlight = false;
        if (!stopped) {
          errorCountRef.current = 0;
          hasFrameRef.current = true;
          setFrameSrc(url);
          setNoFrame(false);
        }
      };
      img.onerror = () => {
        inFlight = false;
        if (!stopped) {
          errorCountRef.current++;
          // Only show placeholder if we haven't received any frame yet
          // or if 10 consecutive ticks (6+ seconds) have persistently failed.
          if (errorCountRef.current >= 10 && !hasFrameRef.current) {
            setNoFrame(true);
          }
        }
      };
      img.src = url;
    };
    tick();
    const id = setInterval(tick, 600);
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
    active ? 'bg-gradient-to-r from-cyan-500 to-indigo-600 text-white shadow-sm'
      : isDark ? 'bg-white/5 hover:bg-white/10 text-slate-300' : 'bg-black/5 hover:bg-black/10 text-slate-700'
  }`;

  const latestLog = camStatus?.recentLogs && camStatus.recentLogs.length > 0
    ? camStatus.recentLogs[camStatus.recentLogs.length - 1]
    : null;

  return (
    <div className="flex flex-col gap-3">
      {/* Frame source selectors */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-2">
          {SOURCES.map(({ key, label, icon: Icon }) => (
            <button key={key} onClick={() => setSource(key)} className={btn(source === key)}>
              <Icon size={13} />
              {label}
            </button>
          ))}
        </div>

        {/* Wake Camera Action Button */}
        <button
          onClick={handleWakeCamera}
          disabled={waking}
          className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold flex items-center gap-1.5 transition-all active:scale-95 ${
            camStatus?.awake
              ? isDark ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20' : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
              : 'bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-sm hover:brightness-110'
          }`}
          title="Wake camera driver and send remote enable frame to Box-3"
        >
          {waking ? <RotateCw size={12} className="animate-spin" /> : <Zap size={12} />}
          <span>{waking ? 'Waking…' : camStatus?.awake ? 'Camera Awake' : 'Wake Camera'}</span>
        </button>
      </div>

      {/* Camera Live Status Bar */}
      <div className={`p-2.5 rounded-xl border flex flex-col gap-2 ${
        isDark ? 'bg-slate-950/60 border-white/5' : 'bg-slate-50 border-[#2E2B27]/10'
      }`}>
        <div className="flex items-center justify-between text-[11px]">
          <div className="flex items-center gap-2 font-medium">
            <span className={`w-2.5 h-2.5 rounded-full ${
              camStatus?.awake
                ? 'bg-emerald-500 animate-pulse'
                : camStatus?.attached
                  ? 'bg-amber-400'
                  : 'bg-slate-500'
            }`} />
            <span className={camStatus?.awake ? 'text-emerald-400 font-bold' : isDark ? 'text-slate-300' : 'text-slate-700'}>
              {!camStatus?.attached
                ? 'No camera detected on dock USB-A'
                : camStatus.awake
                  ? `Camera awake & streaming (sleeps in ${Math.max(1, Math.ceil(camStatus.sleepsInSeconds / 60))} min)`
                  : 'Camera detected • Asleep (tap icon on Box-3 or click Wake)'}
            </span>
          </div>

          <button
            onClick={() => setShowDetails(!showDetails)}
            className="text-[10px] text-slate-400 hover:text-cyan-400 flex items-center gap-1 font-semibold"
          >
            <Info size={11} />
            {showDetails ? 'Hide info' : 'Diagnostics'}
          </button>
        </div>

        {/* Detailed diagnostic dropdown */}
        {showDetails && (
          <div className="text-[10px] pt-2 border-t border-white/5 flex flex-col gap-1.5 text-slate-400">
            <div className="flex items-center justify-between">
              <span>USB Host Status:</span>
              <span className="font-mono text-slate-200">
                {latestLog ? latestLog.replace(/^\[.*?\]\s*/, '') : 'Polling ESP32 USB Host stack...'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span>Power Requirement:</span>
              <span className="text-amber-400 font-semibold">5V / 2A+ connected to dock base USB-C</span>
            </div>
            <div className="flex items-center justify-between">
              <span>On-Screen Wake:</span>
              <span className="text-slate-200">Tap 6th icon (left margin) on Box-3 screen to toggle Orange/Green</span>
            </div>
          </div>
        )}
      </div>

      {/* Video / Snapshot Display Viewport */}
      <div className={`relative w-full aspect-[4/3] rounded-xl overflow-hidden border flex items-center justify-center ${isDark ? 'bg-black border-white/10' : 'bg-slate-900 border-[#2E2B27]/10'}`}>
        {source === 'browser' && !camError && <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-contain" />}
        {source === 'browser' && camError && <p className="text-xs text-red-300 p-4 text-center">{camError}</p>}
        {source !== 'browser' && !noFrame && frameSrc && <img src={frameSrc} alt="Camera view" className="w-full h-full object-contain" />}
        
        {source === 'device' && noFrame && (
          <div className="flex flex-col items-center justify-center p-6 text-center max-w-sm gap-3">
            <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
              <Video size={24} />
            </div>
            <div>
              <p className="text-xs font-bold text-slate-200">No frames from the IMS dock camera yet</p>
              <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
                The ESP32 USB host is scanning, but no camera has enumerated yet. Ensure the Box-3 is on the dock, external 5V power is plugged into the <strong>dock base's USB-C port</strong>, and the Logitech C270 is connected.
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-2 mt-1">
              <button
                onClick={handleWakeCamera}
                disabled={waking}
                className="px-3 py-1.5 rounded-lg text-[11px] font-bold bg-gradient-to-r from-amber-500 to-orange-500 text-white flex items-center gap-1.5 active:scale-95"
              >
                <Zap size={12} />
                Wake Camera
              </button>
              <button
                onClick={() => setSource('browser')}
                className="px-3 py-1.5 rounded-lg text-[11px] font-bold bg-white/10 text-slate-200 hover:bg-white/15 flex items-center gap-1.5"
              >
                <Monitor size={12} />
                Use Computer Webcam
              </button>
            </div>
          </div>
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

      {/* Snapshot Button */}
      <button onClick={snapshot} disabled={busy || (source !== 'browser' && noFrame)}
        className="px-4 py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-2 bg-gradient-to-r from-cyan-500 to-indigo-600 text-white active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed">
        {busy ? <RotateCw size={14} className="animate-spin" /> : <Camera size={14} />}{snapshotLabel}
      </button>
    </div>
  );
}
