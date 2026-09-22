// 속성 패널의 "설비 속성" 섹션과 방의 "설계 풍량"(아키텍처 §11.6). propsPanel.js가 300줄을
// 넘지 않게 여기로 나눴다. 폼 도우미는 fieldUtils.js를 쓰고, 값 검증은 normalizeEquipProps가 한다.
import { activeFloor } from '../state/schema.js';
import { updateItem, updateRoom, resizeItem } from '../state/floorOps.js';
import { field, num, numValue, lenField, readLen, withUnit } from './fieldUtils.js';
import { esc } from '../util/html.js';
import { toast } from './toast.js';
import { LOCKED_ITEM_EDIT } from './messages.js';
import { EQUIP_TYPE_LABELS, APPLIANCE_KINDS, HEAT_KINDS, FLOW_KINDS, DIFFUSER_SYMBOLS, VENTCAP_DIAS, EQUIP_RANGE, equipType, isEquip, equipLabel } from '../vent/equipment.js';
import { ductLinksOf } from '../state/ductOps.js';
import { roomAt } from '../vent/airflow.js';

export const EQUIP_SECTION_TITLE = '설비 속성';

const drop = (name, options, value) =>
  `<select name="${name}">${options.map(([v, l]) => `<option value="${esc(String(v))}" ${String(value ?? '') === String(v) ? 'selected' : ''}>${esc(String(l))}</option>`).join('')}</select>`;
const check = (name, label, on) => `<label class="check"><input type="checkbox" name="${name}" ${on ? 'checked' : ''}> ${label}</label>`;
const cmh = n => Number(n || 0).toLocaleString('ko-KR');
// 같은 층의 후드 목록(조리기구의 "상단 후드"). 규격표가 같은 번호를 두 후드에 쓰므로(⑤·⑦),
// 번호만 찍으면 두 줄이 똑같아 보인다 → 원문자 + 그 후드가 선 방 이름을 병기한다(§12.5).
// 방 판정은 풍량(roomAirflow)과 같은 함수를 쓴다: 방 폴리곤은 벽 중심선이라 벽에 붙은 후드의
// 중심이 경계 위에 놓이는데, pointInPolygon만 쓰면 그 후드가 라벨에서는 방 없이 보이면서
// 풍량 표에는 그 방에 세어진다. 판정을 한 곳(roomAt)에 두어 두 화면이 어긋나지 않게 한다.
const hoodOptions = floor => [['', '없음'], ...(floor?.items ?? []).filter(i => equipType(i) === 'hood').map(h => {
  const label = `후드 ${equipLabel(h) ?? h.props.no}`;
  const room = roomAt(h.pos, floor?.rooms ?? [], floor?.walls ?? []);
  return [h.id, room?.name ? `${label} · ${room.name}` : label];
})];

// 설비에 이어진 덕트 목록. 연결된 꼭짓점은 설비 발자국 아래에 숨어 2D에서 클릭하기 어렵다(§12.5).
function ductLinksHtml(floor, item) {
  const links = ductLinksOf(floor, item.id);
  if (!links.length) return '<h3>연결된 덕트</h3><p class="hint">연결된 덕트가 없습니다. 덕트 도구로 설비 위를 클릭하면 연결됩니다.</p>';
  const row = l => {
    const kind = l.kind === 'supply' ? '급기' : '배기';
    const system = l.system ? ` · ${esc(l.system)}` : '';
    return `<li><span>${kind}${system} · ${l.point + 1}번 점</span><button type="button" name="ventDuctSelect" data-d="${esc(l.ductId)}" data-p="${l.point}">선택</button></li>`;
  };
  return `<h3>연결된 덕트</h3><ul class="duct-list duct-conns">${links.map(row).join('')}</ul>`;
}

function typeRows(t, item, { units, showUnit, floor }) {
  const p = item.props;
  const len = (label, name, v, range) => lenField(withUnit(label, units, showUnit), name, v, range[0], range[1], false, units, 10);
  if (t === 'hood') {
    return field('후드 번호', num('eqNo', p.no, EQUIP_RANGE.no[0], EQUIP_RANGE.no[1], 1))
      + check('eqFilter', '필터 있음', p.filter)
      + field('면풍속 (m/s)', num('eqFaceVelocity', p.faceVelocity, EQUIP_RANGE.faceVelocity[0], EQUIP_RANGE.faceVelocity[1], 0.05))
      + field('풍량 (CMH)', `<output name="eqCmh">${cmh(p.cmh)}</output>`)
      + '<p class="hint">풍량은 후드 면적 × 면풍속 × 3600으로 자동 계산됩니다.</p>'
      + field('배기 계통', `<input type="text" name="eqSystem" value="${esc(p.system)}" placeholder="F-3">`);
  }
  if (t === 'appliance') {
    return field('종류', drop('eqKind', APPLIANCE_KINDS, p.kind))
      + field('열원', drop('eqHeat', HEAT_KINDS, p.heat))
      + field('상단 후드', drop('eqHoodId', hoodOptions(floor), p.hoodId ?? ''));
  }
  if (t === 'diffuser') {
    return field('심벌', drop('eqSymbol', DIFFUSER_SYMBOLS.map(s => [s, s]), p.symbol))
      + field('급기/배기', drop('eqFlow', FLOW_KINDS, p.flow))
      + len('A (가로)', 'eqA', p.a, EQUIP_RANGE.ab)
      + len('B (세로)', 'eqB', p.b, EQUIP_RANGE.ab)
      + field('개당 풍량 (CMH)', num('eqCmhIn', p.cmh, EQUIP_RANGE.cmh[0], EQUIP_RANGE.cmh[1], 10));
  }
  if (t === 'fan') {
    return field('팬 번호', `<input type="text" name="eqFanId" value="${esc(p.fanId)}" placeholder="F-2">`)
      + field('급기/배기', drop('eqFlow', FLOW_KINDS, p.flow))
      + len('소음 챔버 W', 'eqChamberW', p.chamber[0], EQUIP_RANGE.chamber)
      + len('소음 챔버 D', 'eqChamberD', p.chamber[1], EQUIP_RANGE.chamber)
      + len('소음 챔버 H', 'eqChamberH', p.chamber[2], EQUIP_RANGE.chamber)
      + field('풍량 (CMH)', num('eqCmhIn', p.cmh, EQUIP_RANGE.cmh[0], EQUIP_RANGE.cmh[1], 10));
  }
  return field('지름', drop('eqDia', VENTCAP_DIAS.map(d => [d, `Ø${d}`]), p.dia));
}

export function equipRowsHtml(item, { units = 'mm', showUnit = false, floor = null } = {}) {
  const t = equipType(item);
  if (!t) return '';
  return `<h3>${EQUIP_SECTION_TITLE} · ${EQUIP_TYPE_LABELS[t]}</h3>`
    + typeRows(t, item, { units, showUnit, floor })
    + ductLinksHtml(floor, item);
}

// 방 패널의 설계 풍량 두 칸(+ Task 10이 주는 현재 합계·비율).
export function roomDesignRowsHtml(room, summary = null) {
  const d = room?.design ?? { EA: 0, SA: 0 };
  const now = summary
    ? field('현재 배기 EA', `<output name="nowEA">${cmh(summary.EA)}</output>`)
      + field('현재 급기 SA', `<output name="nowSA">${cmh(summary.SA)}</output>`)
      + field('급기 비율', `<output name="nowRatio">${summary.ratio === null ? '-' : `${summary.ratio.toFixed(1)}%`}</output>`)
    : '';
  return '<h3>설계 풍량 (CMH)</h3>'
    + field('설계 배기 EA', num('designEA', d.EA, 0, 1e7, 100))
    + field('설계 급기 SA', num('designSA', d.SA, 0, 1e7, 100))
    + now;
}

const EQ_FIELD = /^eq[A-Za-z]+$/;
// 설비 props 한 칸과 방 설계 풍량 한 칸. 자기 필드가 아니면 false(호출자가 다음 처리기로 넘긴다).
// 편집 하나 = updateItem/updateRoom 한 번 = 되돌림 한 단계다.
export function applyVentField(store, ui, sel, el) {
  const name = el?.name ?? '';
  if (name === 'designEA' || name === 'designSA') {
    if (sel?.type !== 'room') return true;
    const v = numValue(el);
    if (v === null) return true;
    const r = activeFloor(store.get()).rooms.find(x => x.id === sel.id);
    if (!r) return true;
    const key = name === 'designEA' ? 'EA' : 'SA';
    if (Math.round(v) === Math.round(r.design?.[key] ?? 0)) return true;   // §16.1: 빈 단계 금지
    updateRoom(store, sel.id, { design: { ...r.design, [key]: Math.round(v) } });
    return true;
  }
  if (!EQ_FIELD.test(name)) return false;
  if (sel?.type !== 'item') return true;
  const it = activeFloor(store.get()).items.find(x => x.id === sel.id);
  if (!isEquip(it)) return true;
  if (it.locked) { toast(LOCKED_ITEM_EDIT); return true; }
  const units = store.get().units ?? 'mm';
  const readNum = () => (el.dataset.len ? readLen(el, units) : numValue(el));
  const props = { ...it.props };
  const patch = {};
  switch (name) {
    case 'eqNo': { const v = numValue(el); if (v === null) return true; props.no = Math.round(v); break; }
    case 'eqFilter': props.filter = el.checked; break;
    case 'eqFaceVelocity': { const v = numValue(el); if (v === null) return true; props.faceVelocity = v; break; }
    case 'eqSystem': props.system = String(el.value).trim(); break;
    // 팬 번호도 글자 칸이다(브리프의 switch가 빠뜨렸다 — default로 떨어져 조용히 버려졌다).
    // 빈 값은 normalizeEquipProps가 기본값 'F-2'로 되돌린다(라벨이 빈칸이 되지 않게).
    case 'eqFanId': props.fanId = String(el.value).trim(); break;
    case 'eqKind': props.kind = el.value; break;
    case 'eqHeat': props.heat = el.value; break;
    case 'eqHoodId': props.hoodId = el.value || null; break;
    case 'eqSymbol': props.symbol = el.value; break;
    case 'eqFlow': props.flow = el.value; break;
    // 환기캡의 지름도 크기(정육면체 변)와 같이 간다: 값만 바꾸면 심벌·3D 박스가 라벨과 어긋난다(정한 것 4).
    case 'eqDia': { props.dia = Number(el.value); patch.size = [props.dia, props.dia, props.dia]; break; }
    case 'eqCmhIn': { const v = numValue(el); if (v === null) return true; props.cmh = Math.round(v); break; }
    case 'eqA': case 'eqB': {
      const v = readNum(); if (v === null) return true;
      const i = name === 'eqA' ? 0 : 1;
      props[i === 0 ? 'a' : 'b'] = Math.round(v);
      const size = [...it.size]; size[i] = Math.round(v);
      patch.size = size;                    // 디퓨저의 A×B가 그대로 아이템 크기다(§11이 말하지 않아 정한 것 4)
      break;
    }
    case 'eqChamberW': case 'eqChamberD': case 'eqChamberH': {
      const v = readNum(); if (v === null) return true;
      const i = { eqChamberW: 0, eqChamberD: 1, eqChamberH: 2 }[name];
      const chamber = [...props.chamber]; chamber[i] = Math.round(v);
      props.chamber = chamber;
      const size = [...it.size]; size[i] = Math.round(v);
      patch.size = size;                    // 소음 챔버 크기가 그대로 팬의 크기다
      break;
    }
    default: return true;                   // 모르는 eq* 필드는 처리한 것으로 보고 조용히 버린다
  }
  // §16.1: 값이 그대로면 dispatch하지 않는다 — 확정 한 번이 undo 두 단계를 쌓던 자리다(감사 §41).
  // props는 위에서 { ...it.props }를 복사해 한 칸만 덮으므로 키 순서가 같다 → JSON 비교가 안전하다.
  const sameProps = JSON.stringify(props) === JSON.stringify(it.props);
  const sameSize = !patch.size || patch.size.every((x, i) => x === it.size[i]);
  if (sameProps && sameSize) return true;                 // 처리한 것은 맞다(다음 처리기로 넘기지 않는다)
  // 크기가 함께 바뀌는 편집(디퓨저 A×B · 팬 챔버 · 환기캡 지름)은 반드시 resizeItem을 지난다:
  // updateItem → normalizeItem은 placeOnWall을 지나지 않으므로, 벽 부착 설비(fan-wall-500·환기캡)의
  // 깊이를 바꾸면 pos가 벽면에서 Δd/2만큼 떠 불변식 ①("pos는 (wallId, t)의 결과")이 깨진다.
  // 두 dispatch를 한 트랜잭션으로 묶어 되돌림은 여전히 한 단계다(둘 다 { record: false }).
  if (patch.size) {
    store.beginTransaction();
    updateItem(store, it.id, { props }, { record: false });
    resizeItem(store, it.id, patch.size, { record: false });   // 벽 부착이면 placeOnWall로 다시 앉는다
    store.endTransaction();
    return true;
  }
  updateItem(store, it.id, { props });
  return true;
}

// "연결된 덕트" 행의 [선택] 버튼. 그 덕트의 그 꼭짓점을 고른다(설비 우클릭 메뉴와 같은 동작).
export function ventRowsClick(ui, el) {
  if (el?.name !== 'ventDuctSelect') return false;
  const id = el.dataset.d, point = Number(el.dataset.p);
  if (!id || !Number.isInteger(point)) return true;
  ui.set({ selection: { type: 'duct', id, segment: null, vertex: point } });
  return true;
}
