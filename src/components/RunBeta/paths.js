// Run planner: its addresses. /ims/runplanner/<screen>, /routes/<id> for an open route and /learning/<activity id>
// for a run looked back on. (Built as a beta at /ims/runplanner-beta; those addresses still open the same screens.)
export const BASE = '/ims/runplanner';
export const NAV = [['today', 'Today', 'sun'], ['routes', 'Routes', 'route'], ['runs', 'Runs', 'run'], ['learning', 'Learning', 'school'], ['rulebook', 'Rulebook', 'book']];
const DESTS = NAV.map(([k]) => k);

export function parsePath(p) {
  const rest = String(p || '').replace(/^\/ims\/runplanner(-beta)?/, '').replace(/\/+$/, '');
  const m = rest.match(/^\/(routes|learning)\/(\d+)/);
  if (m) return { dest: m[1], id: Number(m[2]) };
  const d = (rest.match(/^\/([a-z]+)/) || [])[1];
  return { dest: DESTS.includes(d) ? d : 'today', id: null };
}
export const pathFor = ({ dest, id }) => ((dest === 'routes' || dest === 'learning') && id ? `${BASE}/${dest}/${id}` : dest && dest !== 'today' ? `${BASE}/${dest}` : BASE);
