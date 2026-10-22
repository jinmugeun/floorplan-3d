// 계획 19 Task 2: 카탈로그 '타일' 18종(기존 4 + 새 14) · 렌더 필드(tiles · metalness · grout) · 반복 식(tileSheet) · 텍스처 파일 정합 · 첫 다운로드.
// node 환경 — 사진 도착은 가짜 document + TextureLoader.loadAsync 대역(4×4 Texture)으로 만든다(tests/floorCoating3d.test.js와 같다).
import { describe, test, expect, vi, afterEach } from 'vitest';
import * as THREE from 'three';
import { statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { MATERIALS, materialById, materialsIn, photoDirs, sharesColorMap, DEFAULT_GROUT } from '../src/materials/catalog.js';
import { tileSheet, applyAssignment, photoTextures, __resetPhotos } from '../src/materials/texture.js';

const TEX = fileURLToPath(new URL('../public/textures/', import.meta.url));
// [id, 이름, 코드, 단가] — 기존 4종(TL-01~04)은 main 8dc5185와 같다(설계 §3)
const TABLE = [
  ['tile-white-300', '화이트 타일 300', 'TL-01', 42000],
  ['tile-gray-600', '그레이 포세린 600', 'TL-02', 58000],
  ['tile-mosaic-100', '모자이크 타일 100', 'TL-03', 66000],
  ['tile-hex-black', '블랙 헥사 타일', 'TL-04', 70000],
  ['tile-white-25', '화이트 유광 25 모자이크', 'TL-05', 60000],
  ['tile-black-25', '블랙 유광 25 모자이크', 'TL-06', 60000],
  ['tile-mint-25', '민트 유광 25 모자이크', 'TL-07', 60000],
  ['tile-bluemix-25', '블루믹스 유광 25 모자이크', 'TL-08', 60000],
  ['tile-white-matte-48', '화이트 무광 48 모자이크', 'TL-09', 60000],
  ['tile-lightgray-48', '연그레이 유광 48 모자이크', 'TL-10', 60000],
  ['tile-ivory-48', '아이보리 유광 48 모자이크', 'TL-11', 60000],
  ['tile-checkmix-48', '체크믹스 유광 48 모자이크', 'TL-12', 60000],
  ['tile-mint-48', '민트 유광 48 모자이크', 'TL-13', 60000],
  ['tile-metal-48', '메탈실버 유광 48 모자이크', 'TL-14', 60000],
  ['tile-metal-emboss-48', '메탈실버 엠보 48 모자이크', 'TL-15', 60000],
  ['tile-skyblue-97', '연하늘 유광 97 모자이크', 'TL-16', 60000],
  ['tile-deepgray-97', '딥그레이 유광 97 모자이크', 'TL-17', 60000],
  ['tile-hex-white-50', '화이트 무광 육각 50 모자이크', 'TL-18', 60000],
];
const tiles = () => materialsIn('타일');
// 생성 도구(tools/look/tile-textures.mjs LAYOUTS)의 한 장 크기(mm) — 거칠기 폴더로 찾는다
const SHEET = { 'tile-sq25': [400, 400], 'tile-sq48': [400, 400], 'tile-sq97': [800, 800], 'tile-hex50': [363.73, 420], 'tile-lg300': [600, 600], 'tile-lg600': [1200, 1200] };
// 앱이 까는 배율(2026-10-22): sq25는 도구가 간격 25 mm(조각 23 + 줄눈 2)로 그린 장을 간격 27 mm로 깐다 — 상품 상세의 25 mm 계열은 조각이 2.5 cm이고
// 한 장(약 297 mm)에 11×11이다. 그래서 조각 24.8 + 줄눈 2.2 mm가 된다. 나머지 배열은 도구의 한 장 그대로다.
const LAID = { 'tile-sq25': 27 / 25 };
const TILE_25 = ['tile-white-25', 'tile-black-25', 'tile-mint-25', 'tile-bluemix-25'];
const toLin = c => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const albedo = hex => { const a = [1, 3, 5].map(i => toLin(parseInt(hex.slice(i, i + 2), 16))), mx = Math.max(...a); return mx > 0.92 ? a.map(v => v * 0.92 / mx) : a; };
const assign = (id, patch = {}) => ({ id, offset: [0, 0], angle: 0, ...patch });
const flush = () => new Promise(r => setTimeout(r, 0));
async function arrive(...ids) {
  vi.spyOn(THREE.TextureLoader.prototype, 'loadAsync').mockImplementation(() => Promise.resolve(new THREE.Texture({ width: 4, height: 4 })));
  globalThis.document = {};
  for (const id of ids) photoTextures(materialById(id));
  await flush();
}
const painted = (id, patch = {}, opts = {}) => { const m = new THREE.MeshStandardMaterial(); applyAssignment(m, assign(id, patch), null, { worldUv: true, kind: 'wall', ...opts }); return m; };
afterEach(() => { delete globalThis.document; vi.restoreAllMocks(); __resetPhotos(); });

describe('카탈로그 타일 18종', () => {
  test('기존 4종이 먼저(id·이름·코드·단가 그대로), 새 14종은 TL-05~18 · 임시 단가 60,000원/m²', () => {
    expect(tiles().map(m => [m.id, m.name, m.code, m.pricePerM2])).toEqual(TABLE);
    expect(tiles()[0].id).toBe('tile-white-300');                               // 타일 배치·영역 편집기의 첫 타일(급식실 벽 기본)
    expect(new Set(MATERIALS.map(m => m.code)).size).toBe(MATERIALS.length);
  });

  test('렌더 필드 범위: tiles 양의 정수 둘 · tint 셋(≥ 0) · roughness 1~6 · normalScale 1 · gloss (0, 1] · 금속은 metalness 1 + 환경 맵 · grout 없음', () => {
    for (const m of tiles()) {
      expect(m.pattern, m.id).toBe('tile');
      expect(m.tiles, m.id).toHaveLength(2);
      for (const n of m.tiles) expect(Number.isInteger(n) && n > 0, m.id).toBe(true);
      expect(m.tint, m.id).toHaveLength(3);
      for (const v of m.tint) expect(v, m.id).toBeGreaterThanOrEqual(0);
      expect(m.roughness, m.id).toBeGreaterThanOrEqual(1);
      expect(m.roughness, m.id).toBeLessThanOrEqual(6);
      expect(m.normalScale, m.id).toBe(1);
      expect(m.gloss, m.id).toBeGreaterThan(0);
      expect(m.gloss, m.id).toBeLessThanOrEqual(1);
      if (m.metalness !== undefined) expect([m.id, m.metalness, m.gloss]).toEqual([m.id, 1, 0.9]);
      expect(m.grout, m.id).toBeUndefined();
    }
    expect(tiles().filter(m => m.metalness).map(m => m.id)).toEqual(['tile-metal-48', 'tile-metal-emboss-48']);
    expect(DEFAULT_GROUT).toBe('#d4d1ca');
  });

  test('광택: 진한 단색 유광 0.15(블랙 25 · 블랙 헥사 · 딥그레이 97) · 그 밖의 유광 0.3 · 무광 0.1(면 거칠기 0.55 · 대형 0.60)', () => {
    const by = g => tiles().filter(m => m.gloss === g && !m.metalness).map(m => m.id).sort();
    expect(by(0.15)).toEqual(['tile-black-25', 'tile-deepgray-97', 'tile-hex-black']);
    expect(by(0.1)).toEqual(['tile-gray-600', 'tile-hex-white-50', 'tile-white-matte-48']);
    expect(by(0.3)).toEqual(['tile-bluemix-25', 'tile-checkmix-48', 'tile-ivory-48', 'tile-lightgray-48', 'tile-mint-25', 'tile-mint-48', 'tile-mosaic-100', 'tile-skyblue-97', 'tile-white-25', 'tile-white-300']);
    expect(materialById('tile-gray-600').roughness).toBe(6);
    expect(materialById('tile-white-matte-48').roughness).toBe(5.5);
    expect(materialById('tile-white-300').roughness).toBe(1.2);
  });

  test('한 장 크기(scale × tiles)는 생성 도구 배열의 한 장 × 까는 배율이다(육각은 45.47 × 8 ≈ 363.73 · sq25는 27/25)', () => {
    for (const m of tiles()) {
      const dir = photoDirs(m).rough, k = LAID[dir] ?? 1, want = SHEET[dir].map(v => v * k), got = tileSheet(m, m.scale);
      expect(got[0], m.id).toBeCloseTo(want[0], 0);
      expect(got[1], m.id).toBeCloseTo(want[1], 6);
    }
    expect(materialById('tile-hex-black').scale).toEqual([45.47, 52.5]);       // 옛 200 mm 사각 → 50 mm 육각(설계 §3)
  });

  test('25 mm 계열은 상품 상세대로 간격 27 mm(조각 2.5 cm · 한 장 약 297 mm에 11×11) · 한 장 432 mm', () => {
    for (const id of TILE_25) {
      expect(materialById(id).scale, id).toEqual([27, 27]);
      expect(tileSheet(materialById(id), materialById(id).scale), id).toEqual([432, 432]);
    }
    expect(27 * 11).toBe(297);
    expect(23 * (27 / 25)).toBeCloseTo(24.84, 2);                              // 도구의 조각 23 mm → 깔린 조각
  });

  test('tint = 표본 albedo ÷ 0.80(0.92 상한) — 단색은 base가 표본이다 · 섞음은 1/0.9 · 금속은 F0 ÷ 0.80', () => {
    const own = m => photoDirs(m).color !== photoDirs(m).rough;
    for (const m of tiles().filter(x => !own(x) && !x.metalness)) {
      albedo(m.base).forEach((a, i) => expect(m.tint[i], `${m.id}[${i}]`).toBeCloseTo(a / 0.8, 4));
    }
    for (const id of ['tile-bluemix-25', 'tile-checkmix-48']) expect(materialById(id).tint).toEqual([1.1111, 1.1111, 1.1111]);
    expect(materialById('tile-metal-48').tint.map(v => +(v * 0.8).toFixed(2))).toEqual([0.62, 0.63, 0.64]);
    expect(materialById('tile-mosaic-100')).toMatchObject({ base: '#efeff0', tint: [1.0789, 1.0789, 1.0892] });   // C02 #e7e7e9 → 최대 채널 240
    expect(materialById('tile-hex-black')).toMatchObject({ base: '#0d0c0f', tint: [0.005, 0.0046, 0.006], gloss: 0.15 });   // G10
  });

  test('사진 폴더의 세 장이 public/textures에 있고, 재질 하나의 첫 다운로드 ≤ 500 KB(섞음 · 엠보 포함)', () => {
    let most = 0;
    for (const m of tiles()) {
      const d = photoDirs(m), files = [`${d.color}/color.webp`, `${d.normal}/normal.webp`, `${d.rough}/rough.webp`];
      const bytes = files.reduce((s, f) => s + statSync(`${TEX}${f}`).size, 0);
      expect(bytes, m.id).toBeLessThanOrEqual(500 * 1024);
      most = Math.max(most, bytes);
    }
    expect(most).toBe(190858);                                                 // 엠보: sq48 색·거칠기 + 엠보 법선(시안 report)
  });

  test('배열 공용 색 지도는 sharesColorMap 참(25 · 48 · 97 · 육각), 섞음·대형 단독 지도는 거짓', () => {
    expect(tiles().filter(sharesColorMap).map(m => m.id)).toEqual([
      'tile-mosaic-100', 'tile-hex-black', 'tile-white-25', 'tile-black-25', 'tile-mint-25', 'tile-white-matte-48', 'tile-lightgray-48', 'tile-ivory-48',
      'tile-mint-48', 'tile-metal-48', 'tile-metal-emboss-48', 'tile-skyblue-97', 'tile-deepgray-97', 'tile-hex-white-50',
    ]);
  });
});

describe('반복 식 — 1000 / (scale × tiles)', () => {
  test('tileSheet: 한 장 = 조각 간격 × tiles · 덮어쓰기 scale도 같은 비율 · tiles 없는 재질은 scale 그대로', () => {
    expect(tileSheet(materialById('tile-white-25'), [27, 27])).toEqual([432, 432]);
    expect(tileSheet(materialById('tile-white-25'), [100, 100])).toEqual([1600, 1600]);   // 덮어쓰기 100 mm → 줄눈 폭도 100/27배
    expect(tileSheet(materialById('tile-hex-white-50'), [45.47, 52.5])[1]).toBe(420);
    const sc = [1200, 190];
    expect(tileSheet(materialById('wood-oak'), sc)).toBe(sc);
  });

  test('사진이 오면 반복·offset은 한 장 기준(월드 uv) — 같은 배열의 다른 색은 같은 공유 복제본', async () => {
    await arrive('tile-white-25', 'tile-black-25', 'tile-hex-black', 'tile-white-300');
    const w = painted('tile-white-25', { offset: [100, 50] });
    expect(w.map.repeat.x).toBeCloseTo(1000 / 432, 9);
    expect(w.map.offset.x).toBeCloseTo(100 / 432, 9);
    expect(w.map.offset.y).toBeCloseTo(50 / 432, 9);
    expect(painted('tile-black-25', { offset: [100, 50] }).map).toBe(w.map);
    const hex = painted('tile-hex-black');
    expect(hex.map.repeat.x).toBeCloseTo(1000 / (45.47 * 8), 9);
    expect(hex.map.repeat.y).toBeCloseTo(1000 / 420, 9);
    expect(painted('tile-white-25', { scale: [100, 100] }).map.repeat.x).toBeCloseTo(1000 / 1600, 9);
    const face = new THREE.MeshStandardMaterial();
    applyAssignment(face, assign('tile-white-300'), [3000, 2400], { kind: 'wall' });    // 0~1 uv: 면 크기 ÷ 한 장(600)
    expect([face.map.repeat.x, face.map.repeat.y]).toEqual([5, 4]);
  });
});
