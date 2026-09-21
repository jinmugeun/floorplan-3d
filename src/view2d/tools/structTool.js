// 기둥·개구부 전용 배치 도구(§13.2). 라이브러리 타일을 거치지 않고 레일 버튼·단축키(R/C/O)로 바로
// 켜지고, 오늘의집처럼 **클릭마다 하나씩 놓으면서 도구가 켜진 채로 남는다**([Esc]로 종료).
// 제품은 카탈로그의 column-square / column-round / opening-pass를 옵션 크기로 만든다.
// 2D 심벌·3D 형상은 기존 것 그대로다(제품이 같으므로 바뀌는 것이 없다).
// view는 도구 인터페이스를 맞추기 위해 받는다(다시 그리기는 view2d가 한다).
import { activeFloor, createItem } from '../../state/schema.js';
import { addItem } from '../../state/floorOps.js';
import { snapItemPos, nearestWallPlacement, WALL_ATTACH_DIST } from '../../geom/items.js';
import { productById } from '../../products/catalog.js';
import { drawGhost } from './placeTool.js';

export const STRUCT_KINDS = ['column-square', 'column-round', 'opening'];
export const STRUCT_PRODUCT = { 'column-square': 'column-square', 'column-round': 'column-round', opening: 'opening-pass' };
export const STRUCT_LABELS = { 'column-square': '사각 기둥', 'column-round': '원형 기둥', opening: '개구부' };

// 옵션 기본값: 기둥 400 × 400 × 층고(원형은 지름 w 하나), 개구부 900 × 2100 · 바닥에서 0.
// 층고는 도구를 켤 때의 활성 층에서 읽는다(층 높이를 바꾼 도면에서 천장까지 닿는 기둥이 되게).
// 세션 동안 유지하는 옵션은 배선(main.js)이 들고 있고, 활성 층·층 높이가 바뀌면 structOptsKey로 비운다(M-6).
export function structDefaults(kind, height = 2300) {
  const h = Math.max(10, Math.round(Number(height) || 2300));
  if (kind === 'column-round') return { w: 400, h };
  if (kind === 'opening') return { w: 900, h: 2100, sill: 0 };
  return { w: 400, d: 400, h };
}

// 세션 옵션을 언제 버릴지 정하는 열쇠: 활성 층이나 그 층고가 바뀌면 기둥 높이 기본값도 따라가야 한다(M-6).
export const structOptsKey = state => { const f = activeFloor(state); return `${f?.id ?? ''}:${f?.height ?? ''}`; };

// 건축/자재 레이어가 꺼져 있으면 놓은 기둥·개구부가 2D·3D에서 보이지 않는다(items2d.itemVisible).
// 고스트는 그 플래그를 지나지 않으므로 "미리보기는 보이는데 놓으면 사라지는" 상태가 된다: 도구를 켤 때
// 조용히 다시 켠다(보기 옵션은 되돌릴 단계가 아니다 — record: false). 켰으면 true를 돌려준다(M-9).
export function ensureStructuresVisible(store) {
  const v = store.get().view;
  if (v?.v2?.structures !== false && v?.v3?.structures !== false) return false;
  store.dispatch(d => { d.view.v2.structures = true; d.view.v3.structures = true; }, { record: false });
  return true;
}

// 읽을 수 없는 값(undefined·글자)만 기본값이고, 숫자는 하한 10 mm로 자른다
// ("0"은 기본값이 아니라 0이므로 400이 아니라 10이 된다 — M-7).
const int = (v, def) => { const n = Number(v); return Math.max(10, Math.round(Number.isFinite(n) ? n : def)); };

// onDone = 도구를 끝내는 경로([Esc]·안내 클릭·우클릭), onPlaced = 하나를 놓은 직후.
// 둘을 가른 이유(m-7): §14.7의 "그린 뒤 도구 유지" 설정은 놓은 **뒤**에만 뜻이 있다. onDone을
// 그 설정에 걸면 설정이 켜진 동안 [Esc]로 도구를 끌 수 없게 된다.
export function createStructTool({ store, ui, view, kind = 'column-square', opts: given = null, onDone = () => {}, onPlaced = () => {}, toast = () => {} }) {
  const k = STRUCT_KINDS.includes(kind) ? kind : 'column-square';
  const floor = () => activeFloor(store.get());
  const opts = given ?? structDefaults(k, floor().height);
  const product = () => productById(STRUCT_PRODUCT[k]);
  let ghost = ghostAt([0, 0], false);

  // 옵션 → 아이템 크기. 원형 기둥은 w가 지름이라 가로·세로가 같고, 개구부의 깊이는 제품 값(40 mm)이다.
  // 기본값은 기둥·개구부가 다르다(기둥 높이는 층고, 개구부는 2100 — M-7).
  function sizeOf(p) {
    const def = structDefaults(k, floor().height);
    const w = int(opts.w, def.w), h = int(opts.h, def.h);
    if (k === 'column-round') return [w, w, h];
    if (k === 'opening') return [w, p.size[1], h];
    return [w, int(opts.d, def.d ?? 400), h];
  }
  function ghostAt(pt, noSnap) {
    const f = floor(), p = product();
    const size = sizeOf(p);
    // 개구부의 밑선 높이는 sill이다: 벽 구멍은 (item.z, item.z + size[2])로 계산된다(geom/openings.js).
    const z = k === 'opening' ? Math.max(0, Math.round(Number(opts.sill) || 0)) : 0;
    const item = createItem(p, { pos: [pt[0], pt[1]], size, z });
    if (k === 'opening') {
      const hit = nearestWallPlacement(f.walls, pt, size, WALL_ATTACH_DIST, { embed: true });
      if (!hit) return { item, guides: [] };
      return { item: { ...item, pos: [hit.pos[0], hit.pos[1]], rot: hit.rot, wallId: hit.wallId, t: hit.t, side: hit.side }, guides: [] };
    }
    if (noSnap) return { item, guides: [] };
    const s = snapItemPos(item, { walls: f.walls, items: f.items.filter(i => !i.hidden) });
    return { item: { ...item, pos: s.pos }, guides: s.guides };
  }

  return {
    name: k, opts, kind: k,
    // 단계 안내(§14.7). 개구부는 벽 위에만 앉으므로(결정 #9) 왜 안 놓이는지 배너에서 먼저 알린다.
    get hint() { return `${STRUCT_LABELS[k]} — 놓을 자리를 클릭 · 옵션 바에서 크기 · [Esc] 종료${k === 'opening' ? ' · 개구부는 벽 위에만 놓입니다' : ''}`; },
    getGhost: () => ghost,
    onPointerMove(p, ev) { ghost = ghostAt(p, !!ev?.ctrlKey); },
    onPointerDown(p, ev) {
      ghost = ghostAt(p, !!ev?.ctrlKey);
      // 붙일 벽이 없으면 놓지 않는다. 조용히 버리면 "왜 안 놓이지"로만 보이므로 토스트로 알린다(M-8).
      if (k === 'opening' && !ghost.item.wallId) { toast('개구부는 벽 위에만 놓입니다'); return; }
      // pos는 정수 mm로 반올림해 저장한다(placeTool과 같은 규칙). 사선 벽의 개구부는 중심이 벽 중심선에서 최대 0.7 mm 벗어나지만 구멍 자체는 t로 계산되므로 어긋나지 않는다.
      const item = { ...ghost.item, pos: [Math.round(ghost.item.pos[0]), Math.round(ghost.item.pos[1])] };
      addItem(store, item);
      ui.set({ selection: { type: 'item', id: item.id } });
      // 도구를 켠 채로 둘지는 배선이 정한다(§14.7의 "그린 뒤 도구 유지"): 기본은 연속 배치이고
      // 그것이 이 도구의 요점이지만(§13.2), 설정을 끄면 방·벽과 마찬가지로 한 번 놓고 선택으로 돌아간다.
      onPlaced();
    },
    onPointerUp() {},
    onKey(ev) { if (ev.key === 'Escape') { onDone(); return true; } return false; },
    onHintClick() { onDone(); },
    onContextMenu() { onDone(); return null; },
    draw(ctx, v) { drawGhost(ctx, v, ghost); },
    cancel() {},
  };
}
