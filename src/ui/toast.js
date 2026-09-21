export function toast(msg, ms = 2500) {
  // 호스트는 셸 마크업이 상주시킨다(§15.14): 첫 알림도 낭독되려면 라이브 영역이 갱신 전에
  // DOM에 있어야 한다(감사 (d)10). 셸 없이 부르는 경로(대화상자 단위 테스트 등)만 여기서 만든다.
  let host = document.getElementById('toasts'); if (!host) { host = document.createElement('div'); host.id = 'toasts'; document.body.appendChild(host); }
  host.setAttribute('role', 'status'); host.setAttribute('aria-live', 'polite');
  const el = document.createElement('div'); el.className = 'toast'; el.textContent = msg; host.appendChild(el);
  setTimeout(() => el.remove(), ms);
}
