import React, { useState } from 'react';
import { BookOpen, Sparkles } from 'lucide-react';
import ImsPanel from './ImsPanel';

// The home page chat column: Ims first, with the existing library chat (Pro/Thinking models,
// citations) one tap away. The tab you last used is remembered on this device.
export default function HomeChat({ theme = 'dark', children }) {
  const isDark = theme === 'dark';
  const [tab, setTab] = useState(() => { try { return localStorage.getItem('home_chat_tab') || 'ims'; } catch { return 'ims'; } });
  const choose = (t) => { setTab(t); try { localStorage.setItem('home_chat_tab', t); } catch { /* ignore */ } };
  const btn = (t) => `px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition ${
    tab === t ? 'bg-gradient-to-r from-violet-600 to-indigo-600 text-white' : isDark ? 'text-slate-400 hover:bg-white/5' : 'text-slate-600 hover:bg-black/5'}`;
  return (
    <div style={{ flex: 1, minWidth: 0, height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div className={`flex items-center gap-1 px-3 py-2 border-b ${isDark ? 'border-white/5' : 'border-[#2E2B27]/10'}`}>
        <button onClick={() => choose('ims')} className={btn('ims')}><Sparkles size={13} /> Ims</button>
        <button onClick={() => choose('library')} className={btn('library')}><BookOpen size={13} /> Library (deep research)</button>
      </div>
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        {tab === 'ims' ? <ImsPanel theme={theme} /> : children}
      </div>
    </div>
  );
}
