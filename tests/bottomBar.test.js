// @vitest-environment jsdom
// §14.3: 1600 px에서도 하단 바가 넘쳐 가로·세로 스크롤바가 동시에 생겼다.
// 넘치면 3D 전용 묶음을 "더보기 ▾" 팝오버로 접고, 64 px 여유가 생겨야 다시 펼친다(히스테리시스).
import { test, expect } from 'vitest';
import { createBottomBar, compactNext, BOTTOM_HYSTERESIS } from '../src/ui/bottomBar.js';
import { shellHtml } from '../src/ui/shellHtml.js';
import { BOTTOM_TIERS, tierOf } from '../src/ui/bottomTiers.js';
import { focusables, focusTrap } from '../src/ui/dialogBase.js';

function setup(sizes = { scrollWidth: 900, clientWidth: 900 }, opts = {}) {
  document.body.innerHTML = shellHtml({ name: '테스트' });
  const size = { ...sizes };
  const bar = createBottomBar(document.body, { measure: () => ({ ...size }), ...opts });
  return { bar, size, bottom: document.querySelector('#bottombar'), more: document.querySelector('#bottomMore') };
}
const overflowCtl = () => [...document.querySelectorAll('[data-overflow] button, [data-overflow] select')];

test('compactNext는 넘칠 때 접고 히스테리시스만큼 여유가 생겨야 펼친다', () => {
  expect(BOTTOM_HYSTERESIS).toBe(64);
  expect(compactNext({ compact: false, scrollWidth: 977, clientWidth: 891 })).toBe(true);
  expect(compactNext({ compact: false, scrollWidth: 800, clientWidth: 891 })).toBe(false);
  // 접힌 뒤에는 "펼쳤을 때 필요했던 폭"과 비교한다: 딱 맞는 폭에서 다시 펴면 곧바로 또 접힌다.
  expect(compactNext({ compact: true, scrollWidth: 700, clientWidth: 980, fullWidth: 977 })).toBe(true);
  expect(compactNext({ compact: true, scrollWidth: 700, clientWidth: 1041, fullWidth: 977 })).toBe(false);
});

test('접기 단계를 다 써도 묶음은 원래 순서로 더보기에 들어가고 여유가 생기면 제자리로 돌아온다', () => {
  const { bar, size, bottom, more } = setup({ scrollWidth: 900, clientWidth: 900 });
  expect(bar.isCompact()).toBe(false);
  expect(document.querySelector('#btnBottomMore').hidden).toBe(true);
  const overflowIds = [...bottom.querySelectorAll('[data-overflow]')].map(s => s.id);
  expect(overflowIds.length).toBeGreaterThan(0);
  size.scrollWidth = 1100; size.clientWidth = 900;
  bar.sync();
  expect(bar.isCompact()).toBe(true);
  expect(bottom.classList.contains('compact')).toBe(true);
  expect(document.querySelector('#btnBottomMore').hidden).toBe(false);
  expect([...more.querySelectorAll('[data-overflow]')].map(s => s.id)).toEqual(overflowIds);
  // 옮겨진 것은 같은 노드다: 3D 버튼에 걸어 둔 리스너가 살아 있어야 한다.
  expect(document.querySelector('#btnSun').closest('#bottomMore')).toBe(more);
  size.clientWidth = 1100 + BOTTOM_HYSTERESIS;     // 딱 히스테리시스만큼 여유
  bar.sync();
  expect(bar.isCompact()).toBe(false);
  expect([...bottom.querySelectorAll(':scope > [data-overflow]')].map(s => s.id)).toEqual(overflowIds);
  expect(more.children).toHaveLength(0);
  bar.destroy();
});

test('더보기 버튼이 팝오버를 여닫고 [Esc]·바깥 클릭이 닫는다', () => {
  const { bar, size, more } = setup();
  size.scrollWidth = 1100; size.clientWidth = 900;
  bar.sync();
  const btn = document.querySelector('#btnBottomMore');
  expect(more.classList.contains('open')).toBe(false);
  btn.click();
  expect(more.classList.contains('open')).toBe(true);
  expect(btn.getAttribute('aria-expanded')).toBe('true');
  btn.click();
  expect(more.classList.contains('open')).toBe(false);
  btn.click();
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  expect(more.classList.contains('open')).toBe(false);
  btn.click();
  document.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
  expect(more.classList.contains('open')).toBe(false);
  bar.destroy();
});

test('접힌 상태에서 다시 펼치면 더보기 팝오버도 닫힌다', () => {
  const { bar, size, more } = setup();
  size.scrollWidth = 1100; size.clientWidth = 900;
  bar.sync();
  document.querySelector('#btnBottomMore').click();
  expect(more.classList.contains('open')).toBe(true);
  size.clientWidth = 5000;
  bar.sync();
  expect(bar.isCompact()).toBe(false);
  expect(more.classList.contains('open')).toBe(false);
  bar.destroy();
});

test('접을 것이 하나도 보이지 않으면 더보기 버튼을 감춘다(빈 팝오버 방지)', () => {
  const { bar, size } = setup();
  // 모드에 따라 3D 전용 컨트롤이 모두 숨은 상황: 접어도 팝오버에 누를 것이 없다.
  for (const c of overflowCtl()) c.hidden = true;
  size.scrollWidth = 1100; size.clientWidth = 900;
  bar.sync();
  expect(bar.isCompact()).toBe(true);
  expect(document.querySelector('#btnBottomMore').hidden).toBe(true);
  // 빈 묶음은 gap 만큼의 빈 여백도 남기지 않는다.
  expect(document.querySelector('#seg3d').hidden).toBe(true);
  expect(document.querySelector('#segGizmo').hidden).toBe(true);
  bar.destroy();
});

test('모드가 바뀌어 보이는 버튼이 줄면 필요한 폭을 다시 재고 펼친다', () => {
  const { bar, size } = setup();
  // 3D: 카메라·햇빛·기즈모가 보이고 바가 넘쳐 접힌다(이때 fullWidth = 1100).
  for (const id of ['#btnCam', '#btnSun', '#btnGizmoMode']) document.querySelector(id).hidden = false;
  size.scrollWidth = 1100; size.clientWidth = 900;
  bar.sync();
  expect(bar.isCompact()).toBe(true);
  // 2D로 돌아오면 3D 전용 버튼이 숨어 실제 필요한 폭이 줄어든다: 옛 fullWidth로는 계속 접혀 있었다.
  for (const id of ['#btnCam', '#btnSun', '#btnGizmoMode']) document.querySelector(id).hidden = true;
  size.scrollWidth = 700;
  bar.sync();
  expect(bar.isCompact()).toBe(false);
  expect(document.querySelector('#bottomMore').children).toHaveLength(0);
  bar.destroy();
});

test('더보기를 열면 포커스가 팝오버 안으로 들어가고 [Esc]로 닫으면 버튼으로 돌아온다', () => {
  const opened = [];
  const { bar, size, more } = setup({ scrollWidth: 900, clientWidth: 900 }, { onOpen: () => opened.push(1) });
  size.scrollWidth = 1100; size.clientWidth = 900;
  bar.sync();
  const btn = document.querySelector('#btnBottomMore');
  btn.focus();
  btn.click();
  expect(opened).toHaveLength(1);                       // 셸 팝오버를 닫으라고 알린다(팝오버는 하나만)
  expect(more.contains(document.activeElement)).toBe(true);
  expect(document.activeElement.hidden).toBe(false);    // 숨은 3D 버튼이 아니라 실제로 보이는 컨트롤
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  expect(more.classList.contains('open')).toBe(false);
  expect(document.activeElement).toBe(btn);
  bar.destroy();
});

// §15.4 · 리뷰 I-1: 1100 px에서는 1단계(3D 전용) + 꼬리 아이콘화 뒤에도 133 px이 남아 sticky 꼬리가
// #unitSeg를 94 px 덮었다. "겹침 0"의 동치 조건은 **압축이 끝난 뒤 넘치지 않고 꼬리가 아예 붙지 않는
// 것**이다 → 꼬리가 붙기 전에 2단계(잠금)·3단계(단위)를 접는다.
// 폭 스텁: 묶음마다 프로브 측정값에 맞춘 폭을 주고 **바에 남아 있는 묶음의 합**을 scrollWidth로 돌려준다
// (팝오버로 옮긴 묶음은 빠진다). 꼬리는 압축되면 라벨이 아이콘이 되어 199 → 132 px이다(styles.css).
// segCapture 96 → 41: 96은 라벨이 "스크린 캡쳐"(5자)일 때의 값이고, §16.8이 "캡처"(2자)로 줄였다.
// 41은 2026-09-22 실제 브라우저 재측정값이다(1600×900 · 비압축 · #segCapture의 getBoundingClientRect).
// 단계별 합(= 그 단계에서 바에 남는 묶음 폭의 합. 0 = 모드 200 · 1 = 보기 62는 STUB 밖의 기본값).
// §17.2로 접는 **순서**가 모드별이 되었으므로(BOTTOM_TIERS) 단계 합도 모드마다 다르다:
//   0단계(두 모드 공통) 200+62+132+60+41+150+62+118+199(꼬리) = 1024  ← 라벨이 짧아져 1079에서 55 px 줄었다
//   2D 1단계 = 3D 전용(seg3d 132 + segCapture 41 + segPreset 150 + segGizmo 62 = 385)을 접고
//      꼬리 아이콘화(199 → 132) → 1024 - 385 - 67 = 572   2단계 = +잠금 60 → 512   3단계 = +단위 118 → 394
//   3D 1단계 = 잠금 60을 접고 꼬리 아이콘화 → 1024 - 60 - 67 = 897
//      2단계 = +단위 118 → 779                             3단계 = +3D 전용 385 → 394
// 마지막 단계 합은 두 모드가 394로 같다(결국 같은 여섯 묶음을 접는다) — 다른 것은 **가는 길**이다.
// segCapture는 두 모드 모두 3D 전용 묶음과 함께 움직이므로 위 합은 라벨 길이와 무관하다.
// §17.2 개정(리뷰 I-1): 어느 순서를 쓸지는 **두 순서를 다 접어 보고** 정한다 — 넘침이 가시는 단계에서
// 바에 남는 묶음(비어 있지 않은 것)이 더 많은 쪽이 이기고, **같으면 현재 모드의 순서**가 이긴다.
// 아래 테스트의 clientWidth마다 두 후보의 산술(괄호 안이 그 단계에서 바에 남는 묶음 수):
//   672(1366 px · 3D) 3D 순서: 1024 > 672 → 1단계 897 > 672 → 2단계 779 > 672 → 3단계 394 ≤ 672 (0)
//                     2D 순서: 1단계 572 ≤ 672 (2 = segLock · unitSeg)  → 2 > 0이라 **2D 순서**를 쓴다.
//                     3D 묶음은 어느 쪽이든 팝오버 안이므로 잠금·단위가 남는 만큼이 순이득이다.
//   506(1100 px · 3D) 3D 순서: 3단계 394 ≤ 506 (0)   2D 순서: 572 > 506 → 512 > 506 → 394 ≤ 506 (0)
//                     → 0 = 0 동점이라 **모드 순서**(3D 3단계)가 이긴다.
//   900(3D)  3D 순서: 1단계 897 ≤ 900 (5 = unitSeg · seg3d · segCapture · segPreset · segGizmo)
//            2D 순서: 1단계 572 ≤ 900 (2)   → 5 > 2라 **모드 순서**가 이긴다(672에서와 정반대다).
//   900(2D)  모드가 2D면 후보가 하나다 → 2D 1단계 572 ≤ 900, 잠금·단위가 남는다.
//   1088 = fullWidth(1024) + 히스테리시스(64) → 아예 접지 않는다(펼침 경계).
// 달라지는 것은 fullWidth(0단계 합)뿐이라, 히스테리시스 경계를 쓰는 래칫 테스트만 1079 → 1024다.
const STUB = { seg3d: 132, segLock: 60, segCapture: 41, segPreset: 150, segGizmo: 62, unitSeg: 118 };
function widthStub(bottom, viewport) {
  const init = [...bottom.children];
  const w0 = new Map(init.map((el, i) => [el, STUB[el.id] ?? (i === 0 ? 200 : 62)]));   // 0 = 모드, 1 = 보기
  return () => {
    let scrollWidth = 0;
    for (const el of init) {
      if (el.hidden || el.parentElement !== bottom) continue;
      scrollWidth += el.id === 'bottomTail' ? (bottom.classList.contains('compact') ? 132 : 199) : w0.get(el);
    }
    return { scrollWidth, clientWidth: viewport.w };
  };
}
function setup3d(clientWidth) {
  document.body.innerHTML = shellHtml({ name: '테스트' });
  const bottom = document.querySelector('#bottombar');
  for (const id of ['#btnCam', '#btnSun', '#btnGizmoMode']) document.querySelector(id).hidden = false;
  const viewport = { w: clientWidth };
  const measure = widthStub(bottom, viewport);
  return { bar: createBottomBar(document.body, { measure }), bottom, viewport, measure };
}
// 모드별 단계를 보는 짝: 같은 폭 스텁에 getMode만 갈아 끼운다(§17.2).
function setupMode(clientWidth, mode = '3d') {
  document.body.innerHTML = shellHtml({ name: '테스트' });
  const bottom = document.querySelector('#bottombar');
  for (const id of ['#btnCam', '#btnSun', '#btnGizmoMode']) document.querySelector(id).hidden = false;
  const viewport = { w: clientWidth };
  const state = { mode };
  const bar = createBottomBar(document.body, { measure: widthStub(bottom, viewport), getMode: () => state.mode });
  const inMore = id => document.querySelector(id).closest('#bottomMore') !== null;
  return { bar, bottom, viewport, state, inMore };
}

// §17.2 개정(리뷰 I-1): 3D의 순서는 잠금 → 단위 → 3D 묶음이지만, 672 px에서는 그 길로 가면 세 단계가
// 모두 필요해(잠금 60 + 단위 118로는 1024 → 672를 만들 수 없다) 여섯 묶음이 **전부** 사라진다.
// 같은 폭에서 2D 순서는 1단계(3D 묶음 385)만으로 572를 만들어 잠금·단위를 바에 남긴다 → 그쪽을 쓴다.
// 3D 컨트롤은 두 길 모두 팝오버 안이므로 이 선택은 잃는 것 없이 두 묶음을 되찾는다.
test('1366 px(3D): 더 많이 남기는 2D 순서 1단계를 골라 잠금·단위가 바에 남는다', () => {
  const { bar, bottom, measure } = setup3d(672);
  expect(bar.tier()).toBe(1);
  const after = measure();
  expect(after.scrollWidth).toBeLessThanOrEqual(after.clientWidth);   // 압축 뒤 넘침 0
  expect(bottom.classList.contains('tail-sticky')).toBe(false);       // → 꼬리가 아예 붙지 않는다
  // 접히는 것은 3D 전용 묶음 넷뿐이다(옛 규칙은 여기에 잠금·단위까지 얹었다).
  for (const id of ['#btnSun', '#btnGizmoMode', '#viewPreset']) expect(document.querySelector(id).closest('#bottomMore')).not.toBeNull();
  for (const id of ['#btnLock', '#unitSeg']) expect(bottom.contains(document.querySelector(id))).toBe(true);
  for (const id of ['#btnFit', '#btnBottomMore', '#btnZoomIn']) expect(bottom.contains(document.querySelector(id))).toBe(true);
  bar.destroy();
});

test('1100 px: 꼬리가 붙기 전에 잠금·단위까지 접어 압축 뒤 넘침이 0이다 (fix wave 1)', () => {
  const { bar, bottom, measure } = setup3d(506);
  expect(bar.tier()).toBe(3);
  const after = measure();
  expect(after.scrollWidth).toBeLessThanOrEqual(after.clientWidth);                   // 압축 뒤 넘침 0
  expect(bottom.classList.contains('tail-sticky')).toBe(false);                       // → 꼬리가 아예 붙지 않는다
  for (const id of ['#btnLock', '#btnSun', '#btnGizmoMode']) expect(document.querySelector(id).closest('#bottomMore')).not.toBeNull();
  expect(document.querySelector('#unitSeg').parentElement.id).toBe('bottomMore');
  // 늘 보이는 것(모드·보기·줌·더보기·속성)은 그대로 바에 있다 — 두 번 클릭이 살아 있다.
  for (const id of ['#btnFit', '#btnBottomMore', '#btnZoomIn']) expect(bottom.contains(document.querySelector(id))).toBe(true);
  expect(document.querySelector('#btnBottomMore').hidden).toBe(false);
  bar.destroy();
});

test('폭이 다시 넓어지면 3단계에서 곧바로 펼쳐진다(단계가 래칫으로 남지 않는다)', () => {
  const { bar, bottom, viewport } = setup3d(506);
  expect(bar.tier()).toBe(3);
  viewport.w = 900; bar.sync();
  expect(bar.tier()).toBe(1);                                    // 1단계부터 다시 셈한다(래칫이 없다)
  expect(bottom.contains(document.querySelector('#btnSun'))).toBe(true);   // §17.2: 3D 묶음이 먼저 돌아온다
  viewport.w = 1024 + BOTTOM_HYSTERESIS; bar.sync();      // fullWidth(0단계 합 1024) + 히스테리시스 = 펼침 경계
  expect(bar.tier()).toBe(0);
  expect(document.querySelector('#bottomMore').children).toHaveLength(0);
  bar.destroy();
});

test('destroy()는 .compact와 .tail-sticky를 함께 지운다', () => {
  const { bar, bottom } = setup3d(200);                          // 다 접어도 넘친다 → 꼬리가 붙는다
  expect(bottom.classList.contains('tail-sticky')).toBe(true);
  bar.destroy();
  expect(bottom.classList.contains('compact')).toBe(false);
  expect(bottom.classList.contains('tail-sticky')).toBe(false);
  expect(bottom.contains(document.querySelector('#btnLock'))).toBe(true);
});

test('컨트롤이 드러나는 전환에서 묶음 hidden을 측정 전에 풀어 같은 sync()에서 접는다 (fix wave 2)', () => {
  // 리뷰 재현: measure를 스텁 상수가 아니라 "#seg3d가 아직 hidden인가"에서 파생시킨다 — 실제
  // CSS([hidden]{display:none!important})처럼, 안의 버튼만 드러나고 묶음이 여전히 hidden이면
  // scrollWidth에 안 잡힌다. shell.js:220-223처럼 버튼을 먼저 드러내고 sync()를 한 번만 부른다.
  document.body.innerHTML = shellHtml({ name: '테스트' });
  const seg3d = document.querySelector('#seg3d');
  const CLIENT = 906;
  const bar = createBottomBar(document.body, {
    measure: () => ({ scrollWidth: 858 + (seg3d.hidden ? 0 : 132), clientWidth: CLIENT }),
  });
  expect(bar.isCompact()).toBe(false);
  expect(seg3d.hidden).toBe(true);   // 2D: 카메라·햇빛 묶음이 비어 있다
  document.querySelector('#btnCam').hidden = false;
  document.querySelector('#btnSun').hidden = false;
  bar.sync();
  expect(seg3d.hidden).toBe(false);                                  // 묶음도 같은 sync()에서 드러난다
  expect(bar.isCompact()).toBe(true);                                // 990 > 906 → 한 박자 늦지 않고 곧바로 접힌다
  expect(document.querySelector('#btnBottomMore').hidden).toBe(false);
  bar.destroy();
});

test('#bottombar가 없어도 던지지 않는다', () => {
  document.body.innerHTML = '<div></div>';
  const bar = createBottomBar(document.body);
  bar.sync(); bar.closeMore(); bar.destroy();
  expect(bar.isCompact()).toBe(false);
});

// §15.4(감사 §24): compact가 켜진 뒤에도 747 > 672라 sticky 꼬리가 mm 버튼을 반쯤 덮었다.
// 꼬리는 "압축 뒤에도 넘칠 때만" 붙는다.
test('압축 뒤에도 넘치면 tail-sticky, 넘치지 않으면 떼어 낸다', () => {
  const root = document.createElement('div'); document.body.appendChild(root);
  root.innerHTML = `<footer id="bottombar">
    <div class="seg"><button>2D</button></div>
    <div class="seg" data-overflow="1"><button id="btnCam">카메라</button></div>
    <div id="bottomTail"><div class="seg"><button id="btnBottomMore" hidden>더보기 ▾</button></div></div>
  </footer><div id="bottomMore" hidden></div>`;
  let width = { scrollWidth: 900, clientWidth: 600 };
  const bar = createBottomBar(root, { measure: () => width });
  const el = root.querySelector('#bottombar');
  expect(el.classList.contains('compact')).toBe(true);
  expect(el.classList.contains('tail-sticky')).toBe(true);      // 접어도 넘친다 → 꼬리를 붙인다
  width = { scrollWidth: 500, clientWidth: 600 };
  bar.sync();
  expect(el.classList.contains('tail-sticky')).toBe(false);     // 더는 넘치지 않는다 → 떼어 낸다
  bar.destroy();
});

// §17.2: 접기 순서는 **현재 모드**가 정한다. data-overflow의 값은 2D 기준 단계로 남고(마크업 무변경)
// 3D에서는 이 표가 뒤집는다 — "3D인데 3D 컨트롤부터 사라진다"가 사라진다.
test('tierOf는 모드별 표를 그대로 읽는다', () => {
  expect(BOTTOM_TIERS['2d']).toEqual({ seg3d: 1, segCapture: 1, segPreset: 1, segGizmo: 1, segLock: 2, unitSeg: 3 });
  expect(BOTTOM_TIERS['3d']).toEqual({ segLock: 1, unitSeg: 2, seg3d: 3, segCapture: 3, segPreset: 3, segGizmo: 3 });
  expect(tierOf('segLock', '2d')).toBe(2);
  expect(tierOf('segLock', 'iso')).toBe(1);        // '2d'가 아니면 모두 3D 표다(plan·iso·fp)
  expect(tierOf('seg3d', '2d')).toBe(1);
  expect(tierOf('seg3d', '3d')).toBe(3);
  expect(tierOf('없는묶음', '3d')).toBe(1);        // 표에 없는 id는 가장 먼저 접는다(안전한 기본값)
});

// 1단계만으로 넘침이 사라지는 폭(900)에서 두 모드가 정반대로 접는다.
// §17.2 개정의 후보 비교가 여기서는 모드 순서를 고른다: 3D 순서 1단계가 다섯 묶음을 남기고(897 ≤ 900)
// 2D 순서 1단계는 두 묶음만 남긴다(572) → 5 > 2. 672 px에서 뒤집히는 것과 정확히 대조된다.
test('3D의 1단계는 도면 잠금이고, 2D의 1단계는 3D 묶음이다', () => {
  const a = setupMode(900, 'iso');
  expect(a.bar.tier()).toBe(1);
  expect(a.inMore('#segLock')).toBe(true);
  expect(a.inMore('#segCapture')).toBe(false);     // 3D 묶음은 통째로 바에 남는다(모드 순서가 이겼다)
  expect(a.inMore('#seg3d')).toBe(false);          // 3D 컨트롤은 3D에서 마지막까지 남는다
  expect(a.inMore('#segGizmo')).toBe(false);
  expect(a.inMore('#unitSeg')).toBe(false);
  a.bar.destroy();

  const b = setupMode(900, '2d');
  expect(b.bar.tier()).toBe(1);
  expect(b.inMore('#seg3d')).toBe(true);
  expect(b.inMore('#segCapture')).toBe(true);
  expect(b.inMore('#segPreset')).toBe(true);
  expect(b.inMore('#segGizmo')).toBe(true);
  expect(b.inMore('#segLock')).toBe(false);        // 2D에서는 도면 잠금이 오래 남는다
  b.bar.destroy();
});

test('모드를 바꾸면 접기 단계를 다시 셈한다', () => {
  const a = setupMode(900, '2d');
  expect(a.inMore('#seg3d')).toBe(true);
  a.state.mode = 'iso';
  a.bar.sync();
  expect(a.inMore('#seg3d')).toBe(false);          // 3D로 오면 3D 묶음이 바로 돌아온다
  expect(a.inMore('#segLock')).toBe(true);
  a.state.mode = '2d';
  a.bar.sync();
  expect(a.inMore('#seg3d')).toBe(true);
  expect(a.inMore('#segLock')).toBe(false);
  a.bar.destroy();
});

// §17.2: 더보기 팝오버가 "보기"·"도움말" 팝오버와 **같은 수치**를 만족한다.
// 18은 컨트롤 수가 아니라 **이탈 0을 재는 반복 횟수**다(감사 §27이 쓴 자와 같은 수). 이 파일의
// 폭 스텁(`measure: () => ({ ...size })`)은 상수라 3단계까지 접히고 3D 전용 묶음은 `hidden`이므로
// 팝오버 안의 실제 컨트롤은 다섯 남짓이고, Tab은 그 사이를 몇 바퀴 돈다 — 재는 것은 바퀴 수가
// 아니라 "18번 중 밖으로 나간 횟수가 0"이다(사전 검토 M-7).
test('더보기 팝오버 안에서 Tab 18번이 한 번도 밖으로 나가지 않는다', () => {
  const { bar, size, more } = setup();
  size.scrollWidth = 1100; size.clientWidth = 900;
  bar.sync();
  const btn = document.querySelector('#btnBottomMore');
  btn.focus();
  btn.click();
  expect(more.contains(document.activeElement)).toBe(true);
  let out = 0;
  for (let i = 0; i < 18; i++) {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
    if (!more.contains(document.activeElement)) out += 1;
  }
  expect(out).toBe(0);
  bar.destroy();
});

test('Shift+Tab도 팝오버 안에서 돈다', () => {
  const { bar, size, more } = setup();
  size.scrollWidth = 1100; size.clientWidth = 900;
  bar.sync();
  document.querySelector('#btnBottomMore').click();
  const first = document.activeElement;
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true }));
  expect(more.contains(document.activeElement)).toBe(true);
  expect(document.activeElement).not.toBe(first);            // 마지막 컨트롤로 감았다
  bar.destroy();
});

test('바깥 클릭으로 닫아도 포커스가 더보기 버튼으로 돌아온다', () => {
  const { bar, size, more } = setup();
  size.scrollWidth = 1100; size.clientWidth = 900;
  bar.sync();
  const btn = document.querySelector('#btnBottomMore');
  btn.click();
  expect(more.contains(document.activeElement)).toBe(true);
  document.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
  expect(more.classList.contains('open')).toBe(false);
  expect(document.activeElement).toBe(btn);                  // 레일로 떨어지지 않는다(감사 §4)
  bar.destroy();
});

test('팝오버가 닫혀 있으면 Tab을 가로채지 않는다', () => {
  const { bar, size } = setup();
  size.scrollWidth = 1100; size.clientWidth = 900;
  bar.sync();
  const ev = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
  document.dispatchEvent(ev);
  expect(ev.defaultPrevented).toBe(false);                   // 앱의 평소 탭 순서 그대로다
  bar.destroy();
});

test('숨은 컨트롤은 트랩 목록에 들어가지 않는다', () => {
  const { bar, size, more } = setup();
  size.scrollWidth = 1100; size.clientWidth = 900;
  bar.sync();
  document.querySelector('#btnBottomMore').click();
  const list = focusables(more);
  expect(list.length).toBeGreaterThan(0);
  // 걸러낼 것이 실제로 있는지 **먼저** 확인한다: 팝오버 안에 숨은 버튼이 하나도 없으면
  // "목록에 숨은 것이 없다"는 focusables의 정의를 되풀이할 뿐 아무것도 보증하지 않는다(리뷰 M-4).
  const hidden = [...more.querySelectorAll('button')].filter(b => b.hidden || b.closest('[hidden]'));
  expect(hidden.length).toBeGreaterThan(0);                  // 2D에서 숨은 카메라·햇빛·기즈모 버튼
  for (const b of hidden) expect(list).not.toContain(b);
  expect(list).toContain(document.activeElement);            // 연 순간의 포커스도 그 목록의 첫 요소다
  bar.destroy();
});

// 리뷰 C-1: 팝오버가 열린 채 대화상자가 뜨면(팝오버 안에서 [B] 배경 · [Ctrl+,] 설정을 누르는 길이
// 열려 있다) [Tab]의 주인은 대화상자다. bottomBar의 캡처 리스너가 먼저 등록돼 있어 가드가 없으면
// 포커스를 팝오버로 끌어오고, 뒤이어 도는 focusTrap은 "내 것이 아니다"로 보고 물러났다.
test('팝오버 위에 대화상자가 뜨면 [Tab]은 대화상자 안에서 돈다', () => {
  const { bar, size, more } = setup();
  size.scrollWidth = 1100; size.clientWidth = 900;
  bar.sync();
  document.querySelector('#btnBottomMore').click();
  expect(more.contains(document.activeElement)).toBe(true);
  const modal = document.createElement('div');
  modal.innerHTML = '<button id="m1">하나</button><button id="m2">둘</button>';
  document.body.appendChild(modal);
  const trap = focusTrap(modal);                             // 대화상자들이 쓰는 그 함수다(dialogBase)
  expect(modal.contains(document.activeElement)).toBe(true);
  for (let i = 0; i < 3; i++) document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
  expect(modal.contains(document.activeElement)).toBe(true); // 팝오버로 새지 않는다
  expect(document.activeElement.id).toBe('m2');              // 두 버튼 사이를 돈다(m1 → m2 → m1 → m2)
  expect(more.classList.contains('open')).toBe(true);        // 팝오버는 뒤에 그대로 열려 있다
  trap.destroy();
  bar.destroy();
});
