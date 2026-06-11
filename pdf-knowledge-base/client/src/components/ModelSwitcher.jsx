import React from 'react';
import { Zap, Brain, MessageSquare, Search, Sparkles } from 'lucide-react';
import { useDraggableScroll } from '../hooks/useDraggableScroll';
import { Tooltip } from './CursorHover';

/**
 * Model selector component with draggable horizontal scroll.
 */
export default function ModelSwitcher({ current, onChange }) {
  const { scrollRef, isDragging, handlers } = useDraggableScroll();
  const models = [
    { id: 'flash', label: 'Flash', icon: Zap, desc: 'Ultra-fast, concise responses. Cost: £0.24/1M tokens' },
    { id: 'pro', label: 'Pro', icon: Sparkles, desc: 'Complex reasoning & research. Cost: £1.00/1M tokens' },
    { id: 'thinking', label: 'Thinking', icon: Brain, desc: 'Deep logical chains & step-by-step analysis. Cost: £1.50/1M tokens' },
    { id: 'research', label: 'Research', icon: Search, desc: 'Exhaustive data exploration & synthesis. Cost: £2.50/1M tokens' }
  ];

  return (
    <div 
      className="tone-switcher" 
      id="model-switcher"
      ref={scrollRef}
      {...handlers}
      style={{
        cursor: isDragging ? 'grabbing' : 'grab',
        userSelect: 'none'
      }}
    >
      {models.map((model) => {
        const Icon = model.icon;
        return (
          <Tooltip 
            key={model.id} 
            content={
              <div className="flex flex-col gap-1">
                <div className="text-[10px] uppercase tracking-wider text-[var(--accent-indigo)] font-bold opacity-80">Model Intelligence</div>
                <div className="text-[12px] font-bold mb-1">{model.label}</div>
                <div className="text-[11px] opacity-90 leading-relaxed">{model.desc}</div>
              </div>
            }
          >
            <button
              key={model.id}
              className={`tone-option ${current === model.id ? 'active' : ''}`}
              onClick={() => !isDragging && onChange(model.id)}
              style={{ flexShrink: 0 }}
            >
              <Icon size={14} />
              <span>{model.label}</span>
            </button>
          </Tooltip>
        );
      })}
    </div>
  );
}
