/**
 * Central Background Job Scheduler (Dev Idea #44 & Implementation Plan Phase 2)
 *
 * Consolidates background tasks, telemetry checks, polling loops, and maintenance routines
 * across IMS into a unified, concurrency-locked scheduler with British London wall-clock
 * awareness, run locks, execution timing telemetry, and manual run endpoints.
 */

import eventBus from './eventBus.js';
import logger from './loggerService.js';
import { getSetting, setSetting } from '../db/database.js';

// When each job last ran is saved (setting 'scheduler_last_runs'), so a restart picks up where the schedule
// was rather than starting every clock again: before, a job with a start-up delay re-ran after every restart
// (weekly and daily jobs ran dozens of times on a busy development day), and a job without one waited a full
// interval from start-up, so a daily job never ran if the server restarted at least once a day.
// Only jobs every 10 minutes or longer are saved - the second-by-second ones just start on their interval.
const PERSIST_MIN_INTERVAL_MS = 10 * 60 * 1000;
const FIRST_RUN_DELAY_MS = 5 * 60 * 1000; // a long-interval job that has never run: shortly after start-up
const loadLastRuns = () => { try { return JSON.parse(getSetting('scheduler_last_runs') || '{}') || {}; } catch (_) { return {}; } };
function saveLastRun(name, at) {
  try { const all = loadLastRuns(); all[name] = at; setSetting('scheduler_last_runs', JSON.stringify(all)); } catch (_) { /* not fatal */ }
}

class SchedulerService {
  constructor() {
    this.jobs = new Map();
    this.timerIds = new Map();
    this.started = false;
  }

  /**
   * Register a scheduled routine
   * @param {Object} opts
   * @param {string} opts.name Unique job key (e.g. 'calendar_refresh')
   * @param {string} opts.description Human-readable English description
   * @param {string} opts.category 'realtime' | 'sync' | 'maintenance' | 'monitoring'
   * @param {number} opts.intervalMs Cadence between runs in milliseconds
   * @param {number} [opts.initialDelayMs=0] Delay before first run
   * @param {Function} opts.action Async function executing the job logic
   * @param {Object} [opts.londonHourWindow] Optional hour constraints in Europe/London { minHour, maxHour }
   */
  registerJob({
    name,
    description,
    category = 'maintenance',
    intervalMs,
    initialDelayMs = 0,
    action,
    londonHourWindow = null,
    enabled = true
  }) {
    if (!name || typeof action !== 'function') {
      throw new Error(`Invalid job registration: name and executable action are required.`);
    }

    const job = {
      name,
      description: description || name,
      category,
      intervalMs: Number(intervalMs) || 60000,
      initialDelayMs: Number(initialDelayMs) || 0,
      action,
      londonHourWindow,
      enabled: Boolean(enabled),
      isRunning: false,
      lastRun: null,
      nextRun: Date.now() + (Number(initialDelayMs) || Number(intervalMs) || 60000),
      durationMs: null,
      lastError: null,
      status: 'idle', // 'idle' | 'running' | 'ok' | 'failed'
      runCount: 0
    };

    this.jobs.set(name, job);

    // If scheduler is already running, activate timers for newly registered job
    if (this.started && job.enabled) {
      this._scheduleJob(job);
    }

    return job;
  }

  /**
   * Internal execution wrapper enforcing run-locks, wall-clock checks, and telemetry
   */
  async _executeJob(name, { forced = false } = {}) {
    const job = this.jobs.get(name);
    if (!job) return { error: `Job ${name} not found` };

    if (job.isRunning) {
      logger.warn('Scheduler', `Job "${name}" is already executing. Concurrency lock prevented overlap.`);
      return { skipped: true, reason: 'concurrency_lock', job: this._presentJob(job) };
    }

    // London wall-clock check if not forced
    if (!forced && job.londonHourWindow) {
      const nowLondon = new Date();
      const currentHour = Number(
        nowLondon.toLocaleString('en-GB', { timeZone: 'Europe/London', hour: '2-digit', hour12: false })
      );
      const { minHour, maxHour } = job.londonHourWindow;
      if (typeof minHour === 'number' && currentHour < minHour) {
        return { skipped: true, reason: 'outside_london_hour_window', job: this._presentJob(job) };
      }
      if (typeof maxHour === 'number' && currentHour > maxHour) {
        return { skipped: true, reason: 'outside_london_hour_window', job: this._presentJob(job) };
      }
    }

    job.isRunning = true;
    job.status = 'running';
    const start = Date.now();

    try {
      await job.action();
      job.durationMs = Date.now() - start;
      job.status = 'ok';
      job.lastError = null;
      job.lastRun = Date.now();
      job.runCount++;
      if (job.intervalMs >= PERSIST_MIN_INTERVAL_MS) saveLastRun(name, job.lastRun);
      logger.info('Scheduler', `Completed job "${name}" in ${job.durationMs}ms`);
    } catch (err) {
      job.durationMs = Date.now() - start;
      job.status = 'failed';
      job.lastError = err.message || String(err);
      job.lastRun = Date.now();
      if (job.intervalMs >= PERSIST_MIN_INTERVAL_MS) saveLastRun(name, job.lastRun);
      logger.error('Scheduler', `Failed job "${name}": ${err.message}`, { error: err.message, stack: err.stack });
    } finally {
      job.isRunning = false;
      job.nextRun = Date.now() + job.intervalMs;
      try {
        eventBus.broadcast('job:complete', {
          name: job.name,
          status: job.status,
          durationMs: job.durationMs,
          lastRun: job.lastRun,
          nextRun: job.nextRun,
          lastError: job.lastError
        });
      } catch (_) {}
    }

    return { ok: job.status === 'ok', job: this._presentJob(job) };
  }

  _scheduleJob(job) {
    this._clearJobTimers(job.name);

    const runAndReschedule = async () => {
      await this._executeJob(job.name, { forced: false });
    };

    // First run: for a long-interval job, when it's next due by its saved last run (never sooner than its
    // start-up delay, so start-up isn't swamped); never run yet: shortly after start-up.
    let firstDelay = job.initialDelayMs;
    if (job.intervalMs >= PERSIST_MIN_INTERVAL_MS) {
      const last = loadLastRuns()[job.name];
      if (last) {
        job.lastRun = last;
        firstDelay = Math.max(job.initialDelayMs || 60000, last + job.intervalMs - Date.now());
      } else {
        firstDelay = job.initialDelayMs || FIRST_RUN_DELAY_MS;
      }
    }
    job.nextRun = Date.now() + (firstDelay > 0 ? firstDelay : job.intervalMs);

    if (firstDelay > 0) {
      const initialTimer = setTimeout(() => {
        runAndReschedule();
        const intervalTimer = setInterval(runAndReschedule, job.intervalMs);
        this.timerIds.set(job.name, { intervalTimer });
      }, firstDelay);

      this.timerIds.set(job.name, { initialTimer });
    } else {
      const intervalTimer = setInterval(runAndReschedule, job.intervalMs);
      this.timerIds.set(job.name, { intervalTimer });
    }
  }

  _clearJobTimers(name) {
    const existing = this.timerIds.get(name);
    if (existing) {
      if (existing.initialTimer) clearTimeout(existing.initialTimer);
      if (existing.intervalTimer) clearInterval(existing.intervalTimer);
      this.timerIds.delete(name);
    }
  }

  /**
   * Start all registered background jobs
   */
  start() {
    if (this.started) return;
    this.started = true;
    console.log(`[Scheduler] 🚀 Starting Central Job Scheduler (${this.jobs.size} registered routines)...`);

    for (const job of this.jobs.values()) {
      if (job.enabled) {
        this._scheduleJob(job);
      }
    }
  }

  /**
   * Stop all running intervals and timers
   */
  stop() {
    this.started = false;
    for (const name of this.timerIds.keys()) {
      this._clearJobTimers(name);
    }
    console.log(`[Scheduler] 🛑 Central Job Scheduler paused.`);
  }

  /**
   * Manually trigger a job immediately with run-locks
   */
  async runJobNow(name) {
    return this._executeJob(name, { forced: true });
  }

  _presentJob(j) {
    return {
      name: j.name,
      description: j.description,
      category: j.category,
      intervalMs: j.intervalMs,
      lastRun: j.lastRun,
      nextRun: j.nextRun,
      durationMs: j.durationMs,
      lastError: j.lastError,
      status: j.status,
      isRunning: j.isRunning,
      runCount: j.runCount,
      enabled: j.enabled
    };
  }

  /**
   * Get telemetry and status list for all registered jobs
   */
  getJobs() {
    return Array.from(this.jobs.values()).map((j) => this._presentJob(j));
  }
}

export const schedulerService = new SchedulerService();
export default schedulerService;
