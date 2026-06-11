import React from 'react';
import { Sparkles, Search, Shield, Book } from 'lucide-react';
import { useDraggableScroll } from '../hooks/useDraggableScroll';
import { Tooltip } from './CursorHover';

const ICON_MAP = {
  Sparkles: <Sparkles size={14} />,
  Search: <Search size={14} />,
  Shield: <Shield size={14} />,
  Book: <Book size={14} />
};

/**
 * Role/Gem selector component with draggable horizontal scroll.
 */
export default function GemSelector({ gems, onSelect, compact = false }) {
  const { scrollRef, isDragging, handlers } = useDraggableScroll();

  if (!gems || gems.length === 0) return null;

  const activeGem = gems.find(g => g.is_active === 1) || gems[0];

  return (
    <div className="gem-selector-container" style={{ margin: compact ? '0 12px' : '0' }}>
      <div 
        className="tone-switcher gem-toggle" 
        ref={scrollRef}
        {...handlers}
        style={{ 
          cursor: isDragging ? 'grabbing' : 'grab',
          userSelect: 'none',
          overflowX: 'auto',
          scrollbarWidth: 'none',
          msOverflowStyle: 'none',
          whiteSpace: 'nowrap',
          display: 'flex',
          padding: '2px'
        }}
      >
        {gems.map(gem => (
          <Tooltip 
            key={gem.id} 
            text={gem.instruction}
            content={
              <div className="flex flex-col gap-1">
                <div className="text-[10px] uppercase tracking-wider text-[var(--accent-indigo)] font-bold opacity-80">Persona Focus</div>
                <div className="text-[12px] font-bold mb-1">{gem.name}</div>
                <div className="text-[11px] opacity-90 leading-relaxed">{gem.instruction}</div>
              </div>
            }
          >
            <button
              className={`tone-option ${gem.id === activeGem.id ? 'active' : ''}`}
              onClick={() => !isDragging && onSelect(gem.id)}
              style={{ 
                flexShrink: 0, 
                minWidth: 'fit-content',
                padding: '8px 16px'
              }}
            >
              {ICON_MAP[gem.icon] || <Sparkles size={14} />}
              <span style={{ fontSize: '11px', fontWeight: 600 }}>{gem.name}</span>
            </button>
          </Tooltip>
        ))}
      </div>
    </div>
  );
}
