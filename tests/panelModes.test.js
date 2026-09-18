import { describe, test, expect } from 'vitest';
import { panelsToCancel, REPLACE_PANELS } from '../src/ui/panelModes.js';

// main.js의 cancelReplace가 쓰는 규칙(레일 탭 클릭 → 어느 패널의 교체 모드를 끌 것인가).
// main.js는 WebGLRenderer를 최상위에서 만들어 테스트에서 import할 수 없으므로 규칙만 따로 잠근다.
describe('패널 교체 모드 취소 규칙', () => {
  test('교체 모드를 가진 패널은 제품·마감재 둘뿐이다', () => {
    expect(REPLACE_PANELS).toEqual(['products', 'materials']);
  });

  test('누른 탭의 패널만 자기 모드를 지킨다', () => {
    expect(panelsToCancel('products')).toEqual(['materials']);
    expect(panelsToCancel('materials')).toEqual(['products']);
  });

  // 회귀: 예전에는 두 패널을 함께 면제해서 제품↔마감재를 오갈 때 상대의 묵은 교체 모드가 살아남았다.
  test('제품과 마감재를 오가면 상대 패널의 교체 모드가 꺼진다', () => {
    expect(panelsToCancel('products')).toContain('materials');
    expect(panelsToCancel('materials')).toContain('products');
  });

  test('다른 탭과 인자 없음(Esc·도구 전환)은 둘 다 끈다', () => {
    for (const tab of ['draw', 'background', 'layers']) expect(panelsToCancel(tab)).toEqual(['products', 'materials']);
    expect(panelsToCancel()).toEqual(['products', 'materials']);
    expect(panelsToCancel(null)).toEqual(['products', 'materials']);
    expect(panelsToCancel(undefined)).toEqual(['products', 'materials']);
  });
});
