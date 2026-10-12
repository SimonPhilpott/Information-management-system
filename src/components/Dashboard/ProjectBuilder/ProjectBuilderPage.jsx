import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Rocket, ArrowLeft, ArrowRight, Wand2, Search, CheckCircle2, Circle, CheckSquare, Square, Copy, Check,
  FolderTree, Folder, FolderOpen, GitBranch, Code2, Palette, ShieldCheck, Boxes, ChevronDown, ChevronUp,
  AlertCircle, Loader2, ExternalLink, Sparkles, ListChecks
} from 'lucide-react';
import PortalShell from '../PortalShell';

// New Project (/ims/code-repo/new-project): describe it -> find my code -> review -> build.
// Server: pdf-knowledge-base/server/services/projectBuilderService.js (options in projectBuilderPresets.json).

const API = '/api/code-repo/builder';
const DRAFT_KEY = 'ims.projectBuilder.draft.v1';
const STEPS = [
  { n: 1, label: 'Describe it', icon: Sparkles },
  { n: 2, label: 'Find my code', icon: Search },
  { n: 3, label: 'Review', icon: FolderTree },
  { n: 4, label: 'Build', icon: Rocket },
];

async function call(pathname, body) {
  const res = await fetch(`${API}/${pathname}`, body === undefined ? undefined : {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({ success: false, error: `The server replied ${res.status}` }));
  if (!res.ok || data.success === false) throw new Error(data.error || `The server replied ${res.status}`);
  return data;
}

const loadDraft = () => { try { return JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null'); } catch (_) { return null; } };
const slugify = (t) => String(t || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'new-project';

export default function ProjectBuilderPage({ theme = 'dark', onThemeToggle, setCurrentPath }) {
  const isDark = theme === 'dark';
  const draft = useMemo(loadDraft, []);
  const [options, setOptions] = useState(null);
  const [optionsError, setOptionsError] = useState('');
  const [step, setStep] = useState(draft?.step || 1);
  const [name, setName] = useState(draft?.name || '');
  const [brief, setBrief] = useState(draft?.brief || '');
  const [setup, setSetup] = useState(draft?.setup || { stack: null, look: null, rules: null });
  const [reasons, setReasons] = useState(draft?.reasons || { stack: '', look: '', rules: {} });
  const [groups, setGroups] = useState(draft?.groups || null);
  const [plan, setPlan] = useState(draft?.plan || null);
  const [planKey, setPlanKey] = useState(draft?.planKey || '');
  const [folder, setFolder] = useState(draft?.folder || '');
  const [applyChanges, setApplyChanges] = useState(draft?.applyChanges ?? true);
  const [makeRepo, setMakeRepo] = useState(false);
  const [created, setCreated] = useState(null);
  const [busy, setBusy] = useState('');
  const [toast, setToast] = useState(null);

  const say = useCallback((msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast((t) => (t?.msg === msg ? null : t)), 5000);
  }, []);

  useEffect(() => {
    call('options').then((o) => {
      setOptions(o);
      setSetup((s) => (s.rules ? s : { ...s, rules: o.rules.filter((r) => r.default).map((r) => r.id) }));
    }).catch((err) => setOptionsError(err.message));
  }, []);

  // the work so far survives a refresh (this browser only)
  useEffect(() => {
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ step, name, brief, setup, reasons, groups, plan, planKey, folder, applyChanges })); } catch (_) { }
  }, [step, name, brief, setup, reasons, groups, plan, planKey, folder, applyChanges]);

  const chosenCode = useMemo(() => (groups || []).flatMap((g) => g.items.filter((i) => i.include !== false).map((i) => ({
    id: i.id, job: g.job, why: i.why, include: true, changes: (i.changes || []).filter((c) => c.include !== false),
  }))), [groups]);
  const body = useMemo(() => ({ name, brief, stack: setup.stack, look: setup.look, rules: setup.rules || [], code: chosenCode }), [name, brief, setup, chosenCode]);
  const bodyKey = JSON.stringify(body);

  const stack = options?.stacks.find((s) => s.id === setup.stack);
  const look = options?.looks.find((l) => l.id === setup.look);
  const canFind = Boolean(brief.trim() && setup.stack);
  const canReview = canFind && name.trim() && groups !== null;
  const reachable = { 1: true, 2: canFind, 3: canReview, 4: canReview && Boolean(plan) };

  // ---- actions
  const suggest = async () => {
    setBusy('suggest');
    try {
      const r = await call('suggest', { name, brief });
      setSetup({ stack: r.stack.id, look: r.look.id, rules: r.rules.map((x) => x.id) });
      setReasons({ stack: r.stack.why || '', look: r.look.why || '', rules: Object.fromEntries(r.rules.map((x) => [x.id, x.why || ''])) });
      setGroups(null); setPlan(null);
      say(r.aiUsed ? 'Suggested a setup from your brief - change anything you like.' : 'Picked sensible defaults (the AI didn\'t answer) - check them.');
    } catch (err) { say(err.message, 'error'); } finally { setBusy(''); }
  };

  const findCode = async () => {
    setBusy('find');
    try {
      const r = await call('find-code', { name, brief, stack: setup.stack, look: setup.look, rules: setup.rules || [] });
      setGroups(r.groups.map((g) => ({ ...g, items: g.items.map((i) => ({ ...i, include: true })) })));
      setPlan(null);
      const n = r.groups.reduce((a, g) => a + g.items.length, 0);
      say(n ? `Found ${n} piece${n === 1 ? '' : 's'} of your code that fit.` : 'Nothing in your library fits this one - it will start from the official starter.');
    } catch (err) { say(err.message, 'error'); } finally { setBusy(''); }
  };

  const makePlan = useCallback(async () => {
    setBusy('plan');
    try {
      const r = await call('plan', body);
      setPlan(r); setPlanKey(bodyKey); setCreated(null);
      if (!folder) setFolder(`${options?.projectsRoot || 'D:\\Projects'}\\${slugify(name)}`);
    } catch (err) { say(err.message, 'error'); } finally { setBusy(''); }
  }, [body, bodyKey, folder, name, options, say]);

  const goTo = (n) => {
    if (!reachable[n] && n !== 3) return;
    if (n === 3 && !canReview) return;
    setStep(n);
    if (n === 3 && (!plan || planKey !== bodyKey)) makePlan();
  };

  const createProject = async () => {
    if (makeRepo && !window.confirm(`This will create a private repository called "${slugify(name)}" on your personal GitHub account and push the project to it. Carry on?`)) return;
    setBusy('create');
    try {
      const r = await call('create', { ...body, plan, folder, applyChanges, github: { create: makeRepo, isPrivate: true } });
      setCreated(r);
      say(`Created ${r.folder}${r.github?.url ? ' and pushed it to GitHub' : ''}.`);
    } catch (err) { say(err.message, 'error'); } finally { setBusy(''); }
  };

  const openFolder = async () => {
    try { const r = await call('open-folder', { folder: created.folder }); say(`Opened in ${r.openedIn}.`); } catch (err) { say(err.message, 'error'); }
  };

  const startAgain = () => {
    if (!window.confirm('Clear this project and start a new one?')) return;
    setStep(1); setName(''); setBrief(''); setGroups(null); setPlan(null); setPlanKey(''); setCreated(null); setFolder('');
    setReasons({ stack: '', look: '', rules: {} });
    setSetup({ stack: null, look: null, rules: options ? options.rules.filter((r) => r.default).map((r) => r.id) : null });
  };

  const backToLibrary = () => {
    window.history.pushState(null, '', '/ims/code-repo');
    if (setCurrentPath) setCurrentPath('/ims/code-repo');
  };

  // ---- styling helpers
  const card = isDark ? 'bg-slate-900/80 border-white/10' : 'bg-white border-slate-200/80 shadow-[0_6px_24px_rgba(15,23,42,0.06)]';
  const sub = isDark ? 'text-slate-400' : 'text-slate-500';
  const field = `w-full px-4 py-3 rounded-xl text-sm border outline-none transition-colors ${isDark ? 'bg-slate-950 border-slate-800 focus:border-cyan-500 text-slate-100' : 'bg-slate-50 border-slate-300 focus:border-cyan-600 text-slate-900'}`;
  const primary = 'px-5 py-2.5 rounded-xl text-sm font-bold flex items-center gap-2 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white shadow-md shadow-blue-500/20 transition-all active:scale-95 disabled:opacity-40 disabled:pointer-events-none';
  const secondary = `px-4 py-2.5 rounded-xl text-sm font-semibold flex items-center gap-2 border transition-colors disabled:opacity-40 ${isDark ? 'border-slate-700 hover:bg-slate-800 text-slate-200' : 'border-slate-300 hover:bg-slate-100 text-slate-700'}`;
  const choice = (selected, accent) => `text-left p-4 rounded-2xl border transition-all ${selected
    ? `${accent} ring-1`
    : isDark ? 'bg-slate-950/50 border-slate-800 hover:border-slate-600' : 'bg-slate-50 border-slate-200 hover:border-slate-400'}`;

  return (
    <PortalShell
      title="New Project"
      subtitle="Start a project from a short brief and your own best code"
      icon={Rocket}
      gradient="from-cyan-500 to-blue-600"
      glow="rgba(6,182,212,0.3)"
      isDark={isDark}
      onThemeToggle={onThemeToggle}
      setCurrentPath={setCurrentPath}
      maxWidth="max-w-[1500px]"
    >
      {toast && (
        <div className={`fixed top-6 right-6 z-50 max-w-md px-4 py-3 rounded-2xl border flex items-start gap-2.5 shadow-2xl backdrop-blur-md ${toast.type === 'error' ? 'bg-rose-950/90 border-rose-500/50 text-rose-100' : 'bg-emerald-950/90 border-emerald-500/50 text-emerald-100'}`}>
          {toast.type === 'error' ? <AlertCircle size={16} className="mt-0.5 shrink-0" /> : <CheckCircle2 size={16} className="mt-0.5 shrink-0" />}
          <span className="text-sm">{toast.msg}</span>
        </div>
      )}

      {/* Stepper */}
      <div className={`rounded-2xl border p-3 sm:p-4 mb-6 flex flex-wrap items-center gap-2 ${card}`}>
        <button onClick={backToLibrary} className={`${secondary} !py-2`} title="Back to Code Best Practices">
          <ArrowLeft size={15} /> <span className="hidden sm:inline">Code library</span>
        </button>
        <div className="flex-1 flex flex-wrap items-center justify-center gap-1 sm:gap-2">
          {STEPS.map((s, i) => {
            const active = step === s.n;
            const done = step > s.n;
            const ok = s.n === 3 ? canReview : reachable[s.n];
            return (
              <React.Fragment key={s.n}>
                {i > 0 && <span className={`hidden sm:block w-8 h-px ${isDark ? 'bg-slate-700' : 'bg-slate-300'}`} />}
                <button
                  onClick={() => goTo(s.n)}
                  disabled={!ok}
                  className={`px-3 sm:px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 transition-all disabled:opacity-35 ${active
                    ? 'bg-cyan-500/15 text-cyan-500 ring-1 ring-cyan-500/40'
                    : isDark ? 'text-slate-300 hover:bg-slate-800' : 'text-slate-600 hover:bg-slate-100'}`}
                >
                  <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${active ? 'bg-cyan-500 text-white' : done ? 'bg-emerald-500 text-white' : isDark ? 'bg-slate-800' : 'bg-slate-200'}`}>
                    {done ? <Check size={13} /> : s.n}
                  </span>
                  {s.label}
                </button>
              </React.Fragment>
            );
          })}
        </div>
        <button onClick={startAgain} className={`${secondary} !py-2`}>Start again</button>
      </div>

      {optionsError && (
        <div className="mb-6 p-4 rounded-2xl border border-rose-500/40 bg-rose-500/10 text-sm flex items-center gap-2">
          <AlertCircle size={16} className="text-rose-500" /> Couldn't load the options: {optionsError}
        </div>
      )}

      {/* ------------------------------------------------ Step 1: describe it */}
      {step === 1 && (
        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] gap-6">
          <section className={`rounded-2xl border p-5 sm:p-6 flex flex-col gap-4 ${card}`}>
            <div>
              <h2 className="text-lg font-extrabold">What are you building?</h2>
              <p className={`text-sm mt-1 ${sub}`}>Give it a name and describe it in a few sentences: what it does, who uses it and where it runs.</p>
            </div>
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-semibold">Project name</span>
              <input className={field} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Team Leave Planner" />
            </label>
            <label className="flex flex-col gap-1.5 flex-1">
              <span className="text-sm font-semibold">The brief</span>
              <textarea className={`${field} min-h-[220px] flex-1 leading-relaxed resize-y`} value={brief} onChange={(e) => setBrief(e.target.value)}
                placeholder="e.g. A SharePoint web part for the team site that shows who is on leave this month from the Leave Requests list, with a department filter, and highlights clashes." />
            </label>
            <div className="flex flex-wrap items-center gap-3">
              <button className={primary} onClick={suggest} disabled={!brief.trim() || busy === 'suggest'}>
                {busy === 'suggest' ? <Loader2 size={16} className="animate-spin" /> : <Wand2 size={16} />}
                {busy === 'suggest' ? 'Reading your brief…' : 'Suggest a setup'}
              </button>
              <span className={`text-xs ${sub}`}>Picks the three choices on the right. You can change any of them.</span>
            </div>
            {options && (
              <p className={`text-xs ${sub}`}>Your code library: {options.library.snippets} pieces of code from {options.library.repos} repositories.</p>
            )}
          </section>

          <div className="flex flex-col gap-6">
            <ChoiceSection title="What it's built with" icon={Boxes} isDark={isDark} card={card} sub={sub}
              hint="The kind of project. Anything you've built before shows how many examples of yours it can reuse.">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {(options?.stacks || []).map((s) => (
                  <button key={s.id} className={choice(setup.stack === s.id, 'bg-cyan-500/10 border-cyan-500 ring-cyan-500/40')}
                    onClick={() => { setSetup((x) => ({ ...x, stack: s.id, look: x.look || (s.id === 'spfx' ? 'fluent' : null) })); setGroups(null); setPlan(null); }}>
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-bold text-sm">{s.name}</span>
                      {setup.stack === s.id ? <CheckCircle2 size={17} className="text-cyan-500 shrink-0" /> : <Circle size={17} className="opacity-30 shrink-0" />}
                    </div>
                    <p className={`text-xs mt-1 leading-snug ${sub}`}>{s.plain}</p>
                    {s.examples > 0 && <span className="inline-block mt-2 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/15 text-emerald-500">You have {s.examples} example{s.examples === 1 ? '' : 's'}</span>}
                    {setup.stack === s.id && reasons.stack && <p className="text-xs mt-2 text-cyan-500 leading-snug">Suggested: {reasons.stack}</p>}
                  </button>
                ))}
              </div>
            </ChoiceSection>

            <ChoiceSection title="How it looks" icon={Palette} isDark={isDark} card={card} sub={sub} hint="The styling the screens are built with.">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {(options?.looks || []).map((l) => (
                  <button key={l.id} className={choice(setup.look === l.id, 'bg-violet-500/10 border-violet-500 ring-violet-500/40')}
                    onClick={() => { setSetup((x) => ({ ...x, look: l.id })); setPlan(null); }}>
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-bold text-sm">{l.name}</span>
                      {setup.look === l.id ? <CheckCircle2 size={17} className="text-violet-500 shrink-0" /> : <Circle size={17} className="opacity-30 shrink-0" />}
                    </div>
                    <p className={`text-xs mt-1 leading-snug ${sub}`}>{l.plain}</p>
                    {l.examples > 0 && <span className="inline-block mt-2 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/15 text-emerald-500">You have {l.examples} example{l.examples === 1 ? '' : 's'}</span>}
                    {setup.look === l.id && reasons.look && <p className="text-xs mt-2 text-violet-500 leading-snug">Suggested: {reasons.look}</p>}
                  </button>
                ))}
              </div>
            </ChoiceSection>

            <ChoiceSection title="House rules" icon={ShieldCheck} isDark={isDark} card={card} sub={sub} hint="How the code should be written. Antigravity is told to follow every one you tick.">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-2.5">
                {(options?.rules || []).map((r) => {
                  const on = (setup.rules || []).includes(r.id);
                  return (
                    <button key={r.id} className={`${choice(on, 'bg-emerald-500/10 border-emerald-500/70 ring-emerald-500/30')} !p-3 flex items-start gap-3`}
                      onClick={() => { setSetup((x) => ({ ...x, rules: on ? x.rules.filter((id) => id !== r.id) : [...(x.rules || []), r.id] })); setPlan(null); }}>
                      {on ? <CheckSquare size={18} className="text-emerald-500 shrink-0 mt-0.5" /> : <Square size={18} className="opacity-40 shrink-0 mt-0.5" />}
                      <span>
                        <span className="font-bold text-sm block">{r.name}</span>
                        <span className={`text-xs leading-snug block mt-0.5 ${sub}`}>{r.plain}</span>
                        {on && reasons.rules[r.id] && <span className="text-xs leading-snug block mt-1 text-emerald-500">{reasons.rules[r.id]}</span>}
                      </span>
                    </button>
                  );
                })}
              </div>
            </ChoiceSection>

            <div className="flex justify-end">
              <button className={primary} disabled={!canFind} onClick={() => setStep(2)}>
                Next: find my code <ArrowRight size={16} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------ Step 2: find my code */}
      {step === 2 && (
        <div className="flex flex-col gap-6">
          <section className={`rounded-2xl border p-5 sm:p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-4 ${card}`}>
            <div>
              <h2 className="text-lg font-extrabold">Find my best code</h2>
              <p className={`text-sm mt-1 ${sub}`}>
                Searches your repositories for code that fits <strong>{name || 'this project'}</strong> ({stack?.name}{look ? `, ${look.name}` : ''}), and lists what needs changing in each piece.
              </p>
            </div>
            <button className={primary} onClick={findCode} disabled={busy === 'find'}>
              {busy === 'find' ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
              {busy === 'find' ? 'Checking your repositories…' : groups ? 'Check again' : 'Check my repositories'}
            </button>
          </section>

          {groups && groups.length === 0 && (
            <div className={`rounded-2xl border p-6 text-sm ${card}`}>
              Nothing in your library fits this project. That's fine: it starts from the official {stack?.name} starter, and the house rules still apply.
            </div>
          )}

          {(groups || []).map((g, gi) => (
            <section key={`${g.job}-${gi}`} className="flex flex-col gap-3">
              <h3 className="text-sm font-extrabold uppercase tracking-wide flex items-center gap-2 opacity-80"><Code2 size={15} className="text-cyan-500" /> {g.job}</h3>
              {g.items.map((item, ii) => (
                <CodeCard key={item.id} item={item} isDark={isDark} card={card} sub={sub}
                  onChange={(next) => { setGroups((all) => all.map((x, xi) => (xi !== gi ? x : { ...x, items: x.items.map((y, yi) => (yi === ii ? next : y)) }))); }} />
              ))}
            </section>
          ))}

          <div className="flex justify-between">
            <button className={secondary} onClick={() => setStep(1)}><ArrowLeft size={16} /> Back</button>
            <div className="flex items-center gap-3">
              {!name.trim() && <span className="text-xs text-amber-500">Give the project a name on step 1 first.</span>}
              <button className={primary} disabled={!canReview} onClick={() => goTo(3)}>Next: review <ArrowRight size={16} /></button>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------ Step 3: review */}
      {step === 3 && (
        <div className="flex flex-col gap-6">
          {busy === 'plan' || !plan ? (
            <div className={`rounded-2xl border p-10 flex flex-col items-center gap-3 text-sm ${card}`}>
              <Loader2 size={26} className="animate-spin text-cyan-500" />
              Putting the plan together…
            </div>
          ) : (
            <>
              <section className={`rounded-2xl border p-5 sm:p-6 ${card}`}>
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="max-w-4xl">
                    <h2 className="text-xl font-extrabold">{name}</h2>
                    <p className={`text-sm mt-2 leading-relaxed ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>{plan.summary}</p>
                  </div>
                  <button className={secondary} onClick={makePlan}><Wand2 size={15} /> Redo the plan</button>
                </div>
              </section>

              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                <SummaryCard icon={Boxes} colour="text-cyan-500" title="Built with" card={card} sub={sub} lines={[stack?.name, stack?.plain]} />
                <SummaryCard icon={Palette} colour="text-violet-500" title="How it looks" card={card} sub={sub} lines={look ? [look.name, look.plain] : ['Not chosen']} />
                <SummaryCard icon={ShieldCheck} colour="text-emerald-500" title="House rules" card={card} sub={sub}
                  list={(options?.rules || []).filter((r) => (setup.rules || []).includes(r.id)).map((r) => r.name)} />
                <SummaryCard icon={Code2} colour="text-amber-500" title="My code to reuse" card={card} sub={sub}
                  list={(groups || []).flatMap((g) => g.items.filter((i) => i.include !== false).map((i) => `${i.title} (${(i.changes || []).filter((c) => c.include !== false).length} to change)`))}
                  empty="None - starts from the official starter" />
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] gap-6">
                <section className={`rounded-2xl border p-5 sm:p-6 ${card}`}>
                  <h3 className="font-extrabold flex items-center gap-2 mb-4"><FolderTree size={17} className="text-cyan-500" /> Project layout</h3>
                  <FolderMap folders={plan.folders} titles={Object.fromEntries((groups || []).flatMap((g) => g.items.map((i) => [i.id, i.title])))} isDark={isDark} sub={sub} />
                </section>
                <section className={`rounded-2xl border p-5 sm:p-6 ${card}`}>
                  <h3 className="font-extrabold flex items-center gap-2 mb-4"><ListChecks size={17} className="text-emerald-500" /> Build order</h3>
                  <ol className="flex flex-col gap-3">
                    {plan.buildOrder.map((s, i) => (
                      <li key={i} className="flex gap-3 text-sm leading-snug">
                        <span className="w-6 h-6 rounded-full bg-emerald-500/15 text-emerald-500 text-xs font-bold flex items-center justify-center shrink-0">{i + 1}</span>
                        <span>{s}</span>
                      </li>
                    ))}
                  </ol>
                  <div className={`mt-5 p-3 rounded-xl text-xs font-mono break-all ${isDark ? 'bg-slate-950 text-slate-300' : 'bg-slate-100 text-slate-700'}`}>
                    <span className={`block mb-1 font-sans font-semibold ${sub}`}>Created with</span>{plan.starter}
                  </div>
                </section>
              </div>

              <div className="flex justify-between">
                <button className={secondary} onClick={() => setStep(2)}><ArrowLeft size={16} /> Back</button>
                <button className={primary} onClick={() => setStep(4)}>Next: build it <ArrowRight size={16} /></button>
              </div>
            </>
          )}
        </div>
      )}

      {/* ------------------------------------------------ Step 4: build */}
      {step === 4 && plan && (
        <div className="flex flex-col gap-6">
          {planKey !== bodyKey && (
            <div className="p-4 rounded-2xl border border-amber-500/40 bg-amber-500/10 text-sm flex items-center justify-between gap-3 flex-wrap">
              <span className="flex items-center gap-2"><AlertCircle size={16} className="text-amber-500" /> You've changed things since the plan was made.</span>
              <button className={secondary} onClick={() => goTo(3)}>Update the plan</button>
            </div>
          )}
          <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] gap-6">
            <section className={`rounded-2xl border p-5 sm:p-6 flex flex-col gap-3 ${card}`}>
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <h3 className="font-extrabold flex items-center gap-2"><Sparkles size={17} className="text-amber-500" /> Prompt for Antigravity</h3>
                  <p className={`text-xs mt-1 ${sub}`}>Paste this into a new Antigravity session in an empty folder. If you create the folder on the right, a copy is saved in it as PROMPT.md.</p>
                </div>
                <CopyButton text={plan.prompt} className={primary} />
              </div>
              <pre className={`p-4 rounded-xl text-xs leading-relaxed whitespace-pre-wrap overflow-auto max-h-[62vh] border ${isDark ? 'bg-slate-950 border-slate-800 text-slate-200' : 'bg-slate-50 border-slate-200 text-slate-800'}`}>{plan.prompt}</pre>
            </section>

            <section className={`rounded-2xl border p-5 sm:p-6 flex flex-col gap-4 self-start ${card}`}>
              <div>
                <h3 className="font-extrabold flex items-center gap-2"><Folder size={17} className="text-cyan-500" /> Create the project folder</h3>
                <p className={`text-xs mt-1 ${sub}`}>
                  Makes the folder with a README, the prompt, the house rules, your code and the GitHub setup (build checks, dependency updates, pull request and issue templates), then makes the first commit.
                </p>
              </div>
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-semibold">Where</span>
                <input className={`${field} font-mono !text-xs`} value={folder} onChange={(e) => setFolder(e.target.value)} />
              </label>
              <Toggle on={applyChanges} set={setApplyChanges} isDark={isDark}
                title="Make the code changes for me"
                text="Swaps the names and values from step 2 in the copied code (about 1p). Anything it can't do is left as a checklist in the README." />
              <Toggle on={makeRepo} set={setMakeRepo} isDark={isDark}
                title={<span className="flex items-center gap-1.5"><GitBranch size={14} /> Also create a private GitHub repo and push</span>}
                text={`Creates "${slugify(name)}" on your personal account. You'll be asked to confirm.`} />
              <button className={`${primary} justify-center`} onClick={createProject} disabled={busy === 'create' || !folder.trim()}>
                {busy === 'create' ? <Loader2 size={16} className="animate-spin" /> : <Rocket size={16} />}
                {busy === 'create' ? 'Creating…' : 'Create project'}
              </button>

              {created && (
                <div className="p-4 rounded-xl border border-emerald-500/40 bg-emerald-500/10 flex flex-col gap-2.5 text-sm">
                  <span className="font-bold flex items-center gap-2 text-emerald-500"><CheckCircle2 size={16} /> Project created</span>
                  <span className="font-mono text-xs break-all">{created.folder}</span>
                  <span className={`text-xs ${sub}`}>{created.files.length} files, first commit made{created.changesApplied ? `, ${created.changesApplied} code change${created.changesApplied === 1 ? '' : 's'} made for you` : ''}.</span>
                  {created.github?.url && (
                    <a href={created.github.url} target="_blank" rel="noreferrer" className="text-xs font-semibold text-cyan-500 hover:underline flex items-center gap-1">
                      <GitBranch size={13} /> {created.github.url} <ExternalLink size={11} />
                    </a>
                  )}
                  <button className={`${secondary} self-start`} onClick={openFolder}><FolderOpen size={15} /> Open it</button>
                </div>
              )}
            </section>
          </div>
          <div className="flex justify-start">
            <button className={secondary} onClick={() => setStep(3)}><ArrowLeft size={16} /> Back</button>
          </div>
        </div>
      )}
    </PortalShell>
  );
}

function ChoiceSection({ title, icon: Icon, hint, children, card, sub }) {
  return (
    <section className={`rounded-2xl border p-5 sm:p-6 ${card}`}>
      <h2 className="font-extrabold flex items-center gap-2"><Icon size={17} className="text-cyan-500" /> {title}</h2>
      <p className={`text-xs mt-1 mb-4 ${sub}`}>{hint}</p>
      {children}
    </section>
  );
}

function SummaryCard({ icon: Icon, colour, title, lines, list, empty, card, sub }) {
  return (
    <div className={`rounded-2xl border p-4 ${card}`}>
      <span className={`text-xs font-bold uppercase tracking-wide flex items-center gap-1.5 ${colour}`}><Icon size={14} /> {title}</span>
      {lines && (
        <div className="mt-2">
          <div className="font-bold text-sm">{lines[0]}</div>
          {lines[1] && <div className={`text-xs mt-0.5 leading-snug ${sub}`}>{lines[1]}</div>}
        </div>
      )}
      {list && (list.length ? (
        <ul className="mt-2 flex flex-col gap-1 text-sm">{list.map((x, i) => <li key={i} className="leading-snug">• {x}</li>)}</ul>
      ) : <div className={`mt-2 text-sm ${sub}`}>{empty || 'None'}</div>)}
    </div>
  );
}

// One piece of Simon's code: why it fits, what to change (editable), and the code itself on demand
function CodeCard({ item, onChange, isDark, card, sub }) {
  const [showCode, setShowCode] = useState(false);
  const on = item.include !== false;
  const changes = item.changes || [];
  const setChange = (i, patch) => onChange({ ...item, changes: changes.map((c, ci) => (ci === i ? { ...c, ...patch } : c)) });
  const cellInput = `w-full px-2.5 py-1.5 rounded-lg text-xs font-mono border outline-none ${isDark ? 'bg-slate-950 border-slate-800 focus:border-cyan-500' : 'bg-white border-slate-300 focus:border-cyan-600'}`;
  return (
    <div className={`rounded-2xl border p-4 sm:p-5 transition-opacity ${card} ${on ? '' : 'opacity-55'}`}>
      <div className="flex items-start gap-3">
        <button onClick={() => onChange({ ...item, include: !on })} className="mt-0.5" title={on ? 'Leave this out' : 'Use this'}>
          {on ? <CheckSquare size={20} className="text-cyan-500" /> : <Square size={20} className="opacity-50" />}
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-bold">{item.title}</span>
            <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${item.strength === 'Strong match' ? 'bg-emerald-500/15 text-emerald-500' : item.strength === 'Good match' ? 'bg-cyan-500/15 text-cyan-500' : 'bg-slate-500/15 text-slate-400'}`}>{item.strength}</span>
            {item.isFork && <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-500/15 text-amber-500">From a fork</span>}
          </div>
          <div className={`text-xs mt-0.5 font-mono break-all ${sub}`}>
            {item.repoUrl ? <a className="hover:underline" href={item.repoUrl} target="_blank" rel="noreferrer">{item.repo}</a> : item.repo} / {item.filePath}
          </div>
          <p className="text-sm mt-2 leading-snug">{item.why}</p>

          {on && (
            <div className="mt-4">
              <div className="text-xs font-bold uppercase tracking-wide mb-2 opacity-80">What to change for this project</div>
              {changes.length === 0 ? (
                <p className={`text-xs ${sub}`}>Nothing - it can be used as it is.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs border-separate border-spacing-y-1.5 min-w-[640px]">
                    <thead>
                      <tr className={`text-left ${sub}`}>
                        <th className="w-8"></th><th className="font-semibold pr-3">What</th><th className="font-semibold pr-3">Now</th><th className="font-semibold">Change to</th>
                      </tr>
                    </thead>
                    <tbody>
                      {changes.map((c, i) => {
                        const use = c.include !== false;
                        return (
                          <tr key={i} className={use ? '' : 'opacity-45'}>
                            <td className="align-top pt-1.5">
                              <button onClick={() => setChange(i, { include: !use })} title={use ? 'Don\'t change this' : 'Change this'}>
                                {use ? <CheckSquare size={15} className="text-cyan-500" /> : <Square size={15} className="opacity-50" />}
                              </button>
                            </td>
                            <td className="align-top pr-3 pt-1.5">
                              <span className="font-semibold">{c.what}</span>
                              {c.where && <span className={`block font-mono text-[11px] ${sub}`}>{c.where}</span>}
                            </td>
                            <td className={`align-top pr-3 pt-1.5 font-mono break-all max-w-[280px] ${sub}`}>{c.current || '-'}</td>
                            <td className="align-top min-w-[220px]">
                              <input className={cellInput} value={c.suggested} placeholder="You decide" disabled={!use}
                                onChange={(e) => setChange(i, { suggested: e.target.value })} />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          <button onClick={() => setShowCode((v) => !v)} className={`mt-3 text-xs font-semibold flex items-center gap-1 ${isDark ? 'text-slate-300 hover:text-white' : 'text-slate-600 hover:text-slate-900'}`}>
            {showCode ? <ChevronUp size={14} /> : <ChevronDown size={14} />} {showCode ? 'Hide the code' : 'Show the code'}
          </button>
          {showCode && (
            <pre className={`mt-2 p-3 rounded-xl text-[11px] leading-relaxed overflow-auto max-h-96 border ${isDark ? 'bg-slate-950 border-slate-800 text-slate-200' : 'bg-slate-50 border-slate-200 text-slate-800'}`}>{item.code}</pre>
          )}
        </div>
      </div>
    </div>
  );
}

// The planned folders as a tree, with the reused code shown where it goes
function FolderMap({ folders, titles, isDark, sub }) {
  const rows = [...(folders || [])].sort((a, b) => a.path.localeCompare(b.path));
  if (!rows.length) return <p className={`text-sm ${sub}`}>No layout yet.</p>;
  return (
    <div className="flex flex-col gap-1.5">
      {rows.map((f) => {
        const depth = Math.max(0, f.path.replace(/\/+$/, '').split('/').length - 1);
        const leaf = f.path.replace(/\/+$/, '').split('/').pop();
        return (
          <div key={f.path} className="flex items-start gap-2" style={{ paddingLeft: `${depth * 22}px` }}>
            <FolderOpen size={16} className="text-cyan-500 mt-0.5 shrink-0" />
            <div className="min-w-0">
              <span className="font-mono text-sm font-semibold">{leaf}/</span>
              <span className={`text-xs ml-2 ${sub}`}>{f.purpose}</span>
              {f.reuse?.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {f.reuse.map((id) => (
                    <span key={id} className={`px-2 py-0.5 rounded-md text-[11px] font-semibold ${isDark ? 'bg-amber-500/15 text-amber-300' : 'bg-amber-100 text-amber-800'}`}>
                      <Code2 size={11} className="inline mr-1 -mt-0.5" />{titles[id] || 'Your code'}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Toggle({ on, set, title, text, isDark }) {
  return (
    <button onClick={() => set(!on)} className={`text-left p-3 rounded-xl border flex items-start gap-3 transition-colors ${on ? 'border-cyan-500/60 bg-cyan-500/10' : isDark ? 'border-slate-800 hover:border-slate-600' : 'border-slate-200 hover:border-slate-400'}`}>
      {on ? <CheckSquare size={18} className="text-cyan-500 shrink-0 mt-0.5" /> : <Square size={18} className="opacity-40 shrink-0 mt-0.5" />}
      <span>
        <span className="text-sm font-bold block">{title}</span>
        <span className={`text-xs leading-snug block mt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{text}</span>
      </span>
    </button>
  );
}

function CopyButton({ text, className }) {
  const [copied, setCopied] = useState(false);
  return (
    <button className={className} onClick={() => { navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2500); }); }}>
      {copied ? <Check size={16} /> : <Copy size={16} />} {copied ? 'Copied' : 'Copy prompt'}
    </button>
  );
}
