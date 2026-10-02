import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import eventBus from './eventBus.js';

/**
 * IMS Structured Levelled Logging & Rotation Service
 * Addresses Dev Idea #50 (Phase 3 of System Architecture Plan)
 *
 * Provides:
 * - Structured log levels: debug, info, warn, error
 * - In-memory queryable ring buffer (2,000 entries) for the Architecture Logs Explorer
 * - Asynchronous daily rotating disk persistence in data/logs/ with 14-day retention
 * - Real-time SSE event publishing (log:entry)
 * - Service-tagged logging helpers (logger.child(service))
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOG_DIR = path.resolve(__dirname, '../../data/logs');
const MAX_BUFFER_SIZE = 2000;
const RETENTION_DAYS = 14;

// Ensure log directory exists
try {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
} catch (err) {
  console.error('[Logger] Failed to create logs directory:', err.message);
}

class LoggerService {
  constructor() {
    this.buffer = [];
    this.seq = 0;
    this.currentDateStr = this.getTodayDateStr();
    this.cleanupOldLogs();
  }

  getTodayDateStr() {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  getLogFilePath() {
    return path.join(LOG_DIR, `ims-${this.getTodayDateStr()}.log`);
  }

  /**
   * Cleans up log files older than 14 days
   */
  cleanupOldLogs() {
    try {
      if (!fs.existsSync(LOG_DIR)) return;
      const files = fs.readdirSync(LOG_DIR);
      const now = Date.now();
      const maxAgeMs = RETENTION_DAYS * 24 * 60 * 60 * 1000;

      for (const file of files) {
        if (!file.startsWith('ims-') || !file.endsWith('.log')) continue;
        const filePath = path.join(LOG_DIR, file);
        const stats = fs.statSync(filePath);
        if (now - stats.mtimeMs > maxAgeMs) {
          fs.unlinkSync(filePath);
          console.log(`[Logger] Purged expired log file: ${file}`);
        }
      }
    } catch (err) {
      console.error('[Logger] Error cleaning up old log files:', err.message);
    }
  }

  /**
   * Internal logging handler
   */
  log(level, service, message, data = null) {
    const now = new Date();
    const timestamp = now.toISOString();
    const timeFormatted = now.toLocaleTimeString('en-GB', { hour12: false });

    // Format error stack if data is an Error instance
    let serializedData = data;
    if (data instanceof Error) {
      serializedData = {
        message: data.message,
        stack: data.stack
      };
    } else if (data && typeof data === 'object') {
      try {
        serializedData = JSON.parse(JSON.stringify(data));
      } catch (_) {
        serializedData = String(data);
      }
    }

    const entry = {
      id: `${now.getTime()}-${++this.seq}`,
      timestamp,
      timeFormatted,
      level,
      service: service || 'General',
      message: typeof message === 'string' ? message : JSON.stringify(message),
      data: serializedData
    };

    // Store in memory ring buffer
    this.buffer.push(entry);
    if (this.buffer.length > MAX_BUFFER_SIZE) {
      this.buffer.shift();
    }

    // Console output with level indication
    const prefix = `[${timeFormatted}] [${level.toUpperCase()}] [${entry.service}]`;
    if (level === 'error') {
      console.error(prefix, entry.message, serializedData || '');
    } else if (level === 'warn') {
      console.warn(prefix, entry.message, serializedData || '');
    } else if (level === 'debug') {
      // In development or when explicitly enabled
      if (process.env.DEBUG_LOGS === 'true') {
        console.debug(prefix, entry.message, serializedData || '');
      }
    } else {
      console.log(prefix, entry.message, serializedData || '');
    }

    // Asynchronous file persistence
    const fileLine = JSON.stringify(entry) + '\n';
    fs.appendFile(this.getLogFilePath(), fileLine, (err) => {
      if (err) {
        // Silently avoid cascading console errors if disk write fails
      }
    });

    // Broadcast over SSE for live frontend streaming
    try {
      eventBus.broadcast('log:entry', entry);
    } catch (_) {}

    return entry;
  }

  debug(service, message, data) {
    return this.log('debug', service, message, data);
  }

  info(service, message, data) {
    return this.log('info', service, message, data);
  }

  warn(service, message, data) {
    return this.log('warn', service, message, data);
  }

  error(service, message, data) {
    return this.log('error', service, message, data);
  }

  /**
   * Creates a scoped child logger pre-tagged with service name
   */
  child(serviceName) {
    return {
      debug: (msg, data) => this.debug(serviceName, msg, data),
      info: (msg, data) => this.info(serviceName, msg, data),
      warn: (msg, data) => this.warn(serviceName, msg, data),
      error: (msg, data) => this.error(serviceName, msg, data),
    };
  }

  /**
   * Retrieves filtered logs from the in-memory buffer
   */
  getRecentLogs({ limit = 200, level, service, search, since } = {}) {
    let result = [...this.buffer];

    // Compute level distribution counts across entire active buffer
    const counts = {
      total: this.buffer.length,
      error: 0,
      warn: 0,
      info: 0,
      debug: 0
    };

    for (const item of this.buffer) {
      if (counts[item.level] !== undefined) {
        counts[item.level]++;
      }
    }

    if (since) {
      const sinceTime = new Date(since).getTime();
      result = result.filter(log => new Date(log.timestamp).getTime() > sinceTime);
    }

    if (level && level !== 'all') {
      const targetLevel = level.toLowerCase();
      result = result.filter(log => log.level === targetLevel);
    }

    if (service && service !== 'all') {
      const targetService = service.toLowerCase();
      result = result.filter(log => log.service.toLowerCase() === targetService);
    }

    if (search) {
      const q = search.toLowerCase();
      result = result.filter(log =>
        log.message.toLowerCase().includes(q) ||
        log.service.toLowerCase().includes(q) ||
        (log.data && JSON.stringify(log.data).toLowerCase().includes(q))
      );
    }

    // Most recent first
    result.reverse();

    return {
      totalMatches: result.length,
      counts,
      logs: result.slice(0, Math.min(limit, 500))
    };
  }

  /**
   * Lists all distinct service tags in the current buffer
   */
  getServices() {
    const services = new Set();
    for (const item of this.buffer) {
      if (item.service) services.add(item.service);
    }
    return Array.from(services).sort();
  }

  /**
   * Clears the in-memory log buffer
   */
  clearBuffer() {
    this.buffer = [];
    return { success: true };
  }
}

export const logger = new LoggerService();
export default logger;
