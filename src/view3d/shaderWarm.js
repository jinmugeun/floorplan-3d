// 셰이더 예열 장면(2026-10-13 · 계획 14 Task B · 사전 검토 p14-preflight I-4 · 계획 13 Task 3 리뷰 P3-1).
//
// 왜: 2D를 보는 동안 리빌드를 미루면(rebuildGate.js) 3D로 처음 바꿀 때 리빌드와 셰이더 링크(MeshStandard 변형·LineBasic·
// 라벨 Sprite·접힌 점 Points — SwiftShader에서 프로그램 하나에 ≈ 100 ms)가 그 클릭에 함께 얹힌다. 예전에는 시작할 때 숨은 캔버스가
// 빈 장면을 그려 기본 프로그램을 링크해 두었고, 나머지 링크는 2D [가져오기] 클릭이 떠안았다. 가져온 직후의 compileAsync는 소용이 없다:
// 리빌드를 미뤘으니 장면에 새 재질이 없고, KHR_parallel_shader_compile이 없으면 곧바로 끝나 링크 대기가 첫 렌더로 간다(WebGLProgram.js:1048).
// 그래서 view3d를 만든 뒤 유휴 시간에 한 번, **실제 재질 공장**(build.js·items3d·itemShapes·ducts3d·labels3d·labelDots)으로 지은
// 작은 예열 층을 renderer.compile(warm, camera, scene)으로 컴파일한다. 세 번째 인자 scene의 조명·그림자·안개로 프로그램 키를 잡으므로
// 실제 장면과 같은 프로그램이 생긴다. 링크는 유휴 동안 GPU 프로세스가 끝낸다(메인 스레드는 상태를 묻지 않으니 막히지 않는다).
//
// 재질은 dispose하지 않는다(의도): three는 프로그램을 쓰는 마지막 재질이 버려지면 프로그램을 지운다(WebGLPrograms.releaseProgram).
// 예열 재질이 사용 수 1을 붙들고 있어야 리빌드가 옛 그룹의 재질을 버릴 때도 라벨·윤곽선 프로그램이 살아남는다(다시 링크하지 않는다).
// 지오메트리·텍스처는 compile이 GPU에 올리지 않으므로 따로 버릴 것이 없다(참조가 끊기면 GC가 가져간다).
import * as THREE from 'three';
import { rectWalls } from '../geom/walls.js';
import { detectRooms } from '../geom/rooms.js';
import { createItem } from '../state/schema.js';
import { normalizeDuct } from '../state/ductSchema.js';
import { productById } from '../products/catalog.js';
import { buildFloorGroup } from './build.js';
import { syncLabelDots } from './labelDots.js';

// 재질 변형을 고루 갖춘 작은 층: 벽(바깥면·안쪽 면·윗면·윤곽선)·바닥·천장(숨김 — compile은 보이지 않는 것도 훑는다)·
// 문 개구부·창(반투명 MeshStandard)·기둥·일반 제품(이름 라벨)·설비(번호 라벨)·덕트(반투명 + 단면 라벨).
export function warmFloor() {
  const walls = rectWalls([0, 0], [4000, 3000], 200, 2400);
  const w = walls[0];
  const on = (id, t, patch = {}) => createItem(productById(id), { wallId: w.id, t, ...patch });
  const items = [
    on('door-swing-900', 0.25),
    on('window-slide-1200', 0.7),
    createItem(productById('column-square'), { pos: [600, 600] }),
    createItem(productById('hood-box'), { pos: [2000, 1500], z: 1800, props: { type: 'hood', no: 1 } }),
    createItem(productById('fridge-2door'), { pos: [3200, 2200], name: '예열 이름' }),
  ];
  const ducts = [normalizeDuct({ id: 'warm-duct', kind: 'exhaust', points: [[500, 1500], [3500, 1500]], segments: [{ w: 400, h: 300, z: 2100 }] })].filter(Boolean);
  return { walls, rooms: detectRooms(walls), items, ducts, height: 2400 };
}

// 예열 그룹: 실제 빌드 + 접힌 라벨 점(Points)은 컬링 때만 생기므로 여기서 하나 만든다.
export function warmGroup(view = {}) {
  const g = buildFloorGroup(warmFloor(), view);
  const labels = g.children.find(o => o.name === 'labels');
  const sprite = labels?.children.find(o => o.isSprite);
  if (sprite) syncLabelDots(labels, [sprite]);
  return g;
}

// 내려받는 중인 웹 글꼴을 기다린 뒤에 짓는다: 라벨·점 텍스처는 글자별로 캐시돼(labelTexture.js) 실제 장면이 그대로 다시 쓴다
// ('●' 점 텍스처는 늘 같은 것). 글꼴이 오는 중에 그리면 대체 글꼴 글자가 세션 내내 남는다.
// 참고(2026-10-13 측정): IBM Plex Sans KR은 유니코드 구간별 조각으로 나뉘어 **그 글자를 처음 그릴 때** 조각을 받는다. 그래서 세션의 첫 라벨
// 텍스처는(예열이 없던 HEAD도) 조각이 오기 전 대체 글꼴로 그려져 캐시된다. 예열 텍스트가 몇 조각을 먼저 받게 하므로 예열 빌드의 라벨 글자 화소가
// HEAD와 조금 다르다(라벨 수·접힘·컷어웨이는 같다). 글꼴 조각이 도착하면 라벨을 다시 그리는 일은 이 태스크 밖이다.
const fontsReady = () => (typeof document !== 'undefined' && document.fonts?.ready) || null;

// 예열 1회. compileAsync(r158+)가 있으면 그것을, 없으면 compile을 부른다. 둘 다 없으면(jsdom 가짜 렌더러) null — 생략.
export function warmShaders(renderer, scene, camera, view = {}) {
  const fn = typeof renderer?.compileAsync === 'function' ? 'compileAsync' : typeof renderer?.compile === 'function' ? 'compile' : null;
  if (!fn) return null;
  return Promise.resolve(fontsReady()).then(() => {
    const warm = new THREE.Scene();
    warm.add(warmGroup(view));
    return renderer[fn](warm, camera, scene);
  });
}
