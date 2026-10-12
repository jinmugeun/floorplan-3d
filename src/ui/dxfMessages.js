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

// 정규화 DXF 내보내기(2026-10-12 · 계획 12 Task 3 — io/dxfExport.js): 더보기 메뉴 · 내보낸 뒤 알림. 통로 중 다시 들여올 때 그 자리·폭으로
// 읽히지 않는 것(벽 끝과의 토막이 150 mm 미만 · 폭 3 m 초과 등)은 벽을 끊지 않고 X로만 표시하므로 그 수를 함께 말한다.
export const DXF_EXPORT_MENU = '정규화 DXF 내보내기';
export const DXF_EXPORTED = '정규화 DXF를 내보냈습니다 — CAD에서 고친 뒤 다시 가져오세요';
export const DXF_EXPORTED_SKIPPED = n => `${DXF_EXPORTED} (통로 ${n}곳은 다시 가져올 때 읽히지 않아 벽을 잇고 X로만 표시했습니다)`;
// 교정 기록 내보내기(2026-10-12 · 계획 12 Task 10 — io/dxfFeedback.js): 더보기 메뉴 · DXF로 가져온 프로젝트가 아닐 때 · 내보낸 뒤의 수.
// 수는 사용자가 "무엇이 담겼나"를 알 만큼만(벽 셋 · 방 이름 · 문·창 둘) — 전체 목록은 파일 안의 summary다.
export const DXF_FEEDBACK_MENU = '교정 기록 내보내기';
export const DXF_FEEDBACK_NONE = 'DXF로 가져온 프로젝트가 아닙니다';
export const DXF_FEEDBACK_EXPORTED = s => (s?.changes
  ? `교정 기록을 내보냈습니다 — 벽 지움 ${s.wallsDeleted} · 그림 ${s.wallsAdded} · 옮김 ${s.wallsMoved} · 방 이름 ${s.roomsRenamed} · 문·창 지움 ${s.itemsDeleted} · 옮김 ${s.itemsMoved}`
  : '교정 기록을 내보냈습니다 — 가져온 뒤 고친 것이 없습니다');
// 검토 창의 입력 도면 안내 줄(사전 검토 3): 선 수 · 체크한 벽 레이어 수 + 안내 페이지(public/dxf-guide.html · 새 탭).
export const DXF_GUIDE_LINE = (segs, layers) => `선 ${Number(segs || 0).toLocaleString('en-US')}개 중 벽 레이어 ${layers}개`;
export const DXF_GUIDE_LINK = '입력 도면 안내 ↗';
export const DXF_GUIDE_HREF = 'dxf-guide.html';

// 가져오기 자체가 실패했을 때의 한 줄(리뷰 F-3). DXF_ERRORS 다섯은 §18.6의 표가 동결한 파싱·추출
// 오류라 여기에 섞지 않는다 — 이 문장은 호출자(store.swap·자동 저장)가 거절했을 때만 나오고,
// 가장 흔한 원인인 트레이스 배경(최대 1.2 MB)을 사용자가 이 대화상자에서 바로 끌 수 있게 말한다.
export const DXF_IMPORT_FAILED = '가져오기를 마치지 못했습니다. 원 도면을 배경으로 남기지 않고 다시 시도해 주세요';
