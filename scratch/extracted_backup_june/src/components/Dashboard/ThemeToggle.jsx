import React from 'react';
import { Sun, Moon } from 'lucide-react';
import { Tooltip } from './CursorHover';

export default function ThemeToggle({ theme, onToggle }) {
  const isDark = theme === 'dark';

  return (
    <div className="mode-switcher" style={{ width: '100%' }}>
      <Tooltip text="Switch to Light Mode">
        <div
          className={`mode-item ${!isDark ? 'active' : ''}`}
          onClick={() => isDark && onToggle()}
        >
          <Sun size={14} />
          <span>Light</span>
        </div>
      </Tooltip>
      <Tooltip text="Switch to Dark Mode">
        <div
          className={`mode-item ${isDark ? 'active' : ''}`}
          onClick={() => !isDark && onToggle()}
        >
          <Moon size={14} />
          <span>Dark</span>
        </div>
      </Tooltip>
    </div>
  );
}
