// 2D를 보는 동안 3D 리빌드를 보류하는 문 + 셰이더 예열(2026-10-13 · 계획 14 Task B · 계획 13 Task 3 리뷰 P3-1 · 사전 검토 I-4 · m-5 · m-6).
// 3D 화면은 WebGL이 없는 테스트 환경에서 만들 수 없으므로, 규칙은 rebuildGate.js의 순수 콜백으로 재고
// view3d.js가 그 문을 거치는지는 소스를 읽어 고정한다(architecture.test.js와 같은 방식).
import { describe, test, expect, vi, beforeAll, afterAll } from 'vitest';
import * as THREE from 'three';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRebuildGate, shaderPrewarm, runWhenIdle } from '../src/view3d/rebuildGate.js';
import { warmGroup, warmShaders, warmFloor } from '../src/view3d/shaderWarm.js';
import { buildFloorGroup } from '../src/view3d/build.js';
import { setLabelCanvasFactory, clearLabelCache } from '../src/view3d/labels3d.js';
import { enableAssets, requestAsset, onAssetsReady, __setLoader, __reset } from '../src/view3d/itemAssets.js';
import { buildSampleProject } from '../src/samples/gangdang.js';
import { productById } from '../src/products/catalog.js';
import { KITCHEN_PRODUCTS } from '../src/products/catalogKitchen.js';
import { DEFAULT_VIEW, activeFloor } from '../src/state/schema.js';

// 에셋 로더 대역(계획 15 Task B): GLB·네트워크 없이 작은 상자 하나를 돌려준다. 도착 알림은 setTimeout 0으로 모이므로 몇 틱 기다린다.
const tinyModel = () => { const g = new THREE.Group(); g.add(new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.8, 0.4), new THREE.MeshStandardMaterial())); return g; };
const settle = async () => { for (let i = 0; i < 3; i++) await new Promise(r => setTimeout(r, 0)); };

// 보이는지·서명을 바꿀 수 있는 문 + 수동 유휴 큐.
function setup({ visible = false, warmup = null, prewarm = null } = {}) {
  const calls = [], idleQueue = [];
  const state = { visible, sig: 's0' };
  const signature = vi.fn(() => state.sig);
  const gate = createRebuildGate({
    isVisible: () => state.visible,
    signature,
    rebuild: vi.fn(() => calls.push('rebuild')),
    render: vi.fn(() => calls.push('render')),
    warmup, prewarm,
    idle: cb => idleQueue.push(cb),
  });
  const runIdle = () => { const q = idleQueue.splice(0); q.forEach(cb => cb()); };
  // store 변경 한 번 = 서명이 바뀌고 구독이 onStoreChange를 부른다
  const change = sig => { state.sig = sig; return gate.onStoreChange(); };
  return { gate, calls, state, signature, idleQueue, runIdle, change };
}

describe('리빌드 문', () => {
  test('2D(숨김)에서 store가 바뀌면 다시 짓지도 그리지도 않고, 서명도 재지 않는다', () => {
    const { gate, calls, signature, change } = setup({ visible: false });
    expect(change('a')).toBe(false);
    expect(change('b')).toBe(false);
    expect(calls).toEqual([]);
    expect(signature).not.toHaveBeenCalled();     // 사동 sceneSignature ≈ 1 ms/회 — 숨김 동안은 0회
    expect(gate.dirty).toBe(true);
  });

  test('3D로 바꾸는 순간 한 번 짓고 한 번 그린다 — 숨김 동안 바뀐 횟수와 상관없이', () => {
    const { gate, calls, state, change } = setup({ visible: false });
    change('a'); change('b'); change('c');
    state.visible = true;
    expect(gate.onVisible()).toBe(true);
    expect(calls).toEqual(['rebuild', 'render']);
    expect(gate.dirty).toBe(false);
    // ui 구독은 선택·호버마다 부른다: 보류가 없으면 아무것도 하지 않는다
    expect(gate.onVisible()).toBe(false);
    expect(calls).toEqual(['rebuild', 'render']);
  });

  test('숨김 동안의 변경이 서명을 바꾸지 않았으면(보기 전용 값) 보일 때도 짓지 않는다', () => {
    const { gate, calls, state, change } = setup({ visible: true });
    change('a');                                   // 보이는 동안 지은 마지막 서명 'a'
    state.visible = false;
    change('a');                                   // 2D에서 슬라이더 같은 { record: false } 변경
    state.visible = true;
    expect(gate.onVisible()).toBe(false);
    expect(calls).toEqual(['rebuild']);
  });

  test('숨겨진 채로 onVisible을 불러도 짓지 않는다(2D 안의 ui 변경)', () => {
    const { gate, calls, change } = setup({ visible: false });
    change('a');
    expect(gate.onVisible()).toBe(false);
    expect(calls).toEqual([]);
    expect(gate.dirty).toBe(true);
  });

  test('3D가 보이는 동안은 지금처럼 store가 바뀔 때마다 바로 짓는다(같은 서명이면 짓지 않는다)', () => {
    const { gate, calls, change } = setup({ visible: true });
    expect(change('a')).toBe(true);
    expect(change('a')).toBe(false);               // 슬라이더 드래그 같은 같은 서명 연속 dispatch
    expect(change('b')).toBe(true);
    expect(calls).toEqual(['rebuild', 'rebuild']); // 그리기는 store 구독이 따로 요청한다(지금과 같다)
    expect(gate.dirty).toBe(false);
  });

  test('ensureFresh: 보류가 있으면 한 번 짓고, 없으면 아무것도 하지 않는다', () => {
    const { gate, calls, signature, change } = setup({ visible: false });
    expect(gate.ensureFresh()).toBe(false);
    expect(signature).not.toHaveBeenCalled();
    change('a');
    expect(gate.ensureFresh()).toBe(true);
    expect(gate.ensureFresh()).toBe(false);
    expect(calls).toEqual(['rebuild']);
    expect(gate.dirty).toBe(false);
  });

  test('렌더샷 길(fresh로 감싼 renderImage)은 보류가 있으면 먼저 짓고 그다음 렌더한다 — 인자·반환값은 그대로', () => {
    const { gate, calls, change } = setup({ visible: false });
    const renderImage = vi.fn(opts => { calls.push(`shot:${opts.preset}`); return 'data:image/png;base64,AAA'; });
    const shot = gate.fresh(renderImage);
    change('a');                                   // 2D에서 DXF를 가져왔다
    expect(shot({ width: 10, height: 10, preset: 'front' })).toBe('data:image/png;base64,AAA');
    expect(renderImage).toHaveBeenCalledWith({ width: 10, height: 10, preset: 'front' });
    expect(calls).toEqual(['rebuild', 'shot:front']);
    shot({ preset: 'top' });                       // 보류가 없으면 바로 렌더한다
    expect(calls).toEqual(['rebuild', 'shot:front', 'shot:top']);
  });

  test('ensureFresh로 지은 뒤 3D로 바꾸면 다시 짓지 않는다', () => {
    const { gate, calls, state, change } = setup({ visible: false });
    change('a'); gate.ensureFresh();
    state.visible = true;
    expect(gate.onVisible()).toBe(false);
    expect(calls).toEqual(['rebuild']);
  });

  test('invalidate(서명 밖의 사유 — 라벨 밀도 끔 진입·이탈): 숨김이면 보류만, 보이면 같은 서명이어도 바로 짓는다', () => {
    const { gate, calls, state, change } = setup({ visible: false });
    change('a'); gate.ensureFresh();
    gate.invalidate();
    expect(calls).toEqual(['rebuild']);
    expect(gate.dirty).toBe(true);
    state.visible = true; gate.onVisible();        // 서명은 그대로지만 강제 → 짓는다
    gate.invalidate();
    expect(calls).toEqual(['rebuild', 'rebuild', 'render', 'rebuild']);
  });

  test('생성 직후의 첫 빌드도 숨김이면 보류된다(앱은 2D로 시작한다)', () => {
    const { gate, calls, state } = setup({ visible: false });
    gate.onStoreChange();
    expect(calls).toEqual([]);
    state.visible = true; gate.onVisible();
    expect(calls).toEqual(['rebuild', 'render']);
  });
});

describe('셰이더 예열 일정', () => {
  test('warmup: 문을 만들면 유휴 시간에 한 번 — 숨김이어도 한다(첫 3D 전환 전에 링크를 끝내 두려고)', () => {
    const warmup = vi.fn();
    const { idleQueue, runIdle, change } = setup({ visible: false, warmup });
    expect(warmup).not.toHaveBeenCalled();         // 만드는 길(앱 시작)에서는 돌지 않는다
    expect(idleQueue).toHaveLength(1);
    runIdle();
    expect(warmup).toHaveBeenCalledTimes(1);
    change('a'); change('b'); runIdle();
    expect(warmup).toHaveBeenCalledTimes(1);
  });

  test('prewarm: 처음 보이는 리빌드 뒤 유휴 시간에 한 번만', () => {
    const prewarm = vi.fn();
    const { gate, state, idleQueue, runIdle, change } = setup({ visible: false, prewarm });
    change('a');
    expect(idleQueue).toHaveLength(0);             // 숨김 동안에는 짓지도 예열하지도 않는다
    state.visible = true; gate.onVisible();
    change('b'); change('c');
    expect(idleQueue).toHaveLength(1);
    expect(prewarm).not.toHaveBeenCalled();        // 클릭 경로에서는 돌지 않는다
    runIdle();
    expect(prewarm).toHaveBeenCalledTimes(1);
    change('d'); runIdle();
    expect(prewarm).toHaveBeenCalledTimes(1);
  });

  test('prewarm 유휴 시점에 다시 숨겨졌으면 건너뛰고, 다음에 보이는 리빌드 뒤에 다시 건다', () => {
    const prewarm = vi.fn();
    const { gate, state, runIdle, change } = setup({ visible: true, prewarm });
    change('a');
    state.visible = false; runIdle();
    expect(prewarm).not.toHaveBeenCalled();
    change('b'); state.visible = true; gate.onVisible(); runIdle();
    expect(prewarm).toHaveBeenCalledTimes(1);
  });

  test('ensureFresh(숨긴 채 렌더샷)는 prewarm을 걸지 않는다 — 렌더샷이 이미 그 프로그램을 쓴다', () => {
    const prewarm = vi.fn();
    const { gate, idleQueue, change } = setup({ visible: false, prewarm });
    change('a'); gate.ensureFresh();
    expect(idleQueue).toHaveLength(0);
  });

  test('예열이 던지거나 거부돼도 밖으로 새지 않는다(예열은 덤이다)', async () => {
    const boom = setup({ visible: true, prewarm: () => { throw new Error('context lost'); }, warmup: () => { throw new Error('x'); } });
    boom.change('a');
    expect(() => boom.runIdle()).not.toThrow();
    const rej = setup({ visible: true, prewarm: () => Promise.reject(new Error('x')), warmup: () => Promise.reject(new Error('y')) });
    const unhandled = vi.fn(); process.on('unhandledRejection', unhandled);
    rej.change('a'); rej.runIdle();
    await new Promise(r => setTimeout(r, 0));
    process.off('unhandledRejection', unhandled);
    expect(unhandled).not.toHaveBeenCalled();
  });

  test('shaderPrewarm: compileAsync가 있어도 compile(동기)을 쓴다, 없으면(jsdom) null — 계획 14 Task B 리뷰 I-1', () => {
    const scene = { isScene: true }, cam = { isCamera: true };
    const r1 = { compileAsync: vi.fn(() => Promise.resolve()), compile: vi.fn() };
    shaderPrewarm(r1, scene, () => cam)();
    expect(r1.compile).toHaveBeenCalledWith(scene, cam);
    expect(r1.compileAsync).not.toHaveBeenCalled();
    expect(shaderPrewarm({ compileAsync: vi.fn() }, scene, () => cam)).toBeNull();
    expect(shaderPrewarm({}, scene, () => cam)).toBeNull();
    expect(shaderPrewarm(null, scene, () => cam)).toBeNull();
  });

  // three r169의 compile/compileAsync를 그대로 본뜬 가짜(WebGLRenderer.js:936-1080): compile은 재질마다 프로그램을 붙이고,
  // compileAsync는 그 뒤 setTimeout(10)으로 properties.get(재질).currentProgram.isReady()를 폴링한다. properties는 WeakMap이라
  // dispose된 재질은 빈 객체를 돌려준다 → currentProgram이 undefined → 타이머 안 TypeError(Promise 거부가 아니다).
  function threeLikeRenderer() {
    const props = new WeakMap();
    const get = m => { if (!props.has(m)) props.set(m, {}); return props.get(m); };
    const r = {
      compile: vi.fn(scene => { const mats = new Set(); scene.traverse(o => { if (o.material) { get(o.material).currentProgram = { isReady: () => false }; mats.add(o.material); } }); return mats; }),
      compileAsync: vi.fn(scene => { const mats = r.compile(scene); return new Promise(res => { const poll = () => { mats.forEach(m => { if (get(m).currentProgram.isReady()) mats.delete(m); }); if (!mats.size) { res(); return; } setTimeout(poll, 10); }; setTimeout(poll, 10); }); }),
      dispose: m => props.delete(m),   // deallocateMaterial → properties.remove
    };
    return r;
  }
  test('예열과 리빌드가 겹쳐도(유휴 예열 직후 3D 편집이 옛 재질을 dispose) 아무것도 던지지 않는다 — 리뷰 I-1', () => {
    vi.useFakeTimers();
    try {
      // 가짜가 버그를 재현하는지 먼저 본다: compileAsync 폴링 중 dispose → 타이머가 던진다
      const bad = threeLikeRenderer(), m0 = new THREE.MeshStandardMaterial(), s0 = new THREE.Scene();
      s0.add(new THREE.Mesh(new THREE.BoxGeometry(), m0));
      bad.compileAsync(s0); bad.dispose(m0);
      expect(() => vi.runAllTimers()).toThrow(/isReady/);
      // 실제 배선: 보이는 리빌드 → 유휴 예열(shaderPrewarm) → 같은 틱에 편집이 다시 지으며 옛 재질을 버린다
      const r = threeLikeRenderer(), scene = new THREE.Scene(), cam = new THREE.PerspectiveCamera();
      let mat = null;
      const rebuild = () => { if (mat) r.dispose(mat); scene.clear(); mat = new THREE.MeshStandardMaterial(); scene.add(new THREE.Mesh(new THREE.BoxGeometry(), mat)); };
      const idleQueue = [], sig = { v: 'a' };
      const gate = createRebuildGate({ isVisible: () => true, signature: () => sig.v, rebuild, prewarm: shaderPrewarm(r, scene, () => cam), idle: cb => idleQueue.push(cb) });
      gate.onStoreChange();
      idleQueue.splice(0).forEach(cb => cb());
      sig.v = 'b'; gate.onStoreChange();
      expect(() => vi.runAllTimers()).not.toThrow();
      expect(r.compile).toHaveBeenCalledTimes(1);
      expect(r.compileAsync).not.toHaveBeenCalled();
    } finally { vi.useRealTimers(); }
  });

  test('runWhenIdle: requestIdleCallback이 있으면 시한을 붙여 쓰고, 없으면 setTimeout으로 내려간다', () => {
    const ric = vi.fn();
    vi.stubGlobal('requestIdleCallback', ric);
    const cb = () => {};
    runWhenIdle(cb);
    expect(ric).toHaveBeenCalledWith(cb, expect.objectContaining({ timeout: expect.any(Number) }));
    vi.unstubAllGlobals();
    vi.useFakeTimers();
    try {
      const later = vi.fn();
      runWhenIdle(later);
      expect(later).not.toHaveBeenCalled();
      vi.runAllTimers();
      expect(later).toHaveBeenCalledTimes(1);
    } finally { vi.useRealTimers(); }
  });
});

// ── 예열 장면(shaderWarm.js): 실제 재질 공장으로 지어 프로그램 키가 실제 장면과 같아야 한다 ──
describe('예열 장면', () => {
  // node에는 document가 없다: 라벨·점 텍스처가 부르는 메서드만 가진 가짜 캔버스(labels3d.test.js와 같은 방식).
  const ctx = { fillStyle: '', font: '', textAlign: '', textBaseline: '', clearRect() {}, fillRect() {}, fillText() {} };
  beforeAll(() => setLabelCanvasFactory(() => ({ width: 0, height: 0, getContext: () => ctx })));
  afterAll(() => { clearLabelCache(); setLabelCanvasFactory(null); });
  // 프로그램 키를 가르는 재질 성질(three r169 WebGLPrograms.getParameters): 물체·재질 종류, 투명(OPAQUE), 면(side), map, 정점 색.
  const kinds = g => { const s = new Set(); g.traverse(o => { const m = o.material; if (m) s.add(`${o.type}|${m.type}|t${+m.transparent}|s${m.side}|map${+!!m.map}|vc${+!!m.vertexColors}`); }); return s; };

  test('예열 층은 견본 프로젝트(강당중)가 쓰는 재질 변형을 모두 갖고, 라벨 Sprite와 접힌 점 Points도 있다', () => {
    const warm = kinds(warmGroup(DEFAULT_VIEW));
    const p = buildSampleProject();
    const real = kinds(buildFloorGroup(activeFloor(p), p.view ?? DEFAULT_VIEW));
    expect([...real].filter(k => !warm.has(k))).toEqual([]);
    expect([...warm].some(k => k.startsWith('Sprite|SpriteMaterial|t1|s0|map1'))).toBe(true);
    expect([...warm].some(k => k.startsWith('Points|PointsMaterial|t1|s0|map1|vc1'))).toBe(true);
    expect([...warm].some(k => k.startsWith('Mesh|MeshStandardMaterial|t1'))).toBe(true);    // 창·덕트(반투명)
  });

  test('warmShaders: compile(동기)에 실제 장면을 세 번째 인자(조명·그림자)로 넘기고, 재질은 dispose하지 않는다(프로그램을 붙들어 둔다)', async () => {
    const scene = { isScene: true }, cam = { isCamera: true };
    let warm = null;
    const r = { compileAsync: vi.fn(), compile: vi.fn((s, c, target) => { warm = s; expect(c).toBe(cam); expect(target).toBe(scene); }) };
    // three는 프로그램을 쓰는 마지막 재질이 dispose되면 프로그램을 지운다(WebGLPrograms.releaseProgram) → 예열이 사라진다
    const dispose = vi.spyOn(THREE.Material.prototype, 'dispose');
    try { await warmShaders(r, scene, cam, DEFAULT_VIEW); expect(dispose).not.toHaveBeenCalled(); } finally { dispose.mockRestore(); }
    expect(r.compile).toHaveBeenCalledTimes(1);
    expect(r.compileAsync).not.toHaveBeenCalled();   // 리뷰 I-1: 폴링 타이머가 renderer.dispose와 부딪칠 수 있다 — 기다리는 쪽도 없다
    expect(warm.isScene).toBe(true);
    expect(warm.children[0].children.length).toBeGreaterThan(5);
    expect(warmShaders({ compileAsync: vi.fn() }, scene, cam, DEFAULT_VIEW)).toBeNull();
    expect(warmShaders({}, scene, cam, DEFAULT_VIEW)).toBeNull();
  });

  test('warmShaders는 내려받는 중인 웹 글꼴을 기다린 뒤에 라벨 텍스처를 만든다(캐시된 라벨·점 텍스처를 실제 장면이 다시 쓴다)', async () => {
    let release;
    vi.stubGlobal('document', { fonts: { ready: new Promise(r => { release = r; }) } });
    try {
      const r = { compile: vi.fn() };
      const p = warmShaders(r, { isScene: true }, { isCamera: true }, DEFAULT_VIEW);
      await new Promise(res => setTimeout(res, 0));
      expect(r.compile).not.toHaveBeenCalled();
      release(); await p;
      expect(r.compile).toHaveBeenCalledTimes(1);
    } finally { vi.unstubAllGlobals(); }
  });

  // 계획 15 Task B · 사전 검토 I-6: 예열은 2D 시작 직후 유휴 시간에 돈다 — 예열 층의 제품(냉장고 등)에 asset이 붙으면 2D만 쓰는 세션이
  // GLB·로더 청크를 받았다. 카탈로그는 이 테스트 동안만 고친다 — 이전 값을 되돌린다(2026-10-13 · 리뷰 B-m2: delete는 Task C처럼
  // 진짜 asset이 붙은 제품이면 그 필드를 남은 테스트에서 지운다).
  test('예열 장면(shaderWarm)은 에셋 없이 짓는다 — requestAsset 0회(대조: 같은 층을 실제 view로 지으면 요청한다)', async () => {
    __reset(); enableAssets();
    const loader = vi.fn(() => Promise.resolve(tinyModel())); __setLoader(loader);
    const fridge = productById('fridge-2door'), prev = fridge.asset;
    fridge.asset = 'fridge-2door';
    try {
      warmGroup(DEFAULT_VIEW); await settle();
      expect(loader).not.toHaveBeenCalled();
      buildFloorGroup(warmFloor(), DEFAULT_VIEW); await settle();
      expect(loader).toHaveBeenCalledTimes(1);
    } finally { if (prev === undefined) delete fridge.asset; else fridge.asset = prev; __reset(); }
  });

  // 계획 17 최종 리뷰 M-15: 예열 층의 스테인리스 형상(오븐·배식대)은 엑셀 제품에서 찾는다 — 엑셀이 바뀌어 그 형상이 없으면 일반 상자로 짓는다
  // (예전에는 createItem(undefined)가 던져 예열이 통째로 빠졌다). 카탈로그는 이 테스트 동안만 줄이고 되돌린다.
  test('엑셀에서 오븐·배식대 형상이 사라져도 예열 층은 던지지 않고 일반 상자로 대신한다', () => {
    const all = KITCHEN_PRODUCTS.slice(), gone = new Set(['oven', 'counter']);
    expect(all.filter(p => gone.has(p.shape)).length).toBeGreaterThan(0);
    KITCHEN_PRODUCTS.length = 0; KITCHEN_PRODUCTS.push(...all.filter(p => !gone.has(p.shape)));
    try {
      expect(() => warmGroup(DEFAULT_VIEW)).not.toThrow();
      expect(warmFloor().items.filter(i => i.productId === 'equip-generic')).toHaveLength(2);
    } finally { KITCHEN_PRODUCTS.length = 0; KITCHEN_PRODUCTS.push(...all); }
    expect(warmFloor().items.filter(i => i.productId === 'equip-generic')).toHaveLength(0);
  });
});

// ── 배선: view3d.js가 이 문을 거친다(WebGL 없이 고정할 수 있는 유일한 방법이 소스 읽기다) ──
const read = p => readFileSync(fileURLToPath(new URL(p, import.meta.url)), 'utf8');
const SRC = fileURLToPath(new URL('../src', import.meta.url));

describe('view3d 배선', () => {
  const v3 = read('../src/view3d/view3d.js');

  test('store 구독은 문에 알리기만 하고, ui 구독은 보일 때를 알리고, 그리기 요청은 숨김이면 버린다', () => {
    expect(v3).toMatch(/store\.subscribe\(\(\) => \{ gate\.onStoreChange\(\); applyViewSettings\(\); requestRender\(\); \}\)/);
    expect(v3).toMatch(/signature: \(\) => sceneSignature\(store\.get\(\)\)/);       // 서명은 문이 필요할 때만 잰다
    expect(v3).toMatch(/ui\.subscribe\(\(\) => \{[^}]*gate\.onVisible\(\)/);
    expect(v3).toMatch(/function requestRender\(\) \{ if \(!raf && gate\.isVisible\(\)\)/);
    // 보이는지 = ui 모드가 2D가 아니다(shell.js가 같은 값으로 #c3d를 숨긴다). destroy 뒤에는 그리지도 예열하지도 않는다
    expect(v3).toMatch(/isVisible: \(\) => alive && ui\.get\(\)\.mode !== '2d'/);
    expect(read('../src/ui/shell.js')).toMatch(/els\.view3d\.hidden = s\.mode === '2d'/);
  });

  test('rebuild()를 문 밖에서 직접 부르지 않는다(생성·라벨 밀도까지 문을 거친다)', () => {
    const direct = [...v3.matchAll(/(?<![.\w]|function )rebuild\(\)/g)].length;
    expect(direct).toBe(0);                               // 정의(function rebuild())와 문에 넘기는 `rebuild,`뿐
    expect(v3).toMatch(/createRebuildGate\(\{[^\n]*\brebuild,/);
    expect(v3).toMatch(/kind === 'rebuild'\) gate\.invalidate\(\)/);
    expect(v3).toMatch(/gate\.onStoreChange\(\); resize\(\); setMode\('iso'\)/);
  });

  test('렌더샷·캡처는 문으로 감쌌다: 2D에서 렌더샷·시방서 입면을 찍어도 가져온 벽·기구가 들어 있다', () => {
    expect(v3).toMatch(/renderImage: gate\.fresh\(renderImage\)/);
    expect(v3).toMatch(/capture: gate\.fresh\(\(\) => renderer\.domElement\.toDataURL\('image\/png'\)\)/);
    expect(v3).toMatch(/ensureFresh: gate\.ensureFresh/);
    // 숨긴 동안은 프레임이 돌지 않는다: 2D에서 찍는 렌더샷은 화면 프레임이 하던 컷어웨이·단일 공간·라벨 컬링을 먼저 한다
    // (전에는 숨은 프레임이 해 두어 그림이 같았다 — 2026-10-13 측정: 이것이 없으면 앞 벽이 남고 라벨이 접히지 않았다).
    expect(v3).toMatch(/function renderImage\([^)]*\) \{\s*if \(!gate\.isVisible\(\)\) \{ prepFrame\(\); cullNow\(\); \}/);
    expect(v3).toMatch(/prepFrame\(\); renderer\.render\(scene, ov\.camera\(\) \?\? camera\);/);   // 화면 프레임과 같은 함수
  });

  // 2026-10-13 · 최종 리뷰 X-5(M-B2): 라벨 컬링은 카메라의 matrixWorldInverse로 투영한다(labels3d.projectSprite → Vector3.project). OrbitControls.update의
  // lookAt은 새 회전을 쓰기 **전에** matrixWorld를 갱신하고, 숨은 렌더가 없어진 뒤(계획 14 Task B)에는 첫 컬링 전에 행렬을 고쳐 주는 것이 없다 —
  // 직교·2D 투영 프리셋에서 첫 컬링이 옛 자세로 계산되고 120 ms 뒤 다시 재기가 바로잡았다(리뷰 실측 · 원근은 spriteScreenHeight가 가렸다).
  test('라벨 컬링은 카메라 행렬부터 맞추고 잰다 — 낡은 행렬로 컬링하지 않는다', () => {
    const body = v3.match(/function cullNow\(\) \{([^\n]*\n(?: {4}[^\n]*\n)*?) {2}\}/)?.[1] ?? '';
    const upd = body.indexOf('(ov.camera() ?? camera).updateMatrixWorld();'), cull = body.indexOf('cullLabels(');
    expect([upd >= 0, cull > upd]).toEqual([true, true]);
    expect(body.split('\n')[1]).toContain('updateMatrixWorld()');           // cullNow의 첫 줄(재기 전 — 일찍 돌아가는 길보다도 앞)
    // 까닭(three): 자리를 옮긴 뒤 updateMatrixWorld 없이 투영하면 옛 자세의 화면 자리다.
    const cam = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.1, 100), p = new THREE.Vector3(5, 0, 0);
    cam.position.set(0, 10, 0); cam.up.set(0, 0, -1); cam.lookAt(0, 0, 0); cam.updateMatrixWorld();
    cam.position.set(5, 10, 0);
    expect(p.clone().project(cam).x).toBeCloseTo(0.5);                     // 낡은 행렬: 옮기기 전 자리
    cam.updateMatrixWorld();
    expect(p.clone().project(cam).x).toBeCloseTo(0);                       // 맞춘 행렬: 화면 가운데
  });

  // 계획 15 Task B · 사전 검토 I-3 · I-12: 에셋 도착은 서명 밖의 사유다 — 문을 강제로 열고(invalidate) 그리기를 따로 요청한다
  // (보이는 동안 invalidate는 짓기만 하고, 재빌드 뒤 그리기는 라벨이 있을 때만 걸렸다 → 라벨 없는 장면에서 모델이 카메라를 움직일 때까지 안 나왔다).
  test('에셋: 렌더러를 만들 때 켜고, 도착하면 문을 강제로 열고 그리기를 요청하며, destroy가 구독을 푼다', () => {
    expect(v3).toMatch(/import \{ enableAssets, onAssetsReady, setEnvMap \} from '\.\/itemAssets\.js'; import \{ createEnvMap \} from '\.\/envMap\.js';/);
    expect(v3).toMatch(/container\.appendChild\(renderer\.domElement\); enableAssets\(\);/);
    // 환경 맵(계획 15b): 렌더러 바로 뒤에 한 번 만들어 에셋 재질에 걸고(실패해도 3D는 뜬다), destroy가 떼고 버린다.
    expect(v3).toMatch(/enableAssets\(\); let envMap = null; try \{ envMap = createEnvMap\(renderer\); setEnvMap\(envMap\); \} catch/);
    expect(v3).toMatch(/destroy\(\) \{[^\n]*setEnvMap\(null\); envMap\?\.dispose\(\); renderer\.dispose\(\);/);
    expect(v3).toMatch(/const offAssets = onAssetsReady\(\(\) => \{ gate\.invalidate\(\); requestRender\(\); \}\);/);
    expect(v3).toMatch(/destroy\(\) \{[^\n]*\boffAssets\(\);/);
  });

  test('그 배선의 동작: 보이면 같은 서명이어도 한 번 짓고 그리기 요청(두 종류가 같은 틱에 와도 한 번) · 숨김이면 보류했다가 보일 때 짓고 그린다 · 구독을 풀면 더 부르지 않는다', async () => {
    __reset(); enableAssets(); __setLoader(() => Promise.resolve(tinyModel()));
    const { gate, calls, state, change } = setup({ visible: true });
    change('a'); calls.length = 0;
    const requestRender = () => calls.push('requestRender');           // view3d는 숨김이면 이 요청을 버린다(위 정규식)
    const off = onAssetsReady(() => { gate.invalidate(); requestRender(); });   // view3d.js와 같은 배선(위 테스트가 소스를 고정한다)
    try {
      requestAsset({ id: 'a', asset: 'a' }); requestAsset({ id: 'b', asset: 'b' }); await settle();
      expect(calls).toEqual(['rebuild', 'requestRender']);
      state.visible = false; requestAsset({ id: 'c', asset: 'c' }); await settle();
      expect(calls).toEqual(['rebuild', 'requestRender', 'requestRender']);
      state.visible = true; gate.onVisible();
      expect(calls).toEqual(['rebuild', 'requestRender', 'requestRender', 'rebuild', 'render']);
      off(); requestAsset({ id: 'd', asset: 'd' }); await settle();
      expect(calls).toHaveLength(5);
    } finally { off(); __reset(); }
  });

  test('보류했던 리빌드 뒤 첫 3D 프레임은 라벨을 먼저 잰다 · 예열 둘이 배선돼 있다', () => {
    expect(v3).toMatch(/render: \(\) => \{ cullFirst = true; requestRender\(\); \}/);
    expect(v3).toMatch(/function frame\(t\) \{\s*if \(cullFirst\) \{ cullFirst = false; cullNow\(\); \}[^\n]*\n\s*raf = 0;/);
    expect(v3).toMatch(/warmup: \(\) => alive && warmShaders\(renderer, scene, ov\.camera\(\) \?\? camera, store\.get\(\)\.view\)/);
    expect(v3).toMatch(/prewarm: shaderPrewarm\(renderer, scene,/);
  });

  // 호출 자리 전수(계획 14 Task B: "호출 자리를 전부 찾아 테스트로 고정"): view3d/ 밖에서 view3d.X로 부르는 멤버를 모두 모아
  // 분류표와 맞춘다. 새 멤버를 부르기 시작하면 여기서 깨진다 → 숨긴 채 씬을 읽는지 보고 gate.fresh로 감쌀지 정한다.
  test('view3d API 소비자 전수: 씬을 읽는 것은 renderImage·capture(둘 다 gate.fresh)뿐이다', () => {
    const walk = dir => readdirSync(dir, { withFileTypes: true }).flatMap(e => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]));
    const used = new Set();
    for (const f of walk(SRC).filter(f => f.endsWith('.js') && !f.replace(/\\/g, '/').includes('/view3d/'))) {
      // (?<![.\w]): shell의 `els.view3d.hidden`(컨테이너 DOM)은 API가 아니다. 'js'는 import 경로(view3d.js)다.
      for (const m of readFileSync(f, 'utf8').matchAll(/(?<![.\w])view3d\.(\w+)/g)) if (m[1] !== 'js') used.add(m[1]);
    }
    // readsScene: 씬 그룹(벽·아이템·라벨)을 읽는가. 나머지는 카메라·컨트롤·모드만 만진다(bounds·frameScene은 store의 벽만 본다).
    const CONSUMERS = {
      renderImage: true,                       // renderDialog.js:67 · specDialog.js:89(입면 5장) — 둘 다 2D에서 열린다
      capture: true,                           // fileActions.js:38 — 3D 모드에서만 부르지만(2D면 capture2D) 같은 문을 지난다
      getCameraInfo: false, setTarget: false, setGizmoMode: false, refreshLabels: false,   // refreshLabels는 안에서 gate.invalidate
      getMode: false, setMode: false, clearOrthoView: false, setOrthoView: false, controls: false,
    };
    expect([...used].sort()).toEqual(Object.keys(CONSUMERS).sort());
    for (const [k, reads] of Object.entries(CONSUMERS)) if (reads) expect(v3).toMatch(new RegExp(`${k}: gate\\.fresh\\(`));
    expect(read('../src/app/fileActions.js')).toMatch(/ui\.get\(\)\.mode === '2d' \? await capture2D\(store, ui\) : view3d\.capture\(\)/);
  });
});
