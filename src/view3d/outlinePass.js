// 화면 공간 윤곽선(계획 17 Task 6 · 설계 D7). 참고 이미지(스케치업풍)처럼 모든 모서리에 검은 선을 긋는다:
// ① 장면을 MSAA 렌더 타깃에 그리고 ② 같은 장면을 법선 재질로 법선 + 깊이 타깃에 그린 뒤 ③ 전면 사각형 셰이더가 4이웃의
// 법선 차 · 상대 깊이 차로 경계를 찾아 선색을 섞어 화면에 낸다. 생성 모델처럼 삼각형이 울퉁불퉁한 메시에도 선이 깨끗하다(EdgesGeometry와 달리).
// 왜 renderer.render를 감싸나: view3d.js는 300줄 상한이 꽉 찼고 렌더 줄이 테스트(rebuildGate.test)에 글자로 고정돼 있다 —
// 감싸 두면 화면 프레임·1인칭·2D 투영·렌더샷(renderImage)이 같은 renderer.render(scene, cam) 줄 그대로 윤곽선을 탄다.
// 감싼 함수는 화면(렌더 타깃 null)에 장면(Scene)을 그릴 때만 합성한다 — 다른 타깃·compile·shaderWarm은 원래 함수 그대로.
// ②에서 빼는 것: 스프라이트(라벨)·점(labelDots)·선(충돌 상자·밑동 윤곽·기즈모 선)·투명 재질(유리·반투명 벽)·보이지 않는 재질·기즈모 뿌리.
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

const VERT = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }';
const FRAG = `
  uniform sampler2D tColor, tNormal, tDepth; uniform vec2 nres; uniform float near, far, strength, ortho;
  uniform vec2 nT, dT; uniform vec3 lineColor; varying vec2 vUv;
  float lin(float d){ if (ortho > 0.5) return near + d * (far - near); float z = d * 2. - 1.; return 2. * near * far / (far + near - z * (far - near)); }
  void main(){
    vec2 px = 1. / nres; vec3 n0 = texture2D(tNormal, vUv).xyz; float d0 = lin(texture2D(tDepth, vUv).x);
    float dn = 0., dd = 0.;
    for (int i = 0; i < 4; i++) {
      vec2 o = i == 0 ? vec2(px.x, 0.) : i == 1 ? vec2(-px.x, 0.) : i == 2 ? vec2(0., px.y) : vec2(0., -px.y);
      vec3 n = texture2D(tNormal, vUv + o).xyz; float d = lin(texture2D(tDepth, vUv + o).x);
      dn = max(dn, length(n - n0)); dd = max(dd, abs(d - d0) / max(d0, 1e-4));
    }
    float e = max(smoothstep(nT.x, nT.y, dn), smoothstep(dT.x, dT.y, dd)) * strength;
    gl_FragColor = vec4(mix(texture2D(tColor, vUv).rgb, lineColor, e), 1.);
    #include <colorspace_fragment>
  }`;

export function installOutline(renderer, { enabled = () => true } = {}) {
  const raw = renderer.render.bind(renderer), rawDispose = renderer.dispose.bind(renderer);
  const size = new THREE.Vector2();
  let rtColor = null, rtNormal = null;
  const normalMat = new THREE.MeshNormalMaterial({ side: THREE.DoubleSide });
  const quadMat = new THREE.ShaderMaterial({
    uniforms: { tColor: { value: null }, tNormal: { value: null }, tDepth: { value: null }, nres: { value: new THREE.Vector2() }, near: { value: 0.1 }, far: { value: 100 }, ortho: { value: 0 },
      strength: { value: OUTLINE.strength }, nT: { value: new THREE.Vector2(...OUTLINE.normal) }, dT: { value: new THREE.Vector2(...OUTLINE.depth) }, lineColor: { value: new THREE.Vector3(...OUTLINE.color) } },
    vertexShader: VERT, fragmentShader: FRAG, depthTest: false, depthWrite: false,
  });
  const quadScene = new THREE.Scene(); quadScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), quadMat));
  const quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const hidden = [];

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
    renderer.setRenderTarget(rtColor); raw(scene, camera);
    // ② 법선·깊이: 그림자 맵은 ①이 이미 갱신했다 — 다시 그리지 않는다
    const auto = renderer.shadowMap.autoUpdate, bg = scene.background, ov = scene.overrideMaterial;
    renderer.shadowMap.autoUpdate = false; scene.background = null; scene.overrideMaterial = normalMat;
    scene.traverseVisible(o => { if (skipInNormalPass(o)) hidden.push(o); });
    for (const o of hidden) o.visible = false;
    const clear = renderer.getClearColor(new THREE.Color()), alpha = renderer.getClearAlpha();
    renderer.setRenderTarget(rtNormal); renderer.setClearColor(0x000000, 1); renderer.clear(); raw(scene, camera);
    for (const o of hidden) o.visible = true;
    hidden.length = 0;
    renderer.setClearColor(clear, alpha);
    scene.overrideMaterial = ov; scene.background = bg; renderer.shadowMap.autoUpdate = auto;
    // ③ 합성
    const u = quadMat.uniforms;
    u.tColor.value = rtColor.texture; u.tNormal.value = rtNormal.texture; u.tDepth.value = rtNormal.depthTexture;
    u.nres.value.set(rtNormal.width, rtNormal.height); u.near.value = camera.near; u.far.value = camera.far; u.ortho.value = camera.isOrthographicCamera ? 1 : 0;
    renderer.setRenderTarget(null); raw(quadScene, quadCam);
  };
  renderer.dispose = () => { dispose(); rawDispose(); };
  function dispose() { rtColor?.dispose(); rtNormal?.dispose(); rtNormal?.depthTexture?.dispose(); rtColor = rtNormal = null; normalMat.dispose(); quadMat.dispose(); }
  return { dispose, raw };
}
