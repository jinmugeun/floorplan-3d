// 마감재 편집기의 영역 행(§15.11). 열 제목이 없어 여섯 숫자 칸이 이름 없이 나란히 놓였고
// (감사 §13) 값이 칸 폭에 잘렸다. 행 렌더를 여기로 빼 편집기가 300줄 규칙 안에 남는다.
// 좌표의 뜻: u = 벽 왼쪽 끝(a)에서의 거리(mm), z = 바닥에서의 높이(mm).
import { MATERIALS, materialById } from '../materials/catalog.js';
import { MAT_RANGE } from '../state/schema.js';
import { esc } from '../util/html.js';

// 화면 제목은 좁으니 짧게(시작 u · 끝 u …), 숫자 칸의 접근 가능한 이름은 풀어서 쓴다.
export const REGION_COLUMNS = [
  ['kind', '종류'], ['u0', '시작 u'], ['u1', '끝 u'], ['z0', '아래 z'], ['z1', '위 z'],
  ['scaleW', '타일 W'], ['scaleH', 'H'], ['mat', '재질'], ['del', ''],
];
export const CELL_LABELS = { u0: '가로 시작', u1: '가로 끝', z0: '높이 시작', z1: '높이 끝', scaleW: '타일 너비', scaleH: '타일 높이' };
// 타일 크기 기본값은 마감재 패널과 같은 300이다(§15.11 — 편집기만 1000이어서 같은 재질이 두
// 곳에서 다른 크기로 반복됐다: 감사 §14). 새 영역 행이 이 값을 mat.scale로 싣고 열린다
// (materialEditor.js의 newRow) — 카탈로그 재질 44개가 모두 자기 scale을 갖고 있어서
// 아래 세 번째 항만으로는 기본값이 되지 못했다(최종 리뷰 Minor 1).
export const DEFAULT_TILE_SCALE = [300, 300];
// 행이 덮어쓴 값 → 그 재질의 기본 scale → 300(카탈로그에 없는 id의 마지막 안전망).
export const scaleOf = r => r?.mat?.scale ?? materialById(r?.mat?.id)?.scale ?? DEFAULT_TILE_SCALE;

const numCell = (name, value, min, max) =>
  `<input type="number" name="${name}" value="${value}" min="${min}" max="${max}" step="any" aria-label="${CELL_LABELS[name] ?? name}">`;
const matOptions = id => MATERIALS.map(m => `<option value="${m.id}" ${m.id === id ? 'selected' : ''}>${esc(`${m.category} · ${m.name}`)}</option>`).join('');

export const regionHeadHtml = () =>
  `<div class="region-head">${REGION_COLUMNS.map(([k, l]) => `<span data-col="${k}">${esc(l)}</span>`).join('')}</div>`;

export function regionRowHtml(r, i, { len = 0, height = 0 } = {}) {
  const lenR = Math.round(len), hR = Math.round(height);
  const [sw, sh] = scaleOf(r);
  return `<div class="region-row" data-region="${i}">
      <select name="kind" aria-label="종류"><option value="band" ${r.kind === 'band' ? 'selected' : ''}>수평 띠</option><option value="rect" ${r.kind === 'rect' ? 'selected' : ''}>사각형</option></select>
      ${numCell('u0', r.u0, 0, lenR)}${numCell('u1', r.u1, 0, lenR)}
      ${numCell('z0', r.z0, 0, hR)}${numCell('z1', r.z1, 0, hR)}
      ${numCell('scaleW', sw, MAT_RANGE.scale[0], MAT_RANGE.scale[1])}${numCell('scaleH', sh, MAT_RANGE.scale[0], MAT_RANGE.scale[1])}
      <select name="mat" aria-label="재질">${matOptions(r.mat.id)}</select>
      <button type="button" name="del" aria-label="영역 삭제">삭제</button>
    </div>`;
}

export function regionRowsHtml(rows, ctx = {}) {
  if (!rows?.length) return '<p class="hint">영역이 없습니다. 수평 띠나 사각형을 추가하세요.</p>';
  return regionHeadHtml() + rows.map((r, i) => regionRowHtml(r, i, ctx)).join('');
}
