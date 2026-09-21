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

  test('락이 잡히면 드래그는 시선을 만들지 않는다(PLC와 이중 적용 없음)', () => {
    const a = setup({ lockable: true });
    a.fp.enter();
    expect(a.fp.isFallback()).toBe(false);
    pointer(a.dom, 'pointerdown', 100, 100);
    pointer(a.dom, 'pointermove', 200, 160);
    expect(a.fp.getLook()).toEqual({ yaw: 0, pitch: 0 });   // 회전은 PLC의 onMouseMove만 쓴다
    a.fp.exit();
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

// Chromium의 requestPointerLock()은 Promise를 돌려주므로 거부는 동기 throw가 아니다.
// three의 lock()이 그 Promise를 버려서 1인칭 진입마다 uncaught page error가 남던 것을 고친 자리다.
const flush = async () => { for (let i = 0; i < 3; i++) await Promise.resolve(); await new Promise(r => setTimeout(r, 0)); };
const past = ms => new Promise(r => setTimeout(r, ms));
function catchRejections() {
  const seen = [];
  const on = r => seen.push(r);
  process.on('unhandledRejection', on);
  return { seen, done: () => process.off('unhandledRejection', on) };
}

describe('락 요청의 거부와 취소', () => {
  test('Promise 거부를 직접 잡아 내려간다 — unhandled rejection이 남지 않는다', async () => {
    const guard = catchRejections();
    const a = setup({ lockable: true });
    a.dom.requestPointerLock = () => Promise.reject(new Error('The root document of this element is not valid for pointer lock.'));
    a.fp.enter();
    expect(a.controls.locks).toBe(0);                 // PLC의 lock()을 거치지 않는다(Promise를 버리지 않으려고)
    expect(a.fp.isFallback()).toBe(false);            // 거부는 마이크로태스크 뒤에 온다
    await flush();
    expect(a.fp.isFallback()).toBe(true);
    expect(a.falls).toEqual([true]);                  // 토스트 1회
    expect(guard.seen).toEqual([]);
    a.fp.exit();
    guard.done();
  });

  test('요청이 동기로 던지면 곧바로 내려간다', () => {
    const a = setup({ lockable: true });
    a.dom.requestPointerLock = () => { throw new Error('요청은 사용자 제스처 안에서만'); };
    a.fp.enter();
    expect(a.fp.isFallback()).toBe(true);
    expect(a.falls).toEqual([true]);
    a.fp.exit();
  });

  test('거부·pointerlockerror·타임아웃이 겹쳐도 폴백과 토스트는 진입당 1회다', async () => {
    const guard = catchRejections();
    const a = setup({ lockable: true });
    a.dom.requestPointerLock = () => { document.dispatchEvent(new Event('pointerlockerror')); return Promise.reject(new Error('refused')); };
    a.fp.enter();
    expect(a.falls).toEqual([true]);                  // error가 먼저 내려갔다
    await flush();
    await past(LOCK_TIMEOUT_MS + 20);                 // 타임아웃까지 지나도 더 내려가지 않는다
    expect(a.falls).toEqual([true]);
    expect(guard.seen).toEqual([]);
    a.fp.exit();
    expect(a.falls).toEqual([true, false]);
    guard.done();
  });

  test('요청 중에 나가면 늦게 온 거부는 폴백도 토스트도 만들지 않는다', async () => {
    const guard = catchRejections();
    const a = setup({ lockable: true });
    let reject = null;
    a.dom.requestPointerLock = () => new Promise((_, rj) => { reject = rj; });
    a.fp.enter();
    a.fp.exit();                                      // 응답 전에 [Esc]/[나가기]
    expect(a.controls.unlocks).toBe(1);               // 진행 중인 요청도 무조건 취소한다(락이 없으면 no-op)
    reject(new Error('late'));
    await flush();
    await past(LOCK_TIMEOUT_MS + 20);
    expect(a.fp.isActive()).toBe(false);
    expect(a.fp.isFallback()).toBe(false);
    expect(a.falls).toEqual([]);
    expect(guard.seen).toEqual([]);
    guard.done();
  });

  test('요청 중에 나갔는데 락이 늦게 잡히면 곧바로 풀어 준다(ISO에 락이 남지 않는다)', async () => {
    const a = setup({ lockable: true });
    a.dom.requestPointerLock = () => new Promise(() => {});   // 응답이 없는 요청
    a.fp.enter();
    a.fp.exit();
    a.controls.isLocked = true;                       // 나간 뒤 브라우저가 락을 허용했다
    document.dispatchEvent(new Event('pointerlockchange'));
    expect(a.controls.isLocked).toBe(false);
    expect(a.falls).toEqual([]);                      // 늦은 락이 토스트를 띄우지도 않는다
    document.dispatchEvent(new Event('pointerlockchange'));   // 그물은 한 번만 쓰인다
    expect(a.controls.unlocks).toBe(2);               // exit()의 1회 + 늦은 락의 1회
  });

  test('다시 들어가면 지난 진입의 늦은 거부는 무시된다', async () => {
    const a = setup({ lockable: true });
    let reject = null;
    a.dom.requestPointerLock = () => new Promise((_, rj) => { reject = rj; });
    a.fp.enter();
    const stale = reject;
    a.fp.exit();
    a.fp.enter();                                     // 두 번째 진입(새 표)
    stale(new Error('stale'));
    await flush();
    expect(a.fp.isFallback()).toBe(false);
    expect(a.falls).toEqual([]);
    a.fp.exit();
  });
});
