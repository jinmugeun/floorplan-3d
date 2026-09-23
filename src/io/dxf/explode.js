// 모델스페이스를 평탄한 선분·원호·문자로 전개한다(§18.1). 어느 DXF 라이브러리도 이 일을 해 주지
// 않는데 **이 도면의 벽은 블록 `1f plan-1` 안에 있다** — 전개가 이 기능의 전제다.
//
// 행렬은 2×3 어파인 [a, b, c, d, e, f]다: x' = a·x + c·y + e, y' = b·x + d·y + f.
// `-0`은 접는다(사전 검토 I-1): `-sy * Math.sin(0)`이 슬롯 2에 `-0`을 내는데 vitest의 `toEqual`이
// `-0`과 `+0`을 구분하고, mergeCollinear의 방향 키(`u.toFixed(4)`)도 "0.0000"과 "-0.0000"으로 갈린다.
const z = v => v || 0;
export const mat = (tx = 0, ty = 0, sx = 1, sy = 1, rotDeg = 0) => {
  const r = rotDeg * Math.PI / 180, c = Math.cos(r), s = Math.sin(r);
  return [z(sx * c), z(sx * s), z(-sy * s), z(sy * c), z(tx), z(ty)];
};
export const matMul = (m, n) => [
  m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5],
];
export const apply = (m, p) => [m[0] * p[0] + m[2] * p[1] + m[4], m[1] * p[0] + m[3] * p[1] + m[5]];
export const scaleOf = m => (Math.hypot(m[0], m[1]) + Math.hypot(m[2], m[3])) / 2;
export const rotOf = m => Math.atan2(m[1], m[0]) * 180 / Math.PI;
export const mirrored = m => (m[0] * m[3] - m[1] * m[2]) < 0;

// bulge = tan(sweep/4). 현 두 점과 bulge로 중심·반지름·시작각·스윕을 되돌린다.
export function bulgeToArc(p0, p1, b) {
  const theta = 4 * Math.atan(b);
  const chord = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
  if (!chord) return null;
  const r = chord / (2 * Math.sin(theta / 2));
  const mid = [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2];
  const h = r * Math.cos(theta / 2);
  const nx = -(p1[1] - p0[1]) / chord, ny = (p1[0] - p0[0]) / chord;
  const c = [mid[0] + nx * h, mid[1] + ny * h];
  const a0 = Math.atan2(p0[1] - c[1], p0[0] - c[0]);
  return { c, r: Math.abs(r), a0: a0 * 180 / Math.PI, sweep: theta * 180 / Math.PI };
}
// 호 → 현 분할 수(규칙 ③). 12는 §18.1이 정한 값이다.
export const arcSteps = (sweep, steps = 12) => Math.max(2, Math.ceil(steps * Math.abs(sweep) / 180));

export function explode(doc, { arcSteps: steps = 12, maxDepth = 8, onProgress = () => {} } = {}) {
  const out = { segs: [], arcs: [], circles: [], inserts: [], texts: [], hatches: [], dims: [], others: new Map(), skipped: new Map() };
  const bump = (m, k) => m.set(k, (m.get(k) ?? 0) + 1);

  const walk = (ents, m, depth, inherit, blockName) => {
    for (const e of ents) {
      // 규칙 ①: 블록 안 레이어가 '0'인 엔티티는 INSERT의 레이어를 상속한다.
      const layer = (!e.layer || e.layer === '0') && inherit ? inherit : (e.layer || '0');
      switch (e.type) {
        case 'LINE':
          out.segs.push({ a: apply(m, [e.x ?? 0, e.y ?? 0]), b: apply(m, [e.x2 ?? 0, e.y2 ?? 0]), layer, src: 'LINE', depth, block: blockName });
          break;
        case 'LWPOLYLINE':
        case 'POLYLINE': {
          const pts = e.pts ?? [], n = pts.length;
          if (n < 2) break;
          const lim = e.closed ? n : n - 1;
          for (let k = 0; k < lim; k++) {
            const p0 = pts[k], p1 = pts[(k + 1) % n];
            const b = e.bulges?.[k] || 0;
            const arc = Math.abs(b) > 1e-9 ? bulgeToArc(p0, p1, b) : null;
            if (!arc) { out.segs.push({ a: apply(m, p0), b: apply(m, p1), layer, src: e.type, depth, block: blockName }); continue; }
            // 규칙 ③: 호에서 나온 선분은 src에 ':bulge'를 달아 벽 후보에서 빠지게 한다
            // (조경 곡선·라운드 코너는 벽이 아니다. 실파일의 bulge 폴리라인은 1개뿐이다).
            const nSeg = arcSteps(arc.sweep, steps);
            let prev = p0;
            for (let s = 1; s <= nSeg; s++) {
              const ang = (arc.a0 + arc.sweep * s / nSeg) * Math.PI / 180;
              const q = [arc.c[0] + arc.r * Math.cos(ang), arc.c[1] + arc.r * Math.sin(ang)];
              out.segs.push({ a: apply(m, prev), b: apply(m, q), layer, src: `${e.type}:bulge`, depth, block: blockName });
              prev = q;
            }
          }
          break;
        }
        case 'ARC': {
          // 규칙 ④. 거울이 섞인 등각 변환은 z ↦ s·e^{iφ}·conj(z)이고 φ = atan2(b, a) = rotOf(m)이다
          // (a = s cosφ · b = s sinφ · c = s sinφ · d = −s cosφ). 각 θ인 점은 **φ − θ**로 가고
          // 방향이 뒤집히므로 시작·끝도 바뀐다 — §18.1 ④의 `180 − a1`은 모든 거울에서 180° 어긋난다
          // (순수 x 거울이면 rotOf = 180이라 30°~120° 호가 60°~150°가 되어야 한다).
          const rr = rotOf(m), flip = mirrored(m);
          const s0 = e.a0 ?? 0, s1 = e.a1 ?? 0;
          out.arcs.push({
            c: apply(m, [e.x ?? 0, e.y ?? 0]), r: (e.r ?? 0) * scaleOf(m),
            a0: flip ? rr - s1 : s0 + rr, a1: flip ? rr - s0 : s1 + rr,
            layer, depth, block: blockName,
          });
          break;
        }
        case 'CIRCLE':
          out.circles.push({ c: apply(m, [e.x ?? 0, e.y ?? 0]), r: (e.r ?? 0) * scaleOf(m), layer, depth, block: blockName });
          break;
        case 'INSERT': {
          const sx = e.xscale ?? 1, sy = e.yscale ?? 1;
          const local = mat(e.x ?? 0, e.y ?? 0, sx, sy, e.a0 ?? 0);
          const mm = matMul(m, local);
          out.inserts.push({ name: e.name, pos: apply(m, [e.x ?? 0, e.y ?? 0]), rot: (e.a0 ?? 0) + rotOf(m), scale: [sx * scaleOf(m), sy * scaleOf(m)], layer, depth, mirrored: mirrored(mm), block: blockName });
          const b = doc.blocks?.get(e.name);
          if (!b) { bump(out.skipped, `missing-block:${e.name}`); break; }
          if (depth >= maxDepth) { bump(out.skipped, 'maxDepth'); break; }   // 규칙 ⑤(실측 최대 깊이 4)
          walk(b.entities, matMul(mm, mat(-b.base[0], -b.base[1], 1, 1, 0)), depth + 1, layer, e.name);  // 규칙 ②
          break;
        }
        case 'TEXT': case 'MTEXT':
          out.texts.push({ p: apply(m, [e.x ?? 0, e.y ?? 0]), h: (e.r ?? 0) * scaleOf(m), text: e.text ?? '', layer, depth, block: blockName });
          break;
        case 'HATCH': out.hatches.push({ layer, depth, block: blockName }); break;
        case 'DIMENSION': out.dims.push({ layer, depth, block: blockName }); break;
        case 'ATTRIB': case 'ATTDEF': case 'SEQEND': case 'VERTEX': break;
        // SPLINE·ELLIPSE는 **세기만 하고 만들지 않는다**: 실측 5,261개가 전부 기구 윤곽선이고
        // 벽에는 하나도 없다. 제어점 폴리라인 근사는 잘못 그릴 위험이 이득보다 크다(§18.10).
        default: bump(out.others, e.type); break;
      }
    }
  };
  walk((doc.entities ?? []).filter(e => !e.paper), mat(), 0, null, '*Model_Space');
  onProgress(1);
  return out;
}
