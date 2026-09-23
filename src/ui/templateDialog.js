// 방 하나에 템플릿을 적용하는 대화상자(오늘의집 "템플릿 적용하기").
import { ROOM_TEMPLATES, filterTemplates, applyRoomTemplate, placeTemplate, templateById, replaceableInRoom, itemsInRoom } from '../templates/roomTemplates.js';
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
  const st = { roomType: room.type && room.type !== 'none' ? room.type : '', use: '', minArea: area || '', maxArea: area || '', budget: '' };

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

  // [적용]이 남길 것(문·창·개구부와 잠긴 제품)과 지울 개수를 한 계산에서 낸다 —
  // applyRoomTemplate과 같은 replaceableInRoom 하나를 지나므로 경고 줄이 세는 수, 미리보기가
  // 피하는 것, 실제로 지워지는 것이 갈라질 자리가 없다.
  const applyPlan = () => {
    const floor = activeFloor(store.get());
    const r = floor.rooms.find(x => x.id === roomId) ?? null;
    if (!r) return { floor, room: null, keep: [], kill: 0 };
    const kill = new Set(replaceableInRoom(floor, r).map(it => it.id));
    return { floor, room: r, keep: itemsInRoom(floor, r).filter(it => !kill.has(it.id)), kill: kill.size };
  };
  let plan = { floor: null, room: null, keep: [], kill: 0 };   // 이번 렌더가 본 계획(render가 채운다)
  // 이 방에 그 템플릿을 놓아 보고 결과를 축소 평면으로 그린다(§16.10). [적용]과 **같은 avoid**를
  // 주고 남을 것도 함께 그리므로 카드가 보여 주는 것이 곧 [적용]의 결과다(리뷰 I-2: avoid를 비워
  // 두면 잠긴 제품이 있는 방에서 그림이 1.5 m씩 밀렸다). 다만 벽 제품은 applyRoomTemplate의
  // seatCopies에서 t가 겹치면 떨어지므로 그림에만 남을 수 있고, [기존 제품 유지하고 추가]는
  // 아무것도 지우지 않아 결과가 그림보다 붐빈다 — 그림은 [적용] 기준이다.
  const shapesFor = id => {
    const t = templateById(id);
    if (!plan.room || !t) return null;
    const made = placeTemplate(plan.floor, plan.room, t, { avoid: plan.keep });
    return previewShapes(plan.room, [...plan.keep, ...made], { size: PREVIEW_PX });
  };
  function render() {
    const list = filterTemplates(ROOM_TEMPLATES, {
      roomType: st.roomType || null, use: st.use || null,
      minArea: nOrNull(st.minArea), maxArea: nOrNull(st.maxArea), budget: nOrNull(st.budget),
    });
    plan = applyPlan();
    const kill = plan.kill;
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
    // 포커스가 BODY로 떨어지던 자리다(감사 §17): 그 방을 고르고 속성 패널의 공간 이름 칸으로
    // 들여보낸다. #props의 첫 포커스 요소는 늘 #floorBar의 층 select라 그것을 id로 더듬으면
    // 방금 템플릿을 적용한 사용자가 ↓ 한 번으로 층을 바꾼다(리뷰 I-3). 인가된 경로는
    // ui.focusField다 — propsPanel이 렌더 뒤 [name="name"]을 잡아 주고 재렌더에도 살아남는다.
    // 대화상자를 연 컨텍스트 메뉴 항목은 이미 사라져 reopenOpener가 되돌릴 자리가 없다.
    ui?.set?.({ selection: { type: 'room', id: roomId }, focusField: 'name' });
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
