import React, { useState, useEffect } from 'react';
import {
  CreditCard, TrendingUp, AlertTriangle, Sparkles, RefreshCw,
  Zap, ArrowUpRight, ShieldCheck, ShieldAlert, CheckCircle2,
  DollarSign, PieChart, BarChart3, AlertOctagon, Layers, ArrowRight,
  Database, Bot, Cpu, FileCode
} from 'lucide-react';
import PortalShell from './PortalShell';

export default function SpendBudgetPortal({ theme = 'dark', onThemeToggle, setCurrentPath }) {
  const isDark = theme === 'dark';
  const [usage, setUsage] = useState(null);
  const [expensivePrompts, setExpensivePrompts] = useState([]);
  const [budgetWarning, setBudgetWarning] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [spendCapInput, setSpendCapInput] = useState('');
  const [savingCap, setSavingCap] = useState(false);

  const fetchSpendData = async (isManual = false) => {
    if (isManual) setRefreshing(true);
    try {
      const [usageRes, promptsRes, warningRes] = await Promise.all([
        fetch('/api/usage'),
        fetch('/api/usage/expensive-prompts'),
        fetch('/api/usage/budget-warning')
      ]);

      if (usageRes.ok) {
        const u = await usageRes.json();
        setUsage(u);
        if (u.spendCap != null) setSpendCapInput(String(u.spendCap));
      }
      if (promptsRes.ok) {
        const p = await promptsRes.json();
        setExpensivePrompts(p.expensivePrompts || []);
      }
      if (warningRes.ok) {
        const w = await warningRes.json();
        setBudgetWarning(w);
      }
    } catch (err) {
      console.error('Failed to fetch spend data:', err);
    } finally {
      setLoading(false);
      if (isManual) setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchSpendData();
  }, []);

  const handleUpdateCap = async () => {
    const val = parseFloat(spendCapInput);
    if (isNaN(val) || val <= 0) return;
    setSavingCap(true);
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ spendCap: val })
      });
      if (res.ok) {
        await fetchSpendData(true);
      }
    } catch (e) {
      console.error('Failed to update spend cap:', e);
    } finally {
      setSavingCap(false);
    }
  };

  const bgCard = isDark ? 'bg-slate-900/70 border-white/10' : 'bg-white border-[#2E2B27]/10 shadow-sm';
  const textMuted = isDark ? 'text-slate-400' : 'text-slate-600';

  const monthCost = usage?.month?.cost || 0;
  const todayCost = usage?.today?.cost || 0;
  const spendCap = usage?.spendCap || 250;
  const pctUsed = usage?.percentage || ((monthCost / spendCap) * 100);
  const projectedCost = usage?.projectedCost || (monthCost * 1.1);

  const breakdown = usage?.serviceBreakdown || [
    { service: 'Chat & RAG Research', cost: monthCost * 0.4, tokens: 120000, requests: 45 },
    { service: 'Gemini Live (Voice Terminal)', cost: monthCost * 0.35, tokens: 95000, requests: 38 },
    { service: 'Chronicles & Narrator', cost: monthCost * 0.12, tokens: 35000, requests: 12 },
    { service: 'Photo Carbs & Food Analysis', cost: monthCost * 0.08, tokens: 22000, requests: 19 },
    { service: 'Code Repo Scans', cost: monthCost * 0.05, tokens: 14000, requests: 8 }
  ];

  return (
    <PortalShell
      title="Gemini Spend & Budget Breakdown"
      subtitle="/ims/spend • Per-service token tracking, soft monthly budget warning & prompt optimization"
      icon={Database}
      gradient="from-emerald-500 to-green-600"
      glow="rgba(16,185,129,0.3)"
      isDark={isDark}
      theme={theme}
      onThemeToggle={onThemeToggle}
      currentPath="/ims/spend"
      setCurrentPath={setCurrentPath}
    >
      <div className="flex flex-col gap-6 max-w-7xl mx-auto w-full pb-12">
        {/* Soft Budget Warning Banner if near or over cap */}
        {budgetWarning?.nearCap && (
          <div className={`p-4 rounded-2xl border flex items-start gap-3.5 ${budgetWarning.overCap ? 'bg-rose-500/10 border-rose-500/30 text-rose-200' : 'bg-amber-500/10 border-amber-500/30 text-amber-200'}`}>
            {budgetWarning.overCap ? (
              <AlertOctagon size={20} className="text-rose-400 shrink-0 mt-0.5" />
            ) : (
              <AlertTriangle size={20} className="text-amber-400 shrink-0 mt-0.5" />
            )}
            <div className="text-xs leading-relaxed flex-1">
              <strong className="font-bold text-sm block mb-0.5">
                {budgetWarning.overCap ? 'Monthly Spend Budget Exceeded' : 'Soft Monthly Budget Warning (≥ 80%)'}
              </strong>
              {budgetWarning.message || `You have reached ${pctUsed.toFixed(1)}% of your monthly £${spendCap.toFixed(2)} budget. Current spend is £${monthCost.toFixed(2)}. Consider switching background scans to cheaper models or caching large RAG context.`}
            </div>
          </div>
        )}

        {/* Top Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card 1: Month Spend */}
          <div className={`p-5 rounded-2xl border flex flex-col justify-between ${bgCard}`}>
            <div>
              <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider mb-2">
                <span className="flex items-center gap-1.5 text-emerald-400">
                  <CreditCard size={14} /> This Month's Spend
                </span>
                <span className={`text-[10px] font-bold ${pctUsed >= 90 ? 'text-rose-400' : pctUsed >= 80 ? 'text-amber-400' : 'text-emerald-400'}`}>
                  {pctUsed.toFixed(1)}% of cap
                </span>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-black tabular-nums font-mono text-emerald-400">
                  £{monthCost.toFixed(2)}
                </span>
                <span className="text-xs font-semibold text-slate-400">/ £{spendCap.toFixed(2)}</span>
              </div>
              {/* Progress bar */}
              <div className="w-full bg-slate-800 rounded-full h-2 mt-3 overflow-hidden">
                <div
                  className={`h-full rounded-full ${pctUsed >= 95 ? 'bg-rose-500' : pctUsed >= 80 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                  style={{ width: `${Math.min(pctUsed, 100)}%` }}
                />
              </div>
            </div>
            <p className={`text-[11px] mt-3 ${textMuted}`}>
              {(usage?.month?.totalTokens || 0).toLocaleString()} tokens across {(usage?.month?.requests || 0)} requests
            </p>
          </div>

          {/* Card 2: Today's Spend */}
          <div className={`p-5 rounded-2xl border flex flex-col justify-between ${bgCard}`}>
            <div>
              <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider mb-2">
                <span className="flex items-center gap-1.5 text-cyan-400">
                  <TrendingUp size={14} /> Today's Usage
                </span>
                <span className="text-[10px] font-bold text-cyan-300">Live 24h</span>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-black tabular-nums font-mono text-cyan-400">
                  £{todayCost.toFixed(3)}
                </span>
              </div>
              <p className={`text-[11px] mt-3 ${textMuted}`}>
                {(usage?.today?.totalTokens || 0).toLocaleString()} tokens across {(usage?.today?.requests || 0)} calls
              </p>
            </div>
            <div className="mt-3 pt-2 border-t border-inherit flex items-center justify-between text-xs">
              <span className={textMuted}>Projected Month:</span>
              <span className="font-bold text-slate-200">£{projectedCost.toFixed(2)}</span>
            </div>
          </div>

          {/* Card 3: Top Spend Service */}
          <div className={`p-5 rounded-2xl border flex flex-col justify-between ${bgCard}`}>
            <div>
              <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider mb-2">
                <span className="flex items-center gap-1.5 text-indigo-400">
                  <PieChart size={14} /> Primary Service
                </span>
                <span className="text-[10px] font-bold text-indigo-300">Share</span>
              </div>
              <div className="text-lg font-bold text-indigo-300 truncate">
                {breakdown[0]?.service || 'Chat & RAG'}
              </div>
              <div className="text-2xl font-black tabular-nums font-mono mt-1">
                £{(breakdown[0]?.cost || 0).toFixed(2)}
              </div>
            </div>
            <p className={`text-[11px] mt-3 ${textMuted}`}>
              Takes {((breakdown[0]?.cost || 0) / (monthCost || 1) * 100).toFixed(0)}% of monthly spend
            </p>
          </div>

          {/* Card 4: Soft Budget Cap Control */}
          <div className={`p-5 rounded-2xl border flex flex-col justify-between ${bgCard}`}>
            <div>
              <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider mb-2">
                <span className="flex items-center gap-1.5 text-violet-400">
                  <ShieldCheck size={14} /> Monthly Cap (£)
                </span>
                <span className="text-[10px] font-bold text-violet-300">Soft Guard</span>
              </div>
              <div className="flex items-center gap-2 mt-2">
                <div className="relative flex-1">
                  <span className="absolute left-3 top-2.5 text-slate-400 font-bold text-sm">£</span>
                  <input
                    type="number"
                    value={spendCapInput}
                    onChange={(e) => setSpendCapInput(e.target.value)}
                    className={`w-full pl-7 pr-3 py-1.5 rounded-xl text-sm font-mono font-bold outline-none border ${isDark ? 'bg-slate-950 border-white/10 text-white' : 'bg-slate-50 border-slate-300 text-slate-900'}`}
                    placeholder="250.00"
                  />
                </div>
                <button
                  onClick={handleUpdateCap}
                  disabled={savingCap}
                  className="px-3 py-2 rounded-xl text-xs font-bold bg-violet-600 hover:bg-violet-500 text-white shadow-md active:scale-95 disabled:opacity-40"
                >
                  {savingCap ? '...' : 'Save'}
                </button>
              </div>
            </div>
            <p className={`text-[10px] mt-2 ${textMuted}`}>
              On-screen warnings appear at 80% &amp; 95% threshold.
            </p>
          </div>
        </div>

        {/* Daily / Service Breakdown Table */}
        <div className={`p-5 rounded-2xl border flex flex-col gap-4 ${bgCard}`}>
          <div className="flex items-center justify-between border-b border-inherit pb-3">
            <div className="flex items-center gap-2 font-bold text-sm">
              <BarChart3 size={16} className="text-emerald-400" />
              <span>Spend &amp; Token Breakdown By Service</span>
            </div>
            <button
              onClick={() => fetchSpendData(true)}
              className={`p-1.5 rounded-lg border text-xs flex items-center gap-1 ${isDark ? 'border-white/10 hover:bg-white/5' : 'border-slate-300 hover:bg-slate-100'}`}
              title="Refresh usage statistics"
            >
              <RefreshCw size={12} className={refreshing ? 'animate-spin text-emerald-400' : ''} />
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className={`border-b border-inherit text-[10px] uppercase font-bold tracking-wider ${textMuted}`}>
                  <th className="py-2.5 px-3">Service Domain</th>
                  <th className="py-2.5 px-3">Monthly Cost (£)</th>
                  <th className="py-2.5 px-3">Tokens (Total)</th>
                  <th className="py-2.5 px-3">API Calls</th>
                  <th className="py-2.5 px-3">Share (%)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-inherit">
                {breakdown.map((row, idx) => {
                  const share = ((row.cost / (monthCost || 1)) * 100);
                  return (
                    <tr key={idx} className="hover:bg-white/5 transition-colors font-sans">
                      <td className="py-3 px-3 font-semibold flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-emerald-400" />
                        <span>{row.service}</span>
                      </td>
                      <td className="py-3 px-3 font-mono font-bold text-emerald-400">
                        £{row.cost?.toFixed(3) || '0.000'}
                      </td>
                      <td className="py-3 px-3 font-mono text-slate-300">
                        {(row.tokens || 0).toLocaleString()}
                      </td>
                      <td className="py-3 px-3 font-mono text-slate-400">
                        {row.requests || 0}
                      </td>
                      <td className="py-3 px-3 font-mono font-bold text-slate-300">
                        {share.toFixed(1)}%
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Most Expensive Prompts & Model Caching Optimizer */}
        <div className={`p-5 rounded-2xl border flex flex-col gap-4 ${bgCard}`}>
          <div className="flex items-center justify-between border-b border-inherit pb-3">
            <div className="flex items-center gap-2 font-bold text-sm">
              <Sparkles size={16} className="text-amber-400" />
              <span>Top Expensive Prompts (Candidates for Context Caching or Cheaper Model)</span>
            </div>
            <span className={`text-xs ${textMuted}`}>{expensivePrompts.length} flagged prompts</span>
          </div>

          {expensivePrompts.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-500">
              No abnormally high-cost prompts recorded. Your model routing and token limits are optimized.
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {expensivePrompts.map((p, idx) => (
                <div key={idx} className={`p-4 rounded-xl border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 ${isDark ? 'bg-slate-950/40 border-white/5' : 'bg-slate-50 border-slate-200'}`}>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-bold text-slate-200">{p.caller || p.service || 'Prompt Execution'}</span>
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-500/10 text-amber-300 border border-amber-500/20">
                        {p.model || 'gemini-2.5-pro'}
                      </span>
                      <span className="text-[10px] text-slate-500 font-mono">{(p.totalTokens || 0).toLocaleString()} tokens</span>
                    </div>
                    <p className={`text-xs truncate ${textMuted}`}>
                      "{p.snippet || p.promptSummary || 'Deep RAG repository multi-file scan'}"
                    </p>
                    <div className="flex items-center gap-2 mt-2 text-[11px] text-amber-300/90 font-medium">
                      <Sparkles size={12} className="text-amber-400" />
                      <span>{p.recommendation || 'Recommendation: Cache document vectors or route background sweeps to gemini-2.5-flash.'}</span>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <div className="text-sm font-mono font-black text-amber-400">
                      £{(p.estimatedCost || p.cost || 0.04).toFixed(4)}
                    </div>
                    <span className="text-[10px] text-slate-500">per call</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </PortalShell>
  );
}
