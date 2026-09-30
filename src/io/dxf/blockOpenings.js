// 창·문 블록 INSERT → 개구부(2026-09-30 정확도 2차). 실파일의 창·문 44개는 **INSERT 하나가 개구부 하나**이고, 블록
// 로컬 x축이 벽 방향이며 이름의 숫자가 호칭 폭이다(win-900-3 · WIN-2400-2 · DR-1800 · dr-1850 · 문_슬라이딩 포켓 900).
// 블록 로컬 좌표는 base에서 멀리 떨어져 있을 수 있어(DR-1800은 74만 mm) INSERT 점은 쓰지 않고, 그 INSERT에서
// **전개된 월드 도형**(explode의 ins·parent 꼬리표)을 모은다. 문 궤적·창 면선·벽 틈으로 짐작하던 것보다 자리·종류·폭이
// 정확하다(짐작 경로는 포켓 미닫이 11짝을 폭 950 개구부로, 900 창을 800 개구부로 앉혔다).
//  - 자리: 도형을 벽 방향(로컬 x의 월드 방향)에 투영한 구간의 가운데. 포켓 미닫이는 구간의 절반이 벽 속 주머니라
//    문짝(벽과 나란한 긴 선)이 **없는** 쪽 절반이 개구부다.
//  - 벽: 벽 방향과 나란하고 몸통(두께/2 + HOST_PAD) 안에 도형 점이 가장 많이 드는 벽 — 열린 문짝·스윙은 벽 밖이다.
//  - 폭: 이름의 숫자(구간 폭의 0.4~1.1배일 때), 아니면 구간 폭(포켓은 절반).

// 문 블록 이름(2026-09-29): 실파일 여닫이문은 역할 "기타"인 WID 레이어의 DR-900·DR-1800·dr-1850 블록에 있었다.
// 이름 **앞머리**만 본다: "문"이 뒤에 붙는 주방 기구("보냉고 양문"·"소독기 단문")는 문이 아니다.
export const DOOR_BLOCK = /^(dr|door|d)[-_ ]?\d{3,4}|^door|^문[-_ ]/i;
export const WINDOW_BLOCK = /^(win|window|w)[-_ ]?\d{3,4}|^window|^창[-_ ]/i;
export const POCKET_BLOCK = /^문[-_ ]?(슬라이딩|포켓|미닫이)|^(pocket|sliding)/i;
// 창·문 블록 이름 전체(evidence.js가 긴 연장·다리의 "문·창 자리" 근거로 쓴다).
export const OPEN_BLOCK = new RegExp(`${DOOR_BLOCK.source}|${WINDOW_BLOCK.source}|${POCKET_BLOCK.source}`, 'i');

const PARALLEL_COS = Math.cos(3 * Math.PI / 180);
const HOST_PAD = 50;          // 벽 몸통 여유(mm)
const LEAF_MIN = 0.75;        // 포켓 문짝 = 벽과 나란하고 호칭 폭의 이 비율 이상인 선

export function blockKind(name = '') {
  if (POCKET_BLOCK.test(name)) return 'pocket';
  if (DOOR_BLOCK.test(name)) return 'door';
  if (WINDOW_BLOCK.test(name)) return 'window';
  return null;
}

// → [{ kind, name, width, wall, t }] (앱 좌표 · mm). walls는 앱 좌표의 벽(id·a·b·thickness)이다.
export function blockOpenings(ex, walls, toApp = p => p) {
  const ins = ex?.inserts ?? [];
  const owner = [];
  ins.forEach((it, k) => { owner[k] = blockKind(it.name) ? k : it.parent != null ? owner[it.parent] ?? -1 : -1; });
  const geo = new Map();
  const at = k => geo.get(k) ?? geo.set(k, { pts: [], lines: [] }).get(k);
  for (const s of ex?.segs ?? []) {
    const k = s.ins != null ? owner[s.ins] : -1;
    if (k < 0) continue;
    const a = toApp(s.a), b = toApp(s.b), g = at(k);
    g.pts.push(a, b);
    g.lines.push([a, b]);
  }
  for (const c of [...(ex?.arcs ?? []), ...(ex?.polyArcs ?? [])]) { const k = c.ins != null ? owner[c.ins] : -1; if (k >= 0) at(k).pts.push(toApp(c.c)); }
  const out = [];
  for (const [k, g] of geo) {
    const it = ins[k], kind = blockKind(it.name);
    const r = (it.rot ?? 0) * Math.PI / 180, o = toApp(it.pos), e = toApp([it.pos[0] + Math.cos(r), it.pos[1] + Math.sin(r)]);
    const el = Math.hypot(e[0] - o[0], e[1] - o[1]);
    if (!el) continue;
    const u = [(e[0] - o[0]) / el, (e[1] - o[1]) / el];
    const along = p => p[0] * u[0] + p[1] * u[1];
    const ts = g.pts.map(along), x0 = Math.min(...ts), x1 = Math.max(...ts), span = x1 - x0;
    if (!(span > 0)) continue;
    const m = it.name.match(/(\d{3,4})/), nominal = m ? +m[1] : 0;
    const width = nominal >= 0.4 * span && nominal <= 1.1 * span ? nominal : kind === 'pocket' ? span / 2 : span;
    let c = (x0 + x1) / 2;
    if (kind === 'pocket') {
      // 문짝(벽과 나란한 긴 선)이 있는 쪽 절반이 주머니다 — 개구부는 반대쪽 절반.
      const leaf = g.lines.filter(([a, b]) => { const d = [b[0] - a[0], b[1] - a[1]], L = Math.hypot(d[0], d[1]); return L >= LEAF_MIN * width && Math.abs(d[0] * u[0] + d[1] * u[1]) / L >= PARALLEL_COS; });
      const lc = leaf.length ? leaf.reduce((s, [a, b]) => s + (along(a) + along(b)) / 2, 0) / leaf.length : x0;
      c = lc <= (x0 + x1) / 2 ? x1 - width / 2 : x0 + width / 2;
    }
    const host = hostWall(walls, g.pts, u, x0, x1);
    if (!host) continue;
    const { wall, L, d } = host;
    // 벽 위 t: 벽 방향 단위벡터 d와 u는 나란하다(같거나 반대 방향).
    const s = d[0] * u[0] + d[1] * u[1] > 0 ? 1 : -1;
    out.push({ kind, name: it.name, width, wall, t: (s * c - (wall.a[0] * d[0] + wall.a[1] * d[1])) / L });
  }
  return out;
}

// 벽 방향 u와 나란하고, 개구부 구간 [x0, x1]에 걸치며, 몸통 안에 도형 점이 가장 많이 드는 벽.
function hostWall(walls, pts, u, x0, x1) {
  let best = null;
  for (const w of walls ?? []) {
    const v = [w.b[0] - w.a[0], w.b[1] - w.a[1]], L = Math.hypot(v[0], v[1]);
    if (!L) continue;
    const d = [v[0] / L, v[1] / L];
    if (Math.abs(d[0] * u[0] + d[1] * u[1]) < PARALLEL_COS) continue;
    const ta = w.a[0] * u[0] + w.a[1] * u[1], tb = w.b[0] * u[0] + w.b[1] * u[1];
    if (Math.min(x1, Math.max(ta, tb)) - Math.max(x0, Math.min(ta, tb)) <= 0) continue;
    const h = w.thickness / 2 + HOST_PAD;
    let n = 0;
    for (const p of pts) {
      const q = [p[0] - w.a[0], p[1] - w.a[1]], t = q[0] * d[0] + q[1] * d[1];
      if (t >= -HOST_PAD && t <= L + HOST_PAD && Math.abs(q[1] * d[0] - q[0] * d[1]) <= h) n++;
    }
    if (n && (!best || n > best.n)) best = { wall: w, L, d, n };
  }
  return best;
}
