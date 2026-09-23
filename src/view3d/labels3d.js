// 설비·덕트 라벨을 3D에 띄운다(명세 §11.4). 스프라이트라 카메라를 늘 마주보고, 텍스처는 글자·색으로
// 캐시한다(같은 후드 번호가 여럿이어도 텍스처는 하나다). disposeGroup은 재질만 정리하고 캐시는 남긴다
// (materials/texture.js와 같은 규칙: userData.clone이 없는 map은 공용 캐시다).
// node 테스트에는 document가 없으므로 캔버스 공장을 주입한다.
import * as THREE from 'three';
import { toThree } from './build.js';
import { equipLabel, isEquip, FLOW_COLORS } from '../vent/equipment.js';
import { itemVisible } from '../view2d/items2d.js';
import { ductVisible, sizeLabel } from '../view2d/ducts2d.js';
import { perfSettings } from './perfMode.js';
import { textWidth } from '../geom/textWidth.js';
import { placeLabels } from '../view2d/labels2d.js';
import { labelDensity } from '../ui/prefs.js';

// 텍스처는 글자 폭을 따른다(§15.12 · 감사 §11): 128×128 정사각에 그리고 스프라이트 비율을 2.5로
// 고정해 `750×400`이 잘렸다. 높이는 고정(44 px)이고 폭만 글자 폭 + 여백이다.
export const LABEL_H_PX = 44;
export const LABEL_PAD_PX = 14;   // 좌우 여백 합
export const LABEL_FONT_PX = 26;  // LABEL_H_PX 안에서 위아래 여백이 남는 글자 크기
export const LABEL_DEBOUNCE_MS = 120;   // 카메라가 멈춘 뒤 이만큼 있다가 겹침을 다시 잰다
export const LABEL3D_PRIORITY = ['equip', 'ductSize'];   // 설비 번호가 덕트 단면보다 높다
export const LABEL_BOX_PX = 12;      // 카메라를 모를 때(투영 주입 등) 쓰는 상자 글자 크기
export const LABEL_BOX_MIN_PX = 6;   // 아주 멀어도 상자가 0으로 사라지지 않게(겹침을 놓치지 않게)
const LABEL_LIFT = 150;          // 설비 윗면·덕트 윗면에서 라벨까지(mm) — bodyDrag.js의 SLIDE_LIFT와 같은 값(M-14)
export const LABEL_DOT_TEXT = '●';
export const LABEL_DOT_H = 0.18;   // 점 스프라이트의 높이(m). 기본 라벨 0.4의 절반 이하다.

export function labelTextureSize(text) {
  const w = Math.ceil(textWidth(String(text ?? ''), LABEL_FONT_PX) + LABEL_PAD_PX);
  return { w: Math.max(32, w), h: LABEL_H_PX };
}
const cache = new Map();
let makeCanvas = null;

export function setLabelCanvasFactory(fn) { clearLabelCache(); makeCanvas = typeof fn === 'function' ? fn : null; }
export function clearLabelCache() { for (const t of cache.values()) t.dispose?.(); cache.clear(); }

function newCanvas() {
  if (makeCanvas) return makeCanvas();
  return typeof document === 'undefined' ? null : document.createElement('canvas');
}

function labelTexture(text, color) {
  const key = `${color}|${text}`;
  if (cache.has(key)) return cache.get(key);
  const c = newCanvas();
  const ctx = c?.getContext?.('2d');
  if (!ctx) return null;
  const { w, h } = labelTextureSize(text);
  c.width = w; c.height = h;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';        // 흰 바탕: 어두운 벽·바닥 위에서도 읽힌다
  ctx.fillRect(0, 0, w, h);                           // 텍스처가 곧 라벨 상자다(여백을 폭에 넣었다)
  ctx.fillStyle = color;
  ctx.font = `bold ${LABEL_FONT_PX}px "IBM Plex Sans KR", sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(String(text), w / 2, h / 2);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  cache.set(key, tex);
  return tex;
}

export function labelSprite(text, { color = '#1b2430', height = 0.4 } = {}) {
  if (text === null || text === undefined || text === '') return null;
  const map = labelTexture(text, color);
  if (!map) return null;
  const mat = new THREE.SpriteMaterial({ map, transparent: true, depthTest: false });
  mat.userData.perMesh = true;
  // Sprite의 지오메트리는 three가 모듈 수준에서 모든 스프라이트와 공유한다 — 재질만 메시 전용이다.
  // 그래서 build.js의 disposeGroup은 스프라이트의 geometry를 건드리지 않는다.
  const s = new THREE.Sprite(mat);
  const { w, h } = labelTextureSize(text);
  s.scale.set((height * w) / h, height, 1);   // 텍스처 비율 그대로 — 글자가 눌리거나 잘리지 않는다
  s.name = 'label';
  s.userData.text = String(text);
  // 점(●)으로 축약했다가 되돌리는 데 필요한 두 가지(§17.10): 색과 펼친 크기.
  s.userData.color = color;
  s.userData.fullScale = [s.scale.x, s.scale.y];
  s.userData.collapsed = false;
  return s;
}

// 층의 라벨을 한 그룹으로(name 'labels'). 자식에 wallId·roomId가 없어 컷어웨이·단일 공간 모드가
// 건드리지 않는다 — v3.equipLabels / v3.ductLabels 플래그로만 끈다(덕트가 꺼지면 덕트 라벨도 없다).
// density 'off'는 성능 우선과 같은 빈 그룹이다(§17.10(2)). 값은 브라우저 설정이라 주입으로 받는다:
// 이 파일은 기본값으로 저장된 값을 읽고, 테스트는 그것을 덮어쓴다.
export function buildLabels(floor, view = {}, { density = labelDensity() } = {}) {
  const g = new THREE.Group();
  g.name = 'labels';
  const v3 = view.v3 ?? {};
  if (density === 'off') return g;
  if (!perfSettings(view.perfMode).labels) return g;   // 성능 우선: 빈 'labels' 그룹만 준다(§13.4)
  if (v3.equipLabels !== false) {
    for (const it of floor.items ?? []) {
      if (!isEquip(it) || !itemVisible(it, v3)) continue;
      const s = labelSprite(equipLabel(it));
      if (!s) continue;
      s.position.copy(toThree([it.pos[0], it.pos[1], (Number(it.z) || 0) + (Number(it.size?.[2]) || 0) + LABEL_LIFT]));
      s.userData.itemId = it.id;
      s.userData.kind = 'equip';     // 겹칠 때 덕트 단면보다 높은 우선순위(§15.12)
      g.add(s);
    }
  }
  if (v3.ductLabels !== false) {
    for (const duct of floor.ducts ?? []) {
      if (!ductVisible(duct, v3)) continue;
      const color = duct.kind === 'supply' ? FLOW_COLORS.supply : FLOW_COLORS.exhaust;
      for (let i = 0; i < duct.segments.length; i++) {
        const a = duct.points[i], b = duct.points[i + 1];
        const seg = duct.segments[i];
        const s = labelSprite(sizeLabel(seg), { color });
        if (!s) continue;
        s.position.copy(toThree([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, seg.z + seg.h / 2 + LABEL_LIFT]));
        s.userData.ductId = duct.id;
        s.userData.segment = i;
        s.userData.kind = 'ductSize';
        g.add(s);
      }
    }
  }
  return g;
}

// 화면 AABB로 겹치면 낮은 우선순위를 숨긴다(§15.12). 판정은 2D 라벨 패스와 **같은 함수**
// (labels2d.placeLabels)를 쓴다: 우선순위·상자 크기 규칙이 두 벌로 갈라지지 않게.
// entries = [{ key, kind, text, sp: [x, y], size }]
export function cullSprites(entries, { priority = LABEL3D_PRIORITY } = {}) {
  const cands = (entries ?? []).map(e => ({ key: e.key, kind: e.kind, text: e.text, sp: e.sp, size: e.size ?? 12 }));
  return new Set(placeLabels(cands, { priority }).map(c => c.key));
}

// 스프라이트 한 점을 화면으로: [x px, y px, ndcZ]. ndcZ를 같이 주는 이유는 카메라 뒤 판정이다 —
// 원근 카메라에서 카메라 뒤의 점은 w < 0이라 x·y 부호가 뒤집혀 NDC [-1,1] 안으로 거울 투영된다.
// 보이지도 않는 그 라벨이 화면 안 라벨의 자리를 빼앗지 않게 후보에서 뺀다.
export function projectSprite(p, camera, { width = 1, height = 1 } = {}) {
  const v = p.clone().project(camera);
  return [((v.x + 1) / 2) * width, ((1 - v.y) / 2) * height, v.z];
}
// 투영을 주입한 경우(z가 없다)는 화면 안으로 본다 — 주입한 쪽이 이미 화면 좌표를 정한 것이다.
export const onScreen = z => z === undefined || z === null || (z >= -1 && z <= 1);

// 스프라이트가 화면에서 차지하는 높이(px). 스프라이트는 늘 카메라를 마주보므로 월드 방향과
// 무관하게 "보이는 절두체 높이 대비 스케일"이면 된다: 원근은 시선 방향 거리로, 직교는 절두체
// 높이로 낸다(둘 다 camera.zoom을 나눈다 — updateProjectionMatrix가 그렇게 쓴다).
// scaleY를 주면 그 크기로 잰다(§17.10): 점으로 축약된 스프라이트도 **펼친 크기**로 겹침을
// 판정해야 한다 — 작아진 상자로 다시 재면 자리가 늘 이겨 점과 글자가 프레임마다 깜빡인다.
export function spriteScreenHeight(sprite, camera, height = 1, scaleY = null) {
  const sy = Number(scaleY ?? sprite?.scale?.y) || 0;
  if (!sy || !camera || !(height > 0)) return 0;
  const zoom = Number(camera.zoom) || 1;
  let frustumH = 0;
  if (camera.isOrthographicCamera) frustumH = Math.abs(camera.top - camera.bottom) / zoom;
  else if (camera.isPerspectiveCamera) {
    camera.updateMatrixWorld?.();
    const fwd = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 2).negate();   // 시선(-Z)
    const d = new THREE.Vector3().subVectors(sprite.position, camera.position).dot(fwd);
    frustumH = (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) * d) / zoom;
  }
  return frustumH > 0 ? (sy / frustumH) * height : 0;
}
// 겹침 상자는 labelBox가 글자 크기(px)로 재므로 화면 높이를 글자 크기로 환산해 넘긴다.
// 고정 12 px이던 때는 한 줌에서만 맞았다: 줌인하면 라벨 간 화면 거리와 스프라이트 크기가 같이
// 커지는데 상자만 그대로여서 겹침을 놓쳤다(감사 §11 재발). 이제 상자도 같이 커져 줌 불변이다.
export function spriteLabelSize(sprite, camera, height = 1, scaleY = null) {
  const sh = spriteScreenHeight(sprite, camera, height, scaleY);
  return sh > 0 ? Math.max(LABEL_BOX_MIN_PX, (sh * LABEL_FONT_PX) / LABEL_H_PX) : LABEL_BOX_PX;
}

// 카메라가 실제로 움직였는지 본다(1인칭용). 1인칭은 매 프레임 requestRender를 걸므로 프레임마다
// 디바운스를 다시 걸면 타이머가 영영 터지지 않는다 — "움직인 프레임"에만 걸어야 멈춘 뒤 1회가 된다.
export function createCameraWatch(eps = 1e-4) {
  const p = new THREE.Vector3(NaN, NaN, NaN), q = new THREE.Quaternion(0, 0, 0, NaN);
  return camera => {
    if (!camera) return false;
    // NaN 초기값이라 첫 호출은 두 비교 모두 false → moved = true다(진입 시 한 번은 잰다).
    const moved = !(p.distanceToSquared(camera.position) <= eps * eps)
      || !(Math.abs(q.dot(camera.quaternion)) >= 1 - eps);
    if (moved) { p.copy(camera.position); q.copy(camera.quaternion); }
    return moved;
  };
}

// 스프라이트를 점(●)으로 축약하거나 되돌린다. 실제로 바뀌었으면 true.
// 텍스처 캐시는 글자·색 키라 점 텍스처도 색마다 하나뿐이다(메모리는 늘지 않는다).
export function setLabelCollapsed(sprite, collapsed) {
  if (!sprite?.material) return false;
  if (!!sprite.userData.collapsed === !!collapsed) return false;
  const map = labelTexture(collapsed ? LABEL_DOT_TEXT : (sprite.userData.text ?? ''), sprite.userData.color ?? '#1b2430');
  if (!map) return false;
  sprite.material.map = map;          // 같은 포맷의 텍스처 교체라 needsUpdate가 필요 없다(리뷰 M-1)
  if (collapsed) {
    sprite.userData.fullScale ??= [sprite.scale.x, sprite.scale.y];   // 밖에서 만든 스프라이트도 펼칠 크기를 남긴다(M-2)
    const { w, h } = labelTextureSize(LABEL_DOT_TEXT);
    sprite.scale.set((LABEL_DOT_H * w) / h, LABEL_DOT_H, 1);
  } else {
    const [x, y] = sprite.userData.fullScale ?? [sprite.scale.x, sprite.scale.y];
    sprite.scale.set(x, y, 1);
  }
  sprite.userData.collapsed = !!collapsed;
  return true;
}

// 밀도가 바뀌었을 때 층을 다시 지어야 하는가(§17.10 · 리뷰 I-2). 라벨을 **짓느냐 마느냐**가 갈리는
// 것은 '끔' 진입·이탈뿐이다 — '모두'↔'자동'은 이미 있는 스프라이트를 다시 세기만 하면 된다(재컬링).
export function labelRefreshKind(prev, next) { return prev === 'off' || next === 'off' ? 'rebuild' : 'cull'; }

// 접힌 라벨의 점(●)은 스프라이트마다 그리지 않고 한 덩어리(THREE.Points)로 모은다(리뷰 I-3): 500개가
// 접혀도 드로우콜은 1개다. 글자가 없으니 텍스처는 흰 ● 하나면 되고(색은 정점 색으로 섞는다), 좌표는
// 라벨이 서 있던 자리 그대로라 앵커가 움직이지 않는다. 자리를 되찾으면 같은 Sprite가 다시 보인다.
export const LABEL_DOTS_NAME = 'labelDots';
const DOT_TEX_PX = 64;
function dotTexture() {
  const key = `dots|${LABEL_DOT_TEXT}`, P = DOT_TEX_PX;
  if (cache.has(key)) return cache.get(key);
  const c = newCanvas(), ctx = c?.getContext?.('2d');
  if (!ctx) return null;
  c.width = P; c.height = P;
  ctx.clearRect(0, 0, P, P);
  ctx.fillStyle = '#ffffff';          // 흰 ●에 정점 색을 곱한다 — 라벨 상자와 달리 바탕이 없다
  ctx.font = `bold ${Math.round(P * 0.8)}px "IBM Plex Sans KR", sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(LABEL_DOT_TEXT, P / 2, P / 2);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace; cache.set(key, tex);
  return tex;
}
// 자리는 라벨 수만큼 미리 잡고 drawRange로 실제 개수만 그린다(매 컬링마다 버퍼를 새로 만들지 않는다). disposeGroup은 Sprite가 아닌 geometry와 perMesh 재질을 버리므로 이 Points도 그 규칙을 탄다.
function makeDotPoints(group, capacity) {
  const map = dotTexture();
  if (!map) return null;
  const geo = new THREE.BufferGeometry();
  for (const k of ['position', 'color']) geo.setAttribute(k, new THREE.BufferAttribute(new Float32Array(capacity * 3), 3));
  const mat = new THREE.PointsMaterial({ map, size: LABEL_DOT_H, sizeAttenuation: true, vertexColors: true, transparent: true, depthTest: false, depthWrite: false });
  mat.userData.perMesh = true;
  const p = new THREE.Points(geo, mat);
  p.name = LABEL_DOTS_NAME; p.frustumCulled = false;   // 자리를 다 채우지 않은 버퍼라 경계구를 믿을 수 없다
  group.add(p);
  return p;
}
// dots = 접힌 스프라이트들. 점이 하나도 없으면 배치를 만들지도 않는다(기존 그룹 모양을 바꾸지 않게).
export function syncLabelDots(group, dots, capacity = dots.length, size = LABEL_DOT_H) {
  let p = (group?.children ?? []).find(o => o.name === LABEL_DOTS_NAME) ?? null;
  if (!p && !dots.length) return null;
  if (!p || p.geometry.getAttribute('position').count < capacity) {
    if (p) { group.remove(p); p.geometry.dispose(); p.material.dispose(); }
    p = makeDotPoints(group, Math.max(capacity, dots.length));
  }
  if (!p) return null;
  const pos = p.geometry.getAttribute('position'), col = p.geometry.getAttribute('color'), c = new THREE.Color();
  // Color.set이 sRGB → 작업 색공간 변환까지 맡는다(정점 색은 three가 변환해 주지 않는다).
  dots.forEach((s, i) => { pos.setXYZ(i, s.position.x, s.position.y, s.position.z); c.set(s.userData.color ?? '#1b2430'); col.setXYZ(i, c.r, c.g, c.b); });
  pos.needsUpdate = col.needsUpdate = true;
  p.geometry.setDrawRange(0, dots.length);
  p.material.size = size; p.visible = dots.length > 0;
  return p;
}

// 'labels' 그룹의 스프라이트를 화면에 투영해 visible을 맞춘다. 카메라가 멈춘 뒤 한 번만 부른다
// (view3d가 LABEL_DEBOUNCE_MS 디바운스, 2D 투영 진입·이탈도 같은 디바운스로 다시 잰다).
// project를 주면 그것으로 투영한다(테스트용).
// density(§17.10(2)): 'all' = 컬링하지 않는다 · 'auto' = 겹치면 점(●)으로 축약 · 'off' = 모두 숨긴다.
// 'auto'에서 자리를 잃은 라벨은 사라지지 않고 제자리에 점으로 남는다(무엇이 가려졌는지 보이고, 가까이
// 가면 자리 경쟁에서 이겨 저절로 펼쳐진다 — 감사 §5). 그 점은 LABEL_DOTS_NAME 배치가 한 번에 그리므로
// 접힌 스프라이트 자신은 visible = false다(리뷰 I-3).
// 기본값은 buildLabels와 **같은 규칙**이다(`labelDensity()`): 한쪽만 리터럴 'auto'를 쓰면 저장값이 'all'인 브라우저에서 "짓기"와 "컬링"의 기본값이 갈린다(사전 검토 M-8).
// labelDensity()는 localStorage가 없는 node 테스트에서도 'auto'를 돌려준다(try/catch).
export function cullLabels(group, camera, { width = 1, height = 1, project = null, density = labelDensity() } = {}) {
  const sprites = (group?.children ?? []).filter(s => s.name === 'label');
  if (!sprites.length) return new Set();
  // '끔'은 카메라·투영이 없어도 성립한다(M-3). 숨기기 전에 펼쳐 둔다 — 다음에 켤 때 점으로 남지 않게(M-7).
  if (density === 'off') { for (const s of sprites) { setLabelCollapsed(s, false); s.visible = false; } syncLabelDots(group, []); return new Set(); }
  if (!camera && !project) return new Set();
  const toScreen = project ?? (p => projectSprite(p, camera, { width, height }));
  const entries = [], offScreen = new Set();
  for (const s of sprites) {
    const sp = toScreen(s.position);
    if (!onScreen(sp?.[2])) { offScreen.add(s.uuid); continue; }   // 카메라 뒤·절두체 밖은 자리 경쟁에서 뺀다
    entries.push({
      // kind 폴백 'ductSize': buildLabels는 두 경로에서 늘 kind를 넣으므로 닿지 않는다. 밖에서 만든
      // 스프라이트가 섞이면 조용히 낮은 우선순위로 둔다(설비 번호 자리를 빼앗지 않게).
      key: s.uuid, kind: s.userData.kind ?? 'ductSize', text: s.userData.text ?? '', sp,
      // 판정은 늘 **펼친 크기**로 한다(점이 되어도 상자는 그대로다 — 깜빡임 방지).
      size: spriteLabelSize(s, camera, height, s.userData.fullScale?.[1] ?? null),
    });
  }
  const keep = density === 'all' ? new Set(entries.map(e => e.key)) : cullSprites(entries);
  const dots = [];
  for (const s of sprites) {
    const on = !offScreen.has(s.uuid);
    if (on) setLabelCollapsed(s, !keep.has(s.uuid));
    s.visible = on && !s.userData.collapsed;    // 점은 스프라이트가 아니라 배치가 그린다(I-3)
    if (on && s.userData.collapsed) dots.push(s);
  }
  // 점 크기는 스프라이트 0.18 m와 **같은 화면 높이**가 되게 환산한다: three의 gl_PointSize는 원근에서 size × (화면높이/2) ÷ 거리라 fov·zoom이 빠져 있고, 직교에서는 아예 픽셀이다(2D 투영에서 0.18 px로 사라진다).
  const size = camera?.isOrthographicCamera ? (spriteScreenHeight(sprites[0], camera, height, LABEL_DOT_H) || LABEL_DOT_H) : camera?.isPerspectiveCamera ? (LABEL_DOT_H * (Number(camera.zoom) || 1)) / Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) : LABEL_DOT_H;
  syncLabelDots(group, dots, sprites.length, size);
  return keep;
}
