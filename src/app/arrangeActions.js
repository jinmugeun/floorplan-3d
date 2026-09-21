// 경로 배열 복사(Alt+S)의 배선(§13.1). main.js가 300줄에 가까워 여기로 나눴다
// (계획 4의 src/app/deleteActions.js와 같은 자리다).
// 흐름: 메뉴·단축키 → pathArray(ids) → 2D 도구로 경로를 그린다 → onDone(points)
//      → 선택 도구로 복귀 → openArrayDialog('path') → arrayCopy(store, ids, 'path', …) → 토스트.
import { itemsOf, arrayCopy } from '../state/floorOps.js';
import { MAX_PLACEMENTS, pathPlacementCount } from '../geom/arrange.js';
import { openArrayDialog, MIN_SPACING, MAX_COUNT } from '../ui/itemDialogs.js';
import { createPathArrayTool } from '../view2d/tools/pathArrayTool.js';

export const PATH_TOOL = 'pathArray';
export { MAX_PLACEMENTS, MIN_SPACING };

// 대화상자가 이미 자르는 값(min/max)을 여기서 한 번 더 자른다: 단축키·메뉴가 아닌 경로나
// 브라우저 검증을 건너뛴 입력이 와도 배치 수가 터지지 않게 하는 마지막 관문이다.
// 총 배치 수는 아이템마다 같은 경로를 따르므로 개수 × 선택 수다(arrangeOps의 'path' 분기).
const clampParams = params => ({
  ...params,
  spacing: Math.max(MIN_SPACING, Math.abs(Number(params?.spacing)) || MIN_SPACING),
  count: Number(params?.count) >= 1 ? Math.min(Math.round(Number(params.count)), MAX_COUNT) : null,
});

// 간격 기본값 = 아이템의 긴 변(의자를 경로에 죽 늘어놓을 때 서로 닿지 않는 최소 간격이다).
export const spacingDefault = item => {
  const s = item?.size;
  return Array.isArray(s) ? Math.max(Number(s[0]) || 0, Number(s[1]) || 0) || 600 : 600;
};

export function createArrangeActions({ store, ui, view, toast = () => {}, setTool = () => {} }) {
  let ids = [];

  // 3D에는 캔버스에 점을 찍을 자리가 없다(메뉴 항목도 비활성이지만, 단축키 경로를 위해 여기서도 막는다).
  // 1인칭 찍기(fpPick)도 막는다: mode는 '2d'지만 첫 클릭을 1인칭 진입 리스너가 가져가므로
  // 도구가 보이지 않게 켜진 채 남는다(M-1).
  function pathArray(selected) {
    if (!selected?.length) return false;
    const u = ui.get();
    if (u.mode !== '2d' || u.fpPick) { toast('2D에서 사용'); return false; }
    ids = [...selected];
    setTool(PATH_TOOL);
    return true;
  }

  function done(points) {
    const target = ids;
    ids = [];
    setTool('select');
    if (!points || points.length < 2 || !target.length) return;
    const found = itemsOf(store.get(), target);
    // 간격 기본값은 "선택 순서의 첫 아이템"이다(itemsOf는 도면 배열 순서로 돌려준다 — L-4).
    const first = found.find(it => it.id === target[0]) ?? found[0] ?? null;
    if (target.length > 1) toast('여러 개를 고르면 사본이 경로점마다 같은 자리에 겹칩니다');
    openArrayDialog('path', {
      length: spacingDefault(first),
      onApply: raw => {
        const params = { ...clampParams(raw), points };
        // 간격으로 채우는 모드에는 개수 입력이 없으니 놓을 수를 먼저 세고, 상한을 넘으면 만들지 않는다.
        if (pathPlacementCount(points, params) * target.length > MAX_PLACEMENTS) {
          toast(`배치 수가 너무 많습니다(최대 ${MAX_PLACEMENTS})`);
          return;
        }
        const made = arrayCopy(store, target, 'path', params);
        if (made.length) toast(`${made.length}개 복사했습니다`);
      },
    });
  }

  return {
    pathArray,
    createPathTool: () => createPathArrayTool({ store, ui, view, ids, onDone: done }),
  };
}
