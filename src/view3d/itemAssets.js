// 제품 실사 에셋(glTF) 런타임 로더(2026-10-13 · 계획 15 Task B · 사전 검토 app/.superpowers/sdd/p15-preflight.md).
//
// 왜 종류당 한 번 받아 공유하나: 같은 제품 아이템은 GLB 한 번 · GPU 지오메트리 한 벌을 나눠 쓴다(템플릿 clone은 지오메트리·재질을
// 공유한다 — Mesh.copy). 사전 검토 실측(UHD 730 · 의자 100개 · vsync 끔): 지금의 조합 형상 + 윤곽선은 의자당 draw 12로 프레임 간격
// 10.4 ms였고, 공유 GLB 복제는 의자당 draw 1로 ≈ 3 ms — 이 PC의 병목은 삼각형이 아니라 draw 호출 수다.
// 왜 LOD("멀면 상자")가 없나: 위 수치대로 상자 쪽이 오히려 느리고, 직교 카메라(2D 투영·렌더샷 프리셋)는 LOD 거리가 위치 거리 / zoom이라
// 도면 폭 6.5 m를 넘으면 전부 상자가 된다(사전 검토 I-7). 에셋이 있으면 늘 모델이고, 로드 전·실패·토글·성능 모드만 상자다.
// 왜 동적 import인가: GLTFLoader·MeshoptDecoder는 assetLoader.js 한 청크로 처음 모델을 받을 때 한 번 온다(모듈 캐시가 메모 · I-10).
// index에는 로더가 쓰는 three 클래스만 붙는다(three는 한 모듈이라 나눌 수 없다 — 실측 +41 KB · gzip +11.6 KB · I-2).
// 왜 enableAssets 게이트인가: view3d가 켜기 전에는 requestAsset이 no-op — 단위 테스트·2D 전용 경로·예열이 GLB를 받지 않는다(I-6).
// 왜 한 틱에 모아 알리나: 종류마다 알리면 층 전체 리빌드(사동급 178 ms)가 종류 수만큼 돈다(I-11). 실패도 그 묶음에 든다(상자 그대로 · 재시도 없음).
//
// 규약(아키텍처 §19): 파일 models/<asset>.glb(상대 경로 — Vite base './'), 단위 m, 원점 = 바닥 중심(y 0), +Y 위,
// **정면 +Z**(등받이·헤드보드가 −Z — itemShapes·2D 심벌과 같다), x = 너비 w, y = 높이 h, z = 깊이 d.
// 포장은 균일 배율이고 런타임은 아이템 size에 축별로 맞춘다(사용자가 늘린 크기도 따른다 — 상자와 같은 규칙 · I-8).
// 이 모듈은 store·DOM을 읽지 않는다.
import * as THREE from 'three';

// 제품 id → 템플릿. 값이 null이면 받는 중이거나 실패한 종류다(둘 다 다시 요청하지 않는다).
const cache = new Map(), subs = new Set();
let version = 0, enabled = false, loader = null, timer = 0;

export const assetUrl = p => (p?.asset ? `models/${p.asset}.glb` : null);
export const enableAssets = (on = true) => { enabled = !!on; };
export const templateOf = id => cache.get(id) ?? null;
export const assetsVersion = () => version;
export const onAssetsReady = cb => { subs.add(cb); return () => { subs.delete(cb); }; };
const defaultLoader = url => import('./assetLoader.js').then(m => m.loadScene(url));

// 테스트 훅: 로더 바꿔 끼우기((url) => Promise<Object3D>)와 모듈 상태 비우기.
export const __setLoader = fn => { loader = fn; };
export const __reset = () => { cache.clear(); subs.clear(); clearTimeout(timer); timer = 0; version = 0; enabled = false; loader = null; };

function settle() {
  if (timer) return;
  timer = setTimeout(() => { timer = 0; version += 1; for (const cb of subs) cb(version); }, 0);
}

// 바닥 중심으로 옮긴다: 원래 위치에 더한다 — 루트에 위치가 있어도 어긋나지 않는다(사전 검토 S-4: set(-c)는 덮어써 중심이 −5로 갔다).
// 템플릿은 감싼 Group이다: fitClone이 배율·높이를 Group에 쓰므로 glTF 장면 루트의 변환은 그대로 남는다.
function normalize(obj) {
  const bb = new THREE.Box3().setFromObject(obj), off = bb.getCenter(new THREE.Vector3()).negate().setY(-bb.min.y);
  obj.position.add(off); bb.translate(off);
  const g = new THREE.Group(); g.add(obj);
  g.userData.bbox = { min: bb.min.toArray(), max: bb.max.toArray() };
  g.traverse(o => { if (o.isMesh) { o.userData.shared = true; o.castShadow = o.receiveShadow = true; } });
  return g;
}

// 중복(받는 중·받음)과 실패한 종류는 무시한다 — 실패는 다시 시도하지 않는다(상자로 남는다).
export function requestAsset(p) {
  const url = assetUrl(p);
  if (!enabled || !url || cache.has(p.id)) return;
  cache.set(p.id, null);
  (loader ?? defaultLoader)(url).then(obj => { cache.set(p.id, normalize(obj)); }).catch(() => {}).finally(settle);
}

// 템플릿을 복제해(지오메트리·재질 공유) 아이템 size에 축별로 맞춘다. items3d가 아이템 중심(z + h/2)에 세우므로 바닥을 −h/2로 내린다.
// 메시의 userData.shared는 clone이 그대로 옮긴다(Object3D.copy가 userData를 JSON으로 깊은 복사) — paintItem·disposeGroup이 이 표시를 본다.
export function fitClone(t, item) {
  const { min, max } = t.userData.bbox, [w, d, h] = item.size;
  const ext = [max[0] - min[0], max[1] - min[1], max[2] - min[2]];
  const c = t.clone();
  c.scale.set(w / 1000 / (ext[0] || 1), h / 1000 / (ext[1] || 1), d / 1000 / (ext[2] || 1));
  c.position.y = -h / 2000;
  return c;
}
