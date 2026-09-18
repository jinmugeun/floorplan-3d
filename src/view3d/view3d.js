import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';
import { activeFloor } from '../state/schema.js';
import { buildFloorGroup, disposeGroup, toThree, sceneSignature, TRANSPARENT_OPACITY } from './build.js';
import { hiddenWallIds, cutawayMeshStyle, soloMeshVisible } from './cutaway.js';
import { endpoints } from '../geom/walls.js';
import { cameraDistance } from './fit.js';
import { sunPosition } from './sun.js';
import { headingDeg, toWorldXY } from './camera.js';
import { orthoViewParams, createItemPicker, createDragLatch } from './pick3d.js';
import { createFacePicker } from './facePick.js';

export function createView3D(container, store, ui, { onExitFp = () => {}, openMenu = () => {}, itemActions = {}, surfaceActions = {}, onOrthoView = () => {} } = {}) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.shadowMap.enabled = true;
  container.appendChild(renderer.domElement);
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0xeef1f4);
  const persp = new THREE.PerspectiveCamera(50, 1, 0.05, 500);
  const ortho = new THREE.OrthographicCamera(-10, 10, 10, -10, -500, 1000);
  let camera = persp;
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true; controls.dampingFactor = 0.1; controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
  // three r155+ 는 물리 광량 단위를 쓰므로 예전 값(0.9/0.8)으로는 장면이 어둡다.
  const hemi = new THREE.HemisphereLight(0xffffff, 0x8899aa, 2.6); scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffffff, 2.4); sun.position.set(-12, 30, -18); sun.castShadow = true; scene.add(sun);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshStandardMaterial({ color: 0xdfe4e9 })); ground.rotation.x = -Math.PI / 2; ground.position.y = -0.005; ground.receiveShadow = true; scene.add(ground);

  let group = null, mode = 'iso', raf = 0, alive = true;
  const fp = new PointerLockControls(camera, renderer.domElement);
  const keys = new Set(); let lastT = 0;
  const typing = e => ['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target?.tagName); // 입력란에 타이핑 중이면 걷지 않는다
  const onKeyDown = e => { if (!typing(e)) keys.add(e.code); }, onKeyUp = e => keys.delete(e.code);
  // 브라우저가 Esc로 포인터 락을 풀면 ISO로 돌아간다. setMode가 먼저 mode를 바꾼 경우(1/2/3 키)는 여기서 아무것도 하지 않는다.
  fp.addEventListener('unlock', () => { if (!alive || mode !== 'fp') return; setMode('iso'); onExitFp(); });
  function fpStep(t) {
    const dt = Math.min(0.05, (t - lastT) / 1000 || 0); lastT = t; const v = 2 * dt;
    if (keys.has('KeyW')) fp.moveForward(v); if (keys.has('KeyS')) fp.moveForward(-v);
    if (keys.has('KeyA')) fp.moveRight(-v); if (keys.has('KeyD')) fp.moveRight(v);
    if (keys.has('KeyQ')) camera.position.y -= v; if (keys.has('KeyE')) camera.position.y += v;
  }
  const bounds = () => { const pts = endpoints(activeFloor(store.get()).walls); if (!pts.length) return { center: [4000, 3000], extent: 8000 }; const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]); return { center: [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2], extent: Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) }; };
  const center = () => bounds().center;
  let ortho2 = null, useOrtho = false, orthoName = null;
  // 2D 투영(정면/배면/좌/우/평면/저면): 도면을 도면처럼 고정된 직교 카메라로 본다.
  function setOrthoView(name) {
    const b = bounds(), w = container.clientWidth || 1, h = container.clientHeight || 1;
    const p = orthoViewParams(name, { center: b.center, extent: b.extent, height: activeFloor(store.get()).height, aspect: w / h });
    if (!ortho2) ortho2 = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 1000);
    ortho2.left = -p.halfW; ortho2.right = p.halfW; ortho2.top = p.halfH; ortho2.bottom = -p.halfH;
    ortho2.position.set(...p.pos); ortho2.up.set(...p.up);
    ortho2.lookAt(new THREE.Vector3(...p.target));
    ortho2.updateProjectionMatrix();
    useOrtho = true; orthoName = name; controls.enabled = false;  // 고정 뷰(도면처럼 본다)
    picker.detach();                                // 편집할 수 없는 고정 뷰이므로 기즈모도 떼어 둔다
    onOrthoView(name);
    requestRender();
  }
  function clearOrthoView() {
    if (!useOrtho) return;                             // 투영 중이 아니면 할 일이 없다(하단 바 "—" 선택이 늘 부른다)
    useOrtho = false; orthoName = null; controls.enabled = mode !== 'fp';
    reattachPicker();                                  // 투영에서 빠져나오면 선택한 아이템에 기즈모를 다시 붙인다
    onOrthoView(null);
    requestRender();
  }
  // rebuild가 picker를 읽으므로 picker를 먼저 만든다(TDZ).
  // 기즈모를 다시 붙여도 되는 상황(1인칭·투영 아님, 드래그 중 아님)에서만 붙인다.
  const reattachPicker = () => { if (mode === 'fp' || useOrtho) picker.detach(); else if (!picker.isDragging()) picker.attach(ui.get().selection); };
  // 컷어웨이가 감춘 벽을 모두 되돌린다(1인칭·투영 뷰는 벽을 숨기지 않는다). 밑동 윤곽만 계속 숨긴다.
  const showAllWalls = () => group?.children.forEach(m => { if (m.userData.wallId) m.visible = m.name !== 'wallFoot'; });
  const dragLatch = createDragLatch(); // 기즈모 드래그가 끝난 클릭은 두 피커 모두 무시한다
  const picker = createItemPicker({ renderer, getCamera: () => (useOrtho && ortho2 ? ortho2 : camera), controls, scene, store, ui, getGroup: () => group, getMode: () => mode, requestRender, openMenu, itemActions, dragLatch });
  // 아이템 피커 다음에 등록한다: 아이템을 맞히지 못한 클릭이 비워 놓은 선택을 면 피커가 덮어쓴다.
  const facePicker = createFacePicker({ renderer, getCamera: () => (useOrtho && ortho2 ? ortho2 : camera), scene, getGroup: () => group, store, ui, openMenu, surfaceActions, getMode: () => mode, requestRender, dragLatch });
  function rebuild() { if (group) { scene.remove(group); disposeGroup(group); } group = buildFloorGroup(activeFloor(store.get()), store.get().view); scene.add(group); if (mode === 'fp') group?.children.forEach(mm => { if (mm.name === 'ceiling') mm.visible = true; }); reattachPicker(); }
  function resize() {
    const w = container.clientWidth || 1, h = container.clientHeight || 1;
    renderer.setSize(w, h);
    persp.aspect = w / h; persp.updateProjectionMatrix();
    if (camera === ortho) frustum();
    if (useOrtho && orthoName) setOrthoView(orthoName); // 2D 투영의 절두체는 화면 비율을 따른다
  }
  // 직교 카메라의 절두체를 원근 카메라와 같은 화각으로 맞춘다(전환 때 크기가 튀지 않게).
  function frustum() {
    const dist = camera.position.distanceTo(controls.target) || 10;
    const fov = store.get().view.cameraPreset.fov;
    const h = Math.tan(THREE.MathUtils.degToRad(fov) / 2) * dist;
    const w = (h * (container.clientWidth || 1)) / (container.clientHeight || 1);
    ortho.left = -w; ortho.right = w; ortho.top = h; ortho.bottom = -h; ortho.updateProjectionMatrix();
  }
  function setProjection(kind) {
    const next = kind === 'ortho' ? ortho : persp;
    if (next === camera) return;
    next.position.copy(camera.position); next.up.copy(camera.up);
    camera = next;
    controls.object = camera; // OrbitControls는 매 update()에서 this.object를 다시 읽으므로 재대입이 통한다
    if (camera === ortho) frustum();
    else { camera.aspect = (container.clientWidth || 1) / (container.clientHeight || 1); camera.fov = store.get().view.cameraPreset.fov; camera.updateProjectionMatrix(); }
    camera.lookAt(controls.target); controls.update(); requestRender();
  }
  function applyCameraPreset({ elevation = 35, azimuth = 47, fov = 60 } = {}) {
    const t = controls.target;
    const r = camera.position.distanceTo(t) || cameraDistance(bounds().extent);
    const el = THREE.MathUtils.degToRad(elevation), az = THREE.MathUtils.degToRad(azimuth);
    camera.position.set(t.x - r * Math.cos(el) * Math.sin(az), t.y + r * Math.sin(el), t.z + r * Math.cos(el) * Math.cos(az));
    if (camera.isPerspectiveCamera) { camera.fov = fov; camera.updateProjectionMatrix(); } else frustum();
    controls.update(); requestRender();
  }
  function zoomBy(factor) {
    const dir = camera.position.clone().sub(controls.target);
    camera.position.copy(controls.target.clone().add(dir.multiplyScalar(1 / factor)));
    if (camera === ortho) frustum();
    controls.update(); requestRender();
  }
  // 미니맵용: 월드 mm 좌표와 방위(0 = 북, 시계방향). 계산은 camera.js가 한다.
  function getCameraInfo() {
    const p = camera.position, t = controls.target;
    return { pos: toWorldXY(p), target: toWorldXY(t), heading: headingDeg(p, t) };
  }
  function setTarget([x, y]) {
    const t = toThree([x, y, 0]);
    const d = camera.position.clone().sub(controls.target);
    controls.target.copy(t);
    camera.position.copy(t.clone().add(d));
    controls.update(); requestRender();
  }
  // three r155+ 는 물리 광량 단위다. 기존 값(방향광 2.4, 환경광 2.6)이 기본 강도 0.8 / 환경광 0.6에
  // 대응하도록 3배 / 4.33배로 환산한다.
  function applySun(s = {}) {
    const p = sunPosition(s);
    sun.position.set(p[0], p[1], p[2]);
    sun.intensity = (s.intensity ?? 0.8) * 3;
    hemi.intensity = (s.ambient ?? 0.6) * 4.33;
    requestRender();
  }
  // 도면 전체가 들어오도록 카메라를 다시 잡는다. 현재 모드(plan / iso)의 프레이밍을 그대로 쓴다.
  function frameScene() {
    const c = center(), t = toThree([c[0], c[1], 0]); controls.target.copy(t);
    const r = cameraDistance(bounds().extent); // 도면 크기에 맞춘 카메라 거리(m)
    if (mode === 'plan') camera.position.set(t.x, r * 1.6, t.z + 0.01);
    else {
      const { elevation, azimuth, fov } = store.get().view.cameraPreset;
      const el = THREE.MathUtils.degToRad(elevation), az = THREE.MathUtils.degToRad(azimuth);
      camera.position.set(t.x - r * Math.cos(el) * Math.sin(az), t.y + r * Math.sin(el), t.z + r * Math.cos(el) * Math.cos(az));
      if (camera.isPerspectiveCamera) { camera.fov = fov; camera.updateProjectionMatrix(); } else frustum();
    }
    controls.update(); requestRender();
  }
  // 하단 바 "화면 맞추기"(키 0)의 3D 쪽 동작. 모드는 바꾸지 않는다.
  function fit() { if (mode === 'fp') return; resize(); frameScene(); }
  // 렌더샷: 화면과 다른 해상도로 한 장 렌더해 dataURL을 돌려준다.
  // setSize(w, h, false)는 캔버스 CSS 크기를 건드리지 않으므로 화면이 흔들리지 않는다.
  function renderImage({ width = 1920, height = 1080, preset = null } = {}) {
    const prev = new THREE.Vector2(); renderer.getSize(prev);
    const prevRatio = renderer.getPixelRatio();
    let cam = useOrtho && ortho2 ? ortho2 : camera;
    if (preset) {
      const b = bounds();
      const p = orthoViewParams(preset, { center: b.center, extent: b.extent, height: activeFloor(store.get()).height, aspect: width / height });
      const shot = new THREE.OrthographicCamera(-p.halfW, p.halfW, p.halfH, -p.halfH, 0.01, 1000);
      shot.position.set(...p.pos); shot.up.set(...p.up);
      shot.lookAt(new THREE.Vector3(...p.target)); shot.updateProjectionMatrix();
      cam = shot;
      showAllWalls();                       // 정면·평면 도면은 컷어웨이로 벽을 지우지 않는다
    }
    const prevAspect = cam.isPerspectiveCamera ? cam.aspect : null;
    renderer.setPixelRatio(1);
    renderer.setSize(width, height, false);
    if (cam.isPerspectiveCamera) { cam.aspect = width / height; cam.updateProjectionMatrix(); }
    else if (cam.isOrthographicCamera) {
      // 현재 카메라가 직교(2D 투영 ortho2, 또는 projection: 'ortho')이면 절두체가 화면 비율로 잡혀 있다.
      // 세로 폭(halfH)은 유지하고 가로 폭만 목표 비율로 다시 잡아 오프스크린 버퍼에서 늘어나지 않게 한다.
      const halfH = (cam.top - cam.bottom) / 2, halfW = halfH * (width / height);
      cam.left = -halfW; cam.right = halfW; cam.updateProjectionMatrix();
    }
    renderer.render(scene, cam);
    const url = renderer.domElement.toDataURL('image/png');
    if (prevAspect !== null) { cam.aspect = prevAspect; cam.updateProjectionMatrix(); }
    renderer.setPixelRatio(prevRatio);
    renderer.setSize(prev.x, prev.y, false);
    resize(); requestRender();               // 다음 프레임에 평소 상태로 되돌린다
    return url;
  }
  function setMode(m, opts = {}) {
    if (useOrtho) { useOrtho = false; orthoName = null; controls.enabled = true; onOrthoView(null); } // 모드 버튼을 누르면 투영에서 빠져나온다(하단 바 선택도 비운다)
    resize(); // 숨겨져 있다가 보이는 경우 크기를 다시 맞춘다
    mode = m;
    if (m === 'fp') {
      setProjection('perspective'); // 1인칭은 원근 카메라 전용(PointerLockControls가 persp에 묶여 있다)
      store.dispatch(d => { d.view.projection = 'perspective'; }, { record: false });
      controls.enabled = false; const at = opts.at ?? center();
      camera.position.copy(toThree([at[0], at[1], 1500])); camera.lookAt(toThree([at[0], at[1] - 1000, 1500]));
      reattachPicker(); // 1인칭에는 기즈모가 없다: 아이템을 고른 채 들어오면 여기서 떼어 낸다(보이지 않는 편집 방지)
      window.addEventListener('keydown', onKeyDown); window.addEventListener('keyup', onKeyUp); fp.lock();
      group?.children.forEach(mm => { if (mm.name === 'ceiling') mm.visible = true; }); showAllWalls();
      requestRender(); return;
    }
    controls.enabled = true; window.removeEventListener('keydown', onKeyDown); window.removeEventListener('keyup', onKeyUp); keys.clear();
    if (fp.isLocked) fp.unlock(); // 1/2/3 키로 fp를 떠날 때도 포인터 락을 반드시 해제한다
    group?.children.forEach(mm => { if (mm.name === 'ceiling') mm.visible = false; });
    controls.minPolarAngle = 0;
    controls.maxPolarAngle = m === 'plan' ? 0.05 : Math.PI / 2 - 0.02;
    reattachPicker(); // 투영에서 모드 키로 빠져나온 경우 ui 구독이 먼저 떼어 둔 기즈모를 되살린다
    frameScene();
  }
  function applyCutaway() {
    if (!group) return;
    const view = store.get().view;
    const p = camera.position, camMm = [p.x * 1000, p.z * 1000, p.y * 1000];
    const d = new THREE.Vector3().subVectors(p, controls.target);
    const elev = THREE.MathUtils.radToDeg(Math.asin(d.y / (d.length() || 1)));
    const hidden = hiddenWallIds(activeFloor(store.get()), camMm, elev, view);
    const seeThrough = !!view.v3?.wallTransparent;
    const baseOpacity = view.display === 'transparent' ? Math.min(view.wallOpacity ?? 1, TRANSPARENT_OPACITY.wall) : (view.wallOpacity ?? 1);
    for (const m of group.children) {
      const id = m.userData.wallId;
      if (!id) continue;
      const { visible, opacity } = cutawayMeshStyle(m.name, { isHidden: hidden.has(id), seeThrough, baseOpacity });
      m.visible = visible;
      if (opacity !== null && m.material) { m.material.opacity = opacity; m.material.transparent = opacity < 1; m.material.depthWrite = opacity >= 1; }
    }
  }
  // 단일 공간 모드를 끄면 컷어웨이가 손대지 않는 바닥·천장도 다시 보이게 되돌린다.
  function applySolo() {
    if (!group) return;
    const solo = ui.get().soloRoom ?? null;
    const room = (solo ? activeFloor(store.get()).rooms.find(r => r.id === solo) : null) ?? null;
    for (const m of group.children) m.visible = soloMeshVisible(m, room, mode);
  }
  function frame(t) {
    raf = 0; if (!alive) return;
    if (mode === 'fp') {
      fpStep(t); showAllWalls(); renderer.render(scene, useOrtho ? ortho2 : camera);
      raf = requestAnimationFrame(frame); return;
    }
    controls.update();
    // 2D 투영은 정면·평면 도면이다: 궤도 카메라 기준의 컷어웨이로 벽을 지우면 도면이 비어 보인다.
    if (useOrtho) showAllWalls();
    else applyCutaway();
    applySolo(); renderer.render(scene, useOrtho ? ortho2 : camera);
  }
  function requestRender() { if (!raf) raf = requestAnimationFrame(frame); }
  controls.addEventListener('change', requestRender);
  let lastPreset = null, lastSun = null;
  function applyViewSettings() {
    const v = store.get().view;
    setProjection(v.projection);
    const ps = JSON.stringify(v.cameraPreset);
    if (ps !== lastPreset) { lastPreset = ps; applyCameraPreset(v.cameraPreset); } // 값이 실제로 바뀐 경우에만: 궤도 드래그를 되돌리지 않는다
    const ss = JSON.stringify(v.sun);
    if (ss !== lastSun) { lastSun = ss; applySun(v.sun); }
  }
  // 기하·표시 모드가 실제로 바뀐 경우에만 씬을 다시 만든다(슬라이더 드래그 같은 { record: false } 연속 dispatch로 재빌드하지 않게).
  let lastSig = null;
  const unsub = store.subscribe(() => {
    const sig = sceneSignature(store.get());
    if (sig !== lastSig) { lastSig = sig; rebuild(); }
    applyViewSettings(); requestRender();
  });
  const unsubUi = ui.subscribe(() => {
    reattachPicker(); // 붙일지 뗄지는 한 곳(reattachPicker)에서만 판단한다
    requestRender();
  });
  const ro = new ResizeObserver(() => { resize(); requestRender(); }); ro.observe(container);
  rebuild(); lastSig = sceneSignature(store.get()); resize(); setMode('iso'); applyViewSettings();
  return { renderer, scene, controls, setMode, getMode: () => mode, setProjection, applyCameraPreset, applySun, getCamera: () => camera, zoomBy, fit, renderImage, getCameraInfo, setTarget, requestRender, setOrthoView, clearOrthoView, setGizmoMode: m => picker.setGizmoMode(m), getGizmoMode: () => picker.getGizmoMode(), capture: () => renderer.domElement.toDataURL('image/png'), destroy() { alive = false; if (raf) { cancelAnimationFrame(raf); raf = 0; } unsub(); unsubUi(); picker.destroy(); facePicker.destroy(); ro.disconnect(); controls.dispose(); window.removeEventListener('keydown', onKeyDown); window.removeEventListener('keyup', onKeyUp); if (fp.isLocked) fp.unlock(); fp.dispose(); if (group) { scene.remove(group); disposeGroup(group); group = null; } renderer.dispose(); renderer.domElement.remove(); } };
}
