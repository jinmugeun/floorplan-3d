// 모형 공간의 도면 후보(2026-10-02). 한 파일에 도면이 여러 벌 들어 있을 수 있다 — 실파일 신상중은 같은 건물의
// 두 안(168석 · 196석)이 나란히 있었고, "선 길이 합이 가장 큰 덩어리"가 급식기구가 그려진 쪽을 **조용히** 골랐다.
// 여기서는 고르지 않고 **후보를 모두 낸다**: 이어진 선 덩어리(faces.clusters) 가운데 벽 레이어 선이 충분히 든 것.
// 도면틀·범례·기호 덩어리는 벽 선이 없어 후보가 아니다. 무엇을 가져올지는 검토 창에서 사람이 정한다.
import { clusters, ROI_LINK } from './faces.js';

export const REGION_SHARE = 0.25;      // 벽 선이 가장 많은 후보의 이 비율 미만이면 상세도·범례다
const HINTS = 2;                       // 후보를 구별해 주는 문자를 몇 개까지 보여 줄지

// segs: 켜진 레이어의 선분. wallLayers: 벽으로 체크된 레이어. texts: 전개된 문자(꺼진 레이어 포함).
// → [{ x0, y0, x1, y1, n, len, wallLen, hint }] — 선 길이 합 내림차순(첫 후보 = 예전의 "가장 큰 덩어리").
// 벽 레이어를 모르면(추정 모드) 가장 큰 덩어리 하나만 낸다.
export function planRegions(segs, wallLayers, texts = [], { link = ROI_LINK, share = REGION_SHARE } = {}) {
  const { list, of } = clusters(segs, link);
  if (!list.length) return [];
  const wallLen = new Float64Array(list.length);
  segs.forEach((s, i) => { if (of[i] >= 0 && wallLayers.has(s.layer)) wallLen[of[i]] += Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1]); });
  const top = Math.max(...wallLen);
  const picked = top > 0 ? list.map((c, i) => ({ ...c, wallLen: wallLen[i] })).filter(c => c.wallLen >= share * top) : [{ ...list[0], wallLen: 0 }];
  // 힌트: 그 후보의 상자 안에만 있는 문자(다른 후보에도 있는 "조리실"은 구별해 주지 못한다) — 큰 글자부터.
  const inside = (c, p) => p[0] >= c.x0 && p[0] <= c.x1 && p[1] >= c.y0 && p[1] <= c.y1;
  const norm = t => String(t.text ?? '').replace(/\s+/g, ' ').trim();
  const sets = picked.map(c => { const m = new Map(); for (const t of texts) { const s = norm(t); if (s && inside(c, t.p)) m.set(s, Math.max(m.get(s) ?? 0, t.h ?? 0)); } return m; });
  return picked.map((c, i) => {
    const own = [...sets[i]].filter(([s]) => picked.length > 1 && !sets.some((m, j) => j !== i && m.has(s)));
    own.sort((a, b) => b[1] - a[1] || b[0].length - a[0].length);
    return { ...c, hint: own.slice(0, HINTS).map(([s]) => s).join(' · ') };
  });
}
