// @vitest-environment jsdom
import { test, expect } from 'vitest';
import { createStore } from '../src/state/store.js';
import { createEmptyProject } from '../src/state/schema.js';
import { openBackgroundDialog } from '../src/ui/backgroundDialog.js';

test('rejects files over 10MB or of the wrong type with a message, and close removes the modal', () => {
  HTMLCanvasElement.prototype.getContext = () => new Proxy({}, { get: () => () => {} });
  const store = createStore(createEmptyProject());
  const dlg = openBackgroundDialog({ store });
  const input = document.querySelector('.modal [name="file"]');
  const err = document.querySelector('.modal [name="error"]');
  expect(err.hidden).toBe(true);
  const big = new File([new Uint8Array(10 * 1024 * 1024 + 1)], 'big.jpg', { type: 'image/jpeg' });
  Object.defineProperty(input, 'files', { value: [big], configurable: true });
  input.dispatchEvent(new Event('change', { bubbles: true }));
  expect(err.hidden).toBe(false);
  expect(err.textContent).toContain('10MB');
  const pdf = new File([new Uint8Array(10)], 'plan.pdf', { type: 'application/pdf' });
  Object.defineProperty(input, 'files', { value: [pdf], configurable: true });
  input.dispatchEvent(new Event('change', { bubbles: true }));
  expect(err.textContent).toContain('PNG');
  expect(store.get().background).toBeNull();
  dlg.close();
  expect(document.querySelector('.modal')).toBeNull();
});
