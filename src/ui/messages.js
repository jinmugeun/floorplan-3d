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

// 1인칭(§15.1) — 락이 있든 없든 같은 안내가 상주하고, [나가기] 버튼과 [Esc]가 늘 ISO로 되돌린다.
export const FP_BANNER = '1인칭 — WASD 이동 · 드래그로 둘러보기 · [Esc] 나가기';
export const FP_EXIT = '나가기';
// 포인터 락이 거부된 환경(감사 §8 ①)에서 한 번 알린다: 고장이 아니라 조작 방식이 다르다.
export const FP_NO_LOCK = '마우스 잠금을 쓸 수 없어 드래그로 둘러봅니다';

// 벽 삭제(§15.6 · 감사 §28) — 제품이 함께 사라졌다는 사실과, 방이 줄었다는 사실을 함께 알린다.
export const WALL_DELETE_RESULT = (walls, items, rooms = 0) =>
  `벽 ${walls}개와 붙어 있던 제품 ${items}개를 삭제했습니다${rooms > 0 ? ` · 방 ${rooms}개가 사라졌습니다` : ''}`;
// 붙은 제품이 없고 방만 줄어든 경우(벽 하나를 지워 방이 열린 경우)에 쓴다.
export const ROOMS_GONE = rooms => `방 ${rooms}개가 사라졌습니다`;

// 저장 표시 세 상태(§15.7 · 감사 §18). SAVED_MANUAL은 저장 직후의 토스트 문구로 남고,
// 상단 바 표시는 시각을 갖는다("1:02"가 새벽인지 오후인지 알 수 없던 것도 0 채움으로 막는다).
export const savedManual = (date = new Date()) => {
  const d = date instanceof Date ? date : new Date();
  const p = n => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())} 파일로 저장`;
};
export const SAVED_DIRTY = '저장 안 된 변경';
export const SAVED_NONE = '저장 이력 없음';

// 불러오기 확인(§15.13) — 자동 저장본이 남는다는 사실까지 말해 준다(되돌릴 길이 있다).
export const CONFIRM_LOAD = { title: '불러오기', message: '현재 도면이 대체됩니다. 자동 저장본은 남습니다', ok: '불러오기' };

// 피드백(§15.14 · 감사 §20·§30): 댐퍼·붙여넣기는 결과를 말하지 않아 "먹었나?" 싶었다.
export const DAMPER_ADDED = segment => `${segment}구간에 댐퍼를 추가했습니다`;
export const DAMPER_DELETED = '댐퍼를 삭제했습니다';
export const PASTE_RESULT = n => `${n}개 붙여넣었습니다`;
// 범위 밖 항목은 비활성 + 사유를 말한다(감사 §10: 눌러도 아무 일도 없었다).
export const CURVED_WALL_TITLE = '곡선벽은 아직 지원하지 않습니다';
// 접근 가능한 이름(§15.14 · 감사 §2): 캔버스와 미니맵에 이름이 없었다.
export const CANVAS_LABEL = '도면 캔버스';
export const MINIMAP_LABEL = '미니맵 — 클릭하면 그 자리로 이동합니다';

// ── §16.8 문구 단일화 2차 ────────────────────────────────────────────────────
// 잠금 거부 한 벌(감사 §35): 같은 사실을 네 가지로 말하던 자리다. 주체(제품/덕트)와
// 막힌 동작(편집/삭제/이동)만 다르고 말투는 하나다.
export const LOCKED_ITEM_EDIT = '잠긴 제품은 편집할 수 없습니다';
export const LOCKED_DUCT_EDIT = '잠긴 덕트는 편집할 수 없습니다';
export const LOCKED_DUCT_DELETE = '잠긴 덕트는 삭제할 수 없습니다';
export const LOCKED_DUCT_MOVE = '잠긴 덕트는 움직일 수 없습니다';

// 복사·배열(감사 §37).
export const COPIED = '복사했습니다';
export const COPIED_N = n => `${n}개 복사했습니다`;
export const ARRAY_TOO_MANY = max => `배치 수가 너무 많습니다(최대 ${max})`;
export const ARRAY_MULTI_WARN = '여러 개를 고르면 사본이 경로점마다 같은 자리에 겹칩니다';

// 파일·프로젝트(감사 §37).
export const LOADED = '불러왔습니다';
export const RESTORED = '이어서 작업합니다';
export const JSON_EXPORTED = 'JSON을 내보냈습니다';
export const TEMPLATE_SAVED = name => `템플릿 "${name}"을 저장했습니다`;
export const TEMPLATE_SAVE_FAIL = '템플릿을 저장하지 못했습니다(저장 공간 부족)';

// 제품·재질 교체와 도구 피드백(감사 §37).
export const REPLACE_NONE = '교체할 제품이 없습니다';
export const REPLACE_DONE = n => `제품 ${n}개를 교체했습니다`;
export const MATERIAL_REPLACED = '재질을 교체했습니다';
export const STRUCTURES_SHOWN = '"건축/자재" 보기를 다시 켰습니다';
export const PLAN_LOCKED = '현재 도면 잠금 상태입니다';
export const SPLIT_REGIONS_RESET = '벽을 나누면 마감재 영역은 초기화됩니다';
export const OPENING_NEEDS_WALL = '개구부는 벽 위에만 놓입니다';

// 설정·산출물(감사 §37).
export const KEYS_RESET = '단축키를 초기화했습니다';
export const KEYS_LOADED = '단축키를 불러왔습니다';
export const KEY_TAKEN = (label, owner) => `[${label}]은 이미 "${owner}"이(가) 쓰고 있습니다`;
export const POPUP_BLOCKED = '팝업이 차단되어 인쇄 창을 열 수 없습니다';
export const SHOT_SAVED = '갤러리에 저장했습니다';
export const GALLERY_LOAD_FAIL = '갤러리를 불러오지 못했습니다';
export const GALLERY_DELETE_FAIL = '삭제하지 못했습니다';
export const SPEC_IMAGES_FAIL = n => `도면 이미지 ${n}장을 만들지 못했습니다`;
export const SPEC_FAIL = msg => `시방서를 만들지 못했습니다: ${msg}`;
