// Weather in the IMS design (24 Oct 2026): the forecast for home or a saved place - the chosen day large, the days
// ahead (up to 16) as a strip, hour by hour for the next 48 hours - then what Ims will say about it and the phrasebook
// he picks his words from. Places as chips across the top; Add a place is the button in the bottom right (and home
// can be changed there). The same /api/weather requests as before (Dashboard/WeatherPortal.jsx).
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Sun, Moon, CloudSun, CloudMoon, Cloud, CloudDrizzle, CloudRain, CloudRainWind, CloudSnow, CloudLightning, CloudFog, Navigation } from 'lucide-react';
import ServicePage, { Fab } from './ServicePage';
import { Icon, IconButton, Btn, Sheet, TextField, FilterChip, useSnack, Spinner } from '../HomebrewBeta/ui';

const ICONS = { sun: [Sun, '#e0a100'], moon: [Moon, '#7c8a9a'], partly: [CloudSun, '#e0a100'], 'partly-night': [CloudMoon, '#7c8a9a'], cloud: [Cloud, '#7c8a9a'], drizzle: [CloudDrizzle, '#38a3d8'], rain: [CloudRain, '#1f8fbf'], 'heavy-rain': [CloudRainWind, '#2563eb'], snow: [CloudSnow, '#5fc6e0'], storm: [CloudLightning, '#8b5cf6'], fog: [CloudFog, '#7c8a9a'] };
const Wx = ({ kind, size = 28 }) => { const [I, c] = ICONS[kind] || ICONS.cloud; return <I size={size} color={c} strokeWidth={1.8} aria-hidden="true" />; };
const COMPASS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
const RAIN = { dry: 'Dry', chance: 'A chance of rain', light: 'Light rain', moderate: 'Rain', heavy: 'Heavy rain' };
const dayName = (date, today) => (today ? 'Today' : new Date(`${date}T12:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric' }));
const json = async (url, method, body) => { const j = await (await fetch(url, { method, headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined })).json(); if (!j.success) throw new Error(j.error || 'That didn\'t work.'); return j; };

function Body() {
  const snack = useSnack();
  const [place, setPlace] = useState('');
  const [data, setData] = useState(null);
  const [places, setPlaces] = useState({ home: null, places: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [dayIdx, setDayIdx] = useState(0);
  const [phrases, setPhrases] = useState(null);
  const [adding, setAdding] = useState(false);
  const [newPlace, setNewPlace] = useState('');
  const [asHome, setAsHome] = useState(false);

  const loadPlaces = useCallback(() => fetch('/api/weather/places').then((r) => r.json()).then((j) => j.success && setPlaces(j)).catch(() => {}), []);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const j = await (await fetch(`/api/weather?days=16${place ? `&location=${encodeURIComponent(place)}` : ''}`)).json();
      if (!j.success) throw new Error(j.weather?.error || j.error || 'The weather isn\'t available just now.');
      setData(j.weather); setError(null); setDayIdx(0);
    } catch (e) { setError(e.message); } finally { setLoading(false); }
  }, [place]);
  useEffect(() => { loadPlaces(); }, [loadPlaces]);
  useEffect(() => { load(); }, [load]);
  const openPhrases = (open) => { if (open && !phrases) fetch('/api/weather/phrases').then((r) => r.json()).then((j) => setPhrases(j.phrases)).catch(() => {}); };

  const add = async () => {
    try {
      if (asHome) { const j = await json('/api/weather/home', 'PUT', { query: newPlace }); setPlace(''); snack(`Home is now ${j.home.name}.`); }
      else { await json('/api/weather/places', 'POST', { query: newPlace }); snack('Place saved.'); }
      setNewPlace(''); setAdding(false); setAsHome(false); loadPlaces();
    } catch (e) { snack(e.message, { error: true }); }
  };
  const remove = async (name) => { try { await json(`/api/weather/places/${encodeURIComponent(name)}`, 'DELETE'); if (place === name) setPlace(''); loadPlaces(); snack(`${name} removed.`); } catch (e) { snack(e.message, { error: true }); } };
  const makeHome = async (name) => { try { const j = await json('/api/weather/home', 'PUT', { query: name }); setPlace(''); loadPlaces(); snack(`Home is now ${j.home.name}.`); } catch (e) { snack(e.message, { error: true }); } };

  const days = data?.forecast || [];
  const day = days[dayIdx];
  const hours = useMemo(() => (data?.hourly || []).filter((h) => !day || dayIdx === 0 || h.date === day.date), [data, day, dayIdx]);
  const desc = data?.description;

  return (
    <>
      <div className="chips wrap">
        <FilterChip on={!place} onClick={() => setPlace('')} lead={<Icon n="home" size={18} />}>{places.home?.name || 'Home'}</FilterChip>
        {places.places.map((p) => (
          <span key={p.name} className={`chip sl imsm-placechip ${place === p.name ? 'on' : ''}`}>
            <button type="button" onClick={() => setPlace(p.name)} title={[p.region, p.country].filter(Boolean).join(', ')}><Icon n="place" size={18} />{p.name}</button>
            <IconButton icon="close" label={`Remove ${p.name}`} onClick={() => remove(p.name)} />
          </span>
        ))}
        {place && <Btn kind="tonal" icon="home" onClick={() => makeHome(place)}>Make {place} home</Btn>}
        <span className="grow" />
        <IconButton icon="sync" label="Fetch the forecast again" onClick={load} />
      </div>
      <p className="muted" style={{ margin: 0 }}>Home is <b>{places.home?.name || '…'}</b>{places.home?.region ? `, ${places.home.region}` : ''}: Ims, the day report and the Run planner use it unless you name somewhere else.</p>
      {error && <div className="imsm-banner"><Icon n="info" size={20} /><span>{error}</span></div>}
      {loading && !data && <div className="imsm-empty"><Spinner /></div>}
      {/* Met Office warnings in force for home's county (26 Oct) - the same ones the Box-3 shows */}
      {(data?.warnings || []).map((w) => (
        <a key={`${w.level}-${w.type}-${w.until}`} className={`imsm-wxwarn ${w.level}`} href={w.link} target="_blank" rel="noreferrer">
          <Icon n="warn" size={26} />
          <span className="t"><b>{w.text[0].toUpperCase() + w.text.slice(1)}</b><small>Until {w.until_text} · {w.areas.length > 3 ? `${w.areas.slice(0, 3).join(', ')} and more` : w.areas.join(', ')}</small></span>
          <Icon n="open" size={20} />
        </a>
      ))}

      {data && day && (
        <>
          <section className="imsm-card imsm-wx">
            <div className="today">
              <div className="when">{dayIdx === 0 ? 'Today' : new Date(`${day.date}T12:00`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}</div>
              <div className="big">
                <Wx kind={day.icon} size={72} />
                <span className="temps"><b>{day.max_temp_c}°</b><span>{day.min_temp_c}°</span></span>
                <span className="cond">{day.condition}{day.wind_words && day.wind_words !== 'light winds' ? `, ${day.wind_words}` : ''}</span>
              </div>
              <p className="muted">{dayIdx === 0 ? 'Rest of today: ' : ''}{day.summary}</p>
              <div className="tags-row">
                <span className="tag"><Icon n="sun" size={16} />Up {day.sunrise}</span>
                <span className="tag"><Icon n="moon" size={16} />Down {day.sunset}</span>
                <span className="tag">UV {day.uv_max}</span>
                {day.reliability !== 'good' && <span className="tag warn">Reliability: {day.reliability}</span>}
              </div>
              {day.unusual && <div className="imsm-banner info"><Icon n="sparkle" size={20} /><span>{day.unusual.notes.map((n) => n.text).join(' ')}</span></div>}
            </div>
            <div className="days" role="listbox" aria-label="The days ahead">
              {days.map((d, i) => (
                <button key={d.date} type="button" role="option" aria-selected={i === dayIdx} className={`d sl ${i === dayIdx ? 'on' : ''}`} onClick={() => setDayIdx(i)}>
                  <b>{dayName(d.date, d.is_today)}</b>
                  <Wx kind={d.icon} size={30} />
                  <span><b>{d.max_temp_c}°</b> <span className="muted">{d.min_temp_c}°</span></span>
                  <i className={`rain ${d.rain_level}`} title={RAIN[d.rain_level] || d.rain_level} />
                  {i > 7 && <small className="muted">Rough guide</small>}
                </button>
              ))}
            </div>
          </section>

          <section className="imsm-card">
            <h3>Hour by hour</h3>
            {!hours.length ? <p className="muted" style={{ margin: 0 }}>Hour-by-hour covers the next 48 hours; this day has the summary above.</p> : (
              <div className="imsm-hours">
                {hours.map((h, i) => (
                  <div key={h.time} className="h">
                    <b>{String(h.hour).padStart(2, '0')}:00</b>
                    <small className="muted">{h.hour === 0 && i > 0 ? new Date(`${h.date}T12:00`).toLocaleDateString('en-GB', { weekday: 'short' }) : ' '}</small>
                    <Wx kind={h.icon} size={26} />
                    <b className="t">{h.temp_c}°</b>
                    <span className={h.rain_probability_percent >= 10 ? 'wet' : 'muted'}>{h.rain_probability_percent ?? '–'}%</span>
                    <small className="muted">{h.rain_mm > 0 ? `${h.rain_mm} mm` : ' '}</small>
                    <span className="wind" title={`${h.wind_mph} mph from the ${h.wind_direction}`}>{h.wind_mph}<Navigation size={11} style={{ transform: `rotate(${COMPASS.indexOf(h.wind_direction) * 22.5 + 180 - 45}deg)` }} /></span>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="imsm-card">
            <h3>What Ims will say</h3>
            <p className="muted" style={{ margin: 0 }}>Roughly how he'll put it, using the words from the phrasebook below. He words it fresh each time, so it won't be exactly this, but it'll be no stronger or weaker. The plain facts he's given are underneath.</p>
            <div className="imsm-grid">
              {[['Now', null, desc?.now], ['Rest of today', data.sounds_like?.rest_of_today, desc?.rest_of_today], ['Tonight', data.sounds_like?.tonight, desc?.tonight?.replace(/^Overnight: /, '')], ['Tomorrow', data.sounds_like?.tomorrow, desc?.tomorrow?.replace(/^Tomorrow: /, '')]]
                .filter(([, say, facts]) => say || facts).map(([k, say, facts]) => (
                  <div key={k} className="imsm-say">
                    <span className="imsm-label">{k}</span>
                    {say && <p className="q">“{say}”</p>}
                    {facts && <p className="muted">{say ? 'The facts: ' : ''}{facts}</p>}
                  </div>
                ))}
            </div>
            {desc?.language_today && (
              <div className="chips wrap">
                {[['Rain', desc.language_today.rain], ['Temperature', desc.language_today.temperature], ['Wind', desc.language_today.wind]].map(([k, l]) => (
                  <span key={k} className="tag quiet" style={{ height: 'auto', padding: '6px 12px' }}><b>{k}: {l.level || l.band}.</b>&nbsp;May say “{l.use.slice(0, 2).join('”, “')}”; never “{l.avoid.slice(-2).join('”, “')}”</span>
                ))}
                {desc.language_today.extras.map((e) => <span key={e.kind} className="tag warn" style={{ height: 'auto', padding: '6px 12px' }}>{e.kind.replace('_', ' ')}: {e.note}</span>)}
              </div>
            )}
          </section>
        </>
      )}

      <details className="imsm-fold" onToggle={(e) => openPhrases(e.currentTarget.open)}>
        <summary><Icon n="book" size={20} /><span>The weather phrasebook</span><Icon n="down" size={22} /></summary>
        <div style={{ padding: '0 16px 16px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {!phrases ? <Spinner /> : (
            <>
              {[['Rain', phrases.rain, 'level'], ['Temperature (by the day\'s top)', phrases.temperature, 'band'], ['Wind (by the strongest gust)', phrases.wind, 'band']].map(([title, rows, k]) => (
                <div key={title}>
                  <span className="imsm-label">{title}</span>
                  <div className="imsm-grid">{rows.map((r) => <div key={r[k]} className="imsm-say"><b style={{ textTransform: 'capitalize' }}>{r[k]}</b>{r.when && <span className="muted"> · {r.when}</span>}<p className="q good">“{r.use.join('”, “')}”</p><p className="muted">Never: {r.avoid.join(', ')}</p></div>)}</div>
                </div>
              ))}
              <div>
                <span className="imsm-label">Fog, frost, snow, thunder, sun and muggy days</span>
                <div className="imsm-grid">{phrases.other.map((r) => <div key={r.kind} className="imsm-say"><b style={{ textTransform: 'capitalize' }}>{r.kind.replace('_', ' ')}</b><span className="muted"> · {r.when}</span><p className="q good">“{r.use.join('”, “')}”</p></div>)}</div>
              </div>
              <div>
                <span className="imsm-label">Unusual for the time of year</span>
                <p className="muted" style={{ marginTop: 0 }}>Each day is checked against the same fortnight over the last 10 years at that place. When it stands out, Ims makes a fresh remark of his own; these are only examples.</p>
                <div className="imsm-grid">{phrases.unusual.map((r) => <div key={r.kind} className="imsm-say"><b>{r.label}</b><p className="q">“{r.example}”</p></div>)}</div>
              </div>
            </>
          )}
        </div>
      </details>
      <p className="muted" style={{ fontSize: 12 }}>{data?.source}. History for “unusual” comes from the Open-Meteo archive.</p>

      <Sheet open={adding} onClose={() => setAdding(false)} title="Add a place"
        footer={<div className="imsm-row end"><Btn kind="text" onClick={() => setAdding(false)}>Cancel</Btn><Btn icon={asHome ? 'home' : 'add'} disabled={!newPlace.trim()} onClick={add}>{asHome ? 'Make it home' : 'Save it'}</Btn></div>}>
        <div className="imsm-form">
          <TextField label="A town, city or postcode" value={newPlace} onChange={setNewPlace} autoFocus onKeyDown={(e) => { if (e.key === 'Enter' && newPlace.trim()) add(); }} />
          <label className="imsm-row" style={{ cursor: 'pointer' }}><span className="imsm-switch"><input type="checkbox" checked={asHome} onChange={(e) => setAsHome(e.target.checked)} /><i /></span>Make it home (the old home moves into your places)</label>
        </div>
      </Sheet>
      <Fab label="Add a place" icon="place" onClick={() => setAdding(true)} />
    </>
  );
}

export default function Weather({ theme = 'light', onThemeToggle, setCurrentPath }) {
  return (
    <ServicePage title="Weather" icon="cloud" accent="sky" theme={theme} onThemeToggle={onThemeToggle} setCurrentPath={setCurrentPath} wide sub="Forecasts for home and your places, up to 16 days ahead, and the words Ims uses.">
      <Body />
    </ServicePage>
  );
}
