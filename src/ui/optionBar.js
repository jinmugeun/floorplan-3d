// 옵션 바 한 줄(아키텍처 §12.1). 캔버스 위에 떠 있던 팝업이 캔버스 상단의 "행"이 되면서
// 라벨을 짧게(두께 → W, 단면 → W·H·Z) 줄였고, 긴 이름은 title 속성으로 남긴다.
// shell.js가 300줄을 넘지 않게 그리기·읽기 규칙을 여기로 나눴다(아키텍처 §9).
import { esc } from '../util/html.js';
import { fmtLen, parseLen } from '../util/units.js';

// 옵션 바에 찍는 짧은 라벨. 한 줄에 다 들어가야 한다(도구가 옵션 여섯 개를 낼 수 있다).
export const OPTION_LABELS = {
  reference: '기준선', thickness: 'W', snap: '스냅', ortho: '직교', direction: '방향',
  kind: '종류', w: 'W', h: 'H', z: 'Z', system: '계통',
};
// 같은 옵션의 긴 이름(마우스를 올리면 보인다). 짧은 라벨만으로는 무엇인지 모를 수 있다.
export const OPTION_TITLES = {
  reference: '기준선', thickness: '벽 두께', snap: '스냅 모드', ortho: '직교 모드', direction: '방향',
  kind: '급기/배기', w: '단면 너비', h: '단면 높이', z: '중심 높이', system: '계통',
};
// 길이 옵션은 라벨에 현재 단위를 붙이고, ft·in 모드에서는 속성 패널과 같은 텍스트 입력이 된다.
export const LEN_OPTS = new Set(['thickness', 'w', 'h', 'z']);
export const unitLabel = units => (units === 'ftin' ? 'ft·in' : 'mm');

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
      if (LEN_OPTS.has(k) && units === 'ftin') return `<label${title}>${label} <input type="text" name="${k}" data-len="1" value="${esc(fmtLen(v, 'ftin'))}"></label>`;
      return `<label${title}>${label} <input type="number" name="${k}" value="${v}" step="1"></label>`;
    }
    if (k === 'reference') return `<label${title}>${label} ${select(k, REF, v)}</label>`;
    if (k === 'kind') return `<label${title}>${label} ${select(k, KIND, v)}</label>`;
    if (k === 'direction') return `<label${title}>${label} ${select(k, DIR, v)}</label>`;
    return `<label${title}>${label} <input type="text" name="${k}" value="${esc(String(v))}"></label>`;
  }).join('');
}

// 입력 한 칸을 tool.opts에 반영한다. 반영했으면 true.
// ft·in 텍스트는 mm로 되돌려 저장하고, 읽을 수 없는 입력은 값을 바꾸지 않고 입력란을 현재 값으로 되돌린다.
export function applyOptionInput(tool, el, units = 'mm') {
  const k = el?.name;
  if (!tool?.opts || !k) return false;
  if (el.dataset?.len) {
    const mm = parseLen(el.value, units);
    if (mm === null) { el.value = fmtLen(tool.opts[k], 'ftin'); return false; }
    tool.opts[k] = Math.round(mm);
    return true;
  }
  tool.opts[k] = el.type === 'checkbox' ? el.checked : el.type === 'number' ? Number(el.value) : el.value;
  return true;
}
