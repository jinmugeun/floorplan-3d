// 계획 18 Task 1: 바닥 코팅 텍스처 10장과 출처. 파일은 tools/look/floor-textures.mjs가 만든 시안 2판 승인본 그대로여야 한다
// (bytes · sha256 — CRLF 변환 같은 손상을 잡는다 · tests/assetsCatalog.test.js와 같은 방식). 네트워크·sharp 없이 저장소 파일만 본다.
import { test, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const TEX = fileURLToPath(new URL('../public/textures/', import.meta.url));
const FLOOR_TEXTURES = {   // 경로: [바이트, sha256] — 시안 report.txt [텍스처 크기] 표와 같다(합계 1,568,196 B)
  'mma-darkgray/color.webp': [231262, '4e87965297963de34f8b5a84d4e293fdf0f9bec4f81722287874c30f75c569e7'],
  'mma-gray/color.webp': [233728, 'e47cfaa36d351c3bc5c0244d44daea9d0b5f03a0eeb73f5136ccd1287c16f497'],
  'mma-black/color.webp': [238586, '3db8677517f51bc798e20570164aa05d80844bed2d5b2b78f67a8bb82695e53f'],
  'mma-beige/color.webp': [246182, 'f3855794be87dc0013b4c80736e2b01605850b51a0f6ddc869085606396e1754'],
  'mma-yellow/color.webp': [221738, 'eaad18460c249cc3ce909db852349eefd8a4899ab48aac0d7164bbc099e94aae'],
  'mma-grit/normal.webp': [157554, '5cc9e60eae750b4ef2cf4fa8c5afba39539a8ecaf9f731866b9cc238f5cd5579'],
  'mma-grit/rough.webp': [15158, '75c735a7a4c189bbfd90746f06a5126973ffc8448a8f0211e5e3939684c201af'],
  'ud200/color.webp': [35844, 'fbd5e11accfecbc077aa772e6b0868534ea57763d1026a3e661113c70514bb17'],
  'ud200/normal.webp': [163442, '94681bdb3aa4aa38d98e7e4fc3536112b33cf65eacaafc1e47c7bf7734bfc671'],
  'ud200/rough.webp': [24702, '0fdf988cb16f1f0767ecbed022327b33126df6bc5dee1e659c95f0a390a89a6b'],
};

test('바닥 코팅 텍스처 10장은 생성 도구 결과 그대로다(bytes · sha256 · WebP 머리)', () => {
  for (const [f, [bytes, sha]] of Object.entries(FLOOR_TEXTURES)) {
    const buf = readFileSync(join(TEX, f));
    expect(buf.byteLength, f).toBe(bytes);
    expect(createHash('sha256').update(buf).digest('hex'), f).toBe(sha);
    expect([buf.toString('latin1', 0, 4), buf.toString('latin1', 8, 12)], f).toEqual(['RIFF', 'WEBP']);
  }
  expect(Object.values(FLOOR_TEXTURES).reduce((s, [n]) => s + n, 0)).toBe(1568196);
});

test('한 장 ≤ 250,000 B · public/textures 합계 ≤ 2.5 MB', () => {
  for (const f of Object.keys(FLOOR_TEXTURES)) expect(statSync(join(TEX, f)).size, f).toBeLessThanOrEqual(250000);
  const sizes = d => readdirSync(d, { withFileTypes: true }).flatMap(e => (e.isDirectory() ? sizes(join(d, e.name)) : [statSync(join(d, e.name)).size]));
  expect(sizes(TEX).reduce((s, n) => s + n, 0)).toBeLessThanOrEqual(2621440);
});

test('NOTICE.md가 바닥 코팅 텍스처의 출처(절차 생성 · 제3자 자료 없음 · 제조사 견본 팔레트 · 생성 도구)를 적는다', () => {
  const notice = readFileSync(join(TEX, 'NOTICE.md'), 'utf8');
  for (const s of ['mma-grit/', 'ud200/', 'mma-beige/', '절차적으로 생성', '제3자 자료 없음', '제조사 견본', 'tools/look/floor-textures.mjs']) expect(notice, s).toContain(s);
});
