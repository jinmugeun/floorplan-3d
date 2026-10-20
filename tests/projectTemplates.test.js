// @vitest-environment jsdom
import { describe, test, expect, beforeEach, vi } from 'vitest';
import { createEmptyProject, activeFloor } from '../src/state/schema.js';
import { BUILTIN_TEMPLATES, saveTemplate, listTemplates, deleteTemplate, renameTemplate, templateProject, allTemplateCards, TEMPLATE_KEY } from '../src/templates/projectTemplates.js';

beforeEach(() => localStorage.clear());

describe('프로젝트 템플릿', () => {
  test('내장 템플릿 3개가 모두 열리는 프로젝트를 만든다(원룸 6평은 계획 17 — 조리실 전용 카탈로그에서 뺐다)', () => {
    expect(BUILTIN_TEMPLATES.map(t => t.id)).toEqual(['builtin-empty', 'builtin-gangdang', 'builtin-sinsang']);
    for (const t of BUILTIN_TEMPLATES) {
      const p = t.build();
      expect(p.version, t.id).toBe(1);
      expect(Array.isArray(p.floors), t.id).toBe(true);
      expect(p.floors.length, t.id).toBeGreaterThanOrEqual(1);
    }
    expect(templateProject('builtin-studio')).toBeNull();
    expect(activeFloor(templateProject('builtin-gangdang')).rooms.length).toBeGreaterThan(5);
    expect(templateProject('없음')).toBeNull();
  });

  // 2026-10-13 · 사용자 요청: 경산 신상중 급식기구 배치도(DXF · sinsang-A)를 가져온 결과를 내장 템플릿으로 공개. 수치는 samples/sinsang.js 머리 주석(점수판 sinsang-A와 같다).
  test('경산 신상중 급식실 템플릿은 가져온 결과 그대로(벽 62 · 방 13 · 실명 11 · 문 16 · 창 16 · 기구 167)이고 배경·가져오기 기록은 없으며 매번 새 객체다', () => {
    const a = templateProject('builtin-sinsang'), b = templateProject('builtin-sinsang');
    expect(a).not.toBe(b);
    expect(a.name).toBe('경산 신상중 급식실');
    expect(a.background).toBeNull();
    expect(a.meta?.dxfImport).toBeUndefined();
    const f = activeFloor(a);
    expect(f.walls).toHaveLength(62);
    expect(f.rooms).toHaveLength(13);
    expect(f.rooms.filter(r => r.name).map(r => r.name)).toContain('조리실');
    expect(f.rooms.filter(r => r.name)).toHaveLength(11);
    const kinds = f.items.reduce((m, i) => ({ ...m, [i.kind]: (m[i.kind] ?? 0) + 1 }), {});
    expect(kinds).toMatchObject({ door: 16, window: 16, opening: 9, column: 14 });
    expect(kinds.product + kinds.equipment).toBe(167);
    expect(f.items.every(i => i.id && Array.isArray(i.pos) && Array.isArray(i.size))).toBe(true);
    a.floors[0].walls.length = 0;                                                         // 한 사본을 고쳐도
    expect(activeFloor(templateProject('builtin-sinsang')).walls).toHaveLength(62);       // 다음 사본은 멀쩡하다
  });

  test('사용자 템플릿을 저장·목록·삭제하고 배경 이미지는 빼 둔다', () => {
    const p = createEmptyProject('내 도면');
    p.background = { src: 'data:image/png;base64,AAA', width: 10, height: 10, scale: 1, opacity: 0.5, offset: [0, 0], visible: true, locked: true };
    activeFloor(p).height = 2600;
    const saved = saveTemplate('  주방 표준  ', p);
    expect(saved.name).toBe('주방 표준');
    expect(listTemplates().map(t => t.name)).toEqual(['주방 표준']);
    const back = templateProject(saved.id);
    expect(back.background).toBeNull();
    expect(activeFloor(back).height).toBe(2600);
    expect(JSON.parse(localStorage.getItem(TEMPLATE_KEY))).toHaveLength(1);
    saveTemplate('주방 표준', createEmptyProject('다시'));   // 같은 이름은 덮어쓴다(새 id를 받는다)
    expect(listTemplates()).toHaveLength(1);
    expect(templateProject(saved.id)).toBeNull();          // 덮어쓴 옛 id는 사라졌다
    const again = listTemplates()[0];                      // 덮어쓴 항목의 새 id로 지운다
    deleteTemplate(again.id);
    expect(listTemplates()).toHaveLength(0);
  });

  test('같은 밀리초에 두 번 저장해도 id가 겹치지 않는다', () => {
    const a = saveTemplate('A', createEmptyProject('a'));
    const b = saveTemplate('B', createEmptyProject('b'));
    expect(a.id).not.toBe(b.id);                           // Date.now()만으로는 겹칠 수 있다(M-28)
    expect(listTemplates()).toHaveLength(2);
  });

  test('저장한 템플릿은 원본 프로젝트와 얽히지 않는다', () => {
    const p = createEmptyProject('원본');
    const saved = saveTemplate('스냅샷', p);
    activeFloor(p).height = 2999;
    expect(activeFloor(templateProject(saved.id)).height).not.toBe(2999);
  });

  test('allTemplateCards는 내장 다음에 사용자 템플릿을 붙인다', () => {
    saveTemplate('내 것', createEmptyProject('x'));
    const cards = allTemplateCards();
    expect(cards.slice(0, 3).map(c => c.id)).toEqual(['builtin-empty', 'builtin-gangdang', 'builtin-sinsang']);
    expect(cards.at(-1)).toMatchObject({ name: '내 것', user: true });
    expect(cards.at(-1).desc).toContain('저장한 템플릿');
  });

  test('localStorage가 망가져 있어도 던지지 않는다', () => {
    localStorage.setItem(TEMPLATE_KEY, '{보기 안 좋은 JSON');
    expect(listTemplates()).toEqual([]);
    expect(() => deleteTemplate('x')).not.toThrow();
  });

  test('엔트리의 project 필드가 잘못된 모양이어도 templateProject는 던지지 않고 null을 돌려준다', () => {
    localStorage.setItem(TEMPLATE_KEY, JSON.stringify([{ id: 'bad1', name: '깨진 것', savedAt: new Date().toISOString(), project: 42 }]));
    expect(() => templateProject('bad1')).not.toThrow();
    expect(templateProject('bad1')).toBeNull();
  });

  // §16.10(감사 §18): deleteTemplate 호출자가 0이었고 이름을 바꿀 길도 없었다.
  test('renameTemplate은 이름을 바꾸고 중복은 거절한다', () => {
    localStorage.clear();
    const a = saveTemplate('내 방 A', createEmptyProject('A'));
    saveTemplate('내 방 B', createEmptyProject('B'));
    expect(renameTemplate(a.id, '내 방 C')).toBe(true);
    expect(listTemplates().map(t => t.name).sort()).toEqual(['내 방 B', '내 방 C']);
    expect(renameTemplate(a.id, '내 방 B')).toBe(false);          // 같은 이름은 쓰지 않는다
    expect(renameTemplate(a.id, '   ')).toBe(false);              // 빈 이름도 거절한다
    expect(renameTemplate('없는id', '무엇')).toBe(false);
    expect(listTemplates().find(t => t.id === a.id).name).toBe('내 방 C');
  });

  test('용량 초과 등으로 localStorage.setItem이 던지면 saveTemplate이 null을 돌려준다', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('QuotaExceededError'); });
    try {
      expect(saveTemplate('실패할 이름', createEmptyProject('x'))).toBeNull();
    } finally {
      spy.mockRestore();
    }
  });
});
