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
// 2026-10-02 내곡중: 창호 일람표의 기호(SD·FSD·SSD·ASD·AD·WD·PD + 폭 / AW·PW·SW·WW + 폭)와 우리말 이름
// (미서기단창_1300 · 방음문(시창형)_2400 · 화장실칸막이문600)도 읽는다. 우리말은 **문·창 종류를 가리키는 겹낱말**만
// 본다 — "문"·"창" 한 글자로 잡으면 기구의 문 수(양문·단문)와 창고가 걸린다.
export const DOOR_BLOCK = /^(dr|door|d)[-_ ]?\d{3,4}|^door|^문[-_ ]|^((f|s|a)?s?d|wd|pd)[-_ ]?\d{3,4}|(방화|방음|자동|현관|출입|칸막이|여닫이|미닫이|미서기|강화|유리|방풍)문/i;
export const WINDOW_BLOCK = /^(win|window|w)[-_ ]?\d{3,4}|^window|^창[-_ ]|^(aw|pw|sw|ww)[-_ ]?\d{3,4}|(미서기|미닫이|여닫이|고정|프로젝트|픽스|붙박이|오르내리)[^\s_]{0,3}창/i;
export const POCKET_BLOCK = /^문[-_ ]?(슬라이딩|포켓|미닫이)|^(pocket|sliding)/i;
// 창·문 블록 이름 전체(evidence.js가 긴 연장·다리의 "문·창 자리" 근거로 쓴다).
export const OPEN_BLOCK = new RegExp(`${DOOR_BLOCK.source}|${WINDOW_BLOCK.source}|${POCKET_BLOCK.source}`, 'i');

const PARALLEL_COS = Math.cos(3 * Math.PI / 180);
const HOST_PAD = 50;          // 벽 몸통 여유(mm)
const SIDE_TOL = 5;           // 벽 중심선의 "한쪽"으로 볼 최소 거리(mm)
const LEAF_MIN = 0.75;        // 포켓 문짝 = 벽과 나란하고 호칭 폭의 이 비율 이상인 선

export function blockKind(name = '') {
  if (POCKET_BLOCK.test(name)) return 'pocket';
  if (DOOR_BLOCK.test(name)) return 'door';
  if (WINDOW_BLOCK.test(name)) return 'window';
  return null;
}

// 블록 이름의 호칭 폭(mm): 이름에서 처음 나오는 3~4자리 숫자(win-900-3 → 900 · 문 2짝다른사이즈1500-200 → 1500), 없으면 0.
// blockOpenings(벽 위 폭)와 blockBoxes(코퍼스 정답 폭)가 같은 규칙을 쓴다(2026-10-06).
export function nominalWidth(name = '') {
  const m = String(name).match(/(\d{3,4})/);
  return m ? +m[1] : 0;
}

// INSERT 번호 → 그 도형을 거느리는 창·문 INSERT 번호(자기 이름이 창·문이면 자기, 아니면 부모의 주인 · 없으면 −1).
// 전개 순서상 부모가 자식보다 앞이라 한 번 훑으면 된다. blockOpenings와 blockBoxes가 같은 규칙을 쓴다(2026-10-06).
function ownerOf(ins) {
  const owner = [];
  ins.forEach((it, k) => { owner[k] = blockKind(it.name) ? k : it.parent != null ? owner[it.parent] ?? -1 : -1; });
  return owner;
}

// 창·문 INSERT(ownerOf의 주인 — 자기 이름이 창·문이면 자기, 안쪽이 이긴다)마다 전개 도형(창·문 이름이 아닌 자식 INSERT 포함)의
// bbox — **DXF 좌표**다(2026-10-06). 창·문 블록 안에 창·문 블록이 또 들어 있으면 상자가 최대 둘 나온다(바깥 것은 안쪽 도형을 뺀 제 몫만 — 제 몫이 없으면 하나):
// 네 도면에는 이런 겹침이 없지만, 있으면 Task 7의 spans가 서로 겹친다. 두 곳이 쓴다:
// 코퍼스 점수판의 개구부 정답 자리(tools/dxf-corpus/lib.mjs), 벽 구간화가 창 도중에 경계를 두지 않게 하는 spans(walls.js → bands.sectionsOf).
// 점은 선분 끝과 호 중심이다(blockOpenings와 같은 재료).
export function blockBoxes(ex) {
  const ins = ex?.inserts ?? [];
  const owner = ownerOf(ins);
  const box = new Map();
  const add = (k, p) => {
    if (!(k >= 0)) return;      // -1(주인 없음)뿐 아니라 undefined(ins가 없는 INSERT를 가리킴)도 거른다 — Task 7부터 모든 추출이 이 길을 지난다
    const b = box.get(k) ?? box.set(k, [Infinity, Infinity, -Infinity, -Infinity]).get(k);
    b[0] = Math.min(b[0], p[0]); b[1] = Math.min(b[1], p[1]); b[2] = Math.max(b[2], p[0]); b[3] = Math.max(b[3], p[1]);
  };
  for (const s of ex?.segs ?? []) if (s.ins != null) { add(owner[s.ins], s.a); add(owner[s.ins], s.b); }
  for (const c of [...(ex?.arcs ?? []), ...(ex?.polyArcs ?? [])]) if (c.ins != null) add(owner[c.ins], c.c);
  return [...box].map(([k, b]) => {
    const it = ins[k];
    return { k, kind: blockKind(it.name), name: it.name, width: nominalWidth(it.name), box: b };
  });
}

// → [{ kind, name, width, wall, t }] (앱 좌표 · mm). walls는 앱 좌표의 벽(id·a·b·thickness)이다.
export function blockOpenings(ex, walls, toApp = p => p) {
  const ins = ex?.inserts ?? [];
  const owner = ownerOf(ins);
  const geo = new Map();
  const at = k => geo.get(k) ?? geo.set(k, { pts: [], lines: [] }).get(k);
  for (const s of ex?.segs ?? []) {
    const k = s.ins != null ? owner[s.ins] : -1;
    if (!(k >= 0)) continue;    // undefined(ins가 없는 INSERT를 가리킴)도 거른다 — blockBoxes와 같은 결함(2026-10-06)
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
    // 벽 방향 = 블록 로컬 x. 로컬 y를 벽 방향으로 그린 블록도 있다(2026-10-02 내곡중 SD850 — 로컬 x는 열린 문짝 방향이라 문짝이 기대어 선
    // 옆 벽에 문이 앉았다): 문틀·창틀은 벽 몸통을 **가로질러** 놓이고 기대어 선 문짝은 벽의 한쪽에만 있으므로, 로컬 x 쪽 벽을 도형이
    // 가로지르지 않는데 수직 방향 벽은 가로지르면 수직 방향이 벽 방향이다. 2026-10-06: 문만이 아니라 창·포켓도 같은 규칙이다(계획 10
    // 이월 — 로컬 x 쪽 호스트가 없으면 창이 통째로 빠졌다). 코퍼스 넷에서 창·문·개구부 정답 지표가 나빠지지 않았다(그대로다 — 넷의
    // 창·포켓 중 이 길을 타는 것은 아직 없고, 수직 방향으로 앉는 것은 내곡중 문 SD850·방음문 2400뿐이다).
    // 2026-10-06 최종 리뷰: 창·포켓은 로컬 x 쪽 호스트가 **있지만 가로지르지 않을** 때 호칭 폭이 수직 구간 폭의 0.4~1.1배(아래 폭
    // 규칙과 같다)일 때만 넘어간다 — 두꺼운 외벽의 한쪽에만 그린 창이, 창 가운데에 T자로 붙는 칸막이 몸통에 걸린 멀리언 두 선 때문에
    // 칸막이에 폭 135로 앉고 외벽의 창이 빠질 수 있었다(합성 테스트로 확인 — 코퍼스 넷의 창·포켓 중 이 길을 타는 것은 없다).
    // 호스트가 없으면 예전처럼 넘어가고, 문은 그대로다(내곡중 SD850·방음문으로 확인한 동작).
    const nominal = nominalWidth(it.name);
    const plausible = span => nominal >= 0.4 * span && nominal <= 1.1 * span;
    const seat = dir => {
      const ts = g.pts.map(p => p[0] * dir[0] + p[1] * dir[1]), lo = Math.min(...ts), hi = Math.max(...ts);
      return { u: dir, x0: lo, x1: hi, host: hi > lo ? hostWall(walls, g.pts, dir, lo, hi) : null };
    };
    let pick = seat([(e[0] - o[0]) / el, (e[1] - o[1]) / el]);
    if (!pick.host?.across) {
      const alt = seat([-pick.u[1], pick.u[0]]);
      if (alt.host?.across && (kind === 'door' || !pick.host || plausible(alt.x1 - alt.x0))) pick = alt;
    }
    const { u, x0, x1 } = pick, span = x1 - x0;
    const along = p => p[0] * u[0] + p[1] * u[1];
    if (!(span > 0)) continue;
    const width = plausible(span) ? nominal : kind === 'pocket' ? span / 2 : span;
    let c = (x0 + x1) / 2;
    if (kind === 'pocket') {
      // 문짝(벽과 나란한 긴 선)이 있는 쪽 절반이 주머니다 — 개구부는 반대쪽 절반.
      const leaf = g.lines.filter(([a, b]) => { const d = [b[0] - a[0], b[1] - a[1]], L = Math.hypot(d[0], d[1]); return L >= LEAF_MIN * width && Math.abs(d[0] * u[0] + d[1] * u[1]) / L >= PARALLEL_COS; });
      const lc = leaf.length ? leaf.reduce((s, [a, b]) => s + (along(a) + along(b)) / 2, 0) / leaf.length : x0;
      c = lc <= (x0 + x1) / 2 ? x1 - width / 2 : x0 + width / 2;
    }
    const host = pick.host;
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
    let n = 0, left = 0, right = 0;
    for (const p of pts) {
      const q = [p[0] - w.a[0], p[1] - w.a[1]], t = q[0] * d[0] + q[1] * d[1], lat = q[1] * d[0] - q[0] * d[1];
      if (t < -HOST_PAD || t > L + HOST_PAD || Math.abs(lat) > h) continue;
      n++;
      if (lat > SIDE_TOL) left++; else if (lat < -SIDE_TOL) right++;
    }
    // across: 도형이 벽 중심선의 양쪽에 있다(문틀·창틀은 벽을 가로지른다 — 기대어 선 문짝은 한쪽에만 있다).
    if (n && (!best || n > best.n)) best = { wall: w, L, d, n, across: left > 0 && right > 0 };
  }
  return best;
}
