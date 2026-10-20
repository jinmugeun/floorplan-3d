// 급식실 룩 측정의 순수 부분(계획 17 Task 1). probe.mjs가 쓰고 tests/lookProbe.test.js가 잰다.
export const median = a => { const s = a.filter(Number.isFinite).sort((x, y) => x - y); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : NaN; };
export const p90 = a => { const s = a.filter(Number.isFinite).sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(s.length * 0.9))] : NaN; };
export const FRAME_FLOOR_MS = 16.7, FRAME_RATIO = 1.5;

// 회마다 잰 값 → 중앙값 묶음.
export function summarize(runs) {
  const r1 = x => (Number.isFinite(x) ? Math.round(x * 10) / 10 : null);
  return {
    firstMs: r1(median(runs.map(r => r.firstMs))), firstDraws: median(runs.map(r => r.firstDraws)),
    orbitGapMs: r1(median(runs.map(r => r.orbitGapMs))), orbitP90Ms: r1(median(runs.map(r => r.orbitP90Ms))), draws: median(runs.map(r => r.draws)),
    errors: runs.reduce((a, r) => a + r.errors.length, 0), runs: runs.length,
  };
}

// 게이트(계획 17 Global Constraints): 궤도 간격 중앙값 ≤ max(기준 × 1.5, 16.7 ms) · 페이지 오류 0. 기준이 없으면 오류·값 유무만 본다.
export function probeVerdict(base, now) {
  const problems = [];
  if (!Number.isFinite(now?.orbitGapMs)) problems.push('궤도 값 없음');
  if (now?.errors) problems.push(`페이지 오류 ${now.errors}건`);
  const limit = base && Number.isFinite(base.orbitGapMs) ? Math.max(base.orbitGapMs * FRAME_RATIO, FRAME_FLOOR_MS) : null;
  if (limit !== null && Number.isFinite(now?.orbitGapMs) && now.orbitGapMs > limit) problems.push(`궤도 ${now.orbitGapMs} ms > 한도 ${Math.round(limit * 10) / 10} ms`);
  return { ok: problems.length === 0, limit, problems };
}
