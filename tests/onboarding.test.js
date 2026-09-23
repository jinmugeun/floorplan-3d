// @vitest-environment jsdom
import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { createStore } from '../src/state/store.js';
import { createEmptyProject } from '../src/state/schema.js';
import { addWalls } from '../src/state/floorOps.js';
import { rectWalls } from '../src/geom/walls.js';
import { openOnboarding, isOnboarded, markOnboarded, ONBOARDING_STEPS, ONBOARDING_KEY } from '../src/ui/onboarding.js';

const card = () => document.querySelector('.modal.onboarding');
const btn = name => card().querySelector(`[name="${name}"]`);
const key = (k, opts = {}) => document.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, ...opts }));

beforeEach(() => { document.body.innerHTML = ''; localStorage.clear(); });
// 대화상자를 열어 둔 채 끝나는 테스트가 있다: 정상 종료 경로로 닫아 document 캡처 keydown 리스너를 떼어 낸다
// (body.innerHTML = ''는 DOM만 지우고 리스너는 남긴다 — 떼어 낸 노드를 계속 만지는 좀비 핸들러가 된다).
afterEach(() => { document.querySelector('.modal.onboarding [name="skip"]')?.click(); });

describe('온보딩', () => {
  test('3단계 문구와 진행 표시', () => {
    expect(ONBOARDING_STEPS).toHaveLength(3);
    expect(ONBOARDING_STEPS[0].title).toContain('벽·방 그리기');
    expect(ONBOARDING_STEPS[1].title).toContain('제품·마감재');
    expect(ONBOARDING_STEPS[2].title).toContain('3D·환기');
    openOnboarding({});
    expect(card().textContent).toContain(ONBOARDING_STEPS[0].body);
    expect(card().querySelector('[data-part="dots"]').textContent).toBe('● ○ ○');
    expect(btn('next').textContent).toBe('다음');
  });

  test('[다음]으로 끝까지 가면 [시작하기]가 되고 onDone과 저장이 한 번씩 일어난다', () => {
    const done = [];
    openOnboarding({ onDone: () => done.push(1) });
    btn('next').click();
    expect(card().textContent).toContain(ONBOARDING_STEPS[1].body);
    expect(card().querySelector('[data-part="dots"]').textContent).toBe('○ ● ○');
    btn('next').click();
    expect(btn('next').textContent).toBe('시작하기');
    btn('next').click();
    expect(card()).toBeNull();
    expect(done).toEqual([1]);
    expect(isOnboarded()).toBe(true);
    expect(localStorage.getItem(ONBOARDING_KEY)).toBe('1');
  });

  test('[건너뛰기]와 [Esc]도 "봤다"로 기록하고, 키보드로 앞뒤로 움직인다', () => {
    openOnboarding({});
    btn('skip').click();
    expect(card()).toBeNull();
    expect(isOnboarded()).toBe(true);

    localStorage.clear();
    const leaked = [];
    window.addEventListener('keydown', ev => leaked.push(ev.key));
    openOnboarding({});
    key('ArrowRight');
    expect(card().textContent).toContain(ONBOARDING_STEPS[1].body);
    key('ArrowLeft');
    expect(card().textContent).toContain(ONBOARDING_STEPS[0].body);
    key('Escape');
    expect(card()).toBeNull();
    expect(isOnboarded()).toBe(true);
    expect(leaked).toEqual([]);            // 전역 단축키로 새지 않는다
  });

  // 실제로 새던 구멍: 안내를 읽는 중 [L]을 누르면 전역 단축키가 도구를 '벽 그리기'로 바꿨다.
  // 캡처 단계에서 Esc·Enter·화살표만 멈췄기 때문이다 — 이제 Tab을 뺀 모든 키를 여기서 삼킨다.
  test('열려 있는 동안 모든 키가 전역 단축키로 새지 않고, Tab만 통과한다', () => {
    const leaked = [];
    const spy = ev => leaked.push(ev.key);
    window.addEventListener('keydown', spy);
    try {
      openOnboarding({});
      key('l'); key('f'); key('Delete'); key('3'); key('z', { ctrlKey: true });
      expect(leaked).toEqual([]);
      expect(card()).not.toBeNull();                                                  // 아무 키도 대화상자를 닫지 않는다
      expect(card().querySelector('[data-part="dots"]').textContent).toBe('● ○ ○');   // 단계도 그대로다
      expect(key('Tab')).toBe(true);                                                  // preventDefault를 걸지 않는다
      expect(leaked).toEqual(['Tab']);                                                // 포커스 이동은 통과시킨다
      key('Escape');
      expect(card()).toBeNull();
      expect(leaked).toEqual(['Tab']);
      key('l');
      expect(leaked).toEqual(['Tab', 'l']);                                           // 닫힌 뒤에는 다시 전역으로 간다
    } finally {
      window.removeEventListener('keydown', spy);
    }
  });

  // §17.12(3) · 감사 §43: 세 카드가 같은 문장으로 끝났다(화면에는 첫 장에만 보였지만 자리는 마지막이다).
  // 숨긴 문구는 글자 자체를 비운다 — 프로브·스크린 리더가 읽지 않게.
  test('빈 프로젝트에서는 마지막 단계에 샘플 안내가 붙고, 도면이 있으면 붙지 않는다', () => {
    openOnboarding({ store: createStore(createEmptyProject()) });
    const extra = () => card().querySelector('[data-part="extra"]');
    expect(extra().hidden).toBe(true);   // 첫 장에는 없다(§17.12(3))
    expect(extra().textContent).toBe('');
    btn('next').click();
    expect(extra().hidden).toBe(true);
    btn('next').click();                                                    // 3장 중 마지막
    expect(extra().hidden).toBe(false);
    expect(extra().textContent).toContain('샘플 (강당중 조리실)');
    expect(card().textContent).toContain('샘플');
    btn('skip').click();

    const store = createStore(createEmptyProject());
    addWalls(store, rectWalls([0, 0], [4000.5, 3000.25], 200));
    openOnboarding({ store });
    expect(card().querySelector('[data-part="extra"]').hidden).toBe(true);
  });

  test('이미 봤으면 isOnboarded가 true이고, 두 번 열어도 하나만 뜬다', () => {
    expect(isOnboarded()).toBe(false);
    markOnboarded();
    expect(isOnboarded()).toBe(true);
    openOnboarding({});
    openOnboarding({});
    expect(document.querySelectorAll('.modal.onboarding')).toHaveLength(1);
  });
});
