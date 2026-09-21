// 경로 배열 복사(Alt+S)의 배선(§13.1). main.js가 300줄에 가까워 여기로 나눴다
// (계획 4의 src/app/deleteActions.js와 같은 자리다).
// 흐름: 메뉴·단축키 → pathArray(ids) → 2D 도구로 경로를 그린다 → onDone(points)
//      → 선택 도구로 복귀 → openArrayDialog('path') → arrayCopy(store, ids, 'path', …) → 토스트.
import { itemsOf, arrayCopy } from '../state/floorOps.js';
import { openArrayDialog } from '../ui/itemDialogs.js';
import { createPathArrayTool } from '../view2d/tools/pathArrayTool.js';

export const PATH_TOOL = 'pathArray';

// 간격 기본값 = 아이템의 긴 변(의자를 경로에 죽 늘어놓을 때 서로 닿지 않는 최소 간격이다).
export const spacingDefault = item => {
  const s = item?.size;
  return Array.isArray(s) ? Math.max(Number(s[0]) || 0, Number(s[1]) || 0) || 600 : 600;
};

export function createArrangeActions({ store, ui, view, toast = () => {}, setTool = () => {} }) {
  let ids = [];

  // 3D에는 캔버스에 점을 찍을 자리가 없다(메뉴 항목도 비활성이지만, 단축키 경로를 위해 여기서도 막는다).
  function pathArray(selected) {
    if (!selected?.length) return false;
    if (ui.get().mode !== '2d') { toast('2D에서 사용'); return false; }
    ids = [...selected];
    setTool(PATH_TOOL);
    return true;
  }

  function done(points) {
    const target = ids;
    ids = [];
    setTool('select');
    if (!points || points.length < 2 || !target.length) return;
    const first = itemsOf(store.get(), target)[0] ?? null;
    openArrayDialog('path', {
      length: spacingDefault(first),
      onApply: params => {
        const made = arrayCopy(store, target, 'path', { ...params, points });
        if (made.length) toast(`${made.length}개 복사했습니다`);
      },
    });
  }

  return {
    pathArray,
    createPathTool: () => createPathArrayTool({ store, ui, view, ids, onDone: done }),
  };
}
