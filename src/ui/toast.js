export function toast(msg, ms = 2500) {
  let host = document.getElementById('toasts'); if (!host) { host = document.createElement('div'); host.id = 'toasts'; document.body.appendChild(host); }
  const el = document.createElement('div'); el.className = 'toast'; el.textContent = msg; host.appendChild(el);
  setTimeout(() => el.remove(), ms);
}
