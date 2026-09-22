// 견적 표·CSV의 **열 정의 한 벌**(§16.2). 예전에는 estimate.js의 estimateCsv와 estimateDialog의
// tableHtml이 같은 순서를 각자 적어 두어, 덕트 단면이 코드 칸에·길이가 규격 칸에 들어가는 어긋남이
// 두 곳에 똑같이 남았다(감사 §2). 이 파일은 세 갈래(제품·마감재·덕트)를 **한 벌의 행**으로 만들고,
// CSV와 화면 표는 그 행에서 각자 필요한 열만 골라 쓴다.
//
// 불변식: 모든 행에서 `수량 × 단가 = 금액`이다(감사 §3 — 받은 사람이 검산할 수 있어야 한다).
// 마감재·덕트는 수량이 면적(m²)이고 단위 칸이 'm²'다(예전에는 수량 1 · 단가 "68,000원/m²"였다).
const round2 = n => Math.round(n * 100) / 100;

// CSV는 §16.2가 글자까지 정한 여덟 열이다.
export const EST_COLUMNS = ['구분', '이름', '코드', '규격', '수량', '단위', '단가', '금액'];
// 화면 표는 거기에 "길이"를 더한 아홉 열이다(§16.2의 "길이·면적은 각자 칸에").
// CSV에 열을 더하지 않는 이유: §16.2가 CSV의 열 목록을 못 박았다. 길이는 금액의 근거가 아니라
// 물량의 부가 정보이므로 화면에만 둔다(CSV를 받는 쪽은 면적 × 단가로 검산한다).
export const EST_TABLE_COLUMNS = ['구분', '이름', '코드', '규격', '길이', '수량', '단위', '단가', '금액'];
export const PRICE_NOTE = '단가는 예시 값(2026-09 기준)';
export const EST_EMPTY = '배치된 제품·마감재·덕트가 없습니다.';
const KIND_LABEL = { supply: '급기', exhaust: '배기' };

// estimateRows(io/estimate.js)의 결과를 한 벌의 행으로 편다. 순서는 제품 → 마감재 → 덕트다.
export function estimateLines(rows) {
  const out = [];
  for (const r of rows?.products ?? []) {
    out.push({ kind: '제품', name: r.name, code: r.code, spec: r.size, lengthText: '', qty: r.qty, unit: '개', unitPrice: r.unitPrice, total: r.total });
  }
  for (const r of rows?.materials ?? []) {
    // 마감재의 "코드"는 카탈로그 id다(화면에도 그렇게 보여 왔다). 규격은 없다.
    out.push({ kind: '마감재', name: r.name, code: r.id, spec: '', lengthText: '', qty: round2(r.areaM2), unit: 'm²', unitPrice: r.unitPrice, total: r.total });
  }
  for (const r of rows?.ducts ?? []) {
    out.push({
      kind: '덕트', name: `${KIND_LABEL[r.kind] ?? '배기'} ${r.system}`, code: '',
      spec: r.size, lengthText: `${round2(r.lengthM)} m`,
      qty: round2(r.areaM2), unit: 'm²', unitPrice: r.unitPrice, total: r.total,
    });
  }
  return out;
}

// 엑셀이 한글을 깨뜨리지 않게 BOM(U+FEFF)으로 시작한다. 쉼표·따옴표가 든 이름은 감싸 준다.
// BOM은 **이스케이프(`\ufeff`)로 쓴다** — 리터럴로 두면 편집기에서 보이지 않아 실수로 지워도
// 아무도 모르고, 파일을 여는 도구에 따라 소스 자체의 BOM으로 오인된다(리뷰 M-1).
const cell = v => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
export function estimateCsvText(rows) {
  const lines = ['견적서', EST_COLUMNS.join(',')];
  for (const l of estimateLines(rows)) {
    lines.push([l.kind, l.name, l.code, l.spec, l.qty, l.unit, l.unitPrice, l.total].map(cell).join(','));
  }
  lines.push(`합계,,,,,,,${rows?.total ?? 0}`);   // 금액 열(8번째)에 합계를 적는다
  lines.push(PRICE_NOTE);                        // 단가의 출처·기준일(감사 §4)
  return `\ufeff${lines.join('\n')}`;
}
