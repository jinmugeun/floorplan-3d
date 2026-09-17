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
];

const norm = k => k.trim().toLowerCase().replace(/\s+/g, '');
const TABLE = new Map();
for (const e of KEYMAP) if (e.action) for (const k of e.keys) TABLE.set(norm(k), e.action);
// 1인칭에서 허용하는 동작(WASD로 걷는 동안 도구·삭제가 끼어들지 않게)
const FP_ALLOWED = new Set(['escape', 'mode:2d', 'mode:plan', 'mode:iso', 'mode:fp']);
const PREVENT = new Set(['undo', 'redo', 'save', 'selectAll', 'settings']);

function tokenOf(ev) {
  const raw = ev.key.toLowerCase();
  const k = raw === 'escape' ? 'esc' : raw === ' ' ? 'space' : raw;
  const ctrl = ev.ctrlKey || ev.metaKey;
  return `${ctrl ? 'ctrl+' : ''}${ctrl && ev.shiftKey ? 'shift+' : ''}${k}`;
}

export function createKeyHandler({ store, ui, view, setTool, setMode, openBackground, deleteSelection, deleteOrTool = () => setTool('delete'), save = null, selectAll = () => {}, openSettings = () => {}, zoomIn = () => {}, zoomOut = () => {}, fit = () => {} }) {
  const run = action => {
    if (action === 'escape') { const u = ui.get(); if (u.fpPick) ui.set({ fpPick: false }); if (u.soloRoom) ui.set({ soloRoom: null }); setTool('select'); return; }
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
    if (['INPUT', 'SELECT', 'TEXTAREA'].includes(ev.target?.tagName)) return;
    const token = tokenOf(ev);
    const modified = ev.ctrlKey || ev.metaKey || ev.altKey;
    const isUndoKey = token === 'ctrl+z';
    if ((!modified || isUndoKey) && view.tool?.onKey?.(ev)) { view.requestRender(); return; } // 도구가 먼저(조합키 중에는 Ctrl+Z만 전달)
    const action = TABLE.get(token);
    if (!action) return; // 표에 없는 키(Ctrl+F 등)는 브라우저에 맡긴다
    if (ev.altKey) return; // Alt 조합은 2B의 제품 단축키가 쓸 자리다
    if (ui.get().mode === 'fp' && !FP_ALLOWED.has(action)) return;
    if (PREVENT.has(action)) ev.preventDefault();
    run(action);
  };
}
