import { allTemplateCards, deleteTemplate, renameTemplate, listTemplates, templateProject, BUILTIN_TEMPLATES } from '../templates/projectTemplates.js';
import { projectShapes, placeholderShapes, mountPreviews, PREVIEW_PX } from './templatePreview.js';
import { buildSampleProject } from '../samples/gangdang.js';
import { esc } from '../util/html.js';
import { focusTrap } from './dialogBase.js';
import { confirmDialog } from './confirmDialog.js';
import { promptDialog } from './promptDialog.js';
import { CONFIRM_TEMPLATE_DELETE, TEMPLATE_RENAME, TEMPLATE_NAME_TAKEN, NAME_REQUIRED, RESTORE_CARD_TITLE, restoreCardDesc } from './messages.js';

const CARDS = [
  { key: 'empty', title: '빈 프로젝트', desc: '빈 화면에서 방과 벽을 직접 그립니다.' },
  { key: 'upload', title: '도면 이미지 업로드', desc: '사진이나 스캔을 올려 기울기를 펴고 축척을 잡습니다.' },
  { key: 'sample', title: '샘플 (강당중 조리실)', desc: '방 11개가 그려진 예제 도면으로 시작합니다.' },
];
// 위 카드 3개가 담당하는 내장 템플릿은 목록에서 뺀다(같은 것을 두 번 보여주지 않는다).
const HIDDEN = new Set(['builtin-empty', 'builtin-gangdang']);

// 자동 저장본이 있으면 맨 앞 카드로 제안한다(브라우저 confirm 대신 — §12.5).
const restoreCard = (p, at) => ({ key: 'restore', title: RESTORE_CARD_TITLE, desc: restoreCardDesc(p?.name, at) });

// 프로젝트가 비어 있을 때 띄우는 시작 오버레이.
export function openStartScreen({ store, restored = null, restoredAt = null, onEmpty = () => {}, onUpload = () => {}, onSample = () => {}, onTemplate = () => {}, onRestore = () => {}, onClose = () => {} }) {
  const cards = restored ? [restoreCard(restored, restoredAt), ...CARDS] : CARDS;
  const root = document.createElement('div');
  root.id = 'startScreen';
  root.setAttribute('role', 'dialog'); root.setAttribute('aria-modal', 'true'); root.setAttribute('aria-label', '시작하기');
  // 내장 템플릿 카드는 버튼 하나다. **저장한** 템플릿 카드는 열기 + [이름 변경]·[삭제] 세 버튼이라
  // 버튼 안에 버튼을 넣을 수 없어 div로 감싼다(§16.10 · 감사 §18).
  // 축소 도면(§16.12 · 감사 §48): "원룸 6평"이 어떤 도면인지 열지 않고 알 수 있게 한다.
  const previewTag = id => `<canvas data-tpl="${esc(id)}" width="${PREVIEW_PX}" height="${PREVIEW_PX}" aria-hidden="true"></canvas>`;
  const tplCard = c => (c.user
    ? `<div class="start-card tpl user">
        <button type="button" class="start-open" data-template="${esc(c.id)}">${previewTag(c.id)}<b>${esc(c.name)}</b><span>${esc(c.desc)}</span></button>
        <div class="row"><button type="button" data-tpl-rename="${esc(c.id)}">이름 변경</button><button type="button" data-tpl-delete="${esc(c.id)}" class="danger">삭제</button></div>
      </div>`
    : `<button type="button" class="start-card tpl" data-template="${esc(c.id)}">${previewTag(c.id)}<b>${esc(c.name)}</b><span>${esc(c.desc)}</span></button>`);
  // 카드 하나마다 그 템플릿의 프로젝트를 한 번 만들어 그린다(내장 원룸 + 저장한 템플릿 몇 장).
  // 실패하거나 도면이 비면 캔버스는 빈 채 남는다(mountPreviews가 null을 받으면 그린 것이 없다).
  // 동작 카드 셋도 같은 틀의 그림을 갖는다(§17.12(1)): 샘플은 실제 도면, 나머지는 자리표시다.
  // 샘플 프로젝트는 한 번만 만들어 돌려 쓴다(시작 화면을 열 때마다 짓지 않는다 — 40 ms급이지만
  // 카드가 넷이고 다시 그리는 경로가 있다).
  let sampleFloor = null;
  const shapesFor = id => {
    if (id === 'restore') return restored ? projectShapes(restored.floors?.[restored.activeFloor ?? 0]) : null;
    if (id === 'sample') {
      // §17.12(1)은 "buildSampleProject()의 **활성 층**"이라고 적었다. 지금 샘플은 층이 하나이고
      // activeFloor도 0이라 결과는 같지만, 규칙을 그대로 적어 두면 층이 늘어도 유지된다(M-12).
      try { const p = buildSampleProject(); sampleFloor ??= p.floors?.[p.activeFloor ?? 0] ?? null; return sampleFloor ? projectShapes(sampleFloor) : null; }
      catch { return null; }
    }
    if (id === 'empty' || id === 'upload') return placeholderShapes(id);
    try { const p = templateProject(id); return p ? projectShapes(p.floors?.[p.activeFloor ?? 0]) : null; }
    catch { return null; }
  };
  const templatesHtml = () => {
    const list = allTemplateCards().filter(c => !HIDDEN.has(c.id));
    return list.length
      ? list.map(tplCard).join('')
      : '<p class="hint">저장한 템플릿이 없습니다. 더보기 메뉴의 "템플릿으로 저장"으로 만들 수 있습니다.</p>';
  };
  root.innerHTML = `<div class="start-card-row">
    <h1>주방 환기 3D 플래너</h1>
    <div class="start-cards">${cards.map(c => `<button type="button" class="start-card${c.key === 'restore' ? ' restore' : ''}" data-start="${c.key}">${previewTag(c.key)}<b>${esc(c.title)}</b><span>${esc(c.desc)}</span></button>`).join('')}</div>
    <h2 class="start-sub">템플릿</h2>
    <div class="start-cards" data-part="templates">${templatesHtml()}</div>
  </div>`;
  document.body.appendChild(root);
  // 카드를 다시 그린 뒤에도(이름 변경·삭제) 축소 도면을 다시 칠한다 — innerHTML 교체가 캔버스를 버린다.
  const paintPreviews = () => mountPreviews(root, shapesFor);
  const refreshTemplates = () => { root.querySelector('[data-part="templates"]').innerHTML = templatesHtml(); paintPreviews(); };
  paintPreviews();
  // 검증은 renameTemplate과 같은 규칙을 본다(저장한 템플릿·내장 템플릿과 이름이 겹치면 막는다). 저장은 하지 않는다.
  const renameCheck = (id, name) => !listTemplates().some(t => t.id !== id && t.name === name)
    && !BUILTIN_TEMPLATES.some(t => t.name === name);
  // 어느 길로 닫혀도(카드·템플릿·Esc·close()) 한 번만 알린다 — 온보딩이 시작 화면 위에 겹쳐 뜨지 않게.
  const close = () => { if (!root.parentNode) return; root.remove(); trap.destroy(); onClose(); };
  const handlers = { empty: onEmpty, upload: onUpload, sample: onSample, restore: onRestore };
  root.addEventListener('click', async ev => {
    const del = ev.target.closest('[data-tpl-delete]');
    if (del) {
      const id = del.dataset.tplDelete;
      const name = listTemplates().find(t => t.id === id)?.name ?? '';
      if (await confirmDialog(CONFIRM_TEMPLATE_DELETE(name))) { deleteTemplate(id); refreshTemplates(); }
      return;
    }
    const ren = ev.target.closest('[data-tpl-rename]');
    if (ren) {
      const id = ren.dataset.tplRename;
      const cur = listTemplates().find(t => t.id === id)?.name ?? '';
      const next = await promptDialog({ ...TEMPLATE_RENAME, value: cur, validate: t => (!t.trim() ? NAME_REQUIRED : t.trim() !== cur && !renameCheck(id, t.trim()) ? TEMPLATE_NAME_TAKEN : null) });
      if (next !== null && renameTemplate(id, next)) refreshTemplates();
      return;
    }
    const tpl = ev.target.closest('[data-template]');
    if (tpl) { close(); onTemplate(tpl.dataset.template); return; }
    const b = ev.target.closest('[data-start]');
    if (!b) return;
    close();
    handlers[b.dataset.start]?.();
  });
  // Esc = 빈 프로젝트로 시작(다른 대화상자와 같은 규칙). 첫 카드에 포커스를 두어 키보드만으로도 고를 수 있게 한다.
  root.addEventListener('keydown', ev => { if (ev.key === 'Escape') { ev.stopPropagation(); close(); onEmpty(); } });
  // §15.10: 첫 카드로 포커스를 넣고 [Tab]을 안에 가둔다(모달 뒤의 앱을 조작할 수 없게).
  const trap = focusTrap(root, { focus: '.start-card' });
  return { close };
}
