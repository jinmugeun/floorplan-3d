// 숨김 단종 제품(2026-10-20 · 계획 17 Task 3). 계획 1~15의 일반 가구·가전·옛 주방 제품이다 — 카탈로그가 식별번호 엑셀의 급식기구로 바뀌면서
// 라이브러리·검색·칩에서 빠졌다(hidden: true). 지우지 않는 까닭: 옛 프로젝트·DXF `EQ-` 왕복(@sink-double 등)·저장된 템플릿이 이 id를 가리키고,
// productById로 풀려야 2D 심벌·3D 형상·견적이 그대로다. 정의는 catalog.js에서 글자 그대로 옮겼다(카테고리·하위·asset 그대로 — asset은 계획 15 시드·생성 모델).
// 계획 5의 제품(catalogExtra.js)도 여기서 함께 숨긴다. 남는 기존 제품(문·창·기둥·개구부·디퓨저·팬·환기캡·도면 기구)은 catalog.js에 있다.
import { EXTRA_PRODUCTS, EXTRA_PRICES } from './catalogExtra.js';

const BASE_LEGACY_PRICES = {
  'fridge-2door': 1290000, 'fridge-kimchi': 980000, 'range-gas-6': 1850000, 'range-gas-3': 1400000, 'range-induction': 890000, 'oven-built': 1250000,
  dishwasher: 760000, 'washer-drum': 890000, dryer: 1090000, 'aircon-stand': 1450000, 'tv-55': 890000, 'hood-wall': 320000,
  'bed-single': 290000, 'bed-super-single': 340000, 'bed-queen': 450000, 'bed-king': 520000, 'mattress-queen': 390000, 'wardrobe-1200': 420000,
  'wardrobe-1800': 590000, 'hanger-open': 95000, 'drawer-5': 210000, 'shelf-steel-4': 120000, bookshelf: 150000, 'cabinet-upper': 180000,
  'cabinet-lower': 240000, 'storage-box': 25000, 'sofa-2': 690000, 'sofa-3': 890000, 'sofa-corner': 1390000, 'sofa-recliner': 740000,
  'desk-1400': 240000, 'dining-4': 320000, 'dining-6': 480000, 'worktable-1800': 560000, 'side-table': 85000, 'chair-dining': 68000,
  'chair-office': 190000, 'stool-round': 45000, 'bench-1200': 130000, 'vanity-800': 220000, dresser: 310000, 'mirror-wall': 95000,
  'sink-double': 1150000, 'sink-single': 820000, washbasin: 180000, toilet: 290000, bathtub: 650000, 'shower-booth': 780000,
  'light-ceiling': 85000, 'light-pendant': 120000, 'light-downlight': 18000, 'light-fluorescent': 42000, 'light-wall': 56000, 'hood-box': 1850000,
  'hood-box-filter': 2350000, 'range-gas-high': 2400000, 'ricecooker-gas': 3800000, 'soup-kettle': 3200000, 'wok-kettle': 3600000, 'griddle-electric': 1900000,
  'steamer-combi': 12500000, 'dishwasher-conveyor': 18000000,
};
export const LEGACY_PRICES = { ...BASE_LEGACY_PRICES, ...EXTRA_PRICES };

const P = (id, name, code, category, sub, size, attach, symbol, extra = {}) =>
  ({ id, name, code, category, sub, size, attach, symbol, zDefault: 0, color: '#cfd4da', kind: 'product', tags: '', price: LEGACY_PRICES[id] ?? 0, ...extra });

const BASE_LEGACY = [
  // 가전
  P('fridge-2door', '2도어 냉장고', 'AP-RF20', '가전', '주방가전', [900, 750, 1800], 'floor', 'fridge', { color: '#dfe3e8', price: 1290000, tags: '냉장고 주방' }),
  P('fridge-kimchi', '김치냉장고', 'AP-RFK', '가전', '주방가전', [700, 750, 1300], 'floor', 'fridge', { color: '#dfe3e8', tags: '냉장고 김치' }),
  P('range-gas-6', '업소용 6구 레인지', 'AP-RG06', '가전', '주방가전', [1200, 750, 850], 'floor', 'range', { color: '#b9c0c7', tags: '레인지 가스 화구 조리' }),
  // 가스 테이블렌지 3구(2026-10-15 · 계획 15b): S2B 식별번호 24441916(화신주방산업 HTR-1500J · 규격 1500×750×800 · 단가 1,400,000)의 사진으로 만든 첫 생성 모델.
  P('range-gas-3', '가스 테이블렌지 3구', 'AP-RG03', '가전', '주방가전', [1500, 750, 800], 'floor', 'range', { color: '#b9c0c7', tags: '레인지 가스 화구 조리 테이블 3구', asset: 'range-gas-3' }),
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
  P('sofa-3', '3인 소파', 'SF-3P', '소파', '소파', [2100, 900, 800], 'floor', 'sofa', { color: '#c9cdd6', tags: '소파 3인', asset: 'sofa-3' }),
  P('sofa-corner', '코너 소파', 'SF-CN', '소파', '소파', [2600, 1700, 800], 'floor', 'sofa', { color: '#c9cdd6', tags: '소파 코너 ㄱ자' }),
  P('sofa-recliner', '리클라이너', 'SF-RC', '소파', '리클라이너', [900, 950, 1050], 'floor', 'sofa', { color: '#a9a29b', tags: '리클라이너 1인 소파' }),
  // 책상/테이블
  P('desk-1400', '책상 1400', 'TB-D14', '책상/테이블', '책상', [1400, 700, 750], 'floor', 'table', { color: '#d8c9b4', tags: '책상 데스크' }),
  P('dining-4', '4인 식탁', 'TB-D04', '책상/테이블', '식탁', [1200, 800, 750], 'floor', 'table', { color: '#d8c9b4', tags: '식탁 테이블 4인' }),
  P('dining-6', '6인 식탁', 'TB-D06', '책상/테이블', '식탁', [1800, 900, 750], 'floor', 'table', { color: '#d8c9b4', tags: '식탁 테이블 6인', asset: 'dining-6' }),
  P('worktable-1800', '스테인리스 작업대', 'TB-W18', '책상/테이블', '작업대', [1800, 750, 850], 'floor', 'table', { color: '#c6ccd2', tags: '작업대 조리대 스테인리스' }),
  P('side-table', '사이드 테이블', 'TB-ST', '책상/테이블', '책상', [450, 450, 550], 'floor', 'table', { tags: '사이드 테이블', asset: 'side-table' }),
  // 의자/스툴
  P('chair-dining', '식탁 의자', 'CH-DN', '의자/스툴', '의자', [450, 500, 900], 'floor', 'chair', { color: '#d8c9b4', tags: '의자 식탁', asset: 'chair-dining' }),
  P('chair-office', '사무용 의자', 'CH-OF', '의자/스툴', '의자', [600, 600, 1000], 'floor', 'chair', { color: '#6b7280', tags: '의자 사무 회전', asset: 'chair-office' }),
  P('stool-round', '원형 스툴', 'CH-ST', '의자/스툴', '스툴', [350, 350, 450], 'floor', 'circle', { tags: '스툴 원형 의자' }),
  P('bench-1200', '벤치 1200', 'CH-BN', '의자/스툴', '스툴', [1200, 400, 450], 'floor', 'box', { color: '#d8c9b4', tags: '벤치 긴 의자' }),
  // 화장대/거울
  P('vanity-800', '화장대 800', 'VN-0800', '화장대/거울', '화장대', [800, 450, 750], 'floor', 'table', { color: '#e6e1d8', tags: '화장대' }),
  P('dresser', '드레서', 'VN-DS', '화장대/거울', '화장대', [1000, 450, 800], 'floor', 'box', { color: '#e6e1d8', tags: '드레서 서랍' }),
  P('mirror-wall', '벽거울', 'VN-MR', '화장대/거울', '거울', [600, 30, 900], 'wall', 'box', { zDefault: 900, color: '#cfe4ea', tags: '거울 벽거울' }),
  // 주방싱크/욕실
  P('sink-double', '2조 싱크대', 'KS-SK2', '주방싱크/욕실', '싱크', [1800, 750, 850], 'floor', 'sink', { color: '#c6ccd2', tags: '싱크 싱크대 개수대' }),
  P('sink-single', '1조 싱크대', 'KS-SK1', '주방싱크/욕실', '싱크', [1200, 750, 850], 'floor', 'sink', { color: '#c6ccd2', tags: '싱크 싱크대 개수대', asset: 'sink-single' }),   // 생성 모델(S2B 23907341 · 1조 세정대 1200×750×850 · 계획 15b)
  P('washbasin', '세면대', 'BT-WB', '주방싱크/욕실', '위생도구', [600, 500, 850], 'wall', 'sink', { zDefault: 800, color: '#f1f4f6', tags: '세면대 욕실' }),
  P('toilet', '변기', 'BT-TL', '주방싱크/욕실', '위생도구', [400, 700, 800], 'floor', 'box', { color: '#f1f4f6', tags: '변기 욕실' }),
  P('bathtub', '욕조', 'BT-BT', '주방싱크/욕실', '위생도구', [1600, 800, 600], 'floor', 'box', { color: '#f1f4f6', tags: '욕조 욕실' }),
  P('shower-booth', '샤워부스', 'BT-SB', '주방싱크/욕실', '위생도구', [900, 900, 2000], 'floor', 'box', { color: '#dbe7ec', tags: '샤워 부스 욕실' }),
  // 조명
  P('light-ceiling', '원형 천장등', 'LT-CL', '조명', '천장등', [500, 500, 120], 'ceiling', 'lamp', { color: '#fff3c4', tags: '조명 천장등 등' }),
  P('light-pendant', '펜던트 조명', 'LT-PD', '조명', '천장등', [300, 300, 600], 'ceiling', 'lamp', { color: '#fff3c4', tags: '조명 펜던트 식탁등', asset: 'light-pendant' }),
  P('light-downlight', '매입 다운라이트', 'LT-DL', '조명', '천장등', [120, 120, 80], 'ceiling', 'lamp', { color: '#fff3c4', tags: '조명 다운라이트 매입' }),
  P('light-fluorescent', '형광등 2등', 'LT-FL', '조명', '천장등', [1250, 250, 100], 'ceiling', 'box', { color: '#fff3c4', tags: '조명 형광등' }),
  P('light-wall', '벽등', 'LT-WL', '조명', '벽등', [200, 150, 300], 'wall', 'lamp', { zDefault: 1800, color: '#fff3c4', tags: '조명 벽등 브라켓' }),
  // 환기 설비 — 조리기구·후드(계획 3). 엑셀 후드·조리기구로 대체되었다(풍량 씨앗 equip은 그대로 — 옛 프로젝트의 풍량이 같다).
  P('hood-box', '천장형 배기 후드(박스형)', 'VH-BX', '환기 설비', '후드', [1600, 1200, 600], 'ceiling', 'hood', { kind: 'equipment', equip: { type: 'hood' }, color: '#c6ccd2', tags: '후드 배기 환기 천장 조리' }),
  P('hood-box-filter', '천장형 배기 후드(박스·필터)', 'VH-BF', '환기 설비', '후드', [1800, 1100, 600], 'ceiling', 'hood', { kind: 'equipment', equip: { type: 'hood', filter: true, faceVelocity: 0.7 }, color: '#c6ccd2', tags: '후드 배기 환기 필터' }),
  P('range-gas-high', '가스높은렌지 3구형', 'VC-RG3', '환기 설비', '조리기구', [1200, 750, 850], 'floor', 'appliance', { kind: 'equipment', equip: { type: 'appliance', kind: 'range', heat: 'gas' }, color: '#b9c0c7', tags: '렌지 가스 조리기구' }),
  P('ricecooker-gas', '가스자동취반기 150인용', 'VC-RC150', '환기 설비', '조리기구', [1000, 800, 900], 'floor', 'appliance', { kind: 'equipment', equip: { type: 'appliance', kind: 'ricecooker', heat: 'gas' }, color: '#b9c0c7', tags: '취반기 밥솥 가스 조리기구' }),
  P('soup-kettle', '국솥', 'VC-SK', '환기 설비', '조리기구', [900, 900, 900], 'floor', 'appliance', { kind: 'equipment', equip: { type: 'appliance', kind: 'soupkettle', heat: 'gas' }, color: '#b9c0c7', tags: '국솥 조리기구' }),
  P('wok-kettle', '볶음솥', 'VC-WK', '환기 설비', '조리기구', [1000, 1000, 900], 'floor', 'appliance', { kind: 'equipment', equip: { type: 'appliance', kind: 'wok', heat: 'gas' }, color: '#b9c0c7', tags: '볶음솥 조리기구' }),
  P('griddle-electric', '전기부침기', 'VC-GR', '환기 설비', '조리기구', [1200, 750, 850], 'floor', 'appliance', { kind: 'equipment', equip: { type: 'appliance', kind: 'griddle', heat: 'electric' }, color: '#b9c0c7', tags: '부침기 전기 조리기구' }),
  P('steamer-combi', '콤비스티머 20단', 'VC-ST20', '환기 설비', '조리기구', [1000, 900, 1800], 'floor', 'appliance', { kind: 'equipment', equip: { type: 'appliance', kind: 'steamer', heat: 'electric' }, color: '#b9c0c7', tags: '스티머 콤비 조리기구' }),
  P('dishwasher-conveyor', '컨베이어 식기세척기', 'VC-DW', '환기 설비', '조리기구', [2400, 800, 1500], 'floor', 'appliance', { kind: 'equipment', equip: { type: 'appliance', kind: 'dishwasher', heat: 'electric' }, color: '#c6ccd2', tags: '세척기 식기세척기 조리기구' }),
];

export const LEGACY_PRODUCTS = [...BASE_LEGACY, ...EXTRA_PRODUCTS].map(p => ({ ...p, hidden: true }));
