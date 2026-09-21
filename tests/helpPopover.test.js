// @vitest-environment jsdom
import { describe, test, expect, beforeEach } from 'vitest';
import { createPopover } from '../src/ui/popover.js';
import { helpHtml, createHelpButton, HELP_LINES, HELP_TITLES } from '../src/ui/helpPopover.js';

beforeEach(() => { document.body.innerHTML = ''; });

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

  test('버튼이 현재 모드의 도움말을 열고 "단축키 표 열기"가 콜백을 부른다', () => {
    const root = document.createElement('div'); document.body.appendChild(root);
    const btn = document.createElement('button'); root.appendChild(btn);
    const pop = createPopover(root);
    let mode = '2d'; const opened = [];
    const help = createHelpButton(btn, { popover: pop, getMode: () => mode, onOpenKeymap: () => opened.push(1) });
    btn.click();
    expect(pop.isOpen()).toBe(true);
    expect(document.querySelector('.popover').textContent).toContain(HELP_LINES['2d'][0]);
    document.querySelector('.popover [data-help="keymap"]').click();
    expect(opened).toEqual([1]);
    expect(pop.isOpen()).toBe(false);          // 단축키 표로 넘어가며 닫힌다
    mode = 'duct';
    btn.click();
    expect(document.querySelector('.popover').textContent).toContain(HELP_LINES.duct[0]);
    help.destroy();
    pop.close();
    btn.click();
    expect(pop.isOpen()).toBe(false);          // destroy 뒤에는 열리지 않는다
  });
});
