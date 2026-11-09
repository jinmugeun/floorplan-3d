// 신상중 템플릿 기구 ↔ 구입목록 짝(2026-11-06 · 계획 20 Task 8 · 명세 D9·D10). 템플릿(src/samples/sinsang.json)은 DXF 가져오기 결과라 기구가
// "크기·이름이 비슷한 엑셀 제품"이다 — 실제 구입 제품(구입목록 · purchaseData.js)으로 바꾼다. 도면의 구입 번호 글자(레이어 급식-기구구입 · 급식-재사용)가
// 구입목록 '도면번호'와 같다: 번호 글자 → 가까운 기구(거리 + 크기 차 + 형상 − 이름 낱말 × 맞음 정도)로 짝을 짓는다(명세 D9 ①·② — ②의 실 이름(구입목록 위치
// row.loc)은 쓰지 않는다: 템플릿 아이템에 방 정보가 없다). 자리·이름·dxfBlock은 그대로, 제품을 바꾸고
// dxfProduct를 뗀다(사람이 고른 제품 → 견적 대상 — itemOps.replaceProduct와 같은 규칙). 크기·회전은 fitItem이 제품에 맞춘다(2026-11-09 사용자 결정 —
// 평면 발자국은 그대로 · 너비·깊이를 ±90° 회전으로 되돌리고 높이는 제품 값 · 정면은 가까운 벽을 등진다).
//   node tools/products/sinsang-remap.mjs --map    → DXF(../dxf · corpus sinsang-A)에서 짝을 지어 tools/products/sinsang-map.json + 확인 그림 둘
//                                                    ../신상중/비교그림/계획20-템플릿-짝.png(초록 = 짝 · 주황 = 약한 짝 · 회색 = 그대로 · 빨강 원 = 기구를 못 찾은 번호)
//                                                    ../신상중/비교그림/계획20-템플릿-짝-표.png(구입목록 행마다 수량 · 짝 수 · 약한 짝)
//   node tools/products/sinsang-remap.mjs --figures → 지금 짝 표(손으로 고친 것 포함)로 확인 그림 둘만 다시 그린다(--map은 손 고침을 덮는다)
//   node tools/products/sinsang-remap.mjs --apply  → 짝 표를 src/samples/sinsang.json에 적용(멱등 — 이미 그 제품이고 도면 기구가 아니면 건너뛴다)
//   node tools/products/sinsang-remap.mjs --check  → 적용할 것이 남았으면 종료 1
// 짝 표는 사람이 확인한다(약한 짝 · 빨강 번호 · 수량 차) — 고칠 것은 sinsang-map.json의 pairs를 손으로 고치고 --figures로 다시 본 뒤 --apply.
// 템플릿을 다시 뽑으면(scratch/sinsang-sample.mjs → remap-samples.mjs) 이어서 --apply를 돌린다(아이템 id가 같지 않으면 자리·이름으로 찾는다).
// 적용된 기구는 dxfProduct가 없어(이미 그 제품이던 도면 기구도 뗀다) 견적의 '도면 기구'(0원 — estimate.isDrawnItem)가 아니다: 구입목록이 고른 제품이다.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import purchase from '../../src/products/purchaseData.js';
import { productById } from '../../src/products/catalog.js';
import { placeOnWall, isEmbed, normDeg, RAD } from '../../src/geom/items.js';
import { reseed } from './remap-samples.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const SAMPLE = resolve(HERE, '../../src/samples/sinsang.json'), MAP = resolve(HERE, 'sinsang-map.json');
const FIG = resolve(HERE, '../../../신상중/비교그림');
export const LABEL_LAYERS = Object.freeze(['급식-기구구입', '급식-재사용']);
export const NEAR_MM = 2500, WEAK = 1.5, NAME_BONUS = 0.6;
const SKIP_KINDS = new Set(['door', 'window', 'opening', 'column']);

// 아이템 바닥 사각형을 회전한 뒤 감싸는 축 정렬 상자의 반폭·반깊이(아무 각도 — 가져온 기구 대부분은 0·90·180·270이지만 330°·85°도 있다).
// 비스듬한 기구는 상자가 사각형보다 커서 모서리 쪽 거리를 조금 적게 잰다(짝 점수에는 충분하다). 확인 그림의 사각형도 이 상자다.
const halfExtents = it => {
  const r = (it.rot ?? 0) * Math.PI / 180, c = Math.abs(Math.cos(r)), s = Math.abs(Math.sin(r)), [w, d] = it.size;
  return [(c * w + s * d) / 2, (s * w + c * d) / 2];
};
// 점 → 아이템 바닥 상자(halfExtents)까지의 거리(mm). 안이면 0.
export function distToItem(p, it) {
  const [hw, hd] = halfExtents(it);
  return Math.hypot(Math.max(0, Math.abs(p[0] - it.pos[0]) - hw), Math.max(0, Math.abs(p[1] - it.pos[1]) - hd));
}
const fp = s => [Math.max(s[0], s[1]), Math.min(s[0], s[1]), s[2]];
const sizeGap = (a, b) => { const x = fp(a), y = fp(b); return [0, 1, 2].reduce((t, i) => t + Math.abs(Math.log(Math.max(1, x[i]) / Math.max(1, y[i]))), 0); };

// 이름 낱말(명세 D9 ②): 한글·영문 덩어리(숫자·규격·단위·문장부호에서 가른다 · 영문은 대문자) 가운데 2자 이상이고 흔한 낱말이 아닌 것.
// 흔한 낱말 = 열원(전기·가스) · 재질·부속(STS·배수구·도어) · 개수 단위(조·구·단·인용) · 무게·길이 단위 · 익명 도면 기구의 자리표 이름('도면 기구').
const GENERIC = new Set(['전기', '가스', 'STS', '배수구', '조', '구', '단', '도어', '인용', 'KG', 'MM', 'CM', '도면', '기구']);
export const nameWords = name => (String(name ?? '').match(/[가-힣]+|[A-Za-z]+/g) ?? []).map(w => w.toUpperCase()).filter(w => w.length >= 2 && !GENERIC.has(w));
// 같은 낱말 = 한쪽이 다른 쪽을 품는다('취반기' ⊂ '인덕션취반기' · '작업대' ⊂ '고정식작업대' — 도면 이름은 낱말을 붙여 쓴다).
// 맞음 정도 = 그런 낱말 쌍마다 짧은 길이 ÷ 긴 길이 가운데 가장 큰 값(없으면 0): 온전히 같으면 1 · '담금' ⊂ '수류담금세척기'는 2/7.
const matchRatio = (A, B) => A.reduce((m, x) => B.reduce((n, y) => (x.includes(y) || y.includes(x) ? Math.max(n, Math.min(x.length, y.length) / Math.max(x.length, y.length)) : n), m), 0);
export const sharesWord = (a, b) => matchRatio(nameWords(a), nameWords(b)) > 0;
// 이름 보너스 = NAME_BONUS × 맞음 정도(2026-11-06 컨트롤러 결정): 부분 낱말이 온전한 낱말의 기구를 뺏지 않게 — 신상중 15 '담금 세정대'가
// 이진 보너스로 '수류담금세척기 TR1500S'를 가져가고 14 수류담금세척기가 도면 기구로 밀렸다.
export const nameBonus = (rowName, itemName) => NAME_BONUS * matchRatio(nameWords(rowName), nameWords(itemName));

// 번호 글자 → 아이템 짝(순수). labels [{ no, p: [x, y](앱 mm) }] · items = 템플릿 아이템 · rows = purchaseData.rows · shapeOf(제품 id) → 형상 | undefined.
// 후보 = 문·창·개구부·기둥·천장 부착이 아니고 글자에서 NEAR_MM 안인 기구. 점수 = 거리(m) + 크기 차(정렬한 발자국 Σ|ln|) + 형상(같음 0 · 다름 1.5 ·
// 기구 쪽 형상 없음(도면 기구) 0.5) − 이름(nameBonus: 구입목록 이름과 아이템 이름이 낱말을 나누면 NAME_BONUS × 맞음 정도 — 많아야 거리 0.6 m 몫이라
// 거리가 여전히 앞선다 · 부분 낱말은 그만큼 작다).
// 점수가 낮은 짝부터 정한다(0 아래로 내려간 값 그대로 줄 세우고 짝 표에는 0으로 자른 값을 적는다) — 아이템과 글자는 한 번씩. 점수 > WEAK면 약한 짝(확인 그림 주황).
// 실 이름(row.loc)은 쓰지 않는다 — 템플릿 아이템에 방 정보가 없다.
export function matchLabels(labels, items, rows, shapeOf) {
  const byDwg = new Map(rows.filter(r => r.dwg).map(r => [r.dwg, r]));
  const cands = items.filter(it => !SKIP_KINDS.has(it.kind) && it.attach !== 'ceiling');
  const itemWords = new Map(cands.map(it => [it.id, nameWords(it.name)]));
  const all = [], noRow = new Set();
  labels.forEach((l, li) => {
    const row = byDwg.get(l.no);
    if (!row) { noRow.add(l.no); return; }
    const want = shapeOf(row.id), rowWords = nameWords(row.name);
    for (const it of cands) {
      const d = distToItem(l.p, it); if (d > NEAR_MM) continue;
      const have = shapeOf(it.productId);
      const raw = d / 1000 + sizeGap(it.size, row.size) + (have ? (have === want ? 0 : 1.5) : 0.5) - NAME_BONUS * matchRatio(rowWords, itemWords.get(it.id));
      all.push({ li, it, row, d, raw, score: Math.max(0, raw) });
    }
  });
  all.sort((a, b) => a.raw - b.raw || a.li - b.li);
  const usedL = new Set(), usedI = new Set(), pairs = [];
  for (const c of all) {
    if (usedL.has(c.li) || usedI.has(c.it.id)) continue;
    usedL.add(c.li); usedI.add(c.it.id);
    pairs.push({ itemId: c.it.id, pos: c.it.pos, name: c.it.name, from: c.it.productId, no: c.row.no, productId: c.row.id, dist: Math.round(c.d), score: +c.score.toFixed(3), weak: c.score > WEAK });
  }
  pairs.sort((a, b) => a.no - b.no || (a.itemId < b.itemId ? -1 : 1));
  const lost = labels.filter((l, li) => !usedL.has(li) && byDwg.has(l.no)).map(l => ({ no: l.no, p: l.p }));
  const got = new Map(); for (const x of pairs) got.set(x.no, (got.get(x.no) ?? 0) + 1);
  const counts = rows.filter(r => r.dwg).map(r => ({ no: r.no, name: r.name, qty: r.qty, got: got.get(r.no) ?? 0 })).filter(c => c.got !== c.qty);
  return { pairs, lost, noRow: [...noRow].sort((a, b) => a - b), counts };
}

// ── 크기·회전 맞추기(2026-11-09 · 계획 20 최종 리뷰 · 사용자 결정 — 앞의 "크기·회전 그대로" 규칙을 일부러 푼다) ──────────────────────────────
// 왜: 템플릿의 모델 44대 가운데 20대가 축 하나로 2배 넘게 늘어나 보였다. 까닭 둘 — ① DXF 가져오기가 블록 안에서 돌려 그린 기구를 rot 0 · 너비·깊이
// 바뀐 크기로 넣었다('세정대 2조 1500-750' → [750, 1500] rot 0) ② 높이는 DXF에 없어 remap-samples가 고른 엑셀 제품 높이가 남았다.
// 앱 정면 규약: 제품 정면 = 아이템 로컬 +y(3D +Z — itemAssets.js 규약 · items3d rotation.y = −rot · 2D ctx.rotate(rot) · geom placeOnWall
// "로컬 −y가 뒷면") → 평면(y = 남쪽 · 화면 아래)에서 rot 0은 정면이 +y, rot 90은 −x(roomTemplates "0 = 북쪽 벽에 등"). flipV는 로컬 깊이를 뒤집어 정면도 뒤집힌다.
export const SWAP_MARGIN = 0.1, FACE_MM = 1500;
export const frontDir = (rot, flipV = false) => { const s = flipV ? -1 : 1; return [-Math.sin(RAD(rot)) * s, Math.cos(RAD(rot)) * s]; };
const planGap = (a, b) => Math.abs(Math.log(a[0] / b[0])) + Math.abs(Math.log(a[1] / b[1]));   // 정렬하지 않은 축별 Σ|ln|(너비↔너비 · 깊이↔깊이)
const goodSize = s => Array.isArray(s) && s.length >= 3 && s.slice(0, 3).every(v => Number.isFinite(v) && v > 0);
// 점 p에서 방향 u(단위)로 처음 만나는 벽 면까지의 거리(mm · 가상 벽 빼고 · 없으면 Infinity). 벽 중심선과의 교차 거리에서 두께 반을 비스듬함만큼 뺀다.
export function wallRay(walls, p, u) {
  let best = Infinity;
  for (const w of walls) {
    if (w.virtual) continue;
    const ex = w.b[0] - w.a[0], ey = w.b[1] - w.a[1], den = u[0] * ey - u[1] * ex;
    if (Math.abs(den) < 1e-9) continue;
    const qx = w.a[0] - p[0], qy = w.a[1] - p[1], t = (qx * ey - qy * ex) / den, s = (qx * u[1] - qy * u[0]) / den;
    if (t > 0 && s >= 0 && s <= 1) best = Math.min(best, t - w.thickness / 2 / (Math.abs(den) / Math.hypot(ex, ey)));
  }
  return best;
}
// 정면이 가까운 벽을 등지는 회전: rot과 rot + 180 가운데 뒤쪽(깊이 축 −정면) 벽이 더 가까운 것. "가까운 벽"은 깊이 축 위에서 잰다 — 짧은 끝(너비 축)
// 쪽 벽은 앞뒤를 가르지 못한다. 둘 다 아이템 면에서 FACE_MM 밖이면(섬 기구) null. 같으면 rot 그대로(다시 돌려도 뒤집지 않는다).
function awayFromWall(walls, it, rot, depth) {
  const f = frontDir(rot, it.flipV), ahead = wallRay(walls, it.pos, f) - depth / 2, behind = wallRay(walls, it.pos, [-f[0], -f[1]]) - depth / 2;
  if (Math.min(ahead, behind) > FACE_MM) return null;
  return ahead < behind ? normDeg(rot + 180) : rot;
}
const signedAbs = r => Math.abs(normDeg(r) > 180 ? normDeg(r) - 360 : normDeg(r));

// 아이템 하나를 제품 p에 맞춘다(제자리 · 바꿨으면 참). 문·창·개구부·기둥·천장 부착·크기 모르는 제품은 건드리지 않는다. 이름·dxfBlock·z는 그대로.
//  · 높이 = 제품 높이.
//  · 바닥 기구: 너비·깊이를 [d, w]로 바꾼 쪽이 축별 Σ|ln|로 SWAP_MARGIN 넘게 맞으면 바꾸고 rot ± 90(평면 발자국 그대로) — 부호는 정면이 가까운 벽을
//    등지는 쪽, 벽이 FACE_MM 안에 없으면 회전 값이 0에 가까운 쪽(같으면 rot + 90). 바꾸지 않으면 정면이 벽을 보고 있을 때만 180° 돌린다(발자국 그대로).
//    자리(pos)는 그대로다. 바꾼 뒤 다시 돌리면 되바꾸는 쪽이 나빠 그대로고 정면은 이미 벽을 등져 0(멱등).
//  · 벽 부착 기구: 방향은 벽이 정한다(뒷면이 벽 — placeOnWall · reattach가 rot·pos를 다시 만든다) → 돌리지 않고 깊이도 제품 값으로 하고
//    (자동워터릴: DXF 기호 깊이 540 · 제품 220) 너비(벽을 따라 차지하는 자리)는 그대로 둔 채 placeOnWall로 다시 앉힌다(pos는 (wallId, t)의 결과 — 앱 불변식).
export function fitItem(it, p, walls = []) {
  if (SKIP_KINDS.has(it.kind) || it.attach === 'ceiling' || !goodSize(p?.size) || !goodSize(it.size)) return false;
  const before = JSON.stringify([it.size, it.rot, it.pos]), size = [...it.size];
  size[2] = p.size[2];
  if (it.attach === 'wall') {
    const w = it.wallId && walls.find(x => x.id === it.wallId);
    if (w) {
      size[1] = p.size[1];
      const r = placeOnWall(w, it.t, it.side, size, { embed: isEmbed(it) });
      it.pos = [Math.round(r.pos[0]), Math.round(r.pos[1])]; it.rot = r.rot;
    }
  } else {
    const rot = it.rot ?? 0;
    if (planGap(size, p.size) - planGap([size[1], size[0]], p.size) > SWAP_MARGIN) {
      [size[0], size[1]] = [size[1], size[0]];
      const a = normDeg(rot + 90), b = normDeg(rot - 90);
      it.rot = awayFromWall(walls, it, a, size[1]) ?? (signedAbs(b) < signedAbs(a) ? b : a);
    } else it.rot = awayFromWall(walls, it, rot, size[1]) ?? rot;
  }
  it.size = size;
  return JSON.stringify([it.size, it.rot, it.pos]) !== before;
}

// 짝 표 → 템플릿(순수 · 복사본). 아이템은 id로, 없으면 자리·이름으로 찾는다. 바꾸는 것: productId · code · kind · (기존 제품 색 그대로면) color · 설비 씨앗(reseed)
// · dxfProduct 떼기 — 구입목록 짝은 사람이 고른 제품이다(itemOps.replaceProduct와 같은 규칙: 같은 제품이어도 뗀다. 남기면 estimate.isDrawnItem이 0원으로 센다).
// remap-samples가 바꾼 엑셀 제품이 마침 구입 제품과 같은 도면 기구(세정대·옷장 등)는 제품은 그대로 두고 dxfProduct만 뗀다. 이어서 짝지은 기구마다
// fitItem(크기·회전 · 위)을 돌리고, 짝 표 밖에서 모델이 서는 기구(extra)에도 돌린다. 건너뛰는 것 = 이미 그 제품이고 도면 기구가 아니며 크기·회전도
// 맞는 것 — 다시 돌리면 0(멱등). changed = 무엇이든 바뀐 기구 수 · fitted = 그 가운데 크기·회전이 바뀐 수.
// 짝 표는 손으로 고치므로 먼저 전부 검사하고 아이템을 찾은 뒤에야 고친다: pos·name 없는 짝 · 같은 itemId 두 번 · 템플릿에 없는 아이템 ·
// 두 짝이 같은 아이템(자리·이름으로 찾은 것 포함) · 카탈로그에 없는 제품이면 아무것도 바꾸지 않고 오류.
export function applyMap(spec, map, byId = productById) {
  const out = structuredClone(spec), items = out.floors[0].items;
  const ids = new Set(), hit = new Set();
  const todo = map.pairs.map(pr => {
    if (!Array.isArray(pr.pos) || pr.pos.length < 2 || typeof pr.name !== 'string') throw new Error(`sinsang-remap: pos·name이 없는 짝 — ${pr.itemId}`);
    if (ids.has(pr.itemId)) throw new Error(`sinsang-remap: 짝 표에 같은 아이템이 두 번 — ${pr.itemId}`);
    ids.add(pr.itemId);
    const it = items.find(i => i.id === pr.itemId) ?? items.find(i => i.pos[0] === pr.pos[0] && i.pos[1] === pr.pos[1] && i.name === pr.name);
    if (!it) throw new Error(`sinsang-remap: 템플릿에 없는 아이템 — ${pr.itemId} ${pr.name}`);
    if (hit.has(it)) throw new Error(`sinsang-remap: 짝 표의 두 짝이 같은 아이템 — ${it.id}`);
    hit.add(it);
    if (!byId(pr.productId)) throw new Error(`sinsang-remap: 카탈로그에 없는 제품 — ${pr.productId}`);
    return [pr, it];
  });
  const walls = out.floors[0].walls ?? [];
  let changed = 0, fitted = 0;
  for (const [pr, it] of todo) {
    let c = false;
    if (it.productId !== pr.productId) {
      const old = byId(it.productId), np = byId(pr.productId);
      if (old && it.color === old.color) it.color = np.color;
      it.productId = np.id; it.code = np.code; it.kind = np.kind;
      delete it.dxfProduct;
      reseed(it, old, np);
      c = true;
    } else if (it.dxfProduct === it.productId) { delete it.dxfProduct; c = true; }
    if (fitItem(it, byId(it.productId), walls)) { fitted++; c = true; }
    if (c) changed++;
  }
  // 짝 표 밖에서 모델(제품 asset)이 서는 기구도 같은 크기·회전 규칙(2026-11-09: 신상중 템플릿에는 없다 — extra 0 · 테스트가 지킨다).
  const extra = items.filter(it => !hit.has(it) && byId(it.productId)?.asset);
  for (const it of extra) if (fitItem(it, byId(it.productId), walls)) { fitted++; changed++; }
  return { spec: out, changed, fitted, extra: extra.length };
}

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const txt = (x, y, s, size, fill) => `<text x="${x}" y="${y}" font-family="Malgun Gothic, Segoe UI, sans-serif" font-size="${size}" font-weight="700" fill="${fill}" text-anchor="middle" dominant-baseline="middle" stroke="#fff" stroke-width="3" paint-order="stroke">${esc(s)}</text>`;

// 확인 그림 둘(평면 · 표). sharp는 그림을 만들 때만 읽는다(테스트가 네이티브 모듈을 싣지 않게).
async function reviewImages(spec, map) {
  const { default: sharp } = await import('sharp');
  const f = spec.floors[0], xs = f.walls.flatMap(w => [w.a[0], w.b[0]]), ys = f.walls.flatMap(w => [w.a[1], w.b[1]]);
  const x0 = Math.min(...xs) - 800, y0 = Math.min(...ys) - 800, W = Math.max(...xs) + 800 - x0, H = Math.max(...ys) + 800 - y0, s = 5000 / W;
  const px = v => ((v - x0) * s).toFixed(1), py = v => ((v - y0) * s).toFixed(1), byItem = new Map(map.pairs.map(p => [p.itemId, p])), parts = [];
  for (const w of f.walls) parts.push(`<line x1="${px(w.a[0])}" y1="${py(w.a[1])}" x2="${px(w.b[0])}" y2="${py(w.b[1])}" stroke="#334155" stroke-width="${Math.max(1, w.thickness * s).toFixed(1)}"/>`);
  for (const it of f.items) {
    if (['door', 'window', 'opening'].includes(it.kind) || it.attach === 'ceiling') continue;
    const [hw, hd] = halfExtents(it), w = 2 * hw, d = 2 * hd;          // distToItem과 같은 상자
    const pr = byItem.get(it.id), fill = it.kind === 'column' ? '#94a3b8' : !pr ? '#e5e7eb' : pr.weak ? '#fdba74' : '#86efac';
    parts.push(`<rect x="${px(it.pos[0] - w / 2)}" y="${py(it.pos[1] - d / 2)}" width="${(w * s).toFixed(1)}" height="${(d * s).toFixed(1)}" fill="${fill}" stroke="#475569" stroke-width="1"/>`);
    if (pr) parts.push(txt(px(it.pos[0]), py(it.pos[1]), pr.no, 15, '#111'));
  }
  for (const l of map.lost) parts.push(`<circle cx="${px(l.p[0])}" cy="${py(l.p[1])}" r="14" fill="none" stroke="#dc2626" stroke-width="3"/>${txt(px(l.p[0]), py(l.p[1]), l.no, 13, '#dc2626')}`);
  const legend = `<text x="12" y="${Math.ceil(H * s) + 30}" font-family="Malgun Gothic" font-size="20" font-weight="700">초록 = 구입목록 짝(숫자 = 구입목록 번호) · 주황 = 약한 짝(확인 필요) · 회색 = 지금 제품 그대로 · 빨강 원 = 기구를 못 찾은 번호 · 짝 ${map.pairs.length} · 약한 짝 ${map.pairs.filter(p => p.weak).length}</text>`;
  const plan = `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.ceil(W * s)}" height="${Math.ceil(H * s) + 50}"><rect width="100%" height="100%" fill="#fff"/>${parts.join('')}${legend}</svg>`;
  await sharp(Buffer.from(plan)).png().toFile(resolve(FIG, '계획20-템플릿-짝.png'));
  const got = new Map(), weak = new Map(); for (const p of map.pairs) { got.set(p.no, (got.get(p.no) ?? 0) + 1); if (p.weak) weak.set(p.no, (weak.get(p.no) ?? 0) + 1); }
  const lines = purchase.rows.filter(r => r.dwg).map(r => ({ r, g: got.get(r.no) ?? 0, k: weak.get(r.no) ?? 0 }));
  const LH = 24, TW = 1100, table = `<svg xmlns="http://www.w3.org/2000/svg" width="${TW}" height="${(lines.length + 1) * LH + 10}"><rect width="100%" height="100%" fill="#fff"/>`
    + `<text x="8" y="18" font-family="Malgun Gothic" font-size="15" font-weight="700">번호 · 구입목록 이름 · 위치 · 수량 → 짝 수 (약한 짝)</text>`
    + lines.map(({ r, g, k }, i) => `<text x="8" y="${(i + 2) * LH - 6}" font-family="Malgun Gothic" font-size="14" fill="${g === r.qty && !k ? '#111' : '#b45309'}">${esc(`${r.no} · ${r.name} · ${r.loc} · ${r.qty} → ${g}${k ? ` (약한 ${k})` : ''}`)}</text>`).join('') + '</svg>';
  await sharp(Buffer.from(table)).png().toFile(resolve(FIG, '계획20-템플릿-짝-표.png'));
}

async function makeMap() {
  const { corpus, runDrawing, loadRoles, explodeRaw, fileOf, APP } = await import('../dxf-corpus/lib.mjs');
  const entry = corpus().find(d => d.id === 'sinsang-A'), path = entry && fileOf(entry);
  if (!path) throw new Error('DXF가 없다 — ../dxf(DXF_DIR)에 신상중 급식기구 배치도 · tools/dxf-corpus/corpus.json에 sinsang-A');
  const r = await runDrawing(entry, { roles: await loadRoles(resolve(APP, 'tools/dxf-corpus/roles'), 'sinsang-A'), dividers: false, equipment: true });
  if (!r || r.error) throw new Error(`가져오기 실패: ${JSON.stringify(r?.error ?? r)}`);
  // DXF 좌표 → 앱 좌표 · 도면 상자 안 판정: lib.runDrawing이 치수·면적 적합에 쓰는 toApp · near 그대로(같은 식을 두 곳에 두지 않는다).
  const clean = t => String(t.text ?? '').replace(/\s+/g, ' ').trim();
  const labels = (await explodeRaw(readFileSync(path))).texts.filter(t => LABEL_LAYERS.includes(t.layer) && /^\d{1,3}$/.test(clean(t)))
    .map(t => ({ no: Number(clean(t)), p: r.toApp(t.p).map(Math.round) })).filter(l => r.near(l.p));
  const spec = JSON.parse(readFileSync(SAMPLE, 'utf8'));
  const res = matchLabels(labels, spec.floors[0].items, purchase.rows, id => productById(id)?.shape);
  const map = { source: path.split(/[\\/]/).pop(), generatedAt: new Date().toISOString().slice(0, 10), labels: labels.length, ...res };
  writeFileSync(MAP, JSON.stringify(map, null, 1) + '\n');
  await reviewImages(spec, map);
  console.log(`번호 글자 ${labels.length} · 짝 ${res.pairs.length}(약한 ${res.pairs.filter(p => p.weak).length}) · 기구 못 찾음 ${res.lost.length} · 행 없는 번호 ${res.noRow.join(',') || '없음'} · 수량 차 ${res.counts.length}`);
  for (const c of res.counts) console.log(`  수량 차 ${c.no} ${c.name}: 구입 ${c.qty} · 짝 ${c.got}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const mode = process.argv[2];
  if (mode === '--map') await makeMap();
  else if (mode === '--figures') await reviewImages(JSON.parse(readFileSync(SAMPLE, 'utf8')), JSON.parse(readFileSync(MAP, 'utf8')));
  else if (mode === '--apply' || mode === '--check') {
    const r = applyMap(JSON.parse(readFileSync(SAMPLE, 'utf8')), JSON.parse(readFileSync(MAP, 'utf8')));
    console.log(`신상중 템플릿: 바꿀 기구 ${r.changed}개(크기·회전 ${r.fitted}) · 짝 표 밖 모델 기구 ${r.extra}개`);
    if (mode === '--check') process.exit(r.changed ? 1 : 0);
    writeFileSync(SAMPLE, JSON.stringify(r.spec));          // 원본처럼 한 줄 · 끝 줄바꿈 없음(remap-samples.mjs와 같다)
  } else { console.error('사용법: node tools/products/sinsang-remap.mjs --map | --figures | --apply | --check'); process.exit(1); }
}
