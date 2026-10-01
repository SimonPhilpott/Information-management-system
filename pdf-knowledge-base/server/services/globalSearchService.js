import db from '../db/database.js';
import { getUpcomingEvents } from './calendarService.js';

// Global search for the Command Palette (Ctrl+K): one query across memories, tasks, lists, campaign
// chronicles, dev ideas, recordings, the calendar and the PDF library, grouped, each result carrying
// where to go - a page path with #anchor the page scrolls to and highlights, or a PDF to open at a page.

const PER_GROUP = 6;
const clip = (s, n = 140) => { const t = String(s || '').replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, n - 1)}…` : t; };
// a snippet around the first match, so the reason for the hit is visible
function around(text, q, n = 140) {
  const t = String(text || '').replace(/\s+/g, ' ');
  const i = t.toLowerCase().indexOf(q.toLowerCase());
  if (i < 0) return clip(t, n);
  const start = Math.max(0, i - 50);
  return `${start ? '…' : ''}${clip(t.slice(start), n)}`;
}
const like = (q) => `%${q.replace(/[%_]/g, '')}%`;
const safe = (fn) => { try { return fn(); } catch (err) { console.warn('[Search]', err.message); return []; } };

export async function globalSearch(query) {
  const q = String(query || '').trim();
  if (q.length < 2) return { query: q, groups: [] };
  const L = like(q);
  const groups = [];
  const add = (key, label, items) => { if (items.length) groups.push({ key, label, items: items.slice(0, PER_GROUP), more: Math.max(0, items.length - PER_GROUP) }); };

  add('memories', 'Memories', safe(() => db.prepare('SELECT id, fact, category FROM ims_memories WHERE deleted_at IS NULL AND (fact LIKE ? OR category LIKE ?) ORDER BY created_at DESC LIMIT 20').all(L, L)
    .map((m) => ({ id: `memory-${m.id}`, title: clip(m.fact, 90), detail: m.category || 'Memory', path: `/ims/memories#memory-${m.id}` }))));

  add('tasks', 'Background tasks', safe(() => db.prepare('SELECT id, title, request, summary, status FROM tasks WHERE title LIKE ? OR request LIKE ? OR summary LIKE ? OR result LIKE ? ORDER BY created_at DESC LIMIT 20').all(L, L, L, L)
    .map((t) => ({ id: `task-${t.id}`, title: clip(t.title || t.request, 90), detail: `${t.status} · ${around(t.summary || t.request, q, 90)}`, path: `/ims/tasks#task-${t.id}` }))));

  add('lists', 'Lists', safe(() => db.prepare('SELECT id, list_name, item FROM list_items WHERE item LIKE ? OR list_name LIKE ? ORDER BY created_at DESC LIMIT 20').all(L, L)
    .map((x) => ({ id: `list-${x.id}`, title: x.item, detail: `On your ${x.list_name} list - ask Ims to read it`, path: null }))));

  add('chronicles', 'Campaign chronicles', safe(() => {
    const out = [];
    for (const c of db.prepare('SELECT id, game, name, chronicle FROM campaigns WHERE chronicle LIKE ? OR name LIKE ?').all(L, L)) {
      let ch = {};
      try { ch = JSON.parse(c.chronicle || '{}'); } catch { /* not a chronicle yet */ }
      const game = c.game === 'ahlcg' ? 'ahlcg' : 'lotr';
      for (const [scenario, chapter] of Object.entries(ch || {})) {
        const text = [chapter?.title, chapter?.summary, ...(chapter?.paragraphs || [])].join(' ');
        if (`${scenario} ${text}`.toLowerCase().includes(q.toLowerCase())) {
          out.push({ id: `chronicle-${c.id}-${scenario}`, title: `${chapter?.title || scenario}`, detail: `${c.name} · ${scenario} · ${around(text, q, 100)}`, path: `/campaigns/${game}/${c.id}#chronicle-${encodeURIComponent(scenario)}` });
        }
      }
      if (!out.some((o) => o.id.startsWith(`chronicle-${c.id}-`)) && c.name.toLowerCase().includes(q.toLowerCase())) {
        out.push({ id: `campaign-${c.id}`, title: c.name, detail: game === 'ahlcg' ? 'Arkham Horror campaign' : 'Lord of the Rings campaign', path: `/campaigns/${game}/${c.id}` });
      }
    }
    return out;
  }));

  add('ideas', 'Dev ideas', safe(() => db.prepare('SELECT id, text, status, category FROM dev_ideas WHERE text LIKE ? OR notes LIKE ? OR category LIKE ? ORDER BY CASE status WHEN \'new\' THEN 0 WHEN \'picked_up\' THEN 1 ELSE 2 END, created_at DESC LIMIT 20').all(L, L, L)
    .map((i) => ({ id: `idea-${i.id}`, title: clip(i.text.split('\n')[0], 90), detail: `#${i.id} · ${i.status.replace('_', ' ')} · ${i.category || 'Other'}`, path: `/ims/devideas#idea-${i.id}` }))));

  add('recordings', 'Recordings', safe(() => {
    const rows = db.prepare(`SELECT r.id, r.with_whom, r.started_at, r.summary,
        (SELECT text FROM recording_lines l WHERE l.recording_id = r.id AND l.text LIKE ? LIMIT 1) AS line
      FROM recordings r WHERE r.deleted_at IS NULL AND (r.with_whom LIKE ? OR r.summary LIKE ? OR EXISTS (SELECT 1 FROM recording_lines l WHERE l.recording_id = r.id AND l.text LIKE ?))
      ORDER BY r.started_at DESC LIMIT 20`).all(L, L, L, L);
    return rows.map((r) => ({
      id: `recording-${r.id}`, title: `${r.with_whom ? `With ${r.with_whom}` : 'Recording'} - ${new Date(r.started_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`,
      detail: around(r.line || r.summary, q, 110), path: `/ims/recordings#recording-${r.id}`,
    }));
  }));

  try {
    const events = (await getUpcomingEvents(60)).filter((e) => `${e.title} ${e.location || ''}`.toLowerCase().includes(q.toLowerCase()));
    add('calendar', 'Calendar', events.map((e) => ({
      id: `event-${e.calendarId}-${e.id}`, title: e.title,
      detail: `${new Date(`${e.date}T12:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}${e.time ? ` at ${e.time}` : ''}${e.location ? ` · ${e.location}` : ''}`,
      path: `/ims/calendar#event-${e.id}`, external: e.link || null,
    })));
  } catch (err) { console.warn('[Search] calendar:', err.message); }

  add('library', 'PDF library', safe(() => {
    const docs = db.prepare('SELECT id, drive_file_id, filename, subject FROM documents WHERE filename LIKE ? OR subject LIKE ? LIMIT 10').all(L, L)
      .map((d) => ({ id: `doc-${d.id}`, title: d.filename.replace(/\.pdf$/i, ''), detail: d.subject || 'Library', pdf: { driveFileId: d.drive_file_id, page: 1, filename: d.filename } }));
    const toc = db.prepare(`SELECT t.id, t.title, t.page_number, d.drive_file_id, d.filename FROM toc_items t JOIN documents d ON d.id = t.document_id WHERE t.title LIKE ? LIMIT 12`).all(L)
      .map((t) => ({ id: `toc-${t.id}`, title: t.title, detail: `${t.filename.replace(/\.pdf$/i, '')} · page ${t.page_number || 1}`, pdf: { driveFileId: t.drive_file_id, page: t.page_number || 1, filename: t.filename } }));
    const topics = db.prepare(`SELECT t.id, t.topic, t.description, d.drive_file_id, d.filename FROM topics t JOIN documents d ON d.id = t.document_id WHERE t.topic LIKE ? OR t.description LIKE ? LIMIT 8`).all(L, L)
      .map((t) => ({ id: `topic-${t.id}`, title: t.topic, detail: `${t.filename.replace(/\.pdf$/i, '')} · ${around(t.description, q, 80)}`, pdf: { driveFileId: t.drive_file_id, page: 1, filename: t.filename } }));
    return [...docs, ...toc, ...topics];
  }));

  return { query: q, groups, total: groups.reduce((n, g) => n + g.items.length, 0) };
}
