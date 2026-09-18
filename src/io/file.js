import { migrate } from '../state/schema.js';
import { createUiState } from '../state/uistate.js';
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
export function loadAutosave(key = 'kvp.autosave') {
  try { const t = localStorage.getItem(key); return t ? parseProject(t) : null; } // localStorage 접근 자체가 막혀 있을 수도 있다
  catch { return null; }
}
// 배경 이미지가 있으면 캡처 전에 로드를 기다린다(실패해도 캡처는 진행).
const waitForImage = src => new Promise(res => { const img = new Image(); img.onload = img.onerror = () => res(); img.src = src; });
const withTimeout = (p, ms) => Promise.race([p, new Promise(res => setTimeout(res, ms))]); // 이미지가 멈춰도 캡처가 영원히 막히지 않게 한다
export async function capture2D(store, _ui, width = 2000) {
  const bg = store.get().background;
  if (bg?.src) await withTimeout(waitForImage(bg.src), 3000);
  const c = document.createElement('canvas'); c.width = width; c.height = Math.round(width * 0.7);
  Object.defineProperty(c, 'clientWidth', { value: c.width }); Object.defineProperty(c, 'clientHeight', { value: c.height });
  const v = createView2D(c, store, createUiState(), { readonly: true }); v.fit(500); // 새 ui 상태: 선택 강조가 캡처에 남지 않는다
  return new Promise((res, rej) => requestAnimationFrame(() => requestAnimationFrame(() => {
    try { res(c.toDataURL('image/png')); }
    catch (e) { rej(new Error('캡처에 실패했습니다: ' + e.message)); } // 예: 외부 이미지로 오염된 캔버스
    finally { v.destroy(); }
  })));
}
// dataURL(렌더샷·시방서 이미지)을 파일로 내려받는다.
export function downloadDataUrl(filename, dataUrl) {
  const a = document.createElement('a'); a.href = dataUrl; a.download = filename; a.click();
}
