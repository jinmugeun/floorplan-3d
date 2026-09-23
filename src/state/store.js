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
  // 되돌린·다시 실행한 스냅숏 위에 **활성 층만** 덧쓴다(§17.7 리뷰 I-2). opts.activeFloor는 숫자이거나
  // (설치할 스냅숏) → 인덱스 | null인 함수다: 다시 실행이 데려갈 층은 스냅숏을 봐야 아는데 future를
  // 미리 볼 방법이 없으므로, 판정할 자리가 "설치 직전"인 여기뿐이다. 스냅숏 객체는 히스토리에도
  // 남아 있을 수 있으니 고치지 않고 얕은 사본을 앉힌다. 기록이 아니므로 past·future는 그대로다.
  const withFloor = (snapshot, opts) => {
    const want = typeof opts?.activeFloor === 'function' ? opts.activeFloor(snapshot) : opts?.activeFloor;
    if (!Number.isInteger(want) || want < 0 || want >= (snapshot?.floors?.length ?? 0)) return snapshot;
    return want === (snapshot.activeFloor ?? 0) ? snapshot : { ...snapshot, activeFloor: want };
  };
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
    // 복원이 조용히 히스토리를 지우는 쪽으로 새기 쉽다. 그래서 별개 이름인 swap이 아래에 있다.
    // resetHistory는 그 swap의 조각이자 기존 호출자를 위한 호환 API다(새 교체 경로는 swap을 쓴다).
    // 생산 호출자 0(교체 경로는 전부 swap을 쓴다 — 리뷰 m-11): swap의 조각이자 기존 호환 API라 남긴다.
    resetHistory() { tx = null; past.length = 0; future.length = 0; },
    // 프로젝트 교체는 이 한 줄로 한다(리뷰 I-1). replace(p, { record: false }) + resetHistory()를
    // 나란히 쓰면 **replace의 알림이 아직 남아 있는 옛 past를 보고** 지나가므로, 그 알림으로 그리는
    // ↶/↷ 버튼이 "되돌릴 수 있다"고 거짓말한 채 굳는다(눌러도 아무 일도 없는 죽은 버튼). 교체·비우기·
    // 알림을 원자적으로 묶고 알림은 정확히 한 번 — 구독자가 보는 canUndo·canRedo는 언제나 false다.
    swap(next) { tx = null; state = next; past.length = 0; future.length = 0; notify(); },
    // 열린 트랜잭션이 있으면 먼저 한 단계로 확정하고 나서 되돌린다(드래그 도중 undo → 드래그 시작점으로).
    // opts.activeFloor를 주면 **스냅숏 설치와 활성 층 이동이 한 알림**으로 끝난다(§17.7 리뷰 I-2):
    // 층을 따로 dispatch로 옮기면 알림이 두 번 나가고, 3D는 씬 서명(build.js의 sceneSignature)에
    // activeFloor가 들어 있어 씬을 **두 번** 짓는다 — 그중 첫 번째는 사용자가 곧 떠날 층이라 순수 낭비다.
    undo(opts) { closeTransaction(); if (!past.length) return false; future.push(state); state = withFloor(past.pop(), opts); notify(); return true; },
    redo(opts) { closeTransaction(); if (!future.length) return false; past.push(state); state = withFloor(future.pop(), opts); notify(); return true; },
    canUndo: () => past.length > 0,
    canRedo: () => future.length > 0,
  };
}
