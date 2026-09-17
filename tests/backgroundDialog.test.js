// @vitest-environment jsdom
import { test, expect, vi, beforeEach } from 'vitest';
import { createStore } from '../src/state/store.js';
import { createEmptyProject } from '../src/state/schema.js';
import { openBackgroundDialog } from '../src/ui/backgroundDialog.js';

// jsdom에는 이미지 디코더와 2D 컨텍스트가 없다. loadImageFile만 가짜 캔버스로 대체하고
// 나머지(cropCanvas 등)는 실제 구현을 그대로 쓴다.
function stubCanvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
vi.mock('../src/io/image.js', async importOriginal => {
  const real = await importOriginal();
  return { ...real, loadImageFile: async () => stubCanvas(400, 300) };
});

beforeEach(() => {
  HTMLCanvasElement.prototype.getContext = () => new Proxy({}, {
    get: (t, k) => {
      if (k === 'getImageData') return (x, y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h });
      if (k === 'createImageData') return (w, h) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h });
      if (k === 'measureText') return () => ({ width: 10 });
      return () => {};
    },
    set: () => true,
  });
  HTMLCanvasElement.prototype.toDataURL = () => 'data:,';
});

test('rejects files over 10MB or of the wrong type with a message, and close removes the modal', () => {
  HTMLCanvasElement.prototype.getContext = () => new Proxy({}, { get: () => () => {} });
  const store = createStore(createEmptyProject());
  const dlg = openBackgroundDialog({ store });
  const input = document.querySelector('.modal [name="file"]');
  const err = document.querySelector('.modal [name="error"]');
  expect(err.hidden).toBe(true);
  const big = new File([new Uint8Array(10 * 1024 * 1024 + 1)], 'big.jpg', { type: 'image/jpeg' });
  Object.defineProperty(input, 'files', { value: [big], configurable: true });
  input.dispatchEvent(new Event('change', { bubbles: true }));
  expect(err.hidden).toBe(false);
  expect(err.textContent).toContain('10MB');
  const pdf = new File([new Uint8Array(10)], 'plan.pdf', { type: 'application/pdf' });
  Object.defineProperty(input, 'files', { value: [pdf], configurable: true });
  input.dispatchEvent(new Event('change', { bubbles: true }));
  expect(err.textContent).toContain('PNG');
  expect(store.get().background).toBeNull();
  dlg.close();
  expect(document.querySelector('.modal')).toBeNull();
});

test('cropCanvas clamps the rectangle to the source', async () => {
  const { cropCanvas } = await import('../src/io/image.js');
  const src = document.createElement('canvas'); src.width = 100; src.height = 80;
  const out = cropCanvas(src, [90, 70, 50, 50]);
  expect(out.width).toBe(10); expect(out.height).toBe(10);
  const neg = cropCanvas(src, [-20, -20, 30, 30]);
  expect(neg.width).toBe(10); expect(neg.height).toBe(10);
  const tiny = cropCanvas(src, [10.6, 10.4, 0, 0]); // 소수 입력
  expect(tiny.width).toBe(1); expect(tiny.height).toBe(1);
  const whole = cropCanvas(src, [-5.5, -5.25, 200.5, 200.75]); // 소수 좌표, 원본보다 크다
  expect(whole.width).toBe(100); expect(whole.height).toBe(80);
});

test('the dialog has a crop step between orientation and rectification', () => {
  const store = createStore(createEmptyProject());
  const dlg = openBackgroundDialog({ store });
  const modal = document.querySelector('.modal');
  expect(modal.querySelector('[data-step="crop"]')).not.toBeNull();
  expect(modal.querySelector('[name="cropApply"]')).not.toBeNull();
  expect(modal.querySelector('[name="cropAll"]')).not.toBeNull();
  expect(modal.querySelector('[data-step="crop"]').hidden).toBe(true); // 이미지를 올린 뒤에 보인다
  dlg.close();
});

// step이 숫자에서 문자열로 바뀌었으므로 네 점 보정 → 두 점 축척 경로가 살아 있는지 통째로 확인한다.
test('four corner clicks rectify the image and the two-point scale step still writes the background', async () => {
  const store = createStore(createEmptyProject());
  openBackgroundDialog({ store });
  const modal = document.querySelector('.modal');
  const input = modal.querySelector('[name="file"]');
  const png = new File([new Uint8Array(8)], 'plan.png', { type: 'image/png' });
  Object.defineProperty(input, 'files', { value: [png], configurable: true });
  input.dispatchEvent(new Event('change', { bubbles: true }));
  await vi.waitFor(() => expect(modal.querySelector('[data-step="crop"]').hidden).toBe(false)); // ①' 영역 설정
  modal.querySelector('[name="cropAll"]').click();                                             // 전체 사용 → ① 보정
  expect(modal.querySelector('[data-step="1"]').hidden).toBe(false);

  const cv = modal.querySelector('[name="preview"]');
  cv.getBoundingClientRect = () => ({ left: 0, top: 0, width: 900, height: 600 });
  const click = (x, y) => cv.dispatchEvent(new MouseEvent('click', { clientX: x, clientY: y, bubbles: true }));
  click(10.5, 10.25); click(310.5, 12.25); click(308.5, 212.25); click(12.5, 210.25); // 좌상 → 우상 → 우하 → 좌하, 소수 좌표
  expect(modal.querySelector('[data-step="2"]').hidden).toBe(false); // step === '2' 로 넘어갔다
  expect(modal.querySelector('[data-step="1"]').hidden).toBe(true);
  expect(modal.querySelector('[data-step="crop"]').hidden).toBe(true);

  click(20, 20); click(120, 20); // 축척용 두 점
  const mm = modal.querySelector('[name="mm"]');
  mm.value = '1000'; mm.dispatchEvent(new Event('input', { bubbles: true }));
  expect(modal.querySelector('[name="apply"]').disabled).toBe(false);
  modal.querySelector('[name="apply"]').click();
  expect(store.get().background.scale).toBeGreaterThan(0);
  expect(document.querySelector('.modal')).toBeNull();
});

test('the dialog takes focus and the 회전/반전 toolbar is reachable in both the crop and the rectify step', async () => {
  const store = createStore(createEmptyProject());
  const dlg = openBackgroundDialog({ store });
  const modal = document.querySelector('.modal');
  expect(document.activeElement).toBe(modal.querySelector('[name="file"]')); // Escape 처리가 걸리도록 포커스를 가져온다
  const orient = modal.querySelector('[data-step="orient"]');
  expect(orient.querySelector('[name="rotL"]')).not.toBeNull();
  expect(orient.hidden).toBe(false); // ① 방향 맞추기
  const input = modal.querySelector('[name="file"]');
  const png = new File([new Uint8Array(8)], 'plan.png', { type: 'image/png' });
  Object.defineProperty(input, 'files', { value: [png], configurable: true });
  input.dispatchEvent(new Event('change', { bubbles: true }));
  await vi.waitFor(() => expect(modal.querySelector('[data-step="crop"]').hidden).toBe(false));
  expect(orient.hidden).toBe(false); // ①' 영역 지정 중에도 회전/반전을 쓸 수 있다
  modal.querySelector('[name="skip"]').click(); // 보정 생략 → ② 축척
  expect(modal.querySelector('[data-step="2"]').hidden).toBe(false);
  expect(orient.hidden).toBe(true); // 축척 단계에서는 사라진다
  dlg.close();
});
