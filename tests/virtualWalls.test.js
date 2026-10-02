// 구획선(wall.virtual)과 도면 기준 면적(areaMode 'center') — 2026-10-02.
// 구획선은 **방만 나누는 선**이다: 벽 없이 트인 식당 | 조리실(배식대)을 도면의 실 면적대로 나누려고 DXF 가져오기가 긋는다
// (io/dxf/reconcile.js). 몸통이 없으므로 2D는 점선, 3D·견적·명세서의 벽 목록에는 없다. 도면의 실 면적은 벽·기둥 중심선
// 기준이라, 가져온 도면은 그 넓이(room.areaCenter)를 화면에 보여 준다.
import { describe, test, expect } from 'vitest';
import { makeWall, rectWalls, wallPolygon } from '../src/geom/walls.js';
import { normalizeWalls } from '../src/geom/normalize.js';
import { detectRooms, roomArea } from '../src/geom/rooms.js';
import { wallRange, drawWalls } from '../src/view2d/walls2d.js';
import { collectLabels } from '../src/view2d/labels2d.js';
import { totalArea } from '../src/state/floorOps.js';
import { floorDetailsHtml } from '../src/ui/floorBar.js';
import { layerTreeHtml } from '../src/ui/layersTree.js';
import { specHtml } from '../src/io/specSheet.js';
import { estimateRows } from '../src/io/estimate.js';
import { placedMaterials } from '../src/ui/materialPanel.js';
import { buildFloorGroup } from '../src/view3d/build.js';
import { createEmptyProject, createFloor, normalizeProject, createItem } from '../src/state/schema.js';
import { productById } from '../src/products/catalog.js';

const divider = (a, b) => Object.assign(makeWall({ a, b, thickness: 20 }), { virtual: true });
// 10 × 6 m 홀을 x = 6000의 구획선으로 나눈 층. 벽 두께 200 → 안목 9.8 × 5.8.
function hall() {
  const walls = normalizeWalls([...rectWalls([0, 0], [10000, 6000], 200), divider([6000, 0], [6000, 6000])]);
  const project = normalizeProject({ ...createEmptyProject(), areaMode: 'center', floors: [{ ...createFloor('1F'), walls, rooms: detectRooms(walls), items: [] }] });
  return { project, floor: project.floors[0] };
}

describe('구획선(virtual 벽)', () => {
  test('방을 나누되 몸통이 없다 — 안목 넓이는 구획선까지다', () => {
    const { floor } = hall();
    const rooms = [...floor.rooms].sort((a, b) => b.area - a.area);
    expect(rooms).toHaveLength(2);
    expect(rooms.map(r => r.areaCenter)).toEqual([36, 24]);
    // 왼쪽 안목: (6000 − 100) × 5800 — 구획선 쪽은 깎지 않는다. 두 방의 합 = 홀의 안목 넓이.
    expect(rooms[0].area).toBeCloseTo(5.9 * 5.8, 6);
    expect(rooms[0].area + rooms[1].area).toBeCloseTo(9.8 * 5.8, 6);
  });

  test('이웃 벽의 끝을 늘이지 않는다(벽 접합이 아니다)', () => {
    const stub = makeWall({ a: [6000, 0], b: [6000, 1000], thickness: 200 }), v = divider([6000, 1000], [6000, 5000]);
    expect(wallPolygon(stub, [stub, v]).map(p => p[1])).toEqual([0, 1000, 1000, 0]);
    expect(wallRange(stub, [stub, v])).toEqual({ start: 0, end: 1000 });
  });

  test('2D는 점선 한 줄로 그린다(채운 사각형이 아니다)', () => {
    const calls = [], polys = [];
    const rec = name => (...args) => calls.push([name, ...args]);
    const ctx = { save: rec('save'), restore: rec('restore'), beginPath: rec('beginPath'), setLineDash: rec('setLineDash'), moveTo: rec('moveTo'), lineTo: rec('lineTo'), stroke: rec('stroke'), globalAlpha: 1 };
    const view = { camera: { scale: 0.05 }, toScreen: p => [p[0] * 0.05, p[1] * 0.05], poly: (pts, fill) => polys.push({ pts, fill }), COLORS: { wall: '#3a4351', wallSel: '#14b8c4' } };
    const v = divider([6000, 0], [6000, 6000]);
    drawWalls(ctx, view, { walls: [v], items: [], rooms: [] }, {});
    expect(polys).toHaveLength(0);
    expect(calls.some(c => c[0] === 'setLineDash' && c[1].length === 2)).toBe(true);
    expect(calls.filter(c => c[0] === 'moveTo' || c[0] === 'lineTo').map(c => [c[1], c[2]])).toEqual([[300, 0], [300, 300]]);
    // 고른 구획선은 강조색 점선이다
    const picked = [];
    drawWalls({ ...ctx, set strokeStyle(c) { picked.push(c); } }, view, { walls: [v], items: [], rooms: [] }, { sel: { type: 'wall', id: v.id } });
    expect(picked).toContain('#14b8c4');
    expect(polys).toHaveLength(0);
  });

  test('3D에는 서지 않고, 방 안쪽 벽면도 만들지 않는다', () => {
    const { floor } = hall();
    const g = buildFloorGroup(floor, { wallOpacity: 1 });
    const v = floor.walls.find(w => w.virtual);
    expect(g.children.filter(c => c.userData.wallId === v.id)).toHaveLength(0);
    expect(g.children.filter(c => c.name === 'wall').length).toBe(floor.walls.length - 1);
    expect(g.children.filter(c => c.name === 'floor')).toHaveLength(2);
  });

  test('견적·마감재·명세서의 벽 목록에 들지 않고 치수 라벨도 없다', () => {
    const { project, floor } = hall();
    const v = floor.walls.find(w => w.virtual);
    v.matIn = { id: 'tile-white-300', offset: [0, 0], angle: 0 };
    expect(estimateRows(floor).materials.find(m => m.id === 'tile-white-300')).toBeUndefined();
    expect(placedMaterials(floor).has('tile-white-300')).toBe(false);
    const html = specHtml({ project, options: {} });
    expect(html.match(/<td>W\d+<\/td>/g) ?? []).toHaveLength(floor.walls.length - 1);
    const view = { camera: { scale: 0.05 }, toScreen: p => [p[0] * 0.05, p[1] * 0.05], COLORS: { text: '#5b6775', dim: '#1b2430' } };
    const dims = collectLabels(view, floor, { flags: { dims: true } }).filter(c => c.kind === 'wallDim');
    expect(dims.some(c => c.key === `wall:${v.id}`)).toBe(false);
  });
});

describe('도면 기준 면적(areaMode center)', () => {
  test('roomArea: 기준에 따라 보여 줄 넓이를 고른다', () => {
    const room = { area: 33.19, areaCenter: 41.31 };
    expect(roomArea(room, 'center')).toBe(41.31);
    expect(roomArea(room, 'net')).toBe(33.19);
    expect(roomArea(room, 'gross')).toBe(33.19);
    expect(roomArea(room)).toBe(33.19);
    expect(roomArea({ area: 12.5 }, 'center')).toBe(12.5);      // 옛 파일(areaCenter 없음)은 안목 넓이
    expect(roomArea(null, 'center')).toBe(0);
  });

  test('총면적·층 상세의 기준 고르기', () => {
    const { project, floor } = hall();
    expect(totalArea(floor, 'center')).toBe(60);
    expect(totalArea(floor, 'net')).toBeCloseTo(9.8 * 5.8, 6);
    const html = floorDetailsHtml(project, floor, {});
    expect(html).toMatch(/<option value="center" selected>도면 기준\(벽 중심선\)<\/option>/);
    expect(html).toContain('60.0 m²');
    expect(floorDetailsHtml({ ...project, areaMode: 'net' }, floor, {})).not.toMatch(/value="center" selected/);
  });

  test('2D 면적 라벨 · 레이어 트리 · 명세서의 공간 목록이 같은 기준을 쓴다', () => {
    const { project, floor } = hall();
    const view = { camera: { scale: 0.05 }, toScreen: p => [p[0] * 0.05, p[1] * 0.05], COLORS: { text: '#5b6775', dim: '#1b2430' } };
    const texts = mode => collectLabels(view, floor, { flags: { roomArea: true }, areaMode: mode }).map(c => c.text).sort();
    expect(texts('center')).toEqual(['24.0 m²', '36.0 m²']);
    expect(texts('net')).toEqual(['22.6 m²', '34.2 m²']);
    const big = floor.rooms.find(r => r.areaCenter === 36), sofa = createItem(productById('sofa-3'), { pos: [2000, 2000] });
    expect(layerTreeHtml([{ room: big, items: [sofa], ducts: [] }], { areaMode: 'center' })).toContain('36.0 m²');
    expect(layerTreeHtml([{ room: big, items: [sofa], ducts: [] }], {})).toContain('34.2 m²');
    expect(specHtml({ project, options: {} })).toContain('36.0 m²');
    expect(specHtml({ project: { ...project, areaMode: 'net' }, options: {} })).toContain('34.2 m²');
  });
});
