// @vitest-environment jsdom
import { describe, test, expect, beforeEach } from 'vitest';
import { KEYMAP, tokenOf, getTable, setTable, TABLE } from '../src/ui/keymap.js';
import { loadOverrides, saveOverrides, effectiveKeymap, buildTable, exportJson, importJson, reset, norm, keyLabel, conflictAction, labelOf, KEYMAP_KEY, RESERVED_KEYS } from '../src/ui/keyBindings.js';

beforeEach(() => { localStorage.clear(); setTable(TABLE); });

describe('단축키 재지정', () => {
  test('저장·읽기와 잘못된 값 거르기', () => {
    expect(loadOverrides()).toEqual({});
    saveOverrides({ 'tool:wall': ['Ctrl+Shift+Z'] });
    expect(loadOverrides()).toEqual({ 'tool:wall': ['Ctrl+Shift+Z'] });
    localStorage.setItem(KEYMAP_KEY, '{망가진 JSON');
    expect(loadOverrides()).toEqual({});
    localStorage.setItem(KEYMAP_KEY, JSON.stringify({ '없는동작': ['K'] }));
    expect(loadOverrides()).toEqual({});
    localStorage.setItem(KEYMAP_KEY, JSON.stringify({ 'tool:wall': [] }));
    expect(loadOverrides()).toEqual({});
  });

  test('effectiveKeymap은 지정한 동작의 키만 갈아 끼우고 원본을 건드리지 않는다', () => {
    const km = effectiveKeymap({ 'tool:wall': ['K'] });
    expect(km.find(e => e.action === 'tool:wall').keys).toEqual(['K']);
    expect(km.find(e => e.action === 'tool:room').keys).toEqual(['F']);
    expect(KEYMAP.find(e => e.action === 'tool:wall').keys).toEqual(['L']);   // 원본은 그대로
    expect(km.length).toBe(KEYMAP.length);
  });

  test('buildTable과 norm은 keymap의 토큰 규칙을 그대로 쓴다', () => {
    const t = buildTable(effectiveKeymap({ 'tool:wall': ['K'] }));
    expect(t.get('k')).toBe('tool:wall');
    expect(t.get('l')).toBeUndefined();
    expect(t.get('ctrl+shift+z')).toBe('redo');
    expect(norm(' Ctrl+Shift+Z ')).toBe('ctrl+shift+z');
    expect(norm('W A S D')).toBe('wasd');
  });

  test('keyLabel은 tokenOf와 같은 키를 가리키는 표기를 만든다', () => {
    const cases = [
      [{ key: 'l' }, 'L'],
      [{ key: 'Escape' }, 'Esc'],
      [{ key: 'z', ctrlKey: true }, 'Ctrl+Z'],
      [{ key: 'z', ctrlKey: true, shiftKey: true }, 'Ctrl+Shift+Z'],
      [{ key: 'Delete' }, 'Delete'],
      [{ key: ' ' }, 'Space'],
    ];
    for (const [ev, label] of cases) {
      expect(keyLabel(ev)).toBe(label);
      expect(norm(label)).toBe(tokenOf(ev));
    }
  });

  test('conflictAction은 다른 동작이 이미 쓰는 키만 알려준다', () => {
    const km = effectiveKeymap({});
    expect(conflictAction(km, 'F', 'tool:wall')).toBe('tool:room');
    expect(conflictAction(km, 'L', 'tool:wall')).toBeNull();   // 자기 자신은 충돌이 아니다
    expect(conflictAction(km, 'K', 'tool:wall')).toBeNull();
    expect(labelOf('tool:room')).toBe('방 그리기');
  });

  test('conflictAction은 itemCombo·도구가 먼저 가져가는 예약 키도 충돌로 본다', () => {
    const km = effectiveKeymap({});
    expect(conflictAction(km, 'Ctrl+C', 'tool:wall')).toBe('제품 복사');
    expect(conflictAction(km, 'ArrowLeft', 'tool:wall')).toBe('제품 이동');
    expect(conflictAction(km, 'K', 'tool:wall')).toBeNull();
    // labelOf에 그대로 넣어도(=KEYMAP에 없는 action) 라벨 자신이 나온다 — settingsDialog의 toast가 그대로 쓴다.
    expect(labelOf(conflictAction(km, 'Ctrl+V', 'tool:wall'))).toBe('제품 붙여넣기');
  });

  test('RESERVED_KEYS는 norm 토큰과 한글 라벨을 갖고, itemCombo·도구 키를 모두 포함한다', () => {
    const keys = RESERVED_KEYS.map(r => r.key);
    for (const r of RESERVED_KEYS) {
      expect(norm(r.key)).toBe(r.key);
      expect(typeof r.label).toBe('string');
      expect(r.label.length).toBeGreaterThan(0);
    }
    for (const k of ['ctrl+c', 'ctrl+v', 'ctrl+h', 'ctrl+l', 'ctrl+g', 'ctrl+shift+g', 'alt+h', 'alt+v', 'alt+r', 'alt+a', 'alt+c', 'alt+x', 'arrowleft', 'arrowright', 'arrowup', 'arrowdown', 'q']) {
      expect(keys).toContain(k);
    }
  });

  test('키가 여러 개인 동작(삭제)을 다시 지정하면 새 키 하나로 전부 바뀐다', () => {
    saveOverrides({ delete: ['X'] });
    const km = effectiveKeymap();
    expect(km.find(e => e.action === 'delete').keys).toEqual(['X']);
    const t = buildTable(km);
    expect(t.get('x')).toBe('delete');
    expect(t.get('delete')).toBeUndefined();
    expect(t.get('backspace')).toBeUndefined();
    reset();
    expect(effectiveKeymap().find(e => e.action === 'delete').keys).toEqual(['Delete', 'Backspace']);
  });

  test('내보내기·업로드·초기화', () => {
    saveOverrides({ 'tool:wall': ['K'] });
    expect(JSON.parse(exportJson())).toEqual({ 'tool:wall': ['K'] });
    expect(importJson('{"tool:room":["J"]}')).toEqual({ 'tool:room': ['J'] });
    expect(loadOverrides()).toEqual({ 'tool:room': ['J'] });
    expect(() => importJson('망가진')).toThrow('JSON 파일이 아닙니다');
    expect(() => importJson('{"없는동작":["K"]}')).toThrow('단축키 파일 형식이 아닙니다');
    expect(loadOverrides()).toEqual({ 'tool:room': ['J'] });   // 실패는 저장을 바꾸지 않는다
    reset();
    expect(loadOverrides()).toEqual({});
  });

  test('setTable로 바꾼 표가 getTable에 반영된다', () => {
    expect(getTable().get('l')).toBe('tool:wall');
    setTable(buildTable(effectiveKeymap({ 'tool:wall': ['K'] })));
    expect(getTable().get('k')).toBe('tool:wall');
    setTable(null);                                            // 잘못된 값은 기본 표로 되돌린다
    expect(getTable().get('l')).toBe('tool:wall');
  });
});

// 최종 리뷰 I-1: 예약 목록에 없는 Alt 조합(Alt+K …)도 표 동작에 묶이면 keymap.js가 Alt를 건너뛰어 동작이 조용히 죽는다 → 모두 충돌.
test('예약 목록에 없는 Alt 조합도 충돌로 막는다', async () => {
  const { conflictAction, effectiveKeymap, RESERVED_KEYS } = await import('../src/ui/keyBindings.js');
  const km = effectiveKeymap({});
  expect(RESERVED_KEYS.some(r => r.key === 'alt+k')).toBe(false);
  expect(conflictAction(km, 'Alt+K', 'tool:wall')).toBeTruthy();
  expect(conflictAction(km, 'Alt+H', 'tool:wall')).toBeTruthy();
  expect(conflictAction(km, 'K', 'tool:wall')).toBeNull();
});

// §13.1: alt+s로 재지정하면 선택이 있는 동안 절대 눌리지 않으므로 충돌로 막는다.
test('alt+s는 예약 키이고 이름이 "제품 경로 배열 복사"다', async () => {
  const { RESERVED_KEYS, conflictAction, effectiveKeymap } = await import('../src/ui/keyBindings.js');
  expect(RESERVED_KEYS.find(r => r.key === 'alt+s')?.label).toBe('제품 경로 배열 복사');
  expect(conflictAction(effectiveKeymap({}), 'Alt+S', 'tool:wall')).toBe('제품 경로 배열 복사');
});
