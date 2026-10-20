// 계획 17 성능(p17-perf-report.md): 윤곽선 ② 법선·깊이 패스를 그리기 한 번으로 묶는 모듈(src/view3d/normalBatch.js)
// — 한 번 훑기(겹침·조명·② 후보·그림자 서명) · 묶음 지오메트리 · 메시별 행렬 텍스처 · 구조가 바뀔 때만 다시 짓기.
import { describe, test, expect } from 'vitest';
import * as THREE from 'three';
import { sceneWalk, buildBatch, writeMatrices, createNormalBatch, batchable, sameList, BATCH_ROW } from '../src/view3d/normalBatch.js';

const state = () => ({ over: [], lights: [], cand: [], vis: [], sig: [], odd: false });
const box = (mat = new THREE.MeshStandardMaterial()) => new THREE.Mesh(new THREE.BoxGeometry(), mat);
const layers = new THREE.Camera().layers;
const walk = s => { s.updateMatrixWorld(); return sceneWalk(s, layers, state()); };

describe('sceneWalk — 한 번 훑기', () => {
  test('겹침 뿌리 · 조명 · ② 후보 메시(숨은 것 포함)와 그 프레임에 ②가 그릴지', () => {
    const s = new THREE.Scene();
    const hemi = new THREE.HemisphereLight(), sun = new THREE.DirectionalLight(); sun.castShadow = true;
    const a = box(), line = new THREE.LineSegments(); a.add(line);
    const off = new THREE.Group(); off.visible = false; const b = box(); off.add(b);
    const glass = box(new THREE.MeshStandardMaterial({ transparent: true })), inGlass = box(); glass.add(inGlass);
    const label = new THREE.Sprite(), hiddenLabel = new THREE.Sprite(); hiddenLabel.visible = false;
    const root = new THREE.Object3D(); root.isTransformControlsRoot = true; const handle = box(); root.add(handle);
    const layered = box(); layered.layers.set(2);
    const ghost = box(new THREE.MeshBasicMaterial({ visible: false }));
    s.add(hemi, sun, a, off, glass, label, hiddenLabel, root, layered, ghost);
    const w = walk(s);
    expect(w.over).toEqual([label, root]);                          // 보이는 겹침 뿌리만 · 그 아래(손잡이)는 훑지 않는다
    expect(w.lights).toEqual([hemi, sun]);                          // 훑는 순서 그대로(① 조명 상태와 같은 순서)
    expect(w.cand).toEqual([a, b, glass, inGlass, layered, ghost]);  // 겹침 밖 메시는 숨어 있어도 후보(보임이 바뀌어도 다시 짓지 않게)
    expect(w.vis).toEqual([true, false, false, false, false, false]);   // 숨은 부모 · 투명(과 그 아래) · 다른 층 · 보이지 않는 재질은 ②에 없다
    expect(w.odd).toBe(false);
  });

  test('odd: 묶을 수 없는 메시(인스턴스·다중 재질·법선 없음·모프·drawRange)가 ②에 그려질 때만 참', () => {
    const odd = [
      new THREE.InstancedMesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial(), 2),
      new THREE.Mesh(new THREE.BoxGeometry(), [new THREE.MeshStandardMaterial(), new THREE.MeshStandardMaterial()]),
      (() => { const g = new THREE.BoxGeometry(); g.deleteAttribute('normal'); return new THREE.Mesh(g, new THREE.MeshStandardMaterial()); })(),
      (() => { const g = new THREE.BoxGeometry(); g.morphAttributes.position = [g.attributes.position.clone()]; return new THREE.Mesh(g, new THREE.MeshStandardMaterial()); })(),
      (() => { const g = new THREE.BoxGeometry(); g.setDrawRange(0, 6); return new THREE.Mesh(g, new THREE.MeshStandardMaterial()); })(),
    ];
    for (const m of odd) {
      expect(batchable(m)).toBe(false);
      const s = new THREE.Scene(); s.add(box(), m);
      expect(walk(s).odd).toBe(true);
      m.visible = false;
      expect(walk(s).odd).toBe(false);                              // 그리지 않으면 상관없다
    }
    expect(batchable(box())).toBe(true);
  });

  test('그림자 서명: 같은 장면은 같다 · 던지는 것의 행렬·보임·지오메트리·재질과 해의 자리·그림자 카메라가 바뀌면 다르다', () => {
    const s = new THREE.Scene(), sun = new THREE.DirectionalLight(); sun.castShadow = true; sun.position.set(1, 5, 2);
    const a = box(), quiet = box(), label = new THREE.Sprite(); a.castShadow = true; quiet.castShadow = false;
    s.add(sun, a, quiet, label);
    const sig = () => walk(s).sig.slice();
    const base = sig();
    expect(sameList(sig(), base)).toBe(true);
    const changed = (fn, undo) => { fn(); const d = !sameList(sig(), base); undo(); expect(sameList(sig(), base)).toBe(true); return d; };
    expect(changed(() => a.position.x = 1, () => a.position.x = 0)).toBe(true);
    expect(changed(() => a.visible = false, () => a.visible = true)).toBe(true);
    const g = a.geometry; expect(changed(() => a.geometry = new THREE.BoxGeometry(), () => a.geometry = g)).toBe(true);
    g.attributes.position.needsUpdate = true;                     // 정점 내용이 바뀌었다(버전은 되돌릴 수 없다 — 기준을 다시 잡는다)
    const base2 = sig();
    expect(sameList(base2, base)).toBe(false);
    const again = (fn, undo) => { fn(); const d = !sameList(sig(), base2); undo(); return d; };
    expect(again(() => a.material.visible = false, () => a.material.visible = true)).toBe(true);
    expect(again(() => a.material.side = THREE.DoubleSide, () => a.material.side = THREE.FrontSide)).toBe(true);
    expect(again(() => a.castShadow = false, () => a.castShadow = true)).toBe(true);
    expect(again(() => sun.position.y = 6, () => sun.position.y = 5)).toBe(true);
    expect(again(() => sun.castShadow = false, () => sun.castShadow = true)).toBe(true);
    expect(again(() => { sun.shadow.camera.left = -8; }, () => { sun.shadow.camera.left = -5; })).toBe(true);
    expect(again(() => sun.shadow.mapSize.set(1024, 1024), () => sun.shadow.mapSize.set(512, 512))).toBe(true);
    // 그림자를 던지지 않는 것 · 겹침(라벨)은 그림자 맵과 상관없다
    expect(again(() => quiet.position.x = 3, () => quiet.position.x = 0)).toBe(false);
    expect(again(() => label.position.x = 3, () => label.position.x = 0)).toBe(false);
  });

  test('sameList: 길이와 원소가 모두 같아야 참', () => {
    expect(sameList([1, 2], [1, 2])).toBe(true);
    expect(sameList([1, 2], [1, 2, 3])).toBe(false);
    expect(sameList([1, 2], [1, 3])).toBe(false);
    expect(sameList([], [])).toBe(true);
  });
});

describe('buildBatch — 묶음 지오메트리', () => {
  test('메시마다 정점·법선을 이어 붙이고 인덱스를 밀고 slot에 메시 번호를 적는다(공유 지오메트리도 메시마다) · 인덱스 없는 지오메트리는 0..n', () => {
    const shared = new THREE.BoxGeometry(), plane = new THREE.PlaneGeometry().toNonIndexed();
    const odd = new THREE.Mesh(new THREE.BoxGeometry(), [new THREE.MeshStandardMaterial()]);
    const cand = [new THREE.Mesh(shared), odd, new THREE.Mesh(shared), new THREE.Mesh(plane)];
    const g = buildBatch(cand), n = shared.attributes.position.count, np = plane.attributes.position.count;
    expect(g.attributes.position.count).toBe(2 * n + np);           // 묶을 수 없는 메시(다중 재질)는 정점이 없다 — 번호는 그대로 1
    expect(Array.from(g.attributes.slot.array.slice(0, n))).toEqual(Array(n).fill(0));
    expect(Array.from(g.attributes.slot.array.slice(n, 2 * n))).toEqual(Array(n).fill(2));
    expect(Array.from(g.attributes.slot.array.slice(2 * n))).toEqual(Array(np).fill(3));
    const ix = g.index.array, si = shared.index.count;
    expect(ix.length).toBe(2 * si + np);
    expect(Array.from(ix.slice(si, 2 * si))).toEqual(Array.from(shared.index.array, v => v + n));
    expect(Array.from(ix.slice(2 * si))).toEqual(Array.from({ length: np }, (_, j) => 2 * n + j));
    expect(Array.from(g.attributes.position.array.slice(3 * n, 6 * n))).toEqual(Array.from(shared.attributes.position.array));
    expect(Array.from(g.attributes.normal.array.slice(6 * n))).toEqual(Array.from(plane.attributes.normal.array));
  });
  test('양자화(정규화)·인터리브 속성(압축 GLB)은 값으로 풀어 담는다', () => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Int16Array([32767, 0, 0, 0, -32767, 0, 0, 0, 32767]), 3, true));
    const ib = new THREE.InterleavedBuffer(new Float32Array([0, 0, 1, 9, 0, 1, 0, 9, 1, 0, 0, 9]), 4);
    geo.setAttribute('normal', new THREE.InterleavedBufferAttribute(ib, 3, 0));
    const g = buildBatch([new THREE.Mesh(geo, new THREE.MeshStandardMaterial())]);
    expect(Array.from(g.attributes.position.array)).toEqual([1, 0, 0, 0, -1, 0, 0, 0, 1]);
    expect(Array.from(g.attributes.normal.array)).toEqual([0, 0, 1, 0, 1, 0, 1, 0, 0]);
  });
});

describe('writeMatrices · createNormalBatch', () => {
  test('보이면 모델뷰 행렬(V·M — three가 CPU에서 만드는 값), 안 보이면 [15] = 0(셰이더가 화면 밖으로 보낸다)', () => {
    const a = box(), b = box(); a.position.set(1, 2, 3); a.rotation.y = 0.3; a.updateMatrixWorld();
    const cam = new THREE.PerspectiveCamera(); cam.position.set(4, 5, 6); cam.lookAt(0, 0, 0); cam.updateMatrixWorld();
    const data = new Float32Array(32).fill(7);
    writeMatrices(data, [a, b], [true, false], cam.matrixWorldInverse);
    a.modelViewMatrix.multiplyMatrices(cam.matrixWorldInverse, a.matrixWorld);   // three renderObject와 같은 계산
    expect(Array.from(data.slice(0, 16))).toEqual(Array.from(new Float32Array(a.modelViewMatrix.elements)));
    expect(data[31]).toBe(0);
  });
  test('후보 메시·지오메트리·버전이 그대로면 다시 짓지 않고 행렬만 올린다 · 바뀌면 다시 짓는다 · 행 수는 256개마다 는다', () => {
    const nb = createNormalBatch(), cam = new THREE.Camera();   // 단위 시점 — 모델뷰 = 월드
    const a = box(), b = box();
    nb.sync([a, b], [true, true], cam);
    expect(nb.builds).toBe(1);
    const geo = nb.scene.children[0].geometry, tex = nb.scene.children[0].material.uniforms.tM.value;
    expect(geo.attributes.position.count).toBe(2 * a.geometry.attributes.position.count);
    expect(tex.image.width).toBe(BATCH_ROW * 4); expect(tex.image.height).toBe(1);
    const v = tex.version;
    a.position.x = 5; a.updateMatrixWorld();
    nb.sync([a, b], [true, false], cam);
    expect(nb.builds).toBe(1);                                     // 움직임·보임은 행렬만
    expect(tex.version).toBeGreaterThan(v);
    expect(tex.image.data[12]).toBe(5); expect(tex.image.data[31]).toBe(0);
    b.geometry.attributes.position.needsUpdate = true;
    nb.sync([a, b], [true, true], cam); expect(nb.builds).toBe(2);       // 지오메트리 내용이 바뀌었다
    b.geometry = new THREE.BoxGeometry();
    nb.sync([a, b], [true, true], cam); expect(nb.builds).toBe(3);       // 지오메트리를 갈았다
    nb.sync([b, a], [true, true], cam); expect(nb.builds).toBe(4);       // 순서(번호)가 바뀌었다
    nb.sync([a], [true], cam); expect(nb.builds).toBe(5);                // 빠졌다
    expect(geo.attributes.position.count).toBeGreaterThan(0);
    const many = Array.from({ length: BATCH_ROW + 1 }, () => box());
    nb.sync(many, many.map(() => true), cam);
    expect(nb.scene.children[0].material.uniforms.tM.value.image.height).toBe(2);
    nb.dispose();
  });
  test('셰이더는 MeshNormalMaterial(양면)과 같은 값을 낸다: 시점 공간 법선 · 뒷면은 뒤집고 거울(det < 0) 메시도 바깥을 향한다 · 0.5 + 0.5', () => {
    const mat = createNormalBatch().scene.children[0].material;
    expect(mat.side).toBe(THREE.DoubleSide);
    expect(mat.vertexShader).toContain('texelFetch');
    expect(mat.vertexShader).toContain('sign(dot(a[0], c[0]))');    // 행렬식 부호(거울)
    expect(mat.vertexShader).toContain('projectionMatrix * (m * vec4(position, 1.))');   // three: P · (MV · p)
    expect(mat.fragmentShader).toContain('gl_FrontFacing ? vF : -vF');
    expect(mat.fragmentShader).toContain('* .5 + .5');
  });
});
