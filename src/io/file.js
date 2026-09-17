import { migrate } from '../state/schema.js';
import { createView2D } from '../view2d/view2d.js';

export const serializeProject = state => JSON.stringify(state);
export function parseProject(text) { let obj; try { obj = JSON.parse(text); } catch { throw new Error('JSON 파일이 아닙니다'); } return migrate(obj); }
export function downloadText(filename, text) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' })); a.download = filename; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
export const readTextFile = file => file.text();
export function filenameFor(state) {
  const d = new Date(), p = n => String(n).padStart(2, '0');
  return `${state.name || '프로젝트'}_${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}.json`;
}
export function startAutosave(store, { key = 'kvp.autosave', intervalMs = 300000, onSaved = () => {} } = {}) {
  let dirty = false;
  const save = () => { if (!dirty) return; try { localStorage.setItem(key, serializeProject(store.get())); dirty = false; onSaved(new Date()); } catch (e) { console.warn('자동 저장 실패', e); } };
  const unsub = store.subscribe(() => { dirty = true; });
  const timer = setInterval(save, intervalMs);
  const onUnload = () => save(); window.addEventListener('beforeunload', onUnload);
  return { stop() { clearInterval(timer); unsub(); window.removeEventListener('beforeunload', onUnload); }, saveNow: save };
}
export function loadAutosave(key = 'kvp.autosave') { const t = localStorage.getItem(key); if (!t) return null; try { return parseProject(t); } catch { return null; } }
export function capture2D(store, ui, width = 2000) {
  const c = document.createElement('canvas'); c.width = width; c.height = Math.round(width * 0.7);
  Object.defineProperty(c, 'clientWidth', { value: c.width }); Object.defineProperty(c, 'clientHeight', { value: c.height });
  const v = createView2D(c, store, ui, { readonly: true }); v.fit(500);
  return new Promise(res => requestAnimationFrame(() => requestAnimationFrame(() => { const url = c.toDataURL('image/png'); v.destroy(); res(url); })));
}
