export function createUiState() {
  // firstRoomHint: 온보딩을 닫은 직후 한 번 켜지는 첫 방 유도(§16.12). 저장하지 않는 화면 상태다.
  let state = { tool: 'select', mode: '2d', selection: null, hover: null, focusField: null, soloRoom: null, clipboard: [], showHidden: true, matPick: null, dragProduct: null, firstRoomHint: false };
  const subs = new Set();
  return {
    get: () => state,
    set(patch) { state = { ...state, ...patch }; subs.forEach(fn => fn(state)); },
    subscribe(fn) { subs.add(fn); return () => subs.delete(fn); },
  };
}
