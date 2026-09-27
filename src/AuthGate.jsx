import React, { createContext, useContext, useEffect, useState } from 'react';
import { LogIn, Loader2, Layers } from 'lucide-react';
import DecksPortal from './components/Dashboard/DecksPortal';
import { isCampaignPath, canonicalCampaignPath } from './components/Dashboard/campaignPaths';

const AuthContext = createContext({ user: null, signOut: () => {} });
export const useAuth = () => useContext(AuthContext);

// Every sign-in asks Google for name and email only; the server takes the owner on to the
// Drive/Calendar consent when IMS needs it, and nobody else is ever asked (routes/auth.js).
export async function startSignIn() {
  const back = window.location.pathname + window.location.search.replace(/[?&]auth=[^&]*(&message=[^&]*)?/, '');
  const d = await (await fetch(`/api/auth/url?returnTo=${encodeURIComponent(back)}`)).json();
  if (d.url) window.location.href = d.url;
}

// One Google sign-in for the whole app: nothing renders until this browser has a session
// for an approved account, and every /api call is refused without it (see index.js).
// People invited to the deck builder get that one page and nothing else.
export default function AuthGate({ children }) {
  const [state, setState] = useState({ loading: true, user: null, guest: false, error: null });

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
      .then((d) => setState({ loading: false, user: d.signedIn || d.guest ? d.user : null, guest: !d.signedIn && Boolean(d.guest), error }))
      .catch(() => setState({ loading: false, user: null, guest: false, error: 'Could not reach the IMS server.' }));
  }, []);

  const signOut = async () => {
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
    setState({ loading: false, user: null, guest: false, error: null });
  };

  if (state.loading) {
    return <div className="min-h-screen flex items-center justify-center bg-[#030712] text-slate-400"><Loader2 className="animate-spin" size={22} /></div>;
  }

  if (!state.user) {
    const invited = isCampaignPath(window.location.pathname) || new URLSearchParams(window.location.search).has('invite');
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#030712] text-slate-100 p-6">
        <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-white/5 p-8 flex flex-col items-center gap-5 text-center">
          <div className="text-2xl font-black tracking-tight">IMS</div>
          <p className="text-sm text-slate-400">
            {invited ? "You've been invited to the Campaign Manager. Sign in with the Google account the invite was sent to - Google only shares your name and email." : 'Sign in with your Google account. You only need to do this once on each device.'}
          </p>
          {state.error && <p className="w-full text-sm text-red-300 bg-red-500/15 border border-red-500/30 rounded-xl px-3 py-2">{state.error}</p>}
          <button onClick={() => startSignIn()} className={`w-full px-5 py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2 text-white active:scale-95 transition bg-gradient-to-r ${invited ? 'from-emerald-600 to-teal-700' : 'from-orange-500 to-red-600'}`}>
            {invited ? <Layers size={16} /> : <LogIn size={16} />} Sign in with Google
          </button>
        </div>
      </div>
    );
  }

  return (
    <AuthContext.Provider value={{ user: { ...state.user, guest: state.guest }, signOut }}>
      {state.guest ? <GuestDeckBuilder /> : children}
    </AuthContext.Provider>
  );
}

// An invited person's whole app: the Campaign Manager (every game's campaigns and decks), with its own
// light/dark switch. Old /ims/decks links land in the right place.
const guestPath = (p) => canonicalCampaignPath(isCampaignPath(p) ? p : '/campaigns');
function GuestDeckBuilder() {
  const [path, setPath] = useState(() => guestPath(window.location.pathname));
  const [theme, setTheme] = useState(() => { try { return localStorage.getItem('deckTheme') || 'dark'; } catch { return 'dark'; } });
  useEffect(() => {
    if (guestPath(window.location.pathname) !== window.location.pathname) window.history.replaceState(null, '', guestPath(window.location.pathname));
    const onPop = () => setPath(guestPath(window.location.pathname));
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  const toggle = () => setTheme((t) => { const n = t === 'dark' ? 'light' : 'dark'; try { localStorage.setItem('deckTheme', n); } catch { /* fine */ } return n; });
  const go = (p) => setPath(guestPath(p));
  return <DecksPortal theme={theme} onThemeToggle={toggle} currentPath={path} setCurrentPath={go} />;
}
