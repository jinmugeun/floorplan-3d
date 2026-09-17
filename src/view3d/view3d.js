import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { activeFloor } from '../state/schema.js';
import { buildFloorGroup, toThree } from './build.js';
import { hiddenWallIds } from './cutaway.js';
import { endpoints } from '../geom/walls.js';

export function createView3D(container, store, ui) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.shadowMap.enabled = true;
  container.appendChild(renderer.domElement);
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0xeef1f4);
  const camera = new THREE.PerspectiveCamera(50, 1, 0.05, 500);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true; controls.dampingFactor = 0.1; controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8899aa, 0.9));
  const sun = new THREE.DirectionalLight(0xffffff, 0.8); sun.position.set(-12, 30, -18); sun.castShadow = true; scene.add(sun);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshStandardMaterial({ color: 0xdfe4e9 })); ground.rotation.x = -Math.PI / 2; ground.position.y = -0.005; ground.receiveShadow = true; scene.add(ground);

  let group = null, mode = 'iso', raf = 0, alive = true;
  const center = () => { const pts = endpoints(activeFloor(store.get()).walls); if (!pts.length) return [4000, 3000]; const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]); return [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2]; };
  function rebuild() { if (group) scene.remove(group); group = buildFloorGroup(activeFloor(store.get()), store.get().view); scene.add(group); }
  function resize() { const w = container.clientWidth || 1, h = container.clientHeight || 1; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }
  function setMode(m) {
    mode = m; const c = center(), t = toThree([c[0], c[1], 0]); controls.target.copy(t);
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
  function frame() { raf = 0; if (!alive) return; controls.update(); applyCutaway(); renderer.render(scene, camera); }
  function requestRender() { if (!raf) raf = requestAnimationFrame(frame); }
  controls.addEventListener('change', requestRender);
  const unsub = store.subscribe(() => { rebuild(); requestRender(); });
  const ro = new ResizeObserver(() => { resize(); requestRender(); }); ro.observe(container);
  rebuild(); resize(); setMode('iso');
  return { renderer, camera, scene, controls, setMode, getMode: () => mode, requestRender, capture: () => renderer.domElement.toDataURL('image/png'), destroy() { alive = false; unsub(); ro.disconnect(); controls.dispose(); renderer.dispose(); renderer.domElement.remove(); } };
}
