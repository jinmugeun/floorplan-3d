// @vitest-environment jsdom
// §15.1: 포인터 락이 거부되는 환경에서도 1인칭을 쓸 수 있어야 한다(감사 §8).
// three를 끌어오지 않고 controls·camera를 주입해 상태 기계만 본다.
import { describe, test, expect, vi } from 'vitest';
import { createFirstPerson, moveDelta, lookNext, keyCodeOf, MOVE_KEYS, LOCK_TIMEOUT_MS, LOOK_DEG_PER_PX, PITCH_LIMIT, MOVE_MPS } from '../src/view3d/firstPerson.js';

function fakeControls({ lockable = true } = {}) {
  const c = {
    isLocked: false, moved: [], locks: 0, unlocks: 0,
    lock() {
      c.locks++;
      if (lockable) { c.isLocked = true; document.dispatchEvent(new Event('pointerlockchange')); }
      else document.dispatchEvent(new Event('pointerlockerror'));
    },
    unlock() { c.unlocks++; c.isLocked = false; },
    moveForward: v => c.moved.push(['fwd', v]),
    moveRight: v => c.moved.push(['right', v]),
  };
  return c;
}
const fakeCamera = () => ({
  rotation: { order: 'XYZ', x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; } },
  position: { x: 0, y: 1.5, z: 0 },
});
function setup({ lockable = true } = {}) {
  const dom = document.createElement('div'); document.body.appendChild(dom);
  const controls = fakeControls({ lockable });
  const camera = fakeCamera();
  const falls = [];
  const fp = createFirstPerson({ dom, controls, camera: () => camera, onFallback: on => falls.push(on) });
  return { dom, controls, camera, falls, fp };
}
const key = (type, code) => window.dispatchEvent(new KeyboardEvent(type, { code, key: code, bubbles: true }));
const pointer = (el, type, x, y) => el.dispatchEvent(new MouseEvent(type, { button: 0, clientX: x, clientY: y, bubbles: true }));

describe('1인칭 순수 계산', () => {
  test('상수는 §15.1이 정한 값 그대로다', () => {
    expect([LOCK_TIMEOUT_MS, LOOK_DEG_PER_PX, PITCH_LIMIT, MOVE_MPS]).toEqual([300, 0.25, 89, 2]);
    expect(Object.keys(MOVE_KEYS).sort()).toEqual(['ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'KeyA', 'KeyD', 'KeyE', 'KeyQ', 'KeyS', 'KeyW']);
  });

  test('moveDelta는 dt를 0.05 s로 자르고 키를 합친다', () => {
    expect(moveDelta(['KeyW'], 0.016)).toEqual({ fwd: 0.032, right: 0, up: 0 });
    expect(moveDelta(['KeyW', 'KeyS'], 0.016)).toEqual({ fwd: 0, right: 0, up: 0 });   // 맞선 키는 상쇄된다
    expect(moveDelta(['KeyD', 'KeyE'], 10).right).toBeCloseTo(0.1, 6);                  // dt 상한 0.05 × 2 m/s
    expect(moveDelta(['ArrowLeft'], 0.02).right).toBeCloseTo(-0.04, 6);                 // 방향키도 이동이다
    expect(moveDelta(['KeyQ'], 0.02).up).toBeCloseTo(-0.04, 6);
    expect(moveDelta([], 0.02)).toEqual({ fwd: 0, right: 0, up: 0 });
  });

  test('lookNext는 0.25°/px로 돌고 pitch를 ±89°로 자른다', () => {
    expect(lookNext({ yaw: 0, pitch: 0 }, 40, 0)).toEqual({ yaw: 350, pitch: 0 });       // 오른쪽으로 끌면 yaw가 준다
    expect(lookNext({ yaw: 0, pitch: 0 }, -40, 0).yaw).toBeCloseTo(10, 6);
    expect(lookNext({ yaw: 10.5, pitch: 0 }, 0, -2000).pitch).toBe(PITCH_LIMIT);
    expect(lookNext({ yaw: 10.5, pitch: 0 }, 0, 2000).pitch).toBe(-PITCH_LIMIT);
    expect(lookNext({ yaw: 359.5, pitch: 0.25 }, -4, 0).yaw).toBeCloseTo(0.5, 6);        // 소수 좌표
  });

  test('keyCodeOf는 code를 먼저 보고 없으면 key를 본다', () => {
    expect(keyCodeOf({ code: 'KeyW', key: 'w' })).toBe('KeyW');
    expect(keyCodeOf({ key: 'ArrowUp' })).toBe('ArrowUp');
    expect(keyCodeOf({ code: 'KeyZ', key: 'z' })).toBeNull();
  });
});

describe('락이 잡히는 환경', () => {
  test('enter가 락을 걸고 fallback으로 내려가지 않는다', () => {
    const a = setup({ lockable: true });
    a.fp.enter();
    expect(a.controls.locks).toBe(1);
    expect(a.fp.isActive()).toBe(true);
    expect(a.fp.isFallback()).toBe(false);
    expect(a.falls).toEqual([]);
    a.fp.exit();
    expect(a.controls.unlocks).toBe(1);
    expect(a.fp.isActive()).toBe(false);
  });
});

describe('락이 거부되는 환경(감사 §8 ①)', () => {
  test('pointerlockerror가 오면 곧바로 락 없는 1인칭으로 내려간다', () => {
    const a = setup({ lockable: false });
    a.fp.enter();
    expect(a.fp.isFallback()).toBe(true);
    expect(a.falls).toEqual([true]);
    a.fp.exit();
    expect(a.falls).toEqual([true, false]);
  });

  test('아무 응답이 없어도 300 ms 뒤에 내려간다', () => {
    vi.useFakeTimers();
    const dom = document.createElement('div'); document.body.appendChild(dom);
    const controls = { isLocked: false, lock() {}, unlock() {}, moveForward() {}, moveRight() {} };
    const falls = [];
    const fp = createFirstPerson({ dom, controls, camera: () => fakeCamera(), onFallback: on => falls.push(on) });
    fp.enter();
    expect(fp.isFallback()).toBe(false);
    vi.advanceTimersByTime(LOCK_TIMEOUT_MS - 1);
    expect(fp.isFallback()).toBe(false);
    vi.advanceTimersByTime(2);
    expect(fp.isFallback()).toBe(true);
    expect(falls).toEqual([true]);
    fp.exit();
    vi.useRealTimers();
  });

  test('락 없이도 드래그로 둘러보고 WASD·방향키로 움직인다(감사 §8 ②)', () => {
    const a = setup({ lockable: false });
    a.fp.enter();
    pointer(a.dom, 'pointerdown', 100, 100);
    pointer(a.dom, 'pointermove', 140, 120);
    expect(a.fp.getLook().yaw).toBeCloseTo(350, 6);       // 40 px × 0.25°
    expect(a.fp.getLook().pitch).toBeCloseTo(-5, 6);
    expect(a.camera.rotation.order).toBe('YXZ');
    pointer(a.dom, 'pointerup', 140, 120);
    pointer(a.dom, 'pointermove', 400, 400);              // 손을 뗀 뒤 움직임은 시선을 바꾸지 않는다
    expect(a.fp.getLook().yaw).toBeCloseTo(350, 6);
    key('keydown', 'KeyW'); key('keydown', 'ArrowRight');
    a.fp.step(1000); a.fp.step(1016);                     // 첫 프레임은 기준 시각만 잡는다(dt 0)
    expect(a.controls.moved).toEqual([['fwd', 0.032], ['right', 0.032]]);
    key('keyup', 'KeyW'); key('keyup', 'ArrowRight');
    a.controls.moved.length = 0;
    a.fp.step(1032);
    expect(a.controls.moved).toEqual([]);
    a.fp.exit();
  });

  test('E는 카메라 높이를 올리고, 입력란에 타이핑 중이면 걷지 않는다', () => {
    const a = setup({ lockable: false });
    a.fp.enter();
    const input = document.createElement('input'); document.body.appendChild(input);
    input.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW', key: 'w', bubbles: true }));
    a.fp.step(1000); a.fp.step(1016);
    expect(a.controls.moved).toEqual([]);
    key('keydown', 'KeyE');
    a.fp.step(1032);
    expect(a.camera.position.y).toBeCloseTo(1.5 + 0.032, 6);
    a.fp.exit();
    key('keydown', 'KeyW');                               // 나간 뒤의 키는 모으지 않는다
    a.fp.step(1048);
    expect(a.controls.moved).toEqual([]);
  });
});
