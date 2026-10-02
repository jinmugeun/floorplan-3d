// 레이어를 **이름이 아니라 내용**으로 판정하는 근거(2026-10-02 · 다른 사무소 도면 신상중·내곡중).
// 이름 규칙(classify.LAYER_RULES)은 사무소마다 다른 이름 앞에서 무너진다 — 내곡중은 모든 선이 `건축` 한
// 레이어였고, 신상중의 창은 `WID`였다. 여기서 재는 것은 "이 레이어의 선이 벽·창틀처럼 생겼는가" 하나다:
// 같은 방향으로 tMin~bandGap만큼 떨어진 **평행 짝과 나란히 가는 길이**(벽의 두 면 · 창틀의 여러 겹).
// 이 수치만으로는 벽과 기구를 가르지 못한다(실측: 벽 94~98 % · 급식기구 85 % · 트렌치 100 %) — 그래서
// 이름이 아무것도 말하지 않는 레이어끼리 견줄 때만 쓴다.
import { buildFaces, mergeIv, ivLen } from './faces.js';
import { DXF_PARAMS } from './params.js';

// 한 레이어의 선분들 → 평행 짝과 나란히 가는 길이(mm). minSeg보다 짧은 선은 보지 않는다.
export function pairedLength(segs, P = DXF_PARAMS) {
  const long = segs.filter(s => Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1]) >= P.minSeg && !s.src?.endsWith(':bulge'));
  const bins = new Map();
  for (const f of buildFaces(long, P)) (bins.get(f.key) ?? bins.set(f.key, []).get(f.key)).push(f);
  let sum = 0;
  for (const faces of bins.values()) {
    faces.sort((a, b) => a.off - b.off);
    for (let i = 0; i < faces.length; i++) {
      const f = faces[i], cov = [];
      for (const dir of [-1, 1]) for (let j = i + dir; j >= 0 && j < faces.length; j += dir) {
        const g = faces[j], d = Math.abs(g.off - f.off);
        if (d > P.bandGap) break;
        if (d < P.tMin) continue;
        for (const [a, b] of f.intervals) for (const [c, e] of g.intervals) {
          const lo = Math.max(a, c), hi = Math.min(b, e);
          if (hi > lo) cov.push([lo, hi]);
        }
      }
      sum += ivLen(mergeIv(cov));
    }
  }
  return sum;
}

export const GUESS_SHARE = 0.25;        // 가장 벽다운 레이어의 이 비율 이상이면 함께 벽으로 올린다
export const GUESS_MIN_M = 5;           // 짝 길이가 이보다 짧으면 근거가 아니다(m)
export const CYAN = 4;                  // ACI 4 — 두 사무소의 창호 레이어 여섯이 모두 이 색이었다
export const CYAN_SHARE = 0.8;

// rows(layerStats가 만든 행)의 역할을 내용으로 고친다. segsOf(name) → 그 레이어의 선분들.
//  ① 청록 창호: 이름이 other · 선의 CYAN_SHARE 이상이 청록 · 평행 짝 ≥ GUESS_MIN_M → opening(byColor).
//  ② 벽 추정: 이름으로 벽인 켜진 레이어가 하나도 없으면, 이름이 other인 레이어 가운데 평행 짝이 가장 긴 것과
//     그 GUESS_SHARE 이상인 것들 → wall(guessed).
export function refineByContent(rows, segsOf, P = DXF_PARAMS) {
  const memo = new Map();
  const pairM = r => { if (!memo.has(r.name)) memo.set(r.name, pairedLength(segsOf(r.name), P) / 1000); return memo.get(r.name); };
  const usable = r => !r.off && r.segs > 0 && r.keyRole === 'other';
  for (const r of rows) {
    if (!usable(r) || (r.cyan ?? 0) / r.segs < CYAN_SHARE) continue;
    if (pairM(r) >= GUESS_MIN_M) { r.role = 'opening'; r.byColor = true; }
  }
  if (rows.some(r => r.role === 'wall' && !r.off && r.segs > 0)) return rows;
  const cand = rows.filter(r => usable(r) && (r.role === 'other' || r.role === 'hatch')).map(r => [r, pairM(r)]);
  const top = Math.max(0, ...cand.map(([, m]) => m));
  for (const [r, m] of cand) if (m >= GUESS_MIN_M && m >= GUESS_SHARE * top) { r.role = 'wall'; r.guessed = true; }
  return rows;
}
