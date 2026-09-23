import { describe, test, expect, beforeAll, afterAll, vi } from 'vitest';
import * as THREE from 'three';
import { buildLabels, labelSprite, setLabelCanvasFactory, clearLabelCache, LABEL_H_PX, labelTextureSize, cullSprites, cullLabels, LABEL3D_PRIORITY, LABEL_DEBOUNCE_MS, LABEL_BOX_PX, spriteLabelSize, createCameraWatch, setLabelCollapsed, LABEL_DOT_TEXT, LABEL_DOT_H, LABEL_DOTS_NAME, labelRefreshKind } from '../src/view3d/labels3d.js';
import { createOrthoView } from '../src/view3d/orthoView.js';
import { DEFAULT_VIEW, createItem } from '../src/state/schema.js';
import { normalizeDuct } from '../src/state/ductSchema.js';
import { productById } from '../src/products/catalog.js';
import { V2_OPTIONS, V3_OPTIONS, viewPopoverHtml } from '../src/ui/viewOptions.js';

// node 환경에는 document가 없다. 라벨이 부르는 메서드만 가진 가짜 캔버스를 깔아 둔다(build.test.js와 같은 방식).
function fakeCanvas() {
  const ctx = { fillStyle: '', font: '', textAlign: '', textBaseline: '', clearRect() {}, fillRect() {}, fillText() {} };
  return { width: 0, height: 0, getContext: () => ctx };
}
beforeAll(() => setLabelCanvasFactory(fakeCanvas));
afterAll(() => { clearLabelCache(); setLabelCanvasFactory(null); });

const hood = createItem(productById('hood-box'), { pos: [14350, 12700], z: 2300, props: { type: 'hood', no: 3, faceVelocity: 0.5, system: 'F-3' } });
const duct = normalizeDuct({ id: 'd1', kind: 'exhaust', points: [[0, 0], [3000.5, 0]], segments: [{ w: 750, h: 400, z: 2650 }] });

describe('3D 라벨', () => {
  test('스프라이트는 CanvasTexture를 쓰고 빈 글자는 만들지 않는다', () => {
    const s = labelSprite('③');
    expect(s.isSprite).toBe(true);
    expect(s.material.map.isCanvasTexture).toBe(true);
    expect(s.material.map.image.width).toBe(labelTextureSize('③').w);
    expect(s.material.map.image.height).toBe(LABEL_H_PX);
    expect(s.material.userData.perMesh).toBe(true);
    expect(labelSprite(null)).toBeNull();
    expect(labelSprite('')).toBeNull();
  });

  test('같은 글자·색은 텍스처를 다시 만들지 않는다', () => {
    const a = labelSprite('가'), b = labelSprite('가');
    expect(a.material.map).toBe(b.material.map);
    expect(labelSprite('가', { color: '#dc2626' }).material.map).not.toBe(a.material.map);
  });

  test('설비 라벨은 설비 윗면 위에, 덕트 라벨은 구간 중앙 위에 선다', () => {
    const g = buildLabels({ items: [hood], ducts: [duct] }, {});
    expect(g.name).toBe('labels');
    expect(g.children).toHaveLength(2);
    const eq = g.children.find(c => c.userData.itemId === hood.id);
    expect(eq.position.x).toBeCloseTo(14.35, 9);
    expect(eq.position.z).toBeCloseTo(12.7, 9);
    expect(eq.position.y).toBeCloseTo((2300 + 600 + 150) / 1000, 9);
    const dl = g.children.find(c => c.userData.ductId === 'd1');
    expect(dl.userData.segment).toBe(0);
    expect(dl.position.x).toBeCloseTo(1.50025, 9);
    expect(dl.position.y).toBeCloseTo((2650 + 200 + 150) / 1000, 9);
  });

  test('보기 플래그로 라벨을 끈다(설비·덕트 각각)', () => {
    expect(buildLabels({ items: [hood], ducts: [duct] }, { v3: { equipLabels: false } }).children).toHaveLength(1);
    expect(buildLabels({ items: [hood], ducts: [duct] }, { v3: { ductLabels: false } }).children).toHaveLength(1);
    expect(buildLabels({ items: [hood], ducts: [duct] }, { v3: { equipLabels: false, ductLabels: false } }).children).toHaveLength(0);
    expect(buildLabels({ items: [hood], ducts: [duct] }, { v3: { ceilingItems: false } }).children).toHaveLength(1); // 천장 가구를 끄면 후드 라벨도 사라진다
    expect(buildLabels({ items: [hood], ducts: [duct] }, { v3: { ducts: false } }).children).toHaveLength(1);
  });

  test('조리기구는 라벨이 없어 스프라이트를 만들지 않는다', () => {
    const range = createItem(productById('range-gas-high'), { pos: [7650, 18800] });
    expect(buildLabels({ items: [range], ducts: [] }, {}).children).toHaveLength(0);
  });

  test('텍스처와 스프라이트 폭이 글자 폭을 따른다(감사 §11)', () => {
    const short = labelSprite('③'), long = labelSprite('750×400');
    expect(labelTextureSize('750×400').w).toBeGreaterThan(labelTextureSize('③').w);
    expect(long.material.map.image.width).toBe(labelTextureSize('750×400').w);
    // 스프라이트 가로/세로 비율 = 텍스처 비율(글자가 눌리거나 잘리지 않는다).
    const box = labelTextureSize('750×400');
    expect(long.scale.x / long.scale.y).toBeCloseTo(box.w / box.h, 6);
    expect(short.scale.x / short.scale.y).toBeCloseTo(labelTextureSize('③').w / box.h, 6);
    expect(long.scale.y).toBeCloseTo(0.4, 6);        // 높이는 예전과 같다(0.4 m)
  });

  test('cullSprites는 겹치면 낮은 우선순위를 숨긴다(설비 번호 > 덕트 단면)', () => {
    expect(LABEL3D_PRIORITY).toEqual(['equip', 'ductSize']);
    const keep = cullSprites([
      { key: 'duct1', kind: 'ductSize', text: '750×400', sp: [100.5, 100.25], size: 12 },
      { key: 'eq1', kind: 'equip', text: '③', sp: [104, 102], size: 12 },
      { key: 'duct2', kind: 'ductSize', text: '600×300', sp: [400, 400], size: 12 },
    ]);
    expect(keep.has('eq1')).toBe(true);
    expect(keep.has('duct1')).toBe(false);           // 설비 번호에 자리를 내준다
    expect(keep.has('duct2')).toBe(true);            // 멀리 있는 것은 그대로
    expect(cullSprites([]).size).toBe(0);
  });
});

describe('보기 옵션', () => {
  test('기본값에 덕트·덕트 라벨·설비 라벨이 켜져 있다', () => {
    for (const k of ['ducts', 'ductLabels', 'equipLabels']) {
      expect(DEFAULT_VIEW.v2[k], `v2.${k}`).toBe(true);
      expect(DEFAULT_VIEW.v3[k], `v3.${k}`).toBe(true);
    }
  });

  test('팝오버 목록에 세 줄이 2D·3D 모두 있다', () => {
    for (const list of [V2_OPTIONS, V3_OPTIONS]) {
      expect(list.map(x => x[0])).toEqual(expect.arrayContaining(['ducts', 'ductLabels', 'equipLabels']));
    }
    expect(V2_OPTIONS.find(x => x[0] === 'ducts')[1]).toBe('덕트');
    expect(V3_OPTIONS.find(x => x[0] === 'ductLabels')[1]).toBe('덕트 라벨');
    const html2 = viewPopoverHtml({ ...DEFAULT_VIEW }, '2d');
    expect(html2).toContain('data-v2="equipLabels"');
    const html3 = viewPopoverHtml({ ...DEFAULT_VIEW }, '3d');
    expect(html3).toContain('data-v3="ducts"');
  });
});

// §13.4: 성능 우선에서는 설비·덕트 라벨 스프라이트를 아예 만들지 않는다(플래그는 그대로).
test('성능 우선 모드는 라벨을 만들지 않고 빈 labels 그룹을 준다', async () => {
  const { buildLabels } = await import('../src/view3d/labels3d.js');
  const { createItem } = await import('../src/state/schema.js');
  const { productById } = await import('../src/products/catalog.js');
  const hood = createItem(productById('hood-box'), { pos: [1000.5, 1000.25] });
  const fl = { walls: [], rooms: [], items: [hood], ducts: [], height: 2300 };
  const on = buildLabels(fl, { v3: { equipLabels: true } });
  expect(on.children.length).toBeGreaterThan(0);
  const off = buildLabels(fl, { v3: { equipLabels: true }, perfMode: 'performance' });
  expect(off.name).toBe('labels');
  expect(off.children).toHaveLength(0);
});

// §17.10(1) · 감사 §5: 컬링된 라벨은 사라지는 대신 점(●)으로 남는다 — 무엇이 가려졌는지 보인다.
test('labelSprite는 색과 펼친 크기를 기억하고 setLabelCollapsed가 왕복한다', () => {
  const s = labelSprite('750×400', { color: '#dc2626' });
  expect(s.userData.text).toBe('750×400');
  expect(s.userData.color).toBe('#dc2626');
  expect(s.userData.fullScale).toEqual([s.scale.x, s.scale.y]);
  const full = [s.scale.x, s.scale.y], map0 = s.material.map;
  expect(setLabelCollapsed(s, true)).toBe(true);
  expect(s.userData.collapsed).toBe(true);
  expect(s.material.map).not.toBe(map0);
  expect(s.scale.y).toBeCloseTo(LABEL_DOT_H, 6);
  expect(s.scale.x).toBeLessThan(full[0]);
  expect(setLabelCollapsed(s, true)).toBe(false);          // 같은 상태면 아무것도 하지 않는다
  expect(setLabelCollapsed(s, false)).toBe(true);
  expect(s.material.map).toBe(map0);                       // 텍스처 캐시는 글자·색 키라 같은 것이 돌아온다
  expect(s.scale.x).toBeCloseTo(full[0], 6);
  expect(s.scale.y).toBeCloseTo(full[1], 6);
  expect(LABEL_DOT_TEXT).toBe('●');
  expect(setLabelCollapsed(null, true)).toBe(false);
});

// §15.12: 컬링은 카메라가 멈춘 뒤 한 번 돈다(view3d가 120 ms 디바운스). 투영은 주입할 수 있다.
test('cullLabels는 화면 밖만 감추고 겹친 것은 점으로 남긴다', () => {
  const g = buildLabels({ items: [hood], ducts: [duct] }, {});
  const eq = g.children.find(c => c.userData.itemId === hood.id);
  const dl = g.children.find(c => c.userData.ductId === 'd1');
  cullLabels(g, null, { width: 800, height: 600, project: () => [400, 300] });
  expect(eq.visible).toBe(true);
  expect(eq.userData.collapsed).toBe(false);
  expect(dl.userData.collapsed).toBe(true);                 // 사라지지 않고 점으로 남는다
  // 그 점은 스프라이트가 아니라 한 덩어리(Points)가 그린다(리뷰 I-3): 자리는 라벨이 서 있던 곳 그대로다.
  const dots = g.children.find(c => c.name === LABEL_DOTS_NAME);
  expect(dots.geometry.drawRange.count).toBe(1);
  expect(dots.geometry.getAttribute('position').getX(0)).toBeCloseTo(dl.position.x, 5);
  expect(dots.geometry.getAttribute('position').getY(0)).toBeCloseTo(dl.position.y, 5);
  expect(dl.visible).toBe(false);                           // 스프라이트 자신은 드로우콜을 쓰지 않는다
  // 자리가 떨어지면 같은 스프라이트가 저절로 펼쳐진다(지금의 44 → 58 동작과 같은 경로).
  let n = 0;
  cullLabels(g, null, { width: 800, height: 600, project: () => [100 + (n++) * 300, 300] });
  expect(g.children.filter(c => c.name === 'label').every(c => c.visible && !c.userData.collapsed)).toBe(true);
  expect(dots.geometry.drawRange.count).toBe(0);
  expect(dots.visible).toBe(false);                         // 점이 없으면 배치도 그리지 않는다
});

// I-3: 접힌 라벨이 500개여도 그리는 객체는 "펼친 라벨 + 점 배치 1개"다(예전에는 화면 안 500개가 모두 드로우콜).
test('500개가 겹쳐도 그리는 객체 수는 펼친 라벨 + 배치 1개로 묶인다', () => {
  const g = new THREE.Group();
  g.name = 'labels';
  for (let i = 0; i < 500; i++) {
    const s = labelSprite('750×400', { color: '#dc2626' });
    s.position.set(400 + (i % 25) * 4, 300 + Math.floor(i / 25) * 4, 0);   // 100×80 px 안에 500개
    s.userData.kind = 'ductSize';
    g.add(s);
  }
  const keep = cullLabels(g, null, { width: 800, height: 600, project: p => [p.x, p.y] });
  const sprites = g.children.filter(c => c.name === 'label');
  const dots = g.children.find(c => c.name === LABEL_DOTS_NAME);
  expect(sprites).toHaveLength(500);
  expect(keep.size).toBeLessThan(100);                      // 12 px 상자가 그 좁은 자리에 다 들어가지 않는다
  expect(sprites.filter(c => c.visible)).toHaveLength(keep.size);
  expect(dots.geometry.drawRange.count).toBe(500 - keep.size);
  expect(g.children.filter(c => c.visible).length).toBe(keep.size + 1);
});

// I-2: '끔' 진입·이탈만 층을 다시 짓는다 — '모두'↔'자동'은 이미 있는 스프라이트를 다시 세기만 한다.
test('labelRefreshKind는 끔 진입·이탈만 재빌드다(여섯 전이)', () => {
  expect(labelRefreshKind('all', 'auto')).toBe('cull');
  expect(labelRefreshKind('auto', 'all')).toBe('cull');
  expect(labelRefreshKind('all', 'off')).toBe('rebuild');
  expect(labelRefreshKind('auto', 'off')).toBe('rebuild');
  expect(labelRefreshKind('off', 'all')).toBe('rebuild');
  expect(labelRefreshKind('off', 'auto')).toBe('rebuild');
  expect(labelRefreshKind('auto', 'auto')).toBe('cull');    // 같은 값은 다시 세기만 한다
});

// 직교 카메라에서 three의 gl_PointSize는 월드가 아니라 픽셀이다(sizeAttenuation이 원근에서만 먹는다).
test('2D 투영(직교)에서도 점이 같은 높이로 보이게 픽셀로 환산한다', () => {
  const g = labelGroup([['equip', '③', [0, 0, 0]], ['ductSize', '750×400', [0.01, 0, 0]]]);
  const cam = new THREE.OrthographicCamera(-5, 5, 4, -4, -100, 100);
  cam.position.set(0, 0, 5); cam.lookAt(0, 0, 0); cam.updateMatrixWorld();
  cullLabels(g, cam, { width: 800, height: 600 });
  const dots = g.children.find(c => c.name === LABEL_DOTS_NAME);
  expect(dots.geometry.drawRange.count).toBe(1);
  expect(dots.material.size).toBeCloseTo((LABEL_DOT_H / 8) * 600, 6);   // 절두체 높이 8 m → 600 px
  // 원근에서는 월드 크기이되 fov가 빠져 있다(gl_PointSize = size × 화면높이/2 ÷ 거리) — 같은 화면 높이가 되게 보정한다.
  cullLabels(g, lookFrom(4), { width: 800, height: 600 });
  expect(dots.material.size).toBeCloseTo(LABEL_DOT_H / Math.tan(THREE.MathUtils.degToRad(50) / 2), 6);
});

test('라벨 밀도 세 값이 다른 결과를 낸다', () => {
  const mk = () => buildLabels({ items: [hood], ducts: [duct] }, {});
  const all = mk();
  cullLabels(all, null, { width: 800, height: 600, project: () => [400, 300], density: 'all' });
  expect(all.children.every(c => c.visible && !c.userData.collapsed)).toBe(true);
  const auto = mk();
  cullLabels(auto, null, { width: 800, height: 600, project: () => [400, 300], density: 'auto' });
  expect(auto.children.filter(c => c.userData.collapsed)).toHaveLength(1);
  const off = mk();
  expect(cullLabels(off, null, { width: 800, height: 600, project: () => [400, 300], density: 'off' }).size).toBe(0);
  expect(off.children.every(c => !c.visible)).toBe(true);
  // 'off'는 씬에서도 라벨을 만들지 않는다(성능 우선과 같은 빈 그룹).
  expect(buildLabels({ items: [hood], ducts: [duct] }, {}, { density: 'off' }).children).toHaveLength(0);
  expect(buildLabels({ items: [hood], ducts: [duct] }, {}, { density: 'all' }).children).toHaveLength(2);
});

// 점이 되면 스프라이트가 작아진다: 그 작은 상자로 다음 판정을 하면 자리가 늘 이겨 깜빡인다.
test('겹침 판정은 점이 된 뒤에도 펼친 크기로 한다(깜빡임 방지)', () => {
  const g = buildLabels({ items: [hood], ducts: [duct] }, {});
  const dl = g.children.find(c => c.userData.ductId === 'd1');
  const at = () => cullLabels(g, null, { width: 800, height: 600, project: () => [400, 300] });
  at();
  expect(dl.userData.collapsed).toBe(true);
  at();                                                     // 두 번째 프레임에도 같은 답이다
  expect(dl.userData.collapsed).toBe(true);
  at();
  expect(dl.userData.collapsed).toBe(true);
});

// 아래 세 테스트는 리뷰 Important 1·2·3(고정된 visible · 거울 투영 · 줌 불변)을 막는다.
function labelGroup(specs) {
  const g = new THREE.Group();
  g.name = 'labels';
  for (const [kind, text, pos] of specs) {
    const s = labelSprite(text, kind === 'equip' ? {} : { color: '#dc2626' });
    s.position.set(...pos);
    s.userData.kind = kind;
    g.add(s);
  }
  return g;
}
const lookFrom = dist => {
  const c = new THREE.PerspectiveCamera(50, 1, 0.01, 100);
  c.position.set(0, 0, dist); c.lookAt(0, 0, 0); c.updateMatrixWorld();
  return c;
};

test('카메라 뒤의 스프라이트는 후보에서 뺀다(거울 투영이 화면 안 라벨을 밀어내지 않게)', () => {
  const cam = lookFrom(5);
  // 카메라는 -Z를 본다: z = 8은 카메라 뒤다. w < 0이라 x·y가 뒤집혀 화면 중앙으로 들어온다.
  const g = labelGroup([['ductSize', '750×400', [0.0005, 0.0025, 0]], ['equip', '③', [0.0005, 0.0025, 8]]]);
  const [dl, eq] = g.children;
  const keep = cullLabels(g, cam, { width: 800, height: 600 });
  expect(eq.visible).toBe(false);          // 보이지 않는 라벨이 자리를 빼앗지 않는다
  expect(dl.visible).toBe(true);
  expect(keep.has(dl.uuid)).toBe(true);
  expect(keep.has(eq.uuid)).toBe(false);
  // 같은 스프라이트가 카메라 앞에 오면 우선순위대로 덕트 라벨이 자리를 내준다(기계가 살아 있음을 확인).
  eq.position.set(0.0005, 0.0025, 0.01);
  cullLabels(g, cam, { width: 800, height: 600 });
  expect(eq.visible).toBe(true);
  expect(eq.userData.collapsed).toBe(false);
  expect(dl.userData.collapsed).toBe(true);   // §17.10: 화면 안이면 사라지지 않고 점으로 자리를 남긴다
  expect(dl.visible).toBe(false);             // 점은 배치가 그리므로 스프라이트는 꺼진다(I-3)
  expect(g.children.find(c => c.name === LABEL_DOTS_NAME).geometry.drawRange.count).toBe(1);
});

test('겹침 상자는 스프라이트의 실제 화면 크기를 따른다(줌 2배에도 판정이 같다)', () => {
  const far = lookFrom(4), near = lookFrom(2);
  const at = () => labelGroup([['equip', '③', [-0.2005, 0.0025, 0]], ['ductSize', '750×400', [0.2005, 0.0025, 0]]]);
  const probe = at().children[1];
  // 화면 높이 = scale.y ÷ 절두체 높이 × 뷰포트 px → 거리가 절반이면 상자도 두 배다.
  expect(spriteLabelSize(probe, near, 600)).toBeCloseTo(spriteLabelSize(probe, far, 600) * 2, 6);
  expect(spriteLabelSize(probe, null, 600)).toBe(LABEL_BOX_PX);   // 카메라를 모르면 예전 고정값
  for (const [name, cam] of [['기본', far], ['2배 줌인', near]]) {
    const g = at();
    cullLabels(g, cam, { width: 800, height: 600 });
    expect(g.children[0].userData.collapsed, `${name}: 설비 번호`).toBe(false);
    expect(g.children[1].userData.collapsed, `${name}: 덕트 단면`).toBe(true);
  }
  // 고정 12 px 상자로는 같은 배치가 "안 겹친다"로 읽혀 감사 §11 증상이 되돌아온다(회귀 방어).
  expect(cullSprites([
    { key: 'eq', kind: 'equip', text: '③', sp: [357.0, 300.5], size: 12 },
    { key: 'duct', kind: 'ductSize', text: '750×400', sp: [443.0, 300.5], size: 12 },
  ]).size).toBe(2);
});

test('2D 투영 프리셋에 들어가고 나올 때도 컬링이 다시 돈다(디바운스 1회)', () => {
  vi.useFakeTimers();
  try {
    expect(LABEL_DEBOUNCE_MS).toBe(120);
    // view3d의 scheduleLabelCull과 같은 배선: 카메라가 바뀌면 걸고, 정착 뒤 한 번만 돈다.
    let culls = 0, timer = 0;
    const schedule = () => { clearTimeout(timer); timer = setTimeout(() => { culls++; }, LABEL_DEBOUNCE_MS); };
    const controls = { enabled: true };
    const ov = createOrthoView({
      container: { clientWidth: 800, clientHeight: 600 },
      store: { get: () => ({ activeFloor: 0, floors: [{ height: 2300 }] }) },
      controls, bounds: () => ({ center: [1000.5, 2000.25], extent: 8000.5 }),
      onCameraChange: schedule,
    });
    ov.setOrthoView('front');
    expect(ov.camera().isOrthographicCamera).toBe(true);   // 컬링이 쓸 활성 카메라가 바뀌었다
    expect(controls.enabled).toBe(false);                  // OrbitControls 'change'는 더 오지 않는다
    vi.advanceTimersByTime(LABEL_DEBOUNCE_MS - 1);
    expect(culls).toBe(0);
    vi.advanceTimersByTime(1);
    expect(culls).toBe(1);
    ov.setOrthoView('left'); ov.setOrthoView('top');       // 연속 전환은 정착 뒤 1회로 합쳐진다
    vi.advanceTimersByTime(LABEL_DEBOUNCE_MS);
    expect(culls).toBe(2);
    ov.clearOrthoView();                                   // 나올 때도 첫 드래그를 기다리지 않는다
    vi.advanceTimersByTime(LABEL_DEBOUNCE_MS);
    expect(culls).toBe(3);
    ov.clearOrthoView();                                   // 투영 중이 아니면 아무 일도 없다
    vi.advanceTimersByTime(LABEL_DEBOUNCE_MS);
    expect(culls).toBe(3);
  } finally {
    vi.useRealTimers();
  }
});

test('createCameraWatch는 움직인 프레임에만 true를 준다(1인칭 저빈도 컬링)', () => {
  const moved = createCameraWatch();
  const cam = lookFrom(4);
  expect(moved(cam)).toBe(true);        // 첫 호출은 한 번 잰다
  expect(moved(cam)).toBe(false);       // 서 있는 동안은 디바운스를 다시 걸지 않는다
  cam.position.set(0.5, 0, 4.25);
  expect(moved(cam)).toBe(true);
  cam.lookAt(1, 0, 0); cam.updateMatrixWorld();
  expect(moved(cam)).toBe(true);        // 방향만 돌아도 다시 잰다
  expect(moved(null)).toBe(false);
});
