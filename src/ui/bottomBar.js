// 하단 바의 접기(§14.3 · §15.4). 3D 모드에서 컨트롤이 16개가 되면 1600 px에서도 넘쳐
// 가로·세로 스크롤바가 동시에 생겼다: 세로 넘침은 CSS로 막고(overflow-y: hidden),
// 가로로 넘치면 "더보기 ▾" 팝오버로 묶음을 옮긴다.
// 버튼은 다시 만들지 않고 **노드째로 옮긴다** — main.js·shell.js가 id로 걸어 둔
// 리스너가 그대로 살아 있어야 한다(HTML을 다시 그리면 전부 끊긴다).
//
// 접기는 **단계**로 나뉘고, 단계 표는 ui/bottomTiers.js가 갖는다(§17.2):
//   2D  1 = 3D 전용 묶음(카메라·햇빛·캡처·2D 투영·기즈모)   2 = 도면 잠금   3 = 단위(mm / ft·in)
//   3D  1 = 도면 잠금                                       2 = 단위        3 = 3D 전용 묶음
// **어느 표를 쓸지는 폭이 정한다**(§17.2 개정 · 리뷰 I-1): 두 순서로 각각 접어 보고 넘침이 가시는
// 단계에서 **바에 더 많은 묶음이 남는** 쪽을 쓴다(같으면 현재 모드의 순서가 이긴다).
// 모드 순서만 따르면 캔버스 672 px(창 1366)·3D에서 잠금 60 + 단위 118로는 1024 → 672를 만들지 못해
// 3단계까지 가 여섯 묶음이 **전부** 사라졌다. 같은 폭에서 2D 순서는 1단계(3D 묶음 385)만으로 572를
// 만들어 잠금·단위가 바에 남는다 — 3D 컨트롤은 어느 쪽이든 팝오버 안이므로 순수한 이득이다.
// 캔버스 897~1024 px에서는 모드 순서가 이긴다(3D 묶음 넷과 단위가 남고 잠금만 접힌다).
// 마크업의 data-overflow는 **선택자로만** 쓴다(값은 2D 기준 기본값으로 남을 뿐 여기서 읽지 않는다) —
// "3D 모드인데 3D 컨트롤부터 사라진다"가 사라진다(감사 §3·§32).
// 캔버스 506 px(창 1100)에서는 어느 순서로 가든 세 단계를 다 접어야 넘침이 가신다(둘 다 394 ≤ 506).
// 1단계 + 꼬리 라벨 아이콘화만으로는 133 px이 남아 sticky 꼬리가 늘 보여야 하는 단위 묶음을
// 94 px 덮었다(리뷰 I-1). §15.4는 "1366·1100 모두 겹침 0"을 요구하므로, 꼬리가
// sticky로 붙기 **전에** 다음 단계를 접는다.
// 그래도 넘치면(더 접을 것이 없으면) 꼬리를 sticky로 붙여 접힌 기능에 두 번의 클릭이 늘 닿게 한다.

import { tierOf } from './bottomTiers.js';
import { focusables, trapTab } from './dialogBase.js';

export const BOTTOM_HYSTERESIS = 64;

// 접을지 말지: 펼친 상태에서는 넘치면 접고, 접힌 상태에서는 "펼쳤을 때 필요했던 폭"보다
// hysteresis 이상 여유가 생겼을 때만 펼친다(딱 맞는 폭에서 접었다 펴기를 반복하지 않게).
export function compactNext({ compact = false, scrollWidth = 0, clientWidth = 0, fullWidth = 0, hysteresis = BOTTOM_HYSTERESIS } = {}) {
  if (!compact) return scrollWidth > clientWidth;
  return !(clientWidth >= fullWidth + hysteresis);
}

// getMode는 주입으로 받는다(ui/는 app/을 import하지 않는다): 셸이 () => ui.get().mode를 넘긴다.
export function createBottomBar(root, { measure = null, hysteresis = BOTTOM_HYSTERESIS, onOpen = () => {}, getMode = () => '3d' } = {}) {
  const bar = root?.querySelector?.('#bottombar') ?? null;
  const more = root?.querySelector?.('#bottomMore') ?? null;
  const btn = root?.querySelector?.('#btnBottomMore') ?? null;
  if (!bar || !more || !btn) return { sync() {}, isCompact: () => false, tier: () => 0, closeMore() {}, destroy() {} };
  // 되돌릴 자리를 "다음 형제" 하나가 아니라 **원래 순서 배열**로 기억한다: 단계별로 접으므로
  // 어떤 묶음이 팝오버에 남아 있는 동안 다른 묶음이 바로 돌아올 수 있고, 그때 기억해 둔
  // nextElementSibling이 아직 팝오버 안이면 insertBefore가 자리를 잃는다.
  // 접히는 묶음은 바의 직속 자식이다(shellHtml의 마크업 규칙 — 꼬리 안의 묶음은 접지 않는다).
  const order = [...bar.children];
  // data-overflow는 **선택자**로만 쓴다: 값은 읽지 않는다(마크업의 숫자를 고쳐도 동작이 바뀌지
  // 않는다 — 진실의 원천은 ui/bottomTiers.js 하나다). 단계는 아래 retier()가 sync마다 매긴다.
  const segs = order.filter(el => el.hasAttribute?.('data-overflow')).map(el => ({ el, tier: 1, count: 0 }));
  const modeKey = () => (getMode() === '2d' ? '2d' : '3d');
  const retier = key => { for (const s of segs) s.tier = tierOf(s.el.id, key); };
  const maxTier = () => segs.reduce((m, s) => Math.max(m, s.tier), 0);
  const ctl = el => [...el.querySelectorAll('button, select, input')];
  // 접기 판정에 영향을 주는 컨트롤 목록은 **한 번만** 모은다: 노드가 바 ↔ 팝오버를 오가므로
  // 매번 다시 모으면 순서가 바뀌어 서명이 달라진다. 더보기 버튼 자신은 뺀다(접힘에 따라
  // 켜지고 꺼지므로 서명에 넣으면 접은 직후 곧바로 재측정으로 펼쳐 버린다).
  const tracked = ctl(bar).filter(el => el !== btn);
  // 모드도 서명에 넣는다: 모드가 바뀌면 단계 표가 통째로 달라지므로 접힌 것을 먼저 다 펼쳐야 한다.
  const signature = () => `${modeKey()}|${tracked.map(el => (el.hidden ? '0' : '1')).join('')}`;
  let tier = 0, fullWidth = 0, sig = null;

  const size = () => (measure ? measure() : { scrollWidth: bar.scrollWidth, clientWidth: bar.clientWidth });
  // 공용 규칙을 그대로 쓴다(§17.2): [hidden] 조상 판정까지 같은 함수가 한다.
  const focusable = () => focusables(more)[0] ?? null;
  function closeMore() {
    const wasOpen = more.classList.contains('open');
    // 판정은 **닫기 직전에** 한다(감사 §4): 팝오버를 숨기면 브라우저가 포커스를 body로 옮겨
    // 닫은 뒤의 document.activeElement로는 "안에 있었는가"를 알 수 없다 → 포커스가 레일로 떨어졌다.
    const wasInside = wasOpen && more.contains(document.activeElement);
    more.classList.remove('open');
    if (!tier) more.hidden = true;
    btn.setAttribute('aria-expanded', 'false');
    if (wasInside && !btn.hidden) btn.focus();
  }
  // 되돌릴 자리: 원래 순서에서 자기 **다음으로 바에 남아 있는** 요소 앞에 넣는다.
  function place(el) {
    const i = order.indexOf(el);
    for (let j = i + 1; j < order.length; j++) if (order[j].parentElement === bar) return bar.insertBefore(el, order[j]);
    return bar.appendChild(el);
  }
  // n단계까지 접는다(0 = 다 펼친다). 앞에서부터 옮기면 팝오버 안 순서가 원래 순서와 같고,
  // 되돌릴 때는 **뒤에서부터** 넣어야 place()의 기준 요소가 이미 제자리에 있다.
  function setTier(n) {
    if (n === tier) return;
    tier = n;
    bar.classList.toggle('compact', n > 0);
    for (const s of segs) if (s.tier <= n) more.appendChild(s.el);
    for (let i = segs.length - 1; i >= 0; i--) if (segs[i].tier > n && segs[i].el.parentElement !== bar) place(segs[i].el);
    more.hidden = n === 0;
    closeMore();
  }
  // 묶음 자체의 hidden은 **폭 측정 전에** 고쳐야 한다: [hidden] { display: none !important }라
  // 묶음이 아직 숨어 있으면 안의 버튼이 막 드러나도 size()가 재는 scrollWidth에 안 잡힌다
  // (2D→3D 전환·기즈모 버튼 등장·ortho 이탈에서 접기가 한 박자 늦어졌던 원인).
  function syncSegs() {
    for (const s of segs) { s.count = ctl(s.el).filter(c => !c.hidden).length; s.el.hidden = s.count === 0; }
  }
  // "더보기 ▾"는 **지금 접힌 묶음 안에** 실제로 누를 것이 있을 때만 보인다: 모드에 따라 3D 전용
  // 버튼이 모두 숨으면 빈 묶음이 gap만 남기고, 전부 숨으면 빈 팝오버가 열린다.
  function syncMoreBtn() {
    btn.hidden = tier === 0 || segs.reduce((n, s) => n + (s.tier <= tier ? s.count : 0), 0) === 0;
    if (btn.hidden) closeMore();
  }
  // 한 순서로 **실제로 접어 본다**: 넘침이 가시는 첫 단계까지 올리고 "그때 바에 남는 묶음 수"를
  // 돌려준다. 묶음 폭은 DOM에 달린 값이라 계산이 아니라 측정으로만 알 수 있다(measure는 바에
  // 남아 있는 것만 더한다). 압축(kbd 숨김 · 꼬리 라벨 아이콘화 · 더보기 버튼 등장)이 **끝난 뒤에**
  // 다시 재는 것이 핵심이다 — syncMoreBtn() 다음에 size()를 부르는 이유다.
  function settle(key) {
    setTier(0);                                                     // 후보마다 다 펼친 같은 자리에서 출발한다
    retier(key);
    setTier(1);
    syncMoreBtn();
    let m = size();
    while (tier < maxTier() && m.scrollWidth > m.clientWidth) { setTier(tier + 1); syncMoreBtn(); m = size(); }
    return { key, kept: segs.reduce((n, s) => n + (s.tier > tier && s.count > 0 ? 1 : 0), 0) };
  }
  function sync() {
    const now = signature();
    // 보이는 컨트롤 집합이 바뀌면(2D↔3D 모드 전환, 속성 버튼) "펼쳤을 때 필요한 폭"을 다시 잰다:
    // 3D에서 접힌 채 2D로 가면 필요한 폭이 줄어드는데도 3D 시절 fullWidth 탓에 계속 접혀 있었다.
    // #bottomMore는 position: fixed라 되돌려도 #layout 기하가 바뀌지 않아 리사이즈 재진입이 없다.
    if (now !== sig) { sig = now; if (tier) { setTier(0); fullWidth = 0; } }
    syncSegs();                                                     // 측정 전에 묶음을 드러낸다/감춘다
    const { scrollWidth, clientWidth } = size();
    if (!tier) fullWidth = Math.max(scrollWidth, clientWidth);      // 펼친 상태에서만 "필요한 폭"을 잰다
    const mk = modeKey();
    // 판정은 늘 처음부터 다시 셈한다 — 폭이 늘면 3단계에서 곧바로 펼쳐진다(래칫이 없다).
    if (!compactNext({ compact: tier > 0, scrollWidth, clientWidth, fullWidth, hysteresis })) {
      retier(mk); setTier(0); syncMoreBtn();
      bar.classList.remove('tail-sticky');                          // 펼친 상태에서는 넘침이 없다 → 꼬리를 떼어 낸다
      return;
    }
    // 두 순서를 다 접어 보고 **바에 더 많이 남기는** 쪽을 쓴다(§17.2 개정 · 리뷰 I-1).
    // 2D 순서를 먼저 재고 모드 순서를 나중에 재는 것은 같을 때 모드 순서가 이기기 때문이다:
    // 흔한 쪽이 이미 적용된 채로 끝나 다시 접는 일이 없다.
    const alt = mk === '2d' ? null : settle('2d');
    const own = settle(mk);
    if (alt && alt.kept > own.kept) settle('2d');
    // 더 접을 것이 없는데도 넘치면 꼬리를 sticky로 붙인다: sticky 꼬리는 불투명해서 늘 보이는
    // 묶음을 덮으므로(감사 §24 · 리뷰 I-1) "더 접을 것이 없다"가 붙이기의 전제다.
    const m = size();
    bar.classList.toggle('tail-sticky', m.scrollWidth > m.clientWidth);
  }
  const onBtn = () => {
    const open = !more.classList.contains('open');
    if (open) onOpen();   // 팝오버는 한 번에 하나만 열린다(셸 팝오버를 먼저 닫는다)
    more.classList.toggle('open', open);
    btn.setAttribute('aria-expanded', String(open));
    if (open) focusable()?.focus();
    else if (more.contains(document.activeElement)) btn.focus();
  };
  const onDocDown = ev => { if (more.classList.contains('open') && !more.contains(ev.target) && ev.target !== btn) closeMore(); };
  // 열려 있는 동안 [Esc]는 닫고 [Tab]은 안에서 돈다("보기"·"도움말" 팝오버와 같은 두 함수를 쓴다).
  const onKey = ev => {
    if (!more.classList.contains('open')) return;
    // 포커스가 팝오버 **안**일 때만 관여한다(dialogBase.focusTrap과 같은 가드 — 리뷰 C-1).
    // 이 리스너는 셸을 만들 때 등록되므로 나중에 열리는 대화상자의 캡처 리스너보다 먼저 돈다:
    // 가드가 없으면 팝오버 안에서 키보드로 연 대화상자([B] 배경 · [Ctrl+,] 설정)의 [Tab]을 먼저
    // 가로채 포커스를 팝오버로 끌어오고, 그 뒤에 도는 focusTrap은 "내 것이 아니다"로 보고 물러난다
    // → 대화상자를 키보드로 쓸 수 없었다. 팝오버는 자기 안을 다시 그리지 않고 노드를 옮길 뿐이라
    // (그때는 closeMore가 먼저 돈다) focusTrap이 쓰는 "포커스가 body일 때도 내 것" 예외는 필요 없다.
    if (!more.contains(document.activeElement)) return;
    if (ev.key === 'Escape') { ev.stopPropagation(); closeMore(); return; }
    if (ev.key === 'Tab') { ev.stopPropagation(); trapTab(ev, focusables(more)); }
  };
  btn.addEventListener('click', onBtn);
  document.addEventListener('pointerdown', onDocDown, true);
  document.addEventListener('keydown', onKey, true);
  sync();
  return {
    sync, closeMore, isCompact: () => tier > 0, tier: () => tier,
    destroy() {
      setTier(0);                            // 옮겨 둔 묶음은 제자리에 돌려놓고 떠난다
      bar.classList.remove('tail-sticky');   // .compact와 대칭으로 지운다(같은 DOM에 바를 다시 만들 수 있다)
      btn.removeEventListener('click', onBtn);
      document.removeEventListener('pointerdown', onDocDown, true);
      document.removeEventListener('keydown', onKey, true);
    },
  };
}
