// 벽 추출 파라미터 하나(§18.3). **동결 상수 하나**다 — 프로토타입의 환경변수 덮어쓰기는
// 연구에서 끝났고, 사용자가 만지는 값은 검토 화면의 `층고`·`기본 두께` 둘뿐이다(§18.6).
// 값의 근거는 전부 실측이다: 90 mm 미만을 자르는 것은 FIN 마감선의 25 mm 봉우리가 혼자 80.5 m라서,
// 개구부 레이어 면선의 하한이 700 mm인 것은 커튼월 구간에서 WAL·기존 면선이 끊기고 WIN 창틀선이
// 그 구간의 벽면을 대신 그리기 때문이다(그 항을 빼면 외곽이 닫히지 않는다).
export const DXF_PARAMS = Object.freeze({
  roiCell: 5000, minSeg: 150, openFaceMin: 700, angTol: 0.75, offTol: 6, faceGap: 5200,
  tMin: 90, tMax: 500, minOverlap: 1000, modeBin: 5, modeTop: 6, modeSnapTop: 8, modeBoost: 2.5,
  modeSnap: 15, consume: 0.4, tieBand: 0.1, mergeGap: 5200, snap: 250, snapFinal: 30,
  extend: 4000, bridge: 3000, bridgeOffTol: 90, bridgeAngTol: 2.5, passes: 3,
  minWall: 250, minComp: 4, height: 3500, thickness: 200,
});
