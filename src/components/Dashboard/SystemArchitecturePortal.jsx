import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  Network, Users, User, KeyRound, ShieldCheck, Monitor, Smartphone, Globe, BookOpen, Cpu, Sparkles, Bot,
  Waves, Mic, Wrench, Gauge, Hand, Moon, Plug, CalendarDays, HardDrive, Droplets, Syringe, Activity, Route,
  CloudSun, Apple, Music, Dices, Rss, Database, Layers, FileText, Lock, Settings, Boxes, Server, Code,
  Terminal, GitBranch, Clock, Timer, RefreshCw, Scale, ChevronRight, AlertTriangle, Info, Smile, Drama,
  MessageSquareQuote, Wifi, Newspaper, Heart, Radio, Speaker, Cake, Bell, ListChecks, Eye, Maximize2, Minimize2, Eraser,
  UserPlus, Mail, ClipboardCopy, X, Check, Filter, Download, Printer, Search, Play, Loader2, CheckCircle2,
  Trash2, Camera, Volume2, Sliders,
} from 'lucide-react';
import PortalShell from './PortalShell';
import ImsFace from '../Ims/ImsFace';
import { useSystemEvents } from '../../hooks/useSystemEvents';

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
      { icon: Users, main: 'Invited guests', sub: 'Daniel - the Campaign Manager only, with a basic Google sign-in', action: 'invite' },
      { icon: KeyRound, main: 'Google sign-in (OAuth)', sub: 'Basic sign-in for all; Drive and Calendar scopes for the owner only' },
      { icon: ShieldCheck, main: 'Session check on everything', sub: 'Every /api route except sign-in, plus the live voice sockets' },
    ],
  },
  {
    key: 'clients', title: 'Clients', icon: Monitor, accent: 'blue', count: 4, side: 'bottom',
    rows: [
      { icon: Speaker, main: 'Desk terminal', sub: 'ESP32-S3-BOX-3 - raw TCP :3002, 16 kHz mic up, 24 kHz voice down' },
      { icon: Smile, main: 'Web app - Ims panel', sub: 'Same brain as the desk, over the /api/ims-live WebSocket' },
      { icon: BookOpen, main: 'Library chat and voice', sub: 'Deep research over your PDFs - /api/chat and /api/live' },
      { icon: Smartphone, main: 'Phone and away from home', sub: 'Installable as an app (or in the browser) through the ngrok tunnel' },
    ],
  },
  {
    key: 'ai', title: 'AI models', icon: Sparkles, accent: 'violet', count: 7, side: 'left',
    rows: [
      { icon: Waves, main: 'gemini-3.8-live', sub: 'Real-time voice: en-GB speech, live transcripts, session resumption' },
      { icon: Bot, main: 'gemini-2.5-flash', sub: 'Tasks, deck insights, chronicles, rulebook AI scanner & comparative research reviews, report and test prompts' },
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
      { icon: Drama, main: 'Persona and context', sub: 'Active persona (character, accent, voice), house rules, services, memories' },
      { icon: Wrench, main: '35 function tools', sub: 'Run on the server - calendar, glucose, carbs, lists, news, campaigns...' },
      { icon: Gauge, main: 'Audio pacing', sub: 'A 15 s lead buffer, so speech never speeds up' },
      { icon: MessageSquareQuote, main: 'Stop phrases', sub: '"Ims stop" halts speech and silences a ringing alarm' },
      { icon: Moon, main: '15 s of silence', sub: 'Closes the Gemini session to keep costs down' },
    ],
  },
  {
    key: 'connections', title: 'External connections', icon: Plug, accent: 'orange', count: 21, side: 'left',
    rows: [
      { icon: Bell, main: 'Ring Doorbell (Direct API)', sub: 'ring-client-api 2FA session, live SIP/WebSocket dings & motion' },
      { icon: CalendarDays, main: 'Google Calendar', sub: 'Events and rules, synced every 5 minutes' },
      { icon: HardDrive, main: 'Google Drive', sub: 'Source of the PDF library' },
      { icon: Droplets, main: 'Nightscout (Heroku + MongoDB)', sub: 'Glucose every minute; carbs posted as Meal Bolus' },
      { icon: Syringe, main: 'AndroidAPS', sub: 'Picks up carbs from Nightscout - insulin is never sent' },
      { icon: Activity, main: 'Strava', sub: 'Activities, synced every 30 minutes' },
      { icon: Route, main: 'Komoot', sub: 'Saved routes and turn-by-turn directions for the run planner and route finder; switchable account; synced at 10pm on run days' },
      { icon: Globe, main: 'OpenStreetMap', sub: 'Map tiles for routes, and Nominatim road names for GPX route descriptions' },
      { icon: CloudSun, main: 'Open-Meteo', sub: 'Hourly forecasts 16 days ahead for home and saved places; 10 years of history for "unusual for the time of year"' },
      { icon: Apple, main: 'Open Food Facts', sub: 'Carb look-ups when you log food' },
      { icon: GitBranch, main: 'GitHub (Personal & TurnTown)', sub: 'Personal (@SimonPhilpott) & Work (@simon-philpott-turntown) repos; selective scan and code pattern extraction' },
      { icon: Music, main: 'MusicBrainz', sub: 'Nightly scan of new releases from your artists' },
      { icon: Dices, main: 'BoardGameGeek', sub: 'Your collection (CSV export until API access) and want-to-sell list' },
      { icon: Layers, main: 'RingsDB', sub: 'LOTR LCG cards, scenarios and deck import' },
      { icon: BookOpen, main: 'Hall of Beorn', sub: 'LOTR LCG encounter cards and boons/burdens' },
      { icon: Layers, main: 'ArkhamDB', sub: 'Arkham Horror LCG cards, investigators and deck import' },
      { icon: FileText, main: 'Fantasy Flight Games', sub: 'Official LOTR and Arkham rulebooks and campaign guides' },
      { icon: Rss, main: 'News feeds', sub: `${live?.newsSources ?? 13} sources - BBC, Nature, NASA, metal and tour feeds` },
      { icon: Globe, main: 'ngrok', sub: 'Public HTTPS tunnel - simon-ims.ngrok-free.app' },
      { icon: Boxes, main: 'npm registry', sub: 'Weekly npm audit and npm outdated for IMS and the scanned repos' },
    ],
  },
  {
    key: 'data', title: 'Data stores', icon: Database, accent: 'red', count: 6, side: 'right',
    rows: [
      { icon: Database, main: 'SQLite - app.db', sub: `${live?.tables ?? 63} tables: memories, birthdays, carbs, tasks, campaigns, decks, doorbell_events...` },
      { icon: Layers, main: 'Vector index (HNSW)', sub: 'hnswlib over the embedded PDF passages' },
      { icon: BookOpen, main: 'Library databases', sub: 'Documents, topics, contents and validated answers' },
      { icon: FileText, main: 'Files', sub: 'PDFs, literature books, research notes, recordings, chronicle narration and art, maps, card data' },
      { icon: Lock, main: 'Sign-in sessions', sub: 'Stored in SQLite, so sign-in survives a restart' },
      { icon: Settings, main: 'Config files', sub: 'Wi-Fi networks (encrypted), board games, report state, weather history per place' },
    ],
  },
  {
    key: 'services', title: 'Services', icon: Boxes, accent: 'indigo', count: 31, side: 'top',
    rows: [
      { icon: Bell, main: 'Core functions - 10', sub: 'Weather, doorbell, alarms, timers, reminders (1d–2w look-ahead), birthdays, calendar, memories, recordings, tasks' },
      { icon: Heart, main: 'Personal - 6', sub: 'Day report, Code best practices (with dependency watch), music scanner, board games, campaigns, news' },
      { icon: Droplets, main: 'Health and fitness - 3', sub: 'Blood sugar (clinic AGP report), activities (training load), run planner (live run plan, route finder, retrospective) & T1D Rulebook' },
      { icon: Settings, main: 'Customisation and system - 11', sub: 'Device health, storage, model switcher, costs and budget, face designer, persona, wake phrases, Wi-Fi, dev ideas, backups, this page' },
      { icon: Eye, main: 'Camera and Vision - 2', sub: 'Look and Faces active - Logitech C270 stream, on-demand snapshots, and face recognition' },
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
      { icon: Route, main: '10pm on run days', sub: 'New Komoot saved routes imported and described when the calendar has a run that day' },
      { icon: ShieldCheck, main: 'Weekly', sub: 'Dependency and vulnerability watch (npm audit / outdated); dev idea per critical advisory' },
    ],
  },
  {
    key: 'rules', title: 'Guardrails', icon: Scale, accent: 'amber', count: 7,
    rows: [
      { icon: MessageSquareQuote, main: 'English, in the persona accent', sub: 'Never another language; accent from the active persona' },
      { icon: Hand, main: 'Never speaks unprompted', sub: 'Only answers when he is addressed' },
      { icon: Mic, main: 'Silent while recording', sub: 'No sound at all until you say stop' },
      { icon: Smile, main: 'Jokes', sub: 'Dark humour is fine; never racist or sexist' },
      { icon: Heart, main: 'Greetings stay light', sub: 'No glucose or running talk outside reports' },
      { icon: Syringe, main: 'No insulin', sub: 'Only carbs are ever sent to Nightscout' },
      { icon: CloudSun, main: 'Weather words match the forecast', sub: 'Graded rain, heat, cold and wind - drizzle is never "chucking it down"' },
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
  {
    key: 'hardware', title: 'Hardware subsystems', icon: Cpu, accent: 'blue', count: 6,
    rows: [
      { icon: Mic, main: 'ESP32-S3 Dual MEMS Microphone', sub: 'Dual ES7210 I2S ADC, 16 kHz 16-bit mono acoustic array with beamforming & AEC' },
      { icon: Camera, main: 'Logitech C270 HD Web Camera', sub: 'UVC MJPEG over ESP32 USB Host (D+/D- GPIO 19/20), 640x480 @ 15 fps' },
      { icon: Volume2, main: 'ESP32-S3 Speaker & Audio Amp', sub: 'ES8311 I2S DAC + NS4150 3W Class-D power amplifier, 24 kHz high-fidelity playback' },
      { icon: Monitor, main: '2.4" Colour LCD Display & Touch', sub: 'ST7789V 320x240 SPI display + FT6336U capacitive touch controller (LovyanGFX)' },
      { icon: Eye, main: 'Desk Presence & Gaze Sensor', sub: 'Biometric sit-down detection via YuNet face localization & C270 video stream' },
      { icon: Sliders, main: 'Physical Controls & Sensors', sub: 'Hardware mute switch, Boot/Reset tactiles, battery monitor & AXP2101 PMU' },
    ],
  },
];

const FINDINGS = [
  { level: 'info', title: 'Test prompts are safe', sub: 'The test box under Ims runs read-only tools for real; anything that would change something is shown but not done' },
  { level: 'info', title: 'Camera operational', sub: 'Logitech C270 USB host streaming at 640x480 MJPEG with real-time Look and Faces detection' },
  { level: 'warn', title: 'Fixed server address', sub: 'The desk terminal connects to 192.168.1.78 (include/config.h) - if the PC gets a new IP, it cannot connect' },
  { level: 'info', title: 'One host', sub: 'Backend, database and tunnel all run on one Windows PC - when it is off, Ims is offline everywhere. Everything is backed up nightly to Google Drive (/ims/backups)' },
  { level: 'info', title: 'Nightscout storage', sub: 'MongoDB free tier - usage shows on the desk screen; old data can be auto-cleared after 3 months' },
  { level: 'info', title: 'Phase 1 & 2 Live: Master Scheduler & Disaster Recovery', sub: 'Unified central scheduler governs background routines with concurrency locks; automated weekly SQLite PRAGMA integrity_check drills and 1-click restore operational (see docs/SYSTEM_ARCHITECTURE_PLAN.md)' },
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
  { icon: Camera, title: 'Look & Faces', sub: 'Webcam stream & biometrics', path: '/ims/look', accent: 'blue' },
  { icon: Droplets, title: 'Blood sugar', sub: 'Nightscout and carbs', path: '/ims/glucose', accent: 'red' },
  { icon: Newspaper, title: 'News sources', sub: 'Feeds and weighting', path: '/ims/news', accent: 'sky' },
  { icon: Smile, title: 'Face designer', sub: 'Faces and eyes', path: '/ims/facedesigner', accent: 'amber' },
  { icon: Wifi, title: 'Wi-Fi', sub: 'Desk terminal networks', path: '/ims/wifi', accent: 'blue' },
];

// hot: rows used by a test prompt - { 'card|row': { at, uses, pulse, reason } }. A row lights up in its card's colour
// when used and stays lit; one used again pulses while the prompt runs. They clear when the prompt is emptied.
const rowHot = (hot, card, main) => hot?.[`${card}|${main}`];
// The badge counts the card's own rows, so it can't drift from the list; Services counts its hub pages
// (the number at the end of each group) instead.
const countOf = (card) => (card.key === 'services' ? card.rows.reduce((n, r) => n + (Number((r.main.match(/(\d+)$/) || [])[1]) || 0), 0) : card.key === 'environment' ? null : card.rows.length);

// Helper to highlight matching text snippets
function HighlightText({ text, query, isDark }) {
  if (!text) return null;
  const q = (query || '').trim();
  if (!q) return <>{text}</>;
  const parts = String(text).split(new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'));
  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === q.toLowerCase() ? (
          <mark key={i} className="bg-amber-400 text-amber-950 font-bold px-0.5 rounded-[2px] shadow-sm">
            {part}
          </mark>
        ) : (
          <React.Fragment key={i}>{part}</React.Fragment>
        )
      )}
    </>
  );
}

// rowMatches: returns true if search query matches main, sub, tag, or card title
const rowMatchesQuery = (r, card, query) => {
  if (!query) return false;
  const q = query.toLowerCase();
  return (
    r.main?.toLowerCase().includes(q) ||
    r.sub?.toLowerCase().includes(q) ||
    r.tag?.toLowerCase().includes(q) ||
    card.title?.toLowerCase().includes(q)
  );
};

// cardMatchesQuery: returns true if any row or card title matches query
const cardMatchesQuery = (card, query) => {
  if (!query) return false;
  const q = query.toLowerCase();
  return card.title?.toLowerCase().includes(q) || card.rows.some((r) => rowMatchesQuery(r, card, query));
};

function Card({ card, isDark, cardRef, onOpen, onRowAction, hot, showUsedOnly, searchQuery }) {
  const a = ACCENTS[card.accent];
  const Icon = card.icon;
  const anyLit = card.rows.some((r) => Boolean(rowHot(hot, card.key, r.main)));
  const query = (searchQuery || '').trim().toLowerCase();
  const cardHasMatch = Boolean(query && cardMatchesQuery(card, query));

  const visibleRows = showUsedOnly ? card.rows.filter((r) => Boolean(rowHot(hot, card.key, r.main))) : card.rows;

  if (showUsedOnly && !anyLit) {
    return (
      <div ref={cardRef} className={`rounded-2xl border p-3 opacity-30 border-dashed transition-all ${isDark ? 'bg-slate-900/30 border-white/5' : 'bg-slate-50/50 border-slate-200'}`}>
        <div className="flex items-center gap-2 text-xs font-semibold text-slate-400">
          <Icon size={14} /> {card.title} (Not used)
        </div>
      </div>
    );
  }

  // Dim cards that don't match active search
  const isDimmed = Boolean(query && !cardHasMatch);

  return (
    <div ref={cardRef} className={`relative z-10 rounded-2xl border p-3.5 transition-all duration-300 ${isDimmed ? 'opacity-35 grayscale-[50%]' : ''} ${isDark ? 'bg-slate-900/80 border-white/10' : 'bg-white border-slate-200/80 shadow-[0_6px_24px_rgba(15,23,42,0.06)]'}`}
      style={cardHasMatch ? { boxShadow: '0 0 0 2px #f59e0b, 0 0 30px rgba(245, 158, 11, 0.45)', borderColor: '#f59e0b' } : anyLit ? { boxShadow: `0 0 0 2px ${a.line}, 0 0 26px ${a.line}66` } : undefined}>
      <button onClick={onOpen} disabled={!onOpen} title={onOpen ? 'More detail in the Ims panel' : undefined} className="w-full flex items-center gap-2.5 mb-2 text-left">
        <span className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${cardHasMatch ? 'bg-amber-500/20 text-amber-400' : a.badge}`}><Icon size={16} className={cardHasMatch ? 'text-amber-400' : a.text} /></span>
        <span className="font-bold text-[15px] flex-1 min-w-0 truncate">
          <HighlightText text={card.title} query={query} isDark={isDark} />
        </span>
        {cardHasMatch && (
          <span className="px-2 py-0.5 rounded-full text-[10.5px] font-black uppercase tracking-wider bg-amber-500/20 text-amber-300 border border-amber-500/40">
            Match
          </span>
        )}
        {countOf(card) != null && <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${isDark ? 'bg-white/10' : 'bg-slate-100'}`}>{visibleRows.length}/{countOf(card)}</span>}
      </button>
      <div className="flex flex-col gap-1">
        {visibleRows.map((r) => {
          const RowIcon = r.icon;
          const isActionable = Boolean(r.action && onRowAction);
          const h = rowHot(hot, card.key, r.main);
          const reason = h?.reason;
          const isRowMatch = Boolean(query && rowMatchesQuery(r, card, query));
          return (
            <div key={r.main}
              onClick={isActionable ? () => onRowAction(r.action) : undefined}
              className={`group/row relative flex items-start gap-2.5 rounded-md -mx-1.5 px-1.5 py-[3px] ${isActionable ? 'cursor-pointer hover:bg-white/5 transition-colors' : ''} ${h?.pulse ? 'arch-pulse' : ''} ${isRowMatch ? 'ring-1 ring-amber-400/80 bg-amber-500/15' : ''}`}
              style={{
                backgroundColor: isRowMatch ? 'rgba(245, 158, 11, 0.18)' : h ? `${a.line}35` : undefined,
                transition: 'background-color .3s ease-out, box-shadow .3s ease-out',
                '--pulse': `${a.line}66`,
              }}>
              <RowIcon size={16} className={`${isRowMatch ? 'text-amber-400' : a.text} mt-0.5 shrink-0`} />
              <div className="min-w-0 flex-1">
                <div className="text-[12.5px] font-semibold leading-tight flex items-center gap-2 flex-wrap">
                  <span>
                    <HighlightText text={r.main} query={query} isDark={isDark} />
                  </span>
                  {r.tag && <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${a.badge} ${a.text}`}><HighlightText text={r.tag} query={query} isDark={isDark} /></span>}
                  {isActionable && <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-purple-500/20 text-purple-400 hover:text-purple-300 flex items-center gap-1"><UserPlus size={10} /> Invite</span>}
                  {isRowMatch && (
                    <span className="px-1.5 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider bg-amber-500/25 text-amber-300 border border-amber-500/40">
                      Match
                    </span>
                  )}
                  {h && (
                    <span className="px-1.5 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                      Active
                    </span>
                  )}
                </div>
                <div className={`text-[11px] leading-tight ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                  <HighlightText text={r.sub} query={query} isDark={isDark} />
                </div>
              </div>

              {/* Rich hover tooltip explaining why this item was accessed */}
              {h && (
                <div className="pointer-events-none opacity-0 group-hover/row:opacity-100 transition-opacity duration-150 absolute bottom-full left-2 z-50 mb-1.5 w-64 p-2.5 rounded-xl text-[11px] leading-snug shadow-xl backdrop-blur-md border border-white/10 bg-slate-950/95 text-slate-100">
                  <div className="flex items-center gap-1.5 font-bold text-emerald-400 mb-1">
                    <Sparkles size={12} /> Reason for Access
                  </div>
                  <div className="text-slate-200">{reason || `Utilised during test prompt execution for ${r.main}.`}</div>
                  {h.uses > 1 && <div className="text-[9.5px] text-slate-400 mt-1">Called {h.uses} times</div>}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Rounded elbow connectors from each card's facing edge to the centre card, drawn over the grid.
// Utilises requestAnimationFrame throttling to prevent layout redraw flickering.
function Connectors({ wrapRef, centreRef, refs, cards }) {
  const [paths, setPaths] = useState([]);
  const rafId = useRef(null);

  const measure = useCallback(() => {
    if (rafId.current) cancelAnimationFrame(rafId.current);
    rafId.current = requestAnimationFrame(() => {
      const wrap = wrapRef.current, centre = centreRef.current;
      if (!wrap || !centre || getComputedStyle(wrap).display === 'none') return;
      // screen positions come back zoomed (Fit to screen); the svg draws in unzoomed units
      const scale = wrap.offsetWidth ? wrap.getBoundingClientRect().width / wrap.offsetWidth : 1;
      const box = (el) => {
        const r = el.getBoundingClientRect();
        return { left: r.left / scale, top: r.top / scale, right: r.right / scale, bottom: r.bottom / scale, width: r.width / scale, height: r.height / scale };
      };
      const W = box(wrap), C = box(centre);
      const cx = C.left + C.width / 2 - W.left, cy = C.top + C.height / 2 - W.top;
      const out = [];
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
    });
  }, [wrapRef, centreRef, refs, cards]);

  useLayoutEffect(() => {
    measure();
    const ro = new ResizeObserver(measure);
    for (const el of [wrapRef.current, centreRef.current, ...Object.values(refs.current)]) if (el) ro.observe(el);
    window.addEventListener('resize', measure);
    return () => {
      if (rafId.current) cancelAnimationFrame(rafId.current);
      ro.disconnect();
      window.removeEventListener('resize', measure);
    };
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

// Invite modal for sharing with Daniel Philpott or other guests
function ArchitectureInviteModal({ isOpen, onClose, isDark, toast }) {
  const [list, setList] = useState([]);
  const [signIns, setSignIns] = useState([]);
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/decks/invites');
      const d = await res.json();
      if (d.success) {
        setList(d.invites || []);
        setSignIns(d.signIns || []);
      }
    } catch (_) {}
  }, []);

  useEffect(() => {
    if (isOpen) load();
  }, [isOpen, load]);

  if (!isOpen) return null;

  const link = `${window.location.origin}/ims/architecture?invite=1`;

  const addInvite = async (targetEmail) => {
    const e = (targetEmail || email).trim();
    if (!e) return;
    setBusy(true);
    try {
      const res = await fetch('/api/decks/invites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: e }),
      });
      const d = await res.json();
      if (d.success) {
        setEmail('');
        load();
        if (toast) toast(`${d.invite.email} can now sign in.`);
      } else {
        if (toast) toast(d.error || 'Failed to send invite', 'error');
      }
    } catch (err) {
      if (toast) toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (e) => {
    if (!window.confirm(`Stop ${e} accessing IMS?`)) return;
    try {
      const res = await fetch(`/api/decks/invites/${encodeURIComponent(e)}`, { method: 'DELETE' });
      const d = await res.json();
      if (d.success) {
        load();
        if (toast) toast(`Access withdrawn for ${e}`);
      }
    } catch (err) {
      if (toast) toast(err.message, 'error');
    }
  };

  const copyLink = () => {
    navigator.clipboard.writeText(link).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      if (toast) toast('Invite link copied to clipboard.');
    });
  };

  const mailtoDaniel = (e = 'daniel.philpott@gmail.com') => `mailto:${e}?subject=${encodeURIComponent('Join my IMS (System Architecture)')}&body=${encodeURIComponent(`Hi Daniel,\n\nI've added you to IMS. Open this link and sign in with your Google account (${e}):\n\n${link}\n\nYou'll get instant access to the System Architecture interactive map, service dependencies, tools, and technical specifications.\n\nCheers,\nSimon`)}`;

  const isDanielInvited = list.some((x) => x.email?.toLowerCase().includes('daniel') && !x.revokedAt);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className={`relative w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-3xl border p-6 shadow-2xl ${isDark ? 'bg-slate-900 border-white/10 text-slate-100' : 'bg-white border-slate-200 text-slate-900'}`}>
        <button onClick={onClose} className={`absolute top-5 right-5 p-2 rounded-xl transition-colors ${isDark ? 'bg-white/5 hover:bg-white/10 text-slate-400' : 'bg-slate-100 hover:bg-slate-200 text-slate-600'}`}>
          <X size={18} />
        </button>

        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-2xl bg-purple-500/15 flex items-center justify-center text-purple-400">
            <UserPlus size={20} />
          </div>
          <div>
            <h2 className="text-lg font-black tracking-tight">Invite & Access Management</h2>
            <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Share IMS System Architecture with guests via basic Google sign-in</p>
          </div>
        </div>

        {/* Quick invite preset for Daniel Philpott */}
        <div className={`p-4 rounded-2xl border mb-5 ${isDark ? 'bg-purple-950/20 border-purple-500/20' : 'bg-purple-50 border-purple-200'}`}>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <div className="text-sm font-bold flex items-center gap-1.5 text-purple-400">
                <User size={15} /> Daniel Philpott
              </div>
              <div className={`text-xs mt-0.5 ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                {isDanielInvited ? 'Active guest access granted' : 'Quick one-click invite for your brother'}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <a href={mailtoDaniel()} className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 ${isDark ? 'bg-purple-500/20 hover:bg-purple-500/30 text-purple-300' : 'bg-purple-100 hover:bg-purple-200 text-purple-800'}`}>
                <Mail size={13} /> Email Daniel
              </a>
              {!isDanielInvited && (
                <button onClick={() => addInvite('daniel.philpott@gmail.com')} disabled={busy} className="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-purple-600 hover:bg-purple-500 text-white flex items-center gap-1">
                  <UserPlus size={13} /> Grant Access
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Add standard email invite */}
        <div className="mb-5">
          <label className={`block text-xs font-bold uppercase tracking-wider mb-2 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Invite by Email</label>
          <div className="flex gap-2">
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addInvite()} placeholder="guest.email@gmail.com"
              className={`flex-1 min-w-0 px-3.5 py-2.5 rounded-xl text-sm outline-none border transition-colors ${isDark ? 'bg-slate-950/60 border-white/10 focus:border-purple-500' : 'bg-slate-50 border-slate-200 focus:border-purple-500'}`} />
            <button onClick={() => addInvite()} disabled={busy || !email.trim()} className="px-4 py-2.5 rounded-xl text-sm font-bold bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white flex items-center gap-1.5 disabled:opacity-40 shrink-0">
              <UserPlus size={15} /> Invite
            </button>
          </div>
          <div className="flex items-center justify-between gap-3 mt-3 pt-3 border-t border-white/5">
            <span className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Invite link: <code className="text-[11px] opacity-80">{link}</code></span>
            <button onClick={copyLink} className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 ${isDark ? 'bg-white/5 hover:bg-white/10' : 'bg-slate-100 hover:bg-slate-200'}`}>
              {copied ? <Check size={13} className="text-emerald-400" /> : <ClipboardCopy size={13} />} {copied ? 'Copied' : 'Copy link'}
            </button>
          </div>
        </div>

        {/* Invited guests list */}
        {list.length > 0 && (
          <div className="mb-5">
            <h3 className={`text-xs font-bold uppercase tracking-wider mb-2 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Active & Past Guests ({list.length})</h3>
            <div className="flex flex-col gap-2 max-h-48 overflow-y-auto pr-1">
              {list.map((x) => (
                <div key={x.email} className={`rounded-xl border p-3 flex flex-wrap items-center justify-between gap-2 ${isDark ? 'bg-slate-950/40 border-white/5' : 'bg-slate-50 border-slate-200'} ${x.revokedAt ? 'opacity-50' : ''}`}>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold flex items-center gap-2">
                      <span className="truncate">{x.name || x.email}</span>
                      {x.name && <span className={`text-xs font-normal ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>({x.email})</span>}
                    </div>
                    <div className={`text-[11px] mt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                      {x.revokedAt ? 'Access revoked' : x.lastSignInAt ? `Last active: ${new Date(x.lastSignInAt).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' })}` : 'Invited (pending sign-in)'} · {x.decks || 0} decks
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {!x.revokedAt ? (
                      <>
                        <a href={`mailto:${x.email}?subject=${encodeURIComponent('IMS Access')}&body=${encodeURIComponent(`Here is your invite link: ${link}`)}`} className={`p-1.5 rounded-lg ${isDark ? 'bg-white/5 hover:bg-white/10 text-slate-300' : 'bg-slate-200 hover:bg-slate-300 text-slate-700'}`} title="Email invite">
                          <Mail size={13} />
                        </a>
                        <button onClick={() => revoke(x.email)} className="px-2.5 py-1 rounded-lg text-xs font-bold text-rose-500 hover:bg-rose-500/10">Withdraw</button>
                      </>
                    ) : (
                      <button onClick={() => addInvite(x.email)} className={`px-2.5 py-1 rounded-lg text-xs font-bold ${isDark ? 'bg-white/10 hover:bg-white/20' : 'bg-slate-200 hover:bg-slate-300'}`}>Re-invite</button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Recent sign-in attempts */}
        {signIns.length > 0 && (
          <div className="pt-3 border-t border-white/5">
            <div className="flex items-center justify-between mb-1.5">
              <span className={`text-[11px] font-bold uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Recent Sign-In Telemetry</span>
              <button onClick={load} className={`p-1 rounded text-xs ${isDark ? 'hover:bg-white/10' : 'hover:bg-slate-100'}`} title="Refresh"><RefreshCw size={11} /></button>
            </div>
            <div className="flex flex-col gap-1 max-h-28 overflow-y-auto">
              {signIns.slice(0, 5).map((s, i) => (
                <div key={i} className="text-xs flex items-center justify-between gap-2 py-0.5">
                  <span className={`truncate ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{s.email || '(unknown)'}</span>
                  <span className={`font-bold ${s.outcome === 'signed-in' ? 'text-emerald-500' : 'text-rose-500'}`}>{s.outcome}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function SystemArchitecturePortal({ theme = 'dark', onThemeToggle, setCurrentPath }) {
  const isDark = theme === 'dark';
  const [live, setLive] = useState(null);
  const [tab, setTab] = useState('overview');
  const saved = (k, d) => { try { const v = localStorage.getItem(k); return v === null ? d : v === '1'; } catch { return d; } };
  const [panelOpen, setPanelOpen] = useState(() => saved('archPanel', true));
  const [supportOpen, setSupportOpen] = useState(() => saved('archSupport', true));
  const keep = (k, v) => { try { localStorage.setItem(k, v ? '1' : '0'); } catch { /* fine */ } };
  const togglePanel = () => setPanelOpen((v) => { keep('archPanel', !v); return !v; });
  const toggleSupport = () => setSupportOpen((v) => { keep('archSupport', !v); return !v; });

  const preFullscreenPanelRef = useRef(panelOpen);
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState(null);
  const toast = useCallback((msg, type = 'success') => {
    setToastMessage({ msg, type });
    setTimeout(() => setToastMessage(null), 3500);
  }, []);

  // Filter option: show only components and services used by the test prompt
  const [showUsedOnly, setShowUsedOnly] = useState(false);

  // Search option: highlight any component, tool, connection, data store, or text matching query
  const [searchQuery, setSearchQuery] = useState('');
  const searchInputRef = useRef(null);

  // Keyboard shortcut: '/' or 'Ctrl+K' focuses search, 'Escape' clears search
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.key === '/' || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k')) && document.activeElement !== searchInputRef.current && document.activeElement?.tagName !== 'INPUT') {
        e.preventDefault();
        searchInputRef.current?.focus();
      } else if (e.key === 'Escape' && searchQuery) {
        setSearchQuery('');
        searchInputRef.current?.blur();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [searchQuery]);

  // Count total matches across all spokes and supporting cards
  const allCards = useMemo(() => [...spokes(live), ...supporting], [live]);
  const searchMatchesCount = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return 0;
    let count = 0;
    for (const card of allCards) {
      if (card.title?.toLowerCase().includes(q)) count++;
      for (const row of card.rows) {
        if (rowMatchesQuery(row, card, q)) count++;
      }
    }
    return count;
  }, [allCards, searchQuery]);

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
    for (const item of rows || []) {
      const cardKey = Array.isArray(item) ? item[0] : item?.cardKey;
      const name = Array.isArray(item) ? item[1] : item?.name;
      const reason = Array.isArray(item) ? item[2] : item?.reason;
      const card = [...spokes(null), ...supporting].find((c) => c.key === cardKey);
      const group = (t) => String(t).replace(/\s*-\s*\d+$/, '').toLowerCase(); // "Core functions - 9" -> "core functions"
      const row = card?.rows.find((r) => r.main === name) || card?.rows.find((r) => r.main.toLowerCase().includes(String(name).toLowerCase()))
        || card?.rows.find((r) => group(r.main) === group(name));
      if (row) {
        out.push({ key: `${cardKey}|${row.main}`, reason });
      }
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
            const matched = matchRows(ev.rows);
            setHot((h) => {
              const n = { ...h };
              for (const { key, reason } of matched) {
                n[key] = {
                  at: Date.now(),
                  uses: (n[key]?.uses || 0) + 1,
                  pulse: (n[key]?.uses || 0) >= 1,
                  reason: reason || ev.reason || n[key]?.reason,
                };
              }
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

  // Save as PDF / Print snapshot action
  const handleSaveAsPdf = () => {
    window.print();
  };

  // Fit to screen: the view goes full screen and is zoomed down until all of it fits
  const fitRef = useRef(null);
  const [fitted, setFitted] = useState(false);
  const [zoom, setZoom] = useState(1);
  const fit = useCallback(() => {
    const el = fitRef.current;
    if (!el) return;
    let z = 1;
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
    const onChange = () => {
      const on = document.fullscreenElement === fitRef.current;
      setFitted(on);
      if (on) {
        preFullscreenPanelRef.current = panelOpen;
        setPanelOpen(false);
      } else {
        setZoom(1);
        setPanelOpen(preFullscreenPanelRef.current);
      }
    };
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, [panelOpen]);

  useEffect(() => {
    if (!fitted) return undefined;
    const t = setTimeout(fit, 120);
    window.addEventListener('resize', fit);
    return () => { clearTimeout(t); window.removeEventListener('resize', fit); };
  }, [fitted, fit, panelOpen, supportOpen, trace.length, answer, showUsedOnly]);

  const toggleFit = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await fitRef.current?.requestFullscreen();
    } catch (_) {}
  };

  const wrapRef = useRef(null), centreRef = useRef(null), cardRefs = useRef({}), panelRef = useRef(null);

  useEffect(() => {
    const fetchArch = () => {
      fetch('/api/system/architecture').then((r) => r.json()).then((d) => { if (d.success) setLive(d); }).catch(() => {});
    };
    fetchArch();
    const iv = setInterval(fetchArch, 4000);
    return () => clearInterval(iv);
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

  const handleRowAction = (action) => {
    if (action === 'invite') setInviteModalOpen(true);
  };

  // Merges test-prompt highlights with active live hardware operations
  const effectiveHot = useMemo(() => {
    const result = { ...hot };
    // Camera streaming live right now
    if (live?.cameraStreaming || live?.hardware?.camera?.streaming) {
      const k = 'hardware|Logitech C270 HD Web Camera';
      if (!result[k]) {
        result[k] = { at: Date.now(), uses: 1, pulse: true, reason: 'Live 640x480 MJPEG video streaming active over USB host' };
      }
    }
    // Desk terminal connected and microphone active
    if (live?.hardware?.mic?.active) {
      const k = 'hardware|ESP32-S3 Dual MEMS Microphone';
      if (!result[k]) {
        result[k] = { at: Date.now(), uses: 1, pulse: false, reason: 'Active 16 kHz PCM stream from desk terminal' };
      }
    }
    // Presence tracking active
    if (live?.hardware?.presence?.active) {
      const k = 'hardware|Desk Presence & Gaze Sensor';
      if (!result[k]) {
        result[k] = { at: Date.now(), uses: 1, pulse: false, reason: 'Real-time face presence tracking active on webcam feed' };
      }
    }
    // Display active
    if (live?.hardware?.display?.active) {
      const k = 'hardware|2.4" Colour LCD Display & Touch';
      if (!result[k]) {
        result[k] = { at: Date.now(), uses: 1, pulse: false, reason: 'Active 320x240 ST7789 display rendering face & live dashboard' };
      }
    }
    // Speaker active
    if (live?.hardware?.speaker?.active) {
      const k = 'hardware|ESP32-S3 Speaker & Audio Amp';
      if (!result[k]) {
        result[k] = { at: Date.now(), uses: 1, pulse: true, reason: '24 kHz DAC audio playback active over NS4150 amplifier' };
      }
    }
    return result;
  }, [hot, live]);

  const place = (key, cls) => (
    <div className={cls}>
      <Card card={byKey[key]} isDark={isDark} hot={effectiveHot} cardRef={(el) => { cardRefs.current[key] = el; }}
        showUsedOnly={showUsedOnly}
        searchQuery={searchQuery}
        onOpen={() => openTab(key === 'data' ? 'data' : key === 'pipeline' ? 'turn' : 'overview')}
        onRowAction={handleRowAction} />
    </div>
  );

  const litCount = Object.keys(effectiveHot).length;

  return (
    <PortalShell title="System Architecture" subtitle="/ims/architecture • how Ims is built and how it all connects"
      icon={Network} gradient="from-fuchsia-500 to-violet-600" glow="rgba(168,85,247,0.3)"
      isDark={isDark} onThemeToggle={onThemeToggle} setCurrentPath={setCurrentPath} maxWidth="max-w-[2200px]"
      notification={toastMessage}>
      <style>{`
        @keyframes archPulse { 0%, 100% { box-shadow: 0 0 0 0 var(--pulse); } 50% { box-shadow: 0 0 0 5px transparent; filter: brightness(1.15); } }
        .arch-pulse { animation: archPulse 1s ease-in-out infinite; }
        @media print {
          body { background: white !important; color: black !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .no-print, header, aside, .portal-nav, button { display: none !important; }
          .print-full { width: 100% !important; max-width: 100% !important; margin: 0 !important; padding: 0 !important; }
        }
      `}</style>
      <div className="no-print flex flex-wrap justify-between items-center gap-2 -mt-2 mb-3">
        <div className="flex items-center gap-2 flex-wrap flex-1 min-w-0 max-w-2xl">
          {/* Interactive Search Bar */}
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-all ${searchQuery ? 'border-amber-500/70 shadow-[0_0_12px_rgba(245,158,11,0.2)] bg-amber-500/10' : isDark ? 'bg-white/5 border-white/10 text-slate-300 focus-within:border-violet-500' : 'bg-white border-slate-200 text-slate-700 focus-within:border-violet-500 shadow-sm'}`}>
              <Search size={14} className={searchQuery ? 'text-amber-400 shrink-0' : 'text-slate-400 shrink-0'} />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search architecture components (Press '/' to focus)..."
                className="w-full bg-transparent outline-none text-xs placeholder:text-slate-400 text-inherit"
              />
              {searchQuery && (
                <div className="flex items-center gap-1 shrink-0">
                  <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">
                    {searchMatchesCount} {searchMatchesCount === 1 ? 'match' : 'matches'}
                  </span>
                  <button
                    onClick={() => { setSearchQuery(''); searchInputRef.current?.focus(); }}
                    className="p-0.5 rounded-md hover:bg-white/10 text-slate-400 hover:text-slate-200"
                    title="Clear search (Esc)">
                    <X size={13} />
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Show only used filter checkbox */}
          <label className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors cursor-pointer shrink-0 ${showUsedOnly ? 'bg-violet-600 border-violet-500 text-white shadow-sm' : isDark ? 'bg-white/5 border-white/10 text-slate-300 hover:bg-white/10' : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'}`}>
            <input
              type="checkbox"
              checked={showUsedOnly}
              onChange={(e) => setShowUsedOnly(e.target.checked)}
              className="rounded accent-violet-600 text-white w-3.5 h-3.5"
            />
            <span className="flex items-center gap-1.5">
              <Filter size={13} /> Show only used items
              {litCount > 0 && <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] bg-white/20">{litCount}</span>}
            </span>
          </label>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {/* Save as PDF / Snapshot button */}
          <button onClick={handleSaveAsPdf} title="Save current system architecture as PDF snapshot"
            className={`px-3 py-1.5 rounded-lg text-[12px] font-bold flex items-center gap-1.5 border transition-colors ${isDark ? 'border-sky-500/30 bg-sky-500/10 text-sky-300 hover:bg-sky-500/20' : 'border-sky-200 bg-sky-50 text-sky-800 hover:bg-sky-100'}`}>
            <Download size={14} /> Save as PDF
          </button>
          <button onClick={() => setInviteModalOpen(true)} className={`px-3 py-1.5 rounded-lg text-[12px] font-bold flex items-center gap-1.5 border ${isDark ? 'border-purple-500/30 bg-purple-500/10 text-purple-300 hover:bg-purple-500/20' : 'border-purple-200 bg-purple-50 text-purple-800 hover:bg-purple-100'}`}>
            <UserPlus size={14} /> Invite & Guests
          </button>
          <button onClick={toggleFit} className={`px-3 py-1.5 rounded-lg text-[12px] font-bold flex items-center gap-1.5 border ${isDark ? 'border-white/10 bg-white/5 hover:bg-white/10' : 'border-slate-200 bg-white hover:bg-slate-50'}`}>
            <Maximize2 size={14} /> Fit to screen
          </button>
        </div>
      </div>

      <div ref={fitRef} className={`print-full flex flex-col xl:flex-row gap-6 items-start ${fitted ? `overflow-hidden p-2 ${isDark ? 'bg-[#030712] text-slate-100' : 'bg-[#F4F1EC] text-slate-900'}` : ''}`}
        style={fitted ? { zoom } : undefined}>
        {fitted && (
          <button onClick={toggleFit} title="Leave full screen (Esc)" className={`no-print fixed top-3 right-3 z-50 px-3 py-1.5 rounded-lg text-[12px] font-bold flex items-center gap-1.5 border ${isDark ? 'border-white/10 bg-slate-800' : 'border-slate-200 bg-white'}`}
            style={{ zoom: 1 / zoom }}><Minimize2 size={14} /> Exit full screen</button>
        )}
        {/* the map */}
        <div ref={wrapRef} className="relative flex-1 min-w-0 w-full">
          {!showUsedOnly && <Connectors wrapRef={wrapRef} centreRef={centreRef} refs={cardRefs} cards={cards} />}
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
                  <div className={`text-xs mt-1 ${muted}`}>Voice assistant with switchable personas - desk, web and phone</div>
                  <div className="mt-3 flex items-center justify-center gap-2 text-[11px] font-bold">
                    <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-500 flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Server up {formatUptime(live?.uptimeSec)}</span>
                    <span className={`px-2 py-0.5 rounded-full flex items-center gap-1 ${online ? 'bg-emerald-500/15 text-emerald-500' : 'bg-slate-500/15 text-slate-500'}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${online ? 'bg-emerald-500' : 'bg-slate-400'}`} /> Desk {live ? (online ? 'connected' : 'offline') : '...'}
                    </span>
                  </div>
                  {/* test prompt: watch it run through the system */}
                  <div className="mt-4 text-left">
                    <div className="flex items-center justify-between mb-1">
                      <div className={`text-[11px] font-black uppercase tracking-wider ${muted}`}>Test a prompt</div>
                      {litCount > 0 && (
                        <span className="text-[10.5px] font-bold text-violet-400 flex items-center gap-1">
                          <Sparkles size={11} /> {litCount} active {litCount === 1 ? 'item' : 'items'}
                        </span>
                      )}
                    </div>
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
                    <div className={`text-[10px] mt-1 ${muted}`}>Hover over highlighted items to inspect why they were accessed.</div>
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
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mt-5">
            {/* supporting row - belongs to the whole system, so no connectors */}
            <button onClick={toggleSupport} className="no-print md:col-span-2 lg:col-span-4 flex items-center gap-3 text-left">
              <span className={`text-[11px] font-black uppercase tracking-widest ${muted}`}>Across the whole system</span>
              <span className={`flex-1 h-px ${isDark ? 'bg-white/10' : 'bg-slate-200'}`} />
              <span className={`text-[11px] font-bold flex items-center gap-1 ${muted}`}>{supportOpen ? 'Hide' : 'Show'} <ChevronRight size={14} className={`transition-transform ${supportOpen ? '-rotate-90' : 'rotate-90'}`} /></span>
            </button>
            {supportOpen && supporting.map((c) => (
              <div key={c.key}><Card card={c} isDark={isDark} hot={effectiveHot} showUsedOnly={showUsedOnly} searchQuery={searchQuery} onOpen={() => openTab(c.key === 'hardware' ? 'hardware' : c.key === 'jobs' ? 'jobs' : 'overview')} onRowAction={handleRowAction} /></div>
            ))}
          </div>
        </div>

        {/* summary panel */}
        {!panelOpen && (
          <button onClick={togglePanel} title="Show the Ims panel" className={`no-print ${panelCls} shrink-0 w-full xl:w-11 xl:sticky xl:top-24 py-3 flex xl:flex-col items-center justify-center gap-2 font-bold text-[12px]`}>
            <ChevronRight size={16} className="rotate-180" /><span className="xl:[writing-mode:vertical-rl]">Ims - overview, conversation, data, findings</span>
          </button>
        )}
        {panelOpen && <aside ref={panelRef} className={`no-print ${panelCls} w-full xl:w-[440px] shrink-0 xl:sticky xl:top-24 relative`}>
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

          <TabSlider isDark={isDark} active={tab}>
            {[['overview', 'Overview'], ['hardware', 'Hardware'], ['jobs', 'Background Jobs'], ['logs', 'Logs Explorer'], ['turn', 'A conversation'], ['latency', 'Voice Latency & Tools'], ['data', 'Data'], ['findings', 'Findings']].map(([k, label]) => (
              <button key={k} data-tab={k} onClick={() => setTab(k)}
                className={`pb-2.5 whitespace-nowrap border-b-2 -mb-px ${tab === k ? 'border-violet-500 text-violet-500 font-bold' : `border-transparent ${muted}`}`}>{label}</button>
            ))}
          </TabSlider>

          <div className="p-5 flex flex-col gap-5">
            {tab === 'overview' && (
              <>
                <section>
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-bold">Key information</h3>
                    <button onClick={() => setInviteModalOpen(true)} className={`px-2.5 py-1 rounded-lg text-xs font-bold flex items-center gap-1.5 border ${isDark ? 'border-purple-500/30 bg-purple-500/10 text-purple-300' : 'border-purple-200 bg-purple-50 text-purple-700'}`}>
                      <UserPlus size={13} /> Invite Guests
                    </button>
                  </div>
                  <dl className="grid grid-cols-[120px_1fr] gap-y-1.5 text-[12.5px]">
                    {[
                      ['Owner', 'Simon Philpott'],
                      ['Assistant', 'Ims - rhymes with rims'],
                      ['Persona', 'Switchable - see Personas'],
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
                    [Boxes, 26, 'Hub pages', 'indigo'],
                    [Plug, 17, 'Connections', 'orange'],
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

            {tab === 'hardware' && (
              <HardwareSubsystemsSection isDark={isDark} muted={muted} live={live} effectiveHot={effectiveHot} />
            )}

            {tab === 'jobs' && (
              <BackgroundJobsSection isDark={isDark} muted={muted} />
            )}

            {tab === 'logs' && (
              <LogsExplorerSection isDark={isDark} muted={muted} />
            )}

            {tab === 'latency' && (
              <VoiceLatencySection isDark={isDark} muted={muted} />
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

      <ArchitectureInviteModal isOpen={inviteModalOpen} onClose={() => setInviteModalOpen(false)} isDark={isDark} toast={toast} />
    </PortalShell>
  );
}

function HardwareSubsystemsSection({ isDark, muted, live, effectiveHot }) {
  const box = `p-3 rounded-xl border ${isDark ? 'bg-slate-950/40 border-white/5' : 'bg-slate-50 border-slate-200'}`;

  const isMicLit = Boolean(effectiveHot['hardware|ESP32-S3 Dual MEMS Microphone']);
  const isCamLit = Boolean(effectiveHot['hardware|Logitech C270 HD Web Camera']);
  const isSpkLit = Boolean(effectiveHot['hardware|ESP32-S3 Speaker & Audio Amp']);
  const isDispLit = Boolean(effectiveHot['hardware|2.4" Colour LCD Display & Touch']);
  const isPresLit = Boolean(effectiveHot['hardware|Desk Presence & Gaze Sensor']);
  const isCtrlLit = Boolean(effectiveHot['hardware|Physical Controls & Sensors']);

  const camStreaming = live?.cameraStreaming || live?.hardware?.camera?.streaming;
  const camAttached = live?.cameraAttached || live?.hardware?.camera?.attached;
  const micActive = live?.hardware?.mic?.active;
  const micMuted = live?.hardware?.mic?.muted;
  const online = live?.deviceOnline;

  const items = [
    {
      title: 'ESP32-S3 Dual MEMS Microphone',
      chip: 'Dual ES7210 I2S ADC',
      bus: 'I2S Mono 16 kHz 16-bit PCM',
      status: micActive ? 'Active (Streaming)' : micMuted ? 'Muted' : online ? 'Ready' : 'Offline',
      statusColor: micActive ? 'text-emerald-400 bg-emerald-500/15 border-emerald-500/30' : micMuted ? 'text-amber-400 bg-amber-500/15 border-amber-500/30' : online ? 'text-sky-400 bg-sky-500/15 border-sky-500/30' : 'text-slate-400 bg-slate-500/15 border-slate-500/30',
      icon: Mic,
      lit: isMicLit,
      reason: effectiveHot['hardware|ESP32-S3 Dual MEMS Microphone']?.reason,
      details: 'Dual microphone array with acoustic echo cancellation (AEC), voice activity detection (VAD), and wake phrase gating.',
    },
    {
      title: 'Logitech C270 HD Web Camera',
      chip: '720p CMOS Sensor / USB UVC',
      bus: 'USB Host 1.1 Full Speed (D+ GPIO 20, D- GPIO 19)',
      status: camStreaming ? 'Active (Streaming)' : camAttached ? 'Attached (Idle)' : 'Disconnected',
      statusColor: camStreaming ? 'text-emerald-400 bg-emerald-500/15 border-emerald-500/30' : camAttached ? 'text-sky-400 bg-sky-500/15 border-sky-500/30' : 'text-rose-400 bg-rose-500/15 border-rose-500/30',
      icon: Camera,
      lit: isCamLit,
      reason: effectiveHot['hardware|Logitech C270 HD Web Camera']?.reason,
      details: 'Streams 640x480 MJPEG @ 15 fps over USB Host to :3003/look; captured for Gemini vision snapshots and YuNet face detection.',
    },
    {
      title: 'ESP32-S3 Speaker & Audio Amp',
      chip: 'ES8311 I2S DAC + NS4150 3W Class-D',
      bus: 'I2S Mono 24 kHz 16-bit PCM',
      status: isSpkLit ? 'Speaking (Active)' : online ? 'Ready' : 'Offline',
      statusColor: isSpkLit ? 'text-emerald-400 bg-emerald-500/15 border-emerald-500/30' : online ? 'text-sky-400 bg-sky-500/15 border-sky-500/30' : 'text-slate-400 bg-slate-500/15 border-slate-500/30',
      icon: Volume2,
      lit: isSpkLit,
      reason: effectiveHot['hardware|ESP32-S3 Speaker & Audio Amp']?.reason,
      details: 'Plays 24 kHz Gemini Live speech replies with 15-second lead buffering to eliminate audio jitter.',
    },
    {
      title: '2.4" Colour LCD Display & Touch',
      chip: 'ST7789V Display + FT6336U Touch',
      bus: 'SPI (Display) + I2C (Touch) via LovyanGFX',
      status: online ? 'Active (Rendering)' : 'Offline',
      statusColor: online ? 'text-emerald-400 bg-emerald-500/15 border-emerald-500/30' : 'text-slate-400 bg-slate-500/15 border-slate-500/30',
      icon: Monitor,
      lit: isDispLit,
      reason: effectiveHot['hardware|2.4" Colour LCD Display & Touch']?.reason,
      details: '320x240 RGB display rendering 12x8 dot animated face, lip sync, glucose & weather stats, and touch navigation.',
    },
    {
      title: 'Desk Presence & Gaze Sensor',
      chip: 'YuNet Neural Detector (100% On-Device)',
      bus: 'Shared C270 Video Pipeline (30 s Poll)',
      status: camStreaming ? 'Tracking (Engaged)' : 'Waiting for Camera',
      statusColor: camStreaming ? 'text-emerald-400 bg-emerald-500/15 border-emerald-500/30' : 'text-amber-400 bg-amber-500/15 border-amber-500/30',
      icon: Eye,
      lit: isPresLit,
      reason: effectiveHot['hardware|Desk Presence & Gaze Sensor']?.reason,
      details: 'Tracks desk presence, triggers sit-down greetings, auto-sleeps on absence, and suspends during privacy/recordings.',
    },
    {
      title: 'Physical Controls & Sensors',
      chip: 'AXP2101 PMU & GPIO Tactile Switches',
      bus: 'Hardware GPIO & ADC Sensing',
      status: 'Armed & Monitored',
      statusColor: 'text-indigo-400 bg-indigo-500/15 border-indigo-500/30',
      icon: Sliders,
      lit: isCtrlLit,
      reason: effectiveHot['hardware|Physical Controls & Sensors']?.reason,
      details: 'Dedicated microphone hardware mute switch, Boot and Reset buttons, battery level monitoring, and USB-C power.',
    },
  ];

  const pinouts = [
    { bus: 'USB Host', pins: 'GPIO 19 (D-), GPIO 20 (D+)', desc: 'Full-Speed 12 Mbps host transceiver for Logitech C270 webcam' },
    { bus: 'I2S Audio In (Mic)', pins: 'GPIO 41 (MCLK), GPIO 42 (BCLK), GPIO 2 (WS), GPIO 40 (SDIN)', desc: 'ES7210 16 kHz 16-bit mono stream' },
    { bus: 'I2S Audio Out (DAC)', pins: 'GPIO 41 (MCLK), GPIO 42 (BCLK), GPIO 2 (WS), GPIO 15 (SDOUT)', desc: 'ES8311 + NS4150 24 kHz mono stream' },
    { bus: 'SPI LCD Display', pins: 'GPIO 4 (CS), GPIO 5 (DC), GPIO 6 (SCLK), GPIO 7 (MOSI)', desc: 'ST7789V 320x240 LCD controller with LovyanGFX DMA' },
    { bus: 'I2C Peripherals', pins: 'GPIO 8 (SDA), GPIO 18 (SCL)', desc: 'FT6336U touch screen, ES7210 / ES8311 control registers' },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-bold text-sm">Hardware Subsystems & Peripherals</h3>
          <p className={`text-[11px] ${muted}`}>ESP32-S3-BOX-3 desk terminal, attached sensors, and live telemetry</p>
        </div>
        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${online ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' : 'bg-slate-500/15 text-slate-400 border-slate-500/30'}`}>
          {online ? 'Desk Connected' : 'Desk Offline'}
        </span>
      </div>

      {/* Modules List */}
      <div className="flex flex-col gap-2.5">
        {items.map((it) => {
          const Icon = it.icon;
          return (
            <div
              key={it.title}
              className={`p-3 rounded-xl border transition-all ${
                it.lit
                  ? 'border-blue-500/60 shadow-[0_0_20px_rgba(59,130,246,0.25)] bg-blue-500/10'
                  : box
              }`}
            >
              <div className="flex items-start justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2">
                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${it.lit ? 'bg-blue-500/20 text-blue-400' : isDark ? 'bg-white/5 text-slate-300' : 'bg-slate-200 text-slate-700'}`}>
                    <Icon size={15} />
                  </div>
                  <div>
                    <div className="font-bold text-xs flex items-center gap-1.5 flex-wrap">
                      <span>{it.title}</span>
                      {it.lit && (
                        <span className="px-1.5 py-0.2 rounded text-[9.5px] font-black uppercase bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 animate-pulse">
                          In Use
                        </span>
                      )}
                    </div>
                    <div className={`text-[10.5px] font-mono ${muted}`}>{it.chip} • {it.bus}</div>
                  </div>
                </div>

                <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${it.statusColor}`}>
                  {it.status}
                </span>
              </div>

              <div className={`mt-2 text-[11px] leading-relaxed ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                {it.details}
              </div>

              {it.reason && (
                <div className="mt-2 pt-2 border-t border-white/5 flex items-center gap-1.5 text-[10.5px] text-blue-400 font-medium">
                  <Sparkles size={11} className="shrink-0" />
                  <span>{it.reason}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Bus Architecture & GPIO Pinout Table */}
      <div className="flex flex-col gap-2 pt-2">
        <h4 className={`text-xs font-bold uppercase tracking-wider ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
          ESP32-S3 Bus & Pinout Assignments
        </h4>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className={`text-[10px] uppercase font-bold tracking-wider border-b ${isDark ? 'border-white/10' : 'border-slate-200'} ${muted}`}>
                <th className="py-1.5">Bus / Subsystem</th>
                <th className="py-1.5">Assigned GPIO Pins</th>
                <th className="py-1.5">Description</th>
              </tr>
            </thead>
            <tbody>
              {pinouts.map((p) => (
                <tr key={p.bus} className={`border-b ${isDark ? 'border-white/5' : 'border-slate-100'}`}>
                  <td className={`py-1.5 font-bold ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>{p.bus}</td>
                  <td className="py-1.5 font-mono text-blue-400 text-[11px]">{p.pins}</td>
                  <td className={`py-1.5 text-[11px] ${muted}`}>{p.desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pipeline Diagram */}
      <div className={`p-3 rounded-xl border text-xs ${box}`}>
        <div className="font-bold text-xs mb-1 text-violet-400">Audio & Vision Ingress / Egress Pipeline</div>
        <div className={`text-[11px] leading-relaxed ${muted}`}>
          <b>Microphone Ingress:</b> ES7210 (16 kHz PCM) &rarr; ESP32-S3 &rarr; TCP :3002 &rarr; Gemini 3.8 Live<br />
          <b>Webcam Ingress:</b> Logitech C270 &rarr; USB Host (D+/D-) &rarr; HTTP :3003 /look &rarr; OpenCV / Gemini Vision<br />
          <b>Speaker Egress:</b> Gemini Live (24 kHz PCM) &rarr; TCP :3002 &rarr; ES8311 DAC &rarr; NS4150 Amp &rarr; Speaker
        </div>
      </div>
    </div>
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

// How long Ims takes to start answering: from the end of what was said (or a desk announcement being sent)
// to the first audio of his reply, measured on every real turn (conversationLog.js). No data, no numbers.
function VoiceLatencySection({ isDark, muted }) {
  const [stats, setStats] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/conversations/latency').then((r) => r.json()).then((d) => {
      if (d.success) setStats(d); else setError(d.error || 'Could not load the answer times.');
    }).catch((e) => setError(e.message));
  }, []);

  if (error) return <div className="py-6 text-center text-xs text-rose-400">{error}</div>;
  if (!stats) return <div className={`py-8 text-center text-xs ${muted}`}>Loading answer times...</div>;

  const s1 = (ms) => (ms == null ? '-' : `${(ms / 1000).toFixed(1)} s`);
  const tone = (ms) => (ms == null ? muted : ms <= 2500 ? 'text-emerald-400' : ms <= 4000 ? 'text-amber-400' : 'text-rose-400');
  const box = `p-3 rounded-xl border ${isDark ? 'bg-slate-950/40 border-white/5' : 'bg-slate-50 border-slate-200'}`;
  const Row = ({ label, g }) => (
    <div className="flex items-baseline gap-2 text-xs">
      <span className={`flex-1 ${muted}`}>{label} <span className="opacity-70">({g.count})</span></span>
      <span className={`font-mono font-bold ${tone(g.median)}`} title="Typical (median)">{s1(g.median)}</span>
      <span className={`font-mono ${tone(g.p90)}`} title="Slow end (90th percentile)">{s1(g.p90)}</span>
    </div>
  );

  if (!stats.week.turns) {
    return (
      <div className={`${box} text-center`}>
        <p className={`text-xs font-bold ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>No answer times yet</p>
        <p className={`text-[11px] mt-1 ${muted}`}>They're measured on every reply Ims gives from now on - talk to him and they'll appear here.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid sm:grid-cols-2 gap-3">
        {[['Today', stats.today], ['Last 7 days', stats.week]].map(([title, g]) => (
          <div key={title} className={box}>
            <div className="flex items-baseline gap-2 mb-1.5">
              <span className="text-xs font-bold uppercase tracking-wider text-violet-400 flex-1">{title}</span>
              <span className={`text-[10px] ${muted}`}>typical</span>
              <span className={`text-[10px] ${muted}`}>slow end</span>
            </div>
            <Row label="Straight answers" g={g.noTool} />
            <Row label="After a lookup" g={g.withTool} />
          </div>
        ))}
      </div>

      {stats.slowestTools.length > 0 && (
        <div className="flex flex-col gap-2">
          <h4 className={`text-xs font-bold uppercase tracking-wider ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>Slowest lookups this week</h4>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className={`text-[10px] uppercase font-bold tracking-wider ${muted}`}>
                  <th className="py-1.5">Tool</th><th className="py-1.5">Typical</th><th className="py-1.5">Slow end</th><th className="py-1.5">Calls</th>
                </tr>
              </thead>
              <tbody>
                {stats.slowestTools.map((t) => (
                  <tr key={t.name}>
                    <td className={`py-1.5 font-semibold ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>{t.name}</td>
                    <td className={`py-1.5 font-mono ${tone(t.median)}`}>{s1(t.median)}</td>
                    <td className={`py-1.5 font-mono ${tone(t.p90)}`}>{s1(t.p90)}</td>
                    <td className={`py-1.5 ${muted}`}>{t.calls}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <p className={`text-[11px] leading-relaxed ${muted}`}>
        Measured from the end of what was said (or a desk announcement being sent) to the first sound of his reply. Under 2.5 s feels natural; over 4 s feels like he's not listening.
      </p>
    </div>
  );
}

function BackgroundJobsSection({ isDark, muted }) {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState('all');
  const [triggering, setTriggering] = useState(null);
  const [note, setNote] = useState(null);

  const fetchJobs = useCallback(async () => {
    try {
      const res = await fetch('/api/jobs');
      if (res.ok) {
        const d = await res.json();
        if (d.success && Array.isArray(d.jobs)) {
          setJobs(d.jobs);
        }
      }
    } catch (e) {
      console.error('Failed to load background jobs:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchJobs();
    const interval = setInterval(fetchJobs, 5000);
    return () => clearInterval(interval);
  }, [fetchJobs]);

  const runJob = async (name) => {
    setTriggering(name);
    setNote(null);
    try {
      const res = await fetch(`/api/jobs/${encodeURIComponent(name)}/run`, { method: 'POST' });
      const d = await res.json();
      if (d.success) {
        setNote({ ok: true, msg: `Job "${name}" executed successfully (${d.result?.job?.durationMs ?? d.result?.durationMs ?? 0}ms).` });
      } else {
        setNote({ ok: false, msg: `Job "${name}" failed: ${d.error || 'Execution error'}` });
      }
      fetchJobs();
    } catch (e) {
      setNote({ ok: false, msg: e.message });
    } finally {
      setTriggering(null);
    }
  };

  const filteredJobs = useMemo(() => {
    if (category === 'all') return jobs;
    return jobs.filter((j) => j.category === category);
  }, [jobs, category]);

  const formatCountdown = (nextRun) => {
    if (!nextRun) return 'Unscheduled';
    const diffSec = Math.round((nextRun - Date.now()) / 1000);
    if (diffSec <= 0) return 'Due now';
    if (diffSec < 60) return `in ${diffSec}s`;
    const min = Math.floor(diffSec / 60);
    const sec = diffSec % 60;
    if (min < 60) return `in ${min}m ${sec}s`;
    const hr = Math.floor(min / 60);
    return `in ${hr}h ${min % 60}m`;
  };

  const formatUKTime = (ts) => {
    if (!ts) return 'Never';
    return new Date(ts).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  const categoryAccents = {
    realtime: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
    sync: 'text-sky-400 bg-sky-500/10 border-sky-500/20',
    maintenance: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
    monitoring: 'text-purple-400 bg-purple-500/10 border-purple-500/20'
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-bold text-sm">Background Jobs Telemetry</h3>
          <p className={`text-[11px] ${muted}`}>Central Job Scheduler with concurrency run-locks & London time</p>
        </div>
        <button
          onClick={fetchJobs}
          disabled={loading}
          className={`p-1.5 rounded-lg border text-xs font-bold flex items-center gap-1 ${
            isDark ? 'border-white/10 hover:bg-white/5' : 'border-slate-200 hover:bg-slate-50'
          }`}
          title="Refresh jobs telemetry"
        >
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Category filter pills */}
      <div className="flex flex-wrap gap-1.5">
        {['all', 'realtime', 'sync', 'maintenance', 'monitoring'].map((cat) => (
          <button
            key={cat}
            onClick={() => setCategory(cat)}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-bold capitalize transition-colors ${
              category === cat
                ? 'bg-violet-600 text-white'
                : isDark ? 'bg-white/5 text-slate-400 hover:bg-white/10' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            {cat} {cat === 'all' ? `(${jobs.length})` : `(${jobs.filter((j) => j.category === cat).length})`}
          </button>
        ))}
      </div>

      {note && (
        <div className={`p-2.5 rounded-xl border text-xs flex items-center gap-2 ${
          note.ok
            ? isDark ? 'bg-emerald-950/20 border-emerald-500/20 text-emerald-400' : 'bg-emerald-50 border-emerald-200 text-emerald-800'
            : isDark ? 'bg-rose-950/20 border-rose-500/20 text-rose-400' : 'bg-rose-50 border-rose-200 text-rose-800'
        }`}>
          {note.ok ? <CheckCircle2 size={14} className="shrink-0" /> : <AlertTriangle size={14} className="shrink-0" />}
          <span>{note.msg}</span>
        </div>
      )}

      {loading && !jobs.length ? (
        <div className={`py-6 text-center text-xs ${muted}`}>Loading registered routines...</div>
      ) : (
        <div className="flex flex-col gap-2.5 max-h-[60vh] overflow-y-auto pr-1">
          {filteredJobs.map((j) => (
            <div
              key={j.name}
              className={`p-3 rounded-2xl border transition-all ${
                j.isRunning
                  ? isDark ? 'bg-violet-950/20 border-violet-500/40 shadow-sm' : 'bg-violet-50 border-violet-300'
                  : isDark ? 'bg-slate-950/40 border-white/5' : 'bg-white border-slate-200/80 shadow-sm'
              }`}
            >
              <div className="flex items-start justify-between gap-2 mb-1.5">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-xs font-bold text-slate-200">{j.name}</span>
                    <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${categoryAccents[j.category] || 'text-slate-400'}`}>
                      {j.category}
                    </span>
                    <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                      j.isRunning
                        ? 'bg-blue-500/20 text-blue-400 animate-pulse'
                        : j.status === 'ok'
                          ? 'bg-emerald-500/15 text-emerald-400'
                          : j.status === 'failed'
                            ? 'bg-rose-500/15 text-rose-400'
                            : 'bg-slate-500/15 text-slate-400'
                    }`}>
                      {j.isRunning ? 'Executing...' : j.status}
                    </span>
                  </div>
                  <div className={`text-[11.5px] mt-1 leading-snug ${muted}`}>{j.description}</div>
                </div>

                <button
                  onClick={() => runJob(j.name)}
                  disabled={j.isRunning || triggering === j.name}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1 shrink-0 border transition-colors ${
                    isDark
                      ? 'border-violet-500/30 bg-violet-500/10 text-violet-300 hover:bg-violet-500/20'
                      : 'border-violet-200 bg-violet-50 text-violet-700 hover:bg-violet-100'
                  } disabled:opacity-40`}
                  title="Trigger immediate execution"
                >
                  {triggering === j.name ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />}
                  <span>Run</span>
                </button>
              </div>

              {/* Timing metrics grid */}
              <div className={`grid grid-cols-3 gap-2 mt-2 pt-2 border-t text-[10.5px] font-mono ${
                isDark ? 'border-white/5 text-slate-400' : 'border-slate-100 text-slate-600'
              }`}>
                <div>
                  <span className="block text-[9.5px] uppercase font-sans tracking-wider opacity-70">Next Run</span>
                  <span className="font-bold text-slate-200">{formatCountdown(j.nextRun)}</span>
                </div>
                <div>
                  <span className="block text-[9.5px] uppercase font-sans tracking-wider opacity-70">Last Run</span>
                  <span>{formatUKTime(j.lastRun)}</span>
                </div>
                <div>
                  <span className="block text-[9.5px] uppercase font-sans tracking-wider opacity-70">Duration</span>
                  <span>{j.durationMs != null ? `${j.durationMs}ms` : '-'}</span>
                </div>
              </div>

              {j.lastError && (
                <div className="mt-2 p-2 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-[10.5px] font-mono leading-tight">
                  Error: {j.lastError}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function LogsExplorerSection({ isDark, muted }) {
  const [logs, setLogs] = useState([]);
  const [counts, setCounts] = useState({ total: 0, error: 0, warn: 0, info: 0, debug: 0 });
  const [services, setServices] = useState([]);
  const [selectedLevel, setSelectedLevel] = useState('all');
  const [selectedService, setSelectedService] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [liveStream, setLiveStream] = useState(true);
  const [expandedId, setExpandedId] = useState(null);
  const [copiedId, setCopiedId] = useState(null);

  const fetchLogs = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (selectedLevel !== 'all') params.set('level', selectedLevel);
      if (selectedService !== 'all') params.set('service', selectedService);
      if (searchQuery.trim()) params.set('search', searchQuery.trim());
      params.set('limit', '150');

      const res = await fetch(`/api/logs?${params.toString()}`);
      if (res.ok) {
        const d = await res.json();
        setLogs(d.logs || []);
        if (d.counts) setCounts(d.counts);
      }
    } catch (err) {
      console.error('Failed to load logs:', err);
    } finally {
      setLoading(false);
    }
  }, [selectedLevel, selectedService, searchQuery]);

  const fetchServices = async () => {
    try {
      const res = await fetch('/api/logs/services');
      if (res.ok) {
        const d = await res.json();
        setServices(d.services || []);
      }
    } catch (_) {}
  };

  useEffect(() => {
    fetchLogs();
    fetchServices();
  }, [fetchLogs]);

  // Real-time live log arrival via SSE
  useSystemEvents('log:entry', (entry) => {
    if (!liveStream) return;
    setLogs((prev) => {
      // Check filters
      if (selectedLevel !== 'all' && entry.level !== selectedLevel) return prev;
      if (selectedService !== 'all' && entry.service.toLowerCase() !== selectedService.toLowerCase()) return prev;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matches = entry.message.toLowerCase().includes(q) ||
          entry.service.toLowerCase().includes(q) ||
          (entry.data && JSON.stringify(entry.data).toLowerCase().includes(q));
        if (!matches) return prev;
      }
      return [entry, ...prev.slice(0, 199)];
    });
    setCounts((prev) => ({
      ...prev,
      total: prev.total + 1,
      [entry.level]: (prev[entry.level] || 0) + 1
    }));
  }, [liveStream, selectedLevel, selectedService, searchQuery]);

  const clearLogs = async () => {
    if (!window.confirm('Clear the active in-memory log buffer? (Disk logs remain intact)')) return;
    try {
      await fetch('/api/logs', { method: 'DELETE' });
      setLogs([]);
      setCounts({ total: 0, error: 0, warn: 0, info: 0, debug: 0 });
    } catch (_) {}
  };

  const exportLogs = () => {
    const blob = new Blob([JSON.stringify(logs, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ims-logs-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const copyData = (id, data) => {
    navigator.clipboard.writeText(typeof data === 'string' ? data : JSON.stringify(data, null, 2));
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  const levelStyles = {
    error: 'bg-rose-500/15 border-rose-500/30 text-rose-400',
    warn: 'bg-amber-500/15 border-amber-500/30 text-amber-400',
    info: 'bg-sky-500/15 border-sky-500/30 text-sky-400',
    debug: 'bg-purple-500/15 border-purple-500/30 text-purple-400',
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Top Controls Card */}
      <div className={`p-4 rounded-2xl border flex flex-col gap-3 ${isDark ? 'bg-slate-950/40 border-white/5' : 'bg-slate-50 border-slate-200'}`}>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Terminal size={16} className="text-violet-400" />
            <span className="text-xs font-bold uppercase tracking-wider text-violet-400">Structured Logs Explorer</span>
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              onClick={() => setLiveStream(!liveStream)}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold flex items-center gap-1.5 border transition-colors ${
                liveStream
                  ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400 shadow-sm'
                  : isDark ? 'bg-white/5 border-white/10 text-slate-400' : 'bg-white border-slate-200 text-slate-600'
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${liveStream ? 'bg-emerald-400 animate-ping' : 'bg-slate-400'}`} />
              <span>{liveStream ? 'Live Stream ON' : 'Paused'}</span>
            </button>

            <button
              onClick={exportLogs}
              disabled={logs.length === 0}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold flex items-center gap-1 border transition-colors ${
                isDark ? 'border-sky-500/30 bg-sky-500/10 text-sky-300 hover:bg-sky-500/20' : 'border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100'
              } disabled:opacity-40`}
              title="Export filtered logs as JSON"
            >
              <Download size={12} />
              <span>Export</span>
            </button>

            <button
              onClick={clearLogs}
              className={`px-2 py-1 rounded-lg text-xs font-bold flex items-center gap-1 border transition-colors ${
                isDark ? 'border-white/10 hover:bg-white/10 text-slate-400' : 'border-slate-200 hover:bg-slate-100 text-slate-600'
              }`}
              title="Clear in-memory buffer"
            >
              <Trash2 size={12} />
            </button>

            <button
              onClick={fetchLogs}
              className={`p-1.5 rounded-lg border transition-colors ${
                isDark ? 'border-white/10 hover:bg-white/10 text-slate-400' : 'border-slate-200 hover:bg-slate-100 text-slate-600'
              }`}
              title="Refresh logs"
            >
              <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>

        {/* Level Filter Pills */}
        <div className="flex items-center gap-1.5 flex-wrap pt-1">
          {[
            { id: 'all', label: 'ALL', count: counts.total, color: 'text-slate-200 bg-slate-500/15 border-slate-500/30' },
            { id: 'error', label: 'ERROR', count: counts.error, color: 'text-rose-400 bg-rose-500/15 border-rose-500/30' },
            { id: 'warn', label: 'WARN', count: counts.warn, color: 'text-amber-400 bg-amber-500/15 border-amber-500/30' },
            { id: 'info', label: 'INFO', count: counts.info, color: 'text-sky-400 bg-sky-500/15 border-sky-500/30' },
            { id: 'debug', label: 'DEBUG', count: counts.debug, color: 'text-purple-400 bg-purple-500/15 border-purple-500/30' }
          ].map(lvl => (
            <button
              key={lvl.id}
              onClick={() => setSelectedLevel(lvl.id)}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-all flex items-center gap-1.5 ${
                selectedLevel === lvl.id
                  ? `${lvl.color} shadow-sm ring-1 ring-white/20`
                  : isDark
                    ? 'border-white/5 bg-white/5 text-slate-400 hover:bg-white/10'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-100'
              }`}
            >
              <span>{lvl.label}</span>
              <span className="px-1.5 py-0.2 rounded-full text-[9.5px] font-mono opacity-80 bg-black/20">
                {lvl.count}
              </span>
            </button>
          ))}
        </div>

        {/* Search & Service Filter */}
        <div className="flex items-center gap-2 pt-1 flex-wrap sm:flex-nowrap">
          <div className="relative flex-1 min-w-[140px]">
            <Search size={13} className={`absolute left-3 top-2.5 ${muted}`} />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search log messages, data, stack traces..."
              className={`w-full pl-8 pr-3 py-1.5 rounded-xl text-xs outline-none border transition-colors ${
                isDark
                  ? 'bg-slate-900 border-white/10 text-slate-200 focus:border-violet-500'
                  : 'bg-white border-slate-200 text-slate-800 focus:border-violet-500'
              }`}
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-200"
              >
                <X size={13} />
              </button>
            )}
          </div>

          <select
            value={selectedService}
            onChange={(e) => setSelectedService(e.target.value)}
            className={`px-3 py-1.5 rounded-xl text-xs outline-none border font-medium ${
              isDark
                ? 'bg-slate-900 border-white/10 text-slate-200'
                : 'bg-white border-slate-200 text-slate-800'
            }`}
          >
            <option value="all">All Services</option>
            {services.map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Log Entries Stream */}
      {logs.length === 0 ? (
        <div className={`p-8 text-center text-xs rounded-2xl border ${isDark ? 'border-white/5 text-slate-400' : 'border-slate-200 text-slate-500'}`}>
          No log entries matching the selected criteria.
        </div>
      ) : (
        <div className="flex flex-col gap-2 max-h-[560px] overflow-y-auto pr-1">
          {logs.map((entry) => {
            const isExpanded = expandedId === entry.id;
            const hasData = entry.data && Object.keys(entry.data).length > 0;
            return (
              <div
                key={entry.id}
                className={`p-3 rounded-xl border text-xs font-mono transition-colors ${
                  isDark
                    ? 'bg-slate-950/60 border-white/5 hover:border-white/10'
                    : 'bg-white border-slate-200 hover:border-slate-300 shadow-sm'
                }`}
              >
                <div className="flex items-start justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[10.5px] text-slate-400 font-sans">{entry.timeFormatted || entry.timestamp?.slice(11, 19)}</span>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold border uppercase ${levelStyles[entry.level] || 'text-slate-300'}`}>
                      {entry.level}
                    </span>
                    <span className={`px-2 py-0.5 rounded text-[10.5px] font-semibold border ${
                      isDark ? 'bg-white/5 border-white/10 text-slate-300' : 'bg-slate-100 border-slate-200 text-slate-700'
                    }`}>
                      [{entry.service}]
                    </span>
                  </div>

                  {hasData && (
                    <button
                      onClick={() => setExpandedId(isExpanded ? null : entry.id)}
                      className={`px-2 py-0.5 rounded text-[10.5px] font-sans font-bold flex items-center gap-1 border transition-colors ${
                        isDark ? 'border-white/10 hover:bg-white/10 text-slate-300' : 'border-slate-200 hover:bg-slate-100 text-slate-700'
                      }`}
                    >
                      <span>{isExpanded ? 'Hide Data' : 'View Data'}</span>
                      <ChevronRight size={12} className={`transition-transform ${isExpanded ? '-rotate-90' : 'rotate-90'}`} />
                    </button>
                  )}
                </div>

                <div className="mt-1.5 text-slate-200 font-sans text-[12px] leading-relaxed break-words">
                  {entry.message}
                </div>

                {isExpanded && hasData && (
                  <div className={`mt-2 p-2.5 rounded-lg border text-[11px] overflow-x-auto relative ${
                    isDark ? 'bg-slate-900 border-white/10 text-slate-300' : 'bg-slate-50 border-slate-200 text-slate-800'
                  }`}>
                    <button
                      onClick={() => copyData(entry.id, entry.data)}
                      className={`absolute top-2 right-2 px-2 py-1 rounded text-[10px] font-sans font-bold flex items-center gap-1 border ${
                        isDark ? 'border-white/10 bg-white/5 hover:bg-white/10' : 'border-slate-200 bg-white hover:bg-slate-100'
                      }`}
                    >
                      {copiedId === entry.id ? <Check size={11} className="text-emerald-400" /> : <ClipboardCopy size={11} />}
                      <span>{copiedId === entry.id ? 'Copied' : 'Copy'}</span>
                    </button>
                    <pre className="font-mono whitespace-pre-wrap">{typeof entry.data === 'string' ? entry.data : JSON.stringify(entry.data, null, 2)}</pre>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Tabs that don't fit slide left and right with ‹ › buttons instead of a scrollbar. A button only shows
// when there are hidden tabs that way; the chosen tab is slid into view.
function TabSlider({ isDark, active, children }) {
  const ref = useRef(null);
  const [edges, setEdges] = useState({ left: false, right: false });
  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    setEdges({ left: el.scrollLeft > 2, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 2 });
  }, []);
  useEffect(() => {
    measure();
    const el = ref.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    el.addEventListener('scroll', measure, { passive: true });
    return () => { ro.disconnect(); el.removeEventListener('scroll', measure); };
  }, [measure]);
  useEffect(() => {
    const t = ref.current?.querySelector(`[data-tab="${active}"]`);
    if (t) t.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
  }, [active]);
  const slide = (dir) => ref.current?.scrollBy({ left: dir * Math.max(120, ref.current.clientWidth * 0.6), behavior: 'smooth' });
  const arrow = `absolute top-0 bottom-px z-10 w-9 flex items-center justify-center ${isDark ? 'text-slate-100' : 'text-slate-800'}`;
  const fade = isDark ? 'from-[#0b1120] via-[#0b1120]' : 'from-white via-white';
  return (
    <div className={`relative border-b ${isDark ? 'border-white/10' : 'border-slate-200'}`}>
      {edges.left && (
        <button onClick={() => slide(-1)} aria-label="Show earlier tabs" className={`${arrow} left-0 bg-gradient-to-r ${fade} to-transparent`}>
          <ChevronRight size={16} className="rotate-180" />
        </button>
      )}
      <div ref={ref} className="flex gap-5 px-5 text-[13px] overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {children}
      </div>
      {edges.right && (
        <button onClick={() => slide(1)} aria-label="Show more tabs" className={`${arrow} right-0 bg-gradient-to-l ${fade} to-transparent`}>
          <ChevronRight size={16} />
        </button>
      )}
    </div>
  );
}
