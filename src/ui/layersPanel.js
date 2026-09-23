import { activeFloor } from '../state/schema.js';
import { roomAt } from '../vent/airflow.js';
import { setItemFlag, updateItem, setDuctFlag } from '../state/floorOps.js';
import { layerTreeHtml, bucketOpen, ALL_SHOW, ALL_HIDE } from './layersTree.js';
import { layersHeaderHtml, filterBuckets, rowCount, autoCollapsed, collapseLabel } from './layersHeader.js';
import { toast } from './toast.js';
import { LAYERS_HIDDEN, LAYERS_SHOWN } from './messages.js';

// 덕트는 첫 점이 든 방에 묶는다. 폴리라인은 여러 방을 지날 수 있어 기준이 하나 필요하다.
// 방 판정은 맨손 pointInPolygon이 아니라 roomAt(vent/airflow.js)을 쓴다: 방 폴리곤은 벽 **중심선**이라
// 벽에 붙은 후드·벽팬의 중심이 경계 위에 놓인다 → 두 곳이 다르게 판정하면 같은 후드가 풍량 표에는
// 그 방에 세어지면서 레이어 트리에서는 '미지정'으로 빠지는 어긋남이 생긴다.
export const ductRoomId = (floor, duct) => roomAt(duct.points[0], floor.rooms, floor.walls)?.id ?? null;

export function createLayersPanel(container, { store, ui }) {
  let renaming = null;
  // 검색어는 패널 지역 상태다(§17.6): 스토어에도 ui에도 넣지 않는다 — 되돌릴 것도, 저장할 것도 아니다.
  let query = '';
  // 방 노드의 접힘 기억. 기본값은 "내용이 있으면 펼침"이고(layersTree), 사용자가 토글하면 그 값이 이긴다.
  const openState = new Map();

  // 아이템 위치가 어느 방 안인지로 묶는다(판정은 roomAt 한 자리 — 위 ductRoomId 주석과 같은 이유).
  // 어느 방에도 없으면 "미지정". 덕트는 첫 점으로 묶는다.
  function buckets() {
    const f = activeFloor(store.get());
    const rooms = f.rooms.map(r => ({ room: r, items: [], ducts: [] }));
    const none = { room: null, items: [], ducts: [] };
    for (const it of f.items) {
      const id = roomAt(it.pos, f.rooms, f.walls)?.id ?? null;
      (rooms.find(x => x.room.id === id) ?? none).items.push(it);
    }
    for (const d of f.ducts ?? []) { const id = ductRoomId(f, d); (rooms.find(x => x.room.id === id) ?? none).ducts.push(d); }
    return none.items.length || none.ducts.length ? [...rooms, none] : rooms;
  }
  const showHidden = () => ui.get().showHidden !== false;

  // 선택 표시는 ui.selection에서 온다(§16.3 · 감사 §21): 캔버스에서 고른 것도 트리에서 보인다.
  const selectedIds = () => {
    const s = ui.get().selection;
    if (!s) return new Set();
    if (s.type === 'item' || s.type === 'duct') return new Set([s.id]);
    if (s.type === 'multi' && s.kind === 'item') return new Set(s.ids);
    return new Set();
  };
  // 마지막으로 스크롤해 보여 준 선택. 렌더마다가 아니라 **선택이 바뀔 때만** 스크롤하기 위한 기억이다.
  let lastSel = '';
  // 무엇을 보여 줄지는 **한 자리**에서 잰다: 접기 버튼의 라벨(anyOpen)과 그 버튼의 동작이 서로
  // 다른 집합을 보면 검색 중에 죽은 클릭이 된다(리뷰 I-1).
  // 필터 결과의 이름은 `visible`이다: paintTree 안의 `const shown`은 **스크롤 게이트**(패널이
  // 레일에서 숨겨졌는지)라는 다른 뜻이다 — 같은 이름을 쓰면 읽는 사람이 헷갈린다.
  // 자동 접힘 문턱은 **거르기 전** 행 수로 본다: 검색 결과가 세 줄이라고 해서 큰 도면이
  // 작아지는 것은 아니다(검색을 지우면 다시 510행이다).
  function view() {
    const all = buckets();
    const visible = filterBuckets(all, query);
    const collapse = autoCollapsed(rowCount(all));
    return { visible, collapse, anyOpen: visible.some(b => bucketOpen(b, openState, collapse)) };
  }
  // 트리만 그린다(머리 한 줄은 그대로 둔다 — 리뷰 I-2). 행이 새로 만들어지는 자리가 여기
  // 하나뿐이므로 스크롤 게이트도 같이 산다.
  function paintTree({ visible, collapse }) {
    const st = store.get();
    container.querySelector('.layer-tree-box').innerHTML =
      layerTreeHtml(visible, { units: st.units ?? 'mm', pyeong: !!st.settings?.pyeong, showHidden: showHidden(), selectedIds: selectedIds(), renaming, openState, autoCollapse: collapse });
    if (renaming) container.querySelector(`input[data-name="${renaming}"]`)?.focus();
    // 캔버스에서 고른 것이 트리 밖에 있으면 스크롤해 보여 준다(49행이 4화면이므로 꼭 필요하다).
    // **선택이 바뀔 때만** 한다: render()는 스토어·ui 양쪽에 걸려 있어 조건 없이 스크롤하면 다른 행의
    // 👁 클릭이나 캔버스 드래그가 사용자가 보고 있던 자리를 선택 행으로 되끌어당긴다.
    // jsdom에는 scrollIntoView가 없을 수 있다 — 없으면 조용히 지나간다.
    const ids = [...selectedIds()].sort().join(',');
    // 패널이 레일에서 숨겨져 있거나(section[hidden]) 접혀 있으면(#panel.collapsed = display:none) 스크롤이
    // 무효이므로 기억하지 않는다 — 다음에 패널이 열려 다시 그릴 때 그 선택으로 스크롤한다(재리뷰 N-1·N-1b).
    const shown = !container.closest('[hidden], .collapsed');
    if (ids && ids !== lastSel && shown) {
      const sel = container.querySelector('.layer-item.on');
      // 닫힌 <details> 안의 행에는 scrollIntoView가 무동작이다(실측: scrollTop 0 그대로). 자동
      // 접힘은 31행부터 켜지고 강당중 샘플이 49행이라 **대표 도면에서 늘 이 경우다** → 먼저
      // 조상 방을 편다. 캡처 toggle 리스너와 **같은** 기억에 적는다: 아니면 다음 렌더가 도로
      // 접어 선택 강조(.on)조차 보이지 않는다(리뷰 C-1).
      const d = sel?.closest('details[data-room]');
      if (d && !d.open) { d.open = true; openState.set(d.dataset.room, true); }
      try { sel?.scrollIntoView?.({ block: 'nearest' }); } catch { /* 스크롤 불가 환경 */ }
    }
    lastSel = shown ? ids : '';
  }
  function render() {
    const v = view();
    // 글자를 치는 동안 innerHTML을 갈아 치우므로 포커스를 직접 돌려준다(renaming과 같은 규칙).
    // `!!q0`가 앞에 있어야 한다: 둘 다 null인 문서에서는 첫 렌더가 검색 칸으로 포커스를 훔쳤다(리뷰 M-2).
    const q0 = container.querySelector('[name="q"]');
    const searching = !!q0 && q0 === container.ownerDocument?.activeElement;
    // "모두 보기" 체크박스(상태 거울 + 파괴적 스위치)를 두 동작으로 가른다(§16.3 · 감사 §20).
    container.innerHTML = `
      <div class="row layer-actions"><button type="button" name="showAll">${ALL_SHOW}</button><button type="button" name="hideAll">${ALL_HIDE}</button></div>
      ${layersHeaderHtml({ query, anyOpen: v.anyOpen })}
      <label class="check"><input type="checkbox" name="showHidden" ${showHidden() ? 'checked' : ''}> 숨긴 항목 보기</label>
      <div class="layer-tree-box"></div>`;
    paintTree(v);
    if (searching) {
      const s = container.querySelector('[name="q"]');
      s?.focus();
      try { s?.setSelectionRange(s.value.length, s.value.length); } catch { /* search 입력은 브라우저에 따라 막는다 */ }
    }
  }
  // 검색 타이핑·접기 버튼: 머리 한 줄(= 포커스 중인 검색 입력 노드)을 **살려 둔 채** 트리와
  // 버튼 라벨만 고친다(리뷰 I-2). 입력 노드를 갈아 치우면 한글 조합이 끊겨 `후드`가
  // `ㅎㅜㄷㅡ`로 남는다 — 값·캐럿은 복원해도 조합 상태는 복원할 수 없다.
  function renderTree() {
    if (!container.querySelector('.layer-tree-box')) { render(); return; }
    const v = view();
    paintTree(v);
    const btn = container.querySelector('[name="collapseAll"]');
    if (btn) { btn.textContent = collapseLabel(v.anyOpen); btn.title = collapseLabel(v.anyOpen); }
  }
  // 지금 화면에 보이는(= 검색에 걸린) 행의 id. [모두 숨기기]의 범위를 화면과 맞추는 데 쓴다(리뷰 I-3).
  const visibleIds = () => {
    const out = new Set();
    for (const b of filterBuckets(buckets(), query)) { for (const it of b.items) out.add(it.id); for (const d of b.ducts) out.add(d.id); }
    return out;
  };

  const onClick = ev => {
    const b = ev.target.closest('button'); if (!b) return;
    if (b.name === 'showAll' || b.name === 'hideAll') {
      const hidden = b.name === 'hideAll';
      // 검색 중에는 **화면에 보이는 행에만** 적용한다(리뷰 I-3): 3행만 보이는 화면에서
      // [모두 숨기기]가 46행까지 숨기면 파괴적 동작의 범위를 화면이 설명하지 못한다.
      // 토스트도 그 수를 센다. 질의가 비면 예전 그대로 층 전체다 — 어느 쪽이든 되돌리기 한 단계다.
      const n = hideAll(store, activeFloor(store.get()), hidden, query.trim() ? visibleIds() : null);
      if (n.items || n.ducts) toast((hidden ? LAYERS_HIDDEN : LAYERS_SHOWN)(n.items, n.ducts));
      return;
    }
    if (b.name === 'showHidden') { ui.set({ showHidden: true }); return; }   // 숨긴 항목을 되살릴 길(감사 §26)
    if (b.name === 'collapseAll') {
      // 하나라도 열려 있으면 모두 접고, 하나도 없으면 모두 편다(라벨이 곧 다음 동작이다).
      // 판정도 쓰기도 **라벨과 같은 집합**(걸러져 보이는 방)에 한다(리뷰 I-1): 전체 방으로 하면
      // 검색 중에 라벨은 [방 모두 펴기]인데 눌러도 보이는 방은 닫힌 채였고(죽은 클릭), 동시에
      // 화면에 없는 방이 말없이 접혔다.
      const { visible, collapse } = view();
      const open = !visible.some(x => bucketOpen(x, openState, collapse));
      for (const x of visible) openState.set(x.room?.id ?? 'none', open);
      renderTree();
      return;
    }
    if (b.dataset.select) { ui.set({ selection: { type: 'item', id: b.dataset.select } }); return; }
    if (b.dataset.hide) { setItemFlag(store, [b.dataset.hide], 'hidden'); return; }
    if (b.dataset.lock) { setItemFlag(store, [b.dataset.lock], 'locked'); return; }
    if (b.dataset.ductSelect) { ui.set({ selection: { type: 'duct', id: b.dataset.ductSelect, segment: null, vertex: null } }); return; }
    if (b.dataset.ductHide) { setDuctFlag(store, [b.dataset.ductHide], 'hidden'); return; }
    if (b.dataset.ductLock) { setDuctFlag(store, [b.dataset.ductLock], 'locked'); return; }
    if (b.dataset.rename) { renaming = b.dataset.rename; render(); }
  };
  // Enter로 확정하면 다시 그리는 도중 focusout도 터지므로 두 번 커밋되지 않게 막는다
  // (두 번 커밋되면 undo가 두 단계가 된다).
  let committing = false;
  const commit = input => {
    const id = input.dataset.name;
    if (committing || renaming !== id) return;
    committing = true;
    renaming = null;
    try { updateItem(store, id, { name: input.value.trim() }); } finally { committing = false; }
    render(); // 스토어 변경으로도 그려지지만 이름이 같을 때를 위해 직접 한 번 더
  };
  const onKeyDown = ev => {
    if (!ev.target.dataset?.name) return;
    if (ev.key === 'Enter') commit(ev.target);
    else if (ev.key === 'Escape') { renaming = null; render(); }
  };
  const onBlur = ev => { if (ev.target.dataset?.name) commit(ev.target); };

  container.addEventListener('click', onClick);
  container.addEventListener('keydown', onKeyDown);
  container.addEventListener('focusout', onBlur);
  const onChange = ev => {
    if (ev.target.name === 'showHidden') { ui.set({ showHidden: ev.target.checked }); }
  };
  container.addEventListener('change', onChange);
  // 검색은 타이핑마다 좁힌다(change는 확정까지 기다린다 — 그사이 목록이 옛것이다).
  // 한글 조합 중(ev.isComposing)에는 거르지 않는다: keymap.js도 같은 규칙을 쓴다. 조합이 끝나면
  // compositionend가 한 번 맞춰 준다(브라우저에 따라 그 뒤의 input이 늦거나 없다).
  const onInput = ev => { if (ev.target.name === 'q' && !ev.isComposing) { query = ev.target.value; renderTree(); } };
  container.addEventListener('input', onInput);
  const onCompEnd = ev => { if (ev.target.name === 'q') { query = ev.target.value; renderTree(); } };
  container.addEventListener('compositionend', onCompEnd);
  // <details>의 접힘은 사용자 기억이다: 다시 그려도 유지된다(스토어가 아니라 패널이 들고 있다 —
  // 접힘은 프로젝트 파일에 저장하지 않는다).
  const onToggle = ev => { const d = ev.target.closest?.('details[data-room]'); if (d) openState.set(d.dataset.room, d.open); };
  container.addEventListener('toggle', onToggle, true);   // toggle은 버블하지 않는다 → 캡처로 받는다
  const unsubs = [store.subscribe(render), ui.subscribe(render)];
  render();
  return {
    // 레일 탭으로 패널을 여는 순간에는 스토어도 ui도 바뀌지 않아 render()가 돌지 않는다(§17.6(3)).
    // 셸이 onPanelShow로 알려 주면 "마지막으로 스크롤한 선택" 기억을 비우고 한 번 다시 그린다.
    reveal() { lastSel = ''; render(); },
    destroy() { unsubs.forEach(u => u()); container.removeEventListener('click', onClick); container.removeEventListener('keydown', onKeyDown); container.removeEventListener('focusout', onBlur); container.removeEventListener('change', onChange); container.removeEventListener('input', onInput); container.removeEventListener('compositionend', onCompEnd); container.removeEventListener('toggle', onToggle, true); container.innerHTML = ''; },
  };
}

// 제품과 덕트를 한 단계로 함께 켜고 끈다(각각 기록하면 undo가 두 번 필요해진다).
// 바뀐 개수를 돌려준다: 결과 토스트가 그 수를 말하고, 0이면 트랜잭션도 열지 않는다(빈 단계 금지).
// scope(Set of id)를 주면 그 안에만 적용한다 — 검색 중 "화면에 보이는 행만"이다(리뷰 I-3).
// null이면 층 전체(예전 동작 그대로).
export function hideAll(store, floor, hidden, scope = null) {
  const inScope = id => !scope || scope.has(id);
  const items = (floor.items ?? []).filter(i => inScope(i.id) && !!i.hidden !== !!hidden).map(i => i.id);
  const ducts = (floor.ducts ?? []).filter(d => inScope(d.id) && !!d.hidden !== !!hidden).map(d => d.id);
  if (!items.length && !ducts.length) return { items: 0, ducts: 0 };
  store.beginTransaction();
  if (items.length) setItemFlag(store, items, 'hidden', hidden, { record: false });
  if (ducts.length) setDuctFlag(store, ducts, 'hidden', hidden, { record: false });
  store.endTransaction();
  return { items: items.length, ducts: ducts.length };
}
