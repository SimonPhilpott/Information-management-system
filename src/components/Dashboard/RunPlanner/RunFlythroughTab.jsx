import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Play, Pause, Square, RotateCcw, FastForward, Rewind, Sparkles, CheckCircle2, AlertTriangle, Clock, Mountain, Cookie, Shield, HeartPulse, ChevronRight, History, Flag } from 'lucide-react';
import RunGaugesBar from './RunGaugesBar';
import PostRunReviewPanel from './PostRunReviewPanel';
import { dist, paceText, paceToMinPerKm } from '../../../utils/units';

/**
 * Tab 3: Interactive Run Flythrough & Retrospective Player
 * Replays completed runs or simulated plans with an animated runner locator,
 * sweeping radial gauges, jump-to-time timeline scrubber, post-run recovery replay, and AI retrospective scrutiny.
 */
export default function RunFlythroughTab({
  route,
  plan,
  routeHistory,
  units = 'km',
  isDark = true,
  panelClass = '',
  btnClass = '',
  ghostClass = '',
  targets = null,
  onPlanRoute = null
}) {
  // Mode: 'plan' (simulated plan) or 'history' (actual past completed run)
  const [replayMode, setReplayMode] = useState('plan');
  const [selectedRunIdx, setSelectedRunIdx] = useState(0);
  const [includeRecovery, setIncludeRecovery] = useState(true);

  // Playback state
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(4); // 1x, 2x, 4x, 8x, 16x
  const [currentSec, setCurrentSec] = useState(0);
  const animFrameRef = useRef(null);
  const lastTickTimeRef = useRef(null);

  // Run course duration in seconds (the run itself)
  const runDurationSec = useMemo(() => {
    if (replayMode === 'history' && routeHistory?.runs?.[selectedRunIdx]) {
      return Math.round((routeHistory.runs[selectedRunIdx].minutes || 45) * 60);
    }
    if (plan?.run?.durationMin) {
      return Math.round(plan.run.durationMin * 60);
    }
    return 3600; // default 60 min
  }, [replayMode, selectedRunIdx, routeHistory, plan]);

  // Total duration in seconds (including optional 2h post-run recovery window)
  const totalDurationSec = useMemo(() => {
    return includeRecovery ? runDurationSec + 7200 : runDurationSec;
  }, [includeRecovery, runDurationSec]);

  // Interpolated points along course: array of { sec, distKm, eleM, grade, bg, isRecovery, recoveryMin }
  const courseTimeline = useMemo(() => {
    const pts = [];
    const durSec = totalDurationSec || 3600;
    const runDurSec = runDurationSec || 3600;
    const totalDistKm = route?.distanceKm || 10;
    const profile = route?.profile || [];
    const prediction = plan?.prediction || [];
    const startBg = parseFloat(plan?.settings?.startBg) || 8.2;

    // Finish elevation for resting recovery
    let finishEleM = 50;
    if (profile.length > 0) {
      finishEleM = profile[profile.length - 1][1] || 50;
    }

    for (let s = 0; s <= durSec; s += 5) {
      const m = s / 60;
      const isRecovery = s > runDurSec;
      const recoveryMin = isRecovery ? Math.round((s - runDurSec) / 60) : 0;
      const frac = runDurSec > 0 ? Math.min(1, s / runDurSec) : 1;
      const currentKm = frac * totalDistKm;

      // Find elevation and grade at currentKm
      let eleM = finishEleM;
      let grade = 0;
      if (!isRecovery && profile.length > 0) {
        let best = profile[0];
        for (const p of profile) {
          if (p[0] <= currentKm) best = p;
          else break;
        }
        eleM = best[1] || 50;
        grade = best[2] || 0;
      }

      // Interpolate glucose from prediction model or smooth drift
      let bg = startBg;
      if (prediction.length > 0) {
        let lower = prediction[0];
        let upper = prediction[prediction.length - 1];
        for (let i = 0; i < prediction.length - 1; i++) {
          if (prediction[i][0] <= m && prediction[i + 1][0] >= m) {
            lower = prediction[i];
            upper = prediction[i + 1];
            break;
          }
        }
        const span = upper[0] - lower[0];
        const tFrac = span > 0 ? (m - lower[0]) / span : 0;
        bg = lower[1] + (upper[1] - lower[1]) * tFrac;
      }

      pts.push({
        sec: s,
        min: m,
        distKm: currentKm,
        eleM,
        grade,
        bg: parseFloat(bg.toFixed(2)),
        isRecovery,
        recoveryMin
      });
    }
    return pts;
  }, [totalDurationSec, runDurationSec, route, plan]);

  // Current instantaneous sample at currentSec
  const currentSample = useMemo(() => {
    if (!courseTimeline || courseTimeline.length === 0) {
      return { sec: 0, min: 0, distKm: 0, eleM: 50, grade: 0, bg: 8.0, paceSec: 315, isRecovery: false, recoveryMin: 0 };
    }
    const idx = Math.min(courseTimeline.length - 1, Math.max(0, Math.floor(currentSec / 5)));
    const sample = courseTimeline[idx] || courseTimeline[0];

    // Compute instantaneous pace: 0 if in recovery phase, otherwise grade-adjusted pace
    if (sample.isRecovery) {
      return {
        ...sample,
        paceSec: 0,
        paceTextOverride: 'Resting'
      };
    }

    const basePaceMin = plan?.run?.paceMinPerKm || (paceToMinPerKm(plan?.run?.paceText) || 5.25);
    const hillFactor = 1 + (sample.grade > 0 ? sample.grade * 0.04 : sample.grade * 0.015);
    const instantPaceSec = Math.max(180, Math.min(600, basePaceMin * hillFactor * 60));

    return {
      ...sample,
      paceSec: instantPaceSec,
      paceTextOverride: null
    };
  }, [courseTimeline, currentSec, plan]);

  // Playback animation loop
  useEffect(() => {
    if (!isPlaying) {
      lastTickTimeRef.current = null;
      return;
    }

    const tick = (nowTime) => {
      if (lastTickTimeRef.current != null) {
        const deltaRealSec = (nowTime - lastTickTimeRef.current) / 1000;
        const deltaSimSec = deltaRealSec * playbackSpeed;
        setCurrentSec((prev) => {
          const next = prev + deltaSimSec;
          if (next >= totalDurationSec) {
            setIsPlaying(false);
            return totalDurationSec;
          }
          return next;
        });
      }
      lastTickTimeRef.current = nowTime;
      animFrameRef.current = requestAnimationFrame(tick);
    };

    animFrameRef.current = requestAnimationFrame(tick);
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [isPlaying, playbackSpeed, totalDurationSec]);

  // Scrubber click handler
  const handleScrubberClick = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
    const fraction = rect.width > 0 ? clickX / rect.width : 0;
    setCurrentSec(Math.round(fraction * totalDurationSec));
  };

  const stops = plan?.plan?.stops || [];
  const currentProgressFrac = totalDurationSec > 0 ? currentSec / totalDurationSec : 0;
  const finishLineFrac = totalDurationSec > 0 ? runDurationSec / totalDurationSec : 1;

  // Format mm:ss or hh:mm:ss
  const formatTime = (s) => {
    const mins = Math.floor(s / 60);
    const secs = Math.floor(s % 60);
    if (mins >= 60) {
      const hrs = Math.floor(mins / 60);
      const remMins = mins % 60;
      return `${hrs} h ${String(remMins).padStart(2, '0')} min`;
    }
    return `${mins}:${String(secs).padStart(2, '0')}`;
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Mode Selector & Header */}
      <div className={`${panelClass} flex flex-col md:flex-row items-start md:items-center justify-between gap-3`}>
        <div>
          <div className="flex items-center gap-2">
            <Sparkles size={16} className="text-sky-500" />
            <h2 className={`text-xs font-black uppercase tracking-wider ${isDark ? 'text-slate-200' : 'text-[#2E2B27]'}`}>
              Interactive Run Flythrough & Retrospective Player
            </h2>
          </div>
          <p className={`text-[11px] mt-0.5 ${isDark ? 'text-slate-400' : 'text-[#6A645D]'}`}>
            Simulate your course replay, audit post-run glucose kinetics (+2h recovery), and inspect milestone carb arrivals.
          </p>
        </div>

        {/* Source Toggle & Past Run Selector */}
        <div className="flex flex-wrap items-center gap-2">
          {replayMode === 'history' && routeHistory?.runs?.length > 0 && (
            <select
              value={selectedRunIdx}
              onChange={(e) => {
                setSelectedRunIdx(Number(e.target.value));
                setCurrentSec(0);
                setIsPlaying(false);
              }}
              className={`text-xs px-2.5 py-1 rounded-lg border font-medium ${isDark ? 'bg-slate-900 border-slate-700 text-slate-200' : 'bg-[#FAF7F2] border-[#2E2B27]/15 text-[#2E2B27]'}`}
            >
              {routeHistory.runs.map((r, i) => (
                <option key={r.id} value={i}>
                  {r.day} — {dist(r.km, units, 1)} {units} in {Math.round(r.minutes)} min ({paceText(r.paceMinPerKm, units)}/{units})
                </option>
              ))}
            </select>
          )}

          <div className={`flex items-center gap-1.5 p-1 rounded-xl border ${isDark ? 'bg-slate-950/60 border-white/5' : 'bg-[#FAF7F2] border-[#2E2B27]/15'}`}>
            <button
              onClick={() => { setReplayMode('plan'); setIsPlaying(false); setCurrentSec(0); }}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                replayMode === 'plan'
                  ? isDark
                    ? 'bg-sky-500/20 text-sky-300 border border-sky-500/30'
                    : 'bg-sky-100 text-sky-900 border border-sky-300 font-bold'
                  : isDark
                  ? 'text-slate-400 hover:text-slate-200'
                  : 'text-[#6A645D] hover:text-[#2E2B27]'
              }`}
            >
              Planned Course Simulation
            </button>
            <button
              onClick={() => { setReplayMode('history'); setIsPlaying(false); setCurrentSec(0); }}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                replayMode === 'history'
                  ? isDark
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                    : 'bg-emerald-100 text-emerald-900 border border-emerald-300 font-bold'
                  : isDark
                  ? 'text-slate-400 hover:text-slate-200'
                  : 'text-[#6A645D] hover:text-[#2E2B27]'
              }`}
            >
              Completed Run Retrospective
            </button>
          </div>

          {/* Recovery Replay Toggle */}
          <button
            onClick={() => setIncludeRecovery(!includeRecovery)}
            className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition-all ${
              includeRecovery
                ? isDark
                  ? 'bg-purple-500/20 text-purple-300 border-purple-500/40'
                  : 'bg-purple-100 text-purple-900 border-purple-300 font-bold'
                : isDark
                ? 'bg-slate-900 text-slate-400 border-white/5 hover:text-slate-200'
                : 'bg-[#FAF7F2] text-[#6A645D] border-[#2E2B27]/15 hover:text-[#2E2B27]'
            }`}
            title="Toggle inclusion of 2-hour post-run recovery glucose replay"
          >
            {includeRecovery ? '✓ +2h Recovery' : '+2h Recovery'}
          </button>
        </div>
      </div>

      {/* TOP ROW: DYNAMIC SYNCHRONIZED RADIAL GAUGES */}
      <RunGaugesBar
        units={units}
        gainM={route?.gainM || 0}
        lossM={route?.lossM || 0}
        bgFloor={targets?.floor || 4.5}
        bgCeiling={10.0}
        targetBg={targets?.startTarget || 8.0}
        isDark={isDark}
        livePaceSec={currentSample.paceSec}
        paceTextVal={currentSample.paceTextOverride}
        liveElevationM={currentSample.eleM}
        liveBg={currentSample.bg}
        isLiveFlythrough={true}
      />

      {/* FLYTHROUGH ANIMATED MAP / TOPOGRAPHY VIEWPORT */}
      <div className={`p-4 rounded-2xl border transition-all ${isDark ? 'bg-slate-900/40 border-white/10' : 'bg-white border-[#2E2B27]/10 shadow-sm'}`}>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Mountain size={14} className="text-emerald-500" />
            <span className={`text-xs font-black uppercase tracking-wider ${isDark ? 'text-slate-200' : 'text-[#2E2B27]'}`}>
              {route?.name || 'Course Trail'} • Km {dist(currentSample.distKm, units, 1)} / {dist(route?.distanceKm || 10, units, 1)} {units}
            </span>
            {currentSample.isRecovery ? (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30 font-bold font-mono">
                Post-Run Recovery (+{currentSample.recoveryMin} min)
              </span>
            ) : (
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-mono ${isDark ? 'bg-slate-800 text-slate-400 border border-white/5' : 'bg-[#FAF7F2] text-[#6A645D] border border-[#2E2B27]/10'}`}>
                Grade: {currentSample.grade > 0 ? `+${currentSample.grade}%` : `${currentSample.grade}%`}
              </span>
            )}
          </div>

          <div className={`text-xs font-black tabular-nums font-mono ${isDark ? 'text-slate-300' : 'text-[#2E2B27]'}`}>
            {formatTime(currentSec)} / {formatTime(totalDurationSec)}
          </div>
        </div>

        {/* Simplified course track representation with glowing runner bead */}
        <div className={`relative w-full h-44 rounded-xl overflow-hidden border flex items-center justify-center ${isDark ? 'bg-slate-950/80 border-white/10' : 'bg-[#FAF7F2] border-[#2E2B27]/15'}`}>
          {route?.path && route.path.length > 1 ? (
            <svg viewBox="0 0 600 160" className="w-full h-full p-4" preserveAspectRatio="none">
              <defs>
                <linearGradient id="flythroughGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor="#0284c7" stopOpacity="0.4" />
                  <stop offset="100%" stopColor="#0284c7" stopOpacity="0.0" />
                </linearGradient>
              </defs>

              {/* Course Track Line */}
              {courseTimeline.length > 1 && (
                <path
                  d={courseTimeline.filter((pt) => !pt.isRecovery).map((pt, i) => {
                    const x = (pt.sec / runDurationSec) * (finishLineFrac * 580) + 10;
                    const y = 140 - (pt.eleM / 200) * 100;
                    return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
                  }).join(' ')}
                  fill="none"
                  stroke="#38bdf8"
                  strokeWidth="3"
                  strokeLinecap="round"
                />
              )}

              {/* Finish Line Marker if Recovery Enabled */}
              {includeRecovery && (
                <g transform={`translate(${finishLineFrac * 580 + 10}, 20)`}>
                  <line x1="0" y1="0" x2="0" y2="120" stroke="#a855f7" strokeWidth="1.5" strokeDasharray="4 2" />
                  <rect x="-24" y="-12" width="48" height="14" rx="3" fill="#581c87" stroke="#a855f7" strokeWidth="1" />
                  <text x="0" y="-2" textAnchor="middle" fontSize="8" fontWeight="bold" fill="#f3e8ff">
                    FINISH
                  </text>
                </g>
              )}

              {/* Active Runner Bead */}
              <g transform={`translate(${Math.min(finishLineFrac * 580 + 10, (currentProgressFrac * 580) + 10)}, ${140 - (currentSample.eleM / 200) * 100})`}>
                <circle
                  r="10"
                  fill={currentSample.isRecovery ? '#c084fc' : '#38bdf8'}
                  fillOpacity="0.3"
                  className="animate-ping"
                />
                <circle
                  r="6"
                  fill={currentSample.isRecovery ? '#a855f7' : '#38bdf8'}
                  stroke="#ffffff"
                  strokeWidth="2"
                />
              </g>

              {/* Carb Stops Flag Markers */}
              {stops.map((s, idx) => {
                const stopSec = s.minute * 60;
                const sx = (stopSec / totalDurationSec) * 580 + 10;
                return (
                  <g key={idx} transform={`translate(${sx}, 30)`}>
                    <line x1="0" y1="0" x2="0" y2="100" stroke="#facc15" strokeWidth="1" strokeDasharray="3 3" />
                    <rect x="-18" y="-14" width="36" height="16" rx="4" fill="#854d0e" stroke="#facc15" strokeWidth="1" />
                    <text x="0" y="-3" textAnchor="middle" fontSize="9" fontWeight="bold" fill="#fef08a">
                      {s.grams}g
                    </text>
                  </g>
                );
              })}
            </svg>
          ) : (
            <div className={`text-xs ${isDark ? 'text-slate-500' : 'text-[#6A645D]'}`}>No route geometry loaded for flythrough.</div>
          )}
        </div>

        {/* INTERACTIVE VIDEO SCRUBBER & MEDIA CONTROLS */}
        <div className={`mt-4 pt-3 border-t flex flex-col gap-3 ${isDark ? 'border-white/5' : 'border-[#2E2B27]/10'}`}>
          {/* Dual Timeline Scrubber Bar */}
          <div
            onClick={handleScrubberClick}
            className={`group relative w-full h-8 rounded-lg cursor-pointer overflow-hidden border select-none ${isDark ? 'bg-slate-950/70 border-white/10' : 'bg-[#FAF7F2] border-[#2E2B27]/15'}`}
            title="Click or drag anywhere to jump to that moment of the run or post-run recovery"
          >
            {/* Safe Target Zone Band Background (Green Tint for 7.0-10.0) */}
            <div className="absolute inset-0 bg-emerald-500/5" />

            {/* Elapsed Progress Fill */}
            <div
              className={`absolute top-0 bottom-0 left-0 transition-all duration-75 pointer-events-none ${
                currentSample.isRecovery ? 'bg-purple-500/20 border-r-2 border-purple-400' : 'bg-sky-500/20 border-r-2 border-sky-400'
              }`}
              style={{ width: `${currentProgressFrac * 100}%` }}
            />

            {/* Finish Line Demarcation */}
            {includeRecovery && (
              <div
                className="absolute top-0 bottom-0 w-0.5 bg-purple-500/60 z-10 pointer-events-none"
                style={{ left: `${finishLineFrac * 100}%` }}
                title="Finish Line: Run concludes, 2-hour recovery commences"
              />
            )}

            {/* Carb Stop Flags on Timeline */}
            {stops.map((s, idx) => {
              const stopFrac = totalDurationSec > 0 ? (s.minute * 60) / totalDurationSec : 0;
              return (
                <div
                  key={idx}
                  className="absolute top-0 bottom-0 w-1 bg-yellow-400"
                  style={{ left: `${stopFrac * 100}%` }}
                  title={`Carb Stop ${idx + 1}: ${s.grams}g at ${s.minute} min`}
                />
              );
            })}

            {/* Scrubber Playhead Handle */}
            <div
              className={`absolute top-0 bottom-0 w-2 -ml-1 shadow-lg pointer-events-none rounded-full ${isDark ? 'bg-white' : 'bg-[#2E2B27]'}`}
              style={{ left: `${currentProgressFrac * 100}%` }}
            />

            {/* Hover Tooltip Overlay */}
            <div className={`absolute left-2 top-1.5 text-[10px] font-mono pointer-events-none ${isDark ? 'text-slate-400' : 'text-[#6A645D]'}`}>
              Scrubber: {formatTime(currentSec)} / {formatTime(totalDurationSec)} • Glucose: {currentSample.bg} mmol/L {currentSample.isRecovery ? `(Recovery +${currentSample.recoveryMin} min)` : ''}
            </div>
          </div>

          {/* Action Button Row */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            {/* Play, Pause, Rewind, Fast-Forward, Jump to Finish */}
            <div className="flex items-center flex-wrap gap-2">
              <button
                onClick={() => setIsPlaying(!isPlaying)}
                className={`${btnClass} px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white font-bold`}
              >
                {isPlaying ? <Pause size={14} /> : <Play size={14} className="fill-current" />}
                <span>{isPlaying ? 'Pause' : 'Play'}</span>
              </button>

              <button
                onClick={() => { setIsPlaying(false); setCurrentSec(0); }}
                className={ghostClass}
                title="Reset to beginning"
              >
                <Square size={13} />
                <span>Stop</span>
              </button>

              <button
                onClick={() => setCurrentSec((p) => Math.max(0, p - 30))}
                className={ghostClass}
                title="Rewind 30 seconds"
              >
                <Rewind size={13} />
                <span>-30s</span>
              </button>

              <button
                onClick={() => setCurrentSec((p) => Math.min(totalDurationSec, p + 30))}
                className={ghostClass}
                title="Skip forward 30 seconds"
              >
                <FastForward size={13} />
                <span>+30s</span>
              </button>

              {includeRecovery && (
                <button
                  onClick={() => setCurrentSec(runDurationSec)}
                  className={`${ghostClass} text-[11px] text-purple-400 hover:text-purple-300 font-bold`}
                  title="Jump directly to the finish line to watch post-run recovery"
                >
                  <Flag size={12} />
                  <span>Jump to Finish</span>
                </button>
              )}
            </div>

            {/* Speed Multipliers */}
            <div className="flex items-center gap-1">
              <span className={`text-[10px] font-bold uppercase mr-1 ${isDark ? 'text-slate-500' : 'text-[#6A645D]'}`}>Speed:</span>
              {[1, 2, 4, 8, 16].map((spd) => (
                <button
                  key={spd}
                  onClick={() => setPlaybackSpeed(spd)}
                  className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all ${
                    playbackSpeed === spd
                      ? 'bg-sky-500 text-white'
                      : isDark
                      ? 'bg-slate-800 text-slate-400 hover:text-white'
                      : 'bg-[#FAF7F2] text-[#6A645D] hover:text-[#2E2B27] border border-[#2E2B27]/10'
                  }`}
                >
                  {spd}x
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* RETROSPECTIVE - only for a real completed run, from its own glucose trace */}
      <PostRunReviewPanel
        activityId={replayMode === 'history' ? routeHistory?.runs?.[selectedRunIdx]?.id : null}
        isDark={isDark}
        onPlanRoute={onPlanRoute}
      />
    </div>
  );
}
