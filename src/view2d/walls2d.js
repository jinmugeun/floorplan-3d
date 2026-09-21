// 2D 평면의 벽 그리기(§14.4). 지금까지 2D는 wallPolygon을 통째로 칠해서 문·창이 벽을 뚫지 않았고
// (개구부 절단이 view3d/build.js에만 있었다) 여닫이문의 호만 벽 바깥에 떠 있었다.
// 같은 geom/openings.js를 써서 평면에서도 개구부 자리를 비운다 — 겹치는 개구부의 합집합 규칙과
// 접합 벽의 연장분이 3D와 한 곳에서 온다. 미니맵·캡처는 같은 createView2D를 쓰므로 함께 바뀐다.
import { wallPolygon, wallLength } from '../geom/walls.js';
import { openingsOnWall, wallPieces } from '../geom/openings.js';
import { wallAxis } from '../geom/items.js';
import { add, mul, eq } from '../geom/vec.js';
import { itemVisible } from './items2d.js';

export const GLASS_DIV = 6;   // 창 유리선은 벽 두께의 1/6만큼 중심선에서 벌어진다

// 벽 축 u 좌표의 범위. 접합 벽이 있는 끝은 두께/2만큼 연장한다(wallPolygon·build.js와 같은 규칙).
export function wallRange(wall, walls = []) {
  const joined = q => (walls ?? []).some(o => o.id !== wall.id && (eq(o.a, q) || eq(o.b, q)));
  return {
    start: joined(wall.a) ? -wall.thickness / 2 : 0,
    end: wallLength(wall) + (joined(wall.b) ? wall.thickness / 2 : 0),
  };
}

// 개구부를 뺀 조각의 u 구간. 평면도는 벽을 위에서 내려다본 그림이라 개구부의 높이(sill·lintel)는
// 뜻이 없다: 개구부의 z 구간을 벽 전체 높이로 눌러 wallPieces에 넘기면 창 밑·문 위 조각이 생기지
// 않고 좌·우 조각만 남는다(= u 구간만 비운 것과 같다).
// openings를 주면 그 벽의 개구부를 다시 구하지 않는다(그리는 쪽이 이미 한 번 구했다 — m-1).
// 그때는 items 필터도 부르는 쪽이 이미 지난 것으로 본다.
export function wallSpans(wall, walls = [], items = [], { flags = null, openings = null } = {}) {
  const { start, end } = wallRange(wall, walls);
  // 보기 옵션으로 문·창·개구부를 숨겼으면 평면도 끊지 않는다(심벌은 없는데 구멍만 남으면
  // 도면을 잘못 읽는다 — 결정 38). flags를 주지 않으면 예전처럼 hidden만 본다.
  const shownItem = it => !flags || itemVisible(it, flags);
  const found = openings ?? openingsOnWall(items.filter(shownItem), wall);
  const holes = found.map(o => ({ ...o, z0: 0, z1: wall.height }));
  return wallPieces(wall, holes, { start, end }).map(({ u0, u1 }) => ({ u0, u1 }));
}

// u 구간 하나를 월드 사각형으로(벽 중심선 기준 양쪽 두께/2).
export function spanQuad(wall, { u0, u1 }) {
  const { dir, n } = wallAxis(wall);
  const h = wall.thickness / 2;
  const p0 = add(wall.a, mul(dir, u0)), p1 = add(wall.a, mul(dir, u1));
  return [add(p0, mul(n, h)), add(p1, mul(n, h)), add(p1, mul(n, -h)), add(p0, mul(n, -h))];
}

// 창 자리: 벽 두께 안쪽에 유리 두 줄 + 양끝 짧은 선. 문은 빈 자리만 남긴다(여닫이 호는 items2d의
// 심벌이 이미 그린다), 개구부(opening-pass)도 빈 자리만이다.
function drawWindow(ctx, v, wall, o) {
  const { dir, n } = wallAxis(wall);
  const h = wall.thickness / 2, g = wall.thickness / GLASS_DIV;
  const at = u => add(wall.a, mul(dir, u));
  const line = (a, b) => { const s0 = v.toScreen(a), s1 = v.toScreen(b); ctx.moveTo(s0[0], s0[1]); ctx.lineTo(s1[0], s1[1]); };
  ctx.save();
  ctx.beginPath();
  for (const s of [g, -g]) line(add(at(o.u0), mul(n, s)), add(at(o.u1), mul(n, s)));
  for (const u of [o.u0, o.u1]) line(add(at(u), mul(n, h)), add(at(u), mul(n, -h)));
  ctx.strokeStyle = v.COLORS.wall; ctx.lineWidth = 1; ctx.stroke();
  ctx.restore();
}

// 개구부(opening-pass)는 빈 자리만 남아 선택 전에는 아무 표시가 없었다(계획 6 이월 · §15.14).
// 오늘의집처럼 점선 테두리를 둘러 "여기가 통로"라는 것을 보이게 한다 — 벽을 다시 칠하지는
// 않으므로 평면의 뜻(벽이 없다)은 그대로다.
function drawPass(ctx, v, wall, o) {
  ctx.save();
  ctx.setLineDash([6, 4]);
  v.poly(spanQuad(wall, { u0: o.u0, u1: o.u1 }), null, v.COLORS.wall, 1);
  ctx.setLineDash([]);
  ctx.restore();
}

// 벽마다 조각을 칠한다. 선택된 벽은 조각이 아니라 원래 사각형을 통짜로 강조한다(§14.4):
// 클릭 대상이 벽 전체(hitWall)이므로 강조도 벽 전체여야 한다.
export function drawWalls(ctx, v, floor, { sel = null, soloWalls = null, flags = {} } = {}) {
  const items = floor.items ?? [];
  // 프레임마다 벽 하나당 items.filter와 openingsOnWall을 두 번씩 돌고, 개구부마다 items.find로
  // 선형 탐색했다 — 벽 200·아이템 500 도면이면 프레임당 20만 번이 된다(m-1). 보이는 아이템과
  // id 색인은 루프 밖에서 한 번 만들고, 개구부는 벽마다 한 번만 구해 wallSpans에 넘긴다.
  const shown = items.filter(it => itemVisible(it, flags));
  const byId = new Map(items.map(it => [it.id, it]));
  for (const wl of floor.walls ?? []) {
    ctx.globalAlpha = soloWalls && !soloWalls.has(wl.id) ? 0.25 : 1;
    if (sel?.type === 'wall' && sel.id === wl.id) {
      v.poly(wallPolygon(wl, floor.walls), v.COLORS.wallSel, null);
      ctx.globalAlpha = 1;
      continue;
    }
    const holes = openingsOnWall(shown, wl);
    for (const span of wallSpans(wl, floor.walls, shown, { flags, openings: holes })) v.poly(spanQuad(wl, span), v.COLORS.wall, null);
    for (const o of holes) {
      const kind = byId.get(o.itemId)?.kind;
      if (kind === 'window') drawWindow(ctx, v, wl, o);
      else if (kind === 'opening') drawPass(ctx, v, wl, o);   // §15.14: 통로는 점선 테두리
    }
    ctx.globalAlpha = 1;
  }
}
