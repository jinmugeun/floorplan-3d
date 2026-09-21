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

// 텍스처는 글자 폭을 따른다(§15.12 · 감사 §11): 128×128 정사각에 그리고 스프라이트 비율을 2.5로
// 고정해 `750×400`이 잘렸다. 높이는 고정(44 px)이고 폭만 글자 폭 + 여백이다.
export const LABEL_H_PX = 44;
export const LABEL_PAD_PX = 14;   // 좌우 여백 합
export const LABEL_FONT_PX = 26;  // LABEL_H_PX 안에서 위아래 여백이 남는 글자 크기
export const LABEL_DEBOUNCE_MS = 120;   // 카메라가 멈춘 뒤 이만큼 있다가 겹침을 다시 잰다
export const LABEL3D_PRIORITY = ['equip', 'ductSize'];   // 설비 번호가 덕트 단면보다 높다
const LABEL_LIFT = 150;          // 설비 윗면·덕트 윗면에서 라벨까지(mm)

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
  return s;
}

// 층의 라벨을 한 그룹으로(name 'labels'). 자식에 wallId·roomId가 없어 컷어웨이·단일 공간 모드가
// 건드리지 않는다 — v3.equipLabels / v3.ductLabels 플래그로만 끈다(덕트가 꺼지면 덕트 라벨도 없다).
export function buildLabels(floor, view = {}) {
  const g = new THREE.Group();
  g.name = 'labels';
  const v3 = view.v3 ?? {};
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

// 'labels' 그룹의 스프라이트를 화면에 투영해 visible을 맞춘다. 카메라가 멈춘 뒤 한 번만 부른다
// (view3d가 LABEL_DEBOUNCE_MS 디바운스). project를 주면 그것으로 투영한다(테스트용).
export function cullLabels(group, camera, { width = 1, height = 1, project = null } = {}) {
  const toScreen = project ?? (p => {
    const v = p.clone().project(camera);
    return [((v.x + 1) / 2) * width, ((1 - v.y) / 2) * height];
  });
  const sprites = (group?.children ?? []).filter(s => s.name === 'label');
  const keep = cullSprites(sprites.map(s => ({
    key: s.uuid, kind: s.userData.kind ?? 'ductSize', text: s.userData.text ?? '', sp: toScreen(s.position), size: 12,
  })));
  for (const s of sprites) s.visible = keep.has(s.uuid);
  return keep;
}
