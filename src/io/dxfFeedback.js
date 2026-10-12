// DXF 교정 기록(2026-10-12 · 계획 12 Task 10). 왜: 1년 뒤 벽 판별기를 학습시킬 데이터는 "파이프라인이 낸 것"과 "사람이 고친 것"의
// 차이에서만 나온다. 그래서 가져온 직후의 결과(스냅숏)와 그때의 선택을 프로젝트 안(`meta.dxfImport`)에 남기고, 내보낼 때 지금 프로젝트와
// 비교한다. 자동 전송은 하지 않는다(서버 없음 · 동의 문제) — 사용자가 파일을 내보내 손으로 보낸다.
// 저장 형식: `meta`는 normalizeProject의 `...src`가 그대로 통과시키는 선택 필드다 — 옛 파일은 meta 없이 그대로 열리고 그대로 저장된다.
// DOM을 모르는 순수 모듈이다(검토 대화상자가 기록을 만들고, 더보기 메뉴가 차이를 낸다).

export const FEEDBACK_VERSION = 1;
// "옮겼다"의 문턱(mm): 벽 끝점·두께, 문·창 자리·크기가 이보다 많이 바뀌었을 때만. 스냅숏은 0.1 mm로 반올림해 두므로(크기 절약)
// 반올림 오차 0.05 mm는 늘 문턱 안쪽이다 — 손대지 않은 벽이 "옮김"으로 나오지 않는다.
export const MOVE_TOL = 1;
// 방 짝짓기(아래 diffRooms). 1순위는 id다 — detectRooms가 벽 id 자카드로 방 id를 물려주므로 벽을 옮기거나 이름을 바꿔도 id는 남는다.
// id가 끊긴 방(벽을 지우고 다시 그려 자카드 0 · 중심 500 mm 밖)만 2순위로 **도면 기준 면적(areaCenter, m²)이 가까운 짝**을 찾는다:
// 차이가 큰 쪽 면적의 AREA_TOL(1 %) 이하 — 단 최소 AREA_TOL_MIN(0.05 m², 면적 표기의 소수 둘째 자리) — 인 쌍 중 **이름이 같은 쌍을
// 먼저**, 그다음 차이가 작은 쌍부터 하나씩 묶는다. 스냅숏에는 방 모양을 두지 않으므로(정해진 필드만) 위치가 아니라 면적으로 맞춘다.
export const AREA_TOL = 0.01, AREA_TOL_MIN = 0.05;
// 가져오기가 만드는 아이템 종류(문·창·개구부 · 기둥). 사용자가 나중에 놓은 가구는 교정이 아니므로 "그린 것"에 싣지 않는다.
const TRACKED = new Set(['door', 'window', 'opening', 'column']);

const arr = v => (Array.isArray(v) ? v : []);
const obj = v => (v && typeof v === 'object' && !Array.isArray(v) ? v : null);
const r1 = v => Math.round((Number(v) || 0) * 10) / 10;
const r2 = v => Math.round((Number(v) || 0) * 100) / 100;
const pt = p => [r1(p?.[0]), r1(p?.[1])];
const dist = (p, q) => Math.hypot((p?.[0] ?? 0) - (q?.[0] ?? 0), (p?.[1] ?? 0) - (q?.[1] ?? 0));
// 방 면적은 도면 기준(벽·기둥 중심선) — 도면의 실 면적 표기와 같은 기준이다. 옛 방(areaCenter 없음)은 안목 넓이.
const areaOf = r => r2(r?.areaCenter > 0 ? r.areaCenter : r?.area);

// 스냅숏 한 줄씩 — 정해진 필드만 남긴다(id는 그대로: 차이는 id로 맞춘다).
const wallRec = w => ({ id: w.id, a: pt(w.a), b: pt(w.b), thickness: r1(w.thickness), virtual: !!w.virtual });
const roomRec = r => ({ id: r.id, name: r.name ?? '', area: areaOf(r) });
// t(벽 위 0~1)는 반올림하지 않는다: 40 m 벽에서 t 0.0001이 4 mm라 반올림이 거짓 "옮김"을 만든다.
const itemRec = it => ({ id: it.id, productId: it.productId ?? '', wallId: it.wallId ?? null, t: Number(it.t) || 0, size: arr(it.size).map(r1) });

export const importSnapshot = (floor = {}) => ({
  walls: arr(floor?.walls).map(wallRec), rooms: arr(floor?.rooms).map(roomRec), items: arr(floor?.items).map(itemRec),
});

// 가져오기 기록(`project.meta.dxfImport`). opts는 검토 창이 워커로 보낸 추출 옵션 그대로다 — layers는 `checked`로, 나머지는 `options`로.
// 역할표는 표 자체가 아니라 받았는지만(rolesGiven) 남긴다(표는 도구가 따로 갖는다). layersGuessed = 벽 레이어를 이름이 아니라 내용으로
// 추정했는지(stats.guessed) — 사람이 레이어를 고쳐 체크했는지와 함께 봐야 하는 신호다.
export function buildImportMeta({ project, fileName = '', opts = {}, stats = {}, roles = null, at = new Date() } = {}) {
  const { layers = [], ...rest } = opts ?? {};
  const floor = project?.floors?.[project?.activeFloor ?? 0] ?? project?.floors?.[0];
  return {
    at: at.toISOString(),
    fileName: String(fileName ?? ''),
    checked: [...arr(layers)],
    options: { ...rest, rolesGiven: !!roles, layersGuessed: !!stats?.guessed },
    snapshot: importSnapshot(floor),
  };
}

// 기록이 없거나 모양이 아니면 null — "DXF로 가져온 프로젝트가 아니다".
export const dxfImportOf = p => {
  const m = obj(obj(p?.meta)?.dxfImport);
  return m && obj(m.snapshot) ? m : null;
};

// 가져온 층: 스냅숏의 벽 id를 가장 많이 가진 층(사용자가 층을 앞에 끼워 넣어도 따라간다). 하나도 없으면(벽을 다 지웠다) 첫 층.
function importedFloor(project, snap) {
  const ids = new Set(arr(snap.walls).map(w => w.id));
  let best = null, hits = 0;
  for (const f of arr(project?.floors)) {
    const n = arr(f?.walls).filter(w => ids.has(w.id)).length;
    if (n > hits) { best = f; hits = n; }
  }
  return best ?? arr(project?.floors)[0] ?? {};
}

// 끝점 순서는 보지 않는다 — a↔b만 뒤집은 같은 선은 옮긴 것이 아니다.
const sameLine = (s, w) => Math.min(Math.max(dist(s.a, w.a), dist(s.b, w.b)), Math.max(dist(s.a, w.b), dist(s.b, w.a))) <= MOVE_TOL;

function diffWalls(before, after) {
  const now = new Map(after.map(w => [w.id, w])), was = new Set(before.map(s => s.id));
  const moved = [];
  for (const s of before) {
    const w = now.get(s.id);
    if (w && (!sameLine(s, w) || Math.abs(s.thickness - (Number(w.thickness) || 0)) > MOVE_TOL)) {
      moved.push({ id: s.id, from: { a: s.a, b: s.b, thickness: s.thickness }, to: { a: pt(w.a), b: pt(w.b), thickness: r1(w.thickness) } });
    }
  }
  return { deleted: before.filter(s => !now.has(s.id)).map(s => s.id), added: after.filter(w => !was.has(w.id)).map(wallRec), moved };
}

function diffRooms(before, after) {
  const byId = new Map(after.map(r => [r.id, r])), usedNow = new Set(), usedWas = new Set(), pairs = [];
  for (const s of before) { const r = byId.get(s.id); if (r) { pairs.push([s, r]); usedNow.add(r); usedWas.add(s); } }
  const cand = [];
  for (const s of before) {
    if (usedWas.has(s)) continue;
    for (const r of after) {
      if (usedNow.has(r)) continue;
      const a = areaOf(r), diff = Math.abs(s.area - a);
      if (diff <= Math.max(AREA_TOL_MIN, AREA_TOL * Math.max(s.area, a)) + 1e-9) cand.push({ s, r, same: s.name === (r.name ?? ''), diff });
    }
  }
  cand.sort((x, y) => (y.same - x.same) || (x.diff - y.diff));
  for (const { s, r } of cand) { if (usedWas.has(s) || usedNow.has(r)) continue; usedWas.add(s); usedNow.add(r); pairs.push([s, r]); }
  return {
    // was: id가 끊겨 면적으로 맞춘 방의 가져온 직후 id(스냅숏에서 찾을 수 있게).
    renamed: pairs.filter(([s, r]) => s.name !== (r.name ?? '')).map(([s, r]) => ({ id: r.id, ...(r.id !== s.id ? { was: s.id } : {}), from: s.name, to: r.name ?? '' })),
    added: after.filter(r => !usedNow.has(r)).map(roomRec),
    deleted: before.filter(s => !usedWas.has(s)).map(s => s.id),
  };
}

function diffItems(before, after, walls) {
  const now = new Map(after.map(it => [it.id, it])), was = new Set(before.map(s => s.id));
  const len = new Map(arr(walls).map(w => [w.id, dist(w.a, w.b)]));
  const moved = [], resized = [], retyped = [];
  for (const s of before) {
    const it = now.get(s.id);
    if (!it) continue;
    const wallId = it.wallId ?? null, t = Number(it.t) || 0;
    // 같은 벽 위의 자리는 t 차이를 지금 벽 길이로 mm로 바꿔 잰다(벽이 없는 기둥은 t가 늘 0이다).
    if (wallId !== s.wallId || Math.abs(t - s.t) * (len.get(wallId) ?? 0) > MOVE_TOL) moved.push({ id: s.id, from: { wallId: s.wallId, t: s.t }, to: { wallId, t } });
    const size = arr(it.size).map(r1);
    if (size.some((v, i) => Math.abs(v - (arr(s.size)[i] ?? 0)) > MOVE_TOL)) resized.push({ id: s.id, from: s.size, to: size });
    // 제품을 바꿨다(수정 wave 2026-10-12 · Task 10 리뷰 M-1): 검사기의 "제품 교체"(itemOps.replaceProduct)는 id를 지킨 채 productId·kind를
    // 바꾼다 — 잘못 읽은 개구부 종류(통로 → 문 · 여닫이 → 미닫이 · 문 → 창)를 고치는 가장 흔한 길이고, 점수판의 opnKind가 재는 그 라벨이다.
    // kind는 바꾼 뒤의 종류(door·window·opening·column). 크기도 달라졌으면 resized에도 함께 나온다(종류와 폭은 따로 쓰이는 라벨이라 둘 다 남긴다).
    if ((it.productId ?? '') !== s.productId) retyped.push({ id: s.id, from: s.productId, to: it.productId ?? '', kind: it.kind ?? '' });
  }
  return { deleted: before.filter(s => !now.has(s.id)).map(s => s.id), moved, resized, retyped, added: after.filter(it => !was.has(it.id) && TRACKED.has(it.kind)).map(itemRec) };
}

// 요약 수. dividers*는 walls*의 부분집합(구획선 = virtual 벽)이고 changes에는 한 번만 센다. changes는 목록 항목의 합이라 종류와 크기를
// 함께 바꾼 아이템은 retyped·resized 두 번 센다(목록이 둘이다).
// columnsDeleted(2026-10-12 · 최종 리뷰 X-7 · M10-1): itemsDeleted 중 기둥(스냅숏 제품 `column-…`) — dividers*처럼 부분집합이라 changes에 다시
// 더하지 않는다. 알림이 지운 기둥을 "문·창 지움"으로 세던 것을 가른다.
const isColumn = productId => /^column-/.test(String(productId ?? ''));
function summarize(snap, walls, rooms, items) {
  const virt = new Set(snap.walls.filter(w => w.virtual).map(w => w.id));
  const cols = new Set(snap.items.filter(it => isColumn(it.productId)).map(it => it.id));
  const s = {
    importedWalls: snap.walls.length, importedRooms: snap.rooms.length, importedItems: snap.items.length,
    wallsDeleted: walls.deleted.length, wallsAdded: walls.added.length, wallsMoved: walls.moved.length,
    dividersDeleted: walls.deleted.filter(id => virt.has(id)).length, dividersAdded: walls.added.filter(w => w.virtual).length,
    roomsRenamed: rooms.renamed.length, roomsAdded: rooms.added.length, roomsDeleted: rooms.deleted.length,
    itemsDeleted: items.deleted.length, columnsDeleted: items.deleted.filter(id => cols.has(id)).length,
    itemsMoved: items.moved.length, itemsResized: items.resized.length, itemsRetyped: items.retyped.length, itemsAdded: items.added.length,
  };
  s.changes = s.wallsDeleted + s.wallsAdded + s.wallsMoved + s.roomsRenamed + s.roomsAdded + s.roomsDeleted
    + s.itemsDeleted + s.itemsMoved + s.itemsResized + s.itemsRetyped + s.itemsAdded;
  return s;
}

// 교정 기록 JSON. DXF로 가져온 프로젝트가 아니면 null. 가져온 직후의 스냅숏을 끝에 함께 싣는다 — 지운 것은 id만 적으므로 받는 쪽이
// 그 id를 풀 수 있어야 하고, id는 uid라 같은 DXF를 다시 가져와도 같은 값이 나오지 않는다.
export function buildDxfFeedback(project, { now = new Date() } = {}) {
  const imp = dxfImportOf(project);
  if (!imp) return null;
  // 기록은 사용자 파일에서 온다 — 객체가 아닌 칸은 버린다(손으로 고친 파일이 내보내기를 죽이지 않게).
  const list = k => arr(imp.snapshot[k]).filter(obj);
  const snap = { walls: list('walls'), rooms: list('rooms'), items: list('items') };
  const floor = importedFloor(project, snap);
  const walls = diffWalls(snap.walls, arr(floor.walls));
  const rooms = diffRooms(snap.rooms, arr(floor.rooms));
  const items = diffItems(snap.items, arr(floor.items), floor.walls);
  return {
    version: FEEDBACK_VERSION,
    exportedAt: now.toISOString(),
    import: { at: imp.at ?? null, fileName: imp.fileName ?? '', checked: arr(imp.checked), options: obj(imp.options) ?? {} },
    walls, rooms, items,
    summary: summarize(snap, walls, rooms, items),
    snapshot: snap,
  };
}
