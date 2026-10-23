// Homebrew: brewing tools (23 Oct 2026, Simon) - Homebrew's own calculators for the everyday sums: strength, honey and
// sugar, fortifying, backsweetening, stabilising, nutrients, refractometer and hydrometer readings, priming, scaling a
// recipe and a printable log sheet. Standard home-brewing maths throughout (the formulas are noted by each tool), in
// litres or UK / US gallons. Where it helps they use the app's own data: the scaler loads any recipe, the log sheet
// fills itself in from a brew.
import React, { useMemo, useState } from 'react';
import { Sheet, Btn, TextField, Segmented, SelectField, MenuChip, Menu, useMenu, Icon } from './ui';

// ---- units and numbers ----
const VOL = { l: 1, uk: 4.54609, us: 3.78541 };
const VOL_LABEL = { l: 'L', uk: 'UK gal', us: 'US gal' };
const num = (s) => { const n = parseFloat(String(s ?? '').replace(',', '.')); return Number.isFinite(n) ? n : NaN; };
const ok = (...ns) => ns.every((n) => Number.isFinite(n));
const fx = (n, d = 1) => (Number.isFinite(n) ? n.toFixed(d) : '–');
const sg = (n) => (Number.isFinite(n) ? n.toFixed(3) : '–');
const kgOrG = (kg) => (!Number.isFinite(kg) ? '–' : kg >= 1 ? `${kg.toFixed(2)} kg` : `${Math.round(kg * 1000)} g`);
const litres = (l) => (!Number.isFinite(l) ? '–' : l >= 1 ? `${l.toFixed(2)} L` : `${Math.round(l * 1000)} ml`);
const readUnits = () => { try { return localStorage.getItem('hbbUnits') || 'l'; } catch { return 'l'; } };
const UNIT_NAMES = [['l', 'Litres'], ['uk', 'UK gallons'], ['us', 'US gallons']];
// the units, as a dropdown chip like the filters'; the choice is remembered on this device
function UnitsPicker({ units, setUnits }) {
  const menu = useMenu();
  return (
    <>
      <MenuChip on={menu.open} label="Units" onClick={menu.show}>{UNIT_NAMES.find(([k]) => k === units)?.[1] || 'Litres'}</MenuChip>
      <Menu anchor={menu.anchor} open={menu.open} onClose={menu.close}
        items={UNIT_NAMES.map(([k, l]) => ({ label: l, icon: k === units ? 'check' : 'blank', selected: k === units, onClick: () => setUnits(k) }))} />
    </>
  );
}

// gravity points that 1 kg gives in 1 litre: sugar (sucrose, 46 ppg) and honey (about 80% sugar, 35 ppg)
const PTS = { sugar: 384, honey: 292 };
const abvOf = (og, fg) => (og - fg) * 131.25;
// the high-gravity formula (more accurate above about 1.070)
const abvAlt = (og, fg) => (76.08 * (og - fg) / (1.775 - og)) * (fg / 0.794);
const brixToSg = (b) => 1 + b / (258.6 - (b / 258.2) * 227.1);
const sgToBrix = (g) => ((182.4601 * g - 775.6821) * g + 1262.7794) * g - 669.5622;

// ---- the frame every tool shares ----
function Out({ rows, note }) {
  return (
    <div className="calc-out" aria-live="polite">
      {rows.filter(Boolean).map(([k, v, big]) => (
        <div key={k} className={`r ${big ? 'big' : ''}`}><span className="k">{k}</span><b className="num">{v}</b></div>
      ))}
      {note && <p className="note">{note}</p>}
    </div>
  );
}
// A number, with - and + buttons big enough for a thumb (the browser's own arrows are tiny, and Android hides them).
// Each steps by what suits it: a gravity by 0.001, a strength by 0.5%, a volume by half a litre or a quarter gallon.
const decimals = (s) => (String(s ?? '').split('.')[1] || '').length;
const NUDGE = { '%': 0.5, '°C': 1, '°Bx': 0.5, g: 0.5, L: 0.5, 'UK gal': 0.25, 'US gal': 0.25 };
function Field({ label, value, set, suffix, help, nudge }) {
  const by = nudge ?? NUDGE[suffix] ?? 10 ** -Math.min(3, decimals(value));
  const dp = suffix ? decimals(String(by)) : Math.max(decimals(String(by)), decimals(value));
  const bump = (d) => {
    const n = num(value);
    const v = Math.max(0, (Number.isFinite(n) ? n : 0) + d * by);
    // a gravity keeps its three places (1.090); everything else drops trailing zeros (4.5, 12)
    set(suffix ? String(Number(v.toFixed(dp))) : v.toFixed(dp));
  };
  const name = suffix ? `${label} (${suffix})` : label;
  return (
    <div className="nudge-field">
      <TextField className="has-nudge" label={name} value={value} onChange={set} type="number" inputMode="decimal" step="any" help={help} />
      <div className="nudge">
        <button type="button" className="sl" onClick={() => bump(-1)} aria-label={`Less ${label.toLowerCase()}`}><Icon n="remove" size={20} /></button>
        <button type="button" className="sl" onClick={() => bump(1)} aria-label={`More ${label.toLowerCase()}`}><Icon n="add" size={20} /></button>
      </div>
    </div>
  );
}
const Vol = ({ units, value, set, label = 'Batch size' }) => <Field label={label} value={value} set={set} suffix={VOL_LABEL[units]} />;
const defVol = (units) => (units === 'l' ? '4.5' : units === 'uk' ? '1' : '1.2');
// a value from a brew (seed), else the usual starting value
const volFrom = (units, seed) => (seed?.litres ? String(Math.round((seed.litres / VOL[units]) * 100) / 100) : defVol(units));
const g3 = (n) => (Number.isFinite(Number(n)) && Number(n) > 0.9 ? Number(n).toFixed(3) : null);
const pct = (n) => (Number.isFinite(Number(n)) && Number(n) > 0 ? String(Math.round(Number(n) * 10) / 10) : null);

// ---- 1. Strength ----
function AbvTool({ seed }) {
  const [og, setOg] = useState(g3(seed?.og) || '1.090');
  const [fg, setFg] = useState(g3(seed?.gravity) || g3(seed?.targetFg) || '1.000');
  const o = num(og), f = num(fg);
  const valid = ok(o, f) && o > f;
  return (
    <>
      <div className="fgrid"><Field label="Original gravity (OG)" value={og} set={setOg} /><Field label="Final or latest gravity" value={fg} set={setFg} /></div>
      <Out rows={[
        ['Strength', valid ? `${fx(abvOf(o, f))}%` : '–', true],
        o > 1.07 && valid && ['High-gravity formula', `${fx(abvAlt(o, f))}%`],
        ['Apparent attenuation', valid ? `${Math.round(((o - f) / (o - 1)) * 100)}%` : '–'],
        ['Sugar left to ferment', ok(f) ? (f > 1.0 ? `${fx((f - 0.996) * 131.25)}% more if it ferments dry` : 'Fermented dry') : '–'],
      ]} note="ABV = (OG − FG) × 131.25. Above about 1.070 the high-gravity formula is closer." />
    </>
  );
}

// ---- 2. Honey for a mead ----
const FINISH = [['0.996', 'Dry'], ['1.005', 'Off dry'], ['1.012', 'Medium'], ['1.020', 'Sweet']];
function HoneyTool({ units, seed }) {
  const [vol, setVol] = useState(volFrom(units, seed));
  const [abv, setAbv] = useState(pct(seed?.abv) || '12');
  const [fin, setFin] = useState(seed?.finish || '0.996');
  const L = num(vol) * VOL[units], a = num(abv), f = num(fin);
  const og = f + a / 131.25;
  const kg = ((og - 1) * 1000 * L) / PTS.honey;
  return (
    <>
      <div className="fgrid"><Vol units={units} value={vol} set={setVol} /><Field label="Strength you want" value={abv} set={setAbv} suffix="%" /></div>
      <Segmented label="Finish" value={fin} onChange={setFin} options={FINISH} />
      <Out rows={[
        ['Honey', ok(L, a) ? kgOrG(kg) : '–', true],
        ['Starting gravity', ok(L, a) ? sg(og) : '–'],
        ['Jars', ok(kg) ? `${Math.ceil(kg / 0.454)} × 454 g, or ${Math.ceil(kg / 0.34)} × 340 g` : '–'],
      ]} note="1 kg of honey adds about 292 gravity points to 1 litre (it's about 80% sugar). Sweeter finishes leave sugar behind, so they need more. Honey varies: check with a hydrometer once it's fully stirred in." />
    </>
  );
}

// ---- 3. Sugar for a wine ----
function SugarTool({ units, seed }) {
  const [vol, setVol] = useState(volFrom(units, seed));
  const [now, setNow] = useState(g3(seed?.gravity) || g3(seed?.og) || '1.040');
  const [abv, setAbv] = useState(pct(seed?.abv) || '12');
  const L = num(vol) * VOL[units], g = num(now), a = num(abv);
  const target = 0.996 + a / 131.25;
  const pts = (target - g) * 1000;
  // dissolved sugar adds about 0.63 L a kg, which dilutes it a little: allowed for
  const kg = pts > 0 ? (pts * L) / (PTS.sugar - pts * 0.63) : 0;
  return (
    <>
      <div className="fgrid"><Vol units={units} value={vol} set={setVol} /><Field label="Gravity now" value={now} set={setNow} help="From your hydrometer, before adding sugar" /><Field label="Strength you want" value={abv} set={setAbv} suffix="%" /></div>
      <Out rows={[
        ['Sugar to add', ok(L, g, a) ? (pts > 0 ? kgOrG(kg) : 'None - it\'s strong enough') : '–', true],
        ['Gravity to aim for', ok(a) ? sg(target) : '–'],
        ['Strength with no sugar', ok(g) ? `${fx(Math.max(0, abvOf(g, 0.996)))}%` : '–'],
      ]} note="Assumes it ferments dry (about 0.996). 1 kg of sugar adds about 384 gravity points to 1 litre, and about 0.6 L of volume - allowed for. Add it in stages for strong wines." />
    </>
  );
}

// ---- 4. Fortifying ----
function FortifyTool({ units, seed }) {
  const [mode, setMode] = useState('target');
  const [vol, setVol] = useState(volFrom(units, seed));
  const [base, setBase] = useState(pct(seed?.abvNow) || '12');
  const [spirit, setSpirit] = useState('40');
  const [target, setTarget] = useState('18');
  const [add, setAdd] = useState('0.5');
  const V = num(vol) * VOL[units], b = num(base), s = num(spirit), t = num(target), x = num(add) * VOL[units];
  const need = (V * (t - b)) / (s - t);
  const blended = (V * b + x * s) / (V + x);
  const valid = mode === 'target' ? ok(V, b, s, t) && t > b && s > t : ok(V, b, s, x);
  return (
    <>
      <Segmented label="What you want to know" value={mode} onChange={setMode} options={[['target', 'Spirit for a strength'], ['measure', 'Strength after a measure']]} />
      <div className="fgrid">
        <Vol units={units} value={vol} set={setVol} label="Wine or mead" />
        <Field label="Its strength" value={base} set={setBase} suffix="%" />
        <Field label="Spirit strength" value={spirit} set={setSpirit} suffix="%" help="Vodka or brandy 40%, rum 37.5–40%" />
        {mode === 'target' ? <Field label="Strength you want" value={target} set={setTarget} suffix="%" /> : <Field label="Spirit to add" value={add} set={setAdd} suffix={VOL_LABEL[units]} />}
      </div>
      <Out rows={mode === 'target'
        ? [['Spirit to add', valid ? litres(need) : '–', true], ['Volume after', valid ? litres(V + need) : '–']]
        : [['Strength after', valid ? `${fx(blended)}%` : '–', true], ['Volume after', valid ? litres(V + x) : '–']]}
        note="Spirit = volume × (target − strength) ÷ (spirit − target). The result is the two strengths averaged by volume." />
    </>
  );
}

// ---- 5. Backsweetening ----
function SweetenTool({ units, seed }) {
  const [vol, setVol] = useState(volFrom(units, seed));
  const [now, setNow] = useState(g3(seed?.gravity) || '0.996');
  const [want, setWant] = useState('1.010');
  const [kind, setKind] = useState(seed?.mead ? 'honey' : 'sugar');
  const L = num(vol) * VOL[units], a = num(now), b = num(want);
  const kg = ((b - a) * 1000 * L) / PTS[kind];
  return (
    <>
      <div className="fgrid"><Vol units={units} value={vol} set={setVol} /><Field label="Gravity now" value={now} set={setNow} /><Field label="Gravity you want" value={want} set={setWant} help="Off dry about 1.005, medium 1.010–1.015, sweet 1.020+" /></div>
      <Segmented label="Sweeten with" value={kind} onChange={setKind} options={[['sugar', 'Sugar'], ['honey', 'Honey']]} />
      <Out rows={[['To add', ok(L, a, b) && b > a ? kgOrG(kg) : '–', true]]}
        note="Stabilise first (Stabilising, below) or it will start fermenting again. Dissolve it in a little of the brew, add half, taste, then the rest." />
    </>
  );
}

// ---- 6. Stabilising ----
function StabiliseTool({ units, seed }) {
  const [vol, setVol] = useState(volFrom(units, seed));
  const L = num(vol) * VOL[units];
  return (
    <>
      <Vol units={units} value={vol} set={setVol} />
      <Out rows={[
        ['Campden tablets', ok(L) ? `${Math.max(1, Math.ceil(L / 4.5))}` : '–', true],
        ['Potassium sorbate', ok(L) ? `${fx(L * 0.25, 1)} g` : '–', true],
        ['Or metabisulphite powder', ok(L) ? `${fx(L * 0.088, 2)} g` : '–'],
      ]} note="One Campden tablet per 4.5 L (about 50 ppm sulphite), crushed and dissolved. Sorbate about 0.25 g a litre. Use both together, a day before backsweetening - sorbate alone can give a geranium taint." />
    </>
  );
}

// ---- 7. Mead nutrients (TOSNA) ----
function NutrientTool({ units, seed }) {
  const [vol, setVol] = useState(volFrom(units, seed));
  const [abv, setAbv] = useState(pct(seed?.abv) || '14');
  const [need, setNeed] = useState('1');
  const [yeastG, setYeastG] = useState('5');
  const [og, setOg] = useState(g3(seed?.og) || '1.105');
  const L = num(vol) * VOL[units], a = num(abv), f = num(need), y = num(yeastG), o = num(og);
  const total = L * (a / 14) * f;
  const fg = 0.996;
  // by gravity: pitching, then evenly spaced on the way to the ⅓ sugar break, the last at the break itself
  const drop = (o - fg) / 9;
  return (
    <>
      <div className="fgrid">
        <Vol units={units} value={vol} set={setVol} />
        <Field label="Strength you want" value={abv} set={setAbv} suffix="%" />
        <Field label="Starting gravity" value={og} set={setOg} help="For the gravity-based schedule" />
        <Field label="Yeast" value={yeastG} set={setYeastG} suffix="g" help="A sachet is usually 5 g" />
      </div>
      <Segmented label="Yeast's nitrogen needs" value={need} onChange={setNeed} options={[['0.75', 'Low (EC-1118)'], ['1', 'Medium (71B, D47)'], ['1.25', 'High']]} />
      <Out rows={[
        ['Fermaid O in all', ok(L, a) ? `${fx(total, 1)} g` : '–', true],
        ['Each of 4 additions', ok(L, a) ? `${fx(total / 4, 2)} g` : '–'],
        ['Schedule', 'At pitching, then 24, 48 and 72 hours'],
        ok(o) && o > 1 && ['Or by gravity', `At pitching, then at about ${sg(o - drop)}, ${sg(o - 2 * drop)} and ${sg(o - 3 * drop)} (the ⅓ sugar break)`],
        ok(y) && ['Go-Ferm to rehydrate', `${fx(y * 1.25, 1)} g in ${Math.round(y * 25)} ml of water at 43 °C`],
      ]} note="About 1 g of Fermaid O per litre for a 14% mead, scaled to the strength and the yeast. Stir gently at each addition to release the gas. Nothing after the ⅓ sugar break." />
    </>
  );
}

// ---- 8. Brix and gravity ----
function BrixTool() {
  const [mode, setMode] = useState('brix');
  const [brix, setBrix] = useState('22');
  const [grav, setGrav] = useState('1.090');
  const b = mode === 'brix' ? num(brix) : sgToBrix(num(grav));
  const g = mode === 'brix' ? brixToSg(num(brix)) : num(grav);
  return (
    <>
      <Segmented label="Convert from" value={mode} onChange={setMode} options={[['brix', 'Brix to gravity'], ['sg', 'Gravity to Brix']]} />
      {mode === 'brix' ? <Field label="Brix" value={brix} set={setBrix} suffix="°Bx" /> : <Field label="Gravity" value={grav} set={setGrav} />}
      <Out rows={[
        mode === 'brix' ? ['Gravity', sg(g), true] : ['Brix', `${fx(b)} °Bx`, true],
        ['Strength if it ferments dry', ok(g) ? `${fx(Math.max(0, abvOf(g, 0.996)))}%` : '–'],
      ]} note="For unfermented juice or must only. Once fermenting has started, alcohol throws a refractometer out: use Refractometer correction." />
    </>
  );
}

// ---- 9. Priming sugar ----
const CO2 = [['1.8', 'British ale (1.5–2)'], ['2.4', 'Most beers (2.2–2.7)'], ['2.8', 'Cider, sparkling (2.5–3)'], ['3.5', 'Very fizzy (3–4)']];
const PRIME = { sugar: ['Table sugar', 4.0], dextrose: ['Brewing sugar (dextrose)', 4.4], honey: ['Honey', 5.0], dme: ['Dried malt extract', 5.8] };
function PrimingTool({ units, seed }) {
  const [vol, setVol] = useState(seed?.litres ? volFrom(units, seed) : units === 'l' ? '20' : units === 'uk' ? '4.5' : '5');
  const [temp, setTemp] = useState('18');
  const [co2, setCo2] = useState(seed?.co2 || '2.4');
  const [kind, setKind] = useState('sugar');
  const L = num(vol) * VOL[units], tF = num(temp) * 9 / 5 + 32, c = num(co2);
  // carbon dioxide still in the beer from fermenting, by its warmest temperature since
  const resid = 3.0378 - 0.050062 * tF + 0.00026555 * tF * tF;
  const g = Math.max(0, (c - resid) * L * PRIME[kind][1]);
  return (
    <>
      <div className="fgrid"><Vol units={units} value={vol} set={setVol} label="Volume to bottle" /><Field label="Warmest it's been since fermenting" value={temp} set={setTemp} suffix="°C" /></div>
      <SelectField label="How fizzy" value={co2} onChange={setCo2} options={CO2} />
      <SelectField label="Prime with" value={kind} onChange={setKind} options={Object.entries(PRIME).map(([k, [l]]) => [k, l])} />
      <Out rows={[
        ['In all', ok(L, tF, c) ? `${Math.round(g)} g` : '–', true],
        ['Per 500 ml bottle', ok(L) && L > 0 ? `${fx(g / L * 0.5, 1)} g` : '–'],
        ['Per 330 ml bottle', ok(L) && L > 0 ? `${fx(g / L * 0.33, 1)} g` : '–'],
        ['Per 750 ml bottle', ok(L) && L > 0 ? `${fx(g / L * 0.75, 1)} g` : '–'],
      ]} note={`Already in it: about ${fx(resid, 2)} volumes of CO₂. Only prime a brew that has finished (steady gravity for 3 days), in bottles made for pressure.`} />
    </>
  );
}

// ---- 10. Hydrometer temperature ----
const hydroCurve = (f) => 1.00130346 - 0.000134722124 * f + 0.00000204052596 * f * f - 0.00000000232820948 * f * f * f;
function HydroTool({ seed }) {
  const [reading, setReading] = useState(g3(seed?.gravity) || g3(seed?.og) || '1.050');
  const [temp, setTemp] = useState('28');
  const [cal, setCal] = useState('20');
  const r = num(reading), tF = num(temp) * 9 / 5 + 32, cF = num(cal) * 9 / 5 + 32;
  const corrected = r * (hydroCurve(tF) / hydroCurve(cF));
  return (
    <>
      <div className="fgrid"><Field label="Reading" value={reading} set={setReading} /><Field label="Sample temperature" value={temp} set={setTemp} suffix="°C" /></div>
      <Segmented label="Hydrometer calibrated at" value={cal} onChange={setCal} options={[['20', '20 °C (most UK)'], ['15.6', '15.6 °C (60 °F)']]} />
      <Out rows={[['True gravity', ok(r, tF, cF) ? sg(corrected) : '–', true], ['Difference', ok(r, tF, cF) ? `${corrected >= r ? '+' : ''}${fx((corrected - r) * 1000, 1)} points` : '–']]}
        note="Warm samples read low and cold ones high. Most accurate within about 10 °C of the calibration temperature." />
    </>
  );
}

// ---- 11. Refractometer correction ----
function RefracTool() {
  const [ob, setOb] = useState('22');
  const [fb, setFb] = useState('9');
  const [wcf, setWcf] = useState('1.04');
  const o = num(ob) / num(wcf), f = num(fb) / num(wcf);
  const og = brixToSg(o);
  // Sean Terrill's formula for a reading taken after fermenting has started
  const fg = 1.0 - 0.0044993 * o + 0.011774 * f + 0.00027581 * o * o - 0.0012717 * f * f - 0.00000728 * o * o * o + 0.000063293 * f * f * f;
  const valid = ok(o, f) && num(fb) <= num(ob);
  return (
    <>
      <div className="fgrid"><Field label="Starting reading" value={ob} set={setOb} suffix="°Bx" /><Field label="Reading now" value={fb} set={setFb} suffix="°Bx" /><Field label="Correction factor" value={wcf} set={setWcf} help="1.04 suits most refractometers; check yours against a hydrometer" /></div>
      <Out rows={[
        ['Gravity now', valid ? sg(fg) : '–', true],
        ['Starting gravity', ok(o) ? sg(og) : '–'],
        ['Strength', valid ? `${fx(abvOf(og, fg))}%` : '–'],
      ]} note="Alcohol makes a refractometer read high once fermenting starts, so a reading needs correcting against the starting reading (Terrill's formula)." />
    </>
  );
}

// ---- 12. Scaling a recipe ----
const FRAC = { '½': 0.5, '¼': 0.25, '¾': 0.75, '⅓': 1 / 3, '⅔': 2 / 3, '⅛': 0.125 };
function parseAmount(a) {
  const s = String(a ?? '').trim().replace(/[½¼¾⅓⅔⅛]/g, (m) => ` ${FRAC[m]}`);
  const one = (t) => t.trim().split(/\s+/).reduce((sum, p) => sum + (p.includes('/') ? (() => { const [n, d] = p.split('/'); return num(n) / num(d); })() : num(p)), 0);
  const parts = s.split(/\s*[–-]\s*|\s+to\s+/);
  const vals = parts.map(one).filter(Number.isFinite);
  return vals.length ? vals : null;
}
const nice = (n) => (n >= 100 ? Math.round(n) : n >= 10 ? Math.round(n * 10) / 10 : Math.round(n * 100) / 100);
function ScaleTool({ units, recipes, seed }) {
  const [pick, setPick] = useState(seed?.recipeId ? String(seed.recipeId) : '');
  const recipe = recipes.find((r) => String(r.id) === pick);
  const [from, setFrom] = useState('4.5');
  const [to, setTo] = useState(seed?.litres && seed?.recipeId && !seed?.isRecipe ? volFrom(units, seed) : defVol(units));
  const fromL = recipe?.batchLitres ? Number(recipe.batchLitres) : num(from);
  const factor = (num(to) * VOL[units]) / fromL;
  const rows = (recipe?.ingredients || []).map((g) => {
    const vals = parseAmount(g.amount);
    return { name: g.name, unit: g.unit || '', was: g.amount, now: vals && ok(factor) ? vals.map((v) => nice(v * factor)).join('–') : g.amount || '' };
  });
  const options = useMemo(() => [['', 'Choose a recipe…'], ...[...recipes].sort((a, b) => a.name.localeCompare(b.name)).map((r) => [String(r.id), `${r.name}${r.batchLitres ? ` (${r.batchLitres} L)` : ''}`])], [recipes]);
  return (
    <>
      <SelectField label="Recipe" value={pick} onChange={setPick} options={options} />
      <div className="fgrid">
        {!recipe?.batchLitres && <Field label="Its batch size" value={from} set={setFrom} suffix="L" />}
        <Field label="Your batch size" value={to} set={setTo} suffix={VOL_LABEL[units]} />
      </div>
      {recipe ? (
        <div className="calc-out">
          <div className="r big"><span className="k">Scale</span><b className="num">× {ok(factor) ? fx(factor, 2) : '–'}</b></div>
          <table className="scale">
            <thead><tr><th>Ingredient</th><th>Recipe</th><th>Yours</th></tr></thead>
            <tbody>{rows.map((r, i) => <tr key={i}><td>{r.name}</td><td className="num">{r.was} {r.unit}</td><td className="num"><b>{r.now} {r.unit}</b></td></tr>)}</tbody>
          </table>
          <p className="note">Yeast doesn't need scaling for small changes: one sachet does up to about 23 L. Spices and oak are worth scaling a little under, then adjusting to taste.</p>
        </div>
      ) : <p className="muted t-bm" style={{ margin: 0 }}>Choose a recipe from your recipe book to scale its ingredients to your batch.</p>}
    </>
  );
}

// ---- 13. Printable log sheet ----
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function LogSheetTool({ brews, seed }) {
  const [pick, setPick] = useState(seed?.brewId ? String(seed.brewId) : '');
  const b = brews.find((x) => String(x.id) === pick);
  const open = () => {
    const rows = Array.from({ length: 16 }, () => '<tr><td></td><td></td><td></td><td></td><td></td></tr>').join('');
    const facts = [['Brew', b?.name || ''], ['Style', b?.style || ''], ['Started', b?.startedOn || ''], ['Batch', b?.batchLitres ? `${b.batchLitres} L` : ''], ['Yeast', b?.yeast || ''], ['OG', b?.og || b?.targetOg || ''], ['Target FG', b?.targetFg || '']];
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(b?.name || 'Brew log')}</title><style>
      @page { size: A4; margin: 14mm; } body { font: 11pt Georgia, serif; color: #222; margin: 0; }
      h1 { font-size: 22pt; margin: 0 0 4mm; } .facts { display: grid; grid-template-columns: repeat(4, 1fr); gap: 2mm 6mm; margin-bottom: 6mm; }
      .facts div { border-bottom: 1px solid #999; padding: 1mm 0; min-height: 7mm; } .facts span { font-size: 8pt; color: #666; display: block; }
      table { width: 100%; border-collapse: collapse; } th, td { border: 1px solid #999; height: 9mm; padding: 1mm 2mm; font-size: 9pt; text-align: left; }
      th { background: #f1ebe3; } h2 { font-size: 13pt; margin: 6mm 0 2mm; } .notes { border: 1px solid #999; height: 40mm; }
    </style></head><body><h1>${esc(b?.name || 'Brew log')}</h1>
      <div class="facts">${facts.map(([k, v]) => `<div><span>${k}</span>${esc(v)}</div>`).join('')}</div>
      <table><thead><tr><th style="width:16%">Date</th><th style="width:14%">Gravity</th><th style="width:12%">Temp</th><th style="width:20%">Racked / added</th><th>Notes</th></tr></thead><tbody>${rows}</tbody></table>
      <h2>Tasting notes</h2><div class="notes"></div>
      <script>window.onload = () => window.print();</script></body></html>`;
    const w = window.open('', '_blank');
    if (w) { w.document.write(html); w.document.close(); }
  };
  return (
    <>
      <SelectField label="Fill it in from a brew (optional)" value={pick} onChange={setPick} options={[['', 'A blank sheet'], ...brews.map((x) => [String(x.id), x.name])]} />
      <p className="muted t-bm" style={{ margin: 0 }}>A one-page A4 sheet for the brew shed: date, gravity, temperature, rackings and additions, and tasting notes.</p>
      <Btn kind="filled" icon="print" onClick={open}>Print the log sheet</Btn>
    </>
  );
}

const TOOLS = [
  { id: 'abv', short: 'Strength', em: '🧮', name: 'Strength (ABV)', hint: 'ABV and attenuation from your gravity readings', C: AbvTool },
  { id: 'honey', short: 'Honey', em: '🍯', name: 'Honey for a mead', hint: 'How much honey for the strength and sweetness you want', C: HoneyTool },
  { id: 'sugar', short: 'Sugar', em: '🍬', name: 'Sugar for a wine', hint: 'Sugar to add to the must to reach a strength', C: SugarTool },
  { id: 'fortify', short: 'Fortify', em: '🥃', name: 'Fortifying', hint: 'Spirit for a target strength, or the strength after a measure', C: FortifyTool },
  { id: 'sweeten', short: 'Backsweeten', em: '🍭', name: 'Backsweetening', hint: 'Sugar or honey to bring a dry brew to a sweetness', C: SweetenTool },
  { id: 'stabilise', short: 'Stabilise', em: '🛡', name: 'Stabilising', hint: 'Campden tablets and sorbate for your batch', C: StabiliseTool },
  { id: 'nutrient', short: 'Nutrients', em: '🧪', name: 'Mead nutrients', hint: 'Fermaid O and a staggered (TOSNA) schedule', C: NutrientTool },
  { id: 'brix', short: 'Brix', em: '🔬', name: 'Brix and gravity', hint: 'Convert a refractometer reading to gravity, and back', C: BrixTool },
  { id: 'priming', short: 'Priming sugar', em: '🫧', name: 'Priming sugar', hint: 'Sugar at bottling for the fizz you want', C: PrimingTool },
  { id: 'hydro', short: 'Temperature correction', em: '🌡', name: 'Hydrometer temperature', hint: 'Correct a reading taken warm or cold', C: HydroTool },
  { id: 'refrac', short: 'Refractometer', em: '📐', name: 'Refractometer correction', hint: 'Gravity and strength from a reading taken mid-ferment', C: RefracTool },
  { id: 'scale', short: 'Scale', em: '⚖', name: 'Scale a recipe', hint: 'Any recipe in your book, at your batch size', C: ScaleTool },
  { id: 'log', short: 'Log sheet', em: '📝', name: 'Printable log sheet', hint: 'A one-page sheet for readings, rackings and notes', C: LogSheetTool },
];

// ---- the tools for a brew, by what it is and where it is in its life ----
const WINES = ['white_wine', 'red_wine', 'rose_wine', 'fruit_veg_wine', 'flower_herb_wine', 'hot_pepper_wine'];
const isMead = (b) => b?.category === 'mead' || /mead|melomel|cyser|pyment|metheglin|bochet|braggot|hydromel/i.test(`${b?.style || ''} ${b?.name || ''}`);
const isFizzy = (b) => ['beer', 'stout', 'cider', 'soda'].includes(b?.category) || b?.fizz === 'sparkling';
export function toolsFor(b) {
  if (!b) return [];
  const mead = isMead(b), wine = WINES.includes(b.category) && !mead, beer = ['beer', 'stout'].includes(b.category);
  const make = [mead && 'honey', wine && 'sugar', mead && 'nutrient'];
  if (b.isRecipe) return ['scale', ...make, 'brix'].filter(Boolean);
  const byStage = {
    planning: [...make, 'hydro', 'brix', b.fromRecipe && 'scale', 'log'],
    fermenting: ['abv', mead && 'nutrient', 'hydro', 'refrac', 'log'],
    conditioning: ['abv', !beer && 'stabilise', !beer && 'sweeten', (mead || wine) && 'fortify', 'hydro'],
    bottled: [isFizzy(b) && 'priming', 'abv', !beer && 'stabilise'],
    finished: ['abv'],
    dumped: [],
  };
  return (byStage[b.status] || []).filter(Boolean);
}
// a brew's own numbers, to fill a tool in with
export function seedFrom(b) {
  if (!b) return {};
  const c = b.calc || {};
  const og = Number(b.og || b.targetOg) || null;
  const fg = Number(b.targetFg) || null;
  const sweet = String(b.sweetnessTag || b.sweetness || '').toLowerCase();
  const finish = /sweet/.test(sweet) && !/semi|medium/.test(sweet) ? '1.020' : /medium|semi/.test(sweet) ? '1.012' : /off/.test(sweet) ? '1.005' : null;
  return {
    litres: Number(b.batchLitres) || null,
    og, targetFg: fg,
    gravity: Number(c.latestGravity) || null,
    abv: og && fg ? (og - fg) * 131.25 : (b.abvEstimate || c.potentialAbv || null),
    abvNow: c.abv || null,
    finish, mead: isMead(b),
    co2: ['cider', 'soda'].includes(b.category) || b.fizz === 'sparkling' ? '2.8' : b.category === 'stout' ? '1.8' : null,
    recipeId: b.isRecipe ? b.id : b.fromRecipe || null, isRecipe: b.isRecipe,
    brewId: b.isRecipe ? null : b.id,
  };
}
export const toolInfo = (id) => TOOLS.find((t) => t.id === id);

// a tool opened from a brew, filled in with its numbers (any screen can show this)
export function ToolSheet({ id, brew, recipes = [], brews = [], onClose }) {
  const [units, setUnitsState] = useState(readUnits);
  const setUnits = (u) => { setUnitsState(u); try { localStorage.setItem('hbbUnits', u); } catch { /* this visit only */ } };
  const tool = toolInfo(id);
  const seed = seedFrom(brew);
  return (
    <Sheet open={Boolean(tool)} onClose={onClose} title={tool ? `${tool.name}${brew ? ` · ${brew.name}` : ''}` : ''}>
      {tool && (
        <div className="calc" key={`${id}-${brew?.id || ''}-${units}`}>
          {!['abv', 'brix', 'hydro', 'refrac', 'log'].includes(id) && <div><UnitsPicker units={units} setUnits={setUnits} /></div>}
          <tool.C units={units} recipes={recipes} brews={brews} seed={seed} />
        </div>
      )}
    </Sheet>
  );
}

// the row of tools for this stage, on a brew or recipe page
export function StageTools({ brew, onTool }) {
  const ids = toolsFor(brew);
  if (!ids.length) return null;
  return (
    <div className="stage-tools">
      {/* a heading like the page's others (Ingredients, Method) */}
      <h2>{brew.isRecipe ? 'Tools for this recipe' : 'Tools for this stage'}</h2>
      <div className="chips wrap">
        {ids.map((id) => { const t = toolInfo(id); return (
          <button key={id} type="button" className="chip sl tool-chip" onClick={() => onTool(id)}><span className="em" aria-hidden="true">{t.em}</span>{t.short || t.name}</button>
        ); })}
      </div>
    </div>
  );
}

export default function Calculators({ recipes = [], brews = [], headerEnd }) {
  const [units, setUnitsState] = useState(readUnits);
  const setUnits = (u) => { setUnitsState(u); try { localStorage.setItem('hbbUnits', u); } catch { /* this visit only */ } };
  const [open, setOpen] = useState(null);
  const tool = TOOLS.find((t) => t.id === open);
  return (
    <>
      <div className="shelf-head gutter" style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <UnitsPicker units={units} setUnits={setUnits} />
        {headerEnd}
      </div>
      <div className="gutter" style={{ paddingTop: 8, paddingBottom: 120 }}>
        <div className="adm-grid tool-grid">
          {TOOLS.map((t, i) => (
            <button key={t.id} type="button" className="adm-tile sl enter tool" style={{ animationDelay: `${Math.min(i, 12) * 25}ms` }} onClick={() => setOpen(t.id)}>
              <span className="pic"><span className="em" aria-hidden="true">{t.em}</span></span>
              <span className="tx"><span className="nm">{t.name}</span><span className="st">{t.hint}</span></span>
            </button>
          ))}
        </div>
      </div>
      <Sheet open={Boolean(tool)} onClose={() => setOpen(null)} title={tool?.name || ''}>
        {tool && <div className="calc" key={`${tool.id}-${units}`}><tool.C units={units} recipes={recipes} brews={brews} /></div>}
      </Sheet>
    </>
  );
}
