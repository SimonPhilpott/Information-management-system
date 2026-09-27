// Command-line access to the dev ideas queue, for Claude Code's /ideas command
// (.claude/commands/ideas.md). Works straight on the SQLite database, so the server
// doesn't need to be running and no sign-in is needed.
//
//   node pdf-knowledge-base/server/scripts/dev-ideas.js list [all]
//   node pdf-knowledge-base/server/scripts/dev-ideas.js status <id> <new|picked_up|done|dismissed> [note]
//   node pdf-knowledge-base/server/scripts/dev-ideas.js add "<idea text>"
import { listIdeas, addIdea, updateIdea, STATUSES } from '../services/devIdeasService.js';

const [cmd = 'list', ...args] = process.argv.slice(2);
const when = (ms) => new Date(ms).toLocaleString('en-GB', { timeZone: 'Europe/London', dateStyle: 'medium', timeStyle: 'short' });

if (cmd === 'list') {
  const ideas = args[0] === 'all' ? listIdeas() : [...listIdeas({ status: 'new' }), ...listIdeas({ status: 'picked_up' })];
  if (!ideas.length) console.log('No dev ideas waiting.');
  for (const i of ideas) console.log(`#${i.id} [${i.status}] (${i.source}, ${when(i.createdAt)})\n  ${i.text}${i.notes ? `\n  notes: ${i.notes}` : ''}\n`);
} else if (cmd === 'status') {
  const [id, status, ...note] = args;
  if (!STATUSES.includes(status)) { console.error(`Status must be one of ${STATUSES.join(', ')}`); process.exit(1); }
  const i = updateIdea(Number(id), { status, ...(note.length ? { notes: note.join(' ') } : {}) });
  console.log(`#${i.id} is now ${i.status}.`);
} else if (cmd === 'add') {
  const i = addIdea({ text: args.join(' '), source: 'claude' });
  console.log(`Added #${i.id}.`);
} else {
  console.error('Usage: dev-ideas.js list [all] | status <id> <status> [note] | add "<text>"');
  process.exit(1);
}
