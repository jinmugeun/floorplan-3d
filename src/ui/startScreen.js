import { allTemplateCards } from '../templates/projectTemplates.js';
import { esc } from '../util/html.js';

const CARDS = [
  { key: 'empty', title: '빈 프로젝트', desc: '빈 화면에서 방과 벽을 직접 그립니다.' },
  { key: 'upload', title: '도면 이미지 업로드', desc: '사진이나 스캔을 올려 기울기를 펴고 축척을 잡습니다.' },
  { key: 'sample', title: '샘플 (강당중 조리실)', desc: '방 11개가 그려진 예제 도면으로 시작합니다.' },
];
// 위 카드 3개가 담당하는 내장 템플릿은 목록에서 뺀다(같은 것을 두 번 보여주지 않는다).
const HIDDEN = new Set(['builtin-empty', 'builtin-gangdang']);

// 자동 저장본이 있으면 맨 앞 카드로 제안한다(브라우저 confirm 대신 — §12.5).
const restoreCard = p => ({ key: 'restore', title: '이어서 작업', desc: `자동 저장된 "${p?.name ?? '프로젝트'}"을 불러옵니다.` });

// 프로젝트가 비어 있을 때 띄우는 시작 오버레이.
export function openStartScreen({ store, restored = null, onEmpty = () => {}, onUpload = () => {}, onSample = () => {}, onTemplate = () => {}, onRestore = () => {} }) {
  const templates = allTemplateCards().filter(c => !HIDDEN.has(c.id));
  const cards = restored ? [restoreCard(restored), ...CARDS] : CARDS;
  const root = document.createElement('div');
  root.id = 'startScreen';
  root.setAttribute('role', 'dialog'); root.setAttribute('aria-modal', 'true'); root.setAttribute('aria-label', '시작하기');
  root.innerHTML = `<div class="start-card-row">
    <h1>주방 환기 3D 플래너</h1>
    <div class="start-cards">${cards.map(c => `<button type="button" class="start-card${c.key === 'restore' ? ' restore' : ''}" data-start="${c.key}"><b>${esc(c.title)}</b><span>${esc(c.desc)}</span></button>`).join('')}</div>
    <h2 class="start-sub">템플릿</h2>
    <div class="start-cards">${templates.length
      ? templates.map(c => `<button type="button" class="start-card tpl" data-template="${esc(c.id)}"><b>${esc(c.name)}</b><span>${esc(c.desc)}</span></button>`).join('')
      : '<p class="hint">저장한 템플릿이 없습니다. 더보기 메뉴의 "템플릿으로 저장"으로 만들 수 있습니다.</p>'}</div>
  </div>`;
  document.body.appendChild(root);
  const close = () => { if (root.parentNode) root.remove(); };
  const handlers = { empty: onEmpty, upload: onUpload, sample: onSample, restore: onRestore };
  root.addEventListener('click', ev => {
    const tpl = ev.target.closest('[data-template]');
    if (tpl) { close(); onTemplate(tpl.dataset.template); return; }
    const b = ev.target.closest('[data-start]');
    if (!b) return;
    close();
    handlers[b.dataset.start]?.();
  });
  // Esc = 빈 프로젝트로 시작(다른 대화상자와 같은 규칙). 첫 카드에 포커스를 두어 키보드만으로도 고를 수 있게 한다.
  root.addEventListener('keydown', ev => { if (ev.key === 'Escape') { ev.stopPropagation(); close(); onEmpty(); } });
  root.querySelector('.start-card')?.focus();
  return { close };
}
