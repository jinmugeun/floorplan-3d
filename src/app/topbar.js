// 상단 바 동작(렌더샷·갤러리·견적서·시방서·새로만들기·더보기). main.js가 길어지지 않게 여기로 뺐다.
import { openRenderDialog } from '../ui/renderDialog.js';
import { openGalleryDialog } from '../ui/galleryDialog.js';
import { openEstimateDialog } from '../ui/estimateDialog.js';
import { openSpecDialog } from '../ui/specDialog.js';
import { confirmDialog } from '../ui/confirmDialog.js';
import { savedAuto, savedManual, SAVED_DIRTY, SAVED_NONE } from '../ui/messages.js';

// 저장 표시 한 곳(§14.10 → §15.7). 수동 저장도 시각을 갖는다("파일로 저장했습니다"만 적혀 시각이
// 사라진 것이 감사 §18이다). 문구는 messages.js에서 온다.
export const savedLabel = (date = new Date(), { manual = false } = {}) => (manual ? savedManual(date) : savedAuto(date));
// #savedAt의 세 상태 한 곳(§15.7): 저장 뒤 변경이 있으면 시각보다 그 사실이 먼저다.
export const saveStatus = ({ at = null, manual = false, dirty = false } = {}) =>
  (dirty ? SAVED_DIRTY : at ? savedLabel(at, { manual }) : SAVED_NONE);
export function showSaved(text) { const el = document.getElementById('savedAt'); if (el) el.textContent = text; }

// 벽도 배경 도면도 없으면 잃을 것이 없는 프로젝트다(시작 화면을 바로 띄워도 된다).
export const projectIsEmpty = p => ((p?.floors ?? []).every(f => !f.walls.length) && !p?.background);

// 나가기·시작 화면 전환 앞의 확인. 묻기 전에 자동 저장본을 최신으로 만들어 "남습니다"를 사실로 만든다.
// confirm은 confirmDialog와 같은 모양(옵션 객체 → Promise<boolean>)을 받는다(테스트가 갈아 끼운다).
// dirty가 false면 묻지 않는다(§15.7: 저장 직후에는 잃을 것이 없다). 기본값은 true다 — 판정을
// 넘기지 않는 호출자는 예전처럼 늘 묻는다.
export async function confirmLeave(project, { saveNow = () => {}, confirm = confirmDialog, dirty = true } = {}) {
  if (projectIsEmpty(project) || !dirty) return true;
  saveNow();
  return !!(await confirm({ title: '나가기', message: '현재 작업을 저장하지 않고 나갈까요? 자동 저장본은 남습니다.', ok: '나가기' }));
}

export function createTopbar({ store, ui, shell, menu, view3d, actions = {} }) {
  const offs = [];
  const on = (id, fn) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('click', fn);
    offs.push(() => el.removeEventListener('click', fn));
  };
  const moreItems = () => [
    { label: '템플릿으로 저장', onSelect: () => actions.saveAsTemplate?.() },
    { label: 'JSON 내보내기', onSelect: () => actions.exportJson?.() },
    { label: '나가기', onSelect: () => actions.exit?.() },
  ];

  on('btnRender', () => openRenderDialog({ store, view3d, onSaved: () => shell.toast('갤러리에 저장했습니다') }));
  on('btnGallery', () => openGalleryDialog({}));
  on('btnEstimate', () => openEstimateDialog({ store }));
  on('btnSpec', () => openSpecDialog({ store, ui, view3d }));
  on('btnNew', () => actions.newProject?.());
  on('btnMore', () => {
    const b = document.getElementById('btnMore');
    const r = b.getBoundingClientRect();
    menu.open(r.left, r.bottom + 4, moreItems());   // 버튼 아래에 붙인다(메뉴가 화면 밖이면 스스로 보정한다)
  });

  return { destroy() { offs.forEach(f => f()); offs.length = 0; } };
}
