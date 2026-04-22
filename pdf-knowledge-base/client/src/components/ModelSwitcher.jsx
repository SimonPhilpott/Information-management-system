import React from 'react';

export default function ModelSwitcher({ current, onChange }) {
  return (
    <div className="model-switcher" id="model-switcher">
      <button
        className={`model-option ${current === 'flash' ? 'active' : ''}`}
        onClick={() => onChange('flash')}
        title="Gemini 2.5 Flash — Fast & cost-effective ($0.30/1M input tokens)"
      >
        ⚡ Flash
      </button>
      <button
        className={`model-option ${current === 'pro' ? 'active' : ''}`}
        onClick={() => onChange('pro')}
        title="Gemini 2.5 Pro — Higher quality ($1.25/1M input tokens)"
      >
        🧠 Pro
      </button>
    </div>
  );
}
