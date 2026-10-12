// 벽 띠 스윕의 ⑤ 단계 — 한 줄(chain)의 구간화(sectionsOf)와 한 bin의 run → 구간·꺾임·틈(wallsOfRuns).
// 2026-10-12 · 300줄 예산 · 계획 12 Task 0: bands.js(①~④와 same·compatible·chainRuns)에서 그대로 옮겼다(동작 불변).
// bands.js가 두 이름을 다시 내보내므로 walls.js·테스트의 import 경로는 그대로다. 좌표는 bands.js와 같은 bin의 (t, off)다.
import { DXF_PARAMS } from './params.js';
import { same, compatible, chainRuns } from './bands.js';

// ⑤ 한 줄의 구간화(2026-09-29 감사 — 실파일 식당 서쪽 벽은 위·아래 405 mm, 가운데 320 mm였고 한 띠를 벽 전체에
// 씌우면 가운데가 92 mm 비껴 섰다). 먼저 **두께 변화가 아닌 것**을 이웃 띠로 되돌린다:
//  - 벽기둥 부풂: bandBreak보다 짧고 이웃 띠를 품는 구간(기둥 면이 띠를 넓혔다).
//  - 창·문틀·바깥선만 남은 구간: **양쪽**에 자기를 품는 run이 있는 구간(개구부 자리 — 오른쪽 외벽이 이 모양이다).
// 그다음 띠가 같은 이웃끼리 한 구간으로 합치고(길이 가중 평균), 남은 경계는 진짜 두께 변화다:
//  - 경계 사이의 틈(문)은 **얇은 쪽** 구간이 가진다(문틀은 벽의 몸통에 선다).
//  - 두 중심이 jogTol보다 벌어지면 경계에 꺾임(jog)을 두고, 그 안이면 한 중심선으로 맞춘다.
//  - 창·문 블록 도중의 경계(2026-10-06 · spans = bin 좌표의 블록 구간 [{ x0, x1, o0, o1 }]): 경계가 블록 안쪽이고 블록의 오프셋 범위가
//    양쪽 띠와 의미 있게 겹치면(spanOverlap · 최종 리뷰) 경계를 가까운 블록 끝으로 옮긴다(양쪽 구간이 minWall을 지키는 끝 · 둘 다 되면
//    가까운 쪽 · 같으면 x0). 창이 짧은 구간에 앉아 벽 끝에서 잘리던 것(사동중 4800 창·스테인리스 벽 뒤 창)을 막는다. 틈은 옮기기 전 구간으로 센다.
// 반환: sections [{ t0, t1, lo, hi }] · jogs [{ t, c0, c1, th }] · gaps [{ t, off, width, t0, t1, lo, hi }] (bin 좌표).
const contains = (A, B) => A.lo <= B.lo + 10 && A.hi >= B.hi - 10;
export function sectionsOf(chain, P = DXF_PARAMS, spans = []) {
  const rs = chain.map(r => ({ ...r }));
  const adopt = (r, x) => { if (r.lo === x.lo && r.hi === x.hi) return false; r.lo = x.lo; r.hi = x.hi; return true; };
  const longer = (a, b) => (a.t1 - a.t0 >= b.t1 - b.t0 ? a : b);
  // r을 품는 가장 가까운 run(dir 방향). 사이에 건너뛴 run들도 모두 그 띠에 품겨야 한다(연달아 붙은 창 구간).
  const hostOn = (i, dir) => {
    const r = rs[i];
    for (let k = i + dir; k >= 0 && k < rs.length; k += dir) {
      const x = rs[k];
      if ((dir > 0 ? x.t0 - r.t1 : r.t0 - x.t1) > 2 * P.bridge) return null;
      if (!contains(x, r) || contains(r, x)) continue;
      for (let j = i + dir; j !== k; j += dir) if (!contains(x, rs[j])) return null;
      return x;
    }
    return null;
  };
  for (let pass = 0; pass < 4; pass++) {
    let changed = false;
    rs.forEach((r, i) => {
      const hugs = [rs[i - 1], rs[i + 1]].filter(x => x && !x.op && contains(r, x) && !contains(x, r));   // 창틀 run은 벽 띠가 아니다
      if (r.t1 - r.t0 < P.bandBreak && hugs.length) { changed = adopt(r, hugs.reduce(longer)) || changed; return; }
      const L = hostOn(i, -1), R = hostOn(i, 1);
      if (L && R) { changed = adopt(r, longer(L, R)) || changed; return; }
      // 창틀만 남은 run(op)은 창틀이 벽 면 밖으로 조금 삐져나와 품기지 않아도 겹치는 이웃 벽 run 중 긴 쪽을 따른다
      // (2026-09-30 영양상담실 벽: 창틀 11 mm 돌출로 창 900 자리가 제 두께의 벽 토막이 됐다).
      const near = r.op ? [rs[i - 1], rs[i + 1]].filter(x => x && !x.op && compatible(x, r, P)) : [];
      if (near.length) changed = adopt(r, near.reduce(longer)) || changed;
    });
    if (!changed) break;
  }
  const secs = [];
  for (const r of rs) {
    const s = secs[secs.length - 1];
    if (s && same(s, r, P)) {
      const wa = s.w, wb = r.t1 - r.t0;
      s.lo = (s.lo * wa + r.lo * wb) / (wa + wb); s.hi = (s.hi * wa + r.hi * wb) / (wa + wb);
      s.w = wa + wb; s.parts.push(r); s.t1 = r.t1;
    } else secs.push({ t0: r.t0, t1: r.t1, lo: r.lo, hi: r.hi, w: r.t1 - r.t0, parts: [r] });
  }
  const gaps = [];
  const gapOf = (t0, t1, s) => { if (t1 - t0 >= P.gapMin) gaps.push({ t: (t0 + t1) / 2, off: (s.lo + s.hi) / 2, width: t1 - t0, t0, t1, lo: s.lo, hi: s.hi }); };
  for (const s of secs) for (let k = 1; k < s.parts.length; k++) gapOf(s.parts[k - 1].t1, s.parts[k].t0, s);
  const jogs = [];
  for (let k = 1; k < secs.length; k++) {
    const a = secs[k - 1], b = secs[k];
    const thin = a.hi - a.lo <= b.hi - b.lo ? a : b;
    gapOf(a.t1, b.t0, thin);
    let t = thin === a ? b.t0 : a.t1;
    const lo = Math.min(a.lo, b.lo), hi = Math.max(a.hi, b.hi);
    // 2026-10-06 최종 리뷰: 겹침 ≥ spanOverlap × min(얇은 띠 두께, 블록 깊이)일 때만 옮긴다 — "조금이라도 겹치면"이면 벽에 수직으로 그린
    // 문 상자(문틀 + 문짝 + 궤적 ≈ 폭 × 폭)가 띠를 몇 mm 스쳐도 경계가 450 mm 옮겨졌다(재현 · 내곡중 11 mm 스침). 내곡중 FSD800(100 mm / 250 띠)은 옮긴다.
    const thinTh = Math.min(a.hi - a.lo, b.hi - b.lo);
    const span = spans.find(s => {
      if (!(s.x0 + P.spanEdge < t && t < s.x1 - P.spanEdge)) return false;
      const overlap = Math.min(s.o1, hi) - Math.max(s.o0, lo);
      return overlap > 0 && overlap >= P.spanOverlap * Math.min(thinTh, s.o1 - s.o0);
    });
    if (span) {
      const ok = x => x - a.t0 >= P.minWall && b.t1 - x >= P.minWall;
      const ends = [span.x0, span.x1].filter(ok).sort((x, y) => Math.abs(x - t) - Math.abs(y - t) || x - y);
      if (ends.length) t = ends[0];
    }
    a.t1 = t; b.t0 = t;
    const ca = (a.lo + a.hi) / 2, cb = (b.lo + b.hi) / 2;
    if (Math.abs(ca - cb) <= P.jogTol) { b.lo += ca - cb; b.hi += ca - cb; }
    else jogs.push({ t, c0: ca, c1: cb, th: Math.min(a.hi - a.lo, b.hi - b.lo) });
  }
  return { sections: secs.map(({ t0, t1, lo, hi }) => ({ t0, t1, lo, hi })), jogs, gaps };
}

// 한 bin의 run들 → 구간·꺾임·틈(④ + ⑤). evidence는 chainRuns로, spans(창·문 블록 구간)는 sectionsOf로 간다.
export function wallsOfRuns(runs, P = DXF_PARAMS, evidence = null, spans = []) {
  const out = { sections: [], jogs: [], gaps: [], chains: 0 };
  for (const chain of chainRuns(runs, P, evidence)) {
    const r = sectionsOf(chain, P, spans);
    out.sections.push(...r.sections.map(s => ({ ...s, chain: out.chains })));
    out.jogs.push(...r.jogs);
    out.gaps.push(...r.gaps);
    out.chains++;
  }
  return out;
}
