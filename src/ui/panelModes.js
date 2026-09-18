// "교체 모드"를 가진 패널들. 레일 탭을 눌렀을 때 어느 패널의 교체 모드를 꺼야 하는지 한 곳에서 정한다.
export const REPLACE_PANELS = ['products', 'materials'];

// 누른 탭의 패널만 자기 모드를 지키고, 나머지는 모두 배치 모드로 돌아간다.
// 인자가 없으면(Esc·도구 전환) 전부 끈다. 제품↔마감재를 오갈 때 상대 패널의 묵은 교체 모드가 남지 않는다.
export function panelsToCancel(clickedPanel = null) {
  return REPLACE_PANELS.filter(p => p !== clickedPanel);
}
