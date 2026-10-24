// Doorbell sounds: the two-tone chime and the motion blip (Web Audio), and Ims announcing who's at the door in his
// own voice (POST /api/voice/tts, falling back to the browser's voice). Moved unchanged from the classic page
// (Dashboard/DoorbellPortal.jsx) on 24 Oct 2026.

/**
 * Synthesizes an authentic dual-tone Westminster/Ring doorbell chime using Web Audio API
 */
export function playWebChime(type = 'ding') {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    if (ctx.state === 'suspended') {
      ctx.resume();
    }
    const now = ctx.currentTime;

    if (type === 'ding') {
      // 2-tone chime: High bell (F#5 ~ 740 Hz) -> Low bell (D5 ~ 587 Hz)
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(739.99, now);
      gain1.gain.setValueAtTime(0.35, now);
      gain1.gain.exponentialRampToValueAtTime(0.0001, now + 1.2);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start(now);
      osc1.stop(now + 1.2);

      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(587.33, now + 0.35);
      gain2.gain.setValueAtTime(0.4, now + 0.35);
      gain2.gain.exponentialRampToValueAtTime(0.0001, now + 2.0);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(now + 0.35);
      osc2.stop(now + 2.0);
    } else {
      // Motion alert tri-tone radar blip (E5 -> G5 -> B5)
      [659.25, 783.99, 987.77].forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const t = now + idx * 0.12;
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, t);
        gain.gain.setValueAtTime(0.25, t);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(t);
        osc.stop(t + 0.45);
      });
    }
  } catch (err) {
    console.warn('Web Audio playback failed:', err);
  }
}

/**
 * Speaks the announcement through browser SpeechSynthesis (fallback)
 */
function speakAnnouncement(phrase) {
  if (!('speechSynthesis' in window) || !phrase) return;
  try {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(phrase);
    utterance.lang = 'en-GB';
    utterance.rate = 1.0;
    utterance.pitch = 0.95;
    const voices = window.speechSynthesis.getVoices();
    const ukVoice = voices.find(v => v.lang === 'en-GB' || v.name.includes('UK') || v.name.includes('British'));
    if (ukVoice) utterance.voice = ukVoice;
    window.speechSynthesis.speak(utterance);
  } catch (err) {
    console.warn('Speech synthesis failed:', err);
  }
}

/**
 * Speaks the announcement in Ims's persona voice using IMS Gemini TTS (POST /api/voice/tts)
 * with graceful fallback to browser SpeechSynthesis
 */
// One announcement at a time, each alert once: the live event and the Test button's own reply
// describe the same alert, so it's keyed by event + camera + time.
let currentAudio = null;
const announced = new Set();
let testChimePlayedAt = 0;
export const markTestChime = () => { testChimePlayedAt = Date.now(); };

function stopAnnouncement() {
  if (currentAudio) { try { currentAudio.pause(); } catch (_) { } currentAudio = null; }
  if ('speechSynthesis' in window) window.speechSynthesis.cancel();
}

export function announceAlert(alert, { chime = true } = {}) {
  if (!alert?.event) return;
  const key = `${alert.event}|${alert.cameraId || alert.cameraName}|${alert.timestamp}`;
  if (announced.has(key)) return;
  announced.add(key);
  // The Box-3's top button is in MIC MUTED (Ims's silent mode): no chime, no voice here either.
  if (alert.deviceMuted) return;
  if (announced.size > 50) announced.delete(announced.values().next().value);
  // the Test button already chimed the moment it was pressed
  if (chime && !(alert.isTest && Date.now() - testChimePlayedAt < 15000)) playWebChime(alert.event);
  const line = alert.phrase || alert.yorkshirePhrase;
  if (line) playImsVoice(line);
}

async function playImsVoice(phrase) {
  if (!phrase) return;
  stopAnnouncement();
  try {
    const res = await fetch('/api/voice/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: phrase })
    });
    if (res.ok) {
      const blob = await res.blob();
      const audioUrl = URL.createObjectURL(blob);
      stopAnnouncement(); // another announcement may have started while this one was fetched
      const audio = new Audio(audioUrl);
      currentAudio = audio;
      audio.onended = () => { URL.revokeObjectURL(audioUrl); if (currentAudio === audio) currentAudio = null; };
      try {
        await audio.play();
        return;
      } catch (playErr) {
        console.warn('[IMS Audio] Audio play error:', playErr);
      }
    }
  } catch (err) {
    console.warn('[IMS Audio] TTS audio stream fetch failed, falling back to Web Speech:', err);
  }
  // Fallback to speech synthesis if network fails or API offline
  speakAnnouncement(phrase);
}

