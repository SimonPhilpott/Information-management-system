import React, { useState, useEffect } from 'react';
import {
  Activity, Wifi, Cpu, Clock, AlertTriangle, RefreshCw, Sparkles,
  Zap, ArrowUpRight, ShieldCheck, ShieldAlert, CheckCircle2,
  Database, Info, AlertOctagon, Layers
} from 'lucide-react';
import PortalShell from './PortalShell';

function Sparkline({ data = [], color = '#06b6d4', width = 120, height = 32, isDark = true }) {
  if (!data || data.length < 2) {
    return (
      <div
        className="flex items-center justify-center text-[10px] text-slate-500 font-mono"
        style={{ width: `${width}px`, height: `${height}px` }}
      >
        --
      </div>
    );
  }

  const values = data.map(d => (typeof d === 'number' ? d : Number(d) || 0));
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const points = values.map((val, idx) => {
    const x = (idx / (values.length - 1)) * width;
    const y = height - ((val - min) / range) * (height - 6) - 3;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');

  return (
    <svg width={width} height={height} className="overflow-visible">
      <polyline
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
      />
      {values.length > 0 && (
        <circle
          cx={width}
          cy={height - ((values[values.length - 1] - min) / range) * (height - 6) - 3}
          r="3"
          fill={color}
        />
      )}
    </svg>
  );
}

function formatUptime(seconds) {
  if (seconds == null || isNaN(seconds)) return '--';
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  return `${m}m ${s}s`;
}

function formatBytes(bytes) {
  if (bytes == null || isNaN(bytes)) return '--';
  if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(2)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

export default function DeviceHealthPortal({ theme = 'dark', onThemeToggle, setCurrentPath }) {
  const isDark = theme === 'dark';
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const fetchTelemetry = async (isManual = false) => {
    if (isManual) setRefreshing(true);
    try {
      const res = await fetch('/api/device-health?limit=60');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (json.success) {
        setData(json);
        setError(null);
      } else {
        setError(json.error || 'Failed to fetch device health telemetry');
      }
    } catch (err) {
      console.error('Device health telemetry fetch error:', err);
      setError(err.message);
    } finally {
      setLoading(false);
      if (isManual) setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchTelemetry();
    const interval = setInterval(() => {
      fetchTelemetry();
    }, 15000); // 15s live poll
    return () => clearInterval(interval);
  }, []);

  const latest = data?.latest || {};
  const history = data?.history || [];
  const sparklines = data?.sparklines || {};
  const isOnline = data?.isOnline || false;

  // Signal Strength calculation
  const rssi = latest.wifiRssi != null ? latest.wifiRssi : -999;
  let wifiQuality = 'No Signal';
  let wifiColor = 'text-slate-500';
  if (rssi > -60) {
    wifiQuality = 'Excellent';
    wifiColor = 'text-emerald-400';
  } else if (rssi > -70) {
    wifiQuality = 'Good';
    wifiColor = 'text-emerald-300';
  } else if (rssi > -80) {
    wifiQuality = 'Fair';
    wifiColor = 'text-amber-400';
  } else if (rssi !== -999) {
    wifiQuality = 'Poor / Weak';
    wifiColor = 'text-rose-400';
  }

  const bgCard = isDark ? 'bg-slate-900/70 border-white/10' : 'bg-white border-[#2E2B27]/10 shadow-sm';
  const textMuted = isDark ? 'text-slate-400' : 'text-slate-600';

  return (
    <PortalShell
      title="Device Health & Observability"
      subtitle="/ims/device-health • 1-minute live Box-3 hardware telemetry, memory gauges & resilience log"
      icon={Activity}
      gradient="from-cyan-500 to-teal-600"
      glow="rgba(6,182,212,0.3)"
      isDark={isDark}
      theme={theme}
      onThemeToggle={onThemeToggle}
      currentPath="/ims/device-health"
      setCurrentPath={setCurrentPath}
    >
      <div className="flex flex-col gap-6 max-w-7xl mx-auto w-full pb-12">
        {/* Header Action & Status Bar */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className={`w-3.5 h-3.5 rounded-full ${isOnline ? 'bg-emerald-500 animate-pulse shadow-[0_0_12px_#10b981]' : 'bg-rose-500 shadow-[0_0_12px_#f43f5e]'}`} />
            <div>
              <div className="text-sm font-bold flex items-center gap-2">
                <span>ESP32-S3-BOX-3 Hardware Terminal</span>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-black uppercase tracking-wider border ${isOnline ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' : 'bg-rose-500/10 text-rose-400 border-rose-500/30'}`}>
                  {isOnline ? 'Active Online' : 'Offline / Standby'}
                </span>
              </div>
              <span className={`text-xs ${textMuted}`}>
                {data?.lastReportSecondsAgo != null
                  ? `Last telemetry reported ${data.lastReportSecondsAgo}s ago`
                  : 'Awaiting initial telemetry report...'}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => fetchTelemetry(true)}
              disabled={refreshing}
              className={`px-3 py-1.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition-all active:scale-95 ${
                isDark
                  ? 'bg-white/5 hover:bg-white/10 text-slate-300 border-white/10'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300'
              }`}
            >
              <RefreshCw size={13} className={refreshing ? 'animate-spin text-cyan-400' : ''} />
              <span>Refresh Telemetry</span>
            </button>
          </div>
        </div>

        {/* Spike Warning Notification Banner (if recent reconnect/reboot alert triggered) */}
        {data?.spikeAlert && (
          <div className="p-4 rounded-2xl border border-amber-500/30 bg-amber-500/10 text-amber-200 flex items-start gap-3">
            <AlertTriangle size={18} className="text-amber-400 shrink-0 mt-0.5" />
            <div className="text-xs leading-relaxed">
              <strong className="font-bold text-amber-300">Resilience Anomaly Detected:</strong> Hardware reconnects or reboots have spiked recently. An engineering triage entry was automatically appended to <button onClick={() => setCurrentPath?.('/ims/devideas')} className="underline font-bold text-amber-100 hover:text-white">Dev Ideas (/ims/devideas)</button>.
            </div>
          </div>
        )}

        {/* Top Metric Tiles with Sparklines */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Tile 1: Wi-Fi RSSI */}
          <div className={`p-4 rounded-2xl border flex flex-col justify-between ${bgCard}`}>
            <div>
              <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider mb-2">
                <span className="flex items-center gap-1.5 text-cyan-400">
                  <Wifi size={14} /> Wi-Fi RSSI
                </span>
                <span className={`text-[10px] font-bold ${wifiColor}`}>{wifiQuality}</span>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-black tabular-nums font-mono">
                  {latest.wifiRssi != null ? `${latest.wifiRssi}` : '--'}
                </span>
                <span className="text-xs font-bold text-slate-400">dBm</span>
              </div>
              <p className={`text-[11px] mt-1 ${textMuted}`}>
                {latest.ipAddress ? `IP: ${latest.ipAddress}` : 'Connection status'}
              </p>
            </div>
            <div className="mt-3 pt-3 border-t border-inherit flex items-center justify-between">
              <span className={`text-[9px] uppercase font-bold tracking-wider ${textMuted}`}>1-Hour Trend</span>
              <Sparkline data={sparklines.wifiRssi} color="#06b6d4" width={110} height={28} isDark={isDark} />
            </div>
          </div>

          {/* Tile 2: Free Heap & PSRAM */}
          <div className={`p-4 rounded-2xl border flex flex-col justify-between ${bgCard}`}>
            <div>
              <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider mb-2">
                <span className="flex items-center gap-1.5 text-indigo-400">
                  <Cpu size={14} /> Free Heap (DRAM)
                </span>
                <span className="text-[10px] font-bold text-indigo-300">Min: {formatBytes(latest.minFreeHeap)}</span>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-black tabular-nums font-mono">
                  {formatBytes(latest.freeHeap)}
                </span>
              </div>
              <p className={`text-[11px] mt-1 ${textMuted}`}>
                PSRAM Free: {formatBytes(latest.psramFreeHeap || 6500000)}
              </p>
            </div>
            <div className="mt-3 pt-3 border-t border-inherit flex items-center justify-between">
              <span className={`text-[9px] uppercase font-bold tracking-wider ${textMuted}`}>Heap Stability</span>
              <Sparkline data={sparklines.freeHeap} color="#818cf8" width={110} height={28} isDark={isDark} />
            </div>
          </div>

          {/* Tile 3: Uptime & Reboots */}
          <div className={`p-4 rounded-2xl border flex flex-col justify-between ${bgCard}`}>
            <div>
              <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider mb-2">
                <span className="flex items-center gap-1.5 text-emerald-400">
                  <Clock size={14} /> Uptime
                </span>
                <span className="text-[10px] font-bold text-emerald-300">Boot #{latest.bootCount || 1}</span>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-black tabular-nums font-mono">
                  {formatUptime(latest.uptimeSeconds)}
                </span>
              </div>
              <p className={`text-[11px] mt-1 ${textMuted}`}>
                Reset: {latest.resetReason || 'Power On / Software'}
              </p>
            </div>
            <div className="mt-3 pt-3 border-t border-inherit flex items-center justify-between">
              <span className={`text-[9px] uppercase font-bold tracking-wider ${textMuted}`}>Uptime Progress</span>
              <Sparkline data={sparklines.uptimeSeconds} color="#10b981" width={110} height={28} isDark={isDark} />
            </div>
          </div>

          {/* Tile 4: Audio Underruns & Reconnects */}
          <div className={`p-4 rounded-2xl border flex flex-col justify-between ${bgCard}`}>
            <div>
              <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider mb-2">
                <span className="flex items-center gap-1.5 text-rose-400">
                  <Activity size={14} /> Audio &amp; Socket Link
                </span>
                <span className="text-[10px] font-bold text-rose-300">Underruns: {latest.audioBufferUnderruns || 0}</span>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-black tabular-nums font-mono">
                  {latest.reconnectCount || 0}
                </span>
                <span className="text-xs font-bold text-slate-400">reconnects</span>
              </div>
              <p className={`text-[11px] mt-1 ${textMuted}`}>
                Last Error: <span className="font-semibold text-rose-300 truncate">{latest.lastError || 'None'}</span>
              </p>
            </div>
            <div className="mt-3 pt-3 border-t border-inherit flex items-center justify-between">
              <span className={`text-[9px] uppercase font-bold tracking-wider ${textMuted}`}>Reconnects</span>
              <Sparkline data={sparklines.reconnectCount} color="#f43f5e" width={110} height={28} isDark={isDark} />
            </div>
          </div>
        </div>

        {/* Detailed Hardware Telemetry History Table */}
        <div className={`p-5 rounded-2xl border flex flex-col gap-4 ${bgCard}`}>
          <div className="flex items-center justify-between border-b border-inherit pb-3">
            <div className="flex items-center gap-2 font-bold text-sm">
              <Database size={16} className="text-cyan-400" />
              <span>Minute-by-Minute Telemetry Log (Last 60 Reports)</span>
            </div>
            <span className={`text-xs ${textMuted}`}>{history.length} data points</span>
          </div>

          {history.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-500">
              No telemetry entries recorded yet. Connect Box-3 or wait for 1-minute heartbeat report.
            </div>
          ) : (
            <div className="overflow-x-auto max-h-[380px] overflow-y-auto">
              <table className="w-full text-left text-xs font-mono">
                <thead>
                  <tr className={`border-b border-inherit text-[10px] uppercase font-bold tracking-wider ${textMuted}`}>
                    <th className="py-2 px-3">Timestamp</th>
                    <th className="py-2 px-3">Wi-Fi RSSI</th>
                    <th className="py-2 px-3">Free Heap</th>
                    <th className="py-2 px-3">Min Heap</th>
                    <th className="py-2 px-3">Uptime</th>
                    <th className="py-2 px-3">Reconnects</th>
                    <th className="py-2 px-3">Audio Underruns</th>
                    <th className="py-2 px-3">Last Error</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-inherit">
                  {history.map((row, idx) => (
                    <tr key={row.id || idx} className={`hover:bg-white/5 transition-colors ${idx === 0 ? 'bg-cyan-500/5 font-semibold' : ''}`}>
                      <td className="py-2.5 px-3 text-slate-300 font-sans text-[11px]">
                        {new Date(row.recordedAt || row.timestamp).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </td>
                      <td className="py-2.5 px-3">
                        <span className={row.wifiRssi > -70 ? 'text-emerald-400' : 'text-amber-400'}>
                          {row.wifiRssi} dBm
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-indigo-300">{formatBytes(row.freeHeap)}</td>
                      <td className="py-2.5 px-3 text-slate-400">{formatBytes(row.minFreeHeap)}</td>
                      <td className="py-2.5 px-3 text-emerald-300">{formatUptime(row.uptimeSeconds)}</td>
                      <td className="py-2.5 px-3 text-rose-300">{row.reconnectCount || 0}</td>
                      <td className="py-2.5 px-3 text-amber-300">{row.audioBufferUnderruns || 0}</td>
                      <td className="py-2.5 px-3 text-slate-400 max-w-[200px] truncate">{row.lastError || 'None'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </PortalShell>
  );
}
