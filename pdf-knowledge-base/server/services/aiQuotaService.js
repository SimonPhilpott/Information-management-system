import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';

/**
 * Service to retrieve accurate, high-precision Antigravity and Claude Code
 * quotas and exact reset timestamps.
 */

export function getAntigravityQuotas() {
  const appData = process.env.APPDATA || (process.env.USERPROFILE ? path.join(process.env.USERPROFILE, 'AppData', 'Roaming') : '');
  const vscdbPath = path.join(appData, 'Antigravity IDE', 'User', 'globalStorage', 'state.vscdb');

  if (!fs.existsSync(vscdbPath)) {
    return {
      success: false,
      error: 'Antigravity IDE database (state.vscdb) not found at expected path.'
    };
  }

  // Create temporary copy to avoid file locks with the active IDE
  const tmpName = `ag_quota_${Date.now()}_${Math.random().toString(36).substring(2, 8)}.vscdb`;
  const tmpPath = path.join(process.env.TEMP || '.', tmpName);

  try {
    fs.copyFileSync(vscdbPath, tmpPath);
    const db = new Database(tmpPath, { readonly: true, timeout: 2000 });
    const row = db.prepare('SELECT value FROM ItemTable WHERE key = ?').get('n2ns.antigravity-panel');
    db.close();
    try { fs.unlinkSync(tmpPath); } catch (_) {}

    if (!row || !row.value) {
      return {
        success: false,
        error: 'No quota monitoring snapshot found in state.vscdb. Open Antigravity IDE to initialize.'
      };
    }

    const parsed = JSON.parse(row.value);
    const snapshot = parsed['tfa.lastSnapshot']?.data;
    if (!snapshot) {
      return {
        success: false,
        error: 'Quota snapshot data is currently empty.'
      };
    }

    const now = Date.now();

    // Helper to calculate high-precision breakdown
    const computeCountdown = (resetIso) => {
      if (!resetIso) return null;
      const targetTime = new Date(resetIso).getTime();
      const diffMs = Math.max(0, targetTime - now);
      const totalSec = Math.floor(diffMs / 1000);

      const days = Math.floor(totalSec / 86400);
      const hours = Math.floor((totalSec % 86400) / 3600);
      const minutes = Math.floor((totalSec % 3600) / 60);
      const seconds = totalSec % 60;

      let humanParts = [];
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
    };

    // Extract Models & Weekly Buckets
    const models = snapshot.models || [];
    const weeklyLimits = snapshot.weeklyLimits || [];

    // Claude / Anthropic
    const claudeModel = models.find((m) => m.label && m.label.toLowerCase().includes('claude sonnet')) ||
                        models.find((m) => m.label && m.label.toLowerCase().includes('claude')) || null;

    const claudeWeeklyBucket = weeklyLimits.find((w) => w.bucketId === '3p-weekly') ||
                               weeklyLimits.find((w) => w.bucketId && w.bucketId.includes('3p')) || null;

    // Gemini
    const geminiModel = models.find((m) => m.label && m.label.toLowerCase().includes('gemini 3.8 flash')) ||
                        models.find((m) => m.label && m.label.toLowerCase().includes('gemini')) || null;

    const geminiWeeklyBucket = weeklyLimits.find((w) => w.bucketId === 'gemini-weekly') ||
                               weeklyLimits.find((w) => w.bucketId && w.bucketId.includes('gemini')) || null;

    // Format response payload
    return {
      success: true,
      timestamp: snapshot.timestamp || new Date().toISOString(),
      userInfo: snapshot.userInfo || { tier: 'Google AI Pro' },
      tokenUsage: snapshot.tokenUsage || null,
      claude: {
        provider: 'Anthropic Claude Code',
        daily: {
          label: claudeModel?.label || 'Claude 3.5/3.7 Sonnet',
          remainingPercentage: claudeModel ? Number(claudeModel.remainingPercentage.toFixed(1)) : 100,
          isExhausted: Boolean(claudeModel?.isExhausted),
          countdown: computeCountdown(claudeModel?.resetTime)
        },
        weekly: {
          label: 'Claude Weekly Rate Limit (3P Pool)',
          remainingPercentage: claudeWeeklyBucket ? Number(claudeWeeklyBucket.remainingPercentage.toFixed(1)) : 100,
          countdown: computeCountdown(claudeWeeklyBucket?.resetTime)
        }
      },
      gemini: {
        provider: 'Google Gemini',
        daily: {
          label: geminiModel?.label || 'Gemini 3.8 Flash',
          remainingPercentage: geminiModel ? Number(geminiModel.remainingPercentage.toFixed(1)) : 100,
          isExhausted: Boolean(geminiModel?.isExhausted),
          countdown: computeCountdown(geminiModel?.resetTime)
        },
        weekly: {
          label: 'Gemini Weekly Rate Limit',
          remainingPercentage: geminiWeeklyBucket ? Number(geminiWeeklyBucket.remainingPercentage.toFixed(1)) : 100,
          countdown: computeCountdown(geminiWeeklyBucket?.resetTime)
        }
      },
      rawModels: models.map((m) => ({
        label: m.label,
        remainingPercentage: Number(m.remainingPercentage.toFixed(1)),
        isExhausted: m.isExhausted,
        countdown: computeCountdown(m.resetTime)
      }))
    };
  } catch (err) {
    if (fs.existsSync(tmpPath)) {
      try { fs.unlinkSync(tmpPath); } catch (_) {}
    }
    return {
      success: false,
      error: `Failed to read Antigravity quota: ${err.message}`
    };
  }
}
