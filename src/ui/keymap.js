// 단축키 한 곳: 핸들러와 설정 > 단축키 표가 같은 표를 읽는다.
// action이 null인 항목은 표시 전용(마우스 조작, 1인칭 이동 등).
export const KEYMAP = [
  { group: '일반', label: '선택 모드 / 도구 종료', keys: ['Esc'], action: 'escape' },
  { group: '일반', label: '실행 취소', keys: ['Ctrl+Z'], action: 'undo' },
  { group: '일반', label: '다시 실행', keys: ['Ctrl+Shift+Z'], action: 'redo' },
  { group: '일반', label: '저장', keys: ['Ctrl+S'], action: 'save' },
  { group: '일반', label: '삭제', keys: ['Delete', 'Backspace'], action: 'delete' },
  { group: '일반', label: '전체 선택', keys: ['Ctrl+A'], action: 'selectAll' },
  { group: '일반', label: '설정', keys: ['Ctrl+,'], action: 'settings' },
  { group: '도구', label: '벽 그리기', keys: ['L'], action: 'tool:wall' },
  { group: '도구', label: '방 그리기', keys: ['F'], action: 'tool:room' },
  { group: '도구', label: '삭제 도구 / 선택 삭제', keys: ['D'], action: 'deleteOrTool' },
  { group: '도구', label: '보조선', keys: ['E'], action: 'tool:guide' },
  { group: '도구', label: '측정', keys: ['M'], action: 'tool:measure' },
  { group: '도구', label: '도면 이미지 업로드', keys: ['B'], action: 'background' },
  { group: '뷰', label: '2D 도면', keys: ['1'], action: 'mode:2d' },
  { group: '뷰', label: '평면 뷰어', keys: ['2'], action: 'mode:plan' },
  { group: '뷰', label: 'ISO 3D', keys: ['3'], action: 'mode:iso' },
  { group: '뷰', label: '일인칭', keys: ['4'], action: 'mode:fp' },
  { group: '뷰', label: '도면 확대', keys: ['+'], action: 'zoomIn' },
  { group: '뷰', label: '도면 축소', keys: ['-'], action: 'zoomOut' },
  { group: '뷰', label: '화면 맞추기', keys: ['0'], action: 'fit' },
  { group: '선택', label: '다중 선택 토글', keys: ['Shift+클릭'], action: null },
  { group: '선택', label: '영역 선택', keys: ['Shift+드래그'], action: null },
  { group: '일인칭', label: '이동', keys: ['W A S D'], action: null },
  { group: '일인칭', label: '높이', keys: ['Q E'], action: null },
  { group: '제품', label: '이동 10mm / 100mm', keys: ['방향키', 'Shift+방향키'], action: null },
  { group: '제품', label: '90° 회전', keys: ['Q'], action: null },
  { group: '제품', label: '스냅 임시 해제', keys: ['Ctrl+드래그'], action: null },
  { group: '제품', label: '좌우 반전', keys: ['Alt+H'], action: null },
  { group: '제품', label: '상하 반전', keys: ['Alt+V'], action: null },
  { group: '제품', label: '상대이동', keys: ['Alt+R'], action: null },
  { group: '제품', label: '직선 / 원형 / 회전 배열 복사', keys: ['Alt+A', 'Alt+C', 'Alt+X'], action: null },
  { group: '제품', label: '복사 / 붙여넣기', keys: ['Ctrl+C', 'Ctrl+V'], action: null },
  { group: '제품', label: '숨김 / 잠금', keys: ['Ctrl+H', 'Ctrl+L'], action: null },
  { group: '제품', label: '그룹 / 해제', keys: ['Ctrl+G', 'Ctrl+Shift+G'], action: null },
];

const norm = k => k.trim().toLowerCase().replace(/\s+/g, '');
export const TABLE = new Map();
for (const e of KEYMAP) if (e.action) for (const k of e.keys) TABLE.set(norm(k), e.action);
// 1인칭에서 허용하는 동작(WASD로 걷는 동안 도구·삭제가 끼어들지 않게)
export const FP_ALLOWED = new Set(['escape', 'mode:2d', 'mode:plan', 'mode:iso', 'mode:fp']);
export const PREVENT = new Set(['undo', 'redo', 'save', 'selectAll', 'settings']);

// 아이템 조합키. 선택이 없으면(붙여넣기만 예외) 브라우저에 맡긴다.
// 2A의 KEYMAP/TABLE은 Alt 조합을 담지 않으므로(그 자리를 2B에 비워 뒀다) 여기서만 처리한다.
function itemCombo(ev, k, a) {
  const has = ((a.ids?.() ?? []).length) > 0;
  if (ev.altKey && !ev.ctrlKey && !ev.metaKey) {
    if (!has) return false;
    if (k === 'h') { a.mirror?.('h'); return true; }
    if (k === 'v') { a.mirror?.('v'); return true; }
    if (k === 'r') { a.relativeMove?.(); return true; }
    if (k === 'a') { a.arrayCopy?.('linear'); return true; }
    if (k === 'c') { a.arrayCopy?.('circular'); return true; }
    if (k === 'x') { a.arrayCopy?.('rotate'); return true; }
    return false;
  }
  if (ev.ctrlKey || ev.metaKey) {
    // 붙여넣기는 선택이 없어도 되지만 클립보드가 비면 브라우저에 맡긴다(아무것도 안 하고 키를 삼키지 않게).
    if (k === 'v') { if (!(a.canPaste?.() ?? false)) return false; a.paste?.(); return true; }
    if (!has) return false;
    if (k === 'c') { a.copy?.(); return true; }
    if (k === 'h') { a.toggleHidden?.(); return true; }
    if (k === 'l') { a.toggleLocked?.(); return true; }
    if (k === 'g') { ev.shiftKey ? a.ungroup?.() : a.group?.(); return true; }
  }
  return false;
}

export function tokenOf(ev) {
  const raw = ev.key.toLowerCase();
  const k = raw === 'escape' ? 'esc' : raw === ' ' ? 'space' : raw;
  const ctrl = ev.ctrlKey || ev.metaKey;
  return `${ctrl ? 'ctrl+' : ''}${ctrl && ev.shiftKey ? 'shift+' : ''}${k}`;
}

export function createKeyHandler({ store, ui, view, setTool, setMode, openBackground, deleteSelection, deleteOrTool = () => setTool('delete'), save = null, selectAll = () => {}, openSettings = () => {}, zoomIn = () => {}, zoomOut = () => {}, fit = () => {}, itemActions = {} }) {
  const run = action => {
    if (action === 'escape') {
      const u = ui.get();
      if (u.fpPick || u.soloRoom || u.selection || u.splitWall) ui.set({ fpPick: false, soloRoom: null, selection: null, splitWall: false });
      setTool('select'); return;
    }
    if (action === 'undo') { store.undo(); return; }
    if (action === 'redo') { store.redo(); return; }
    if (action === 'save') { if (save) save(); return; }
    if (action === 'delete') { deleteSelection(); return; }
    if (action === 'deleteOrTool') { deleteOrTool(); return; }
    if (action === 'selectAll') { selectAll(); return; }
    if (action === 'settings') { openSettings(); return; }
    if (action === 'background') { openBackground(); return; }
    if (action === 'zoomIn') { zoomIn(); return; }
    if (action === 'zoomOut') { zoomOut(); return; }
    if (action === 'fit') { fit(); return; }
    if (action.startsWith('tool:')) { setTool(action.slice(5)); return; }
    if (action.startsWith('mode:')) setMode(action.slice(5));
  };
  return ev => {
    if (ev.isComposing || ev.keyCode === 229) return; // 한글 입력 조합 중인 키는 단축키가 아니다
    if (['INPUT', 'SELECT', 'TEXTAREA'].includes(ev.target?.tagName)) return;
    const token = tokenOf(ev);
    const modified = ev.ctrlKey || ev.metaKey || ev.altKey;
    const isUndoKey = token === 'ctrl+z' || token === 'ctrl+shift+z'; // 다시 실행도 드래그 취소로 도구에 먼저 준다
    const fp = ui.get().mode === 'fp';
    const k = ev.key.toLowerCase();
    if (!fp && (!modified || isUndoKey) && view.tool?.onKey?.(ev)) { ev.preventDefault(); view.requestRender(); return; } // 도구가 먼저(조합키 중에는 Ctrl+Z만 전달). 도구가 먹은 키는 브라우저 기본 동작(방향키 스크롤 등)도 막는다. 1인칭에서는 도구에 키를 주지 않는다
    if (!fp && itemCombo(ev, k, itemActions)) { ev.preventDefault(); return; }
    const action = TABLE.get(token);
    if (!action) return; // 표에 없는 키(Ctrl+F 등)는 브라우저에 맡긴다
    if (ev.altKey) return; // Alt 조합은 2B의 제품 단축키가 쓸 자리다
    if (ui.get().mode === 'fp' && !FP_ALLOWED.has(action)) return;
    if (PREVENT.has(action)) ev.preventDefault();
    run(action);
  };
}
