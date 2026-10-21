// 계획 19 Task 1: 벽 타일 배열 텍스처 21장과 출처. 파일은 tools/look/tile-textures.mjs가 만든 시안 승인본 그대로여야 한다
// (bytes · sha256 — CRLF 변환 같은 손상을 잡는다 · floorTextures.test.js와 같은 방식). 네트워크·sharp 없이 저장소 파일만 본다.
import { test, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const TEX = fileURLToPath(new URL('../public/textures/', import.meta.url));
const TILE_TEXTURES = {   // 경로: [바이트, sha256] — 시안 report.txt [텍스처 크기] 표와 같다(합계 494,910 B)
  'tile-sq25/color.webp': [23882, '1f7f8b5aa3bd82f0cb9dc6bb4e1d5b5fc73f29dd90e7619bbf08da97f8f35fea'],
  'tile-sq25/normal.webp': [48054, '20e0c2ed758a3c837503955363c30bb006d2fbdf403c4fc690c3dbf580869b8a'],
  'tile-sq25/rough.webp': [7540, 'acf819893a906c9c00845c0ee70fd2dd336aae1cd576a373ce68d3fd9cd2acdd'],
  'tile-sq25-bluemix/color.webp': [43378, '34102fb1354f47a468294c5d44df40085d65d62152902b7e6bb9da66f383a0b6'],
  'tile-sq48/color.webp': [11422, '2090eaaa6e13560963a8901f85fd3fffb478e86be3c765005d46f98bc19fb86f'],
  'tile-sq48/normal.webp': [19266, 'f8f9500060c437310976cb89d61fe83a896552c170401656b98651e1aaf899e7'],
  'tile-sq48/rough.webp': [2740, 'c0a87de314fb4c67d53a4eb18a0382393f8ba07dcb1cf52d11135e94ea936b1e'],
  'tile-sq48-check/color.webp': [14210, '4969788c96db7c735592e15a382d59ccd86f7afcd1e2b15302fcf5cf05009956'],
  'tile-sq48-emboss/normal.webp': [176696, '4a16844d1fabf26e996014aa4658198d6ff0d54e11773dd6c5a0fb5f85774edc'],
  'tile-sq97/color.webp': [9442, '1db1e9ad8c1bad2752b90324127f249a0fd8eeb1c1933db2d68eebccbb11bec3'],
  'tile-sq97/normal.webp': [17746, 'afe7bbb36ee756471100dc3dccb4cfa032678c39245ae938eccab9628676e825'],
  'tile-sq97/rough.webp': [1950, 'c88561956c3ccd159e54e3081ea2674ac229b2e0fd9c782bda51097b768bc2b5'],
  'tile-hex50/color.webp': [19220, '20bdc666e0e157e8f3277f6821bd61c3ab75a7abe635936e68ac6e19c19a8f11'],
  'tile-hex50/normal.webp': [47068, 'cb022c8880c498c7c881c27e6befd2f012a8f1bea035ffd6e18f673b7ba993aa'],
  'tile-hex50/rough.webp': [13230, '1de43cec51ce5fe0f57bfa66c73f55f64bacde98a165059769928f9034f60bc1'],
  'tile-lg300/color.webp': [4132, '9a9a2b495ff680c096b37160bdae4badd318341d21451b9f350e514e108201b1'],
  'tile-lg300/normal.webp': [3908, 'e5ddd67258533e37abf78a6bcea973c1d4daac41fbb08d14ab160d9e245cc46e'],
  'tile-lg300/rough.webp': [346, '0414b03fa63570dde647ce0e5b8ca576d549e6d9512f63fe10a25d9e2973cc4f'],
  'tile-lg600/color.webp': [26668, 'ed978d97476a1da7066ab77e3a791e5a7a1e2ef9658f1d6d2af5af827e34c151'],
  'tile-lg600/normal.webp': [3692, 'f0b3aaecc8dadb1ba5c5860a0fc492b39283b034ed6e0e7ead39acb811590467'],
  'tile-lg600/rough.webp': [320, '07071820e849793580494f80ecfe764199f087f30671e65a16391265d79d8bbd'],
};
const sizes = d => readdirSync(d, { withFileTypes: true }).flatMap(e => (e.isDirectory() ? sizes(join(d, e.name)) : [statSync(join(d, e.name)).size]));

test('벽 타일 텍스처 21장은 생성 도구 결과 그대로다(bytes · sha256 · WebP 머리)', () => {
  for (const [f, [bytes, sha]] of Object.entries(TILE_TEXTURES)) {
    const buf = readFileSync(join(TEX, f));
    expect(buf.byteLength, f).toBe(bytes);
    expect(createHash('sha256').update(buf).digest('hex'), f).toBe(sha);
    expect([buf.toString('latin1', 0, 4), buf.toString('latin1', 8, 12)], f).toEqual(['RIFF', 'WEBP']);
  }
  expect(Object.values(TILE_TEXTURES).reduce((s, [n]) => s + n, 0)).toBe(494910);
});

test('배열 한 세트(color·normal·rough) ≤ 350 KB · public/textures 합계 ≤ 3 MB(계획 19 설계 §6)', () => {
  for (const layout of ['sq25', 'sq48', 'sq97', 'hex50', 'lg300', 'lg600']) {
    const set = ['color', 'normal', 'rough'].reduce((s, k) => s + statSync(join(TEX, `tile-${layout}/${k}.webp`)).size, 0);
    expect(set, layout).toBeLessThanOrEqual(350 * 1024);
  }
  expect(sizes(TEX).reduce((s, n) => s + n, 0)).toBeLessThanOrEqual(3 * 1024 * 1024);
});

test('NOTICE.md가 벽 타일 텍스처의 출처(절차 생성 · 제3자 자료 없음 · 상품 페이지 사진 표본 · 생성 도구)를 적는다', () => {
  const notice = readFileSync(join(TEX, 'NOTICE.md'), 'utf8');
  for (const s of ['tile-sq25/', 'tile-hex50/', 'tile-lg300/', 'tile-sq25-bluemix/', 'tile-sq48-emboss/', '절차적으로 생성', '제3자 자료 없음', '상품 페이지 사진', 'tools/look/tile-textures.mjs']) expect(notice, s).toContain(s);
});
