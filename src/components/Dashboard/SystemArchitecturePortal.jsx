import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  Network, Users, User, KeyRound, ShieldCheck, Monitor, Smartphone, Globe, BookOpen, Cpu, Sparkles, Bot,
  Waves, Mic, Wrench, Gauge, Hand, Moon, Plug, CalendarDays, HardDrive, Droplets, Syringe, Activity, Route,
  CloudSun, Apple, Music, Dices, Rss, Database, Layers, FileText, Lock, Settings, Boxes, Server, Code,
  Terminal, GitBranch, Clock, Timer, RefreshCw, Scale, ChevronRight, AlertTriangle, Info, Smile, Drama,
  MessageSquareQuote, Wifi, Newspaper, Heart, Radio, Speaker, Cake, Bell, ListChecks, Eye, Maximize2, Minimize2, Eraser,
} from 'lucide-react';
import PortalShell from './PortalShell';
import ImsFace from '../Ims/ImsFace';

// System Architecture (/ims/architecture): a hub-and-spokes map of how IMS is built, modelled on
// an application dependency map - see docs/system-architecture-design.md for the design notes.
// Everything here is checked against the code; the figures that change are fetched live.

const ACCENTS = {
  purple: { text: 'text-purple-500', badge: 'bg-purple-500/10', line: '#a855f7' },
  blue: { text: 'text-blue-500', badge: 'bg-blue-500/10', line: '#3b82f6' },
  violet: { text: 'text-violet-500', badge: 'bg-violet-500/10', line: '#8b5cf6' },
  green: { text: 'text-emerald-500', badge: 'bg-emerald-500/10', line: '#10b981' },
  orange: { text: 'text-orange-500', badge: 'bg-orange-500/10', line: '#f59e0b' },
  red: { text: 'text-rose-500', badge: 'bg-rose-500/10', line: '#f43f5e' },
  indigo: { text: 'text-indigo-500', badge: 'bg-indigo-500/10', line: '#6366f1' },
  sky: { text: 'text-sky-500', badge: 'bg-sky-500/10', line: '#0ea5e9' },
  teal: { text: 'text-teal-500', badge: 'bg-teal-500/10', line: '#14b8a6' },
  amber: { text: 'text-amber-500', badge: 'bg-amber-500/10', line: '#f59e0b' },
  slate: { text: 'text-slate-500', badge: 'bg-slate-500/10', line: '#64748b' },
};

// The eight cards around Ims. `side` says which way the connector leaves the card.
const spokes = (live) => [
  {
    key: 'owner', title: 'Owner and access', icon: Users, accent: 'purple', count: 2, side: 'right',
    rows: [
      { icon: User, main: 'Simon Philpott', sub: 'Owner - full access to everything', tag: 'Owner' },
      { icon: Users, main: 'Invited guests', sub: 'Daniel - the Campaign Manager only, with a basic Google sign-in' },
      { icon: KeyRound, main: 'Google sign-in (OAuth)', sub: 'Basic sign-in for all; Drive and Calendar scopes for the owner only' },
      { icon: ShieldCheck, main: 'Session check on everything', sub: 'Every /api route except sign-in, plus the live voice sockets' },
    ],
  },
  {
    key: 'clients', title: 'Clients', icon: Monitor, accent: 'blue', count: 3, side: 'bottom',
    rows: [
      { icon: Speaker, main: 'Desk terminal', sub: 'ESP32-S3-BOX-3 - raw TCP :3002, 16 kHz mic up, 24 kHz voice down' },
      { icon: Smile, main: 'Web app - Ims panel', sub: 'Same brain as the desk, over the /api/ims-live WebSocket' },
      { icon: BookOpen, main: 'Library chat and voice', sub: 'Deep research over your PDFs - /api/chat and /api/live' },
      { icon: Smartphone, main: 'Phone and away from home', sub: 'Installable as an app (or in the browser) through the ngrok tunnel' },
    ],
  },
  {
    key: 'ai', title: 'AI models', icon: Sparkles, accent: 'violet', count: 8, side: 'left',
    rows: [
      { icon: Waves, main: 'gemini-3.8-live', sub: 'Real-time voice: en-GB speech, live transcripts, session resumption' },
      { icon: Bot, main: 'gemini-2.5-flash', sub: 'Tasks, deck insights, chronicles, rule checks, report and test prompts' },
      { icon: BookOpen, main: 'gemini-2.5-pro', sub: 'Library research answers; reading map place names' },
      { icon: Layers, main: 'gemini-embedding-001', sub: 'Embeds PDF passages (and rulebooks) for the vector index' },
      { icon: Radio, main: 'gemini-2.5-flash-preview-tts', sub: 'Read aloud, and the chronicle narrators' },
      { icon: Eye, main: 'gemini-3.1-flash-image', sub: 'Chronicle illustrations and 1920s photographs' },
      { icon: Eye, main: 'imagen-4.0-generate-001', sub: 'Image generation' },
    ],
  },
  {
    key: 'pipeline', title: 'Conversation pipeline', icon: Mic, accent: 'green', count: 6, side: 'right',
    rows: [
      { icon: Hand, main: 'Wake gate', sub: 'Wake phrases and your recorded spellings; 10 s follow-up window' },
      { icon: Drama, main: 'Persona and context', sub: 'Yorkshire persona rules, accent rule, services, memories' },
      { icon: Wrench, main: '35 function tools', sub: 'Run on the server - calendar, glucose, carbs, lists, news, campaigns...' },
      { icon: Gauge, main: 'Audio pacing', sub: 'A 15 s lead buffer, so speech never speeds up' },
      { icon: MessageSquareQuote, main: 'Stop phrases', sub: '"Ims stop" halts speech and silences a ringing alarm' },
      { icon: Moon, main: '15 s of silence', sub: 'Closes the Gemini session to keep costs down' },
    ],
  },
  {
    key: 'connections', title: 'External connections', icon: Plug, accent: 'orange', count: 16, side: 'left',
    rows: [
      { icon: CalendarDays, main: 'Google Calendar', sub: 'Events and rules, synced every 5 minutes' },
      { icon: HardDrive, main: 'Google Drive', sub: 'Source of the PDF library' },
      { icon: Droplets, main: 'Nightscout (Heroku + MongoDB)', sub: 'Glucose every minute; carbs posted as Meal Bolus' },
      { icon: Syringe, main: 'AndroidAPS', sub: 'Picks up carbs from Nightscout - insulin is never sent' },
      { icon: Activity, main: 'Strava', sub: 'Activities, synced every 30 minutes' },
      { icon: Route, main: 'Komoot', sub: 'Routes for the run planner' },
      { icon: CloudSun, main: 'Open-Meteo', sub: 'Weather for the desk footer and reports' },
      { icon: Apple, main: 'Open Food Facts', sub: 'Carb look-ups when you log food' },
      { icon: Music, main: 'MusicBrainz', sub: 'Nightly scan of new releases from your artists' },
      { icon: Dices, main: 'BoardGameGeek', sub: 'Your collection (CSV export until API access) and want-to-sell list' },
      { icon: Layers, main: 'RingsDB', sub: 'LOTR LCG cards, scenarios and deck import' },
      { icon: BookOpen, main: 'Hall of Beorn', sub: 'LOTR LCG encounter cards and boons/burdens' },
      { icon: Layers, main: 'ArkhamDB', sub: 'Arkham Horror LCG cards, investigators and deck import' },
      { icon: FileText, main: 'Fantasy Flight Games', sub: 'Official LOTR and Arkham rulebooks and campaign guides' },
      { icon: Rss, main: 'News feeds', sub: `${live?.newsSources ?? 13} sources - BBC, Nature, NASA, metal and tour feeds` },
      { icon: Globe, main: 'ngrok', sub: 'Public HTTPS tunnel - simon-ims.ngrok-free.app' },
    ],
  },
  {
    key: 'data', title: 'Data stores', icon: Database, accent: 'red', count: 6, side: 'right',
    rows: [
      { icon: Database, main: 'SQLite - app.db', sub: `${live?.tables ?? 62} tables: memories, birthdays, carbs, tasks, campaigns, decks...` },
      { icon: Layers, main: 'Vector index (HNSW)', sub: 'hnswlib over the embedded PDF passages' },
      { icon: BookOpen, main: 'Library databases', sub: 'Documents, topics, contents and validated answers' },
      { icon: FileText, main: 'Files', sub: 'PDFs, recordings, chronicle narration and art, maps, card data' },
      { icon: Lock, main: 'Sign-in sessions', sub: 'Stored in SQLite, so sign-in survives a restart' },
      { icon: Settings, main: 'Config files', sub: 'Wi-Fi networks (encrypted), board games, report state' },
    ],
  },
  {
    key: 'services', title: 'Services', icon: Boxes, accent: 'indigo', count: 23, side: 'top',
    rows: [
      { icon: Bell, main: 'Core functions - 8', sub: 'Alarms, timers, reminders, birthdays, calendar, memories, recordings, tasks' },
      { icon: Heart, main: 'Personal - 4', sub: 'Music scanner, board games, Campaign Manager (LOTR and Arkham), news' },
      { icon: Droplets, main: 'Health and fitness - 3', sub: 'Blood sugar, activities, run planner' },
      { icon: Settings, main: 'Customisation and system - 7', sub: 'Face designer, persona, wake and stop phrases, Wi-Fi, dev ideas, backups, this page' },
      { icon: Eye, main: 'Disabled - 2', sub: 'Look and Faces, until the camera works' },
    ],
  },
  {
    key: 'environment', title: 'Environment', icon: Server, accent: 'sky', count: null, side: 'right',
    rows: [
      { icon: Monitor, main: 'Host', sub: 'Windows 11 PC on the home network (192.168.1.78)' },
      { icon: Server, main: 'Backend', sub: `Node.js ${live?.node || ''} + Express :3001; device TCP :3002, device HTTP :3003` },
      { icon: Code, main: 'Frontend', sub: 'React 19, Vite and Tailwind; dev server :6001' },
      { icon: Cpu, main: 'Firmware', sub: 'Arduino-ESP32 3.3.11 (ESP-IDF 5, pioarduino), LovyanGFX' },
      { icon: Terminal, main: 'Helpers', sub: 'Python 3.12 (music scan, face tool), Playwright scraper' },
      { icon: GitBranch, main: 'Source', sub: 'GitHub - SimonPhilpott/Information-management-system, main' },
    ],
  },
];

const supporting = [
  {
    key: 'jobs', title: 'Background jobs', icon: RefreshCw, accent: 'teal', count: 8,
    rows: [
      { icon: Timer, main: 'Every 15 seconds', sub: 'Fires due alarms, timers and reminders; updates the desk icons' },
      { icon: Droplets, main: 'Every minute', sub: 'Glucose from Nightscout' },
      { icon: Clock, main: 'Every 5 minutes', sub: 'Nightscout history log; Google Calendar sync' },
      { icon: Activity, main: 'Every 30 minutes', sub: 'Strava activities; weather' },
      { icon: Database, main: 'Hourly', sub: 'Nightscout storage auto-clear check' },
      { icon: Music, main: 'Nightly', sub: 'Music scan at its scheduled time; backup of all service data to the PC and Google Drive after 3am' },
    ],
  },
  {
    key: 'rules', title: 'Guardrails', icon: Scale, accent: 'amber', count: 6,
    rows: [
      { icon: MessageSquareQuote, main: 'English, Yorkshire accent', sub: 'Never another language, never American' },
      { icon: Hand, main: 'Never speaks unprompted', sub: 'Only answers when he is addressed' },
      { icon: Mic, main: 'Silent while recording', sub: 'No sound at all until you say stop' },
      { icon: Smile, main: 'Jokes', sub: 'Dark humour is fine; never racist or sexist' },
      { icon: Heart, main: 'Greetings stay light', sub: 'No glucose or running talk outside reports' },
      { icon: Syringe, main: 'No insulin', sub: 'Only carbs are ever sent to Nightscout' },
    ],
  },
  {
    key: 'firmware', title: 'Desk terminal', icon: Cpu, accent: 'slate', count: null,
    rows: [
      { icon: Smile, main: 'Face', sub: '12 x 8 dot face on a 320 x 240 screen - lip sync, blinks, night mode' },
      { icon: Bell, main: 'Left icons', sub: 'Alarms, timers, reminders, birthdays, new music, camera - with counts' },
      { icon: Droplets, main: 'Right side', sub: 'Glucose and trend, sensor, pod and prescription days, Nightscout storage %' },
      { icon: ListChecks, main: 'Footer', sub: "Weather, timer countdown, today's items rotating every 3 s" },
      { icon: Wifi, main: 'Resilience', sub: 'Mic stall watchdog, Wi-Fi networks managed from the web app' },
      { icon: Cpu, main: 'Hardware', sub: 'ESP32-S3, 16 MB flash, 8 MB PSRAM' },
    ],
  },
];

const FINDINGS = [
  { level: 'info', title: 'Test prompts are safe', sub: 'The test box under Ims runs read-only tools for real; anything that would change something is shown but not done' },
  { level: 'warn', title: 'Camera not working', sub: 'Look and Faces stay disabled until it does' },
  { level: 'warn', title: 'Fixed server address', sub: 'The desk terminal connects to 192.168.1.78 (include/config.h) - if the PC gets a new IP, it cannot connect' },
  { level: 'info', title: 'One host', sub: 'Backend, database and tunnel all run on one Windows PC - when it is off, Ims is offline everywhere. Everything is backed up nightly to Google Drive (/ims/backups)' },
  { level: 'info', title: 'Nightscout storage', sub: 'MongoDB free tier - usage shows on the desk screen; old data can be auto-cleared after 3 months' },
];

const TURN = [
  ['Listen', 'The desk mic streams 16 kHz audio over TCP (or the browser over a WebSocket). The server holds it back for a moment while it judges the words.'],
  ['Wake gate', "A request only goes through when it starts with a wake phrase - the list and your recorded spellings are on Wake and Stop Phrases - or comes within 10 s of Ims's last reply. Ims gives no greeting when a request follows the wake phrase."],
  ['Gemini Live', 'One live session per conversation, on gemini-3.8-live with en-GB speech. Its instructions are the persona rules, the accent rule, a paragraph on every service, and what he remembers about you.'],
  ['Tools', 'When Gemini asks for data or an action, the server runs one of 35 tools - calendar, glucose, carbs to Nightscout, reminders, lists, news, report, jokes, memories, background tasks - and sends the result back with a reminder of the accent.'],
  ['Speak', 'Replies stream back as 24 kHz audio. The server paces them to real time with a 15 s lead, and the face lip-syncs to the level.'],
  ['Close', 'After 15 s of silence the Gemini session closes. "Ims stop" ends speech at any time; recording mode keeps him silent until you say stop.'],
];

const DATA_GROUPS = [
  ['Conversation and memory', 'ims_memories, jokes, joke_history, voice_phrases, phrase_recordings, recordings, recording_lines'],
  ['Schedule', 'scheduled_items, schedule_events, calendar_rules, calendar_rule_fires, calendar_links, birthdays, tasks, list_items'],
  ['Health and fitness', 'ns_entries, ns_treatments, ns_devicestatus, carb_log, strava_activities, activity_glucose, activity_insight, activity_route, planned_routes, goals'],
  ['Personal', 'news_sources, boardgame_flags, boardgame_edits, decks, deck_people, campaigns, map_pins, scenario_lore, arkham_scenario_places, people'],
  ['Development', 'dev_ideas'],
  ['Faces and camera', 'ims_faces, ims_face_backups, face_samples, snapshots, snapshot_qa'],
  ['Library', 'documents, topics, toc_items, validated_qas, chat_sessions, chat_messages, gems, pinned_items, canvas_state'],
  ['System', 'settings, app_settings, global_rules, oauth_tokens, http_sessions, token_usage, ai_text_units'],
];

const ACTIONS = [
  { icon: Drama, title: 'Persona', sub: 'Dialect and rules', path: '/ims/persona', accent: 'purple' },
  { icon: MessageSquareQuote, title: 'Wake and stop phrases', sub: 'Record and add', path: '/ims/phrases', accent: 'violet' },
  { icon: Droplets, title: 'Blood sugar', sub: 'Nightscout and carbs', path: '/ims/glucose', accent: 'red' },
  { icon: Newspaper, title: 'News sources', sub: 'Feeds and weighting', path: '/ims/news', accent: 'sky' },
  { icon: Smile, title: 'Face designer', sub: 'Faces and eyes', path: '/ims/facedesigner', accent: 'amber' },
  { icon: Wifi, title: 'Wi-Fi', sub: 'Desk terminal networks', path: '/ims/wifi', accent: 'blue' },
];

// hot: rows used by a test prompt - { 'card|row': { at, uses, pulse } }. A row lights up in its card's colour
// when used and stays lit; one used again pulses while the prompt runs. They clear when the prompt is emptied.
const rowHot = (hot, card, main) => hot?.[`${card}|${main}`];
// The badge counts the card's own rows, so it can't drift from the list; Services counts its hub pages
// (the number at the end of each group) instead.
const countOf = (card) => (card.key === 'services' ? card.rows.reduce((n, r) => n + (Number((r.main.match(/(\d+)$/) || [])[1]) || 0), 0) : card.key === 'environment' ? null : card.rows.length);
function Card({ card, isDark, cardRef, onOpen, hot, now = 0 }) {
  const a = ACCENTS[card.accent];
  const Icon = card.icon;
  const anyLit = card.rows.some((r) => Boolean(rowHot(hot, card.key, r.main)));
  return (
    <div ref={cardRef} className={`relative z-10 rounded-2xl border p-3.5 transition-shadow duration-700 ${isDark ? 'bg-slate-900/80 border-white/10' : 'bg-white border-slate-200/80 shadow-[0_6px_24px_rgba(15,23,42,0.06)]'}`}
      style={anyLit ? { boxShadow: `0 0 0 2px ${a.line}, 0 0 26px ${a.line}66` } : undefined}>
      <button onClick={onOpen} disabled={!onOpen} title={onOpen ? 'More detail in the Ims panel' : undefined} className="w-full flex items-center gap-2.5 mb-2 text-left">
        <span className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${a.badge}`}><Icon size={16} className={a.text} /></span>
        <span className="font-bold text-[15px] flex-1 min-w-0 truncate">{card.title}</span>
        {countOf(card) != null && <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${isDark ? 'bg-white/10' : 'bg-slate-100'}`}>{countOf(card)}</span>}
        {onOpen && <ChevronRight size={16} className="text-slate-400 shrink-0" />}
      </button>
      <div className="flex flex-col">
        {card.rows.map((r) => {
          const RowIcon = r.icon;
          return (
            <div key={r.main} className={`flex items-start gap-2.5 rounded-md -mx-1.5 px-1.5 py-[1px] ${(() => { const h = rowHot(hot, card.key, r.main); return h?.pulse ? 'arch-pulse' : ''; })()}`}
              style={(() => {
                const h = rowHot(hot, card.key, r.main);
                return { backgroundColor: h ? `${a.line}40` : 'transparent', transition: 'background-color .3s ease-out', '--pulse': `${a.line}66` };
              })()}>
              <RowIcon size={16} className={`${a.text} mt-0.5 shrink-0`} />
              <div className="min-w-0 flex-1">
                <div className="text-[12.5px] font-semibold leading-tight flex items-center gap-2 flex-wrap">
                  {r.main}
                  {r.tag && <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${a.badge} ${a.text}`}>{r.tag}</span>}
                </div>
                <div className={`text-[11px] leading-tight ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{r.sub}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Rounded elbow connectors from each card's facing edge to the centre card, drawn over the grid.
function Connectors({ wrapRef, centreRef, refs, cards }) {
  const [paths, setPaths] = useState([]);
  const measure = useCallback(() => {
    const wrap = wrapRef.current, centre = centreRef.current;
    if (!wrap || !centre || getComputedStyle(wrap).display === 'none') return;
    // screen positions come back zoomed (Fit to screen); the svg draws in unzoomed units
    const scale = wrap.offsetWidth ? wrap.getBoundingClientRect().width / wrap.offsetWidth : 1;
    const box = (el) => { const r = el.getBoundingClientRect(); return { left: r.left / scale, top: r.top / scale, right: r.right / scale, bottom: r.bottom / scale, width: r.width / scale, height: r.height / scale }; };
    const W = box(wrap), C = box(centre);
    const cx = C.left + C.width / 2 - W.left, cy = C.top + C.height / 2 - W.top;
    const out = [];
    // where each card's line leaves it (its facing edge, level with its middle), to order the ends on Ims
    const starts = {};
    for (const card of cards) {
      const el = refs.current[card.key];
      if (!el) continue;
      const R = box(el);
      starts[card.key] = { side: card.side, y: (R.top + R.bottom) / 2 - W.top };
    }
    const slotOf = (card) => {
      const same = Object.entries(starts).filter(([, v]) => v.side === card.side).sort((a, b) => a[1].y - b[1].y).map(([k]) => k);
      return { i: same.indexOf(card.key), n: same.length };
    };
    cards.forEach((card, i) => {
      const el = refs.current[card.key];
      if (!el) return;
      const R = box(el);
      const r = { l: R.left - W.left, t: R.top - W.top, rr: R.right - W.left, b: R.bottom - W.top };
      const c = { l: C.left - W.left, t: C.top - W.top, rr: C.right - W.left, b: C.bottom - W.top };
      let x1, y1, x2, y2, d;
      if (card.side === 'right' || card.side === 'left') {
        x1 = card.side === 'right' ? r.rr : r.l;
        y1 = Math.min(r.b - 24, Math.max(r.t + 24, (r.t + r.b) / 2));
        x2 = card.side === 'right' ? c.l : c.rr;
        // spread the ends down the centre card's side
        const slot = slotOf(card);
        y2 = c.t + (c.b - c.t) * ((slot.i + 1) / (slot.n + 1));
        const mx = (x1 + x2) / 2;
        d = `M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`;
      } else {
        y1 = card.side === 'bottom' ? r.b : r.t;
        x1 = (r.l + r.rr) / 2;
        y2 = card.side === 'bottom' ? c.t : c.b;
        x2 = cx;
        const my = (y1 + y2) / 2;
        d = `M ${x1} ${y1} C ${x1} ${my}, ${x2} ${my}, ${x2} ${y2}`;
      }
      out.push({ key: card.key, d, x1, y1, x2, y2, color: ACCENTS[card.accent].line, i });
    });
    setPaths(out);
  }, [wrapRef, centreRef, refs, cards]);
  useLayoutEffect(() => {
    measure();
    const ro = new ResizeObserver(measure);
    // every card and Ims itself, so a card growing (the test trace) moves the lines with it
    for (const el of [wrapRef.current, centreRef.current, ...Object.values(refs.current)]) if (el) ro.observe(el);
    window.addEventListener('resize', measure);
    return () => { ro.disconnect(); window.removeEventListener('resize', measure); };
  }, [measure, wrapRef]);
  return (
    <>
      <svg className="absolute inset-0 w-full h-full pointer-events-none hidden lg:block" style={{ zIndex: 20 }}>
        {paths.map((p) => <path key={p.key} d={p.d} fill="none" stroke={p.color} strokeWidth="2.5" strokeLinecap="round" />)}
      </svg>
      {/* the end dots: a separate svg, as index.css clears the fill of shapes in any svg without .fill-current */}
      <svg className="fill-current absolute inset-0 w-full h-full pointer-events-none hidden lg:block" style={{ zIndex: 30 }}>
        {paths.map((p) => (
          <g key={p.key} style={{ color: p.color }}>
            <circle cx={p.x1} cy={p.y1} r="5" />
            <circle cx={p.x2} cy={p.y2} r="5" />
          </g>
        ))}
      </svg>
    </>
  );
}

function formatUptime(s) {
  if (s == null) return '-';
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
  return d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m}m`;
}

export default function SystemArchitecturePortal({ theme = 'dark', onThemeToggle, setCurrentPath }) {
  const isDark = theme === 'dark';
  const [live, setLive] = useState(null);
  const [tab, setTab] = useState('overview');
  // the side panel and the "across the whole system" row fold away, to see the whole map at once
  const saved = (k, d) => { try { const v = localStorage.getItem(k); return v === null ? d : v === '1'; } catch { return d; } };
  const [panelOpen, setPanelOpen] = useState(() => saved('archPanel', true));
  const [supportOpen, setSupportOpen] = useState(() => saved('archSupport', true));
  const keep = (k, v) => { try { localStorage.setItem(k, v ? '1' : '0'); } catch { /* fine */ } };
  const togglePanel = () => setPanelOpen((v) => { keep('archPanel', !v); return !v; });
  const toggleSupport = () => setSupportOpen((v) => { keep('archSupport', !v); return !v; });


  // ---- test prompt: runs through Ims, lighting up each part of the map as it's used
  const [prompt, setPrompt] = useState('');
  const [running, setRunning] = useState(false);
  const [trace, setTrace] = useState([]);
  const [answer, setAnswer] = useState(null);
  const [hot, setHot] = useState({});
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!running && !Object.keys(hot).length) return undefined;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [running, hot]);
  const matchRows = (rows) => {
    const out = [];
    for (const [cardKey, name] of rows || []) {
      const card = [...spokes(null), ...supporting].find((c) => c.key === cardKey);
      const row = card?.rows.find((r) => r.main === name) || card?.rows.find((r) => r.main.includes(name));
      if (row) out.push(`${cardKey}|${row.main}`);
    }
    return out;
  };
  const runTest = async () => {
    const text = prompt.trim();
    if (!text || running) return;
    setRunning(true); setTrace([]); setAnswer(null); setHot({});
    try {
      const res = await fetch('/api/system/trace', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt: text }) });
      const reader = res.body.getReader(); const dec = new TextDecoder(); let buf = '';
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let nl;
        while ((nl = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, nl); buf = buf.slice(nl + 1);
          if (!line.trim()) continue;
          const ev = JSON.parse(line);
          if (ev.type === 'step') {
            setTrace((t) => [...t, ev]);
            const keys = matchRows(ev.rows);
            setHot((h) => {
              const n = { ...h };
              for (const k of keys) n[k] = { at: Date.now(), uses: (n[k]?.uses || 0) + 1, pulse: (n[k]?.uses || 0) >= 1 };
              return n;
            });
          } else if (ev.type === 'done') setAnswer(ev.answer);
          else if (ev.type === 'error') setAnswer(`Error: ${ev.error}`);
        }
      }
    } catch (err) { setAnswer(`Error: ${err.message}`); }
    // done: repeated rows stop pulsing, and everything used stays lit until the prompt is cleared
    setHot((h) => Object.fromEntries(Object.entries(h).map(([k, v]) => [k, { ...v, pulse: false }])));
    setRunning(false);
  };

  // Fit to screen: the view goes full screen and is zoomed down until all of it fits (CSS zoom, so the
  // connector lines still measure correctly). Leaving full screen puts it back.
  const fitRef = useRef(null);
  const [fitted, setFitted] = useState(false);
  const [zoom, setZoom] = useState(1);
  const fit = useCallback(() => {
    const el = fitRef.current;
    if (!el) return;
    let z = 1;
    // zooming out widens the layout (so it gets shorter) - settle over a few passes
    for (let i = 0; i < 4; i++) {
      el.style.zoom = z;
      const h = el.scrollHeight * z, w = el.scrollWidth * z;
      const next = Math.min(1, (window.innerHeight - 16) / h * z, (window.innerWidth - 16) / w * z);
      if (Math.abs(next - z) < 0.01) break;
      z = next;
    }
    el.style.zoom = '';
    setZoom(z);
  }, []);
  useEffect(() => {
    const onChange = () => { const on = document.fullscreenElement === fitRef.current; setFitted(on); if (!on) setZoom(1); };
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);
  useEffect(() => {
    if (!fitted) return undefined;
    const t = setTimeout(fit, 120);
    window.addEventListener('resize', fit);
    return () => { clearTimeout(t); window.removeEventListener('resize', fit); };
  }, [fitted, fit, panelOpen, supportOpen, trace.length, answer]);
  const toggleFit = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await fitRef.current?.requestFullscreen();
    } catch (_) { /* full screen not allowed here */ }
  };
  const wrapRef = useRef(null), centreRef = useRef(null), cardRefs = useRef({}), panelRef = useRef(null);

  useEffect(() => {
    fetch('/api/system/architecture').then((r) => r.json()).then((d) => { if (d.success) setLive(d); }).catch(() => {});
  }, []);

  const cards = spokes(live);
  const byKey = Object.fromEntries(cards.map((c) => [c.key, c]));
  const go = (path) => {
    window.history.pushState(null, '', path);
    if (setCurrentPath) setCurrentPath(path);
    else window.dispatchEvent(new PopStateEvent('popstate'));
  };
  const openTab = (t) => { setTab(t); setPanelOpen(true); setTimeout(() => panelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50); };
  const muted = isDark ? 'text-slate-400' : 'text-slate-500';
  const panelCls = `rounded-2xl border ${isDark ? 'bg-slate-900/80 border-white/10' : 'bg-white border-slate-200/80 shadow-[0_6px_24px_rgba(15,23,42,0.06)]'}`;
  const online = live?.deviceOnline;

  const place = (key, cls) => (
    <div className={cls}>
      <Card card={byKey[key]} isDark={isDark} hot={hot} now={now} cardRef={(el) => { cardRefs.current[key] = el; }}
        onOpen={() => openTab(key === 'data' ? 'data' : key === 'pipeline' ? 'turn' : 'overview')} />
    </div>
  );

  return (
    <PortalShell title="System Architecture" subtitle="/ims/architecture • how Ims is built and how it all connects"
      icon={Network} gradient="from-fuchsia-500 to-violet-600" glow="rgba(168,85,247,0.3)"
      isDark={isDark} onThemeToggle={onThemeToggle} setCurrentPath={setCurrentPath} maxWidth="max-w-[2200px]">
      <style>{`
        @keyframes archPulse { 0%, 100% { box-shadow: 0 0 0 0 var(--pulse); } 50% { box-shadow: 0 0 0 5px transparent; filter: brightness(1.15); } }
        .arch-pulse { animation: archPulse 1s ease-in-out infinite; }
      `}</style>
      <div className="flex justify-end -mt-2 mb-2">
        <button onClick={toggleFit} className={`px-3 py-1.5 rounded-lg text-[12px] font-bold flex items-center gap-1.5 border ${isDark ? 'border-white/10 bg-white/5' : 'border-slate-200 bg-white'}`}>
          <Maximize2 size={14} /> Fit to screen</button>
      </div>
      <div ref={fitRef} className={`flex flex-col xl:flex-row gap-6 items-start ${fitted ? `overflow-hidden p-2 ${isDark ? 'bg-[#030712] text-slate-100' : 'bg-[#F4F1EC] text-slate-900'}` : ''}`}
        style={fitted ? { zoom } : undefined}>
        {fitted && (
          <button onClick={toggleFit} title="Leave full screen (Esc)" className={`fixed top-3 right-3 z-50 px-3 py-1.5 rounded-lg text-[12px] font-bold flex items-center gap-1.5 border ${isDark ? 'border-white/10 bg-slate-800' : 'border-slate-200 bg-white'}`}
            style={{ zoom: 1 / zoom }}><Minimize2 size={14} /> Exit full screen</button>
        )}
        {/* the map */}
        <div ref={wrapRef} className="relative flex-1 min-w-0 w-full">
          <Connectors wrapRef={wrapRef} centreRef={centreRef} refs={cardRefs} cards={cards} />
          {/* three columns, every card beside Ims so no line crosses a card: left and right columns join Ims's
              sides, Clients sits above it and Services below */}
          <div className="flex flex-col lg:flex-row gap-4 lg:gap-12 items-stretch">
            <div className="order-2 lg:order-none flex-1 min-w-0 flex flex-col gap-3">
              {place('owner', '')}
              {place('pipeline', '')}
              {place('data', '')}
              {place('environment', '')}
            </div>
            <div className="order-1 lg:order-none flex-1 min-w-0 lg:max-w-[440px] flex flex-col gap-10 justify-between">
              {place('clients', '')}
            <div className="flex items-center justify-center">
                <div ref={centreRef} className={`relative z-10 w-full rounded-3xl border-2 p-5 text-center ${isDark ? 'bg-slate-900 border-violet-500/60 shadow-[0_0_40px_rgba(139,92,246,0.25)]' : 'bg-white border-violet-400 shadow-[0_0_40px_rgba(139,92,246,0.22)]'}`}>
                  <span className={`absolute top-3 right-3 px-2 py-0.5 rounded-lg text-[10px] font-bold flex items-center gap-1 ${isDark ? 'bg-white/10' : 'bg-slate-100'}`}>
                    <GitBranch size={11} /> main
                  </span>
                  <div className="mt-4 flex justify-center"><ImsFace status="idle" width={150} /></div>
                  <div className="mt-4 text-xl font-black tracking-tight">Ims</div>
                  <div className={`text-sm ${muted}`}>Information Management System</div>
                  <div className={`text-xs mt-1 ${muted}`}>Yorkshire voice assistant - desk, web and phone</div>
                  <div className="mt-3 flex items-center justify-center gap-2 text-[11px] font-bold">
                    <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-500 flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Server up {formatUptime(live?.uptimeSec)}</span>
                    <span className={`px-2 py-0.5 rounded-full flex items-center gap-1 ${online ? 'bg-emerald-500/15 text-emerald-500' : 'bg-slate-500/15 text-slate-500'}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${online ? 'bg-emerald-500' : 'bg-slate-400'}`} /> Desk {live ? (online ? 'connected' : 'offline') : '...'}
                    </span>
                  </div>
                  {/* test prompt: watch it run through the system */}
                  <div className="mt-4 text-left">
                    <div className={`text-[11px] font-black uppercase tracking-wider mb-1 ${muted}`}>Test a prompt</div>
                    <div className="flex gap-1.5">
                      <input value={prompt} onChange={(e) => { setPrompt(e.target.value); if (!e.target.value.trim()) { setHot({}); setTrace([]); setAnswer(null); } }} onKeyDown={(e) => e.key === 'Enter' && runTest()} disabled={running}
                        placeholder="Ims, any birthdays coming up?" className={`flex-1 min-w-0 px-2.5 py-1.5 rounded-lg text-[12.5px] outline-none border ${isDark ? 'bg-slate-950/70 border-white/10' : 'bg-white border-slate-200'}`} />
                      <button onClick={runTest} disabled={running || !prompt.trim()} className="px-3 py-1.5 rounded-lg text-[12px] font-bold bg-violet-600 text-white disabled:opacity-40">{running ? '...' : 'Run'}</button>
                    </div>
                    {(trace.length > 0 || answer) && (
                      <div className={`relative mt-2 max-h-56 overflow-y-auto rounded-lg p-2 pr-8 text-[11px] leading-snug ${isDark ? 'bg-slate-950/60' : 'bg-slate-50'}`}>
                    {!running && (
                      <button onClick={() => { setTrace([]); setAnswer(null); setHot({}); }} title="Clear the log and the highlights"
                        className={`sticky top-0 float-right -mr-6 p-1 rounded-md ${isDark ? 'bg-slate-800 hover:bg-slate-700' : 'bg-white hover:bg-slate-100 border border-slate-200'}`}><Eraser size={13} /></button>
                    )}
                        {trace.map((t, i) => (
                          <div key={i} className="flex gap-1.5"><span className={`tabular-nums shrink-0 ${muted}`}>{(t.at / 1000).toFixed(1)}s</span><span>{t.label}</span></div>
                        ))}
                        {running && <div className={muted}>...</div>}
                        {answer && <div className={`mt-1.5 pt-1.5 border-t ${isDark ? 'border-white/10' : 'border-slate-200'}`}><b>Ims:</b> {answer}</div>}
                      </div>
                    )}
                    <div className={`text-[10px] mt-1 ${muted}`}>Tools that only read run for real; anything that would change something is shown, not done.</div>
                  </div>
                </div>
              </div>

              {place('services', '')}
            </div>
            <div className="order-3 lg:order-none flex-1 min-w-0 flex flex-col gap-3">
              {place('ai', '')}
              {place('connections', '')}
            </div>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-5">
          {/* supporting row - belongs to the whole system, so no connectors */}
          <button onClick={toggleSupport} className="lg:col-span-3 flex items-center gap-3 text-left">
            <span className={`text-[11px] font-black uppercase tracking-widest ${muted}`}>Across the whole system</span>
            <span className={`flex-1 h-px ${isDark ? 'bg-white/10' : 'bg-slate-200'}`} />
            <span className={`text-[11px] font-bold flex items-center gap-1 ${muted}`}>{supportOpen ? 'Hide' : 'Show'} <ChevronRight size={14} className={`transition-transform ${supportOpen ? '-rotate-90' : 'rotate-90'}`} /></span>
          </button>
          {supportOpen && supporting.map((c) => (
            <div key={c.key}><Card card={c} isDark={isDark} hot={hot} now={now} /></div>
          ))}
          </div>
        </div>

        {/* summary panel */}
        {!panelOpen && (
          <button onClick={togglePanel} title="Show the Ims panel" className={`${panelCls} shrink-0 w-full xl:w-11 xl:sticky xl:top-24 py-3 flex xl:flex-col items-center justify-center gap-2 font-bold text-[12px]`}>
            <ChevronRight size={16} className="rotate-180" /><span className="xl:[writing-mode:vertical-rl]">Ims - overview, conversation, data, findings</span>
          </button>
        )}
        {panelOpen && <aside ref={panelRef} className={`${panelCls} w-full xl:w-[440px] shrink-0 xl:sticky xl:top-24 relative`}>
          <button onClick={togglePanel} title="Hide the panel" className={`absolute top-3 right-3 p-1.5 rounded-lg ${isDark ? 'bg-white/10' : 'bg-slate-100'}`}><ChevronRight size={15} /></button>
          <div className="p-5 flex gap-4 items-start">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-fuchsia-500 to-violet-600 flex items-center justify-center shadow-[0_8px_24px_rgba(168,85,247,0.35)] shrink-0">
              <Smile size={32} className="text-white" />
            </div>
            <div className="min-w-0">
              <div className="text-xl font-black tracking-tight">Ims</div>
              <div className="flex flex-wrap gap-1.5 mt-1 text-[11px] font-bold">
                <span className={`px-2 py-0.5 rounded-md flex items-center gap-1 ${isDark ? 'bg-white/10' : 'bg-slate-100'}`}><GitBranch size={11} /> main</span>
                <span className="px-2 py-0.5 rounded-md bg-emerald-500/15 text-emerald-500 flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Active</span>
              </div>
              <div className={`text-[11px] mt-1.5 ${muted}`}>Voice assistant • Node + React + ESP32 • Gemini Live</div>
            </div>
          </div>

          <div className={`flex gap-5 px-5 border-b text-[13px] overflow-x-auto ${isDark ? 'border-white/10' : 'border-slate-200'}`}>
            {[['overview', 'Overview'], ['turn', 'A conversation'], ['data', 'Data'], ['findings', 'Findings']].map(([k, label]) => (
              <button key={k} onClick={() => setTab(k)}
                className={`pb-2.5 whitespace-nowrap border-b-2 -mb-px ${tab === k ? 'border-violet-500 text-violet-500 font-bold' : `border-transparent ${muted}`}`}>{label}</button>
            ))}
          </div>

          <div className="p-5 flex flex-col gap-5">
            {tab === 'overview' && (
              <>
                <section>
                  <h3 className="font-bold mb-2">Key information</h3>
                  <dl className="grid grid-cols-[120px_1fr] gap-y-1.5 text-[12.5px]">
                    {[
                      ['Owner', 'Simon Philpott'],
                      ['Assistant', 'Ims - rhymes with rims'],
                      ['Persona', 'West Yorkshire, dry and friendly'],
                      ['Voice model', 'gemini-3.8-live, en-GB'],
                      ['Backend', `Node.js ${live?.node || ''} / Express on :3001`],
                      ['Frontend', 'React 19 + Vite, via ngrok'],
                      ['Device', 'ESP32-S3-BOX-3 over TCP :3002'],
                      ['Database', `SQLite, ${live?.tables ?? '...'} tables`],
                      ['Repository', 'SimonPhilpott/Information-management-system'],
                    ].map(([k, v]) => (
                      <React.Fragment key={k}><dt className={muted}>{k}</dt><dd className="font-medium break-words">{v}</dd></React.Fragment>
                    ))}
                  </dl>
                </section>

                <section className="grid grid-cols-4 gap-2">
                  {[
                    [Wrench, 35, 'Voice tools', 'violet'],
                    [Boxes, 23, 'Hub pages', 'indigo'],
                    [Plug, 16, 'Connections', 'orange'],
                    [Database, live?.tables ?? '...', 'Tables', 'red'],
                  ].map(([Icon, n, label, acc]) => (
                    <div key={label} className={`rounded-xl p-2.5 ${ACCENTS[acc].badge}`}>
                      <Icon size={16} className={ACCENTS[acc].text} />
                      <div className="text-lg font-black mt-1 leading-none">{n}</div>
                      <div className={`text-[10.5px] mt-1 ${muted}`}>{label}</div>
                    </div>
                  ))}
                </section>

                <section>
                  <h3 className="font-bold mb-2">Live now</h3>
                  <div className={`grid grid-cols-2 gap-x-4 gap-y-1 text-[12.5px] ${muted}`}>
                    <span>News sources: <b className={isDark ? 'text-slate-100' : 'text-slate-900'}>{live?.newsSources ?? '...'}</b></span>
                    <span>Birthdays: <b className={isDark ? 'text-slate-100' : 'text-slate-900'}>{live?.birthdays ?? '...'}</b></span>
                    <span>Tasks: <b className={isDark ? 'text-slate-100' : 'text-slate-900'}>{live?.tasks ?? '...'}</b></span>
                    <span>Scheduled items: <b className={isDark ? 'text-slate-100' : 'text-slate-900'}>{live?.scheduled ?? '...'}</b></span>
                  </div>
                </section>

                <section>
                  <h3 className="font-bold mb-2">Settings</h3>
                  <div className="grid grid-cols-2 gap-2">
                    {ACTIONS.map((ac) => {
                      const Icon = ac.icon;
                      return (
                        <button key={ac.path} onClick={() => go(ac.path)} className={`rounded-xl p-3 flex items-center gap-3 text-left border ${ACCENTS[ac.accent].badge} ${isDark ? 'border-white/5' : 'border-transparent'} hover:brightness-95`}>
                          <Icon size={18} className={ACCENTS[ac.accent].text} />
                          <span className="min-w-0">
                            <span className="block text-[12.5px] font-bold leading-tight">{ac.title}</span>
                            <span className={`block text-[11px] ${muted}`}>{ac.sub}</span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </section>

                <section>
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="font-bold">Findings</h3>
                    <span className="px-2 py-0.5 rounded-lg bg-rose-500/10 text-rose-500 text-[11px] font-bold flex items-center gap-1"><AlertTriangle size={12} /> {FINDINGS.filter((f) => f.level === 'warn').length} to watch</span>
                    <button onClick={() => setTab('findings')} className={`ml-auto px-2.5 py-1 rounded-lg border text-[11px] font-bold ${isDark ? 'border-white/10' : 'border-slate-200'}`}>View all</button>
                  </div>
                  <Findings list={FINDINGS.filter((f) => f.level === 'warn')} muted={muted} />
                </section>
              </>
            )}

            {tab === 'turn' && (
              <ol className="flex flex-col gap-4">
                {TURN.map(([title, text], i) => (
                  <li key={title} className="flex gap-3">
                    <span className="w-7 h-7 rounded-full bg-emerald-500/15 text-emerald-500 text-xs font-black flex items-center justify-center shrink-0">{i + 1}</span>
                    <div>
                      <div className="font-bold text-[13.5px]">{title}</div>
                      <div className={`text-[12.5px] leading-relaxed ${muted}`}>{text}</div>
                    </div>
                  </li>
                ))}
              </ol>
            )}

            {tab === 'data' && (
              <div className="flex flex-col gap-3">
                <p className={`text-[12.5px] ${muted}`}>One SQLite file (data/app.db) holds everything, beside the PDF files, recordings and the vector index. Tables by area:</p>
                {DATA_GROUPS.map(([area, tables]) => (
                  <div key={area}>
                    <div className="font-bold text-[13px] mb-1">{area}</div>
                    <div className="flex flex-wrap gap-1">
                      {tables.split(', ').map((t) => <code key={t} className={`px-1.5 py-0.5 rounded text-[11px] ${isDark ? 'bg-white/5' : 'bg-slate-100'}`}>{t}</code>)}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {tab === 'findings' && <Findings list={FINDINGS} muted={muted} />}
          </div>
        </aside>}
      </div>
    </PortalShell>
  );
}

function Findings({ list, muted }) {
  return (
    <div className="flex flex-col gap-3">
      {list.map((f) => (
        <div key={f.title} className="flex items-start gap-3">
          {f.level === 'warn' ? <AlertTriangle size={20} className="text-rose-500 shrink-0 mt-0.5" /> : <Info size={20} className="text-sky-500 shrink-0 mt-0.5" />}
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-semibold">{f.title}</div>
            <div className={`text-[12px] ${muted}`}>{f.sub}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
