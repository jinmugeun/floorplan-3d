// 속성 패널·옵션 바가 함께 쓰는 폼 도우미. propsPanel.js에서 그대로 옮겼다(300줄 규칙).
// 값은 언제나 mm 정수로 저장한다: 표시만 단위(mm / ft·in)에 따라 달라진다.
import { fmtLen, parseLen } from '../util/units.js';
import { esc } from '../util/html.js';

export const field = (label, inner) => `<label class="field"><span>${label}</span>${inner}</label>`;
export const num = (name, value, min, max, step = 1, ro = false) => `<input type="number" name="${name}" value="${Number(value) || 0}" min="${min}" max="${max}" step="${step}" ${ro ? 'readonly' : ''}>`;
// 숫자 입력: 비어 있거나 숫자가 아니면 null, 범위를 벗어나면 min/max로 잘라 준다.
// 잘랐을 때 onClamp(잘린 값, { min, max, raw })를 부른다 — 조용히 바뀌던 값을 부르는 쪽이 알린다(§14.10).
export function numValue(el, { onClamp = null } = {}) {
  if (el.value.trim() === '') return null;
  const v = Number(el.value); if (Number.isNaN(v)) return null;
  const min = el.min === '' ? -Infinity : Number(el.min), max = el.max === '' ? Infinity : Number(el.max);
  const out = Math.min(max, Math.max(min, v));
  if (out !== v && onClamp) onClamp(out, { min, max, raw: v });
  return out;
}
// 길이 입력은 단위에 따라 모양이 달라진다: mm는 숫자 입력, ft·in은 텍스트 입력(12' 6").
// 저장 값은 언제나 mm 정수다. step은 mm 숫자 입력의 화살표 간격이다(층 높이·바닥 기준 높이·방 높이는 10을 쓴다).
export function lenField(label, name, mm, min, max, ro = false, units = 'mm', step = 1) {
  if (units !== 'ftin') return field(label, num(name, mm, min, max, step, ro));
  return field(label, `<input type="text" name="${name}" data-len="1" data-min="${min}" data-max="${max}" value="${esc(fmtLen(mm, 'ftin'))}" ${ro ? 'readonly' : ''}>`);
}
export function readLen(el, units, { onClamp = null } = {}) {
  const v = parseLen(el.value, units);
  if (v === null) return null;
  const min = Number(el.dataset.min ?? -Infinity), max = Number(el.dataset.max ?? Infinity);
  const rounded = Math.round(v);
  const out = Math.min(max, Math.max(min, rounded));
  if (out !== rounded && onClamp) onClamp(out, { min, max, raw: v });
  return out;
}
// 치수 단위 표시가 꺼져 있으면 라벨에 단위를 쓰지 않는다: "벽 높이" / "벽 높이 (mm)"
export const withUnit = (label, units, showUnit) => (showUnit ? `${label} (${units === 'ftin' ? 'ft·in' : 'mm'})` : label);
export const colorField = (label, name, value) => field(label, `<input type="color" name="${name}" value="${esc(value)}">`);
