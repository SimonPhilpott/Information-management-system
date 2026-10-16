// The profiles Ims keeps (what he knows about Simon, and about himself) and the last mood Simon seemed in -
// read and written here, built nightly by memoryService.updateProfiles. Kept free of other service imports so
// the session prompt (hardwareClientService) can read it without an import cycle.
import { getSetting, setSetting } from '../db/database.js';

export const PROFILE_SIMON_KEY = 'ims_profile_simon';
export const PROFILE_SELF_KEY = 'ims_profile_self';
export const MOOD_KEY = 'ims_last_user_mood';

const readJson = (k, d) => { try { return JSON.parse(getSetting(k) || '') ?? d; } catch { return d; } };

export const getProfiles = () => ({ simon: readJson(PROFILE_SIMON_KEY, null), self: readJson(PROFILE_SELF_KEY, null) });
export function saveProfiles({ simon, self } = {}) {
  if (simon !== undefined) setSetting(PROFILE_SIMON_KEY, JSON.stringify(simon));
  if (self !== undefined) setSetting(PROFILE_SELF_KEY, JSON.stringify(self));
  return getProfiles();
}
export const lastUserMood = () => readJson(MOOD_KEY, null);

// compact text for the session prompt
// accentFree: another persona than the one these lessons were learned in is active - leave out the ones about how
// the Yorkshire persona should sound ('sound properly Yorkshire', 'reet'), or they pull the new voice back to Leeds
export function profilesForPrompt({ accentFree = false } = {}) {
  const { simon, self } = getProfiles();
  const accentLesson = /yorkshire|leeds|accent|dialect|reet|how do|'ow do|aye/i;
  if (accentFree && self?.toldOffFor?.length) self.toldOffFor = self.toldOffFor.filter((x) => !accentLesson.test(x));
  const line = (label, arr) => (arr?.length ? `${label}: ${arr.join('; ')}` : '');
  const a = simon ? [line('People', simon.people), line('Projects', simon.projects), line('Plans', simon.plans), line('Likes', simon.likes), line('Dislikes', simon.dislikes), line('Goals', simon.goals)].filter(Boolean) : [];
  const h = simon?.reportsOnly?.length ? `Health and training (for reports, or when he asks - never small talk): ${simon.reportsOnly.join('; ')}` : '';
  const b = self ? [line('Your opinions', self.opinions), line('Running jokes between you', self.runningJokes), line("Things he's told you off for - don't repeat them", self.toldOffFor)].filter(Boolean) : [];
  return [
    a.length || h ? `WHAT YOU KNOW ABOUT SIMON:\n${[...a, h].filter(Boolean).map((x) => `- ${x}`).join('\n')}` : '',
    b.length ? `ABOUT YOU, FROM PAST CONVERSATIONS (stay consistent):\n${b.map((x) => `- ${x}`).join('\n')}` : '',
  ].filter(Boolean).join('\n\n');
}
