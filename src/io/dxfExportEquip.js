// 정규화 DXF의 기구(2026-10-13 · 계획 14 Task E). 왜: 계획 12의 정규화 DXF는 벽·기둥·개구부·실명만 썼다 — CAD에서 벽을 고쳐 다시 들여오면
// 기구(사동중 226개)가 모두 사라져 왕복 고리가 기구에서 끊겼다(안내 §3 "정규화 DXF에는 기구가 들어가지 않습니다"). 이제 기구 하나 = `EQUIP`
// 레이어의 INSERT 하나이고, 다시 들여오면 equipment.js가 이름·크기·자리·제품 그대로 세운다(어휘 매칭 없이 — io/dxf/equipName.js).
//  - 대상: 제품·설비 아이템(kind product · equipment) — 도면에서 가져온 것도, 사람이 놓은 것도. 문·창·통로(kind door · window · opening)와
//    기둥(column)은 dxfExport.js가 제 레이어(OPENING · COLUMN)로 쓴다.
//  - 블록: 이름 `EQ-<이름>-<W>x<D>x<H>@<productId>`(형식의 정본은 equipName.js — 크기까지 같은 전체 이름이면 블록 하나) · 도형 = 원점이 가운데인
//    W × D 닫힌 사각형 + 가운데 이름 글자(높이 150 — 가져오기의 실명 후보 200~600과 제목 ≥ 600 밖이라 방 이름·제목이 되지 않는다).
//    블록 안 엔티티는 레이어 0이다 — INSERT의 EQUIP을 물려받는다(explode 규칙 ①, CAD도 같다). EQUIP은 가져오기 역할 '기구'(classify 'equip')라
//    벽·개구부 판정에 끼지 않는다.
//  - 글자는 MTEXT(붙임점 5 = 가운데)다: TEXT를 가운데 맞춤으로 쓰면 CAD가 다시 저장할 때 10/20을 왼쪽 아래로 다시 계산한다(dxfExport.js의 실명과 같은 까닭).
//  - INSERT: 자리 = 아이템 가운데(앱 → DXF는 y만 뒤집는다), 회전 = −rot(앱 y가 아래라 기둥과 같은 부호), 좌우 뒤집기(flipH) = x 배율 −1,
//    앞뒤 뒤집기(flipV) = y 배율 −1(가져오기가 배율 부호로 되돌린다). 삽입점의 높이(30)는 아이템 z다 — CAD 3D에서 제 높이에 보인다. 지금
//    가져오기는 이 값을 읽지 않는다(explode가 INSERT z를 버린다 — 부착·z는 이름 어휘·제품에서 다시 정한다, equipName.eqPlacement).
// 이 파일은 DOM을 모른다.
import { num } from './dxfExportTemplate.js';
import { eqBlockName, EQ_LAYER } from './dxf/equipName.js';

export const EQUIP_TEXT_H = 150;
const KINDS = new Set(['product', 'equipment']);
const D = p => [p[0], -p[1]];
const clean = s => String(s ?? '').replace(/[\r\n\t]+/g, ' ').replace(/[\\{}]/g, '').trim();
const deg = v => ((Number(v) || 0) % 360 + 360) % 360;

// 정규화 DXF로 나가는 기구 아이템인가 — 문·창·통로·기둥은 kind가 다르다(카탈로그 hole · column). productId로도 한 번 더 막는다(옛 파일).
export const isExportEquip = it => KINDS.has(it?.kind) && !/^(door-|window-)/.test(it.productId ?? '') && it.productId !== 'opening-pass';

// floor → { blocks: [{ name, entities }], entities: [INSERT…], count }. dxfDocument가 블록마다 BLOCK_RECORD·BLOCK 정의를 쓴다(핸들·$HANDSEED 포함).
export function equipExport(floor) {
  const blocks = new Map(), entities = [];
  for (const it of floor?.items ?? []) {
    if (!isExportEquip(it)) continue;
    const size = it.size ?? [600, 600, 600], name = clean(it.name) || it.productId || 'item';
    const block = eqBlockName(name, size, it.productId);
    if (!blocks.has(block)) {
      const [w, d] = block.match(/-(\d+)x(\d+)x\d+@[^@]*$/).slice(1).map(Number);
      const rect = [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]];
      blocks.set(block, { name: block, entities: [
        { type: 'LWPOLYLINE', layer: '0', body: [[100, 'AcDbPolyline'], [90, 4], [70, 1], [43, 0], ...rect.flatMap(p => [[10, num(p[0])], [20, num(p[1])]])] },
        { type: 'MTEXT', layer: '0', body: [[100, 'AcDbMText'], [10, 0], [20, 0], [30, 0], [40, EQUIP_TEXT_H], [41, 0], [71, 5], [72, 1], [1, name], [7, 'Standard']] },
      ] });
    }
    const c = D(it.pos ?? [0, 0]);
    entities.push({ type: 'INSERT', layer: EQ_LAYER, body: [[100, 'AcDbBlockReference'], [2, block], [10, num(c[0])], [20, num(c[1])], [30, num(it.z ?? 0)],
      [41, it.flipH ? -1 : 1], [42, it.flipV ? -1 : 1], [43, 1], [50, num(deg(-(it.rot ?? 0)))]] });
  }
  return { blocks: [...blocks.values()], entities, count: entities.length };
}
