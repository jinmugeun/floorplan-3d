import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';
import { activeFloor } from '../state/schema.js';
import { buildFloorGroup, disposeGroup, toThree } from './build.js';
import { hiddenWallIds } from './cutaway.js';
import { endpoints } from '../geom/walls.js';
import { cameraDistance } from './fit.js';
import { sunPosition } from './sun.js';
import { headingDeg, toWorldXY } from './camera.js';

export function createView3D(container, store, ui, { onExitFp = () => {} } = {}) {
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
  function rebuild() { if (group) { scene.remove(group); disposeGroup(group); } group = buildFloorGroup(activeFloor(store.get()), store.get().view); scene.add(group); if (mode === 'fp') group?.children.forEach(mm => { if (mm.name === 'ceiling') mm.visible = true; }); }
  function resize() {
    const w = container.clientWidth || 1, h = container.clientHeight || 1;
    renderer.setSize(w, h);
    persp.aspect = w / h; persp.updateProjectionMatrix();
    if (camera === ortho) frustum();
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
  function setMode(m, opts = {}) {
    resize(); // 숨겨져 있다가 보이는 경우 크기를 다시 맞춘다
    mode = m;
    if (m === 'fp') {
      setProjection('perspective'); // 1인칭은 원근 카메라 전용(PointerLockControls가 persp에 묶여 있다)
      store.dispatch(d => { d.view.projection = 'perspective'; }, { record: false });
      controls.enabled = false; const at = opts.at ?? center();
      camera.position.copy(toThree([at[0], at[1], 1500])); camera.lookAt(toThree([at[0], at[1] - 1000, 1500]));
      window.addEventListener('keydown', onKeyDown); window.addEventListener('keyup', onKeyUp); fp.lock();
      group?.children.forEach(mm => { if (mm.name === 'ceiling') mm.visible = true; if (mm.userData.wallId) mm.visible = mm.name !== 'wallFoot'; });
      requestRender(); return;
    }
    controls.enabled = true; window.removeEventListener('keydown', onKeyDown); window.removeEventListener('keyup', onKeyUp); keys.clear();
    if (fp.isLocked) fp.unlock(); // 1/2/3 키로 fp를 떠날 때도 포인터 락을 반드시 해제한다
    group?.children.forEach(mm => { if (mm.name === 'ceiling') mm.visible = false; });
    const c = center(), t = toThree([c[0], c[1], 0]); controls.target.copy(t);
    const r = cameraDistance(bounds().extent); // 도면 크기에 맞춘 카메라 거리(m)
    if (m === 'plan') { camera.position.set(t.x, r * 1.6, t.z + 0.01); controls.minPolarAngle = 0; controls.maxPolarAngle = 0.05; }
    else {
      const { elevation, azimuth, fov } = store.get().view.cameraPreset;
      const el = THREE.MathUtils.degToRad(elevation), az = THREE.MathUtils.degToRad(azimuth);
      camera.position.set(t.x - r * Math.cos(el) * Math.sin(az), t.y + r * Math.sin(el), t.z + r * Math.cos(el) * Math.cos(az));
      if (camera.isPerspectiveCamera) { camera.fov = fov; camera.updateProjectionMatrix(); } else frustum();
      controls.minPolarAngle = 0; controls.maxPolarAngle = Math.PI / 2 - 0.02;
    }
    controls.update(); requestRender();
  }
  function applyCutaway() {
    if (!group) return;
    const view = store.get().view;
    const p = camera.position, camMm = [p.x * 1000, p.z * 1000, p.y * 1000];
    const d = new THREE.Vector3().subVectors(p, controls.target);
    const elev = THREE.MathUtils.radToDeg(Math.asin(d.y / (d.length() || 1)));
    const hidden = hiddenWallIds(activeFloor(store.get()), camMm, elev, view);
    const seeThrough = !!view.v3?.wallTransparent;
    const baseOpacity = view.display === 'transparent' ? Math.min(view.wallOpacity ?? 1, 0.3) : (view.wallOpacity ?? 1);
    for (const m of group.children) {
      const id = m.userData.wallId;
      if (!id) continue;
      const isHidden = hidden.has(id);
      if (m.name === 'wallFoot') { m.visible = isHidden && !seeThrough; continue; } // 감춘 벽은 밑동 윤곽만 남긴다
      if (m.name === 'wall') {
        m.visible = !isHidden || seeThrough;
        const o = isHidden && seeThrough ? 0.25 : baseOpacity; // "벽 투명화": 지우지 않고 25%로
        m.material.opacity = o; m.material.transparent = o < 1; m.material.depthWrite = o >= 1;
        continue;
      }
      m.visible = !isHidden; // wallTop, edges
    }
  }
  function applySolo() {
    if (!group) return;
    const solo = ui.get().soloRoom ?? null;
    if (!solo) return; // 단일 공간 모드가 아니면 컷어웨이 결과를 그대로 둔다
    const room = activeFloor(store.get()).rooms.find(r => r.id === solo);
    if (!room) return;
    const wallIds = new Set(room.wallIds);
    for (const m of group.children) {
      if (m.userData.wallId) { m.visible = m.visible && wallIds.has(m.userData.wallId); continue; }
      if (m.userData.roomId) m.visible = m.userData.roomId === solo && m.name !== 'ceiling';
    }
  }
  function frame(t) {
    raf = 0; if (!alive) return;
    if (mode === 'fp') {
      fpStep(t); group?.children.forEach(m => { if (m.userData.wallId) m.visible = m.name !== 'wallFoot'; }); renderer.render(scene, camera);
      raf = requestAnimationFrame(frame); return;
    }
    controls.update(); applyCutaway(); applySolo(); renderer.render(scene, camera);
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
  const unsub = store.subscribe(() => { rebuild(); applyViewSettings(); requestRender(); });
  const unsubUi = ui.subscribe(requestRender); // 단일 공간 모드·선택 변화도 다시 그린다
  const ro = new ResizeObserver(() => { resize(); requestRender(); }); ro.observe(container);
  rebuild(); resize(); setMode('iso'); applyViewSettings();
  return { renderer, scene, controls, setMode, getMode: () => mode, setProjection, applyCameraPreset, applySun, getCamera: () => camera, zoomBy, getCameraInfo, setTarget, requestRender, capture: () => renderer.domElement.toDataURL('image/png'), destroy() { alive = false; if (raf) { cancelAnimationFrame(raf); raf = 0; } unsub(); unsubUi(); ro.disconnect(); controls.dispose(); window.removeEventListener('keydown', onKeyDown); window.removeEventListener('keyup', onKeyUp); if (fp.isLocked) fp.unlock(); fp.dispose(); if (group) { scene.remove(group); disposeGroup(group); group = null; } renderer.dispose(); renderer.domElement.remove(); } };
}
