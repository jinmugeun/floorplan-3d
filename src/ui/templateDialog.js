// 방 하나에 템플릿을 적용하는 대화상자(오늘의집 "템플릿 적용하기").
import { ROOM_TEMPLATES, filterTemplates, applyRoomTemplate } from '../templates/roomTemplates.js';
import { ROOM_TYPES } from './propsPanel.js';
import { activeFloor } from '../state/schema.js';
import { esc } from '../util/html.js';
import { toast } from './toast.js';

const USES = ['주거', '상업'];
const TYPE_LABEL = Object.fromEntries(ROOM_TYPES);
// 부분 배치·위치 조정·0개 배치를 사용자가 알 수 있게 하는 문구(§14.9). 자리가 없어 빠진 제품도,
// 벽에서 안쪽으로 당겨 온 제품도 조용히 지나가지 않는다.
// 문구 자체는 §14.8이 ui/messages.js의 TEMPLATE_RESULT로 모을 몫이다(그 파일이 아직 없어 여기 둔다).
export const placementMessage = (placed, skipped, moved = 0) => (placed
  ? `${placed}개 배치 · ${moved}개 위치 조정 · ${skipped}개 건너뜀`
  : '배치할 공간이 없습니다');
const numField = (name, label, value) => `<label class="field"><span>${label}</span><input type="number" name="${name}" value="${value}" min="0" max="100000000" step="any"></label>`;

export function openRoomTemplateDialog({ store, roomId, onClose = () => {} }) {
  const existing = document.querySelector('.modal.templates');
  if (existing) existing.remove();
  const room = activeFloor(store.get()).rooms.find(r => r.id === roomId);
  if (!room) return { close: () => {} };
  const st = { roomType: room.type && room.type !== 'none' ? room.type : '', use: '', minArea: '', maxArea: '', budget: '' };

  const root = document.createElement('div');
  root.className = 'modal templates';
  root.innerHTML = `<div class="modal-card">
    <header><h2>템플릿 적용하기</h2><button type="button" name="close" aria-label="닫기">✕</button></header>
    <p class="hint">${esc(room.name || '이름 없는 공간')} · ${room.area.toFixed(1)} m²</p>
    <div class="tpl-filters">
      <label class="field"><span>공간 타입</span><select name="roomType"><option value="">전체</option>${ROOM_TYPES.map(([v, l]) => `<option value="${v}" ${st.roomType === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <label class="field"><span>용도</span><select name="use"><option value="">전체</option>${USES.map(u => `<option value="${u}">${u}</option>`).join('')}</select></label>
      ${numField('minArea', '최소 면적 (m²)', '')}
      ${numField('maxArea', '최대 면적 (m²)', '')}
      ${numField('budget', '예산 상한 (원)', '')}
    </div>
    <div class="tpl-cards" data-part="cards"></div>
  </div>`;
  document.body.appendChild(root);
  const part = n => root.querySelector(`[data-part="${n}"]`);
  const nOrNull = v => (String(v).trim() === '' || !Number.isFinite(Number(v)) ? null : Number(v));

  function render() {
    const list = filterTemplates(ROOM_TEMPLATES, {
      roomType: st.roomType || null, use: st.use || null,
      minArea: nOrNull(st.minArea), maxArea: nOrNull(st.maxArea), budget: nOrNull(st.budget),
    });
    part('cards').innerHTML = list.length ? list.map(t => `<div class="tpl-card" data-template="${t.id}">
      <b>${esc(t.name)}</b>
      <span class="muted">${esc(TYPE_LABEL[t.roomType] ?? t.roomType)} · ${esc(t.use)} · ${t.minArea}~${t.maxArea} m² · 제품 ${t.items.length}개</span>
      <span class="muted">예산 기준 ${t.budget.toLocaleString('ko-KR')}원</span>
      <div class="row"><button type="button" name="apply" class="primary">적용</button><button type="button" name="add">기존 제품 유지하고 추가</button></div>
    </div>`).join('') : '<p class="hint">조건에 맞는 템플릿이 없습니다.</p>';
  }
  const close = () => { root.remove(); onClose(); };
  root.addEventListener('click', ev => {
    if (ev.target.name === 'close') { close(); return; }
    const card = ev.target.closest('[data-template]');
    if (!card || !['apply', 'add'].includes(ev.target.name)) return;
    const { placed, skipped, moved } = applyRoomTemplate(store, roomId, card.dataset.template, { replace: ev.target.name === 'apply' });
    toast(placementMessage(placed.length, skipped, moved));
    close();
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
  root.querySelector('[name="close"]').focus();
  return { close };
}
