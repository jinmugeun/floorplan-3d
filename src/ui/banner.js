// 캔버스 위쪽 안내 행(§14.8). shell.js에서 그대로 옮겼다("더하기 전에 나눈다" — 셸이 300줄 규칙에
// 닿아서 배너 한 덩어리를 뺐다). 여기는 문구 우선순위와 "드래그 중에는 행을 늘리고 줄이지 않는다"는
// 규칙만 안다: 스토어·ui 구독은 셸이 하고, 바뀔 때마다 render()를 부른다.
import { esc } from '../util/html.js';
import { activeFloor } from '../state/schema.js';
import { memoCollisions } from '../geom/collide.js';
import { COLLISION_BANNER, COLLISION_BANNER_QUIET, FP_BANNER, FP_EXIT, FIRST_ROOM_HINT, DXF_OPEN_ENDS, DXF_OPEN_ENDS_VIEW } from './messages.js';

// 드래그가 끝났다고 볼 이벤트. lostpointercapture까지 받아 두면 캡처가 풀리는 경로도 놓치지 않는다.
export const DRAG_END_EVENTS = ['pointerup', 'pointercancel', 'lostpointercapture'];

// 배너는 한 번에 하나만 보인다: ui 상태(1인칭 찍기 · 마감재 적용 · 단일 공간 모드)가 도구 안내보다 앞선다.
const exitSolo = '<button type="button" id="btnExitSolo">도면 전체 보기</button>';
const exitFp = `<button type="button" id="btnExitFp">${FP_EXIT}</button>`;

// el = #banner, stack = #canvasStack(드래그 감지), tool = 지금 켜진 도구를 돌려주는 함수.
export function createBanner({ store, ui, el, stack = null, tool = () => null, onExitFp = () => {}, onFirstRoom = () => {} }) {
  // 캔버스 위에서 포인터를 누르고 있는 동안을 "드래그 중"으로 본다(아래 주석 참고).
  let dragging = false, pending = false, last = null;
  // 충돌은 드래그 밖에서도 알린다(§14.8). 계산은 memoCollisions의 캐시를 그대로 쓰므로(아이템 배열
  // 참조가 바뀔 때만 계산한다) 배너를 자주 그려도 비용이 늘지 않는다. 보기 옵션 "충돌 감지"를 끄면
  // 빨간 테두리가 없으므로 문구도 없다(무엇을 옮기라는 말인지 알 수 없게 되기 때문이다).
  const collisionCount = () => {
    const s = store.get();
    if (s.view?.v2?.collision === false) return 0;
    return memoCollisions(activeFloor(s)?.items ?? []).size;
  };
  // 충돌 문구는 "빨간 테두리 제품을 옮겨 주세요"다. 다만 "실시간 충돌 감지"(v2.collisionLive)를 끈 채로
  // 끌고 있는 동안에는 2D가 빨간 테두리를 감추므로(view2d.js), 그 사이에만 그 절을 뺀 문구를 쓴다.
  // 계획 7 §15.2부터 **아이템** 이동 드래그는 스토어를 건드리지 않아(프리뷰) 드래그 중에 이 render()가
  // 아예 돌지 않는다 — 이 분기가 실제로 쓰이는 것은 덕트·벽 드래그이고, 아이템 드래그의 배너 건수는
  // pointerup 뒤 한 번에 갱신된다(드래그 중 충돌은 빨간 테두리가 알린다).
  // 배너를 감추지는 않는다 — §14.8이 드래그 밖에서도 충돌을 배너로 알리라고 하므로 collisionLive로
  // 배너를 게이팅하면 드래그 밖에서까지 문구가 사라져 규격을 깬다(Task 8 리뷰 Minor 1).
  const collisionText = n => (dragging && store.get().view?.v2?.collisionLive === false ? COLLISION_BANNER_QUIET : COLLISION_BANNER)(n);
  function html(s) {
    if (s.fpPick) return '👆 1인칭으로 확인할 위치를 클릭해주세요. [Esc]로 취소';
    // 1인칭 중에는 이 배너가 상주한다(§15.1): 조작법과 탈출 수단이 화면에 늘 있어야 한다.
    if (s.mode === 'fp') return `${esc(FP_BANNER)} ${exitFp}`;
    // 단일 공간 모드 중에도 모드를 빠져나갈 버튼을 남긴다.
    // 키 표기는 전역 규칙대로 [Esc] 한 가지다(예전 대문자 표기를 여기서 바로잡는다 — Task 10의
    // grep이 소스에 대문자 표기가 하나도 없음을 확인하므로 주석에도 쓰지 않는다).
    // 이 문구는 shell.test.js의 기대값과 짝이다: 둘을 함께 고친다.
    if (s.matPick) return '🎨 재질을 적용할 면을 클릭해주세요. [Esc]를 누르면 종료됩니다.' + (s.soloRoom ? ` ${exitSolo}` : '');
    if (s.soloRoom) return `단일 공간 모드 ${exitSolo}`;
    const clashes = collisionCount();
    if (clashes) return esc(collisionText(clashes));
    // 누를 수 있는 것만 버튼이다(§16.5 · 감사 §39). onHintClick을 구현한 도구(덕트·경로 배열·배치·
    // 구조물)에서는 "메시지를 누르면 취소"가 실제로 동작하므로 버튼이고 — 키보드로도 닿아야 한다 —
    // 그러지 않는 도구(벽·방·삭제·보조선·측정)에서는 <span>이다: 예전에는 링크처럼 보이는 탭 스톱이
    // 생기고 눌러도 아무 일도 일어나지 않았다.
    const t = tool();
    if (t?.hint) {
      return typeof t.onHintClick === 'function'
        ? `<button type="button" class="hint" data-action="hintCancel">${esc(t.hint)}</button>`
        : `<span class="hint">${esc(t.hint)}</span>`;
    }
    // 가져온 도면에서 벽이 이어지지 않은 자리(§18.6). 도구 안내보다 뒤에 둔다 — 지금 하는 일이
    // 먼저다. 이 안내는 §18.10이 "자르지 않는다"고 못 박은 하나다: 이 도면은 원리적으로 자동으로
    // 닫히지 않으므로(식당–조리실 경계가 배식대다) 고칠 자리를 보여 주는 것이 기능의 결론이다.
    if (s.openEnds?.pts?.length) {
      return `<span class="hint">${esc(DXF_OPEN_ENDS(s.openEnds.pts.length))}</span> <button type="button" id="btnOpenEnds">${esc(DXF_OPEN_ENDS_VIEW)}</button>`;
    }
    // 온보딩을 닫은 뒤의 첫 방 유도(§16.12 · 감사 §47). 방이 없는 동안만 보이고, 첫 방이 생기면
    // app/firstRoomFit.js의 래치가 플래그를 끈다 — 그래서 새로 더한 빈 층에서 되살아나지 않는다.
    // §17.12(5) · 감사 §47: 가리키는 곳을 누를 수 있게 한다(§16.5가 만든 hint 버튼 경로 그대로).
    if (s.firstRoomHint && !(activeFloor(store.get())?.rooms?.length)) return `<button type="button" class="hint" data-action="firstRoom">${esc(FIRST_ROOM_HINT)}</button>`;
    return '';
  }
  function render(s = ui.get()) {
    const next = html(s);
    // 드래그 중에는 "행이 생기거나 사라지는" 변화만 pointerup까지 미룬다(내용만 바뀌는 갱신은
    // nowrap 한 줄이라 행 높이를 바꾸지 않으므로 그대로 반영한다).
    if (dragging && (!next) !== el.hidden) { pending = true; return; }
    if (next === last) return;   // 같은 문구를 다시 쓰면 배너 안 버튼(취소·도면 전체 보기)의 포커스가 날아간다
    last = next;
    el.hidden = !next;
    el.innerHTML = next;
    if (next.includes('btnExitSolo')) el.querySelector('#btnExitSolo').onclick = () => ui.set({ soloRoom: null });
    if (next.includes('btnExitFp')) el.querySelector('#btnExitFp').onclick = () => onExitFp();
    // [보기]는 index를 1 올리기만 한다(ui/는 뷰를 모른다). 카메라를 옮기는 쪽은
    // view2d/openEnds2d.js다. 문구가 그대로라 다음 render는 위 `next === last`에서 멈추고,
    // 그래서 이 핸들러와 버튼 포커스가 살아 있다.
    if (next.includes('btnOpenEnds')) el.querySelector('#btnOpenEnds').onclick = () => {
      const oe = ui.get().openEnds;
      if (oe?.pts?.length) ui.set({ openEnds: { ...oe, index: (oe.index ?? 0) + 1 } });
    };
  }
  // 왜 "미루기"를 골랐나(Task 8 리뷰 Important 1): #banner는 #canvasWrap의 레이아웃 행이라 비면 행이
  // 접히고(계획 4) 캔버스가 그만큼 커진다. 그래서 제품을 끄는 중에 충돌이 생기거나 풀리면 캔버스
  // 높이가 ~33 px 달라지고, 2D 좌표 변환이 캔버스 중심 기준이라 끌던 제품이 커서 아래에서 한 번 튄다.
  // (a) 행 높이를 늘 예약하는 안은 계획 4의 "비면 접힌다"(캔버스가 그만큼 커진다)를 깨고 아무 문구도
  // 없을 때 빈 노란 띠를 남긴다. 배너를 캔버스 위로 띄우는 안은 "캔버스 위에 떠서 클릭을 가로채는
  // 요소를 두지 않는다"(elementFromPoint 불변식)를 깬다. 그래서 행은 그대로 두고 드래그 중의 행
  // 변화만 미룬다 — 드래그 상태는 view2d를 import하지 않고(ui/는 view2d/를 모른다) 캔버스 영역의
  // 포인터 이벤트로 직접 본다(uistate에는 드래그 플래그가 없고, 만들면 view2d/tools를 고쳐야 한다).
  const onDown = () => { dragging = true; };
  // pointerup은 포인터 캡처 덕에 캔버스로 되돌아오지만, 창 밖에서 손을 떼는 경우까지 덮으려면
  // window에서 받아야 한다(놓친 pointerup 하나가 배너를 영구히 얼린다 — capture 단계로 확실히 받는다).
  const onUp = () => { if (!dragging) return; dragging = false; if (pending) { pending = false; render(); } };
  // 안내 문구를 누르면 도구가 스스로 취소한다(배치 도구의 "메시지를 누르면 취소").
  const onClick = ev => {
    const a = ev.target.dataset.action;
    if (a === 'hintCancel') tool()?.onHintClick?.();
    else if (a === 'firstRoom') onFirstRoom();
  };
  stack?.addEventListener('pointerdown', onDown);
  for (const t of DRAG_END_EVENTS) globalThis.addEventListener?.(t, onUp, true);
  el.addEventListener('click', onClick);
  return {
    render,
    destroy() {
      stack?.removeEventListener('pointerdown', onDown);
      for (const t of DRAG_END_EVENTS) globalThis.removeEventListener?.(t, onUp, true);
      el.removeEventListener('click', onClick);
    },
  };
}
