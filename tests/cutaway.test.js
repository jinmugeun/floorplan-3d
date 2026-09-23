import { test, expect } from 'vitest';
import { rectWalls } from '../src/geom/walls.js';
import { detectRooms } from '../src/geom/rooms.js';
import { hiddenWallIds, wallOwners, isExteriorWall, cutawayMeshStyle, soloMeshVisible, applyCutawayTo, shotCutaway, CUTAWAY_EDGE_COS } from '../src/view3d/cutaway.js';
import { sceneSignature } from '../src/view3d/build.js';
import { createEmptyProject, activeFloor } from '../src/state/schema.js';

function floor() { const walls = rectWalls([0, 0], [4000, 3000], 200); return { walls, rooms: detectRooms(walls) }; }
const top = f => f.walls.find(w => w.a[1] === 0 && w.b[1] === 0).id;
const bottom = f => f.walls.find(w => w.a[1] === 3000 && w.b[1] === 3000).id;
const left = f => f.walls.find(w => w.a[0] === 0 && w.b[0] === 0).id;
const view = { cutaway: true };

test('camera south-west hides south and west walls', () => {
  const f = floor();
  const hid = hiddenWallIds(f, [-5000, 8000, 4000], 35, view);
  expect(hid.has(bottom(f))).toBe(true); expect(hid.has(left(f))).toBe(true); expect(hid.has(top(f))).toBe(false);
});
test('high elevation shows all walls', () => {
  const f = floor();
  expect(hiddenWallIds(f, [-5000, 8000, 40000], 75, view).size).toBe(0);
});
test('camera below floor shows all walls', () => {
  const f = floor();
  expect(hiddenWallIds(f, [-5000, 8000, -100], 35, view).size).toBe(0);
});
test('cutaway off shows all walls', () => {
  const f = floor();
  expect(hiddenWallIds(f, [-5000, 8000, 4000], 35, { cutaway: false }).size).toBe(0);
});
// §17.1(감사 §1): 내벽도 카메라 쪽이면 지운다 — 그러지 않으면 그 뒤의 설비가 보이지도, 집히지도 않는다.
// 내벽은 "바깥"을 정할 수 없으므로 **벽 법선의 양쪽**으로 판정한다(정면으로 보이면 숨긴다).
test('카메라를 마주보는 내벽은 숨는다', () => {
  const a = rectWalls([0, 0], [4000, 3000], 200), b = rectWalls([4000, 0], [7000, 3000], 200);
  const shared = b.find(w => w.a[0] === 4000 && w.b[0] === 4000);
  const walls = [...a, ...b.filter(w => w !== shared)];
  const f = { walls, rooms: detectRooms(walls) };
  const mid = a.find(w => w.a[0] === 4000 && w.b[0] === 4000).id;
  // 동쪽에서 보면 남북으로 뻗은 공유 벽을 정면으로 마주본다(법선이 동서다).
  expect(hiddenWallIds(f, [20000, 1500, 3000], 35, view).has(mid)).toBe(true);
  // 컷어웨이를 끄면 예전처럼 아무것도 숨지 않는다.
  expect(hiddenWallIds(f, [20000, 1500, 3000], 35, { cutaway: false }).size).toBe(0);
});

// 안전장치 하나: 비스듬히 보이는 벽은 남긴다(도면의 골격이 다 사라지지 않게).
test('CUTAWAY_EDGE_COS보다 비스듬한 내벽은 남는다', () => {
  expect(CUTAWAY_EDGE_COS).toBe(0.2);
  const f = twoRooms();                                     // 공유 벽은 x = 4000.5의 남북 벽(법선 ±x)
  const mid = f.shared.id;
  // 벽 중점에서 거의 북쪽(법선과 87° 어긋남 → |cos| ≈ 0.05): 남긴다.
  const midPt = [(f.shared.a[0] + f.shared.b[0]) / 2, (f.shared.a[1] + f.shared.b[1]) / 2];
  expect(hiddenWallIds(f, [midPt[0] + 500, midPt[1] - 10000, 3000], 35, view).has(mid)).toBe(false);
  // 법선과 45° 어긋남(|cos| ≈ 0.707): 숨긴다.
  expect(hiddenWallIds(f, [midPt[0] + 10000, midPt[1] - 10000, 3000], 35, view).has(mid)).toBe(true);
});

function twoRooms() { // 가운데 벽을 공유하는 방 2개, 소수 좌표
  const a = rectWalls([0.5, 0.25], [4000.5, 3000.25], 200);
  const b = rectWalls([4000.5, 0.25], [7000.5, 3000.25], 200);
  const dup = b.find(w => w.a[0] === 4000.5 && w.b[0] === 4000.5);
  const walls = [...a, ...b.filter(w => w !== dup)];
  return { walls, rooms: detectRooms(walls), shared: a.find(w => w.a[0] === 4000.5 && w.b[0] === 4000.5) };
}

test('interior walls are shared, exterior walls belong to one room at most', () => {
  const f = twoRooms();
  expect(wallOwners(f, f.shared)).toHaveLength(2);
  expect(isExteriorWall(f, f.shared)).toBe(false);
  const north = f.walls.find(w => w.a[1] === 0.25 && w.b[1] === 0.25 && w.a[0] === 0.5);
  expect(isExteriorWall(f, north)).toBe(true);
  const lone = { id: 'lone', a: [9000, 9000], b: [9000, 12000], thickness: 200, height: 2300 };
  expect(isExteriorWall({ walls: [lone], rooms: [] }, lone)).toBe(true);
});

test('outerWalls off hides every exterior wall even with cutaway off or a top-down camera', () => {
  const f = twoRooms();
  const hid = hiddenWallIds(f, [-5000, 8000, 4000], 85, { cutaway: false, v3: { outerWalls: false, innerWalls: true } });
  expect(hid.has(f.shared.id)).toBe(false);
  expect(hid.size).toBe(f.walls.length - 1);
});

test('innerWalls off hides only the shared wall', () => {
  const f = twoRooms();
  const hid = hiddenWallIds(f, [-5000, 8000, 4000], 85, { cutaway: false, v3: { outerWalls: true, innerWalls: false } });
  expect([...hid]).toEqual([f.shared.id]);
});

test('with both flags on, the cutaway rules are unchanged', () => {
  const f = twoRooms();
  const hid = hiddenWallIds(f, [-5000, 8000, 4000], 35, { cutaway: true, v3: { outerWalls: true, innerWalls: true } });
  // §17.1: 내벽도 카메라 쪽이면 숨는다(북서쪽에서 보면 공유 벽의 법선과 45°다).
  expect(hid.has(f.shared.id)).toBe(true);
  expect(hid.size).toBeGreaterThan(0);
});

// --- 순수 가시성 규칙(applyCutaway / applySolo가 메시마다 쓰는 규칙) ---
const mesh = (name, userData = {}, visible = true) => ({ name, visible, userData });

test('cutawayMeshStyle: 감춘 벽은 밑동만, 벽 투명화는 윗면·선·안쪽 면까지 남긴다', () => {
  expect(cutawayMeshStyle('wallFoot', { isHidden: true, seeThrough: false })).toEqual({ visible: true, opacity: null });
  expect(cutawayMeshStyle('wallFoot', { isHidden: true, seeThrough: true }).visible).toBe(false);
  expect(cutawayMeshStyle('wall', { isHidden: false, seeThrough: false, baseOpacity: 0.4 })).toEqual({ visible: true, opacity: 0.4 });
  expect(cutawayMeshStyle('wall', { isHidden: true, seeThrough: false }).visible).toBe(false);
  for (const n of ['wallTop', 'edges', 'wallFace']) {
    expect(cutawayMeshStyle(n, { isHidden: true, seeThrough: false }).visible).toBe(false);
    expect(cutawayMeshStyle(n, { isHidden: true, seeThrough: true }).visible).toBe(true); // 벽 투명화를 따라간다
  }
  expect(cutawayMeshStyle('wallFace', { isHidden: true, seeThrough: true }).opacity).toBe(0.25);
  expect(cutawayMeshStyle('wallTop', { isHidden: true, seeThrough: true }).opacity).toBeNull(); // 윗면·선은 재질을 건드리지 않는다
});

test('soloMeshVisible: 단일 공간 모드를 끄면 바닥이 다시 보이고 천장은 1인칭에서만 보인다', () => {
  const room = { id: 'r1', wallIds: ['w1'] };
  const floorOther = mesh('floor', { roomId: 'r2' });
  expect(soloMeshVisible(mesh('floor', { roomId: 'r1' }), room)).toBe(true);
  expect(soloMeshVisible(floorOther, room)).toBe(false);
  expect(soloMeshVisible(mesh('ceiling', { roomId: 'r1' }), room)).toBe(false);
  // 단일 공간 모드 해제: 숨겨져 있던 다른 방 바닥도 되돌아온다
  expect(soloMeshVisible(mesh('floor', { roomId: 'r2' }, false), null)).toBe(true);
  expect(soloMeshVisible(mesh('ceiling', { roomId: 'r2' }, false), null, 'iso')).toBe(false);
  expect(soloMeshVisible(mesh('ceiling', { roomId: 'r2' }, false), null, 'fp')).toBe(true);
});

test('soloMeshVisible: 벽은 컷어웨이 결과를 존중하고 이웃 방의 wallFace는 숨는다', () => {
  const room = { id: 'r1', wallIds: ['w1', 'w2'] };
  expect(soloMeshVisible(mesh('wall', { wallId: 'w1' }), room)).toBe(true);
  expect(soloMeshVisible(mesh('wall', { wallId: 'w9' }), room)).toBe(false); // 방 밖의 벽
  expect(soloMeshVisible(mesh('wall', { wallId: 'w1' }, false), room)).toBe(false); // 컷어웨이가 감춘 벽은 그대로 감춘다
  expect(soloMeshVisible(mesh('wallFace', { wallId: 'w1', roomId: 'r1' }), room)).toBe(true);
  expect(soloMeshVisible(mesh('wallFace', { wallId: 'w1', roomId: 'r2' }), room)).toBe(false);
  expect(soloMeshVisible(mesh('wall', { wallId: 'w1' }, false), null)).toBe(false); // 해제해도 벽은 컷어웨이가 정한 대로
});

test('영역 메시는 컷어웨이·단일 공간 모드에서 벽면과 같게 다뤄진다', () => {
  expect(cutawayMeshStyle('wallRegion', { isHidden: false, baseOpacity: 1 })).toEqual({ visible: true, opacity: 1 });
  expect(cutawayMeshStyle('wallRegion', { isHidden: true, baseOpacity: 1 })).toEqual({ visible: false, opacity: 1 });
  expect(cutawayMeshStyle('wallRegion', { isHidden: true, seeThrough: true, baseOpacity: 1 })).toEqual({ visible: true, opacity: 0.25 });
  const room = { id: 'r1', wallIds: ['w1'] };
  expect(soloMeshVisible({ name: 'wallRegion', visible: true, userData: { wallId: 'w1', side: 'in' } }, room)).toBe(true);
  expect(soloMeshVisible({ name: 'wallRegion', visible: true, userData: { wallId: 'w2', side: 'in' } }, room)).toBe(false);
  expect(soloMeshVisible({ name: 'wallFace', visible: true, userData: { wallId: 'w1', roomId: 'r2' } }, room)).toBe(false);
});

// §17.1: 컷어웨이는 **메시의 visible·opacity만** 바꾼다 — 씬을 다시 짓게 만들지 않는다.
test('applyCutawayTo는 벽 메시만, visible·opacity만 건드린다', () => {
  const mk = (name, wallId) => ({ name, visible: true, userData: wallId ? { wallId } : {}, material: { opacity: 1, transparent: false, depthWrite: true } });
  const group = { children: [mk('wall', 'w1'), mk('wallFoot', 'w1'), mk('wall', 'w2'), mk('floor', null), mk('label', null)] };
  const n = applyCutawayTo(group, { hidden: new Set(['w1']), seeThrough: false, baseOpacity: 1 });
  expect(n).toBe(3);                                       // 벽 메시 셋만 손댔다
  expect(group.children[0].visible).toBe(false);           // 숨긴 벽 본체
  expect(group.children[1].visible).toBe(true);            // 밑동 윤곽은 남는다(평면 구조가 읽힌다)
  expect(group.children[2].visible).toBe(true);
  expect(group.children[3].visible).toBe(true);            // 바닥은 건드리지 않는다
  expect(group.children[4].visible).toBe(true);            // 라벨도 그대로
  // 벽 투명화를 켜면 숨긴 벽이 반투명으로 남는다(재질만 바뀐다).
  applyCutawayTo(group, { hidden: new Set(['w1']), seeThrough: true, baseOpacity: 1 });
  expect(group.children[0].visible).toBe(true);
  expect(group.children[0].material.opacity).toBe(0.25);
  expect(group.children[0].material.transparent).toBe(true);
  expect(applyCutawayTo(null, {})).toBe(0);                // 그룹이 없어도 던지지 않는다
});

// 카메라가 돌 때마다 씬을 다시 짓지 않는다: 서명에 카메라·컷어웨이 입력이 **없다**.
test('sceneSignature에는 컷어웨이 입력이 없다', () => {
  const p = createEmptyProject();
  const before = sceneSignature(p);
  p.view.cutaway = !p.view.cutaway;
  expect(sceneSignature(p)).toBe(before);
  activeFloor(p).walls = [{ id: 'w1', a: [0.5, 0.25], b: [4000.5, 0.25], thickness: 200, height: 2300 }];
  expect(sceneSignature(p)).not.toBe(before);              // 도면이 바뀌면 다시 짓는다
});

// §17.4(2)가 쓰는 촬영용 판정: 천장 평면도와 "현재 카메라"는 컷어웨이가 없다.
test('shotCutaway는 프리셋에 따라 촬영 카메라 기준의 숨길 벽을 준다', () => {
  const f = floor();
  expect(shotCutaway(f, [0, -20000, 1750], null, {})).toBeNull();      // 현재 카메라 렌더
  expect(shotCutaway(f, [0, -20000, 1750], 'top', {})).toBeNull();     // 천장 평면도
  const hid = shotCutaway(f, [2000, -20000, 1750], 'front', {});       // 남쪽에서 보는 정면도
  expect(hid.has(top(f))).toBe(true);                                  // 앞쪽(북쪽) 벽이 사라진다
  expect(hid.has(left(f))).toBe(false);                                // 옆벽은 비스듬해서 남는다
});
