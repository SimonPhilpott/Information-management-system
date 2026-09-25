import React, { createContext, useContext, useEffect, useState } from 'react';
import { LogIn, Loader2 } from 'lucide-react';

const AuthContext = createContext({ user: null, signOut: () => {} });
export const useAuth = () => useContext(AuthContext);

export async function startSignIn() {
  const back = window.location.pathname + window.location.search.replace(/[?&]auth=[^&]*(&message=[^&]*)?/, '');
  const d = await (await fetch(`/api/auth/url?returnTo=${encodeURIComponent(back)}`)).json();
  if (d.url) window.location.href = d.url;
}

// One Google sign-in for the whole app: nothing renders until this browser has a session
// for an approved account, and every /api call is refused without it (see index.js).
export default function AuthGate({ children }) {
  const [state, setState] = useState({ loading: true, user: null, error: null });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const error = params.get('auth') === 'error' ? params.get('message') : null;
    if (params.has('auth')) {
      params.delete('auth'); params.delete('message');
      const q = params.toString();
      window.history.replaceState({}, '', window.location.pathname + (q ? `?${q}` : ''));
    }
    fetch('/api/auth/status')
      .then((r) => r.json())
      .then((d) => setState({ loading: false, user: d.signedIn ? d.user : null, error }))
      .catch(() => setState({ loading: false, user: null, error: 'Could not reach the IMS server.' }));
  }, []);

  const signOut = async () => {
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
    setState({ loading: false, user: null, error: null });
  };

  if (state.loading) {
    return <div className="min-h-screen flex items-center justify-center bg-[#030712] text-slate-400"><Loader2 className="animate-spin" size={22} /></div>;
  }

  if (!state.user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#030712] text-slate-100 p-6">
        <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-white/5 p-8 flex flex-col items-center gap-5 text-center">
          <div className="text-2xl font-black tracking-tight">IMS</div>
          <p className="text-sm text-slate-400">Sign in with your Google account to use IMS. You only need to do this once on each device.</p>
          {state.error && <p className="text-xs text-red-400">{state.error}</p>}
          <button onClick={startSignIn} className="w-full px-5 py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2 bg-gradient-to-r from-orange-500 to-red-600 text-white active:scale-95 transition">
            <LogIn size={16} /> Sign in with Google
          </button>
        </div>
      </div>
    );
  }

  return <AuthContext.Provider value={{ user: state.user, signOut }}>{children}</AuthContext.Provider>;
}
