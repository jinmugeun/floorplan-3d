// 옵션 바 한 줄(아키텍처 §12.1). 캔버스 위에 떠 있던 팝업이 캔버스 상단의 "행"이 되면서
// 라벨을 짧게(두께 → W, 단면 → W·H·Z) 줄였고, 긴 이름은 title 속성으로 남긴다.
// shell.js가 300줄을 넘지 않게 그리기·읽기 규칙을 여기로 나눴다(아키텍처 §9).
import { esc } from '../util/html.js';
import { fmtLen } from '../util/units.js';
import { readLen } from './fieldUtils.js';

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
      // data-mm은 이 칸을 그릴 때의 값이다(§16.1): ft·in 표기는 파싱과 왕복하지 않으므로
      // readLen이 "고치지 않았다"를 이 값으로 판정한다(무편집 [Enter]가 값을 밀던 자리 — 리뷰 I-3).
      if (LEN_OPTS.has(k) && units === 'ftin') return `<label${title}>${label} <input type="text" name="${k}" data-len="1" data-mm="${v}" value="${esc(fmtLen(v, 'ftin'))}"></label>`;
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
// §16.1: 값이 지금과 같으면 아무것도 하지 않고 false를 돌려준다. 옵션 바는 스토어를 건드리지
// 않으므로 undo 단계는 애초에 없지만, [Enter] 확정의 합성 change + blur의 네이티브 change가
// 같은 경로를 두 번 돌던 자리다(shell.js의 keydown 주석이 "멱등하므로 결과는 같다"고 적어 둔
// 자리를 계약으로 바꾼다 — 치수 칸(Task 8)이 여기에 얹히면 멱등성만으로는 부족하다).
export function applyOptionInput(tool, el, units = 'mm') {
  const k = el?.name;
  if (!tool?.opts || !k || !(k in tool.opts)) return false;
  if (el.dataset?.len) {
    // 속성 패널의 길이 칸과 같은 함수로 읽는다: "글자를 고치지 않았다"(data-mm의 표시값과 같다)를
    // 한 곳에서만 판정하려고 readLen을 쓴다(리뷰 I-3 — ft·in 무편집 [Enter]가 값을 밀던 자리).
    const mm = readLen(el, units);
    if (mm === null) { el.value = fmtLen(tool.opts[k], 'ftin'); return false; }
    if (mm === tool.opts[k]) return false;
    tool.opts[k] = mm;
    return true;
  }
  const next = el.type === 'checkbox' ? el.checked : el.type === 'number' ? Number(el.value) : el.value;
  if (next === tool.opts[k]) return false;
  tool.opts[k] = next;
  return true;
}
