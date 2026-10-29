import fs from 'fs';
import path from 'path';
import os from 'os';
import Database from 'better-sqlite3';
import db from '../db/database.js';

/**
 * Service to retrieve accurate, high-precision Antigravity and Claude Code subscription
 * quotas, exact reset timestamps, and automatic quota reset reminders.
 */

// In-memory cache for Claude Subscription API to avoid rate-limiting Anthropic API
let claudeCache = {
  data: null,
  timestamp: 0
};
const CLAUDE_CACHE_TTL_MS = 15000; // 15 seconds

/**
 * Helper to compute high-precision countdown breakdown
 */
export function computeCountdown(resetIso) {
  if (!resetIso) return null;
  const now = Date.now();
  const targetTime = new Date(resetIso).getTime();
  const diffMs = Math.max(0, targetTime - now);
  const totalSec = Math.floor(diffMs / 1000);

  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;

  const humanParts = [];
  if (days > 0) humanParts.push(`${days}d`);
  if (hours > 0 || days > 0) humanParts.push(`${hours}h`);
  humanParts.push(`${minutes}m`);
  humanParts.push(`${seconds}s`);

  const localResetStr = new Date(resetIso).toLocaleString('en-GB', {
    timeZone: 'Europe/London',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });

  return {
    resetIso,
    resetLocal: localResetStr,
    diffMs,
    days,
    hours,
    minutes,
    seconds,
    isExpired: diffMs === 0,
    formattedCountdown: diffMs === 0 ? 'Reset ready / rolling' : humanParts.join(' ')
  };
}

/**
 * Helper to refresh Anthropic OAuth token and rotate credentials
 */
async function refreshAnthropicToken(creds, credPath) {
  const refreshToken = creds.claudeAiOauth?.refreshToken;
  if (!refreshToken) return null;
  try {
    const refreshRes = await fetch('https://platform.claude.com/v1/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: '9d1c250a-e61b-44d9-88ed-5944d1962f5e'
      })
    });
    if (refreshRes.ok) {
      const data = await refreshRes.json();
      creds.claudeAiOauth.accessToken = data.access_token;
      if (data.refresh_token) creds.claudeAiOauth.refreshToken = data.refresh_token;
      creds.claudeAiOauth.expiresAt = Date.now() + (data.expires_in || 28800) * 1000;
      fs.writeFileSync(credPath, JSON.stringify(creds, null, 2), 'utf8');
      console.log('[Claude Quota] Successfully refreshed Anthropic OAuth access token and rotated refresh token.');
      return data.access_token;
    } else {
      console.warn('[Claude Quota] Token refresh returned status:', refreshRes.status);
    }
  } catch (err) {
    console.warn('[Claude Quota] Token refresh error:', err.message);
  }
  return null;
}

/**
 * Fetch live Claude Code subscription usage from Anthropic's OAuth usage endpoint
 */
export async function getClaudeSubscriptionQuotas(forceRefresh = false) {
  const now = Date.now();
  if (!forceRefresh && claudeCache.data && now - claudeCache.timestamp < CLAUDE_CACHE_TTL_MS) {
    return claudeCache.data;
  }

  const homedir = os.homedir();
  const credPath = path.join(homedir, '.claude', '.credentials.json');
  const claudeJsonPath = path.join(homedir, '.claude.json');

  let email = 'Claude Code User';
  try {
    if (fs.existsSync(claudeJsonPath)) {
      const cj = JSON.parse(fs.readFileSync(claudeJsonPath, 'utf8'));
      if (cj.oauthAccount?.emailAddress) {
        email = cj.oauthAccount.emailAddress;
      }
    }
  } catch (_) {}

  // Attempt live API query with OAuth token
  if (fs.existsSync(credPath)) {
    try {
      const creds = JSON.parse(fs.readFileSync(credPath, 'utf8'));
      let token = creds.claudeAiOauth?.accessToken;
      const refreshToken = creds.claudeAiOauth?.refreshToken;
      const expiresAt = creds.claudeAiOauth?.expiresAt;

      // Refresh proactively if within 60s of expiration
      if (expiresAt && now >= expiresAt - 60000 && refreshToken) {
        const refreshedToken = await refreshAnthropicToken(creds, credPath);
        if (refreshedToken) token = refreshedToken;
      }

      if (token) {
        const fetchUsage = async (tok) => {
          return await fetch('https://api.anthropic.com/api/oauth/usage?starry_waterfall=ide_banner&skip_spend=1', {
            headers: {
              Authorization: `Bearer ${tok}`,
              'Content-Type': 'application/json',
              'anthropic-client-version': 'claude-code/2.1.312',
              'User-Agent': 'Claude-Code/2.1.312'
            }
          });
        };

        let res = await fetchUsage(token);

        // If rejected (401 Unauthorized or 429 Rate limited with stale token), attempt token refresh and retry
        if (!res.ok && (res.status === 401 || res.status === 429)) {
          console.log(`[Claude Quota] Live fetch returned status ${res.status}. Attempting token refresh...`);
          const refreshedToken = await refreshAnthropicToken(creds, credPath);
          if (refreshedToken) {
            token = refreshedToken;
            res = await fetchUsage(token);
          }
        }

        if (res.ok) {
          const usage = await res.json();
          const result = {
            success: true,
            account: email,
            five_hour: {
              utilization: usage.five_hour?.utilization !== undefined ? usage.five_hour.utilization : 0,
              resets_at: usage.five_hour?.resets_at || null
            },
            seven_day: {
              utilization: usage.seven_day?.utilization !== undefined ? usage.seven_day.utilization : 0,
              resets_at: usage.seven_day?.resets_at || null
            }
          };
          claudeCache = { data: result, timestamp: now };

          // Sync updated usage to ~/.claude.json so offline fallbacks stay accurate
          try {
            if (fs.existsSync(claudeJsonPath)) {
              const cj = JSON.parse(fs.readFileSync(claudeJsonPath, 'utf8'));
              cj.cachedUsageUtilization = {
                fetchedAtMs: Date.now(),
                accountUuid: cj.oauthAccount?.accountUuid || null,
                utilization: usage
              };
              fs.writeFileSync(claudeJsonPath, JSON.stringify(cj, null, 2), 'utf8');
            }
          } catch (_) {}

          return result;
        }
      }
    } catch (err) {
      console.warn('[Claude Quota] Live fetch failed, trying local cache:', err.message);
    }
  }

  // Fallback to cached usage in ~/.claude.json
  try {
    if (fs.existsSync(claudeJsonPath)) {
      const cj = JSON.parse(fs.readFileSync(claudeJsonPath, 'utf8'));
      const cached = cj.cachedUsageUtilization?.utilization;
      if (cached) {
        // If the reset timestamp has already expired in the past, utilization has rolled over
        const fiveHourResetExpired = cached.five_hour?.resets_at && new Date(cached.five_hour.resets_at).getTime() <= now;
        const sevenDayResetExpired = cached.seven_day?.resets_at && new Date(cached.seven_day.resets_at).getTime() <= now;

        const fiveHourUtil = fiveHourResetExpired ? 0 : (cached.five_hour?.utilization !== undefined ? cached.five_hour.utilization : 0);
        const sevenDayUtil = sevenDayResetExpired ? 0 : (cached.seven_day?.utilization !== undefined ? cached.seven_day.utilization : 0);

        const result = {
          success: true,
          account: email,
          isCachedFallback: true,
          five_hour: {
            utilization: fiveHourUtil,
            resets_at: cached.five_hour?.resets_at || null
          },
          seven_day: {
            utilization: sevenDayUtil,
            resets_at: cached.seven_day?.resets_at || null
          }
        };
        claudeCache = { data: result, timestamp: now };
        return result;
      }
    }
  } catch (cErr) {
    console.error('[Claude Quota] Fallback read failed:', cErr.message);
  }

  return {
    success: false,
    account: email,
    error: 'Could not retrieve Claude Code subscription usage.'
  };
}

/**
 * Retrieve combined AI Quotas: Claude Code Subscription + Google Gemini
 */
export async function getAntigravityQuotas({ forceRefresh = false } = {}) {
  const appData = process.env.APPDATA || (process.env.USERPROFILE ? path.join(process.env.USERPROFILE, 'AppData', 'Roaming') : '');
  const vscdbPath = path.join(appData, 'Antigravity IDE', 'User', 'globalStorage', 'state.vscdb');

  let geminiData = null;
  let userInfo = { tier: 'Google AI Pro' };
  let tokenUsage = null;
  let rawModels = [];

  if (fs.existsSync(vscdbPath)) {
    const tmpName = `ag_quota_${Date.now()}_${Math.random().toString(36).substring(2, 8)}.vscdb`;
    const tmpPath = path.join(process.env.TEMP || '.', tmpName);

    try {
      fs.copyFileSync(vscdbPath, tmpPath);
      const agDb = new Database(tmpPath, { readonly: true, timeout: 2000 });
      const row = agDb.prepare('SELECT value FROM ItemTable WHERE key = ?').get('n2ns.antigravity-panel');
      agDb.close();
      try { fs.unlinkSync(tmpPath); } catch (_) {}

      if (row && row.value) {
        const parsed = JSON.parse(row.value);
        const snapshot = parsed['tfa.lastSnapshot']?.data;
        if (snapshot) {
          userInfo = snapshot.userInfo || userInfo;
          tokenUsage = snapshot.tokenUsage || null;
          const models = snapshot.models || [];
          const weeklyLimits = snapshot.weeklyLimits || [];

          // Gemini models & weekly buckets
          const geminiModel = models.find((m) => m.label && m.label.toLowerCase().includes('gemini 3.8 flash')) ||
                              models.find((m) => m.label && m.label.toLowerCase().includes('gemini')) || null;

          const geminiWeeklyBucket = weeklyLimits.find((w) => w.bucketId === 'gemini-weekly') ||
                                     weeklyLimits.find((w) => w.bucketId && w.bucketId.includes('gemini')) || null;

          const flashRem = geminiModel ? Number(geminiModel.remainingPercentage.toFixed(1)) : 100;
          const weeklyRem = geminiWeeklyBucket ? Number(geminiWeeklyBucket.remainingPercentage.toFixed(1)) : 100;

          geminiData = {
            provider: 'Google Gemini',
            account: userInfo?.tier || 'Google AI Pro',
            daily: {
              label: geminiModel?.label || 'Gemini 3.8 Flash (Daily)',
              utilization: Math.max(0, Math.min(100, Number((100 - flashRem).toFixed(1)))),
              remainingPercentage: flashRem,
              isExhausted: Boolean(geminiModel?.isExhausted) || flashRem <= 0,
              countdown: computeCountdown(geminiModel?.resetTime)
            },
            weekly: {
              label: 'Gemini Weekly Pool',
              utilization: Math.max(0, Math.min(100, Number((100 - weeklyRem).toFixed(1)))),
              remainingPercentage: weeklyRem,
              countdown: computeCountdown(geminiWeeklyBucket?.resetTime)
            }
          };

          rawModels = models.map((m) => ({
            label: m.label,
            remainingPercentage: Number(m.remainingPercentage.toFixed(1)),
            utilization: Math.max(0, Math.min(100, Number((100 - m.remainingPercentage).toFixed(1)))),
            isExhausted: m.isExhausted,
            countdown: computeCountdown(m.resetTime)
          }));
        }
      }
    } catch (err) {
      if (fs.existsSync(tmpPath)) {
        try { fs.unlinkSync(tmpPath); } catch (_) {}
      }
      console.warn('[Gemini Quota] Failed reading state.vscdb:', err.message);
    }
  }

  // Fetch real Claude Code subscription quota
  const claudeSub = await getClaudeSubscriptionQuotas(forceRefresh);

  const claudeDailyUtil = claudeSub?.five_hour?.utilization !== undefined ? claudeSub.five_hour.utilization : 0;
  const claudeDailyReset = claudeSub?.five_hour?.resets_at || null;
  const claudeWeeklyUtil = claudeSub?.seven_day?.utilization !== undefined ? claudeSub.seven_day.utilization : 0;
  const claudeWeeklyReset = claudeSub?.seven_day?.resets_at || null;

  const claudeData = {
    provider: 'Claude Code Subscription',
    account: claudeSub?.account || 'sideburnt@gmail.com',
    daily: {
      label: 'Session (5hr)',
      utilization: claudeDailyUtil,
      isExhausted: claudeDailyUtil >= 100,
      countdown: computeCountdown(claudeDailyReset)
    },
    weekly: {
      label: 'Weekly (7 day)',
      utilization: claudeWeeklyUtil,
      isExhausted: claudeWeeklyUtil >= 100,
      countdown: computeCountdown(claudeWeeklyReset)
    }
  };

  return {
    success: true,
    timestamp: new Date().toISOString(),
    userInfo,
    tokenUsage,
    claude: claudeData,
    gemini: geminiData || {
      provider: 'Google Gemini',
      account: 'Google AI Pro',
      daily: {
        label: 'Gemini 3.8 Flash (Daily)',
        utilization: 0,
        remainingPercentage: 100,
        isExhausted: false,
        countdown: null
      },
      weekly: {
        label: 'Gemini Weekly Pool',
        utilization: 0,
        remainingPercentage: 100,
        countdown: null
      }
    },
    rawModels
  };
}

/**
 * Quota Reminders configuration
 */
export function getQuotaReminderConfig() {
  try {
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('ai_quota_reminders');
    if (row && row.value) {
      const parsed = JSON.parse(row.value);
      return {
        claude_daily: Boolean(parsed.claude_daily),
        claude_weekly: Boolean(parsed.claude_weekly),
        gemini_daily: Boolean(parsed.gemini_daily),
        gemini_weekly: Boolean(parsed.gemini_weekly)
      };
    }
  } catch (err) {
    console.error('[AI Quota] getQuotaReminderConfig error:', err.message);
  }
  return {
    claude_daily: false,
    claude_weekly: false,
    gemini_daily: false,
    gemini_weekly: false
  };
}

export const QUOTA_REMINDER_DEFS = {
  claude_daily: {
    label: 'Claude Code 5-hour quota has reset',
    getResetIso: (q) => q.claude?.daily?.countdown?.resetIso
  },
  claude_weekly: {
    label: 'Claude Code weekly quota has reset',
    getResetIso: (q) => q.claude?.weekly?.countdown?.resetIso
  },
  gemini_daily: {
    label: 'Gemini daily quota has reset',
    getResetIso: (q) => q.gemini?.daily?.countdown?.resetIso
  },
  gemini_weekly: {
    label: 'Gemini weekly quota has reset',
    getResetIso: (q) => q.gemini?.weekly?.countdown?.resetIso
  }
};

/**
 * Synchronise scheduled items with active quota reminder preferences
 */
export async function syncQuotaReminders(forcedConfig = null) {
  const config = forcedConfig || getQuotaReminderConfig();
  const quotas = await getAntigravityQuotas();

  const now = Date.now();

  for (const [key, def] of Object.entries(QUOTA_REMINDER_DEFS)) {
    const isEnabled = Boolean(config[key]);
    const resetIso = def.getResetIso(quotas);

    // Look for existing reminder by label
    const existing = db.prepare(
      `SELECT * FROM scheduled_items WHERE type = 'reminder' AND label = ? AND cancelled = 0 ORDER BY id DESC LIMIT 1`
    ).get(def.label);

    if (isEnabled && resetIso) {
      const targetMs = new Date(resetIso).getTime();
      if (targetMs > now) {
        if (!existing) {
          // Schedule new reminder
          db.prepare(
            `INSERT INTO scheduled_items (type, label, fire_at, scheduled_for, created_at, cancelled, alert_mode, recurrence)
             VALUES ('reminder', ?, ?, ?, ?, 0, 'both', 'once')`
          ).run(def.label, targetMs, targetMs, now);
          console.log(`[AI Quota Reminders] Scheduled reminder "${def.label}" for ${new Date(targetMs).toISOString()}`);
        } else if (Math.abs(existing.fire_at - targetMs) > 60000) {
          // Update drifting fire_at
          db.prepare(`UPDATE scheduled_items SET fire_at = ?, scheduled_for = ? WHERE id = ?`)
            .run(targetMs, targetMs, existing.id);
          console.log(`[AI Quota Reminders] Updated reminder "${def.label}" to ${new Date(targetMs).toISOString()}`);
        }
      }
    } else if (!isEnabled && existing) {
      // Cancel disabled reminder
      db.prepare(`UPDATE scheduled_items SET cancelled = 1, cancelled_at = ? WHERE id = ?`).run(now, existing.id);
      console.log(`[AI Quota Reminders] Cancelled reminder "${def.label}"`);
    }
  }
}

export async function setQuotaReminderConfig(newConfig) {
  const current = getQuotaReminderConfig();
  const next = {
    claude_daily: newConfig.claude_daily !== undefined ? Boolean(newConfig.claude_daily) : current.claude_daily,
    claude_weekly: newConfig.claude_weekly !== undefined ? Boolean(newConfig.claude_weekly) : current.claude_weekly,
    gemini_daily: newConfig.gemini_daily !== undefined ? Boolean(newConfig.gemini_daily) : current.gemini_daily,
    gemini_weekly: newConfig.gemini_weekly !== undefined ? Boolean(newConfig.gemini_weekly) : current.gemini_weekly
  };

  db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)')
    .run('ai_quota_reminders', JSON.stringify(next));

  await syncQuotaReminders(next);
  return next;
}
