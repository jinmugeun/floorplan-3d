// 아키텍처 §9의 두 규칙을 실측으로 지킨다. 사람이 세는 대신 테스트가 세게 두는 이유는,
// 둘 다 "어겨도 앱은 잘 돈다"라서 리뷰에서만 잡히면 반드시 새기 때문이다.
import { test, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// fileURLToPath를 쓴다: URL.pathname은 퍼센트 인코딩된 채라 경로에 공백·한글이 있으면 %20·%ED…가
// 남아 readdirSync가 ENOENT로 던진다(드라이브 문자 앞의 / 제거까지 이 함수가 맡는다).
const SRC = fileURLToPath(new URL('../src', import.meta.url));
const walk = dir => readdirSync(dir, { withFileTypes: true })
  .flatMap(e => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]));
const jsFiles = walk(SRC).filter(f => f.endsWith('.js'));
const rel = f => f.slice(SRC.length + 1).replace(/\\/g, '/');

test('src/**/*.js는 한 파일 300줄을 넘지 않는다', () => {
  expect(jsFiles.length).toBeGreaterThan(50);       // 목록을 못 읽고 조용히 통과하지 않게
  const over = jsFiles
    .map(f => [rel(f), readFileSync(f, 'utf8').split('\n').length])
    .filter(([, n]) => n > 300);
  expect(over).toEqual([]);
});

// ui/는 화면 조각을 만드는 층이다: 뷰(view2d/·view3d/)와 배선(app/)은 ui/를 부르지만 그 반대는 없다.
// 반대가 생기면 순환이 만들어지고, ui 테스트가 three·캔버스를 끌고 오게 된다.
test('ui/는 view2d/·view3d/·app/을 import하지 않는다', () => {
  const bad = [];
  // 그물은 규칙 이름만큼 넓어야 한다: 쌍따옴표, 부수효과 전용 `import '…'`, 동적 `import('…')`까지 본다
  // (홑따옴표 `from '…'`만 보면 그 세 형태로 규칙을 조용히 빠져나갈 수 있다).
  const IMPORTS = /from\s+['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]|import\s+['"]([^'"]+)['"]/g;
  for (const f of jsFiles.filter(f => rel(f).startsWith('ui/'))) {
    for (const m of readFileSync(f, 'utf8').matchAll(IMPORTS)) {
      const spec = m[1] ?? m[2] ?? m[3];
      if (/^\.\.\/(view2d|view3d|app)\//.test(spec)) bad.push(`${rel(f)} → ${spec}`);
    }
  }
  expect(bad).toEqual([]);
});

// §17.3(감사 §21 · 리뷰 I-2): 프로젝트를 갈아 끼우는 일은 되돌릴 단계가 0개인 동작이다. 규율이
// "store.replace(p, { record: false }) 다음 줄에 store.resetHistory()를 쓴다"였을 때는 여섯 번째
// 교체 경로가 둘째 줄을 잊는 것만으로 "샘플을 연 뒤 Ctrl+Z가 도면을 지운다"가 되살아났다 — 어겨도
// 앱은 잘 돌기 때문에 리뷰에서만 잡히면 반드시 샌다. 이제 교체 경로는 store.swap() 하나만 부르고,
// 정말 기록해야 하는 교체는 같은 줄에 `// swap-exempt: 이유`를 적어 눈에 보이게 뚫는다.
test('src/의 프로젝트 교체는 store.swap()으로만 한다', () => {
  const swaps = [], leaks = [];
  for (const f of jsFiles) {
    readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
      if (line.includes('store.swap(')) swaps.push(`${rel(f)}:${i + 1}`);
      if (!line.includes('store.replace(')) return;
      if (rel(f) === 'state/store.js') return;                 // 스토어 자신의 구현·주석
      if (/\/\/\s*swap-exempt:\s*\S/.test(line)) return;        // 이유를 적은 예외만 통과시킨다
      leaks.push(`${rel(f)}:${i + 1}`);
    });
  }
  expect(leaks).toEqual([]);
  // 배선된 교체 경로(복원·템플릿·새로 만들기·불러오기·샘플)를 세어 둔다: 선택자가 어긋나 아무것도
  // 읽지 못하면 leaks가 빈 배열이라 테스트 이름만 남고 보증이 사라진다(위 두 규칙과 같은 이유).
  expect(swaps.length).toBeGreaterThanOrEqual(4);
});
