// DXF 바이트 → 텍스트(§18.1 · 조사 R3). 이 파일이 답하는 질문은 하나다 —
// **이 바이트 뭉치를 어떤 인코딩으로 읽어야 "급식기구·조리실"이 나오는가**.
// 실파일이 그 규칙의 증거다: 헤더에 `$DWGCODEPAGE ANSI_949`라고 적혀 있지만 `$ACADVER`가
// AC1032(AutoCAD 2018)라 문자열은 **UTF-8**이다. CP949로 읽으면 한글이 전부 한자 모지바케가 된다.
// 그래서 **버전이 코드페이지를 이긴다**: AC1021(R2007) 이상이면 무조건 UTF-8.

// code만 갖는다. 사용자 문구는 ui/messages.js의 DXF_ERRORS[code]다 — 이 파일은 워커가 import하므로
// ui/를 부를 수 없다(전역 제약: 워커는 DOM·ui 모듈을 건드리지 않는다).
export class DxfError extends Error {
  constructor(code) { super(code); this.name = 'DxfError'; this.code = code; }
}

export const CODEPAGE_ENC = { 949: 'euc-kr', 936: 'gbk', 932: 'shift_jis', 950: 'big5', 1252: 'windows-1252', 1251: 'windows-1251' };

const BINARY_SENTINEL = 'AutoCAD Binary DXF\r\n\u001a\u0000';
const HEAD_BYTES = 4096;
const toU8 = buf => (buf instanceof Uint8Array ? buf : new Uint8Array(buf));
// 앞머리만 latin1로 훑는다(바이트 = 코드포인트). 인코딩을 아직 모르므로 여기서는 글자가 아니라
// 바이트 모양만 본다 — $ACADVER·$DWGCODEPAGE·시그니처는 전부 ASCII다.
const latin1 = (u8, to) => { let s = ''; for (let i = 0; i < to; i++) s += String.fromCharCode(u8[i]); return s; };
const isText = ch => ch !== undefined && /[\t\n\r\x20-\x7e]/.test(ch);

export function decodeDxf(buf) {
  const u8 = toU8(buf);
  const head = latin1(u8, Math.min(HEAD_BYTES, u8.length));
  if (head.startsWith(BINARY_SENTINEL)) throw new DxfError('binary');
  // DWG는 버전 여섯 글자('AC1032')로 시작하고 그다음 바이트가 텍스트가 아니다(0x00).
  // ASCII DXF는 '  0\nSECTION'으로 시작하므로 이 검사와 겹칠 일이 없다.
  if (/^AC10\d\d/.test(head) && !isText(head[6])) throw new DxfError('dwg');
  // HEADER 섹션을 찾을 수 없다 = DXF가 아니다(§18.6의 DXF_NOT_DXF). 앞 4 KB 안에 SECTION이
  // 없으면 어떤 DXF도 아니다 — 실파일도 첫 두 줄이 '  0' / 'SECTION'이다.
  if (!/\bSECTION\b/.test(head)) throw new DxfError('not-dxf');
  const ver = /\$ACADVER\r?\n\s*1\r?\n(AC\d+)/.exec(head)?.[1] ?? 'AC1015';
  const codepage = /\$DWGCODEPAGE\r?\n\s*3\r?\n(\S+)/.exec(head)?.[1] ?? 'ANSI_1252';
  let encoding = 'utf-8';
  if (Number(ver.slice(2)) < 1021) {
    encoding = CODEPAGE_ENC[Number(/ANSI_(\d+)/.exec(codepage)?.[1])] ?? 'windows-1252';
  }
  let txt;
  try { txt = new TextDecoder(encoding, { fatal: false }).decode(u8); }
  catch { txt = new TextDecoder('utf-8', { fatal: false }).decode(u8); }   // 브라우저가 모르는 레거시 코드페이지
  if (txt.charCodeAt(0) === 0xfeff) txt = txt.slice(1);                    // BOM 한 글자
  return { txt, ver, codepage, encoding };
}
