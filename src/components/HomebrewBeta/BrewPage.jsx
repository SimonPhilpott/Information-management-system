// Homebrew (beta): one recipe or brew. The hero (its vessel, grown from the card you tapped), the facts, the stage
// track for a brew, then tabs: a recipe's ingredients, method and notes; a brew's recipe, log, tastings and
// insights. One action bar at the bottom (beside the title on a wide screen), everything else in the overflow menu.
import React, { useEffect, useRef, useState } from 'react';
import Vessel from './Vessel';
import {
  look, colourOf, sweetOf, strengthOf, bottlesOf, WINE_COLOURS, SWEETNESS, ACIDITY, FIZZ, FLAVOUR_TAGS, BASIS_WORD, STATUS_WORD, TRACK,
  ING_STAGES, ING_EMOJI, KIND_LABEL, PROFILE_KEYS, parseSteps, ingText, g3, abbrMatches, ABBR, ABBR_UNITS,
} from './brewData';
import { glossTerms } from '../Dashboard/brewGlossary';
import { api, activityOf, ACTIVITY_WORD, readingsOf, relDay, timeOf, shortDate, moveBrew, pitchReminders, ACTIVE } from './logic';
import {
  Icon, IconButton, Btn, Tabs, useAxis, Sheet, Confirm, Menu, useMenu, useSnack, TextField, TextArea, SelectField, Slider, SaveButton,
  RichText, useScrollState, useCountUp, Spinner, useInView,
} from './ui';
import { FavButton, tintOf } from './Shelf';
import { Brand } from './brand';
import { PictureSheet, LabelsSheet, LiquidSheet } from './Tools';
import { StageTools } from './Calculators';
import { qty, batch, useSystem } from './units';
import { useIngredientPictures, picMapOf, pictureFor } from './ingredientPics';

const STAGE_HEAD = { primary: 'To start', secondary: 'Later, in secondary', backsweeten: 'To back-sweeten', bottling: 'At bottling' };
const KIND_ICON = { reading: 'chart', note: 'note', bottle: 'wine', nutrient: 'flask', rack: 'flask', addition: 'add', degas: 'flask', stabilise: 'check', backsweeten: 'add' };

// main-ingredient photos (made the first time a recipe is opened; asked for again until ready)
function useMainIngredients(id) {
  const [main, setMain] = useState({ items: [], colour: null, banner: null });
  useEffect(() => {
    let stop = false, timer = null, tries = 0;
    setMain({ items: [], colour: null, banner: null });
    if (!id) return undefined;
    const load = async () => {
      try {
        const d = await (await fetch(`/api/homebrew/${id}/main-ingredients`)).json();
        if (stop) return;
        setMain({ items: d.items || [], colour: d.colour || null, banner: d.banner?.ready ? d.banner.key : null });
        if (d.pending && ++tries < 30) timer = setTimeout(load, 4000);
      } catch (_) { /* pictures are optional */ }
    };
    load();
    return () => { stop = true; clearTimeout(timer); };
  }, [id]);
  return main;
}

// a value that counts up when the page opens
function CountFact({ k, value, decimals = 0, prefix = '', suffix = '', hi, title }) {
  const v = useCountUp(value, { decimals, from: decimals === 3 ? Number(value) + 0.03 : 0 });
  return (
    <div className={`fact ${hi ? 'hi' : ''}`} title={title}>
      <div className="k">{k}</div>
      <div className="v num">{value == null ? '–' : `${prefix}${v}${suffix}`}</div>
    </div>
  );
}
const Fact = ({ k, v, title }) => <div className="fact" title={title}><div className="k">{k}</div><div className="v">{v ?? '–'}</div></div>;

// where a brew is in its life; tap a stage to move it there
function StageTrack({ status, onPick, busy }) {
  const at = TRACK.indexOf(status);
  return (
    <div className="track" role="group" aria-label="Stage">
      {TRACK.map((s, i) => (
        <React.Fragment key={s}>
          {i > 0 && <div className={`seg ${i <= at ? 'done' : ''}`}><i /></div>}
          <button type="button" className={`node sl ${i < at ? 'done' : ''} ${i === at ? 'now' : ''}`} style={{ borderRadius: 12, padding: '4px 0' }}
            disabled={busy || s === status || !onPick} onClick={() => onPick(s)} aria-current={i === at ? 'step' : undefined}
            aria-label={s === status ? `${STATUS_WORD[s]} (now)` : `Move to ${STATUS_WORD[s]}`}>
            <span className="dot">{i < at ? <Icon n="check" size={16} /> : i === at && busy ? <Spinner size={14} /> : null}</span>
            <span>{STATUS_WORD[s]}</span>
          </button>
        </React.Fragment>
      ))}
    </div>
  );
}

// the fermentation curve: draws itself in, ending on a pulse at the latest reading
function GravityChart({ brew }) {
  const pts = readingsOf(brew).map((l) => ({ t: l.at, g: Number(l.gravity) }));
  const ref = useRef(null);
  const seen = useInView(ref, { once: true });
  if (pts.length < 2) {
    return <p className="muted" style={{ padding: '8px 0' }}>Log two or more gravity readings to see the fermentation curve.</p>;
  }
  const W = 600, H = 200, L = 52, R = 16, T = 16, B = 28;
  const third = brew.calc?.thirdBreak;
  const og = brew.og ? Number(brew.og) : null;
  const gs = pts.map((p) => p.g).concat(third ? [third] : []).concat(og ? [og] : []);
  const gMax = Math.max(...gs) + 0.002, gMin = Math.min(...gs) - 0.002;
  const t0 = pts[0].t, t1 = pts[pts.length - 1].t;
  const x = (t) => L + ((t - t0) / Math.max(1, t1 - t0)) * (W - L - R);
  const y = (g) => T + ((gMax - g) / Math.max(0.001, gMax - gMin)) * (H - T - B);
  const last = pts[pts.length - 1];
  const ticks = [gMax - 0.002, (gMax + gMin) / 2, gMin + 0.002];
  return (
    <svg ref={ref} key={`${pts.length}-${seen}`} className="chart" viewBox={`0 0 ${W} ${H}`} role="img"
      aria-label={`Gravity fell from ${pts[0].g.toFixed(3)} to ${last.g.toFixed(3)} over ${pts.length} readings`}>
      {ticks.map((g, i) => <g key={i}><line x1={L} x2={W - R} y1={y(g)} y2={y(g)} stroke="var(--outline-var)" /><text x={0} y={y(g) + 4}>{g.toFixed(3)}</text></g>)}
      {third && <g><line x1={L} x2={W - R} y1={y(third)} y2={y(third)} stroke="var(--primary)" strokeDasharray="5 5" strokeOpacity=".7" /><text x={W - R} y={y(third) - 6} textAnchor="end" style={{ fill: 'var(--primary)' }}>1/3 break {third.toFixed(3)}</text></g>}
      {seen && <polyline className="line" pathLength="1" points={pts.map((p) => `${x(p.t)},${y(p.g)}`).join(' ')} fill="none" stroke="var(--primary)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />}
      {seen && pts.slice(0, -1).map((p, i) => <circle key={i} cx={x(p.t)} cy={y(p.g)} r="3.5" fill="var(--primary)" opacity=".55" />)}
      {seen && <circle className="ring" cx={x(last.t)} cy={y(last.g)} r="6" fill="none" stroke="var(--primary)" strokeWidth="2" />}
      {seen && <circle className="end" cx={x(last.t)} cy={y(last.g)} r="6" fill="var(--primary)" />}
      <text x={L} y={H - 6}>{shortDate(t0)}</text>
      <text x={W - R} y={H - 6} textAnchor="end">{shortDate(t1)}</text>
    </svg>
  );
}

function ProfileBars({ values, compare }) {
  const rows = PROFILE_KEYS.filter(([k]) => values?.[k] != null || compare?.[k] != null);
  if (!rows.length) return null;
  return (
    <div className="bars">
      {rows.map(([k, label], i) => (
        <div key={k} className="row">
          <span className="muted">{label}</span>
          <span className="track2">
            {compare?.[k] != null && <i className="was" style={{ width: `${(compare[k] / 5) * 100}%`, animationDelay: `${i * 60}ms` }} />}
            {values?.[k] != null && <i className={compare ? 'now' : ''} style={{ width: `${(values[k] / 5) * 100}%`, animationDelay: `${i * 60 + 80}ms` }} />}
          </span>
          <span className="num" style={{ textAlign: 'right' }}>{compare?.[k] != null ? `${compare[k]}→` : ''}{values?.[k] ?? '–'}</span>
        </div>
      ))}
    </div>
  );
}

// every brewing term and abbreviation the recipe uses, with what it means
function TermsPanel({ texts }) {
  const terms = glossTerms(...texts);
  const abbrs = [...new Set(texts.flatMap((t) => abbrMatches(t).map((m) => m.key)))].filter((k) => !ABBR_UNITS.has(k) && !['°C', '°F'].includes(k));
  if (!terms.length && !abbrs.length) return null;
  return (
    <details className="terms">
      <summary className="sl"><Icon n="info" size={20} /><span style={{ flex: 1 }}>What the brewing words mean ({terms.length + abbrs.length})</span><span className="chev"><Icon n="down" /></span></summary>
      <dl>
        {terms.map((t) => <div key={t.term}><dt>{t.term}: </dt><dd>{t.meaning}</dd></div>)}
        {abbrs.map((k) => <div key={k}><dt>{k}: </dt><dd>{ABBR[k]}</dd></div>)}
      </dl>
    </details>
  );
}

// each ingredient as a small card: its picture (the one chosen in Ingredient pictures, else the one made for it, else
// its kind's emoji), its name and how much
function Ingredients({ brew }) {
  const sys = useSystem(); // metric or imperial
  const listing = useIngredientPictures();
  const pics = React.useMemo(() => picMapOf(listing), [listing]);
  const groups = ING_STAGES.map((st) => [st, (brew.ingredients || []).filter((g) => (g.stage || 'primary') === st && g.name)]).filter(([, l]) => l.length);
  if (!groups.length) return <p className="muted">No ingredients listed yet.</p>;
  let n = 0;
  return groups.map(([st, list]) => (
    <React.Fragment key={st}>
      {groups.length > 1 && <div className="stage-k">{STAGE_HEAD[st]}</div>}
      <div className="icards">
        {list.map((g, i) => {
          const ing = pictureFor(pics, g.name);
          const amount = qty(g.amount, g.unit, sys);
          return (
            <div key={i} className="icard" style={{ animationDelay: `${Math.min(n++, 12) * 30}ms` }}>
              <span className="pic" aria-hidden="true">{ing ? <img src={`/api/homebrew/picture/${ing.key}`} alt="" loading="lazy" onError={(e) => { e.currentTarget.replaceWith(document.createTextNode(ING_EMOJI[g.type] || '🧪')); }} /> : (ING_EMOJI[g.type] || '🧪')}</span>
              <span className="tx">
                <span className="nm"><RichText text={g.name} /></span>
                {amount && (
                  <span className="st">
                    <b className="amt"><RichText text={amount} /></b>
                  </span>
                )}
              </span>
            </div>
          );
        })}
      </div>
    </React.Fragment>
  ));
}
function Method({ brew }) {
  const steps = parseSteps(brew.method);
  if (!steps.length) return <p className="muted">No method written yet.</p>;
  return <ol className="steps">{steps.map((s, i) => <li key={i}><span className="no">{i + 1}</span><span style={{ minWidth: 0 }}><RichText text={s} /></span></li>)}</ol>;
}
function Extras({ brew }) {
  const rows = [['Yeast', brew.yeast], ['Pitching', brew.yeastNotes], ['Nutrients', brew.nutrients], ['Water', brew.water]].filter(([, v]) => v);
  if (!rows.length) return null;
  return <div className="kv" style={{ flexDirection: 'column', gap: 8 }}>{rows.map(([k, v]) => <span key={k}><b>{k}</b><RichText text={v} /></span>)}</div>;
}

// ---- the log: a reading, a nutrient dose, racking, a note... ----
const EMPTY_LOG = { kind: 'reading', gravity: '', tempC: '', ph: '', text: '', at: '' };
function LogSheet({ open, onClose, brew, kinds, onSaved }) {
  const [f, setF] = useState(EMPTY_LOG);
  const snack = useSnack();
  useEffect(() => { if (open) setF(EMPTY_LOG); }, [open]);
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v }));
  const save = async () => {
    try {
      const d = await api(`/api/homebrew/${brew.id}/logs`, 'POST', { ...f, at: f.at || undefined });
      onSaved(d.brew);
      setTimeout(onClose, 650);
      return true;
    } catch (e) { snack(e.message, { error: true }); return false; }
  };
  return (
    <Sheet open={open} onClose={onClose} title="Log an entry" footer={<><Btn kind="text" onClick={onClose}>Cancel</Btn><SaveButton label="Log it" doneLabel="Logged" onSave={save} big={false} /></>}>
      <div className="fgrid" style={{ paddingTop: 8 }}>
        <SelectField className="full" label="What" value={f.kind} onChange={set('kind')} options={kinds.map((k) => [k, KIND_LABEL[k] || k])} />
        <TextField label="Gravity" type="number" inputMode="decimal" step="0.001" value={f.gravity} onChange={set('gravity')} placeholder="1.042" help={f.kind === 'reading' ? 'e.g. 1.042' : undefined} />
        <TextField label="Temperature (°C)" type="number" inputMode="decimal" step="0.5" value={f.tempC} onChange={set('tempC')} />
        <TextField label="pH" type="number" inputMode="decimal" step="0.1" value={f.ph} onChange={set('ph')} />
        <TextField label="When" type="datetime-local" value={f.at} onChange={set('at')} help="Leave empty for now" />
        <TextArea className="full" label="Note" rows={2} value={f.text} onChange={set('text')} help="e.g. 1.5 g Fermaid-O, degassed" />
      </div>
      <p className="t-bs muted" style={{ marginTop: 16 }}>Or just tell Ims: "log a reading of ten forty-two on the {brew?.name?.toLowerCase() || 'mead'}".</p>
    </Sheet>
  );
}

const EMPTY_TASTE = { stage: '', rating: 7, sweetness: 3, body: 3, acidity: 3, heat: 2, aroma: '', flavour: '', clarity: '', carbonation: '', verdict: '', changeNext: '' };
function TastingSheet({ open, onClose, brew, onSaved }) {
  const [t, setT] = useState(EMPTY_TASTE);
  const snack = useSnack();
  useEffect(() => { if (open) setT({ ...EMPTY_TASTE, stage: brew?.status === 'bottled' ? 'bottled' : brew?.status === 'conditioning' ? 'at racking' : '' }); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (k) => (v) => setT((x) => ({ ...x, [k]: v }));
  const save = async () => {
    try {
      const d = await api(`/api/homebrew/${brew.id}/tastings`, 'POST', t);
      onSaved(d.brew);
      setTimeout(onClose, 650);
      return true;
    } catch (e) { snack(e.message, { error: true }); return false; }
  };
  return (
    <Sheet open={open} onClose={onClose} title="How it tasted" footer={<><Btn kind="text" onClick={onClose}>Cancel</Btn><SaveButton label="Save tasting" onSave={save} big={false} /></>}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20, paddingTop: 8 }}>
        <TextField label="When in its life" value={t.stage} onChange={set('stage')} help="e.g. at racking, bottled, 3 months" />
        <Slider label="Rating" value={t.rating} onChange={set('rating')} min={1} max={10} />
        <div className="fgrid">
          <Slider label="Sweetness" value={t.sweetness} onChange={set('sweetness')} min={1} max={5} lo="Dry" hi="Sweet" />
          <Slider label="Body" value={t.body} onChange={set('body')} min={1} max={5} lo="Thin" hi="Full" />
          <Slider label="Acidity" value={t.acidity} onChange={set('acidity')} min={1} max={5} lo="Flat" hi="Tart" />
          <Slider label="Alcohol heat" value={t.heat} onChange={set('heat')} min={1} max={5} lo="Smooth" hi="Hot" />
        </div>
        <div className="fgrid">
          <TextField label="Aroma" value={t.aroma} onChange={set('aroma')} help="honey, pear, floral" />
          <TextField label="Flavour" value={t.flavour} onChange={set('flavour')} />
          <TextField label="Clarity" value={t.clarity} onChange={set('clarity')} help="hazy, clear, brilliant" />
          <TextField label="Fizz" value={t.carbonation} onChange={set('carbonation')} help="still, petillant, sparkling" />
          <TextField className="full" label="Was it nice?" value={t.verdict} onChange={set('verdict')} />
          <TextField className="full" label="Change next time" value={t.changeNext} onChange={set('changeNext')} help="e.g. a bit more acid, ferment cooler" />
        </div>
      </div>
    </Sheet>
  );
}

function Insights({ brew, isOwner, onChanged }) {
  const snack = useSnack();
  const [busy, setBusy] = useState('');
  const [change, setChange] = useState('');
  const [whatIf, setWhatIf] = useState(null);
  const ins = brew.insight;
  const get = async () => {
    setBusy('insight');
    try { const d = await api(`/api/homebrew/${brew.id}/insight`, 'POST', {}); onChanged(d.brew); } catch (e) { snack(e.message, { error: true }); } finally { setBusy(''); }
  };
  const predict = async () => {
    if (!change.trim()) return;
    setBusy('whatif');
    try { const d = await api(`/api/homebrew/${brew.id}/what-if`, 'POST', { change }); setWhatIf(d.result); } catch (e) { snack(e.message, { error: true }); } finally { setBusy(''); }
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <h2 style={{ flex: 1 }}>Flavour profile and insight</h2>
          {isOwner && <Btn kind={ins ? 'tonal' : 'filled'} icon="sparkle" busy={busy === 'insight'} onClick={get}>{ins ? 'Refresh' : 'Get insight'}</Btn>}
        </div>
        {busy === 'insight' && <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}><div className="lin"><i /></div><p className="muted">Reading the recipe, the log and your tastings. This takes about 15 seconds.</p></div>}
        {!ins && busy !== 'insight' && <p className="muted">Reads the recipe, the log and your tastings (and your other brews, to learn what you like), then says where this one is heading and what to tweak.</p>}
        {ins && (
          <div className="enter" style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 4 }}>
            <p className="t-tm">{ins.profile?.style}{ins.profile?.expectedAbv ? ` · about ${ins.profile.expectedAbv}%` : ''}{ins.profile?.expectedFg ? ` · FG about ${g3(ins.profile.expectedFg)}` : ''}</p>
            <ProfileBars values={ins.profile} />
            {ins.profile?.aroma && <p><b>Aroma:</b> <RichText text={ins.profile.aroma} /></p>}
            {ins.profile?.flavour && <p><b>Flavour:</b> <RichText text={ins.profile.flavour} /></p>}
            {ins.profile?.finish && <p><b>Finish:</b> <RichText text={ins.profile.finish} /></p>}
            {ins.progress && <p className="muted"><RichText text={ins.progress} /></p>}
            {ins.watchOuts?.length > 0 && <div><p className="t-ts" style={{ color: 'var(--error)', marginBottom: 4 }}>Watch out</p><ul style={{ margin: 0, paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 4 }}>{ins.watchOuts.map((w, i) => <li key={i}><RichText text={w} /></li>)}</ul></div>}
            {ins.nextSteps?.length > 0 && <div><p className="t-ts" style={{ marginBottom: 4 }}>Next steps</p><ul style={{ margin: 0, paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 4 }}>{ins.nextSteps.map((w, i) => <li key={i}><RichText text={w} /></li>)}</ul></div>}
            {ins.tweaks?.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <p className="t-ts">Tweaks for next time</p>
                {ins.tweaks.map((t, i) => (
                  <div key={i} className="card" style={{ background: 'var(--surface-c)', gap: 4 }}>
                    <p className="t-ts">{t.change}</p><p>{t.effect}</p>{t.why && <p className="muted">{t.why}</p>}
                    <Btn kind="text" icon="wand" onClick={() => { setChange(t.change); setWhatIf(null); }} style={{ alignSelf: 'flex-start', marginLeft: -12 }}>Try it in what-if</Btn>
                  </div>
                ))}
              </div>
            )}
            {ins.whatHeLikes && <p className="muted"><b>What you seem to like:</b> {ins.whatHeLikes}</p>}
            {brew.insightAt && <p className="t-bs muted">Updated {relDay(brew.insightAt)} at {timeOf(brew.insightAt)}</p>}
          </div>
        )}
      </div>
      <div className="card">
        <h2>What if…</h2>
        <p className="muted">Describe a change for next time and see what it would do to the brew.</p>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', flexWrap: 'wrap', marginTop: 8, '--fieldbg': 'var(--surface-c-low)' }}>
          <TextField label="The change" value={change} onChange={setChange} style={{ flex: '1 1 220px' }} onKeyDown={(e) => { if (e.key === 'Enter') predict(); }} help="e.g. swap 71B for EC-1118 and add 2 tsp acid blend" />
          <Btn kind="filled" icon="wand" busy={busy === 'whatif'} disabled={!change.trim()} onClick={predict} style={{ marginTop: 8 }}>Predict</Btn>
        </div>
        {whatIf && (
          <div className="enter" style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 8 }}>
            <p className="t-ts">{whatIf.summary}</p>
            <p className="t-bs muted">Now (grey) and with the change{whatIf.before?.abv || whatIf.after?.abv ? ` · strength ${whatIf.before?.abv ?? '?'}% → ${whatIf.after?.abv ?? '?'}%` : ''}{whatIf.after?.fg ? ` · FG → ${g3(whatIf.after.fg)}` : ''}</p>
            <ProfileBars values={whatIf.after} compare={whatIf.before} />
            {whatIf.flavour && <p><b>Taste:</b> {whatIf.flavour}</p>}
            {whatIf.process && <p><b>What you'd do differently:</b> {whatIf.process}</p>}
            {whatIf.risks && <p style={{ color: 'var(--error)' }}><b>Risks:</b> {whatIf.risks}</p>}
            {whatIf.confidence && <p className="muted">Confidence: {whatIf.confidence}</p>}
          </div>
        )}
      </div>
    </div>
  );
}

// ---- the page ----
export default function BrewPage({
  item, layout, isOwner, catLabel, family = [], kinds, onBack, backIcon = 'back', onEdit, onOpen, onChanged, onListChanged, onDeleted, onFav,
  request, artRef, hrefFor, onTool, onEditOther,
}) {
  const b = item;
  const snack = useSnack();
  const scroll = useRef(null);
  const heroArt = useRef(null);
  const { lifted } = useScrollState(scroll);
  const wide = layout === 'wide' || layout === 'xwide';
  const main = useMainIngredients(b?.id);
  const tabsFor = b?.isRecipe
    ? [['ingredients', 'Ingredients'], ['method', 'Method'], ['notes', 'Notes']]
    : [['recipe', 'Recipe'], ['log', 'Log'], ['tastings', 'Tastings'], ['insights', 'Insights']];
  const [tab, setTab] = useState(tabsFor[0][0]);
  const axis = useAxis(tabsFor.map(([v]) => v), tab);
  const [busy, setBusy] = useState('');
  const [sheet, setSheet] = useState(null); // 'log' | 'taste' | 'picture' | 'liquid' | 'labels'
  const sys = useSystem(); // metric or imperial, for amounts and batch sizes
  const [confirm, setConfirm] = useState(null);
  const [shareUrl, setShareUrl] = useState(null);
  const more = useMenu();
  const pdfMenu = useMenu();

  useEffect(() => { setTab(tabsFor[0][0]); setShareUrl(null); scroll.current?.scrollTo({ top: 0 }); }, [b?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (artRef) artRef.current = heroArt.current; });
  useEffect(() => {
    if (!request || !b || request.id !== b.id) return;
    if (request.kind === 'log') { setTab('log'); setSheet('log'); }
    if (request.kind === 'taste') { setTab('tastings'); setSheet('taste'); }
  }, [request?.at]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!b) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <div className="topbar"><IconButton icon={backIcon} label="Back" onClick={onBack} /></div>
        <div className="empty"><Spinner /><p>Opening…</p></div>
      </div>
    );
  }
  const full = Array.isArray(b.logs);
  // yours to change: your own brews (and, for Simon, the recipes). Everything else - someone else's brew, or the
  // recipes for an invited guest - is read only
  const canEdit = b.mine ?? isOwner;
  const c = b.calc || {};
  const run = async (key, fn) => { setBusy(key); try { await fn(); } catch (e) { snack(e.message, { error: true }); } finally { setBusy(''); } };
  const wine = colourOf(b);
  const wc = wine ? WINE_COLOURS.find((w) => w.id === wine) : null;
  const sw = SWEETNESS.find((s) => s.id === sweetOf(b));
  const ac = ACIDITY.find((a) => a.id === b.acidity);
  const fz = FIZZ.find((f) => f.id === b.fizz);
  const flavs = FLAVOUR_TAGS.filter((f) => (b.flavours || []).includes(f.id));
  const strength = strengthOf(b);
  const estStrength = !c.abv && !c.potentialAbv;
  const bottles = bottlesOf(b.batchLitres, b.category);
  const banner = b.bannerChoice ? b.banner : main.banner || b.banner;
  const activity = full ? activityOf(b) : activityOf({ ...b, logs: [] });
  const pics = (main.items || []).filter((i) => i.ready);

  // ---- actions ----
  const pdfFile = async () => {
    const res = await fetch(`/api/homebrew/${b.id}/pdf`);
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Couldn\'t make the PDF.');
    return new File([await res.blob()], `${b.name.replace(/[\\/:*?"<>|]+/g, '').trim() || 'Recipe'}.pdf`, { type: 'application/pdf' });
  };
  const saveFile = (file) => { const a = document.createElement('a'); a.href = URL.createObjectURL(file); a.download = file.name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); };
  const downloadPdf = () => run('pdf', async () => { saveFile(await pdfFile()); snack('PDF downloaded.'); });
  const sendPdf = () => run('pdf', async () => {
    const file = await pdfFile();
    if (navigator.canShare?.({ files: [file] })) {
      try { await navigator.share({ files: [file], title: b.name }); } catch (err) {
        if (err.name === 'AbortError') return;
        if (err.name === 'NotAllowedError') { snack('The PDF is ready.', { action: { label: 'Send', onClick: () => navigator.share({ files: [file], title: b.name }).catch(() => {}) } }); return; }
        throw err;
      }
    } else { saveFile(file); snack('This browser can\'t send files, so the PDF has been downloaded.'); }
  });
  const shareLink = () => run('share', async () => {
    const d = await api(`/api/homebrew/${b.id}/share`, 'POST', {});
    setShareUrl(d.url);
    onChanged({ ...b, shared: true });
    if (navigator.share) { try { await navigator.share({ title: b.name, text: `${b.name} - a homebrew recipe`, url: d.url }); return; } catch (err) { if (err.name === 'AbortError') return; } }
    try { await navigator.clipboard.writeText(d.url); snack('Link copied. Paste it into WhatsApp, a text or an email.'); } catch { snack('Here\'s the link, below the title.'); }
  });
  const stopSharing = () => run('share', async () => { await api(`/api/homebrew/${b.id}/share`, 'DELETE'); setShareUrl(null); onChanged({ ...b, shared: false }); snack('Stopped sharing. The old link no longer works.'); });
  const startBrew = () => run('start', async () => {
    const d = await api(`/api/homebrew/${b.id}/start`, 'POST', {});
    await onListChanged();
    snack(`New brew started from ${b.name}. Edit it to suit, then log as you go.`);
    onOpen(d.brew);
  });
  const keepAsRecipe = () => run('keep', async () => {
    const d = await api(`/api/homebrew/${b.id}/save-as-recipe`, 'POST', {});
    await onListChanged();
    snack('Saved to your recipe book.', d.brew ? { action: { label: 'Open', onClick: () => onOpen(d.brew) } } : {});
  });
  // a new version of a recipe: a copy in the same family (shown with the other versions), opened straight into its form
  const newVersion = () => run('version', async () => {
    const d = await api(`/api/homebrew/${b.id}/save-as-recipe`, 'POST', {});
    const named = await api(`/api/homebrew/${d.brew.id}`, 'PUT', { name: `${b.family || String(b.name).replace(/\s*\(.*$/, '')} (new version)` });
    await onListChanged();
    snack('New version made - change whatever you like.');
    onEditOther?.(named.brew || d.brew);
  });
  const stepReminders = () => run('steps', async () => {
    const d = await api(`/api/homebrew/${b.id}/step-reminders`, 'POST', {});
    snack(`${d.reminders.length} step reminder${d.reminders.length === 1 ? '' : 's'} set${d.reminders[0] ? `, the first on ${d.reminders[0].goesOffAt}` : ''}.`);
  });
  const move = (to) => setConfirm({
    title: `Move to ${STATUS_WORD[to]}?`,
    body: to === 'fermenting' && b.status === 'planning' ? 'It starts today. The move goes in the log, and you can set the nutrient and step reminders next.' : 'The move goes in the log, so you can see when it happened.',
    okLabel: 'Move it',
    onOk: () => run('stage', async () => {
      const from = b.status;
      const nb = await moveBrew(b, to);
      onChanged(nb);
      await onListChanged();
      if (from === 'planning' && to === 'fermenting') {
        snack(`${b.name} has started.`, { action: { label: 'Set reminders', onClick: () => run('remind', async () => { const r = await pitchReminders(nb); snack(`Nutrient reminders set${r.steps ? `, and ${r.steps} for the steps to come` : ''}.`); }) } });
      } else {
        snack(`${b.name}: ${STATUS_WORD[to].toLowerCase()}.`, { action: { label: 'Undo', onClick: () => run('stage', async () => { const back = await moveBrew(nb, from); onChanged(back); await onListChanged(); }) } });
      }
    }),
  });
  const remove = () => setConfirm({
    title: `Delete ${b.name}?`, body: b.isRecipe ? 'The recipe goes for good.' : 'The brew and everything logged for it go for good.', okLabel: 'Delete', danger: true,
    onOk: () => run('del', async () => { await api(`/api/homebrew/${b.id}`, 'DELETE'); await onListChanged(); snack(`Deleted ${b.name}.`); onDeleted(); }),
  });
  const delLog = (l) => setConfirm({
    title: 'Delete this entry?', body: `${KIND_LABEL[l.kind] || l.kind}${l.gravity ? ` ${g3(l.gravity)}` : ''}, ${relDay(l.at)}.`, okLabel: 'Delete', danger: true,
    onOk: () => run('dlog', async () => { await api(`/api/homebrew/logs/${l.id}`, 'DELETE'); const d = await api(`/api/homebrew/${b.id}`); onChanged(d.brew); onListChanged(); }),
  });
  const delTaste = (t) => setConfirm({
    title: 'Delete this tasting?', okLabel: 'Delete', danger: true,
    onOk: () => run('dtaste', async () => { await api(`/api/homebrew/tastings/${t.id}`, 'DELETE'); const d = await api(`/api/homebrew/${b.id}`); onChanged(d.brew); onListChanged(); }),
  });
  const labelsMade = (file, n) => { setSheet(null); saveFile(file); snack(`${n} label${n === 1 ? '' : 's'} ready to print: ${Math.ceil(n / 10)} A4 sheet${n > 10 ? 's' : ''}.`); };

  // the one main action, by what this is and where it is in its life
  const primary = b.isRecipe
    ? { label: 'Start brew', icon: 'add', on: startBrew, busy: busy === 'start' }
    : !canEdit ? null
    : b.status === 'planning' ? { label: 'Pitch the yeast', icon: 'flask', on: () => move('fermenting'), busy: busy === 'stage' }
      : ['fermenting', 'conditioning'].includes(b.status) ? { label: 'Log reading', icon: 'chart', on: () => { setTab('log'); setSheet('log'); } }
        : b.status === 'dumped' ? null : { label: 'Add tasting', icon: 'wine', on: () => { setTab('tastings'); setSheet('taste'); } };
  const quick = b.isRecipe
    ? [...(isOwner ? [['share', 'Share link', shareLink, busy === 'share']] : []), ['doc', 'PDF', (e) => pdfMenu.show(e), busy === 'pdf'], ...(canEdit ? [['print', 'Bottle labels', () => setSheet('labels')]] : [])]
    : canEdit ? [['print', 'Bottle labels', () => setSheet('labels')], ...(['fermenting', 'conditioning'].includes(b.status) && isOwner ? [['bell', 'Step reminders', stepReminders, busy === 'steps']] : []), ['edit', 'Edit', onEdit]]
      : [['doc', 'PDF', (e) => pdfMenu.show(e), busy === 'pdf']];
  const menuItems = [
    canEdit && { label: b.isRecipe ? 'Edit recipe' : 'Edit brew', icon: 'edit', onClick: onEdit },
    isOwner && canEdit && { label: 'Change picture', icon: 'image', onClick: () => setSheet('picture') },
    isOwner && canEdit && { label: 'Change liquid colour', icon: 'palette', onClick: () => setSheet('liquid') },
    canEdit && { label: 'Bottle labels', icon: 'print', onClick: () => setSheet('labels') },
    '-',
    b.isRecipe && isOwner && { label: 'Share a link', icon: 'share', onClick: shareLink },
    b.isRecipe && b.shared && isOwner && { label: 'Stop sharing', icon: 'linkoff', onClick: stopSharing },
    { label: 'Send the PDF', icon: 'send', onClick: sendPdf },
    { label: 'Download the PDF', icon: 'download', onClick: downloadPdf },
    !b.isRecipe && isOwner && canEdit && ['fermenting', 'conditioning'].includes(b.status) && { label: 'Set step reminders', icon: 'bell', onClick: stepReminders },
    !b.isRecipe && isOwner && canEdit && { label: 'Save as a recipe', icon: 'copyrecipe', onClick: keepAsRecipe },
    b.isRecipe && isOwner && { label: 'Create a new version', icon: 'copyrecipe', onClick: newVersion },
    b.isRecipe && isOwner && { label: 'Save as a new recipe', icon: 'add', onClick: () => setSheet('saveNew') },
    '-',
    canEdit && { label: 'Delete', icon: 'del', danger: true, onClick: remove },
  ];

  const kicker = (
    // its type and style as pills, like its other properties (23 Oct)
    <div className="kicker props">
      <span className="tag"><span className="em" aria-hidden="true">{look(b.category).emoji}</span>{catLabel(b.category)}</span>
      {b.style && b.style !== catLabel(b.category) && <span className="tag">{b.style}</span>}
    </div>
  );
  const props = (
    <div className="props">
      {wc && <span className="tag"><span className="dot" style={{ background: wc.liquid }} />{wc.label} wine</span>}
      {sw && <span className="tag" title={b.sweetnessBasis ? `Sweetness ${BASIS_WORD[b.sweetnessBasis]}` : undefined}>{sw.label}{b.sweetnessBasis === 'estimate' ? ' (estimated)' : ''}</span>}
      {ac && <span className="tag" title={ac.hint}>{ac.label} acidity</span>}
      {fz && <span className="tag">{fz.id === 'sparkling' ? <><span className="em" aria-hidden="true">🫧</span>Sparkling</> : 'Still'}</span>}
      {flavs.map((f) => <span key={f.id} className="tag" title={f.hint}><span className="em" aria-hidden="true">{f.emoji}</span>{f.label}</span>)}
    </div>
  );
  const recipeFacts = [
    strength && <Fact key="s" k="Strength" v={`${estStrength ? '~' : ''}${strength}%`} title={estStrength ? 'Likely strength, estimated from the sugar and yeast' : undefined} />,
    b.batchLitres && <Fact key="m" k="Makes" v={batch(b.batchLitres, sys)} />,
    bottles && <Fact key="b" k="Bottles" v={bottles.text.replace('≈', '')} title={bottles.hint} />,
    !b.batchLitres && (b.targetOg || b.og) && <Fact key="og" k="Starting gravity" v={g3(b.og || b.targetOg)} />,
    !b.batchLitres && (b.targetFg || b.fg) && <Fact key="fg" k="Final gravity" v={g3(b.fg || b.targetFg)} />,
  ].filter(Boolean);
  const facts = b.isRecipe ? (
    recipeFacts.length > 0 && <div className="facts" style={{ gridTemplateColumns: `repeat(${recipeFacts.length}, minmax(0, 1fr))` }}>{recipeFacts}</div>
  ) : (() => {
    // only what's known so far: a new brew shows its expected strength, its day and its batch until readings come in
    const strengthNow = c.abv || c.potentialAbv || b.abvEstimate || null;
    const gravityNow = c.latestGravity ? Number(c.latestGravity) : (b.og ? Number(b.og) : null);
    const list = [
      strengthNow != null && <CountFact key="s" hi k={c.abv ? (c.abvFinal ? 'Strength' : 'Strength so far') : 'Expected strength'} value={strengthNow} decimals={1} prefix={!c.abv && !c.potentialAbv && b.abvEstimate ? '~' : ''} suffix="%" />,
      ACTIVE.includes(b.status) ? c.daysSinceStart != null && <CountFact key="d" k="Day" value={c.daysSinceStart} /> : b.bottledOn && <Fact key="d" k="Bottled" v={shortDate(b.bottledOn)} />,
      gravityNow != null && <CountFact key="g" k="Gravity" value={gravityNow} decimals={3} />,
      c.attenuation != null && <CountFact key="a" k="Sugar eaten" value={c.attenuation} suffix="%" />,
      gravityNow == null && b.batchLitres && <Fact key="b" k="Batch" v={batch(b.batchLitres, sys)} title={bottles?.hint} />,
    ].filter(Boolean);
    return list.length > 0 && <div className="facts" style={{ gridTemplateColumns: `repeat(${list.length === 4 && !wide ? 2 : list.length}, minmax(0, 1fr))` }}>{list}</div>;
  })();
  const actionsRow = (
    <div className="actrow">
      {primary && <Btn kind="filled" icon={primary.icon} busy={primary.busy} onClick={primary.on}>{primary.label}</Btn>}
      {quick.map(([ic, l, on, isBusy]) => <Btn key={l} kind="tonal" icon={ic} busy={isBusy} onClick={on}>{l}</Btn>)}
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <div className={`topbar ${lifted ? 'lift' : ''}`}>
        <IconButton icon={backIcon} label={backIcon === 'close' ? 'Close' : 'Back'} onClick={onBack} />
        {/* Homebrew at the top of the page (on a phone, where the list's header isn't beside it), giving way to the
            drink's name as the page scrolls */}
        <span className="tstack">
          {layout === 'compact' && <span className="brandtop"><Brand small /></span>}
          <span className="title fadein">{b.name}</span>
        </span>
        <FavButton on={b.favourite} onToggle={() => onFav(b)} className="" />
        <IconButton icon="more" label="More" onClick={more.show} aria-haspopup="menu" />
      </div>
      <div className="scroll" ref={scroll}>
        <div className="hero">
          <div className="tint" style={{ background: tintOf(b) }} />
          {banner && <img className="bgimg" src={`/api/homebrew/picture/${banner}`} alt="" onError={(e) => { e.currentTarget.style.display = 'none'; }} />}
          <div className="stage" ref={heroArt}>
            <Vessel category={b.category} status={b.status} isRecipe={b.isRecipe} size={wide ? 136 : 124} wine={wine} liquid={b.liquid || main.colour} exactColour={Boolean(b.liquidChoice)}
              pics={b.mainPics?.length ? b.mainPics : pics} ingredients={b.ingredients} fizz={b.fizz} activity={activity} />
          </div>
          <div className="gutter" style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingTop: 8 }}>
            <div>
              {kicker}
              <h1>{b.name}</h1>
              {!b.isRecipe && b.mine === false && <span className="tag owner-tag"><Icon n="person" size={16} />{String(b.ownerName || 'Someone').split(/\s+/)[0]}'s brew · read only</span>}
              {!b.isRecipe && b.status === 'fermenting' && <p className="muted t-bm" style={{ marginTop: 2 }}>{ACTIVITY_WORD[activity]}</p>}
            </div>
            {pics.length > 0 && <div className="pics">{pics.map((p, i) => <img key={p.key} src={`/api/homebrew/picture/${p.key}`} alt={p.name} title={p.name} style={{ animationDelay: `${i * 60}ms` }} />)}</div>}
            {props}
            {b.isRecipe && family.length > 1 && (
              <div>
                <p className="t-ts muted" style={{ marginBottom: 4 }}>{family.length} versions of {b.family || b.name}</p>
                <div className="versions">
                  {family.map((v, i) => (
                    <a key={v.id} href={hrefFor(v)} className={`chip sl ${v.id === b.id ? 'on' : ''}`} onClick={(e) => { e.preventDefault(); if (v.id !== b.id) onOpen(v, null, { replace: true }); }}>
                      {/* (versions that are otherwise the same are numbered - recipes no longer name their books) */}
                      <span className="ck"><Icon n="check" size={18} /></span>{v.variant || `Version ${i + 1}`}
                    </a>
                  ))}
                </div>
              </div>
            )}
            {(shareUrl || b.shared) && b.isRecipe && (
              <div className="card" style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: '8px 8px 8px 16px', background: 'var(--surface-c)' }}>
                <Icon n="link" />
                {shareUrl ? <a href={shareUrl} target="_blank" rel="noreferrer" style={{ flex: 1, minWidth: 0, overflowWrap: 'anywhere', color: 'var(--primary)' }}>{shareUrl}</a> : <span style={{ flex: 1 }} className="muted">Shared: anyone with the link can see this recipe.</span>}
                {shareUrl && <IconButton icon="copy" label="Copy link" onClick={() => navigator.clipboard?.writeText(shareUrl).then(() => snack('Link copied.')).catch(() => {})} />}
                {isOwner && <IconButton icon="linkoff" label="Stop sharing" onClick={stopSharing} />}
              </div>
            )}
            {facts}
            {!b.isRecipe && <StageTrack status={b.status} busy={busy === 'stage'} onPick={canEdit && full ? move : null} />}
            {onTool && <StageTools brew={b} onTool={(id) => onTool(id, b)} />}
            {wide && actionsRow}
          </div>
        </div>

        <Tabs tabs={tabsFor.filter(([v]) => v !== 'notes' || b.notes || b.yeast || b.nutrients || b.water || b.sourceName)} value={tab} onChange={setTab} />
        <div className="gutter">
          <div key={tab} className={`section ${axis}`} style={{ paddingBottom: 48 }}>
            {(tab === 'ingredients' || tab === 'recipe') && (
              <>
                {b.summary && <p className="lead-text"><RichText text={b.summary} /></p>}
                {(b.batchLitres || b.yeast) && (
                  <div className="kv">
                    {b.batchLitres ? <span><b>Makes</b>{batch(b.batchLitres, sys)}{bottles ? ` · ${bottles.text} bottles` : ''}</span> : null}
                    {b.yeast && <span><b>Yeast</b><RichText text={b.yeast} /></span>}
                    {(b.targetOg || b.og) && <span><b>OG</b>{g3(b.og || b.targetOg)}{!b.og && b.targetOg ? ' target' : ''}</span>}
                    {(b.targetFg || b.fg) && <span><b>FG</b>{g3(b.fg || b.targetFg)}{!b.fg && b.targetFg ? ' target' : ''}</span>}
                  </div>
                )}
                <h2>Ingredients</h2>
                <Ingredients brew={b} />
                {tab === 'recipe' && (<><h2 style={{ marginTop: 8 }}>Method</h2><Method brew={b} /><Extras brew={b} />{b.notes && <><h2 style={{ marginTop: 8 }}>Notes</h2><p style={{ whiteSpace: 'pre-line' }}><RichText text={b.notes} /></p></>}</>)}
                <TermsPanel texts={[b.summary, b.method, b.notes, b.yeast, ...(b.ingredients || []).map(ingText)]} />
              </>
            )}
            {tab === 'method' && (<><Method brew={b} /><TermsPanel texts={[b.method]} /></>)}
            {tab === 'notes' && (
              <>
                <Extras brew={b} />
                {b.notes && <p style={{ whiteSpace: 'pre-line', fontSize: 16, lineHeight: '24px' }}><RichText text={b.notes} /></p>}
                {b.sourceName && <p className="muted">From {b.sourceUrl ? <a href={b.sourceUrl} target="_blank" rel="noreferrer" style={{ color: 'var(--primary)', textDecoration: 'underline' }}>{b.sourceName}</a> : b.sourceName}</p>}
                <TermsPanel texts={[b.notes, b.yeast, b.yeastNotes, b.nutrients, b.water]} />
              </>
            )}
            {tab === 'log' && (
              <>
                <div className="card"><h2>Fermentation</h2>{full ? <GravityChart brew={b} /> : <Spinner />}</div>
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  <h2 style={{ flex: 1 }}>Log</h2>
                  {canEdit && <Btn kind="tonal" icon="add" onClick={() => setSheet('log')}>Log an entry</Btn>}
                </div>
                <div>
                  {full && [...b.logs].reverse().map((l, i) => (
                    <div key={l.id} className="li enter" style={{ animationDelay: `${Math.min(i, 8) * 30}ms` }}>
                      <span className={`lead ${l.kind === 'reading' ? 'hi' : ''}`}><Icon n={KIND_ICON[l.kind] || 'check'} /></span>
                      <div className="tx">
                        <div className="h">{KIND_LABEL[l.kind] || l.kind}{l.gravity ? ` · ${g3(l.gravity)}` : ''}{l.tempC != null ? ` · ${l.tempC}°C` : ''}{l.ph != null ? ` · pH ${l.ph}` : ''}</div>
                        <div className="s">{l.text ? <RichText text={l.text} /> : null}{l.text ? ' · ' : ''}{relDay(l.at)} at {timeOf(l.at)}{l.source === 'desk' ? ' · said to Ims' : ''}</div>
                      </div>
                      {canEdit && <IconButton icon="del" label="Delete entry" onClick={() => delLog(l)} />}
                    </div>
                  ))}
                  {full && !b.logs.length && <p className="muted">Nothing logged yet. Or just tell Ims: "log a reading of ten forty-two on the {b.name.toLowerCase()}".</p>}
                </div>
              </>
            )}
            {tab === 'tastings' && (
              <>
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  <h2 style={{ flex: 1 }}>How it tasted</h2>
                  {canEdit && <Btn kind="tonal" icon="add" onClick={() => setSheet('taste')}>Add tasting</Btn>}
                </div>
                {full && [...b.tastings].reverse().map((t, i) => (
                  <div key={t.id} className="card enter" style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {t.rating ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--primary)', fontWeight: 700, fontSize: 18 }}><Icon n="star" size={20} />{t.rating}/10</span> : <b>Tasting</b>}
                      <span className="muted" style={{ flex: 1 }}>{relDay(t.at)}{t.stage ? ` · ${t.stage}` : ''}</span>
                      {canEdit && <IconButton icon="del" label="Delete tasting" onClick={() => delTaste(t)} />}
                    </div>
                    <span className="muted t-bm">Sweetness {t.sweetness ?? '–'} · Body {t.body ?? '–'} · Acidity {t.acidity ?? '–'} · Heat {t.heat ?? '–'}{t.clarity ? ` · ${t.clarity}` : ''}{t.carbonation ? ` · ${t.carbonation}` : ''}</span>
                    {(t.aroma || t.flavour) && <span>{[t.aroma && `Aroma: ${t.aroma}`, t.flavour && `Flavour: ${t.flavour}`].filter(Boolean).join(' · ')}</span>}
                    {t.verdict && <span>{t.verdict}</span>}
                    {t.changeNext && <span style={{ color: 'var(--primary)' }}>Next time: {t.changeNext}</span>}
                  </div>
                ))}
                {full && !b.tastings.length && <p className="muted">No tastings yet. Taste it at racking, at bottling and as it ages, so you can see it change.</p>}
              </>
            )}
            {tab === 'insights' && full && <Insights brew={b} isOwner={canEdit} onChanged={onChanged} />}
          </div>
        </div>
      </div>

      {!wide && (primary || quick.length > 0) && (
        <div className="bottombar">
          {quick.map(([ic, l, on, isBusy]) => <IconButton key={l} icon={ic} label={l} onClick={on} disabled={isBusy}>{isBusy ? <Spinner size={20} /> : null}</IconButton>)}
          <span className="grow" />
          {primary && <Btn kind="filled" big icon={primary.icon} busy={primary.busy} onClick={primary.on}>{primary.label}</Btn>}
        </div>
      )}

      <Menu anchor={more.anchor} open={more.open} onClose={more.close} items={menuItems.filter((x, i, a) => x && !(x === '-' && (a[i - 1] === '-' || i === 0)))} />
      <Menu anchor={pdfMenu.anchor} open={pdfMenu.open} onClose={pdfMenu.close} items={[{ label: 'Send the PDF', icon: 'send', onClick: sendPdf }, { label: 'Download the PDF', icon: 'download', onClick: downloadPdf }]} />
      <Confirm open={Boolean(confirm)} {...(confirm || {})} onClose={() => setConfirm(null)} onOk={confirm?.onOk || (() => {})} />
      {full && <LogSheet open={sheet === 'log'} onClose={() => setSheet(null)} brew={b} kinds={kinds} onSaved={(nb) => { onChanged(nb); onListChanged(); }} />}
      {full && <TastingSheet open={sheet === 'taste'} onClose={() => setSheet(null)} brew={b} onSaved={(nb) => { onChanged(nb); onListChanged(); }} />}
      <SaveNewSheet open={sheet === 'saveNew'} onClose={() => setSheet(null)} recipe={b} family={family} onSaved={async (nb) => { setSheet(null); await onListChanged(); snack(`${nb.name} saved as a new recipe.`); onEditOther?.(nb); }} />
      <LiquidSheet open={sheet === 'liquid'} onClose={() => setSheet(null)} brew={b} onPicked={(nb) => { onChanged({ ...b, ...nb }); onListChanged(); snack('Colour changed.'); setSheet(null); }} />
      <PictureSheet open={sheet === 'picture'} onClose={() => setSheet(null)} brew={b} onPicked={(nb) => { onChanged({ ...b, ...nb }); onListChanged(); snack('Picture changed.'); setSheet(null); }} />
      <LabelsSheet open={sheet === 'labels'} onClose={() => setSheet(null)} brew={b} onDone={labelsMade} />
    </div>
  );
}

// ---- Save as a new recipe: a copy that stands on its own, under a new name (24 Oct, Simon) ----
// A new version stays in the family (same name, a different version label); this one gets its own name and its own card.
// A name that would put it straight back in the same family is caught before saving.
function SaveNewSheet({ open, onClose, recipe, family = [], onSaved }) {
  const base = String(recipe?.family || recipe?.name || '').replace(/\s*\(.*$/, '');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  useEffect(() => { if (open) { setName(`My ${base.charAt(0).toLowerCase()}${base.slice(1)}`); setErr(''); } }, [open, recipe?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const core = (t) => String(t || '').replace(/\s*\(.*$/, '').replace(/\s+(no\.?\s*\d+|[ivx]+|\d+)$/i, '').trim().toLowerCase();
  const clash = name.trim() && (core(name) === core(base) || family.some((v) => core(v.name) === core(name)));
  const save = async () => {
    if (!name.trim() || clash) return;
    setBusy(true); setErr('');
    try {
      const d = await api(`/api/homebrew/${recipe.id}/save-as-recipe`, 'POST', {});
      const named = await api(`/api/homebrew/${d.brew.id}`, 'PUT', { name: name.trim() });
      onSaved(named.brew || d.brew);
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  return (
    <Sheet open={open} onClose={onClose} title="Save as a new recipe"
      footer={<><Btn kind="text" onClick={onClose}>Cancel</Btn><Btn kind="filled" icon="add" busy={busy} disabled={!name.trim() || clash} onClick={save}>Save new recipe</Btn></>}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <p className="muted t-bm" style={{ margin: 0 }}>A copy of {recipe?.name} that stands on its own in the recipe book, with its own card. To keep it with the other versions instead, use Create a new version.</p>
        <TextField label="Name for the new recipe" value={name} onChange={(v) => { setName(v); setErr(''); }} autoFocus onKeyDown={(e) => { if (e.key === 'Enter') save(); }}
          help={clash ? `That's the name of the ${base} family, so it would join its versions. Choose a different name.` : 'You can change everything else straight after.'} />
        {err && <p style={{ color: 'var(--error)', margin: 0 }}>{err}</p>}
      </div>
    </Sheet>
  );
}
