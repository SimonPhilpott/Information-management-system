import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { manifest, fileNameFor } from './rulebooks.js';

// Arkham Horror: The Card Game campaigns. The scenarios come from ArkhamDB's scenario cards (each campaign
// is a cycle of packs, in card order); each campaign's setup - its chaos bag at every difficulty and the
// headings of its campaign log - is read once from Fantasy Flight's own campaign guide (the PDF in the
// rulebook list) by Gemini and kept in data/decks/ahlcg_campaign_setups.json.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.join(__dirname, '..', '..', 'data', 'decks');
const SETUPS = path.join(DATA, 'ahlcg_campaign_setups.json');

export const ARKHAM_CAMPAIGNS = [
  { key: 'notz', name: 'Night of the Zealot', cycle: 1, guide: ['Night of the Zealot Campaign Rules'] },
  { key: 'dwl', name: 'The Dunwich Legacy', cycle: 2, guide: ['The Dunwich Legacy Campaign Rules'] },
  { key: 'ptc', name: 'The Path to Carcosa', cycle: 3, guide: ['The Path to Carcosa Campaign Rules'] },
  { key: 'tfa', name: 'The Forgotten Age', cycle: 4, guide: ['The Forgotten Age Campaign Rules'] },
  { key: 'tcu', name: 'The Circle Undone', cycle: 5, guide: ['The Circle Undone Campaign Rules'] },
  { key: 'tde', name: 'The Dream-Eaters', cycle: 6, guide: ['The Dream-Eaters Campaign A Rules', 'The Dream-Eaters Campaign B Rules'] },
  { key: 'tic', name: 'The Innsmouth Conspiracy', cycle: 7, guide: ['The Innsmouth Conspiracy Campaign Rules'] },
  { key: 'eoe', name: 'Edge of the Earth', cycle: 8, guide: ['Edge of the Earth Campaign Rules'] },
  { key: 'tsk', name: 'The Scarlet Keys', cycle: 9, guide: ['The Scarlet Keys Campaign Rules'] },
  { key: 'fhv', name: 'The Feast of Hemlock Vale', cycle: 10, guide: ['The Feast of Hemlock Vale Campaign Rules'] },
  { key: 'tdc', name: 'The Drowned City', cycle: 11, guide: ['The Drowned City Campaign Rules'] },
  { key: 'core26', name: 'The 2026 Core Set campaign', cycle: 12, guide: ['Campaign Guide (2026)'] },
  { key: 'side', name: 'Standalone scenarios', cycle: 70, guide: [] },
];
export const ARKHAM_KINDS = [...ARKHAM_CAMPAIGNS.map((c) => c.name), 'Custom / mixed'];
export const campaignByName = (name) => ARKHAM_CAMPAIGNS.find((c) => c.name === name) || null;

// The chaos bag's tokens, as the page shows them.
export const TOKENS = ['+1', '0', '-1', '-2', '-3', '-4', '-5', '-6', '-7', '-8', 'skull', 'cultist', 'tablet', 'elder_thing', 'auto_fail', 'elder_sign', 'bless', 'curse', 'frost'];

let cardsMemo = null;
function cardData() {
  if (!cardsMemo) {
    try { cardsMemo = JSON.parse(fs.readFileSync(path.join(DATA, 'ahlcg_cards.json'), 'utf8')); } catch (_) { return { cards: [], packs: [] }; }
  }
  return cardsMemo;
}

// Every scenario, with its campaign and its place in that campaign's order (duplicates from reprints and
// the revised core are dropped).
export function arkhamScenarios() {
  const { cards, packs } = cardData();
  const cycleOf = Object.fromEntries(packs.map((p) => [p.code, p.cycle]));
  const out = [], seen = new Set();
  for (const c of cards.filter((x) => x.type === 'scenario').sort((a, b) => String(a.code).localeCompare(String(b.code)))) {
    const cycle = cycleOf[c.pack];
    const camp = ARKHAM_CAMPAIGNS.find((x) => x.cycle === cycle);
    const k = `${camp?.key || cycle}|${c.name}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({ id: c.code, name: c.name, pack: c.packName, campaign: camp?.name || null, cycle, text: c.text || '' });
  }
  return out;
}
export const scenariosOf = (campaignName) => arkhamScenarios().filter((s) => s.campaign === campaignName);

// ---- a campaign's setup, read from its guide ----------------------------------------------------------------
const readSetups = () => { try { return JSON.parse(fs.readFileSync(SETUPS, 'utf8')); } catch { return {}; } };
const reading = new Map();

async function guideText(title) {
  const m = manifest('ahlcg').find((x) => x.title === title);
  if (!m) throw new Error(`No rulebook called "${title}".`);
  const dir = path.join(DATA, 'ahlcg_rulebooks');
  const file = path.join(dir, fileNameFor(title, 'ahlcg'));
  if (!fs.existsSync(file) || fs.statSync(file).size < 1000) {
    const res = await fetch(m.url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36' }, signal: AbortSignal.timeout(180000) });
    if (!res.ok) throw new Error(`Fantasy Flight returned HTTP ${res.status} for ${title}`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.slice(0, 4).toString() !== '%PDF') throw new Error(`${title} didn't download as a PDF`);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(file, buf);
  }
  const { extractPdfText } = await import('../pdfService.js');
  const pdf = await extractPdfText(file);
  return pdf.pages.map((p) => p.text).join('\n\n');
}

// { chaosBag: { easy, standard, hard, expert }, logSections: [..], scenarios: [..in guide order], notes }
export async function campaignSetup(campaignName) {
  const camp = campaignByName(campaignName);
  if (!camp || !camp.guide.length) return null;
  const cached = readSetups()[camp.key];
  if (cached) return cached;
  if (!reading.has(camp.key)) {
    reading.set(camp.key, (async () => {
      try {
        const texts = [];
        for (const g of camp.guide) texts.push(await guideText(g));
        const text = texts.join('\n\n').replace(/\s+\n/g, '\n').slice(0, 120000);
        const { GoogleGenerativeAI } = await import('../geminiClient.js');
        const config = (await import('../../config.js')).default;
        const model = new GoogleGenerativeAI(config.gemini.apiKey).getGenerativeModel({
          model: 'gemini-2.5-flash',
          generationConfig: {
            responseMimeType: 'application/json', temperature: 0,
            responseSchema: {
              type: 'OBJECT',
              properties: {
                chaosBag: { type: 'OBJECT', properties: Object.fromEntries(['easy', 'standard', 'hard', 'expert'].map((d) => [d, { type: 'ARRAY', items: { type: 'STRING', enum: TOKENS } }])), required: ['easy', 'standard', 'hard', 'expert'] },
                logSections: { type: 'ARRAY', items: { type: 'STRING' } },
                scenarios: { type: 'ARRAY', items: { type: 'STRING' } },
                notes: { type: 'STRING' },
              },
              required: ['chaosBag', 'logSections', 'scenarios'],
            },
          },
        });
        const prompt = `This is the official campaign guide for the Arkham Horror: The Card Game campaign "${camp.name}". From it, give:
- chaosBag: the tokens to put in the chaos bag at the start of the campaign for each difficulty (Easy, Standard, Hard, Expert), one entry per token (e.g. "+1", "+1", "0", "-1", "skull", "skull", "cultist", "tablet", "auto_fail", "elder_sign"). Use: +1, 0, -1 ... -8, skull, cultist, tablet, elder_thing, auto_fail, elder_sign, bless, curse, frost.
- logSections: the headings of this campaign's Campaign Log (e.g. "Campaign Notes", "Cultists We Interrogated", "Cultists Who Got Away"), exactly as the guide names them.
- scenarios: the scenarios and interludes in play order, by name.
- notes: one or two sentences of anything special about keeping this campaign's log.

THE GUIDE:
${text}`;
        const out = JSON.parse((await model.generateContent(prompt)).response.text());
        const all = readSetups();
        all[camp.key] = { ...out, campaign: camp.name, readAt: Date.now() };
        fs.writeFileSync(SETUPS, JSON.stringify(all, null, 1));
        return all[camp.key];
      } finally { reading.delete(camp.key); }
    })());
  }
  return reading.get(camp.key);
}
export const cachedSetup = (campaignName) => { const c = campaignByName(campaignName); return c ? readSetups()[c.key] || null : null; };
