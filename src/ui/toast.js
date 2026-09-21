export function toast(msg, ms = 2500) {
  let host = document.getElementById('toasts'); if (!host) { host = document.createElement('div'); host.id = 'toasts'; document.body.appendChild(host); }
  // 토스트는 상태 알림이다(§14.10): 보조기술이 읽도록 role·aria-live를 늘 맞춰 둔다
  // (예전 세션이 만들어 둔 호스트에도 붙는다).
  host.setAttribute('role', 'status'); host.setAttribute('aria-live', 'polite');
  const el = document.createElement('div'); el.className = 'toast'; el.textContent = msg; host.appendChild(el);
  setTimeout(() => el.remove(), ms);
}
