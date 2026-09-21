// "마지막 저장 뒤에 바뀐 것이 있나"만 답한다(§15.7). 스토어 알림 횟수를 버전으로 세고 저장 시점의
// 버전과 비교한다 — 무엇이 바뀌었는지는 보지 않는다: 보기 옵션·단위·이름도 프로젝트 파일에 들어가
// 므로 그것들도 "저장 안 된 변경"이다. 저장 표시(#savedAt)와 나가기·새로만들기·불러오기 확인이
// 같은 판정을 쓴다(§15.13).
import { saveStatus, showSaved } from './topbar.js';

export function createDirtyTracker(store, { onChange = () => {} } = {}) {
  let version = 0, savedAt = 0;
  const unsub = store.subscribe(() => { version++; onChange(version > savedAt); });
  return {
    isDirty: () => version > savedAt,
    markSaved() { savedAt = version; onChange(false); },
    destroy() { unsub(); },
  };
}

// #savedAt에 무엇을 적을지 한 곳에서 정한다(§15.7 · 리뷰 M1). markSaved(kind)의 kind가 표시를 정한다:
// 'manual' → "HH:MM 파일로 저장" · 'auto' → "HH:MM 자동 저장됨" · 'none' → "저장 이력 없음".
// 'none'이 있어야 하는 이유: 새로 만들기·불러오기는 추적기를 clean으로 만들지만 그 순간 저장은
// 일어나지 않았다(자동 저장본은 아직 직전 프로젝트다) — "자동 저장됨"이라고 적으면 표시가 다시
// 거짓말을 한다(감사 §18). at은 자동 저장 콜백이 실제 저장 시각을 넘길 때 쓴다(기록 시각이 아니다).
export function createSaveIndicator(tracker, { render = showSaved, now = () => new Date() } = {}) {
  let last = null;                  // { at: Date, manual: boolean } | null — null이면 "저장 이력 없음"
  const label = () => saveStatus({ at: last?.at ?? null, manual: !!last?.manual, dirty: tracker.isDirty() });
  return {
    label,
    show: () => render(label()),
    markSaved(kind = 'auto', at = now()) {
      last = kind === 'none' ? null : { at, manual: kind === 'manual' };
      tracker.markSaved();
      render(label());
    },
  };
}
