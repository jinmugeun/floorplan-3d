import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';
import { activeFloor } from '../state/schema.js';
import { buildFloorGroup, disposeGroup, toThree } from './build.js';
import { hiddenWallIds } from './cutaway.js';
import { endpoints } from '../geom/walls.js';

export function createView3D(container, store, ui, { onExitFp = () => {} } = {}) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.shadowMap.enabled = true;
  container.appendChild(renderer.domElement);
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0xeef1f4);
  const camera = new THREE.PerspectiveCamera(50, 1, 0.05, 500);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true; controls.dampingFactor = 0.1; controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
  // three r155+ 는 물리 광량 단위를 쓰므로 예전 값(0.9/0.8)으로는 장면이 어둡다.
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8899aa, 2.6));
  const sun = new THREE.DirectionalLight(0xffffff, 2.4); sun.position.set(-12, 30, -18); sun.castShadow = true; scene.add(sun);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshStandardMaterial({ color: 0xdfe4e9 })); ground.rotation.x = -Math.PI / 2; ground.position.y = -0.005; ground.receiveShadow = true; scene.add(ground);

  let group = null, mode = 'iso', raf = 0, alive = true;
  const fp = new PointerLockControls(camera, renderer.domElement);
  const keys = new Set(); let lastT = 0;
  const onKeyDown = e => keys.add(e.code), onKeyUp = e => keys.delete(e.code);
  fp.addEventListener('unlock', () => { if (mode === 'fp') { setMode('iso'); onExitFp(); } });
  function fpStep(t) {
    const dt = Math.min(0.05, (t - lastT) / 1000 || 0); lastT = t; const v = 2 * dt;
    if (keys.has('KeyW')) fp.moveForward(v); if (keys.has('KeyS')) fp.moveForward(-v);
    if (keys.has('KeyA')) fp.moveRight(-v); if (keys.has('KeyD')) fp.moveRight(v);
    if (keys.has('KeyQ')) camera.position.y -= v; if (keys.has('KeyE')) camera.position.y += v;
  }
  const center = () => { const pts = endpoints(activeFloor(store.get()).walls); if (!pts.length) return [4000, 3000]; const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]); return [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2]; };
  function rebuild() { if (group) { scene.remove(group); disposeGroup(group); } group = buildFloorGroup(activeFloor(store.get()), store.get().view); scene.add(group); if (mode === 'fp') group?.children.forEach(mm => { if (mm.name === 'ceiling') mm.visible = true; }); }
  function resize() { const w = container.clientWidth || 1, h = container.clientHeight || 1; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }
  function setMode(m, opts = {}) {
    resize(); // 숨겨져 있다가 보이는 경우 크기를 다시 맞춘다
    mode = m;
    if (m === 'fp') {
      controls.enabled = false; const at = opts.at ?? center();
      camera.position.copy(toThree([at[0], at[1], 1500])); camera.lookAt(toThree([at[0], at[1] - 1000, 1500]));
      window.addEventListener('keydown', onKeyDown); window.addEventListener('keyup', onKeyUp); fp.lock();
      group?.children.forEach(mm => { if (mm.name === 'ceiling') mm.visible = true; });
      requestRender(); return;
    }
    controls.enabled = true; window.removeEventListener('keydown', onKeyDown); window.removeEventListener('keyup', onKeyUp);
    group?.children.forEach(mm => { if (mm.name === 'ceiling') mm.visible = false; });
    const c = center(), t = toThree([c[0], c[1], 0]); controls.target.copy(t);
    if (m === 'plan') { camera.position.set(t.x, 40, t.z + 0.01); controls.minPolarAngle = 0; controls.maxPolarAngle = 0.05; }
    else { const r = 25, el = THREE.MathUtils.degToRad(35), az = THREE.MathUtils.degToRad(47); camera.position.set(t.x - r * Math.cos(el) * Math.sin(az), r * Math.sin(el), t.z + r * Math.cos(el) * Math.cos(az)); controls.minPolarAngle = 0; controls.maxPolarAngle = Math.PI / 2 - 0.02; }
    controls.update(); requestRender();
  }
  function applyCutaway() {
    if (!group) return;
    const p = camera.position, camMm = [p.x * 1000, p.z * 1000, p.y * 1000];
    const d = new THREE.Vector3().subVectors(p, controls.target), elev = THREE.MathUtils.radToDeg(Math.asin(d.y / d.length()));
    const hidden = hiddenWallIds(activeFloor(store.get()), camMm, elev, store.get().view);
    group.children.forEach(m => { if (m.userData.wallId) m.visible = !hidden.has(m.userData.wallId); });
  }
  function frame(t) {
    raf = 0; if (!alive) return;
    if (mode === 'fp') {
      fpStep(t); group?.children.forEach(m => { if (m.userData.wallId) m.visible = true; }); renderer.render(scene, camera);
      raf = requestAnimationFrame(frame); return;
    }
    controls.update(); applyCutaway(); renderer.render(scene, camera);
  }
  function requestRender() { if (!raf) raf = requestAnimationFrame(frame); }
  controls.addEventListener('change', requestRender);
  const unsub = store.subscribe(() => { rebuild(); requestRender(); });
  const ro = new ResizeObserver(() => { resize(); requestRender(); }); ro.observe(container);
  rebuild(); resize(); setMode('iso');
  return { renderer, camera, scene, controls, setMode, getMode: () => mode, requestRender, capture: () => renderer.domElement.toDataURL('image/png'), destroy() { alive = false; if (raf) { cancelAnimationFrame(raf); raf = 0; } unsub(); ro.disconnect(); controls.dispose(); window.removeEventListener('keydown', onKeyDown); window.removeEventListener('keyup', onKeyUp); if (fp.isLocked) fp.unlock(); fp.dispose(); if (group) { scene.remove(group); disposeGroup(group); group = null; } renderer.dispose(); renderer.domElement.remove(); } };
}
