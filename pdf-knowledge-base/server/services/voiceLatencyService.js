import db from '../db/database.js';

// Initialise voice_latency_records table
db.exec(`
  CREATE TABLE IF NOT EXISTS voice_latency_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT,
    client_type TEXT DEFAULT 'hardware',
    wake_at INTEGER NOT NULL,
    gemini_connected_at INTEGER,
    first_audio_at INTEGER,
    turn_finished_at INTEGER,
    total_latency_ms INTEGER,
    first_audio_latency_ms INTEGER,
    connect_latency_ms INTEGER,
    tool_calls_json TEXT,
    target_budget_ms INTEGER DEFAULT 1800,
    within_budget BOOLEAN,
    unsolicited BOOLEAN DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_voice_latency_created ON voice_latency_records(created_at);
`);

/**
 * Log a completed voice turn's latency profile
 */
export function recordVoiceTurnLatency({
  sessionId = null,
  clientType = 'hardware',
  wakeAt,
  geminiConnectedAt = null,
  firstAudioAt = null,
  turnFinishedAt = null,
  toolCalls = [],
  targetBudgetMs = 1800,
  unsolicited = false
}) {
  const wake = Number(wakeAt) || Date.now();
  const finished = Number(turnFinishedAt) || Date.now();
  const firstAudio = Number(firstAudioAt) || finished;
  const connected = Number(geminiConnectedAt) || wake;

  const totalLatencyMs = Math.max(0, finished - wake);
  const firstAudioLatencyMs = Math.max(0, firstAudio - wake);
  const connectLatencyMs = Math.max(0, connected - wake);
  const withinBudget = firstAudioLatencyMs <= targetBudgetMs;
  const toolCallsJson = JSON.stringify(toolCalls || []);

  try {
    db.prepare(`
      INSERT INTO voice_latency_records (
        session_id, client_type, wake_at, gemini_connected_at, first_audio_at,
        turn_finished_at, total_latency_ms, first_audio_latency_ms,
        connect_latency_ms, tool_calls_json, target_budget_ms, within_budget, unsolicited
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      sessionId, clientType, wake, connected, firstAudio,
      finished, totalLatencyMs, firstAudioLatencyMs,
      connectLatencyMs, toolCallsJson, targetBudgetMs, withinBudget ? 1 : 0, unsolicited ? 1 : 0
    );
  } catch (err) {
    console.warn('[VoiceLatency] Failed to insert record:', err.message);
  }

  return {
    totalLatencyMs,
    firstAudioLatencyMs,
    connectLatencyMs,
    withinBudget
  };
}

/**
 * Returns latency metrics, tool call distributions, and historical turns for charts
 */
export function getVoiceLatencyMetrics(limit = 50) {
  const records = db.prepare(`
    SELECT * FROM voice_latency_records
    ORDER BY id DESC
    LIMIT ?
  `).all(limit);

  const stats = db.prepare(`
    SELECT 
      COUNT(*) as total_turns,
      AVG(first_audio_latency_ms) as avg_first_audio_ms,
      AVG(total_latency_ms) as avg_total_ms,
      AVG(connect_latency_ms) as avg_connect_ms,
      SUM(CASE WHEN within_budget = 1 THEN 1 ELSE 0 END) as within_budget_count,
      SUM(CASE WHEN unsolicited = 1 THEN 1 ELSE 0 END) as unsolicited_count
    FROM voice_latency_records
  `).get();

  // Parse tool call durations
  const toolDurations = {};
  records.forEach(r => {
    try {
      const tools = JSON.parse(r.tool_calls_json || '[]');
      tools.forEach(t => {
        const name = t.name || 'unknown_tool';
        const ms = Number(t.durationMs) || 0;
        if (!toolDurations[name]) toolDurations[name] = { count: 0, totalMs: 0, avgMs: 0, maxMs: 0 };
        toolDurations[name].count += 1;
        toolDurations[name].totalMs += ms;
        toolDurations[name].maxMs = Math.max(toolDurations[name].maxMs, ms);
        toolDurations[name].avgMs = Math.round(toolDurations[name].totalMs / toolDurations[name].count);
      });
    } catch (_) { }
  });

  return {
    summary: {
      totalTurns: stats.total_turns || 0,
      avgFirstAudioMs: Math.round(stats.avg_first_audio_ms || 0),
      avgTotalMs: Math.round(stats.avg_total_ms || 0),
      avgConnectMs: Math.round(stats.avg_connect_ms || 0),
      budgetCompliancePct: stats.total_turns > 0 ? Math.round((stats.within_budget_count / stats.total_turns) * 100) : 100,
      unsolicitedCount: stats.unsolicited_count || 0
    },
    toolDurations,
    recentTurns: records.map(r => ({
      id: r.id,
      sessionId: r.session_id,
      clientType: r.client_type,
      createdAt: r.created_at,
      connectMs: r.connect_latency_ms,
      firstAudioMs: r.first_audio_latency_ms,
      totalMs: r.total_latency_ms,
      targetBudgetMs: r.target_budget_ms,
      withinBudget: Boolean(r.within_budget),
      unsolicited: Boolean(r.unsolicited),
      tools: (() => { try { return JSON.parse(r.tool_calls_json || '[]'); } catch (_) { return []; } })()
    })).reverse()
  };
}
