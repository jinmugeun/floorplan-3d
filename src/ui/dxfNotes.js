// 검토 창 알림 한 줄의 조립(2026-10-13 · 계획 16 Task A — dxfDialog.js가 290줄이라 300줄 예산 안에서 알림 칸을 더하려고 뺐다. 순수 함수 · DOM 없음).
// 순서가 계약이다: e2e(tools/dxf-corpus/e2e.mjs)의 정규식은 기구 문장이 **맨 끝**이라고 본다 — 새 칸은 equip 앞에 둔다.
import { DXF_MANY_PLANS, DXF_LAYERS_GUESSED, DXF_MANY_SHEETS, DXF_UNITS_GUESS, DXF_UNITS_CONVERTED, DXF_RECONCILED, DXF_NAME_DIVIDED, DXF_RAIL_DIVIDED, DXF_EQUIPMENT, DXF_HEIGHT_FROM_LAYER } from './dxfMessages.js';

// 단위 셀렉트의 이름 표(2026-10-13 · 계획 16 Task D — dxfDialog.js에서 옮겼다): 검토 창의 셀렉트·머리줄과 단위 변환 알림이 같은 이름을 쓰게 한 곳에 둔다.
// 값은 워커의 INSUNITS_SCALE(io/dxf/toProject.js)과 같은 mm 배율이다.
export const UNITS = [['mm', 1], ['cm', 10], ['m', 1000], ['inch', 25.4], ['ft', 304.8]];
export const unitName = v => UNITS.find(([, x]) => x === v)?.[0] ?? 'mm';

// summary: 워커 'parsed' 요약(없으면 null) · stats: 마지막 'extracted'의 stats(없으면 {}) · hint: heightHint 결과({ height, layer } | null · 사람이 고친 뒤엔 null).
// unitsMatch: 단위 셀렉트 값이 도면의 unitScale 그대로인가(계획 16 Task D) — 사람이 단위를 바꿨으면 "바꿔 읽습니다"는 거짓이라 내지 않는다.
export function dxfNotes({ summary = null, stats = {}, hint = null, unitsMatch = true } = {}) {
  const n = summary?.regions?.length ?? 0;
  const guessed = summary?.layers?.some(r => r.guessed) || stats?.guessed;
  const st = stats ?? {}, fixed = (st.dividers || st.annexes) && DXF_RECONCILED(st.dividers ?? 0, st.annexes ?? 0);
  const byNames = st.nameDividers > 0 && DXF_NAME_DIVIDED(st.nameDividers);
  const byRails = st.railDividers > 0 && DXF_RAIL_DIVIDED(st.railDividers);       // 2026-10-12 최종 리뷰 X-4: 늘 켜진 난간 구획선도 알린다
  // 2026-10-12 계획 13 Task 3 · 충돌 수는 앱 배너와 같은 colliding(최종 리뷰 F-3) · 기둥 면에 맞춰 줄인 수(trimmed — 2026-10-13 최종 리뷰 X-3)
  const eq = st.equipment, equip = eq?.placed > 0 && DXF_EQUIPMENT(eq.placed, eq.product, eq.generic, eq.colliding ?? 0, eq.clash, eq.trimmed);
  const height = hint && DXF_HEIGHT_FROM_LAYER(hint.height, hint.layer);          // 2026-10-13 계획 16 Task A: 벽 레이어 이름의 높이 꼬리
  // 2026-10-13 계획 16 Task D: INSUNITS가 mm가 아니어서 바꿔 읽었다(추정이면 DXF_UNITS_GUESS가 이미 말한다 — 둘을 같이 내지 않는다)
  const converted = unitsMatch && summary && !summary.unitsGuessed && summary.unitScale !== 1 && DXF_UNITS_CONVERTED(unitName(summary.unitScale));
  return [n > 1 && DXF_MANY_PLANS(n), guessed && DXF_LAYERS_GUESSED, summary?.manySheets && DXF_MANY_SHEETS, summary?.unitsGuessed && DXF_UNITS_GUESS, converted, height, fixed, byRails, byNames, equip]
    .filter(Boolean).join(' / ') || null;
}
