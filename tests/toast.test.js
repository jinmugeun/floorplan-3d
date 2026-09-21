// @vitest-environment jsdom
// §14.10: 토스트가 보조기술에 읽히지 않았다(#toasts에 role·aria-live가 없었다).
import { test, expect } from 'vitest';
import { toast } from '../src/ui/toast.js';

test('#toasts는 role="status" aria-live="polite"를 갖고 이미 있던 호스트에도 붙는다', () => {
  document.body.innerHTML = '<div id="toasts"></div>';   // 예전 세션이 만들어 둔 호스트
  toast('저장했습니다', 10);
  const host = document.getElementById('toasts');
  expect(host.getAttribute('role')).toBe('status');
  expect(host.getAttribute('aria-live')).toBe('polite');
  expect(host.querySelector('.toast').textContent).toBe('저장했습니다');
  document.body.innerHTML = '';
  toast('처음부터', 10);
  expect(document.getElementById('toasts').getAttribute('role')).toBe('status');
});
