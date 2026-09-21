// 덕트 속성 패널(아키텍처 §11.6). propsPanel이 sel.type === 'duct'면 이 HTML을 그대로 쓴다.
// 구간 목록에서 고른 구간의 W·H·Z만 편집하고, "모든 구간에 적용"이 그 값을 나머지 구간에 퍼뜨린다(DT-04).
import { activeFloor } from '../state/schema.js';
import { ductById, updateDuct, updateSegment, setAllSegments, addDamper, updateDamper, deleteDamper, disconnectDuct, deleteDuctSelection } from '../state/ductOps.js';
import { ductLength, segmentLength } from '../geom/ducts.js';
import { DUCT_RANGE, DAMPER_TYPES } from '../state/ductSchema.js';
import { field, numValue, lenField, readLen, withUnit } from './fieldUtils.js';
import { equipLabel } from '../vent/equipment.js';
import { productById } from '../products/catalog.js';
import { fmtLen } from '../util/units.js';
import { esc } from '../util/html.js';
import { toast } from './toast.js';

const segIndex = sel => (Number.isInteger(sel?.segment) ? sel.segment : 0);

export function ductPanelHtml(floor, sel, { units = 'mm', showUnit = false } = {}) {
  const d = sel?.type === 'duct' ? ductById(floor, sel.id) : null;
  if (!d) return '';
  const i = Math.min(segIndex(sel), d.segments.length - 1);
  const seg = d.segments[i];
  const segRows = d.segments.map((s, k) =>
    `<li class="${k === i ? 'on' : ''}"><button type="button" name="ductSeg" data-i="${k}">${k + 1}구간</button>`
    + `<span class="muted">${Math.round(s.w)}×${Math.round(s.h)} · ${esc(fmtLen(Math.round(segmentLength(d, k)), units))}</span></li>`).join('');
  // 댐퍼 줄: 종류 토글 + 크기 두 칸(명세 DT-06의 "크기 입력", 아키텍처 §11.6의 "종류·크기·삭제") + 삭제.
  const damperRows = d.dampers.map((x, k) =>
    `<li><span>${esc(x.type)} · ${x.segment + 1}구간 ${Math.round(x.t * 100)}%</span>`
    + `<input type="number" name="damperW" data-i="${k}" value="${Math.round(x.w)}" min="${DUCT_RANGE.w[0]}" max="${DUCT_RANGE.w[1]}" step="10" aria-label="댐퍼 너비">`
    + `<input type="number" name="damperH" data-i="${k}" value="${Math.round(x.h)}" min="${DUCT_RANGE.h[0]}" max="${DUCT_RANGE.h[1]}" step="10" aria-label="댐퍼 높이">`
    + `<button type="button" name="damperType" data-i="${k}">${x.type === 'VD' ? 'FVD로' : 'VD로'}</button>`
    + `<button type="button" name="damperDelete" data-i="${k}" class="danger" aria-label="댐퍼 삭제">삭제</button></li>`).join('')
    || '<li class="muted">댐퍼가 없습니다.</li>';
  const connRows = d.connections.map(c => {
    const it = (floor.items ?? []).find(x => x.id === c.itemId);
    const name = it ? (it.name || productById(it.productId)?.name || '설비') : '(사라진 설비)';
    const tag = it && equipLabel(it) ? ` ${equipLabel(it)}` : '';
    return `<li><span>${c.point + 1}번 점 · ${esc(name)}${esc(tag)}</span><button type="button" name="ductDisconnect" data-p="${c.point}">해제</button></li>`;
  }).join('') || '<li class="muted">연결된 설비가 없습니다.</li>';
  const len = (label, name, v, range) => lenField(withUnit(label, units, showUnit), name, v, range[0], range[1], false, units, 10);
  return `<h2>덕트 상세 정보</h2>
    ${field('종류', `<select name="ductKind"><option value="supply" ${d.kind === 'supply' ? 'selected' : ''}>급기</option><option value="exhaust" ${d.kind === 'exhaust' ? 'selected' : ''}>배기</option></select>`)}
    ${field('계통', `<input type="text" name="ductSystem" value="${esc(d.system)}" placeholder="F-3">`)}
    ${field('총 길이', `<output name="ductLength">${esc(fmtLen(Math.round(ductLength(d)), units, { unit: showUnit }))}</output>`)}
    ${d.estimated ? '<p class="hint">도면에서 경로를 읽을 수 없어 추정해 그린 덕트입니다.</p>' : ''}
    <h3>구간 ${d.segments.length}개</h3>
    <ul class="duct-list duct-segs">${segRows}</ul>
    ${len('단면 너비 W', 'segW', seg.w, DUCT_RANGE.w)}
    ${len('단면 높이 H', 'segH', seg.h, DUCT_RANGE.h)}
    ${len('중심 높이 Z', 'segZ', seg.z, DUCT_RANGE.z)}
    <button type="button" name="segAll">모든 구간에 적용</button>
    <h3>댐퍼</h3>
    <ul class="duct-list duct-dampers">${damperRows}</ul>
    <button type="button" name="damperAdd">댐퍼 추가 (${i + 1}구간)</button>
    <h3>연결</h3>
    <ul class="duct-list duct-conns">${connRows}</ul>
    <label class="check"><input type="checkbox" name="ductLocked" ${d.locked ? 'checked' : ''}> 잠금</label>
    <label class="check"><input type="checkbox" name="ductHidden" ${d.hidden ? 'checked' : ''}> 숨김</label>
    <button type="button" name="ductDelete" class="danger">덕트 삭제</button>`;
}

const CHANGE_FIELDS = new Set(['ductKind', 'ductSystem', 'segW', 'segH', 'segZ', 'ductLocked', 'ductHidden', 'damperW', 'damperH']);
// 입력 한 칸. 자기 필드가 아니면 false(호출자가 다음 처리기로 넘긴다).
export function applyDuctField(store, sel, el) {
  const name = el?.name ?? '';
  if (!CHANGE_FIELDS.has(name)) return false;
  if (sel?.type !== 'duct') return true;
  const d = ductById(activeFloor(store.get()), sel.id);
  if (!d) return true;
  // 잠금·숨김은 잠긴 덕트에도 켤 수 있어야 한다(그러지 않으면 잠금을 풀 길이 없다).
  if (name === 'ductLocked') { updateDuct(store, d.id, { locked: el.checked }); return true; }
  if (name === 'ductHidden') { updateDuct(store, d.id, { hidden: el.checked }); return true; }
  if (d.locked) { toast('잠긴 덕트는 편집할 수 없습니다'); return true; }
  if (name === 'ductKind') { updateDuct(store, d.id, { kind: el.value === 'supply' ? 'supply' : 'exhaust' }); return true; }
  if (name === 'ductSystem') { updateDuct(store, d.id, { system: String(el.value).trim() }); return true; }
  // 댐퍼 크기(명세 DT-06). 길이 입력이 아니라 순수 mm 숫자 칸이다(목록 안에 들어가 좁다).
  if (name === 'damperW' || name === 'damperH') {
    const dv = numValue(el);
    if (dv !== null) updateDamper(store, d.id, Number(el.dataset.i), { [name === 'damperW' ? 'w' : 'h']: Math.round(dv) });
    return true;
  }
  const v = el.dataset.len ? readLen(el, store.get().units ?? 'mm') : numValue(el);
  if (v === null) return true;
  updateSegment(store, d.id, Math.min(segIndex(sel), d.segments.length - 1), { [{ segW: 'w', segH: 'h', segZ: 'z' }[name]]: Math.round(v) });
  return true;
}

const CLICK_NAMES = new Set(['ductSeg', 'segAll', 'damperAdd', 'damperType', 'damperDelete', 'ductDisconnect', 'ductDelete']);
export function ductPanelClick(store, ui, sel, el) {
  const name = el?.name ?? '';
  if (!CLICK_NAMES.has(name)) return false;
  if (sel?.type !== 'duct') return true;
  const d = ductById(activeFloor(store.get()), sel.id);
  if (!d) return true;
  if (name === 'ductSeg') { ui.set({ selection: { type: 'duct', id: d.id, segment: Number(el.dataset.i), vertex: null } }); return true; }
  // 삭제 규칙은 Delete 키와 같은 상태 함수(state/ductOps.js)를 지난다(잠금 검사도 그 안에 있다).
  // 패널엔 꼭짓점 선택 개념이 없지만 판정 함수는 sel 그대로 받으므로 여기서도 안전하다.
  if (name === 'ductDelete') {
    const r = deleteDuctSelection(store, sel);
    if (r.locked) toast('잠긴 덕트는 삭제할 수 없습니다');
    else if (r.deleted === 'point') ui.set({ selection: { type: 'duct', id: d.id, segment: null, vertex: null } });
    else if (r.deleted === 'duct') ui.set({ selection: null });
    return true;
  }
  if (d.locked) { toast('잠긴 덕트는 편집할 수 없습니다'); return true; }
  const i = Math.min(segIndex(sel), d.segments.length - 1);
  if (name === 'segAll') { const s = d.segments[i]; setAllSegments(store, d.id, { w: s.w, h: s.h, z: s.z }); return true; }
  // 새 댐퍼는 고른 구간 가운데에, 그 구간의 단면 크기로 붙는다(DT-06).
  if (name === 'damperAdd') { const s = d.segments[i]; addDamper(store, d.id, { segment: i, t: 0.5, type: DAMPER_TYPES[0], w: s.w, h: s.h }); return true; }
  if (name === 'damperType') {
    const k = Number(el.dataset.i), x = d.dampers[k];
    if (x) updateDamper(store, d.id, k, { type: x.type === DAMPER_TYPES[0] ? DAMPER_TYPES[1] : DAMPER_TYPES[0] });
    return true;
  }
  if (name === 'damperDelete') { deleteDamper(store, d.id, Number(el.dataset.i)); return true; }
  disconnectDuct(store, d.id, Number(el.dataset.p));   // ductDisconnect
  return true;
}
