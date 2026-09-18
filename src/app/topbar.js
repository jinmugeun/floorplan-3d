// 상단 바 동작(렌더샷·갤러리·견적서·시방서·새로만들기·더보기). main.js가 길어지지 않게 여기로 뺐다.
import { openRenderDialog } from '../ui/renderDialog.js';
import { openGalleryDialog } from '../ui/galleryDialog.js';
import { openEstimateDialog } from '../ui/estimateDialog.js';
import { openSpecDialog } from '../ui/specDialog.js';

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
