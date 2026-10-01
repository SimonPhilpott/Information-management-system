// Command-line access to the dev ideas queue, for Claude Code's /ideas command
// (.claude/commands/ideas.md). Works straight on the SQLite database, so the server
// doesn't need to be running and no sign-in is needed.
//
//   node pdf-knowledge-base/server/scripts/dev-ideas.js list [all]
//   node pdf-knowledge-base/server/scripts/dev-ideas.js status <id> <new|picked_up|done|dismissed> [note]
//   node pdf-knowledge-base/server/scripts/dev-ideas.js add [--category "<category>"] "<idea text>"
import { listIdeas, addIdea, updateIdea, STATUSES, CATEGORIES } from '../services/devIdeasService.js';

const [cmd = 'list', ...args] = process.argv.slice(2);
const when = (ms) => new Date(ms).toLocaleString('en-GB', { timeZone: 'Europe/London', dateStyle: 'medium', timeStyle: 'short' });

if (cmd === 'list') {
  const ideas = args[0] === 'all' ? listIdeas() : [...listIdeas({ status: 'new' }), ...listIdeas({ status: 'picked_up' })];
  if (!ideas.length) console.log('No dev ideas waiting.');
  for (const i of ideas) console.log(`#${i.id} [${i.status}] [${i.category}] (${i.source}, ${when(i.createdAt)})\n  ${i.text}${i.notes ? `\n  notes: ${i.notes}` : ''}\n`);
} else if (cmd === 'status') {
  const [id, status, ...note] = args;
  if (!STATUSES.includes(status)) { console.error(`Status must be one of ${STATUSES.join(', ')}`); process.exit(1); }
  const i = updateIdea(Number(id), { status, ...(note.length ? { notes: note.join(' ') } : {}) });
  console.log(`#${i.id} is now ${i.status}.`);
} else if (cmd === 'add') {
  let category = 'Other';
  const at = args.indexOf('--category');
  if (at !== -1) {
    category = args[at + 1];
    if (!CATEGORIES.includes(category)) { console.error(`Category must be one of: ${CATEGORIES.join(', ')}`); process.exit(1); }
    args.splice(at, 2);
  }
  const i = addIdea({ text: args.join(' '), source: 'claude', category });
  console.log(`Added #${i.id} (${i.category}).`);
} else {
  console.error('Usage: dev-ideas.js list [all] | status <id> <status> [note] | add [--category "<category>"] "<text>"');
  process.exit(1);
}
