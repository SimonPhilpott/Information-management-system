// Building and adjusting the Gemini Live setup message for a session: the saved voice, fresh context,
// session resumption, the silent transcriber used while recording, and the accent reminder on tool results.
import { getAccentRule, getPersonality, refreshLiveContext } from '../services/hardwareClientService.js';
import { languageCode as personaLanguageCode } from '../services/personaService.js';

// The accent drifts to American right after Ims looks something up: a tool result is
// plain neutral English, and the voice follows whatever the text in front of it sounds
// like. So every result that Ims is about to read out carries a reminder to voice it in
// the active persona's accent.
const VOICE_REMINDER = () => `DELIVERY REMINDER: ${getAccentRule()}`;
export function withVoiceReminder(output) {
  return output && typeof output === 'object' && !Array.isArray(output) ? { ...output, deliveryReminder: VOICE_REMINDER() } : output;
}

// While a call/meeting is being recorded the upstream Gemini session is only a
// transcriber: no tools, told to say nothing. (Anything it does say is also
// dropped in handleLiveProxyConnection - this just stops it wasting effort.)
export function toSilentSetup(msgStr) {
  try {
    const parsed = JSON.parse(msgStr);
    if (!parsed.setup) return msgStr;
    delete parsed.setup.tools;
    parsed.setup.systemInstruction = {
      parts: [{
        text: 'You are a silent listener. Someone is on a call or in a meeting and this is being transcribed. ' +
          'You must NEVER speak, answer, greet, acknowledge or call any tool, whatever anyone says, even if they address you by name. ' +
          'Produce no output of any kind.'
      }]
    };
    return JSON.stringify(parsed);
  } catch (_) { return msgStr; }
}

// Every (re)connection to Gemini gets the SAVED voice re-applied, and the voice
// actually sent is logged - so the voice can never silently be anything other
// than the one chosen on the IMS Personality screen. Voice-audition setups
// (which carry previewVoice) are left alone, since trying other voices is
// their whole point.
export function pinSavedVoice(msgStr, tag, resumptionHandle = null) {
  try {
    const parsed = JSON.parse(msgStr);
    if (!parsed.setup || parsed.setup.previewVoice) return msgStr;
    // Session resumption: when Gemini cycles its upstream session (it does
    // after ~30-40s of quiet), resume WITH the previous session's handle so
    // the conversation's context carries over instead of starting cold and
    // re-greeting. Without a handle this still asks for resumable updates.
    parsed.setup.sessionResumption = resumptionHandle ? { handle: resumptionHandle } : {};
    const voice = getPersonality().voice;
    parsed.setup.generationConfig = parsed.setup.generationConfig || {};
    const was = parsed.setup.generationConfig.speechConfig?.voiceConfig?.prebuiltVoiceConfig?.voiceName;
    // languageCode must survive this rebuild - dropping it let Ims drift out of English (UK)
    parsed.setup.generationConfig.speechConfig = { languageCode: personaLanguageCode(), voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } };
    console.log(`${tag} 🎙️ Gemini setup voice = ${voice}${was && was !== voice ? ` (corrected from ${was})` : ''}`);
    // Fresh date/time and records for this session, not the ones from when the device connected.
    const part = parsed.setup.systemInstruction?.parts?.[0];
    if (part?.text) part.text = refreshLiveContext(part.text);
    return JSON.stringify(parsed);
  } catch (_) {
    return msgStr;
  }
}
