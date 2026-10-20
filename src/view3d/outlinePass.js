// 화면 공간 윤곽선(계획 17 Task 6 · 설계 D7). 참고 이미지(스케치업풍)처럼 모든 모서리에 검은 선을 긋는다:
// ① 장면을 MSAA 렌더 타깃에 그리고 ② 같은 장면을 법선 재질로 법선 + 깊이 타깃에 그린 뒤 ③ 전면 사각형 셰이더가 4이웃의
// 법선 차 · 상대 깊이 차로 경계를 찾아 선색을 섞어 화면에 낸다. 생성 모델처럼 삼각형이 울퉁불퉁한 메시에도 선이 깨끗하다(EdgesGeometry와 달리).
// 왜 renderer.render를 감싸나: view3d.js는 300줄 상한이 꽉 찼고 렌더 줄이 테스트(rebuildGate.test)에 글자로 고정돼 있다 —
// 감싸 두면 화면 프레임·1인칭·2D 투영·렌더샷(renderImage)이 같은 renderer.render(scene, cam) 줄 그대로 윤곽선을 탄다.
// 감싼 render는 화면(렌더 타깃 null)에 장면(Scene)을 그릴 때만 합성한다 — 다른 타깃은 원래 함수 그대로. compile도 감싼다(아래 — 렌더 타깃용 예열).
// ②에서 빼는 것: 스프라이트(라벨)·점(labelDots)·선(충돌 상자·밑동 윤곽·기즈모 선)·투명 재질(유리·반투명 벽)·보이지 않는 재질·기즈모 뿌리.
// ④ 겹침(Task 6 리뷰 Fix 1): 라벨·점·기즈모는 ①에서 빼고 ③ 합성 뒤 화면에 한 번 더 그린다 — ①에 그리면 ③이 라벨 뒤 모서리 선을 라벨 판·글자 위에 긋는다.
import * as THREE from 'three';
import { perfSettings } from './perfMode.js';

// normalScale: ② 법선·깊이 타깃의 해상도 배율. 성능 게이트(계획 17 Task 10)를 넘으면 0.5로 낮춘다 — 선이 조금 굵어지는 대신 ②의 화소가 1/4.
export const OUTLINE = { color: [0.017, 0.019, 0.022], normal: [0.35, 0.7], depth: [0.025, 0.06], strength: 0.6, normalScale: 1 };

// 보기 설정 → 윤곽선을 그릴지. 보기 옵션 '윤곽선'(v3.itemEdges — 키 이름은 옛 '제품 윤곽선' 그대로)과 성능 모드(edges)를 따른다.
export const outlineEnabled = view => (view?.v3?.itemEdges !== false) && perfSettings(view?.perfMode).edges;

// ②에서 숨길 물체인가(순수 — 테스트 대상).
export function skipInNormalPass(o) {
  if (o.isTransformControlsRoot || o.isSprite || o.isPoints || o.isLine) return true;
  const m = o.material;
  if (!m) return false;
  const list = Array.isArray(m) ? m : [m];
  return list.some(x => x.transparent || x.visible === false);
}

// ④ 겹침인가: 라벨 Sprite · 접힌 점 Points · 기즈모 뿌리 — 모두 depthTest false라 깊이 버퍼 없이 합성 위에 그려도 그림이 같다.
export const isOverlay = o => !!(o.isSprite || o.isPoints || o.isTransformControlsRoot);

// 보이는 겹침 뿌리(over — 그 아래는 훑지 않는다: 기즈모 손잡이 메시)와 그 밖의 보이는 메시·선(rest)을 한 번에 모은다.
// 겹침은 메시 아래에 달리지 않는다(라벨·점은 층 그룹의 labels 그룹, 기즈모 뿌리는 scene 바로 아래) — rest를 숨겨도 겹침이 함께 숨지 않는다.
function splitOverlay(o, over, rest) {
  if (!o.visible) return;
  if (isOverlay(o)) { over.push(o); return; }
  if (o.isMesh || o.isLine) rest.push(o);
  for (const c of o.children) splitOverlay(c, over, rest);
}

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
  const normalMat = new THREE.MeshNormalMaterial({ side: THREE.DoubleSide });
  const quadMat = new THREE.ShaderMaterial({
    uniforms: { tColor: { value: null }, tNormal: { value: null }, tDepth: { value: null }, nres: { value: new THREE.Vector2() }, near: { value: 0.1 }, far: { value: 100 }, ortho: { value: 0 },
      viewH: { value: 1 }, strength: { value: OUTLINE.strength }, nT: { value: new THREE.Vector2(...OUTLINE.normal) }, dT: { value: new THREE.Vector2(...OUTLINE.depth) },
      lineColor: { value: new THREE.Vector3(...OUTLINE.color) } },
    vertexShader: VERT, fragmentShader: FRAG, depthTest: false, depthWrite: false,
  });
  const quadScene = new THREE.Scene(); quadScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), quadMat));
  const quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const hidden = [], over = [], rest = [];

  function targets(w, h) {
    if (rtColor && rtColor.width === w && rtColor.height === h) return;
    rtColor?.dispose(); rtNormal?.dispose(); rtNormal?.depthTexture?.dispose();
    rtColor = new THREE.WebGLRenderTarget(w, h, { samples: 4, type: THREE.HalfFloatType });
    const nw = Math.max(1, Math.round(w * OUTLINE.normalScale)), nh = Math.max(1, Math.round(h * OUTLINE.normalScale));
    rtNormal = new THREE.WebGLRenderTarget(nw, nh, { type: THREE.HalfFloatType });
    rtNormal.depthTexture = new THREE.DepthTexture(nw, nh); rtNormal.depthTexture.type = THREE.FloatType;
  }

  renderer.render = (scene, camera) => {
    if (!scene?.isScene || renderer.getRenderTarget() !== null || !enabled()) return raw(scene, camera);
    renderer.getDrawingBufferSize(size);
    const w = Math.max(1, Math.floor(size.x)), h = Math.max(1, Math.floor(size.y));
    targets(w, h);
    const auto = renderer.shadowMap.autoUpdate, bg = scene.background, ov = scene.overrideMaterial, ac = renderer.autoClear, mw = scene.matrixWorldAutoUpdate;
    renderer.getClearColor(clearColor); const alpha = renderer.getClearAlpha();
    let black = false;
    splitOverlay(scene, over, rest);
    try {
      for (const o of over) o.visible = false;                       // ①·②에는 겹침이 없다(④가 그린다)
      renderer.setRenderTarget(rtColor); raw(scene, camera);
      // ②~④: 그림자 맵과 월드 행렬은 ①이 이미 갱신했다 — 다시 하지 않는다(Fix 2 M-2). 배경도 그리지 않는다.
      renderer.shadowMap.autoUpdate = false; scene.matrixWorldAutoUpdate = false; scene.background = null;
      // ② 법선·깊이
      scene.overrideMaterial = normalMat;
      scene.traverseVisible(o => { if (skipInNormalPass(o)) hidden.push(o); });
      for (const o of hidden) o.visible = false;
      renderer.setRenderTarget(rtNormal); black = true; renderer.setClearColor(0x000000, 1); renderer.clear(); raw(scene, camera);
      for (const o of hidden) o.visible = true;
      hidden.length = 0;
      renderer.setClearColor(clearColor, alpha); black = false;
      scene.overrideMaterial = ov;
      // ③ 합성
      const u = quadMat.uniforms;
      u.tColor.value = rtColor.texture; u.tNormal.value = rtNormal.texture; u.tDepth.value = rtNormal.depthTexture;
      u.nres.value.set(rtNormal.width, rtNormal.height); u.near.value = camera.near; u.far.value = camera.far; u.ortho.value = camera.isOrthographicCamera ? 1 : 0;
      u.viewH.value = camera.isOrthographicCamera ? (camera.top - camera.bottom) / (camera.zoom || 1) : 1;
      renderer.setRenderTarget(null); raw(quadScene, quadCam);
      // ④ 겹침: 라벨·점·기즈모만 보이게 하고 화면에 덧그린다 — 지우지 않고(autoClear false), 배경 없이(색 배경은 autoClear와 상관없이 지운다).
      // 조명은 그대로 두어 프로그램 키(조명 수)가 예열·이전과 같다.
      if (over.length) {
        for (const o of rest) o.visible = false;
        for (const o of over) o.visible = true;
        renderer.autoClear = false;
        raw(scene, camera);
      }
    } finally {
      // 어느 패스에서 던져도(Fix 2 M-1) 라벨·기즈모·메시가 숨은 채, 재질 덮어쓰기·플래그·렌더 타깃이 바뀐 채 남지 않는다. 모은 물체는 모두 보이던 것이다.
      for (const o of hidden) o.visible = true;
      for (const o of rest) o.visible = true;
      for (const o of over) o.visible = true;
      hidden.length = 0; rest.length = 0; over.length = 0;
      if (black) renderer.setClearColor(clearColor, alpha);
      scene.overrideMaterial = ov; scene.background = bg; scene.matrixWorldAutoUpdate = mw;
      renderer.shadowMap.autoUpdate = auto; renderer.autoClear = ac;
      if (renderer.getRenderTarget() !== null) renderer.setRenderTarget(null);
    }
  };

  // 렌더 타깃용 셰이더 예열(Fix 2 I-1): 예열(shaderWarm.warmShaders · rebuildGate.shaderPrewarm)은 렌더 타깃 없이 compile한다 — 화면용(sRGB 출력) 프로그램.
  // 윤곽선이 켜져 있으면 ①이 모든 재질을 rtColor에 그리고, r169는 렌더 타깃이 걸리면 출력 색공간이 선형이며 그것이 프로그램 키다(WebGLPrograms.getParameters)
  // → 첫 윤곽선 프레임에 메시 프로그램이 모두 다시 링크된다. 그래서 화면용(겹침·윤곽선 끈 경로) 다음에 타깃을 건 채 한 번 더 컴파일한다.
  // 타깃은 rtColor(이미 있으면) 또는 같은 형식의 1×1. 돌려주는 값은 첫 compile의 것(compileAsync가 이 재질 집합을 기다린다).
  if (typeof renderer.compile === 'function') {
    const rawCompile = renderer.compile.bind(renderer);
    renderer.compile = (scene, camera, targetScene = null) => {
      if (renderer.getRenderTarget() !== null || !enabled()) return rawCompile(scene, camera, targetScene);
      const first = rawCompile(scene, camera, targetScene);
      renderer.setRenderTarget(rtColor ?? (rtWarm ??= new THREE.WebGLRenderTarget(1, 1, { samples: 4, type: THREE.HalfFloatType })));
      try { rawCompile(scene, camera, targetScene); } finally { renderer.setRenderTarget(null); }
      return first;
    };
  }
  renderer.dispose = () => { dispose(); rawDispose(); };
  function dispose() { rtColor?.dispose(); rtNormal?.dispose(); rtNormal?.depthTexture?.dispose(); rtWarm?.dispose(); rtColor = rtNormal = rtWarm = null; normalMat.dispose(); quadMat.dispose(); }
  return { dispose, raw };
}
