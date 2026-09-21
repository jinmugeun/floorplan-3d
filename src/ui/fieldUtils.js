// 속성 패널·옵션 바가 함께 쓰는 폼 도우미. propsPanel.js에서 그대로 옮겼다(300줄 규칙).
// 값은 언제나 mm 정수로 저장한다: 표시만 단위(mm / ft·in)에 따라 달라진다.
import { fmtLen, parseLen } from '../util/units.js';
import { esc } from '../util/html.js';

export const field = (label, inner) => `<label class="field"><span>${label}</span>${inner}</label>`;
// 단위별 숫자 간격(§15.9). mm 칸은 10 mm, ft·in 칸은 1/8 인치다 — 도면 치수를 1 mm 단위로
// 올리고 내릴 이유가 없고(화살표를 40번 눌러야 1 cm였다), ft·in은 1/8"이 목공·건축의 관례다.
export const INCH_MM = 25.4;
export const STEP = { mm: 10, ftin: 1 / 8 };
export const stepMm = (units = 'mm') => (units === 'ftin' ? STEP.ftin * INCH_MM : STEP.mm);
// step이 유한하고 0보다 크면 그 배수로 반올림한다(아니면 값을 그대로 돌려준다).
// 배수를 곱한 결과에도 먼지가 남는다(14 * 0.05 === 0.7000000000000001) — 유효숫자 15자리로
// 한 번 더 다듬어 "0.7을 넣으면 0.7이 저장된다"를 지킨다(감사 §21). 도면 값은 mm 1e6 안이라
// 15자리에서 잃을 자리가 없다.
export const roundToStep = (v, step) => (Number.isFinite(step) && step > 0 ? Number((Math.round(v / step) * step).toPrecision(15)) : v);
export const num = (name, value, min, max, step = 1, ro = false) => `<input type="number" name="${name}" value="${Number(value) || 0}" min="${min}" max="${max}" step="${step}" ${ro ? 'readonly' : ''}>`;
// 숫자 입력: 비어 있거나 숫자가 아니면 null, 범위를 벗어나면 min/max로 잘라 준다.
// 잘랐을 때 onClamp(잘린 값, { min, max, raw })를 부른다 — 조용히 바뀌던 값을 부르는 쪽이 알린다(§14.10).
export function numValue(el, { onClamp = null } = {}) {
  if (el.value.trim() === '') return null;
  const typed = Number(el.value); if (Number.isNaN(typed)) return null;
  // step이 **1보다 작으면**(면풍속 0.05 등) 그 배수로 반올림한다: 0.7 → 1.05를 눌러 올린 값이
  // 1.0499999999999998로 저장되고 CMH까지 그 값으로 계산됐다(감사 §21). 정수 step(길이 칸의 10)은
  // 화살표 간격일 뿐이므로 타이핑한 값을 건드리지 않는다 — 위치 1234.5를 1235로 옮기면 안 된다.
  const step = Number(el.step);
  const v = Number.isFinite(step) && step > 0 && step < 1 ? roundToStep(typed, step) : typed;
  const min = el.min === '' ? -Infinity : Number(el.min), max = el.max === '' ? Infinity : Number(el.max);
  const out = Math.min(max, Math.max(min, v));
  if (out !== v && onClamp) onClamp(out, { min, max, raw: v });
  return out;
}
// 길이 입력은 단위에 따라 모양이 달라진다: mm는 숫자 입력, ft·in은 텍스트 입력(12' 6").
// 저장 값은 언제나 mm 정수다. step은 mm 숫자 입력의 화살표 간격이다(기본은 STEP.mm = 10).
export function lenField(label, name, mm, min, max, ro = false, units = 'mm', step = STEP.mm) {
  if (units !== 'ftin') return field(label, num(name, mm, min, max, step, ro));
  // ft·in 칸의 간격은 data-step(인치)에 싣는다: 텍스트 입력이라 step 속성이 뜻이 없다.
  return field(label, `<input type="text" name="${name}" data-len="1" data-step="${STEP.ftin}" data-min="${min}" data-max="${max}" value="${esc(fmtLen(mm, 'ftin'))}" ${ro ? 'readonly' : ''}>`);
}
export function readLen(el, units, { onClamp = null } = {}) {
  const v = parseLen(el.value, units);
  if (v === null) return null;
  const min = Number(el.dataset.min ?? -Infinity), max = Number(el.dataset.max ?? Infinity);
  // ft·in 칸은 1/8 인치(3.175 mm) 배수로 맞춘 뒤 mm 정수로 반올림한다(§15.9): 화면 표기는
  // 0.1" 단위라 차이가 보이지 않고, 같은 값을 넣었다 뺐을 때 1 mm씩 흐르지 않는다.
  const snapIn = Number(el.dataset.step);
  const snapped = Number.isFinite(snapIn) && snapIn > 0 ? roundToStep(v, snapIn * INCH_MM) : v;
  const rounded = Math.round(snapped);
  const out = Math.min(max, Math.max(min, rounded));
  if (out !== rounded && onClamp) onClamp(out, { min, max, raw: v });
  return out;
}
// 치수 단위 표시가 꺼져 있으면 라벨에 단위를 쓰지 않는다: "벽 높이" / "벽 높이 (mm)"
export const withUnit = (label, units, showUnit) => (showUnit ? `${label} (${units === 'ftin' ? 'ft·in' : 'mm'})` : label);
export const colorField = (label, name, value) => field(label, `<input type="color" name="${name}" value="${esc(value)}">`);

// 입력 중의 [Esc]·[Enter](§15.9 · 감사 §5). keymap의 INPUT 가드가 이 둘만 통과시킨다.
// 대상은 글자를 치는 칸뿐이다: 체크박스·색·슬라이더는 되돌릴 "타이핑"이 없다.
const initial = new WeakMap();
export const isTextField = el => el?.tagName === 'INPUT' && ['number', 'text', 'search'].includes(el.type);
export const rememberFieldValue = el => { if (isTextField(el)) initial.set(el, el.value); };
// [Esc]: 포커스 시점 값으로 되돌리고 blur한다. change는 내지 않는다 — 되돌리기는 "없던 일"이고,
// change를 내면 계획 6의 클램프 토스트가 되돌린 값에 대해 한 번 더 뜬다.
export function revertField(el) {
  if (!isTextField(el)) return false;
  if (initial.has(el)) el.value = initial.get(el);
  el.blur?.();
  return true;
}
// [Enter]: 지금 값을 확정(change)하고 blur한다. 다음 [Esc]의 기준값도 지금 값이 된다.
export function commitField(el) {
  if (!isTextField(el)) return false;
  initial.set(el, el.value);
  el.dispatchEvent(new Event('change', { bubbles: true }));
  el.blur?.();
  return true;
}
// 포커스가 들어올 때의 값을 기억한다(셸이 앱 전체에 한 번 건다 — 패널을 다시 그려도 새 노드가
// 포커스를 받는 순간 기준값이 생긴다).
export function trackFields(root) {
  const on = ev => rememberFieldValue(ev.target);
  root.addEventListener('focusin', on);
  return { destroy() { root.removeEventListener('focusin', on); } };
}
