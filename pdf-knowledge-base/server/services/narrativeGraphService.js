import db from '../db/database.js';
import crypto from 'crypto';

// Episodic Narrative Graph (Long-Horizon Life Memory)
// Synthesises life events, campaign highlights, running journeys, homebrews, and
// conversations into causally linked episodic narrative arcs that persist across weeks and months.

const genId = (prefix) => `${prefix}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

export function createArc({ title, theme = 'personal', arcSummary = '', startDate = null }) {
  const id = genId('arc');
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO narrative_arcs (id, title, theme, status, episode_count, start_date, last_active, arc_summary)
    VALUES (?, ?, ?, 'active', 0, ?, ?, ?)
  `).run(id, title, theme, startDate || now, now, arcSummary);
  return getArc(id);
}

export function getArc(id) {
  return db.prepare('SELECT * FROM narrative_arcs WHERE id = ?').get(id) || null;
}

export function getArcs(status = 'active') {
  if (status === 'all') {
    return db.prepare('SELECT * FROM narrative_arcs ORDER BY last_active DESC').all();
  }
  return db.prepare('SELECT * FROM narrative_arcs WHERE status = ? ORDER BY last_active DESC').all(status);
}

export function recordEpisode({
  arcId = null,
  title,
  summary,
  category = 'general',
  emotionalValence = 'neutral',
  significance = 3,
  startedAt = null,
  endedAt = null,
  keyEntities = [],
  lessonsLearned = '',
  precededByEpisodeId = null
}) {
  const id = genId('ep');
  const now = new Date().toISOString();
  const entitiesStr = JSON.stringify(Array.isArray(keyEntities) ? keyEntities : [keyEntities]);

  db.prepare(`
    INSERT INTO narrative_episodes (
      id, arc_id, title, summary, category, emotional_valence, significance,
      started_at, ended_at, key_entities, lessons_learned, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, arcId || null, title, summary, category, emotionalValence,
    Number(significance) || 3, startedAt || now, endedAt || now,
    entitiesStr, lessonsLearned || '', now
  );

  if (arcId) {
    db.prepare(`
      UPDATE narrative_arcs 
      SET episode_count = episode_count + 1, last_active = ?
      WHERE id = ?
    `).run(now, arcId);
  }

  if (precededByEpisodeId) {
    linkEpisodes(precededByEpisodeId, id, 'preceded_by', 1.0);
  }

  return getEpisode(id);
}

export function getEpisode(id) {
  const ep = db.prepare('SELECT * FROM narrative_episodes WHERE id = ?').get(id);
  if (!ep) return null;
  try { ep.key_entities = JSON.parse(ep.key_entities || '[]'); } catch { ep.key_entities = []; }
  return ep;
}

export function getEpisodes({ limit = 50, arcId = null, category = null } = {}) {
  let query = 'SELECT * FROM narrative_episodes WHERE 1=1';
  const params = [];
  if (arcId) {
    query += ' AND arc_id = ?';
    params.push(arcId);
  }
  if (category && category !== 'all') {
    query += ' AND category = ?';
    params.push(category);
  }
  query += ' ORDER BY started_at DESC LIMIT ?';
  params.push(Number(limit) || 50);

  const rows = db.prepare(query).all(...params);
  return rows.map((r) => {
    try { r.key_entities = JSON.parse(r.key_entities || '[]'); } catch { r.key_entities = []; }
    return r;
  });
}

export function linkEpisodes(sourceId, targetId, relationType = 'caused_by', weight = 1.0) {
  db.prepare(`
    INSERT INTO narrative_links (source_episode_id, target_episode_id, relation_type, weight)
    VALUES (?, ?, ?, ?)
  `).run(sourceId, targetId, relationType, weight);
  return { success: true };
}

export function getNarrativeGraph({ limitArcs = 10, limitEpisodes = 30 } = {}) {
  const arcs = db.prepare('SELECT * FROM narrative_arcs ORDER BY last_active DESC LIMIT ?').all(limitArcs);
  const episodes = getEpisodes({ limit: limitEpisodes });
  const links = db.prepare('SELECT * FROM narrative_links ORDER BY created_at DESC LIMIT 100').all();
  return { arcs, episodes, links };
}

// Produces a synthesized narrative memory digest for Ims's prompt injection
export function getNarrativeSummaryForIms() {
  const arcs = getArcs('active').slice(0, 5);
  const recentEpisodes = getEpisodes({ limit: 6 });

  if (!arcs.length && !recentEpisodes.length) {
    return 'No active narrative arcs recorded yet.';
  }

  const arcLines = arcs.map((a) => `- [${a.title} (${a.theme})]: ${a.arc_summary || `${a.episode_count} episodes recorded`}`).join('\n');
  const epLines = recentEpisodes.map((e) => `- ${e.title} (${e.category}, ${e.emotional_valence}): ${e.summary}${e.lessons_learned ? ` [Lesson: ${e.lessons_learned}]` : ''}`).join('\n');

  return `ACTIVE LIFE ARCS:\n${arcLines}\n\nRECENT LIFE EPISODES:\n${epLines}`;
}

// Seed foundational life arcs if database is empty
export function seedDefaultArcsIfEmpty() {
  const count = db.prepare('SELECT count(*) as c FROM narrative_arcs').get().c;
  if (count > 0) return;

  const arcs = [
    {
      title: 'T1D Endurance & Running Journey',
      theme: 'health_fitness',
      arcSummary: 'Optimising blood glucose, carb hydration strategies, and endurance stamina across long training runs.'
    },
    {
      title: 'Middle-earth & Arkham Chronicles',
      theme: 'gaming',
      arcSummary: 'Epic card campaign progression with Daniel playing LOTR LCG and Arkham Horror campaigns.'
    },
    {
      title: 'Artisan Homebrew & Meadery',
      theme: 'craft',
      arcSummary: 'Iterative crafting of small-batch meads, braggots, and fruit ferments with calibrated hydrometer readings.'
    },
    {
      title: 'IMS Companion Architecture',
      theme: 'engineering',
      arcSummary: 'Building Ims into a ubiquitous Yorkshire voice companion across desk hardware, web, and mobile edge dock.'
    }
  ];

  for (const arc of arcs) {
    createArc(arc);
  }
}

try {
  seedDefaultArcsIfEmpty();
} catch (err) {
  console.warn('[NarrativeGraph] Seed notice:', err.message);
}
