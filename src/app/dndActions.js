// 라이브러리 타일을 캔버스로 끌어 놓는 배선(§14.11). 클릭-클릭 배치는 그대로 남는다(DnD가 없는
// 터치 환경의 경로다). main.js가 300줄을 넘지 않게 여기로 뺐고, 덕분에 배선 규칙을 테스트가 직접
// 부를 수 있다(app/은 view2d/를 import해도 된다 — §9).
//
// 규칙은 한 자리에만 적는다: dragover가 place 도구를 켜 고스트를 보여 주고(placeTool.getGhost),
// drop이 그 도구의 클릭 경로(onPointerDown)로 한 번 놓는다 — 벽 스냅·천장 z·충돌 표시·undo 한
// 단계가 클릭 배치와 완전히 같다. 무엇을 끌고 있는지는 ui.dragProduct에서 읽는다(dragover에서는
// dataTransfer.getData가 막혀 있다).
import { productById } from '../products/catalog.js';
import { DROP_NEEDS_WALL } from '../ui/messages.js';

// 벽 부착 제품은 벽에 붙지 않으면 놓을 자리가 아니다(고스트에 wallId가 없다): 드롭 지점이 "여기"라는
// 뜻이 분명한 동작이므로, 엉뚱한 곳에 떠 있는 제품을 만드는 대신 아무 일도 하지 않는다.
// 다만 **말없이** 아무 일도 하지 않으면 안 된다: 규칙을 토스트로 알린다(§14.8의 "조용한 무동작 금지",
// structTool이 개구부를 거부할 때와 같은 방식이다).
const placeable = (product, ghost) => product.attach !== 'wall' || !!ghost?.item?.wallId;

export function createDndActions({ ui, view, startPlace, pending = () => null, setTool = () => {}, toast = () => {} }) {
  // 드래그 미리보기를 켜기 전의 도구·대기 제품. 드롭 없이 끝나면 그대로 돌려놓는다:
  // 타일을 클릭해 둔 클릭 배치(pendingProduct)가 지나간 드래그 때문에 사라지면 안 된다.
  let saved = null;
  const dragged = () => productById(ui.get().dragProduct ?? '');
  function arm(product) {
    saved ??= { tool: ui.get().tool, product: pending() };
    if (ui.get().tool !== 'place' || pending()?.id !== product.id) startPlace(product);
  }
  function restore() {
    if (!saved) return;
    const { tool, product } = saved;
    saved = null;
    if (tool === 'place' && product) startPlace(product); // 클릭 배치 대기를 되살린다(새 도구라 고스트는 비어 있다)
    else setTool(tool === 'place' ? 'select' : tool);     // 도구를 다시 만들면 고스트가 지워진다
  }
  return {
    onDragOver(p) {
      const product = dragged();
      if (!product) return;
      arm(product);
      view.tool?.onPointerMove?.(p, {});
    },
    onDrop(p) {
      const product = dragged();
      if (!product) return;
      arm(product);
      const tool = view.tool;
      tool?.onPointerMove?.(p, {});                       // 고스트를 드롭 지점으로 옮긴 뒤 놓을 자리인지 본다
      if (placeable(product, tool?.getGhost?.())) { saved = null; tool?.onPointerDown?.(p, {}); } // 배치 도구가 놓고 onDone으로 선택 도구로 돌아간다
      else { restore(); toast(DROP_NEEDS_WALL); }
      ui.set({ dragProduct: null });
    },
    onDragLeave: restore,
    // dragend는 드래그 **소스**(라이브러리 타일)에서 일어난다 — 캔버스에서는 절대 오지 않는다.
    // 그래서 배선은 libraryPanel의 dragend가 부른다(main.js): 캔버스 위에서 [Esc]로 드래그를
    // 취소하면 dragleave도 drop도 없이 dragend만 오므로, 이 경로가 없으면 배치 도구가 켜진 채 남는다.
    onDragEnd: restore,
  };
}
