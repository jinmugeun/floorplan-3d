// 2D 투영(정면/배면/좌/우/평면/저면)의 고정 직교 카메라를 한곳에 모은다. view3d.js에서 그대로
// 옮겨 온 코드다(§15.12 Step 9a): 라벨 컬링 배선을 더하면 view3d.js가 300줄 예산을 넘으므로
// 먼저 나눴고, 동작은 한 줄도 바뀌지 않았다.
// 피커·컨트롤은 콜백으로만 만진다(detachPicker·reattachPicker) — 이 모듈이 pick3d를 직접
// import하지 않게. getMode가 필요한 이유: clearOrthoView가 1인칭에서는 궤도 조작을 되살리지
// 않는다(controls.enabled = mode !== 'fp').
// onCameraChange는 "활성 카메라가 바뀌었다"를 알린다(§15.12 · 리뷰 Important 1): 프리셋은
// controls.enabled = false로 만들어 OrbitControls의 'change'가 더는 오지 않으므로, 이 콜백이
// 없으면 정면·평면 도면의 라벨 visible이 직전 궤도 카메라로 잰 값 그대로 굳는다.
// view3d가 여기에 같은 디바운스 컬링(scheduleLabelCull)을 건다.
import * as THREE from 'three';
import { activeFloor } from '../state/schema.js';
import { orthoViewParams } from './pick3d.js';

export function createOrthoView({
  container, store, controls, bounds,
  getMode = () => 'iso', onOrthoView = () => {}, requestRender = () => {},
  detachPicker = () => {}, reattachPicker = () => {}, onCameraChange = () => {},
} = {}) {
  let ortho2 = null, useOrtho = false, orthoName = null;
  // 2D 투영(정면/배면/좌/우/평면/저면): 도면을 도면처럼 고정된 직교 카메라로 본다.
  function setOrthoView(name) {
    const b = bounds(), w = container.clientWidth || 1, h = container.clientHeight || 1;
    // size를 함께 넘긴다(최종 리뷰 I-6): 평면·저면의 절두체가 도면의 가로·세로를 보게 한다.
    // renderImage(인쇄물)와 **같은 인자**여야 같은 도면이 화면과 인쇄에서 다른 프레임이 되지 않는다.
    const p = orthoViewParams(name, { center: b.center, extent: b.extent, size: b.size, height: activeFloor(store.get()).height, aspect: w / h });
    if (!ortho2) ortho2 = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 1000);
    ortho2.left = -p.halfW; ortho2.right = p.halfW; ortho2.top = p.halfH; ortho2.bottom = -p.halfH;
    ortho2.position.set(...p.pos); ortho2.up.set(...p.up);
    ortho2.lookAt(new THREE.Vector3(...p.target));
    ortho2.updateProjectionMatrix();
    useOrtho = true; orthoName = name; controls.enabled = false;  // 고정 뷰(도면처럼 본다)
    detachPicker();                                 // 편집할 수 없는 고정 뷰이므로 기즈모도 떼어 둔다
    onOrthoView(name);
    onCameraChange();   // 활성 카메라가 ortho2로 바뀌었다 — 라벨 겹침을 이 카메라로 다시 잰다
    requestRender();
  }
  function clearOrthoView() {
    if (!useOrtho) return;                             // 투영 중이 아니면 할 일이 없다(하단 바 "—" 선택이 늘 부른다)
    useOrtho = false; orthoName = null; controls.enabled = getMode() !== 'fp';
    reattachPicker();                                  // 투영에서 빠져나오면 선택한 아이템에 기즈모를 다시 붙인다
    onOrthoView(null);
    onCameraChange();   // 궤도 카메라로 돌아왔다(첫 드래그를 기다리지 않고 다시 잰다)
    requestRender();
  }
  return {
    setOrthoView, clearOrthoView,
    resize() { if (useOrtho && orthoName) setOrthoView(orthoName); }, // 2D 투영의 절두체는 화면 비율을 따른다
    camera: () => (useOrtho && ortho2 ? ortho2 : null),   // 투영 중이 아니면 null — 부르는 쪽이 ?? camera로 받는다
    isActive: () => useOrtho,
    name: () => orthoName,
  };
}
