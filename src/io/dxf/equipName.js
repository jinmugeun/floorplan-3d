// 정규화 DXF의 기구 블록 이름(2026-10-13 · 계획 14 Task E · 사전 검토 p14-preflight.md I-6). 왜: 계획 12의 정규화 DXF는 기구를 빼고 써서
// CAD에서 벽을 고쳐 다시 들여오면 기구가 모두 사라졌다(안내 §3 — 왕복 고리가 기구에서 끊겼다). 이제 기구 하나 = `EQUIP` 레이어의 INSERT
// 하나이고, 다시 세울 것을 블록 이름 하나에 다 적는다:
//     EQ-<이름>-<W>x<D>x<H>@<productId>[!]     (W·D = 블록 사각형 · H = 높이 · mm 정수 · `!` = 가격 있는 제품)
// 크기를 이름에 넣는 까닭(사전 검토 I-6): 블록 하나 = 사각형 하나라, 이름만으로 블록을 나누면 이름이 같고 크기가 다른 것(사동 '도면 기구'
// 28개가 20종 · Task A로 깎인 500×400 → 482×400)이 첫 크기로 돌아온다. 같은 전체 이름이면 블록 하나다(dxfExportEquip.js).
// 꼬리 `!`(2026-10-13 · Task E 리뷰 I-2): 사람이 고른 제품(estimate.isDrawnItem이 아닌 것 — 손으로 놓았거나 제품을 바꾼 것). 다시 들여오면 dxfProduct도
// dxfBlock도 두지 않아 그 제품 가격이고 사람이 놓은 아이템이다(최종 리뷰 X-1 — eqPlacement). 없으면 도면에서 가져온 기구 — 0원 '도면 기구'(예전 파일도
// 이 뜻 그대로 읽힌다). 리뷰 프로브: 표지 없이 8,350,000 → 0원.
// 이름은 **오른쪽부터** 읽는다: `@` 뒤가 제품 id(`@`·`!`가 없는 꼴), 그 앞 `-WxDxH` — 본체에 `-`·숫자·`@`가 있어도(세정대 2조 1500-750) 갈리지 않는다.
// 삽입점 높이(코드 30)가 아이템 z다(explode의 inserts.z — 리뷰 m-1). 천장 기구만 층고 − 높이로 다시 잰다.
// 이 파일이 형식의 정본이다: 내보내기(io/dxfExportEquip.js)와 가져오기(io/dxf/equipment.js)가 함께 쓴다. 워커 import 사슬 — DOM을 모른다.
import { OPEN_BLOCK } from './blockOpenings.js';
import { matchEquip } from './equipVocab.js';
import { productById } from '../../products/catalog.js';
import { kitchenFor } from '../../products/catalogKitchen.js';
import { normDeg, wallAxis } from '../../geom/items.js';

export const EQ_LAYER = 'EQUIP';
const GEN = 'equip-generic';
const EQ = /^EQ-(.*)-(\d+)x(\d+)x(\d+)@([^@!]*)(!?)$/i;
const r0 = v => Math.round(v) || 0;

// 본체: 블록 이름에 쓸 수 없는 글자(< > / \ " : ; ? * | , = `)와 그 밖의 기호는 `_`로, 공백도 `_`로(가져오기는 `_`를 공백으로 되돌린다 — cleanName과
// 같은 규칙). 치수의 `*`·`×`는 `x`로(사동 이름 `600*600` — 사전 검토 I-6). 남기는 것: 글자(한글·한자 포함)·숫자·`-_.()@`.
export const eqSafe = name => String(name ?? '').trim().replace(/[*×]/g, 'x').replace(/[^\p{L}\p{N}\-_.()@]+/gu, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');

// 이름 + 크기 + 제품 → 블록 이름. priced = 사람이 고른 제품(꼬리 `!`). 본체가 창·문 이름 규칙의 앞머리가 아닌 꼴('유리문'·'미서기창'·'포켓도어900' —
// blockOpenings)에 걸리면 다시 들여올 때 같은 블록이 문·창으로도 선다 — 걸린 자리의 첫 글자 뒤에 `~`를 넣어 끊는다. `~`는 eqSafe가 내지 않는 글자라
// 가져오기가 지우면 이름이 그대로다(리뷰 m-5 — 처음엔 `_`라 `유 리문`으로 돌아왔다). 카탈로그 제품 이름은 하나도 걸리지 않는다(사전 검토 §3 E).
export function eqBlockName(name, size, productId, { priced = false } = {}) {
  const [w, d, h] = [0, 1, 2].map(i => Math.max(1, r0(size?.[i] ?? 0)));
  const pid = String(productId ?? '').replace(/[^\w.-]/g, '');
  let body = eqSafe(name) || pid || 'item';
  const full = () => `EQ-${body}-${w}x${d}x${h}@${pid}${priced ? '!' : ''}`;
  for (let i = 0, m; i < 8 && (m = OPEN_BLOCK.exec(full())) && m.index >= 3; i++) body = `${body.slice(0, m.index - 2)}~${body.slice(m.index - 2)}`;
  return full();
}

// 블록 이름 → { name, body, size: [W, D, H], productId, priced } | null(형식이 아니면 — 실도면 44장에 `EQ-` 이름은 0개다). name은 `~`를 지우고
// `_` → 공백, body는 `~`만 지운 본체. 제품 id는 소문자로 읽는다(카탈로그 id는 모두 소문자 — 블록 이름을 대문자로 바꿔 저장하는 CAD가 있다).
export function parseEqBlock(blockName) {
  const m = EQ.exec(String(blockName ?? '').trim());
  if (!m) return null;
  const body = m[1].replace(/~/g, '');
  return { name: body.replace(/_/g, ' ').replace(/\s+/g, ' ').trim(), body, size: [+m[2], +m[3], +m[4]], productId: m[5].toLowerCase(), priced: m[6] === '!' };
}
export const isEqBlock = name => !!parseEqBlock(name);

// 블록 사각형(전개된 월드 선분) → { c, w, d } — **인서트 자신의 축**으로 잰다. equipment.js의 frameOf는 ±2° 안의 축 정렬 인서트를 월드 상자로 재
// rot 0·가로세로 바꾼 크기로 세우는데, 그러면 앱 rot 90의 기구가 rot 0 · W↔D로 돌아온다(왕복 계약 위반).
function frame(segs, deg) {
  const a = deg * Math.PI / 180, u = [Math.cos(a), Math.sin(a)], v = [-u[1], u[0]], b = [Infinity, Infinity, -Infinity, -Infinity];
  for (const s of segs ?? []) for (const p of [s.a, s.b]) {
    const x = p[0] * u[0] + p[1] * u[1], y = p[0] * v[0] + p[1] * v[1];
    b[0] = Math.min(b[0], x); b[1] = Math.min(b[1], y); b[2] = Math.max(b[2], x); b[3] = Math.max(b[3], y);
  }
  if (!Number.isFinite(b[0]) || b[2] - b[0] < 1 || b[3] - b[1] < 1) return null;
  const cx = (b[0] + b[2]) / 2, cy = (b[1] + b[3]) / 2;
  return { c: [cx * u[0] + cy * v[0], cx * u[1] + cy * v[1]], w: b[2] - b[0], d: b[3] - b[1] };
}

// `EQ-` 인서트(explode의 inserts 한 칸) + 그 도형(insertParts의 segs) → { patch, v, pid } | null. equipment.js가 벽 자리·천장 z·후드 번호·통계를
// 다른 기구와 같은 길로 잇는다. 어휘·제외·크기 문턱을 건너뛴다 — 이름·크기·자리·제품을 그대로 세운다.
//  - 회전: explode의 rot(rotOf)은 x 배율이 음수(좌우 뒤집기)면 180°를 더한 값이다 — 빼고 앱 rot = −DXF rot(기둥과 같은 부호). 배율 부호 → flipH·flipV.
//  - 제품: `@` 뒤 id가 카탈로그에 있으면 그것, 없으면 '도면 기구'(일반 상자). dxfProduct = 그 제품(견적 0원 '도면 기구' 행 — estimate.isDrawnItem),
//    dxfBlock = EQ- 이름(교정 기록·같은 블록 고르기의 꼬리표). 꼬리 `!`(사람이 고른 제품)면 **둘 다** 두지 않는다 — 그 제품 가격(리뷰 I-2)이고,
//    사람이 놓은 아이템 그대로다(2026-10-13 · 최종 리뷰 X-1: dxfBlock을 두면 itemOps.sameItemIds가 가져온 기구로 보고 크기가 든 블록끼리만 묶어,
//    폭이 다른 2도어 냉장고 둘을 손으로 놓고 왕복하면 "같은 제품 선택"이 n = 1로 꺼졌다 · 교정 기록도 도면 기구로 셌다).
//  - 부착(사전 검토 I-6): 이름 본체의 어휘가 **그 제품을 가리키거나 제품이 일반 상자면** 어휘 — 처음 가져올 때 어휘가 정한 것이라 같은 답이 나온다
//    (워터릴 = 일반 상자 · 벽, 후드 = 천장). 어휘가 다른 제품을 가리키면 제품의 부착이다(사람이 놓은 '벽걸이 후드'가 이름의 '후드' 때문에 천장으로
//    가지 않게). 엑셀을 가리키는 어휘(legacy)는 가져오기가 그 어휘·크기·이름으로 고를 제품(kitchenFor)과 블록 제품이 같아도 어휘다(2026-10-20 · 계획 17
//    Task 8 Fix 1 — 크기로 다시 고른 손세정대·캐비닛이 어휘 대표와 달라 세면기 벽 z 800·상부장 벽 z 1500이 바닥으로 떨어졌다). 이름은 EQ- 본체와 ''(익명 블록은
//    이름 없이 골랐고 EQ- 본체는 그 제품 이름이다 — Fix 2: 이름이 있으면 정규식을 쓰지 않아 두 답이 다를 수 있다) 둘 다 본다. 위생 기구 묶음(maxLong 초과)은 처음처럼 바닥. 이름에 없는 부착은 잃는다: 익명 블록이 안쪽 글자로 얻은 벽 부착, 벽 띠 위에 그려
//    벽에 붙인 얇은 판넬 — 바닥으로 온다(2026-10-13 실측 사동 234개 중 3). 바닥 기구를 벽으로 옮기는 규칙은 두지 않는다(자동 이동 금지).
//  - z(리뷰 m-1): 벽·바닥·올려놓기는 삽입점 높이(it.z — 사람이 고친 z · 위 판넬의 z 900도 그대로), 천장은 equipment.js가 층고 − 높이로. it.z가 없으면
//    (explode를 거치지 않은 호출) 어휘·제품의 기본값.
//  - 이름: 본체가 제품 이름을 정리한 꼴과 같으면 제품 이름 그대로(`디퓨저 650×650`의 ×가 x로 바뀌어 이름 ≠ 제품명 → 라벨이 새로 서지 않게).
export function eqPlacement(it, segs, { toApp = p => p, sc = 1 } = {}) {
  const eq = parseEqBlock(it?.name);
  if (!eq) return null;
  const flipH = (it.scale?.[0] ?? 1) < 0, flipV = (it.scale?.[1] ?? 1) < 0;
  const deg = (it.rot ?? 0) - (flipH ? 180 : 0), f = frame(segs, deg);
  const k = Math.abs(it.scale?.[0] ?? 1) || 1, kv = Math.abs(it.scale?.[1] ?? 1) || 1;
  const size = [f ? f.w * sc : eq.size[0] * k * sc, f ? f.d * sc : eq.size[1] * kv * sc, eq.size[2] * sc].map(r0);
  const pid = productById(eq.productId) ? eq.productId : GEN, product = productById(pid);
  let v = matchEquip(eq.name);
  if (v && v.productId !== pid && pid !== GEN && !(v.legacy && [eq.name, ''].some(n => kitchenFor(v.legacy, size, n) === pid))) v = null;
  if (v?.maxLong && Math.max(size[0], size[1]) > v.maxLong) v = { productId: GEN, attach: 'floor', z: 0 };
  v ??= { productId: pid, attach: product.attach, z: product.zDefault ?? 0 };
  const attach = v.attach ?? product.attach, z = Number.isFinite(it.z) ? r0(it.z * sc) : attach === 'floor' ? 0 : v.z ?? 0;
  const patch = { name: !eq.name || eq.body === eqSafe(product.name) ? product.name : eq.name, ...(eq.priced ? {} : { dxfBlock: it.name, dxfProduct: pid }),
    pos: toApp(f?.c ?? it.pos).map(r0), rot: normDeg(-deg), size, attach, z: attach === 'ceiling' ? 0 : z, flipH, flipV };
  return { patch, v: { ...v, attach, z }, pid };
}

// EQ- 기구가 다시 앉을 벽: 기구 방향(rot)과 나란한 벽(± 1°)만. 왜: 내보낸 벽걸이 기구는 이미 벽 면에 앉아 rot이 그 벽 방향이다 — 모든 벽을 보면
// 구석에 앉은 기구를 직각 벽이 가로챘다(wallSeat는 간격이 가장 작은 벽을 고르는데, 직각 벽 띠에 파고든 음수 간격이 이긴다 — 2026-10-13 실측
// 사동 에어커튼 890×222가 90° 돌아 95 mm · 신상 A 배전함이 376 mm 옮겨졌다). 도면 블록(rot 0 = 방향 모름)은 이 거르기를 쓰지 않는다.
export const eqWalls = (walls, rot) => walls.filter(w => { const d = (((wallAxis(w).rot - rot) % 180) + 180) % 180; return Math.min(d, 180 - d) <= 1; });
