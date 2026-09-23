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
// 인쇄 본문 폭(§16.11). 감사가 A4에서 실측한 765 px을 기준 눈금으로 삼는다(≈104 dpi):
// 용지 폭에서 좌우 여백 12 mm씩을 뺀 mm에 이 눈금을 곱한다. 가로 방향은 긴 변이 폭이 된다.
export const PRINT_PX_PER_MM = 765 / 186;
const PAPER_MM = { A4: [210, 297], A3: [297, 420] };
export const printBodyPx = (paper = 'A4', landscape = false) => {
  const [short, long] = PAPER_MM[paper] ?? PAPER_MM.A4;
  return Math.round(((landscape ? long : short) - 24) * PRINT_PX_PER_MM);
};

// opts가 숫자면 예전 뜻(비트맵 폭 = 논리 폭, dpr 1)이다. 객체면 **인쇄 배율** 캡처다:
// 논리 크기(clientWidth)를 용지 본문 폭으로 두어 라벨이 12 px로 그려지게 하고, 비트맵만
// ratio배로 키워 선명하게 만든다(§16.11 · 감사 §7: 2000 px 캡처가 765 px에 눌려 글자가 4~5 px).
export async function capture2D(store, _ui, opts = 2000) {
  const { width = 2000, cssWidth = null, ratio = 2, aspect = 0.7 } = typeof opts === 'number' ? { width: opts } : (opts ?? {});
  const bg = store.get().background;
  if (bg?.src) await withTimeout(waitForImage(bg.src), 3000);
  const logicalW = Math.max(1, Math.round(cssWidth ?? width));
  const logicalH = Math.round(logicalW * aspect);
  const dpr = cssWidth ? Math.max(1, ratio) : 1;
  const c = document.createElement('canvas');
  c.width = Math.round(logicalW * dpr); c.height = Math.round(logicalH * dpr);
  Object.defineProperty(c, 'clientWidth', { value: logicalW }); Object.defineProperty(c, 'clientHeight', { value: logicalH });
  const v = createView2D(c, store, createUiState(), { readonly: true, dpr }); v.fit(500); // 새 ui 상태: 선택 강조가 캡처에 남지 않는다
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
