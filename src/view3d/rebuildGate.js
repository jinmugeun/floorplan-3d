// 2D를 보는 동안 3D 리빌드를 보류하는 문 + 셰이더 예열 일정(2026-10-13 · 계획 14 Task B · 계획 13 Task 3 리뷰 P3-1 · 사전 검토 p14-preflight I-4 · m-5 · m-6).
//
// 왜: view3d는 store가 바뀔 때마다 화면 모드와 상관없이 씬을 다시 짓고 한 프레임을 그렸다(view3d.js의 store 구독).
// 그래서 2D에서 DXF [가져오기]를 누르면 보이지도 않는 3D의 리빌드(사동중 178 ms: buildItems 109 · collidingIds 79)와
// 첫 3D 프레임의 셰이더 링크(≈ 211 ms — 기구 이름 라벨이 처음 쓰는 Sprite·Points 프로그램, SwiftShader라 부푼 값)가
// 그 클릭의 메인 블록에 들어갔다(계획 13 Task 3 보고: 사동 가져오기 메인 블록 416 ms). 2D에서 벽 하나를 고칠 때도 같았다.
//
// 규칙: 3D가 숨겨져 있으면(ui 모드 '2d' — shell.js가 같은 값으로 #c3d를 숨긴다) store가 바뀌어도 "바뀌었을지 모름"만 적는다.
// 서명(sceneSignature — 사동 ≈ 1 ms)도 계산하지 않는다. 보이는 순간(onVisible) 서명을 한 번 재서 마지막으로 지은 것과 다르면
// 한 번 짓고 그린다. 보이는 동안은 지금처럼 바뀔 때마다 서명을 재고 다르면 바로 짓는다.
// 숨긴 채 씬을 읽는 길(렌더샷·시방서 입면 = renderImage, capture)은 ensureFresh/fresh로 먼저 짓는다 — 호출 자리 전수는 tests/rebuildGate.test.js.
//
// 예열(shaderWarm.js): ① 문을 만든 뒤 유휴 시간에 한 번 warmup(실제 재질 공장으로 지은 작은 장면을 compile — 숨김이어도 한다).
// ② 처음 보이는 리빌드 뒤 유휴 시간에 한 번 prewarm(실제 장면 compileAsync — 첫 프레임이 아직 쓰지 않은 변형, 예: 사용자 재질 무늬).
// 예열은 덤이다: 던지거나 거부돼도 삼킨다(컨텍스트 소실 등).

// 브라우저가 한가할 때 cb를 부른다. requestIdleCallback이 없으면(사파리 일부·node) setTimeout으로 내려간다.
// 시한(timeout)을 둔다: 계속 바쁜 화면에서도 예열이 영영 밀리지 않게.
export const IDLE_TIMEOUT_MS = 1000;
export function runWhenIdle(cb) {
  if (typeof requestIdleCallback === 'function') return requestIdleCallback(cb, { timeout: IDLE_TIMEOUT_MS });
  return setTimeout(cb, 200);
}

// 실제 장면 예열 함수. three 0.169는 compileAsync(r158+)가 있고, 없으면 compile로, 둘 다 없으면(jsdom 가짜 렌더러) null — 생략.
// 카메라는 부르는 순간의 것을 읽는다(원근↔직교·2D 투영이 바뀌어도 그때의 카메라로 컴파일한다).
export function shaderPrewarm(renderer, scene, getCamera) {
  if (typeof renderer?.compileAsync === 'function') return () => renderer.compileAsync(scene, getCamera());
  if (typeof renderer?.compile === 'function') return () => renderer.compile(scene, getCamera());
  return null;
}

// 예열은 덤이다: 동기 예외도, 거부된 Promise도 밖으로 내보내지 않는다.
function quietly(fn) {
  try { const p = fn(); if (p && typeof p.catch === 'function') p.catch(() => {}); } catch { /* 예열은 덤이다 */ }
}

export function createRebuildGate({ isVisible, signature, rebuild, render = () => {}, warmup = null, prewarm = null, idle = runWhenIdle }) {
  let lastSig, stale = false, forced = false, prewarmArmed = !!prewarm;
  if (warmup) idle(() => quietly(warmup));
  // 처음 보이는 리빌드 뒤 한 번만. 유휴 시점에 다시 숨겨졌으면 건너뛰고 다음에 보이는 리빌드에서 다시 건다.
  function warmAfterVisibleBuild() {
    if (!prewarmArmed) return;
    prewarmArmed = false;
    idle(() => { if (isVisible()) quietly(prewarm); else prewarmArmed = true; });
  }
  // 서명을 재서 마지막으로 지은 것과 다르면(또는 invalidate로 강제면) 짓는다. 지었으면 true.
  function check() {
    const sig = signature();
    stale = false;
    if (sig === lastSig && !forced) return false;
    lastSig = sig; forced = false;
    rebuild();
    return true;
  }
  const pending = () => stale || forced;
  return {
    // store 구독이 부른다. 숨김이면 서명도 재지 않는다. 보이면 지금처럼(같은 서명이면 짓지 않는다 — 슬라이더 드래그 같은 { record: false } 연속 dispatch).
    onStoreChange() {
      if (!isVisible()) { stale = true; return false; }
      if (!check()) return false;
      warmAfterVisibleBuild();
      return true;
    },
    // 서명 밖의 리빌드 사유(라벨 밀도 '끔' 진입·이탈 — labelRefreshKind)도 같은 문을 거친다.
    invalidate() {
      forced = true;
      if (!isVisible()) return false;
      check(); warmAfterVisibleBuild();
      return true;
    },
    // ui 구독이 부른다(모드 2D → 평면/3D/1인칭이 ui.set({ mode })로 바뀐 직후). 숨김이거나 보류가 없으면 no-op.
    onVisible() {
      if (!isVisible() || !pending() || !check()) return false;
      render(); warmAfterVisibleBuild();
      return true;
    },
    // 숨긴 채 3D 씬을 읽기 전에 부른다. 보류가 있을 때만 서명을 잰다. 렌더샷이 곧바로 그 프로그램을 쓰므로 예열은 걸지 않는다.
    ensureFresh() { return pending() ? check() : false; },
    // fn을 부르기 전에 ensureFresh한다(view3d의 renderImage·capture — 렌더샷·시방서 입면·캡처가 함께 쓴다).
    fresh(fn) { return (...args) => { if (pending()) check(); return fn(...args); }; },
    isVisible: () => !!isVisible(),
    get dirty() { return pending(); },
  };
}
