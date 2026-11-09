// 고르기 표 → 포장·연결(계획 20 Task 5 · 명세 D1·D3·D5): 표 검사와 할 일 계산(planLinks) · kitchenAssets.js 문자열 · NOTICE의 Idol 문장.
import { test, expect } from 'vitest';
import { planLinks, packArgs, assetsModule, AUTHOR, LICENSE } from '../tools/assets/link-picks.mjs';
import { ASSET_BUDGET, noticeMarkdown } from '../tools/assets/lib.mjs';

test('planLinks: 모델 있음 → 포장 · model false → manifest에 있으면 지움(why 필수) · 원본 없음 · 모르는 제품 · src·url 없음 · _설명 건너뜀', () => {
  const picks = {
    _설명: 'x',
    'k-1': { src: 'a.glb', from: 'up-s1', url: 'https://s2b/1.jpg' },
    'k-2': { model: false, why: '사진 문제' },
    'k-3': { model: false },
    'k-4': { src: 'none.glb', from: 'up-s2', url: 'https://s2b/4.jpg' },
    'k-5': { src: 'b.glb', from: 'reuse', url: 'https://s2b/5.jpg', author: 'TRELLIS', front: '-z' },
    'k-9': { src: 'a.glb', url: 'u' },
    'k-6': { src: 'a.glb' },
  };
  const r = planLinks(picks, { 'k-2': {}, 'k-3': {} }, { exists: p => p !== 'none.glb', known: id => id !== 'k-9' });
  expect(r.pack).toEqual([
    { id: 'k-1', src: 'a.glb', front: '+z', url: 'https://s2b/1.jpg', author: AUTHOR },
    { id: 'k-5', src: 'b.glb', front: '-z', url: 'https://s2b/5.jpg', author: 'TRELLIS' },
  ]);
  expect(r.remove).toEqual(['k-2', 'k-3']);
  expect(r.problems).toEqual(['k-3: model false에는 why가 필요하다', 'k-4: 원본이 없다 — none.glb', 'k-9: 카탈로그에 없는 제품', 'k-6: src·url이 필요하다']);
  expect([LICENSE, /Idol/.test(AUTHOR)]).toEqual(['자체 생성물', true]);
});

test('planLinks: tris(양의 정수)는 포장 항목으로 옮긴다 · 0 · 음수 · 소수 · 문자열은 표 문제(그 항목은 포장하지 않는다)', () => {
  const e = tris => ({ src: 'a.glb', url: 'u', tris });
  const picks = { 'k-1': e(6000), 'k-2': e(0), 'k-3': e(-5), 'k-4': e(8000.5), 'k-5': e('6000'), 'k-6': e(null) };
  const r = planLinks(picks, {}, { exists: () => true, known: () => true });
  expect(r.pack).toEqual([{ id: 'k-1', src: 'a.glb', front: '+z', url: 'u', author: AUTHOR, tris: 6000 }]);
  expect(r.problems).toEqual(['k-2: tris는 양의 정수여야 한다 — 0', 'k-3: tris는 양의 정수여야 한다 — -5', 'k-4: tris는 양의 정수여야 한다 — 8000.5',
    'k-5: tris는 양의 정수여야 한다 — "6000"', 'k-6: tris는 양의 정수여야 한다 — null']);
});

test('planLinks: tris 상한 = 생성 모델 예산(ASSET_BUDGET.trisGenerated) — 같으면 받고 넘으면 표 문제(낮추는 데만 쓴다)', () => {
  const max = ASSET_BUDGET.trisGenerated, e = tris => ({ src: 'a.glb', url: 'u', tris });
  const r = planLinks({ 'k-1': e(max), 'k-2': e(max + 1) }, {}, { exists: () => true, known: () => true });
  expect(r.pack.map(x => [x.id, x.tris])).toEqual([['k-1', max]]);
  expect(r.problems).toEqual([`k-2: tris가 생성 모델 예산보다 크다 — ${max + 1} > ${max}(낮추는 데만 쓴다)`]);
});

test('packArgs: 축별 포장 · 생성 출처 인자 · --tris는 tris가 있을 때만 끝에 붙는다', () => {
  const x = { id: 'k-1', src: 'a.glb', front: '+z', url: 'u', author: AUTHOR };
  const base = ['a.glb', '--product', 'k-1', '--front', '+z', '--fit', 'axis', '--source-kind', 'generated', '--source-url', 'u', '--license', LICENSE, '--author', AUTHOR];
  expect(packArgs(x)).toEqual(base);
  expect(packArgs({ ...x, tris: 6000 })).toEqual([...base, '--tris', '6000']);
  expect(packArgs({ ...x, tris: undefined })).toEqual(base);   // planLinks와 같은 기준(!== undefined)
});

test('assetsModule: 생성 파일 머리 + id 순 객체 + 끝 줄바꿈 · 빈 표는 Task 4의 빈 파일과 같다', () => {
  const s = assetsModule({ 'k-2': 'k-2', 'k-10': 'k-10' });
  expect(s.startsWith('// 생성 파일 — tools/assets/link-picks.mjs가 고르기 표')).toBe(true);
  expect(s.endsWith('export default {\n  "k-10": "k-10",\n  "k-2": "k-2"\n};\n')).toBe(true);
  expect(assetsModule({}).endsWith('export default {};\n')).toBe(true);
});

test('noticeMarkdown: 작가에 Idol이 있는 항목이 있을 때만 Idol 생성 문장(우리 노드 · SeedVR2 · B 반광 · 축별 포장)을 더한다', () => {
  const e = author => ({ products: { 'k-1': { id: 'k-1', source: { kind: 'generated', url: 'https://s2b/1.jpg', license: '자체 생성물', author } } } });
  expect(noticeMarkdown(e(AUTHOR))).toMatch(/splat_solid_mesh/);
  expect(noticeMarkdown(e('ComfyUI TRELLIS.2'))).not.toMatch(/splat_solid_mesh/);
  // 라이선스 사슬(2026-11-09 최종 리뷰): Idol · FLUX.2 VAE · SeedVR2 Apache-2.0 + DINOv3(Meta DINOv3 License · 상업적 사용 허용) + BiRefNet MIT
  const idol = noticeMarkdown(e(AUTHOR)).split('\n').find(l => l.startsWith('Idol 생성 모델'));
  for (const s of ['Idol(가우시안 스플랫 · Apache-2.0', 'FLUX.2 VAE Apache-2.0', 'SeedVR2 7B로 키움 · Apache-2.0', 'DINOv3 · Meta DINOv3 License — 상업적 사용 허용', 'BiRefNet · MIT']) expect(idol, s).toContain(s);
});
