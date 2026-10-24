// Run planner: every piece of the run planner's state, data and actions - routes, Komoot, GPX, Garmin,
// Nightscout (now / readiness), Strava runs, the plan and its edits, targets, the rulebook and its books - copied from
// the classic page (Dashboard/RunPlannerPortal.jsx, 24 Oct 2026) so the beta works on exactly the same services and
// syncs while it's compared side by side. Only the look differs; when the beta takes over, the classic copy goes.
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useUnits, toKm, paceText, paceToMinPerKm, KM_PER_MI } from '../../utils/units';

export function useRunPlanner({ theme = 'light' } = {}) {
  const isDark = theme === 'dark';
  const { units, setUnits } = useUnits();

  // Top Tab State: 'mission' | 'finder' | 'flythrough' | 'learning' | 'rulebook' (targets and rulebook)
  const [activeMainTab, setActiveMainTab] = useState('finder'); // pick a route first, then plan the run

  const [routes, setRoutes] = useState([]);
  const [routeId, setRouteIdState] = useState('');
  // the chosen route is kept in IMS (not just this tab), so a refresh - or opening the planner on the phone -
  // brings it back; choosing no route, or deleting it, clears it
  const restoredRef = useRef(false);
  const setRouteId = useCallback((id) => {
    setRouteIdState(id);
    fetch('/api/planner/selected-route', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ routeId: id || null }) }).catch(() => {});
  }, []);
  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;
    fetch('/api/planner/selected-route').then((r) => r.json()).then((j) => { if (j.success && j.routeId) setRouteIdState((cur) => cur || String(j.routeId)); }).catch(() => {});
  }, []);
  const [form, setForm] = useState({ distanceKm: '10', pace: '', intensity: 'steady', startBg: '', iob: '', cob: '', minutesSinceBolus: '' });
  const [targets, setTargets] = useState(null);
  const [now, setNow] = useState(null);
  const [plan, setPlan] = useState(null);
  const [komoot, setKomoot] = useState({ connected: false, email: null });
  const [tours, setTours] = useState(null);
  const [goals, setGoals] = useState([]);
  const [routeFull, setRouteFull] = useState(null);
  const [routeHistory, setRouteHistory] = useState(null);
  const [paceTouched, setPaceTouched] = useState(false);
  const [demand, setDemand] = useState(null);
  const [goalId, setGoalId] = useState('');
  const [tourType, setTourType] = useState('recorded');
  const [tourSearch, setTourSearch] = useState('');
  const [kForm, setKForm] = useState({ email: '', password: '', link: '' });
  const [rulebook, setRulebook] = useState(null);
  const [rulebookDraft, setRulebookDraft] = useState('');
  const [rulebookEditing, setRulebookEditing] = useState(false);
  const [rulebookExpanded, setRulebookExpanded] = useState(true);
  const [rulebookCopied, setRulebookCopied] = useState(false);

  // Pace / time / carbs override for inline plan editing
  const [originalBaseline, setOriginalBaseline] = useState(null);
  const [paceEditDraft, setPaceEditDraft] = useState(null);
  const [timeEditDraft, setTimeEditDraft] = useState(null);
  const [carbsEditDraft, setCarbsEditDraft] = useState(null);
  const [paceEditFocus, setPaceEditFocus] = useState(false);
  const [timeEditFocus, setTimeEditFocus] = useState(false);
  const [carbsEditFocus, setCarbsEditFocus] = useState(false);

  // Rulebook Books & AI Comparative Scanning State
  const [rulebookTab, setRulebookTab] = useState('rulebook'); // 'rulebook' | 'library' | 'findings' | 'paste'
  const [books, setBooks] = useState([]);
  const [bookUploadTitle, setBookUploadTitle] = useState('');
  const [bookUploadFile, setBookUploadFile] = useState(null);
  const [findings, setFindings] = useState([]);
  const [findingsStatusFilter, setFindingsStatusFilter] = useState('pending');
  const [findingsTypeFilter, setFindingsTypeFilter] = useState('all');
  const [editingFindingId, setEditingFindingId] = useState(null);
  const [editingFindingText, setEditingFindingText] = useState('');

  // Direct Research Text Review State
  const [pasteTitle, setPasteTitle] = useState('');
  const [pasteSource, setPasteSource] = useState('');
  const [pasteText, setPasteText] = useState('');
  const [pasteSaveAsBook, setPasteSaveAsBook] = useState(true);

  // Garmin Connect State
  const [garmin, setGarmin] = useState(null);
  const [showGarminModal, setShowGarminModal] = useState(false);
  const [garminForm, setGarminForm] = useState({ email: '', password: '', mfaCode: '' });
  const [garminBusy, setGarminBusy] = useState(false);

  const [needsSignIn, setNeedsSignIn] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [notification, setNotification] = useState(null);
  const fileRef = useRef(null);
  const bookFileRef = useRef(null);
  // Debounce ref for re-estimating on live target changes
  const estimateDebounceRef = useRef(null);

  const showToast = useCallback((msg, type = 'success') => {
    setNotification({ msg, type });
    setTimeout(() => setNotification((p) => (p?.msg === msg ? null : p)), 5000);
  }, []);

  const call = useCallback(async (url, options) => {
    const res = await fetch(url, { credentials: 'same-origin', ...options });
    const d = await res.json().catch(() => ({}));
    if (res.status === 401) { setNeedsSignIn(true); throw new Error(d.error || 'Sign in required.'); }
    if (res.status === 413) throw new Error(d.error || 'That file is too large to upload. Please choose a smaller GPX file.');
    if (!res.ok || d.success === false) throw new Error(d.error || 'Request failed.');
    return d;
  }, []);
  const send = (url, method, body) => call(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });

  const useCurrent = useCallback(async (silent = false) => {
    try {
      const d = await call('/api/planner/now');
      setNow(d);
      const n = d.now;
      if (n.bgFresh) setForm((f) => ({ ...f, startBg: String(n.bg), iob: n.iob != null ? String(n.iob) : f.iob, cob: n.cob != null ? String(n.cob) : f.cob, minutesSinceBolus: n.lastBolusMinutesAgo != null ? String(n.lastBolusMinutesAgo) : '' }));
      else if (!silent) showToast('No fresh glucose reading in the log - type your values in.', 'error');
    } catch (err) { if (!silent) showToast(err.message, 'error'); }
  }, [call, showToast]);

  const loadAll = useCallback(async () => {
    try {
      const [r, t, k, gStatus] = await Promise.all([
        call('/api/planner/routes'),
        call('/api/planner/targets'),
        call('/api/planner/komoot/status'),
        call('/api/garmin/status').catch(() => ({ connected: false }))
      ]);
      setNeedsSignIn(false); setRoutes(r.routes); setTargets(t.targets); setKomoot(k);
      setGarmin(gStatus);
      try { setGoals((await call('/api/goals')).goals); } catch (_) { /* optional */ }
      try {
        const rb = await call('/api/planner/rulebook');
        setRulebook(rb);
        setRulebookDraft(rb.rulebook || '');
      } catch (_) { /* optional */ }
      try {
        const [bRes, fRes] = await Promise.all([
          call('/api/planner/rulebook/books'),
          call('/api/planner/rulebook/findings')
        ]);
        setBooks(bRes.books || []);
        setFindings(fRes.findings || []);
      } catch (_) { /* optional */ }
      await useCurrent(true);
    } catch (_) { /* needsSignIn set */ } finally { setIsLoading(false); }
  }, [call, useCurrent]);
  useEffect(() => { loadAll(); }, [loadAll]);

  const goal = goals.find((a) => String(a.goal.id) === goalId) || null;

  useEffect(() => {
    let live = true;
    setRouteFull(null);
    setRouteHistory(null);
    setPaceTouched(false);
    if (routeId) {
      call(`/api/planner/routes/${routeId}`).then((d) => { if (live) setRouteFull(d.route); }).catch(() => {});
      call(`/api/planner/routes/${routeId}/history`).then((d) => { if (live) setRouteHistory(d); }).catch(() => {});
    }
    return () => { live = false; };
  }, [routeId, call]);

  useEffect(() => {
    let live = true;
    setDemand(null);
    const distKm = routeFull ? routeFull.distanceKm : toKm(form.distanceKm, units);
    if (!distKm || distKm <= 0) return;
    const body = {
      distanceKm: distKm,
      intensity: form.intensity,
      paceMinPerKm: form.pace ? (paceToMinPerKm(form.pace, units) || null) : null,
      gainM: routeFull?.gainM,
      lossM: routeFull?.lossM,
      profile: routeFull?.profile,
    };
    const t = setTimeout(() => {
      send('/api/planner/demand', 'POST', body)
        .then((d) => {
          if (!live || !d) return;
          const demandObj = d.demand || d;
          setDemand(demandObj);
          if (!paceTouched && demandObj?.inputs?.averagePaceMinPerKm) {
            setForm((f) => ({ ...f, pace: paceText(demandObj.inputs.averagePaceMinPerKm, units) }));
          }
        })
        .catch(() => {
          if (live) setDemand(null);
        });

    }, 250);
    return () => { live = false; clearTimeout(t); };
  }, [routeFull, form.distanceKm, form.intensity, form.pace, paceTouched, units]);

  // The Run Plan recalculates by itself whenever anything that feeds it changes - the route (from the
  // Route Finder, saved routes, a Komoot import, a link or a GPX), the distance, glucose, insulin and
  // carbs on board, pace, effort, goal or targets. With no start glucose typed in, it starts from live
  // glucose when fresh, otherwise the start target. A new route resets the "vs original plan" baseline.
  const lastRouteRef = useRef(null);
  const lastInputsRef = useRef('');
  useEffect(() => {
    const distKm = routeFull ? routeFull.distanceKm : toKm(form.distanceKm, units);
    if (!(distKm > 0)) return undefined;
    if (routeId && !routeFull) return undefined; // the chosen route is still loading
    const typed = form.startBg !== '' && form.startBg != null && Number(form.startBg) > 0;
    const startBg = typed ? Number(form.startBg) : now?.now?.bgFresh && now?.now?.bg ? now.now.bg : targets?.startTarget;
    if (!startBg) return undefined;
    const routeKey = routeFull?.id ?? `d${distKm}`;
    const isNewRoute = lastRouteRef.current !== routeKey;
    // filling in the start glucose below changes the form again - don't plan twice for the same inputs
    const sig = JSON.stringify([routeKey, startBg, form.iob, form.cob, form.minutesSinceBolus, form.pace, form.intensity, goalId, targets, units]);
    if (sig === lastInputsRef.current) return undefined;
    const t = setTimeout(() => {
      if (!typed) setForm((f) => ({ ...f, startBg: String(startBg) }));
      lastRouteRef.current = routeKey;
      lastInputsRef.current = sig;
      if (isNewRoute) setCustomTiming({ intakes: null, drinks: null });
      estimate({ startBg, isTweak: !isNewRoute, ...(isNewRoute ? { customIntakes: null, customDrinks: null } : {}) });
    }, isNewRoute ? 0 : 500);
    return () => clearTimeout(t);
  }, [routeFull?.id, routeId, form.distanceKm, form.startBg, form.iob, form.cob, form.minutesSinceBolus, form.pace, form.intensity, goalId, targets, units]); // eslint-disable-line react-hooks/exhaustive-deps


  // When a re-plan changes the carb stops, say why (which inputs moved) and offer to keep the previous stops -
  // e.g. insulin on board falling between two plans can take a stop away even though the pace was all you touched.
  const planRef = useRef(null);
  const [carbChange, setCarbChange] = useState(null);
  const stopsKey = (p) => (p?.plan?.stops || []).map((s) => `${s.minute}:${s.grams}`).join(',');
  const noteCarbChange = (prev, next, isTweak) => {
    if (!isTweak || !prev?.plan || !next?.plan || stopsKey(prev) === stopsKey(next)) return;
    const pi = prev.inputs || {}, ni = next.inputs || {};
    const r1 = (n) => Math.round(n * 10) / 10;
    const reasons = [];
    if (pi.iob !== ni.iob) reasons.push(`insulin on board ${pi.iob} → ${ni.iob} U (${ni.iob < pi.iob ? 'less insulin acting, so less of a drop' : 'more insulin acting, so more of a drop'})`);
    if (pi.startBg !== ni.startBg) reasons.push(`start glucose ${pi.startBg} → ${ni.startBg}`);
    if (pi.cob !== ni.cob) reasons.push(`carbs on board ${pi.cob} → ${ni.cob} g`);
    if (prev.run?.durationMin !== next.run?.durationMin) reasons.push(`run time ${prev.run?.durationMin} → ${next.run?.durationMin} min (pace ${paceText(pi.averagePaceMinPerKm, units)} → ${paceText(ni.averagePaceMinPerKm, units)} per ${units})`);
    if (pi.intensity !== ni.intensity) reasons.push(`effort ${pi.intensity} → ${ni.intensity}`);
    if (r1(prev.run?.combinedEffortFactor || 1) !== r1(next.run?.combinedEffortFactor || 1)) reasons.push(`effort factor ${r1(prev.run?.combinedEffortFactor || 1)} → ${r1(next.run?.combinedEffortFactor || 1)}`);
    if ((prev.learning?.applied?.length || 0) !== (next.learning?.applied?.length || 0)) reasons.push('lessons from your runs');
    const fmt = (p) => (p.plan.stops.length ? p.plan.stops.map((s) => `${s.grams} g at ${s.minute === 0 ? 'the start' : `${s.minute} min`}`).join(', ') : 'no carbs');
    setCarbChange({
      from: fmt(prev), to: fmt(next), fromTotal: prev.plan.totalCarbs, toTotal: next.plan.totalCarbs, reasons,
      lowest: next.plan.predicted?.minDuring, floor: next.settings?.floor,
      prevIntakes: prev.plan.stops.map((s) => ({ t: s.minute, g: s.grams, kind: s.minute === 0 ? 'start' : 'run' })),
    });
  };
  const keepPreviousStops = () => {
    if (!carbChange) return;
    setCustomTiming({ intakes: carbChange.prevIntakes });
    estimate({ isTweak: true, customIntakes: carbChange.prevIntakes });
    setCarbChange(null);
  };

  // Your own timing for carb stops and water-only drinks (dragged on the Run plan chart, or carbs changed per
  // stop). Kept so any later re-plan (pace, glucose, effort...) keeps it; cleared by a new route or Reset.
  const customTimingRef = useRef({ intakes: null, drinks: null });
  const [hasCustomTiming, setHasCustomTiming] = useState(false);
  const setCustomTiming = (t) => {
    customTimingRef.current = { ...customTimingRef.current, ...t };
    setHasCustomTiming(Boolean(customTimingRef.current.intakes || customTimingRef.current.drinks));
  };

  const estimate = async (overrides = {}, targetsOverride = null) => {
    setBusy('estimate');
    try {
      const distKm = routeFull ? routeFull.distanceKm : toKm(form.distanceKm, units);
      const isTweak = overrides?.isTweak === true;
      const targetPace = overrides?.paceMinPerKm ?? (form.pace ? paceToMinPerKm(form.pace, units) : null);
      const targetCarbs = overrides?.customCarbs;
      // an explicit override (even null) wins; otherwise the remembered custom timing
      const targetCustomIntakes = overrides?.customIntakes !== undefined ? overrides.customIntakes : (overrides?.customCarbs !== undefined ? null : customTimingRef.current.intakes);
      const targetCustomDrinks = overrides?.customDrinks !== undefined ? overrides.customDrinks : customTimingRef.current.drinks;
      // Use live (possibly unsaved) targets so the chart reacts instantly to Tab 3 adjustments
      const liveTargets = targetsOverride ?? targets;

      const body = {
        distanceKm: distKm,
        paceMinPerKm: targetPace,
        intensity: form.intensity,
        startBg: Number(overrides?.startBg ?? form.startBg),
        iob: form.iob === '' ? null : Number(form.iob),
        cob: form.cob === '' ? null : Number(form.cob),
        minutesSinceBolus: form.minutesSinceBolus === '' ? null : Number(form.minutesSinceBolus),
        // the trend arrow, when planning from the current reading - the rulebook's start rules use it
        trend: now?.now?.bgFresh && Number(overrides?.startBg ?? form.startBg) === Number(now.now.bg) ? (now.now.direction || null) : null,
        gainM: routeFull?.gainM,
        lossM: routeFull?.lossM,
        profile: routeFull?.profile,
        routeName: routeFull?.name || (routeId ? routes.find((r) => String(r.id) === routeId)?.name : null),
        routeId: routeId || null,
        goalId: goalId || null,
        customCarbs: targetCarbs,
        customIntakes: targetCustomIntakes,
        customDrinks: targetCustomDrinks,
        // Live target overrides — backend uses these instead of persisted DB values
        ...(liveTargets?.startTarget !== undefined ? { startTarget: Number(liveTargets.startTarget) } : {}),
        ...(liveTargets?.floor !== undefined ? { floor: Number(liveTargets.floor) } : {}),
        ...(liveTargets?.sensMult !== undefined ? { sensMult: Number(liveTargets.sensMult) } : {}),
        ...(liveTargets?.weightKg !== undefined && liveTargets.weightKg !== null && liveTargets.weightKg !== '' ? { weightKg: Number(liveTargets.weightKg) } : {}),
      };

      const d = await send('/api/planner/estimate', 'POST', body);
      noteCarbChange(planRef.current, d, isTweak);
      planRef.current = d;
      setPlan(d);

      if (!isTweak) {
        setOriginalBaseline({
          durationMin: d?.run?.durationMin,
          averagePaceMinPerKm: d?.inputs?.averagePaceMinPerKm,
          totalCarbs: d?.plan?.totalCarbs
        });
      }
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setBusy('');
    }
  };

  // Debounced re-estimation triggered by live target changes in Tab 3.
  // Only fires if a plan already exists (i.e. the user has already generated one).
  const estimateWithTargets = useCallback((newTargets) => {
    if (!plan) return; // no plan to update yet
    if (estimateDebounceRef.current) clearTimeout(estimateDebounceRef.current);
    estimateDebounceRef.current = setTimeout(() => {
      estimate({ isTweak: true }, newTargets);
    }, 600);
  }, [plan]); // eslint-disable-line react-hooks/exhaustive-deps

  const stepTime = (deltaMin) => {
    if (!plan || !plan.run) return;
    const currentDur = plan.run.durationMin || 0;
    const newDur = Math.max(2, currentDur + deltaMin);
    const distKm = plan.run.distanceKm || 1;
    const newPaceMinPerKm = newDur / distKm;
    const newPaceStr = paceText(newPaceMinPerKm, units);
    setForm((f) => ({ ...f, pace: newPaceStr }));
    setPaceTouched(true);
    estimate({ isTweak: true, paceMinPerKm: newPaceMinPerKm });
  };

  const stepPace = (deltaSec) => {
    if (!plan) return;
    const paceVal = plan.inputs?.averagePaceMinPerKm || 5.0;
    const currentPacePerUnit = units === 'mi' ? paceVal * KM_PER_MI : paceVal;
    const newPacePerUnit = Math.max(2, currentPacePerUnit + deltaSec / 60);
    const newPaceMinPerKm = units === 'mi' ? newPacePerUnit / KM_PER_MI : newPacePerUnit;
    const newPaceStr = paceText(newPaceMinPerKm, units);
    setForm((f) => ({ ...f, pace: newPaceStr }));
    setPaceTouched(true);
    estimate({ isTweak: true, paceMinPerKm: newPaceMinPerKm });
  };

  const stepCarbs = (deltaGrams) => {
    if (!plan || !plan.plan) return;
    const own = customTimingRef.current.intakes;
    if (own?.length) {
      const total = own.reduce((n, it) => n + it.g, 0) || 1;
      const target = Math.max(0, total + deltaGrams);
      const scaled = own.map((it) => ({ ...it, g: Math.max(0, Math.round(((it.g / total) * target) / 5) * 5) }));
      setCustomTiming({ intakes: scaled });
      estimate({ isTweak: true, customIntakes: scaled });
      return;
    }
    const currentG = plan.plan.totalCarbs || 0;
    const newG = Math.max(0, currentG + deltaGrams);
    estimate({ isTweak: true, customCarbs: newG });
  };

  // Per-stop independent stepper: adjust only one milestone's grams.
  // Sends the full modified intakes array so the backend re-simulates with exact values.
  // Min per stop = 0 (zero = stop removed from simulation).
  const stepStopCarbs = (stopIdx, deltaGrams) => {
    if (!plan?.plan?.stops) return;
    const stops = plan.plan.stops;
    if (stopIdx < 0 || stopIdx >= stops.length) return;
    // Build modified intakes from current stops — map back to intake format {t, g, kind}
    const newIntakes = stops.map((s, i) => ({
      t: s.minute,
      g: i === stopIdx ? Math.max(0, (s.grams || 0) + deltaGrams) : (s.grams || 0),
      kind: s.minute === 0 ? 'start' : 'run',
    }));
    setCustomTiming({ intakes: newIntakes });
    estimate({ isTweak: true, customIntakes: newIntakes });
  };

  // dragging a carb line: that stop moves to a new minute (its water goes with it)
  const moveStop = (stopIdx, minute) => {
    const stops = plan?.plan?.stops || [];
    if (!stops[stopIdx]) return;
    const intakes = stops.map((st, i) => {
      const t = i === stopIdx ? Math.max(0, Math.round(minute)) : st.minute;
      return { t, g: st.grams || 0, kind: t === 0 ? 'start' : 'run' };
    }).sort((a, b) => a.t - b.t);
    setCustomTiming({ intakes });
    estimate({ isTweak: true, customIntakes: intakes });
  };
  // full control of the stops: add one (10 g, in the middle of the longest gap) or remove one. Your own
  // stops from then on - kept through re-plans until Reset or a new route.
  const ownStops = (stops) => stops.map((st) => ({ t: st.minute, g: st.grams || 0, kind: st.minute === 0 ? 'start' : 'run' }));
  const applyStops = (intakes) => {
    const sorted = [...intakes].sort((a, b) => a.t - b.t);
    setCustomTiming({ intakes: sorted });
    estimate({ isTweak: true, customIntakes: sorted });
  };
  const addStop = (minute = null, grams = 10) => {
    if (!plan?.plan) return;
    const dur = plan.run?.durationMin || 30;
    const stops = plan.plan.stops || [];
    let t = minute;
    if (t == null) {
      const marks = [0, ...stops.map((s) => s.minute), dur].sort((a, b) => a - b);
      let best = [0, dur];
      for (let i = 1; i < marks.length; i++) if (marks[i] - marks[i - 1] > best[1] - best[0]) best = [marks[i - 1], marks[i]];
      t = Math.round((best[0] + best[1]) / 2);
    }
    applyStops([...ownStops(stops), { t: Math.max(0, Math.min(dur, Math.round(t))), g: grams, kind: t === 0 ? 'start' : 'run' }]);
  };
  const removeStop = (stopIdx) => {
    const stops = plan?.plan?.stops || [];
    if (!stops[stopIdx]) return;
    applyStops(ownStops(stops.filter((_, i) => i !== stopIdx)));
  };

  // dragging a water-only line
  const moveDrink = (fromMinute, minute) => {
    const own = (plan?.drinks || []).filter((d) => !d.withCarbs).map((d) => ({ minute: d.minute === fromMinute ? Math.max(1, Math.round(minute)) : d.minute, ml: d.ml }));
    setCustomTiming({ drinks: own });
    estimate({ isTweak: true, customDrinks: own });
  };
  const resetTiming = () => {
    setCustomTiming({ intakes: null, drinks: null });
    estimate({ isTweak: true, customIntakes: null, customDrinks: null });
  };

  const saveTargets = async () => {
    setBusy('targets');
    try {
      const d = await send('/api/planner/targets', 'PUT', targets);
      setTargets(d.targets);
      showToast('Targets and assumptions saved.');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setBusy('');
    }
  };

  const addGpx = async (file) => {
    if (!file) return;
    setBusy('gpx');
    try {
      const d = await send('/api/planner/routes/gpx', 'POST', { gpx: await file.text(), name: file.name.replace(/\.gpx$/i, '') });
      showToast(`Added "${d.route.name}" - ${d.route.distanceKm} km, ${d.route.gainM} m up.`);
      setRouteId(String(d.route.id));
      loadAll();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setBusy('');
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const addLink = async () => {
    setBusy('link');
    try {
      const d = await send('/api/planner/routes/komoot-link', 'POST', { link: kForm.link });
      showToast(`Added "${d.route.name}".`);
      setKForm({ ...kForm, link: '' });
      setRouteId(String(d.route.id));
      loadAll();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setBusy('');
    }
  };

  const connectKomoot = async () => {
    setBusy('komoot');
    try {
      const d = await send('/api/planner/komoot/connect', 'POST', { email: kForm.email, password: kForm.password });
      setKomoot(d);
      setKForm({ ...kForm, password: '' });
      showToast(`Komoot connected${d.email ? ` as ${d.email}` : ''}.`);
      loadTours();
      return true;
    } catch (err) {
      showToast(err.message, 'error');
      return false;
    } finally {
      setBusy('');
    }
  };

  const loadTours = async (type = 'recorded') => {
    setBusy('tours');
    try {
      setTourType(type);
      setTours((await call(`/api/planner/komoot/tours?type=${type}`)).tours);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setBusy('');
    }
  };

  const importTour = async (id) => {
    setBusy(`t${id}`);
    try {
      const d = await send('/api/planner/komoot/import', 'POST', { tourId: id });
      showToast(`Imported "${d.route.name}".`);
      setRouteId(String(d.route.id));
      loadAll();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setBusy('');
    }
  };

  const handleConnectGarmin = async (e) => {
    if (e) e.preventDefault();
    if (!garminForm.email || !garminForm.password) {
      return showToast('Please enter your Garmin Connect email and password.', 'error');
    }
    setGarminBusy(true);
    try {
      const res = await send('/api/garmin/connect', 'POST', garminForm);
      setGarmin(res);
      if (res.connected) {
        showToast('Garmin Connect linked and health data synced!');
        setGarminForm({ email: '', password: '', mfaCode: '' });
        setShowGarminModal(false);
        await useCurrent(true);
      } else if (res.mfaRequired) {
        showToast('MFA verification code required from your email/SMS.', 'info');
      } else {
        showToast(res.error || 'Failed to authenticate with Garmin.', 'error');
      }
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setGarminBusy(false);
    }
  };

  const handleSyncGarmin = async () => {
    setGarminBusy(true);
    try {
      const res = await send('/api/garmin/sync', 'POST');
      if (res.success) {
        showToast('Garmin daily health metrics synced!');
        const gStatus = await call('/api/garmin/status').catch(() => ({ connected: true }));
        setGarmin(gStatus);
        await useCurrent(true);
      } else {
        showToast(res.error || 'Garmin sync failed.', 'error');
      }
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setGarminBusy(false);
    }
  };

  const handleDisconnectGarmin = async () => {
    if (!window.confirm('Disconnect Garmin Connect? This removes stored OAuth session tokens.')) return;
    setGarminBusy(true);
    try {
      await send('/api/garmin/disconnect', 'POST');
      setGarmin({ connected: false });
      showToast('Garmin disconnected.');
      await useCurrent(true);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setGarminBusy(false);
    }
  };

  const removeRoute = async (r) => {
    if (!window.confirm(`Delete the route "${r.name}"?`)) return;
    try {
      await call(`/api/planner/routes/${r.id}`, { method: 'DELETE' });
      if (String(r.id) === routeId) setRouteId('');
      loadAll();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const saveRulebookText = async () => {
    setBusy('rulebook');
    try {
      const d = await send('/api/planner/rulebook', 'PUT', { rulebook: rulebookDraft });
      setRulebook(d);
      setRulebookEditing(false);
      showToast('Running with T1D Rulebook updated.');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setBusy('');
    }
  };

  const handleResetRulebook = async () => {
    if (!window.confirm('Reset the T1D Running Rulebook to clinical default?')) return;
    setBusy('rulebook-reset');
    try {
      const d = await send('/api/planner/rulebook/reset', 'POST');
      setRulebook(d);
      setRulebookDraft(d.rulebook || '');
      setRulebookEditing(false);
      showToast('Rulebook reset to default.');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setBusy('');
    }
  };

  const copyRulebookText = () => {
    if (!rulebook?.rulebook) return;
    navigator.clipboard.writeText(rulebook.rulebook);
    setRulebookCopied(true);
    setTimeout(() => setRulebookCopied(false), 2000);
    showToast('Rulebook copied.');
  };

  const handleUploadBook = async () => {
    if (!bookUploadFile) return showToast('Please select a file.', 'error');
    setBusy('book-upload');
    try {
      const reader = new FileReader();
      const base64Promise = new Promise((res, rej) => {
        reader.onload = () => res(reader.result);
        reader.onerror = rej;
      });
      reader.readAsDataURL(bookUploadFile);
      const dataBase64 = await base64Promise;
      const d = await send('/api/planner/rulebook/books/upload', 'POST', {
        title: bookUploadTitle || bookUploadFile.name.replace(/\.[^/.]+$/, ''),
        filename: bookUploadFile.name,
        dataBase64
      });
      setBooks((prev) => [d.book, ...prev]);
      setBookUploadFile(null);
      setBookUploadTitle('');
      if (bookFileRef.current) bookFileRef.current.value = '';
      showToast(`Indexed "${d.book.title}".`);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setBusy('');
    }
  };

  const handleDeleteBook = async (b) => {
    if (!window.confirm(`Delete "${b.title}"?`)) return;
    setBusy(`del-book-${b.id}`);
    try {
      await call(`/api/planner/rulebook/books/${b.id}`, { method: 'DELETE' });
      setBooks((prev) => prev.filter((x) => x.id !== b.id));
      setFindings((prev) => prev.filter((x) => x.book_id !== b.id));
      showToast(`Deleted "${b.title}".`);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setBusy('');
    }
  };

  const handleScanBook = async (bookId = null) => {
    setBusy(`scan-${bookId || 'all'}`);
    try {
      const d = await send('/api/planner/rulebook/scan', 'POST', { bookId: bookId || undefined });
      const [fRes, bRes] = await Promise.all([
        call('/api/planner/rulebook/findings'),
        call('/api/planner/rulebook/books')
      ]);
      setFindings(fRes.findings || []);
      setBooks(bRes.books || []);
      setRulebookTab('findings');
      setFindingsStatusFilter('pending');
      showToast(`Scan complete: ${d.new_findings_count} findings found.`);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setBusy('');
    }
  };

  const handleResolveFinding = async (finding, action, customText = null) => {
    setBusy(`res-${finding.id}`);
    try {
      const d = await send(`/api/planner/rulebook/findings/${finding.id}/resolve`, 'POST', {
        action,
        customText
      });
      setFindings((prev) =>
        prev.map((f) =>
          f.id === finding.id
            ? { ...f, status: d.status || (action === 'dismiss' ? 'dismissed' : 'accepted'), user_action: action }
            : f
        )
      );
      if (d.rulebook) {
        setRulebook((prev) => ({ ...prev, rulebook: d.rulebook, updatedAt: Date.now(), isDefault: false }));
        setRulebookDraft(d.rulebook);
      }
      setEditingFindingId(null);
      setEditingFindingText('');
      showToast(d.message || 'Finding updated.');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setBusy('');
    }
  };

  const handleAcceptFinding = (findingId) => {
    const f = findings.find((x) => x.id === findingId);
    if (!f) return;
    const action = f.finding_type === 'conflict' ? 'replace' : 'add';
    handleResolveFinding(f, action);
  };

  const handleDismissFinding = (findingId) => {
    const f = findings.find((x) => x.id === findingId);
    if (!f) return;
    handleResolveFinding(f, 'dismiss');
  };

  const handleApplyFindingEdit = (findingId) => {
    const f = findings.find((x) => x.id === findingId);
    if (!f) return;
    const action = f.finding_type === 'conflict' ? 'replace' : 'add';
    handleResolveFinding(f, action, editingFindingText);
  };


  const handleReviewPastedResearch = async () => {
    const text = pasteText.trim();
    if (!text || text.length < 20) return showToast('Please paste at least 20 characters of research.', 'error');
    setBusy('research-review');
    try {
      const d = await send('/api/planner/rulebook/research/review', 'POST', {
        title: pasteTitle.trim() || undefined,
        source: pasteSource.trim() || undefined,
        textContent: text,
        saveAsBook: pasteSaveAsBook
      });
      const fRes = await call('/api/planner/rulebook/findings');
      setFindings(fRes.findings || []);
      if (pasteSaveAsBook) {
        const bRes = await call('/api/planner/rulebook/books');
        setBooks(bRes.books || []);
      }
      setRulebookTab('findings');
      setFindingsStatusFilter('pending');
      showToast(d.summary || `Research reviewed: ${d.new_findings_count} findings.`);
      setPasteTitle('');
      setPasteSource('');
      setPasteText('');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setBusy('');
    }
  };

  const pendingFindingsCount = useMemo(() => findings.filter((f) => f.status === 'pending').length, [findings]);

  const pickGoal = (id) => {
    setGoalId(id);
    const g = goals.find((a) => String(a.goal.id) === id);
    if (!g) return;
    if (!routeId) setForm((f) => ({ ...f, distanceKm: String(g.goal.distanceKm) }));
    if (g.goal.targetMin) {
      const pace = g.goal.targetMin / g.goal.distanceKm;
      setForm((f) => ({ ...f, pace: paceText(pace, units) }));
      setPaceTouched(true);
    }
  };

  const signIn = () => { window.location.href = `/api/auth/google?returnTo=${encodeURIComponent(window.location.pathname)}`; };

  return {
    isDark,
    units,
    setUnits,
    activeMainTab,
    setActiveMainTab,
    routes,
    setRoutes,
    routeId,
    setRouteIdState,
    restoredRef,
    setRouteId,
    form,
    setForm,
    targets,
    setTargets,
    now,
    setNow,
    plan,
    setPlan,
    komoot,
    setKomoot,
    tours,
    setTours,
    goals,
    setGoals,
    routeFull,
    setRouteFull,
    routeHistory,
    setRouteHistory,
    paceTouched,
    setPaceTouched,
    demand,
    setDemand,
    goalId,
    setGoalId,
    tourType,
    setTourType,
    tourSearch,
    setTourSearch,
    kForm,
    setKForm,
    rulebook,
    setRulebook,
    rulebookDraft,
    setRulebookDraft,
    rulebookEditing,
    setRulebookEditing,
    rulebookExpanded,
    setRulebookExpanded,
    rulebookCopied,
    setRulebookCopied,
    originalBaseline,
    setOriginalBaseline,
    paceEditDraft,
    setPaceEditDraft,
    timeEditDraft,
    setTimeEditDraft,
    carbsEditDraft,
    setCarbsEditDraft,
    paceEditFocus,
    setPaceEditFocus,
    timeEditFocus,
    setTimeEditFocus,
    carbsEditFocus,
    setCarbsEditFocus,
    rulebookTab,
    setRulebookTab,
    books,
    setBooks,
    bookUploadTitle,
    setBookUploadTitle,
    bookUploadFile,
    setBookUploadFile,
    findings,
    setFindings,
    findingsStatusFilter,
    setFindingsStatusFilter,
    findingsTypeFilter,
    setFindingsTypeFilter,
    editingFindingId,
    setEditingFindingId,
    editingFindingText,
    setEditingFindingText,
    pasteTitle,
    setPasteTitle,
    pasteSource,
    setPasteSource,
    pasteText,
    setPasteText,
    pasteSaveAsBook,
    setPasteSaveAsBook,
    garmin,
    setGarmin,
    showGarminModal,
    setShowGarminModal,
    garminForm,
    setGarminForm,
    garminBusy,
    setGarminBusy,
    needsSignIn,
    setNeedsSignIn,
    isLoading,
    setIsLoading,
    busy,
    setBusy,
    notification,
    setNotification,
    fileRef,
    bookFileRef,
    estimateDebounceRef,
    showToast,
    call,
    send,
    useCurrent,
    loadAll,
    goal,
    lastRouteRef,
    lastInputsRef,
    planRef,
    carbChange,
    setCarbChange,
    stopsKey,
    noteCarbChange,
    keepPreviousStops,
    customTimingRef,
    hasCustomTiming,
    setHasCustomTiming,
    setCustomTiming,
    estimate,
    estimateWithTargets,
    stepTime,
    stepPace,
    stepCarbs,
    stepStopCarbs,
    moveStop,
    ownStops,
    applyStops,
    addStop,
    removeStop,
    moveDrink,
    resetTiming,
    saveTargets,
    addGpx,
    addLink,
    connectKomoot,
    loadTours,
    importTour,
    handleConnectGarmin,
    handleSyncGarmin,
    handleDisconnectGarmin,
    removeRoute,
    saveRulebookText,
    handleResetRulebook,
    copyRulebookText,
    handleUploadBook,
    handleDeleteBook,
    handleScanBook,
    handleResolveFinding,
    handleAcceptFinding,
    handleDismissFinding,
    handleApplyFindingEdit,
    handleReviewPastedResearch,
    pendingFindingsCount,
    pickGoal,
    signIn,
  };
}
