// @vitest-environment jsdom
// §14.3: 1600 px에서도 하단 바가 넘쳐 가로·세로 스크롤바가 동시에 생겼다.
// 넘치면 3D 전용 묶음을 "더보기 ▾" 팝오버로 접고, 64 px 여유가 생겨야 다시 펼친다(히스테리시스).
import { test, expect } from 'vitest';
import { createBottomBar, compactNext, BOTTOM_HYSTERESIS } from '../src/ui/bottomBar.js';
import { shellHtml } from '../src/ui/shellHtml.js';

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

test('넘치면 3D 전용 묶음이 더보기로 들어가고 여유가 생기면 제자리로 돌아온다', () => {
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

test('도면 잠금은 3D 전용이 아니므로 접히지 않는다', () => {
  const { bar, size, bottom } = setup();
  const lock = document.querySelector('#btnLock');
  expect(lock.closest('[data-overflow]')).toBeNull();
  size.scrollWidth = 1100; size.clientWidth = 900;
  bar.sync();
  expect(bar.isCompact()).toBe(true);
  expect(lock.closest('#bottomMore')).toBeNull();
  expect(bottom.contains(lock)).toBe(true);
  bar.destroy();
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
