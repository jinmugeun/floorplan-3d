// 점수판 기구 열(tools/dxf-corpus/lib.mjs · 2026-10-12 계획 13 Task 4): equip·equipProd·equipClash는 정답 없는 회귀 지표이고,
// 사동중 급식 구역 손 정답(truth/sadong-equip.json)으로 equipHit — 정답 몸체 중심에서 가장 가까운 기구 아이템이 200 mm 안이고 긴 변이 ±20 % 안인 수 — 를 잰다.
import { test, expect } from 'vitest';
import { equipScore, equipTruth, EQUIP_TOL, EQUIP_SIZE, WORSE } from '../tools/dxf-corpus/lib.mjs';

const same = p => p;
const eq = (pos, size, extra = {}) => ({ productId: 'equip-generic', dxfBlock: 'B', pos, size: [...size, 850], ...extra });

test('문턱: 중심 200 mm · 긴 변 ±20 %', () => {
  expect([EQUIP_TOL, EQUIP_SIZE]).toEqual([200, 0.2]);
});

test('가장 가까운 기구 아이템이 200 mm 안이고 긴 변이 ±20 % 안이면 적중 — 방향은 보지 않는다(긴 변끼리)', () => {
  const truth = [{ name: '세정대 2조 1500-750', c: [0, 0], size: [1500, 750] }];
  expect(equipScore(truth, [eq([120, 160], [750, 1500])], same).hit).toBe(1);   // 거리 200(경계) · 로컬 축이 돌아 있어도 긴 변 1500
  expect(equipScore(truth, [eq([150, 150], [750, 1500])], same).hit).toBe(0);   // 거리 212
  expect(equipScore(truth, [eq([0, 0], [1800, 750])], same).hit).toBe(1);       // +20 % 경계
  expect(equipScore(truth, [eq([0, 0], [1810, 750])], same).hit).toBe(0);
  expect(equipScore(truth, [eq([0, 0], [1200, 750])], same).hit).toBe(1);       // −20 % 경계
  expect(equipScore(truth, [eq([0, 0], [1190, 750])], same).hit).toBe(0);
  expect(equipScore(truth, [], same)).toEqual({ hit: 0, rows: [{ name: '세정대 2조 1500-750', ok: false, d: null, got: null, long: null, want: 1500 }] });
});

test('기구 아이템(dxfBlock이 있는 것)만 본다 — 같은 자리의 문·창·기둥은 맞히지 못한다', () => {
  const truth = [{ name: '워터릴', c: [0, 0], size: [540, 300] }];
  const door = { productId: 'door-single', pos: [0, 0], size: [540, 100, 2100] }, col = { kind: 'column', productId: 'column-box', pos: [0, 0], size: [540, 540, 3000] };
  expect(equipScore(truth, [door, col], same).hit).toBe(0);
  expect(equipScore(truth, [door, col, eq([0, 50], [540, 420], { dxfBlock: '워터릴' })], same).rows[0]).toEqual({ name: '워터릴', ok: true, d: 50, got: '워터릴', long: 540, want: 540 });
});

test('가장 가까운 것만 본다 — 국솥 위 후드(중심 120 mm · 긴 변 +18 %)가 틀린 크기의 국솥 대신 맞히지 않는다', () => {
  const truth = [{ name: '회전국솥 1520-1120-850', c: [0, 0], size: [1520, 1120] }];
  const hood = eq([120, 0], [1800, 1500], { productId: 'hood-box', dxfBlock: 'zw$E75B' });
  expect(equipScore(truth, [hood, eq([10, 0], [3000, 1120], { dxfBlock: '회전국솥' })], same).hit).toBe(0);
  expect(equipScore(truth, [hood, eq([10, 0], [1520, 1120], { dxfBlock: '회전국솥' })], same).hit).toBe(1);
});

test('정답 중심(원 DXF 좌표)은 toApp으로 옮겨 잰다 — y 뒤집기 포함', () => {
  const toApp = p => [p[0] - 1000, -(p[1] - 2000)];
  const truth = [{ name: 'a', c: [1000, 2150], size: [900, 600] }];       // → 앱 (0, −150)
  expect(equipScore(truth, [eq([0, -150], [900, 600])], toApp).hit).toBe(1);
  expect(equipScore(truth, [eq([0, 150], [900, 600])], toApp).hit).toBe(0);   // 뒤집지 않은 자리는 300 mm
});

test('사동중 손 정답: 20개 · 이름 · 원 DXF 중심 · [긴 변, 짧은 변] mm · 고른 규칙(note) — 없는 도면은 빈 목록', () => {
  const t = equipTruth('sadong');
  expect(t).toHaveLength(20);
  for (const i of t) {
    expect(typeof i.name).toBe('string');
    expect(i.c.every(Number.isFinite)).toBe(true);
    expect(i.size.length === 2 && i.size[0] >= i.size[1] && i.size[1] > 0).toBe(true);
  }
  expect(new Set(t.map(i => i.c.join())).size).toBe(20);
  expect(equipTruth('nowhere')).toEqual([]);
});

test('회귀 지표의 방향: 배치·제품 수가 줄거나 벽 겹침이 늘면 나빠짐 · 손 정답 적중은 줄면 나빠짐', () => {
  expect([WORSE.equip, WORSE.equipProd, WORSE.equipClash, WORSE.equipHit]).toEqual([-1, -1, +1, -1]);
});
