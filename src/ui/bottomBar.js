// 하단 바의 접기(§14.3). 3D 모드에서 컨트롤이 16개가 되면 1600 px에서도 넘쳐
// 가로·세로 스크롤바가 동시에 생겼다: 세로 넘침은 CSS로 막고(overflow-y: hidden),
// 가로로 넘치면 3D 전용 묶음([data-overflow])을 "더보기 ▾" 팝오버로 옮긴다.
// 버튼은 다시 만들지 않고 **노드째로 옮긴다** — main.js·shell.js가 id로 걸어 둔
// 리스너가 그대로 살아 있어야 한다(HTML을 다시 그리면 전부 끊긴다).

export const BOTTOM_HYSTERESIS = 64;

// 접을지 말지: 펼친 상태에서는 넘치면 접고, 접힌 상태에서는 "펼쳤을 때 필요했던 폭"보다
// hysteresis 이상 여유가 생겼을 때만 펼친다(딱 맞는 폭에서 접었다 펴기를 반복하지 않게).
export function compactNext({ compact = false, scrollWidth = 0, clientWidth = 0, fullWidth = 0, hysteresis = BOTTOM_HYSTERESIS } = {}) {
  if (!compact) return scrollWidth > clientWidth;
  return !(clientWidth >= fullWidth + hysteresis);
}

export function createBottomBar(root, { measure = null, hysteresis = BOTTOM_HYSTERESIS } = {}) {
  const bar = root?.querySelector?.('#bottombar') ?? null;
  const more = root?.querySelector?.('#bottomMore') ?? null;
  const btn = root?.querySelector?.('#btnBottomMore') ?? null;
  if (!bar || !more || !btn) return { sync() {}, isCompact: () => false, closeMore() {}, destroy() {} };
  // 되돌릴 자리를 기억한다: 접을 때 옮긴 묶음은 펼칠 때 원래 순서로 돌아와야 한다.
  const segs = [...bar.querySelectorAll('[data-overflow]')].map(el => ({ el, next: el.nextElementSibling }));
  let compact = false, fullWidth = 0;

  const size = () => (measure ? measure() : { scrollWidth: bar.scrollWidth, clientWidth: bar.clientWidth });
  function closeMore() {
    more.classList.remove('open');
    more.hidden = !compact ? true : more.hidden;
    btn.setAttribute('aria-expanded', 'false');
  }
  function setCompact(on) {
    compact = on;
    bar.classList.toggle('compact', on);
    btn.hidden = !on;
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
    const { scrollWidth, clientWidth } = size();
    if (!compact) fullWidth = Math.max(scrollWidth, clientWidth);   // 펼친 상태에서만 "필요한 폭"을 잰다
    const next = compactNext({ compact, scrollWidth, clientWidth, fullWidth, hysteresis });
    if (next !== compact) setCompact(next);
  }
  const onBtn = () => {
    const open = !more.classList.contains('open');
    more.classList.toggle('open', open);
    btn.setAttribute('aria-expanded', String(open));
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
      btn.removeEventListener('click', onBtn);
      document.removeEventListener('pointerdown', onDocDown, true);
      document.removeEventListener('keydown', onKey, true);
    },
  };
}
