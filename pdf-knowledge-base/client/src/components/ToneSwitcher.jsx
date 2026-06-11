import React from 'react';
import { Heart, Briefcase, Target, Search } from 'lucide-react';
import { useDraggableScroll } from '../hooks/useDraggableScroll';
import { Tooltip } from './CursorHover';

/**
 * Tone selector component with draggable horizontal scroll.
 */
export default function ToneSwitcher({ current, onChange }) {
  const { scrollRef, isDragging, handlers } = useDraggableScroll();
  const tones = [
    { id: 'friendly', label: 'Friendly', icon: Heart, desc: 'Conversational & human sounding' },
    { id: 'professional', label: 'Professional', icon: Briefcase, desc: 'Formal & polished tone' },
    { id: 'direct', label: 'Direct', icon: Target, desc: 'No fluff, right to the point' },
    { id: 'investigator', label: 'Investigator', icon: Search, desc: 'Exhaustive research-oriented' }
  ];

  return (
    <div 
      className="tone-switcher" 
      id="tone-switcher"
      ref={scrollRef}
      {...handlers}
      style={{
        cursor: isDragging ? 'grabbing' : 'grab',
        userSelect: 'none'
      }}
    >
      {tones.map((tone) => {
        const Icon = tone.icon;
        return (
          <Tooltip 
            key={tone.id} 
            content={
              <div className="flex flex-col gap-1">
                <div className="text-[10px] uppercase tracking-wider text-[var(--accent-indigo)] font-bold opacity-80">Tone Strategy</div>
                <div className="text-[12px] font-bold mb-1">{tone.label}</div>
                <div className="text-[11px] opacity-90 leading-relaxed">{tone.desc}</div>
              </div>
            }
          >
            <button
              className={`tone-option ${current === tone.id ? 'active' : ''}`}
              onClick={() => !isDragging && onChange(tone.id)}
              style={{ flexShrink: 0 }}
            >
              <Icon size={14} />
              <span>{tone.label}</span>
            </button>
          </Tooltip>
        );
      })}
    </div>
  );
}
