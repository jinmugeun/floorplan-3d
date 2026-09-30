// 긴 연장·다리의 근거(src/io/dxf/evidence.js · 2026-09-30). 합성 선분으로 규칙 하나하나를 못 박는다.
import { test, expect } from 'vitest';
import { openingEvidence, faceSupport } from '../src/io/dxf/evidence.js';

const seg = (x0, y0, x1, y1, layer = 'WAL', block = '1f plan-1') => ({ a: [x0, y0], b: [x1, y1], layer, block, src: 'LINE' });
const exOf = (segs, arcs = []) => ({ segs, arcs, polyArcs: [] });
const all = () => true;
const OPEN = new Set(['WIN']);
// 길: (0, 0) → (0, 3000), 벽 두께 200 → 반폭 200/2 + 100
const path = [[0.5, 0.25], [0.5, 3000.25], 200];

test('개구부 레이어 선이나 창·문 이름 블록의 선이 길 안에 있으면 근거다', () => {
  expect(openingEvidence(exOf([seg(-50.5, 1500.25, 50.5, 1500.25, 'WIN')]), OPEN, all)(...path)).toBe(true);
  // 레이어가 벽이어도 문 블록(dr-1850 · 문_슬라이딩 포켓 900)의 선이면 근거다
  expect(openingEvidence(exOf([seg(0.5, 900.25, 0.5, 1700.25, 'WID', 'dr-1850')]), OPEN, all)(...path)).toBe(true);
  expect(openingEvidence(exOf([seg(0.5, 900.25, 0.5, 1700.25, '기존', '문_슬라이딩 포켓 900')]), OPEN, all)(...path)).toBe(true);
  // 길 옆(반폭 200 밖)이나 길 끝 너머의 선은 근거가 아니다
  const ev = openingEvidence(exOf([seg(400.5, 1500.25, 900.5, 1500.25, 'WIN'), seg(0.5, 3200.25, 0.5, 3900.25, 'WIN')]), OPEN, all);
  expect(ev(...path)).toBe(false);
});

// 실파일 세척실 날개벽: 길 안의 호 둘은 급식기구(설비) 레이어였다 — 레이어·블록을 가리지 않고 호를 세면 없는 벽이 선다.
test('설비 레이어의 호는 근거가 아니고, 개구부 레이어·문 블록의 호는 근거다', () => {
  const arc = (layer, block) => ({ c: [0.5, 1500.25], r: 900, a0: 0, a1: Math.PI / 2, layer, block });
  const equip = openingEvidence(exOf([seg(9000.5, 0.25, 9900.5, 0.25, 'WIN')], [arc('급식기구', '500인-')]), OPEN, all);
  expect(equip(...path)).toBe(false);
  expect(openingEvidence(exOf([], [arc('기존', 'DR-900')]), OPEN, all)(...path)).toBe(true);
  expect(openingEvidence(exOf([], [arc('WIN', 'x')]), OPEN, all)(...path)).toBe(true);
});

test('문·창 근거가 하나도 없는 도면은 가릴 수 없어 null이다', () => {
  expect(openingEvidence(exOf([seg(0.5, 0.25, 900.5, 0.25)]), new Set(), all)).toBe(null);
  // ROI 밖의 근거만 있어도 같다
  expect(openingEvidence(exOf([seg(0.5, 0.25, 900.5, 0.25, 'WIN')]), OPEN, () => false)).toBe(null);
});

test('벽 선이 길과 나란히 벽 두께 안에서 길의 절반 이상을 덮으면 받친다', () => {
  const on = faceSupport([seg(100.5, -100.25, 100.5, 1700.25)]);          // 오프셋 100 ≤ 100 + 30, 1.7 m / 3 m
  expect(on(...path)).toBe(true);
  expect(faceSupport([seg(100.5, 0.25, 100.5, 1200.25)])(...path)).toBe(false);       // 1.2 m — 절반 미만
  expect(faceSupport([seg(200.5, 0.25, 200.5, 3000.25)])(...path)).toBe(false);       // 오프셋 200 — 두께 밖
  expect(faceSupport([seg(-600.5, 1000.25, 600.5, 1000.25)])(...path)).toBe(false);   // 가로지르는 선은 받침이 아니다
  // 조각 여럿이 합쳐 절반을 넘어도 받친다(겹친 구간은 한 번만 센다)
  expect(faceSupport([seg(100.5, 0.25, 100.5, 1000.25), seg(100.5, 800.25, 100.5, 1300.25), seg(-80.5, 2000.25, -80.5, 2400.25)])(...path)).toBe(true);
});
