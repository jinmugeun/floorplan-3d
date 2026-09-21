// 보기 옵션 목록과 팝오버 HTML. 라벨 문구는 오늘의집 표기를 그대로 쓴다.
export const V2_OPTIONS = [
  ['grid', '격자'], ['guides', '보조선'], ['floorItems', '지면 가구'], ['wallItems', '벽면 가구'], ['ceilingItems', '천장 가구'],
  ['structures', '건축/자재'], ['productCode', '제품 코드'], ['roomName', '공간 이름'], ['roomArea', '공간 면적'],
  ['dims', '내벽 치수'], ['gapDims', '간격 치수'], ['measures', '측정선'], ['collision', '충돌 감지'], ['collisionLive', '실시간 충돌 감지'], ['background', '배경 이미지'],
  ['ducts', '덕트'], ['ductLabels', '덕트 라벨'], ['equipLabels', '설비 라벨'],
];
export const V3_OPTIONS = [
  ['floorItems', '지면 가구'], ['wallItems', '벽면 가구'], ['ceilingItems', '천장 가구'], ['structures', '건축/자재'],
  ['outerWalls', '외벽 보기'], ['innerWalls', '내벽 보기'], ['wallTransparent', '벽 투명화'],
  ['dims', '치수선 보기'], ['gapDims', '간격 치수'], ['measures', '측정선'], ['collision', '충돌 감지'],
  ['itemEdges', '제품 윤곽선'],
  ['ducts', '덕트'], ['ductLabels', '덕트 라벨'], ['equipLabels', '설비 라벨'],
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
    <h4>성능 모드</h4><div class="pop-row">${sel('perfMode', PERF_MODES, view.perfMode)}</div>
    <p class="hint">그림자·윤곽선·라벨을 끄고 픽셀 비율을 1로</p>`;
}

// [최소, 기본, 최대]
const CAMERA_RANGE = { elevation: [0, 35, 89], azimuth: [0, 47, 359], fov: [15, 60, 120] };
const CAMERA_LABEL = { elevation: '카메라 고도', azimuth: '방위각', fov: '시야각' };
// [최소, 기본, 최대, 간격, 접미사]
const SUN_RANGE = { month: [1, 6, 12, 1, '월'], hour: [0, 12, 23, 1, '시'], intensity: [0, 0.8, 2, 0.05, ''], azimuth: [0, 180, 359, 1, '°'], ambient: [0, 0.6, 2, 0.05, ''] };
const SUN_LABEL = { month: '월', hour: '시간', intensity: '강도', azimuth: '방위각', ambient: '환경광 강도' };

const slider = (path, label, value, min, max, step, suffix, preset) =>
  `<div class="pop-row"><span>${label}</span><input type="range" data-view="${path}" min="${min}" max="${max}" step="${step}" value="${value}"><output data-suffix="${suffix}">${value}${suffix}</output>${
    preset === null ? '' : `<button type="button" data-preset="${path}:${min}">최소</button><button type="button" data-preset="${path}:${preset}">기본</button><button type="button" data-preset="${path}:${max}">최대</button>`
  }</div>`;

export function cameraPopoverHtml(view) {
  const rows = Object.entries(CAMERA_RANGE)
    .map(([k, [mn, df, mx]]) => slider(`cameraPreset.${k}`, CAMERA_LABEL[k], view.cameraPreset[k], mn, mx, 1, '°', df))
    .join('');
  return `<h4>카메라 설정</h4><div class="pop-row"><span>타입</span>${sel('projection', [['perspective', '원근'], ['ortho', '직교']], view.projection)}</div>${rows}`;
}

export function sunPopoverHtml(view) {
  const rows = Object.entries(SUN_RANGE)
    .map(([k, [mn, , mx, step, suffix]]) => slider(`sun.${k}`, SUN_LABEL[k], view.sun[k], mn, mx, step, suffix, null))
    .join('');
  return `<h4>햇빛</h4>${rows}<p class="hint">고도는 월·시간에서 계산하고, 방위각은 직접 정합니다.</p>`;
}
