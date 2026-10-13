// 인서트별 전개 상자(2026-10-12 · 계획 13 Task 2): 최상위 INSERT 하나가 거느린 전개 도형(자식 INSERT의 도형 포함)의 bbox — **DXF 좌표**다.
// 왜 따로 두나: 기구 블록(equipment.js)은 블록 하나가 기구 하나이고, 자리·크기를 그 블록의 전개 도형에서 읽는다(INSERT 점은 블록 base라
// 실파일에서 수십만 mm 떨어져 있다 — blockOpenings.js 머리 주석).
// 재료 = **선분 끝 + ARC의 양 끝점**(폴리선 bulge 호는 explode가 이미 선분으로 쪼갰다). blockBoxes(창·문)의 "선분 끝 + 호 중심"을 쓰지 않는 까닭
// (2026-10-12 실측 scratch p13t2-boxvar.mjs — 네 도면 영역 안 이름 치수 인서트 164개): 기구 기호의 큰 반지름 호는 중심이 몸체 밖 멀리 있다 —
// 호 중심(ARC + bulge 호 — blockBoxes와 같은 재료)을 넣으면 `냉장고 4도어 1260-850` 4517×1073 · `보온고 양문640-850` 1272×2557 · `세탁 건조기 700-830` 700×3073 ·
// 내곡 `To양변기F(w)` 1114×4001(ARC 중심만이면 1114×775 · bulge 중심만이면 872×4001 — scratch p13t2-centres.mjs)로
// 부풀어 이름 치수 적합(긴 변 ±20 %)이 148 → 143으로 떨어진다. 양 끝점은 그린 선 위에 있어 그런 일이 없고, 실제 쓸린 범위(Task 1 방식)와 적합이
// 같다(148 · 두 변 124). 선분이 하나도 없는 인서트만 원·호의 범위(c ± r)를 쓴다.
// 주인 배열(owner)을 받는다 — 기본은 최상위 주인(topOwner). blockBoxes는 창·문 주인(ownerOf)과 다른 재료를 쓰므로 그대로 두었다
// (2026-10-12: Task 6이 blockOpenings.js를 고치는 중이라 손대지 않았다 — 개구부 정답 상자는 점수판 기준이라 재료를 바꾸면 기준이 움직인다).
// 이 파일도 워커의 import 사슬이다: DOM·ui를 건드리지 않는다.

// INSERT 번호 → 최상위 조상 INSERT 번호(자기가 최상위면 자기). 전개 순서상 부모가 자식보다 앞이라 한 번 훑으면 된다.
// roots(번호 Set)에 든 인서트는 부모가 있어도 제 주인이고 그 자손은 그것을 따른다(아래 groupOwner — 복합 블록의 내장 기구).
export function topOwner(ins = [], roots = null) {
  const top = [];
  ins.forEach((it, k) => { top[k] = it.parent != null && it.parent >= 0 && !roots?.has(k) ? top[it.parent] ?? -1 : k; });
  return top;
}

// 복합 블록 전개(2026-10-13 · 계획 14 Task F · 사전 검토 p14-preflight.md I-7): 최상위 인서트의 **깊이 1** 자식 중 어휘 자식(vocab(이름) — 부르는 쪽이
// 정한다: 익명 아님 · 제외 아님 · 어휘에 맞음)이 GROUP_MIN 이상이고 부모 이름은 어휘가 아니면, 그 어휘 자식을 주인으로 올린다(자손 도형은 그 자식 몫).
// 왜: 사동 `1f plan-1`(건물 블록 — 샤워기 4 · 세면대 2 · 변기 2) · 내곡 `afadfasdfasfd` ×2(영유아거치대 · 세면대 평면) · 신상 A `zw$CEA1`(곡물받침대 ×2)은
// 기구를 품은 묶음이라, 최상위만 보면 통째로 빠지거나(제외 composite) 하나의 엉뚱한 상자(안쪽 글자 → 12칸 사물함 1400×900)가 됐다. 내장 INSERT의 pos·rot은
// explode가 이미 부모 행렬을 거친 월드 값이라(explode.js INSERT) 주인 배열만 바꾸면 상자·자리·회전이 제대로 나온다.
// 어휘 자식만 올린다: 깊이 1 자식 전부면 사동이 +2(`1P-T211` 일반 상자)다. 부모가 어휘면 그대로 하나다(식탁6인 + 의자, 세정대 + 수전 — 쪼개지 않는다).
// 공개 코퍼스 40장에는 이런 그룹이 없다(2026-10-13 진단 scratch p14f-diag.mjs).
// → { owner(topOwner 꼴), groups: Map(부모 번호 → [올린 자식 번호…]) }. 부르는 쪽(equipment.js)은 groups의 부모를 후보에서 뺀다.
const GROUP_MIN = 2;
export function groupOwner(ins = [], vocab = () => false) {
  const top = k => !(ins[k]?.parent != null && ins[k].parent >= 0);
  const kids = new Map();
  ins.forEach((it, k) => { const p = it.parent; if (p != null && p >= 0 && top(p) && vocab(it.name)) (kids.get(p) ?? kids.set(p, []).get(p)).push(k); });
  const groups = new Map([...kids].filter(([p, ks]) => ks.length >= GROUP_MIN && !vocab(ins[p].name)));
  return { owner: topOwner(ins, new Set([...groups.values()].flat())), groups };
}

// ARC의 양 끝점(explode가 월드 각도로 a0 → a1 반시계로 맞춰 두었다).
export const arcEnds = c => [c.a0, c.a1].map(d => [c.c[0] + c.r * Math.cos(d * Math.PI / 180), c.c[1] + c.r * Math.sin(d * Math.PI / 180)]);

// → Map(주인 번호 → { box: [x0, y0, x1, y1], n: 선분 수, circle? }). 도형이 없는 인서트는 없다. circle은 원 + 중심 십자 블록의 원(아래 crossCircles).
export function insertBoxes(ex, owner = topOwner(ex?.inserts ?? [])) {
  const out = new Map();
  const at = k => out.get(k) ?? out.set(k, { box: [Infinity, Infinity, -Infinity, -Infinity], n: 0 }).get(k);
  const grow = (b, x0, y0, x1, y1) => { b[0] = Math.min(b[0], x0); b[1] = Math.min(b[1], y0); b[2] = Math.max(b[2], x1); b[3] = Math.max(b[3], y1); };
  const own = e => (e.ins != null ? owner[e.ins] : undefined);
  for (const s of ex?.segs ?? []) {
    const k = own(s);
    if (!(k >= 0)) continue;     // -1(주인 없음)·undefined(ins가 없는 INSERT를 가리킴)를 거른다 — blockBoxes와 같은 방어
    const g = at(k);
    grow(g.box, Math.min(s.a[0], s.b[0]), Math.min(s.a[1], s.b[1]), Math.max(s.a[0], s.b[0]), Math.max(s.a[1], s.b[1]));
    g.n++;
  }
  for (const c of ex?.arcs ?? []) { const k = own(c); if (k >= 0 && out.has(k)) for (const p of arcEnds(c)) grow(out.get(k).box, p[0], p[1], p[0], p[1]); }
  // 선분이 없는 인서트(원·호만 그린 기호): 원·호의 범위.
  for (const c of [...(ex?.circles ?? []), ...(ex?.arcs ?? [])]) {
    const k = own(c);
    if (!(k >= 0) || out.get(k)?.n) continue;
    grow(at(k).box, c.c[0] - c.r, c.c[1] - c.r, c.c[0] + c.r, c.c[1] + c.r);
  }
  crossCircles(ex, own, out);
  return out;
}

// 원 + 중심 십자(2026-10-12 · 계획 13 최종 리뷰 F-6 · Task 4 리뷰 T4-1): `운반카 튀김 620`(사동 6 · 신상 A `운반차` 2)은 동심원 r310·280·100.6과
// 중심을 지나는 십자(720 · 820)뿐이다. 선분 끝으로 재면 720×820으로 부풀어(정답 Ø620 · +32 %) 8개 모두 빨갛게 충돌했다.
// 좁은 규칙만 쓴다: 선분이 **전부** 가장 큰 원의 중심을 지나는 짧은 선(중점이 중심에서 CROSS_TOL 안 · 길이 ≤ 4r)이고 다른 원·호가 그 원 안이면
// 상자 = 그 원의 범위(g.circle에 원을 남긴다 — 축이 아닌 인서트의 로컬 상자도 원을 쓴다 · equipment.frameBox). "원을 지나는 선을 모두 버린다"는
// 넓은 규칙은 쓰지 않는다 — 몸체 밖 원을 가진 손세정대 5개 · 세탁기 1개까지 자리가 움직였다(리뷰어 측정 · 공개 40장은 둘 다 0개).
const CROSS_TOL = 5;
function crossCircles(ex, own, out) {
  const big = new Map();   // 주인 → 가장 큰 원(선분이 있는 인서트만 — 없으면 위에서 이미 원 범위다)
  for (const c of ex?.circles ?? []) { const k = own(c); if (k >= 0 && out.get(k)?.n && !(big.get(k)?.r >= c.r)) big.set(k, c); }
  if (!big.size) return;
  const bad = new Set(), dist = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]);
  const inside = (k, c) => dist(c.c, big.get(k).c) + c.r <= big.get(k).r + CROSS_TOL;
  for (const s of ex.segs ?? []) {
    const k = own(s), C = k >= 0 ? big.get(k) : null;
    if (!C || bad.has(k)) continue;
    if (dist([(s.a[0] + s.b[0]) / 2, (s.a[1] + s.b[1]) / 2], C.c) > CROSS_TOL || dist(s.a, s.b) > 4 * C.r) bad.add(k);
  }
  for (const c of [...(ex.circles ?? []), ...(ex.arcs ?? [])]) { const k = own(c); if (big.has(k) && !inside(k, c)) bad.add(k); }
  for (const [k, C] of big) if (!bad.has(k)) Object.assign(out.get(k), { box: [C.c[0] - C.r, C.c[1] - C.r, C.c[0] + C.r, C.c[1] + C.r], circle: C });
}

// 고른 주인(keys)들의 도형 목록 → Map(주인 → { segs, arcs, polyArcs, texts }) — 참조만 모은다(복사 없음). 기구 판정(X-상자 · 문 스윙 · 안쪽 글자 ·
// 축 정렬이 아닌 블록의 로컬 상자)이 후보 인서트에만 쓴다.
export function insertParts(ex, keys, owner = topOwner(ex?.inserts ?? [])) {
  const out = new Map([...keys].map(k => [k, { segs: [], arcs: [], polyArcs: [], texts: [] }]));
  const put = (list, slot) => { for (const e of list ?? []) { const g = e.ins != null ? out.get(owner[e.ins]) : null; if (g) g[slot].push(e); } };
  put(ex?.segs, 'segs'); put(ex?.arcs, 'arcs'); put(ex?.polyArcs, 'polyArcs'); put(ex?.texts, 'texts');
  return out;
}
