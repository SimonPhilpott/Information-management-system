// The live camera view for Look and Faces in the IMS design (24 Oct 2026): the same three frame sources and requests as
// Dashboard/CameraPanel.jsx (the IMS dock camera, this computer's webcam, an uploaded photo), all feeding the server's
// latest frame, so a snapshot is taken the same way whichever you use. Opening it wakes the camera for 10 minutes.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Icon, Btn, Segmented } from '../HomebrewBeta/ui';

const SOURCES = [['device', 'IMS camera'], ['browser', 'This computer'], ['upload', 'A photo']];

export default function CameraView({ onSnapshot, onError, snapshotLabel = 'Take a snapshot', snapshotIcon = 'camera' }) {
  const [source, setSource] = useState('device');
  const [frameSrc, setFrameSrc] = useState(null);
  const [noFrame, setNoFrame] = useState(true);
  const [busy, setBusy] = useState(false);
  const [waking, setWaking] = useState(false);
  const [camError, setCamError] = useState(null);
  const [st, setSt] = useState(null);
  const [streamKey, setStreamKey] = useState(0);
  const videoRef = useRef(null);
  const fileRef = useRef(null);
  const hasFrame = useRef(false);

  const loadStatus = useCallback(() => fetch('/api/camera/status').then((r) => r.json()).then((d) => { if (d.success) setSt(d); }).catch(() => {}), []);
  useEffect(() => {
    let stopped = false;
    const poll = () => { if (!stopped) loadStatus(); };
    fetch('/api/camera/wake', { method: 'POST' }).then(poll).catch(() => {});
    const id = setInterval(poll, 4000);
    return () => { stopped = true; clearInterval(id); };
  }, [loadStatus]);
  const wake = async () => {
    setWaking(true);
    try { const d = await (await fetch('/api/camera/wake', { method: 'POST' })).json(); if (d.success) setSt(d); } catch (e) { onError?.(`It couldn't wake the camera: ${e.message}`); }
    setWaking(false);
  };

  useEffect(() => {
    if (source !== 'device') return;
    fetch('/api/camera/status').then((r) => r.json()).then((d) => { if (d.attached) { hasFrame.current = true; setNoFrame(false); } }).catch(() => {});
  }, [source]);

  // this computer's webcam: shown here, and a frame sent to the server about once a second
  useEffect(() => {
    if (source !== 'browser') return undefined;
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
            fetch('/api/camera/frame?source=browser', { method: 'POST', headers: { 'Content-Type': 'image/jpeg' }, body: blob }).finally(() => { posting = false; });
          }, 'image/jpeg', 0.85);
        }, 1000);
      })
      .catch((e) => setCamError(e.message || 'The webcam couldn\'t be opened.'));
    return () => { stopped = true; clearInterval(timer); if (stream) stream.getTracks().forEach((t) => t.stop()); };
  }, [source]);

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const r = await fetch('/api/camera/frame?source=upload', { method: 'POST', headers: { 'Content-Type': 'image/jpeg' }, body: file });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'It couldn\'t be uploaded (JPEG photos only).');
      setFrameSrc(URL.createObjectURL(file)); setNoFrame(false);
    } catch (err) { onError?.(err.message); }
  };
  const snapshot = async () => {
    setBusy(true);
    try {
      const r = await fetch('/api/look/snapshot', { method: 'POST' });
      const d = await r.json();
      if (!r.ok || !d.success) throw new Error(d.error || 'The snapshot didn\'t work.');
      onSnapshot(d.snapshot);
    } catch (e) { onError?.(e.message); }
    setBusy(false);
  };
  const pick = (v) => { setSource(v); if (v === 'upload') { setNoFrame(true); setFrameSrc(null); } };

  const state = st?.recording ? 'off' : !st?.attached ? 'none' : st.awake ? 'on' : 'asleep';
  const words = {
    off: 'Off while a call or meeting is being recorded',
    none: 'No camera found on the dock',
    on: `Awake${st?.sleepsInSeconds ? `, sleeps in ${Math.max(1, Math.ceil(st.sleepsInSeconds / 60))} min` : ''}`,
    asleep: 'Asleep: tap the camera icon on the desk, or wake it here',
  }[state];
  const log = st?.recentLogs?.length ? st.recentLogs[st.recentLogs.length - 1].replace(/^\[.*?\]\s*/, '') : null;

  return (
    <div className="imsm-cam">
      <Segmented label="Where the picture comes from" value={source} onChange={pick} options={SOURCES} />
      <div className="camst">
        <span className={`cdot ${state}`} />
        <span className="w"><b>{words}</b>
          {st?.presence?.watching && !st.recording && <small>{st.presence.present ? `At the desk: ${st.presence.names.length ? st.presence.names.join(' and ') : 'someone not recognised'}${st.presence.since ? ` since ${new Date(st.presence.since).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}` : ''}` : 'Nobody at the desk'}</small>}
        </span>
        {state !== 'on' && state !== 'off' && <Btn kind="tonal" icon="bolt" busy={waking} onClick={wake}>Wake it</Btn>}
      </div>
      <div className="view">
        {source === 'browser' && !camError && <video ref={videoRef} autoPlay playsInline muted />}
        {source === 'browser' && camError && <p className="msg">{camError}</p>}
        {source === 'device' && (
          <img key={streamKey} src={`/api/camera/stream?k=${streamKey}`} alt="What the IMS camera sees" style={{ display: noFrame ? 'none' : 'block' }}
            onLoad={() => { hasFrame.current = true; setNoFrame(false); }}
            onError={() => { setTimeout(() => setStreamKey((k) => k + 1), 2500); if (!hasFrame.current) setNoFrame(true); }} />
        )}
        {source === 'upload' && !noFrame && frameSrc && <img src={frameSrc} alt="The photo you chose" />}
        {source === 'device' && noFrame && (
          <div className="msg">
            <Icon n="video" size={32} />
            <b>Nothing from the desk camera yet</b>
            <span>Check the Box-3 is on its dock, the dock's USB-C has power, and the webcam is plugged in.</span>
            <div className="imsm-row" style={{ justifyContent: 'center' }}>
              <Btn kind="tonal" icon="bolt" busy={waking} onClick={wake}>Wake it</Btn>
              <Btn kind="text" icon="monitor" onClick={() => pick('browser')}>Use this computer's webcam</Btn>
            </div>
          </div>
        )}
        {source === 'upload' && noFrame && <button type="button" className="msg pickph sl" onClick={() => fileRef.current?.click()}><Icon n="upload" size={32} /><b>Choose a JPEG photo</b></button>}
      </div>
      {source === 'upload' && <input ref={fileRef} type="file" accept="image/jpeg" hidden onChange={onFile} />}
      <div className="imsm-row">
        <Btn icon={snapshotIcon} busy={busy} disabled={busy || (source !== 'browser' && noFrame)} onClick={snapshot}>{snapshotLabel}</Btn>
        {source === 'upload' && !noFrame && <Btn kind="text" icon="upload" onClick={() => fileRef.current?.click()}>A different photo</Btn>}
      </div>
      {log && <details className="camlog"><summary>What the desk's USB is doing</summary><code>{log}</code><span>The camera needs 5 V, 2 A or more into the dock base's USB-C.</span></details>}
    </div>
  );
}
