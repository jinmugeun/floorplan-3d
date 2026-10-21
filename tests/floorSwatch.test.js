// 계획 18 Task 4: 마감재 견본 — 색 지도를 여러 재질이 나눠 쓰면(UD200 흰 바탕 지도) base 위에 곱해 그린다(설계 §4).
// MMA는 색마다 지도가 따로 있어 그대로 덮고, 사진 없는 MF는 무늬(solid = base)만. node 환경 — Image·캔버스는 가짜다.
import { test, expect, afterEach } from 'vitest';
import { materialById } from '../src/materials/catalog.js';
import { drawSwatch, paintSwatchPhoto, SWATCH_PX } from '../src/ui/materialPanel.js';

const flush = () => new Promise(r => setTimeout(r, 0));
// 캔버스 호출을 차례로 적는 가짜 2D 컨텍스트(drawPattern이 쓰는 것 + 합성 모드)
function recCanvas() {
  const log = [];
  const ctx = {
    set fillStyle(v) { log.push(['fillStyle', v]); }, set strokeStyle(v) {}, set lineWidth(v) {},
    set globalCompositeOperation(v) { log.push(['op', v]); },
    fillRect: (...a) => log.push(['fillRect', ...a]), beginPath() {}, moveTo() {}, lineTo() {}, stroke() {}, arc() {}, fill() {},
    drawImage: (...a) => log.push(['drawImage', ...a]),
  };
  return { width: 0, height: 0, getContext: () => ctx, log };
}
let made = [];
function fakeImage() {   // src를 넣으면 다음 마이크로태스크에 load
  made = [];
  globalThis.Image = class { constructor() { made.push(this); } set src(v) { this._src = v; queueMicrotask(() => this.onload?.()); } get src() { return this._src; } };
}
afterEach(() => { delete globalThis.Image; });
const multiplied = (img, base) => [['fillStyle', base], ['fillRect', 0, 0, SWATCH_PX, SWATCH_PX], ['op', 'multiply'], ['drawImage', img, 0, 0, SWATCH_PX, SWATCH_PX], ['op', 'source-over']];

test('UD200은 흰 바탕 지도 한 장을 받아 색마다 base 위에 곱해 그린다(도착 전 견본도 · 도착 뒤 견본도)', async () => {
  fakeImage();
  const cream = recCanvas(), red = recCanvas();
  drawSwatch(cream, materialById('ucrete-ud200-cream'));
  drawSwatch(red, materialById('ucrete-ud200-red'));
  await flush();
  expect(made.map(i => i.src)).toEqual(['textures/ud200/color.webp']);   // 폴더당 한 번
  expect(cream.log.slice(-5)).toEqual(multiplied(made[0], '#e9d89f'));
  expect(red.log.slice(-5)).toEqual(multiplied(made[0], '#9d4f42'));
  const late = recCanvas();
  drawSwatch(late, materialById('ucrete-ud200-green'));
  expect(late.log.slice(-5)).toEqual(multiplied(made[0], '#5a7e48'));
});

test('MMA는 색 지도를 그대로 덮고(곱하지 않음), 사진 없는 MF는 무늬(solid = base)만 그린다', async () => {
  fakeImage();
  const gray = recCanvas(), mf = recCanvas();
  drawSwatch(gray, materialById('mma-gray'));
  drawSwatch(mf, materialById('ucrete-mf-red'));
  await flush();
  expect(made.map(i => i.src)).toEqual(['textures/mma-gray/color.webp']);
  expect(gray.log.at(-1)).toEqual(['drawImage', made[0], 0, 0, SWATCH_PX, SWATCH_PX]);
  expect(gray.log.some(e => e[0] === 'op')).toBe(false);
  expect(mf.log).toEqual([['fillStyle', '#a04836'], ['fillRect', 0, 0, SWATCH_PX, SWATCH_PX]]);
});

test('paintSwatchPhoto: 나눠 쓰는 지도만 곱하고 합성 모드를 source-over로 되돌린다', () => {
  const img = {}, a = recCanvas(), b = recCanvas();
  paintSwatchPhoto(a.getContext(), img, materialById('ucrete-ud200-gray'));
  paintSwatchPhoto(b.getContext(), img, materialById('epoxy-chip-gray'));
  expect(a.log).toEqual(multiplied(img, '#87847c'));
  expect(b.log).toEqual([['drawImage', img, 0, 0, SWATCH_PX, SWATCH_PX]]);
});
