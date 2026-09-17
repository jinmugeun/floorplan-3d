import { toast } from './toast.js';

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const LABELS = { reference: '기준선', thickness: '두께 (mm)', snap: '스냅 모드', ortho: '직교 모드', direction: '방향' };
const REF = [['center', '중심선'], ['inner', '내벽선'], ['outer', '외벽선']];

export function createShell(root, { store, ui }) {
  root.innerHTML = `
  <div id="layout">
    <header id="topbar">
      <div class="group"><button id="btnUndo" aria-label="실행 취소">↶</button><button id="btnRedo" aria-label="다시 실행">↷</button></div>
      <div class="group"><input id="projectName" aria-label="프로젝트 이름" value="${esc(store.get().name)}"><span id="savedAt" class="muted">저장 이력 없음</span></div>
      <div class="group"><button id="btnCapture">캡처</button><button id="btnLoad">불러오기</button><button id="btnSave" class="primary">저장</button></div>
    </header>
    <nav id="rail" aria-label="작업 영역">
      <button data-panel="draw" class="on"><span>도면 그리기</span></button>
      <button data-panel="background"><span>배경 도면</span></button>
      <button data-panel="layers"><span>레이어</span></button>
    </nav>
    <aside id="panel">
      <section data-panel="draw">
        <h3>방 만들기</h3>
        <button data-tool="wall">벽 그리기 <kbd>L</kbd></button>
        <button data-tool="room">방 그리기 <kbd>F</kbd></button>
        <button data-tool="delete">삭제 <kbd>D</kbd></button>
        <h3>도면 반전 / 회전</h3>
        <div class="row"><button data-action="flipH">좌우 반전</button><button data-action="flipV">상하 반전</button><button data-action="rotL">↺ 90°</button><button data-action="rotR">↻ 90°</button></div>
        <h3>보조선 그리기</h3>
        <button data-tool="guide">보조선 <kbd>E</kbd></button>
        <button data-tool="measure">측정 <kbd>M</kbd></button>
        <h3>일반</h3>
        <button data-tool="select">선택 <kbd>Esc</kbd></button>
      </section>
      <section data-panel="background" hidden>
        <h3>배경 도면</h3>
        <button data-action="background">도면 이미지 업로드 <kbd>B</kbd></button>
        <p class="hint">사진이나 스캔을 올리고 모서리를 찍어 펴고, 두 점으로 축척을 잡습니다.</p>
      </section>
      <section data-panel="layers" hidden><h3>레이어</h3><ul id="layerList"></ul></section>
    </aside>
    <main id="canvasWrap">
      <canvas id="c2d"></canvas>
      <div id="c3d" hidden></div>
      <div id="optionBar" hidden></div>
      <div id="banner" hidden></div>
    </main>
    <aside id="right"><div id="minimap"><div class="mm-label">미니맵</div><canvas></canvas></div><div id="props"></div></aside>
    <footer id="bottombar">
      <div class="seg"><button data-mode="2d" class="on">2D</button><button data-mode="plan">평면 <kbd>2</kbd></button><button data-mode="iso">3D <kbd>3</kbd></button><button data-mode="fp">1인칭 <kbd>4</kbd></button></div>
      <div class="seg"><label><input type="checkbox" data-view="grid" checked> 격자</label><label><input type="checkbox" data-view="labels" checked> 라벨</label><label><input type="checkbox" data-view="background" checked> 배경</label><label><input type="checkbox" data-view="cutaway" checked> 벽 컷어웨이</label></div>
      <div class="seg"><button id="btnFit">화면 맞추기</button><span class="muted">mm</span></div>
    </footer>
  </div>`;
  const q = s => root.querySelector(s);
  const els = { canvas2d: q('#c2d'), view3d: q('#c3d'), props: q('#props'), minimap: q('#minimap canvas'), optionBar: q('#optionBar'), toolPanel: q('#panel'), topbar: q('#topbar'), banner: q('#banner'), layerList: q('#layerList') };

  root.querySelectorAll('#rail button').forEach(b => b.addEventListener('click', () => {
    root.querySelectorAll('#rail button').forEach(x => x.classList.toggle('on', x === b));
    root.querySelectorAll('#panel section').forEach(s => s.hidden = s.dataset.panel !== b.dataset.panel);
  }));
  root.querySelectorAll('[data-view]').forEach(cb => cb.addEventListener('change', () => store.dispatch(d => { d.view[cb.dataset.view] = cb.checked; }, { record: false })));

  let currentTool = null;
  function setOptionBar(tool) {
    currentTool = tool;
    const hasOpts = tool && tool.opts && Object.keys(tool.opts).length;
    const hint = tool?.hint;
    if (!hasOpts && !hint) { els.optionBar.hidden = true; els.optionBar.innerHTML = ''; return; }
    els.optionBar.hidden = false;
    els.optionBar.innerHTML = hasOpts ? Object.entries(tool.opts).map(([k, v]) => {
      const label = LABELS[k] ?? k;
      if (typeof v === 'boolean') return `<label><input type="checkbox" name="${k}" ${v ? 'checked' : ''}> ${label}</label>`;
      if (typeof v === 'number') return `<label>${label} <input type="number" name="${k}" value="${v}" step="1"></label>`;
      if (k === 'reference') return `<label>${label} <select name="${k}">${REF.map(([val, l]) => `<option value="${val}" ${v === val ? 'selected' : ''}>${l}</option>`).join('')}</select></label>`;
      if (k === 'direction') return `<label>${label} <select name="${k}"><option value="v" ${v === 'v' ? 'selected' : ''}>세로</option><option value="h" ${v === 'h' ? 'selected' : ''}>가로</option></select></label>`;
      return `<label>${label} <input type="text" name="${k}" value="${v}"></label>`;
    }).join('') : '';
    if (hint) { const span = document.createElement('span'); span.className = 'hint'; span.textContent = hint; els.optionBar.appendChild(span); }
  }
  els.optionBar.addEventListener('change', ev => {
    const el = ev.target, k = el.name; if (!currentTool || !k) return;
    currentTool.opts[k] = el.type === 'checkbox' ? el.checked : el.type === 'number' ? Number(el.value) : el.value;
  });

  ui.subscribe(s => {
    root.querySelectorAll('[data-tool]').forEach(b => b.classList.toggle('on', b.dataset.tool === s.tool));
    root.querySelectorAll('[data-mode]').forEach(b => b.classList.toggle('on', b.dataset.mode === s.mode));
    els.canvas2d.hidden = s.mode !== '2d'; els.view3d.hidden = s.mode === '2d';
    els.banner.hidden = !s.fpPick; if (s.fpPick) els.banner.textContent = '👆 1인칭으로 확인할 위치를 클릭해주세요. [ESC]로 취소';
  });
  const syncTop = s => {
    q('#btnUndo').disabled = !store.canUndo(); q('#btnRedo').disabled = !store.canRedo();
    if (q('#projectName').value !== s.name) q('#projectName').value = s.name;
    root.querySelectorAll('[data-view]').forEach(cb => { cb.checked = !!s.view[cb.dataset.view]; }); // 불러온 프로젝트의 보기 설정을 반영한다
  };
  store.subscribe(syncTop); syncTop(store.get()); // 시작 시에도 버튼 상태를 맞춘다
  return { els, setOptionBar, toast };
}
