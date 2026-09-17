import { test, expect, vi } from 'vitest';
import { rectWalls } from '../src/geom/walls.js';
import { detectRooms } from '../src/geom/rooms.js';
import { buildFloorGroup, disposeGroup } from '../src/view3d/build.js';

function floor() { const walls = rectWalls([0, 0], [4000, 3000], 200); return { walls, rooms: detectRooms(walls), height: 2300 }; }

test('buildFloorGroup makes one mesh per wall and wall top, one floor and a hidden ceiling', () => {
  const g = buildFloorGroup(floor(), { wallOpacity: 1 });
  const names = g.children.map(c => c.name);
  expect(names.filter(n => n === 'wall')).toHaveLength(4);
  expect(names.filter(n => n === 'wallTop')).toHaveLength(4);
  expect(names.filter(n => n === 'floor')).toHaveLength(1);
  expect(g.children.find(c => c.name === 'ceiling').visible).toBe(false);
  expect(g.children.filter(c => c.name === 'wall').every(c => typeof c.userData.wallId === 'string')).toBe(true);
});

test('disposeGroup disposes every geometry and only per-mesh materials', () => {
  const g = buildFloorGroup(floor(), { wallOpacity: 1 });
  const geoSpies = [], mats = new Set();
  g.traverse(o => { if (o.geometry) geoSpies.push(vi.spyOn(o.geometry, 'dispose')); if (o.material) mats.add(o.material); });
  const matSpies = [...mats].map(m => [m, vi.spyOn(m, 'dispose')]);
  disposeGroup(g);
  expect(geoSpies.length).toBeGreaterThan(0);
  expect(geoSpies.every(s => s.mock.calls.length === 1)).toBe(true);
  for (const [m, s] of matSpies) expect(s.mock.calls.length).toBe(m.userData.perMesh ? 1 : 0);
});

test('wall material is transparent only when wallOpacity < 1', () => {
  const opaque = buildFloorGroup(floor(), { wallOpacity: 1 }).children.filter(c => c.name === 'wall');
  expect(opaque.every(c => c.material.transparent === false && c.material.opacity === 1)).toBe(true);
  const seeThrough = buildFloorGroup(floor(), { wallOpacity: 0.4 }).children.filter(c => c.name === 'wall');
  expect(seeThrough.every(c => c.material.transparent === true && c.material.opacity === 0.4)).toBe(true);
});
