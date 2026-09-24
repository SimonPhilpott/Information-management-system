import React from 'react';

// A stored snapshot with a box (and name) drawn over each detected face.
// Boxes are in the photo's own pixel coordinates, so the SVG uses the photo's
// dimensions as its viewBox and scales with the image automatically.
export default function SnapshotView({ snapshot, selectedFace = null, onSelectFace }) {
  const w = snapshot.width || 640, h = snapshot.height || 480;
  const stroke = Math.max(2, Math.round(w / 200));
  const font = Math.max(12, Math.round(w / 32));
  return (
    <div className="relative w-full rounded-xl overflow-hidden bg-black">
      <img src={`/api/look/snapshots/${snapshot.id}/image`} alt="Snapshot" className="w-full block" />
      <svg viewBox={`0 0 ${w} ${h}`} className="absolute inset-0 w-full h-full" preserveAspectRatio="none">
        {snapshot.faces.map((f) => {
          const [x, y, bw, bh] = f.box;
          const known = Boolean(f.match);
          const colour = known ? '#34d399' : '#fbbf24';
          const isSel = selectedFace === f.index;
          const label = known ? f.match.name : (onSelectFace ? `Face ${f.index + 1}` : 'Unknown');
          return (
            <g key={f.index} style={{ cursor: onSelectFace ? 'pointer' : 'default' }} onClick={() => onSelectFace?.(f.index)}>
              <rect x={x} y={y} width={bw} height={bh} fill={isSel ? 'rgba(56,189,248,0.18)' : 'transparent'}
                stroke={isSel ? '#38bdf8' : colour} strokeWidth={isSel ? stroke + 1 : stroke} rx={stroke * 2} />
              <rect x={x} y={Math.max(0, y - font - 6)} width={Math.max(bw, label.length * font * 0.62 + 10)} height={font + 6} fill={isSel ? '#38bdf8' : colour} />
              <text x={x + 5} y={Math.max(font, y - 6)} fontSize={font} fontWeight="700" fill="#0b0e15">{label}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
