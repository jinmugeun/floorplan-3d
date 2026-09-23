// 브라우저에만 남는 로컬 설정(kvp.*). 프로젝트 파일·저장 형식은 건드리지 않는다(§14의 전역 규칙).
// 패널 폭(layout.js)·미니맵 높이(shell.js)·즐겨찾기(libraryPanel.js)와 같은 성격이고,
// 사람마다·브라우저마다 다른 작업 습관을 담는다. 저장이 막힌 브라우저에서도 죽지 않는다.
export const STICKY_TOOLS_KEY = 'kvp.stickyTools';

// 방·벽·기둥·개구부 도구를 커밋 뒤에도 켜 둘지(기본 켜짐 — 오늘의집과 같은 연속 그리기).
export function stickyTools() {
  try { return localStorage.getItem(STICKY_TOOLS_KEY) !== '0'; } catch { return true; }
}
export function setStickyTools(on) {
  try { localStorage.setItem(STICKY_TOOLS_KEY, on ? '1' : '0'); } catch { /* 저장 불가 */ }
}

// 덕트 계통은 직전 값을 기억한다(§17.9(1) · 감사 §15). 프로젝트 파일에는 남지 않는다 —
// 도구 옵션은 스토어가 아니므로 되돌리기 단계와도 무관하다(stickyTools와 같은 자리).
export const DUCT_SYSTEM_KEY = 'kvp.ductSystem';
export function lastDuctSystem() {
  try { return localStorage.getItem(DUCT_SYSTEM_KEY) ?? ''; } catch { return ''; }
}
export function setLastDuctSystem(s) {
  try { localStorage.setItem(DUCT_SYSTEM_KEY, String(s ?? '')); } catch { /* 저장 불가 */ }
}

// 3D 라벨 밀도(§17.10(2)). 'all' = 컬링하지 않는다 · 'auto' = 겹치면 점(●)으로 축약 · 'off' = 라벨 없음.
// 프로젝트 파일에는 남기지 않는다(저장 형식 무변경) — 그래서 sceneSignature에도 들어가지 않고,
// 값이 바뀔 때 main.js가 **명시적으로** 재빌드를 건다.
export const LABEL_DENSITY_KEY = 'kvp.labelDensity';
const DENSITIES = new Set(['all', 'auto', 'off']);
export function labelDensity() {
  try { const v = localStorage.getItem(LABEL_DENSITY_KEY); return DENSITIES.has(v) ? v : 'auto'; } catch { return 'auto'; }
}
export function setLabelDensity(v) {
  try { localStorage.setItem(LABEL_DENSITY_KEY, DENSITIES.has(v) ? v : 'auto'); } catch { /* 저장 불가 */ }
}
