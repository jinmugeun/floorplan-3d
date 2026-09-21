// 계획 5가 더하는 제품(§13.9). catalog.js가 186줄이라 새 제품은 여기로 나누고 catalog.js가 병합한다.
// 규약은 catalog.js와 같다: size = [너비 w(좌우), 깊이 d(앞뒤), 높이 h] mm, zDefault = 바닥으로부터의 높이.
// price는 참고용 정적 값이다(실판매 DB는 범위 밖 — 명세 §17).
// 새 방 템플릿 6종(배식 라인 · 카페 바 · 세탁실 · 탈의·사물함 · 회의실 8인 · 교실 20인)이 쓴다.
export const EXTRA_PRICES = {
  'serve-counter': 2200000,
  'warmer-cabinet': 1800000,
  'bar-counter': 1600000,
  'coffee-machine': 2400000,
  'locker-12': 780000,
  'meeting-table-2400': 980000,
  'desk-student': 120000,
  lectern: 260000,
};

const P = (id, name, code, category, sub, size, attach, symbol, extra = {}) =>
  ({ id, name, code, category, sub, size, attach, symbol, zDefault: 0, color: '#cfd4da', kind: 'product', tags: '', price: EXTRA_PRICES[id] ?? 0, ...extra });

export const EXTRA_PRODUCTS = [
  P('serve-counter', '배식대 1800', 'TB-SV18', '책상/테이블', '작업대', [1800, 700, 900], 'floor', 'table', { color: '#c6ccd2', tags: '배식대 배식 카운터 급식' }),
  P('warmer-cabinet', '보온고', 'AP-WC90', '가전', '주방가전', [900, 700, 1800], 'floor', 'box', { color: '#b9c0c7', tags: '보온고 온장고 급식 배식' }),
  P('bar-counter', '바 카운터 2400', 'TB-BR24', '책상/테이블', '작업대', [2400, 600, 1050], 'floor', 'table', { color: '#d8c9b4', tags: '바 카운터 카페 바테이블' }),
  P('coffee-machine', '에스프레소 머신', 'AP-CM60', '가전', '주방가전', [600, 500, 700], 'floor', 'appliance', { color: '#9aa3ab', tags: '커피머신 에스프레소 카페' }),
  P('locker-12', '12칸 사물함', 'ST-LK12', '수납가구', '캐비닛', [900, 450, 1800], 'floor', 'box', { color: '#b6bdc4', tags: '사물함 로커 탈의' }),
  P('meeting-table-2400', '회의 탁자 2400', 'TB-MT24', '책상/테이블', '책상', [2400, 1200, 750], 'floor', 'table', { color: '#d8c9b4', tags: '회의 탁자 테이블 회의실' }),
  P('desk-student', '학생 책상', 'TB-DS06', '책상/테이블', '책상', [600, 450, 750], 'floor', 'table', { color: '#e6e1d8', tags: '학생 책상 교실 강의' }),
  P('lectern', '교탁', 'TB-LC09', '책상/테이블', '책상', [900, 500, 1100], 'floor', 'table', { color: '#d8c9b4', tags: '교탁 강의 교실 연단' }),
];
