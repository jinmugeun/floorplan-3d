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

// §14.3: 1100 px에서 하단 바는 캔버스 열(480 px)만 차지해 접은 뒤에도 넘친다.
// "더보기 ▾"가 가로 스크롤 밖으로 밀려나면 접힌 기능에 두 번 클릭으로 닿을 수 없다.
test('하단 바 오른쪽 끝 묶음은 가로 스크롤과 무관하게 붙어 있다(sticky)', () => {
  const tail = CSS.match(/#bottomTail\s*\{[^}]*\}/)?.[0] ?? '';
  expect(tail).toMatch(/position:\s*sticky/);
  expect(tail).toMatch(/right:\s*0/);
  expect(tail).toMatch(/background:\s*var\(--panel\)/);   // 불투명해야 아래로 지나가는 버튼이 겹쳐 보이지 않는다
  // 가로 스크롤바(15 px)가 생겨도 overflow-y: hidden이 버튼을 자르지 않는 행 높이
  expect(CSS).toMatch(/grid-template-rows:\s*48px 1fr 48px/);
});

test('.primary 블록은 .primary가 아닌 선택자 뒤에 온다(뒤에 오는 규칙이 이긴다)', () => {
  const primaryAt = CSS.indexOf('.primary {');
  expect(CSS.indexOf('#topbar button:not(.primary)')).toBeLessThan(primaryAt);
  expect(CSS.indexOf('.tpl-card button:not(.primary)')).toBeLessThan(primaryAt);
});

// §14.10: 활성 버튼(파란 바탕)의 kbd가 muted 회색을 물려받아 빈 상자로 읽혔다(감사 #31).
// 하위 카테고리 버튼은 #panel button의 width:100%에 눌려 목록처럼 쌓였다(감사 #15).
test('활성 버튼의 kbd는 currentColor를 쓰고 하위 카테고리는 칩이다', () => {
  expect(CSS).toMatch(/\.seg button\.on kbd[^{]*\{[^}]*color:\s*currentColor/);
  expect(CSS).toContain('#panel .subs button');
  expect(CSS).toMatch(/#panel \.subs button[^{]*\{[^}]*width:\s*auto/);
  // §14.8: 맨 .error 규칙이 있어야 속성 패널의 충돌 한 줄이 경고 색으로 보인다(.modal .error만으로는 안 된다).
  expect(CSS).toMatch(/^\.error\s*\{[^}]*color:\s*var\(--exhaust\)/m);
});

// Task 8 리뷰 Important 1: 드래그 중 캔버스 높이가 바뀌는 문제를 "배너를 캔버스 위로 띄워서" 고치지
// 않았다 — 캔버스 위에 떠서 클릭(elementFromPoint)을 가로채는 요소를 두지 않는다는 불변식 때문이다.
// 배너는 계속 캔버스 위쪽 레이아웃 행이고, 행 변화는 shell.js가 드래그가 끝날 때까지 미룬다.
test('#banner는 캔버스 위에 뜨지 않는 레이아웃 행이다', () => {
  const rule = CSS.match(/#banner\s*\{[^}]*\}/)?.[0] ?? '';
  expect(rule).toMatch(/flex:\s*0 0 auto/);
  expect(rule).toMatch(/min-height:\s*32px/);      // 행 높이는 고정이다(문구가 길어도 한 줄 — nowrap)
  expect(rule).toMatch(/white-space:\s*nowrap/);
  expect(rule).not.toMatch(/position:\s*(absolute|fixed)/);
  expect(rule).not.toMatch(/z-index/);
});
