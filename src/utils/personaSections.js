// A persona (or the house rules) Markdown body <-> an editable list of sections.
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

export function parseSectionBody(body) {
  const lines = String(body || '').replace(/\r\n/g, '\n').split('\n');
  const openingLines = [];
  const items = [];
  let currentItem = null;
  let seenItem = false;

  for (const line of lines) {
    // Check if line starts an item: - **Title** Description or * **Title** Description
    const bulletMatch = /^\s*[-*]\s+(.*)$/.exec(line);
    if (bulletMatch) {
      seenItem = true;
      const rest = bulletMatch[1].trim();
      const boldMatch = /^\*\*(.+?)\*\*\s*(.*)$/.exec(rest);
      if (boldMatch) {
        currentItem = {
          id: newId(),
          title: boldMatch[1].trim(),
          description: boldMatch[2].trim()
        };
      } else {
        currentItem = {
          id: newId(),
          title: '',
          description: rest
        };
      }
      items.push(currentItem);
    } else if (seenItem && currentItem) {
      // Continuation line for current item (preserving multi-line descriptions/dialogue)
      if (line.trim()) {
        currentItem.description = currentItem.description
          ? `${currentItem.description}\n${line.trim()}`
          : line.trim();
      }
    } else {
      openingLines.push(line);
    }
  }

  return {
    opening: tidy(openingLines),
    items
  };
}

export function assembleSectionBody(section) {
  const parts = [];
  const opening = (section.opening || '').trim();
  if (opening) {
    parts.push(opening);
  }

  if (Array.isArray(section.items) && section.items.length > 0) {
    const itemLines = section.items.map((it) => {
      const t = (it.title || '').trim();
      const d = (it.description || '').trim();
      if (t && d) return `- **${t}** ${d}`;
      if (t) return `- **${t}**`;
      if (d) return `- ${d}`;
      return '';
    }).filter(Boolean);

    if (itemLines.length > 0) {
      parts.push(itemLines.join('\n'));
    }
  } else if (!opening && section.body) {
    // Fallback if raw body is present
    parts.push(section.body.trim());
  }

  return parts.join('\n\n');
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
    sections: sections.map((s) => {
      const rawBody = tidy(s.lines);
      const parsed = parseSectionBody(rawBody);
      return {
        id: s.id,
        title: s.title,
        opening: parsed.opening,
        items: parsed.items,
        body: rawBody
      };
    }),
  };
}

export function assemblePersona({ intro, sections }) {
  const parts = [];
  if (intro && intro.trim()) parts.push(intro.trim());
  (sections || []).forEach((s, i) => {
    const bodyText = (Array.isArray(s.items) || s.opening !== undefined)
      ? assembleSectionBody(s)
      : (s.body || '').trim();
    parts.push(`## ${i + 1}. ${(s.title || '').trim() || 'Untitled'}\n\n${bodyText.trim()}`);
  });
  return parts.join('\n\n---\n\n') + '\n';
}

// Starting points for new sections.
export const SECTION_TEMPLATES = [
  { label: 'Blank section', title: 'New rules', opening: '', items: [] },
  {
    label: 'Pronunciation & accent',
    title: 'Pronunciation & accent',
    opening: 'Rules for how Ims pronounces specific words and phrases.',
    items: [
      { id: newId(), title: 'Say "..." as "...":', description: 'Always pronounce "..." like "...".' },
      { id: newId(), title: 'Never say:', description: 'Avoid using terms like "..." in casual replies.' }
    ]
  },
  {
    label: 'Relationship with the user',
    title: 'Relationship with the user',
    opening: 'Describe how Ims relates to the user: how close, what they call each other, what is fair game to tease about, and what is off limits.',
    items: [
      { id: newId(), title: 'Closeness:', description: 'The user is a trusted friend and colleague.' },
      { id: newId(), title: 'Teasing & banter:', description: 'Mild teasing is encouraged, but stay supportive.' }
    ]
  },
  {
    label: 'Grammar & phrasing',
    title: 'Grammar & phrasing',
    opening: 'Sentence structure and preferred phrasing patterns.',
    items: [
      { id: newId(), title: 'British English only:', description: 'Use British spellings and natural idioms from your own dialect.' },
      { id: newId(), title: 'Contractions:', description: 'Use natural spoken contractions like "let\'s" and "give us".' }
    ]
  },
  {
    label: 'Phrases to avoid',
    title: 'Phrases to avoid',
    opening: 'Corporate or robotic filler expressions that Ims must never utter.',
    items: [
      { id: newId(), title: 'No customer service speak:', description: 'Never say "How may I assist you today?" or "I\'d be happy to help".' },
      { id: newId(), title: 'No AI disclaimers:', description: 'Never refer to yourself as an artificial language model.' }
    ]
  },
  {
    label: 'Tool-use rule',
    title: 'Tool use',
    opening: 'Guidelines on when to invoke tools vs replying directly.',
    items: [
      { id: newId(), title: 'Weather queries:', description: 'Call the weather tool first, then report findings in your own voice.' }
    ]
  }
];
