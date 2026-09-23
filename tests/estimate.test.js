import { describe, test, expect } from 'vitest';
import { createStore } from '../src/state/store.js';
import { createEmptyProject, activeFloor, createItem } from '../src/state/schema.js';
import { addWalls, addItem, updateRoom } from '../src/state/floorOps.js';
import { applyMaterial, setWallRegions } from '../src/state/materialOps.js';
import { rectWalls, wallLength } from '../src/geom/walls.js';
import { productById } from '../src/products/catalog.js';
import { materialById } from '../src/materials/catalog.js';
import { estimateRows, estimateCsv, ductRows, DUCT_PRICE_PER_M2 } from '../src/io/estimate.js';
import { normalizeDuct } from '../src/state/ductSchema.js';
import { estimateLines, estimateCsvText, csvFooter, EST_COLUMNS, EST_TABLE_COLUMNS, PRICE_NOTE } from '../src/io/estimateTable.js';

function setup() {
  const store = createStore(createEmptyProject());
  addWalls(store, rectWalls([0, 0], [4000.5, 3000.25], 200));
  return { store, floor: () => activeFloor(store.get()) };
}
const mat = id => ({ id, offset: [0, 0], angle: 0 });

describe('견적서 계산', () => {
  test('같은 제품은 수량으로 묶이고 금액이 단가 × 수량이다', () => {
    const a = setup();
    addItem(a.store, createItem(productById('chair-dining'), { pos: [1000, 1000] }));
    addItem(a.store, createItem(productById('chair-dining'), { pos: [1500, 1000] }));
    addItem(a.store, createItem(productById('dining-4'), { pos: [2000.5, 1500.25] }));
    const rows = estimateRows(a.floor());
    const chair = rows.products.find(r => r.productId === 'chair-dining');
    expect(chair.qty).toBe(2);
    expect(chair.unitPrice).toBe(productById('chair-dining').price);
    expect(chair.total).toBe(chair.unitPrice * 2);
    expect(chair.size).toBe('450×500×900');
    expect(chair.code).toBe('CH-DN');
    expect(rows.products).toHaveLength(2);
    expect(rows.total).toBe(chair.total + rows.products.find(r => r.productId === 'dining-4').total);
  });

  test('개구부는 제품 목록에 들어가지 않는다', () => {
    const a = setup();
    const wallId = a.floor().walls[0].id;
    addItem(a.store, createItem(productById('opening-pass'), { pos: [2000, 0], wallId, t: 0.5 }));
    addItem(a.store, createItem(productById('door-swing-900'), { pos: [1000, 0], wallId, t: 0.25 }));
    const rows = estimateRows(a.floor());
    expect(rows.products.map(r => r.productId)).toEqual(['door-swing-900']);
  });

  test('재질은 면적으로 합산되고 영역이 덮은 면적은 기본 재질에서 빠진다(소수 좌표)', () => {
    const a = setup();
    // 길이로 벽을 고른다(정규화가 순서를 바꿔도 같은 벽을 잡는다).
    const w = a.floor().walls.find(x => Math.abs(wallLength(x) - 4000.5) < 0.01);
    expect(w.height).toBe(2300);
    applyMaterial(a.store, { kind: 'wall', id: w.id, side: 'in' }, mat('paint-white'));
    setWallRegions(a.store, w.id, 'in', [{ kind: 'band', z0: 0, z1: 1000, mat: mat('tile-white-300') }]);
    const rows = estimateRows(a.floor());
    const tile = rows.materials.find(r => r.id === 'tile-white-300');
    const paint = rows.materials.find(r => r.id === 'paint-white');
    // 리터럴 기대값(프로덕션 공식을 베끼지 않는다 — M-26):
    // 띠 = 4000.5 × 1000 / 1e6 = 4.0005 → round2 4
    // 안쪽 남은 면 = 4000.5 × 2300 / 1e6 − 4.0005 = 5.20065 → round2 5.2
    // 바깥 면은 재질이 없으므로 paint-white는 안쪽 몫만 갖는다
    expect(tile.areaM2).toBe(4);
    expect(paint.areaM2).toBe(5.2);
    expect(tile.unitPrice).toBe(42000);                      // materialById('tile-white-300').pricePerM2
    expect(tile.total).toBe(4 * 42000);
    expect(paint.total).toBe(Math.round(5.2 * 12000));
    expect(materialById('tile-white-300').pricePerM2).toBe(42000); // 카탈로그 단가가 바뀌면 여기서 걸린다
  });

  test('벽 재질 면적은 문 등 개구부를 뺀 순면적(net)이다', () => {
    const a = setup();
    const w = a.floor().walls.find(x => Math.abs(wallLength(x) - 4000.5) < 0.01);
    expect(w.height).toBe(2300);
    applyMaterial(a.store, { kind: 'wall', id: w.id, side: 'in' }, mat('paint-white'));
    addItem(a.store, createItem(productById('door-swing-900'), { pos: [2000, 0], wallId: w.id, t: 0.5 }));
    const rows = estimateRows(a.floor());
    const paint = rows.materials.find(r => r.id === 'paint-white');
    // 순면적 = 4000.5 × 2300 / 1e6 − 900 × 2100 / 1e6 = 9.20115 − 1.89 = 7.31115 → round2 7.31
    expect(paint.areaM2).toBe(7.31);
  });

  test('바닥·천장 재질은 방 면적을 쓰고, 천장을 감추면 세지 않는다', () => {
    const a = setup();
    const roomId = a.floor().rooms[0].id;
    applyMaterial(a.store, { kind: 'floor', id: roomId }, mat('wood-oak'));
    applyMaterial(a.store, { kind: 'ceiling', id: roomId }, mat('paint-white'));
    let rows = estimateRows(a.floor());
    expect(rows.materials.find(r => r.id === 'wood-oak').areaM2).toBeCloseTo(Math.round(a.floor().rooms[0].area * 100) / 100, 2);
    expect(rows.materials.find(r => r.id === 'paint-white')).toBeTruthy();
    updateRoom(a.store, roomId, { hideCeiling: true });
    rows = estimateRows(a.floor());
    expect(rows.materials.find(r => r.id === 'paint-white')).toBeUndefined();
  });

  // 리뷰 I-1: 물량은 **명시 지정**만 센다. makeWall의 material·detectRooms의 floorMaterial까지
  // 세면 방 하나를 그린 것만으로 벽 4면 + 바닥이 견적 총액에 잡힌다 — 3D도 같은 조회를 쓴다.
  test('레거시 마감재 문자열은 물량에 잡히지 않는다(명시 지정만 센다)', () => {
    const a = setup();
    const f = a.floor();
    expect(f.walls[0].material).toBe('paint-white');
    expect(f.rooms[0].floorMaterial).toBe('wood-oak');
    expect(estimateRows(f).materials).toEqual([]);
    expect(estimateRows(f).total).toBe(0);
    applyMaterial(a.store, { kind: 'floor', id: f.rooms[0].id }, mat('wood-oak'));
    const rows = estimateRows(a.floor()).materials;
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe('wood-oak');
    expect(rows[0].areaM2).toBeCloseTo(Math.round(a.floor().rooms[0].area * 100) / 100, 2);
  });

  test('빈 층은 빈 견적이 된다', () => {
    const rows = estimateRows({ items: [], walls: [], rooms: [] });
    expect(rows).toEqual({ products: [], materials: [], ducts: [], total: 0 });
  });

  test('CSV는 BOM으로 시작하고 두 구역과 합계를 담는다', () => {
    const a = setup();
    addItem(a.store, createItem(productById('sofa-3'), { pos: [2000, 1500] }));
    applyMaterial(a.store, { kind: 'floor', id: a.floor().rooms[0].id }, mat('wood-oak'));
    const csv = estimateCsv(estimateRows(a.floor()));
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    const lines = csv.slice(1).split('\n');                               // BOM을 뗀 뒤 센다(1행이 머리글이다)
    expect(lines[0]).toBe('구분,이름,코드,규격,수량,단위,단가(원),금액(원)');   // §17.11(5): 1행이 머리글이고 통화는 열 이름에
    expect(csv).toContain('제품,3인 소파,SF-3P,2100×900×800,1,개,890000,890000');
    expect(csv).toContain('마감재,오크 원목마루');
    expect(lines.at(-2).startsWith('합계')).toBe(true);   // 마지막 줄은 단가 주석이다(§16.2)
  });

  test('덕트 물량은 둘레 × 길이의 표면적이고 같은 계통·단면은 한 줄로 합친다', () => {
    const floor = {
      walls: [], rooms: [], items: [],
      ducts: [
        normalizeDuct({ kind: 'exhaust', system: 'F-3', points: [[0, 0], [3000, 0], [3000, 2000.5]], segments: [{ w: 1000, h: 450, z: 2625 }] }),
        normalizeDuct({ kind: 'exhaust', system: 'F-3', points: [[0, 5000], [4000, 5000]], segments: [{ w: 1000, h: 450, z: 2625 }] }),
        normalizeDuct({ kind: 'supply', system: 'OA', points: [[0, 9000], [1000, 9000]], segments: [{ w: 500, h: 350, z: 2675 }] }),
      ],
    };
    const rows = ductRows(floor);
    expect(rows).toHaveLength(2);
    const f3 = rows.find(r => r.system === 'F-3');
    expect(f3.size).toBe('1000×450');
    // 소수 케이스(2000.5 mm)는 round2 전 9.0005 m / 26.10145 m²이고, ductRows가 마지막에 소수 둘째
    // 자리로 맞춘다(표시·금액이 그 값으로 나간다).
    expect(f3.lengthM).toBe(9);                                   // 3 + 2.0005 + 4 = 9.0005 → 9
    expect(f3.areaM2).toBe(26.1);                                 // 둘레 2(1.0 + 0.45) = 2.9 m → 26.10145 → 26.1
    expect(f3.unitPrice).toBe(DUCT_PRICE_PER_M2);
    expect(f3.total).toBe(Math.round(f3.areaM2 * DUCT_PRICE_PER_M2));
    expect(rows.map(r => r.system)).toEqual(['F-3', 'OA']);
  });

  test('견적 합계에 설비 단가와 덕트 물량이 함께 든다', () => {
    const hood = createItem(productById('hood-box'), { pos: [1000, 1000] });
    const floor = { walls: [], rooms: [], items: [hood], ducts: [normalizeDuct({ system: 'F-3', points: [[0, 0], [1000, 0]], segments: [{ w: 500, h: 300, z: 2700 }] })] };
    const rows = estimateRows(floor);
    expect(rows.products.find(r => r.productId === 'hood-box').unitPrice).toBe(productById('hood-box').price);
    expect(rows.ducts).toHaveLength(1);
    expect(rows.total).toBe(rows.products[0].total + rows.ducts[0].total);
    expect(estimateCsv(rows)).toContain('덕트');
    expect(estimateCsv(rows)).toContain('500×300');
  });
});

test('숨긴 제품과 숨긴 덕트는 견적에 들어가지 않는다(풍량 집계와 같은 규칙)', () => {
  const visible = createItem(productById('sofa-3'), { pos: [1000.5, 1000.25] });
  const hidden = createItem(productById('sofa-3'), { pos: [3000, 1000], hidden: true });
  const floor = {
    walls: [], rooms: [], items: [visible, hidden],
    ducts: [
      { id: 'd1', kind: 'exhaust', system: 'F-3', points: [[0, 0], [3000.5, 0]], segments: [{ w: 750, h: 400, z: 2650 }], connections: [], dampers: [] },
      // 숨긴 덕트는 **다른 단면**으로 둔다: 같은 계통·단면이면 ductRows가 두 덕트를 한 줄로 합쳐
      // toHaveLength(1)이 고치기 전에도 통과해 버린다(단면이 다르면 고치기 전 2줄 → 고친 뒤 1줄).
      { id: 'd2', kind: 'exhaust', system: 'F-3', points: [[0, 500], [3000.5, 500]], segments: [{ w: 500, h: 300, z: 2650 }], connections: [], dampers: [], hidden: true },
    ],
  };
  const rows = estimateRows(floor);
  expect(rows.products).toHaveLength(1);
  expect(rows.products[0].qty).toBe(1);                 // 숨긴 소파는 세지 않는다
  expect(rows.ducts).toHaveLength(1);                   // 숨긴 덕트 줄이 사라진다
  expect(rows.ducts[0].size).toBe('750×400');           // 남은 줄은 보이는 덕트다
  expect(rows.ducts[0].lengthM).toBe(3);
});

// §16.2: 받은 사람이 검산할 수 있어야 한다 — 수량 × 단가 = 금액이 모든 행에서 성립한다(감사 §3).
test('견적 행은 수량 × 단가 = 금액이고 덕트 단면은 규격 칸에 있다(§16.2)', () => {
  const hood = createItem(productById('hood-box'), { pos: [1000.5, 1000.25] });
  const floor = {
    walls: [], rooms: [], items: [hood],
    ducts: [normalizeDuct({ kind: 'exhaust', system: 'F-3', points: [[0, 0], [11200.5, 0]], segments: [{ w: 750, h: 400, z: 2700 }] })],
  };
  const rows = estimateRows(floor);
  const lines = estimateLines(rows);
  expect(lines).toHaveLength(2);
  const prod = lines.find(l => l.kind === '제품');
  expect(prod.unit).toBe('개');
  expect(prod.qty).toBe(1);
  expect(prod.spec).toBe('1600×1200×600');                     // 규격은 제품 크기다
  const duct = lines.find(l => l.kind === '덕트');
  expect(duct.spec).toBe('750×400');                           // 단면은 규격 칸(예전에는 코드 칸이었다)
  expect(duct.code).toBe('');
  expect(duct.unit).toBe('m²');
  expect(duct.lengthText).toBe('11.2 m');                      // 길이는 자기 칸
  // 모든 행에서 검산이 성립한다(반올림은 금액 쪽 1원 안).
  for (const l of lines) expect(Math.abs(l.qty * l.unitPrice - l.total)).toBeLessThanOrEqual(1);
});

test('CSV는 머리글 1행 + 8열이고 꼬리도 8열이다(§17.11)', () => {
  expect(EST_COLUMNS).toEqual(['구분', '이름', '코드', '규격', '수량', '단위', '단가(원)', '금액(원)']);
  expect(EST_TABLE_COLUMNS).toEqual(['구분', '이름', '코드', '규격', '길이', '수량', '단위', '단가(원)', '금액(원)']);
  const rows = estimateRows({ walls: [], rooms: [], items: [createItem(productById('sofa-3'), { pos: [1000.5, 1000.25] })] });
  const csv = estimateCsvText(rows);
  const lines = csv.slice(1).split('\n');                 // BOM을 뗀 뒤 센다(1행이 머리글이다)
  expect(csv.charCodeAt(0)).toBe(0xfeff);                 // 엑셀 한글(소스는 `\ufeff` 이스케이프다 — 리뷰 M-1)
  expect(lines[0]).toBe('구분,이름,코드,규격,수량,단위,단가(원),금액(원)');
  expect(lines[1]).toBe('제품,3인 소파,SF-3P,2100×900×800,1,개,890000,890000');
  // 합계는 **금액 칸**에 들어간다(§16.2: 받은 사람이 검산할 수 있는 CSV). 쉼표 개수를 눈으로
  // 세는 대신 열 개수로 확인한다 — 옛 7열 CSV에서는 쉼표 6개가 맞았고, 8열이 되면서 하나 늘었다.
  const total = lines.at(-2).split(',');
  expect(total).toHaveLength(EST_COLUMNS.length);
  expect(total[0]).toBe('합계');
  expect(total.at(-1)).toBe(String(rows.total));           // 마지막 = 금액 열
  expect(total.slice(1, -1).every(c => c === '')).toBe(true);
  expect(lines.at(-1)).toContain(PRICE_NOTE);                  // 마지막 줄이 단가 출처 + 프로젝트·작성일이다
  expect(lines.at(-1).split(',')).toHaveLength(EST_COLUMNS.length);   // 꼬리도 8열이다(§17.11(5))
  expect(PRICE_NOTE).toBe('단가는 예시 값(2026-09 기준)');
});

// §17.11(5) · 감사 §42: 29줄 중 1열짜리 줄이 2개라 엑셀에서 자동 필터·피벗이 한 번에 걸리지 않았다.
test('CSV는 머리글 1행 + 데이터이고 모든 줄이 8열이다', () => {
  const a = setup();                                   // 이 파일의 기존 헬퍼(빈 방 하나)
  addItem(a.store, createItem(productById('sofa-3'), { pos: [2000.5, 1500.25] }));
  applyMaterial(a.store, { kind: 'floor', id: a.floor().rooms[0].id }, mat('wood-oak'));
  const rows = estimateRows(a.floor());
  const text = estimateCsvText(rows, { name: '강당중 조리실', date: new Date('2026-09-23T13:32:00') });
  expect(text.startsWith('﻿')).toBe(true);   // BOM은 이스케이프로 적는다(M-13: 리터럴은 편집기에서 보이지 않는다)
  const lines = text.slice(1).split('\n');
  expect(lines[0]).toBe(EST_COLUMNS.join(','));        // 1행이 머리글이다("견적서" 줄이 없다)
  expect(EST_COLUMNS[6]).toBe('단가(원)');
  expect(EST_COLUMNS[7]).toBe('금액(원)');
  const cols = lines.map(l => (l.match(/,/g) ?? []).length + 1);
  expect(new Set(cols)).toEqual(new Set([8]));         // 1열짜리 줄 0개
  expect(lines.at(-1)).toContain('강당중 조리실');
  expect(lines.at(-1)).toContain('2026-09-23');
  expect(lines.at(-1)).toContain('단가는 예시 값(2026-09 기준)');
  expect(lines.at(-1).endsWith(',,,,,,,')).toBe(true); // 꼬리 주석도 8열이다
});

test('꼬리 한 줄에 프로젝트·작성일·단가 주석이 모두 든다', () => {
  const s = csvFooter({ name: '테스트 현장', date: new Date('2026-01-02T03:04:00') });
  expect(s).toBe('단가는 예시 값(2026-09 기준) · 프로젝트: 테스트 현장 · 작성일: 2026-01-02');
  expect(csvFooter({})).toContain('프로젝트: ');       // 이름이 없어도 칸은 남는다
});
