// @vitest-environment jsdom
import { describe, test, expect } from 'vitest';
import { helpHtml, HELP_LINES, HELP_TITLES } from '../src/ui/helpPopover.js';

// 버튼 배선(열림·닫힘 토글, "단축키 표 열기" 콜백)은 shell이 다른 팝오버 버튼과 같은 경로로
// 맡는다(shell.test.js). 여기서는 helpHtml이 만드는 내용만 검사한다.
describe('도움말 팝오버', () => {
  test('모드마다 핵심 규칙 6줄과 단축키 표 버튼', () => {
    for (const mode of ['2d', '3d', 'duct']) {
      expect(HELP_LINES[mode]).toHaveLength(6);
      const html = helpHtml(mode);
      expect(html).toContain(HELP_TITLES[mode]);
      for (const line of HELP_LINES[mode]) expect(html).toContain(line);   // 문구에 &<>"가 없으므로 esc가 그대로 통과시킨다
      expect(html).toContain('data-help="keymap"');
      expect((html.match(/<li>/g) ?? [])).toHaveLength(6);
    }
    expect(helpHtml('없는모드')).toBe(helpHtml('2d'));   // 모르는 모드는 2D로 떨어진다
    expect(helpHtml()).toBe(helpHtml('2d'));
  });
});
