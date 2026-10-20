// 내장 샘플 재연결(계획 17 Task 9 · tools/products/remap-samples.mjs). 커밋된 샘플은 이미 재연결돼 있어야 하고(다시 돌려도 바뀌지 않는다 — 멱등),
// 기구는 엑셀 급식기구로, 방 바닥은 칩 에폭시 · 벽 안쪽은 흰 타일이다. 자리·크기·개수는 가져온 결과 그대로다.
import { test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { remapSinsang, remapGangdangText } from '../tools/products/remap-samples.mjs';
import { buildSinsangProject } from '../src/samples/sinsang.js';
import { buildSampleProject } from '../src/samples/gangdang.js';
import { productById } from '../src/products/catalog.js';
import { LEGACY_TO_KITCHEN, kitchenFor } from '../src/products/catalogKitchen.js';
import { activeFloor } from '../src/state/schema.js';

const raw = name => readFileSync(fileURLToPath(new URL(`../src/samples/${name}`, import.meta.url)), 'utf8');
const item = (id, productId, extra = {}) => { const p = productById(productId);
  return { id, kind: p.kind, productId, name: p.name, code: p.code, color: p.color, size: [...p.size], pos: [0, 0], z: 0, rot: 0, attach: 'floor', dxfProduct: productId, ...extra }; };

test('커밋된 두 샘플은 이미 재연결돼 있다 — 다시 돌려도 바꿀 것이 없다', () => {
  const s = remapSinsang(JSON.parse(raw('sinsang.json')));
  expect([s.items, s.finishes]).toEqual([0, 0]);
  const g = remapGangdangText(raw('gangdang.json'));
  expect(g.items).toBe(0);
  expect(g.text).toBe(raw('gangdang.json'));
});

test('신상중: 급식 기구 115개는 엑셀 제품 · 도면 기구 52 · 개수·종류 합 그대로 · dxfProduct = productId · 코드·종류는 새 제품 값', () => {
  const f = activeFloor(buildSinsangProject());
  expect(f.items).toHaveLength(222);
  expect(f.items.filter(i => i.productId in LEGACY_TO_KITCHEN)).toEqual([]);
  expect(f.items.filter(i => i.productId === 'equip-generic')).toHaveLength(52);
  expect(f.items.filter(i => i.productId.startsWith('k-'))).toHaveLength(115);
  const kinds = f.items.reduce((m, i) => ({ ...m, [i.kind]: (m[i.kind] ?? 0) + 1 }), {});
  expect(kinds).toMatchObject({ door: 16, window: 16, opening: 9, column: 14 });
  expect(kinds.product + kinds.equipment).toBe(167);
  for (const it of f.items.filter(i => i.dxfProduct)) expect(it.dxfProduct, it.id).toBe(it.productId);
  for (const it of f.items.filter(i => i.productId.startsWith('k-'))) {
    const p = productById(it.productId);
    expect([it.code, it.kind], it.id).toEqual([p.code, p.kind]);
  }
});

test('신상중: 방 바닥은 칩 에폭시 · 벽 안쪽은 흰 타일', () => {
  const f = activeFloor(buildSinsangProject());
  expect(f.rooms.every(r => r.floorMat?.id === 'epoxy-chip-gray')).toBe(true);
  expect(f.walls.filter(w => !w.virtual).every(w => w.matIn?.id === 'tile-white-300')).toBe(true);
});

test('강당중: 후드 10·조리기구 3은 엑셀 제품 · 조리기구 크기는 기존 그대로 · 벽 안쪽 흰 타일 · 방 바닥 칩 에폭시', () => {
  const f = activeFloor(buildSampleProject());
  const hoods = f.items.filter(i => i.props?.type === 'hood'), apps = f.items.filter(i => i.props?.type === 'appliance');
  expect([hoods.length, apps.length]).toEqual([10, 3]);
  for (const it of [...hoods, ...apps]) expect(it.productId, it.id).toMatch(/^k-/);
  expect(apps.map(i => i.size)).toEqual([[1000, 800, 900], [1000, 800, 900], [1200, 750, 850]]);
  expect(f.walls.every(w => w.matIn?.id === 'tile-white-300')).toBe(true);
  expect(f.rooms.every(r => r.floorMat?.id === 'epoxy-chip-gray')).toBe(true);
});

test('remapSinsang: 이름·색은 기존 제품 값일 때만 바꾸고, 설비가 되면 씨앗을 단다 · 문·도면 기구는 그대로 · 원본은 고치지 않는다', () => {
  const spec = { floors: [{ walls: [{ id: 'w1', virtual: false, matIn: null }, { id: 'v1', virtual: true, matIn: null }], rooms: [{ id: 'r1', floorMat: null }],
    items: [item('a', 'sink-double'), item('b', 'sink-double', { name: '세정대 2조 1500-750', color: '#123456', dxfProduct: undefined }),
      item('c', 'dishwasher', { size: [540, 600, 1800] }), item('d', 'door-swing-900'), item('e', 'equip-generic')] }] };
  const { spec: out, items, finishes } = remapSinsang(spec);
  expect([items, finishes]).toEqual([3, 2]);
  const [a, b, c, d, e] = out.floors[0].items;
  const A = kitchenFor('sink-double', [1800, 750, 850]);
  expect(a).toMatchObject({ productId: A, name: productById(A).name, code: productById(A).code, color: productById(A).color, dxfProduct: A });
  expect(b).toMatchObject({ name: '세정대 2조 1500-750', color: '#123456' });
  expect(b.dxfProduct).toBeUndefined();
  expect(c.kind).toBe('equipment');
  expect(c.props).toMatchObject({ type: 'appliance', kind: 'dishwasher' });
  expect([d.productId, e.productId]).toEqual(['door-swing-900', 'equip-generic']);
  expect(out.floors[0].walls.map(w => w.matIn?.id ?? null)).toEqual(['tile-white-300', null]);
  expect(out.floors[0].rooms[0].floorMat.id).toBe('epoxy-chip-gray');
  expect(spec.floors[0].items[0].productId).toBe('sink-double');
});

// 컨트롤러 결정(2026-10-20 · Task 9): 신상중은 저장된 DXF 가져오기 결과라, 가져오기(io/dxf/equipment.js)가 지금 고를 제품과 같은 제품을 골라야 한다 —
// 이름 있는 기구(이름 ≠ 기존 제품 이름)는 kitchenFor(기존 id, 크기, 도면 이름), 익명 블록(기존 제품 이름 그대로)은 이름 없이.
test('remapSinsang: 이름 있는 기구는 도면 이름으로 고르고(가져오기와 같은 kitchenFor) · 기존 씨앗 값이던 설비 props는 새 제품을 따른다', () => {
  const spec = { floors: [{ walls: [], rooms: [], items: [
    item('a', 'sink-double', { name: '세정대 2조 1500-750', color: '#123456', size: [750, 1500, 850] }),
    item('b', 'sink-double', { name: '수류담금세척기 TR1500S', size: [870, 1500, 850] }),
    item('c', 'sink-double', { size: [870, 1500, 850] }),
    item('d', 'ricecooker-gas', { name: '취반기(전기) 150인용 570x600x1460', size: [600, 570, 1460], props: { type: 'appliance', kind: 'ricecooker', heat: 'gas', hoodId: 'h1' } }),
  ] }] };
  const { spec: out, items } = remapSinsang(spec);
  expect(items).toBe(4);
  const [a, b, c, d] = out.floors[0].items;
  expect(a.productId).toBe(kitchenFor('sink-double', [750, 1500, 850], '세정대 2조 1500-750'));
  expect(productById(a.productId).name).toMatch(/2조/);
  expect(a).toMatchObject({ name: '세정대 2조 1500-750', color: '#123456', dxfProduct: a.productId });   // 도면 이름·바꾼 색은 그대로
  expect(b.productId).toBe(kitchenFor('sink-double', [870, 1500, 850], '수류담금세척기 TR1500S'));
  expect(productById(b.productId).name).toMatch(/담금/);                                                // 이름 없이 고르면 표의 /2조/ — 아래 c
  expect(c.productId).toBe(kitchenFor('sink-double', [870, 1500, 850]));
  expect(productById(c.productId).name).toMatch(/2조/);
  expect(c.name).toBe(productById(c.productId).name);                                                    // 익명 — 이름도 새 제품 이름
  expect(d.productId).toBe(kitchenFor('ricecooker-gas', [600, 570, 1460], '취반기(전기) 150인용 570x600x1460'));
  expect(productById(d.productId).equip.heat).toBe('electric');
  expect(d.props).toMatchObject({ type: 'appliance', kind: 'ricecooker', heat: 'electric', hoodId: 'h1' });   // 가스(기존 씨앗)였던 열원은 새 제품 · 후드 연결은 그대로
});

// 리뷰 Minor 6: 셈과 쓰기가 같아야 한다 — 이미 칩 에폭시·흰 타일인 면은 덮어쓰지 않는다(맞춘 오프셋·각도가 남는다). --check 0이면 써도 바뀌는 것이 없다.
test('remapSinsang: 이미 급식실 마감인 면은 세지도 덮어쓰지도 않는다', () => {
  const floorMat = { id: 'epoxy-chip-gray', offset: [100, 0], angle: 15 }, matIn = { id: 'tile-white-300', offset: [0, 50], angle: 0 };
  const spec = { floors: [{ walls: [{ id: 'w1', virtual: false, matIn }, { id: 'w2', virtual: false, matIn: { id: 'paint-white', offset: [0, 0], angle: 0 } }],
    rooms: [{ id: 'r1', floorMat }, { id: 'r2', floorMat: null }], items: [] }] };
  const { spec: out, items, finishes } = remapSinsang(spec);
  expect([items, finishes]).toEqual([0, 2]);
  expect(out.floors[0].rooms.map(r => r.floorMat)).toEqual([floorMat, { id: 'epoxy-chip-gray', offset: [0, 0], angle: 0 }]);
  expect(out.floors[0].walls.map(w => w.matIn)).toEqual([matIn, { id: 'tile-white-300', offset: [0, 0], angle: 0 }]);
  expect(remapSinsang(out)).toMatchObject({ items: 0, finishes: 0 });
  expect(remapSinsang(out).spec).toEqual(out);                    // 0이면 쓸 것도 없다
});

// 리뷰 Minor 5: 설비 목록에 없는 id의 줄은 그대로 두고(TypeError 없이), "props"가 없는 크기 없는 줄에도 크기를 적는다(조용히 빠뜨리지 않는다).
test('remapGangdangText: 설비 목록 밖의 줄은 그대로 · props 없는 줄에도 크기를 적는다', () => {
  const stray = '{\r\n  "equipment": [],\r\n  "extra": [\r\n    { "id": "x1", "product": "ricecooker-gas", "pos": [0, 0] }\r\n  ]\r\n}\r\n';
  expect(remapGangdangText(stray)).toEqual({ text: stray, items: 0 });
  const bare = '{\r\n  "equipment": [\r\n    { "id": "eq_a01", "product": "ricecooker-gas", "pos": [0, 0], "rot": 90 },\r\n    { "id": "eq_a02", "product": "range-gas-high", "pos": [0, 0] }\r\n  ]\r\n}\r\n';
  const { text: out, items } = remapGangdangText(bare);
  expect(items).toBe(2);
  expect(out).toContain(`{ "id": "eq_a01", "product": "${kitchenFor('ricecooker-gas', [1000, 800, 900])}", "pos": [0, 0], "rot": 90, "size": [1000, 800, 900] },\r\n`);
  expect(out).toContain(`{ "id": "eq_a02", "product": "${kitchenFor('range-gas-high', [1200, 750, 850])}", "pos": [0, 0], "size": [1200, 750, 850] }\r\n`);
  expect(JSON.parse(out).equipment.map(e => e.size)).toEqual([[1000, 800, 900], [1200, 750, 850]]);
});

test('remapGangdangText: 설비 줄의 product만 바꾸고 크기가 없던 줄에는 기존 크기를 적는다(손 서식·CRLF 유지)', () => {
  const text = '{\r\n  "equipment": [\r\n    { "id": "eq_a01", "product": "ricecooker-gas", "pos": [0, 0], "rot": 90, "props": { "kind": "ricecooker" } },\r\n    { "id": "eq_d01", "product": "diffuser-650", "pos": [0, 0] }\r\n  ]\r\n}\r\n';
  const { text: out, items } = remapGangdangText(text);
  expect(items).toBe(1);
  expect(out).toContain(`"product": "${kitchenFor('ricecooker-gas', [1000, 800, 900])}", "pos": [0, 0], "rot": 90, "size": [1000, 800, 900], "props":`);
  expect(out).toContain('"product": "diffuser-650"');
  expect(out.split('\r\n')).toHaveLength(text.split('\r\n').length);
});
