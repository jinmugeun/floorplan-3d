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
import { KITCHEN_PRODUCTS } from '../products/catalogKitchen.js';
import { buildFloorGroup } from './build.js';
import { withWarmPhotos } from '../materials/texture.js';
import { syncLabelDots } from './labelDots.js';

// 재질 변형을 고루 갖춘 작은 층: 벽(바깥면·안쪽 면·윗면·윤곽선)·바닥·천장(숨김 — compile은 보이지 않는 것도 훑는다)·스테인리스 형상(오븐·배식대 — 계획 17)·
// 문 개구부·창(반투명 MeshStandard)·기둥·일반 제품(이름 라벨)·설비(번호 라벨)·덕트(반투명 + 단면 라벨).
// 타일(계획 19 설계 §4.1): 줄눈 패치(customProgramCacheKey) × 금속(metalnessMap) × 벽 본체(FrontSide)·방 안쪽 면(DoubleSide) 네 변형을 첫 두 벽에 바른다
// (나머지 두 벽은 지정 없는 벽 변형으로 남긴다). 사진은 받지 않는다 — warmGroup이 withWarmPhotos로 짓는다.
export const WARM_TILES = ['tile-white-300', 'tile-metal-48'];
export function warmFloor() {
  const walls = rectWalls([0, 0], [4000, 3000], 200, 2400);
  const [tile, metal] = WARM_TILES.map(id => () => ({ id, offset: [0, 0], angle: 0 }));
  walls[0] = { ...walls[0], matOut: tile(), matIn: metal() };
  walls[1] = { ...walls[1], matOut: metal(), matIn: tile() };
  const w = walls[0];
  const on = (id, t, patch = {}) => createItem(productById(id), { wallId: w.id, t, ...patch });
  // 엑셀에서 그 형상이 사라져도 예열이 createItem(undefined)로 던지지 않게 일반 상자로(계획 17 최종 리뷰 M-15).
  const kitchen = shape => KITCHEN_PRODUCTS.find(p => p.shape === shape) ?? productById('equip-generic');
  const items = [
    on('door-swing-900', 0.25),
    on('window-slide-1200', 0.7),
    createItem(productById('column-square'), { pos: [600, 600] }),
    createItem(productById('hood-box'), { pos: [2000, 1500], z: 1800, props: { type: 'hood', no: 1 } }),
    createItem(productById('fridge-2door'), { pos: [3200, 2200], name: '예열 이름' }),
    // 스테인리스 형상 재질(계획 17 Task 6): 오븐 = 스테인리스(양면)·유리(반투명)·어두운 부품·강조 · 배식대 = 국·반찬 색
    createItem(kitchen('oven'), { pos: [1000, 2200] }),
    createItem(kitchen('counter'), { pos: [2600, 700] }),
  ];
  const ducts = [normalizeDuct({ id: 'warm-duct', kind: 'exhaust', points: [[500, 1500], [3500, 1500]], segments: [{ w: 400, h: 300, z: 2100 }] })].filter(Boolean);
  return { walls, rooms: detectRooms(walls), items, ducts, height: 2400 };
}

// 예열 그룹: 실제 빌드 + 접힌 라벨 점(Points)은 컬링 때만 생기므로 여기서 하나 만든다.
// 실사 에셋 없이 짓는다(2026-10-13 · 계획 15 Task B · 사전 검토 I-6): 예열은 2D 시작 직후 유휴 시간에 돈다 — 예열 층의 제품에 asset이
// 붙으면 2D만 쓰는 세션이 GLB·로더 청크를 받는다. 모델 재질의 프로그램은 첫 3D 프레임이 링크한다.
export function warmGroup(view = {}) {
  const g = withWarmPhotos(() => buildFloorGroup(warmFloor(), { ...view, v3: { ...view.v3, assets: false } }));
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

// 예열 1회. renderer.compile이 없으면(jsdom 가짜 렌더러) null — 생략.
// 여기서도 compileAsync를 쓰지 않는다(2026-10-13 · 계획 14 Task B 리뷰 I-1 — rebuildGate.shaderPrewarm과 같은 판단): 예열 재질은 버리지 않으니
// 폴링이 리빌드와 부딪치지는 않지만, renderer.dispose(view3d destroy)는 three의 properties를 비워 같은 타이머 TypeError를 낸다. 결과 Promise를
// 기다리는 쪽이 없으므로 compileAsync가 더 주는 것은 없고, 링크 요청은 compile이 똑같이 건다.
export function warmShaders(renderer, scene, camera, view = {}) {
  if (typeof renderer?.compile !== 'function') return null;
  return Promise.resolve(fontsReady()).then(() => {
    const warm = new THREE.Scene();
    warm.add(warmGroup(view));
    return renderer.compile(warm, camera, scene);
  });
}
