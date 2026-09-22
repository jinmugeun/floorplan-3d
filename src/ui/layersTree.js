// 레이어 트리의 HTML(§16.3). layersPanel.js가 300줄 규칙에 닿기 전에 렌더만 떼어 냈다:
// 이 파일은 문자열만 만들고 스토어·DOM 이벤트를 모른다(data-* 이름은 예전과 같으므로 패널의
// 클릭 핸들러는 그대로다).
//
// 밀도 규칙(감사 §22): 한 행은 **한 줄**이다 — 이름(+꼬리표) · 코드·크기 · 버튼(오른쪽 정렬).
// 방 노드는 <details>라서 접힌다. 내용이 0개인 방은 처음부터 접힌 채 열린다(부식창고·복도가
// 헤더 줄만 차지하던 자리다). 사용자가 직접 접거나 펴면 그 기억(openState)이 이긴다.
import { productById, fmtSize } from '../products/catalog.js';
import { equipLabel } from '../vent/equipment.js';
import { ductLength } from '../geom/ducts.js';
import { fmtArea, fmtLen } from '../util/units.js';
import { esc } from '../util/html.js';

// "모두 보기" 체크박스는 상태 거울이면서 파괴적 스위치였다(감사 §20): 두 동작으로 가른다.
export const ALL_SHOW = '모두 보이기';
export const ALL_HIDE = '모두 숨기기';
// 이모지 버튼에는 마우스 툴팁이 없었다(감사 §24): title과 aria-label에 같은 말을 준다.
export const BTN_TITLES = { hide: '숨김', show: '보이기', lock: '잠금', unlock: '잠금 해제', rename: '이름 변경' };
// 숨김 필터를 끄면 행 자체가 사라져 되살릴 길이 없었다(감사 §26): 그 사실과 되돌릴 버튼을 남긴다.
export const HIDDEN_LINE = n => `숨긴 항목 ${n}개 — 숨긴 항목 보기`;

// 같은 이름·코드 제품이 나란히 있으면 무엇이 무엇인지 알 수 없다(감사 §23). 설비는 자기 번호·심벌이
// 있고(equipLabel: 후드 ①, 디퓨저 심벌, 팬 번호, 환기캡 Ø), 그 밖의 제품은 트리 안 순번을 준다.
// 하나뿐인 이름에는 꼬리표를 붙이지 않는다(없는 곳에 번호를 만들지 않는다).
export function itemTag(item, { seq = 1, total = 1 } = {}) {
  if (total <= 1) return '';
  return String(equipLabel(item) ?? `#${seq}`);
}

const nameOf = it => it.name || productById(it.productId)?.name || '제품';

function itemRow(it, { tag, selected, renaming }) {
  const p = productById(it.productId);
  const body = renaming
    ? `<input type="text" data-name="${esc(it.id)}" value="${esc(nameOf(it))}" aria-label="${BTN_TITLES.rename}">`
    : `<button type="button" class="layer-name" data-select="${esc(it.id)}">${esc(nameOf(it))}${tag ? ` <span class="layer-tag">${esc(tag)}</span>` : ''}</button>`;
  const btn = (attr, on) => `<button type="button" ${attr}="${esc(it.id)}" class="${on ? 'on' : 'off'}" title="${BTN_TITLES[on ? 'show' : 'hide']}" aria-label="${BTN_TITLES[on ? 'show' : 'hide']}">${on ? '🚫' : '👁'}</button>`;
  const lock = `<button type="button" data-lock="${esc(it.id)}" class="${it.locked ? 'on' : 'off'}" title="${BTN_TITLES[it.locked ? 'unlock' : 'lock']}" aria-label="${BTN_TITLES[it.locked ? 'unlock' : 'lock']}">${it.locked ? '🔒' : '🔓'}</button>`;
  return `<li class="layer-item${selected ? ' on' : ''}${it.hidden ? ' off' : ''}"${selected ? ' data-sel="1"' : ''} data-id="${esc(it.id)}">
      ${body}
      <span class="muted">${esc(it.code || p?.code || '')} ${p ? esc(fmtSize(it.size)) : ''}</span>
      <span class="layer-btns">${btn('data-hide', !!it.hidden)}${lock}<button type="button" data-rename="${esc(it.id)}" title="${BTN_TITLES.rename}" aria-label="${BTN_TITLES.rename}">✎</button></span></li>`;
}

// 덕트 행: 급배기 · 계통 · 총 길이. 이름 바꾸기는 없다(덕트 이름은 계통이 대신한다).
function ductRow(d, { units, selected }) {
  const kind = d.kind === 'supply' ? '급기' : '배기';
  const system = d.system ? ` · ${esc(d.system)}` : '';
  const eye = `<button type="button" data-duct-hide="${esc(d.id)}" class="${d.hidden ? 'on' : 'off'}" title="${BTN_TITLES[d.hidden ? 'show' : 'hide']}" aria-label="${BTN_TITLES[d.hidden ? 'show' : 'hide']}">${d.hidden ? '🚫' : '👁'}</button>`;
  const lock = `<button type="button" data-duct-lock="${esc(d.id)}" class="${d.locked ? 'on' : 'off'}" title="${BTN_TITLES[d.locked ? 'unlock' : 'lock']}" aria-label="${BTN_TITLES[d.locked ? 'unlock' : 'lock']}">${d.locked ? '🔒' : '🔓'}</button>`;
  return `<li class="layer-item${selected ? ' on' : ''}${d.hidden ? ' off' : ''}"${selected ? ' data-sel="1"' : ''} data-duct="${esc(d.id)}">
      <button type="button" class="layer-name" data-duct-select="${esc(d.id)}">덕트 ${kind}${system}</button>
      <span class="muted">${esc(fmtLen(Math.round(ductLength(d)), units))}</span>
      <span class="layer-btns">${eye}${lock}</span></li>`;
}

// buckets = [{ room, items, ducts }] (layersPanel.buckets()의 결과 그대로).
export function layerTreeHtml(buckets, { units = 'mm', pyeong = false, showHidden = true, selectedIds = new Set(), renaming = null, openState = new Map() } = {}) {
  // 꼬리표는 **트리 전체**에서 같은 이름을 센다: 같은 후드 세 개가 서로 다른 방에 있어도 구분된다.
  const counts = new Map();
  for (const b of buckets) for (const it of b.items) counts.set(nameOf(it), (counts.get(nameOf(it)) ?? 0) + 1);
  const seen = new Map();
  const node = b => {
    const items = b.items.filter(it => showHidden || !it.hidden);
    const ducts = b.ducts.filter(d => showHidden || !d.hidden);
    const hiddenCount = (b.items.length - items.length) + (b.ducts.length - ducts.length);
    const rows = items.map(it => {
      const name = nameOf(it);
      const seq = (seen.get(name) ?? 0) + 1; seen.set(name, seq);
      return itemRow(it, { tag: itemTag(it, { seq, total: counts.get(name) ?? 1 }), selected: selectedIds.has(it.id), renaming: renaming === it.id });
    }).join('') + ducts.map(d => ductRow(d, { units, selected: selectedIds.has(d.id) })).join('');
    const hiddenLine = hiddenCount > 0
      ? `<li class="layer-hidden"><button type="button" name="showHidden">${HIDDEN_LINE(hiddenCount)}</button></li>`
      : '';
    const id = b.room?.id ?? 'none';
    const total = b.items.length + b.ducts.length;
    const open = openState.has(id) ? openState.get(id) : total > 0;
    const title = b.room ? `${esc(b.room.name || '이름 없는 공간')} (${fmtArea(b.room.area, { pyeong })})` : '미지정';
    const count = `제품 ${b.items.length} · 덕트 ${b.ducts.length}`;
    return `<li class="layer-room"><details data-room="${esc(id)}"${open ? ' open' : ''}>
      <summary><span class="layer-room-name">${title}</span><span class="muted">${count}</span></summary>
      <ul>${rows}${hiddenLine}</ul></details></li>`;
  };
  return `<ul class="layer-tree">${buckets.map(node).join('')}</ul>`;
}
