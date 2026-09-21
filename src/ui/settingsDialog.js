import { esc } from '../util/html.js';
import { toast } from './toast.js';
import { downloadText } from '../io/file.js';
import { setTable } from './keymap.js';
import { loadOverrides, saveOverrides, effectiveKeymap, buildTable, exportJson, importJson, reset, keyLabel, conflictAction, labelOf } from './keyBindings.js';
import { openOnboarding } from './onboarding.js';

// 키 칸: action이 있는 행만 다시 지정할 수 있다(마우스 조작·1인칭 이동은 표시 전용).
function keymapRows(keymap) {
  const groups = [...new Set(keymap.map(e => e.group))];
  return groups.map(g => keymap.filter(e => e.group === g).map((e, i) => {
    const keys = e.keys.map(k => `<kbd>${esc(k)}</kbd>`).join(' ');
    const cell = e.action ? `<button type="button" class="key-cell" data-bind="${esc(e.action)}">${keys}</button>` : keys;
    return `<tr><th scope="row">${i === 0 ? esc(g) : ''}</th><td>${esc(e.label)}</td><td>${cell}</td></tr>`;
  }).join('')).join('');
}

export function openSettingsDialog({ store, tab = 'general', onClose = () => {} }) {
  const existing = document.querySelector('.modal.settings');
  if (existing) {   // 두 번 열지 않는다
    existing.querySelector(`[data-tab="${tab === 'keys' ? 'keys' : 'general'}"]`)?.click();   // 열려 있으면 탭만 바꾼다
    existing.querySelector('[name="close"]')?.focus();
    return { close: () => existing.remove() };
  }
  const s = store.get().settings;
  const root = document.createElement('div');
  root.className = 'modal settings';
  root.innerHTML = `<div class="modal-card">
    <header><h2>설정</h2><button type="button" name="close" aria-label="닫기">✕</button></header>
    <div class="tabs"><button type="button" data-tab="general" class="on">일반</button><button type="button" data-tab="keys">단축키</button></div>
    <section id="tabGeneral">
      <label class="field"><span>언어</span><select name="language" disabled><option value="ko" selected>한국어</option></select></label>
      <label class="field"><span>배경</span><input type="color" name="background" value="${esc(s.background)}"></label>
      <label class="check"><input type="checkbox" name="pyeong" ${s.pyeong ? 'checked' : ''}> 평 면적 표기</label>
      <label class="check"><input type="checkbox" name="showUnit" ${s.showUnit ? 'checked' : ''}> 치수 단위 표시</label>
      <p class="hint">자동 저장: 5분 간격으로 브라우저에 저장됩니다.</p>
      <button type="button" name="replayOnboarding">시작 안내 다시 보기</button>
    </section>
    <section id="tabKeys" hidden>
      <p class="hint">키 칸을 누르고 새 키를 누르세요. [Esc]로 취소합니다. 키를 누르면 그 동작의 모든 키가 새 키 하나로 바뀝니다.</p>
      <div class="toolbar"><button type="button" name="keyExport">내보내기</button><button type="button" name="keyImport">업로드</button><button type="button" name="keyReset">초기화</button></div>
      <table id="keymapTable"><thead><tr><th>구분</th><th>기능</th><th>키</th></tr></thead><tbody></tbody></table>
    </section>
  </div>`;
  document.body.appendChild(root);
  const q = sel => root.querySelector(sel);
  const renderKeys = () => { q('#keymapTable tbody').innerHTML = keymapRows(effectiveKeymap()); };

  let waiting = null;   // 재지정 대기 중인 action
  function stopWaiting() { waiting = null; document.removeEventListener('keydown', onBind, true); renderKeys(); }
  function onBind(ev) {
    if (!waiting) return;
    ev.preventDefault(); ev.stopPropagation();
    if (ev.key === 'Escape') { stopWaiting(); return; }
    if (['Shift', 'Control', 'Alt', 'Meta'].includes(ev.key)) return;   // 조합키만 누른 상태는 기다린다
    const label = keyLabel(ev);
    const km = effectiveKeymap();
    const clash = conflictAction(km, label, waiting);
    if (clash) { toast(`[${label}]은 이미 "${labelOf(clash)}"이(가) 쓰고 있습니다`); stopWaiting(); return; }
    // 삭제(Delete/Backspace)처럼 키가 두 개 이상인 동작도 여기서 배열 전체가 [label] 하나로 바뀐다(추가가 아니라 교체).
    saveOverrides({ ...loadOverrides(), [waiting]: [label] });
    setTable(buildTable(effectiveKeymap()));
    stopWaiting();
  }
  const close = () => { if (waiting) stopWaiting(); root.remove(); onClose(); };
  q('[name="close"]').onclick = close;
  // Esc는 대화상자만 닫고 전역 단축키(도구 전환 등)까지 내려가지 않는다.
  root.addEventListener('keydown', ev => { if (ev.key === 'Escape' && !waiting) { ev.stopPropagation(); close(); } });
  q('[name="close"]').focus();
  const selectTab = name => {
    root.querySelectorAll('[data-tab]').forEach(x => x.classList.toggle('on', x.dataset.tab === name));
    q('#tabGeneral').hidden = name !== 'general';
    q('#tabKeys').hidden = name !== 'keys';
  };
  root.querySelectorAll('[data-tab]').forEach(b => b.addEventListener('click', () => selectTab(b.dataset.tab)));
  root.addEventListener('click', ev => {
    const cell = ev.target.closest('[data-bind]');
    if (cell) {
      if (waiting) stopWaiting();
      waiting = cell.dataset.bind;
      cell.textContent = '키를 누르세요';
      document.addEventListener('keydown', onBind, true);
      return;
    }
    const name = ev.target.name;
    if (name === 'replayOnboarding') { close(); openOnboarding({ store }); return; }
    if (name === 'keyExport') { downloadText('kvp-keymap.json', exportJson()); return; }
    if (name === 'keyReset') { reset(); setTable(buildTable(effectiveKeymap())); renderKeys(); toast('단축키를 초기화했습니다'); return; }
    if (name === 'keyImport') {
      const input = document.createElement('input');
      input.type = 'file'; input.accept = '.json,application/json';
      input.onchange = async () => {
        const file = input.files?.[0];
        if (!file) return;
        try { importJson(await file.text()); setTable(buildTable(effectiveKeymap())); renderKeys(); toast('단축키를 불러왔습니다'); }
        catch (e) { toast(e.message); }
      };
      input.click();
    }
  });
  // 설정은 프로젝트에 저장하지만 되돌릴 단계는 만들지 않는다.
  root.addEventListener('change', ev => {
    const el = ev.target, name = el.name;
    if (!['pyeong', 'showUnit', 'background'].includes(name)) return;
    store.dispatch(d => { d.settings[name] = el.type === 'checkbox' ? el.checked : el.value; }, { record: false });
  });
  renderKeys();
  selectTab(tab === 'keys' ? 'keys' : 'general');
  return { close };
}
