// 층 관리 UI(§16.4). propsPanel.js에서 그대로 옮겼고, **선택과 무관하게 늘 보이는 한 줄**(#floorBar)과
// 선택이 없을 때만 나오는 상세로 나눴다: 무엇이든 고르면 층 전환 수단이 통째로 사라져 층을 바꾸려면
// 먼저 [Esc]로 선택을 풀어야 했다(감사 §29). 이 파일은 문자열만 만들고 스토어·이벤트를 모른다
// (name=* 은 예전과 같으므로 propsPanel의 클릭·change 배선은 그대로다).
import { totalArea } from '../state/floorOps.js';
import { fmtArea } from '../util/units.js';
import { field, lenField, withUnit } from './fieldUtils.js';
import { LAST_FLOOR_TITLE } from './messages.js';
import { esc } from '../util/html.js';

// 늘 보이는 한 줄이라 라벨은 짧다(§16.4의 "[층 추가]"). 상세의 [이름 변경]·[층 삭제]는 그대로다.
export const FLOOR_ADD = '층 추가';

// 한 줄: 현재 층 select + [층 추가]. 선택이 있든 없든 같은 마크업이다.
export function floorBarHtml(project) {
  const floors = project?.floors ?? [];
  const idx = project?.activeFloor ?? 0;
  const options = floors.map((fl, i) => `<option value="${i}"${i === idx ? ' selected' : ''}>${esc(fl.name)}</option>`).join('');
  return `<div id="floorBar">
      <select name="floorSelect" aria-label="현재 층">${options}</select>
      <button type="button" name="floorAdd" title="층 추가하기">${FLOOR_ADD}</button>
    </div>`;
}

// 선택이 없을 때의 층 상세. 예전 "층 관리" 절에서 select·[층 추가하기]만 빼낸 나머지다.
export function floorDetailsHtml(project, floor, { units = 'mm', showUnit = false, pyeong = false, detailsOpen = true } = {}) {
  const p = project ?? {}, f = floor ?? {};
  const lastFloor = (p.floors?.length ?? 1) <= 1;
  return `<h2>층 관리</h2>
    <div class="row"><button type="button" name="floorRename">이름 변경</button><button type="button" name="floorDelete" class="danger" ${lastFloor ? `disabled title="${LAST_FLOOR_TITLE}"` : ''}>층 삭제</button></div>
    ${lenField(withUnit('층 높이', units, showUnit), 'floorHeight', f.height ?? 2300, 2000, 8000, false, units, 10)}
    <details ${detailsOpen ? 'open' : ''}><summary>상세 설정</summary>
      ${field('실면적 기준', `<select name="areaMode"><option value="net" ${p.areaMode !== 'gross' ? 'selected' : ''}>실면적</option><option value="gross" ${p.areaMode === 'gross' ? 'selected' : ''}>실면적+내외벽</option></select>`)}
      ${field('총면적', `<output name="totalArea">${fmtArea(totalArea(f, p.areaMode), { pyeong })}</output>`)}
      ${lenField(withUnit('슬래브 두께', units, showUnit), 'slab', f.slab ?? 0, 0, 1000, false, units)}
      ${field('벽 투명도', `<input type="range" name="wallOpacity" min="0" max="1" step="0.05" value="${p.view?.wallOpacity ?? 1}"><output name="wallOpacityOut">${Math.round((p.view?.wallOpacity ?? 1) * 100)}%</output>`)}
      ${field('바닥 투명도', `<input type="range" name="floorOpacity" min="0" max="1" step="0.05" value="${p.view?.floorOpacity ?? 1}"><output name="floorOpacityOut">${Math.round((p.view?.floorOpacity ?? 1) * 100)}%</output>`)}
    </details>
    <p class="hint">객체를 클릭하면 상세 정보가 표시됩니다.</p>`;
}
