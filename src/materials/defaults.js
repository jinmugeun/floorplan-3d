// 급식실 마감 기본값(계획 17 Task 7 · 설계 D6·D11·D12). 새 방의 바닥(geom/rooms.detectRooms)과 DXF·샘플의 급식실 벽(Task 8·9)이 쓴다.
// 순수 모듈: 아무것도 import하지 않는다(geom이 불러도 순환이 생기지 않게). 함수는 매번 새 객체를 돌려준다 — 방마다 지정 객체를 나눠 쓰지 않게.
export const DEFAULT_FLOOR_MAT_ID = 'epoxy-chip-gray';
export const KITCHEN_WALL_MAT_ID = 'tile-white-300';
export const defaultFloorMat = () => ({ id: DEFAULT_FLOOR_MAT_ID, offset: [0, 0], angle: 0 });
export const kitchenWallMat = () => ({ id: KITCHEN_WALL_MAT_ID, offset: [0, 0], angle: 0 });
