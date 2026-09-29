import { EventEmitter } from 'events';
import { matchesWake, matchesStop, wakePhraseNames } from './phrasesService.js';

/**
 * Wake Daemon & Conversation Lifecycle Service
 *
 * Manages:
 * 1. Fast, highly-accurate wake phrase recognition ('Hey IMS', 'Hi IMS', 'Eh up IMS' + variants).
 * 2. Active 'Bye' / farewell phrase termination ('bye', 'goodbye', 'thanks bye', 'that's all IMS', etc.).
 * 3. Strict 15-second conversational inactivity silence watchdog.
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

// Authorised core wake phrase patterns (including Yorkshire dialect and common STT renderings)
const CORE_WAKE_REGEX = /\b(hey|hi|hiya|heya|hello|eh\s*up|ey\s*up|ay\s*up|aye\s*up|ayup|eyup|yo|oi)\b[\s,.!?'-]*(ims|imz|ems|eems|emms|hims|aims|hms|pims|mims)\b/i;
const BARE_WAKE_REGEX = /^\W*(hey\s*ims|hi\s*ims|eh\s*up\s*ims|ey\s*up\s*ims|ay\s*up\s*ims|hello\s*ims|hiya\s*ims|heya\s*ims|yo\s*ims)\b/i;

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
    this.lastCloseAt = null;
    this.lastCloseReason = 'boot';
    this.conversationsCount = 0;

    // Verification state
    this.verifyingStartedAt = 0;

    // Start background silence watchdog interval
    this.watchdogInterval = setInterval(() => this._watchdogTick(), 500);
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

    // 2. Check registered phrase database variants
    if (matchesWake(raw)) {
      return { matches: true, phrase: 'Registered Wake Phrase' };
    }

    return { matches: false, phrase: null };
  }

  /**
   * Evaluates if text contains an active stop phrase.
   * Strictly matched against the authorised stop phrases registered in /ims/phrases.
   */
  isFarewellPhrase(text) {
    const raw = String(text || '').trim();
    if (!raw) return { matches: false, phrase: null };

    // Check stop phrases from database
    if (matchesStop(raw)) {
      return { matches: true, phrase: 'Stop Phrase' };
    }

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
      console.log(`[WakeDaemon] Candidate audio detected from ${source} - state: VERIFYING`);
      this.emit('stateChange', { state: this.state, source });
    }
  }

  /**
   * Called when user speech transcript arrives
   */
  processUserSpeech(transcript, source = 'hardware') {
    const raw = String(transcript || '').trim();
    if (!raw) return { action: 'ignore' };

    console.log(`[WakeDaemon] User speech [state=${this.state}, src=${source}]: "${raw.slice(0, 80)}"`);

    // In STANDBY or VERIFYING: Check for wake phrase
    if (this.state === DAEMON_STATES.STANDBY || this.state === DAEMON_STATES.VERIFYING) {
      const wake = this.isWakePhrase(raw);
      if (wake.matches) {
        this.state = DAEMON_STATES.CONVERSATION_ACTIVE;
        this.lastWakeAt = Date.now();
        this.lastWakePhrase = wake.phrase;
        this.lastUserSpeechAt = Date.now();
        this.lastModelSpeechEndAt = 0;
        this.conversationsCount++;
        console.log(`[WakeDaemon] 🎯 Wake phrase verified: "${wake.phrase}" -> CONVERSATION_ACTIVE`);
        this.emit('wakeVerified', { phrase: wake.phrase, source });
        this.emit('stateChange', { state: this.state, reason: 'wake_verified' });
        return { action: 'wake_accepted', phrase: wake.phrase };
      }

      // If in VERIFYING and it's definitely not a wake phrase
      if (this.state === DAEMON_STATES.VERIFYING) {
        console.log(`[WakeDaemon] 🔇 Candidate rejected (not a wake phrase): "${raw.slice(0, 60)}" -> STANDBY`);
        this.forceStandby('no_wake_phrase');
        return { action: 'wake_rejected' };
      }

      return { action: 'ignored_standby' };
    }

    // In CONVERSATION_ACTIVE: Check for farewell phrases
    if (this.state === DAEMON_STATES.CONVERSATION_ACTIVE) {
      const farewell = this.isFarewellPhrase(raw);
      if (farewell.matches) {
        console.log(`[WakeDaemon] 👋 Farewell phrase detected: "${farewell.phrase}" -> CLOSING`);
        this.state = DAEMON_STATES.CLOSING;
        this.lastCloseReason = 'bye_phrase';
        this.emit('stateChange', { state: this.state, reason: 'bye_phrase', phrase: farewell.phrase });

        // Check if user said ONLY the farewell (e.g. "thanks bye", "bye IMS", "see you later")
        const words = raw.split(/\s+/).filter(Boolean);
        const isSoleFarewell = words.length <= 4;

        if (isSoleFarewell) {
          // Immediately terminate conversation and silence mic
          setTimeout(() => {
            this.forceStandby('bye_phrase');
          }, 300);
        } else {
          // Wait briefly for model's brief farewell response to finish before returning to standby
          setTimeout(() => {
            if (this.state === DAEMON_STATES.CLOSING) {
              this.forceStandby('bye_phrase_timeout');
            }
          }, 4000);
        }

        return { action: 'farewell_detected', phrase: farewell.phrase, isSoleFarewell };
      }

      // Normal user speech in active conversation: Refresh silence clock
      this.lastUserSpeechAt = Date.now();
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
    this.conversationsCount++;
    console.log(`[WakeDaemon] 👆 Touch-to-talk initiated from ${source} -> CONVERSATION_ACTIVE`);
    this.emit('stateChange', { state: this.state, reason: 'touch_to_talk' });
  }

  /**
   * Called when model starts delivering speech
   */
  notifyModelSpeechStart() {
    // Model speaking pauses silence expiration
  }

  /**
   * Called when model finishes delivering speech
   */
  notifyModelSpeechEnd() {
    this.lastModelSpeechEndAt = Date.now();

    // If conversation was marked CLOSING (due to a farewell phrase), return cleanly to STANDBY now
    if (this.state === DAEMON_STATES.CLOSING) {
      console.log(`[WakeDaemon] 🎬 Model farewell speech finished -> returning cleanly to STANDBY`);
      this.forceStandby('bye_phrase_complete');
    }
  }

  /**
   * Watchdog timer tick: Enforces 15-second inactivity silence auto-close
   */
  _watchdogTick() {
    // 1. Verification timeout check
    if (this.state === DAEMON_STATES.VERIFYING) {
      if (Date.now() - this.verifyingStartedAt > VERIFY_WINDOW_MS) {
        console.log(`[WakeDaemon] ⏱️ Verification window expired without wake phrase -> reverting to STANDBY`);
        this.forceStandby('verify_timeout');
      }
      return;
    }

    // 2. 15-second Conversational Inactivity Silence Watchdog
    if (this.state === DAEMON_STATES.CONVERSATION_ACTIVE) {
      const quietSince = Math.max(this.lastUserSpeechAt, this.lastModelSpeechEndAt);
      if (!quietSince) return;

      const idleMs = Date.now() - quietSince;
      if (idleMs >= SILENCE_TIMEOUT_MS) {
        console.log(`[WakeDaemon] ⏱️ 15s of conversational silence reached (${Math.round(idleMs / 1000)}s idle) -> terminating conversation`);
        this.forceStandby('silence_timeout');
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

    console.log(`[WakeDaemon] 🛑 State transition: ${prevState} -> STANDBY (Reason: ${reason})`);

    // Notify registered client session to dispatch cancellation and reset streaming
    if (this.activeClientSession?.sendControl) {
      try {
        if (this.activeClientType === 'hardware') {
          this.activeClientSession.sendControl({ cancelConversation: true });
        } else if (this.activeClientType === 'web') {
          this.activeClientSession.sendControl({ sessionIdle: true });
        }
      } catch (err) {
        console.error('[WakeDaemon] Error dispatching client control frame:', err.message);
      }
    }

    // Reset upstream session if callback provided
    if (this.activeClientSession?.closeUpstream && (reason === 'silence_timeout' || reason === 'bye_phrase' || reason === 'manual')) {
      try {
        this.activeClientSession.closeUpstream(reason);
      } catch (err) {
        console.error('[WakeDaemon] Error closing upstream session:', err.message);
      }
    }

    this.emit('stateChange', { state: this.state, reason });
  }

  /**
   * Calculates remaining silence countdown in milliseconds
   */
  getSilenceRemainingMs() {
    if (this.state !== DAEMON_STATES.CONVERSATION_ACTIVE) return 0;
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
      authorizedWakePhrases: wakePhraseNames()
    };
  }
}

// Export singleton instance
export const wakeDaemonService = new WakeDaemonService();
export default wakeDaemonService;
