// 옵션 바 한 줄(아키텍처 §12.1). 캔버스 위에 떠 있던 팝업이 캔버스 상단의 "행"이 되면서
// 라벨을 짧게(두께 → W, 단면 → W·H·Z) 줄였고, 긴 이름은 title 속성으로 남긴다.
// shell.js가 300줄을 넘지 않게 그리기·읽기 규칙을 여기로 나눴다(아키텍처 §9).
import { esc } from '../util/html.js';
import { fmtLen } from '../util/units.js';
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
// h는 **덕트 단면 높이와 기둥 높이**가 같은 이름을 쓰므로 둘을 덮는 상한(층고 8000)을 준다 —
// 더 좁은 쪽(덕트 3000)은 상태 계층(normalizeDuct)이 클램프한다. 여기 값은 화살표·검증의 편의다.
export const OPTION_RANGE = { thickness: [2, 1000], w: [50, 3000], d: [50, 3000], h: [50, 8000], z: [0, 8000], sill: [0, 3000] };

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
      // 범위는 OPTION_RANGE 한 곳이다(M-1). data-mm은 이 칸을 그릴 때의 값이다(§16.1): ft·in 표기는
      // 파싱과 왕복하지 않으므로 readLen이 "고치지 않았다"를 이 값으로 판정한다(리뷰 I-3).
      const [min, max] = OPTION_RANGE[k] ?? [];
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
export function applyOptionInput(tool, el, units = 'mm') {
  const k = el?.name;
  if (!tool?.opts || !k || !(k in tool.opts)) return false;
  // 범위는 OPTION_RANGE 한 곳이다(M-1): 타이핑한 값도 화살표와 같은 한계를 지킨다.
  const clamp = v => { const [min, max] = OPTION_RANGE[k] ?? []; return min === undefined || !Number.isFinite(v) ? v : Math.min(max, Math.max(min, v)); };
  if (el.dataset?.len) {
    // 속성 패널의 길이 칸과 같은 함수로 읽는다: "글자를 고치지 않았다"(data-mm의 표시값과 같다)를
    // 한 곳에서만 판정하려고 readLen을 쓴다(리뷰 I-3 — ft·in 무편집 [Enter]가 값을 밀던 자리).
    const mm = readLen(el, units);
    if (mm === null) { el.value = fmtLen(tool.opts[k], 'ftin'); return false; }
    const next = clamp(mm);
    if (next === tool.opts[k]) return false;
    tool.opts[k] = next;
    return true;
  }
  const raw = el.type === 'checkbox' ? el.checked : el.type === 'number' ? Number(el.value) : el.value;
  const next = el.type === 'number' ? clamp(raw) : raw;
  if (next === tool.opts[k]) return false;
  tool.opts[k] = next;
  return true;
}

// 치수 칸 한 덩어리. 값은 도구가 이미 단위에 맞춰 문자열로 준다(tool.dims().fields[].text).
export function dimBarHtml(tool, { units = 'mm' } = {}) {
  const fields = tool?.dims?.()?.fields ?? [];
  if (!fields.length) return '';
  return fields.map(f => {
    const label = `${DIM_LABELS[f.key] ?? f.key} (${unitLabel(units)})`;
    const title = DIM_TITLES[f.key] ? ` title="${esc(DIM_TITLES[f.key])}"` : '';
    const input = units === 'ftin'
      ? `<input type="text" name="dim:${f.key}" data-len="1" data-step="${STEP.ftin}" value="${esc(f.text)}">`
      : `<input type="number" name="dim:${f.key}" step="${STEP.mm}" value="${esc(f.text)}">`;
    return `<label class="dim${f.active ? ' on' : ''}"${title}>${label} ${input}</label>`;
  }).join('');
}

// **칸 목록**의 서명이다(값은 넣지 않는다): 이것이 같으면 DOM을 다시 만들지 않는다.
export const dimBarSignature = tool => (tool?.dims?.()?.fields ?? []).map(f => f.key).join(',');

// #optionDims를 도구 상태에 맞춘다. 칸 목록이 그대로면 **포커스가 없는 칸의 값만** 고친다:
// 타이핑 중인 칸을 다시 만들면 커서가 튀고 조합 중인 글자가 사라진다.
export function syncDimBar(root, tool, { units = 'mm' } = {}) {
  const host = root?.querySelector?.('#optionDims');
  if (!host) return false;
  const sig = dimBarSignature(tool);
  if (host.dataset.sig !== sig) { host.dataset.sig = sig; host.innerHTML = dimBarHtml(tool, { units }); }
  for (const f of tool?.dims?.()?.fields ?? []) {
    const el = host.querySelector(`[name="dim:${f.key}"]`);
    if (!el) continue;
    el.parentElement?.classList.toggle('on', !!f.active);
    if (el === host.ownerDocument?.activeElement) continue;
    if (el.value !== f.text) el.value = f.text;
  }
  return true;
}
