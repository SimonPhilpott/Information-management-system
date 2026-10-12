// Which kind of project a saved code snippet belongs to ("SharePoint web part (SPFx)", "React web app"...).
// The scanner writes each snippet's technology freely - 70-odd spellings of the same few stacks - so it's read
// for keywords against the stacks in projectBuilderPresets.json. Shared by the Code Best Practices filter and
// the New Project builder, so both group code the same way.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const PRESETS_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), 'projectBuilderPresets.json');
export const presets = () => JSON.parse(fs.readFileSync(PRESETS_PATH, 'utf8'));

// SharePoint and ESP32 first: their snippets also mention React / C++
const STACK_PRIORITY = ['spfx', 'esp32', 'nextjs', 'sveltekit', 'vue', 'solid', 'react-vite', 'node-api'];
const rank = (id) => { const i = STACK_PRIORITY.indexOf(id); return i < 0 ? 99 : i; };

export function stackOf(snippet, stacks = presets().stacks) {
  const text = `${snippet.technology || ''} ${snippet.file_path || ''}`.toLowerCase();
  return [...stacks].sort((a, b) => rank(a.id) - rank(b.id)).find((st) => (st.match || []).some((m) => text.includes(m)))?.id || null;
}

export function lookOf(snippet, looks = presets().looks) {
  const text = `${snippet.technology || ''} ${String(snippet.code_content || '').slice(0, 3000)}`.toLowerCase();
  return looks.find((l) => (l.match || []).length && l.match.some((m) => text.includes(m)))?.id || null;
}

// Each stack's display name, for a list of snippets
export function stackNames() {
  return Object.fromEntries(presets().stacks.map((s) => [s.id, s.name]));
}
