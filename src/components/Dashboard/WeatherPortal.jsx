import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CloudSun, Sun, Moon, Cloud, CloudMoon, CloudRain, CloudDrizzle, CloudSnow, CloudLightning, CloudFog, CloudRainWind,
  Navigation, MapPin, Home, Plus, X, RefreshCw, MessageSquareQuote, BookOpen, ChevronDown, ChevronLeft, ChevronRight, AlertTriangle, Sparkles,
} from 'lucide-react';
import PortalShell from './PortalShell';

// Weather (/ims/weather): the forecast for home or a saved place - today, the days ahead (up to 16) and
// hour by hour - laid out like the Met Office/BBC pages, plus exactly what Ims is told to say about it and
// the phrasebook he picks his words from. Home is the default for Ims and the day report.

const ICONS = {
  sun: [Sun, 'text-amber-400'], moon: [Moon, 'text-slate-400'], partly: [CloudSun, 'text-amber-400'], 'partly-night': [CloudMoon, 'text-slate-400'],
  cloud: [Cloud, 'text-slate-400'], drizzle: [CloudDrizzle, 'text-sky-400'], rain: [CloudRain, 'text-sky-500'], 'heavy-rain': [CloudRainWind, 'text-blue-500'],
  snow: [CloudSnow, 'text-cyan-300'], storm: [CloudLightning, 'text-violet-400'], fog: [CloudFog, 'text-slate-400'],
};
const WxIcon = ({ kind, size = 28 }) => { const [I, c] = ICONS[kind] || ICONS.cloud; return <I size={size} className={c} strokeWidth={1.75} />; };
const COMPASS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
// arrow points the way the wind is blowing TO (it's named for where it comes from)
const WindArrow = ({ dir, mph, isDark }) => (
  <div className={`relative w-8 h-8 rounded-full border flex items-center justify-center text-[10px] font-bold ${isDark ? 'border-slate-500 text-slate-200' : 'border-slate-700 text-slate-800'}`} title={`${mph} mph from the ${dir}`}>
    {mph}
    <Navigation size={10} className="absolute -top-1 -right-1" style={{ transform: `rotate(${COMPASS.indexOf(dir) * 22.5 + 180 - 45}deg)` }} />
  </div>
);
const dayName = (date, isToday) => (isToday ? 'Today' : new Date(`${date}T12:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric' }));
const RAIN_TINT = { dry: 'bg-emerald-500', chance: 'bg-amber-400', light: 'bg-sky-400', moderate: 'bg-blue-500', heavy: 'bg-indigo-600' };

export default function WeatherPortal({ theme = 'dark', onThemeToggle, setCurrentPath }) {
  const isDark = theme === 'dark';
  const [place, setPlace] = useState('');
  const [data, setData] = useState(null);
  const [places, setPlaces] = useState({ home: null, places: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [dayIdx, setDayIdx] = useState(0);
  const [newPlace, setNewPlace] = useState('');
  const [phrases, setPhrases] = useState(null);
  const [phrasesOpen, setPhrasesOpen] = useState(false);
  const [notification, setNotification] = useState(null);

  const notify = (msg, type = 'ok') => { setNotification({ msg, type }); setTimeout(() => setNotification(null), 3000); };
  const card = isDark ? 'bg-slate-900/60 border-white/10' : 'bg-white border-[#2E2B27]/10 shadow-sm';
  const muted = isDark ? 'text-slate-400' : 'text-slate-500';

  const loadPlaces = useCallback(() => fetch('/api/weather/places').then((r) => r.json()).then((j) => j.success && setPlaces(j)).catch(() => {}), []);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const j = await (await fetch(`/api/weather?days=16${place ? `&location=${encodeURIComponent(place)}` : ''}`)).json();
      if (!j.success) throw new Error(j.weather?.error || j.error || 'Weather unavailable');
      setData(j.weather); setError(null); setDayIdx(0);
    } catch (err) { setError(err.message); } finally { setLoading(false); }
  }, [place]);
  useEffect(() => { loadPlaces(); }, [loadPlaces]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (phrasesOpen && !phrases) fetch('/api/weather/phrases').then((r) => r.json()).then((j) => setPhrases(j.phrases)).catch(() => {});
  }, [phrasesOpen, phrases]);

  const send = async (url, method, body) => {
    const j = await (await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })).json();
    if (!j.success) throw new Error(j.error || 'That did not work');
    return j;
  };
  const addPlace = async () => {
    if (!newPlace.trim()) return;
    try { await send('/api/weather/places', 'POST', { query: newPlace }); setNewPlace(''); await loadPlaces(); notify('Place saved'); } catch (err) { notify(err.message, 'error'); }
  };
  const removePlace = async (name) => {
    try { await send(`/api/weather/places/${encodeURIComponent(name)}`, 'DELETE'); if (place === name) setPlace(''); await loadPlaces(); } catch (err) { notify(err.message, 'error'); }
  };
  const makeHome = async (name) => {
    try { const j = await send('/api/weather/home', 'PUT', { query: name }); setPlace(''); await loadPlaces(); notify(`Home is now ${j.home.name}`); } catch (err) { notify(err.message, 'error'); }
  };

  const days = data?.forecast || [];
  const day = days[dayIdx];
  // hours for the chosen day (only the next 48 hours come hour by hour)
  const hours = useMemo(() => (data?.hourly || []).filter((h) => !day || dayIdx === 0 || h.date === day.date), [data, day, dayIdx]);
  const desc = data?.description;

  const Chip = ({ active, onClick, children, onRemove, title }) => (
    <span className={`inline-flex items-center gap-1.5 pl-3 ${onRemove ? 'pr-1.5' : 'pr-3'} py-1.5 rounded-full border text-xs font-bold cursor-pointer transition-all ${
      active ? 'bg-sky-500 text-white border-sky-500' : isDark ? 'bg-white/5 border-white/10 text-slate-200 hover:bg-white/10' : 'bg-white border-slate-200 text-slate-700 hover:border-sky-400'
    }`} onClick={onClick} title={title}>
      {children}
      {onRemove && <button onClick={(e) => { e.stopPropagation(); onRemove(); }} className="p-0.5 rounded-full hover:bg-black/20" title="Remove this place"><X size={12} /></button>}
    </span>
  );

  return (
    <PortalShell title="Weather" subtitle={data ? `${data.location} - updated ${data.updated?.slice(11, 16) || ''}` : 'Forecasts for home and saved places'}
      icon={CloudSun} gradient="from-sky-400 to-blue-600" glow="rgba(14,165,233,0.3)" isDark={isDark} onThemeToggle={onThemeToggle}
      setCurrentPath={setCurrentPath} notification={notification} maxWidth="max-w-7xl">
      <div className="max-w-7xl mx-auto w-full px-4 sm:px-6 py-6 space-y-5">

        {/* places */}
        <div className="flex flex-wrap items-center gap-2">
          <Chip active={!place} onClick={() => setPlace('')} title="Home - used by Ims and the day report unless you name somewhere else">
            <Home size={13} /> {places.home?.name || 'Home'}
          </Chip>
          {places.places.map((p) => (
            <Chip key={p.name} active={place === p.name} onClick={() => setPlace(p.name)} onRemove={() => removePlace(p.name)} title={[p.region, p.country].filter(Boolean).join(', ')}>
              <MapPin size={13} /> {p.name}
            </Chip>
          ))}
          <form onSubmit={(e) => { e.preventDefault(); addPlace(); }} className="flex items-center gap-1">
            <input value={newPlace} onChange={(e) => setNewPlace(e.target.value)} placeholder="Add a place..."
              className={`rounded-full border px-3 py-1.5 text-xs outline-none focus:border-sky-500 w-40 ${isDark ? 'bg-slate-900 border-white/10 text-slate-100' : 'bg-white border-slate-300'}`} />
            <button type="submit" className="p-1.5 rounded-full bg-sky-500 text-white hover:bg-sky-600" title="Save this place"><Plus size={14} /></button>
          </form>
          {place && <button onClick={() => makeHome(place)} className={`text-xs font-bold underline ${muted} hover:text-sky-500`}>Make {place} home</button>}
          <button onClick={load} className={`ml-auto p-2 rounded-xl border ${card}`} title="Refresh"><RefreshCw size={14} className={loading ? 'animate-spin' : ''} /></button>
        </div>

        {error && <div className="p-4 rounded-xl border border-rose-500/30 bg-rose-500/10 text-rose-500 text-sm flex items-center gap-2"><AlertTriangle size={16} /> {error}</div>}

        {data && day && (
          <>
            {/* today / chosen day + strip of days */}
            <div className={`rounded-2xl border overflow-hidden ${card}`}>
              <div className="flex flex-col lg:flex-row">
                <div className={`lg:w-80 shrink-0 p-5 border-t-4 border-amber-500 ${isDark ? 'bg-slate-950/40' : 'bg-white'}`}>
                  <div className="text-lg font-black">{dayIdx === 0 ? 'Today' : new Date(`${day.date}T12:00`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}</div>
                  <div className="flex items-center gap-4 mt-2">
                    <WxIcon kind={day.icon} size={56} />
                    <div className="text-right">
                      <div className="text-2xl font-black">{day.max_temp_c}°</div>
                      <div className={`text-lg ${muted}`}>{day.min_temp_c}°</div>
                    </div>
                    <div className="h-14 w-px bg-slate-500/30" />
                    <div className="text-sm font-semibold leading-snug">{day.condition}{day.wind_words && day.wind_words !== 'light winds' ? ` and ${day.wind_words}` : ''}</div>
                  </div>
                  <div className={`mt-3 text-[11px] ${muted} space-y-0.5`}>
                    <div>{dayIdx === 0 ? 'Rest of today: ' : ''}{day.summary}</div>
                    <div>Sunrise {day.sunrise} · Sunset {day.sunset} · UV {day.uv_max}</div>
                    {day.reliability !== 'good' && <div className="text-amber-500 font-semibold">Forecast reliability: {day.reliability}</div>}
                  </div>
                  {day.unusual && (
                    <div className="mt-3 p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-[11px] text-amber-600 dark:text-amber-400 flex gap-2">
                      <Sparkles size={14} className="shrink-0 mt-0.5" /><span>{day.unusual.notes.map((n) => n.text).join(' ')}</span>
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0 flex items-stretch">
                  <button onClick={() => setDayIdx((i) => Math.max(0, i - 1))} className={`px-1 ${isDark ? 'bg-white/5' : 'bg-slate-100'}`} title="Previous day"><ChevronLeft size={18} /></button>
                  <div className="flex-1 overflow-x-auto flex">
                    {days.map((d, i) => (
                      <button key={d.date} onClick={() => setDayIdx(i)} className={`shrink-0 w-28 p-3 text-left border-r flex flex-col justify-between ${isDark ? 'border-white/5' : 'border-slate-100'} ${
                        i === dayIdx ? (isDark ? 'bg-sky-500/15' : 'bg-sky-50') : isDark ? 'hover:bg-white/5' : 'hover:bg-slate-50'}`}>
                        <div className="text-xs font-bold">{dayName(d.date, d.is_today)}</div>
                        <div className="flex items-center justify-between mt-2">
                          <WxIcon kind={d.icon} size={30} />
                          <div className="text-right leading-tight"><div className="text-sm font-black">{d.max_temp_c}°</div><div className={`text-xs ${muted}`}>{d.min_temp_c}°</div></div>
                        </div>
                        <div className="flex items-center gap-1 mt-2">
                          <span className={`h-1.5 flex-1 rounded-full ${RAIN_TINT[d.rain_level]}`} title={`Rain: ${d.rain_level}`} />
                          {d.unusual && <Sparkles size={11} className="text-amber-500" title="Unusual for the time of year" />}
                        </div>
                        {i > 7 && <div className={`text-[9px] mt-1 ${muted}`}>rough guide</div>}
                      </button>
                    ))}
                  </div>
                  <button onClick={() => setDayIdx((i) => Math.min(days.length - 1, i + 1))} className="px-1 bg-sky-500 text-white" title="Next day"><ChevronRight size={18} /></button>
                </div>
              </div>

              {/* hour by hour */}
              {hours.length > 0 ? (
                <div className={`overflow-x-auto border-t ${isDark ? 'border-white/10' : 'border-slate-100'}`}>
                  <div className="flex">
                    {hours.map((h, i) => (
                      <div key={h.time} className={`shrink-0 w-16 py-3 flex flex-col items-center gap-1.5 border-r ${isDark ? 'border-white/5' : 'border-slate-100'}`}>
                        <div className="text-[11px] font-bold">{String(h.hour).padStart(2, '0')}00</div>
                        <div className={`text-[9px] h-3 ${muted}`}>{h.hour === 0 && i > 0 ? new Date(`${h.date}T12:00`).toLocaleDateString('en-GB', { weekday: 'short' }) : ''}</div>
                        <WxIcon kind={h.icon} size={24} />
                        <div className="text-sm font-black">{h.temp_c}°</div>
                        <div className={`text-[10px] font-semibold ${h.rain_probability_percent >= 10 ? 'text-sky-500' : muted}`}>{h.rain_probability_percent ?? '-'}%</div>
                        <div className={`text-[9px] h-3 ${muted}`}>{h.rain_mm > 0 ? `${h.rain_mm} mm` : ''}</div>
                        <WindArrow dir={h.wind_direction} mph={h.wind_mph} isDark={isDark} />
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className={`p-4 text-xs border-t ${muted} ${isDark ? 'border-white/10' : 'border-slate-100'}`}>Hour-by-hour detail covers the next 48 hours; this day has the summary above.</div>
              )}
            </div>

            {/* what Ims is told */}
            <div className={`rounded-2xl border p-5 space-y-3 ${card}`}>
              <div className="flex items-center gap-2 text-sm font-black uppercase tracking-wide"><MessageSquareQuote size={16} className="text-sky-500" /> What Ims will say</div>
              <p className={`text-xs ${muted}`}>Roughly how Ims will put it, using the words from the weather phrases below. He words it fresh each time, so it won't be exactly this, but it'll be no stronger or weaker. The plain facts he's handed are underneath.</p>
              <div className="grid md:grid-cols-2 gap-3 text-sm">
                {[
                  ['Now', null, desc?.now],
                  ['Rest of today', data.sounds_like?.rest_of_today, desc?.rest_of_today],
                  ['Tonight', data.sounds_like?.tonight, desc?.tonight?.replace(/^Overnight: /, '')],
                  ['Tomorrow', data.sounds_like?.tomorrow, desc?.tomorrow?.replace(/^Tomorrow: /, '')],
                ].filter(([, say, facts]) => say || facts).map(([k, say, facts]) => (
                  <div key={k} className={`p-3 rounded-xl ${isDark ? 'bg-white/5' : 'bg-slate-50'}`}>
                    <div className="text-[10px] font-bold uppercase tracking-wider text-sky-500">{k}</div>
                    {say && <div className="mt-1 italic">“{say}”</div>}
                    {facts && <div className={say ? `mt-2 text-[11px] ${muted}` : 'mt-1'}>{say && <span className="font-semibold not-italic">Facts: </span>}{facts}</div>}
                  </div>
                ))}
              </div>
              {desc?.language_today && (
                <div className="flex flex-wrap gap-2 text-[11px]">
                  {[['Rain', desc.language_today.rain], ['Temperature', desc.language_today.temperature], ['Wind', desc.language_today.wind]].map(([k, l]) => (
                    <div key={k} className={`px-3 py-2 rounded-xl border ${isDark ? 'border-white/10' : 'border-slate-200'}`}>
                      <span className="font-bold">{k}: {l.level || l.band}</span>
                      <span className={muted}> - may say “{l.use.slice(0, 2).join('”, “')}”; never “{l.avoid.slice(-2).join('”, “')}”</span>
                    </div>
                  ))}
                  {desc.language_today.extras.map((e) => (
                    <div key={e.kind} className="px-3 py-2 rounded-xl border border-amber-500/30 bg-amber-500/10"><span className="font-bold capitalize">{e.kind.replace('_', ' ')}</span> - {e.note}</div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {/* phrasebook */}
        <div className={`rounded-2xl border ${card}`}>
          <button onClick={() => setPhrasesOpen((o) => !o)} className="w-full p-5 flex items-center gap-2 text-sm font-black uppercase tracking-wide">
            <BookOpen size={16} className="text-sky-500" /> Weather phrases
            <span className={`normal-case font-semibold text-xs ${muted}`}>- what Ims says for each kind of weather, and what he must not</span>
            <ChevronDown size={16} className={`ml-auto transition-transform ${phrasesOpen ? 'rotate-180' : ''}`} />
          </button>
          {phrasesOpen && phrases && (
            <div className="px-5 pb-5 space-y-5">
              {[['Rain', phrases.rain, 'level'], ['Temperature (by the day\'s top)', phrases.temperature, 'band'], ['Wind (by the strongest gust)', phrases.wind, 'band']].map(([title, rows, k]) => (
                <div key={title}>
                  <div className="text-xs font-black uppercase tracking-wider text-sky-500 mb-2">{title}</div>
                  <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-2">
                    {rows.map((r) => (
                      <div key={r[k]} className={`p-3 rounded-xl text-xs ${isDark ? 'bg-white/5' : 'bg-slate-50'}`}>
                        <div className="font-bold capitalize">{r[k]}{r.when && <span className={`font-normal normal-case ${muted}`}> - {r.when}</span>}</div>
                        <div className="mt-1.5 text-emerald-600 dark:text-emerald-400">“{r.use.join('”, “')}”</div>
                        <div className={`mt-1 ${muted}`}>Never: {r.avoid.join(', ')}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              <div>
                <div className="text-xs font-black uppercase tracking-wider text-sky-500 mb-2">Fog, frost, snow, thunder, sun and muggy days</div>
                <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-2">
                  {phrases.other.map((r) => (
                    <div key={r.kind} className={`p-3 rounded-xl text-xs ${isDark ? 'bg-white/5' : 'bg-slate-50'}`}>
                      <div className="font-bold capitalize">{r.kind.replace('_', ' ')} <span className={`font-normal normal-case ${muted}`}>- {r.when}</span></div>
                      <div className="mt-1.5 text-emerald-600 dark:text-emerald-400">“{r.use.join('”, “')}”</div>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <div className="text-xs font-black uppercase tracking-wider text-sky-500 mb-1">Unusual for the time of year</div>
                <p className={`text-xs mb-2 ${muted}`}>Each forecast day is checked against the same fortnight of the year over the last 10 years at that place. When it stands out, Ims makes a fresh remark of his own - these are only examples of the kind of thing.</p>
                <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-2">
                  {phrases.unusual.map((r) => (
                    <div key={r.kind} className="p-3 rounded-xl text-xs border border-amber-500/30 bg-amber-500/5">
                      <div className="font-bold">{r.label}</div>
                      <div className="mt-1.5 italic">“{r.example}”</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        <p className={`text-[10px] ${muted}`}>{data?.source}. History for “unusual” comes from the Open-Meteo archive.</p>
      </div>
    </PortalShell>
  );
}
