/**
 * Manual test harness for imspersonality.md Phase 1, while there's no
 * on-device settings screen yet (that's Phase 4). Sets one or more of the
 * five 0-100 sliders (any axis left unspecified keeps its current value)
 * and prints the resulting system-prompt paragraph so you can see exactly
 * what will be sent to Gemini on the next reconnect - no server restart
 * needed, getHardwareSetupPayload() reads the settings table fresh on
 * every new Gemini connection.
 *
 * Usage:
 *   node scripts/setPersonality.js humor=90 delivery=80 social=10
 *   node scripts/setPersonality.js voice=Charon
 *   node scripts/setPersonality.js --show
 */
import { getPersonality, setPersonality, buildPersonalityParagraph } from '../services/hardwareClientService.js';

const args = process.argv.slice(2);

if (args.includes('--show') || args.length === 0) {
  const current = getPersonality();
  console.log('Current personality settings:', current);
  console.log('\nCurrent system-prompt paragraph:\n');
  console.log(buildPersonalityParagraph(current));
  if (args.length === 0) {
    console.log('\n(no changes made - pass axis=value pairs to update, e.g. "humor=90 delivery=80", or --show to just print the current state)');
  }
  process.exit(0);
}

const NUMERIC_AXES = ['humor', 'delivery', 'temperament', 'social', 'formality'];
const update = {};
for (const arg of args) {
  const [key, value] = arg.split('=');
  if (!key || value === undefined) {
    console.error(`Ignoring malformed argument "${arg}" - expected axis=value`);
    continue;
  }
  if (NUMERIC_AXES.includes(key)) {
    update[key] = Number(value);
  } else if (key === 'voice') {
    update.voice = value;
  } else {
    console.error(`Ignoring unknown key "${key}" - expected one of: ${NUMERIC_AXES.join(', ')}, voice`);
  }
}

const next = setPersonality(update);
console.log('Updated personality settings:', next);
console.log('\nNew system-prompt paragraph (takes effect on the next Gemini reconnect):\n');
console.log(buildPersonalityParagraph(next));
