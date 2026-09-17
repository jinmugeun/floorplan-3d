export function createStore(initial, { limit = 100 } = {}) {
  let state = initial;
  const past = [];
  const future = [];
  const subs = new Set();
  let tx = null; // 열린 트랜잭션: { snapshot, pastLength }
  const notify = () => subs.forEach(fn => fn(state));
  // 트랜잭션이 열려 있으면 beginTransaction이 이미 시작 상태를 기록했으므로 한 단계로 접는다.
  const record = () => { if (tx) { tx = null; return; } past.push(state); if (past.length > limit) past.shift(); future.length = 0; };
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
    beginTransaction() { if (tx) return; const pastLength = past.length; record(); tx = { snapshot: state, pastLength }; },
    endTransaction() { tx = null; }, // 지금까지의 변경을 한 단계로 확정한다
    cancelTransaction() {
      if (!tx) return;
      past.length = tx.pastLength;
      if (past[past.length - 1] === tx.snapshot) past.pop(); // limit 초과로 shift된 경우
      state = tx.snapshot; tx = null; notify();
    },
    replace(next) { record(); state = next; notify(); },
    undo() { if (!past.length) return false; tx = null; future.push(state); state = past.pop(); notify(); return true; },
    redo() { if (!future.length) return false; tx = null; past.push(state); state = future.pop(); notify(); return true; },
    canUndo: () => past.length > 0,
    canRedo: () => future.length > 0,
  };
}
