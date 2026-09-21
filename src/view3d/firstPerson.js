// 1인칭의 시선·이동·탈출(§15.1). 감사 §8: 포인터 락이 거부되면 둘러볼 수도, 걸을 수도, 나갈 수도
// 없었다. 여기서 세 가지를 보장한다.
//   ① 락 실패(pointerlockerror · 요청 거부(Promise 거부·동기 throw) · 300 ms 안에
//      pointerlockchange 없음)를 감지해
//      "락 없는 1인칭"으로 내려간다 — 캔버스 왼쪽 드래그가 시선이다(0.25°/px).
//   ② WASD·Q/E·방향키는 락 여부와 무관하게 늘 동작한다.
//   ③ exit()은 리스너·키 집합·포인터 락을 한 곳에서 정리한다(호출자가 ISO로 되돌린다).
// three도 스토어도 import하지 않는다: PointerLockControls와 카메라는 주입받은 것만 만진다
// (그래서 WebGL 없이 jsdom에서 전부 테스트된다 — view3d.js는 어느 테스트도 import하지 못한다).
export const LOCK_TIMEOUT_MS = 300;   // 이 시간 안에 락이 잡히지 않으면 락 없는 1인칭으로 내려간다
export const LOOK_DEG_PER_PX = 0.25;  // 드래그 감도
export const PITCH_LIMIT = 89;        // 위아래 시선 한계(°)
export const MOVE_MPS = 2;            // 걷는 속도(m/s) — 예전 fpStep의 v = 2 * dt와 같은 값이다

// code(또는 key) → [축, 방향]. 방향키도 이동이다(감사 §8 ②의 "Q/E/W/A/S/D·방향키").
export const MOVE_KEYS = {
  KeyW: ['fwd', 1], KeyS: ['fwd', -1], KeyA: ['right', -1], KeyD: ['right', 1],
  KeyQ: ['up', -1], KeyE: ['up', 1],
  ArrowUp: ['fwd', 1], ArrowDown: ['fwd', -1], ArrowLeft: ['right', -1], ArrowRight: ['right', 1],
};
// 합성 키 이벤트(브리지 프로브·테스트)는 code가 없을 수 있다: key도 본다.
export const keyCodeOf = ev => (MOVE_KEYS[ev?.code] ? ev.code : MOVE_KEYS[ev?.key] ? ev.key : null);

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const RAD = d => (d * Math.PI) / 180;

// 누른 키 집합과 프레임 간격에서 이동량(m)을 만든다. dt는 0~0.05 s로 자른다:
// 탭을 다시 보이게 했을 때 (t - lastT)가 수 초가 되어 벽을 뚫고 날아가던 것을 막는다.
export function moveDelta(keys, dt, speed = MOVE_MPS) {
  const out = { fwd: 0, right: 0, up: 0 };
  const step = clamp(Number(dt) || 0, 0, 0.05) * speed;
  for (const k of keys ?? []) { const m = MOVE_KEYS[k]; if (m) out[m[0]] += m[1] * step; }
  return out;
}

// 드래그 픽셀 → 시선. 오른쪽으로 끌면 시선도 오른쪽으로 돈다(yaw는 북 기준 시계방향이라 값이 준다).
export function lookNext({ yaw = 0, pitch = 0 } = {}, dx = 0, dy = 0, { deg = LOOK_DEG_PER_PX } = {}) {
  return {
    yaw: (((yaw - dx * deg) % 360) + 360) % 360,
    pitch: clamp(pitch - dy * deg, -PITCH_LIMIT, PITCH_LIMIT),
  };
}

export function createFirstPerson({ dom = null, controls = null, camera = () => null, requestRender = () => {}, onFallback = () => {}, timeout = LOCK_TIMEOUT_MS } = {}) {
  const keys = new Set();
  let active = false, fallback = false, timer = 0, lastT = 0, look = { yaw: 0, pitch: 0 }, drag = null, reqId = 0;
  const doc = () => dom?.ownerDocument ?? document;   // PLC와 같은 문서·창을 본다(주입된 캔버스 기준)
  const win = () => doc().defaultView ?? window;
  const typing = el => ['INPUT', 'SELECT', 'TEXTAREA'].includes(el?.tagName);
  const isLocked = () => !!controls?.isLocked;
  const DRAG_END = ['pointerup', 'pointercancel', 'lostpointercapture'];

  const applyLook = () => {
    const c = camera();
    if (!c?.rotation) return;
    c.rotation.order = 'YXZ';                       // 먼저 yaw, 그다음 pitch(짐벌 흔들림 없이)
    c.rotation.set(RAD(look.pitch), RAD(-look.yaw), 0);
    requestRender();
  };
  const goFallback = () => {
    if (!active || fallback) return;
    fallback = true;
    applyLook();                                     // 락이 잡아 두었을 수 있는 회전을 우리 각도로 맞춘다
    onFallback(true);
  };
  const clearTimer = () => { if (timer) { clearTimeout(timer); timer = 0; } };

  const onKeyDown = ev => {
    if (!active || typing(ev.target)) return;
    const k = keyCodeOf(ev);
    if (!k) return;
    keys.add(k);
    ev.preventDefault?.();                           // 방향키로 페이지가 스크롤되지 않게
  };
  const onKeyUp = ev => { const k = keyCodeOf(ev); if (k) keys.delete(k); };
  const onLockError = () => goFallback();
  // 락 요청을 PLC를 통하지 않고 직접 건다: Chromium의 requestPointerLock()은 Promise를 돌려주는데
  // three의 lock()은 그것을 버려서 거부가 unhandled rejection(uncaught page error)으로 새어 나갔다.
  // PLC의 isLocked는 pointerlockchange로 갱신되니 동작은 그대로다. 진입마다 표(reqId)를 새로 발급해
  // exit() 뒤에 늦게 온 응답은 무시한다. goFallback()은 멱등하니 거부·error·타임아웃이 겹쳐도 1회다.
  const requestLock = () => {
    const req = ++reqId;
    try {
      const p = dom?.requestPointerLock ? dom.requestPointerLock() : (controls?.lock?.(), null);
      if (p && typeof p.then === 'function') p.then(null, () => { if (req === reqId) goFallback(); });
    } catch { goFallback(); }                          // 사용자 제스처 밖의 요청은 동기로 던질 수 있다
  };
  // exit() 뒤에 늦게 잡힌 락은 아무도 풀지 않는다(리스너가 이미 없다) — ISO에서 마우스가 카메라를
  // 돌려 OrbitControls와 겹치는 것을 막으려고 한 번만 그물을 쳐 둔다.
  const onLateLock = () => {
    doc().removeEventListener('pointerlockchange', onLateLock);
    if (!active) controls?.unlock?.();
  };
  const onLockChange = () => { if (!active) return; clearTimer(); if (!isLocked()) goFallback(); };
  // 락이 없을 때만 드래그로 둘러본다(락이 걸려 있으면 PointerLockControls가 이미 마우스를 받는다).
  const onDown = ev => {
    if (!active || !fallback || ev.button !== 0) return;
    drag = [ev.clientX, ev.clientY];
    dom?.setPointerCapture?.(ev.pointerId);
  };
  const onMove = ev => {
    if (!drag) return;
    look = lookNext(look, ev.clientX - drag[0], ev.clientY - drag[1]);
    drag = [ev.clientX, ev.clientY];
    applyLook();
  };
  const onUp = ev => {
    if (!drag) return;
    drag = null;
    if (dom?.hasPointerCapture?.(ev.pointerId)) dom.releasePointerCapture?.(ev.pointerId);
  };

  return {
    enter({ yaw = 0, pitch = 0 } = {}) {
      if (active) return;
      active = true; fallback = false; keys.clear(); lastT = 0; drag = null;
      look = { yaw, pitch };
      const d = doc(), w = win();
      d.removeEventListener('pointerlockchange', onLateLock);   // 지난 진입이 남긴 그물은 걷는다
      w.addEventListener('keydown', onKeyDown);
      w.addEventListener('keyup', onKeyUp);
      d.addEventListener('pointerlockerror', onLockError);
      d.addEventListener('pointerlockchange', onLockChange);
      dom?.addEventListener('pointerdown', onDown);
      dom?.addEventListener('pointermove', onMove);
      for (const t of DRAG_END) dom?.addEventListener(t, onUp);
      requestLock();
      if (!fallback && !isLocked()) timer = setTimeout(() => { timer = 0; if (active && !isLocked()) goFallback(); }, timeout);
    },
    step(t) {
      if (!active) return;
      const dt = lastT ? (t - lastT) / 1000 : 0;          // 첫 프레임은 기준 시각만 잡는다
      lastT = t;
      const d = moveDelta(keys, dt);
      if (!d.fwd && !d.right && !d.up) return;
      if (d.fwd) controls?.moveForward?.(d.fwd);
      if (d.right) controls?.moveRight?.(d.right);
      const c = camera();
      if (d.up && c?.position) c.position.y += d.up;
      requestRender();
    },
    exit() {
      if (!active) return;
      clearTimer();
      const d = doc(), w = win();
      w.removeEventListener('keydown', onKeyDown);
      w.removeEventListener('keyup', onKeyUp);
      d.removeEventListener('pointerlockerror', onLockError);
      d.removeEventListener('pointerlockchange', onLockChange);
      dom?.removeEventListener('pointerdown', onDown);
      dom?.removeEventListener('pointermove', onMove);
      for (const t of DRAG_END) dom?.removeEventListener(t, onUp);
      keys.clear(); drag = null; active = false;
      reqId++;                                         // 진행 중인 락 요청을 무효화한다(늦은 거부 → 폴백 없음)
      controls?.unlock?.();                            // 락이 없을 때의 exitPointerLock()은 no-op다
      d.addEventListener('pointerlockchange', onLateLock);   // 그래도 잡히면 곧바로 풀어 준다
      if (fallback) { fallback = false; onFallback(false); }
    },
    isActive: () => active,
    isFallback: () => fallback,
    getLook: () => ({ ...look }),
  };
}
