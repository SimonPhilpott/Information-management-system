import React, { useState } from 'react';
import { createPortal } from 'react-dom';

// Hover a card's name and its RingsDB card image appears beside the pointer (on a phone, it doesn't -
// tapping still opens the full card where the page supports it).
export default function CardHover({ card, children, className = '', as: Tag = 'span' }) {
  const [pos, setPos] = useState(null);
  if (!card?.image) return <Tag className={className}>{children}</Tag>;
  // Full-size card (330 wide), smaller only when the window can't fit it.
  const size = () => { const w = Math.min(330, window.innerWidth * 0.42, (window.innerHeight - 16) / 1.4); return { w, h: w * 1.4 }; };
  const place = (e) => {
    const { w, h } = size(), pad = 16;
    const x = e.clientX + pad + w > window.innerWidth ? e.clientX - pad - w : e.clientX + pad;
    const y = Math.min(Math.max(8, e.clientY - h / 2), window.innerHeight - h - 8);
    setPos({ x, y, w });
  };
  return (
    <Tag className={className} onMouseEnter={place} onMouseMove={place} onMouseLeave={() => setPos(null)}>
      {children}
      {pos && createPortal(
        <img src={card.image} alt="" loading="lazy"
          style={{ position: 'fixed', left: pos.x, top: pos.y, width: pos.w, zIndex: 9999, borderRadius: 12, boxShadow: '0 12px 40px rgba(0,0,0,.45)', pointerEvents: 'none' }} />,
        document.body,
      )}
    </Tag>
  );
}
