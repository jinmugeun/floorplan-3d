// @vitest-environment jsdom
// §17.5(감사 §2·§6): 3D에서 선택된 아이템의 몸체를 끌면 바닥 위로 움직이고(원위치 고스트),
// 벽 부착 제품은 벽을 따라 미끄러지는 핸들 하나로만 움직인다.
// three 오브젝트를 만드는 부분도 WebGL은 쓰지 않는다(렌더러는 가짜 DOM 노드 하나다).
import { describe, test, expect, afterEach } from 'vitest';
import * as THREE from 'three';
import { createStore } from '../src/state/store.js';
import { createUiState } from '../src/state/uistate.js';
import { createEmptyProject, activeFloor, createItem } from '../src/state/schema.js';
import { addWalls, addItem, setItemFlag } from '../src/state/floorOps.js';
import { rectWalls } from '../src/geom/walls.js';
import { productById } from '../src/products/catalog.js';
import { nearestWallPlacement, placeOnWall, wallAxis, isEmbed, WALL_ATTACH_DIST } from '../src/geom/items.js';
import { openingsOnWall } from '../src/geom/openings.js';
import { sceneSignature } from '../src/view3d/build.js';
import { createDragLatch, GIZMO_COLORS } from '../src/view3d/pick3d.js';
import { createBodyDrag, snapMm, dragPointOnPlane, makeGhost, slidePlacement, DRAG_SNAP_MM, DRAG_MIN_PX, GHOST_OPACITY, SLIDE_HANDLE_R, SLIDE_LIFT } from '../src/view3d/bodyDrag.js';

describe('3D 드래그의 순수 조각', () => {
  test('snapMm은 10 mm 격자다(기즈모의 setTranslationSnap과 같은 값)', () => {
    expect(DRAG_SNAP_MM).toBe(10);
    expect(DRAG_MIN_PX).toBe(4);
    expect(GHOST_OPACITY).toBe(0.25);
    expect(SLIDE_LIFT).toBe(150);
    expect(SLIDE_HANDLE_R).toBeCloseTo(0.06, 6);      // 지름 0.12 m
    expect(snapMm(1234.5)).toBe(1230);
    expect(snapMm(1235.1)).toBe(1240);
    expect(snapMm(-1234.5)).toBe(-1230);
    expect(snapMm(1234.5, 1)).toBe(1235);             // step을 주면 그 격자다
  });

  test('dragPointOnPlane은 +Y 평면과의 교점을 월드 mm로 준다', () => {
    const down = new THREE.Ray(new THREE.Vector3(1.0005, 5, 2.00025), new THREE.Vector3(0, -1, 0));
    // 소수 좌표 케이스(Global Constraints). `toEqual`로 묶어 재지 않는다: 구현이 돌려주는 값은
    // `hit.z * 1000`이고 `2.00025 * 1000`은 IEEE754에서 2000.2499999999998이다(x쪽 1000.5는 정확하다).
    const [dx, dy] = dragPointOnPlane(down, 0.4);
    expect(dx).toBeCloseTo(1000.5, 6);
    expect(dy).toBeCloseTo(2000.25, 6);
    const away = new THREE.Ray(new THREE.Vector3(0, 5, 0), new THREE.Vector3(1, 0, 0));   // 평면과 평행
    expect(dragPointOnPlane(away, 0.4)).toBeNull();
    expect(dragPointOnPlane(null, 0)).toBeNull();
  });

  test('makeGhost는 재질을 복제해 반투명으로 만들고 원본은 건드리지 않는다', () => {
    const mat = new THREE.MeshBasicMaterial({ color: 0x112233 });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), mat);
    mesh.name = 'item';
    const g = makeGhost(mesh);
    expect(g.name).toBe('ghost');
    expect(g.material).not.toBe(mat);
    expect(g.material.opacity).toBe(GHOST_OPACITY);
    expect(g.material.transparent).toBe(true);
    expect(g.material.depthWrite).toBe(false);
    expect(mat.opacity).toBe(1);                      // 원본은 그대로다
    expect(mat.transparent).toBe(false);
  });

  test('slidePlacement는 같은 벽일 때만 새 자리를 준다', () => {
    const store = createStore(createEmptyProject());
    addWalls(store, rectWalls([0.5, 0.25], [4000.5, 3000.25], 200));
    const f = activeFloor(store.get());
    const north = f.walls.find(w => w.a[1] === 0.25 && w.b[1] === 0.25);
    const size = [900, 200, 2100];
    const seat = nearestWallPlacement(f.walls, [1000.5, 200.25], size, WALL_ATTACH_DIST);
    expect(seat.wallId).toBe(north.id);
    const door = { id: 'i1', size, attach: 'wall', wallId: north.id, t: seat.t, pos: seat.pos, side: seat.side, rot: seat.rot };
    // 같은 벽을 따라 옮긴다: t가 달라지고 pos는 (wallId, t)의 결과다.
    const next = slidePlacement(f, door, [2500.5, 150.25]);
    expect(next).not.toBeNull();
    expect(next.t).toBeGreaterThan(door.t);
    expect(Number.isInteger(next.pos[0])).toBe(true);
    expect(Number.isInteger(next.pos[1])).toBe(true);
    // 다른 벽(동쪽) 근처로 끌면 무시한다 — 벽을 바꾸는 이동은 2D 경로가 맡는다.
    expect(slidePlacement(f, door, [3900.5, 1500.25])).toBeNull();
    expect(slidePlacement({ walls: [] }, door, [2500.5, 150.25])).toBeNull();
  });

  // 리뷰 C-1: nearestWallPlacement에 embed를 넘기지 않으면 placeOnWall이 문·창·개구부를 벽면 앞으로
  // (두께/2 + 깊이/2 = 120 mm) 띄운다. 벽 구멍은 t·size만 보고 제자리에 남으므로 핸들을 한 번 끄는
  // 것만으로 문짝이 구멍에서 어긋났다. hood-wall(kind 'product')은 이 갈래를 지나지 않아 못 잡았다.
  test('벽 슬라이드는 문·창을 벽 중심선에 남긴다 — embed 플래그(리뷰 C-1)', () => {
    const store = createStore(createEmptyProject());
    addWalls(store, rectWalls([0.5, 0.25], [4000.5, 3000.25], 200));
    const f = activeFloor(store.get());
    const north = f.walls.find(w => w.a[1] === 0.25 && w.b[1] === 0.25);
    const p = productById('door-swing-900');
    const seat = nearestWallPlacement(f.walls, [1500.5, 200.25], p.size, WALL_ATTACH_DIST, { embed: true });
    const door = createItem(p, { pos: seat.pos, wallId: seat.wallId, t: seat.t, side: seat.side, rot: seat.rot });
    expect(isEmbed(door)).toBe(true);
    const next = slidePlacement(f, door, [2500.5, 150.25]);
    expect(next.t).toBeGreaterThan(door.t);
    // pos는 (wallId, t)의 결과다: placeOnWall이 **매립으로** 앉히는 자리와 같은 점이어야 한다.
    const want = placeOnWall(north, next.t, next.side, p.size, { embed: true });
    expect(next.pos).toEqual([Math.round(want.pos[0]), Math.round(want.pos[1])]);
    expect(next.pos[1]).toBe(Math.round(north.a[1]));   // 벽 중심선 위(앞으로 120 mm 나오지 않는다)
    // 벽 구멍과 문짝이 같은 자리다(openingsOnWall은 t·size만 본다 — §17.5(2)의 어긋남이 없다).
    const { dir } = wallAxis(north);
    const [hole] = openingsOnWall([{ ...door, ...next }], north);
    const uc = (hole.u0 + hole.u1) / 2;
    expect(north.a[0] + dir[0] * uc).toBeCloseTo(want.pos[0], 6);
    expect(north.a[1] + dir[1] * uc).toBeCloseTo(want.pos[1], 6);
    // 매립이 아닌 벽 부착 제품은 그대로 벽면 앞에 붙는다(embed를 무조건 켜지 않았다).
    const hood = productById('hood-wall');
    const hs = nearestWallPlacement(f.walls, [1500.5, 200.25], hood.size, WALL_ATTACH_DIST);
    const item = createItem(hood, { pos: hs.pos, wallId: hs.wallId, t: hs.t, side: hs.side, rot: hs.rot });
    expect(isEmbed(item)).toBe(false);
    expect(slidePlacement(f, item, [2500.5, 150.25]).pos[1]).not.toBe(Math.round(north.a[1]));
  });
});

// 실제 드래그: 렌더러는 가짜 DOM 노드, 카메라는 위에서 내려보는 직교 카메라다.
// 기대값은 테스트가 **같은 수식**(광선 → +Y 평면 교점)으로 직접 계산한다: 카메라 방향 규약에
// 기대지 않으므로 three 버전이 올라도 흔들리지 않는다.
describe('3D 몸체 드래그와 벽 슬라이드', () => {
  const SIZE = 200;
  function setup({ locked = false, wallItem = false, lookAtItem = false } = {}) {
    const store = createStore(createEmptyProject()), ui = createUiState();
    addWalls(store, rectWalls([0.5, 0.25], [6000.5, 4000.25], 200));
    const f = activeFloor(store.get());
    let id;
    if (wallItem) {
      const p = productById('hood-wall');                     // 벽에 붙는 제품(attach 'wall')
      const north = f.walls.find(w => w.a[1] === 0.25 && w.b[1] === 0.25);
      const seat = nearestWallPlacement(f.walls, [1500.5, 200.25], p.size, WALL_ATTACH_DIST);
      id = addItem(store, createItem(p, { pos: seat.pos, wallId: seat.wallId, t: seat.t, side: seat.side, rot: seat.rot }));
      expect(activeFloor(store.get()).items[0].wallId).toBe(north.id);
    } else {
      id = addItem(store, createItem(productById('hood-box'), { pos: [2000.5, 1500.25], z: 1700 }));
    }
    if (locked) setItemFlag(store, [id], 'locked');
    const it = activeFloor(store.get()).items.find(x => x.id === id);

    const domElement = document.createElement('div');
    document.body.appendChild(domElement);
    domElement.getBoundingClientRect = () => ({ left: 0, top: 0, width: SIZE, height: SIZE });
    const camera = new THREE.OrthographicCamera(-5, 5, 5, -5, 0.1, 100);
    // lookAtItem이면 카메라를 아이템 바로 위로 옮긴다(핸들이 화면 중앙에 투영되게).
    const at = lookAtItem ? [it.pos[0] / 1000, it.pos[1] / 1000] : [0, 0];
    camera.position.set(at[0], 20, at[1]); camera.up.set(0, 0, -1); camera.lookAt(at[0], 0, at[1]); camera.updateMatrixWorld();
    const scene = new THREE.Scene();
    const group = new THREE.Group();
    const items = new THREE.Group(); items.name = 'items'; group.add(items);
    const meshY = (it.z + it.size[2] / 2) / 1000;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(20, 20, 20), new THREE.MeshBasicMaterial());   // 화면을 덮을 만큼 크게
    mesh.name = 'item'; mesh.userData.itemId = id; mesh.position.set(it.pos[0] / 1000, meshY, it.pos[1] / 1000);
    items.add(mesh);
    scene.add(group);
    const toasts = [];
    const latch = createDragLatch();
    const controls = { enabled: true };
    const flags = { ortho: false };   // 2D 투영 뷰(orthoView.isActive)를 켜고 끈다
    const ends = [];                  // onEnd = 기즈모 재부착 신호(리뷰 I-2)
    const bd = createBodyDrag({
      renderer: { domElement }, getCamera: () => camera, getGroup: () => group, scene, store, ui,
      controls, dragLatch: latch, toast: m => toasts.push(m),
      isOrtho: () => flags.ortho, onEnd: () => ends.push(1),
    });
    made.push({ bd, domElement });
    ui.set({ selection: { type: 'item', id } });
    bd.refresh();
    // 같은 수식으로 기대값을 만든다(월드 mm).
    const worldAt = (x, y, planeY) => {
      const r = new THREE.Raycaster();
      r.setFromCamera(new THREE.Vector2((x / SIZE) * 2 - 1, -((y / SIZE) * 2 - 1)), camera);
      const p = r.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -planeY), new THREE.Vector3());
      return [p.x * 1000, p.z * 1000];
    };
    const ptr = (type, x, y) => domElement.dispatchEvent(new MouseEvent(type, { button: 0, clientX: x, clientY: y, bubbles: true }));
    // 오브젝트가 화면 어디에 찍히는지(핸들이 중앙에 있는지를 테스트가 직접 확인한다).
    const screenOf = obj => { const v = obj.position.clone().project(camera); return [((v.x + 1) / 2) * SIZE, ((1 - v.y) / 2) * SIZE]; };
    return { store, ui, scene, id, bd, toasts, controls, flags, ends, mesh, meshY, worldAt, screenOf, ptr, domElement, item: () => activeFloor(store.get()).items.find(x => x.id === id) };
  }
  // 리스너·노드가 파일 안에 쌓이지 않게 정리한다(리뷰 M-8). bodyDrag는 window에도 keydown을 듣는다.
  const made = [];
  afterEach(() => { for (const m of made) { m.bd.destroy(); m.domElement.remove(); } made.length = 0; });
  const key = (k, extra = {}) => new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...extra });
  const ghosts = scene => scene.children.filter(o => o.name === 'ghost');
  const handles = scene => scene.children.filter(o => o.name === 'slideHandle');

  test('몸체 드래그는 10 mm 격자로 움직이고 되돌리기 한 단계다', () => {
    const a = setup();
    const from = [...a.item().pos];
    const d0 = a.worldAt(100, 100, a.meshY), d1 = a.worldAt(160, 130, a.meshY);
    a.ptr('pointerdown', 100, 100);
    expect(a.controls.enabled).toBe(false);                 // 궤도 회전이 같은 드래그를 먹지 않는다
    a.ptr('pointermove', 102, 101);                          // DRAG_MIN_PX 안 → 아직 열리지 않는다
    expect(ghosts(a.scene)).toHaveLength(0);
    a.ptr('pointermove', 160, 130);
    expect(ghosts(a.scene)).toHaveLength(1);                 // 원위치 고스트 하나
    a.ptr('pointerup', 160, 130);
    expect(ghosts(a.scene)).toHaveLength(0);
    expect(a.controls.enabled).toBe(true);
    expect(a.item().pos).toEqual([snapMm(from[0] + (d1[0] - d0[0])), snapMm(from[1] + (d1[1] - d0[1]))]);
    expect(a.item().pos[0] % DRAG_SNAP_MM).toBe(0);
    expect(a.item().pos[1] % DRAG_SNAP_MM).toBe(0);
    a.store.undo();
    expect(a.item().pos).toEqual(from);                      // 한 번에 원위치
    expect(a.store.canUndo()).toBe(true);                    // 도면을 만든 단계는 남아 있다
  });

  test('DRAG_MIN_PX 안에서 놓으면 빈 단계도, 고스트도 없다(그것은 클릭이다)', () => {
    const a = setup();
    const from = [...a.item().pos];
    const before = a.store.get();
    a.ptr('pointerdown', 100, 100);
    a.ptr('pointermove', 102, 102);
    a.ptr('pointerup', 102, 102);
    expect(a.store.get()).toBe(before);
    expect(a.item().pos).toEqual(from);
    expect(ghosts(a.scene)).toHaveLength(0);
  });

  test('잠긴 제품은 움직이지 않고 토스트 한 번만 낸다', () => {
    const a = setup({ locked: true });
    const from = [...a.item().pos];
    const before = a.store.get();
    a.ptr('pointerdown', 100, 100);
    a.ptr('pointermove', 160, 130);
    a.ptr('pointerup', 160, 130);
    expect(a.item().pos).toEqual(from);
    expect(a.store.get()).toBe(before);
    expect(a.toasts).toEqual(['잠긴 제품은 편집할 수 없습니다']);
    expect(handles(a.scene)).toHaveLength(0);                // 움직일 수 없는 것에 손잡이를 주지 않는다
  });

  // 불변식("몸체 드래그는 벽 부착 아이템에서 열리지 않는다")과 슬라이드 경로를 **두 케이스로** 나눈다.
  // 한 테스트에 붙이면 검증되지 않는다: onDown이 onHandle을 먼저 보므로 lookAtItem으로 핸들을
  // 화면 중앙에 세우면 (100, 100)의 pointerdown이 **슬라이드 경로**로 들어가고, 그 드래그가
  // 아무것도 바꾸지 않는 이유는 몸체 차단이 아니라 60 px 이동이 벽에서 WALL_ATTACH_DIST(300 mm)
  // 밖으로 나가 nearestWallPlacement가 null을 주기 때문이다(사전 검토 I-4).
  test('벽 부착 제품의 몸체를 잡으면 드래그가 열리지 않는다', () => {
    const a = setup({ wallItem: true });                     // lookAtItem 없음 → 핸들이 중앙에서 벗어난다
    const h = handles(a.scene);
    expect(h).toHaveLength(1);
    const [hx, hy] = a.screenOf(h[0]);
    expect(Math.hypot(hx - 100, hy - 100)).toBeGreaterThan(10);   // (100, 100)은 몸체만 맞힌다
    const from = [...a.item().pos], t0 = a.item().t;
    const before = a.store.get();
    a.ptr('pointerdown', 100, 100);
    expect(a.controls.enabled).toBe(true);                   // 드래그를 열지 않았으니 궤도도 그대로다
    a.ptr('pointermove', 160, 130);
    a.ptr('pointerup', 160, 130);
    expect(a.store.get()).toBe(before);
    expect(a.item().pos).toEqual(from);
    expect(a.item().t).toBe(t0);
    expect(ghosts(a.scene)).toHaveLength(0);                 // 몸체 고스트도 없다
  });

  test('벽 부착 제품은 주황 핸들로만 벽을 따라 움직인다', () => {
    const a = setup({ wallItem: true, lookAtItem: true });    // 핸들이 화면 중앙(100, 100)에 투영된다
    const h = handles(a.scene);
    expect(h).toHaveLength(1);
    expect(h[0].material.color.getHexString()).toBe(GIZMO_COLORS.plane.slice(1));
    const it0 = a.item();
    expect(h[0].position.y).toBeCloseTo((it0.z + it0.size[2] + SLIDE_LIFT) / 1000, 6);
    const from = [...it0.pos], t0 = it0.t, wallId = it0.wallId;
    const [hx, hy] = a.screenOf(h[0]);
    expect(hx).toBeCloseTo(100, 0);
    expect(hy).toBeCloseTo(100, 0);
    // 벽을 따라서만(화면 오른쪽 50 px = 월드 +2.5 m): wallId는 그대로이고 t가 달라진다.
    // 이 이동은 벽 중심선에서 200 mm 안이라 nearestWallPlacement가 같은 벽을 돌려준다.
    a.ptr('pointerdown', 100, 100);
    a.ptr('pointermove', 150, 100);
    a.ptr('pointerup', 150, 100);
    const it1 = a.item();
    expect(it1.wallId).toBe(wallId);
    expect(it1.t).not.toBe(t0);
    expect(ghosts(a.scene)).toHaveLength(0);                 // 슬라이드에는 고스트가 없다(§17.5)
    expect(a.store.canUndo()).toBe(true);
    a.store.undo();
    expect(a.item().t).toBe(t0);
    expect(a.item().pos).toEqual(from);
  });

  // 리뷰 I-1: 2D 투영(정면·평면 도면)은 편집할 수 없는 고정 뷰다 — 핸들도 드래그도 없고,
  // setOrthoView가 걸어 둔 궤도 잠금(controls.enabled = false)을 pointerup이 되살리지 않는다.
  test('2D 투영 뷰에서는 핸들도 드래그도 없고 고정 뷰의 잠금이 풀리지 않는다 (리뷰 I-1)', () => {
    const a = setup({ wallItem: true, lookAtItem: true });
    expect(handles(a.scene)).toHaveLength(1);
    a.flags.ortho = true; a.controls.enabled = false;   // setOrthoView가 하는 그대로(orthoView.js:30)
    a.bd.refresh();
    expect(handles(a.scene)).toHaveLength(0);
    const before = a.store.get(), from = [...a.item().pos];
    a.ptr('pointerdown', 100, 100);
    a.ptr('pointermove', 150, 100);
    a.ptr('pointerup', 150, 100);
    expect(a.store.get()).toBe(before);
    expect(a.item().pos).toEqual(from);
    expect(a.controls.enabled).toBe(false);             // 무조건 true로 되돌리지 않는다
    a.flags.ortho = false; a.controls.enabled = true;
    a.bd.refresh();
    expect(handles(a.scene)).toHaveLength(1);           // 투영에서 빠져나오면 다시 선다
  });

  // 리뷰 I-2: endTransaction은 알리지 않으므로(store.js의 closeTransaction) 아무도 기즈모를 다시
  // 붙이지 않아 화살표가 아이템이 떠난 자리에 남았다. 드래그를 실제로 커밋했을 때만 알린다.
  test('커밋한 드래그만 기즈모 재부착을 알린다 (리뷰 I-2)', () => {
    const a = setup();
    a.ptr('pointerdown', 100, 100); a.ptr('pointermove', 160, 130); a.ptr('pointerup', 160, 130);
    expect(a.ends).toHaveLength(1);
    a.ptr('pointerdown', 100, 100); a.ptr('pointermove', 102, 101); a.ptr('pointerup', 102, 101);
    expect(a.ends).toHaveLength(1);                     // 4 px 안의 클릭은 붙일 자리를 바꾸지 않았다
  });

  // 리뷰 I-3: TransformControls의 pointerdown이 먼저 돌아 dragging-changed가 controls를 꺼 둔다.
  // 화살표는 아이템 몸체 위에 겹쳐 그려지므로 같은 이벤트로 몸체 드래그까지 열려 있었다.
  test('기즈모 축 드래그가 잡은 pointerdown으로는 몸체 드래그가 열리지 않는다 (리뷰 I-3)', () => {
    const a = setup();
    const before = a.store.get(), from = [...a.item().pos];
    a.controls.enabled = false;                         // pick3d.js:157이 이미 껐다
    a.ptr('pointerdown', 100, 100);
    a.ptr('pointermove', 160, 130);
    a.ptr('pointerup', 160, 130);
    expect(ghosts(a.scene)).toHaveLength(0);
    expect(a.store.get()).toBe(before);
    expect(a.item().pos).toEqual(from);
    expect(a.controls.enabled).toBe(false);             // 기즈모가 쥔 상태를 건드리지 않는다
  });

  // 리뷰 I-4(§15.2의 프리뷰 계약을 3D에도): 드래그 중에는 store에 쓰지 않는다 — 10 mm마다
  // dispatch하면 sceneSignature가 바뀌어 층 전체를 다시 짓는다(감사 §29의 480 ms/프레임).
  test('드래그 중에는 dispatch가 0이고 놓을 때 한 번이다 — 씬 서명도 그대로 (리뷰 I-4)', () => {
    const a = setup();
    const before = a.store.get(), sig0 = sceneSignature(a.store.get());
    let dispatches = 0;
    const raw = a.store.dispatch.bind(a.store);
    a.store.dispatch = (fn, opts) => { dispatches += 1; return raw(fn, opts); };
    a.ptr('pointerdown', 100, 100);
    for (const x of [120, 130, 140, 150, 160]) a.ptr('pointermove', x, 130);
    expect(dispatches).toBe(0);                          // N번 움직여도 0
    expect(a.store.get()).toBe(before);                  // 상태 아이덴티티가 그대로다(구독자가 깨지 않는다)
    expect(sceneSignature(a.store.get())).toBe(sig0);    // 서명이 그대로 → 재빌드가 없다
    const previewX = a.mesh.position.x, previewZ = a.mesh.position.z;
    expect(previewX).not.toBeCloseTo(before.floors[0].items[0].pos[0] / 1000, 6);  // 그래도 메시는 따라왔다
    a.ptr('pointerup', 160, 130);
    expect(dispatches).toBe(1);                          // 커밋은 딱 한 번(트랜잭션 안)
    expect(a.item().pos[0]).toBeCloseTo(previewX * 1000, 6);   // 미리보기 자리가 그대로 커밋된다
    expect(a.item().pos[1]).toBeCloseTo(previewZ * 1000, 6);
    expect(a.store.canUndo()).toBe(true);
    a.store.undo();
    expect(a.item().pos).toEqual(before.floors[0].items[0].pos);
  });

  // 리뷰 I-5: 2D(selectTool.js:183-196)와 같은 규칙 — 드래그 중 [Esc]·Ctrl+Z는 이동을 되돌리고
  // 키를 소비한다(keymap이 이어서 선택을 비우거나 한 단계 더 되돌리지 않게).
  test('[Esc]는 드래그를 취소한다 — 자리도 단계도 남지 않는다 (리뷰 I-5)', () => {
    const a = setup();
    const from = [...a.item().pos], before = a.store.get();
    const seen = [];
    const spy = ev => seen.push(ev.key);
    window.addEventListener('keydown', spy);   // keymap과 같은 자리(window · 버블)
    try {
      a.ptr('pointerdown', 100, 100);
      a.ptr('pointermove', 160, 130);
      expect(ghosts(a.scene)).toHaveLength(1);
      window.dispatchEvent(key('Escape'));
      expect(a.item().pos).toEqual(from);
      expect(a.mesh.position.x).toBeCloseTo(from[0] / 1000, 6);   // 메시도 시작 자리로
      expect(a.mesh.position.z).toBeCloseTo(from[1] / 1000, 6);
      expect(ghosts(a.scene)).toHaveLength(0);
      expect(a.controls.enabled).toBe(true);
      expect(seen).toEqual([]);                                  // 취소가 키를 소비했다
      a.ptr('pointerup', 160, 130);                              // 이어 오는 pointerup은 아무것도 커밋하지 않는다
      expect(a.store.get()).toBe(before);
      expect(a.ends).toHaveLength(0);
      // 아직 열리지 않은 드래그(클릭일 수도 있다)는 키를 삼키지 않는다 — 선택 해제가 평소대로 간다.
      a.ptr('pointerdown', 100, 100);
      window.dispatchEvent(key('Escape'));
      expect(seen).toEqual(['Escape']);
    } finally { window.removeEventListener('keydown', spy); }
  });

  test('드래그 중 Ctrl+Z도 취소다 — 앞 단계를 되돌리지 않는다 (리뷰 I-5)', () => {
    const a = setup();
    const from = [...a.item().pos], before = a.store.get(), canUndo = a.store.canUndo();
    const seen = [];
    const spy = ev => seen.push(ev.key);
    window.addEventListener('keydown', spy);
    try {
      a.ptr('pointerdown', 100, 100);
      a.ptr('pointermove', 160, 130);
      window.dispatchEvent(key('z', { ctrlKey: true }));
      expect(a.item().pos).toEqual(from);
      expect(a.store.get()).toBe(before);
      expect(a.store.canUndo()).toBe(canUndo);                   // 도면을 만든 단계는 그대로다
      expect(ghosts(a.scene)).toHaveLength(0);
      expect(seen).toEqual([]);                                  // keymap의 undo가 이어서 돌지 않는다
      a.ptr('pointerup', 160, 130);
      expect(a.store.get()).toBe(before);
    } finally { window.removeEventListener('keydown', spy); }
  });
  // 두 방어는 같은 성질이다(리뷰 m-2·m-3): 브라우저는 리스너가 던진 예외를 window 'error'로
  // **보고**하고 나머지 리스너는 계속 돌리므로, 던지는 리스너는 조용히 제 할 일만 건너뛴다.
  // 그물은 그래서 "던지지 않는다"가 아니라 "예외가 보고되지 않는다"로 짠다.
  const noErrors = fn => {
    const errs = [];
    const onErr = e => { errs.push(e.message); e.preventDefault(); };
    window.addEventListener('error', onErr);
    try { fn(); } finally { window.removeEventListener('error', onErr); }
    return errs;
  };

  // 리뷰 m-2: ev.key가 없는 합성 keydown에서 ev.key.toLowerCase()가 TypeError를 던졌다 —
  // 드래그 중 Ctrl을 누른 채 도는 키마다 이 리스너의 취소 경로가 통째로 건너뛰어진다.
  test('key 없는 합성 keydown이 드래그의 키 리스너에서 던지지 않는다(리뷰 m-2)', () => {
    const a = setup();
    a.ptr('pointerdown', 100, 100);
    a.ptr('pointermove', 160, 130);
    expect(ghosts(a.scene)).toHaveLength(1);                     // 드래그가 열려 있다(가드를 지난다)
    const bad = new Event('keydown', { bubbles: true, cancelable: true });
    bad.ctrlKey = true;                                          // key는 undefined다
    expect(noErrors(() => window.dispatchEvent(bad))).toEqual([]);
    expect(bad.defaultPrevented).toBe(false);
    expect(ghosts(a.scene)).toHaveLength(1);                     // 드래그도 그대로다
    window.dispatchEvent(key('Escape'));                         // 진짜 [Esc]는 여전히 취소다
    expect(ghosts(a.scene)).toHaveLength(0);
  });

  // 리뷰 m-3: setPointerCapture는 활성 포인터가 아닌 id에서 NotFoundError를 던진다(합성 포인터).
  // 캡처는 "있으면 좋은 것"이지 드래그의 계약이 아니다 — 놓쳤다고 pointerdown이 예외로 끝나지 않는다.
  test('setPointerCapture가 던져도 드래그가 끊기지 않는다(리뷰 m-3)', () => {
    const a = setup();
    a.domElement.setPointerCapture = () => { throw new DOMException('no pointer', 'NotFoundError'); };
    const from = [...a.item().pos];
    expect(noErrors(() => a.ptr('pointerdown', 100, 100))).toEqual([]);
    expect(a.controls.enabled).toBe(false);                      // 드래그가 정상으로 열렸다
    a.ptr('pointermove', 160, 130);
    expect(ghosts(a.scene)).toHaveLength(1);
    a.ptr('pointerup', 160, 130);
    expect(a.controls.enabled).toBe(true);                       // 궤도 조작이 되돌아온다
    expect(a.item().pos).not.toEqual(from);                      // 실제로 옮겨졌다
    a.store.undo();
    expect(a.item().pos).toEqual(from);                          // 되돌리기 한 단계 그대로
  });
});
