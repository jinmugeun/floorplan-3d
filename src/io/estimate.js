// 실시간 견적서(순수 계산). 제품은 카탈로그 단가 × 수량, 마감재는 m² 단가 × 면적.
// 실판매 연동은 범위 밖이므로 단가는 정적 값이다.
import { productById, fmtSize } from '../products/catalog.js';
import { materialById } from '../materials/catalog.js';
import { faceArea } from '../state/materialOps.js';
import { wallLength } from '../geom/walls.js';

const round2 = n => Math.round(n * 100) / 100;

export function estimateRows(floor) {
  const prod = new Map();
  for (const it of floor.items ?? []) {
    if (it.kind === 'opening') continue;                 // 벽에 뚫는 구멍은 살 물건이 아니다
    const p = productById(it.productId);
    const key = it.productId || it.id;
    const row = prod.get(key);
    if (row) { row.qty += 1; row.total = row.qty * row.unitPrice; continue; }
    const unitPrice = p?.price ?? 0;
    prod.set(key, { productId: key, name: it.name || p?.name || '제품', code: it.code || p?.code || '', size: fmtSize(it.size), qty: 1, unitPrice, total: unitPrice });
  }

  const area = new Map();
  const add = (a, m2) => { if (a?.id && m2 > 0) area.set(a.id, (area.get(a.id) ?? 0) + m2); };
  for (const w of floor.walls ?? []) {
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
      add(side === 'out' ? w.matOut : w.matIn, Math.max(0, full - covered));
    }
  }
  for (const r of floor.rooms ?? []) {
    const m2 = faceArea(floor, { kind: 'floor', id: r.id });   // 검출된 실면적(방 폴리곤)
    add(r.floorMat, m2);
    if (!r.hideCeiling) add(r.ceilingMat, m2);
  }

  const materials = [...area.entries()].map(([id, m2]) => {
    const m = materialById(id);
    const areaM2 = round2(m2), unitPrice = m?.pricePerM2 ?? 0;
    return { id, name: m?.name ?? id, areaM2, unitPrice, total: Math.round(areaM2 * unitPrice) };
  }).sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  const products = [...prod.values()].sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  const total = products.reduce((s, r) => s + r.total, 0) + materials.reduce((s, r) => s + r.total, 0);
  return { products, materials, total };
}

// 엑셀이 한글을 깨뜨리지 않게 BOM으로 시작한다. 쉼표·따옴표가 든 이름은 감싸 준다.
const cell = v => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
export function estimateCsv(rows) {
  const lines = ['견적서', '구분,이름,코드,규격,수량,단가,금액'];
  for (const r of rows.products) lines.push(['제품', r.name, r.code, r.size, r.qty, r.unitPrice, r.total].map(cell).join(','));
  for (const r of rows.materials) lines.push(['마감재', r.name, r.id, `${r.areaM2} m²`, 1, r.unitPrice, r.total].map(cell).join(','));
  lines.push(`합계,,,,,,${rows.total}`);
  return `﻿${lines.join('\n')}`;
}
