// 계획 18 Task 2: '바닥 코팅' 묶음(그레이 칩 에폭시 + 15종) · 사진 폴더 해석(photoDirs) · URL마다 한 번 받는 로더 · 견본 폴더 · 텍스처 파일 정합.
// node 환경이라 document·Image가 없다 — 사진 받기는 가짜 document와 TextureLoader.loadAsync 대역으로 돌린다(tests/photoMaterial.test.js와 같다).
import { describe, test, expect, vi, afterEach } from 'vitest';
import * as THREE from 'three';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MATERIAL_CATEGORIES, MATERIAL_PATTERNS, MATERIALS, materialById, materialsIn, searchMaterials, photoDirs, photoKey, sharesColorMap } from '../src/materials/catalog.js';
import { photoTextures, onPhotoReady, __resetPhotos } from '../src/materials/texture.js';
import { drawSwatch } from '../src/ui/materialPanel.js';

const FC = '바닥 코팅';
const flush = () => new Promise(r => setTimeout(r, 0));
function fakeLoading() {
  const urls = [];
  vi.spyOn(THREE.TextureLoader.prototype, 'loadAsync').mockImplementation(url => { urls.push(url); return Promise.resolve(new THREE.Texture({ width: 4, height: 4 })); });
  globalThis.document = {};
  return urls;
}
afterEach(() => { delete globalThis.document; delete globalThis.Image; vi.restoreAllMocks(); __resetPhotos(); });

// 설계 §2 표 · 시안 result.json(tint 4자리)
const TABLE = [
  ['mma-darkgray', 'MMA 다크그레이', '#83868e', [1.0496, 1.0525, 1.0625]],
  ['mma-gray', 'MMA 그레이', '#bbbdc2', [1.132, 1.1291, 1.1334]],
  ['mma-black', 'MMA 블랙', '#414244', [0.6958, 0.6952, 0.7203]],
  ['mma-beige', 'MMA 베이지', '#a38661', [1.0627, 1.0601, 1.0392]],
  ['mma-yellow', 'MMA 옐로우', '#bab1a6', [1.1296, 1.1277, 1.131]],
  ['ucrete-ud200-yellow', 'Ucrete UD200 옐로우', '#bb913a', [0.6364, 0.3616, 0.0427]],
  ['ucrete-ud200-cream', 'Ucrete UD200 크림', '#e9d89f', [1.0645, 0.8905, 0.445]],
  ['ucrete-ud200-red', 'Ucrete UD200 레드', '#9d4f42', [0.431, 0.0897, 0.0588]],
  ['ucrete-ud200-green', 'Ucrete UD200 그린', '#5a7e48', [0.1205, 0.2619, 0.0734]],
  ['ucrete-ud200-gray', 'Ucrete UD200 그레이', '#87847c', [0.3047, 0.2891, 0.2545]],
  ['ucrete-mf-yellow', 'Ucrete MF 옐로우', '#e38a1d', [0.693, 0.2199, 0.0005]],
  ['ucrete-mf-cream', 'Ucrete MF 크림', '#dcc592', [0.6435, 0.4997, 0.2516]],
  ['ucrete-mf-red', 'Ucrete MF 레드', '#a04836', [0.312, 0.0468, 0.0209]],
  ['ucrete-mf-green', 'Ucrete MF 그린', '#38542e', [0.0236, 0.0688, 0.0125]],
  ['ucrete-mf-gray', 'Ucrete MF 그레이', '#7d7e86', [0.1774, 0.1781, 0.2074]],
];

describe('바닥 코팅 카탈로그', () => {
  test('테라조 다음 묶음이고 그레이 칩 에폭시 + 15종(MMA → UD200 → MF) · 코드 FC-01~15 · 임시 단가 45,000원', () => {
    expect(MATERIAL_CATEGORIES.indexOf(FC)).toBe(MATERIAL_CATEGORIES.indexOf('테라조') + 1);
    const list = materialsIn(FC);
    expect(list.map(m => m.id)).toEqual(['epoxy-chip-gray', ...TABLE.map(r => r[0])]);
    expect(list.slice(1).map(m => m.code)).toEqual(Array.from({ length: 15 }, (_, i) => `FC-${String(i + 1).padStart(2, '0')}`));
    for (const [id, name, base, tint] of TABLE) expect(materialById(id), id).toMatchObject({ name, base, tint, category: FC, maker: '오늘의집', pricePerM2: 45000 });
    expect(materialsIn('테라조').map(m => m.id)).not.toContain('epoxy-chip-gray');
  });

  test('그레이 칩 에폭시는 id·이름·코드·단가·base 그대로이고 법선·거칠기만 mma-grit(무광 · 거칠기 1 · 법선 1 · 광택 0.25)', () => {
    expect(materialById('epoxy-chip-gray')).toMatchObject({ name: '그레이 칩 에폭시', code: 'TZ-05', category: FC, base: '#a7a7a3', pricePerM2: 45000, scale: [1200, 1200],
      photo: { color: 'granite-gray', normal: 'mma-grit', rough: 'mma-grit' }, roughness: 1, normalScale: 1, gloss: 0.25 });
    expect(materialById('epoxy-chip-gray').tint).toBeUndefined();          // PHOTO_TINT 그대로
  });

  test('묶음마다 질감 값: MMA 칩 무늬·규사 무광 · UD200 거침(공용 사진) · MF 매끈(사진 없음)', () => {
    for (const m of materialsIn(FC).slice(1)) {
      expect(m.tint, m.id).toHaveLength(3);
      for (const v of m.tint) { expect(Number.isFinite(v), m.id).toBe(true); expect(v, m.id).toBeGreaterThanOrEqual(0); expect(v, m.id).toBeLessThanOrEqual(1.2); }
      expect(MATERIAL_PATTERNS, m.id).toContain(m.pattern);
      expect(m.scale[0], m.id).toBe(m.scale[1]);
    }
    for (const m of materialsIn(FC).filter(x => x.id.startsWith('mma-'))) {
      expect(m, m.id).toMatchObject({ pattern: 'speckle', scale: [1200, 1200], photo: { color: m.id, normal: 'mma-grit', rough: 'mma-grit' }, roughness: 1, normalScale: 1 });
      expect(m.gloss, m.id).toBeUndefined();                              // 환경 반사 없음(무광)
      expect(m.accent, m.id).not.toBe(m.base);                            // 진한 칩 색
    }
    for (const m of materialsIn(FC).filter(x => x.id.startsWith('ucrete-ud200-'))) expect(m, m.id).toMatchObject({ pattern: 'concrete', scale: [1000, 1000], photo: 'ud200', roughness: 1, normalScale: 1.8, gloss: 0.1 });
    for (const m of materialsIn(FC).filter(x => x.id.startsWith('ucrete-mf-'))) {
      expect(m, m.id).toMatchObject({ pattern: 'solid', scale: [1000, 1000], roughness: 0.6, gloss: 0.15 });
      expect(m.photo, m.id).toBeUndefined();
      expect(m.normalScale, m.id).toBeUndefined();
    }
  });

  test('검색: MMA 5 · Ucrete 10 · 코드 FC-01 · 바닥 코팅 16', () => {
    expect(searchMaterials('MMA')).toHaveLength(5);
    expect(searchMaterials('ucrete')).toHaveLength(10);
    expect(searchMaterials('FC-01').map(m => m.id)).toEqual(['mma-darkgray']);
    expect(searchMaterials('바닥 코팅')).toHaveLength(16);
  });
});

describe('photoDirs · photoKey · sharesColorMap', () => {
  test('문자열은 세 장이 한 폴더, 객체는 맵마다 폴더', () => {
    expect(photoDirs(materialById('ucrete-ud200-red'))).toEqual({ color: 'ud200', normal: 'ud200', rough: 'ud200' });
    expect(photoDirs(materialById('mma-beige'))).toEqual({ color: 'mma-beige', normal: 'mma-grit', rough: 'mma-grit' });
    expect(photoDirs({ photo: 'x' })).toEqual({ color: 'x', normal: 'x', rough: 'x' });
  });
  test('사진이 없거나 모양이 틀리면 null', () => {
    expect(photoDirs(materialById('ucrete-mf-red'))).toBeNull();
    expect(photoDirs(materialById('paint-white'))).toBeNull();
    expect(photoDirs(null)).toBeNull();
    expect(photoDirs({ photo: '' })).toBeNull();
    expect(photoDirs({ photo: { color: 'a', normal: 'b' } })).toBeNull();
    expect(photoDirs({ photo: { color: 'a', normal: 'b', rough: 3 } })).toBeNull();
  });
  test('photoKey는 색|법선|거칠기 · sharesColorMap은 색 지도를 나눠 쓰는 UD200만 참', () => {
    expect(photoKey(photoDirs(materialById('epoxy-chip-gray')))).toBe('granite-gray|mma-grit|mma-grit');
    expect(photoKey(photoDirs(materialById('ucrete-ud200-gray')))).toBe('ud200|ud200|ud200');
    expect(MATERIALS.filter(sharesColorMap).map(m => m.id)).toEqual(TABLE.map(r => r[0]).filter(id => id.startsWith('ucrete-ud200-')));
    expect(sharesColorMap({ photo: 'missing-photo' })).toBe(false);
  });
});

describe('사진 로더 — URL마다 한 번', () => {
  test('mma-grit 법선·거칠기는 MMA 여러 색과 그레이 칩 에폭시가 한 번만 받아 나눠 쓴다', async () => {
    const urls = fakeLoading();
    const seen = [];
    const off = onPhotoReady(k => seen.push(k));
    for (const id of ['epoxy-chip-gray', 'mma-gray', 'mma-black']) expect(photoTextures(materialById(id))).toBeNull();
    await flush();
    off();
    expect(urls).toEqual(['textures/granite-gray/color.webp', 'textures/mma-grit/normal.webp', 'textures/mma-grit/rough.webp', 'textures/mma-gray/color.webp', 'textures/mma-black/color.webp']);
    expect([...seen].sort()).toEqual(['granite-gray|mma-grit|mma-grit', 'mma-black|mma-grit|mma-grit', 'mma-gray|mma-grit|mma-grit']);
    const [e, g, b] = ['epoxy-chip-gray', 'mma-gray', 'mma-black'].map(id => photoTextures(materialById(id)));
    expect(g.normalMap).toBe(e.normalMap);                               // 같은 URL = 같은 원본 텍스처
    expect(b.roughnessMap).toBe(e.roughnessMap);
    expect(g.map).not.toBe(b.map);
    expect(g.map.colorSpace).toBe(THREE.SRGBColorSpace);
    expect(g.normalMap.colorSpace).not.toBe(THREE.SRGBColorSpace);       // 법선·거칠기는 색이 아니다
    expect(g.normalMap.wrapS).toBe(THREE.RepeatWrapping);
  });

  test('UD200 다섯 색은 세 장을 한 번 받고 같은 묶음을 쓴다 · 사진 없는 MF는 받지 않는다', async () => {
    const urls = fakeLoading();
    const ids = TABLE.map(r => r[0]).filter(id => id.startsWith('ucrete-ud200-'));
    for (const id of ids) photoTextures(materialById(id));
    expect(photoTextures(materialById('ucrete-mf-red'))).toBeNull();
    await flush();
    expect(urls).toEqual(['textures/ud200/color.webp', 'textures/ud200/normal.webp', 'textures/ud200/rough.webp']);
    const sets = ids.map(id => photoTextures(materialById(id)));
    for (const s of sets) expect(s).toBe(sets[0]);
  });

  test('받기에 실패한 URL을 쓰는 묶음은 한 번씩 경고하고 바탕색(null)으로 남는다', async () => {
    globalThis.document = {};
    vi.spyOn(THREE.TextureLoader.prototype, 'loadAsync').mockRejectedValue(new Error('404'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    photoTextures(materialById('mma-gray')); photoTextures(materialById('mma-gray'));
    await flush();
    expect(photoTextures(materialById('mma-gray'))).toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain('mma-gray|mma-grit|mma-grit');
  });
});

describe('견본 폴더(photoDirs(m).color)', () => {
  test('MMA는 색 폴더, 그레이 칩 에폭시는 그라나이트 색 지도, MF는 받지 않는다', () => {
    const made = [];
    globalThis.Image = class { constructor() { made.push(this); } set src(v) { this._src = v; } get src() { return this._src; } };
    const canvas = () => ({ width: 0, height: 0, getContext: () => ({ fillRect() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {}, arc() {}, fill() {}, drawImage() {} }) });
    for (const id of ['mma-gray', 'epoxy-chip-gray', 'ucrete-mf-red', 'mma-gray']) drawSwatch(canvas(), materialById(id));
    expect(made.map(i => i.src)).toEqual(['textures/mma-gray/color.webp', 'textures/granite-gray/color.webp']);   // 폴더당 한 번
  });
});

describe('텍스처 파일 정합', () => {
  test('카탈로그가 가리키는 사진 파일이 모두 있고, 아무도 쓰지 않는 사진 파일은 없다(granite-gray 법선·거칠기는 지웠다)', () => {
    const TEX = fileURLToPath(new URL('../public/textures/', import.meta.url));
    const need = new Set(MATERIALS.flatMap(m => { const d = photoDirs(m); return d ? [`${d.color}/color.webp`, `${d.normal}/normal.webp`, `${d.rough}/rough.webp`] : []; }));
    for (const f of need) expect(existsSync(join(TEX, f)), f).toBe(true);
    // metal-brushed는 스테인리스 형상 재질(src/view3d/shapes/materials.js)이 쓴다
    const have = readdirSync(TEX, { withFileTypes: true }).filter(e => e.isDirectory() && e.name !== 'metal-brushed').flatMap(e => readdirSync(join(TEX, e.name)).map(f => `${e.name}/${f}`));
    expect(have.sort()).toEqual([...need].sort());
  });
});
