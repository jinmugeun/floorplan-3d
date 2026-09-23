// §16.6: 스냅 종류를 계산해 두고 쓰지 않던 것(감사 §42)을 커서 옆 마커로 보이게 한다.
// 캔버스 없이 가짜 ctx로 "무엇을 그렸나"만 본다(2D 그리기 테스트의 관례).
import { describe, test, expect } from 'vitest';
import { drawSnapMark, SNAP_GLYPH, SNAP_LABEL, MARK_OFFSET_PX } from '../src/view2d/snapMarks.js';

const fakeCtx = (clientWidth = 800) => {
  const calls = [];
  return {
    calls, canvas: { clientWidth, width: clientWidth },
    save() { calls.push(['save']); }, restore() { calls.push(['restore']); },
    fillRect(...a) { calls.push(['fillRect', ...a]); }, strokeRect(...a) { calls.push(['strokeRect', ...a]); },
    fillText(...a) { calls.push(['fillText', ...a]); }, measureText: t => ({ width: t.length * 7 }),
    set font(v) { calls.push(['font', v]); }, set fillStyle(v) { calls.push(['fillStyle', v]); },
    set strokeStyle(v) { calls.push(['strokeStyle', v]); }, set lineWidth(v) { calls.push(['lineWidth', v]); },
    set textAlign(v) { calls.push(['textAlign', v]); }, set textBaseline(v) { calls.push(['textBaseline', v]); },
  };
};
const view = { toScreen: p => [p[0] / 10, p[1] / 10], COLORS: { dim: '#1b2430', wallSel: '#14b8c4' } };

describe('스냅 마커', () => {
  test('§16.6이 정한 글리프와 라벨 그대로다', () => {
    expect(SNAP_GLYPH).toEqual({ point: '■', wall: '△', guide: '┆', align: '⋯', ortho: '⊾' });
    expect(SNAP_LABEL).toEqual({ point: '끝점', wall: '벽면', guide: '보조선', align: '정렬', ortho: '직교' });
    expect(MARK_OFFSET_PX).toBe(14);
  });

  test('hit이 있으면 커서 옆에 글리프 + 짧은 라벨을 그린다(소수 좌표)', () => {
    const ctx = fakeCtx();
    expect(drawSnapMark(ctx, view, { point: [1234.5, 890.25], hit: 'wall' })).toBe(true);
    const text = ctx.calls.find(c => c[0] === 'fillText');
    expect(text[1]).toBe('△ 벽면');
    expect(text[2]).toBeCloseTo(1234.5 / 10 + MARK_OFFSET_PX, 6);   // 커서 오른쪽으로 14 px
    expect(text[3]).toBeCloseTo(890.25 / 10, 6);
    expect(ctx.calls.some(c => c[0] === 'strokeRect')).toBe(true);   // 스냅 점 자체의 표시
    expect(ctx.calls.at(-1)[0]).toBe('restore');                     // 상태를 되돌린다
  });

  // 리뷰 M-16: 라벨이 언제나 커서 오른쪽에만 그려져 캔버스 우변에서 상자와 글자가 잘렸다.
  test('캔버스 우변에서는 커서 왼쪽에 그린다(리뷰 M-16)', () => {
    const ctx = fakeCtx(200);                                  // 200 px 폭
    expect(drawSnapMark(ctx, view, { point: [1950.5, 400.25], hit: 'point' })).toBe(true);   // x = 195.05 px
    const text = ctx.calls.find(c => c[0] === 'fillText');
    const align = ctx.calls.filter(c => c[0] === 'textAlign').at(-1);
    const box = ctx.calls.find(c => c[0] === 'fillRect');
    expect(align[1]).toBe('right');
    expect(text[2]).toBeCloseTo(195.05 - MARK_OFFSET_PX, 6);   // 커서 왼쪽으로 14 px
    expect(box[1]).toBeGreaterThanOrEqual(0);                  // 상자가 캔버스 안에 들어온다
    expect(box[1] + box[3]).toBeLessThanOrEqual(200);
    // 여유가 있으면 그대로 오른쪽이다.
    const ok = fakeCtx(800);
    drawSnapMark(ok, view, { point: [1950.5, 400.25], hit: 'point' });
    expect(ok.calls.filter(c => c[0] === 'textAlign').at(-1)[1]).toBe('left');
  });

  test('hit이 없거나 모르는 종류면 아무것도 그리지 않는다', () => {
    const ctx = fakeCtx();
    expect(drawSnapMark(ctx, view, null)).toBe(false);
    expect(drawSnapMark(ctx, view, { point: [0, 0], hit: null })).toBe(false);
    expect(drawSnapMark(ctx, view, { point: null, hit: 'point' })).toBe(false);
    expect(drawSnapMark(ctx, view, { point: [0, 0], hit: '엉뚱' })).toBe(false);
    expect(ctx.calls).toEqual([]);
  });
});
