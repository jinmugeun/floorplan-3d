// §14.5: 345 m² 도면을 화면에 맞추면 공간 이름(월드 250 mm 아래)이 면적 위에 올라앉고
// 덕트 단면·댐퍼·치수 라벨이 서로 겹쳐 아무것도 읽히지 않았다. 라벨은 화면 px 단위로 놓고,
// 우선순위가 높은 것부터 자리를 잡되 겹치면 생략한다(LOD).
import { describe, test, expect } from 'vitest';
import { LABEL_PRIORITY, LOD_SCALE, ROOM_NAME_DY, ROOM_AREA_DY, WALL_DIM_MIN_PX, LABEL_BG, CHAR_EM, textWidth, labelBox, placeLabels, collectLabels, drawLabels } from '../src/view2d/labels2d.js';
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
    // measure는 사람이 직접 그은 치수라 높고, productCode는 가장 길어 가장 먼저 생략된다(m-3).
    expect(LABEL_PRIORITY).toEqual(['roomName', 'roomArea', 'measure', 'wallDim', 'ductSize', 'damper', 'equip', 'productCode']);
    expect([LOD_SCALE, ROOM_NAME_DY, ROOM_AREA_DY, WALL_DIM_MIN_PX]).toEqual([0.02, 16, 4, 40]);
    // 폭은 글자별로 잰다(높이 = size + 6): 한글·전각·원문자는 size당 1.0, ASCII·숫자는 0.62.
    // 실측(Chromium, IBM Plex Sans KR)은 한글 0.892·① 1.0·ASCII 0.50~0.60이며, 한글을 넉넉히
    // 잡는 쪽이 "겹치면 생략"에 안전하다. 글자수 × 0.62로 재면 '가나'가 6.1 px 좁아진다.
    expect([CHAR_EM.wide, CHAR_EM.narrow]).toEqual([1, 0.62]);
    expect(labelBox({ sp: [100.5, 50.25], text: '가나', size: 12 })).toEqual([
      100.5 - (2 * 12 + 8) / 2, 50.25 - 9, 100.5 + (2 * 12 + 8) / 2, 50.25 + 9,
    ]);
    // 한글 이름 vs 숫자 치수: 같은 글자수라도 상자 폭이 다르다(소수 좌표도 그대로 흐른다).
    expect(labelBox({ sp: [40.25, 12.5], text: '조리실', size: 13 })).toEqual([
      40.25 - (3 * 13 + 8) / 2, 12.5 - 9.5, 40.25 + (3 * 13 + 8) / 2, 12.5 + 9.5,
    ]);
    expect(labelBox({ sp: [40.25, 12.5], text: '750', size: 13 })).toEqual([
      40.25 - (3 * 13 * 0.62 + 8) / 2, 12.5 - 9.5, 40.25 + (3 * 13 * 0.62 + 8) / 2, 12.5 + 9.5,
    ]);
    expect(textWidth('①', 12)).toBeCloseTo(12, 9);            // 원문자는 전각이다(실측 12.0 px)
    expect(textWidth('VD 750×400', 10)).toBeCloseTo(62, 9);   // 전각이 없으면 전부 0.62(실측 0.572)
    expect(textWidth('', 12)).toBe(0);
  });

  test('우선순위가 높은 것이 자리를 얻고 겹치는 것은 생략한다', () => {
    const list = [
      cand('equip', 'equip:a', [100, 100]),
      cand('roomName', 'room:r1:name', [102.5, 101.25]),
      cand('wallDim', 'wall:w1', [400, 400]),
    ];
    const placed = placeLabels(list, { scale: 0.05 });
    expect(placed.map(c => c.key)).toEqual(['room:r1:name', 'wall:w1']);   // 겹친 설비 번호가 빠진다
    // 반환은 우선순위 오름차순이다(그리는 쪽이 역순으로 그려 높은 우선순위를 위에 남긴다 — §14.5).
    expect(placed.map(c => c.kind)).toEqual(['roomName', 'wallDim']);
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
    expect(dims.every(c => c.bg === LABEL_BG)).toBe(true);
    expect(LABEL_BG).toBe('rgba(255,255,255,0.85)');    // §14.5 "반투명 상자" — 불투명 흰 상자는 벽선을 지운다
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
    expect(all.find(c => c.kind === 'equip').key).toBe(`equip:${hood}:0`);   // 글자 부품마다 유일한 키
    expect(collectLabels(v, floor(), { flags: { ductLabels: false } }).some(c => c.kind === 'ductSize')).toBe(false);
    expect(collectLabels(v, floor(), { flags: { ducts: false } }).some(c => c.kind === 'damper')).toBe(false);
    expect(collectLabels(v, floor(), { flags: { equipLabels: false } }).some(c => c.kind === 'equip')).toBe(false);
    expect(collectLabels(v, floor(), { flags: { ceilingItems: false } }).some(c => c.kind === 'equip')).toBe(false);
  });

  // m-3: 제품 코드 라벨과 측정선 라벨이 LOD 패스 밖에 있어 "제품 코드" 보기를 켜면 겹쳤다(감사 #22).
  test('제품 코드·측정선 라벨도 후보로 들어오고 겹치면 코드가 먼저 생략된다', () => {
    const { store, floor, hood } = setup();
    store.dispatch(d => { activeFloor(d).measures.push({ id: 'm1', a: [500.5, 2500.25], b: [3500.5, 2500.25] }); });
    const v = fakeView(0.05);
    const all = collectLabels(v, floor(), { flags: { productCode: true, measures: true } });
    const code = all.find(c => c.kind === 'productCode');
    expect(code.key).toBe(`item:${hood}:code`);
    expect(code.bg).toBe(LABEL_BG);                    // 불투명 흰 상자가 아니다(§14.5)
    const mm = all.find(c => c.kind === 'measure');
    expect(mm.key).toBe('measure:m1');
    expect(mm.text).toBe('3000');
    // 보기 플래그를 끄면 후보도 없다(그리는 쪽과 판정이 하나다).
    expect(collectLabels(v, floor(), { flags: {} }).some(c => c.kind === 'productCode' || c.kind === 'measure')).toBe(false);
    // 같은 자리에 겹치면 우선순위가 낮은 제품 코드가 빠진다.
    const same = [{ kind: 'measure', key: 'measure:m1', text: '3000', size: 12, sp: [200, 200], at: [0, 0] },
      { kind: 'productCode', key: 'item:i1:code', text: '후드 HD-1', size: 11, sp: [204, 202], at: [0, 0] }];
    expect(placeLabels(same).map(c => c.kind)).toEqual(['measure']);
  });

  // m-2: 겹침 판정을 y 밴드로 잘라도 결과는 전수 비교와 같아야 한다(밴드 높이보다 큰 상자·음수 y 포함).
  test('y 밴드 버킷은 전수 비교와 같은 결과를 준다', () => {
    const boxes = [
      cand('roomName', 'a', [100.5, -40.25], '가나다라마바사', 24),   // 밴드(16 px)보다 높은 상자, 음수 y
      cand('roomArea', 'b', [120.5, -36.25], '12.5 m²', 13),          // a와 겹친다
      cand('wallDim', 'c', [120.5, 300.75], '4001', 11),
      cand('ductSize', 'd', [121.5, 303.75], '750×400', 11),          // c와 겹친다
      cand('equip', 'e', [900, 900], '①', 10),
    ];
    expect(placeLabels(boxes).map(c => c.key)).toEqual(['a', 'c', 'e']);
  });

  test('drawLabels는 놓인 라벨만 뷰의 label로 그리고 알파는 건드리지 않는다', () => {
    const calls = [];
    const v = { ...fakeView(0.05), label: (...a) => calls.push(a) };
    const ctx = { globalAlpha: 0.25 };                 // 흐리기는 부르는 쪽(view2d)의 몫이다
    drawLabels(ctx, v, [{ text: 'A', at: [1, 2], size: 11, color: '#000', bg: LABEL_BG }, { text: 'B', at: [3, 4], size: 12, color: '#111', bg: null }]);
    expect(calls).toEqual([   // 받은 순서 그대로(뒤집는 것은 부르는 쪽의 몫이다 — view2d)
      ['A', [1, 2], { size: 11, color: '#000', bg: LABEL_BG }],
      ['B', [3, 4], { size: 12, color: '#111', bg: null }],
    ]);
    expect(ctx.globalAlpha).toBe(0.25);                // 단일 공간 모드의 계수를 덮어쓰지 않는다
    drawLabels({}, v, null);                           // 빈 목록에도 던지지 않는다
    expect(calls).toHaveLength(2);
  });
});

// 감사 "2D 치수 라벨이 중복된다": 같은 벽 구간의 10400이 세로로 네 번, 5600·5200이 두 번씩.
test('가까이 겹쳐 찍히는 같은 치수는 하나만 남고 멀리 있는 같은 치수는 남는다', async () => {
  const { dedupeDims, DIM_DEDUPE_PX } = await import('../src/view2d/labels2d.js');
  expect(DIM_DEDUPE_PX).toBe(48);
  const c = (text, sp) => ({ key: `w${sp[0]}:${sp[1]}`, kind: 'wallDim', text, sp, size: 11 });
  const kept = dedupeDims([
    c('10400', [100, 100]),
    c('10400', [110.5, 120.25]),   // 48 px 안 → 생략
    c('10400', [100, 400]),        // 멀다 → 남는다
    c('5600', [104, 104]),         // 글자가 다르다 → 남는다
  ]);
  expect(kept.map(x => x.sp)).toEqual([[100, 100], [100, 400], [104, 104]]);
  expect(dedupeDims([])).toEqual([]);
  expect(dedupeDims(undefined)).toEqual([]);
});

// §16.11(리뷰 I-1): 시방서의 평면도는 **인쇄 배율**로 캡처한다 — 논리 폭이 용지 본문 폭(A4 세로
// 765 px)이라 예전 2000 px 캡처보다 fit()의 scale이 2.6배 작다. LOD는 화면 px로 재므로(WALL_DIM_MIN_PX·
// LOD_SCALE) 글자는 커지지만 라벨 수는 줄어든다. "A4에 물리적으로 안 들어간다"가 맞는 거래이므로 LOD는
// 그대로 두고, 무엇을 잃는지만 숫자로 못 박는다(주석이 조용히 넘어가지 않게).
describe('인쇄 배율의 LOD(§16.11)', () => {
  const PRINT_W = 765, SCREEN_W = 2000;                                   // printBodyPx('A4', false) vs 예전 캡처 폭
  const fitScale = (px, planMm, padding = 500) => px / (planMm + padding * 2);   // capture2D의 v.fit(500), 가로 제한
  // 20 m 도면. 좌표는 소수 mm다(도면은 mm 소수까지 들고 있다 — 배율 계산이 정수에 기대지 않는다).
  const floor20 = () => ({
    walls: [
      makeWall({ a: [0.5, 0.25], b: [1001, 0.25], thickness: 200, height: 2300 }),              // 1000.5 mm
      makeWall({ a: [4000.5, 0.25], b: [5200.75, 0.25], thickness: 200, height: 2300 }),        // 1200.25 mm
      makeWall({ a: [0.5, 6000.75], b: [4001.25, 6000.75], thickness: 200, height: 2300 }),     // 4000.75 mm
      makeWall({ a: [9000.5, 9000.5], b: [19001, 9000.5], thickness: 200, height: 2300 }),      // 10000.5 mm
    ],
    rooms: [], items: [], ducts: [], measures: [],
  });
  const dimTexts = scale => collectLabels(fakeView(scale), floor20(), { flags: { dims: true } })
    .filter(c => c.kind === 'wallDim').map(c => c.text);

  test('20 m 도면을 A4 세로 인쇄 배율로 캡처하면 1.1 m보다 짧은 벽의 치수가 빠진다', () => {
    const print = fitScale(PRINT_W, 20000), screen = fitScale(SCREEN_W, 20000);
    expect(print).toBeCloseTo(0.036429, 6);
    expect(screen / print).toBeCloseTo(SCREEN_W / PRINT_W, 9);            // 2.61배
    // 치수가 붙는 최소 벽 길이: 0.42 m → 1.10 m
    expect(WALL_DIM_MIN_PX / screen).toBeCloseTo(420, 6);
    expect(WALL_DIM_MIN_PX / print).toBeCloseTo(1098.04, 2);
    expect(dimTexts(screen)).toEqual(['1001', '1200', '4001', '10001']);  // 2000 px 캡처: 넷 다 붙는다
    expect(dimTexts(print)).toEqual(['1200', '4001', '10001']);           // 인쇄 배율: 1000.5 mm 벽이 빠진다
    expect(print).toBeGreaterThan(LOD_SCALE);                             // 20 m는 아직 "공간 이름만" 구간이 아니다
  });

  test('40 m 도면은 A4 인쇄 배율에서 공간 이름만 남는다(2000 px 캡처에서는 남았다)', () => {
    const print = fitScale(PRINT_W, 40000), screen = fitScale(SCREEN_W, 40000);
    expect(print).toBeLessThan(LOD_SCALE);                                // 0.0187 px/mm — 경계는 폭 약 37 m
    expect(screen).toBeGreaterThan(LOD_SCALE);
    const store = createStore(createEmptyProject());
    addWalls(store, rectWalls([0.5, 0.25], [40000.5, 26000.25], 200));
    store.dispatch(d => { activeFloor(d).rooms[0].name = '조리실'; });
    const floor = activeFloor(store.get());
    const flags = { roomName: true, roomArea: true, dims: true };
    // 후보는 두 배율에서 똑같이 모인다 — 버리는 것은 placeLabels의 LOD다.
    const kinds = scale => [...new Set(placeLabels(collectLabels(fakeView(scale), floor, { flags }), { scale }).map(c => c.kind))];
    expect(new Set(collectLabels(fakeView(print), floor, { flags }).map(c => c.kind))).toEqual(new Set(['roomName', 'roomArea', 'wallDim']));
    expect(kinds(print)).toEqual(['roomName']);                           // 치수·면적이 전부 빠진다
    expect(kinds(screen)).toEqual(['roomName', 'roomArea', 'wallDim']);
  });
});
