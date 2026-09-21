// 상대이동·배열 복사 대화상자. 값만 모아 onApply로 넘기고 스토어는 건드리지 않는다.
// 경로 배열의 간격 하한·개수 상한(§13.1 I-1): 1 mm 간격으로 수만 개를 만드는 길을 입구에서 막는다.
// 총 배치 수(= 개수 × 선택 수) 상한은 경로를 아는 배선 층(app/arrangeActions.js)이 한 번 더 본다.
export const MIN_SPACING = 10;
export const MAX_COUNT = 500;
const TITLES = { relative: '상대이동', linear: '직선 배열 복사', circular: '원형 배열 복사', rotate: '회전 복사', path: '경로 배열 복사' };
const num = (name, label, value, min, max, step = 1) =>
  `<label class="field"><span>${label}</span><input type="number" name="${name}" value="${value}" min="${min}" max="${max}" step="${step}"></label>`;
const clamp = (el, def) => {
  const v = Number(el?.value);
  if (el?.value === '' || !Number.isFinite(v)) return def; // 빈 칸은 0이 아니라 기본값이다(Number('') = 0)
  return Math.min(Number(el.max), Math.max(Number(el.min), v));
};

function openDialog(kind, body, collect, { onApply = () => {}, onClose = () => {} } = {}) {
  const root = document.createElement('div');
  root.className = 'modal';
  root.innerHTML = `<div class="modal-card narrow">
    <header><h2>${TITLES[kind]}</h2><button type="button" name="close" aria-label="닫기">✕</button></header>
    <div class="modal-body">${body}</div>
    <div class="toolbar"><button type="button" name="apply" class="primary">적용</button></div>
  </div>`;
  document.body.appendChild(root);
  const close = () => { root.remove(); onClose(); };
  root.querySelector('[name="close"]').onclick = close;
  root.querySelector('[name="apply"]').onclick = () => { onApply(collect(root)); close(); };
  // Enter로 확정, Esc로 닫기. 한글 조합 중의 Enter는 "글자 확정"이라 확정으로 보지 않는다(M-1).
  root.addEventListener('keydown', ev => { if (ev.isComposing || ev.keyCode === 229) return; if (ev.key === 'Escape') { ev.stopPropagation(); close(); } else if (ev.key === 'Enter') { ev.preventDefault(); root.querySelector('[name="apply"]').click(); } });
  root.querySelector('input')?.focus();
  return { close };
}

export function openRelativeMoveDialog(opts = {}) {
  const body = `${num('dx', '가로 거리 (mm)', 0, -100000, 100000, 'any')}${num('dy', '세로 거리 (mm)', 0, -100000, 100000, 'any')}
    <label class="check"><input type="checkbox" name="copy"> 복사해서 이동</label>`;
  return openDialog('relative', body, root => ({
    dx: clamp(root.querySelector('[name="dx"]'), 0),
    dy: clamp(root.querySelector('[name="dy"]'), 0),
    copy: root.querySelector('[name="copy"]').checked,
  }), opts);
}

export function openArrayDialog(kind, opts = {}) {
  // 경로 배열(§13.1): 경로는 캔버스에서 이미 그렸고 여기서는 간격·개수·회전만 묻는다.
  // 간격 기본값은 호출자가 넘기는 length(선택 아이템의 긴 변)이고, 개수 0은 "간격으로 채우기"다.
  if (kind === 'path') {
    const step = Math.max(MIN_SPACING, Math.round(Number(opts.length) || 600));
    const body = `${num('spacing', '간격 (mm)', step, MIN_SPACING, 100000, 'any')}${num('count', `개수 (0 = 간격으로 채우기, 최대 ${MAX_COUNT})`, 0, 0, MAX_COUNT)}
      <label class="check"><input type="checkbox" name="follow" checked> 경로 방향으로 회전</label>`;
    return openDialog('path', body, root => ({
      spacing: clamp(root.querySelector('[name="spacing"]'), step),
      count: clamp(root.querySelector('[name="count"]'), 0) || null,
      follow: root.querySelector('[name="follow"]').checked,
    }), opts);
  }
  if (kind === 'linear') {
    const body = `${num('dx', '가로 간격 (mm)', 600, -100000, 100000, 'any')}${num('dy', '세로 간격 (mm)', 0, -100000, 100000, 'any')}${num('count', '개수', 3, 1, 100)}`;
    return openDialog('linear', body, root => ({
      dx: clamp(root.querySelector('[name="dx"]'), 0),
      dy: clamp(root.querySelector('[name="dy"]'), 0),
      count: clamp(root.querySelector('[name="count"]'), 1),
    }), opts);
  }
  const body = `${num('angle', '각도 (°)', kind === 'rotate' ? 90 : 45, 1, 180, 'any')}${num('count', '개수', 3, 1, 100)}`;
  return openDialog(kind, body, root => ({
    angle: clamp(root.querySelector('[name="angle"]'), 45),
    count: clamp(root.querySelector('[name="count"]'), 1),
  }), opts);
}
