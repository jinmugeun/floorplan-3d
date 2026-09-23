export function createStore(initial, { limit = 100 } = {}) {
  let state = initial;
  const past = [];
  const future = [];
  const subs = new Set();
  let tx = null; // 열린 트랜잭션: { snapshot } — 시작 시점의 상태만 들고 있고, 히스토리는 아직 건드리지 않는다(지연 기록)
  const notify = () => subs.forEach(fn => fn(state));
  const pushPast = snapshot => { past.push(snapshot); if (past.length > limit) past.shift(); future.length = 0; };
  // 되돌릴 시작점을 히스토리에 넣는다. 트랜잭션이 열려 있으면 그 시작 상태를 한 단계로 접어 넣고 닫는다.
  const record = () => { if (tx) { pushPast(tx.snapshot); tx = null; } else pushPast(state); };
  // 지금까지의 변경을 한 단계로 확정한다. 아무것도 바뀌지 않았으면 히스토리(redo 포함)를 그대로 둔다.
  const closeTransaction = () => { if (tx && state !== tx.snapshot) pushPast(tx.snapshot); tx = null; };
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
    beginTransaction() { if (!tx) tx = { snapshot: state }; },
    endTransaction: closeTransaction,
    cancelTransaction() { if (!tx) return; state = tx.snapshot; tx = null; notify(); },
    replace(next, { record: rec = true } = {}) { if (rec) record(); state = next; notify(); },
    // 프로젝트 교체(샘플·템플릿·복원·새로 만들기·불러오기)는 **단계가 0개인 동작**이다(§17.3):
    // 되돌릴 길은 되돌리기가 아니라 자동 저장본과 시작 화면이다. replace의 계약은 늘리지 않는다 —
    // "기록하지 않는다"와 "앞의 기록을 버린다"는 뜻이 다르고, 둘을 옵션 하나로 묶으면 자동 저장
    // 복원이 조용히 히스토리를 지우는 쪽으로 새기 쉽다. 부르는 쪽이 두 줄을 나란히 쓴다.
    resetHistory() { tx = null; past.length = 0; future.length = 0; },
    // 열린 트랜잭션이 있으면 먼저 한 단계로 확정하고 나서 되돌린다(드래그 도중 undo → 드래그 시작점으로).
    undo() { closeTransaction(); if (!past.length) return false; future.push(state); state = past.pop(); notify(); return true; },
    redo() { closeTransaction(); if (!future.length) return false; past.push(state); state = future.pop(); notify(); return true; },
    canUndo: () => past.length > 0,
    canRedo: () => future.length > 0,
  };
}
