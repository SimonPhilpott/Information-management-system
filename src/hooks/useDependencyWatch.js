import { useCallback, useEffect, useState } from 'react';

// The dependency watch's last result and whether a check is running (Code Repo > Dependencies).
export function useDependencyWatch() {
  const [state, setState] = useState(null);
  const load = useCallback(() => fetch('/api/code-repo/dependencies').then((r) => r.json()).then((j) => j.success && setState(j)).catch(() => {}), []);
  useEffect(() => { load(); }, [load]);
  return [state, load];
}
