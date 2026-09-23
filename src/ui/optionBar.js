// 옵션 바 한 줄(아키텍처 §12.1). 캔버스 위에 떠 있던 팝업이 캔버스 상단의 "행"이 되면서
// 라벨을 짧게(두께 → W, 단면 → W·H·Z) 줄였고, 긴 이름은 title 속성으로 남긴다.
// shell.js가 300줄을 넘지 않게 그리기·읽기 규칙을 여기로 나눴다(아키텍처 §9).
import { esc } from '../util/html.js';
import { fmtLen } from '../util/units.js';
import { DUCT_RANGE } from '../state/ductSchema.js';
import { readLen, STEP, minAttr } from './fieldUtils.js';

// 옵션 바에 찍는 짧은 라벨. 한 줄에 다 들어가야 한다(도구가 옵션 여섯 개를 낼 수 있다).
export const OPTION_LABELS = {
  reference: '기준선', thickness: 'W', snap: '스냅', ortho: '직교', direction: '방향',
  kind: '종류', w: 'W', d: 'D', h: 'H', z: 'Z', sill: '바닥에서', system: '계통',
};
// 같은 옵션의 긴 이름(마우스를 올리면 보인다). 짧은 라벨만으로는 무엇인지 모를 수 있다.
export const OPTION_TITLES = {
  reference: '기준선', thickness: '벽 두께', snap: '스냅 모드', ortho: '직교 모드', direction: '방향',
  kind: '급기/배기', w: '단면 너비', d: '기둥 깊이', h: '단면 높이', z: '중심 높이', sill: '바닥에서 개구부 밑선까지', system: '계통',
};
// 길이 옵션은 라벨에 현재 단위를 붙이고, ft·in 모드에서는 속성 패널과 같은 텍스트 입력이 된다.
export const LEN_OPTS = new Set(['thickness', 'w', 'd', 'h', 'z', 'sill']);
export const unitLabel = units => (units === 'ftin' ? 'ft·in' : 'mm');

// 옵션 숫자 칸의 범위(계획 7 이월 M-1 · §16.7). step은 단위 규칙(mm 10 · ft·in 1/8")을 그대로 쓴다.
// 벽·방·구조물의 공통 범위다: h는 기둥 높이(층고 8000)를 덮는다.
export const OPTION_RANGE = { thickness: [2, 1000], w: [50, 3000], d: [50, 3000], h: [50, 8000], z: [0, 8000], sill: [0, 3000] };
// 범위는 **도구별**로 본다(리뷰 I-7): 키 하나에 범위 하나로는 풀리지 않는다 — 덕트 단면 h는 3000이
// 한계인데(normalizeDuct가 모든 덕트 쓰기에서 클램프한다) 기둥 h는 층고까지 간다. 옵션 바가 8000을
// 약속하면 타이핑한 5000이 검증도 안내도 통과했다가 상태 계층에서 조용히 3000으로 줄었다.
// 덕트 숫자는 상태 계층의 DUCT_RANGE를 그대로 import한다(ductPanel과 같은 방향): 표를 복제하지 않는다.
const TOOL_RANGE = { duct: { w: DUCT_RANGE.w, h: DUCT_RANGE.h, z: DUCT_RANGE.z } };
export const rangeOf = (tool, k) => TOOL_RANGE[tool?.name]?.[k] ?? OPTION_RANGE[k] ?? [];

// 그리는 동안 뜨는 치수 칸(§16.7 · 감사 §43). 예전에는 캔버스 위 11 px 라벨 `3000|`뿐이라
// "타이핑할 수 있다"는 사실 자체가 보이지 않았다.
export const DIM_LABELS = { len: '길이', w: 'W', h: 'H', pos: '좌표' };
export const DIM_TITLES = { len: '그리는 선의 길이', w: '방 너비', h: '방 높이', pos: '보조선 좌표' };

const REF = [['center', '중심선'], ['inner', '내벽선'], ['outer', '외벽선']];
const KIND = [['supply', '급기'], ['exhaust', '배기']];
const DIR = [['v', '세로'], ['h', '가로']];
const select = (k, list, v) => `<select name="${k}">${list.map(([val, l]) => `<option value="${val}"${v === val ? ' selected' : ''}>${l}</option>`).join('')}</select>`;

// 도구의 opts를 한 줄 HTML로. 안내 문구(hint)는 배너가 맡으므로 여기서는 그리지 않는다.
export function optionBarHtml(tool, { units = 'mm' } = {}) {
  const opts = tool?.opts;
  if (!opts || !Object.keys(opts).length) return '';
  return Object.entries(opts).map(([k, v]) => {
    const label = `${OPTION_LABELS[k] ?? k}${LEN_OPTS.has(k) ? ` (${unitLabel(units)})` : ''}`;
    const title = OPTION_TITLES[k] ? ` title="${esc(OPTION_TITLES[k])}"` : '';
    if (typeof v === 'boolean') return `<label${title}><input type="checkbox" name="${k}"${v ? ' checked' : ''}> ${label}</label>`;
    if (typeof v === 'number') {
      // 범위는 rangeOf 한 곳이다(M-1 · I-7: 도구를 함께 본다). data-mm은 이 칸을 그릴 때의 값이다(§16.1):
      // ft·in 표기는 파싱과 왕복하지 않으므로 readLen이 "고치지 않았다"를 이 값으로 판정한다(리뷰 I-3).
      const [min, max] = rangeOf(tool, k);
      // ft·in 길이 칸은 텍스트다(step 속성이 뜻이 없다): 간격·범위는 data-*에 싣는다(속성 패널과 같은 규칙).
      if (LEN_OPTS.has(k) && units === 'ftin') return `<label${title}>${label} <input type="text" name="${k}" data-len="1" data-step="${STEP.ftin}"${min === undefined ? '' : ` data-min="${min}" data-max="${max}"`} data-mm="${v}" value="${esc(fmtLen(v, 'ftin'))}"></label>`;
      const range = min === undefined ? '' : ` ${minAttr(min, STEP.mm)} max="${max}"`;
      return `<label${title}>${label} <input type="number" name="${k}" value="${v}" step="${STEP.mm}"${range}></label>`;
    }
    if (k === 'reference') return `<label${title}>${label} ${select(k, REF, v)}</label>`;
    if (k === 'kind') return `<label${title}>${label} ${select(k, KIND, v)}</label>`;
    if (k === 'direction') return `<label${title}>${label} ${select(k, DIR, v)}</label>`;
    return `<label${title}>${label} <input type="text" name="${k}" value="${esc(String(v))}"></label>`;
  }).join('');
}

// 입력 한 칸을 tool.opts에 반영한다. 반영했으면 true.
// ft·in 텍스트는 mm로 되돌려 저장하고, 읽을 수 없는 입력은 값을 바꾸지 않고 입력란을 현재 값으로 되돌린다.
// §16.1: 값이 지금과 같으면 아무것도 하지 않고 false를 돌려준다. 옵션 바는 스토어를 건드리지
// 않으므로 undo 단계는 애초에 없지만, [Enter] 확정의 합성 change + blur의 네이티브 change가
// 같은 경로를 두 번 돌던 자리다(shell.js의 keydown 주석이 "멱등하므로 결과는 같다"고 적어 둔
// 자리를 계약으로 바꾼다 — 치수 칸(Task 8)이 여기에 얹히면 멱등성만으로는 부족하다).
// onClamp(잘린 값, { min, max, raw }): 범위로 잘렸을 때 부르는 쪽이 알린다(§14.10 — 속성 패널의
// numValue/readLen과 같은 계약이다). 잘렸으면 표시도 함께 되돌린다(리뷰 I-1): 옵션 바는 도구가
// 바뀔 때까지 다시 그려지지 않으므로, 고치지 않으면 칸의 글자가 모델과 영구히 어긋난 채 남았다.
export function applyOptionInput(tool, el, units = 'mm', { onClamp = null } = {}) {
  const k = el?.name;
  if (!tool?.opts || !k || !(k in tool.opts)) return false;
  const [min, max] = rangeOf(tool, k);
  // 범위 밖이면 잘라 주고 알린다. 비유한수는 통과시키지 않고 부르는 쪽이 "변경 없음"으로 처리한다(M-3).
  const clamp = v => { const out = min === undefined ? v : Math.min(max, Math.max(min, v)); if (out !== v) onClamp?.(out, { min, max, raw: v }); return out; };
  if (el.dataset?.len) {
    // 속성 패널의 길이 칸과 같은 함수로 읽는다: "글자를 고치지 않았다"(data-mm의 표시값과 같다)를
    // 한 곳에서만 판정하려고 readLen을 쓴다(리뷰 I-3 — ft·in 무편집 [Enter]가 값을 밀던 자리).
    // readLen은 data-min/max로 이미 한 번 자른다 → 그 자름도 안내가 따라붙게 콜백을 넘긴다.
    let cut = false;
    const mm = readLen(el, units, { onClamp: (v, info) => { cut = true; onClamp?.(v, info); } });
    if (mm === null) { setLen(el, tool.opts[k], units); return false; }
    const next = cut ? mm : clamp(mm);
    if (next !== mm || cut) setLen(el, next, units);       // 잘린 값이 칸에 남지 않게(I-1)
    if (next === tool.opts[k]) return false;
    tool.opts[k] = next;
    return true;
  }
  if (el.type === 'number') {
    // 빈 칸·숫자가 아닌 입력은 값을 바꾸지 않고 칸을 모델 값으로 되돌린다(리뷰 I-2 — 속성 패널의
    // numValue가 null을 돌려주고 부르는 쪽이 다시 그리는 그 규칙이다). 예전에는 Number('') === 0이
    // min으로 잘려 벽 두께가 말없이 2 mm가 됐다.
    const raw = Number(String(el.value).trim());
    if (String(el.value).trim() === '' || !Number.isFinite(raw)) { el.value = String(tool.opts[k]); return false; }
    const next = clamp(raw);
    if (next !== raw) el.value = String(next);             // 잘린 값이 칸에 남지 않게(I-1)
    if (next === tool.opts[k]) return false;
    tool.opts[k] = next;
    return true;
  }
  const next = el.type === 'checkbox' ? el.checked : el.value;
  if (next === tool.opts[k]) return false;
  tool.opts[k] = next;
  return true;
}
// ft·in 길이 칸의 표시를 모델 값으로 되맞춘다(data-mm까지: 다음 "고치지 않았다" 판정의 기준값이다).
function setLen(el, mm, units) {
  el.value = fmtLen(mm, units);
  if (el.dataset) el.dataset.mm = String(mm);
}

// 치수 칸 한 덩어리. 값은 도구가 이미 단위에 맞춰 문자열로 준다(tool.dims().fields[].text) —
// 보조선 좌표까지 그렇다(리뷰 I-4: 라벨만 ft·in이고 값은 mm 정수였다). data-mm은 그릴 때의 모델
// 값이다: ft·in 표기는 파싱과 왕복하지 않으므로 "글자를 고쳤는가"의 기준이 된다(§16.1).
export const dimBarHtml = (tool, { units = 'mm' } = {}) => dimFieldsHtml(tool?.dims?.()?.fields ?? [], units);
function dimFieldsHtml(fields, units) {
  if (!fields.length) return '';
  return fields.map(f => {
    const label = `${DIM_LABELS[f.key] ?? f.key} (${unitLabel(units)})`;
    const title = DIM_TITLES[f.key] ? ` title="${esc(DIM_TITLES[f.key])}"` : '';
    const input = units === 'ftin'
      ? `<input type="text" name="dim:${f.key}" data-len="1" data-step="${STEP.ftin}" data-mm="${f.mm}" value="${esc(f.text)}">`
      : `<input type="number" name="dim:${f.key}" step="${STEP.mm}" value="${esc(f.text)}">`;
    return `<label class="dim${f.active ? ' on' : ''}"${title}>${label} ${input}</label>`;
  }).join('');
}

// **칸 목록**의 서명이다(값은 넣지 않는다): 이것이 같으면 DOM을 다시 만들지 않는다.
export const dimBarSignature = tool => (tool?.dims?.()?.fields ?? []).map(f => f.key).join(',');

// #optionDims를 도구 상태에 맞춘다. 칸 목록이 그대로면 값만 고친다: 칸을 다시 만들면 커서가
// 튀고 조합 중인 글자가 사라진다. 포커스가 있는 칸도 **사람이 치지 않았으면** 실측을 따라간다
// (리뷰 C-2): §17.8(1)이 그리는 내내 칸에 포커스를 주므로, 포커스를 건너뛰던 예전 규칙이면
// 배너가 가리키는 그 칸이 0으로 굳어 캔버스 라벨과 다른 수를 말한다. 지키는 것은 f.typed —
// 도구가 "이 칸에 글자를 쳤다"고 말한 칸뿐이다.
export function syncDimBar(root, tool, { units = 'mm' } = {}) {
  const host = root?.querySelector?.('#optionDims');
  if (!host) return false;
  // dims()는 그리는 동안 매 프레임 돈다(parseLen·객체 할당) → 한 번만 부르고 돌려 쓴다(M-1).
  const fields = tool?.dims?.()?.fields ?? [];
  const sig = fields.map(f => f.key).join(',');
  if (host.dataset.sig !== sig) { host.dataset.sig = sig; host.innerHTML = dimFieldsHtml(fields, units); }
  for (const f of fields) {
    const el = host.querySelector(`[name="dim:${f.key}"]`);
    if (!el) continue;
    el.parentElement?.classList.toggle('on', !!f.active);
    const focused = el === host.ownerDocument?.activeElement;
    if (focused && f.typed) continue;                      // 사람이 친 글자만 지킨다
    // 포커스 칸을 고칠 때는 선택도 되살린다(계획 8 리뷰 C-1): 그래야 이어 타이핑이 값을 덮어쓰고
    // 45003000 같은 이어 붙기가 다시 생기지 않는다.
    if (el.value !== f.text) { el.value = f.text; if (focused) el.select?.(); }
    // 값과 함께 기준값도 갱신한다(리뷰 M-11): data-mm의 유일한 의미는 "readLen이 *고치지 않았다*를
    // 판정하는 기준"인데, 그리기 때의 값 그대로 남아 마우스를 움직이는 동안 영구히 낡았다.
    // 지금은 읽는 곳이 없어 무해하지만, 누군가 치수 칸의 change를 applyOptionInput으로 흘리면
    // 낡은 기준값이 틀린 mm를 확정한다. lenField·optionBarHtml은 setLen이 이미 이렇게 한다.
    if (el.dataset.len) el.dataset.mm = String(f.mm);
  }
  return true;
}

// "직전 프레임에 확정할 값이 있었는가"의 기억. root(=옵션 바 노드)마다 따로 센다: 셸이 여러 개
// 떠 있는 테스트에서 래치가 섞이지 않게 한다. WeakMap이라 노드가 사라지면 함께 사라진다.
const dimReady = new WeakMap();

// 그리는 동안 치수 칸이 포커스를 갖는다(§17.8(1) · 감사 §57). 주는 순간은 하나다:
// **확정할 값이 처음 생긴 프레임**(= 칸의 실측이 0을 벗어난 첫 마우스 이동).
// 칸이 생긴 프레임(첫 점을 찍은 그 프레임)은 커서가 아직 마지막 점 위라 길이가 0이다 —
// 거기서 포커스를 주면 칸이 "0"인 채로 열리고, 그때 친 길이는 방향이 없어 확정되지 못한다(리뷰 C-1).
// 그리고 사람이 이미 어떤 입력 칸에 글자를 치고 있으면 훔치지 않는다.
// 다음 점을 클릭하면 셸이 blur하고(§17.8(2)) 그 뒤 프레임은 이 조건에 걸리지 않으므로
// 마우스를 움직이는 내내 포커스를 다시 가져가지 않는다.
export function autoFocusDim(root, tool, doc = document) {
  const host = root?.querySelector?.('#optionDims');
  if (!host) return false;
  const fields = tool?.dims?.()?.fields ?? [];
  // 0이 아니면 확정할 값이다(재리뷰 NEW-3): 벽·방의 mm는 길이(음수가 없다)지만 보조선의 mm는 **절대
  // 좌표**라 x = -500 자리에서는 mm > 0이 영영 참이 되지 않아 §17.8(1)이 일어나지 않았다.
  const ready = fields.some(f => f.mm !== 0);
  const before = dimReady.get(root) ?? false;
  dimReady.set(root, ready);
  if (!ready || before) return false;
  // 캔버스에 숫자를 치던 중이면 훔치지 않는다(재리뷰 NEW-2): 래치는 코너마다 다시 열리므로, 3을 치고
  // 마우스를 움직인 프레임에 포커스를 가져가며 el.select()가 버퍼를 통째로 고르면 다음 숫자가 이어
  // 붙지 않고 덮어쓴다("먼저 치고 나중에 방향" 흐름의 뒷부분이 깎인다).
  if (fields.some(f => f.typed)) return false;
  const active = doc?.activeElement;
  if (active && (active.tagName === 'INPUT' || active.tagName === 'SELECT' || active.tagName === 'TEXTAREA')) return false;
  const f = fields.find(x => x.active) ?? fields[0];
  const el = host.querySelector(`[name="dim:${f.key}"]`);
  if (!el) return false;
  el.focus();
  el.select?.();          // 첫 숫자가 기존 값을 덮어쓴다(이어 붙지 않게 — 리뷰 C-1과 같은 이유)
  return true;
}
