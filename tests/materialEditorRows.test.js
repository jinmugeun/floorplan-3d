// §15.11(감사 §13·§14): 여섯 숫자 칸이 이름 없이 나란히 놓여 값이 잘려 보였고, 타일 기본값이
// 마감재 패널(300)과 달랐다(1000).
import { test, expect } from 'vitest';
import { REGION_COLUMNS, CELL_LABELS, DEFAULT_TILE_SCALE, scaleOf, regionHeadHtml, regionRowHtml, regionRowsHtml } from '../src/ui/materialEditorRows.js';
import { MATERIALS, materialById } from '../src/materials/catalog.js';

const row = (patch = {}) => ({ id: 'rg1', kind: 'band', u0: 0, u1: 5000, z0: 0, z1: 1200, mat: { id: MATERIALS[0].id, offset: [0, 0], angle: 0 }, ...patch });
const ctx = { len: 5000.5, height: 2300.25 };

test('열 제목 아홉 개가 정해진 순서로 있다', () => {
  expect(REGION_COLUMNS.map(([k]) => k)).toEqual(['kind', 'u0', 'u1', 'z0', 'z1', 'scaleW', 'scaleH', 'mat', 'del']);
  expect(REGION_COLUMNS.map(([, l]) => l)).toEqual(['종류', '시작 u', '끝 u', '아래 z', '위 z', '타일 W', 'H', '재질', '']);
  const head = regionHeadHtml();
  expect(head).toContain('class="region-head"');
  expect(head).toContain('>시작 u<');
  expect(head.indexOf('시작 u')).toBeLessThan(head.indexOf('끝 u'));
});

test('숫자 칸에 한국어 이름이 붙고 범위는 벽 길이·높이를 반올림한 값이다(소수 좌표)', () => {
  const html = regionRowHtml(row(), 0, ctx);
  expect(html).toContain('data-region="0"');
  for (const [name, label] of Object.entries(CELL_LABELS)) {
    expect(html).toContain(`name="${name}"`);
    expect(html).toContain(`aria-label="${label}"`);
  }
  expect(html).toMatch(/name="u1"[^>]*max="5001"/);          // round(5000.5)
  expect(html).toMatch(/name="z1"[^>]*max="2300"/);          // round(2300.25)
  expect(html).toContain('aria-label="영역 삭제"');
});

test('타일 크기 기본값은 마감재 패널과 같은 300이다', () => {
  expect(DEFAULT_TILE_SCALE).toEqual([300, 300]);
  // 재질이 자기 scale을 갖고 있으면 그것이 먼저다.
  const withScale = MATERIALS.find(m => Array.isArray(m.scale));
  expect(scaleOf(row({ mat: { id: withScale.id, offset: [0, 0], angle: 0 } }))).toEqual(materialById(withScale.id).scale);
  // 행이 직접 덮어쓴 값이 가장 먼저다.
  expect(scaleOf(row({ mat: { id: withScale.id, offset: [0, 0], angle: 0, scale: [450, 450] } }))).toEqual([450, 450]);
  // 둘 다 없으면 300이다(예전에는 1000이었다).
  expect(scaleOf({ mat: { id: '없는재질', offset: [0, 0], angle: 0 } })).toEqual([300, 300]);
});

test('행이 없으면 안내 문구, 있으면 제목 + 행이다', () => {
  expect(regionRowsHtml([], ctx)).toContain('영역이 없습니다');
  const two = regionRowsHtml([row(), row({ id: 'rg2', kind: 'rect' })], ctx);
  expect(two).toContain('class="region-head"');
  expect((two.match(/class="region-row"/g) ?? [])).toHaveLength(2);
  expect(two).toContain('data-region="1"');
});
