import * as THREE from 'three';
import { toThree } from './build.js';
import { productById } from '../products/catalog.js';
import { itemVisible } from '../view2d/items2d.js';
import { RAD } from '../geom/items.js';
import { memoCollisions } from '../geom/collide.js';
import { shapeFor, itemMaterial, ITEM_EDGE_COLOR } from './itemShapes.js';
import { perfSettings } from './perfMode.js';
import { templateOf, requestAsset, fitClone } from './itemAssets.js';

const M = v => v / 1000;
export const itemVisible3 = (item, v3 = {}) => itemVisible(item, v3);
export const COLLIDE_COLOR = '#e5484d';   // 2D의 빨간 테두리와 같은 신호

// 그룹이든 메시든 색을 칠한다(조합 형상은 자식마다 재질이 있다).
// 실사 에셋 메시(userData.shared)는 건너뛴다(2026-10-13 · 계획 15 Task B · 사전 검토 §8 · S-7): 재질을 같은 제품의 모든 아이템과
// 나눠 쓰므로 칠하면 인스턴스 전부가 붉어진다. 대신 아이템 크기의 붉은 상자 선(collideBox)을 한 번 붙인다.
export function paintItem(obj, color) {
  let shared = false;
  obj.traverse(o => { if (o.userData.shared) shared = true; else if (o.material?.color) o.material.color.set(color); });
  if (shared && obj.userData.assetSize && !obj.getObjectByName('collideBox')) obj.add(collideBox({ id: obj.userData.itemId, size: obj.userData.assetSize }, color));
}

// 충돌 표시 상자 선: 아이템 로컬 원점(= 아이템 중심)에 아이템 size 그대로. 지오메트리·재질은 이 아이템 전용이라(perMesh)
// disposeGroup이 정리한다. raycast를 비운다 — 픽·면 피커·몸체 드래그는 isMesh만 보니 어차피 버리지만 훑는 비용도 아낀다.
export function collideBox(item, color = COLLIDE_COLOR) {
  const [w, d, h] = item.size;
  const mat = new THREE.LineBasicMaterial({ color });
  mat.userData.perMesh = true;
  const line = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(M(w), M(h), M(d))), mat);
  line.name = 'collideBox'; line.userData.itemId = item.id; line.raycast = () => {};
  return line;
}

// 얇은 윤곽선(v3.itemEdges). 메시마다 자식으로 달아 부모의 변환을 그대로 따르게 한다.
// 선은 재질 하나를 나눠 쓴다(아이템 하나당 하나) — disposeGroup이 perMesh 표시로 정리한다.
function addEdges(obj) {
  const mat = new THREE.LineBasicMaterial({ color: ITEM_EDGE_COLOR, transparent: true, opacity: 0.55 });
  mat.userData.perMesh = true;
  const meshes = [];
  obj.traverse(o => { if (o.isMesh) meshes.push(o); });
  for (const m of meshes) {
    const line = new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry, 25), mat);
    line.name = 'itemEdge';
    m.add(line);
  }
}

// 조합 형상이 없는 제품의 예전 모양: 박스(원형 기둥은 실린더). 개구부는 벽에 구멍만 내고 메시가 없다.
function simpleMesh(item) {
  const [w, d, h] = item.size;
  const p = productById(item.productId);
  const round = item.kind === 'column' && (p?.symbol === 'columnRound' || p?.symbol === 'circle'); // 'circle'은 옛 파일 호환
  const geo = round
    ? new THREE.CylinderGeometry(M(w / 2), M(w / 2), M(h), 24)
    : new THREE.BoxGeometry(M(w), M(h), M(d));
  const mat = itemMaterial(item);
  if (item.kind === 'window') { mat.transparent = true; mat.opacity = 0.35; }
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true; mesh.receiveShadow = true;
  return mesh;
}

// 실사 에셋 아이템: 템플릿 복제(지오메트리·재질 공유)를 담은 Group. 충돌 상자 선을 그릴 크기를 같이 둔다(paintItem은 아이템을 모른다).
// 모델은 item.color(속성 패널 색)를 따르지 않는다 — 겉모습만 바뀌고 크기·자리·충돌은 상자와 같다.
function assetGroup(tpl, item) {
  const g = new THREE.Group();
  g.add(fitClone(tpl, item));
  g.userData.assetSize = item.size;   // 스토어 스냅숏은 불변이라 복사하지 않는다(clone은 userData를 JSON으로 복사한다)
  return g;
}

// 아이템 하나를 3D 오브젝트로. 실사 에셋이 있으면 템플릿 복제 Group, 심벌에 조합 형상이 있으면 Group, 없으면 예전처럼 Mesh다.
// 좌표: 월드 (x, y)가 three (x, z)이고 z(높이)가 three y다. 월드 회전 rot은 three -Y 회전이다.
// assets(2026-10-13 · 계획 15 Task B): 제품에 asset이 있으면 늘 모델이다(LOD 없음 — 근거는 itemAssets.js 머리). 템플릿이 아직 없으면
// 요청만 걸고 이번에는 상자로 선다 — 도착하면 view3d가 다시 짓는다. 성능 모드·v3.assets 토글·셰이더 예열은 false(요청도 없다).
// product는 테스트 주입용이다(기본은 카탈로그).
export function itemMesh(item, { edges = false, assets = true, product = productById(item.productId) } = {}) {
  if (item.kind === 'opening') return null;
  const useAsset = assets && !!product?.asset;
  const tpl = useAsset ? templateOf(product.id) : null;
  if (useAsset && !tpl) requestAsset(product);   // 받는 중·실패한 종류는 requestAsset이 거른다
  const obj = tpl ? assetGroup(tpl, item) : (shapeFor(item) ?? simpleMesh(item));
  obj.position.copy(toThree([item.pos[0], item.pos[1], item.z + item.size[2] / 2]));
  obj.rotation.y = -RAD(item.rot);
  // 2D와 같은 반전: 캔버스가 (translate → rotate → scale)로 아이템 로컬 축을 세우듯
  // three의 로컬 행렬도 T·R·S라 음수 스케일이 회전 전에, 즉 아이템 로컬 축을 기준으로 먹는다.
  // 로컬 x = 너비(2D의 flipH), 로컬 z = 깊이(2D의 flipV)다. 형상이 비대칭이 된 뒤로는
  // 이것이 없으면 후드 슬릿·냉장고 손잡이·침대 헤드보드가 2D와 3D에서 반대쪽에 온다.
  obj.scale.set(item.flipH ? -1 : 1, 1, item.flipV ? -1 : 1);
  obj.name = 'item';
  if (edges && !tpl) addEdges(obj);   // 모델에는 윤곽선을 붙이지 않는다: 삼각형 수천 개의 EdgesGeometry는 비싸고 선이 질감을 덮는다
  // 레이캐스트가 자식을 맞혀도 어느 아이템인지 알 수 있게 모든 자손에 id를 박는다(엣지 선까지).
  obj.traverse(o => { o.userData.itemId = item.id; });
  return obj;
}

// 층의 아이템을 3D 오브젝트로 모은 그룹(name 'items'). 숨김·v3 토글은 itemVisible(공유 규칙)이 가린다.
export function buildItems(floor, view = {}) {
  const g = new THREE.Group();
  g.name = 'items';
  const v3 = view.v3 ?? {};
  const edges = v3.itemEdges !== false && perfSettings(view.perfMode).edges;   // 성능 우선은 플래그를 그대로 두고 렌더에서만 생략(§13.4)
  const assets = v3.assets !== false && perfSettings(view.perfMode).assets;    // 실사 모델도 같다(계획 15 Task B) — 옛 프로젝트(키 없음)는 켬
  // 충돌은 2D·배너·속성 패널과 같은 캐시에서 읽는다(2026-10-12 · 계획 13 Task 5 · 사전 검토 I-5): 예전에는 재빌드마다
  // collidingIds를 다시 돌려, 가져온 기구 330개에서 재빌드 한 번에 50~65 ms가 더해졌다. 스토어가 불변 스냅숏이라
  // 같은 배열 = 같은 결과다. 돌려받는 Set은 캐시 내부 객체라 읽기만 한다(has).
  const bad = v3.collision === false ? null : memoCollisions(floor.items ?? []);
  for (const item of floor.items ?? []) {
    if (!itemVisible3(item, v3)) continue;
    const obj = itemMesh(item, { edges, assets });
    if (!obj) continue;
    if (bad?.has(item.id)) paintItem(obj, COLLIDE_COLOR);
    g.add(obj);
  }
  return g;
}
