// State the Gemini Live voice proxy (liveProxy.js) shares with the rest of the server (index.js). They used to
// be module variables in index.js that the proxy reassigned; now both sides read and write them here.
export const live = {
  hardwareSession: null, // the Box-3's current connection: { clientWs, geminiWs }
  browserSession: null,  // the browser voice session's: { clientWs, geminiWs }
  // After a Gemini error (outage, quota) NO new Live session opens anywhere until this passes - mic audio and
  // wake checks used to open a fresh session on every frame, hundreds a minute, which is what tripped the quota.
  geminiCooldownUntil: 0,
  // E5: when the last desk conversation ended and why - a new session soon after a silence close or a dropped
  // connection is handed the last few exchanges, so "and what about tomorrow?" still makes sense
  lastConversationEnd: { at: 0, reason: null },
  // the last unfamiliar face lookAtCamera saw, for enrolPerson
  lastUnenrolledFace: null,
};

// C2: a 'proper think' answer is given in the conversation it came from if that's still open; otherwise it waits
// for the next conversation Simon starts (it's in the session prompt until then)
export const thinkDeliverers = new Set();

export const FOLLOW_UP_MS = 10000; // after Ims stops talking, a reply within this long needs no wake phrase
