import { test, expect } from 'vitest';
import { rectWalls } from '../src/geom/walls.js';
import { detectRooms } from '../src/geom/rooms.js';
import { hiddenWallIds, wallOwners, isExteriorWall, cutawayMeshStyle, soloMeshVisible } from '../src/view3d/cutaway.js';

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
test('shared interior wall is never hidden', () => {
  const a = rectWalls([0, 0], [4000, 3000], 200), b = rectWalls([4000, 0], [7000, 3000], 200);
  const shared = b.find(w => w.a[0] === 4000 && w.b[0] === 4000);
  const walls = [...a, ...b.filter(w => w !== shared)];
  const f = { walls, rooms: detectRooms(walls) };
  const mid = a.find(w => w.a[0] === 4000 && w.b[0] === 4000).id;
  expect(hiddenWallIds(f, [9000, 9000, 3000], 35, view).has(mid)).toBe(false);
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
  expect(hid.has(f.shared.id)).toBe(false);
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
