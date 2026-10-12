// 실시간 견적서(순수 계산). 제품은 카탈로그 단가 × 수량, 마감재는 m² 단가 × 면적, 덕트는 표면적 단가.
// **숨긴 것은 세지 않는다**(아이템·덕트 모두) — 풍량 집계(vent/airflow.js)와 같은 규칙이다(§12.5에서 통일했다).
// 레이어에서 감춘 것은 "이 도면에 없는 것"으로 다루고, 다시 보이게 하면 두 표에 함께 돌아온다.
// 실판매 연동은 범위 밖이므로 단가는 정적 값이다.
import { productById, fmtSize } from '../products/catalog.js';
import { materialById } from '../materials/catalog.js';
import { faceArea, explicitMat } from '../state/materialOps.js';
import { wallLength } from '../geom/walls.js';
import { segmentLength } from '../geom/ducts.js';
import { DRAWING_CATEGORY } from './estimateTable.js';

const round2 = n => Math.round(n * 100) / 100;

// 덕트 단가(원/m²). 아연도강판 제작·설치 기준의 정적 값이다(실판매 연동은 범위 밖 — 명세 §17).
export const DUCT_PRICE_PER_M2 = 68000;

// 덕트 물량은 표면적이다: 둘레 2(w + h) × 구간 길이. 같은 급배기·계통·단면은 한 줄로 합친다.
export function ductRows(floor) {
  const m = new Map();
  for (const d of floor.ducts ?? []) {
    if (d.hidden) continue;                              // 숨긴 덕트는 세지 않는다(풍량과 같은 규칙)
    const system = String(d.system ?? '').trim() || '미지정';
    for (let i = 0; i < d.segments.length; i++) {
      const s = d.segments[i];
      const len = segmentLength(d, i);
      if (!(len > 0)) continue;
      const size = `${Math.round(s.w)}×${Math.round(s.h)}`;
      const key = `${d.kind}|${system}|${size}`;
      const row = m.get(key) ?? { key, system, kind: d.kind, size, lengthM: 0, areaM2: 0, unitPrice: DUCT_PRICE_PER_M2, total: 0 };
      row.lengthM += len / 1000;
      row.areaM2 += ((2 * (s.w + s.h)) / 1000) * (len / 1000);
      m.set(key, row);
    }
  }
  // 소수는 마지막에 한 번만 맞춘다(구간마다 반올림하면 합계가 어긋난다). 금액은 그 표시값으로 낸다.
  return [...m.values()]
    .map(r => { const areaM2 = round2(r.areaM2); return { ...r, lengthM: round2(r.lengthM), areaM2, total: Math.round(areaM2 * r.unitPrice) }; })
    .sort((a, b) => a.system.localeCompare(b.system, 'ko') || a.size.localeCompare(b.size));
}

// 견적 표·CSV의 "구분" 칸은 도면 기구 행을 '제품' 대신 이 이름으로 부른다(정의는 잎 모듈 estimateTable.js).
export { DRAWING_CATEGORY };

// 제품 행(견적서·시방서 공용). 묶음 키는 `productId|이름|평면 두 변(정렬)×높이`이고 행의 productId 필드는 제품 id 그대로다.
// 왜(2026-10-12 · 계획 13 Task 5 · 사전 검토 I-1): productId 하나로 묶고 첫 아이템의 이름·크기를 행에 썼더니,
// 사동중 가져오기의 도면 기구(equip-generic ≈ 205개 — 이름 = 도면 블록 이름)가 "운반카 튀김 620 · 수량 205" 한 줄로,
// 제품으로 맞춘 `세정대 1조 900-750`·`1500-750`이 첫 크기 한 줄로 뭉쳤다. 이름·크기가 같은 것만 수량으로 센다.
// 평면 두 변은 정렬해 키에 넣는다(리뷰 I-1): DXF 가져오기는 축 정렬 기구의 방향을 rot 0 + w/d 교환으로 적으므로 같은
// `고정식작업대 1500-750`이 1500×750과 750×1500 두 행으로 갈렸다(사동 8 · 신상 A 6). 표시 규격은 첫 아이템 그대로다.
// 10 mm 반올림은 하지 않는다 — fmtSize의 1 mm뿐(실제 규격을 틀리게 적지 않게).
// 기둥(kind 'column')은 예전처럼 productId 하나로 묶는다(리뷰 I-2 · 컨트롤러 결정): 사는 물건이 아닌 구조물(0원)이고
// 크기가 기둥마다 도면 측정값이라, 크기로 가르면 기구 없는 사동중 가져오기가 7 → 45행(기둥 27행)이 됐다.
// 크기를 바꾼 손 배치 제품·DXF 문·창은 크기별 행이 된다(옛 행은 첫 아이템의 폭만 적어 틀렸다 — 사동 7 → 19, 내곡 6 → 12).
// 시방서(specSheet.js)가 같은 함수를 써서 두 문서의 행·수량이 한 키에서 나온다.
// 순서: 일반 제품 → 도면 기구(가격 0인 도면 요소를 끝에 모은다) → 이름 → 규격.
// 가져온 기구는 제품을 바꾸기 전까지 0원(2026-10-12 · 계획 13 최종 리뷰 F-1 · 컨트롤러 결정): DXF 가져오기가 카탈로그 제품으로 맞춘 기구(dxfBlock이 있고
// productId === dxfProduct)는 '도면 기구' 구분의 단가 0 행이다. 어휘표가 대용 제품을 일부러 쓰므로(취반기(전기) → 가스 취반기 · 오븐 → 콤비스티머)
// 그 예시 단가는 틀린 값이고, 사동 견적이 14.25 M → 145.87 M원(≈ 10배)으로 뛰었다. 사람이 제품을 바꾸면(replaceProduct → productId ≠ dxfProduct)
// 그때부터 그 제품 가격이다. 코드 칸은 맞춘 제품 코드 그대로(무엇으로 맞췄는지 보인다). 키에 표지를 넣어 손으로 놓은 같은 제품과 섞이지 않는다.
export const isDrawnItem = it => !!it?.dxfBlock && !!it.dxfProduct && it.productId === it.dxfProduct;
export function productRows(items) {
  const m = new Map();
  for (const it of items ?? []) {
    if (!it || it.kind === 'opening' || it.hidden) continue;   // 벽 구멍은 살 물건이 아니고, 숨긴 것은 세지 않는다
    const p = productById(it.productId);
    const s = it.size ?? p?.size ?? [0, 0, 0];
    const name = it.name || p?.name || '제품', size = fmtSize(s);
    const plan = fmtSize(s[0] >= s[1] ? s : [s[1], s[0], s[2]]);   // 방향과 무관한 규격(키 전용)
    const drawn = isDrawnItem(it);
    const key = !it.productId ? it.id : it.kind === 'column' ? it.productId : `${it.productId}|${name}|${plan}${drawn ? '|도면' : ''}`;
    const row = m.get(key);
    if (row) { row.qty += 1; row.total = row.qty * row.unitPrice; continue; }
    const unitPrice = drawn ? 0 : p?.price ?? 0;
    m.set(key, { key, productId: it.productId || it.id, name, code: it.code || p?.code || '', size, category: drawn ? DRAWING_CATEGORY : p?.category ?? '', qty: 1, unitPrice, total: unitPrice });
  }
  const drawn = r => (r.category === DRAWING_CATEGORY ? 1 : 0);
  return [...m.values()].sort((a, b) => drawn(a) - drawn(b) || a.name.localeCompare(b.name, 'ko') || a.size.localeCompare(b.size, 'ko', { numeric: true }));
}

export function estimateRows(floor) {
  const area = new Map();
  const add = (a, m2) => { if (a?.id && m2 > 0) area.set(a.id, (area.get(a.id) ?? 0) + m2); };
  for (const w of floor.walls ?? []) {
    if (w.virtual) continue;            // 구획선은 벽이 아니다
    const len = wallLength(w);
    // 면 면적의 정의는 materialOps.faceArea 한 곳에만 둔다(속성 패널과 견적이 어긋나지 않게 — I-17).
    // 벽은 안·밖 면적이 같으므로 'in'으로 한 번 구해 두 면에 쓴다. len은 영역 폭 계산에 계속 필요하다.
    // 개구부(문·창)는 재질을 바르지 않으므로 순면적(net)으로 뺀다 — 실제 주문량이 과다해지지 않게.
    const full = faceArea(floor, { kind: 'wall', id: w.id, side: 'in' }, { netOpenings: true });
    for (const side of ['in', 'out']) {
      let covered = 0;
      for (const rg of w.regions?.[side] ?? []) {
        const u = rg.kind === 'band' ? len : rg.u1 - rg.u0;
        const m2 = (u * (rg.z1 - rg.z0)) / 1e6;
        add(rg.mat, m2);
        covered += m2;
      }
      // 영역이 덮은 부분은 뺀다. 영역끼리 u·z 구간이 겹치면 각각 세어 합계가 실제 벽 면적을 넘을 수
      // 있다(겹침 금지는 범위 밖 — 마감재 편집기는 순서대로 덧칠하는 모델이다, M-32).
      // 물량은 **명시 지정**만 센다(리뷰 I-1): 레거시 문자열은 "아직 고르지 않은 면"이고, 그것을
      // 세면 도면을 열기만 해도 견적 총액이 생긴다. 3D의 무늬 판정(build.js)과 같은 조회다.
      add(explicitMat(w, side), Math.max(0, full - covered));
    }
  }
  for (const r of floor.rooms ?? []) {
    const m2 = faceArea(floor, { kind: 'floor', id: r.id });   // 검출된 실면적(방 폴리곤)
    add(explicitMat(r, 'floor'), m2);
    if (!r.hideCeiling) add(explicitMat(r, 'ceiling'), m2);
  }

  const materials = [...area.entries()].map(([id, m2]) => {
    const m = materialById(id);
    const areaM2 = round2(m2), unitPrice = m?.pricePerM2 ?? 0;
    return { id, name: m?.name ?? id, areaM2, unitPrice, total: Math.round(areaM2 * unitPrice) };
  }).sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  const products = productRows(floor.items);
  // ducts는 빈 배열이어도 늘 함께 돌려준다 — estimateCsv·estimateDialog가 rows.ducts를 읽는 자리를 한 곳으로 둔다.
  const ducts = ductRows(floor);
  const total = products.reduce((s, r) => s + r.total, 0) + materials.reduce((s, r) => s + r.total, 0) + ducts.reduce((s, r) => s + r.total, 0);
  return { products, materials, ducts, total };
}

// CSV의 열 정의는 io/estimateTable.js 한 곳이다(§16.2): 화면 표와 같은 행에서 만들어지므로
// "화면은 68,000원/m²인데 CSV는 수량 1 · 68000"이던 어긋남이 생길 자리가 없다(감사 §3).
export { estimateCsvText as estimateCsv } from './estimateTable.js';
