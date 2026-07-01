import React, { createContext, useContext, useState, useEffect } from 'react';

const ThemeContext = createContext({ theme: 'corporate', setTheme: () => {} });

export const THEMES = [
  { id: 'corporate', label: 'Corporate', description: 'Navy & gold', preview: 'linear-gradient(135deg, #0f1623 60%, #c9a84c)' },
  { id: 'space', label: 'Space', description: 'Neon cyberpunk', preview: 'linear-gradient(135deg, #000105 60%, #00f2ff)' },
  { id: 'oatmeal', label: 'Oatmeal', description: 'Sage & warm white', preview: 'linear-gradient(135deg, #F1EFE9 60%, #899981)' },
  { id: 'white', label: 'White', description: 'Clean & light', preview: 'linear-gradient(135deg, #f0f2f5 60%, #2563eb)' }
];

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => {
    try {
      return localStorage.getItem('hive_mesh_theme') || 'corporate';
    } catch { return 'corporate'; }
  });

  useEffect(() => {
    localStorage.setItem('hive_mesh_theme', theme);
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
