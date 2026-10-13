// 정규화 DXF의 고정 틀(2026-10-12 · 계획 12 Task 3). 내보내기(dxfExport.js)는 도형만 만들고, 이 파일이 그 도형을
// **AutoCAD 2007(AC1021) DXF**로 감싼다. 왜 AC1021인가: AC1009(R12)에는 LWPOLYLINE이 없고, 우리 디코더(io/dxf/decode.js)는
// AC1021 이상일 때만 UTF-8로 읽는다 — 그보다 낮으면 $DWGCODEPAGE 코드페이지로 읽어 한글 실명이 깨진다($DWGCODEPAGE는 적지 않는다).
// R2000 이상 DXF가 CAD에서 열리려면 필요한 최소 구성(ezdxf 문서 "Minimal DXF Content · DXF R13/R14 and later"):
//  HEADER($ACADVER · $HANDSEED) · CLASSES(비어도 된다) · TABLES 아홉(VPORT·LTYPE(ByBlock·ByLayer·Continuous)·LAYER(0)·STYLE(Standard)·
//  VIEW·UCS·APPID(ACAD)·DIMSTYLE(Standard)·BLOCK_RECORD(*Model_Space·*Paper_Space)) · BLOCKS(*Model_Space·*Paper_Space) · ENTITIES ·
//  OBJECTS(루트 DICTIONARY와 그 안의 ACAD_GROUP). 모든 레코드·엔티티는 고유 핸들(5 — DIMSTYLE만 105)과 주인(330)과 하위 클래스 표지(100)를 갖는다.
// 이 파일은 DOM을 모른다(테스트·도구가 node에서 그대로 부른다).

// 숫자 → DXF 값(소수 셋째 자리 · -0 접기 · 지수 표기 없음 — 좌표는 mm라 1e21에 닿지 않는다).
export const num = v => { const r = Math.round((Number(v) || 0) * 1000) / 1000; return String(r || 0); };

// 레이어(이름 · ACI 색). 이름이 곧 다시 들여올 때의 역할이다(io/dxf/classify.js LAYER_RULES — 2026-10-12 실측):
//  WALL → 벽('wal') · COLUMN → 벽('col' — 기둥 사각형은 벽 레이어에서 찾는다) · ROOM-TEXT·TITLE → 문자('text'·'title') ·
//  OPENING·ROOM → 기타(아무 키도 맞지 않는다 — 기본 체크 밖이라 벽 판정에 끼지 않는다) · DIVIDER → 난간('divider' — 2026-10-12
//  최종 리뷰 X-1: 구획선을 railDividers가 다시 긋는다 · 벽 체크 밖) · 개구부 → 개구부('개구' —
//  통로 표시 X만 싣는다: 문·창 근거) · DIM → 치수('dim'). 문·창 블록은 일부러 '기타' 레이어(OPENING)에 둔다 — 개구부 역할이면
//  틀 사각형의 긴 변이 창 구간(windowSpans)·창틀 띠(op)로도 읽힌다. 기타 레이어에는 청록(ACI 4)을 쓰지 않는다: 이름이 기타인
//  청록 레이어는 내용으로 창호가 된다(layerGuess.refineByContent ①).
// WALL-2: 나란히 붙은 이웃 벽(띠 사이 틈 ≤ bandGap)의 둘째 벽 레이어 — 가져오기는 **레이어가 겹치지 않는** 두 선 사이 틈(cavityMin 150 이상)에서만
// 두 벽으로 가른다(bands.groupOffsets). 한 레이어에 다 그리면 붙은 두 벽이 한 띠(두꺼운 벽 하나)가 된다(2026-10-12 내곡중 250 | 150 틈 | 380).
// EQUIP(2026-10-13 · 계획 14 Task E): 기구 블록 `EQ-…`의 INSERT(dxfExportEquip.js) → 기구('equip' 키 — 벽·개구부 판정 밖). 주황(ACI 30) — 청록이 아니다.
export const PASS_LAYER = '개구부';
export const WALL_LAYERS = Object.freeze(['WALL', 'WALL-2']);
export const EXPORT_LAYERS = Object.freeze([
  { name: 'WALL', color: 7 }, { name: 'WALL-2', color: 7 }, { name: 'COLUMN', color: 8 }, { name: 'OPENING', color: 3 }, { name: PASS_LAYER, color: 1 },
  { name: 'DIVIDER', color: 9 }, { name: 'ROOM', color: 5 }, { name: 'ROOM-TEXT', color: 2 }, { name: 'DIM', color: 6 }, { name: 'TITLE', color: 7 },
  { name: 'EQUIP', color: 30 },
]);
// 벽 중심선의 선 종류(mm 도면 눈금 · 600 선 100 틈 100 점 100 틈). 다시 들여올 때 선 종류는 보지 않는다.
export const CENTER_LTYPE = 'CENTER';

// 핸들 발급기 + 쌍 목록. 핸들은 16진 대문자, 1부터 차례로 — $HANDSEED는 마지막 다음 값이다.
function writer() {
  let seed = 1;
  const out = [];
  return {
    handle: () => (seed++).toString(16).toUpperCase(),
    get seed() { return seed.toString(16).toUpperCase(); },
    tag: (code, value) => { out.push(String(code), String(value)); },
    pairs: list => { for (const [c, v] of list) out.push(String(c), String(v)); },
    text: () => out.join('\n'),
  };
}

// 엔티티 한 개: 0 종류 · 5 핸들 · 330 주인(블록 레코드) · 100 AcDbEntity · 8 레이어 · (6 선 종류) · 몸통(하위 클래스 표지 포함).
function entity(w, owner, e, paper = false) {
  w.pairs([[0, e.type], [5, w.handle()], [330, owner], [100, 'AcDbEntity']]);
  if (paper) w.tag(67, 1);
  w.tag(8, e.layer ?? '0');
  if (e.ltype) w.tag(6, e.ltype);
  w.pairs(e.body);
}

// 표 하나: TABLE 머리(핸들 · 주인 0 · AcDbSymbolTable · 개수) → 레코드들 → ENDTAB. rec(handle, tableHandle)이 레코드 쌍을 낸다.
function table(w, name, records, extraHead = null) {
  const th = w.handle();
  w.pairs([[0, 'TABLE'], [2, name], [5, th], [330, 0], [100, 'AcDbSymbolTable'], [70, records.length]]);
  if (extraHead) w.pairs(extraHead(th));
  for (const rec of records) rec(th);
  w.tag(0, 'ENDTAB');
}
const record = (w, type, subclass, body, code = 5) => th => {
  w.pairs([[0, type], [code, w.handle()], [330, th], [100, 'AcDbSymbolTableRecord'], [100, subclass], ...body]);
};

// 문서 전체. layers: EXPORT_LAYERS 꼴, blocks: [{ name, entities: [엔티티], anonymous? }], entities: [엔티티](모형 공간),
// box: [x0, y0, x1, y1](DXF 좌표 — $EXTMIN·$EXTMAX와 *Active 뷰포트). 엔티티 = { type, layer, ltype?, body: [[code, value], …] }.
export function dxfDocument({ layers = EXPORT_LAYERS, blocks = [], entities = [], box = [0, 0, 0, 0] } = {}) {
  const w = writer();
  const body = writer();
  // 핸들은 쓰는 차례대로 받되, 앞에서 가리켜야 하는 것(블록 레코드)은 표를 쓸 때 정해 둔다.
  const h = body.handle;
  const cx = (box[0] + box[2]) / 2, cy = (box[1] + box[3]) / 2;
  const span = Math.max(box[2] - box[0], box[3] - box[1], 1000) * 1.1;
  body.pairs([[0, 'SECTION'], [2, 'CLASSES'], [0, 'ENDSEC'], [0, 'SECTION'], [2, 'TABLES']]);
  table(body, 'VPORT', [record(body, 'VPORT', 'AcDbViewportTableRecord', [
    [2, '*Active'], [70, 0], [10, 0], [20, 0], [11, 1], [21, 1], [12, num(cx)], [22, num(cy)], [13, 0], [23, 0], [14, 10], [24, 10],
    [15, 10], [25, 10], [16, 0], [26, 0], [36, 1], [17, 0], [27, 0], [37, 0], [40, num(span)], [41, 1.5], [42, 50], [43, 0], [44, 0],
    [50, 0], [51, 0], [71, 0], [72, 1000], [73, 1], [74, 3], [75, 0], [76, 0], [77, 0], [78, 0],
  ])]);
  const ltype = (name, desc, pattern = []) => record(body, 'LTYPE', 'AcDbLinetypeTableRecord', [
    [2, name], [70, 0], [3, desc], [72, 65], [73, pattern.length], [40, num(pattern.reduce((a, x) => a + Math.abs(x), 0))],
    ...pattern.flatMap(x => [[49, num(x)], [74, 0]]),
  ]);
  table(body, 'LTYPE', [ltype('ByBlock', ''), ltype('ByLayer', ''), ltype('Continuous', 'Solid line'),
    ltype(CENTER_LTYPE, 'Center ____ _ ____ _', [600, -100, 100, -100])]);
  table(body, 'LAYER', [{ name: '0', color: 7 }, ...layers].map(l => record(body, 'LAYER', 'AcDbLayerTableRecord', [
    [2, l.name], [70, 0], [62, l.color], [6, 'Continuous'], [370, -3],
  ])));
  // 글꼴: 한글 실명이 CAD에서 읽히도록 맑은 고딕(Windows 기본 트루타입). txt.shx는 한글을 그리지 못한다.
  table(body, 'STYLE', [record(body, 'STYLE', 'AcDbTextStyleTableRecord', [
    [2, 'Standard'], [70, 0], [40, 0], [41, 1], [50, 0], [71, 0], [42, 250], [3, 'malgun.ttf'], [4, ''],
  ])]);
  table(body, 'VIEW', []);
  table(body, 'UCS', []);
  table(body, 'APPID', [record(body, 'APPID', 'AcDbRegAppTableRecord', [[2, 'ACAD'], [70, 0]])]);
  // DIMSTYLE: 표 머리에 AcDbDimStyleTable 표지가 하나 더 있고, 레코드의 핸들은 코드 105다(R2000 이상의 예외).
  let dimH = null;
  table(body, 'DIMSTYLE', [th => {
    body.pairs([[0, 'DIMSTYLE'], [105, dimH], [330, th], [100, 'AcDbSymbolTableRecord'], [100, 'AcDbDimStyleTableRecord'], [2, 'Standard'], [70, 0]]);
  }], () => { dimH = h(); return [[100, 'AcDbDimStyleTable'], [71, 1], [340, dimH]]; });
  // 블록 레코드: *Model_Space · *Paper_Space · 개구부·기구(EQ-)·치수 블록마다 하나. 70 단위(0) · 280 분해 가능 · 281 배율 고정 아님(AC1021).
  const names = ['*Model_Space', '*Paper_Space', ...blocks.map(b => b.name)];
  const brec = new Map();
  table(body, 'BLOCK_RECORD', names.map(name => th => {
    const hh = h();
    brec.set(name, hh);
    body.pairs([[0, 'BLOCK_RECORD'], [5, hh], [330, th], [100, 'AcDbSymbolTableRecord'], [100, 'AcDbBlockTableRecord'], [2, name], [340, 0], [70, 0], [280, 1], [281, 0]]);
  }));
  body.pairs([[0, 'ENDSEC'], [0, 'SECTION'], [2, 'BLOCKS']]);
  for (const name of names) {
    const own = brec.get(name), paper = name === '*Paper_Space';
    const def = blocks.find(b => b.name === name);
    body.pairs([[0, 'BLOCK'], [5, h()], [330, own], [100, 'AcDbEntity']]);
    if (paper) body.tag(67, 1);
    // 70: 1 = 익명 블록(치수의 *D 그림 블록).
    body.pairs([[8, 0], [100, 'AcDbBlockBegin'], [2, name], [70, def?.anonymous ? 1 : 0], [10, 0], [20, 0], [30, 0], [3, name], [1, '']]);
    for (const e of def?.entities ?? []) entity(body, own, e);
    body.pairs([[0, 'ENDBLK'], [5, h()], [330, own], [100, 'AcDbEntity']]);
    if (paper) body.tag(67, 1);
    body.pairs([[8, 0], [100, 'AcDbBlockEnd']]);
  }
  body.pairs([[0, 'ENDSEC'], [0, 'SECTION'], [2, 'ENTITIES']]);
  const ms = brec.get('*Model_Space');
  for (const e of entities) entity(body, ms, e);
  // OBJECTS: 루트 사전이 첫 객체이고 ACAD_GROUP 사전(비어 있다)을 가리킨다.
  const root = h(), group = h();
  body.pairs([[0, 'ENDSEC'], [0, 'SECTION'], [2, 'OBJECTS'],
    [0, 'DICTIONARY'], [5, root], [330, 0], [100, 'AcDbDictionary'], [281, 1], [3, 'ACAD_GROUP'], [350, group],
    [0, 'DICTIONARY'], [5, group], [330, root], [100, 'AcDbDictionary'], [281, 1],
    [0, 'ENDSEC'], [0, 'EOF']]);
  // HEADER는 맨 끝에 쓴다 — $HANDSEED가 마지막 핸들 다음 값이어야 한다.
  w.pairs([[0, 'SECTION'], [2, 'HEADER'],
    [9, '$ACADVER'], [1, 'AC1021'],
    [9, '$INSBASE'], [10, 0], [20, 0], [30, 0],
    [9, '$EXTMIN'], [10, num(box[0])], [20, num(box[1])], [30, 0],
    [9, '$EXTMAX'], [10, num(box[2])], [20, num(box[3])], [30, 0],
    [9, '$CLAYER'], [8, 0],
    [9, '$INSUNITS'], [70, 4],
    [9, '$MEASUREMENT'], [70, 1],
    [9, '$HANDSEED'], [5, body.seed],
    [0, 'ENDSEC']]);
  return `${w.text()}\n${body.text()}\n`;
}
