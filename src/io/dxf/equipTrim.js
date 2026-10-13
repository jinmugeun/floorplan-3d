// 기둥 접촉 기구 깎기(2026-10-13 · 계획 14 Task A). 왜: 가져온 직후 배너 "충돌 28건"(사동중)의 16 id가 기둥–기구 8쌍이었고, 그중 7쌍은 도면이
// 기구를 기둥 면에 딱 붙여 그린 작도 오차(4~47 mm — 워터릴·손세정대·다단식선반·익명 500×400 · 계획 13 Task 3 리뷰 실측)였다. 사람이 옮길 일이
// 아닌데 빨간 테두리로 남아 끊긴 끝점 안내의 자리를 차지했다(내곡도 To청소대A 20 mm 하나로 "충돌 2건").
// 규칙: 축 정렬(rot ≈ 0·90·180·270) **바닥** 기구의 상자가 축 정렬 기둥 상자와 겹치면, x·y 겹침 깊이 중 작은 쪽이 P.equipTrim 이하일 때 그 축의
// **기둥 쪽 변만** 깊이만큼(올림 — 크기는 mm 정수) 깎는다. 먼 변은 도면 자리 그대로라 중심이 깊이/2만큼 기둥에서 멀어진다 — 계획 13 사전 검토 5의
// "자동 이동 금지"는 그대로다(자리를 고르지 않고 그린 상자를 기둥 면에서 자를 뿐). 두 기둥 사이에 낀 기구는 기둥마다 차례로 양쪽을 다 깎는다.
// 손대지 않는 것: 작은 쪽 깊이도 equipTrim을 넘는 진짜 겹침(사동 기둥을 감싼 5,000×1,467 카운터 264 mm — 그린 대로 두고 사람이 본다) ·
// 깎으면 그 칸이 P.equipMin 아래가 되는 것(그만큼 작은 기구가 기둥에 깊이 든 것은 접촉이 아니다) · 벽 부착·천장(collide.js는 바닥 아이템끼리만
// 충돌로 센다) · 축이 아닌 기구·기둥(상자 변이 축과 나란하지 않아 "그쪽 변"이 없다).
// equipment.js(이미 241줄 · 계획 14 Task E·F도 손댄다)에서 떼어 둔 모듈이다. 워커의 import 사슬이라 DOM을 건드리지 않는다.
import { itemAABB } from '../../geom/items.js';
import { DXF_PARAMS } from './params.js';

const AXIS = 0.5;   // °: rot이 90의 배수에서 이 안이면 축 정렬(기구 배치는 축 정렬 인서트를 rot 0으로 세우고 아닌 것은 ±2° 밖 · 기둥은 0·90·180·270)
const EPS = 1e-6;   // mm: 기둥 귀의 부동소수 흔들림(cos 90° ≈ 6e-17)이 10 mm를 11 mm로 올리지 않게
const TOUCH = 1;    // mm: 이 이하 겹침은 맞닿음이다 — collide.js collidingIds의 tol(1)과 같아야 "빨간 것만 깎는다"가 된다

// rot → 0(월드 x = size[0]) · 1(월드 x = size[1] — 90°·270°) · −1(축 아님).
function quarter(rot) {
  const r = (((Number(rot) || 0) % 360) + 360) % 360, q = Math.round(r / 90);
  return Math.abs(r - q * 90) <= AXIS ? q % 2 : -1;
}

// → { items, trimmed }. items = 같은 순서의 새 배열(깎인 것만 새 객체 — 원 아이템은 바꾸지 않는다, dxfBlock·dxfProduct 등 다른 칸은 그대로),
// trimmed = 깎인 아이템 수. columns = 앱 좌표 기둥 아이템(toProject의 colItems).
export function trimToColumns(items, columns, P = DXF_PARAMS) {
  const cols = (columns ?? []).filter(c => quarter(c.rot) >= 0).map(c => itemAABB(c));
  let trimmed = 0;
  const out = (items ?? []).map(it => {
    const q = it.attach === 'floor' && cols.length ? quarter(it.rot) : -1;
    if (q < 0) return it;
    const ext = q ? [it.size[1], it.size[0]] : [it.size[0], it.size[1]];
    const lo = [it.pos[0] - ext[0] / 2, it.pos[1] - ext[1] / 2], hi = [it.pos[0] + ext[0] / 2, it.pos[1] + ext[1] / 2];
    let cut = false;
    for (const c of cols) {
      const o = [0, 1].map(k => Math.min(hi[k], c.max[k]) - Math.max(lo[k], c.min[k]));
      if (o[0] <= TOUCH || o[1] <= TOUCH) continue;                // 떨어졌거나 맞닿음(충돌 아님 — 깎을 까닭이 없다)
      const k = o[0] <= o[1] ? 0 : 1, d = o[k];
      if (d > P.equipTrim + EPS) continue;                         // 두 축 다 깊다 — 진짜 겹침
      // 기둥이 덮은 끝: 위 끝(hi)만 덮으면 hi를, 아래 끝(lo)만 덮으면 lo를 깎는다. 둘 다(기구가 기둥 안)·어느 쪽도 아니면(기둥이 기구 안) 변이 없다.
      const atHi = c.min[k] > lo[k] && c.max[k] >= hi[k], atLo = c.max[k] < hi[k] && c.min[k] <= lo[k];
      const step = Math.ceil(d - EPS);
      if (atHi === atLo || hi[k] - lo[k] - step < P.equipMin) continue;
      if (atHi) hi[k] -= step; else lo[k] += step;
      cut = true;
    }
    if (!cut) return it;
    trimmed++;
    const w = hi[0] - lo[0], h = hi[1] - lo[1];
    // || 0: −0을 접는다(toEqual이 −0과 +0을 가른다 — equipment.js r0와 같은 까닭).
    return { ...it, pos: [(lo[0] + hi[0]) / 2 || 0, (lo[1] + hi[1]) / 2 || 0], size: q ? [h, w, it.size[2]] : [w, h, it.size[2]] };
  });
  return { items: out, trimmed };
}
