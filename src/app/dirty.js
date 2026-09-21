// "마지막 저장 뒤에 바뀐 것이 있나"만 답한다(§15.7). 스토어 알림 횟수를 버전으로 세고 저장 시점의
// 버전과 비교한다 — 무엇이 바뀌었는지는 보지 않는다: 보기 옵션·단위·이름도 프로젝트 파일에 들어가
// 므로 그것들도 "저장 안 된 변경"이다. 저장 표시(#savedAt)와 나가기·새로만들기·불러오기 확인이
// 같은 판정을 쓴다(§15.13).
export function createDirtyTracker(store, { onChange = () => {} } = {}) {
  let version = 0, savedAt = 0;
  const unsub = store.subscribe(() => { version++; onChange(version > savedAt); });
  return {
    isDirty: () => version > savedAt,
    markSaved() { savedAt = version; onChange(false); },
    destroy() { unsub(); },
  };
}
