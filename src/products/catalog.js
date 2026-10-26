// 제품 카탈로그(순수 데이터). 2D는 symbol로 선화를 그리고, 3D는 shape가 있으면 스테인리스 형상(view3d/shapes), 없으면 예전 조합 형상이다.
// size = [너비 w(좌우), 깊이 d(앞뒤), 높이 h] mm. zDefault = "바닥으로부터의 높이"(item.z) 기본값.
// opening이 있는 제품(문·창·개구부)은 벽에 그 크기의 구멍을 뚫는다(opening.sill = zDefault).
// 2026-10-20 · 계획 17 Task 3: 카탈로그 = [남는 기존 21종(+ 2026-10-26 공기질 함체 = 22) · 식별번호 엑셀 급식기구(catalogKitchen.js) · 숨김 단종(catalogLegacy.js)].
//  - PRODUCTS는 숨김까지 전부다: '배치된 제품' 탭·즐겨찾기·조회(productById)가 쓴다. 라이브러리의 칩·'전체'·검색은 isListed(숨김 제외)만 본다.
//  - 남는 기존 제품의 카테고리는 칩 이름으로 옮겼다: 문·창·기둥·개구부 → '건축 요소', 디퓨저·팬·환기캡 → '후드·환기'. 도면 기구(catalogDrawing.js)는
//    '도면 기구' 그대로 숨김(견적표 DRAWING_CATEGORY 규칙 — estimate.js).
// asset(계획 15): 실사 3D 모델이 있는 제품 — 지금은 숨김 단종 제품에만 있다(시드 7종 · 생성 2종 · 계획 17 D4: 새 화면은 생성 모델을 쓰지 않는다).
import { DRAWING_PRODUCTS, DRAWING_PRICES } from './catalogDrawing.js';
import { LEGACY_PRODUCTS, LEGACY_PRICES } from './catalogLegacy.js';
import { KITCHEN_PRODUCTS, KITCHEN_PRICES, KITCHEN_CATEGORIES } from './catalogKitchen.js';

const BUILDING = { name: '건축 요소', subs: ['문', '창문', '기둥', '개구부'] };
const VENT_PARTS = ['디퓨저', '팬', '환기캡', '공기질'];
// 칩 10개: 엑셀 9개(후드·환기 끝에 환기 부속 하위 셋 + 공기질) + 건축 요소.
export const CATEGORIES = [
  ...KITCHEN_CATEGORIES.map(c => (c.name === '후드·환기' ? { name: c.name, subs: [...c.subs, ...VENT_PARTS] } : c)),
  BUILDING,
];

// 카테고리 색(라이브러리 타일 썸네일 배경). 심벌 선화가 잘 보이게 옅은 색만 쓴다.
// 숨김 단종 제품의 옛 카테고리 색도 남긴다 — '배치된 제품' 탭에 그 타일이 나올 수 있다.
export const CATEGORY_COLORS = {
  '조리': '#eef1f4', '세척·소독': '#eaf0f3', '냉장·냉동': '#e9f0f5', '싱크·조리대': '#edf0f2', '배식': '#f3efe6',
  '후드·환기': '#e9eef2', '운반·보관': '#eef0f2', '가구·사무': '#f3ece1', '위생·기타': '#eef2ef', '건축 요소': '#f6efe2',
  // 숨김 단종(옛 카테고리)
  '문/창문': '#f6efe2', '가전': '#eef1f4', '침대/매트리스': '#f5efe6', '드레스룸/행거': '#f3ece1', '수납가구': '#f2f0ea', '소파': '#eef0f4',
  '책상/테이블': '#f3ece1', '의자/스툴': '#f1ece4', '화장대/거울': '#f0f2f4', '주방싱크/욕실': '#eaf0f3', '조명': '#fdf6dd', '구조물': '#eceef0',
  '환기 설비': '#e9eef2', '도면 기구': '#eef0f2',
};

export const SYMBOL_NAMES = ['box', 'bed', 'sofa', 'table', 'chair', 'door', 'window', 'column', 'columnRound', 'circle', 'sink', 'range', 'fridge', 'lamp', 'hood', 'appliance', 'diffuser', 'fan', 'ventcap'];

export const ATTACH_LABELS = { floor: '바닥에 서있는 제품', floorLay: '바닥에 깔리는 제품', wall: '벽에 붙는 제품', ceiling: '천장에 붙는 제품' };

// 남는 기존 제품의 단가(원 · 정적 — 명세 §17). 구조물(기둥·개구부)은 사는 물건이 아니라 도면 요소라 0원이다.
const KEPT_PRICES = {
  'door-swing-900': 180000, 'door-swing-1000': 190000, 'door-double-1800': 360000, 'door-slide-1500': 420000, 'door-pocket-900': 390000, 'door-slide-900': 300000,
  'window-slide-1200': 260000, 'window-slide-1800': 380000, 'window-fix-600': 140000,
  'column-square': 0, 'column-round': 0, 'opening-pass': 0,
  'diffuser-650': 120000, 'diffuser-650-350': 95000, 'diffuser-500-350': 85000,
  'fan-exhaust-700': 2600000, 'fan-supply-filter': 3100000, 'fan-wall-500': 380000,
  'ventcap-100': 35000, 'ventcap-150': 45000,
  'aq-enclosure': 0,   // 단가 미정(2026-10-26 — 사용자 확인 대기)
};
// 이름은 그대로 PRICES다 — 읽는 쪽(견적서·테스트)이 바뀌지 않는다.
export const PRICES = { ...KEPT_PRICES, ...KITCHEN_PRICES, ...LEGACY_PRICES, ...DRAWING_PRICES };

const P = (id, name, code, category, sub, size, attach, symbol, extra = {}) =>
  ({ id, name, code, category, sub, size, attach, symbol, zDefault: 0, color: '#cfd4da', kind: 'product', tags: '', price: PRICES[id] ?? 0, ...extra });
const hole = (kind, w, h, sill, color) => ({ kind, color, zDefault: sill, opening: { w, h, sill } });

const B = BUILDING.name, V = '후드·환기';
const KEPT_BASE = [
  // 건축 요소 — 문
  P('door-swing-900', '여닫이문 900', 'DR-0900', B, '문', [900, 40, 2100], 'wall', 'door', { ...hole('door', 900, 2100, 0, '#b98a54'), tags: '문 방문 여닫이' }),
  P('door-swing-1000', '여닫이문 1000', 'DR-1000', B, '문', [1000, 40, 2100], 'wall', 'door', { ...hole('door', 1000, 2100, 0, '#b98a54'), tags: '문 현관문 여닫이' }),
  P('door-double-1800', '양여닫이문 1800', 'DR-1800', B, '문', [1800, 40, 2100], 'wall', 'door', { ...hole('door', 1800, 2100, 0, '#b98a54'), tags: '문 양문 쌍문' }),
  P('door-slide-1500', '미닫이문 1500', 'DR-S150', B, '문', [1500, 40, 2100], 'wall', 'door', { ...hole('door', 1500, 2100, 0, '#b98a54'), tags: '문 미닫이 슬라이딩' }),
  // 외미닫이 900(2026-10-12): 벽 면을 따라 미끄러지는 외짝. DXF의 외미닫이 기호(신상중 A-DOOR 문짝 선 + 미닫이 화살표)가 이 제품으로 앉는다.
  P('door-slide-900', '미닫이문 900', 'DR-S090', B, '문', [900, 40, 2100], 'wall', 'door', { ...hole('door', 900, 2100, 0, '#b98a54'), tags: '문 미닫이 외미닫이 슬라이딩' }),
  // 포켓 미닫이(2026-10-06): 벽 속 주머니로 들어가는 외짝. DXF 창·문 블록의 "문_슬라이딩 포켓 900"이 이 제품으로 앉는다.
  P('door-pocket-900', '포켓 미닫이문 900', 'DR-P090', B, '문', [900, 40, 2100], 'wall', 'door', { ...hole('door', 900, 2100, 0, '#b98a54'), tags: '문 포켓 미닫이 슬라이딩 벽속' }),
  // 건축 요소 — 창
  P('window-slide-1200', '미닫이창 1200', 'WD-1200', B, '창문', [1200, 40, 1200], 'wall', 'window', { ...hole('window', 1200, 1200, 900, '#9fd3e3'), tags: '창 창문 미닫이' }),
  P('window-slide-1800', '미닫이창 1800', 'WD-1800', B, '창문', [1800, 40, 1200], 'wall', 'window', { ...hole('window', 1800, 1200, 900, '#9fd3e3'), tags: '창 창문 거실창' }),
  P('window-fix-600', '고정창 600', 'WD-0600', B, '창문', [600, 40, 600], 'wall', 'window', { ...hole('window', 600, 600, 1200, '#9fd3e3'), tags: '창 고정창 픽스창' }),
  // 건축 요소 — 기둥·개구부
  P('column-square', '사각 기둥', 'SR-CS', B, '기둥', [400, 400, 2300], 'floor', 'column', { kind: 'column', color: '#b6bdc4', tags: '기둥 사각 구조물' }),
  P('column-round', '원형 기둥', 'SR-CR', B, '기둥', [400, 400, 2300], 'floor', 'columnRound', { kind: 'column', color: '#b6bdc4', tags: '기둥 원형 구조물' }),
  P('opening-pass', '개구부', 'SR-OP', B, '개구부', [900, 40, 2100], 'wall', 'window', { ...hole('opening', 900, 2100, 0, '#e9e6e0'), tags: '개구부 통로 구멍' }),
  // 후드·환기 — 환기 부속(명세 §11.1). kind: 'equipment' + equip 씨앗 → createItem이 item.props로 옮긴다. 후드는 엑셀 제품이다.
  P('diffuser-650', '디퓨저 650×650', 'VD-6565', V, '디퓨저', [650, 650, 100], 'ceiling', 'diffuser', { kind: 'equipment', equip: { type: 'diffuser', a: 650, b: 650, cmh: 3200 }, color: '#e6eaef', tags: '디퓨저 급기 배기 천장' }),
  P('diffuser-650-350', '디퓨저 650×350', 'VD-6535', V, '디퓨저', [650, 350, 100], 'ceiling', 'diffuser', { kind: 'equipment', equip: { type: 'diffuser', a: 650, b: 350, cmh: 1500 }, color: '#e6eaef', tags: '디퓨저 급기 배기 천장' }),
  P('diffuser-500-350', '디퓨저 500×350', 'VD-5035', V, '디퓨저', [500, 350, 100], 'ceiling', 'diffuser', { kind: 'equipment', equip: { type: 'diffuser', a: 500, b: 350, cmh: 1000 }, color: '#e6eaef', tags: '디퓨저 급기 배기 천장' }),
  P('fan-exhaust-700', '배기팬(소음챔버 700)', 'VF-E700', V, '팬', [700, 700, 700], 'floor', 'fan', { kind: 'equipment', equip: { type: 'fan', flow: 'exhaust', chamber: [700, 700, 700] }, color: '#9aa3ab', tags: '팬 배기 송풍기 챔버' }),
  P('fan-supply-filter', '급기 필터팬', 'VF-SF', V, '팬', [700, 700, 700], 'floor', 'fan', { kind: 'equipment', equip: { type: 'fan', fanId: 'FB', flow: 'supply', chamber: [700, 700, 700] }, color: '#9aa3ab', tags: '팬 급기 필터 송풍기' }),
  P('fan-wall-500', '벽부형 환기팬', 'VF-W500', V, '팬', [500, 500, 300], 'wall', 'fan', { kind: 'equipment', equip: { type: 'fan', fanId: 'F-1', flow: 'exhaust', chamber: [500, 500, 300] }, zDefault: 2000, color: '#9aa3ab', tags: '팬 벽부 환기 배기' }),
  P('ventcap-100', 'STS 환기캡 Ø100', 'VP-100', V, '환기캡', [100, 100, 100], 'wall', 'ventcap', { kind: 'equipment', equip: { type: 'ventcap', dia: 100 }, zDefault: 2200, color: '#c6ccd2', tags: '환기캡 캡 벽 배기' }),
  P('ventcap-150', 'STS 환기캡 Ø150', 'VP-150', V, '환기캡', [150, 150, 150], 'wall', 'ventcap', { kind: 'equipment', equip: { type: 'ventcap', dia: 150 }, zDefault: 2200, color: '#c6ccd2', tags: '환기캡 캡 벽 배기' }),
  // 후드·환기 — 공기질 함체(2026-10-26 · 사용자 CAD 그림 1~10 + 외형도 DXF · 외형 510×217×310): 벽에 거는 센서 함체. 형상 enclosure(view3d/shapes/enclosure.js)
  // · 스테인리스 몸체 + 어두운 관측창(사용자 선택 — 렌더 비교) · 아랫면 1,200(호흡선 1.2~1.5 m에 함체 가운데 1,355가 든다) · DXF 평면 블록 AQ_BOX_PLAN(equipVocab.js).
  P('aq-enclosure', '공기질 함체', 'AQ-EN510', V, '공기질', [510, 217, 310], 'wall', 'box', { shape: 'enclosure', zDefault: 1200, tags: '공기질 함체 공기질함체 측정 센서 모니터링 미세먼지 이산화탄소 CO2 벽부' }),
];
// 도면 기구(DXF 가져오기의 일반 상자)는 남기되 숨긴다 — 사람이 라이브러리에서 고를 물건이 아니다(가져온 기구가 서는 자리).
const KEPT = [...KEPT_BASE, ...DRAWING_PRODUCTS.map(p => ({ ...p, hidden: true }))];
export const KEPT_IDS = /* @__PURE__ */ KEPT.map(p => p.id);   // 테스트 전용 — 앱 번들에 남지 않게(계획 17 최종 리뷰 M-1)
export const PRODUCTS = [...KEPT, ...KITCHEN_PRODUCTS, ...LEGACY_PRODUCTS];

export const isListed = p => !!p && !p.hidden;
const LISTED = PRODUCTS.filter(isListed);
const byId = new Map(PRODUCTS.map(p => [p.id, p]));
export const productById = id => byId.get(id) ?? null;
export const productsIn = (category, sub = null) => LISTED.filter(p => p.category === category && (!sub || p.sub === sub));

// 명세 LB-03: 카테고리 안에 들어가 있어도 항상 전체를 검색한다(오늘의집의 불편 개선). 숨김 단종은 찾지 않는다.
export function searchProducts(q) {
  const s = String(q ?? '').trim().toLowerCase();
  if (!s) return [];
  return LISTED.filter(p => `${p.name} ${p.code} ${p.category} ${p.sub} ${p.tags}`.toLowerCase().includes(s));
}
export function sortProducts(list, by = 'name') {
  const vol = p => p.size[0] * p.size[1] * p.size[2];
  return [...list].sort((a, b) => (by === 'size' ? vol(a) - vol(b) : a.name.localeCompare(b.name, 'ko')));
}
// 설비 제품 id 목록(샘플·테스트·풍량 집계가 "이것이 설비다"를 카탈로그에서 한 번에 읽는다) — 숨김 단종 설비도 든다(옛 프로젝트의 풍량).
export const EQUIP_PRODUCT_IDS = /* @__PURE__ */ PRODUCTS.filter(p => p.kind === 'equipment').map(p => p.id);
export const fmtSize = size => `${Math.round(size[0])}×${Math.round(size[1])}×${Math.round(size[2])}`;
