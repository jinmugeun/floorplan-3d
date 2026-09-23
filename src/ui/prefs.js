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
