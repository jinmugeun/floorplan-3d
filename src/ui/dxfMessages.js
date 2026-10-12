// DXF 가져오기의 사용자 문구(DXF_* — §18.6 오류·알림·진행·배지, §18.7 시작 화면 카드, §18.10 끊긴 끝점 배너).
// 2026-10-12 · 300줄 예산 · 계획 12 Task 0: messages.js에서 글자 그대로 옮겼다 — messages.js가 `export *`로 다시 내보내므로
// 부르는 쪽은 여전히 ui/messages.js 한 곳에서 import한다(문구 한 곳 규칙 §14.8 · §16.8).

// 끊긴 끝점은 이 기능의 결론이다(§18.10: 시간이 모자라도 자르지 않는다). 배너와 대화상자가
// 같은 사실을 다른 자리에서 말한다 — 배너는 문장, 대화상자는 수치다.
export const DXF_OPEN_ENDS = n => `벽이 이어지지 않은 곳이 ${n}군데 있습니다`;
export const DXF_OPEN_ENDS_VIEW = '보기';

// DXF 가져오기(§18.6의 표 — 글자 그대로다). 파서·워커는 코드만 던지고(io/dxf/decode.js의 DxfError),
// 사람이 읽는 문장은 여기 하나다: 워커는 ui/를 import할 수 없으므로 문구가 저쪽에 갈 수 없다.
export const DXF_NOT_DXF = 'DXF 파일이 아닙니다 (HEADER 섹션을 찾을 수 없습니다)';
export const DXF_BINARY = '바이너리 DXF는 아직 지원하지 않습니다. CAD에서 ASCII DXF로 다시 저장해 주세요';
export const DXF_IS_DWG = 'DWG는 열 수 없습니다. CAD에서 DXF로 저장해 주세요';
export const DXF_NO_WALLS = '벽으로 보이는 평행선을 찾지 못했습니다. 레이어를 직접 골라 주세요';
export const DXF_TOO_BIG = '도면이 너무 큽니다. CAD에서 PURGE로 미사용 블록을 지운 뒤 다시 시도해 주세요';
// 코드 → 문장. 대화상자의 `.error` 줄이 이 맵만 본다(워커가 보낸 message는 개발자용이다).
export const DXF_ERRORS = { 'not-dxf': DXF_NOT_DXF, binary: DXF_BINARY, dwg: DXF_IS_DWG, 'no-walls': DXF_NO_WALLS, oom: DXF_TOO_BIG };

// 검토 대화상자(§18.6). 오류 다섯은 Task 1이 이미 올렸고 여기는 알림·진행·머리줄·수치다.
// DXF_OPEN_ENDS·DXF_OPEN_ENDS_VIEW 둘은 배너(§18.10)가 먼저 올려 두었으므로 여기서 다시 내보내지 않는다.
export const DXF_MANY_SHEETS = '도면 좌표 범위가 너무 넓습니다 — 가장 큰 도면 한 장만 가져옵니다';
export const DXF_UNITS_GUESS = '도면에 단위가 없어 mm로 봅니다. 다르면 위에서 바꿔 주세요';
export const DXF_LAYERS_GUESSED = '벽 레이어를 찾지 못해 도형으로 추정했습니다. 체크를 확인해 주세요';
// 2026-10-02: 한 파일에 도면이 여러 벌일 때(신상중: 같은 건물의 두 안) 고르는 칸의 알림과 항목.
export const DXF_MANY_PLANS = n => `이 파일에 도면이 ${n}개 있습니다. 가져올 도면을 골라 주세요`;
export const DXF_REGION = (i, wM, hM, hint) => `도면 ${i} · ${wM} m × ${hM} m${hint ? ` · ${hint}` : ''}`;
export const DXF_REGION_LABEL = '도면';
// 가져오기가 방 구조를 도면의 실명·면적 표기에 맞췄다(io/dxf/reconcile.js): 구획선 = 방만 나누는 점선, 딸린 방 = 한 실로 센 칸.
export const DXF_RECONCILED = (dividers, annexes) => '도면의 면적 표기에 맞춰 ' + (dividers ? '구획선 ' + dividers + '개를 ' + (annexes ? '긋고 ' : '그었습니다') : '') + (annexes ? '딸린 방 ' + annexes + '곳을 합쳤습니다' : '');
// 실명만으로 구획선(2026-10-12 · 계획 12 Task 6 · io/dxf/nameDividers.js): 검토 창 체크박스(기본 꺼짐 — 사용자 결정 2026-10-02: 면적 표기 없이
// 자동으로 긋지 않는다)와 켰을 때 그은 수. 제안이므로 미리보기의 점선을 사람이 확인하게 말한다.
export const DXF_NAME_DIVIDERS = '실명만으로 구획선 제안(면적 표기 없을 때)';
export const DXF_NAME_DIVIDED = n => `실명만으로 구획선 ${n}개를 제안했습니다 — 미리보기의 점선을 확인해 주세요`;
// 난간 구획선(2026-10-12 · 계획 12 최종 리뷰 X-4 · M5-4 · io/dxf/railDividers.js): 옵션 없이 늘 긋는데 검토 창이 말하지 않아 점선이 설명 없이
// 나타났다. 그은 수(stats.railDividers — 구획선 조각 수)를 따로 알린다 — 면적 표기 문구(DXF_RECONCILED · stats.dividers)와 섞지 않는다.
export const DXF_RAIL_DIVIDED = n => `난간으로 닫은 구획선 ${n}개를 그었습니다 — 미리보기의 점선을 확인해 주세요`;
// 기구 배치(2026-10-12 · 계획 13 Task 3 · io/dxf/equipment.js): 검토 창 체크박스(기본 켬 — 급식기구 배치도의 절반이 기구다)와 세운 수.
// 제품 = 카탈로그 제품으로 맞춘 것 · 일반 = '도면 기구' 상자(이름·크기는 도면 그대로).
// 충돌 = 가져오자마자 앱 배너가 말할 수와 **같은 수**(2026-10-12 · 최종 리뷰 F-3 · I3-2 — stats.equipment.colliding = 완성된 아이템의 collidingIds):
// 예전 "벽과 겹침 0 · 기구끼리 겹침 14"는 기둥에 닿은 기구를 세지 않아 배너 "충돌 30건"과 달랐다. 충돌은 바닥 아이템끼리(기둥·기구)라 벽은 들지 않는다.
// 벽·기둥과 겹침(clash — 벽 띠·기둥에 절반 넘게 덮인 바닥 기구, 옮기지 않고 사람이 본다)은 0이 아닐 때만 덧붙인다(옛 문구 "벽과"는 기둥을 빠뜨렸다).
export const DXF_EQUIPMENT_OPT = '도면의 기구를 제품으로 배치';
export const DXF_EQUIPMENT = (placed, product, generic, colliding, clash = 0) =>
  `기구 ${placed}개 배치 — 제품 ${product} · 일반 ${generic} · 충돌 ${colliding}건(기둥·기구 겹침 · 빨간 테두리)${clash ? ` · 벽·기둥과 겹침 ${clash}` : ''}`;
export const DXF_TRACE_SKIPPED = '원 도면이 너무 커서 배경으로 남기지 않았습니다';
export const DXF_IMPORTED = (walls, rooms) => `벽 ${walls}개 · 방 ${rooms}개를 가져왔습니다`;
export const DXF_OPEN_END_COUNT = n => `⚠ 끊긴 끝점 ${n}개`;
// §18.4가 약속한 한 줄. 도면의 실명을 방에 못 붙인 수 = 닫히지 않은 공간의 수다
// (toProject.js의 stats.unmatchedNames). 끊긴 끝점 수와 짝이다 — 같은 결함의 두 얼굴이다.
export const DXF_UNMATCHED = n => `닫히지 않은 공간 ${n}곳`;
export const DXF_NUMS = (walls, rooms, areaM2) => `벽 ${walls} · 방 ${rooms} · 면적 ${areaM2} m²`;
export const DXF_HEAD = (title, wM, hM, unit, insunits, ver) => `${title} · ${wM} m × ${hM} m · ${unit} (INSUNITS=${insunits}) · ${ver}`;
// 진행 막대 4단계. phase → 단계 매핑도 여기 한 곳이다(워커가 보내는 phase 이름이 정본이다).
export const DXF_STEP_READ = '파일 읽는 중';
export const DXF_STEP_PARSE = n => `도면 해석 중 (블록 ${n}개)`;
export const DXF_STEP_WALLS = '벽 찾는 중';
export const DXF_STEP_ROOMS = '방 만드는 중';
export const DXF_PHASE_STEP = { decode: 1, parse: 2, explode: 2, walls: 3, rooms: 4, trace: 4 };
export const DXF_BADGE_OFF = '꺼진 레이어';
export const DXF_BADGE_HATCH = '해치(벽 채움)';
// 이름이 아니라 내용으로 판정한 레이어(layerGuess.refineByContent) — 사람이 확인할 줄이다.
export const DXF_BADGE_GUESSED = '도형으로 추정';
export const DXF_BADGE_COLOR = '색으로 판정';

// 시작 화면의 네 번째 동작 카드(§18.7). 문구는 §18.7이 글자로 정했다.
export const DXF_CARD_TITLE = 'DXF 도면 가져오기';
export const DXF_CARD_DESC = '캐드 도면(.dxf)에서 벽을 자동으로 뽑아 평면도를 만듭니다.';

// 정규화 DXF 내보내기(2026-10-12 · 계획 12 Task 3 — io/dxfExport.js): 더보기 메뉴 · 내보낸 뒤 알림 · 실패 알림.
// 통로 "n곳 읽히지 않음" 문구는 지웠다(2026-10-12 · 최종 리뷰 X-6 · N3-3): 모든 통로가 `PASS-` 블록으로 돌아와 그 수가 늘 0이었다.
// 실패(최종 리뷰 X-6 · M3-3): 재배포 뒤 옛 탭이 내보내기 청크를 못 불러오는 것이 가장 흔한 원인이라 새로 고침을 말한다(저장이 먼저).
export const DXF_EXPORT_MENU = '정규화 DXF 내보내기';
export const DXF_EXPORTED = '정규화 DXF를 내보냈습니다 — CAD에서 고친 뒤 다시 가져오세요';
export const DXF_EXPORT_FAILED = '정규화 DXF를 내보내지 못했습니다. 작업을 저장한 뒤 페이지를 새로 고쳐 다시 시도해 주세요';
// 교정 기록 내보내기(2026-10-12 · 계획 12 Task 10 — io/dxfFeedback.js): 더보기 메뉴 · DXF로 가져온 프로젝트가 아닐 때 · 내보낸 뒤의 수.
// 알림은 합계(changes)를 먼저, 그다음 **0이 아닌 범주만**(2026-10-12 · 최종 리뷰 X-7 · M10-1): 예전 알림은 범주 일곱만 늘 적어, 새 방·크기·추가만
// 바뀐 기록이 "벽 지움 0 · 그림 0 · …" 0만 늘어놓았고, 지운 기둥을 "문·창 지움"으로 셌다. 지운 것은 문·창(개구부)과 기둥(columnsDeleted)을 가른다.
// 전체 목록은 파일 안의 summary다.
// 기구를 가른다(2026-10-12 · 계획 13 최종 리뷰 F-5): 기구(dxfBlock 있는 아이템 — equipDeleted·equipMoved·equipResized ⊂ items*)를 "문·창"으로 세던 것을
// "기구 지움/옮김/크기"로 뺀다. 바닥 이동을 pos로 재게 되어 기둥 이동(columnsMoved)도 잡힌다 — "기둥 옮김"으로 따로 센다(예전 M10-5: 못 쟀다).
export const DXF_FEEDBACK_MENU = '교정 기록 내보내기';
export const DXF_FEEDBACK_NONE = 'DXF로 가져온 프로젝트가 아닙니다';
const z = v => Number(v) || 0;
const FEEDBACK_PARTS = [
  ['벽 지움', s => s.wallsDeleted], ['벽 그림', s => s.wallsAdded], ['벽 옮김', s => s.wallsMoved],
  ['방 이름', s => s.roomsRenamed], ['새 방', s => s.roomsAdded], ['없어진 방', s => s.roomsDeleted],
  ['문·창 지움', s => z(s.itemsDeleted) - z(s.columnsDeleted) - z(s.equipDeleted)], ['기둥 지움', s => s.columnsDeleted], ['기구 지움', s => s.equipDeleted],
  ['문·창 옮김', s => z(s.itemsMoved) - z(s.columnsMoved) - z(s.equipMoved)], ['기둥 옮김', s => s.columnsMoved], ['기구 옮김', s => s.equipMoved],
  ['문·창·기둥 크기', s => z(s.itemsResized) - z(s.equipResized)], ['기구 크기', s => s.equipResized], ['종류', s => s.itemsRetyped], ['문·창·기둥 추가', s => s.itemsAdded],
];
export const DXF_FEEDBACK_EXPORTED = s => {
  if (!s?.changes) return '교정 기록을 내보냈습니다 — 가져온 뒤 고친 것이 없습니다';
  const parts = FEEDBACK_PARTS.map(([label, n]) => [label, Number(n(s)) || 0]).filter(([, n]) => n > 0).map(([label, n]) => `${label} ${n}`);
  return `교정 기록을 내보냈습니다 — 고친 것 ${s.changes}건${parts.length ? `: ${parts.join(' · ')}` : ''}`;
};
// 검토 창의 입력 도면 안내 줄(사전 검토 3): 선 수 · 체크한 벽 레이어 수 + 안내 페이지(public/dxf-guide.html · 새 탭).
export const DXF_GUIDE_LINE = (segs, layers) => `선 ${Number(segs || 0).toLocaleString('en-US')}개 중 벽 레이어 ${layers}개`;
export const DXF_GUIDE_LINK = '입력 도면 안내 ↗';
export const DXF_GUIDE_HREF = 'dxf-guide.html';

// 가져오기 자체가 실패했을 때의 한 줄(리뷰 F-3). DXF_ERRORS 다섯은 §18.6의 표가 동결한 파싱·추출
// 오류라 여기에 섞지 않는다 — 이 문장은 호출자(store.swap·자동 저장)가 거절했을 때만 나오고,
// 가장 흔한 원인인 트레이스 배경(최대 1.2 MB)을 사용자가 이 대화상자에서 바로 끌 수 있게 말한다.
export const DXF_IMPORT_FAILED = '가져오기를 마치지 못했습니다. 원 도면을 배경으로 남기지 않고 다시 시도해 주세요';
