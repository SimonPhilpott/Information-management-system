import { EventEmitter } from 'events';
import { matchesWake, matchesStop, wakePhraseNames } from './phrasesService.js';

/**
 * Wake Daemon & Conversation Lifecycle Service
 *
 * Manages:
 * 1. Fast, highly-accurate wake phrase recognition ('Hey IMS', 'Hi IMS', 'Eh up IMS' + all phonetic variants).
 * 2. Active 'Bye' / farewell phrase termination (disabled to prevent interference with voice).
 * 3. Strict 15-second conversational inactivity silence watchdog that respects in-flight model speech and audio playback queues.
 * 4. Hardware and web client session coordination, ensuring clean standby mic cut-off and silence.
 * 5. Real-time operational telemetry and health status.
 */

// Lifecycle states
export const DAEMON_STATES = {
  STANDBY: 'STANDBY',
  VERIFYING: 'VERIFYING',
  CONVERSATION_ACTIVE: 'CONVERSATION_ACTIVE',
  CLOSING: 'CLOSING'
};

const SILENCE_TIMEOUT_MS = 15000; // 15 seconds
const VERIFY_WINDOW_MS = 3500;   // 3.5 seconds

// Normalise spoken text for robust matching
const norm = (t) => String(t || '')
  .toLowerCase()
  .replace(/[’']/g, "'")
  .replace(/[^a-z0-9' ]+/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

// Authorised core wake phrase patterns (including all phonetic pronunciations rhyming with Tims/Jims/rims/limbs, e.g. ims, imz, ihms, imms, ems, eems, hims, hymns, ames, tims, jims, limbs, rpms, pims)
const GREETINGS = '(?:hey|hi|hiya|heya|hello|eh\\s*up|ey\\s*up|ay\\s*up|aye\\s*up|ayup|eyup|yo|oi|anya|now\\s*then|how\\s*do|up)';
const IMS_VARIANTS = '(?:ims|imz|ihms|imms|ems|eems|emms|hims|aims|ames|hms|pims|mims|hymns?|tims|jims|limbs|rims|rpms|m\\\'s|ms)';

const CORE_WAKE_REGEX = new RegExp(`\\b${GREETINGS}\\b[\\s,.!?'-]*${IMS_VARIANTS}\\b`, 'i');
const BARE_WAKE_REGEX = new RegExp(`^\\W*${GREETINGS}?\\s*${IMS_VARIANTS}\\b`, 'i');
const SHORT_TAIL_REGEX = new RegExp(`\\b${IMS_VARIANTS}\\W*$`, 'i');

class WakeDaemonService extends EventEmitter {
  constructor() {
    super();
    this.bootTime = Date.now();
    this.state = DAEMON_STATES.STANDBY;
    this.activeClientType = 'none'; // 'hardware' | 'web' | 'none'
    this.activeClientSession = null;

    // Timing markers
    this.lastWakeAt = null;
    this.lastWakePhrase = null;
    this.lastUserSpeechAt = 0;
    this.lastModelSpeechEndAt = 0;
    this.lastModelSpeechStartAt = 0;
    this.isModelSpeaking = false;
    this.lastCloseAt = null;
    this.lastCloseReason = 'boot';
    this.conversationsCount = 0;

    // Verification state
    this.verifyingStartedAt = 0;

    // Rolling event & activity log (up to 100 entries for live debugging)
    this.activityLogs = [];
    this._addLog('daemon_boot', 'Wake Daemon background service initialized');

    // Start background silence watchdog interval
    this.watchdogInterval = setInterval(() => this._watchdogTick(), 500);
  }

  _addLog(type, message, metadata = {}) {
    const entry = {
      id: Date.now() + '-' + Math.random().toString(36).slice(2, 6),
      timestamp: Date.now(),
      iso: new Date().toISOString(),
      type, // 'candidate' | 'wake_verified' | 'wake_rejected' | 'speech' | 'state_change' | 'silence_timeout'
      state: this.state,
      message,
      metadata
    };
    this.activityLogs.unshift(entry);
    if (this.activityLogs.length > 100) this.activityLogs.pop();
    this.emit('activityLog', entry);
  }

  /**
   * Evaluates if text contains an authorised wake phrase
   */
  isWakePhrase(text) {
    const raw = String(text || '').trim();
    if (!raw) return { matches: false, phrase: null };
    const n = norm(raw);

    // 1. Check core wake regex
    if (CORE_WAKE_REGEX.test(raw) || BARE_WAKE_REGEX.test(n)) {
      const match = raw.match(CORE_WAKE_REGEX) || n.match(BARE_WAKE_REGEX);
      return { matches: true, phrase: match ? match[0] : 'Wake Phrase' };
    }

    // 2. Short utterances ending in phonetic names (e.g., "Anya Pims", "RPMs", "up Ames", "eh up Tims")
    const words = n.split(/\s+/).filter(Boolean);
    if (words.length <= 4 && SHORT_TAIL_REGEX.test(n)) {
      return { matches: true, phrase: raw };
    }

    // 3. Check registered phrase database variants
    if (matchesWake(raw)) {
      return { matches: true, phrase: 'Registered Wake Phrase' };
    }

    return { matches: false, phrase: null };
  }

  /**
   * Evaluates if text contains an active stop phrase (DISABLED).
   */
  isFarewellPhrase(_text) {
    return { matches: false, phrase: null };
  }

  /**
   * Registers an active client session (hardware desk unit or web)
   */
  registerClient(type, sessionOps = {}) {
    this.activeClientType = type;
    this.activeClientSession = sessionOps;
    console.log(`[WakeDaemon] Client session registered: ${type}`);
    this.emit('clientRegistered', { type });
  }

  /**
   * Unregisters a disconnected client session
   */
  unregisterClient(type) {
    if (this.activeClientType === type) {
      console.log(`[WakeDaemon] Client session unregistered: ${type}`);
      this.activeClientType = 'none';
      this.activeClientSession = null;
      if (this.state !== DAEMON_STATES.STANDBY) {
        this.forceStandby('client_disconnect');
      }
    }
  }

  /**
   * Called when acoustic candidate begins (e.g. RMS spike on desk unit)
   */
  notifyCandidateStart(source = 'hardware') {
    if (this.state === DAEMON_STATES.STANDBY) {
      this.state = DAEMON_STATES.VERIFYING;
      this.verifyingStartedAt = Date.now();
      this.candidateTranscriptBuffer = '';
      console.log(`[WakeDaemon] Candidate audio detected from ${source} - state: VERIFYING`);
      this._addLog('candidate', `Candidate audio spike from ${source}`, { source });
      this.emit('stateChange', { state: this.state, source });
    }
  }

  /**
   * Called when user speech transcript arrives
   */
  processUserSpeech(transcript, source = 'hardware') {
    const rawChunk = String(transcript || '').trim();
    if (!rawChunk) return { action: 'ignore' };

    // In STANDBY or VERIFYING: Accumulate streaming tokens and evaluate
    if (this.state === DAEMON_STATES.STANDBY || this.state === DAEMON_STATES.VERIFYING) {
      if (this.state === DAEMON_STATES.STANDBY) {
        this.state = DAEMON_STATES.VERIFYING;
        this.verifyingStartedAt = Date.now();
        this.candidateTranscriptBuffer = '';
      }

      this.candidateTranscriptBuffer = (this.candidateTranscriptBuffer + ' ' + rawChunk).trim();
      const combined = this.candidateTranscriptBuffer;

      console.log(`[WakeDaemon] User speech candidate [state=${this.state}, src=${source}]: chunk="${rawChunk}" combined="${combined.slice(0, 80)}"`);

      const wake = this.isWakePhrase(combined);
      if (wake.matches) {
        this.state = DAEMON_STATES.CONVERSATION_ACTIVE;
        this.lastWakeAt = Date.now();
        this.lastWakePhrase = wake.phrase;
        this.lastUserSpeechAt = Date.now();
        this.lastModelSpeechEndAt = 0;
        this.isModelSpeaking = false;
        this.conversationsCount++;
        this.candidateTranscriptBuffer = '';
        console.log(`[WakeDaemon] 🎯 Wake phrase verified: "${wake.phrase}" -> CONVERSATION_ACTIVE`);
        this._addLog('wake_verified', `Wake phrase verified: "${wake.phrase}" (transcript: "${combined}")`, { phrase: wake.phrase, transcript: combined, source });
        this.emit('wakeVerified', { phrase: wake.phrase, source });
        this.emit('stateChange', { state: this.state, reason: 'wake_verified' });
        return { action: 'wake_accepted', phrase: wake.phrase };
      }

      // Do NOT immediately reject short partial chunks (e.g. "s", "hey"). 
      // Allow subsequent streaming tokens to arrive until the VERIFY_WINDOW_MS expires in _watchdogTick.
      this._addLog('candidate_chunk', `Candidate speech streaming: "${combined}"`, { chunk: rawChunk, combined, source });
      return { action: 'candidate_streaming', currentText: combined };
    }

    // In CONVERSATION_ACTIVE: Normal user speech in active conversation (refresh silence clock)
    if (this.state === DAEMON_STATES.CONVERSATION_ACTIVE) {
      this.lastUserSpeechAt = Date.now();
      this._addLog('speech', `User speech during active conversation: "${rawChunk.slice(0, 60)}"`, { transcript: rawChunk, source });
      return { action: 'active_speech' };
    }

    return { action: 'none' };
  }

  /**
   * Called when physical touch or UI button initiates conversation directly
   */
  notifyTouchToTalk(source = 'hardware') {
    this.state = DAEMON_STATES.CONVERSATION_ACTIVE;
    this.lastWakeAt = Date.now();
    this.lastWakePhrase = 'Touch-to-talk';
    this.lastUserSpeechAt = Date.now();
    this.lastModelSpeechEndAt = 0;
    this.isModelSpeaking = false;
    this.conversationsCount++;
    console.log(`[WakeDaemon] 👆 Touch-to-talk initiated from ${source} -> CONVERSATION_ACTIVE`);
    this._addLog('touch_to_talk', `Conversation started via touch-to-talk (${source})`, { source });
    this.emit('stateChange', { state: this.state, reason: 'touch_to_talk' });
  }

  /**
   * Called when model starts delivering speech or generating audio
   */
  // F1: after a question or a long answer the conversation stays open longer (set per reply by index.js)
  setSilenceTimeout(ms) { this.silenceTimeoutMs = Math.max(SILENCE_TIMEOUT_MS, Math.min(40000, Number(ms) || SILENCE_TIMEOUT_MS)); }

  notifyModelSpeechStart() {
    this.isModelSpeaking = true;
    this.lastModelSpeechStartAt = Date.now();
  }

  /**
   * Called when model finishes delivering speech (or when hardware playback queue finishes draining)
   * @param {number} [actualPlayEndTime] - Optional timestamp when audio playback physically completes
   */
  notifyModelSpeechEnd(actualPlayEndTime = null) {
    this.isModelSpeaking = false;
    this.lastModelSpeechEndAt = actualPlayEndTime || Date.now();
  }

  /**
   * Watchdog timer tick: Enforces 15-second inactivity silence auto-close and self-heals stuck states
   */
  _watchdogTick() {
    const now = Date.now();

    // 1. Verification timeout check
    if (this.state === DAEMON_STATES.VERIFYING) {
      if (now - this.verifyingStartedAt > VERIFY_WINDOW_MS) {
        console.log(`[WakeDaemon] ⏱️ Verification window expired without wake phrase -> reverting to STANDBY`);
        this._addLog('verify_timeout', `Verification window (${VERIFY_WINDOW_MS}ms) expired with no wake phrase`);
        this.forceStandby('verify_timeout');
      }
      return;
    }

    // 2. Dead Client Socket Check: If registered client socket is closed, return to STANDBY
    if (this.state !== DAEMON_STATES.STANDBY) {
      if (typeof this.activeClientSession?.isSocketAlive === 'function' && !this.activeClientSession.isSocketAlive()) {
        console.log(`[WakeDaemon] 🔌 Active client socket disconnected while in state ${this.state} -> forcing STANDBY`);
        this._addLog('client_disconnect', `Client socket disconnected -> forcing STANDBY`);
        this.forceStandby('client_disconnect');
        return;
      }
    }

    // 3. Conversational Inactivity Silence and Hang Watchdogs
    if (this.state === DAEMON_STATES.CONVERSATION_ACTIVE) {
      // Safety net: Model speech flag hang guard (e.g. Gemini stopped sending audio chunks without turnComplete)
      if (this.isModelSpeaking && this.lastModelSpeechStartAt > 0 && (now - this.lastModelSpeechStartAt > 20000)) {
        console.warn(`[WakeDaemon] ⚠️ Model speech flag stuck true for >20s without turnComplete -> auto-clearing`);
        this._addLog('watchdog_guard', 'Model speech flag timed out after 20s');
        this.isModelSpeaking = false;
        this.lastModelSpeechEndAt = now;
      }

      // Safety net: Client pacing/playback stuck check
      // a long day report plays for well over a minute after Gemini has finished generating it
      const pacingStuck = (this.lastModelSpeechEndAt > 0 && (now - this.lastModelSpeechEndAt > 180000));
      const clientPlaying = !pacingStuck && (typeof this.activeClientSession?.isPlayingOrPacing === 'function' && this.activeClientSession.isPlayingOrPacing());

      // If model is actively speaking or client is genuinely actively playing, do not silence-close
      if (this.isModelSpeaking || clientPlaying) {
        return;
      }

      const quietSince = Math.max(this.lastUserSpeechAt, this.lastModelSpeechEndAt, this.lastWakeAt || 0);
      if (!quietSince) return;

      const idleMs = now - quietSince;
      if (idleMs >= (this.silenceTimeoutMs || SILENCE_TIMEOUT_MS)) {
        console.log(`[WakeDaemon] ⏱️ 15s of conversational silence reached (${Math.round(idleMs / 1000)}s idle) -> terminating conversation`);
        this._addLog('silence_timeout', `15s inactivity silence reached -> terminating conversation to standby`);
        this.forceStandby('silence_timeout');
        return;
      }

      // Absolute safety timeout: No conversation turn should remain unclosed past 45s without activity
      if (idleMs >= 45000) {
        console.warn(`[WakeDaemon] ⚠️ Absolute silence timeout reached (45s) -> forcing STANDBY`);
        this._addLog('watchdog_guard', 'Absolute conversation idle timeout (45s) reached');
        this.forceStandby('absolute_idle_timeout');
      }
    }
  }

  /**
   * Forces state back to STANDBY, sends cancellation frame to device, and cuts off mic streaming
   */
  forceStandby(reason = 'manual') {
    const prevState = this.state;
    this.state = DAEMON_STATES.STANDBY;
    this.lastCloseAt = Date.now();
    this.lastCloseReason = reason;
    this.isModelSpeaking = false;
    this.lastModelSpeechStartAt = 0;
    this.candidateTranscriptBuffer = '';

    console.log(`[WakeDaemon] 🛑 State transition: ${prevState} -> STANDBY (Reason: ${reason})`);
    this._addLog('state_change', `State changed: ${prevState} -> STANDBY (Reason: ${reason})`, { prevState, reason });

    // Notify registered client session to dispatch cancellation and reset streaming
    if (this.activeClientSession?.sendControl) {
      try {
        if (this.activeClientType === 'hardware') {
          this.activeClientSession.sendControl({ cancelConversation: true, readyForWake: true, noWakeDetected: true });
        } else if (this.activeClientType === 'web') {
          this.activeClientSession.sendControl({ sessionIdle: true });
        }
      } catch (err) {
        console.error('[WakeDaemon] Error dispatching client control frame:', err.message);
      }
    }

    // Reset upstream session if callback provided (on timeouts or no wake phrase rejection)
    if (this.activeClientSession?.closeUpstream && (reason === 'silence_timeout' || reason === 'manual' || reason === 'verify_timeout' || reason === 'no_wake_phrase' || reason === 'absolute_idle_timeout')) {
      try {
        this.activeClientSession.closeUpstream(reason);
      } catch (err) {
        console.error('[WakeDaemon] Error closing upstream session:', err.message);
      }
    }

    this.emit('stateChange', { state: this.state, reason });
  }

  /**
   * Self-healing evaluation: clears hung verification or active states
   */
  autoRecover() {
    let recovered = false;
    const now = Date.now();
    if (this.state === DAEMON_STATES.VERIFYING && (now - this.verifyingStartedAt > VERIFY_WINDOW_MS)) {
      this.forceStandby('auto_recover_verifying_timeout');
      recovered = true;
    } else if (this.state === DAEMON_STATES.CONVERSATION_ACTIVE) {
      const quietSince = Math.max(this.lastUserSpeechAt, this.lastModelSpeechEndAt, this.lastWakeAt || 0);
      if (now - quietSince > SILENCE_TIMEOUT_MS) {
        this.forceStandby('auto_recover_silence_timeout');
        recovered = true;
      }
    }
    if (this.isModelSpeaking && (now - this.lastModelSpeechStartAt > 20000)) {
      this.isModelSpeaking = false;
      recovered = true;
    }
    return { recovered, status: this.getDaemonStatus() };
  }

  /**
   * Returns recent activity logs
   */
  getRecentLogs(limit = 50) {
    return this.activityLogs.slice(0, limit);
  }

  /**
   * Calculates remaining silence countdown in milliseconds
   */
  getSilenceRemainingMs() {
    if (this.state !== DAEMON_STATES.CONVERSATION_ACTIVE) return 0;
    if (this.isModelSpeaking) return SILENCE_TIMEOUT_MS;
    if (typeof this.activeClientSession?.isPlayingOrPacing === 'function' && this.activeClientSession.isPlayingOrPacing()) {
      return SILENCE_TIMEOUT_MS;
    }
    const quietSince = Math.max(this.lastUserSpeechAt, this.lastModelSpeechEndAt);
    if (!quietSince) return SILENCE_TIMEOUT_MS;
    const elapsed = Date.now() - quietSince;
    return Math.max(0, SILENCE_TIMEOUT_MS - elapsed);
  }

  /**
   * Returns complete operational telemetry and status
   */
  getDaemonStatus() {
    return {
      running: true,
      state: this.state,
      activeClientType: this.activeClientType,
      silenceTimeoutMs: SILENCE_TIMEOUT_MS,
      silenceRemainingMs: this.getSilenceRemainingMs(),
      lastWakeAt: this.lastWakeAt,
      lastWakePhrase: this.lastWakePhrase,
      lastCloseAt: this.lastCloseAt,
      lastCloseReason: this.lastCloseReason,
      conversationsCount: this.conversationsCount,
      uptimeSeconds: Math.floor((Date.now() - this.bootTime) / 1000),
      authorizedWakePhrases: wakePhraseNames(),
      recentLogs: this.getRecentLogs(30)
    };
  }
}

// Export singleton instance
export const wakeDaemonService = new WakeDaemonService();
export default wakeDaemonService;
