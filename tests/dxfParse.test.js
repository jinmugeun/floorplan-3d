// §18.1의 파서. 이 파일의 픽스처는 실파일의 구조를 작게 줄인 것이다 —
// 레이어 셋(켜짐 · 꺼짐(62 < 0) · 동결(70 & 1)), 중첩 블록 A→B, **미참조 블록** 하나,
// LINE·LWPOLYLINE(bulge)·ARC·TEXT·POLYLINE/VERTEX/SEQEND·페이퍼스페이스 선.
import { test, expect, vi } from 'vitest';
import { parseDxf, headerNum } from '../src/io/dxf/parse.js';

const LINES = [
  '0', 'SECTION', '2', 'HEADER',
  '9', '$ACADVER', '1', 'AC1032',
  '9', '$DWGCODEPAGE', '3', 'ANSI_949',
  '9', '$INSUNITS', '70', '4',
  '9', '$EXTMIN', '10', '475772.81', '20', '-1001340.53', '30', '0.0',
  '0', 'ENDSEC',
  '0', 'SECTION', '2', 'TABLES',
  '0', 'TABLE', '2', 'LAYER', '70', '3',
  '0', 'LAYER', '2', 'WAL', '70', '0', '62', '3', '6', 'Continuous', '370', '25',
  '0', 'LAYER', '2', 'CEN', '70', '0', '62', '-1',
  '0', 'LAYER', '2', 'TEXT2', '70', '1', '62', '7',
  '0', 'ENDTAB',
  '0', 'ENDSEC',
  '0', 'SECTION', '2', 'BLOCKS',
  '0', 'BLOCK', '2', 'A', '8', '0', '10', '10.5', '20', '20.25', '70', '0',
  '0', 'LINE', '8', 'WAL', '10', '0.5', '20', '0.25', '11', '1000.5', '21', '0.25',
  '0', 'INSERT', '2', 'B', '8', '0', '10', '100.5', '20', '0',
  '0', 'ENDBLK',
  '0', 'BLOCK', '2', 'B', '8', '0', '10', '0', '20', '0', '70', '0',
  '0', 'CIRCLE', '8', 'WAL', '10', '0', '20', '0', '40', '50.5',
  '0', 'ENDBLK',
  '0', 'BLOCK', '2', 'UNUSED', '8', '0', '10', '0', '20', '0', '70', '0',
  '0', 'LINE', '8', '급식기구', '10', '0', '20', '0', '11', '9.5', '21', '9.5',
  '0', 'LINE', '8', '급식기구', '10', '1', '20', '1', '11', '8.5', '21', '8.5',
  '0', 'ENDBLK',
  '0', 'ENDSEC',
  '0', 'SECTION', '2', 'ENTITIES',
  '0', 'INSERT', '2', 'A', '8', '0', '10', '0.5', '20', '0.25', '41', '1', '42', '1', '50', '0',
  '0', 'LINE', '8', 'WAL', '10', '0.5', '20', '0.25', '11', '4000.5', '21', '0.25',
  '0', 'LWPOLYLINE', '8', 'FIN', '90', '3', '70', '1',
  '10', '0.5', '20', '0.25', '10', '100.5', '20', '0.25', '42', '0.5', '10', '100.5', '20', '80.75',
  '0', 'ARC', '8', '04창호', '10', '1000.5', '20', '2000.25', '40', '900', '50', '0', '51', '90',
  '0', 'TEXT', '8', 'A-SHE', '10', '500.5', '20', '600.25', '40', '300', '1', '조리실',
  '0', 'POLYLINE', '8', 'WAL', '70', '0',
  '0', 'VERTEX', '8', 'WAL', '10', '0.5', '20', '0.5',
  '0', 'VERTEX', '8', 'WAL', '10', '500.5', '20', '0.5', '42', '0.25',
  '0', 'VERTEX', '8', 'WAL', '10', '500.5', '20', '300.75',
  '0', 'SEQEND', '8', 'WAL',
  '0', 'LINE', '8', 'CEN', '67', '1', '10', '0', '20', '0', '11', '1', '21', '1',
  '0', 'ENDSEC',
  '0', 'EOF',
];
const text = (crlf = true) => LINES.join(crlf ? '\r\n' : '\n') + (crlf ? '\r\n' : '\n');
const doc = () => parseDxf(text());
const typeOf = (d, t) => d.entities.filter(e => e.type === t);

test('헤더 변수를 코드별로 읽는다($ACADVER·$INSUNITS·$DWGCODEPAGE·$EXTMIN)', () => {
  const d = doc();
  // 사전 검토 C-1: 변수 하나는 **다음 코드 9**(또는 0 ENDSEC)에서 끝난다. 이 줄이 없으면
  // $ACADVER 하나가 ENDSEC까지 다 삼켜 헤더 변수가 1개만 남는다.
  expect(Object.keys(d.header)).toEqual(['$ACADVER', '$DWGCODEPAGE', '$INSUNITS', '$EXTMIN']);
  expect(d.header.$EXTMIN).toEqual({ 10: '475772.81', 20: '-1001340.53', 30: '0.0' });
  expect(d.header.$ACADVER[1]).toBe('AC1032');
  expect(d.header.$DWGCODEPAGE[3]).toBe('ANSI_949');
  expect(headerNum(d.header, '$INSUNITS', 70, 0)).toBe(4);
  expect(headerNum(d.header, '$EXTMIN', 10)).toBeCloseTo(475772.81, 2);
  expect(headerNum(d.header, '$EXTMIN', 20)).toBeCloseTo(-1001340.53, 2);
  expect(headerNum(d.header, '$LTSCALE', 40, 7.5)).toBe(7.5);       // 없으면 기본값
});

test('레이어 테이블의 꺼짐(62 < 0)·동결(70 & 1)을 그대로 싣는다', () => {
  const { layers } = doc();
  expect(layers.size).toBe(3);
  expect(layers.get('WAL')).toEqual({ name: 'WAL', color: 3, ltype: 'Continuous', flags: 0, lw: 25 });
  expect(layers.get('CEN').color).toBe(-1);                          // 꺼진 레이어
  expect(layers.get('TEXT2').flags & 1).toBe(1);                     // 동결
});

test('모델스페이스 엔티티를 타입별로 만든다(좌표는 소수 그대로)', () => {
  const d = doc();
  const line = typeOf(d, 'LINE')[0];
  expect([line.x, line.y, line.x2, line.y2]).toEqual([0.5, 0.25, 4000.5, 0.25]);
  expect(line.layer).toBe('WAL');
  const arc = typeOf(d, 'ARC')[0];
  expect([arc.r, arc.a0, arc.a1, arc.layer]).toEqual([900, 0, 90, '04창호']);
  const txt = typeOf(d, 'TEXT')[0];
  expect([txt.text, txt.r]).toEqual(['조리실', 300]);
  expect(typeOf(d, 'INSERT')[0].name).toBe('A');
});

test('LWPOLYLINE은 정점 반복과 bulge를, POLYLINE은 VERTEX를 SEQEND까지 모은다', () => {
  const d = doc();
  const lw = typeOf(d, 'LWPOLYLINE')[0];
  expect(lw.pts).toEqual([[0.5, 0.25], [100.5, 0.25], [100.5, 80.75]]);
  expect(lw.bulges[1]).toBeCloseTo(0.5, 6);
  expect(lw.closed).toBe(true);
  const pl = typeOf(d, 'POLYLINE')[0];
  expect(pl.pts).toEqual([[0.5, 0.5], [500.5, 0.5], [500.5, 300.75]]);
  expect(pl.bulges).toEqual([0, 0.25, 0]);                           // VERTEX의 42는 yscale 슬롯에서 온다
  expect(pl.closed).toBe(false);
  expect(typeOf(d, 'VERTEX')).toHaveLength(0);                       // 정점은 폴리라인 안에만 있다
  expect(typeOf(d, 'SEQEND')).toHaveLength(0);
});

test('페이퍼스페이스(67 = 1) 엔티티는 paper 플래그를 갖는다(전개에서 뺀다)', () => {
  const d = doc();
  const paper = d.entities.filter(e => e.paper);
  expect(paper).toHaveLength(1);
  expect(paper[0].layer).toBe('CEN');
});

// §18.1의 두 패스. 이것이 실파일에서 블록 엔티티의 81.9 %를 만들지 않게 하는 규칙이다.
test('미참조 블록의 엔티티는 만들지 않고, 참조 블록의 것은 만든다', () => {
  const d = doc();
  expect(d.blocks.size).toBe(3);
  expect(d.blocks.get('UNUSED').entities).toEqual([]);
  expect(d.blocks.get('UNUSED').inserts.size).toBe(0);
  expect(d.blocks.get('A').entities.map(e => e.type)).toEqual(['LINE', 'INSERT']);
  expect(d.blocks.get('B').entities.map(e => e.type)).toEqual(['CIRCLE']);
  expect(d.blocks.get('A').base).toEqual([10.5, 20.25]);
  expect(d.counts).toEqual({ blocks: 3, blocksUsed: 2, entities: d.entities.length, blockEntities: 3 });
});

test('블록 참조는 전이적으로 닫는다(모델스페이스 → A → B)', () => {
  const d = doc();
  expect([...d.blocks.get('A').inserts]).toEqual(['B']);
  // B는 모델스페이스가 직접 부르지 않는다 — A를 통해서만 도달한다.
  expect(d.entities.some(e => e.type === 'INSERT' && e.name === 'B')).toBe(false);
  expect(d.blocks.get('B').entities).toHaveLength(1);
});

test('CRLF와 LF 줄 끝이 같은 결과를 낸다', () => {
  const a = parseDxf(text(true)), b = parseDxf(text(false));
  expect(b.entities.length).toBe(a.entities.length);
  expect(b.layers.get('WAL')).toEqual(a.layers.get('WAL'));
  expect(b.blocks.get('A').entities.length).toBe(a.blocks.get('A').entities.length);
});

test('onProgress는 0으로 시작해 1로 끝나고, ENTITIES가 비어도 죽지 않는다', () => {
  const onProgress = vi.fn();
  parseDxf(text(), { onProgress });
  expect(onProgress.mock.calls[0][0]).toBe(0);
  expect(onProgress.mock.calls.at(-1)[0]).toBe(1);
  const empty = parseDxf(['0', 'SECTION', '2', 'ENTITIES', '0', 'ENDSEC', '0', 'EOF', ''].join('\r\n'));
  expect(empty.entities).toEqual([]);
  expect(empty.counts.blocks).toBe(0);
});
