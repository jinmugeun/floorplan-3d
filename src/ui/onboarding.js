// 처음 열 때 한 번 보여 주는 3단계 안내(아키텍처 §12.4). 빈 화면 앞에서 "무엇을 먼저 눌러야 하는지"를
// 모르는 것이 이 앱의 가장 큰 진입 장벽이었다. 프로젝트 상태는 읽기만 하고(벽이 있는지), 남기는 것은
// localStorage의 "봤다" 한 칸뿐이다.
export const ONBOARDING_KEY = 'kvp.onboarded';

export const ONBOARDING_STEPS = [
  { title: '① 벽·방 그리기', body: '왼쪽 "도면 그리기"에서 [F] 방 그리기로 사각형을 끌거나, [L] 벽 그리기로 점을 찍어 도면을 만듭니다.' },
  { title: '② 제품·마감재 배치', body: '"제품" 탭에서 제품을 고른 뒤 캔버스를 클릭해 놓습니다. 마감재는 "마감재" 탭에서 고르고 3D에서 면을 클릭해 바릅니다.' },
  { title: '③ 3D·환기', body: '[3]으로 3D를 보고, [T]로 덕트를 그려 설비에 연결하고, "풍량" 탭에서 실별·계통별 급배기를 확인합니다.' },
];

// 저장을 읽을 수 없는 브라우저(사생활 보호 모드 등)에서는 "본 것"으로 본다 — 열 때마다 뜨는 것이 더 나쁘다.
export function isOnboarded() { try { return localStorage.getItem(ONBOARDING_KEY) === '1'; } catch { return true; } }
export function markOnboarded() { try { localStorage.setItem(ONBOARDING_KEY, '1'); } catch { /* 저장 불가 */ } }

export function openOnboarding({ store = null, onDone = () => {} } = {}) {
  const existing = document.querySelector('.modal.onboarding');
  // 두 번 열지 않는다. 돌려주는 close()는 **먼저 열린 대화상자의 정상 종료 경로**를 쓴다([건너뛰기] 클릭
  // → 그쪽 finish()가 리스너 해제 · markOnboarded() · onDone()을 한다). existing.remove()만 하면
  // document 캡처 keydown 리스너가 남고 markOnboarded()도 건너뛴다.
  if (existing) return { close: () => { existing.querySelector('[name="skip"]')?.click(); } };
  const empty = !((store?.get?.()?.floors ?? []).some(f => (f.walls ?? []).length));
  const root = document.createElement('div');
  root.className = 'modal onboarding';
  root.innerHTML = `<div class="modal-card narrow" role="dialog" aria-modal="true" aria-label="시작 안내">
    <header><h2 data-part="title"></h2></header>
    <p class="modal-body" data-part="body"></p>
    <p class="hint" data-part="extra" hidden>빈 도면에서 시작하기 어렵다면 시작 화면의 "샘플 (강당중 조리실)"을 열어 보세요.</p>
    <div class="onb-dots" data-part="dots" aria-hidden="true"></div>
    <div class="toolbar"><button type="button" name="skip">건너뛰기</button><button type="button" name="next" class="primary"></button></div>
  </div>`;
  document.body.appendChild(root);
  const q = s => root.querySelector(s);
  let i = 0;
  // 문구는 textContent로 넣는다(문구에 <>가 들어가도 HTML로 해석되지 않는다).
  function render() {
    const step = ONBOARDING_STEPS[i];
    q('[data-part="title"]').textContent = step.title;
    q('[data-part="body"]').textContent = step.body;
    q('[data-part="extra"]').hidden = !(empty && i === 0);
    q('[data-part="dots"]').textContent = ONBOARDING_STEPS.map((_, k) => (k === i ? '●' : '○')).join(' ');
    q('[name="next"]').textContent = i === ONBOARDING_STEPS.length - 1 ? '시작하기' : '다음';
    q('[name="next"]').focus();
  }
  let done = false;
  function finish() {
    if (done) return;
    done = true;
    markOnboarded();                                                  // 건너뛰기·Esc도 "봤다"다
    document.removeEventListener('keydown', onKey, true);
    root.remove();
    onDone();
  }
  const next = () => { if (i < ONBOARDING_STEPS.length - 1) { i += 1; render(); } else finish(); };
  // 캡처 단계에서 듣고 **모든** 키를 삼킨다: 안내가 떠 있는 동안 전역 단축키가 살아 있으면
  // 읽는 중에 누른 키가 도면을 바꾼다(실제로 [L]이 벽 그리기로 도구를 바꿨고 Delete·Ctrl+Z도 샜다).
  // 예외는 Tab 하나뿐 — 대화상자 안에서 [건너뛰기]·[다음] 사이를 포커스로 오갈 수 있어야 한다.
  // preventDefault는 우리가 쓰는 키에만 건다(브라우저 새로고침·스페이스 버튼 활성화를 막지 않게).
  //
  // stopPropagation만으로는 부족해 stopImmediatePropagation까지 부른다: 전역 단축키(keymap.js)는
  // document에 **버블** 단계로 붙지만, 같은 document의 **캡처** 단계에 이미 붙어 있는 다른
  // 리스너는 stopPropagation이 막지 못한다(같은 노드·같은 단계의 나머지 리스너까지 끊는 것은
  // stopImmediatePropagation뿐이다). 그 "나머지"가 우리 것을 덮어쓰지 않게 여기서 끊는다.
  // 그렇다고 다른 오버레이와 충돌하지는 않는다: document 캡처 keydown을 쓰는 다른 것은
  // popover.js·contextMenu.js·confirmDialog.js 세 개뿐이고 모두 **포인터로만** 열린다(팝오버
  // 버튼 클릭·우클릭·삭제 확인). 안내는 .modal 백드롭(inset: 0, z-index: 50)으로 화면 전체를
  // 덮는다 — 보기에는 반투명해도 포인터 입력은 그 백드롭이 받는다. 그래서 안내가 떠 있는 동안에는 그 셋이 열릴 수
  // 없다 → 우리가 끊을 캡처 리스너가 애초에 없다. 반대 순서(먼저 열린 대화상자 위에 안내)도
  // 없다: openOnboarding은 시작 화면 직후 한 번만 불린다.
  function onKey(ev) {
    if (ev.key === 'Tab') return;
    ev.stopPropagation();
    ev.stopImmediatePropagation();
    if (ev.key === 'Escape') { ev.preventDefault(); finish(); return; }
    if (ev.key === 'Enter' || ev.key === 'ArrowRight') { ev.preventDefault(); next(); return; }
    if (ev.key === 'ArrowLeft' && i > 0) { ev.preventDefault(); i -= 1; render(); }
  }
  document.addEventListener('keydown', onKey, true);
  root.addEventListener('click', ev => {
    const name = ev.target?.name;
    if (name === 'skip') finish();
    else if (name === 'next') next();
  });
  render();
  return { close: finish };
}
