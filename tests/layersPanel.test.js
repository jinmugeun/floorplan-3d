// @vitest-environment jsdom
import { describe, test, expect } from 'vitest';
import { createStore } from '../src/state/store.js';
import { createUiState } from '../src/state/uistate.js';
import { createEmptyProject, activeFloor, createItem } from '../src/state/schema.js';
import { addWalls, addItem, updateRoom, setItemFlag } from '../src/state/floorOps.js';
import { rectWalls } from '../src/geom/walls.js';
import { productById } from '../src/products/catalog.js';
import { createLayersPanel, ductRoomId, hideAll } from '../src/ui/layersPanel.js';
import { LAYERS_HIDDEN, LAYERS_SHOWN } from '../src/ui/messages.js';
import { LAYER_SEARCH_PH, COLLAPSE_ALL, EXPAND_ALL } from '../src/ui/layersHeader.js';
import { addDuct } from '../src/state/ductOps.js';
import { pointInPolygon } from '../src/geom/rooms.js';
import { roomAt, roomAirflow } from '../src/vent/airflow.js';

function setup() {
  const store = createStore(createEmptyProject()), ui = createUiState();
  addWalls(store, rectWalls([0, 0], [4000, 3000], 200));
  updateRoom(store, activeFloor(store.get()).rooms[0].id, { name: '가열조리실' });
  const inRoom = addItem(store, createItem(productById('sofa-3'), { pos: [2000, 1500] }));
  const outside = addItem(store, createItem(productById('chair-dining'), { pos: [9000, 9000] }));
  const el = document.createElement('div'); document.body.appendChild(el);
  const panel = createLayersPanel(el, { store, ui });
  return { store, ui, el, panel, inRoom, outside };
}
const click = (el, sel) => el.querySelector(sel).dispatchEvent(new MouseEvent('click', { bubbles: true }));
const item = (store, id) => activeFloor(store.get()).items.find(i => i.id === id);

describe('레이어 패널', () => {
  test('방별로 묶고 방 밖 제품은 미지정으로 모은다', () => {
    const { el } = setup();
    const rooms = [...el.querySelectorAll('.layer-room')];
    expect(rooms).toHaveLength(2);
    expect(rooms[0].textContent).toContain('가열조리실');
    expect(rooms[0].textContent).toContain('m²');
    expect(rooms[0].querySelectorAll('.layer-item')).toHaveLength(1);
    expect(rooms[1].textContent).toContain('미지정');
    expect(rooms[1].textContent).toContain('식탁 의자');
  });

  test('이름을 클릭하면 캔버스에서 선택된다', () => {
    const { ui, el, inRoom } = setup();
    click(el, `[data-select="${inRoom}"]`);
    expect(ui.get().selection).toEqual({ type: 'item', id: inRoom });
  });

  test('눈과 자물쇠 버튼이 숨김·잠금을 토글한다', () => {
    const { store, el, inRoom } = setup();
    click(el, `[data-hide="${inRoom}"]`);
    expect(item(store, inRoom).hidden).toBe(true);
    click(el, `[data-hide="${inRoom}"]`);
    expect(item(store, inRoom).hidden).toBe(false);
    click(el, `[data-lock="${inRoom}"]`);
    expect(item(store, inRoom).locked).toBe(true);
  });

  test('✎로 이름을 바꾼다', () => {
    const { store, el, inRoom } = setup();
    click(el, `[data-rename="${inRoom}"]`);
    const input = el.querySelector(`input[data-name="${inRoom}"]`);
    expect(input).not.toBeNull();
    input.value = '거실 소파';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(item(store, inRoom).name).toBe('거실 소파');
    expect(el.textContent).toContain('거실 소파');
  });

  test('이름 변경은 한 단계만 기록한다(undo 한 번에 되돌아간다)', () => {
    const { store, el, inRoom } = setup();
    const before = item(store, inRoom).name;
    click(el, `[data-rename="${inRoom}"]`);
    const input = el.querySelector(`input[data-name="${inRoom}"]`);
    input.value = '거실 소파';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    input.dispatchEvent(new FocusEvent('focusout', { bubbles: true })); // Enter 뒤 포커스가 빠져도 다시 커밋하지 않는다
    expect(item(store, inRoom).name).toBe('거실 소파');
    store.undo();
    expect(item(store, inRoom).name).toBe(before);
  });

  // 예전에는 "모두 보기" 체크박스 하나였다(상태 거울 + 파괴적 스위치 — 감사 §20). 두 버튼으로 갈렸다.
  test('[모두 숨기기]·[모두 보이기] 버튼이 전체 숨김·보이기를 한다', () => {
    const { store, el } = setup();
    click(el, '[name="hideAll"]');
    expect(activeFloor(store.get()).items.every(i => i.hidden)).toBe(true);
    click(el, '[name="showAll"]');
    expect(activeFloor(store.get()).items.every(i => !i.hidden)).toBe(true);
  });

  test('숨긴 항목 보기를 끄면 숨긴 제품이 목록에서 빠진다', () => {
    const { el, inRoom } = setup();
    expect(el.textContent).toContain('숨긴 항목 보기');   // 제품과 덕트를 함께 거른다
    click(el, `[data-hide="${inRoom}"]`);
    expect(el.querySelectorAll('.layer-item')).toHaveLength(2);
    const f = el.querySelector('input[name="showHidden"]');
    f.checked = false; f.dispatchEvent(new Event('change', { bubbles: true }));
    expect(el.querySelectorAll('.layer-item')).toHaveLength(1);
  });

  test('숨긴 제품은 목록에서 흐리게 표시된다', () => {
    const { el, inRoom } = setup();
    click(el, `[data-hide="${inRoom}"]`);
    expect(el.querySelector(`.layer-item[data-id="${inRoom}"]`).classList.contains('off')).toBe(true);
  });

  test('destroy 후에는 스토어 변경에 반응하지 않는다', () => {
    const { store, el, panel } = setup();
    panel.destroy();
    addItem(store, createItem(productById('bed-queen'), { pos: [1000, 1000] }));
    expect(el.querySelectorAll('.layer-item')).toHaveLength(0);
  });

  test('덕트가 첫 점이 든 방 아래에 뜨고 보기·잠금이 동작한다', () => {
    const { store, ui, el } = setup();
    addDuct(store, { id: 'd1', kind: 'supply', system: 'OA', points: [[2000, 1500], [3000, 1500]], segments: [{ w: 500, h: 300, z: 2700 }] });
    addDuct(store, { id: 'd2', kind: 'exhaust', points: [[9000, 9000], [9000, 10000]] });   // 방 밖 → 미지정
    const f0 = activeFloor(store.get());
    expect(ductRoomId(f0, f0.ducts[0])).toBe(f0.rooms[0].id);
    expect(ductRoomId(f0, f0.ducts[1])).toBeNull();
    const rooms = [...el.querySelectorAll('.layer-room')];
    expect(rooms[0].textContent).toContain('덕트 급기 · OA');
    expect(rooms[0].textContent).toContain('1000');                       // 총 길이 1000 mm
    expect(rooms.at(-1).textContent).toContain('덕트 배기');
    el.querySelector('[data-duct-hide="d1"]').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(activeFloor(store.get()).ducts.find(d => d.id === 'd1').hidden).toBe(true);
    el.querySelector('[data-duct-lock="d1"]').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(activeFloor(store.get()).ducts.find(d => d.id === 'd1').locked).toBe(true);
    el.querySelector('[data-duct-select="d1"]').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(ui.get().selection).toEqual({ type: 'duct', id: 'd1', segment: null, vertex: null });
  });

  // 방 폴리곤은 벽 **중심선**이라 벽에 붙은 후드·벽팬의 중심은 경계 위에 놓인다. 판정을 roomAt으로
  // 모으지 않으면(맨손 pointInPolygon) 같은 후드가 풍량 표에는 그 방에 세어지면서 레이어 트리에서는
  // '미지정'으로 빠진다 — 두 표가 같은 방을 말하는지 여기서 못 박는다(소수 좌표).
  test('경계(벽 중심선)에 놓인 설비도 풍량 표와 같은 방에 묶인다', () => {
    const { store, el } = setup();
    const f = activeFloor(store.get());
    const room = f.rooms[0];
    // 아래쪽 벽에 붙은 설비의 중심: 폴리곤(= 벽 중심선)에서 0.5 mm 밖 — 벽 두께 200의 절반 안쪽이다.
    const onWall = [2000.5, room.points[0][1] - 0.5];
    expect(pointInPolygon(onWall, room.points)).toBe(false);   // 맨손 판정은 방 밖으로 본다
    expect(roomAt(onWall, f.rooms, f.walls)?.id).toBe(room.id);
    const hood = addItem(store, createItem(productById('hood-box-filter'), { pos: onWall }));
    const rooms = [...el.querySelectorAll('.layer-room')];
    expect(rooms[0].textContent).toContain('가열조리실');
    expect(rooms[0].querySelector(`.layer-item[data-id="${hood}"]`)).toBeTruthy();
    // 풍량 표도 같은 방에 센다: '미배치' 줄이 생기지 않는다(두 표가 어긋나면 여기서 갈린다).
    const air = roomAirflow(activeFloor(store.get()));
    expect(air.find(r => r.roomId === room.id).EA).toBeGreaterThan(0);
    expect(air.some(r => r.roomId === null)).toBe(false);
  });

  test('"모두 보이기"가 제품과 덕트를 한 단계로 함께 켠다', () => {
    const { store, el, inRoom } = setup();
    // 제품과 덕트를 **둘 다** 숨겨 두어야 둘 다 같은 트랜잭션에 든다(바뀌지 않는 것은 단계에 넣지 않는다).
    addDuct(store, { id: 'd1', points: [[2000, 1500], [3000, 1500]], hidden: true });
    setItemFlag(store, [inRoom], 'hidden', true);
    click(el, '[name="showAll"]');
    const f = activeFloor(store.get());
    expect(f.items.every(i => !i.hidden)).toBe(true);
    expect(f.ducts.every(d => !d.hidden)).toBe(true);
    expect(document.body.textContent).toContain(LAYERS_SHOWN(1, 1));      // 제품 1 · 덕트 1
    store.undo();                                                        // 한 번의 undo가 둘 다 되돌린다
    const f2 = activeFloor(store.get());
    expect(f2.ducts[0].hidden).toBe(true);
    expect(f2.items.find(i => i.id === inRoom).hidden).toBe(true);
  });

  // 접힘은 스토어가 아니라 패널이 들고 있다(openState). 캡처 단계 toggle 리스너 하나가 유일한 배선이라
  // 재렌더(innerHTML 통째 교체) 뒤에도 살아남는지 여기서 못 박는다.
  test('방 노드의 접힘·펼침은 다시 그려도 유지된다', () => {
    const { store, el, inRoom, outside } = setup();
    const room = () => el.querySelector('details[data-room]');
    const setOpen = open => { const d = room(); d.open = open; d.dispatchEvent(new Event('toggle')); };
    setOpen(false);
    setItemFlag(store, [inRoom], 'locked', true);        // 스토어 변경 → 재렌더
    expect(room().open).toBe(false);
    setOpen(true);
    setItemFlag(store, [outside], 'locked', true);
    expect(room().open).toBe(true);
  });

  test('[모두 숨기기]는 한 단계로 숨기고 결과를 알린다(§16.3 · 감사 §20)', () => {
    const { store, el, inRoom, outside } = setup();
    const before = store.get();
    el.querySelector('[name="hideAll"]').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(item(store, inRoom).hidden).toBe(true);
    expect(item(store, outside).hidden).toBe(true);
    expect(document.body.textContent).toContain(LAYERS_HIDDEN(2, 0));
    store.undo();                                              // 한 번에 되돌아온다
    expect(item(store, inRoom).hidden).toBeFalsy();
    expect(store.get()).toEqual(before);
  });

  test('[모두 보이기]는 숨긴 것만 되살린다(바뀐 것이 없으면 단계도 없다)', () => {
    const { store, el, inRoom } = setup();
    el.querySelector('[name="hideAll"]').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    const canUndo = store.canUndo();
    el.querySelector('[name="showAll"]').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(item(store, inRoom).hidden).toBeFalsy();
    expect(document.body.textContent).toContain(LAYERS_SHOWN(2, 0));
    // 이미 다 보이는 상태에서 다시 누르면 아무 일도 없다(빈 undo 단계 금지 — Global Constraints).
    const at = store.get();
    el.querySelector('[name="showAll"]').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(store.get()).toBe(at);
    expect(canUndo).toBe(true);
  });

  test('선택된 대상의 행이 강조되고 선택이 바뀔 때만 화면 안으로 스크롤된다(감사 §21)', () => {
    const { store, ui, el, inRoom, outside } = setup();
    const seen = [];
    const orig = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = function stub(opts) { seen.push([this.dataset.id, opts]); };
    try {
      ui.set({ selection: { type: 'item', id: inRoom } });
      const row = el.querySelector(`.layer-item[data-id="${inRoom}"]`);
      expect(row.classList.contains('on')).toBe(true);
      expect(seen).toEqual([[inRoom, { block: 'nearest' }]]);            // 선택 한 번 → 스크롤 한 번
      // 선택과 무관한 변경(다른 행의 👁·잠금, 캔버스 드래그)은 사용자가 보던 자리를 빼앗지 않는다.
      setItemFlag(store, [outside], 'hidden', true);
      setItemFlag(store, [outside], 'locked', true);
      expect(seen).toHaveLength(1);
    } finally {
      if (orig) Element.prototype.scrollIntoView = orig; else delete Element.prototype.scrollIntoView;
    }
  });

  test('패널이 숨겨진 동안의 선택은 패널이 열릴 때 스크롤된다(재리뷰 N-1)', () => {
    const { store, ui, el, inRoom } = setup();
    const section = document.createElement('section'); section.hidden = true;
    el.parentElement ? el.parentElement.insertBefore(section, el) : document.body.appendChild(section);
    section.appendChild(el);
    const seen = [];
    const orig = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = function stub(opts) { seen.push([this.dataset.id, opts]); };
    try {
      ui.set({ selection: { type: 'item', id: inRoom } });     // 숨겨진 패널: 스크롤도 기억도 없다
      expect(seen).toHaveLength(0);
      section.hidden = false;
      setItemFlag(store, [inRoom], 'locked', true);             // 열린 뒤 첫 렌더 → 그 선택으로 스크롤
      expect(seen).toEqual([[inRoom, { block: 'nearest' }]]);
      setItemFlag(store, [inRoom], 'locked', false);            // 같은 선택의 다음 렌더는 스크롤 없음
      expect(seen).toHaveLength(1);
    } finally {
      if (orig) Element.prototype.scrollIntoView = orig; else delete Element.prototype.scrollIntoView;
    }
  });

  test('접힌 패널(.collapsed) 동안의 선택도 펼칠 때 스크롤된다(재리뷰 N-1b)', () => {
    const { store, ui, el, inRoom } = setup();
    const panel = document.createElement('div'); panel.id = 'panel'; panel.className = 'collapsed';
    el.parentElement ? el.parentElement.insertBefore(panel, el) : document.body.appendChild(panel);
    panel.appendChild(el);
    const seen = [];
    const orig = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = function stub(opts) { seen.push([this.dataset.id, opts]); };
    try {
      ui.set({ selection: { type: 'item', id: inRoom } });
      expect(seen).toHaveLength(0);
      panel.classList.remove('collapsed');
      setItemFlag(store, [inRoom], 'locked', true);
      expect(seen).toEqual([[inRoom, { block: 'nearest' }]]);
    } finally {
      if (orig) Element.prototype.scrollIntoView = orig; else delete Element.prototype.scrollIntoView;
    }
  });

  test('"숨긴 항목 보기"가 꺼져 있어도 되살릴 줄이 남는다(감사 §26)', () => {
    const { store, ui, el, inRoom } = setup();
    setItemFlag(store, [inRoom], 'hidden', true);
    ui.set({ showHidden: false });
    expect(el.querySelector(`.layer-item[data-id="${inRoom}"]`)).toBeNull();
    const line = el.querySelector('.layer-hidden button');
    expect(line.textContent).toBe('숨긴 항목 1개 — 숨긴 항목 보기');
    line.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(ui.get().showHidden).toBe(true);
    expect(el.querySelector(`.layer-item[data-id="${inRoom}"]`)).not.toBeNull();
  });

  test('hideAll은 바뀐 개수만 돌려준다', () => {
    const { store } = setup();
    const f = () => activeFloor(store.get());
    expect(hideAll(store, f(), true)).toEqual({ items: 2, ducts: 0 });
    expect(hideAll(store, f(), true)).toEqual({ items: 0, ducts: 0 });   // 이미 숨겨져 있다
    expect(hideAll(store, f(), false)).toEqual({ items: 2, ducts: 0 });
  });

  // §17.6(감사 §28): 트리를 건너뛸 길 — 검색 칸은 패널 지역 상태다(스토어를 건드리지 않는다).
  test('검색 칸이 트리를 좁히고 타이핑 중 포커스를 지킨다', () => {
    const { el, store } = setup();
    const q = el.querySelector('[name="q"]');
    expect(q.placeholder).toBe(LAYER_SEARCH_PH);
    q.focus();
    q.value = '의자';
    q.dispatchEvent(new Event('input', { bubbles: true }));
    const rows = [...el.querySelectorAll('.layer-item')];
    expect(rows).toHaveLength(1);
    expect(rows[0].textContent).toContain('식탁 의자');
    expect(el.querySelectorAll('.layer-room')).toHaveLength(1);   // 남는 행이 없는 방 노드는 그리지 않는다
    expect(document.activeElement.name).toBe('q');
    expect(document.activeElement.value).toBe('의자');
    expect(store.canUndo()).toBe(true);                            // 검색은 되돌릴 단계가 아니다(도면 생성 단계만 남아 있다)
  });

  test('[방 모두 접기]가 방 노드를 모두 접고 라벨이 바뀐다', () => {
    const { el } = setup();
    const btn = () => el.querySelector('[name="collapseAll"]');
    expect(btn().textContent).toBe(COLLAPSE_ALL);
    click(el, '[name="collapseAll"]');
    expect([...el.querySelectorAll('details')].every(d => !d.open)).toBe(true);
    expect(btn().textContent).toBe(EXPAND_ALL);
    click(el, '[name="collapseAll"]');
    expect([...el.querySelectorAll('details')].every(d => d.open)).toBe(true);
  });

  // §17.6(3) · §(d)의 §16.3: 레일 탭을 여는 순간에는 render()가 돌지 않아 영영 스크롤되지 않았다.
  test('reveal()이 선택 행을 보이는 곳으로 스크롤한다', () => {
    const seen = [];
    const before = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = function () { seen.push(this); };   // jsdom에는 없다
    try {
      const { ui, panel, inRoom } = setup();
      ui.set({ selection: { type: 'item', id: inRoom } });
      expect(seen).toHaveLength(1);
      seen.length = 0;
      panel.reveal();
      expect(seen).toHaveLength(1);
      expect(seen[0].classList.contains('on')).toBe(true);
      expect(seen[0].closest('details').open).toBe(true);     // 닫힌 방 안이면 스크롤이 무동작이다(리뷰 M-6)
    } finally { Element.prototype.scrollIntoView = before; }
  });

  // 리뷰 C-1: 자동 접힘(행 31개 이상)이 이 태스크의 감사 항목을 무력화했다 — 닫힌 <details> 안의
  // 행에는 scrollIntoView가 아무 일도 하지 않아(실측: scrollTop 0 그대로) 선택 강조조차 보이지
  // 않았다. 강당중 샘플이 49행이라 **대표 도면에서 늘** 이 경우다.
  test('49행 도면: 선택 스크롤과 reveal()이 자동 접힌 방을 먼저 편다(리뷰 C-1)', () => {
    const seen = [];
    const before = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = function () { seen.push(this); };
    try {
      const { store, ui, el, panel, inRoom } = setup();
      for (let i = 0; i < 47; i++) addItem(store, createItem(productById('chair-dining'), { pos: [500 + i * 10, 600] }));
      expect(activeFloor(store.get()).items).toHaveLength(49);          // 강당중 샘플과 같은 크기(문턱 30 초과)
      const row = () => el.querySelector(`.layer-item[data-id="${inRoom}"]`);
      expect(row().closest('details').open).toBe(false);                // 자동 접힘: 방이 닫힌 채 열린다
      // ① 플랜 8의 선택 스크롤
      seen.length = 0;
      ui.set({ selection: { type: 'item', id: inRoom } });
      expect(row().closest('details').open).toBe(true);
      expect(seen).toHaveLength(1);
      expect(seen[0].dataset.id).toBe(inRoom);
      // ② 레일 탭으로 패널을 여는 길(reveal). 다시 접어 두고 부른다.
      click(el, '[name="collapseAll"]');
      expect(row().closest('details').open).toBe(false);
      seen.length = 0;
      panel.reveal();
      expect(row().closest('details').open).toBe(true);
      expect(seen).toHaveLength(1);
      expect(seen[0].classList.contains('on')).toBe(true);
    } finally { Element.prototype.scrollIntoView = before; }
  });

  // 리뷰 I-1: 라벨(anyOpen)은 걸러진 방으로, 동작은 전체 방으로 재던 자리 — 검색 중에 버튼이
  // 죽은 클릭이 되고(누른 표시가 화면에 없다) 화면에 없는 방은 말없이 접혔다.
  test('검색 중 [방 모두 펴기]는 라벨과 같은 집합(보이는 방)에만 적용된다(리뷰 I-1)', () => {
    const { el } = setup();
    const btn = () => el.querySelector('[name="collapseAll"]');
    const q = el.querySelector('[name="q"]');
    click(el, '[name="collapseAll"]');                                  // 모두 접는다
    expect(btn().textContent).toBe(EXPAND_ALL);
    const kitchen = el.querySelector('details[data-room]:not([data-room="none"])');
    const kitchenId = kitchen.dataset.room;
    kitchen.open = true; kitchen.dispatchEvent(new Event('toggle'));    // 검색 결과 **밖**의 방만 펴 둔다
    q.value = '의자';
    q.dispatchEvent(new Event('input', { bubbles: true }));
    expect(el.querySelectorAll('details[data-room]')).toHaveLength(1);  // 보이는 방은 '미지정' 하나
    expect(btn().textContent).toBe(EXPAND_ALL);
    click(el, '[name="collapseAll"]');
    expect(el.querySelector('details[data-room="none"]').open).toBe(true);   // 죽은 클릭이 아니다
    expect(btn().textContent).toBe(COLLAPSE_ALL);                       // 라벨도 따라간다
    q.value = '';
    q.dispatchEvent(new Event('input', { bubbles: true }));
    expect(el.querySelector(`details[data-room="${kitchenId}"]`).open).toBe(true);   // 안 보이던 방은 그대로
  });

  // 리뷰 I-2: 키 입력마다 container.innerHTML을 갈면 포커스 중인 검색 입력 **노드 자체**가
  // 교체되어 한글 조합이 끊긴다(`후드`가 `ㅎㅜㄷㅡ`로 남는다). 머리 한 줄은 두고 트리만 그린다.
  test('검색 타이핑은 트리만 다시 그리고 IME 조합 중에는 거르지 않는다(리뷰 I-2)', () => {
    const { el } = setup();
    const q = el.querySelector('[name="q"]');
    q.focus();
    const composing = new Event('input', { bubbles: true });
    Object.defineProperty(composing, 'isComposing', { value: true });
    q.value = 'ㅇ';
    q.dispatchEvent(composing);
    expect(el.querySelectorAll('.layer-item')).toHaveLength(2);         // 조합 중에는 트리를 건드리지 않는다
    q.value = '의자';
    q.dispatchEvent(new Event('input', { bubbles: true }));
    expect(el.querySelector('[name="q"]')).toBe(q);                     // 같은 입력 노드 그대로(조합이 살아남는다)
    expect(document.activeElement).toBe(q);
    expect(el.querySelectorAll('.layer-item')).toHaveLength(1);
    // 조합이 끝나면 compositionend가 한 번 맞춰 준다(그 뒤 input이 늦거나 없는 브라우저 대비).
    q.value = '소파';
    q.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }));
    expect(el.querySelector('[name="q"]')).toBe(q);
    expect([...el.querySelectorAll('.layer-item')][0].textContent).toContain('소파');
  });

  // 리뷰 I-3: 검색으로 3행만 보이는 화면에서 [모두 숨기기]가 46행까지 숨기면 파괴적 동작의
  // 범위를 화면이 설명하지 못한다(되돌리기로 복구는 되지만 결과를 볼 길이 없다).
  test('검색 중 [모두 숨기기]는 보이는 행에만 적용되고 토스트도 그 수를 센다(리뷰 I-3)', () => {
    const { store, el, inRoom, outside } = setup();
    // 스토어가 바뀌면 머리 한 줄까지 다시 그려지므로(구독 render) 검색 칸은 그때그때 다시 찾는다.
    const type = text => { const q = el.querySelector('[name="q"]'); q.value = text; q.dispatchEvent(new Event('input', { bubbles: true })); };
    type('의자');                                                       // '식탁 의자'(미지정) 한 행만 보인다
    expect(el.querySelectorAll('.layer-item')).toHaveLength(1);
    click(el, '[name="hideAll"]');
    expect(item(store, outside).hidden).toBe(true);
    expect(item(store, inRoom).hidden).toBeFalsy();                     // 걸러진 행은 건드리지 않는다
    expect(document.body.textContent).toContain(LAYERS_HIDDEN(1, 0));
    store.undo();                                                      // 한 단계다
    expect(item(store, outside).hidden).toBeFalsy();
    // 질의가 비면 예전 그대로 층 전체다.
    type('');
    click(el, '[name="hideAll"]');
    expect(activeFloor(store.get()).items.every(i => i.hidden)).toBe(true);
    store.undo();
    expect(activeFloor(store.get()).items.every(i => !i.hidden)).toBe(true);
  });
});

// §17.11(3) · 감사 §48: 두 버튼에 title이 없었고, 아무것도 없는데 [모두 숨기기]가 활성이었다.
test('[모두 보이기]·[모두 숨기기]는 대상이 0이면 비활성이고 사유를 말한다', async () => {
  const { ALL_SHOW_TITLE, ALL_HIDE_TITLE } = await import('../src/ui/layersTree.js');
  const { WHY_NOTHING_TO_SHOW, WHY_NOTHING_TO_HIDE } = await import('../src/ui/messages.js');
  const { el, store } = setup();                       // 제품 2개(숨긴 것 0개)
  const show = () => el.querySelector('[name="showAll"]');
  const hide = () => el.querySelector('[name="hideAll"]');
  expect(hide().disabled).toBe(false);
  expect(hide().title).toBe(ALL_HIDE_TITLE);
  expect(show().disabled).toBe(true);                   // 숨긴 것이 없다
  expect(show().title).toBe(WHY_NOTHING_TO_SHOW);
  hide().dispatchEvent(new MouseEvent('click', { bubbles: true }));
  expect(show().disabled).toBe(false);
  expect(show().title).toBe(ALL_SHOW_TITLE);
  expect(hide().disabled).toBe(true);
  expect(hide().title).toBe(WHY_NOTHING_TO_HIDE);
  expect(store.canUndo()).toBe(true);
});
