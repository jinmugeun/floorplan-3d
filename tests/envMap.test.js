// 계획 17 평면 백색 포화(p17-wash): 환경 맵 장면(src/view3d/envMap.js)에서 천정점(+Y) 발광판을 뺀다.
// RoomEnvironment의 +Y 발광판(세기 100 — 다른 발광판의 2~6배)은 원점 바로 위라 환경 맵의 천정점에 앉는다. 위에서 곧장 내려다보는 직교 카메라(2D 투영 평면 ·
// 렌더샷 평면 · 시방서 천장 평면도)는 시선이 화면 전체에서 같아, 모든 수평면의 반사 방향이 천정점이 된다 → 바닥·식탁·기구 윗면이 모두 #ffffff(톤 매핑 없음).
// PMREM 굽기는 WebGL이 필요해 node에서 돌릴 수 없다 — 장면 고르기(순수)와 배선(소스)만 시험한다.
import { test, expect } from 'vitest';
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { roomScene, isZenithEmitter, ZENITH_DEG } from '../src/view3d/envMap.js';

const emitters = scene => scene.children.filter(o => o.isMesh && o.material.isMeshBasicMaterial);
const angleFromUp = o => THREE.MathUtils.radToDeg(o.position.angleTo(new THREE.Vector3(0, 1, 0)));

test('roomScene: RoomEnvironment에서 천정점 발광판(+Y · 세기 100) 하나만 빼고 나머지(방·상자·점광원·옆 발광판 5개)는 그대로 둔다', () => {
  const ref = new RoomEnvironment(), env = roomScene();
  expect(env).toBeInstanceOf(RoomEnvironment);
  expect(env.children.length).toBe(ref.children.length - 1);
  expect(emitters(ref).length).toBe(6);
  expect(emitters(env).length).toBe(5);
  expect(emitters(env).map(o => o.material.color.r).sort((a, b) => a - b)).toEqual([17, 20, 43, 50, 50]);
  expect(emitters(env).every(o => angleFromUp(o) > ZENITH_DEG)).toBe(true);   // 남은 발광판은 모두 천정점에서 45° 넘게 떨어져 있다
  expect(env.children.some(o => o.isPointLight)).toBe(true);                   // 방을 밝히는 점광원(천장을 비춘다)은 남긴다
});

test('isZenithEmitter: 발광판(MeshBasicMaterial)이면서 원점에서 본 방향이 +Y에서 ZENITH_DEG 안일 때만 참', () => {
  const ref = new RoomEnvironment();
  const top = emitters(ref).find(o => o.material.color.r === 100);
  expect(isZenithEmitter(top)).toBe(true);
  expect(emitters(ref).filter(o => isZenithEmitter(o))).toEqual([top]);
  // 방 상자(MeshStandardMaterial)는 중심이 +Y에서 약 4°지만 발광판이 아니다 · 점광원은 메시가 아니다
  const room = ref.children.find(o => o.isMesh && o.material.side === THREE.BackSide);
  expect(angleFromUp(room)).toBeLessThan(ZENITH_DEG);
  expect(isZenithEmitter(room)).toBe(false);
  expect(isZenithEmitter(ref.children.find(o => o.isPointLight))).toBe(false);
  const at = (x, y, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial()); m.position.set(x, y, z); return m; };
  expect(isZenithEmitter(at(0, 10, 5))).toBe(true);      // 26.6°
  expect(isZenithEmitter(at(0, 10, 6))).toBe(false);     // 31.0°
  expect(isZenithEmitter(at(0, -20, 0))).toBe(false);    // 바닥 쪽
  expect(isZenithEmitter(at(0, 0, 0))).toBe(false);      // 방향이 없다
});

test('createEnvMap은 roomScene()을 굽는다(원본 RoomEnvironment를 그대로 굽지 않는다)', () => {
  const src = readFileSync(fileURLToPath(new URL('../src/view3d/envMap.js', import.meta.url)), 'utf8');
  expect(src).toMatch(/pmrem\.fromScene\(roomScene\(\), 0\.04\)/);
  expect(src).not.toMatch(/fromScene\(new RoomEnvironment\(\)/);
});
