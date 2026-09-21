// 설비·덕트 라벨을 3D에 띄운다(명세 §11.4). 스프라이트라 카메라를 늘 마주보고, 텍스처는 글자·색으로
// 캐시한다(같은 후드 번호가 여럿이어도 텍스처는 하나다). disposeGroup은 재질만 정리하고 캐시는 남긴다
// (materials/texture.js와 같은 규칙: userData.clone이 없는 map은 공용 캐시다).
// node 테스트에는 document가 없으므로 캔버스 공장을 주입한다.
import * as THREE from 'three';
import { toThree } from './build.js';
import { equipLabel, isEquip, FLOW_COLORS } from '../vent/equipment.js';
import { itemVisible } from '../view2d/items2d.js';
import { ductVisible, sizeLabel } from '../view2d/ducts2d.js';

export const LABEL_PX = 128;
const LABEL_LIFT = 150;          // 설비 윗면·덕트 윗면에서 라벨까지(mm)
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
  c.width = LABEL_PX; c.height = LABEL_PX;
  ctx.clearRect(0, 0, LABEL_PX, LABEL_PX);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';        // 흰 바탕: 어두운 벽·바닥 위에서도 읽힌다
  ctx.fillRect(0, LABEL_PX * 0.3, LABEL_PX, LABEL_PX * 0.4);
  ctx.fillStyle = color;
  ctx.font = `bold ${Math.round(LABEL_PX * 0.3)}px "IBM Plex Sans KR", sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(String(text), LABEL_PX / 2, LABEL_PX / 2);
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
  s.scale.set(height * 2.5, height, 1);
  s.name = 'label';
  return s;
}

// 층의 라벨을 한 그룹으로(name 'labels'). 자식에 wallId·roomId가 없어 컷어웨이·단일 공간 모드가
// 건드리지 않는다 — v3.equipLabels / v3.ductLabels 플래그로만 끈다(덕트가 꺼지면 덕트 라벨도 없다).
export function buildLabels(floor, view = {}) {
  const g = new THREE.Group();
  g.name = 'labels';
  const v3 = view.v3 ?? {};
  if (v3.equipLabels !== false) {
    for (const it of floor.items ?? []) {
      if (!isEquip(it) || !itemVisible(it, v3)) continue;
      const s = labelSprite(equipLabel(it));
      if (!s) continue;
      s.position.copy(toThree([it.pos[0], it.pos[1], (Number(it.z) || 0) + (Number(it.size?.[2]) || 0) + LABEL_LIFT]));
      s.userData.itemId = it.id;
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
        g.add(s);
      }
    }
  }
  return g;
}
