// 입면도 프레이밍(§17.4(2) 개정 · 리뷰 I-3·M-7 · 감사 §37). 카메라(view3d/pick3d.js의
// orthoViewParams)와 인쇄물(io/specSheet.js의 바닥선·천장선)이 **같은 값**을 써야 그림 위의 선이
// 실제 벽과 겹친다 — 그래서 규칙은 여기 한 곳뿐이다. 자리가 geom/인 이유(리뷰 M-7): io/도
// view3d/도 geom/으로 내려가는 방향만 쓰므로 새 계층 간선이 0개다(전에는 view3d → io였고,
// 그 탓에 3D 카메라가 카탈로그·풍량까지 딸린 인쇄물 포매터에 의존했다).
// 단위: extent·height는 mm, half*·centerY는 m(three 좌표), fill·*Frac은 그림 위에서 잰 0..1 비율.
import { endpoints } from './walls.js';

// 그림 비율은 고정이 아니라 **내용 비율**이다(§17.15가 확정한 §17.4(2) 개정 · 재리뷰 1 §2).
// 16:9로 고정하면 층고 3.5 m · 폭 20 m 도면이 그림 높이의 27%만 채우고 나머지는 빈 종이가 된다
// (입면 5장이 A4 3쪽). 건물이 인쇄되는 크기는 **본문 폭**이 정하므로 비율을 내용에 맞춰도 건물은
// 그대로이고 사라지는 것은 여백뿐이다(다섯 장이 한 쪽에 든다).
// 한계가 위아래로 있는 이유: 16:9보다 세로로 길면 그림이 쓸데없이 커지고, 6:1보다 납작하면
// 본문 폭 765 px에서 그림 높이가 128 px 아래로 떨어져 선이 읽히지 않는다. 6:1에서 잘린 아주 긴
// 도면(폭/층고 > 6)은 **폭을 지키고 세로 채움을 내준다** — 입면도는 벽 전체가 보여야 도면이다.
export const ELEV_ASPECT_MIN = 16 / 9;
export const ELEV_ASPECT_MAX = 6;
export const ELEV_MARGIN = 1.15;       // 건물 둘레의 여백(기존 직교 프레임과 같은 값)
export const ELEV_MIN_EXTENT = 2000;   // 아주 작은 도면도 최소 크기를 갖는다(기존 규칙 그대로)

export function elevationAspect({ extent = 6000, height = 2300 } = {}) {
  const w = Math.max(Number(extent) || 0, ELEV_MIN_EXTENT);
  const h = Math.max(Number(height) || 0, 0);
  if (!(h > 0)) return ELEV_ASPECT_MAX;                       // 층고가 없는 층은 가장 납작한 쪽으로
  return Math.min(Math.max(w / h, ELEV_ASPECT_MIN), ELEV_ASPECT_MAX);
}

// 세로 절두체는 **건물 높이**에서 나오고(리뷰 I-3), 그 비율로 도면 폭이 들어가지 않을 때만 들어갈
// 만큼만 넓힌다 — 잘라 내지 않는다. aspect를 넘기지 않으면 내용 비율(elevationAspect)을 쓴다:
// 인쇄물과 그 비트맵이 그 값을 쓰고, 화면 3D의 2D 투영은 캔버스 비율을 넘긴다.
export function elevationFrame({ extent = 6000, height = 2300, aspect = 0, margin = ELEV_MARGIN } = {}) {
  const ext = Math.max(Number(extent) || 0, ELEV_MIN_EXTENT);
  const h = Math.max(Number(height) || 0, 0) / 1000;
  const a = Math.max(Number(aspect) || elevationAspect({ extent: ext, height }), 0.01);
  const halfH = Math.max((h * margin) / 2, (ext * margin) / 2000 / a);
  const centerY = h / 2;
  return {
    halfH, halfW: halfH * a, centerY, aspect: a,
    fill: h / (2 * halfH),                                    // 그림 높이에서 건물이 차지하는 비율
    ceilFrac: (centerY + halfH - h) / (2 * halfH),
    floorFrac: (centerY + halfH) / (2 * halfH),
  };
}

// 도면의 bbox(월드 mm): 중심 · 큰 쪽 · 두 변. view3d의 bounds()가 이것을 그대로 돌려준다
// (최종 리뷰 I-5). 전에는 같은 계산이 두 벌이었고 **벽이 없는 층의 기본값만 서로 달랐는데**
// (여기 depth 8000 · bounds() 6000) 주석은 "같다"라고 단언했다(m-4). 정본은 여기 한 곳이고
// 값은 bounds()가 쓰던 [8000, 6000]이다 — 화면 종횡비에 가까워 빈 층의 3D 프레이밍이 그대로다.
export function planBounds(walls) {
  const pts = endpoints(walls ?? []);
  if (!pts.length) return { center: [4000, 3000], extent: 8000, size: [8000, 6000] };
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  return { center: [(x0 + x1) / 2, (y0 + y1) / 2], extent: Math.max(x1 - x0, y1 - y0), size: [x1 - x0, y1 - y0] };
}

// 도면의 가로·세로(mm).
export function planSize(walls) {
  const [width, depth] = planBounds(walls).size;
  return { width, depth };
}

// 도면의 가로·세로 중 큰 쪽(mm).
export function planExtent(walls) { return planBounds(walls).extent; }

// 평면 투영(천장 평면도 top · 저면도 bottom)의 직교 절두체. elevationFrame의 평면판이다
// (최종 리뷰 I-6 · Task 10 N-4): 예전 규칙은 세로를 max(가로, 세로)로 잡고 가로를 비율만큼
// 늘려, 폭 20 m · 깊이 5 m 도면이 세로 11.5 m(필요 2.875) · 가로 46 m(필요 10)가 됐다 —
// 가로·세로 모두 22%만 차고 시방서의 천장 평면도가 그 크기로 인쇄됐다. 이제 세로는 **깊이**에서
// 나오고, 그 비율로 가로가 들어가지 않을 때만 들어갈 만큼 넓힌다(잘라 내지 않는다).
export function planFrame({ width = 0, depth = 0, aspect = 1, margin = ELEV_MARGIN } = {}) {
  const w = (Math.max(Number(width) || 0, ELEV_MIN_EXTENT) * margin) / 2000;
  const d = (Math.max(Number(depth) || 0, ELEV_MIN_EXTENT) * margin) / 2000;
  const a = Math.max(Number(aspect) || 1, 0.01);
  const halfH = Math.max(d, w / a);
  return { halfH, halfW: halfH * a, aspect: a };
}

// 천장 평면도(top)의 그림 비율. 그것은 입면이 아니라 **평면**이라 층고와 무관하고, 비율은 평면
// 자신의 가로/세로다(재리뷰 2 N-2). 입면 비율을 물려받으면 20.0 × 18.6 m 평면이 5.71:1 띠 한가운데
// 117 × 108 px로 인쇄됐다 — 선 길이 3.2배·면적 10배로 줄어 방 윤곽이 5 px였다. 한계는 입면과 같은
// 값을 쓴다: 16:9보다 세로로 길면 그림이 쓸데없이 커지고, 6:1보다 납작하면 높이가 128 px 아래다.
// 카메라(orthoViewParams)는 top의 절두체 세로를 도면의 큰 쪽에서 잡고 가로를 비율만큼 늘리므로,
// 이 비율을 주면 평면이 가로·세로 같은 몫으로 담긴다(파동 1의 16:9 그림과 같은 프레이밍이다).
export function topViewAspect(walls) {
  const { width, depth } = planSize(walls);
  const w = Math.max(Number(width) || 0, ELEV_MIN_EXTENT);    // 한 줄짜리(깊이 0) 도면도 답을 준다
  const d = Math.max(Number(depth) || 0, ELEV_MIN_EXTENT);
  return Math.min(Math.max(w / d, ELEV_ASPECT_MIN), ELEV_ASPECT_MAX);
}
