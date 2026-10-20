// 속성 패널의 제품 정보 행(2026-10-20 · 계획 17 Task 4). 엑셀 급식기구(product.extra)는 업체·모델명·식별번호·전기·가스·급배수를 읽기 전용으로 보여 주고,
// 숨김 단종 제품과 도면 기구(equip-generic)는 한 줄 안내와 [제품 교체] 버튼을 낸다 — 버튼은 propsPanel이 itemActions.replace(라이브러리 교체 모드)로 잇는다.
// 값이 없는 행은 내지 않는다(전기 0 kW · 가스 0 · 급배수 없음). DOM을 만들지 않고 문자열만 돌려준다(propsPanel의 bodyHtml에 끼운다).
import { esc } from '../util/html.js';
import { field } from './fieldUtils.js';
import { PRODUCT_LEGACY_NOTE, PRODUCT_DRAWN_NOTE, PRODUCT_REPLACE } from './messages.js';

const GENERIC_ID = 'equip-generic';
const ELEC_LABELS = ['1P 220V', '3P 380V', '4P 380V'];
const WATER_LABELS = ['냉수', '온수', '배수'];
const out = v => `<output>${esc(v)}</output>`;

// 전기 kW 세 칸 → '3P 380V 6.2 kW' 꼴(0인 칸은 뺀다). 모두 0이면 빈 문자열.
export function elecText(elec = []) {
  return elec.map((v, i) => (Number(v) > 0 ? `${ELEC_LABELS[i]} ${Number(v)} kW` : '')).filter(Boolean).join(' · ');
}
export function waterText(water = []) { return water.map((on, i) => (on ? WATER_LABELS[i] : '')).filter(Boolean).join(' · '); }

export function productRowsHtml(product) {
  if (!product) return '';
  if (product.id === GENERIC_ID || product.hidden) {
    const note = product.id === GENERIC_ID ? PRODUCT_DRAWN_NOTE : PRODUCT_LEGACY_NOTE;
    return `<p class="hint product-note">${esc(note)}</p><button type="button" name="productReplace">${esc(PRODUCT_REPLACE)}</button>`;
  }
  const x = product.extra;
  if (!x) return '';
  const rows = [
    ['업체', x.vendor], ['모델명', x.model], ['식별번호', x.kid],
    ['전기', elecText(x.util?.elec)], ['가스', Number(x.util?.gas) > 0 ? `${Number(x.util.gas)} kW` : ''], ['급배수', waterText(x.util?.water)],
  ];
  return rows.filter(([, v]) => v).map(([k, v]) => field(k, out(v))).join('');
}
