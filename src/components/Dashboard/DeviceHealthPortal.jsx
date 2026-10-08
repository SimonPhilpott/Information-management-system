import React, { useState, useEffect, useRef } from 'react';
import {
  Activity, Wifi, Cpu, Clock, AlertTriangle, RefreshCw, Sparkles,
  Zap, ArrowUpRight, ShieldCheck, ShieldAlert, CheckCircle2,
  Database, Info, AlertOctagon, Layers, Terminal, Download, Copy,
  Play, RotateCcw, Radio, Camera, Mic, Volume2, HardDrive, Send,
  Sliders, ChevronRight, Check, X
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

  const values = data.map((d) => (typeof d === 'number' ? d : Number(d) || 0));
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

  // Terminal & SSE state
  const [logs, setLogs] = useState([]);
  const [logFilter, setLogFilter] = useState('all');
  const [autoScroll, setAutoScroll] = useState(true);
  const [commandInput, setCommandInput] = useState('');
  const [cmdExecuting, setCmdExecuting] = useState(false);
  const [actionMessage, setActionMessage] = useState(null);
  const [confirmModal, setConfirmModal] = useState(null); // { title, message, onConfirm }
  const terminalRef = useRef(null);

  const fetchTelemetry = async (isManual = false) => {
    if (isManual) setRefreshing(true);
    try {
      const res = await fetch('/api/device-health?hours=24');
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

  // SSE Stream integration
  useEffect(() => {
    fetchTelemetry();
    const pollInterval = setInterval(() => {
      fetchTelemetry();
    }, 10000); // 10s polling

    // Connect Server-Sent Events
    const evtSource = new EventSource('/api/device-health/stream');
    evtSource.onmessage = (event) => {
      try {
        const item = JSON.parse(event.data);
        if (item && item.line) {
          setLogs((prev) => {
            const next = [...prev, item];
            if (next.length > 2000) return next.slice(-2000);
            return next;
          });
        }
      } catch (_) { }
    };

    evtSource.onerror = () => {
      console.warn('[SSE] EventSource disconnected, retrying...');
    };

    return () => {
      clearInterval(pollInterval);
      evtSource.close();
    };
  }, []);

  // Auto-scroll terminal
  useEffect(() => {
    if (autoScroll && terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  const handleSendCommand = async (cmdToSend) => {
    const cmd = (cmdToSend || commandInput).trim();
    if (!cmd) return;
    setCmdExecuting(true);
    setActionMessage(null);
    try {
      const res = await fetch('/api/device-health/command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: cmd })
      });
      const json = await res.json();
      if (json.success) {
        setActionMessage({ type: 'success', text: json.message || 'Command executed successfully.' });
        if (!cmdToSend) setCommandInput('');
        fetchTelemetry();
      } else {
        setActionMessage({ type: 'error', text: json.error || 'Command failed.' });
      }
    } catch (err) {
      setActionMessage({ type: 'error', text: err.message });
    } finally {
      setCmdExecuting(false);
    }
  };

  const handleTriggerBuild = () => {
    handleSendCommand('build');
  };

  const handleTriggerOtaUpdate = () => {
    setConfirmModal({
      title: 'Confirm Wi-Fi OTA Update',
      message: `Transmit compiled firmware wirelessly to Box-3 at ${data?.current?.ipAddress || '192.168.1.92:3232'}? The device will reboot once complete.`,
      onConfirm: () => {
        setConfirmModal(null);
        handleSendCommand('update');
      }
    });
  };

  const handleTriggerReboot = () => {
    setConfirmModal({
      title: 'Confirm Remote Device Reboot',
      message: 'Dispatch a software reboot signal to the ESP32-S3-BOX-3 over Wi-Fi?',
      onConfirm: () => {
        setConfirmModal(null);
        handleSendCommand('reboot');
      }
    });
  };

  const handleCopyLogs = () => {
    const text = filteredLogs.map((l) => `[${l.timestamp}] [${l.type.toUpperCase()}] ${l.line}`).join('\n');
    navigator.clipboard.writeText(text);
    setActionMessage({ type: 'success', text: 'Terminal logs copied to clipboard.' });
  };

  const handleDownloadLogs = () => {
    const text = filteredLogs.map((l) => `[${l.timestamp}] [${l.type.toUpperCase()}] ${l.line}`).join('\n');
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `box3_terminal_${new Date().toISOString().slice(0, 19).replace(/[:]/g, '-')}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const latest = data?.latest || {};
  const current = data?.current || {};
  const subsystems = data?.subsystems || [];
  const firmware = data?.firmware || {};
  const history = data?.history || [];
  const sparklines = data?.sparklines || {};
  const isOnline = data?.isOnline || false;

  const filteredLogs = logs.filter((l) => logFilter === 'all' || l.type === logFilter);

  // Signal Strength calculation
  const rssi = current.rssi != null ? current.rssi : -999;
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
      subtitle="/ims/device-health • Real-time Box-3 hardware telemetry, wireless OTA flashing & management terminal"
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
                  {isOnline ? 'Active Online (Dock Wi-Fi)' : 'Offline / Standby'}
                </span>
                {current.ipAddress && (
                  <span className="text-xs font-mono text-cyan-400 bg-cyan-500/10 px-2 py-0.5 rounded-md border border-cyan-500/20">
                    {current.ipAddress}:3232
                  </span>
                )}
              </div>
              <span className={`text-xs ${textMuted}`}>
                {data?.lastReportSecondsAgo != null
                  ? `Telemetry live • last report ${data.lastReportSecondsAgo}s ago`
                  : 'Awaiting telemetry handshake...'}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => handleTriggerReboot()}
              className="px-3 py-1.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition-all active:scale-95 bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border-rose-500/30"
              title="Remote Reboot Box-3"
            >
              <RotateCcw size={13} />
              <span>Reboot</span>
            </button>
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
              <span>Refresh</span>
            </button>
          </div>
        </div>

        {/* Action / Alert Message Toast */}
        {actionMessage && (
          <div className={`p-3 rounded-xl border text-xs flex items-center justify-between ${
            actionMessage.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
              : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
          }`}>
            <div className="flex items-center gap-2">
              {actionMessage.type === 'success' ? <CheckCircle2 size={15} /> : <AlertOctagon size={15} />}
              <span>{actionMessage.text}</span>
            </div>
            <button onClick={() => setActionMessage(null)} className="opacity-70 hover:opacity-100">
              <X size={14} />
            </button>
          </div>
        )}

        {/* 10 Subsystem Status Indicators Matrix */}
        <div className={`p-5 rounded-2xl border ${bgCard}`}>
          <div className="flex items-center justify-between border-b border-inherit pb-3 mb-4">
            <div className="flex items-center gap-2 font-bold text-sm">
              <Layers size={16} className="text-cyan-400" />
              <span>Subsystem Status &amp; Hardware States</span>
            </div>
            <span className={`text-xs ${textMuted}`}>10 Active Subsystems Audited</span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {subsystems.map((sub) => (
              <div
                key={sub.id}
                className="p-3 rounded-xl border border-inherit bg-white/[0.02] flex flex-col justify-between hover:bg-white/[0.05] transition-all"
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className={`text-[10px] font-bold uppercase tracking-wider ${textMuted}`}>{sub.name}</span>
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: sub.color }} />
                </div>
                <div className="text-xs font-black truncate" style={{ color: sub.color }}>
                  {sub.badge}
                </div>
                <div className="text-[10px] text-slate-400 truncate mt-1">
                  {sub.detail}
                </div>
              </div>
            ))}
          </div>
        </div>

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
                  {current.rssi != null ? `${current.rssi}` : '--'}
                </span>
                <span className="text-xs font-bold text-slate-400">dBm</span>
              </div>
              <p className={`text-[11px] mt-1 ${textMuted}`}>
                {current.ipAddress ? `Subnet IP: ${current.ipAddress}` : 'Connection status'}
              </p>
            </div>
            <div className="mt-3 pt-3 border-t border-inherit flex items-center justify-between">
              <span className={`text-[9px] uppercase font-bold tracking-wider ${textMuted}`}>Signal Trend</span>
              <Sparkline data={sparklines.wifiRssi} color="#06b6d4" width={110} height={28} isDark={isDark} />
            </div>
          </div>

          {/* Tile 2: Free Heap (DRAM & PSRAM) */}
          <div className={`p-4 rounded-2xl border flex flex-col justify-between ${bgCard}`}>
            <div>
              <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider mb-2">
                <span className="flex items-center gap-1.5 text-indigo-400">
                  <Cpu size={14} /> Free Heap
                </span>
                <span className="text-[10px] font-bold text-indigo-300">Min: {formatBytes(current.minFreeHeap)}</span>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-black tabular-nums font-mono">
                  {formatBytes(current.freeHeap)}
                </span>
              </div>
              <p className={`text-[11px] mt-1 ${textMuted}`}>
                Internal RAM Free: {formatBytes(current.intFreeHeap)}
              </p>
            </div>
            <div className="mt-3 pt-3 border-t border-inherit flex items-center justify-between">
              <span className={`text-[9px] uppercase font-bold tracking-wider ${textMuted}`}>Heap Stability</span>
              <Sparkline data={sparklines.freeHeap} color="#818cf8" width={110} height={28} isDark={isDark} />
            </div>
          </div>

          {/* Tile 3: Uptime & Boot Count */}
          <div className={`p-4 rounded-2xl border flex flex-col justify-between ${bgCard}`}>
            <div>
              <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider mb-2">
                <span className="flex items-center gap-1.5 text-emerald-400">
                  <Clock size={14} /> Standalone Uptime
                </span>
                <span className="text-[10px] font-bold text-emerald-300">Boot #{current.bootCount || 1}</span>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-black tabular-nums font-mono">
                  {formatUptime(current.uptimeSec)}
                </span>
              </div>
              <p className={`text-[11px] mt-1 ${textMuted}`}>
                Reset: {current.resetReason || 'Power On / Software'}
              </p>
            </div>
            <div className="mt-3 pt-3 border-t border-inherit flex items-center justify-between">
              <span className={`text-[9px] uppercase font-bold tracking-wider ${textMuted}`}>Uptime Progress</span>
              <Sparkline data={sparklines.uptimeSeconds} color="#10b981" width={110} height={28} isDark={isDark} />
            </div>
          </div>

          {/* Tile 4: Reconnects & Sockets */}
          <div className={`p-4 rounded-2xl border flex flex-col justify-between ${bgCard}`}>
            <div>
              <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider mb-2">
                <span className="flex items-center gap-1.5 text-rose-400">
                  <Activity size={14} /> Wireless Reconnects
                </span>
                <span className="text-[10px] font-bold text-rose-300">Underruns: {current.audioUnderruns || 0}</span>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-black tabular-nums font-mono">
                  {current.reconnectCount || 0}
                </span>
                <span className="text-xs font-bold text-slate-400">reconnects</span>
              </div>
              <p className={`text-[11px] mt-1 ${textMuted}`}>
                Last Error: <span className="font-semibold text-rose-300 truncate">{current.lastError || 'None'}</span>
              </p>
            </div>
            <div className="mt-3 pt-3 border-t border-inherit flex items-center justify-between">
              <span className={`text-[9px] uppercase font-bold tracking-wider ${textMuted}`}>Link Drops</span>
              <Sparkline data={sparklines.reconnectCount} color="#f43f5e" width={110} height={28} isDark={isDark} />
            </div>
          </div>
        </div>

        {/* Firmware & Wireless OTA Card */}
        <div className={`p-5 rounded-2xl border ${bgCard}`}>
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-inherit pb-4 mb-4">
            <div>
              <div className="flex items-center gap-2 font-bold text-sm">
                <Zap size={16} className="text-amber-400" />
                <span>Firmware Updates Over Wi-Fi (OTA)</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-amber-500/10 text-amber-300 border border-amber-500/20">
                  Port 3232 ArduinoOTA
                </span>
              </div>
              <p className={`text-xs mt-1 ${textMuted}`}>
                Compile and push dual-partition OTA updates wirelessly without USB cable.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleTriggerBuild}
                disabled={cmdExecuting || firmware?.otaState?.status === 'building'}
                className="px-3.5 py-1.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition-all active:scale-95 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 border-indigo-500/30"
              >
                <Cpu size={13} className={firmware?.otaState?.status === 'building' ? 'animate-spin' : ''} />
                <span>{firmware?.otaState?.status === 'building' ? 'Building...' : 'Compile Firmware'}</span>
              </button>

              <button
                onClick={handleTriggerOtaUpdate}
                disabled={cmdExecuting || !firmware?.canUpdate}
                className="px-3.5 py-1.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition-all active:scale-95 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border-emerald-500/40"
              >
                <Zap size={13} className={firmware?.otaState?.status === 'flashing' ? 'animate-bounce' : ''} />
                <span>{firmware?.otaState?.status === 'flashing' ? 'Flashing...' : 'Update Device (OTA)'}</span>
              </button>
            </div>
          </div>

          {/* Active OTA Progress Bar */}
          {firmware?.otaState?.status && firmware.otaState.status !== 'idle' && (
            <div className="mb-4 p-4 rounded-xl border border-cyan-500/30 bg-cyan-500/10">
              <div className="flex items-center justify-between text-xs font-bold text-cyan-300 mb-2">
                <span>OTA Engine: {firmware.otaState.message || firmware.otaState.status}</span>
                <span>{firmware.otaState.progress || 0}%</span>
              </div>
              <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-cyan-500 to-emerald-400 transition-all duration-300"
                  style={{ width: `${Math.min(100, firmware.otaState.progress || 0)}%` }}
                />
              </div>
            </div>
          )}

          {/* Binary Info & Update Guard Notice */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-mono mb-4">
            <div className="p-3 rounded-xl border border-inherit bg-white/[0.02]">
              <span className={`text-[10px] uppercase font-bold block ${textMuted} mb-1 font-sans`}>Active Binary Metadata</span>
              <div>Version: <span className="text-cyan-300 font-bold">{firmware?.builtVersion || 'none'}</span></div>
              <div>Size: <span className="text-slate-300">{formatBytes(firmware?.binary?.size)}</span></div>
              <div>SHA-256: <span className="text-slate-400">{firmware?.binary?.shortHash || 'n/a'}</span></div>
            </div>

            <div className="p-3 rounded-xl border border-inherit bg-white/[0.02]">
              <span className={`text-[10px] uppercase font-bold block ${textMuted} mb-1 font-sans`}>Wireless Guard Status</span>
              <div>OTA Ready: <span className={firmware?.canUpdate ? 'text-emerald-400' : 'text-amber-400'}>{firmware?.canUpdate ? 'YES (Idle & Safe)' : 'BLOCKED'}</span></div>
              {firmware?.updateBlockedReason && (
                <div className="text-rose-400 mt-1 font-sans text-[11px]">{firmware.updateBlockedReason}</div>
              )}
            </div>
          </div>

          {/* OTA History Mini-Table */}
          {firmware?.history?.length > 0 && (
            <div>
              <div className={`text-[10px] uppercase font-bold tracking-wider mb-2 ${textMuted}`}>Past Wireless Updates</div>
              <div className="overflow-x-auto max-h-[140px] overflow-y-auto">
                <table className="w-full text-left text-[11px] font-mono">
                  <thead>
                    <tr className={`border-b border-inherit text-[9px] uppercase font-bold ${textMuted}`}>
                      <th className="py-1 px-2">Timestamp</th>
                      <th className="py-1 px-2">Target IP</th>
                      <th className="py-1 px-2">Status</th>
                      <th className="py-1 px-2">Duration</th>
                      <th className="py-1 px-2">Size</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-inherit">
                    {firmware.history.map((h) => (
                      <tr key={h.id} className="hover:bg-white/5">
                        <td className="py-1 px-2 text-slate-300 font-sans">{new Date(h.timestamp).toLocaleTimeString('en-GB')}</td>
                        <td className="py-1 px-2 text-cyan-300">{h.ip}</td>
                        <td className="py-1 px-2">
                          <span className={h.status === 'SUCCESS' ? 'text-emerald-400' : 'text-rose-400'}>{h.status}</span>
                        </td>
                        <td className="py-1 px-2 text-slate-400">{h.duration_sec}s</td>
                        <td className="py-1 px-2 text-slate-400">{formatBytes(h.size_bytes)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Real-time Management Terminal Panel */}
        <div className={`p-5 rounded-2xl border flex flex-col gap-4 ${bgCard}`}>
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-inherit pb-3">
            <div className="flex items-center gap-2 font-bold text-sm">
              <Terminal size={16} className="text-emerald-400" />
              <span>Live Management Console &amp; Log Mirror</span>
              <span className="text-[10px] text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/30 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                <span>SSE Stream Active</span>
              </span>
            </div>

            {/* Terminal Actions */}
            <div className="flex items-center gap-1.5 text-xs">
              <button
                onClick={() => setAutoScroll(!autoScroll)}
                className={`px-2.5 py-1 rounded-lg border font-mono text-[11px] ${
                  autoScroll ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40' : 'bg-white/5 text-slate-400 border-inherit'
                }`}
              >
                Auto-scroll: {autoScroll ? 'ON' : 'OFF'}
              </button>
              <button
                onClick={handleCopyLogs}
                className="px-2.5 py-1 rounded-lg border border-inherit bg-white/5 hover:bg-white/10 text-slate-300 flex items-center gap-1"
                title="Copy Visible Logs"
              >
                <Copy size={12} />
                <span>Copy</span>
              </button>
              <button
                onClick={handleDownloadLogs}
                className="px-2.5 py-1 rounded-lg border border-inherit bg-white/5 hover:bg-white/10 text-slate-300 flex items-center gap-1"
                title="Download .txt Log"
              >
                <Download size={12} />
                <span>Export</span>
              </button>
              <button
                onClick={() => setLogs([])}
                className="px-2.5 py-1 rounded-lg border border-inherit bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white"
                title="Clear Local Display"
              >
                Clear
              </button>
            </div>
          </div>

          {/* Filter Pills */}
          <div className="flex items-center gap-2 text-xs">
            <span className={`text-[10px] uppercase font-bold ${textMuted}`}>Stream Filter:</span>
            {['all', 'device', 'camera', 'ota', 'build', 'server'].map((filt) => (
              <button
                key={filt}
                onClick={() => setLogFilter(filt)}
                className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase transition-all ${
                  logFilter === filt
                    ? 'bg-cyan-500 text-slate-950 shadow-sm'
                    : 'bg-white/5 hover:bg-white/10 text-slate-400'
                }`}
              >
                {filt}
              </button>
            ))}
          </div>

          {/* Terminal Console Output */}
          <div
            ref={terminalRef}
            className="w-full h-80 rounded-xl bg-slate-950 border border-slate-800 p-4 font-mono text-xs overflow-y-auto leading-relaxed select-text"
          >
            {filteredLogs.length === 0 ? (
              <div className="h-full flex items-center justify-center text-slate-600">
                Awaiting device log streaming...
              </div>
            ) : (
              filteredLogs.map((log) => {
                let badgeColor = 'text-slate-400';
                if (log.type === 'device') badgeColor = 'text-indigo-400';
                else if (log.type === 'camera') badgeColor = 'text-amber-400 font-bold';
                else if (log.type === 'ota') badgeColor = 'text-cyan-400 font-bold';
                else if (log.type === 'build') badgeColor = 'text-yellow-300';
                else if (log.type === 'server') badgeColor = 'text-emerald-400';

                return (
                  <div key={log.id} className="hover:bg-white/5 py-0.5 px-1 rounded flex items-start gap-2">
                    <span className="text-[10px] text-slate-500 shrink-0">
                      {new Date(log.timestamp).toLocaleTimeString('en-GB')}
                    </span>
                    <span className={`text-[10px] uppercase font-bold shrink-0 ${badgeColor}`}>
                      [{log.type}]
                    </span>
                    <span className="text-slate-200 break-all">{log.line}</span>
                  </div>
                );
              })
            )}
          </div>

          {/* Fixed Command Input Box & Fast Action Buttons */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={commandInput}
                onChange={(e) => setCommandInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSendCommand();
                }}
                placeholder="Enter command (e.g. status, heap, reboot, camera on, flash usb)..."
                disabled={cmdExecuting}
                className="flex-1 px-3.5 py-2 rounded-xl bg-slate-950/80 border border-inherit text-xs font-mono text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
              />
              <button
                onClick={() => handleSendCommand()}
                disabled={cmdExecuting || !commandInput.trim()}
                className="px-4 py-2 rounded-xl font-bold text-xs bg-cyan-500 hover:bg-cyan-400 text-slate-950 flex items-center gap-1.5 transition-all disabled:opacity-50"
              >
                <Send size={13} />
                <span>Send</span>
              </button>
            </div>

            {/* Quick Action Suggestion Buttons */}
            <div className="flex items-center flex-wrap gap-1.5">
              <span className={`text-[10px] uppercase font-bold ${textMuted}`}>Shortcuts:</span>
              {[
                { cmd: 'status', label: 'status' },
                { cmd: 'heap', label: 'heap' },
                { cmd: 'reboot', label: 'reboot' },
                { cmd: 'camera on', label: 'camera on' },
                { cmd: 'camera off', label: 'camera off' },
                { cmd: 'flash usb', label: 'flash usb (COM3)' }
              ].map((btn) => (
                <button
                  key={btn.cmd}
                  onClick={() => handleSendCommand(btn.cmd)}
                  disabled={cmdExecuting}
                  className="px-2 py-0.5 rounded-lg border border-inherit bg-white/5 hover:bg-white/10 text-[11px] font-mono text-slate-300 transition-all active:scale-95"
                >
                  ${btn.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Confirmation Modal */}
        {confirmModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
            <div className={`max-w-md w-full p-6 rounded-2xl border ${bgCard} shadow-2xl flex flex-col gap-4`}>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center shrink-0">
                  <AlertTriangle size={20} />
                </div>
                <div>
                  <h3 className="text-sm font-bold">{confirmModal.title}</h3>
                  <p className={`text-xs mt-1 ${textMuted}`}>{confirmModal.message}</p>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-inherit">
                <button
                  onClick={() => setConfirmModal(null)}
                  className="px-3.5 py-1.5 rounded-xl border border-inherit text-xs font-bold text-slate-300 hover:bg-white/10"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmModal.onConfirm}
                  className="px-4 py-1.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-bold shadow-lg shadow-cyan-500/20"
                >
                  Proceed
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </PortalShell>
  );
}
