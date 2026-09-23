// 방 하나에 템플릿을 적용하는 대화상자(오늘의집 "템플릿 적용하기").
import { ROOM_TEMPLATES, filterTemplates, applyRoomTemplate, placeTemplate, templateById, replaceableInRoom } from '../templates/roomTemplates.js';
import { ROOM_TYPES } from './propsPanel.js';
import { activeFloor } from '../state/schema.js';
import { esc } from '../util/html.js';
import { toast } from './toast.js';
import { TEMPLATE_RESULT, TEMPLATE_REPLACE_WARN, TEMPLATE_FILTER_RESET } from './messages.js';
import { focusTrap, reopenOpener } from './dialogBase.js';
import { previewShapes, mountPreviews, PREVIEW_PX } from './templatePreview.js';

const USES = ['주거', '상업'];
const TYPE_LABEL = Object.fromEntries(ROOM_TYPES);
// 부분 배치·위치 조정·0개 배치를 사용자가 알 수 있게 하는 문구(§14.9). 자리가 없어 빠진 제품도,
// 벽에서 안쪽으로 당겨 온 제품도 조용히 지나가지 않는다.
// 문구 자체는 §14.8의 ui/messages.js에 모여 있다(TEMPLATE_RESULT — 배너·토스트가 갈라지지 않게).
export const placementMessage = (placed, skipped, moved = 0) => (placed
  ? TEMPLATE_RESULT(placed, moved, skipped)
  : '배치할 공간이 없습니다');
const numField = (name, label, value) => `<label class="field"><span>${label}</span><input type="number" name="${name}" value="${value}" min="0" max="100000000" step="any"></label>`;

let current = null;   // 열려 있는 인스턴스: 다시 열 때 DOM만 떼지 않고 트랩까지 해제한다(리뷰 Minor 1)

export function openRoomTemplateDialog({ store, ui = null, roomId, onClose = () => {} }) {
  const prev = document.activeElement;   // 이번 opener는 앞 인스턴스를 닫은 뒤 reopenOpener가 정한다
  current?.close();
  document.querySelector('.modal.templates')?.remove();   // 핸들이 없는 잔재도 떼어낸다
  const room = activeFloor(store.get()).rooms.find(r => r.id === roomId);
  if (!room) return { close: () => {} };
  // 기본 필터는 **이 방**이다(§16.10 · 감사 §16): 18.2 m² 방에서 8~120 m² 22장을 모두 보여 주던
  // 자리다. 면적 두 칸에 방 면적을 넣으면 filterTemplates의 "범위가 겹치면 통과" 규칙이
  // 그 면적을 담는 템플릿만 남긴다. [필터 초기화]가 이 기본값을 푼다.
  const area = Math.round((room.area ?? 0) * 10) / 10;
  const initial = { roomType: room.type && room.type !== 'none' ? room.type : '', use: '', minArea: area || '', maxArea: area || '', budget: '' };
  const st = { ...initial };

  const root = document.createElement('div');
  root.className = 'modal templates';
  root.innerHTML = `<div class="modal-card">
    <header><h2>템플릿 적용하기</h2><button type="button" name="close" aria-label="닫기">✕</button></header>
    <p class="hint">${esc(room.name || '이름 없는 공간')} · ${room.area.toFixed(1)} m²</p>
    <div class="tpl-filters" data-part="filters">
      <label class="field"><span>공간 타입</span><select name="roomType"><option value="">전체</option>${ROOM_TYPES.map(([v, l]) => `<option value="${v}" ${st.roomType === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <label class="field"><span>용도</span><select name="use"><option value="">전체</option>${USES.map(u => `<option value="${u}">${u}</option>`).join('')}</select></label>
      ${numField('minArea', '최소 면적 (m²)', st.minArea)}
      ${numField('maxArea', '최대 면적 (m²)', st.maxArea)}
      ${numField('budget', '예산 상한 (원)', '')}
    </div>
    <div class="toolbar"><button type="button" name="filterReset">${TEMPLATE_FILTER_RESET}</button><button type="button" name="cancel">취소</button></div>
    <div class="tpl-cards" data-part="cards"></div>
  </div>`;
  document.body.appendChild(root);
  const part = n => root.querySelector(`[data-part="${n}"]`);
  const nOrNull = v => (String(v).trim() === '' || !Number.isFinite(Number(v)) ? null : Number(v));

  // 이 방에 그 템플릿을 놓아 보고 결과를 축소 평면으로 그린다(§16.10). 실제 배치 함수를 쓰므로
  // 카드가 보여 주는 것이 곧 [적용]의 결과다(그림과 결과가 갈라질 자리가 없다).
  const shapesFor = id => {
    const f = activeFloor(store.get());
    const r = f.rooms.find(x => x.id === roomId);
    const t = templateById(id);
    if (!r || !t) return null;
    return previewShapes(r, placeTemplate(f, r, t), { size: PREVIEW_PX });
  };
  // [적용]이 지울 제품 수(문·창·개구부와 잠긴 제품은 남는다 — applyRoomTemplate과 같은 규칙).
  const killCount = () => {
    const f = activeFloor(store.get());
    const r = f.rooms.find(x => x.id === roomId);
    return r ? replaceableInRoom(f, r).length : 0;
  };
  function render() {
    const list = filterTemplates(ROOM_TEMPLATES, {
      roomType: st.roomType || null, use: st.use || null,
      minArea: nOrNull(st.minArea), maxArea: nOrNull(st.maxArea), budget: nOrNull(st.budget),
    });
    const kill = killCount();
    // 파괴적인 쪽을 보조 색으로 내리고(§16.10 · 감사 §15) 무엇을 잃는지 한 줄로 먼저 말한다.
    const warn = kill > 0 ? `<span class="error">${TEMPLATE_REPLACE_WARN(kill)}</span>` : '';
    part('cards').innerHTML = list.length ? list.map(t => `<div class="tpl-card" data-template="${t.id}">
      <canvas data-tpl="${esc(t.id)}" width="${PREVIEW_PX}" height="${PREVIEW_PX}" aria-label="${esc(`${t.name} 배치 미리보기`)}"></canvas>
      <b>${esc(t.name)}</b>
      <span class="muted">${esc(TYPE_LABEL[t.roomType] ?? t.roomType)} · ${esc(t.use)} · ${t.minArea}~${t.maxArea} m² · 제품 ${t.items.length}개</span>
      <span class="muted">예산 기준 ${t.budget.toLocaleString('ko-KR')}원</span>
      ${warn}
      <div class="row"><button type="button" name="apply">적용</button><button type="button" name="add" class="primary">기존 제품 유지하고 추가</button></div>
    </div>`).join('') : '<p class="hint">조건에 맞는 템플릿이 없습니다.</p>';
    mountPreviews(part('cards'), shapesFor);
  }
  let closed = false;
  const close = () => {
    if (closed) return;                                  // 두 번 불러도 한 번만 닫는다
    closed = true;
    if (current === self) current = null;
    root.remove(); trap.destroy(); onClose();
  };
  const self = { close };
  root.addEventListener('click', ev => {
    if (ev.target.name === 'close' || ev.target.name === 'cancel') { close(); return; }
    if (ev.target.name === 'filterReset') {
      // 0장이 되면 되돌릴 길이 있어야 한다(감사 §16): 기본값이 아니라 **전체**로 푼다.
      for (const k of Object.keys(st)) st[k] = '';
      for (const el of root.querySelectorAll('.tpl-filters [name]')) el.value = '';
      render();
      return;
    }
    const card = ev.target.closest('[data-template]');
    if (!card || !['apply', 'add'].includes(ev.target.name)) return;
    const { placed, skipped, moved } = applyRoomTemplate(store, roomId, card.dataset.template, { replace: ev.target.name === 'apply' });
    toast(placementMessage(placed.length, skipped, moved));
    close();
    // 포커스가 BODY로 떨어지던 자리다(감사 §17): 그 방을 고르고 속성 패널로 들여보낸다.
    // 대화상자를 연 컨텍스트 메뉴 항목은 이미 사라져 reopenOpener가 되돌릴 자리가 없다.
    ui?.set?.({ selection: { type: 'room', id: roomId } });
    document.getElementById('props')?.querySelector('select, input, button')?.focus();
  });
  const onEdit = ev => {
    const name = ev.target.name;
    if (!(name in st) || st[name] === ev.target.value) return;
    st[name] = ev.target.value;
    render();
  };
  root.addEventListener('change', onEdit);
  root.addEventListener('input', onEdit);   // 숫자 필드는 타이핑 중에도 좁혀진다(M2)
  root.addEventListener('keydown', ev => { if (ev.key === 'Escape') { ev.stopPropagation(); close(); } });
  render();
  const trap = focusTrap(root, { focus: '[name="close"]', opener: reopenOpener(prev) });   // §15.10
  current = self;
  return self;
}
