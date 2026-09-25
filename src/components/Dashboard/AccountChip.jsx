import React, { useEffect, useRef, useState } from 'react';
import { LogOut } from 'lucide-react';
import { useAuth } from '../../AuthGate';

// The signed-in Google account, top right of every page, like a browser profile button.
export default function AccountChip({ isDark }) {
  const { user, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [open]);

  if (!user) return null;
  const initial = (user.name || user.email || '?').trim().charAt(0).toUpperCase();
  const avatar = user.picture
    ? <img src={user.picture} alt="" referrerPolicy="no-referrer" className="w-8 h-8 rounded-full object-cover" />
    : <span className="w-8 h-8 rounded-full flex items-center justify-center bg-gradient-to-tr from-orange-500 to-red-600 text-white text-sm font-bold">{initial}</span>;

  return (
    <div ref={ref} className="relative shrink-0">
      <button onClick={() => setOpen(!open)} title={`Signed in as ${user.email}`}
        className={`rounded-full p-0.5 border transition ${isDark ? 'border-white/10 hover:border-white/30' : 'border-[#2E2B27]/10 hover:border-[#2E2B27]/30'}`}>
        {avatar}
      </button>
      {open && (
        <div className={`absolute right-0 mt-2 w-64 rounded-2xl border shadow-xl p-4 z-50 flex flex-col items-center gap-2 text-center ${isDark ? 'bg-slate-900 border-white/10 text-slate-100' : 'bg-white border-[#2E2B27]/10 text-slate-900'}`}>
          {user.picture ? <img src={user.picture} alt="" referrerPolicy="no-referrer" className="w-14 h-14 rounded-full object-cover" /> : <span className="w-14 h-14 rounded-full flex items-center justify-center bg-gradient-to-tr from-orange-500 to-red-600 text-white text-xl font-bold">{initial}</span>}
          {user.name && <div className="text-sm font-bold">{user.name}</div>}
          <div className="text-xs text-slate-500 break-all">{user.email}</div>
          <button onClick={signOut} className={`mt-2 w-full px-3 py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-2 border ${isDark ? 'border-white/10 hover:bg-white/5' : 'border-[#2E2B27]/10 hover:bg-black/5'}`}>
            <LogOut size={13} /> Sign out
          </button>
        </div>
      )}
    </div>
  );
}
