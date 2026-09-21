// 실시간 견적서(순수 계산). 제품은 카탈로그 단가 × 수량, 마감재는 m² 단가 × 면적.
// 실판매 연동은 범위 밖이므로 단가는 정적 값이다.
import { productById, fmtSize } from '../products/catalog.js';
import { materialById } from '../materials/catalog.js';
import { faceArea } from '../state/materialOps.js';
import { wallLength } from '../geom/walls.js';
import { segmentLength } from '../geom/ducts.js';

const round2 = n => Math.round(n * 100) / 100;

// 덕트 단가(원/m²). 아연도강판 제작·설치 기준의 정적 값이다(실판매 연동은 범위 밖 — 명세 §17).
export const DUCT_PRICE_PER_M2 = 68000;

// 덕트 물량은 표면적이다: 둘레 2(w + h) × 구간 길이. 같은 급배기·계통·단면은 한 줄로 합친다.
export function ductRows(floor) {
  const m = new Map();
  for (const d of floor.ducts ?? []) {
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
  // ducts는 빈 배열이어도 늘 함께 돌려준다 — estimateCsv·estimateDialog가 rows.ducts를 읽는 자리를 한 곳으로 둔다.
  const ducts = ductRows(floor);
  const total = products.reduce((s, r) => s + r.total, 0) + materials.reduce((s, r) => s + r.total, 0) + ducts.reduce((s, r) => s + r.total, 0);
  return { products, materials, ducts, total };
}

// 엑셀이 한글을 깨뜨리지 않게 BOM으로 시작한다. 쉼표·따옴표가 든 이름은 감싸 준다.
const cell = v => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
export function estimateCsv(rows) {
  const lines = ['견적서', '구분,이름,코드,규격,수량,단가,금액'];
  for (const r of rows.products) lines.push(['제품', r.name, r.code, r.size, r.qty, r.unitPrice, r.total].map(cell).join(','));
  for (const r of rows.materials) lines.push(['마감재', r.name, r.id, `${r.areaM2} m²`, 1, r.unitPrice, r.total].map(cell).join(','));
  for (const r of rows.ducts ?? []) lines.push(['덕트', `${r.kind === 'supply' ? '급기' : '배기'} ${r.system}`, r.size, `${r.lengthM} m / ${r.areaM2} m²`, 1, r.unitPrice, r.total].map(cell).join(','));
  lines.push(`합계,,,,,,${rows.total}`);
  return `﻿${lines.join('\n')}`;
}
