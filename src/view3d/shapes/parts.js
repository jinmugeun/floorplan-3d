// 스테인리스 형상의 공통 부품(계획 17 Task 4). 부품 = { geo, mat } — geo는 이미 아이템 로컬 좌표로 옮겨 둔 BufferGeometry다.
// 좌표 규약(itemShapes와 같다): 단위 m · 원점 = 아이템 중심 · +x 너비 w · +y 높이 h · +z 깊이 d(정면 +z) · y는 −h/2..h/2.
// 모든 부품은 아이템 바운딩 박스 안에 머문다(2D 심벌·충돌·간격 치수가 item.size를 쓴다). three만 쓰고 스토어·DOM을 읽지 않는다.
// 앞면 층(z): 몸체 앞면 = hd − BODY_IN · 문짝·조작판 = hd − BODY_IN … hd − BODY_IN + PLATE(층 1은 PLATE만큼 더 앞) · 손잡이·노브 = … hd.
// 층을 나누는 이유: 같은 평면에 두 면이 있으면 z-파이팅이 나고, 손잡이가 문짝 뒤에 묻힌다.
import * as THREE from 'three';

export const BODY_IN = 0.03, PLATE = 0.012, KNOB = 0.018;
export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// 부품 묶음을 만든다. size = [w, d, h](m). mat: 'steel' · 'dark' · 'glass' · 'accent' · 'food' · 'greens'.
export function createParts([w, d, h]) {
  const list = [];
  const hw = w / 2, hd = d / 2, hh = h / 2;
  const add = (geo, mat) => { list.push({ geo, mat }); return geo; };
  // 상자: 크기 [sx, sy, sz], 중심 [x, y, z].
  const box = (mat, [sx, sy, sz], [x, y, z]) => {
    const g = new THREE.BoxGeometry(Math.max(sx, 1e-4), Math.max(sy, 1e-4), Math.max(sz, 1e-4));
    g.translate(x, y, z);
    return add(g, mat);
  };
  // 원기둥: axis 'y'(세움) · 'z'(앞을 보는 원판) · 'x'(옆으로 누움). rTop을 주면 원뿔대, open이면 옆면만.
  const cyl = (mat, r, len, [x, y, z], { axis = 'y', seg = 20, rTop = r, open = false } = {}) => {
    const g = new THREE.CylinderGeometry(rTop, r, Math.max(len, 1e-4), seg, 1, open);
    if (axis === 'z') g.rotateX(Math.PI / 2);
    else if (axis === 'x') g.rotateZ(Math.PI / 2);
    g.translate(x, y, z);
    return add(g, mat);
  };
  // 사각뿔대(후드 갓): 아래 [bw, bd] at y0 → 위 [tw, td] at y1, 옆면 4장. 인덱스·법선·uv가 있어 상자와 병합된다.
  const frustum = (mat, [bw, bd], [tw, td], y0, y1) => {
    const b = [[-bw / 2, bd / 2], [bw / 2, bd / 2], [bw / 2, -bd / 2], [-bw / 2, -bd / 2]];
    const t = [[-tw / 2, td / 2], [tw / 2, td / 2], [tw / 2, -td / 2], [-tw / 2, -td / 2]];
    const pos = [], uv = [], idx = [];
    for (let i = 0; i < 4; i++) {
      const j = (i + 1) % 4, base = pos.length / 3;
      pos.push(b[i][0], y0, b[i][1], b[j][0], y0, b[j][1], t[j][0], y1, t[j][1], t[i][0], y1, t[i][1]);
      uv.push(0, 0, 1, 0, 1, 1, 0, 1);
      idx.push(base, base + 1, base + 2, base, base + 2, base + 3);   // 앞(+z) 면부터 반시계 → 법선이 바깥
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    return add(g, mat);
  };
  // 몸체: 앞면이 hd − BODY_IN에 오게 깊이를 줄인 상자(앞에 문짝·조작판이 붙는다). y = 중심 높이.
  const body = (mat, [sx, sy], y, x = 0) => box(mat, [sx, sy, d - BODY_IN], [x, y, -BODY_IN / 2]);
  // 앞면 판(문짝·조작판·유리). layer 0 = 몸체 바로 앞, 1 = 그 앞(유리창이 문짝 위에).
  const front = (mat, [sx, sy], [x, y], layer = 0) => box(mat, [sx, sy, PLATE], [x, y, hd - BODY_IN + PLATE / 2 + layer * PLATE]);
  // 세로 손잡이 · 가로 손잡이 · 노브: 가장 앞층(hd − KNOB … hd).
  const handle = (x, y, len) => box('accent', [0.018, len, KNOB], [x, y, hd - KNOB / 2]);
  const handleH = (x, y, len) => box('accent', [len, 0.018, KNOB], [x, y, hd - KNOB / 2]);
  const knob = (x, y, r = 0.018) => cyl('dark', r, KNOB, [x, y, hd - KNOB / 2], { axis: 'z', seg: 12 });
  // 다리 4개 + 조절발(또는 바퀴). top = 다리 윗끝 y, inset = 모서리에서 다리 중심까지.
  const legs = ({ top, leg = 0.04, inset = 0.05, foot = 0.025, casters = false } = {}) => {
    const lx = Math.max(hw - inset, leg / 2), lz = Math.max(hd - inset, leg / 2);
    const bottom = -hh + foot;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      box('steel', [leg, Math.max(top - bottom, 0.005), leg], [sx * lx, (top + bottom) / 2, sz * lz]);
      if (casters) cyl('dark', foot / 2, Math.min(leg, 0.03), [sx * lx, -hh + foot / 2, sz * lz], { axis: 'x', seg: 12 });
      else cyl('dark', leg * 0.7, foot, [sx * lx, -hh + foot / 2, sz * lz], { seg: 12 });
    }
  };
  // 수평 판(선반). y = 판 중심, t = 두께, m = 가장자리 여백.
  const slab = (mat, y, t = 0.025, m = 0) => box(mat, [w - 2 * m, t, d - 2 * m], [0, y, 0]);
  // 속이 빈 그릇(싱크 볼·밧드): 바닥 + 벽 4장. 중심 (x, z), 윗면 y = top, 크기 [bw, bd], 깊이 depth, 벽 두께 t.
  const basin = (mat, [x, z], [bw, bd], top, depth, t = 0.012) => {
    box(mat, [bw, t, bd], [x, top - depth + t / 2, z]);
    box(mat, [bw, depth, t], [x, top - depth / 2, z - bd / 2 + t / 2]);
    box(mat, [bw, depth, t], [x, top - depth / 2, z + bd / 2 - t / 2]);
    box(mat, [t, depth, bd - 2 * t], [x - bw / 2 + t / 2, top - depth / 2, z]);
    box(mat, [t, depth, bd - 2 * t], [x + bw / 2 - t / 2, top - depth / 2, z]);
  };
  // 거위목 수전: 뒤쪽에서 솟아 앞으로 꺾인다. 바운딩 박스 윗면을 넘지 않게 높이를 자른다.
  const faucet = (x, baseY, z, rise = 0.28) => {
    const up = Math.min(rise, hh - baseY - 0.015);
    if (up <= 0.03) return;
    cyl('steel', 0.012, up, [x, baseY + up / 2, z], { seg: 10 });
    cyl('steel', 0.01, 0.14, [x, baseY + up - 0.012, z + 0.07], { axis: 'z', seg: 10 });
  };
  return { list, size: { w, d, h, hw, hd, hh }, box, cyl, frustum, body, front, handle, handleH, knob, legs, slab, basin, faucet };
}
