// 계획 17 Task 6: 화면 공간 윤곽선(src/view3d/outlinePass.js) — 켜고 끄는 규칙 · ② 패스에서 빼는 물체 · renderer.render 감싸기의 순서와 복원
// · ④ 겹침(라벨·점·기즈모는 합성 뒤에 그려 선이 라벨 위로 지나가지 않는다 — Task 6 리뷰 Fix 1)
// · 렌더 타깃용 셰이더 예열(compile 감싸기) · 직교 카메라 깊이 기준(viewH) · 던져도 복원(try/finally) · ②~④ 행렬 갱신 생략(Task 6 리뷰 Fix 2).
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

// 가짜 렌더러: render를 부를 때마다 타깃 · 덮어쓰기 재질 · 배경 · 그림자 자동 갱신 · autoClear · 행렬 자동 갱신 · 최상위 자식의 visible을 적어 둔다
// (peek은 테스트가 더 볼 것). throwAt번째(0부터) render 호출은 던진다. compile은 그때의 렌더 타깃을 적는다.
function fakeRenderer() {
  const calls = [], compiles = [];
  let target = null;
  const r = {
    calls, compiles, autoClear: true, shadowMap: { autoUpdate: true }, peek: null, throwAt: -1,
    render: vi.fn((scene, cam) => {
      calls.push({ scene, cam, target, override: scene.overrideMaterial, bg: scene.background, auto: r.shadowMap.autoUpdate,
        ac: r.autoClear, mw: scene.matrixWorldAutoUpdate, vis: scene.children.map(c => c.visible), peek: r.peek?.() });
      if (calls.length - 1 === r.throwAt) throw new Error('boom');
    }),
    compile: vi.fn(() => { compiles.push(target); return new Set([compiles.length]); }),
    dispose: vi.fn(),
    getRenderTarget: () => target, setRenderTarget: t => { target = t; },
    getDrawingBufferSize: v => v.set(200, 100),
    getClearColor: c => c.set(0xffffff), getClearAlpha: () => 1, setClearColor: vi.fn(), clear: vi.fn(),
  };
  return r;
}

describe('renderer.render 감싸기', () => {
  // 최상위 자식 순서: [box, label] — box 안에 충돌 상자 선(LineSegments)이 있다
  const scene = ({ label = true } = {}) => {
    const s = new THREE.Scene(); s.background = new THREE.Color(0xeeeeee);
    const box = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial()); s.add(box);
    const line = new THREE.LineSegments(); box.add(line);
    const lab = label ? new THREE.Sprite() : null; if (lab) s.add(lab);
    return { s, label: lab, box, line };
  };
  const restored = (r, s) => {
    expect(s.overrideMaterial).toBeNull(); expect(s.background.getHex()).toBe(0xeeeeee); expect(s.matrixWorldAutoUpdate).toBe(true);
    expect(r.shadowMap.autoUpdate).toBe(true); expect(r.autoClear).toBe(true); expect(r.getRenderTarget()).toBeNull();
  };
  // 한 프레임의 네 호출(①②③④)이 맞는지 — i0은 그 프레임의 첫 호출 번호
  const checkFrame = (r, s, i0) => {
    const [color, normal, quad, over] = r.calls.slice(i0, i0 + 4);
    expect(color.scene).toBe(s); expect(color.target).toBeInstanceOf(THREE.WebGLRenderTarget); expect(color.target.samples).toBe(4);
    expect(color.vis).toEqual([true, false]); expect(color.peek).toBe(true);              // ①: 라벨 없음 · 선은 그린다
    expect(color.mw).toBe(true); expect(color.auto).toBe(true); expect(color.bg.getHex()).toBe(0xeeeeee);   // ①이 행렬·그림자를 갱신한다
    expect(normal.scene).toBe(s); expect(normal.target.depthTexture).toBeInstanceOf(THREE.DepthTexture);
    expect(normal.override).toBeInstanceOf(THREE.MeshNormalMaterial); expect(normal.bg).toBeNull(); expect(normal.auto).toBe(false);
    expect(normal.vis).toEqual([true, false]); expect(normal.peek).toBe(false); expect(normal.mw).toBe(false);
    expect(quad.scene).not.toBe(s); expect(quad.target).toBeNull(); expect(quad.ac).toBe(true);
    // ④ 겹침: 화면에, 지우지 않고(autoClear false), 배경 없이(색 배경은 강제로 지운다), 그림자·행렬 갱신 없이, 라벨만 보이게(선도 숨김)
    expect(over.scene).toBe(s); expect(over.target).toBeNull(); expect(over.ac).toBe(false); expect(over.bg).toBeNull(); expect(over.auto).toBe(false);
    expect(over.override).toBeNull(); expect(over.vis).toEqual([false, true]); expect(over.peek).toBe(false); expect(over.mw).toBe(false);
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
  test('켜져 있으면 ① 색(라벨 없이) → ② 법선 → ③ 화면 합성 → ④ 라벨만 화면에 덧그림, 그리고 모두 되돌린다 — 두 번째 프레임도 같다', () => {
    const r = fakeRenderer();
    const ctl = installOutline(r, { enabled: () => true });
    const { s, label, box, line } = scene(), cam = new THREE.PerspectiveCamera(50, 2, 0.1, 100);
    r.peek = () => line.visible;
    r.render(s, cam);
    expect(r.calls).toHaveLength(4);
    checkFrame(r, s, 0);
    expect(r.calls[0].target.width).toBe(200); expect(r.calls[0].target.height).toBe(100);
    expect(r.calls[1].target.width).toBe(Math.round(200 * OUTLINE.normalScale));
    restored(r, s); expect([label.visible, box.visible, line.visible]).toEqual([true, true, true]);
    r.render(s, cam);                                                  // 작업 목록이 비워져 있어야 두 번째 프레임도 같다
    expect(r.calls).toHaveLength(8);
    checkFrame(r, s, 4);
    restored(r, s); expect([label.visible, box.visible, line.visible]).toEqual([true, true, true]);
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
  test('어느 패스에서 던져도 모두 되돌린다(라벨·선·메시 보임 · override · autoClear · 배경 · 그림자 · 행렬 · 렌더 타깃 · 지움 색) — 다음 프레임은 정상', () => {
    for (const at of [0, 1, 2, 3]) {
      const r = fakeRenderer();
      installOutline(r, { enabled: () => true });
      const { s, label, box, line } = scene(), cam = new THREE.PerspectiveCamera();
      r.peek = () => line.visible; r.throwAt = at;
      expect(() => r.render(s, cam)).toThrow('boom');
      restored(r, s); expect([label.visible, box.visible, line.visible]).toEqual([true, true, true]);
      const last = r.setClearColor.mock.calls.at(-1);
      if (at >= 1) expect([last[0].getHex(), last[1]]).toEqual([0xffffff, 1]);   // ②가 검정으로 바꾼 지움 색을 되돌렸다
      r.throwAt = -1;
      const n = r.calls.length;
      r.render(s, cam);
      expect(r.calls).toHaveLength(n + 4);
      checkFrame(r, s, n);
      restored(r, s);
    }
  });
  test('직교 카메라는 깊이 차를 보이는 높이(viewH)로 잰다 — 카메라 자리와 상관없다(near < 0이면 상대 깊이가 0 이하가 된다) · 원근은 상대 깊이 그대로', () => {
    const r = fakeRenderer();
    installOutline(r, { enabled: () => true });
    const { s } = scene({ label: false });
    const ortho = new THREE.OrthographicCamera(-10, 10, 8, -4, -500, 1000); ortho.zoom = 2;   // view3d.js의 사용자 직교 카메라처럼 near = -500
    r.render(s, ortho);
    const mat = r.calls[2].scene.children[0].material, u = mat.uniforms;
    expect(u.ortho.value).toBe(1); expect(u.viewH.value).toBeCloseTo(6); expect(u.near.value).toBe(-500); expect(u.far.value).toBe(1000);
    r.render(s, new THREE.PerspectiveCamera(50, 2, 0.1, 100));
    expect(u.ortho.value).toBe(0); expect(u.near.value).toBe(0.1);
    expect(mat.fragmentShader).toContain('abs(d - d0) / max(viewH, 1e-3)');   // 직교
    expect(mat.fragmentShader).toContain('abs(d - d0) / max(d0, 1e-4)');      // 원근(그대로)
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

// 예열(shaderWarm.warmShaders · rebuildGate.shaderPrewarm)은 렌더 타깃 없이 compile한다 → 화면용(sRGB 출력) 프로그램. 윤곽선이 켜져 있으면 ①이 모든 재질을
// rtColor에 그리고, r169는 렌더 타깃이 걸리면 출력 색공간이 선형이며 그것이 프로그램 키다(WebGLPrograms.getParameters) — 타깃을 건 채 한 번 더 컴파일해야 한다.
describe('renderer.compile 감싸기(렌더 타깃용 셰이더 예열)', () => {
  test('켜져 있으면 화면용 한 번 + 렌더 타깃을 건 채 한 번, 타깃은 되돌리고 첫 결과를 돌려준다', () => {
    const r = fakeRenderer(), raw = r.compile;
    installOutline(r, { enabled: () => true });
    const s = new THREE.Scene(), cam = new THREE.PerspectiveCamera(), target = new THREE.Scene();
    const out = r.compile(s, cam, target);
    expect(raw).toHaveBeenCalledTimes(2);
    expect(raw.mock.calls).toEqual([[s, cam, target], [s, cam, target]]);
    expect(r.compiles[0]).toBeNull();
    expect(r.compiles[1]).toBeInstanceOf(THREE.WebGLRenderTarget);
    expect(r.getRenderTarget()).toBeNull();
    expect(out).toBe(raw.mock.results[0].value);
  });
  test('꺼져 있거나 렌더 타깃이 이미 걸려 있으면 한 번(그 타깃 그대로)', () => {
    const r = fakeRenderer(), raw = r.compile;
    let on = false;
    installOutline(r, { enabled: () => on });
    const s = new THREE.Scene(), cam = new THREE.PerspectiveCamera();
    r.compile(s, cam);
    expect(raw).toHaveBeenCalledTimes(1);
    on = true; const t = {}; r.setRenderTarget(t);
    r.compile(s, cam);
    expect(raw).toHaveBeenCalledTimes(2); expect(r.compiles[1]).toBe(t); expect(r.getRenderTarget()).toBe(t);
  });
  test('두 번째 compile이 던져도 렌더 타깃은 null로 되돌린다 · 화면에 그린 뒤면 ① 색 타깃을 그대로 쓴다', () => {
    const r = fakeRenderer(), raw = r.compile;
    installOutline(r, { enabled: () => true });
    const s = new THREE.Scene(), cam = new THREE.PerspectiveCamera();
    raw.mockImplementationOnce(() => new Set()).mockImplementationOnce(() => { throw new Error('link'); });
    expect(() => r.compile(s, cam)).toThrow('link');
    expect(r.getRenderTarget()).toBeNull();
    r.render(scene0(), cam);                                           // rtColor가 생긴다
    const rt = r.calls[0].target;
    r.compile(s, cam);
    expect(r.compiles.at(-1)).toBe(rt);
  });
  const scene0 = () => { const s = new THREE.Scene(); s.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial())); return s; };
});

test('view3d.js는 렌더러를 만들 때 윤곽선을 설치한다(렌더 줄은 그대로 — rebuildGate.test 고정 줄)', () => {
  const src = readFileSync(fileURLToPath(new URL('../src/view3d/view3d.js', import.meta.url)), 'utf8');
  expect(src).toContain('installOutline(renderer, { enabled: () => outlineEnabled(store.get().view) })');
  expect(src).toContain('prepFrame(); renderer.render(scene, ov.camera() ?? camera);');
});
