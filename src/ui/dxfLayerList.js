// 레이어 체크리스트 한 줄(§18.6). 이 배열의 원천은 io/dxf/classify.js의 layerStats다 —
// ui/는 io/를 import해도 된다(막힌 방향은 view2d/·view3d/·app/뿐이다).
import { ROLE_LABEL } from '../io/dxf/classify.js';
import { esc } from '../util/html.js';
import { DXF_BADGE_OFF, DXF_BADGE_HATCH } from './messages.js';

// ACI 기본 아홉 색만 표로 두고 나머지는 번호에서 색을 만든다(256색 표를 들고 다니지 않는다 —
// 이 점은 "어느 레이어인지"를 알아보는 표시이지 도면을 재현하는 색이 아니다).
const ACI = { 1: '#ff0000', 2: '#ffff00', 3: '#00ff00', 4: '#00ffff', 5: '#0000ff', 6: '#ff00ff', 7: '#000000', 8: '#808080', 9: '#c0c0c0' };
export const aciColor = n => {
  const i = Math.abs(Number(n) || 7);
  return ACI[i] ?? `hsl(${(i * 47) % 360} 55% 45%)`;
};

export function layerRowHtml(rowData, checked) {
  const badge = rowData.off ? DXF_BADGE_OFF : rowData.role === 'hatch' ? DXF_BADGE_HATCH : '';
  return `<label class="dxf-layer${rowData.off ? ' off' : ''}" title="${esc(rowData.name)}">`
    + `<input type="checkbox" name="layer" value="${esc(rowData.name)}"${checked ? ' checked' : ''}>`
    + `<i class="dot" style="background:${aciColor(rowData.color)}"></i>`
    + `<b>${esc(rowData.name)}</b>`
    + `<span class="muted">${rowData.segs}</span>`
    + `<span class="role">${esc(ROLE_LABEL[rowData.role] ?? ROLE_LABEL.other)}</span>`
    + (badge ? `<span class="badge">${esc(badge)}</span>` : '')
    + '</label>';
}
export const layerListHtml = (rows, checked) => rows.map(r => layerRowHtml(r, checked.has(r.name))).join('');

// [벽 후보만] = 자동 판정이 벽이라고 본 켜진 레이어. [전체] = 꺼지지 않은 레이어 전부.
// 꺼진 레이어는 [전체]에도 들어가지 않는다 — 실측에서 최상위 엔티티의 67 %가 거기에 있고,
// 그것을 켜면 모델스페이스가 844 m × 2,229 m로 벌어진다.
export const wallOnly = rows => new Set(rows.filter(r => r.role === 'wall' && !r.off && r.segs > 0).map(r => r.name));
export const allOn = rows => new Set(rows.filter(r => !r.off && (r.segs > 0 || r.arcs > 0)).map(r => r.name));
