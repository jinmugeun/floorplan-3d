// 속성 패널의 마감재 행(벽 내벽/외벽, 방 바닥/천장). propsPanel이 300줄을 넘지 않게 여기로 나눴다.
import { assignmentOf, applyMaterial, MAT_TARGET_LABELS } from '../state/materialOps.js';
import { activeFloor, normalizeAssignment } from '../state/schema.js';
import { materialById } from '../materials/catalog.js';
import { drawSwatch } from './materialPanel.js';
import { esc } from '../util/html.js';

// 라벨은 materialOps의 MAT_TARGET_LABELS 한 곳에서 온다(같은 문자열을 두 벌 들지 않는다, M-30).
export const MATERIAL_ROWS = {
  wall: [['in', MAT_TARGET_LABELS.in], ['out', MAT_TARGET_LABELS.out]],
  room: [['floor', MAT_TARGET_LABELS.floor], ['ceiling', MAT_TARGET_LABELS.ceiling]],
};
// 마감재 행의 <details> 열림 상태는 이 모듈이 따로 기억한다(propsPanel의 detailsOpen과 얽히지 않게 — I-14).
// null = 아직 한 번도 렌더하지 않았다는 뜻이고, 그때만 호출자가 준 초기값을 쓴다.
let matDetailsOpen = null;

export function targetFor(sel, key) {
  if (sel?.type === 'wall') return { kind: 'wall', id: sel.id, side: key === 'out' ? 'out' : 'in' };
  if (sel?.type === 'room') return { kind: key === 'ceiling' ? 'ceiling' : 'floor', id: sel.id };
  return null;
}
const numRow = (name, label, value, min, max) =>
  `<label class="field"><span>${label}</span><input type="number" name="${name}" value="${value}" min="${min}" max="${max}" step="any"></label>`;

export function materialRowsHtml(floor, sel, { detailsOpen = null } = {}) {
  const rows = sel?.type === 'wall' ? MATERIAL_ROWS.wall : sel?.type === 'room' ? MATERIAL_ROWS.room : null;
  if (!rows) return '';
  // 초기값은 첫 렌더에만 쓴다. 이후에는 mountSwatches의 toggle 리스너가 세운 값을 그대로 지킨다
  // (예전 `detailsOpen || matDetailsOpen`은 접은 상태를 다음 렌더에서 다시 켜 버렸다 — I-13).
  if (matDetailsOpen === null) matDetailsOpen = !!detailsOpen;
  return rows.map(([k, label]) => {
    const a = assignmentOf(floor, targetFor(sel, k));
    const m = a ? materialById(a.id) : null;
    const editor = sel.type === 'wall' ? `<button type="button" name="matEditor" data-side="${k}">마감재 편집기</button>` : '';
    return `<div class="mat-row" data-mat-row="${k}">
      <span class="mat-label">${label}</span>
      <div class="mat-main">
        <canvas class="swatch" data-mat-swatch="${k}" width="48" height="48" aria-hidden="true"></canvas>
        <span class="mat-text"><b>${m ? esc(m.name) : '미지정'}</b><span class="muted">${m ? esc(`${m.maker} · ${m.code}`) : '재질을 고르면 색 대신 무늬가 보입니다'}</span></span>
      </div>
      <div class="row"><button type="button" name="matReplace" data-side="${k}">교체</button>${editor}</div>
      <details ${matDetailsOpen ? 'open' : ''}><summary>${label} 상세 설정</summary>
        ${numRow(`matU-${k}`, '수평 오프셋 (mm)', a?.offset[0] ?? 0, 0, 1000)}
        ${numRow(`matV-${k}`, '수직 오프셋 (mm)', a?.offset[1] ?? 0, 0, 1000)}
        ${numRow(`matA-${k}`, '각도 (°)', a?.angle ?? 0, 0, 360)}
      </details>
    </div>`;
  }).join('');
}

// 캔버스는 문자열로 그릴 수 없으므로 innerHTML 다음에 그린다. <details> 토글도 여기서 기억한다.
export function mountSwatches(container, floor, sel) {
  for (const c of container.querySelectorAll('canvas[data-mat-swatch]')) {
    const a = assignmentOf(floor, targetFor(sel, c.dataset.matSwatch));
    const m = a ? materialById(a.id) : null;
    drawSwatch(c, m ?? { base: '#eef1f4', accent: '#d8dde3', pattern: 'solid', scale: [1000, 1000] });
  }
  for (const d of container.querySelectorAll('.mat-row details')) d.addEventListener('toggle', () => { matDetailsOpen = d.open; });
}

const FIELD = /^mat([UVA])-(in|out|floor|ceiling)$/;
// 오프셋·각도 입력 한 칸. 그 면에 재질이 없으면 바꿀 것이 없다(입력은 처리한 것으로 본다).
export function applyMaterialField(store, sel, el) {
  const m = FIELD.exec(el?.name ?? '');
  if (!m) return false;
  const [, which, key] = m;
  const target = targetFor(sel, key);
  if (!target) return true;
  const cur = assignmentOf(activeFloor(store.get()), target);
  if (!cur) return true;
  // Number('')는 0이고 유한하다: 빈 칸을 먼저 걸러내지 않으면 칸을 비운 사용자에게 0이 저장되고
  // 되돌림 단계까지 쌓인다(I-12). 빈 칸은 처리한 것으로 보고 무시한다(패널이 원래 값으로 다시 그린다).
  if (String(el.value ?? '').trim() === '') return true;
  const v = Number(el.value);
  if (!Number.isFinite(v)) return true;               // 숫자가 아닌 값도 버린다
  // scale(타일 크기 덮어쓰기)은 이 칸이 건드리지 않지만 **함께 옮겨야** 한다(리뷰 I-1): 세 필드만
  // 싣던 예전 모양은 applyMaterial → cloneAssign이 받은 것을 그대로 앉히므로, 300×300으로 깔아 둔
  // 타일이 오프셋 한 칸을 고치는 순간 재질 기본 크기로 조용히 돌아갔다.
  const next = { id: cur.id, offset: [...cur.offset], angle: cur.angle, ...(cur.scale ? { scale: [...cur.scale] } : {}) };
  if (which === 'A') next.angle = v;
  else next.offset[which === 'U' ? 0 : 1] = v;
  // 같은 값 가드(리뷰 N-6): applyMaterial이 실제로 앉힐 모양과 지금 값을 비교해 같으면 dispatch를
  // 하지 않는다 — 그러지 않으면 같은 값 확정이 빈 undo 단계를 남긴다(§16.1 · 감사 §41).
  // normalizeAssignment를 지나므로 클램프·각도 정규화로 지금 값과 같아진 입력(오프셋 50099 → 1000,
  // 각도 390 → 30)도 함께 걸린다. 옮기는 네 값(offset 둘·angle·scale)을 모두 본다.
  const want = normalizeAssignment(next);
  if (want && want.angle === cur.angle && want.offset[0] === cur.offset[0] && want.offset[1] === cur.offset[1]
      && String(want.scale) === String(cur.scale)) return true;
  applyMaterial(store, target, next);
  return true;
}
