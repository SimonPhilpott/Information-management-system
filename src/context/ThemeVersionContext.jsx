import React, { createContext, useContext, useState, useEffect } from 'react';

const ThemeVersionContext = createContext({
  themeVersion: 'new',
  setThemeVersion: () => {},
  isNewTheme: true,
});

export const THEME_VERSION_STORAGE_KEY = 'ims_theme_branding_version';

export function ThemeVersionProvider({ children }) {
  const [themeVersion, setThemeVersionState] = useState(() => {
    try {
      const saved = localStorage.getItem(THEME_VERSION_STORAGE_KEY);
      return saved === 'old' ? 'old' : 'new';
    } catch {
      return 'new';
    }
  });

  const setThemeVersion = (ver) => {
    const val = ver === 'old' ? 'old' : 'new';
    setThemeVersionState(val);
    try {
      localStorage.setItem(THEME_VERSION_STORAGE_KEY, val);
    } catch (_) {}
  };

  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === THEME_VERSION_STORAGE_KEY && (e.newValue === 'old' || e.newValue === 'new')) {
        setThemeVersionState(e.newValue);
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  return (
    <ThemeVersionContext.Provider value={{
      themeVersion,
      setThemeVersion,
      isNewTheme: themeVersion === 'new',
    }}>
      {children}
    </ThemeVersionContext.Provider>
  );
}

export function useThemeVersion() {
  return useContext(ThemeVersionContext);
}

// Visual toggle pill for headers
export function ThemeVersionToggle({ isDark }) {
  const { themeVersion, setThemeVersion } = useThemeVersion();
  const isOld = themeVersion === 'old';

  return (
    <div
      className={`flex items-center p-0.5 rounded-xl border text-[11px] font-bold transition-all shadow-sm ${
        isDark
          ? 'bg-slate-900/80 border-white/10 text-slate-400'
          : 'bg-[#FAF7F2] border-[#2E2B27]/15 text-stone-600'
      }`}
      title="Toggle between Old and New theme branding"
    >
      <button
        type="button"
        onClick={() => setThemeVersion('old')}
        className={`px-2.5 py-1 rounded-lg transition-all ${
          isOld
            ? isDark
              ? 'bg-white/15 text-white shadow-sm font-black'
              : 'bg-[#2E2B27]/10 text-[#2E2B27] shadow-sm font-black'
            : 'hover:text-slate-200'
        }`}
      >
        Old
      </button>
      <button
        type="button"
        onClick={() => setThemeVersion('new')}
        className={`px-2.5 py-1 rounded-lg transition-all ${
          !isOld
            ? isDark
              ? 'bg-gradient-to-r from-violet-600 to-indigo-600 text-white shadow-sm font-black'
              : 'bg-[#2E2B27] text-white shadow-sm font-black'
            : 'hover:text-slate-200'
        }`}
      >
        New
      </button>
    </div>
  );
}
