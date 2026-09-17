// 보기 옵션 목록과 팝오버 HTML. 라벨 문구는 오늘의집 표기를 그대로 쓴다.
export const V2_OPTIONS = [
  ['grid', '격자'], ['guides', '보조선'], ['floorItems', '지면 가구'], ['wallItems', '벽면 가구'], ['ceilingItems', '천장 가구'],
  ['structures', '건축/자재'], ['productCode', '제품 코드'], ['roomName', '공간 이름'], ['roomArea', '공간 면적'],
  ['dims', '내벽 치수'], ['gapDims', '간격 치수'], ['measures', '측정선'], ['collision', '충돌 감지'], ['background', '배경 이미지'],
];
export const V3_OPTIONS = [
  ['floorItems', '지면 가구'], ['wallItems', '벽면 가구'], ['ceilingItems', '천장 가구'], ['structures', '건축/자재'],
  ['outerWalls', '외벽 보기'], ['innerWalls', '내벽 보기'], ['wallTransparent', '벽 투명화'],
  ['dims', '치수선 보기'], ['gapDims', '간격 치수'], ['measures', '측정선'], ['collision', '충돌 감지'],
];
export const DISPLAY_MODES = [['normal', '일반'], ['white', '화이트 단색'], ['transparent', '투명']];
export const PERF_MODES = [['display', '디스플레이 우선'], ['performance', '성능 우선']];

const cb = (attr, key, label, on) => `<label class="pop-row"><input type="checkbox" ${attr}="${key}" ${on ? 'checked' : ''}> ${label}</label>`;
const sel = (path, options, value) => `<select data-view="${path}">${options.map(([v, l]) => `<option value="${v}" ${value === v ? 'selected' : ''}>${l}</option>`).join('')}</select>`;

export function viewPopoverHtml(view, mode) {
  if (mode === '2d') return `<h4>보기 모드</h4>${V2_OPTIONS.map(([k, l]) => cb('data-v2', k, l, view.v2[k])).join('')}`;
  return `<h4>보기 모드</h4>${V3_OPTIONS.map(([k, l]) => cb('data-v3', k, l, view.v3[k])).join('')}
    ${cb('data-view', 'cutaway', '벽 컷어웨이', view.cutaway)}
    <h4>디스플레이 모드</h4><div class="pop-row">${sel('display', DISPLAY_MODES, view.display)}</div>
    ${cb('data-view', 'hiddenLine', '은선 색상', view.hiddenLine)}
    <h4>성능 모드</h4><div class="pop-row">${sel('perfMode', PERF_MODES, view.perfMode)}</div>`;
}
