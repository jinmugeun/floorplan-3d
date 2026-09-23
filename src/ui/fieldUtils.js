// 속성 패널·옵션 바가 함께 쓰는 폼 도우미. propsPanel.js에서 그대로 옮겼다(300줄 규칙).
// 값은 언제나 mm 정수로 저장한다: 표시만 단위(mm / ft·in)에 따라 달라진다.
import { fmtLen, parseLen } from '../util/units.js';
import { esc } from '../util/html.js';
import { focusables } from './dialogBase.js';

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
// HTML의 step 격자는 min을 기준점(step base)으로 삼는다 → min이 step의 배수가 아닌 칸(두께
// min 2 · step 10)에서는 유효 격자가 2·12·…·202가 되어 200에서 화살표 한 번이 202를 만들고
// 값이 :invalid가 됐다. 그런 칸만 min을 data-min으로 옮긴다: 기준점이 value로 내려가 화살표가
// 정확히 한 step씩 움직이고(200 → 210, 3000 → 3010, min 2에 있을 때는 2 → 12 → 22),
// 범위 클램프는 numValue가 data-min을 읽어 그대로 해 준다.
const onStepGrid = (min, step) => !Number.isFinite(min) || !Number.isFinite(step) || step <= 0 || Math.abs(min / step - Math.round(min / step)) < 1e-9;
export const minAttr = (min, step) => (onStepGrid(Number(min), Number(step)) ? `min="${min}"` : `data-min="${min}"`);
export const num = (name, value, min, max, step = 1, ro = false) => `<input type="number" name="${name}" value="${Number(value) || 0}" ${minAttr(min, step)} max="${max}" step="${step}" ${ro ? 'readonly' : ''}>`;
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
  // min은 HTML 속성이 먼저고, 격자 때문에 data-min으로 옮긴 칸은 그쪽을 읽는다(minAttr 참고).
  const minRaw = el.min !== '' ? el.min : el.dataset.min ?? '';
  const min = minRaw === '' ? -Infinity : Number(minRaw), max = el.max === '' ? Infinity : Number(el.max);
  const out = Math.min(max, Math.max(min, v));
  if (out !== v && onClamp) onClamp(out, { min, max, raw: v });
  return out;
}
// 길이 입력은 단위에 따라 모양이 달라진다: mm는 숫자 입력, ft·in은 텍스트 입력(12' 6").
// 저장 값은 언제나 mm 정수다. step은 mm 숫자 입력의 화살표 간격이다(기본은 STEP.mm = 10).
export function lenField(label, name, mm, min, max, ro = false, units = 'mm', step = STEP.mm) {
  if (units !== 'ftin') return field(label, num(name, mm, min, max, step, ro));
  // ft·in 칸의 간격은 data-step(인치)에 싣는다: 텍스트 입력이라 step 속성이 뜻이 없다.
  // data-mm은 이 칸을 그릴 때의 모델 값이다: ft·in 표기는 파싱과 왕복하지 않으므로(아래 readLen)
  // "글자를 고쳤는가"를 표시값으로 판정할 기준이 필요하다(§16.1).
  return field(label, `<input type="text" name="${name}" data-len="1" data-step="${STEP.ftin}" data-min="${min}" data-max="${max}" data-mm="${mm}" value="${esc(fmtLen(mm, 'ftin'))}" ${ro ? 'readonly' : ''}>`);
}
export function readLen(el, units, { onClamp = null } = {}) {
  // 글자가 그려질 때의 표시값과 같으면 "고치지 않았다"로 보고 저장된 mm를 그대로 돌려준다(§16.1).
  // ft·in 표기는 파싱과 왕복하지 않는다: fmtLen(200,'ftin') = 7.9" → parseLen → 200.66 → 201.
  // 그래서 아무것도 고치지 않고 [Enter]만 눌러도 값이 1 mm씩 밀리고 빈 undo 단계가 쌓였다
  // (리뷰 I-3). 현재 값을 돌려주면 부르는 쪽의 "같은 값" 가드가 그대로 걸러 낸다.
  const stored = el?.dataset?.mm;
  if (stored !== undefined && stored !== '' && el.value === fmtLen(Number(stored), units)) return Number(stored);
  const v = parseLen(el.value, units);
  if (v === null) return null;
  const min = Number(el.dataset.min ?? -Infinity), max = Number(el.dataset.max ?? Infinity);
  // mm 정수로만 반올림한다. 1/8"(3.175 mm) 격자로 스냅해 봤지만 표기가 0.1" 해상도라
  // 격자와 어긋나 왕복 오차가 오히려 커졌다(1 mm → 최대 2 mm): 103 mm가 105로, 109 mm가
  // 108로 움직였다. 1/8"는 화살표 간격의 뜻으로만 data-step에 남는다(§15.9).
  const rounded = Math.round(v);
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
// 검색 칸(type="search")은 타이핑마다 목록을 걸러 낸다 → 글자만 되돌리면 빈 검색창 + 걸러진
// 목록으로 어긋난다. 되돌린 값으로 input을 한 번 쏘아 필터도 같이 맞춘다(기준값이 없으면
// 관례대로 검색을 지운다). input은 필터만 갱신하고 스토어·undo에는 닿지 않는다.
export function revertField(el) {
  if (!isTextField(el)) return false;
  const live = el.type === 'search';
  if (initial.has(el)) el.value = initial.get(el);
  else if (live) el.value = '';
  if (live) el.dispatchEvent(new Event('input', { bubbles: true }));
  el.blur?.();
  return true;
}
// [Enter]: 지금 값을 확정(change)하고 blur한다. 다음 [Esc]의 기준값도 지금 값이 된다.
// 표시(dataset.committed)는 합성 change를 **쏜 뒤에** 남긴다(§16.1): 먼저 남기면 합성 change
// 자신이 "중복"으로 삼켜져 확정이 아예 일어나지 않는다. dispatchEvent는 동기이므로 이 순서가
// 곧 "합성 change 1회 → 표시 → blur의 네이티브 change는 무시"가 된다(감사 §41).
export function commitField(el) {
  if (!isTextField(el)) return false;
  initial.set(el, el.value);
  el.dispatchEvent(new Event('change', { bubbles: true }));
  if (el.dataset) el.dataset.committed = el.value;
  el.blur?.();
  return true;
}
// 캔버스처럼 포커스를 받지 못하는 곳을 누르는 순간, root 안에서 타이핑하던 칸을 확정한다
// (Task 3 재리뷰 N-1): 그 클릭이 선택을 먼저 비우면 브라우저가 mousedown에서 뒤늦게 내는 change가
// 빈 선택에 닿아 값이 사라졌다. 누르기 전에 확정하면 아직 살아 있는 선택에 적용된다.
export const commitFocusedIn = (root, doc = root?.ownerDocument) => (!!root && !!doc?.activeElement && root.contains(doc.activeElement) && commitField(doc.activeElement));

// 지금 처리하려는 change가 commitField 직후의 "같은 값" 네이티브 change인가(§16.1).
// 한 번만 true다: 표시를 지우고 돌려주므로 그다음 같은 값의 change는 정상 처리된다(사용자가
// 값을 되돌려 놓고 다시 확정하는 경우를 막지 않는다).
export function isDuplicateCommit(el) {
  if (el?.dataset?.committed === undefined) return false;
  const dup = el.dataset.committed === el.value;
  delete el.dataset.committed;
  return dup;
}
// 포커스가 들어올 때의 값을 기억한다(셸이 앱 전체에 한 번 건다 — 패널을 다시 그려도 새 노드가
// 포커스를 받는 순간 기준값이 생긴다).
export function trackFields(root) {
  const on = ev => rememberFieldValue(ev.target);
  root.addEventListener('focusin', on);
  return { destroy() { root.removeEventListener('focusin', on); } };
}

// [Tab]·blur 확정 뒤에 포커스를 둘 다음 칸의 **이름**(§17.6(4)). 이름이 없는 버튼과 포커스를
// 받을 수 없는 요소는 건너뛴다. el이 이미 DOM에서 떨어졌으면(재렌더 뒤) 같은 name의 새 노드를
// 기준으로 삼는다 — 속성 패널은 innerHTML을 통째로 갈아 치우므로 두 순간이 모두 필요하다.
// back이면 **앞** 칸을 준다(Task 3 재리뷰 N-2): [Shift+Tab]으로 확정해도 포커스가 앞이 아니라
// 뒤로 갔다 — 브라우저의 [Shift+Tab]은 앞으로 가는데 확정 복구 장치만 늘 뒤를 가리켰기 때문이다.
export function nextFocusName(root, el, back = false) {
  // 닫힌 <details> 안의 칸은 브라우저가 탭 순서에서 빼고 focus()도 무동작이다(리뷰 M-1):
  // 그 이름을 돌려주면 포커스가 <body>에 남아 §30이 고치려던 자리로 되돌아간다.
  const list = focusables(root).filter(x => !x.closest?.('details:not([open])'));
  let at = list.indexOf(el);
  if (at < 0 && el?.name) at = list.findIndex(x => x.name === el.name);
  if (at < 0) return null;
  const step = back ? -1 : 1;
  for (let i = at + step; i >= 0 && i < list.length; i += step) if (list[i].name) return list[i].name;
  return null;
}

// change 하나만으로는 "[Tab]으로 확정"과 "포커스를 받을 수 없는 곳(캔버스)을 클릭해 확정"이
// 구분되지 않는다 — 실측상 둘 다 change 순간의 activeElement가 <body>다(리뷰 C-2). 실제 [Tab]
// 키를 캡처로 받아 같은 태스크 동안만 참으로 둔다: 키 하나가 확정 하나를 연다(take()가 곧 비운다).
// 방향도 함께 적는다(재리뷰 N-2): [Shift+Tab]은 앞 칸으로 돌아가는 확정이다. back()은 take()가
// 지우지 않는다 — 부르는 쪽이 "탭이었다"를 먼저 묻고 그다음 방향을 묻기 때문이다.
export function tabWatcher(root) {
  let on = false, back = false;
  const down = ev => { if (ev.key === 'Tab') { on = true; back = !!ev.shiftKey; setTimeout(() => { on = false; }, 0); } };
  root.addEventListener('keydown', down, true);
  return {
    take() { const was = on; on = false; return was; },
    back: () => back,
    destroy() { root.removeEventListener('keydown', down, true); },
  };
}
