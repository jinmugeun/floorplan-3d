// §18.1 · 조사 R3: "$DWGCODEPAGE가 ANSI_949인데 실제로는 UTF-8"이 이 기능의 첫 함정이다.
// 규칙은 한 줄이다 — **버전이 코드페이지를 이긴다**(AC1021(R2007) 이상이면 UTF-8).
import { test, expect } from 'vitest';
import { decodeDxf, DxfError, CODEPAGE_ENC } from '../src/io/dxf/decode.js';
import { buildEntity, pairsToRecord, mtextPlain } from '../src/io/dxf/entities.js';

// 합성 DXF 한 장. body는 바이트 배열(인코딩을 직접 고르려고 문자열이 아니라 바이트로 받는다).
function dxfBytes(ver, codepage, body = [], { bom = false, crlf = true } = {}) {
  const nl = crlf ? '\r\n' : '\n';
  const head = [
    '  0', 'SECTION', '  2', 'HEADER',
    '  9', '$ACADVER', '  1', ver,
    '  9', '$DWGCODEPAGE', '  3', codepage,
    '  9', '$INSUNITS', ' 70', '     4',
    '  0', 'ENDSEC', '  0', 'EOF', '',
  ].join(nl);
  const ascii = [...head].map(c => c.charCodeAt(0));
  const out = bom ? [0xef, 0xbb, 0xbf, ...ascii] : ascii;
  return Uint8Array.from([...out, ...body]);
}

test('AC1032는 $DWGCODEPAGE가 ANSI_949여도 UTF-8로 읽는다', () => {
  const utf8 = [...new TextEncoder().encode('조리실 급식기구')];
  const r = decodeDxf(dxfBytes('AC1032', 'ANSI_949', utf8));
  expect(r.encoding).toBe('utf-8');
  expect(r.ver).toBe('AC1032');
  expect(r.codepage).toBe('ANSI_949');
  expect(r.txt).toContain('조리실 급식기구');
});

test('AC1021 미만은 $DWGCODEPAGE를 따른다(ANSI_949 = euc-kr)', () => {
  // C1B6 B8AE BDC7 = EUC-KR '조리실'. 같은 바이트를 UTF-8로 읽으면 대체문자가 된다.
  const eucKr = [0xc1, 0xb6, 0xb8, 0xae, 0xbd, 0xc7];
  const older = decodeDxf(dxfBytes('AC1015', 'ANSI_949', eucKr));
  const newer = decodeDxf(dxfBytes('AC1032', 'ANSI_949', eucKr));
  expect(older.encoding).toBe('euc-kr');
  expect(older.txt).toContain('조리실');
  expect(newer.encoding).toBe('utf-8');
  expect(newer.txt).not.toContain('조리실');
  expect(CODEPAGE_ENC[936]).toBe('gbk');
  expect(CODEPAGE_ENC[1251]).toBe('windows-1251');
});

test('모르는 코드페이지는 windows-1252로 떨어지고 BOM·LF 줄 끝도 받는다', () => {
  expect(decodeDxf(dxfBytes('AC1009', 'ANSI_9999')).encoding).toBe('windows-1252');
  const bom = decodeDxf(dxfBytes('AC1032', 'ANSI_949', [], { bom: true }));
  expect(bom.txt.charCodeAt(0)).not.toBe(0xfeff);
  expect(bom.txt.startsWith('  0')).toBe(true);
  const lf = decodeDxf(dxfBytes('AC1032', 'ANSI_949', [], { crlf: false }));
  expect(lf.ver).toBe('AC1032');
  expect(lf.txt).not.toContain('\r');
});

test('바이너리 DXF·DWG·DXF 아님은 각각 자기 코드로 던진다', () => {
  const sentinel = [...'AutoCAD Binary DXF\r\n\u001a\u0000'].map(c => c.charCodeAt(0));
  const bin = Uint8Array.from([...sentinel, 1, 2, 3]);
  // 던지지 않으면 null이 돌아와 단언이 깨진다 — 빈 try/catch는 지워진 검사도 통과시킨다(Task 1 리뷰 F1).
  const codeOf = fn => { try { fn(); } catch (e) { expect(e).toBeInstanceOf(DxfError); return e.code; } return null; };
  expect(codeOf(() => decodeDxf(bin))).toBe('binary');
  // DWG는 'AC1032' 여섯 글자 뒤가 텍스트가 아니다(0x00). ASCII DXF는 '  0\nSECTION'으로 시작한다.
  const dwg = Uint8Array.from([...[...'AC1032'].map(c => c.charCodeAt(0)), 0, 0, 0, 0, 0]);
  expect(codeOf(() => decodeDxf(dwg))).toBe('dwg');
  const json = Uint8Array.from([...'{"version":1,"floors":[]}'].map(c => c.charCodeAt(0)));
  expect(codeOf(() => decodeDxf(json))).toBe('not-dxf');
});

// 경계값 그 자체: AC1021(R2007)이 UTF-8의 첫 버전이고, 바로 아래 AC1018은 코드페이지를 따른다.
// '<'를 '<='로 잘못 쓰면 R2007 한글 도면이 통째로 깨진다(Task 1 리뷰 F2).
test('AC1021은 UTF-8이고 AC1018은 코드페이지다(경계값)', () => {
  const utf8 = [...new TextEncoder().encode('조리실')];
  const eucKr = [0xc1, 0xb6, 0xb8, 0xae, 0xbd, 0xc7];   // '조리실'의 EUC-KR 바이트
  const r2007 = decodeDxf(dxfBytes('AC1021', 'ANSI_949', utf8));
  expect(r2007.encoding).toBe('utf-8');
  expect(r2007.txt).toContain('조리실');
  const r2004 = decodeDxf(dxfBytes('AC1018', 'ANSI_949', eucKr));
  expect(r2004.encoding).toBe('euc-kr');
  expect(r2004.txt).toContain('조리실');
});

test('decodeDxf는 ArrayBuffer도 받는다(워커가 transferable로 넘긴다)', () => {
  const u8 = dxfBytes('AC1032', 'ANSI_949');
  const ab = u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength);
  expect(decodeDxf(ab).ver).toBe('AC1032');
});

// §18.1: LWPOLYLINE의 10/20 반복은 정점, 42는 **그 정점의** bulge다(다음 정점이 아니다).
// 좌표는 소수로 둔다 — 정수 격자에 우연히 맞는 답을 거른다(전역 제약).
test('buildEntity는 LWPOLYLINE의 정점과 bulge를 정점 자리에 싣는다', () => {
  const e = buildEntity('LWPOLYLINE', [8, 'WAL', 90, '3', 70, '1',
    10, '100.5', 20, '200.25', 10, '1100.5', 20, '200.25', 42, '0.4142', 10, '1100.5', 20, '900.75']);
  expect(e.layer).toBe('WAL');
  expect(e.pts).toEqual([[100.5, 200.25], [1100.5, 200.25], [1100.5, 900.75]]);
  expect(e.bulges[1]).toBeCloseTo(0.4142, 6);
  expect(e.bulges[0]).toBeUndefined();
  expect(e.closed).toBe(true);
});

// VERTEX의 코드 42(bulge)는 INSERT의 y 배율과 같은 코드라 buildEntity에서 `yscale` 슬롯에 들어간다.
// 프로토타입과 **같은 자리, 같은 함정**이다: 읽는 쪽(parse.js)이 그 자리에서 꺼낸다.
test('buildEntity는 VERTEX의 42를 yscale 슬롯에 두고 INSERT의 41/42/50을 배율·회전으로 읽는다', () => {
  const v = buildEntity('VERTEX', [10, '3000.5', 20, '-1200.25', 42, '-0.25']);
  expect([v.x, v.y, v.yscale]).toEqual([3000.5, -1200.25, -0.25]);
  const ins = buildEntity('INSERT', [2, '1f plan-1', 8, '0', 10, '1148348.5', 20, '-991583.25', 41, '-1', 42, '1.5', 50, '90']);
  expect(ins.name).toBe('1f plan-1');
  expect([ins.x, ins.y, ins.xscale, ins.yscale, ins.a0]).toEqual([1148348.5, -991583.25, -1, 1.5, 90]);
  const arc = buildEntity('ARC', [8, '04창호', 10, '0.5', 20, '0.25', 40, '900', 50, '0', 51, '90']);
  expect([arc.r, arc.a0, arc.a1]).toEqual([900, 0, 90]);
  expect(buildEntity('LINE', [67, '1', 8, 'CEN']).paper).toBe(true);
});

// MTEXT는 코드 3 조각들 + 코드 1 꼬리 순서로 잇는다. 서식 코드는 방 이름 매칭·도면 제목이
// 그대로 쓰는 문자열을 더럽히므로 여기서 한 번만 씻는다(§18.4).
test('buildEntity는 MTEXT 조각을 잇고 서식 코드를 씻는다', () => {
  const e = buildEntity('MTEXT', [8, 'TEXT2', 3, '{\\fArial|b0;영양', 3, '상담/', 1, '영양관리실}']);
  expect(e.text).toBe('영양상담/영양관리실');
  expect(mtextPlain('식 당\\P(366석)')).toBe('식 당 (366석)');
  expect(mtextPlain('\\pxi-3,l4,t4;조리실')).toBe('조리실');
  expect(buildEntity('TEXT', [1, '세척실', 40, '300', 8, 'A-SHE']).text).toBe('세척실');
});

test('pairsToRecord는 같은 코드의 첫 값만 남긴다(테이블·헤더 레코드)', () => {
  expect(pairsToRecord([2, 'WAL', 62, '3', 70, '0', 62, '9'])).toEqual({ 2: 'WAL', 62: '3', 70: '0' });
});
