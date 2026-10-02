/**
 * Central Background Job Scheduler (Dev Idea #44 & Implementation Plan Phase 2)
 *
 * Consolidates background tasks, telemetry checks, polling loops, and maintenance routines
 * across IMS into a unified, concurrency-locked scheduler with British London wall-clock
 * awareness, run locks, execution timing telemetry, and manual run endpoints.
 */

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
      console.warn(`[Scheduler] ⏳ Job "${name}" is already executing. Concurrency lock prevented overlap.`);
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
    } catch (err) {
      job.durationMs = Date.now() - start;
      job.status = 'failed';
      job.lastError = err.message || String(err);
      job.lastRun = Date.now();
      console.error(`[Scheduler] ❌ Error in job "${name}":`, err.message);
    } finally {
      job.isRunning = false;
      job.nextRun = Date.now() + job.intervalMs;
    }

    return { ok: job.status === 'ok', job: this._presentJob(job) };
  }

  _scheduleJob(job) {
    this._clearJobTimers(job.name);

    const runAndReschedule = async () => {
      await this._executeJob(job.name, { forced: false });
    };

    if (job.initialDelayMs > 0) {
      const initialTimer = setTimeout(() => {
        runAndReschedule();
        const intervalTimer = setInterval(runAndReschedule, job.intervalMs);
        this.timerIds.set(job.name, { intervalTimer });
      }, job.initialDelayMs);

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
