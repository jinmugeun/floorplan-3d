// 하단 바의 접기(§14.3 · §15.4). 3D 모드에서 컨트롤이 16개가 되면 1600 px에서도 넘쳐
// 가로·세로 스크롤바가 동시에 생겼다: 세로 넘침은 CSS로 막고(overflow-y: hidden),
// 가로로 넘치면 "더보기 ▾" 팝오버로 묶음을 옮긴다.
// 버튼은 다시 만들지 않고 **노드째로 옮긴다** — main.js·shell.js가 id로 걸어 둔
// 리스너가 그대로 살아 있어야 한다(HTML을 다시 그리면 전부 끊긴다).
//
// 접기는 **단계(data-overflow의 값)**로 나뉜다. 1100 px에서는 1단계(3D 전용 묶음) + 꼬리 라벨
// 아이콘화만으로도 133 px이 남아, sticky 꼬리가 늘 보여야 하는 단위 묶음을 94 px 덮었다(리뷰 I-1).
// §15.4는 "1366·1100 모두 겹침 0"을 요구하므로, 꼬리가 sticky로 붙기 **전에** 다음 단계를 접는다:
//   1 = 3D 전용 묶음(카메라·햇빛·캡쳐·2D 투영·기즈모)   ← 1366 px은 여기서 끝난다
//   2 = 도면 잠금                                      ← 1100 px에서 여기부터 필요하다
//   3 = 단위(mm / ft·in)                               ← §14.3의 "단위는 늘 보인다"를 좁히므로 최후
// 그래도 넘치면(더 접을 것이 없으면) 꼬리를 sticky로 붙여 접힌 기능에 두 번의 클릭이 늘 닿게 한다.

export const BOTTOM_HYSTERESIS = 64;

// 접을지 말지: 펼친 상태에서는 넘치면 접고, 접힌 상태에서는 "펼쳤을 때 필요했던 폭"보다
// hysteresis 이상 여유가 생겼을 때만 펼친다(딱 맞는 폭에서 접었다 펴기를 반복하지 않게).
export function compactNext({ compact = false, scrollWidth = 0, clientWidth = 0, fullWidth = 0, hysteresis = BOTTOM_HYSTERESIS } = {}) {
  if (!compact) return scrollWidth > clientWidth;
  return !(clientWidth >= fullWidth + hysteresis);
}

export function createBottomBar(root, { measure = null, hysteresis = BOTTOM_HYSTERESIS, onOpen = () => {} } = {}) {
  const bar = root?.querySelector?.('#bottombar') ?? null;
  const more = root?.querySelector?.('#bottomMore') ?? null;
  const btn = root?.querySelector?.('#btnBottomMore') ?? null;
  if (!bar || !more || !btn) return { sync() {}, isCompact: () => false, tier: () => 0, closeMore() {}, destroy() {} };
  // 되돌릴 자리를 "다음 형제" 하나가 아니라 **원래 순서 배열**로 기억한다: 단계별로 접으므로
  // 어떤 묶음이 팝오버에 남아 있는 동안 다른 묶음이 바로 돌아올 수 있고, 그때 기억해 둔
  // nextElementSibling이 아직 팝오버 안이면 insertBefore가 자리를 잃는다.
  // 접히는 묶음은 바의 직속 자식이다(shellHtml의 마크업 규칙 — 꼬리 안의 묶음은 접지 않는다).
  const order = [...bar.children];
  const segs = order.filter(el => el.hasAttribute?.('data-overflow'))
    .map(el => ({ el, tier: Math.max(1, Number(el.getAttribute('data-overflow')) || 1), count: 0 }));
  const maxTier = segs.reduce((m, s) => Math.max(m, s.tier), 0);
  const ctl = el => [...el.querySelectorAll('button, select, input')];
  // 접기 판정에 영향을 주는 컨트롤 목록은 **한 번만** 모은다: 노드가 바 ↔ 팝오버를 오가므로
  // 매번 다시 모으면 순서가 바뀌어 서명이 달라진다. 더보기 버튼 자신은 뺀다(접힘에 따라
  // 켜지고 꺼지므로 서명에 넣으면 접은 직후 곧바로 재측정으로 펼쳐 버린다).
  const tracked = ctl(bar).filter(el => el !== btn);
  const signature = () => tracked.map(el => (el.hidden ? '0' : '1')).join('');
  let tier = 0, fullWidth = 0, sig = null;

  const size = () => (measure ? measure() : { scrollWidth: bar.scrollWidth, clientWidth: bar.clientWidth });
  const focusable = () => ctl(more).find(el => !el.hidden && !el.closest('[hidden]')) ?? null;
  function closeMore() {
    const wasOpen = more.classList.contains('open');
    more.classList.remove('open');
    if (!tier) more.hidden = true;
    btn.setAttribute('aria-expanded', 'false');
    // 팝오버 안에 있던 포커스는 더보기 버튼으로 돌려준다([Esc]로 닫고 포커스가 body로 떨어지지 않게).
    if (wasOpen && !btn.hidden && more.contains(document.activeElement)) btn.focus();
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
  function sync() {
    const now = signature();
    // 보이는 컨트롤 집합이 바뀌면(2D↔3D 모드 전환, 속성 버튼) "펼쳤을 때 필요한 폭"을 다시 잰다:
    // 3D에서 접힌 채 2D로 가면 필요한 폭이 줄어드는데도 3D 시절 fullWidth 탓에 계속 접혀 있었다.
    // #bottomMore는 position: fixed라 되돌려도 #layout 기하가 바뀌지 않아 리사이즈 재진입이 없다.
    if (now !== sig) { sig = now; if (tier) { setTier(0); fullWidth = 0; } }
    syncSegs();                                                     // 측정 전에 묶음을 드러낸다/감춘다
    const { scrollWidth, clientWidth } = size();
    if (!tier) fullWidth = Math.max(scrollWidth, clientWidth);      // 펼친 상태에서만 "필요한 폭"을 잰다
    // 판정은 늘 1단계부터 다시 셈한다 — 폭이 늘면 3단계에서 곧바로 1단계로 돌아온다(래칫이 없다).
    setTier(compactNext({ compact: tier > 0, scrollWidth, clientWidth, fullWidth, hysteresis }) ? 1 : 0);
    syncMoreBtn();
    // 압축(kbd 숨김 · 꼬리 라벨 아이콘화 · 더보기 버튼 등장)이 **끝난 뒤에** 넘침을 다시 잰다.
    // 그래도 넘치면 꼬리를 sticky로 붙이기 전에 다음 단계를 접는다: sticky 꼬리는 불투명해서
    // 늘 보이는 묶음을 덮으므로(감사 §24 · 리뷰 I-1) "더 접을 것이 없다"가 붙이기의 전제다.
    let m = size();
    while (tier > 0 && tier < maxTier && m.scrollWidth > m.clientWidth) { setTier(tier + 1); syncMoreBtn(); m = size(); }
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
  const onKey = ev => { if (ev.key === 'Escape' && more.classList.contains('open')) { ev.stopPropagation(); closeMore(); } };
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
