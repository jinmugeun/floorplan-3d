// @vitest-environment jsdom
// materialRows.js가 실제로 만드는 DOM과 상태 변화를 검증한다(브리프의 예시 코드를 베끼지 않고 따로 설계함 — p2c-task-7-review.md B-2).
import { describe, test, expect } from 'vitest';
import { createStore } from '../src/state/store.js';
import { createEmptyProject, activeFloor } from '../src/state/schema.js';
import { addWalls } from '../src/state/floorOps.js';
import { applyMaterial, assignmentOf, MAT_TARGET_LABELS } from '../src/state/materialOps.js';
import { materialById } from '../src/materials/catalog.js';
import { rectWalls } from '../src/geom/walls.js';
import { materialRowsHtml, mountSwatches, applyMaterialField, targetFor, hasMaterial, MATERIAL_ROWS } from '../src/ui/materialRows.js';
import { MATERIAL_PICK_FIRST } from '../src/ui/messages.js';

// 소수 좌표를 가진 사각 평면(벽 4개·방 1개)을 만들고 첫 벽/방을 선택 대상으로 돌려준다.
function buildFixture() {
  const store = createStore(createEmptyProject());
  addWalls(store, rectWalls([1.25, 0.75], [3820.6, 2650.4], 180));
  const floor = () => activeFloor(store.get());
  const f = floor();
  return { store, floor, wallSel: { type: 'wall', id: f.walls[0].id }, roomSel: { type: 'room', id: f.rooms[0].id } };
}

// materialRowsHtml은 문자열만 돌려주므로(캔버스는 못 그린다) innerHTML 다음에 mountSwatches를 불러야 한다.
function renderRows(floor, sel, opts = {}) {
  const host = document.createElement('div');
  host.innerHTML = materialRowsHtml(floor, sel, opts);
  mountSwatches(host, floor, sel);
  return host;
}

describe('materialRows: 라벨·대상 매핑', () => {
  test('행 라벨은 MAT_TARGET_LABELS를 그대로 참조한다(문자열을 두 벌 두지 않는다)', () => {
    expect(MATERIAL_ROWS.wall).toEqual([['in', MAT_TARGET_LABELS.in], ['out', MAT_TARGET_LABELS.out]]);
    expect(MATERIAL_ROWS.room).toEqual([['floor', MAT_TARGET_LABELS.floor], ['ceiling', MAT_TARGET_LABELS.ceiling]]);
  });

  test('targetFor: 벽은 in/out, 방은 floor/ceiling으로 나뉘고 모르는 key는 각각의 기본값으로 떨어진다', () => {
    expect(targetFor({ type: 'wall', id: 'w9' }, 'out')).toEqual({ kind: 'wall', id: 'w9', side: 'out' });
    expect(targetFor({ type: 'wall', id: 'w9' }, 'nope')).toEqual({ kind: 'wall', id: 'w9', side: 'in' }); // in이 기본값
    expect(targetFor({ type: 'room', id: 'r9' }, 'ceiling')).toEqual({ kind: 'ceiling', id: 'r9' });
    expect(targetFor({ type: 'room', id: 'r9' }, 'nope')).toEqual({ kind: 'floor', id: 'r9' }); // floor가 기본값
    expect(targetFor({ type: 'item', id: 'i9' }, 'in')).toBeNull();
    expect(targetFor(null, 'in')).toBeNull();
  });

  test('벽·방이 아닌 선택이거나 선택이 없으면 빈 문자열을 돌려준다', () => {
    const f = activeFloor(createEmptyProject());
    expect(materialRowsHtml(f, { type: 'item', id: 'i1' })).toBe('');
    expect(materialRowsHtml(f, null)).toBe('');
  });
});

describe('materialRows: 벽 행 — 내벽 지정 / 외벽 미지정', () => {
  test('내벽에만 재질을 지정하면 두 행이 서로 다른 상태로 그려진다(소수 오프셋·각도)', () => {
    const { store, floor, wallSel } = buildFixture();
    applyMaterial(store, { kind: 'wall', id: wallSel.id, side: 'in' }, { id: 'brick-terra', offset: [64.5, 12], angle: 15 });
    const host = renderRows(floor(), wallSel, { detailsOpen: true });
    const rows = [...host.querySelectorAll('[data-mat-row]')];
    expect(rows.map(r => r.dataset.matRow)).toEqual(['in', 'out']);

    const [inRow, outRow] = rows;
    const mat = materialById('brick-terra');
    expect(inRow.textContent).toContain(mat.name);
    expect(inRow.textContent).toContain(mat.maker);
    expect(inRow.textContent).not.toContain('미지정');
    // 리뷰 I-1: 편집 표면은 **명시 지정**만 본다 — 새 형식을 바르지 않은 외벽은 '미지정'이다
    // (그래야 속성 패널이 같은 화면에서 마감재와 색 선택기를 함께 보여 주지 않는다).
    expect(outRow.textContent).toContain('미지정');
    expect(outRow.textContent).not.toContain(materialById('paint-white').name);
    // 같은 면을 **보고용** 조회는 여전히 makeWall의 레거시 material로 읽는다(시방서가 그 답을 쓴다).
    expect(assignmentOf(floor(), { kind: 'wall', id: wallSel.id, side: 'out' }).id).toBe('paint-white');
    // 속성 패널의 색 선택기는 이 답을 쓴다(같은 면을 두고 마감재와 색 칸이 함께 뜨지 않는다).
    expect(hasMaterial(floor(), wallSel, 'in')).toBe(true);
    expect(hasMaterial(floor(), wallSel, 'out')).toBe(false);

    expect(host.querySelector('[name="matU-in"]').value).toBe('64.5');
    expect(host.querySelector('[name="matV-in"]').value).toBe('12');
    expect(host.querySelector('[name="matA-in"]').value).toBe('15');

    // 스와치 캔버스는 행마다 하나(색 입력은 propsPanel이 그리므로 여기서 다루지 않는다)
    expect(host.querySelectorAll('canvas.swatch')).toHaveLength(2);
    expect(host.querySelector('[data-mat-swatch="in"]')).not.toBeNull();
    expect(host.querySelector('[data-mat-swatch="out"]')).not.toBeNull();
  });

  test('[교체]는 행마다 dataset.side를 갖고, [마감재 편집기]는 벽에만 있다(방에는 없다)', () => {
    const { floor, wallSel, roomSel } = buildFixture();
    const wallHost = renderRows(floor(), wallSel);
    expect([...wallHost.querySelectorAll('[name="matReplace"]')].map(b => b.dataset.side)).toEqual(['in', 'out']);
    expect(wallHost.querySelectorAll('[name="matEditor"]')).toHaveLength(2);

    const roomHost = renderRows(floor(), roomSel);
    expect([...roomHost.querySelectorAll('[name="matReplace"]')].map(b => b.dataset.side)).toEqual(['floor', 'ceiling']);
    expect(roomHost.querySelectorAll('[name="matEditor"]')).toHaveLength(0);
  });
});

describe('materialRows: 방 행 — 바닥 / 천장', () => {
  test('바닥에만 새 형식을 바르면 천장 행은 미지정이다(레거시는 보고용 조회만 읽는다)', () => {
    const { store, floor, roomSel } = buildFixture();
    applyMaterial(store, { kind: 'floor', id: roomSel.id }, { id: 'tile-gray-600', offset: [30.25, 0], angle: 0 });
    const host = renderRows(floor(), roomSel);
    const rows = [...host.querySelectorAll('[data-mat-row]')];
    expect(rows.map(r => r.dataset.matRow)).toEqual(['floor', 'ceiling']);
    const mat = materialById('tile-gray-600');
    expect(rows[0].textContent).toContain(mat.name);
    // 리뷰 I-1: detectRooms의 ceilingMaterial('paint-white')은 아직 **고르지 않은** 천장이다 —
    // 편집 표면은 미지정으로 그리고, 보고용 조회(시방서)만 그 레거시 값을 읽는다.
    expect(rows[1].textContent).toContain('미지정');
    expect(assignmentOf(floor(), { kind: 'ceiling', id: roomSel.id }).id).toBe('paint-white');
    expect(host.querySelector('[name="matU-floor"]').value).toBe('30.25');
  });

  test('천장 오프셋 입력은 {kind:"ceiling", id}로 들어가고 바닥과 섞이지 않는다', () => {
    const { store, floor, roomSel } = buildFixture();
    applyMaterial(store, { kind: 'ceiling', id: roomSel.id }, { id: 'paint-white', offset: [0, 0], angle: 0 });
    const host = renderRows(floor(), roomSel);
    const v = host.querySelector('[name="matV-ceiling"]');
    v.value = '18.75';
    expect(applyMaterialField(store, roomSel, v)).toBe(true);
    expect(assignmentOf(floor(), { kind: 'ceiling', id: roomSel.id }).offset[1]).toBeCloseTo(18.75);
    // 바닥에는 새 형식이 들어가지 않았다(§17.4(1): 조회는 레거시 floorMaterial로 떨어질 뿐이다).
    expect(floor().rooms.find(r => r.id === roomSel.id).floorMat).toBeNull();
    expect(assignmentOf(floor(), { kind: 'floor', id: roomSel.id }).id).toBe('wood-oak');
  });
});

// 회귀 테스트: 리뷰(p2c-task-7-review.md B-1)가 지적한 대로 applyMaterialField 자체는 값을 자르지 않지만
// 그다음 applyMaterial → normalizeAssignment(schema.js)가 매번 offset을 [0,1000]으로 자르고 angle을 deg360으로
// 순환 정규화한다. 이 클램프를 증명하는 테스트가 이전에 없었다 — 여기서 보강한다.
describe('materialRows: 상세 설정은 normalizeAssignment를 거쳐 저장된다(클램프·순환 정규화)', () => {
  test('수평 오프셋 150.5는 반올림 없이 그대로 저장되고, 한 번의 undo로 완전히 되돌아간다', () => {
    const { store, floor, wallSel } = buildFixture();
    applyMaterial(store, { kind: 'wall', id: wallSel.id, side: 'in' }, { id: 'wood-oak', offset: [0, 0], angle: 0 });
    const host = renderRows(floor(), wallSel);
    const u = host.querySelector('[name="matU-in"]');
    u.value = '150.5';
    expect(applyMaterialField(store, wallSel, u)).toBe(true);

    const after = floor().walls.find(w => w.id === wallSel.id).matIn;
    expect(after.offset).toEqual([150.5, 0]); // num()은 범위 안이면 자르지 않는다 — 정수로 반올림하지 않는다

    expect(store.canUndo()).toBe(true);
    store.undo(); // 딱 한 단계만 되돌리면 오프셋 변경 이전 상태로 완전히 복귀해야 한다
    expect(floor().walls.find(w => w.id === wallSel.id).matIn.offset).toEqual([0, 0]);
  });

  test('각도 400은 deg360 순환 정규화로 40이 된다(클램프가 아니다)', () => {
    const { store, floor, wallSel } = buildFixture();
    applyMaterial(store, { kind: 'wall', id: wallSel.id, side: 'out' }, { id: 'concrete-gray', offset: [0, 0], angle: 0 });
    const host = renderRows(floor(), wallSel);
    const ang = host.querySelector('[name="matA-out"]');
    ang.value = '400';
    applyMaterialField(store, wallSel, ang);
    expect(floor().walls.find(w => w.id === wallSel.id).matOut.angle).toBe(40);
  });

  test('수직 오프셋 -50은 MAT_RANGE.offset의 최솟값 0으로 클램프된다', () => {
    const { store, floor, wallSel } = buildFixture();
    applyMaterial(store, { kind: 'wall', id: wallSel.id, side: 'in' }, { id: 'wood-oak', offset: [500, 500], angle: 0 });
    const host = renderRows(floor(), wallSel);
    const v = host.querySelector('[name="matV-in"]');
    v.value = '-50';
    applyMaterialField(store, wallSel, v);
    expect(floor().walls.find(w => w.id === wallSel.id).matIn.offset[1]).toBe(0);
  });
});

describe('materialRows: 입력을 무시해야 하는 경우', () => {
  test('빈 칸은 처리했다고 보고하되(true) 값도 undo 단계도 남기지 않는다(I-12)', () => {
    const { store, floor, wallSel } = buildFixture();
    applyMaterial(store, { kind: 'wall', id: wallSel.id, side: 'in' }, { id: 'brick-terra', offset: [0, 88], angle: 0 });
    const host = renderRows(floor(), wallSel);
    const v = host.querySelector('[name="matV-in"]');
    expect(v.value).toBe('88');
    v.value = '';
    const before = store.canUndo();
    expect(applyMaterialField(store, wallSel, v)).toBe(true);
    expect(floor().walls.find(w => w.id === wallSel.id).matIn.offset[1]).toBe(88); // 값은 그대로
    expect(store.canUndo()).toBe(before); // Number('') === 0을 걸러내지 못했다면 여기서 새 undo 단계가 생겼을 것이다
  });

  test('재질이 없는 면의 오프셋 입력은 아무 상태도 바꾸지 않는다', () => {
    const { store, floor, wallSel } = buildFixture();
    // §17.4(1): makeWall이 지금도 넣는 레거시 material을 지워 **정말로** 마감재가 없는 면을 만든다
    // (레거시 문자열만 있는 면은 이제 조회가 그 값을 돌려주므로 입력이 새 형식으로 굳는다).
    store.dispatch(d => { activeFloor(d).walls.find(w => w.id === wallSel.id).material = null; }, { record: false });
    const host = renderRows(floor(), wallSel);
    const u = host.querySelector('[name="matU-out"]');
    u.value = '777';
    expect(applyMaterialField(store, wallSel, u)).toBe(true);
    expect(floor().walls.find(w => w.id === wallSel.id).matOut).toBeNull();
  });

  // 리뷰 I-2: 레거시 문자열만 있는 면(makeWall의 material)에서 오프셋 한 칸을 고쳐도 아무것도
  // 굳지 않는다 — 사용자는 "오프셋"을 요청했지 "이 벽에 무광 화이트 페인트를 바르겠다"고 하지
  // 않았다. 예전에는 assignmentOf가 준 파생값이 matOut에 써져 문서가 바뀌었다(저장 형식 무변경이
  // 깨진 것은 아니지만 "되쓰지 않는다"는 약속이 한 층 위에서 깨졌다).
  test('레거시 문자열만 있는 면의 오프셋 편집은 무동작이고 안내를 띄운다', () => {
    const { store, floor, wallSel } = buildFixture();
    const wall = () => floor().walls.find(w => w.id === wallSel.id);
    expect(wall().material).toBe('paint-white');          // makeWall이 지금도 넣는 레거시 값
    const host = renderRows(floor(), wallSel);
    expect(host.querySelector('[data-mat-row="out"]').textContent).toContain('미지정');
    const u = host.querySelector('[name="matU-out"]');
    u.value = '123.5';
    const before = store.canUndo();
    expect(applyMaterialField(store, wallSel, u)).toBe(true);
    expect(wall().matOut).toBeNull();                     // 새 형식으로 굳지 않는다
    expect(wall().material).toBe('paint-white');          // 레거시 문자열도 그대로다(읽기 전용)
    expect(store.canUndo()).toBe(before);                 // 되돌릴 단계도 남기지 않는다
    const toasts = [...document.querySelectorAll('#toasts .toast')];
    expect(toasts.at(-1).textContent).toBe(MATERIAL_PICK_FIRST);
  });

  test('mat*가 아닌 input 이름은 처리하지 않는다(false)', () => {
    const { store, wallSel } = buildFixture();
    expect(applyMaterialField(store, wallSel, { name: 'thickness', value: '5' })).toBe(false);
    expect(applyMaterialField(store, wallSel, { name: '', value: '5' })).toBe(false);
  });
});

describe('materialRows: jsdom 캔버스 가드', () => {
  test('jsdom은 2D 컨텍스트를 만들지 않지만 스와치를 그려도 던지지 않는다', () => {
    const { floor, wallSel } = buildFixture();
    // renderRows가 이미 mountSwatches를 한 번 실행했다 — drawSwatch 안의 null-context 가드가 없었다면
    // 이 지점에 도달하기 전에 던졌을 것이다.
    const host = renderRows(floor(), wallSel);
    const canvases = [...host.querySelectorAll('canvas.swatch')];
    expect(canvases).toHaveLength(2);
    for (const c of canvases) expect(c.getContext('2d')).toBeNull(); // 이 프로젝트는 캔버스 폴리필을 깔지 않는다
    expect(() => mountSwatches(host, floor(), wallSel)).not.toThrow(); // 다시 그려도 안전하다
  });
});
