// 비활성 메뉴 항목의 `disabled`와 `title`은 한 조건에서 나온다(§16.5 · 계획 8 Task 6 리뷰 I-3).
// 같은 조건식을 줄마다 두 번 적으면(`disabled: X, ...(X ? {} : { title })`) 한쪽만 고쳤을 때
// "비활성인데 사유가 없다"(전수 테스트가 잡는다)나 "활성인데 사유가 붙는다"(못 잡는다)가 생기고,
// 극성이 줄마다 뒤집혀 읽기도 어렵다. 그래서 입력은 사유 하나뿐이다:
//
//   { label: '붙여넣기', ...why(canPaste ? null : WHY_CLIPBOARD_EMPTY), onSelect }
//
// 사유가 있으면 그 항목은 반드시 꺼지고 그 사유가 툴팁이 된다. 사유가 없으면 `disabled: false`만
// 남고 title은 붙지 않는다(활성 항목에 빈 툴팁이 생기지 않게 — contextMenu.js가 title을 그대로 쓴다).
// 문구 자체는 messages.js의 WHY_* 상수다: 이 모듈은 문구를 만들지 않고 받아서 모양만 맞춘다.
export const why = reason => (reason ? { disabled: true, title: reason } : { disabled: false });
