const CARDS = [
  { key: 'empty', title: '빈 프로젝트', desc: '빈 화면에서 방과 벽을 직접 그립니다.' },
  { key: 'upload', title: '도면 이미지 업로드', desc: '사진이나 스캔을 올려 기울기를 펴고 축척을 잡습니다.' },
  { key: 'sample', title: '샘플 (강당중 조리실)', desc: '방 11개가 그려진 예제 도면으로 시작합니다.' },
];

// 프로젝트가 비어 있고 복원할 자동 저장본도 없을 때만 띄우는 시작 오버레이.
export function openStartScreen({ store, onEmpty = () => {}, onUpload = () => {}, onSample = () => {} }) {
  const root = document.createElement('div');
  root.id = 'startScreen';
  root.setAttribute('role', 'dialog'); root.setAttribute('aria-modal', 'true'); root.setAttribute('aria-label', '시작하기');
  root.innerHTML = `<div class="start-card-row">
    <h1>주방 환기 3D 플래너</h1>
    <div class="start-cards">${CARDS.map(c => `<button type="button" class="start-card" data-start="${c.key}"><b>${c.title}</b><span>${c.desc}</span></button>`).join('')}</div>
  </div>`;
  document.body.appendChild(root);
  const close = () => { if (root.parentNode) root.remove(); };
  const handlers = { empty: onEmpty, upload: onUpload, sample: onSample };
  root.addEventListener('click', ev => {
    const b = ev.target.closest('[data-start]');
    if (!b) return;
    close();
    handlers[b.dataset.start]?.();
  });
  // Esc = 빈 프로젝트로 시작(다른 대화상자와 같은 규칙). 첫 카드에 포커스를 두어 키보드만으로도 고를 수 있게 한다.
  root.addEventListener('keydown', ev => { if (ev.key === 'Escape') { ev.stopPropagation(); close(); onEmpty(); } });
  root.querySelector('[data-start="empty"]')?.focus();
  return { close };
}
