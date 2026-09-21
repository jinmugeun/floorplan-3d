// 제품 3D 외형(아키텍처 §12.3). 모든 제품이 같은 회색 박스로 서 있으면 3D가 "무엇이 무엇인지"를
// 말해 주지 못한다 → 심벌별로 박스·원기둥 몇 개를 조합한다. 치수는 모두 item.size에 비례하므로
// 크기를 바꿔도 형태가 유지되고, 형상은 아이템 바운딩 박스 밖으로 나가지 않는다(2D 심벌과 어긋나지 않게).
// 좌표 규약: 아이템 로컬 — 원점 = 아이템 중심, +x = 너비 w, +y = 높이 h, +z = 깊이 d, 단위 m.
// 위치·회전·name·userData·엣지는 items3d.itemMesh가 붙인다. three만 쓰고 스토어도 DOM도 읽지 않는다.
import * as THREE from 'three';
import { productById } from '../products/catalog.js';
import { symbolOf } from '../view2d/items2d.js';

const M = v => v / 1000;
export const ITEM_BASE_COLOR = '#cfd4da';      // schema.normalizeItem이 쓰는 기본 색
export const ITEM_EDGE_COLOR = 0x2b3440;

// 카테고리별 기본 면 색·거칠기·금속도. 색은 제품이 스키마 기본색을 쓸 때만 쓰인다.
export const ITEM_MATERIALS = {
  '문/창문': { color: '#b98a54', roughness: 0.75, metalness: 0 },
  '가전': { color: '#dfe3e8', roughness: 0.35, metalness: 0.3 },
  '침대/매트리스': { color: '#e3d8c8', roughness: 0.95, metalness: 0 },
  '드레스룸/행거': { color: '#d8c9b4', roughness: 0.8, metalness: 0 },
  '수납가구': { color: '#e6e1d8', roughness: 0.8, metalness: 0 },
  '소파': { color: '#c9cdd6', roughness: 0.95, metalness: 0 },
  '책상/테이블': { color: '#d8c9b4', roughness: 0.7, metalness: 0 },
  '의자/스툴': { color: '#d8c9b4', roughness: 0.7, metalness: 0 },
  '화장대/거울': { color: '#e6e1d8', roughness: 0.5, metalness: 0.1 },
  '주방싱크/욕실': { color: '#c6ccd2', roughness: 0.3, metalness: 0.5 },
  '조명': { color: '#fff3c4', roughness: 0.4, metalness: 0 },
  '구조물': { color: '#b6bdc4', roughness: 0.9, metalness: 0 },
  '환기 설비': { color: '#c6ccd2', roughness: 0.35, metalness: 0.55 },
};
export const ITEM_MATERIAL_DEFAULT = { color: ITEM_BASE_COLOR, roughness: 0.8, metalness: 0 };

// 채널마다 비율을 곱한 어두운 색(문 손잡이·프레임·싱크볼 같은 부품). three의 Color를 거치지 않는다:
// 색 관리(sRGB ↔ linear)가 끼면 같은 입력에 대해 값이 달라져 테스트가 흔들린다.
export function darkerHex(hex, k = 0.75) {
  const m = /^#([0-9a-fA-F]{6})$/.exec(String(hex ?? ''));
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const ch = shift => Math.max(0, Math.min(255, Math.round(((n >> shift) & 255) * k)));
  return `#${[16, 8, 0].map(s => ch(s).toString(16).padStart(2, '0')).join('')}`;
}

// 아이템 하나의 면 재질 값. 사용자가(또는 제품이) 정한 색이 이기고, 스키마 기본색이면 카테고리 색을 쓴다.
export function itemMaterialSpec(item) {
  const spec = ITEM_MATERIALS[productById(item?.productId)?.category] ?? ITEM_MATERIAL_DEFAULT;
  const own = typeof item?.color === 'string' ? item.color : '';
  const color = own && own.toLowerCase() !== ITEM_BASE_COLOR ? own : spec.color;
  return { color, roughness: spec.roughness, metalness: spec.metalness ?? 0 };
}

export function itemMaterial(item, { color = null } = {}) {
  const s = itemMaterialSpec(item);
  const m = new THREE.MeshStandardMaterial({ color: new THREE.Color(color ?? s.color), roughness: s.roughness, metalness: s.metalness });
  m.userData.perMesh = true;   // disposeGroup이 정리할 표시
  return m;
}

// 카탈로그 심벌 19종 중 조합 형상을 가진 13종. 'appliance'는 조리기구 7개 제품(가스높은렌지·취반기·
// 국솥·볶음솥·부침기·스티머·식기세척기)이 모두 쓰는 심벌이라 주방 환기 도면의 주 설비가 여기 걸린다.
export const SHAPE_SYMBOLS = ['bed', 'table', 'chair', 'sofa', 'fridge', 'sink', 'range', 'appliance', 'lamp', 'hood', 'diffuser', 'fan', 'ventcap'];
const SHAPES = new Set(SHAPE_SYMBOLS);

const box = (mat, [w, h, d], [x, y, z], name) => {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z); m.name = name; m.castShadow = true; m.receiveShadow = true;
  return m;
};
// axis 'y'는 기본(세운 원기둥), 'z'는 앞을 보는 원판(팬 날개·환기캡).
// box와 같은 그림자 설정을 쓴다(둘을 다르게 두면 같은 그룹 안에서 램프 갓·버너·팬 날개만 음영이 갈린다).
const cyl = (mat, r, h, [x, y, z], name, { axis = 'y', seg = 20 } = {}) => {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, seg), mat);
  m.position.set(x, y, z);
  if (axis === 'z') m.rotation.x = Math.PI / 2;
  m.name = name; m.castShadow = true; m.receiveShadow = true;
  return m;
};

export function shapeFor(item) {
  if (!item) return null;
  const symbol = symbolOf(item);
  if (!SHAPES.has(symbol)) return null;
  const [w, d, h] = (item.size ?? [600, 600, 600]).map(M);   // item.size = [w, d, h] mm
  const spec = itemMaterialSpec(item);
  const body = itemMaterial(item);
  // accent·dark는 쓰는 분기에서만 만든다(형상마다 필요한 조합이 다르다 — 예: bed·lamp·table·chair·sofa는
  // dark를 쓰지 않고, diffuser·fan은 accent를 쓰지 않는다). 씬에 붙지 않은 MeshStandardMaterial은
  // GPU에 올라가지 않아 누수는 아니지만, 강당중 샘플(398 메시)처럼 큰 층을 다시 지을 때마다
  // 버려지는 객체가 메시 수만큼 생긴다. 한 번 만들면 같은 형상 안에서는 재사용한다(??=).
  let _accent, _dark;
  const accent = () => (_accent ??= itemMaterial(item, { color: darkerHex(spec.color, 0.78) }));
  const dark = () => (_dark ??= itemMaterial(item, { color: darkerHex(spec.color, 0.5) }));
  const g = new THREE.Group();
  const hw = w / 2, hh = h / 2, hd = d / 2;
  const min3 = (...v) => Math.min(...v);
  if (symbol === 'bed') {
    const frame = min3(h * 0.35, 0.12), boardT = min3(d * 0.06, 0.08);
    g.add(box(accent(), [w, frame, d], [0, -hh + frame / 2, 0], 'bedFrame'));
    g.add(box(body, [w * 0.94, (h - frame) * 0.8, d * 0.9], [0, -hh + frame + (h - frame) * 0.4, boardT / 2], 'mattress'));
    g.add(box(accent(), [w, h, boardT], [0, 0, -hd + boardT / 2], 'headboard'));
  } else if (symbol === 'table') {
    const top = min3(h * 0.12, 0.05), leg = min3(w * 0.08, d * 0.08, 0.06), inset = min3(w * 0.05, d * 0.05, 0.04);
    g.add(box(body, [w, top, d], [0, hh - top / 2, 0], 'tableTop'));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      g.add(box(accent(), [leg, h - top, leg], [sx * (hw - leg / 2 - inset), -hh + (h - top) / 2, sz * (hd - leg / 2 - inset)], 'tableLeg'));
    }
  } else if (symbol === 'chair') {
    const seat = min3(h * 0.08, 0.06), backT = min3(d * 0.1, 0.05), leg = min3(w * 0.09, d, 0.04), seatY = -hh + h * 0.5;
    g.add(box(body, [w, seat, d], [0, seatY, 0], 'chairSeat'));
    g.add(box(body, [w, h * 0.45, backT], [0, seatY + h * 0.24, -hd + backT / 2], 'chairBack'));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      g.add(box(accent(), [leg, h * 0.5, leg], [sx * (hw - leg / 2), -hh + h * 0.25, sz * (hd - leg / 2)], 'chairLeg'));
    }
  } else if (symbol === 'sofa') {
    const arm = min3(w * 0.1, 0.18), back = min3(d * 0.22, 0.24);
    g.add(box(body, [w, h * 0.5, d], [0, -hh + h * 0.25, 0], 'sofaSeat'));
    g.add(box(body, [w, h * 0.6, back], [0, -hh + h * 0.7, -hd + back / 2], 'sofaBack'));
    for (const sx of [-1, 1]) g.add(box(accent(), [arm, h * 0.72, d * 0.9], [sx * (hw - arm / 2), -hh + h * 0.36, d * 0.05], 'sofaArm'));
  } else if (symbol === 'fridge') {
    const door = min3(d * 0.08, 0.06), grip = min3(w * 0.05, d, 0.04);
    g.add(box(accent(), [w, h, d - door], [0, 0, -door / 2], 'fridgeBody'));
    g.add(box(body, [w * 0.98, h * 0.97, door], [0, 0, hd - door / 2], 'fridgeDoor'));
    // 손잡이는 문짝 앞면과 같은 면에 붙인다(hd + grip/2로 내밀면 깊이 방향으로 약 39 mm 밖으로 나가
    // "형상은 바운딩 박스 밖으로 나가지 않는다"는 규약을 깬다 — 2D 심벌·충돌·간격 치수는 item.size를 쓴다).
    g.add(box(dark(), [grip, h * 0.5, grip], [hw - w * 0.12, 0, hd - grip / 2], 'fridgeHandle'));
  } else if (symbol === 'sink') {
    const top = min3(h * 0.1, 0.06);
    g.add(box(body, [w, h - top, d], [0, -hh + (h - top) / 2, 0], 'sinkCabinet'));
    g.add(box(accent(), [w, top, d], [0, hh - top / 2, 0], 'sinkTop'));
    g.add(box(dark(), [w * 0.4, top * 0.6, d * 0.6], [0, hh - top * 0.3, 0], 'sinkBasin'));
  } else if (symbol === 'range') {
    const r = min3(w, d) * 0.12, plate = min3(h * 0.05, 0.02);
    g.add(box(body, [w, h - plate, d], [0, -hh + (h - plate) / 2, 0], 'rangeBody'));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      g.add(cyl(dark(), r, plate, [sx * w * 0.22, hh - plate / 2, sz * d * 0.2], 'rangeBurner'));
    }
  } else if (symbol === 'appliance') {
    // 조리기구(가스높은렌지·취반기·국솥·볶음솥·부침기·스티머·식기세척기): 본체 박스 + 상판 + 조작 노브.
    // 노브는 앞면(+z)에 붙는 작은 원기둥이라 "스테인리스 상자"와 구별되고, 어느 면이 앞인지도 보인다.
    const top = min3(h * 0.06, 0.03);
    const knobR = min3(w * 0.04, h * 0.05, 0.03), knobD = min3(d * 0.05, 0.03);
    g.add(box(body, [w, h - top, d], [0, -hh + (h - top) / 2, 0], 'applianceBody'));
    g.add(box(accent(), [w, top, d], [0, hh - top / 2, 0], 'applianceTop'));
    g.add(cyl(dark(), knobR, knobD, [hw - w * 0.08, hh - top - h * 0.08, hd - knobD / 2], 'applianceKnob', { axis: 'z', seg: 12 }));
  } else if (symbol === 'lamp') {
    const r = min3(hw, hd);
    g.add(cyl(body, r, h * 0.5, [0, -hh + h * 0.25, 0], 'lampShade'));
    g.add(cyl(accent(), min3(r * 0.08, 0.01), h * 0.5, [0, hh - h * 0.25, 0], 'lampCord', { seg: 8 }));
  } else if (symbol === 'hood') {
    const skirt = h * 0.25, slit = min3(d * 0.06, 0.05);
    g.add(box(body, [w, h - skirt, d], [0, hh - (h - skirt) / 2, 0], 'hoodBody'));
    g.add(box(accent(), [w * 0.96, skirt, d * 0.96], [0, -hh + skirt / 2, 0], 'hoodSkirt'));
    for (const sz of [-1, 1]) g.add(box(dark(), [w * 0.7, skirt * 0.4, slit], [0, -hh + skirt * 0.5, sz * d * 0.2], 'hoodSlit'));
  } else if (symbol === 'diffuser') {
    const bar = min3(d * 0.08, 0.04);
    g.add(box(body, [w, h * 0.8, d], [0, hh - h * 0.4, 0], 'diffuserFrame'));
    for (const sz of [-1, 1]) g.add(box(dark(), [w * 0.86, h * 0.2, bar], [0, -hh + h * 0.1, sz * d * 0.18], 'diffuserBar'));
  } else if (symbol === 'fan') {
    // 원판은 axis 'z'라 반지름이 x(너비)와 y(높이)로 퍼진다 — h를 상한에 넣지 않으면 넓적한
    // 벽부형 팬(500×500×300)에서 날개가 박스 위·아래로 삐져나와 벽·천장을 관통한다.
    const r = min3(w, d, h) * 0.35, disc = min3(d * 0.06, 0.04);
    g.add(box(body, [w, h, d - disc], [0, 0, -disc / 2], 'fanChamber'));
    g.add(cyl(dark(), r, disc, [0, 0, hd - disc / 2], 'fanDisc', { axis: 'z' }));
  } else {   // ventcap
    const r = min3(hw, hh) * 0.7, cap = min3(d * 0.2, 0.03);
    g.add(cyl(body, r, d - cap, [0, 0, -cap / 2], 'ventcapPipe', { axis: 'z' }));
    g.add(cyl(accent(), min3(hw, hh), cap, [0, 0, hd - cap / 2], 'ventcapCap', { axis: 'z' }));
  }
  return g;
}
