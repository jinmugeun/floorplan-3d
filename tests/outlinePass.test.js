// 계획 17 Task 6: 화면 공간 윤곽선(src/view3d/outlinePass.js) — 켜고 끄는 규칙 · ② 패스에서 빼는 물체 · renderer.render 감싸기의 순서와 복원
// · ④ 겹침(라벨·점·기즈모는 합성 뒤에 그려 선이 라벨 위로 지나가지 않는다 — Task 6 리뷰 Fix 1).
import { describe, test, expect, vi } from 'vitest';
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { installOutline, outlineEnabled, skipInNormalPass, isOverlay, OUTLINE } from '../src/view3d/outlinePass.js';

test('보기 옵션 \'윤곽선\'(v3.itemEdges)과 성능 모드를 따른다', () => {
  expect(outlineEnabled({ v3: {}, perfMode: 'display' })).toBe(true);
  expect(outlineEnabled({})).toBe(true);
  expect(outlineEnabled({ v3: { itemEdges: false } })).toBe(false);
  expect(outlineEnabled({ v3: { itemEdges: true }, perfMode: 'performance' })).toBe(false);
  expect(OUTLINE.strength).toBeGreaterThan(0);
});

test('② 법선 패스에서 빼는 물체', () => {
  const opaque = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial());
  const glass = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial({ transparent: true, opacity: 0.4 }));
  const hiddenMat = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial({ visible: false }));
  const multi = new THREE.Mesh(new THREE.BoxGeometry(), [new THREE.MeshStandardMaterial(), new THREE.MeshStandardMaterial({ transparent: true })]);
  const root = new THREE.Object3D(); root.isTransformControlsRoot = true;
  expect(skipInNormalPass(opaque)).toBe(false);
  expect(skipInNormalPass(new THREE.Group())).toBe(false);
  for (const o of [glass, hiddenMat, multi, root, new THREE.Sprite(), new THREE.Points(), new THREE.Line(), new THREE.LineSegments()]) expect(skipInNormalPass(o)).toBe(true);
});

test('④ 겹침 = 라벨 Sprite · 접힌 점 Points · 기즈모 뿌리(모두 depthTest false — 합성 위에 그린다)', () => {
  const root = new THREE.Object3D(); root.isTransformControlsRoot = true;
  for (const o of [new THREE.Sprite(), new THREE.Points(), root]) expect(isOverlay(o)).toBe(true);
  for (const o of [new THREE.Mesh(), new THREE.LineSegments(), new THREE.Group()]) expect(isOverlay(o)).toBe(false);
});

// 가짜 렌더러: 부를 때마다 타깃 · 덮어쓰기 재질 · 배경 · 그림자 자동 갱신 · autoClear · 최상위 자식의 visible을 적어 둔다(peek은 테스트가 더 볼 것).
function fakeRenderer() {
  const calls = [];
  let target = null;
  const r = {
    calls, autoClear: true, shadowMap: { autoUpdate: true }, peek: null,
    render: vi.fn((scene, cam) => calls.push({ scene, cam, target, override: scene.overrideMaterial, bg: scene.background, auto: r.shadowMap.autoUpdate,
      ac: r.autoClear, vis: scene.children.map(c => c.visible), peek: r.peek?.() })),
    dispose: vi.fn(),
    getRenderTarget: () => target, setRenderTarget: t => { target = t; },
    getDrawingBufferSize: v => v.set(200, 100),
    getClearColor: c => c.set(0xffffff), getClearAlpha: () => 1, setClearColor: vi.fn(), clear: vi.fn(),
  };
  return r;
}

describe('renderer.render 감싸기', () => {
  // 최상위 자식 순서: [box, label]
  const scene = ({ label = true } = {}) => {
    const s = new THREE.Scene(); s.background = new THREE.Color(0xeeeeee);
    const box = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial()); s.add(box);
    const lab = label ? new THREE.Sprite() : null; if (lab) s.add(lab);
    return { s, label: lab, box };
  };
  const restored = (r, s) => {
    expect(s.overrideMaterial).toBeNull(); expect(s.background.getHex()).toBe(0xeeeeee);
    expect(r.shadowMap.autoUpdate).toBe(true); expect(r.autoClear).toBe(true);
  };
  test('꺼져 있으면 원래 render 한 번', () => {
    const r = fakeRenderer(), raw = r.render;
    installOutline(r, { enabled: () => false });
    const { s } = scene(), cam = new THREE.PerspectiveCamera();
    r.render(s, cam);
    expect(raw).toHaveBeenCalledTimes(1);
    expect(raw).toHaveBeenCalledWith(s, cam);
  });
  test('렌더 타깃이 걸려 있거나 Scene이 아니면 원래 render', () => {
    const r = fakeRenderer(), raw = r.render;
    installOutline(r, { enabled: () => true });
    r.setRenderTarget({}); r.render(scene().s, new THREE.PerspectiveCamera());
    r.setRenderTarget(null); r.render(new THREE.Group(), new THREE.PerspectiveCamera());
    expect(raw).toHaveBeenCalledTimes(2);
  });
  test('켜져 있으면 ① 색(라벨 없이) → ② 법선(그림자 갱신 끔 · 배경 없음) → ③ 화면 합성 → ④ 라벨만 화면에 덧그림, 그리고 모두 되돌린다', () => {
    const r = fakeRenderer();
    const ctl = installOutline(r, { enabled: () => true });
    const { s, label, box } = scene(), cam = new THREE.PerspectiveCamera(50, 2, 0.1, 100);
    r.render(s, cam);
    expect(r.calls).toHaveLength(4);
    const [color, normal, quad, over] = r.calls;
    expect(color.scene).toBe(s); expect(color.target).toBeInstanceOf(THREE.WebGLRenderTarget); expect(color.target.samples).toBe(4);
    expect(color.vis).toEqual([true, false]);                       // ①에 라벨이 없다 → ③이 라벨 위에 선을 긋지 않는다
    expect(normal.scene).toBe(s); expect(normal.target.depthTexture).toBeInstanceOf(THREE.DepthTexture);
    expect(normal.override).toBeInstanceOf(THREE.MeshNormalMaterial); expect(normal.bg).toBeNull(); expect(normal.auto).toBe(false);
    expect(normal.vis).toEqual([true, false]);
    expect(quad.scene).not.toBe(s); expect(quad.target).toBeNull(); expect(quad.ac).toBe(true);
    expect(color.target.width).toBe(200); expect(color.target.height).toBe(100);
    expect(normal.target.width).toBe(Math.round(200 * OUTLINE.normalScale));
    // ④ 겹침: 화면에, 지우지 않고(autoClear false), 배경 없이(색 배경은 강제로 지운다), 그림자 맵을 다시 그리지 않고, 라벨만 보이게
    expect(over.scene).toBe(s); expect(over.target).toBeNull(); expect(over.ac).toBe(false); expect(over.bg).toBeNull(); expect(over.auto).toBe(false);
    expect(over.override).toBeNull(); expect(over.vis).toEqual([false, true]);
    restored(r, s); expect(label.visible).toBe(true); expect(box.visible).toBe(true);
    expect(typeof ctl.dispose).toBe('function');
  });
  test('겹칠 것이 없으면 정확히 3번(④ 없음) — 숨긴 라벨은 겹침이 아니고 숨긴 채로 남는다', () => {
    const r = fakeRenderer();
    installOutline(r, { enabled: () => true });
    const { s, box } = scene({ label: false }), cam = new THREE.PerspectiveCamera();
    const hiddenLabel = new THREE.Sprite(); hiddenLabel.visible = false; s.add(hiddenLabel);
    r.render(s, cam);
    expect(r.calls).toHaveLength(3);
    expect(r.calls.map(c => c.ac)).toEqual([true, true, true]);
    restored(r, s); expect(box.visible).toBe(true); expect(hiddenLabel.visible).toBe(false);
  });
  test('기즈모 뿌리 아래 메시는 ④에서 숨기지 않는다(겹침 뿌리 아래는 훑지 않는다) · 숨겨 둔 메시는 숨긴 채로', () => {
    const r = fakeRenderer();
    installOutline(r, { enabled: () => true });
    const { s, box } = scene({ label: false }), cam = new THREE.PerspectiveCamera();
    const root = new THREE.Object3D(); root.isTransformControlsRoot = true;
    const handle = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial()); root.add(handle);
    const off = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial()); off.visible = false;
    const nested = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial()); box.add(nested);
    s.add(root, off);                                                  // 최상위: [box, root, off]
    r.peek = () => [handle.visible, nested.visible];
    r.render(s, cam);
    expect(r.calls).toHaveLength(4);
    expect(r.calls[0].vis).toEqual([true, false, false]);              // ①: 기즈모 없음
    expect(r.calls[3].vis).toEqual([false, true, false]);              // ④: 기즈모만
    expect(r.calls[3].peek).toEqual([true, false]);                    // 손잡이는 보이고 상자 안 메시는 숨김
    restored(r, s);
    expect([box.visible, root.visible, handle.visible, nested.visible, off.visible]).toEqual([true, true, true, true, false]);
  });
  test('같은 크기면 렌더 타깃을 다시 만들지 않는다 · dispose는 원래 dispose도 부른다', () => {
    const r = fakeRenderer(), rawDispose = r.dispose;
    installOutline(r, { enabled: () => true });
    const { s } = scene(), cam = new THREE.PerspectiveCamera();
    r.render(s, cam); const t1 = r.calls[0].target, n = r.calls.length;
    r.render(s, cam); const t2 = r.calls[n].target;
    expect(t2).toBe(t1);
    r.dispose();
    expect(rawDispose).toHaveBeenCalledTimes(1);
  });
});

test('view3d.js는 렌더러를 만들 때 윤곽선을 설치한다(렌더 줄은 그대로 — rebuildGate.test 고정 줄)', () => {
  const src = readFileSync(fileURLToPath(new URL('../src/view3d/view3d.js', import.meta.url)), 'utf8');
  expect(src).toContain('installOutline(renderer, { enabled: () => outlineEnabled(store.get().view) })');
  expect(src).toContain('prepFrame(); renderer.render(scene, ov.camera() ?? camera);');
});
