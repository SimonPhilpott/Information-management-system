// ims_persona_rules.md <-> an editable list of sections.
//
// The file is one intro (the `#` title and opening lines) followed by
// numbered `## N. Title` sections separated by `---`. The editor works on
// sections; saving reassembles the file, renumbering the headings from
// position, so adding/reordering/removing a section keeps the numbers right.
let counter = 0;
export const newId = () => `s${Date.now().toString(36)}${counter++}`;

const H2 = /^##\s+(?:\d+\.\s*)?(.*)$/;

function tidy(lines) {
  const a = [...lines];
  while (a.length && (a[a.length - 1].trim() === '' || a[a.length - 1].trim() === '---')) a.pop();
  while (a.length && a[0].trim() === '') a.shift();
  return a.join('\n');
}

export function parsePersona(markdown) {
  const lines = String(markdown || '').replace(/\r\n/g, '\n').split('\n');
  const intro = [];
  const sections = [];
  let current = null;
  let inFence = false;
  for (const line of lines) {
    if (line.trim().startsWith('```')) inFence = !inFence;
    const m = !inFence && !line.startsWith('###') ? H2.exec(line) : null;
    if (m) {
      current = { id: newId(), title: m[1].trim(), lines: [] };
      sections.push(current);
    } else if (current) {
      current.lines.push(line);
    } else {
      intro.push(line);
    }
  }
  return {
    intro: tidy(intro),
    sections: sections.map((s) => ({ id: s.id, title: s.title, body: tidy(s.lines) })),
  };
}

export function assemblePersona({ intro, sections }) {
  const parts = [];
  if (intro && intro.trim()) parts.push(intro.trim());
  sections.forEach((s, i) => {
    parts.push(`## ${i + 1}. ${(s.title || '').trim() || 'Untitled'}\n\n${(s.body || '').trim()}`);
  });
  return parts.join('\n\n---\n\n') + '\n';
}

// Starting points for new sections.
export const SECTION_TEMPLATES = [
  { label: 'Blank section', title: 'New rules', body: '' },
  {
    label: 'Pronunciation & accent',
    title: 'Pronunciation & accent',
    body: '- Say "..." as "...".\n- Always pronounce "..." like "...".\n- Never ...'
  },
  {
    label: 'Relationship with the user',
    title: 'Relationship with the user',
    body: 'Describe how Ims relates to the user: how close, what they call each other, what is fair game to tease about, and what is off limits.'
  },
  {
    label: 'Grammar & phrasing',
    title: 'Grammar & phrasing',
    body: '- Prefer ... over ...\n- Contractions: ...\n- Sentence rhythm: ...'
  },
  {
    label: 'Phrases to avoid',
    title: 'Phrases to avoid',
    body: '- Never say "..."\n- Never say "..."'
  },
  {
    label: 'Tool-use rule',
    title: 'Tool use',
    body: 'When the user asks about ..., always call the ... tool first, then ...'
  }
];
