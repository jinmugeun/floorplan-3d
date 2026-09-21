// §14.5: 345 m² 도면을 화면에 맞추면 공간 이름(월드 250 mm 아래)이 면적 위에 올라앉고
// 덕트 단면·댐퍼·치수 라벨이 서로 겹쳐 아무것도 읽히지 않았다. 라벨은 화면 px 단위로 놓고,
// 우선순위가 높은 것부터 자리를 잡되 겹치면 생략한다(LOD).
import { describe, test, expect } from 'vitest';
import { LABEL_PRIORITY, LOD_SCALE, ROOM_NAME_DY, ROOM_AREA_DY, WALL_DIM_MIN_PX, labelBox, placeLabels, collectLabels, drawLabels } from '../src/view2d/labels2d.js';
import { createStore } from '../src/state/store.js';
import { createEmptyProject, activeFloor, createItem } from '../src/state/schema.js';
import { addWalls, addItem } from '../src/state/floorOps.js';
import { addDuct } from '../src/state/ductOps.js';
import { rectWalls, makeWall } from '../src/geom/walls.js';
import { productById } from '../src/products/catalog.js';

const fakeView = (scale = 0.05) => ({
  camera: { scale },
  toScreen: p => [p[0] * scale, p[1] * scale],
  COLORS: { text: '#5b6775', dim: '#1b2430' },
});
const cand = (kind, key, sp, text = '가나다', size = 12) => ({ kind, key, text, size, sp, at: [sp[0] / 0.05, sp[1] / 0.05] });

describe('라벨 배치(placeLabels)', () => {
  test('상수와 화면 AABB', () => {
    expect(LABEL_PRIORITY).toEqual(['roomName', 'roomArea', 'wallDim', 'ductSize', 'damper', 'equip']);
    expect([LOD_SCALE, ROOM_NAME_DY, ROOM_AREA_DY, WALL_DIM_MIN_PX]).toEqual([0.02, 16, 4, 40]);
    // v.label이 그리는 배경 상자와 같은 크기: 폭 = 글자수 × size × 0.62 + 8, 높이 = size + 6.
    expect(labelBox({ sp: [100.5, 50.25], text: '가나', size: 12 })).toEqual([
      100.5 - (2 * 12 * 0.62 + 8) / 2, 50.25 - 9, 100.5 + (2 * 12 * 0.62 + 8) / 2, 50.25 + 9,
    ]);
  });

  test('우선순위가 높은 것이 자리를 얻고 겹치는 것은 생략한다', () => {
    const list = [
      cand('equip', 'equip:a', [100, 100]),
      cand('roomName', 'room:r1:name', [102.5, 101.25]),
      cand('wallDim', 'wall:w1', [400, 400]),
    ];
    const placed = placeLabels(list, { scale: 0.05 });
    expect(placed.map(c => c.key)).toEqual(['room:r1:name', 'wall:w1']);   // 겹친 설비 번호가 빠진다
  });

  test('같은 우선순위는 입력 순서를 지키고 빈 글자는 후보가 아니다', () => {
    const list = [cand('ductSize', 'd:1', [10, 10]), cand('ductSize', 'd:2', [12, 11]), { ...cand('ductSize', 'd:3', [500, 500]), text: '' }];
    expect(placeLabels(list).map(c => c.key)).toEqual(['d:1']);
    expect(placeLabels([])).toHaveLength(0);
    expect(placeLabels(null)).toHaveLength(0);
  });

  test('많이 축소하면(scale < 0.02) 공간 이름만 남는다', () => {
    const list = [cand('roomName', 'room:r1:name', [10, 10]), cand('roomArea', 'room:r1:area', [500, 500]), cand('wallDim', 'wall:w1', [900, 900])];
    expect(placeLabels(list, { scale: 0.019 }).map(c => c.kind)).toEqual(['roomName']);
    expect(placeLabels(list, { scale: 0.02 }).map(c => c.kind)).toEqual(['roomName', 'roomArea', 'wallDim']);
    expect(placeLabels(list, { scale: null })).toHaveLength(3);   // scale을 주지 않으면 LOD 없음
  });
});

describe('라벨 후보 수집(collectLabels)', () => {
  function setup() {
    const store = createStore(createEmptyProject());
    addWalls(store, rectWalls([0, 0], [4000.5, 3000.25], 200));
    addWalls(store, [makeWall({ a: [0, 0], b: [3464.1016, 2000], thickness: 200, height: 2300 })]);   // 30° 벽
    store.dispatch(d => { activeFloor(d).rooms[0].name = '조리실'; });
    const hood = addItem(store, createItem(productById('hood-box'), { pos: [2000.5, 1500.25], z: 1700 }));
    addDuct(store, {
      id: 'dk1', points: [[500, 500], [3500, 500]], segments: [{ w: 750, h: 400, z: 2650 }],
      dampers: [{ segment: 0, t: 0.5, type: 'VD', w: 750, h: 400 }],
    });
    return { store, floor: () => activeFloor(store.get()), hood };
  }

  test('공간 이름은 중심 위 16 px, 면적은 아래 4 px에 놓인다(월드 오프셋이 아니다)', () => {
    const { floor } = setup();
    const cands = collectLabels(fakeView(0.05), floor(), { flags: { roomName: true, roomArea: true } });
    const name = cands.find(c => c.kind === 'roomName'), area = cands.find(c => c.kind === 'roomArea');
    expect(name.text).toBe('조리실');
    expect(name.key).toContain(':name');
    expect(area.sp[1] - name.sp[1]).toBeCloseTo(ROOM_NAME_DY + ROOM_AREA_DY, 6);
    // 축척이 달라도 화면 간격은 그대로다(예전엔 월드 250 mm라 축소하면 두 라벨이 붙었다).
    const far = collectLabels(fakeView(0.008), floor(), { flags: { roomName: true, roomArea: true } });
    const n2 = far.find(c => c.kind === 'roomName'), a2 = far.find(c => c.kind === 'roomArea');
    expect(a2.sp[1] - n2.sp[1]).toBeCloseTo(ROOM_NAME_DY + ROOM_AREA_DY, 6);
  });

  test('치수는 흰 배경 상자를 얻고 화면 40 px보다 짧은 벽은 후보가 아니다', () => {
    const { floor } = setup();
    const dims = collectLabels(fakeView(0.05), floor(), { flags: { dims: true } }).filter(c => c.kind === 'wallDim');
    expect(dims).toHaveLength(5);                       // 사각형 4 + 30° 벽 1
    expect(dims.every(c => c.bg === '#fff')).toBe(true);
    expect(collectLabels(fakeView(0.001), floor(), { flags: { dims: true } }).filter(c => c.kind === 'wallDim')).toHaveLength(0);
  });

  test('덕트 단면·댐퍼·설비 번호가 자기 키로 들어오고 보기 플래그를 따른다', () => {
    const { floor, hood } = setup();
    const v = fakeView(0.05);
    const all = collectLabels(v, floor(), { flags: {} });
    expect(all.find(c => c.kind === 'ductSize').key).toBe('duct:dk1:0');
    expect(all.find(c => c.kind === 'ductSize').text).toBe('750×400');
    expect(all.find(c => c.kind === 'damper').key).toBe('damper:dk1:0');
    expect(all.find(c => c.kind === 'damper').text).toBe('VD 750×400');
    expect(all.find(c => c.kind === 'equip').key).toBe(`equip:${hood}`);
    expect(collectLabels(v, floor(), { flags: { ductLabels: false } }).some(c => c.kind === 'ductSize')).toBe(false);
    expect(collectLabels(v, floor(), { flags: { ducts: false } }).some(c => c.kind === 'damper')).toBe(false);
    expect(collectLabels(v, floor(), { flags: { equipLabels: false } }).some(c => c.kind === 'equip')).toBe(false);
    expect(collectLabels(v, floor(), { flags: { ceilingItems: false } }).some(c => c.kind === 'equip')).toBe(false);
  });

  test('drawLabels는 놓인 라벨만 뷰의 label로 그리고 알파는 건드리지 않는다', () => {
    const calls = [];
    const v = { ...fakeView(0.05), label: (...a) => calls.push(a) };
    const ctx = { globalAlpha: 0.25 };                 // 흐리기는 부르는 쪽(view2d)의 몫이다
    drawLabels(ctx, v, [{ text: 'A', at: [1, 2], size: 11, color: '#000', bg: '#fff' }, { text: 'B', at: [3, 4], size: 12, color: '#111', bg: null }]);
    expect(calls).toEqual([
      ['A', [1, 2], { size: 11, color: '#000', bg: '#fff' }],
      ['B', [3, 4], { size: 12, color: '#111', bg: null }],
    ]);
    expect(ctx.globalAlpha).toBe(0.25);                // 단일 공간 모드의 계수를 덮어쓰지 않는다
    drawLabels({}, v, null);                           // 빈 목록에도 던지지 않는다
    expect(calls).toHaveLength(2);
  });
});
