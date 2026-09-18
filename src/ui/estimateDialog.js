// 실시간 견적서: 스토어를 구독해 배치·마감재가 바뀌면 바로 다시 계산한다.
import { activeFloor } from '../state/schema.js';
import { estimateRows, estimateCsv } from '../io/estimate.js';
import { downloadText, filenameFor } from '../io/file.js';
import { printHtml } from '../io/printWindow.js';
import { esc } from '../util/html.js';

const won = n => `${Number(n || 0).toLocaleString('ko-KR')}원`;

function tableHtml(rows) {
  const body = [
    ...rows.products.map(r => `<tr><td>제품</td><td>${esc(r.name)}</td><td>${esc(r.code)}</td><td>${esc(r.size)}</td><td>${r.qty}</td><td>${won(r.unitPrice)}</td><td>${won(r.total)}</td></tr>`),
    ...rows.materials.map(r => `<tr><td>마감재</td><td>${esc(r.name)}</td><td>${esc(r.id)}</td><td>${r.areaM2} m²</td><td>1</td><td>${won(r.unitPrice)}/m²</td><td>${won(r.total)}</td></tr>`),
  ].join('');
  return `<table class="est-table"><thead><tr><th>구분</th><th>이름</th><th>코드</th><th>규격</th><th>수량</th><th>단가</th><th>금액</th></tr></thead>
    <tbody>${body || '<tr><td colspan="7">배치된 제품과 마감재가 없습니다.</td></tr>'}</tbody></table>`;
}

export function openEstimateDialog({ store, onClose = () => {} }) {
  const existing = document.querySelector('.modal.estimate');
  if (existing) existing.remove();                       // 두 개를 띄우지 않는다
  const root = document.createElement('div');
  root.className = 'modal estimate';
  root.innerHTML = `<div class="modal-card">
    <header><h2>실시간 견적서</h2><button type="button" name="close" aria-label="닫기">✕</button></header>
    <div data-part="table"></div>
    <p class="est-total" data-part="total"></p>
    <div class="toolbar"><button type="button" name="csv">CSV 내려받기</button><button type="button" name="print" class="primary">인쇄</button></div>
  </div>`;
  document.body.appendChild(root);
  const part = n => root.querySelector(`[data-part="${n}"]`);
  let rows = { products: [], materials: [], total: 0 };
  function render() {
    rows = estimateRows(activeFloor(store.get()));
    part('table').innerHTML = tableHtml(rows);
    part('total').textContent = `합계 ${won(rows.total)}`;
  }
  const unsub = store.subscribe(render);
  const close = () => { unsub(); root.remove(); onClose(); };
  root.addEventListener('click', ev => {
    const name = ev.target.name;
    if (name === 'close') { close(); return; }
    if (name === 'csv') { downloadText(filenameFor(store.get()).replace(/\.json$/, '-견적서.csv'), estimateCsv(rows)); return; }
    if (name === 'print') {
      const ok = printHtml(`<h1>${esc(store.get().name)} 견적서</h1>${tableHtml(rows)}<p>합계 ${won(rows.total)}</p>
        <style>body{font-family:sans-serif;padding:24px}table{width:100%;border-collapse:collapse}th,td{border-bottom:1px solid #ccc;padding:6px;text-align:left}</style>`, { title: '견적서' });
      if (!ok) root.querySelector('[name="print"]').textContent = '팝업이 막혀 인쇄할 수 없습니다';
    }
  });
  root.addEventListener('keydown', ev => { if (ev.key === 'Escape') { ev.stopPropagation(); close(); } });
  render();
  root.querySelector('[name="close"]').focus();
  return { close };
}
