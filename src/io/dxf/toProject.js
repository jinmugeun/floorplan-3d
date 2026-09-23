// DXF 벽 목록 → 앱 프로젝트 하나(§18.5 · §18.8). 여기서 저장 형식이 결정되지만 **아무것도 늘리지
// 않는다**: normalizeProject()가 통과시키는 평범한 객체다. 워커가 이 파일을 import하므로 DOM·ui를
// 건드리지 않는다(geom/*·state/schema.js·products/catalog.js는 전부 DOM 없는 모듈이다).
import { makeWall } from '../../geom/walls.js';
import { normalizeWalls } from '../../geom/normalize.js';
import { detectRooms, pointInPolygon } from '../../geom/rooms.js';
import { createEmptyProject, createFloor, normalizeProject } from '../../state/schema.js';
import { dropTinyComponents } from './walls.js';
import { DXF_PARAMS } from './params.js';

export const INSUNITS_SCALE = Object.freeze({ 1: 25.4, 2: 304.8, 4: 1, 5: 10, 6: 1000 });
export const DXF_DEFAULT_NAME = 'DXF 가져오기';
// 도면 제목·파일 이름으로 쓸 수 있는 글자(§18.4). 실파일의 이름은 디스크 수준에서 이미 깨져 있어
// (U+07BD·U+0131·U+2C78) 어떤 코드페이지로도 복구되지 않는다 — 그런 이름은 쓰지 않는다.
const NAME_OK = /^[0-9A-Za-z가-힣 ()\[\]._-]+$/;

// $MEASUREMENT·$LUNITS·$DIMSCALE은 읽지 않는다(축척은 도면 좌표에 이미 들어 있다 —
// 실파일의 $DIMSCALE 40은 출력 축척이다). 0(미지정)이면 도면 크기로 추정하고 머리에 알린다.
export function unitScale(insunits, longSide = 0) {
  const known = INSUNITS_SCALE[insunits];
  if (known) return { scale: known, guessed: false };
  if (longSide >= 10 && longSide <= 1000) return { scale: 1000, guessed: true };
  return { scale: 1, guessed: true };
}

// 벽 bbox 중심을 (0, 0)으로, y 부호를 뒤집어(DXF y↑ → 앱 y↓), 정수 mm로 반올림한다.
// 정수 반올림은 선택이 아니다: detectRooms의 노드 키가 `Math.round(x),Math.round(y)`라
// 끝점이 1 mm 안에서 정확히 같아야 방이 닫힌다.
export function makeToApp(walls, scale = 1) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const w of walls) for (const p of [w.a, w.b]) {
    x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]);
    y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]);
  }
  if (!Number.isFinite(x0)) { x0 = 0; y0 = 0; x1 = 0; y1 = 0; }
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  // -0을 0으로 접는다(같은 점이 "0"과 "-0"으로 갈리면 노드 키가 갈릴 수 있다).
  const r = v => (Math.round(v) || 0);
  return { toApp: p => [r((p[0] - cx) * scale), r(-(p[1] - cy) * scale)], box: [x0, y0, x1, y1], size: [r((x1 - x0) * scale), r((y1 - y0) * scale)] };
}

// 방 이름(§18.4). **`detectRooms(walls)`가 낸 그 객체에 직접 넣는다** — normalizeFloor가
// `detectRooms(walls, rooms)`로 다시 계산하면서 matchPrevRooms의 wallIds 자카드로 이름을
// 물려주기 때문이다(직접 만든 폴리곤을 넣으면 이름이 조용히 사라진다).
export function nameRooms(rooms, texts, toApp, { min = 200, max = 600, chars = 20 } = {}) {
  const cand = texts
    .filter(t => t.h >= min && t.h <= max && String(t.text ?? '').trim().length >= 1 && String(t.text).trim().length <= chars)
    .map(t => ({ p: toApp(t.p), text: String(t.text).trim() }));
  const used = new Set();
  let named = 0;
  for (const room of rooms) {
    const hit = cand.find(c => !used.has(c) && pointInPolygon(c.p, room.points));
    if (!hit) continue;
    used.add(hit);
    room.name = hit.text;
    named++;
  }
  return { named, unmatched: cand.filter(c => !used.has(c)).map(c => c.text) };
}

// 프로젝트 이름 = ROI 안 문자 중 **높이가 가장 큰 것**(≥ 600 mm, 40자로 자름). 없으면 파일 이름,
// 그것도 쓸 수 없으면 기본값. texts는 부르는 쪽이 ROI로 걸러 넘긴다.
// `titleLayers`는 제목이 될 수 있는 레이어 이름 집합이다(사전 검토 I-6). 높이만 보면 실파일에서
// `급식기구` 레이어의 지시선 라벨 `퇴식동선`(h 1,725)이 이겨 프로젝트 이름이 그것이 된다 —
// 제목은 역할이 `text`·`other`인 레이어에만 있다(실파일의 제목은 레이어 `T`, h 980 `경산 사동중`).
export function drawingTitle(texts, fileName = '', titleLayers = null) {
  const big = texts.filter(t => t.h >= 600 && String(t.text ?? '').trim() && (!titleLayers || titleLayers.has(t.layer)))
    .sort((a, b) => b.h - a.h)[0];
  if (big) return String(big.text).trim().slice(0, 40);
  const base = String(fileName).replace(/\.[^.]*$/, '').trim();
  return base && NAME_OK.test(base) ? base.slice(0, 40) : DXF_DEFAULT_NAME;
}

export function buildProject(raw, {
  height = DXF_PARAMS.height, scale = 1, texts = [], fileName = '', autoNames = true,
  params: P = DXF_PARAMS, openings = () => [], titleTexts = null, titleLayers = null,
} = {}) {
  const { toApp, box, size } = makeToApp(raw, scale);
  // 순서가 계약이다: makeWall → normalizeWalls(T자 분할) → **그다음** 고립 덩어리 제거 → detectRooms.
  // 고립 제거를 앞에 두면 끝점이 아직 공유되지 않아 멀쩡한 벽이 통째로 잘린다.
  let walls = raw.map(w => makeWall({ a: toApp(w.a), b: toApp(w.b), thickness: Math.max(2, Math.round(w.thickness * scale)), height }));
  walls = dropTinyComponents(normalizeWalls(walls), P.minComp);
  const rooms = detectRooms(walls);
  for (const room of rooms) room.height = height;      // §18.8: 층고 한 칸이 층·벽·방을 함께 정한다
  const unmatchedNames = autoNames ? nameRooms(rooms, texts, toApp).unmatched : [];
  const items = openings({ walls, rooms, toApp }) ?? [];
  const project = normalizeProject({
    ...createEmptyProject(),
    name: drawingTitle(titleTexts ?? texts, fileName, titleLayers),
    floors: [{ ...createFloor('1F'), height, slab: 0, walls, rooms, items }],
  });
  const floor = project.floors[0];
  const deg = new Map();
  for (const w of floor.walls) for (const p of [w.a, w.b]) {
    const k = `${p[0]},${p[1]}`;
    const d = deg.get(k) ?? { n: 0, p };
    d.n++; deg.set(k, d);
  }
  const th = new Map();
  for (const w of floor.walls) th.set(w.thickness, (th.get(w.thickness) ?? 0) + 1);
  const stats = {
    walls: floor.walls.length,
    rooms: floor.rooms.length,
    areaM2: Math.round(floor.rooms.reduce((a, r) => a + r.area, 0) * 10) / 10,
    // 차수 1 노드 = 끊긴 끝점. 이 배열이 배너·2D 마커·[보기]의 원천이다(§18.6).
    openEnds: [...deg.values()].filter(d => d.n === 1).map(d => [...d.p]),
    thickness: [...th].sort((a, b) => b[1] - a[1] || a[0] - b[0]),
    unmatchedNames,
    items: floor.items.length,
    size,
  };
  return { project, stats, toApp, walls: floor.walls, rooms: floor.rooms, box, size };
}
