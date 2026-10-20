// 화면 공간 윤곽선(계획 17 Task 6 · 설계 D7). 참고 이미지(스케치업풍)처럼 모든 모서리에 검은 선을 긋는다:
// ① 장면을 MSAA 렌더 타깃에 그리고 ② 같은 장면의 법선 + 깊이를 법선·깊이 타깃에 그린 뒤 ③ 전면 사각형 셰이더가 4이웃의
// 법선 차 · 상대 깊이 차로 경계를 찾아 선색을 섞어 화면에 낸다. 생성 모델처럼 삼각형이 울퉁불퉁한 메시에도 선이 깨끗하다(EdgesGeometry와 달리).
// 왜 renderer.render를 감싸나: view3d.js는 300줄 상한이 꽉 찼고 렌더 줄이 테스트(rebuildGate.test)에 글자로 고정돼 있다 —
// 감싸 두면 화면 프레임·1인칭·2D 투영·렌더샷(renderImage)이 같은 renderer.render(scene, cam) 줄 그대로 윤곽선을 탄다.
// 감싼 render는 화면(렌더 타깃 null)에 장면(Scene)을 그릴 때만 합성한다 — 다른 타깃은 원래 함수 그대로. compile도 감싼다(아래 — 렌더 타깃용 예열).
// ②에서 빼는 것: 스프라이트(라벨)·점(labelDots)·선(충돌 상자·밑동 윤곽·기즈모 선)·투명 재질(유리·반투명 벽)·보이지 않는 재질·기즈모 뿌리.
// ④ 겹침(Task 6 리뷰 Fix 1): 라벨·점·기즈모는 ①에서 빼고 ③ 합성 뒤 화면에 한 번 더 그린다 — ①에 그리면 ③이 라벨 뒤 모서리 선을 라벨 판·글자 위에 긋는다.
// 성능(계획 17 성능 · .superpowers/sdd/p17-perf-report.md — 궤도 프레임은 그리기 호출 수에 묶여 있었다):
//  · ②는 보이는 불투명 메시를 묶어 그리기 한 번(normalBatch.js — MeshNormalMaterial과 같은 값). 묶을 수 없는 메시가 보이면 예전처럼 장면을 법선 재질로.
//  · 그림자 맵은 던지는 것·해·그림자 설정이 바뀐 프레임에만 다시 그린다(해의 그림자 카메라는 보는 카메라와 상관없다 — 궤도 회전에는 그대로).
//  · ④는 장면 자식을 잠시 [조명, 겹침 뿌리]로 바꿔 그린다(메시 수백 개를 숨겼다 되살리며 다시 훑지 않게).
//  · ① 색 타깃의 MSAA 해상은 색만(깊이는 쓰지 않는다).
import * as THREE from 'three';
import { perfSettings } from './perfMode.js';
import { createNormalBatch, sceneWalk, sameList, skipInNormalPass, isOverlay } from './normalBatch.js';

export { skipInNormalPass, isOverlay };

// normalScale: ② 법선·깊이 타깃의 해상도 배율. 1이 승인된 선 굵기다(0.5는 선이 2화소 계단이 되고 화구 십자 같은 잔선이 사라진다 — 계획 17 Task 10).
export const OUTLINE = { color: [0.017, 0.019, 0.022], normal: [0.35, 0.7], depth: [0.025, 0.06], strength: 0.6, normalScale: 1 };

// 보기 설정 → 윤곽선을 그릴지. 보기 옵션 '윤곽선'(v3.itemEdges — 키 이름은 옛 '제품 윤곽선' 그대로)과 성능 모드(edges)를 따른다.
export const outlineEnabled = view => (view?.v3?.itemEdges !== false) && perfSettings(view?.perfMode).edges;

// 깊이 차(Task 6 리뷰 Fix 2 I-2): 원근은 상대 깊이 |d − d0| / d0. 직교는 보이는 높이 viewH로 나눈다 — 카메라 자리와 상관없는 척도.
// 사용자 직교 카메라(view3d.js · near = −500)는 낮은 고도에서 화면 아래쪽 깊이가 0 이하가 되어 d0로 나누면 그 화소가 모두 선(검은 띠)이었다.
const VERT = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }';
const FRAG = `
  uniform sampler2D tColor, tNormal, tDepth; uniform vec2 nres; uniform float near, far, strength, ortho, viewH;
  uniform vec2 nT, dT; uniform vec3 lineColor; varying vec2 vUv;
  float lin(float d){ if (ortho > 0.5) return near + d * (far - near); float z = d * 2. - 1.; return 2. * near * far / (far + near - z * (far - near)); }
  void main(){
    vec2 px = 1. / nres; vec3 n0 = texture2D(tNormal, vUv).xyz; float d0 = lin(texture2D(tDepth, vUv).x);
    float dn = 0., dd = 0.;
    for (int i = 0; i < 4; i++) {
      vec2 o = i == 0 ? vec2(px.x, 0.) : i == 1 ? vec2(-px.x, 0.) : i == 2 ? vec2(0., px.y) : vec2(0., -px.y);
      vec3 n = texture2D(tNormal, vUv + o).xyz; float d = lin(texture2D(tDepth, vUv + o).x);
      dn = max(dn, length(n - n0));
      dd = max(dd, ortho > 0.5 ? abs(d - d0) / max(viewH, 1e-3) : abs(d - d0) / max(d0, 1e-4));
    }
    float e = max(smoothstep(nT.x, nT.y, dn), smoothstep(dT.x, dT.y, dd)) * strength;
    gl_FragColor = vec4(mix(texture2D(tColor, vUv).rgb, lineColor, e), 1.);
    #include <colorspace_fragment>
  }`;

export function installOutline(renderer, { enabled = () => true } = {}) {
  const raw = renderer.render.bind(renderer), rawDispose = renderer.dispose.bind(renderer);
  const size = new THREE.Vector2(), clearColor = new THREE.Color();
  let rtColor = null, rtNormal = null, rtWarm = null;
  const normalMat = new THREE.MeshNormalMaterial({ side: THREE.DoubleSide });   // ② 예전 경로(묶을 수 없는 메시가 보일 때)
  const quadMat = new THREE.ShaderMaterial({
    uniforms: { tColor: { value: null }, tNormal: { value: null }, tDepth: { value: null }, nres: { value: new THREE.Vector2() }, near: { value: 0.1 }, far: { value: 100 }, ortho: { value: 0 },
      viewH: { value: 1 }, strength: { value: OUTLINE.strength }, nT: { value: new THREE.Vector2(...OUTLINE.normal) }, dT: { value: new THREE.Vector2(...OUTLINE.depth) },
      lineColor: { value: new THREE.Vector3(...OUTLINE.color) } },
    vertexShader: VERT, fragmentShader: FRAG, depthTest: false, depthWrite: false,
  });
  const quadScene = new THREE.Scene(); quadScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), quadMat));
  const quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const batch = createNormalBatch(), w = { over: [], lights: [], cand: [], vis: [], sig: [], odd: false };
  const hidden = [], kids = [];
  let shot = [], shotScene = null;   // 마지막으로 ①을 끝낸 프레임의 그림자 서명(그때 그림자 맵이 이 상태로 그려졌다)
  renderer.domElement?.addEventListener?.('webglcontextrestored', () => { shotScene = null; });   // 컨텍스트를 되찾으면 그림자 맵이 비어 있다 — 다시 그린다

  function targets(w, h) {
    if (rtColor && rtColor.width === w && rtColor.height === h) return;
    rtColor?.dispose(); rtNormal?.dispose(); rtNormal?.depthTexture?.dispose();
    // resolveDepthBuffer false: ①의 깊이는 아무도 읽지 않는다(③은 ②의 깊이 텍스처를 쓴다). three 기본값(true)은 MSAA 해상 때 깊이까지 옮기고
    // ANGLE D3D11은 그것을 셰이더로 한다 — 신상중 궤도 GPU ① 4.7 → 3.1 ms · 프레임 간격 −1.9 ms(p17-perf-report.md).
    rtColor = new THREE.WebGLRenderTarget(w, h, { samples: 4, type: THREE.HalfFloatType, resolveDepthBuffer: false });
    const nw = Math.max(1, Math.round(w * OUTLINE.normalScale)), nh = Math.max(1, Math.round(h * OUTLINE.normalScale));
    rtNormal = new THREE.WebGLRenderTarget(nw, nh, { type: THREE.HalfFloatType });
    rtNormal.depthTexture = new THREE.DepthTexture(nw, nh); rtNormal.depthTexture.type = THREE.FloatType;
  }

  renderer.render = (scene, camera) => {
    if (!scene?.isScene || renderer.getRenderTarget() !== null || !enabled()) return raw(scene, camera);
    renderer.getDrawingBufferSize(size);
    targets(Math.max(1, Math.floor(size.x)), Math.max(1, Math.floor(size.y)));
    const sm = renderer.shadowMap, auto = sm.autoUpdate, bg = scene.background, ov = scene.overrideMaterial, ac = renderer.autoClear, mw = scene.matrixWorldAutoUpdate;
    const children = scene.children;
    renderer.getClearColor(clearColor); const alpha = renderer.getClearAlpha();
    let black = false;
    // 월드 행렬을 먼저 갱신하고(①은 다시 하지 않는다 — 순서는 three render와 같다: 장면 → 카메라) 한 번 훑는다. 그림자 서명·② 행렬이 이번 프레임 자세를 본다.
    if (mw) scene.updateMatrixWorld();
    sceneWalk(scene, camera.layers, w); w.sig.push(sm.enabled ? 1 : 0, sm.type);
    const over = w.over;
    try {
      for (const o of over) o.visible = false;                       // ①·②에는 겹침이 없다(④가 그린다)
      scene.matrixWorldAutoUpdate = false;
      if (scene === shotScene && sameList(w.sig, shot)) sm.autoUpdate = false;   // 그림자 맵이 이미 이 상태다
      renderer.setRenderTarget(rtColor); raw(scene, camera);
      [shot, w.sig] = [w.sig, shot]; shotScene = scene;              // ①을 끝냈다 = 그림자 맵이 이 서명대로다(던지면 기록하지 않아 다음 프레임이 다시 그린다)
      // ②~④: 그림자 맵과 월드 행렬은 이미 갱신했다 — 다시 하지 않는다(Fix 2 M-2). 배경도 그리지 않는다.
      sm.autoUpdate = false; scene.background = null;
      // ② 법선·깊이
      renderer.setRenderTarget(rtNormal); black = true; renderer.setClearColor(0x000000, 1); renderer.clear();
      if (w.odd) {
        scene.overrideMaterial = normalMat;
        scene.traverseVisible(o => { if (skipInNormalPass(o)) hidden.push(o); });
        for (const o of hidden) o.visible = false;
        raw(scene, camera);
        for (const o of hidden) o.visible = true;
        hidden.length = 0; scene.overrideMaterial = ov;
      } else { batch.sync(w.cand, w.vis, camera); raw(batch.scene, camera); }
      renderer.setClearColor(clearColor, alpha); black = false;
      // ③ 합성
      const u = quadMat.uniforms;
      u.tColor.value = rtColor.texture; u.tNormal.value = rtNormal.texture; u.tDepth.value = rtNormal.depthTexture;
      u.nres.value.set(rtNormal.width, rtNormal.height); u.near.value = camera.near; u.far.value = camera.far; u.ortho.value = camera.isOrthographicCamera ? 1 : 0;
      u.viewH.value = camera.isOrthographicCamera ? (camera.top - camera.bottom) / (camera.zoom || 1) : 1;
      renderer.setRenderTarget(null); raw(quadScene, quadCam);
      // ④ 겹침: 장면 자식을 잠시 [조명, 겹침 뿌리]로 바꿔 화면에 덧그린다 — 지우지 않고(autoClear false), 배경 없이(색 배경은 autoClear와 상관없이 지운다).
      // 조명은 그대로 두어 프로그램 키(조명 수)가 예열·이전과 같다(같은 Scene이라 렌더 상태·조명 버전도 같다). 월드 행렬은 위에서 갱신했다.
      if (over.length) {
        kids.length = 0; kids.push(...w.lights, ...over);
        for (const o of over) o.visible = true;
        scene.children = kids; renderer.autoClear = false;
        raw(scene, camera);
      }
    } finally {
      // 어느 패스에서 던져도(Fix 2 M-1) 장면 자식·라벨·기즈모·메시가 바뀐 채, 재질 덮어쓰기·플래그·렌더 타깃이 바뀐 채 남지 않는다. 모은 물체는 모두 보이던 것이다.
      scene.children = children;
      for (const o of hidden) o.visible = true;
      for (const o of over) o.visible = true;
      hidden.length = 0; kids.length = 0;
      if (black) renderer.setClearColor(clearColor, alpha);
      scene.overrideMaterial = ov; scene.background = bg; scene.matrixWorldAutoUpdate = mw;
      sm.autoUpdate = auto; renderer.autoClear = ac;
      if (renderer.getRenderTarget() !== null) renderer.setRenderTarget(null);
    }
  };

  // 렌더 타깃용 셰이더 예열(Fix 2 I-1): 예열(shaderWarm.warmShaders · rebuildGate.shaderPrewarm)은 렌더 타깃 없이 compile한다 — 화면용(sRGB 출력) 프로그램.
  // 윤곽선이 켜져 있으면 ①이 모든 재질을 rtColor에 그리고, r169는 렌더 타깃이 걸리면 출력 색공간이 선형이며 그것이 프로그램 키다(WebGLPrograms.getParameters)
  // → 첫 윤곽선 프레임에 메시 프로그램이 모두 다시 링크된다. 그래서 화면용(겹침·윤곽선 끈 경로) 다음에 타깃을 건 채 한 번 더 컴파일한다.
  // 타깃은 rtColor(이미 있으면) 또는 같은 형식의 1×1. 돌려주는 값은 첫 compile의 것(compileAsync가 이 재질 집합을 기다린다).
  // ③ 합성(화면)과 ② 묶음(렌더 타깃)도 같이 — 첫 윤곽선 프레임이 두 프로그램 링크(신상중 ≈ 20 ms씩)를 기다리지 않게(계획 17 성능).
  if (typeof renderer.compile === 'function') {
    const rawCompile = renderer.compile.bind(renderer);
    renderer.compile = (scene, camera, targetScene = null) => {
      if (renderer.getRenderTarget() !== null || !enabled()) return rawCompile(scene, camera, targetScene);
      const first = rawCompile(scene, camera, targetScene);
      rawCompile(quadScene, quadCam);
      renderer.setRenderTarget(rtColor ?? (rtWarm ??= new THREE.WebGLRenderTarget(1, 1, { samples: 4, type: THREE.HalfFloatType })));
      try { rawCompile(scene, camera, targetScene); rawCompile(batch.scene, camera); } finally { renderer.setRenderTarget(null); }
      return first;
    };
  }
  renderer.dispose = () => { dispose(); rawDispose(); };
  function dispose() { rtColor?.dispose(); rtNormal?.dispose(); rtNormal?.depthTexture?.dispose(); rtWarm?.dispose(); rtColor = rtNormal = rtWarm = null; normalMat.dispose(); quadMat.dispose(); batch.dispose(); }
  return { dispose, raw };
}
