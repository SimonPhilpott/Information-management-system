// Reading what was said (and what Ims said): wake phrases, requests to look through the camera, tool calls
// written out as text, and the face that suits a reply's words. Used by the live proxy (liveProxy.js).
import { matchesWake } from '../services/phrasesService.js';
import { wakeDaemonService } from '../services/wakeDaemonService.js';

// A tool call the model has written out as text instead of calling it: setEmotion(emotion='happy'),
// default_api.endConversation(), print(...) - never meant to be seen or kept.
const TOOL_TEXT = /(?:\bprint\s*\(\s*)?\b(?:default_api\.)?(?:setEmotion|noWakeDetected|endConversation|lookAtCamera|startRecording|[a-z]+[A-Z]\w*)\s*\((?:[^()]|\([^()]*\))*\)\s*\)?/g;
// Asking Ims to use his eyes: look / see / camera / observe / watch, in a sentence that's about what's in
// front of him ("what can you see?", "have a look at this", "watch for the postman", "how do I look?").
// Gemini doesn't always call lookAtCamera for these (8 Oct: "What can you see?" got "I can't quite make
// anything out"), so the server looks anyway and hands him the answer if he didn't (see visionAsk).
const VISION_ASK = [
  /\b(camera|webcam)\b/i,
  /\b(can|could|do|did|would|will)\s+you\s+(see|spot|make out|recogni[sz]e)\b/i,
  /\bwhat\s+(can|do|did)\s+you\s+see\b/i,
  /\bwho\s+(can|do)\s+you\s+see\b/i,
  /\b(have|take)\s+a\s+(quick\s+|proper\s+|good\s+)?(look|peek|gander|butcher'?s)\b/i,
  /\blook(ing)?\s+at\s+(this|that|these|those|me|my|him|her|them|what|who|it|the)\b/i,
  /\b(observe|watch(ing)?\s+(for|out for|me|this|that|the))\b/i,
  /\bhow\s+do\s+i\s+look\b/i,
  /\bwhat\s+am\s+i\s+(holding|wearing|doing|showing)\b/i,
  /\bwho('s|\s+is)\s+(this|that|here|there|with me|behind me|in front)\b/i,
];
// ...but not where the "look" is at information rather than at the room.
const NOT_VISION = /\b(calendar|diary|schedule|weather|forecast|glucose|sugar|reminders?|lists?|emails?|report|news|notes?|timers?|alarms?|look\s+(up|into|for(ward)?)|see\s+you|we'?ll\s+see|let'?s\s+see|see\s+if)\b/i;
export const looksLikeVisionAsk = (text) => VISION_ASK.some((re) => re.test(text)) && !NOT_VISION.test(text);

export const stripToolText = (text) => String(text).replace(TOOL_TEXT, '').replace(/[ 	]{2,}/g, ' ');

// "Hey / Hi / Eh up IMS", allowing for how speech-to-text spells the name (Ims, Ems, Eems, Hims, Elms...).
const WAKE_RX = /\b(hey[\s,-]*up|hey|hi|hiya|heya|hello|eh[\s,-]*up|ey[\s,-]*up|ay[\s,-]*up|aye[\s,-]*up|ayup|eyup|oi|up)\b[\s,.!?'-]*(h?[aei]{1,2}m+e?[sz]\b|i\.?\s?m\.?\s?s\b|elms\b|helms\b|aops\b)/i;
// Speech-to-text often mangles the short wake phrase ("Hey IMS" -> "HMs", "Eh up Ims" -> "Anya Pims",
// "Hi IMS" -> "Hiya."). Gemini hears the audio itself, so when it has decided to answer, these
// count too: a name-like word near the start, or a bare greeting. Ordinary sentences don't.
const NAME_TOKEN = /\b(i\.?\s?m\.?\s?s|ims|imz|ems|eems|emms|hims|aims|hms|h\.?\s?m\.?\s?s|pims|mims|m's|ms|him's|hymns?|elms|helms|aops|\w*pms|\w*ims\w*)\b/i;
const GREETING_ONLY = /^\W*(hi|hiya|hi ya|heya|hey|hey up|hello|eh up|ey up|ay up|aye up|ayup|eyup|anya|now then)\W*$/i;
export const looksAddressed = (t) => {
  const text = String(t || '').trim();
  const opening = text.split(/\s+/).slice(0, 5).join(' ');
  if (WAKE_RX.test(text) || NAME_TOKEN.test(opening) || GREETING_ONLY.test(text) || matchesWake(text) || ehUpSounding(text)) return true; // + spellings recorded on /ims/phrases
  if (wakeDaemonService.isWakePhrase(text).matches) return true;
  return false;
};
// Strict enough to overrule Gemini's own "no wake phrase" verdict: a recorded spelling, the full
// wake phrase, or a short utterance ending in something like the name ("Neyo Pims", "radio Pims").
export const heardLikeWake = (t) => {
  const text = String(t || '').trim();
  if (!text) return false;
  if (matchesWake(text) || WAKE_RX.test(text) || ehUpSounding(text) || wakeDaemonService.isWakePhrase(text).matches) return true;
  const words = text.split(/\s+/).filter(Boolean);
  return words.length <= 4 && /\b(\w*pims|\w*pms|ims|ems|eems|him's|hims|hymns?|m's)\W*$/i.test(text);
};
// "Eh up IMS" run together sounds like "pms", and speech-to-text writes it as "poems", "APM", "up ems"...
// For a short utterance (three words at most), letters only: an optional eh/ey/ay sound, then p, any
// vowels, m, and an optional s. Ordinary words rarely have that shape; Gemini, which heard the audio,
// has also already chosen to answer before this is consulted.
const EHUP_SHAPE = /^(?:[aeiuy]+h?[aeiouy]*)?p+[aeiouy]*m+[aeiouy]*[sz]?$/;
export const ehUpSounding = (t) => {
  const text = String(t || '').trim();
  if (!text || text.split(/\s+/).length > 3) return false;
  return EHUP_SHAPE.test(text.toLowerCase().replace(/[^a-z]/g, ''));
};

// I4: the face follows the words. A reply he starts without setting a face gets one from its opening words,
// and a reply can change face partway when the words take a turn (once per reply). First match wins.
const FACE_CUES = [
  ['disgusted', /\b(yuck|gross|grim|disgusting|revolting|minging|vile)\b/i],
  ['amazement', /\b(wow|blimey|by 'eck|ee by gum|incredible|unbelievable|can you believe|would you believe|amazing|astonishing)\b/i],
  ['sad', /\b(sadly|unfortunately|sorry to hear|bad news|what a shame|gutted|i'm sorry|that's a pity)\b/i],
  ['suspicious', /\b(hmm+|are you sure|pull the other one|i doubt|sounds fishy|likely story|i'm not convinced)\b|\breally\?/i],
  ['confused', /\b(not sure what you mean|you've lost me|come again|baffled|confused|doesn't add up)\b|\beh\?/i],
  ['cocky', /\b(ha+|heh|told you|course i did|obviously|cheeky|you would|nice try|daft (?:beggar|ha'porth))\b/i],
  ['love', /\b(proud of you|love that|bless|i'm touched|you're a good|means a lot)\b/i],
  ['bored', /\b(yawn|tedious|boring|same again|dull as)\b/i],
  ['joy', /\b(great news|good news|brilliant|cracking|fantastic|wonderful|lovely|grand|smashing|champion|well done|congratulations|morning|hello|ey up|now then)\b/i],
];
export const faceFromWords = (text, used = []) => (FACE_CUES.find(([emo, rx]) => !used.includes(emo) && rx.test(text)) || [])[0] || null;
