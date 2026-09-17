export function createStore(initial, { limit = 100 } = {}) {
  let state = initial;
  const past = [];
  const future = [];
  const subs = new Set();
  const notify = () => subs.forEach(fn => fn(state));
  const record = () => { past.push(state); if (past.length > limit) past.shift(); future.length = 0; };
  return {
    get: () => state,
    subscribe(fn) { subs.add(fn); return () => subs.delete(fn); },
    dispatch(mutate, opts = {}) {
      const next = structuredClone(state);
      mutate(next);
      if (opts.record !== false) record();
      state = next;
      notify();
      return state;
    },
    beginTransaction() { record(); },
    cancelTransaction() { if (!past.length) return; state = past.pop(); notify(); },
    replace(next) { record(); state = next; notify(); },
    undo() { if (!past.length) return false; future.push(state); state = past.pop(); notify(); return true; },
    redo() { if (!future.length) return false; past.push(state); state = future.pop(); notify(); return true; },
    canUndo: () => past.length > 0,
    canRedo: () => future.length > 0,
  };
}
