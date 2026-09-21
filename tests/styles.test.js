// §14.2: 앱의 주 동작 버튼(.primary)이 컨텍스트 규칙에 져서 흰 바탕 + 흰 글자가 되는 일을 막는다.
// jsdom은 외부 스타일시트를 계산해 주지 않으므로(getComputedStyle이 규칙을 적용하지 않는다)
// 규칙 자체를 글로 읽어 단정한다 — 브라우저 계산 색은 Task 12의 프로브가 확인한다.
import { test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const CSS = readFileSync(fileURLToPath(new URL('../src/styles.css', import.meta.url)), 'utf8');
const lines = CSS.split('\n');

test('.primary는 파일 마지막 200줄 안에 있고 배경과 글자색을 함께 선언한다', () => {
  const at = lines.findIndex(l => /^\s*\.primary\s*\{/.test(l));
  expect(at).toBeGreaterThan(-1);
  expect(lines.length - at).toBeLessThanOrEqual(200);
  const block = lines[at];
  expect(block).toMatch(/background:\s*var\(--accent\)/);
  expect(block).toMatch(/color:\s*var\(--on-accent\)/);
  expect(CSS).toMatch(/--on-accent:\s*#fff/);
});

test('컨텍스트 규칙은 .primary가 아닌 버튼에만 배경을 준다', () => {
  expect(CSS).toContain('#topbar button:not(.primary)');
  expect(CSS).toContain('.tpl-card button:not(.primary)');
  // :not(.primary) 없이 배경을 주는 옛 규칙이 남아 있으면 특이도 경쟁이 되살아난다.
  expect(CSS).not.toMatch(/#topbar button\s*\{/);
  expect(CSS).not.toMatch(/\.tpl-card button\s*\{/);
});

test('.primary 블록은 .primary가 아닌 선택자 뒤에 온다(뒤에 오는 규칙이 이긴다)', () => {
  const primaryAt = CSS.indexOf('.primary {');
  expect(CSS.indexOf('#topbar button:not(.primary)')).toBeLessThan(primaryAt);
  expect(CSS.indexOf('.tpl-card button:not(.primary)')).toBeLessThan(primaryAt);
});
