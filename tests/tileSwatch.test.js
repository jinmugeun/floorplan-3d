// 계획 19 Task 4: 타일 견본 — 줄눈이 base 색을 받지 않는다(검정 견본에도 밝은 격자) · 섞음은 색 지도 그대로 · 메탈은 회색 금속 톤.
// node 환경 — Image·캔버스는 가짜다(tests/floorSwatch.test.js와 같은 방식).
import { test, expect, afterEach } from 'vitest';
import { materialById, materialsIn, tileGridSwatch, DEFAULT_GROUT } from '../src/materials/catalog.js';
import { tileSwatchParts } from '../src/materials/pattern.js';
import { drawSwatch, SWATCH_PX } from '../src/ui/materialPanel.js';

const flush = () => new Promise(r => setTimeout(r, 0));
function recCanvas() {   // 채우기·선·그림 호출을 차례로 적는 가짜 2D 컨텍스트
  const log = [];
  const ctx = {
    set fillStyle(v) { log.push(['fillStyle', v]); }, set strokeStyle(v) { log.push(['strokeStyle', v]); }, set lineWidth(v) { log.push(['lineWidth', v]); },
    set globalCompositeOperation(v) { log.push(['op', v]); },
    fillRect: (...a) => log.push(['fillRect', ...a]), beginPath() {}, moveTo: (...a) => log.push(['moveTo', ...a]), lineTo: (...a) => log.push(['lineTo', ...a]), stroke() {}, arc() {}, fill() {},
    drawImage: (...a) => log.push(['drawImage', ...a]),
  };
  return { width: 0, height: 0, getContext: () => ctx, log };
}
let made = [];
function fakeImage() {
  made = [];
  globalThis.Image = class { constructor() { made.push(this); } set src(v) { this._src = v; queueMicrotask(() => this.onload?.()); } get src() { return this._src; } };
}
afterEach(() => { delete globalThis.Image; });
const lum = hex => { const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const lines = parts => parts.filter(p => p.t === 'line');

test('격자 견본 대상: 배열 공용 색 지도를 쓰는 16종(메탈 포함) — 섞음 둘과 타일 아닌 재질은 아니다', () => {
  expect(materialsIn('타일').filter(m => !tileGridSwatch(m)).map(m => m.id)).toEqual(['tile-bluemix-25', 'tile-checkmix-48']);
  for (const id of ['mma-gray', 'ucrete-ud200-red', 'paint-white', 'steel-embossed']) expect(tileGridSwatch(materialById(id)), id).toBe(false);
});

test('tileSwatchParts: base 바탕 + 줄눈색 격자 — 칸 수는 약 200 mm(25 계열 간격 27 → 7 · 48 → 4 · 육각 → 4 · 97 → 2 · 대형 → 2) · 선 굵기 px/48', () => {
  const black = tileSwatchParts(materialById('tile-black-25'), SWATCH_PX);
  expect(black[0]).toEqual({ t: 'rect', x: 0, y: 0, w: SWATCH_PX, h: SWATCH_PX, fill: '#1c1c19' });
  expect(lines(black)).toHaveLength(8 * 2);
  expect(lines(black).every(p => p.fill === DEFAULT_GROUT && p.lw === 2)).toBe(true);
  expect(lines(black)[1]).toEqual({ t: 'line', x1: SWATCH_PX / 7, y1: 0, x2: SWATCH_PX / 7, y2: SWATCH_PX, fill: DEFAULT_GROUT, lw: 2 });
  const n = id => lines(tileSwatchParts(materialById(id), SWATCH_PX)).length / 2 - 1;
  expect(['tile-black-25', 'tile-mint-48', 'tile-hex-black', 'tile-skyblue-97', 'tile-white-300', 'tile-gray-600'].map(n)).toEqual([7, 4, 4, 2, 2, 2]);
  expect(lines(tileSwatchParts({ ...materialById('tile-black-25'), grout: '#ffffff' }, SWATCH_PX)).every(p => p.fill === '#ffffff')).toBe(true);
});

test('검정·진한 견본은 격자가 바탕보다 밝다(줄눈이 base를 받지 않는다) · 흰 견본은 옅은 회색 격자', () => {
  for (const id of ['tile-black-25', 'tile-hex-black', 'tile-deepgray-97']) expect(lum(DEFAULT_GROUT), id).toBeGreaterThan(lum(materialById(id).base) + 60);
  expect(lum(DEFAULT_GROUT)).toBeLessThan(lum(materialById('tile-white-25').base));
});

test('drawSwatch: 단색·메탈 타일은 사진을 받지 않고 base + 격자를 그린다 · 섞음은 지도를 받아 그대로 덮는다(곱하지 않음)', async () => {
  fakeImage();
  const black = recCanvas(), metal = recCanvas(), mix = recCanvas();
  drawSwatch(black, materialById('tile-black-25'));
  drawSwatch(metal, materialById('tile-metal-48'));
  drawSwatch(mix, materialById('tile-bluemix-25'));
  await flush();
  expect(made.map(i => i.src)).toEqual(['textures/tile-sq25-bluemix/color.webp']);
  expect(black.log.slice(0, 4)).toEqual([['fillStyle', '#1c1c19'], ['fillRect', 0, 0, SWATCH_PX, SWATCH_PX], ['strokeStyle', DEFAULT_GROUT], ['lineWidth', 2]]);
  expect(black.log.filter(e => e[0] === 'strokeStyle').every(e => e[1] === DEFAULT_GROUT)).toBe(true);
  expect(black.log.some(e => e[0] === 'drawImage' || e[0] === 'op')).toBe(false);
  expect(metal.log[0]).toEqual(['fillStyle', '#dfe3e6']);                              // 회색 금속 톤(미러 스테인리스 SS-02 바탕)
  expect(metal.log.some(e => e[0] === 'drawImage')).toBe(false);
  expect(mix.log.at(-1)).toEqual(['drawImage', made[0], 0, 0, SWATCH_PX, SWATCH_PX]);
  expect(mix.log.some(e => e[0] === 'op')).toBe(false);
});
