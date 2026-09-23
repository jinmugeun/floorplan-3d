export function createUiState() {
  // firstRoomHint: 온보딩을 닫은 직후 한 번 켜지는 첫 방 유도(§16.12). 저장하지 않는 화면 상태다.
  // openEnds: DXF 가져오기가 남긴 "벽이 이어지지 않은 곳"(§18.6). { pts, index }이고 index는
  // [보기]를 누른 횟수다. firstRoomHint와 같은 자리 — 저장하지 않는 화면 상태다.
  let state = { tool: 'select', mode: '2d', selection: null, hover: null, focusField: null, soloRoom: null, clipboard: [], showHidden: true, matPick: null, dragProduct: null, firstRoomHint: false, openEnds: null };
  const subs = new Set();
  return {
    get: () => state,
    set(patch) { state = { ...state, ...patch }; subs.forEach(fn => fn(state)); },
    subscribe(fn) { subs.add(fn); return () => subs.delete(fn); },
  };
}
