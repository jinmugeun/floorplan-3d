// 제품 카탈로그(순수 데이터). 모든 제품은 박스 모델이고 2D는 symbol로 선화를 그린다.
// size = [너비 w(좌우), 깊이 d(앞뒤), 높이 h] mm. zDefault = "바닥으로부터의 높이"(item.z) 기본값.
// opening이 있는 제품(문·창·개구부)은 벽에 그 크기의 구멍을 뚫는다(opening.sill = zDefault).
// 실판매 상품 DB는 범위 밖이라 price는 참고용 정적 값이고 없는 제품도 있다(명세 §17).

export const CATEGORIES = [
  { name: '문/창문', subs: ['문', '창문'] },
  { name: '가전', subs: ['주방가전', '생활가전'] },
  { name: '침대/매트리스', subs: ['침대', '매트리스'] },
  { name: '드레스룸/행거', subs: ['옷장', '행거'] },
  { name: '수납가구', subs: ['선반', '캐비닛'] },
  { name: '소파', subs: ['소파', '리클라이너'] },
  { name: '책상/테이블', subs: ['책상', '식탁', '작업대'] },
  { name: '의자/스툴', subs: ['의자', '스툴'] },
  { name: '화장대/거울', subs: ['화장대', '거울'] },
  { name: '주방싱크/욕실', subs: ['싱크', '위생도구'] },
  { name: '조명', subs: ['천장등', '벽등'] },
  { name: '구조물', subs: ['기둥', '개구부'] },
];

export const SYMBOL_NAMES = ['box', 'bed', 'sofa', 'table', 'chair', 'door', 'window', 'column', 'circle', 'sink', 'range', 'fridge', 'lamp'];

export const ATTACH_LABELS = { floor: '바닥에 서있는 제품', floorLay: '바닥에 깔리는 제품', wall: '벽에 붙는 제품', ceiling: '천장에 붙는 제품' };

// 제품 단가(원). 실판매 가격 DB는 범위 밖이라 견적서용 정적 값이다(명세 §17).
// 구조물(기둥·개구부)은 사는 물건이 아니라 도면 요소라 0원이다.
export const PRICES = {
  'door-swing-900': 180000, 'door-swing-1000': 190000, 'door-double-1800': 360000, 'door-slide-1500': 420000,
  'window-slide-1200': 260000, 'window-slide-1800': 380000, 'window-fix-600': 140000,
  'fridge-2door': 1290000, 'fridge-kimchi': 980000, 'range-gas-6': 1850000, 'range-induction': 890000,
  'oven-built': 1250000, dishwasher: 760000, 'washer-drum': 890000, dryer: 1090000, 'aircon-stand': 1450000,
  'tv-55': 890000, 'hood-wall': 320000,
  'bed-single': 290000, 'bed-super-single': 340000, 'bed-queen': 450000, 'bed-king': 520000, 'mattress-queen': 390000,
  'wardrobe-1200': 420000, 'wardrobe-1800': 590000, 'hanger-open': 95000, 'drawer-5': 210000,
  'shelf-steel-4': 120000, bookshelf: 150000, 'cabinet-upper': 180000, 'cabinet-lower': 240000, 'storage-box': 25000,
  'sofa-2': 690000, 'sofa-3': 890000, 'sofa-corner': 1390000, 'sofa-recliner': 740000,
  'desk-1400': 240000, 'dining-4': 320000, 'dining-6': 480000, 'worktable-1800': 560000, 'side-table': 85000,
  'chair-dining': 68000, 'chair-office': 190000, 'stool-round': 45000, 'bench-1200': 130000,
  'vanity-800': 220000, dresser: 310000, 'mirror-wall': 95000,
  'sink-double': 1150000, 'sink-single': 820000, washbasin: 180000, toilet: 290000, bathtub: 650000, 'shower-booth': 780000,
  'light-ceiling': 85000, 'light-pendant': 120000, 'light-downlight': 18000, 'light-fluorescent': 42000, 'light-wall': 56000,
  'column-square': 0, 'column-round': 0, 'opening-pass': 0,
};

const P = (id, name, code, category, sub, size, attach, symbol, extra = {}) =>
  ({ id, name, code, category, sub, size, attach, symbol, zDefault: 0, color: '#cfd4da', kind: 'product', tags: '', price: PRICES[id] ?? 0, ...extra });
const hole = (kind, w, h, sill, color) => ({ kind, color, zDefault: sill, opening: { w, h, sill } });

export const PRODUCTS = [
  // 문/창문
  P('door-swing-900', '여닫이문 900', 'DR-0900', '문/창문', '문', [900, 40, 2100], 'wall', 'door', { ...hole('door', 900, 2100, 0, '#b98a54'), tags: '문 방문 여닫이' }),
  P('door-swing-1000', '여닫이문 1000', 'DR-1000', '문/창문', '문', [1000, 40, 2100], 'wall', 'door', { ...hole('door', 1000, 2100, 0, '#b98a54'), tags: '문 현관문 여닫이' }),
  P('door-double-1800', '양여닫이문 1800', 'DR-1800', '문/창문', '문', [1800, 40, 2100], 'wall', 'door', { ...hole('door', 1800, 2100, 0, '#b98a54'), tags: '문 양문 쌍문' }),
  P('door-slide-1500', '미닫이문 1500', 'DR-S150', '문/창문', '문', [1500, 40, 2100], 'wall', 'door', { ...hole('door', 1500, 2100, 0, '#b98a54'), tags: '문 미닫이 슬라이딩' }),
  P('window-slide-1200', '미닫이창 1200', 'WD-1200', '문/창문', '창문', [1200, 40, 1200], 'wall', 'window', { ...hole('window', 1200, 1200, 900, '#9fd3e3'), tags: '창 창문 미닫이' }),
  P('window-slide-1800', '미닫이창 1800', 'WD-1800', '문/창문', '창문', [1800, 40, 1200], 'wall', 'window', { ...hole('window', 1800, 1200, 900, '#9fd3e3'), tags: '창 창문 거실창' }),
  P('window-fix-600', '고정창 600', 'WD-0600', '문/창문', '창문', [600, 40, 600], 'wall', 'window', { ...hole('window', 600, 600, 1200, '#9fd3e3'), tags: '창 고정창 픽스창' }),
  // 가전
  P('fridge-2door', '2도어 냉장고', 'AP-RF20', '가전', '주방가전', [900, 750, 1800], 'floor', 'fridge', { color: '#dfe3e8', price: 1290000, tags: '냉장고 주방' }),
  P('fridge-kimchi', '김치냉장고', 'AP-RFK', '가전', '주방가전', [700, 750, 1300], 'floor', 'fridge', { color: '#dfe3e8', tags: '냉장고 김치' }),
  P('range-gas-6', '업소용 6구 레인지', 'AP-RG06', '가전', '주방가전', [1200, 750, 850], 'floor', 'range', { color: '#b9c0c7', tags: '레인지 가스 화구 조리' }),
  P('range-induction', '인덕션 3구', 'AP-IN03', '가전', '주방가전', [750, 520, 60], 'floorLay', 'range', { zDefault: 850, color: '#3a4351', tags: '인덕션 쿡탑 조리' }),
  P('oven-built', '빌트인 오븐', 'AP-OV60', '가전', '주방가전', [600, 600, 600], 'floor', 'box', { zDefault: 850, color: '#b9c0c7', tags: '오븐 주방' }),
  P('dishwasher', '식기세척기', 'AP-DW60', '가전', '주방가전', [600, 600, 850], 'floor', 'box', { tags: '식기세척기 주방' }),
  P('washer-drum', '드럼세탁기', 'AP-WM12', '가전', '생활가전', [600, 650, 850], 'floor', 'box', { color: '#eceff3', tags: '세탁기 드럼' }),
  P('dryer', '건조기', 'AP-DR09', '가전', '생활가전', [600, 650, 850], 'floor', 'box', { color: '#eceff3', tags: '건조기' }),
  P('aircon-stand', '스탠드 에어컨', 'AP-ACS', '가전', '생활가전', [400, 400, 1800], 'floor', 'box', { color: '#eceff3', tags: '에어컨 냉방' }),
  P('tv-55', 'TV 55인치', 'AP-TV55', '가전', '생활가전', [1230, 60, 720], 'wall', 'box', { zDefault: 900, color: '#2a2f36', tags: 'TV 텔레비전 벽걸이' }),
  P('hood-wall', '벽걸이 후드', 'AP-HD90', '가전', '주방가전', [900, 500, 600], 'wall', 'box', { zDefault: 1500, color: '#c6ccd2', tags: '후드 환기 배기' }),
  // 침대/매트리스
  P('bed-single', '싱글 침대', 'BD-SS', '침대/매트리스', '침대', [1000, 2000, 600], 'floor', 'bed', { color: '#e3d8c8', tags: '침대 싱글' }),
  P('bed-super-single', '슈퍼싱글 침대', 'BD-SSS', '침대/매트리스', '침대', [1100, 2000, 600], 'floor', 'bed', { color: '#e3d8c8', tags: '침대 슈퍼싱글' }),
  P('bed-queen', '퀸 침대', 'BD-Q', '침대/매트리스', '침대', [1500, 2000, 600], 'floor', 'bed', { color: '#e3d8c8', tags: '침대 퀸' }),
  P('bed-king', '킹 침대', 'BD-K', '침대/매트리스', '침대', [1600, 2000, 600], 'floor', 'bed', { color: '#e3d8c8', tags: '침대 킹' }),
  P('mattress-queen', '퀸 매트리스', 'BD-MQ', '침대/매트리스', '매트리스', [1500, 2000, 250], 'floorLay', 'bed', { color: '#f1ece3', tags: '매트리스 퀸 침대' }),
  // 드레스룸/행거
  P('wardrobe-1200', '옷장 1200', 'WR-1200', '드레스룸/행거', '옷장', [1200, 600, 2100], 'floor', 'box', { color: '#d8c9b4', tags: '옷장 수납' }),
  P('wardrobe-1800', '옷장 1800', 'WR-1800', '드레스룸/행거', '옷장', [1800, 600, 2100], 'floor', 'box', { color: '#d8c9b4', tags: '옷장 수납' }),
  P('hanger-open', '오픈 행거', 'WR-HG', '드레스룸/행거', '행거', [1000, 500, 1700], 'floor', 'box', { tags: '행거 옷걸이' }),
  P('drawer-5', '5단 서랍장', 'WR-DR5', '드레스룸/행거', '옷장', [800, 450, 1200], 'floor', 'box', { color: '#d8c9b4', tags: '서랍 수납' }),
  // 수납가구
  P('shelf-steel-4', '4단 스틸 선반', 'ST-SH4', '수납가구', '선반', [1200, 450, 1800], 'floor', 'box', { color: '#b9c0c7', tags: '선반 창고 수납' }),
  P('bookshelf', '책장', 'ST-BK', '수납가구', '선반', [800, 300, 1800], 'floor', 'box', { color: '#d8c9b4', tags: '책장 선반' }),
  P('cabinet-upper', '상부장', 'ST-UP', '수납가구', '캐비닛', [900, 350, 700], 'wall', 'box', { zDefault: 1500, color: '#e6e1d8', tags: '상부장 주방 수납' }),
  P('cabinet-lower', '하부장', 'ST-LO', '수납가구', '캐비닛', [900, 600, 850], 'floor', 'box', { color: '#e6e1d8', tags: '하부장 주방 수납' }),
  P('storage-box', '수납 박스', 'ST-BX', '수납가구', '캐비닛', [600, 400, 400], 'floorLay', 'box', { tags: '박스 수납' }),
  // 소파
  P('sofa-2', '2인 소파', 'SF-2P', '소파', '소파', [1600, 900, 800], 'floor', 'sofa', { color: '#c9cdd6', tags: '소파 2인' }),
  P('sofa-3', '3인 소파', 'SF-3P', '소파', '소파', [2100, 900, 800], 'floor', 'sofa', { color: '#c9cdd6', tags: '소파 3인' }),
  P('sofa-corner', '코너 소파', 'SF-CN', '소파', '소파', [2600, 1700, 800], 'floor', 'sofa', { color: '#c9cdd6', tags: '소파 코너 ㄱ자' }),
  P('sofa-recliner', '리클라이너', 'SF-RC', '소파', '리클라이너', [900, 950, 1050], 'floor', 'sofa', { color: '#a9a29b', tags: '리클라이너 1인 소파' }),
  // 책상/테이블
  P('desk-1400', '책상 1400', 'TB-D14', '책상/테이블', '책상', [1400, 700, 750], 'floor', 'table', { color: '#d8c9b4', tags: '책상 데스크' }),
  P('dining-4', '4인 식탁', 'TB-D04', '책상/테이블', '식탁', [1200, 800, 750], 'floor', 'table', { color: '#d8c9b4', tags: '식탁 테이블 4인' }),
  P('dining-6', '6인 식탁', 'TB-D06', '책상/테이블', '식탁', [1800, 900, 750], 'floor', 'table', { color: '#d8c9b4', tags: '식탁 테이블 6인' }),
  P('worktable-1800', '스테인리스 작업대', 'TB-W18', '책상/테이블', '작업대', [1800, 750, 850], 'floor', 'table', { color: '#c6ccd2', tags: '작업대 조리대 스테인리스' }),
  P('side-table', '사이드 테이블', 'TB-ST', '책상/테이블', '책상', [450, 450, 550], 'floor', 'table', { tags: '사이드 테이블' }),
  // 의자/스툴
  P('chair-dining', '식탁 의자', 'CH-DN', '의자/스툴', '의자', [450, 500, 900], 'floor', 'chair', { color: '#d8c9b4', tags: '의자 식탁' }),
  P('chair-office', '사무용 의자', 'CH-OF', '의자/스툴', '의자', [600, 600, 1000], 'floor', 'chair', { color: '#6b7280', tags: '의자 사무 회전' }),
  P('stool-round', '원형 스툴', 'CH-ST', '의자/스툴', '스툴', [350, 350, 450], 'floor', 'circle', { tags: '스툴 원형 의자' }),
  P('bench-1200', '벤치 1200', 'CH-BN', '의자/스툴', '스툴', [1200, 400, 450], 'floor', 'box', { color: '#d8c9b4', tags: '벤치 긴 의자' }),
  // 화장대/거울
  P('vanity-800', '화장대 800', 'VN-0800', '화장대/거울', '화장대', [800, 450, 750], 'floor', 'table', { color: '#e6e1d8', tags: '화장대' }),
  P('dresser', '드레서', 'VN-DS', '화장대/거울', '화장대', [1000, 450, 800], 'floor', 'box', { color: '#e6e1d8', tags: '드레서 서랍' }),
  P('mirror-wall', '벽거울', 'VN-MR', '화장대/거울', '거울', [600, 30, 900], 'wall', 'box', { zDefault: 900, color: '#cfe4ea', tags: '거울 벽거울' }),
  // 주방싱크/욕실
  P('sink-double', '2조 싱크대', 'KS-SK2', '주방싱크/욕실', '싱크', [1800, 750, 850], 'floor', 'sink', { color: '#c6ccd2', tags: '싱크 싱크대 개수대' }),
  P('sink-single', '1조 싱크대', 'KS-SK1', '주방싱크/욕실', '싱크', [1200, 750, 850], 'floor', 'sink', { color: '#c6ccd2', tags: '싱크 싱크대 개수대' }),
  P('washbasin', '세면대', 'BT-WB', '주방싱크/욕실', '위생도구', [600, 500, 850], 'wall', 'sink', { zDefault: 800, color: '#f1f4f6', tags: '세면대 욕실' }),
  P('toilet', '변기', 'BT-TL', '주방싱크/욕실', '위생도구', [400, 700, 800], 'floor', 'box', { color: '#f1f4f6', tags: '변기 욕실' }),
  P('bathtub', '욕조', 'BT-BT', '주방싱크/욕실', '위생도구', [1600, 800, 600], 'floor', 'box', { color: '#f1f4f6', tags: '욕조 욕실' }),
  P('shower-booth', '샤워부스', 'BT-SB', '주방싱크/욕실', '위생도구', [900, 900, 2000], 'floor', 'box', { color: '#dbe7ec', tags: '샤워 부스 욕실' }),
  // 조명
  P('light-ceiling', '원형 천장등', 'LT-CL', '조명', '천장등', [500, 500, 120], 'ceiling', 'lamp', { color: '#fff3c4', tags: '조명 천장등 등' }),
  P('light-pendant', '펜던트 조명', 'LT-PD', '조명', '천장등', [300, 300, 600], 'ceiling', 'lamp', { color: '#fff3c4', tags: '조명 펜던트 식탁등' }),
  P('light-downlight', '매입 다운라이트', 'LT-DL', '조명', '천장등', [120, 120, 80], 'ceiling', 'lamp', { color: '#fff3c4', tags: '조명 다운라이트 매입' }),
  P('light-fluorescent', '형광등 2등', 'LT-FL', '조명', '천장등', [1250, 250, 100], 'ceiling', 'box', { color: '#fff3c4', tags: '조명 형광등' }),
  P('light-wall', '벽등', 'LT-WL', '조명', '벽등', [200, 150, 300], 'wall', 'lamp', { zDefault: 1800, color: '#fff3c4', tags: '조명 벽등 브라켓' }),
  // 구조물
  P('column-square', '사각 기둥', 'SR-CS', '구조물', '기둥', [400, 400, 2300], 'floor', 'column', { kind: 'column', color: '#b6bdc4', tags: '기둥 사각 구조물' }),
  P('column-round', '원형 기둥', 'SR-CR', '구조물', '기둥', [400, 400, 2300], 'floor', 'circle', { kind: 'column', color: '#b6bdc4', tags: '기둥 원형 구조물' }),
  P('opening-pass', '개구부', 'SR-OP', '구조물', '개구부', [900, 40, 2100], 'wall', 'window', { ...hole('opening', 900, 2100, 0, '#e9e6e0'), tags: '개구부 통로 구멍' }),
];

const byId = new Map(PRODUCTS.map(p => [p.id, p]));
export const productById = id => byId.get(id) ?? null;
export const productsIn = (category, sub = null) => PRODUCTS.filter(p => p.category === category && (!sub || p.sub === sub));

// 명세 LB-03: 카테고리 안에 들어가 있어도 항상 전체를 검색한다(오늘의집의 불편 개선).
export function searchProducts(q) {
  const s = String(q ?? '').trim().toLowerCase();
  if (!s) return [];
  return PRODUCTS.filter(p => `${p.name} ${p.code} ${p.category} ${p.sub} ${p.tags}`.toLowerCase().includes(s));
}
export function sortProducts(list, by = 'name') {
  const vol = p => p.size[0] * p.size[1] * p.size[2];
  return [...list].sort((a, b) => (by === 'size' ? vol(a) - vol(b) : a.name.localeCompare(b.name, 'ko')));
}
export const fmtSize = size => `${Math.round(size[0])}×${Math.round(size[1])}×${Math.round(size[2])}`;
