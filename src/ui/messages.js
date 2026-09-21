// 사용자에게 보이는 문구 한 곳(§14.8). 계획 4의 CONFIRM_ROOM_DELETE가 이미 있던 자리를 넓혔다:
// 같은 사실을 배너·토스트·패널이 서로 다른 말로 알리는 일(감사 #10·#7·#8·#16)을 막는다.
// UI 문구는 한국어, 키 표기는 [Esc]처럼 대괄호 + 실제 키 이름(전역 규칙).

// 충돌(§14.8) — 배너는 건수를, 속성 패널은 고른 제품 한 줄을 말한다.
export const COLLISION_BANNER = n => `충돌 ${n}건 — 빨간 테두리 제품을 옮겨 주세요`;
export const COLLISION_ITEM = '다른 제품과 겹칩니다';
// "실시간 충돌 감지"를 끈 채로 제품을 끌고 있는 동안에는 빨간 테두리가 보이지 않는다(view2d.js).
// 그 사이에만 쓰는 같은 건수의 문구다 — "빨간 테두리"라는 단서만 뺀다(배너 자체는 §14.8대로 남는다).
export const COLLISION_BANNER_QUIET = n => `충돌 ${n}건 — 겹친 제품을 옮겨 주세요`;

// 값 범위(§14.10) — 입력이 조용히 잘리던 것을 알린다.
// 단위를 빈 글자로 주면 값에 단위를 붙이지 않는다: ft·in 모드에서는 부르는 쪽이 fmtLen으로 이미
// 12' 6" 꼴로 만들어 넘기므로 "mm"를 덧붙이면 거짓말이 된다(m-6).
export const CLAMP_MAX = (max, unit = 'mm') => `최대 ${[max, unit].filter(x => x !== '' && x != null).join(' ')}까지`;
export const CLAMP_MIN = (min, unit = 'mm') => `최소 ${[min, unit].filter(x => x !== '' && x != null).join(' ')}까지`;

// 비활성 피드백(§14.10) — 층이 하나면 삭제 버튼은 disabled + title이다.
export const LAST_FLOOR = '마지막 층은 삭제할 수 없습니다';
export const LAST_FLOOR_TITLE = '층이 하나뿐입니다';

// 끌어 놓기(§14.11) — 벽 부착 제품을 벽에서 먼 자리에 떨어뜨리면 배치 규칙이 거부한다.
// 예전에는 토스트도 배너도 없이 아무 일도 일어나지 않아 "새 기능이 고장 났다"로 읽혔다.
export const DROP_NEEDS_WALL = '벽에 붙는 제품입니다 — 벽에 닿는 자리에 놓아 주세요';

// 2D에서 벽을 클릭하면 안·밖 두 면에 함께 발린다(면 구분은 3D에서만 된다 — 감사 #16).
export const MATERIAL_BOTH_SIDES = '내·외벽 모두 적용';

// 템플릿 적용 결과(§14.9).
export const TEMPLATE_RESULT = (placed, moved, skipped) => `${placed}개 배치 · ${moved}개 위치 조정 · ${skipped}개 건너뜀`;

// 경로 도구(§14.10 이월) — 점 하나로 [Enter]를 누르면 도구를 끄지 않고 알려 준다.
export const PATH_MIN_POINTS = '점을 2개 이상 찍어 주세요';

// 저장 표시(§14.10) — 수동 저장과 자동 저장을 가른다. 시·분은 0으로 채운다.
export const SAVED_MANUAL = '파일로 저장했습니다';
export const savedAuto = (date = new Date()) => {
  const d = date instanceof Date ? date : new Date();
  const p = n => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())} 자동 저장됨`;
};
