// 2D 투영(정면/배면/좌/우/평면/저면)의 고정 직교 카메라를 한곳에 모은다. view3d.js에서 그대로
// 옮겨 온 코드다(§15.12 Step 9a): 라벨 컬링 배선을 더하면 view3d.js가 300줄 예산을 넘으므로
// 먼저 나눴고, 동작은 한 줄도 바뀌지 않았다.
// 피커·컨트롤은 콜백으로만 만진다(detachPicker·reattachPicker) — 이 모듈이 pick3d를 직접
// import하지 않게. getMode가 필요한 이유: clearOrthoView가 1인칭에서는 궤도 조작을 되살리지
// 않는다(controls.enabled = mode !== 'fp').
import * as THREE from 'three';
import { activeFloor } from '../state/schema.js';
import { orthoViewParams } from './pick3d.js';

export function createOrthoView({
  container, store, controls, bounds,
  getMode = () => 'iso', onOrthoView = () => {}, requestRender = () => {},
  detachPicker = () => {}, reattachPicker = () => {},
} = {}) {
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
    detachPicker();                                 // 편집할 수 없는 고정 뷰이므로 기즈모도 떼어 둔다
    onOrthoView(name);
    requestRender();
  }
  function clearOrthoView() {
    if (!useOrtho) return;                             // 투영 중이 아니면 할 일이 없다(하단 바 "—" 선택이 늘 부른다)
    useOrtho = false; orthoName = null; controls.enabled = getMode() !== 'fp';
    reattachPicker();                                  // 투영에서 빠져나오면 선택한 아이템에 기즈모를 다시 붙인다
    onOrthoView(null);
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
