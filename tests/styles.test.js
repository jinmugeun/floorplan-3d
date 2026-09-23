// §14.2: 앱의 주 동작 버튼(.primary)이 컨텍스트 규칙에 져서 흰 바탕 + 흰 글자가 되는 일을 막는다.
// jsdom은 외부 스타일시트를 계산해 주지 않으므로(getComputedStyle이 규칙을 적용하지 않는다)
// 규칙 자체를 글로 읽어 단정한다 — 브라우저 계산 색은 Task 12의 프로브가 확인한다.
import { test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const CSS = readFileSync(fileURLToPath(new URL('../src/styles.css', import.meta.url)), 'utf8');
const lines = CSS.split('\n');

// M-24: 부정 단정은 선택자를 못 찾아도 통과한다. 먼저 "그 선택자가 있다"를 단정하고 본문만 본다.
function ruleBody(selector) {
  const bare = CSS.replace(/\/\*[\s\S]*?\*\//g, '');
  const hit = [...bare.matchAll(/([^{}]*)\{([^{}]*)\}/g)].find(([, sel]) => sel.split(',').some(s => s.trim() === selector));
  if (!hit) throw new Error(`CSS 규칙 없음: ${selector}`);
  return hit[2];
}

test('.primary는 파일 마지막 200줄 안에 있고 배경과 글자색을 함께 선언한다', () => {
  // 토큰은 `button.primary, .primary`다(m-5): .primary 하나(0,1,0)는 `.pop-row button`·`.seg button`
  // 같은 컨텍스트 규칙(0,1,1)에 져서 그 안에 주 동작 버튼이 하나 생기면 감사 #23이 되살아났다.
  const at = lines.findIndex(l => /^\s*(button\.primary,\s*)?\.primary\s*\{/.test(l));
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

// m-5: 위의 두 단정은 자리를 아는 규칙만 막는다. 새로 더한 `… button { background: … }` 규칙은
// 특이도(0,1,1 이상)로 파일 맨 뒤의 `.primary`(0,1,0~0,1,1)를 이길 수 있으므로, 배경을 주는 버튼
// 규칙은 **전부** 글자색을 함께 정하거나 `:not(.primary)`로 자기 몫만 칠해야 한다.
test('버튼 배경을 주는 규칙은 모두 글자색을 함께 정하거나 .primary를 비껴간다', () => {
  const bare = CSS.replace(/\/\*[\s\S]*?\*\//g, '');   // 주석 안의 예시 규칙은 세지 않는다
  const offenders = [];
  for (const [, sel, body] of bare.matchAll(/([^{}]*)\{([^{}]*)\}/g)) {
    if (!/(^|[\s;])background:/.test(body)) continue;
    if (/(^|[\s;])color:/.test(body)) continue;
    for (const one of sel.split(',')) {
      const t = one.trim();
      if (/\bbutton$/.test(t) && !/:not\(\.primary\)/.test(t)) offenders.push(t);
    }
  }
  expect(offenders).toEqual([]);
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
  // §15.8: 카테고리 칩도 #panel button의 width:100%에 눌리지 않아야 한다(하위 카테고리와 같은 규칙).
  expect(CSS).toContain('#panel .chips button');
  expect(CSS).toMatch(/#panel \.chips button[^{]*\{[^}]*width:\s*auto/);
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

// §15.4: 좁은 바에서는 kbd 배지를 감추고 "화면 맞추기"를 아이콘으로 줄인다(title은 남는다).
test('하단 바 압축 규칙과 조건부 sticky 꼬리', () => {
  expect(CSS).toMatch(/#bottombar\.compact kbd[^{]*\{[^}]*display:\s*none/);
  expect(CSS).toContain('#bottombar.compact #btnFit .wide');
  expect(CSS).toContain('#bottombar:not(.compact) #btnFit .narrow');
  // 꼬리의 기본 규칙은 sticky 그대로이고(아래 단정과 짝), 넘치지 않을 때만 static으로 되돌린다.
  expect(CSS).toMatch(/#bottombar:not\(\.tail-sticky\) #bottomTail[^{]*\{[^}]*position:\s*static/);
});

// §15.11: 영역 행의 숫자 칸은 값이 잘리지 않게 64 px 이상이고, 제목 행은 같은 격자를 쓴다.
test('영역 행과 제목 행은 같은 격자이고 숫자 칸은 64 px 이상이다', () => {
  const rule = CSS.match(/\.region-row,\s*\.region-head\s*\{[^}]*\}/)?.[0] ?? '';
  expect(rule).toMatch(/display:\s*grid/);
  expect(rule).toMatch(/repeat\(6,\s*minmax\(64px/);
  expect(CSS).toMatch(/\.region-head span\s*\{[^}]*color:\s*var\(--muted\)/);
});

// §15.14(감사 §4): 포커스 링이 세 종류였다 — 버튼은 앱 링, 스플리터·select·summary는 브라우저
// 기본 링, #projectName은 아예 없었다(outline: none).
test('포커스 링은 한 가지다', () => {
  const ring = CSS.match(/[^}]*:focus-visible[^{]*\{[^}]*outline:\s*2px solid var\(--accent\)[^}]*\}/)?.[0] ?? '';
  for (const sel of ['button:focus-visible', 'input:focus-visible', 'select:focus-visible', 'summary:focus-visible', '.splitter:focus-visible']) {
    expect(ring).toContain(sel);
  }
  expect(CSS).not.toMatch(/#projectName:focus\s*\{[^}]*outline:\s*none/);
  // 비활성 danger 버튼은 빨갛지 않다(감사: disabled인데 danger 색을 유지했다).
  expect(CSS).toMatch(/\.danger:disabled\s*\{[^}]*color:\s*var\(--muted\)/);
});

// §15.14: 레일 라벨 "도면 그리기"가 두 줄로 잘렸다(높이 28 px, 다른 라벨 12 px).
test('레일 라벨은 한 줄이고 미니맵 이름은 그림 위에서 읽힌다', () => {
  expect(CSS).toMatch(/#rail button span\s*\{[^}]*white-space:\s*nowrap/);
  expect(CSS).toMatch(/#minimap \.mm-label\s*\{[^}]*background:/);
});

// §16.2 리뷰 I-3: 견적 대화상자의 레이아웃 수정(머리글 / 스크롤 본문 / 고정 푸터)은 **전부 CSS에만**
// 있고 jsdom은 스타일시트를 계산하지 않는다 — 규칙을 지우거나 한정을 잃어도 다른 테스트는 전부 green이다.
// 그래서 세 층의 골격을 여기서 글자로 고정한다(위 테스트들과 같은 방식).
// 한 선택자의 블록을 통째로 꺼낸다(`.modal.estimate .modal-card {` 처럼 정확히 그 선택자인 줄).
const rule = sel => { const at = CSS.indexOf(sel + ' {'); return at < 0 ? '' : CSS.slice(at, CSS.indexOf('}', at) + 1); };

test('견적 카드는 머리글 / 스크롤 본문 / 고정 푸터 세 층이다(감사 §1)', () => {
  const card = rule('.modal.estimate .modal-card');
  expect(card).toMatch(/display:\s*flex/);
  expect(card).toMatch(/flex-direction:\s*column/);
  expect(card).toMatch(/max-height:\s*86vh/);
  expect(card).toMatch(/overflow:\s*hidden/);     // 카드 전체가 스크롤하면 합계·버튼이 화면 밖으로 나간다
  expect(card).toMatch(/padding:\s*0/);           // 여백은 세 층이 각자 갖는다(본문만 스크롤해야 하므로)
  // 머리글과 푸터는 줄어들지 않고, 본문만 남은 높이를 먹으며 스크롤한다.
  expect(CSS).toMatch(/\.modal\.estimate \.modal-card > header,\s*\.modal\.estimate \.est-foot\s*\{[^}]*flex:\s*none/);
  const body = rule('.modal.estimate [data-part="table"]');
  expect(body).toMatch(/flex:\s*1 1 auto/);
  expect(body).toMatch(/overflow:\s*auto/);
  expect(body).toMatch(/min-height:\s*0/);        // flex 자식은 이것이 없으면 줄지 않아 카드를 밀어낸다
});

// 리뷰 I-1: `.est-table`은 견적 전용이 아니다 — ui/airflowPanel.js가 `class="est-table air-table"`로
// 같은 클래스를 쓴다. 한정 없는 `.est-table thead th`(0,1,2)는 `.air-table th`(0,1,1)를 이겨
// 240 px 레일 패널의 열 제목까지 바꾼다. 그 규칙은 하나뿐이고 `.modal.estimate` 아래여야 한다.
test('견적 표의 열 제목 규칙은 견적 대화상자 안에만 있다(풍량 패널로 새지 않는다)', () => {
  const bare = CSS.replace(/\/\*[\s\S]*?\*\//g, '');   // 주석 안의 예시 선택자는 세지 않는다
  const heads = [...bare.matchAll(/([^{}]*)\{([^{}]*)\}/g)]
    .map(([, sel, body]) => [sel.trim(), body])
    .filter(([sel]) => sel.split(',').some(one => /\.est-table\s+thead\s+th$/.test(one.trim())));
  expect(heads).toHaveLength(1);
  const [sel, body] = heads[0];
  expect(sel).toBe('.modal.estimate .est-table thead th');
  expect(body).toMatch(/color:\s*var\(--ink\)/);
  expect(body).toMatch(/font-size:\s*12px/);
  expect(body).toMatch(/font-weight:\s*600/);
  expect(body).toMatch(/position:\s*sticky/);          // 스크롤해도 열 제목이 남는다
  expect(body).toMatch(/top:\s*0/);
  expect(body).toMatch(/background:\s*#fff/);          // 불투명해야 스크롤한 본문이 비치지 않는다
  // 레일 풍량 표의 열 제목은 예전 그대로 11 px muted다.
  expect(CSS).toMatch(/\.air-table th,\s*\.air-table td\s*\{[^}]*font-size:\s*11px/);
  expect(CSS).toMatch(/\.air-table thead th\s*\{[^}]*color:\s*var\(--muted\)/);
});

// §16.4 리뷰 I-3·I-4: 층 바의 좌우 패딩이 #props{padding:12px}와 겹쳐 24 px이 됐고, 스크롤
// 컨테이너(#right{overflow:auto}) 안의 보통 블록이라 본문을 내려 보는 동안 층 전환 수단이
// 화면에서 사라졌다. 두 값은 CSS에만 있고 jsdom은 스타일시트를 계산하지 않는다 — 글자로 고정한다.
test('층 바는 아래 간격만 갖고 패널 맨 위에 붙어 있다(sticky)', () => {
  const bar = rule('#floorBar');
  expect(bar).toMatch(/padding:\s*0 0 10px/);              // 좌우는 #props{padding:12px}가 댄다(겹치면 24 px)
  expect(bar).not.toMatch(/padding:\s*10px 12px 0/);
  expect(bar).toMatch(/position:\s*sticky/);
  expect(bar).toMatch(/top:\s*0/);
  expect(bar).toMatch(/background:\s*var\(--panel\)/);     // 불투명해야 지나가는 본문이 비치지 않는다
  expect(CSS).toMatch(/#right\s*\{[^}]*overflow:\s*auto/); // sticky가 걸리는 스크롤 컨테이너
});

// 리뷰 I-1: `.tpl-card canvas[data-tpl]`가 width/height를 선언하지 않아 `.modal canvas { width: 100% }`가
// 그대로 먹었다 — 특이도가 높아도 **선언하지 않은 속성은 이길 수 없다**(브라우저 측정 212×212 px).
// 96 px 비트맵이 2.2배로 늘어나 1 px 외곽선이 뭉개지던 자리다. canvas.swatch(48 px)의 선례를 따른다.
test('템플릿 미리보기 캔버스는 화면에서도 96 px 정사각이다(리뷰 I-1)', () => {
  const box = rule('.tpl-card canvas[data-tpl]');
  expect(box).toMatch(/width:\s*96px/);
  expect(box).toMatch(/height:\s*96px/);
  expect(box).toMatch(/flex:\s*0 0 auto/);      // .tpl-card가 flex 컬럼이라 이것이 없으면 늘어난다
  expect(box).toMatch(/cursor:\s*default/);     // .modal canvas의 crosshair는 "여기 그릴 수 있다"는 거짓말이다
  // 이겨야 하는 상대가 실제로 폭 100%를 주는 규칙이라는 것도 함께 못 박는다(선례: canvas.swatch).
  expect(CSS).toMatch(/\.modal canvas \{[^}]*width:\s*100%/);
  // m-1: `:not(.primary)`만으로는 .danger(0,1,0)의 빨간 테두리까지 덮어 [삭제]가 [이름 변경]과 같아진다.
  expect(CSS).toContain('.start-card.tpl.user .row button:not(.primary):not(.danger)');
});

// §16.12: 시작 화면 카드의 축소 도면도 크기를 스스로 선언한다 — 선언하지 않으면 캔버스 기본 상자
// (300×150 CSS px)가 96 px 비트맵을 늘린다(.tpl-card canvas[data-tpl]와 같은 규칙 · 리뷰 I-1의 선례).
test('시작 화면 축소 도면 캔버스도 화면에서 96 px 정사각이다(§16.12)', () => {
  const box = rule('.start-card canvas[data-tpl]');
  expect(box).toMatch(/width:\s*96px/);
  expect(box).toMatch(/height:\s*96px/);
  expect(box).toMatch(/flex:\s*0 0 auto/);        // .start-card·.start-open이 flex 컬럼이라 없으면 늘어난다
  expect(box).toMatch(/align-self:\s*center/);    // 가로는 stretch 대신 가운데에 둔다
  // 커서는 선언하지 않는다: 카드가 버튼이므로 pointer를 물려받아야 "누르면 열린다"가 참이다.
  expect(box).not.toMatch(/cursor:/);
});

// 리뷰 M-20: `:not(.primary)`가 .danger(0,1,0)의 빨간 테두리를 이기는 덫이 두 자리 더 있었다 —
// `#props .row`의 [층 삭제](floorBar.js)와 갤러리의 [삭제](galleryDialog.js)가 특이도 0,2,1로
// 이겨 [이름 변경]·[내려받기]와 같은 회색 테두리가 됐다. §16.9·§16.10이 "파괴적 동작을 눈에
// 띄게"를 두 번 정한 브랜치에서 남길 값이 아니다.
test('.danger 버튼의 빨간 테두리를 덮는 규칙이 없다(리뷰 M-20)', () => {
  expect(CSS).toContain('#props .row button:not(.primary):not(.danger)');
  expect(CSS).toContain('.shot button:not(.primary):not(.danger)');
  expect(CSS).toContain('.start-card.tpl.user .row button:not(.primary):not(.danger)');
  // 이겨야 하는 상대가 실제로 빨간 테두리를 선언한다는 것도 함께 못 박는다.
  expect(CSS).toMatch(/\.danger \{[^}]*border-color:\s*var\(--exhaust\)/);
  // 나머지 `button:not(.primary)` 규칙의 범위 안에는 .danger 버튼이 없다(리뷰가 전수 확인한 셋만
  // 문제였다). 그 규칙이 늘면 여기서 다시 보아야 한다는 표시로 개수를 고정한다.
  const bare = CSS.replace(/\/\*[\s\S]*?\*\//g, '');
  expect(bare.match(/button:not\(\.primary\)(?!:not\(\.danger\))/g)).toHaveLength(13);
});

// §17.12 이월(M-24): 부정 단정은 **선택자를 못 찾아도** 통과한다 — 규칙 이름이 바뀌면 보증이
// 조용히 사라진다. "선택자가 있다"를 먼저 단정하는 도우미를 두고 새 규칙들을 그것으로 본다.
test('ruleBody는 없는 선택자에서 실패하고, 새 규칙 셋을 확인한다', () => {
  expect(() => ruleBody('.없는규칙')).toThrow();
  expect(ruleBody('#panel.narrow .layer-code')).toMatch(/display:\s*none/);
  expect(ruleBody('.hint-on')).toMatch(/outline:/);
  expect(ruleBody('.layer-head')).toMatch(/display:\s*grid/);
});

// Task 12 리뷰 I-1: 갤러리의 "다른 프로젝트" <details>는 .shot-grid(220 px 자동 배치 격자)의
// 아이템 하나라 폭이 한 칸으로 줄고, 펼치면 안쪽 격자가 중첩 스크롤러가 됐다. 감사 §45가
// 고치라고 한 바로 그 화면이다. 테스트는 DOM 구조만 보므로 규칙을 글자로 못 박는다.
test('갤러리 묶음은 격자 한 줄을 통째로 쓰고 중첩 스크롤러가 되지 않는다(Task 12 리뷰 I-1)', () => {
  expect(ruleBody('.shot-grid > details')).toMatch(/grid-column:\s*1 \/ -1/);
  const inner = ruleBody('.shot-grid > details .shot-grid');
  expect(inner).toMatch(/max-height:\s*none/);
  expect(inner).toMatch(/overflow:\s*visible/);
  // 이겨야 하는 상대가 실제로 높이를 제한하는 규칙이라는 것도 함께 못 박는다.
  expect(ruleBody('.shot-grid')).toMatch(/max-height:\s*64vh/);
  expect(ruleBody('.shot-grid')).toMatch(/overflow:\s*auto/);
});
