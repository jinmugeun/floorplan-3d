// 마감재 카탈로그(순수 데이터). 실판매 자재 DB는 범위 밖이라 제조사는 모두 '오늘의집'으로 두고
// base = 바탕색, accent = 무늬색, pattern = 무늬 종류, scale = 무늬 한 칸의 실제 크기(mm),
// pricePerM2 = m²당 단가(원, 정적)로 둔다. 견적서(estimate.js)가 면적과 곱한다.
// 렌더 필드(모두 선택 — 없으면 예전 동작 · 계획 18 설계 §2.1): photo = 사진 폴더(문자열 하나, 또는 맵마다 { color, normal, rough } — photoDirs) ·
// tint = 선형 RGB(사진 색에 곱하고, 사진이 없으면 3D 재질 색 그대로) · roughness · normalScale · gloss = 환경 반사 세기(0·없으면 환경 맵 없음).
export const MATERIAL_CATEGORIES = ['페인트', '벽지', '대리석', '마루/잔디', '타일', '벽돌', '콘크리트', '시멘트', '테라조', '바닥 코팅', '카페트', '스테인리스'];
export const MATERIAL_PATTERNS = ['solid', 'stripe', 'tile', 'plank', 'brick', 'speckle', 'marble', 'concrete', 'carpet', 'steel'];

const M = (id, name, code, category, base, accent, pattern, scale, pricePerM2) =>
  ({ id, name, code, category, maker: '오늘의집', base, accent, pattern, scale, pricePerM2 });
// 바닥 코팅 15종(계획 18): 코드 FC-01~15(MMA → UD200 → MF) · 임시 단가 45,000원/m²(실제 단가는 사용자가 알려 주면 바꾼다).
// base = 제조사 견본 캡처의 평균색(2D·견본·사진 도착 전 색). tint·roughness·normalScale·gloss = 시안 2판(app/.superpowers/sdd/scratch/floor-colors
// report.txt · result.json)이 앱 조명 아래에서 견본 평균에 맞춘 값. MMA = 칩 무늬 + 규사 무광(mma-grit 공용) · UD200 = 흰 바탕 골재 요철
// (ud200 공용 — 색은 tint) · MF = 사진 없는 매끈한 단색(tint가 3D 색) + 반광.
const FC = (n, id, name, base, accent, pattern, scale, render) =>
  ({ ...M(id, name, `FC-${String(n).padStart(2, '0')}`, '바닥 코팅', base, accent, pattern, [scale, scale], 45000), ...render });
const mma = (n, c, name, base, chip, tint) => FC(n, `mma-${c}`, `MMA ${name}`, base, chip, 'speckle', 1200,
  { photo: { color: `mma-${c}`, normal: 'mma-grit', rough: 'mma-grit' }, tint, roughness: 1, normalScale: 1 });
const ud200 = (n, c, name, base, accent, tint) => FC(n, `ucrete-ud200-${c}`, `Ucrete UD200 ${name}`, base, accent, 'concrete', 1000,
  { photo: 'ud200', tint, roughness: 1, normalScale: 1.8, gloss: 0.1 });
const mf = (n, c, name, base, accent, tint) => FC(n, `ucrete-mf-${c}`, `Ucrete MF ${name}`, base, accent, 'solid', 1000,
  { tint, roughness: 0.6, gloss: 0.15 });

export const MATERIALS = [
  // 페인트
  M('paint-white', '무광 화이트 페인트', 'PT-01', '페인트', '#f5f5f3', '#e8e8e4', 'solid', [1000, 1000], 12000),
  M('paint-ivory', '아이보리 페인트', 'PT-02', '페인트', '#f2ece0', '#e6ddca', 'solid', [1000, 1000], 12000),
  M('paint-gray', '웜 그레이 페인트', 'PT-03', '페인트', '#cfd2d4', '#bcc0c3', 'solid', [1000, 1000], 13000),
  M('paint-navy', '네이비 페인트', 'PT-04', '페인트', '#33415c', '#2a3650', 'solid', [1000, 1000], 15000),
  // 벽지
  M('wallpaper-beige', '민무늬 베이지 벽지', 'WP-01', '벽지', '#ece3d4', '#ddd2bd', 'speckle', [600, 600], 15000),
  M('wallpaper-stripe', '그레이 스트라이프 벽지', 'WP-02', '벽지', '#eef0f2', '#c9ced4', 'stripe', [300, 600], 18000),
  M('wallpaper-linen', '린넨 텍스처 벽지', 'WP-03', '벽지', '#eae5da', '#d5cdbd', 'carpet', [500, 500], 21000),
  M('wallpaper-mint', '민트 패턴 벽지', 'WP-04', '벽지', '#dfeee7', '#b9d9cb', 'speckle', [600, 600], 25000),
  // 대리석
  M('marble-carrara', '카라라 대리석', 'MB-01', '대리석', '#f1f2f4', '#c2c7cf', 'marble', [1200, 1200], 180000),
  M('marble-calacatta', '칼라카타 대리석', 'MB-02', '대리석', '#f6f3ec', '#c9b48c', 'marble', [1200, 1200], 260000),
  M('marble-black', '블랙 마퀴나', 'MB-03', '대리석', '#2b2d31', '#8c9096', 'marble', [1200, 1200], 240000),
  M('marble-beige', '베이지 트래버틴', 'MB-04', '대리석', '#e6dbc7', '#c8b294', 'marble', [1200, 1200], 150000),
  // 마루/잔디
  M('wood-oak', '오크 원목마루', 'WD-01', '마루/잔디', '#d8b489', '#b98f61', 'plank', [1200, 190], 78000),
  M('wood-walnut', '월넛 원목마루', 'WD-02', '마루/잔디', '#8d6142', '#6b452d', 'plank', [1200, 190], 92000),
  M('wood-ash', '애쉬 강마루', 'WD-03', '마루/잔디', '#e2d4bd', '#c3b096', 'plank', [1200, 190], 52000),
  M('grass-lawn', '인조 잔디', 'WD-04', '마루/잔디', '#5f8a4a', '#476b36', 'carpet', [500, 500], 38000),
  // 타일
  { ...M('tile-white-300', '화이트 타일 300', 'TL-01', '타일', '#f4f5f6', '#cfd4d8', 'tile', [300, 300], 42000), gloss: 0.3 },   // 급식실 벽 기본(계획 17) — 약한 광택
  M('tile-gray-600', '그레이 포세린 600', 'TL-02', '타일', '#c8cccf', '#a8adb2', 'tile', [600, 600], 58000),
  M('tile-mosaic-100', '모자이크 타일 100', 'TL-03', '타일', '#dfe9ec', '#9fc3cc', 'tile', [100, 100], 66000),
  M('tile-hex-black', '블랙 헥사 타일', 'TL-04', '타일', '#3a3f45', '#6f767e', 'tile', [200, 200], 70000),
  // 벽돌
  M('brick-red', '적벽돌', 'BR-01', '벽돌', '#a8563c', '#e2dcd2', 'brick', [230, 60], 72000),
  M('brick-white', '화이트 페인티드 벽돌', 'BR-02', '벽돌', '#eeeae4', '#cfc9c0', 'brick', [230, 60], 68000),
  M('brick-gray', '그레이 벽돌', 'BR-03', '벽돌', '#8f9498', '#dcdfe2', 'brick', [230, 60], 74000),
  M('brick-terra', '테라코타 벽돌', 'BR-04', '벽돌', '#c07a52', '#ece3d6', 'brick', [230, 60], 90000),
  // 콘크리트
  M('concrete-gray', '노출 콘크리트', 'CR-01', '콘크리트', '#b9bcbf', '#9ea2a6', 'concrete', [1500, 1500], 34000),
  M('concrete-dark', '다크 콘크리트', 'CR-02', '콘크리트', '#7d8186', '#666a6f', 'concrete', [1500, 1500], 36000),
  M('concrete-polish', '폴리싱 콘크리트', 'CR-03', '콘크리트', '#cdd0d2', '#b1b5b8', 'concrete', [1500, 1500], 45000),
  M('concrete-panel', '콘크리트 패널', 'CR-04', '콘크리트', '#c4c7ca', '#8e9296', 'tile', [900, 1800], 41000),
  // 시멘트
  M('cement-mortar', '시멘트 모르타르', 'CM-01', '시멘트', '#c6c2b9', '#aaa69d', 'concrete', [1500, 1500], 26000),
  M('cement-gray', '그레이 시멘트', 'CM-02', '시멘트', '#a9a7a2', '#8e8c88', 'concrete', [1500, 1500], 28000),
  M('cement-white', '화이트 시멘트', 'CM-03', '시멘트', '#e3e0d9', '#c8c4bb', 'concrete', [1500, 1500], 32000),
  M('cement-screed', '스크리드 마감', 'CM-04', '시멘트', '#bdb9b0', '#a09c94', 'speckle', [1500, 1500], 35000),
  // 테라조
  M('terrazzo-white', '화이트 테라조', 'TZ-01', '테라조', '#f0eee9', '#9aa0a6', 'speckle', [800, 800], 88000),
  M('terrazzo-black', '블랙 테라조', 'TZ-02', '테라조', '#3c3f43', '#d6d9dc', 'speckle', [800, 800], 96000),
  M('terrazzo-pink', '핑크 테라조', 'TZ-03', '테라조', '#eddcd8', '#b98a86', 'speckle', [800, 800], 104000),
  M('terrazzo-green', '그린 테라조', 'TZ-04', '테라조', '#dfe7de', '#7f9a82', 'speckle', [800, 800], 110000),
  // 바닥 코팅(계획 18). 그레이 칩 에폭시(계획 17 Task 7 · 새 방 기본)는 id·이름·코드·단가를 그대로 두고 이 묶음으로 옮겼다(저장된 프로젝트·견적 행이
  // 바뀌지 않게). 색 지도는 ambientCG Granite002A(CC0) 그대로, 법선·거칠기는 mma-grit(무광 — 그라나이트 거칠기 맵 평균 0.023이 거울 반사점을 냈다).
  { ...M('epoxy-chip-gray', '그레이 칩 에폭시', 'TZ-05', '바닥 코팅', '#a7a7a3', '#6f6f6c', 'speckle', [1200, 1200], 45000),
    photo: { color: 'granite-gray', normal: 'mma-grit', rough: 'mma-grit' }, roughness: 1, normalScale: 1, gloss: 0.25 },
  mma(1, 'darkgray', '다크그레이', '#83868e', '#313336', [1.0496, 1.0525, 1.0625]),
  mma(2, 'gray', '그레이', '#bbbdc2', '#414143', [1.132, 1.1291, 1.1334]),
  mma(3, 'black', '블랙', '#414244', '#bec2cb', [0.6958, 0.6952, 0.7203]),
  mma(4, 'beige', '베이지', '#a38661', '#29221b', [1.0627, 1.0601, 1.0392]),
  mma(5, 'yellow', '옐로우', '#bab1a6', '#3c3a37', [1.1296, 1.1277, 1.131]),
  ud200(6, 'yellow', '옐로우', '#bb913a', '#a67e21', [0.6364, 0.3616, 0.0427]),
  ud200(7, 'cream', '크림', '#e9d89f', '#cbb98b', [1.0645, 0.8905, 0.445]),
  ud200(8, 'red', '레드', '#9d4f42', '#95473a', [0.431, 0.0897, 0.0588]),
  ud200(9, 'green', '그린', '#5a7e48', '#4c6f3b', [0.1205, 0.2619, 0.0734]),
  ud200(10, 'gray', '그레이', '#87847c', '#77746d', [0.3047, 0.2891, 0.2545]),
  mf(11, 'yellow', '옐로우', '#e38a1d', '#e2891c', [0.693, 0.2199, 0.0005]),
  mf(12, 'cream', '크림', '#dcc592', '#dbc590', [0.6435, 0.4997, 0.2516]),
  mf(13, 'red', '레드', '#a04836', '#9f4835', [0.312, 0.0468, 0.0209]),
  mf(14, 'green', '그린', '#38542e', '#38542e', [0.0236, 0.0688, 0.0125]),
  mf(15, 'gray', '그레이', '#7d7e86', '#7d7b84', [0.1774, 0.1781, 0.2074]),
  // 카페트
  M('carpet-gray', '그레이 카페트', 'CP-01', '카페트', '#a8acb0', '#8f9397', 'carpet', [500, 500], 32000),
  M('carpet-navy', '네이비 카페트', 'CP-02', '카페트', '#3b4a63', '#2e3b50', 'carpet', [500, 500], 36000),
  M('carpet-beige', '베이지 카페트', 'CP-03', '카페트', '#ddd2c0', '#c4b8a3', 'carpet', [500, 500], 34000),
  M('carpet-green', '올리브 카페트', 'CP-04', '카페트', '#7d8a63', '#67734f', 'carpet', [500, 500], 48000),
  // 스테인리스
  M('steel-brush', '브러시 스테인리스', 'SS-01', '스테인리스', '#c3c8cc', '#a5abb0', 'steel', [1000, 1000], 96000),
  M('steel-mirror', '미러 스테인리스', 'SS-02', '스테인리스', '#dfe3e6', '#bcc2c7', 'solid', [1000, 1000], 128000),
  M('steel-hairline', '헤어라인 스테인리스', 'SS-03', '스테인리스', '#cbd0d4', '#b0b6bb', 'steel', [1000, 1000], 112000),
  M('steel-embossed', '엠보싱 스테인리스', 'SS-04', '스테인리스', '#b9bfc4', '#9aa1a7', 'tile', [200, 200], 150000),
];

const byId = new Map(MATERIALS.map(m => [m.id, m]));
export const materialById = id => byId.get(id) ?? null;
export const materialsIn = category => MATERIALS.filter(m => m.category === category);
// 제품 검색과 같은 규칙: 카테고리 안에 있어도 항상 전체를 찾는다.
export function searchMaterials(q) {
  const s = String(q ?? '').trim().toLowerCase();
  if (!s) return [];
  return MATERIALS.filter(m => `${m.name} ${m.code} ${m.category} ${m.maker}`.toLowerCase().includes(s));
}

// 사진 폴더 해석(계획 18 설계 §2.1 — 3D 로더 texture.photoTextures와 마감재 패널 견본이 같은 함수를 쓴다). photo가 문자열이면 세 장이 한 폴더,
// 객체 { color, normal, rough }이면 맵마다 폴더가 다르다(공용 맵 mma-grit · ud200을 한 번만 받기 위해). 사진이 없거나 모양이 틀리면 null.
export function photoDirs(material) {
  const p = material?.photo;
  if (typeof p === 'string') return p ? { color: p, normal: p, rough: p } : null;
  if (!p || typeof p !== 'object') return null;
  const { color, normal, rough } = p;
  return [color, normal, rough].every(d => typeof d === 'string' && d) ? { color, normal, rough } : null;
}
// 폴더 묶음 키 — 로더의 세 장 묶음 캐시 · 공유 복제본 · 도착 알림 인자
export const photoKey = dirs => `${dirs.color}|${dirs.normal}|${dirs.rough}`;
// 색 지도 폴더를 카탈로그 재질 둘 이상이 나눠 쓰는가(UD200의 흰 바탕 지도) — 견본은 base를 칠하고 그 위에 곱해 그린다(설계 §4).
const colorUse = new Map();
for (const m of MATERIALS) { const d = photoDirs(m)?.color; if (d) colorUse.set(d, (colorUse.get(d) ?? 0) + 1); }
export const sharesColorMap = material => (colorUse.get(photoDirs(material)?.color) ?? 0) > 1;
