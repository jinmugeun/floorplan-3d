// @vitest-environment jsdom
import { describe, test, expect, beforeEach } from 'vitest';
import { createStore } from '../src/state/store.js';
import { createEmptyProject, activeFloor } from '../src/state/schema.js';
import { addWalls } from '../src/state/floorOps.js';
import { setWallRegions } from '../src/state/materialOps.js';
import { rectWalls, wallLength } from '../src/geom/walls.js';
import { openMaterialEditor, validateRegion } from '../src/ui/materialEditor.js';

function setup(side = 'in') {
  const store = createStore(createEmptyProject());
  addWalls(store, rectWalls([0, 0], [4000.5, 3000.25], 200));
  const f = activeFloor(store.get());
  const wallId = f.walls[0].id;
  const dlg = openMaterialEditor({ store, wallId, side });
  const root = document.querySelector('.modal.mat-editor');
  return { store, wallId, dlg, root, wall: () => activeFloor(store.get()).walls.find(w => w.id === wallId), q: s => root.querySelector(s) };
}
const click = (root, sel) => root.querySelector(sel).dispatchEvent(new MouseEvent('click', { bubbles: true }));
const set = (el, v) => { el.value = String(v); el.dispatchEvent(new Event('change', { bubbles: true })); };
const mat = id => ({ id, offset: [0, 0], angle: 0 });

beforeEach(() => { document.body.innerHTML = ''; });

describe('영역 범위 검증', () => {
  test('벽 길이·높이 안이어야 하고 뒤집히면 안 된다(소수 길이)', () => {
    const box = { len: 4000.5, height: 2300 };
    expect(validateRegion({ kind: 'rect', u0: 0, u1: 4000.5, z0: 0, z1: 2300 }, box)).toBeNull();
    expect(validateRegion({ kind: 'band', u0: 0, u1: 0, z0: 100.5, z1: 900 }, box)).toBeNull(); // band는 u를 보지 않는다
    expect(validateRegion({ kind: 'rect', u0: 500, u1: 500, z0: 0, z1: 900 }, box)).toContain('가로');
    expect(validateRegion({ kind: 'rect', u0: -1, u1: 900, z0: 0, z1: 900 }, box)).toContain('가로');
    expect(validateRegion({ kind: 'rect', u0: 0, u1: 4001, z0: 0, z1: 900 }, box)).toContain('가로');
    expect(validateRegion({ kind: 'rect', u0: 0, u1: 900, z0: 900, z1: 100 }, box)).toContain('높이');
    expect(validateRegion({ kind: 'rect', u0: 0, u1: 900, z0: 0, z1: 2301 }, box)).toContain('높이');
  });
});

describe('마감재 편집기', () => {
  test('현재 영역을 불러와 행으로 보여준다', () => {
    const store = createStore(createEmptyProject());
    addWalls(store, rectWalls([0, 0], [4000.5, 3000.25], 200));
    const wallId = activeFloor(store.get()).walls[0].id;
    setWallRegions(store, wallId, 'in', [{ kind: 'band', z0: 0, z1: 1200.5, mat: mat('tile-white-300') }]);
    openMaterialEditor({ store, wallId, side: 'in' });
    const root = document.querySelector('.modal.mat-editor');
    expect(root.querySelectorAll('[data-region]')).toHaveLength(1);
    expect(root.querySelector('[name="z1"]').value).toBe('1200.5');
    expect(root.querySelector('[name="mat"]').value).toBe('tile-white-300');
    expect(root.textContent).toContain('내벽');
  });

  test('수평 띠·사각형을 더하고 지운다', () => {
    const a = setup();
    expect(a.root.querySelectorAll('[data-region]')).toHaveLength(0);
    click(a.root, '[name="addBand"]');
    click(a.root, '[name="addRect"]');
    const rows = [...a.root.querySelectorAll('[data-region]')];
    expect(rows).toHaveLength(2);
    expect(rows.map(r => r.querySelector('[name="kind"]').value)).toEqual(['band', 'rect']);
    rows[0].querySelector('[name="del"]').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(a.root.querySelectorAll('[data-region]')).toHaveLength(1);
  });

  test('[적용]이 영역을 그 면에만 저장하고 한 단계로 되돌려진다', () => {
    const a = setup('out');
    click(a.root, '[name="addRect"]');
    const row = a.root.querySelector('[data-region]');
    set(row.querySelector('[name="u0"]'), 500.5);
    set(row.querySelector('[name="u1"]'), 1500.5);
    set(row.querySelector('[name="z0"]'), 300);
    set(row.querySelector('[name="z1"]'), 900);
    set(row.querySelector('[name="mat"]'), 'brick-red');
    click(a.root, '[name="apply"]');
    const w = a.wall();
    expect(w.regions.out).toHaveLength(1);
    expect(w.regions.out[0]).toMatchObject({ kind: 'rect', u0: 500.5, u1: 1500.5, z0: 300, z1: 900 });
    expect(w.regions.out[0].mat.id).toBe('brick-red');
    expect(w.regions.in).toEqual([]);
    expect(document.querySelector('.modal.mat-editor')).toBeNull();   // 적용하면 닫힌다
    a.store.undo();
    expect(a.wall().regions.out).toEqual([]);
  });

  test('범위를 어기면 메시지를 띄우고 저장하지 않는다', () => {
    const a = setup();
    click(a.root, '[name="addRect"]');
    const row = a.root.querySelector('[data-region]');
    set(row.querySelector('[name="u0"]'), 2000);
    set(row.querySelector('[name="u1"]'), 1000);
    click(a.root, '[name="apply"]');
    expect(a.root.querySelector('.error').textContent).toContain('가로');
    expect(a.wall().regions.in).toEqual([]);
    expect(document.querySelector('.modal.mat-editor')).not.toBeNull();
  });

  test('수평 띠는 벽 전체 폭으로 저장된다', () => {
    const a = setup();
    click(a.root, '[name="addBand"]');
    const row = a.root.querySelector('[data-region]');
    set(row.querySelector('[name="z0"]'), 0);
    set(row.querySelector('[name="z1"]'), 1200.5);
    set(row.querySelector('[name="mat"]'), 'tile-white-300');
    click(a.root, '[name="apply"]');
    const rg = a.wall().regions.in[0];
    expect(rg.kind).toBe('band');
    expect(rg.u0).toBe(0);
    expect(rg.u1).toBeCloseTo(wallLength(a.wall()));
  });

  test('Esc와 닫기 버튼은 저장하지 않고 닫는다', () => {
    const a = setup();
    click(a.root, '[name="addBand"]');
    a.root.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(document.querySelector('.modal.mat-editor')).toBeNull();
    expect(a.wall().regions.in).toEqual([]);
  });

  // jsdom에는 canvas 패키지가 없어 getContext('2d')가 null이다: renderPreview의 `if (!ctx) return`
  // 가드가 도는 경로를 확인한다(실제 그림은 브라우저 검증에서 본다).
  test('미리보기 캔버스는 다시 그려도 남고 컨텍스트가 없어도 던지지 않는다', () => {
    const a = setup();
    expect(a.q('canvas[data-part="preview"]')).not.toBeNull();
    click(a.root, '[name="addBand"]');
    expect(a.q('canvas[data-part="preview"]')).not.toBeNull();        // 다시 그려도 캔버스는 남는다
    expect(() => click(a.root, '[name="addRect"]')).not.toThrow();
  });
});
