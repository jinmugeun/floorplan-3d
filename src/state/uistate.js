export function createUiState() {
  let state = { tool: 'select', mode: '2d', selection: null, hover: null, focusField: null, soloRoom: null, clipboard: [] };
  const subs = new Set();
  return {
    get: () => state,
    set(patch) { state = { ...state, ...patch }; subs.forEach(fn => fn(state)); },
    subscribe(fn) { subs.add(fn); return () => subs.delete(fn); },
  };
}
