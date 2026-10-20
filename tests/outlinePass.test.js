// 계획 17 Task 6: 화면 공간 윤곽선(src/view3d/outlinePass.js) — 켜고 끄는 규칙 · ② 패스에서 빼는 물체 · renderer.render 감싸기의 순서와 복원.
import { describe, test, expect, vi } from 'vitest';
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { installOutline, outlineEnabled, skipInNormalPass, OUTLINE } from '../src/view3d/outlinePass.js';

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

function fakeRenderer() {
  const calls = [];
  let target = null;
  const r = {
    calls, shadowMap: { autoUpdate: true },
    render: vi.fn((scene, cam) => calls.push({ scene, cam, target, override: scene.overrideMaterial, bg: scene.background, auto: r.shadowMap.autoUpdate })),
    dispose: vi.fn(),
    getRenderTarget: () => target, setRenderTarget: t => { target = t; },
    getDrawingBufferSize: v => v.set(200, 100),
    getClearColor: c => c.set(0xffffff), getClearAlpha: () => 1, setClearColor: vi.fn(), clear: vi.fn(),
  };
  return r;
}

describe('renderer.render 감싸기', () => {
  const scene = () => {
    const s = new THREE.Scene(); s.background = new THREE.Color(0xeeeeee);
    const label = new THREE.Sprite(); const box = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial());
    s.add(box, label);
    return { s, label, box };
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
  test('켜져 있으면 ① 색 → ② 법선(라벨 숨김 · 그림자 갱신 끔 · 배경 없음) → ③ 화면 합성, 그리고 모두 되돌린다', () => {
    const r = fakeRenderer();
    const ctl = installOutline(r, { enabled: () => true });
    const { s, label } = scene(), cam = new THREE.PerspectiveCamera(50, 2, 0.1, 100);
    r.render(s, cam);
    expect(r.calls).toHaveLength(3);
    const [color, normal, quad] = r.calls;
    expect(color.scene).toBe(s); expect(color.target).toBeInstanceOf(THREE.WebGLRenderTarget); expect(color.target.samples).toBe(4);
    expect(normal.scene).toBe(s); expect(normal.target.depthTexture).toBeInstanceOf(THREE.DepthTexture);
    expect(normal.override).toBeInstanceOf(THREE.MeshNormalMaterial); expect(normal.bg).toBeNull(); expect(normal.auto).toBe(false);
    expect(quad.scene).not.toBe(s); expect(quad.target).toBeNull();
    expect(color.target.width).toBe(200); expect(color.target.height).toBe(100);
    expect(normal.target.width).toBe(Math.round(200 * OUTLINE.normalScale));
    expect(s.overrideMaterial).toBeNull(); expect(s.background.getHex()).toBe(0xeeeeee); expect(r.shadowMap.autoUpdate).toBe(true); expect(label.visible).toBe(true);
    expect(typeof ctl.dispose).toBe('function');
  });
  test('같은 크기면 렌더 타깃을 다시 만들지 않는다 · dispose는 원래 dispose도 부른다', () => {
    const r = fakeRenderer(), rawDispose = r.dispose;
    installOutline(r, { enabled: () => true });
    const { s } = scene(), cam = new THREE.PerspectiveCamera();
    r.render(s, cam); const t1 = r.calls[0].target;
    r.render(s, cam); const t2 = r.calls[3].target;
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
