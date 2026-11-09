// 앱 화면 찍기 도우미(2026-11-06 · 계획 20 Task 6 — snapshot.mjs에서 옮김: snapshot · compare-shape · template-load가 쓴다).

// 장면(순수 함수 — snapshot · compare-shape가 같이 쓴다 · 테스트 assetsTools). 정사각 방 한 변(mm): 제품 큰 변 + 600 mm를 100 mm로 올림, 최소 2400.
export const roomFor = p => Math.max(2400, Math.ceil((Math.max(p.size[0], p.size[1]) + 600) / 100) * 100);
// 방 가운데(c mm) 아이템의 바닥 높이 z(mm)와 원근 겨눔점 target(m · three 좌표 [x, 높이, z]) · 큰 변 ext(m).
// z는 makeProject(browser.mjs)가 아이템을 놓는 규칙과 같다: 천장 부착은 층고 − 높이(0 아래로는 안 간다), 그 밖(바닥·벽)은 zDefault(없으면 0).
export function aimFor(p, c, ceiling = 2300) {
  const z = p.attach === 'ceiling' ? Math.max(0, ceiling - p.size[2]) : p.zDefault ?? 0;
  return { z, target: [c / 1000, (z + p.size[2] / 2) / 1000, c / 1000], ext: Math.max(...p.size) / 1000 };
}

// rememberRender: 렌더러의 마지막 render(장면, 카메라)를 기억한다(threeHook 뒤에 거는 초기화 스크립트). 기록 없는 render는 __render로 남긴다(원근 그리기가 __last를 덮지 않게).
// 앱은 렌더러를 만든 뒤 render를 다시 감싼다(윤곽선 installOutline — 계획 17). 감싸기 전에 바꿔 두면 윤곽선의 안쪽 패스까지 기록돼 __last가
// 마지막 합성 사각형(정투영 카메라)이 된다(2026-10-27 원근 확인 실패). 그래서 render를 접근자로 두어 앱이 새로 넣는 함수를 맨 바깥으로 받고,
// 맨 바깥 호출만 기록한다 — 감싸는 쪽이 미리 읽어 간 이전 render(raw)는 기록하지 않는다. __render도 맨 바깥(윤곽선 포함 — 앱 화면 그대로)이다.
// __renderTimes: 맨 바깥 render 시각(performance.now) — 프레임 간격 측정(template-load.mjs)용.
export function rememberRender() {
  window.__renderTimes = [];
  window.__THREE_DEVTOOLS__.addEventListener('observe', e => {
    const r = e.detail; if (!r?.isWebGLRenderer) return;
    let top = r.render;
    r.__render = (s, c) => top.call(r, s, c);
    Object.defineProperty(r, 'render', {
      configurable: true,
      get() { const f = top; return (s, c) => { if (f === top) { r.__last = [s, c]; window.__renderTimes.push(performance.now()); } return f.call(r, s, c); }; },
      set(fn) { top = fn; },
    });
  });
}
export const png = url => { if (!url) throw new Error('렌더러가 아직 그리지 않았다'); return Buffer.from(url.split(',')[1], 'base64'); };
export const frames = page => page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));

// 원근: 앱 궤도 카메라의 clone(window.__persp)으로 제품 중심을 겨눠 캔버스 왼쪽 아래 정사각 영역에 그리고 그 영역만 읽는다(뷰포트는 되돌린다).
export async function grabPersp(page, [az, el], target, ext) {
  return png(await page.evaluate(({ az, el, target, ext }) => {
    const r = window.__three.renderers.find(x => x.domElement.isConnected), cam = window.__persp.clone(), fov = 30;
    const a = az * Math.PI / 180, e = el * Math.PI / 180, d = (ext / (2 * Math.tan(fov * Math.PI / 360))) * 1.35;
    Object.assign(cam, { fov, aspect: 1, near: 0.05, far: 100, zoom: 1 });
    cam.position.set(target[0] + d * Math.sin(a) * Math.cos(e), target[1] + d * Math.sin(e), target[2] + d * Math.cos(a) * Math.cos(e));
    cam.lookAt(target[0], target[1], target[2]); cam.updateProjectionMatrix();
    const W = r.domElement.width, H = r.domElement.height, s = Math.min(W, H), pr = r.getPixelRatio();
    r.setViewport(0, 0, s / pr, s / pr); r.__render(r.__last[0], cam);
    const out = document.createElement('canvas'); out.width = out.height = s;
    out.getContext('2d').drawImage(r.domElement, 0, H - s, s, s, 0, 0, s, s);
    r.setViewport(0, 0, W / pr, H / pr);
    return out.toDataURL('image/png');
  }, { az, el, target, ext }));
}

// 모델 도착 = **렌더러가 마지막에 그린 장면**(r.__last[0] — 앱 장면)에 모델 복제(itemAssets.fitClone이 템플릿에서 복제해 오는 userData.bbox)가 n개 이상이다.
// 공유 메시 표시(userData.shared)는 스테인리스 조합 형상(shapes/index.js)과 셰이더 예열 장면에도 붙어 모델 전 자리표시에 걸린다.
// 예전(snapshot.mjs)에는 __three.scenes 아무 곳의 공유 메시를 봤다: GLTFLoader의 gltf.scene(itemAssets.normalize가 표시를 먼저 단다)에 걸려 앱 리빌드 전에
// 통과했고, 첫 원근 칸이 조합 형상(상자)으로 찍혔다(2026-10-27 · 2K 텍스처 가스레인지 1.27 MB). 그래서 앱이 실제로 그린 장면만 본다.
export const waitModel = (page, n = 1, timeout = 15000) => page.waitForFunction(k => {
  const s = window.__three.renderers.find(x => x.domElement.isConnected)?.__last?.[0]; let hit = 0;
  s?.traverse(o => { if (o.userData.bbox) hit++; }); return hit >= k;
}, n, { timeout });
// 형상 도착(실사 모델 끔 — v3.assets false) = 마지막에 그린 장면에 아이템 오브젝트(items3d.itemMesh: name 'item' + userData.itemId)가 n개 이상이고
// 모델 복제(userData.bbox)는 하나도 없다. 2D에서는 3D 리빌드가 보류되므로(rebuildGate) 3D로 넘어가 리빌드가 그린 뒤에야 통과한다.
export const waitShape = (page, n = 1, timeout = 15000) => page.waitForFunction(k => {
  const s = window.__three.renderers.find(x => x.domElement.isConnected)?.__last?.[0]; let items = 0, models = 0;
  s?.traverse(o => { if (o.name === 'item' && o.userData.itemId) items++; if (o.userData.bbox) models++; }); return items >= k && models === 0;
}, n, { timeout }).catch(err => { throw new Error(`형상 장면이 ${timeout} ms 안에 그려지지 않았다(아이템 ${n}개 · 모델 복제 0) — ${err.message.split('\n')[0]}`); });
// 앱 궤도 카메라 복제를 window.__persp에 둔다(grabPersp가 쓴다). 원근 카메라가 아니면 거짓.
export const capturePersp = page => page.evaluate(() => {
  const r = window.__three.renderers.find(x => x.domElement.isConnected); window.__persp = r.__last?.[1]?.clone(); return !!window.__persp?.isPerspectiveCamera;
});
