export function createKeyHandler({ store, ui, view, setTool, setMode, openBackground, deleteSelection, save = null }) {
  return ev => {
    if (['INPUT', 'SELECT', 'TEXTAREA'].includes(ev.target?.tagName)) return;
    if (view.tool?.onKey?.(ev)) { view.requestRender(); return; } // 도구가 먼저
    const k = ev.key.toLowerCase();
    if (ev.ctrlKey && k === 'z') { ev.preventDefault(); ev.shiftKey ? store.redo() : store.undo(); return; }
    if (ev.ctrlKey && k === 's') { ev.preventDefault(); if (save) save(); return; }
    if (ev.ctrlKey || ev.metaKey || ev.altKey) return; // 나머지 조합키(Ctrl+F, Ctrl+L, Ctrl+D…)는 브라우저에 맡긴다
    if (k === 'escape') { if (ui.get().fpPick) ui.set({ fpPick: false }); setTool('select'); return; }
    if (['1', '2', '3', '4'].includes(k)) { setMode({ 1: '2d', 2: 'plan', 3: 'iso', 4: 'fp' }[k]); return; }
    if (ui.get().mode === 'fp') return; // 1인칭에서 WASD/QE로 걷는 동안 도구·삭제 단축키가 끼어들지 않게 한다
    if (k === 'f') setTool('room'); else if (k === 'l') setTool('wall'); else if (k === 'd') setTool('delete'); else if (k === 'b') openBackground();
    else if (k === 'e') setTool('guide'); else if (k === 'm') setTool('measure');
    else if (k === 'delete' || k === 'backspace') deleteSelection();
  };
}
