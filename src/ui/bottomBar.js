// 하단 바의 접기(§14.3). 3D 모드에서 컨트롤이 16개가 되면 1600 px에서도 넘쳐
// 가로·세로 스크롤바가 동시에 생겼다: 세로 넘침은 CSS로 막고(overflow-y: hidden),
// 가로로 넘치면 3D 전용 묶음([data-overflow])을 "더보기 ▾" 팝오버로 옮긴다.
// 버튼은 다시 만들지 않고 **노드째로 옮긴다** — main.js·shell.js가 id로 걸어 둔
// 리스너가 그대로 살아 있어야 한다(HTML을 다시 그리면 전부 끊긴다).
// 1100 px에서는 접어도 넘치므로(바가 캔버스 열만 차지한다) "더보기 ▾"는 CSS에서
// sticky로 오른쪽에 붙여 둔다 — 접힌 기능에 닿는 두 번의 클릭이 늘 살아 있게.

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
  if (!bar || !more || !btn) return { sync() {}, isCompact: () => false, closeMore() {}, destroy() {} };
  // 되돌릴 자리를 기억한다: 접을 때 옮긴 묶음은 펼칠 때 원래 순서로 돌아와야 한다.
  const segs = [...bar.querySelectorAll('[data-overflow]')].map(el => ({ el, next: el.nextElementSibling }));
  const ctl = el => [...el.querySelectorAll('button, select, input')];
  // 접기 판정에 영향을 주는 컨트롤 목록은 **한 번만** 모은다: 노드가 바 ↔ 팝오버를 오가므로
  // 매번 다시 모으면 순서가 바뀌어 서명이 달라진다. 더보기 버튼 자신은 뺀다(접힘에 따라
  // 켜지고 꺼지므로 서명에 넣으면 접은 직후 곧바로 재측정으로 펼쳐 버린다).
  const tracked = ctl(bar).filter(el => el !== btn);
  const signature = () => tracked.map(el => (el.hidden ? '0' : '1')).join('');
  let compact = false, fullWidth = 0, sig = null;

  const size = () => (measure ? measure() : { scrollWidth: bar.scrollWidth, clientWidth: bar.clientWidth });
  const focusable = () => ctl(more).find(el => !el.hidden && !el.closest('[hidden]')) ?? null;
  function closeMore() {
    const wasOpen = more.classList.contains('open');
    more.classList.remove('open');
    if (!compact) more.hidden = true;
    btn.setAttribute('aria-expanded', 'false');
    // 팝오버 안에 있던 포커스는 더보기 버튼으로 돌려준다([Esc]로 닫고 포커스가 body로 떨어지지 않게).
    if (wasOpen && !btn.hidden && more.contains(document.activeElement)) btn.focus();
  }
  // 묶음 자체의 hidden은 **폭 측정 전에** 고쳐야 한다: [hidden] { display: none !important }라
  // 묶음이 아직 숨어 있으면 안의 버튼이 막 드러나도 size()가 재는 scrollWidth에 안 잡힌다
  // (2D→3D 전환·기즈모 버튼 등장·ortho 이탈에서 접기가 한 박자 늦어졌던 원인).
  function syncSegs() {
    let visible = 0;
    for (const { el } of segs) {
      const n = ctl(el).filter(c => !c.hidden).length;
      el.hidden = n === 0;
      visible += n;
    }
    return visible;
  }
  // "더보기 ▾"는 접혀 있고 **그 안에 실제로 누를 것이 있을 때만** 보인다: 모드에 따라 3D 전용
  // 버튼이 모두 숨으면 빈 묶음이 gap만 남기고, 전부 숨으면 빈 팝오버가 열린다.
  function syncMoreBtn(visible) {
    btn.hidden = !compact || visible === 0;
    if (btn.hidden) closeMore();
  }
  function setCompact(on) {
    compact = on;
    bar.classList.toggle('compact', on);
    // 접을 때는 앞에서부터 옮기고, 펼칠 때는 **뒤에서부터** 되돌린다: 뒤에서부터 넣으면
    // 각 묶음이 기억해 둔 next가 이미 바에 돌아와 있어 insertBefore가 늘 맞는다.
    // 정방향으로 되돌리면 첫 묶음의 next가 아직 #bottomMore 안이라 appendChild로 맨 끝에 붙는다.
    for (const { el, next } of on ? segs : [...segs].reverse()) {
      if (on) more.appendChild(el);
      else if (next && next.parentElement === bar) bar.insertBefore(el, next);
      else bar.appendChild(el);
    }
    more.hidden = !on;
    closeMore();
  }
  function sync() {
    const now = signature();
    // 보이는 컨트롤 집합이 바뀌면(2D↔3D 모드 전환, 속성 버튼) "펼쳤을 때 필요한 폭"을 다시 잰다:
    // 3D에서 접힌 채 2D로 가면 필요한 폭이 줄어드는데도 3D 시절 fullWidth 탓에 계속 접혀 있었다.
    // #bottomMore는 position: fixed라 되돌려도 #layout 기하가 바뀌지 않아 리사이즈 재진입이 없다.
    if (now !== sig) { sig = now; if (compact) { setCompact(false); fullWidth = 0; } }
    const visible = syncSegs();                                    // 측정 전에 묶음을 드러낸다/감춘다
    const { scrollWidth, clientWidth } = size();
    if (!compact) fullWidth = Math.max(scrollWidth, clientWidth);   // 펼친 상태에서만 "필요한 폭"을 잰다
    const next = compactNext({ compact, scrollWidth, clientWidth, fullWidth, hysteresis });
    if (next !== compact) setCompact(next);
    syncMoreBtn(visible);
    // 꼬리(줌·더보기·속성)는 압축 뒤에도 넘칠 때만 sticky다(§15.4): 넘치지 않는데 붙여 두면
    // 늘 보여야 하는 단위·잠금 묶음을 불투명하게 덮는다(감사 §24의 75 px).
    // sticky ↔ static은 flex 항목의 크기를 바꾸지 않으므로 이 판정이 폭을 다시 흔들지 않는다.
    const after = size();
    bar.classList.toggle('tail-sticky', after.scrollWidth > after.clientWidth);
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
    sync, closeMore, isCompact: () => compact,
    destroy() {
      if (compact) setCompact(false);   // 옮겨 둔 묶음은 제자리에 돌려놓고 떠난다
      btn.removeEventListener('click', onBtn);
      document.removeEventListener('pointerdown', onDocDown, true);
      document.removeEventListener('keydown', onKey, true);
    },
  };
}
