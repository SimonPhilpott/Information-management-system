import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../index.css';
import ImsFace from '../components/Ims/ImsFace';
import { ORC_ART } from '../components/Ims/OrcFace';
import { CHRONICLER_ART } from '../components/Ims/ChroniclerFace';

// Renders one face frame at a time, exactly as the web app draws it, so the server can photograph each one
// into a face pack for the Box-3 (faceDeviceService.js). The box is the device's face area: 204 x 136 px.
// window.show({ kind: 'image', url, background, aspect }) - one frame of a painted face
// window.show({ kind: 'face', face, status, level })      - a procedural face in a given emotion / mouth level
export const BOX_W = 204, BOX_H = 136;
window.PAINTED = { orc: ORC_ART, chronicler: CHRONICLER_ART };

function App() {
  const [spec, setSpec] = useState(null);
  const levelRef = useRef(0);
  const readyRef = useRef(null);
  useEffect(() => {
    window.show = (s) => new Promise((resolve) => {
      levelRef.current = s.level || 0;
      readyRef.current = resolve;
      setSpec({ ...s, key: Math.random() });
    });
  }, []);
  useEffect(() => {
    if (!spec) return;
    const done = readyRef.current;
    if (spec.kind === 'image') {
      const img = new Image();
      img.onload = img.onerror = () => requestAnimationFrame(() => done?.());
      img.src = spec.url;
    } else {
      requestAnimationFrame(() => done?.());
    }
  }, [spec]);

  return (
    <div id="box" style={{ width: BOX_W, height: BOX_H, overflow: 'hidden', background: spec?.background || '#0b0e15', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {spec?.kind === 'image' && (
        <img src={spec.url} alt="" style={{ height: '100%', aspectRatio: spec.aspect, objectFit: 'contain', display: 'block' }} />
      )}
      {spec?.kind === 'face' && (
        <ImsFace key={spec.key} face={spec.face} status={spec.status || 'idle'} levelRef={levelRef} width={BOX_W} className="!rounded-none !border-0 !shadow-none" />
      )}
    </div>
  );
}

createRoot(document.getElementById('root')).render(<App />);
