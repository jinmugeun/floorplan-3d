// 실시간 견적서: 스토어를 구독해 배치·마감재가 바뀌면 바로 다시 계산한다.
import { activeFloor } from '../state/schema.js';
import { estimateRows, estimateCsv } from '../io/estimate.js';
import { estimateLines, EST_TABLE_COLUMNS, PRICE_NOTE, EST_EMPTY } from '../io/estimateTable.js';
import { downloadText, filenameFor } from '../io/file.js';
import { printHtml } from '../io/printWindow.js';
import { toast } from './toast.js';
import { POPUP_BLOCKED, EST_EMPTY_TITLE } from './messages.js';
import { esc } from '../util/html.js';
import { focusTrap, reopenOpener } from './dialogBase.js';

const won = n => `${Number(n || 0).toLocaleString('ko-KR')}원`;
const qtyText = l => (l.unit === '개' ? String(l.qty) : l.qty.toLocaleString('ko-KR'));

// 열 정의는 io/estimateTable.js 한 곳이다(§16.2). 화면은 거기에 "길이" 칸을 더해 아홉 열이다.
function tableHtml(rows) {
  const body = estimateLines(rows).map(l => `<tr>${[
    l.kind, l.name, l.code, l.spec, l.lengthText, qtyText(l), l.unit, won(l.unitPrice), won(l.total),
  ].map(c => `<td>${esc(String(c))}</td>`).join('')}</tr>`).join('');
  return `<table class="est-table"><thead><tr>${EST_TABLE_COLUMNS.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead>
    <tbody>${body || `<tr><td colspan="${EST_TABLE_COLUMNS.length}">${EST_EMPTY}</td></tr>`}</tbody></table>`;
}

let current = null;                                        // 마지막으로 연 인스턴스: 다시 열 때 구독을 정리한다(누수 방지)

export function openEstimateDialog({ store, onClose = () => {} }) {
  const prev = document.activeElement;   // 이번 opener는 앞 인스턴스를 닫은 뒤 reopenOpener가 정한다
  current?.close();                                      // 두 개를 띄우지 않는다 — DOM뿐 아니라 구독도 정리한다
  const root = document.createElement('div');
  root.className = 'modal estimate';
  // 머리글 / 스크롤 본문 / 고정 푸터(§16.2): 1366×768에서 25행짜리 견적을 열어도 합계와 버튼이
  // 늘 화면에 남는다(감사 §1 — 예전에는 카드 전체가 스크롤이라 총액을 보려면 스크롤해야 했다).
  root.innerHTML = `<div class="modal-card">
    <header><h2>실시간 견적서</h2><button type="button" name="close" aria-label="닫기">✕</button></header>
    <div data-part="table"></div>
    <div class="est-foot">
      <p class="est-total" data-part="total"></p>
      <p class="est-note hint">${PRICE_NOTE}</p>
      <button type="button" name="csv">CSV 내려받기</button>
      <button type="button" name="print" class="primary">인쇄</button>
      <button type="button" name="close">닫기</button>
    </div>
  </div>`;
  document.body.appendChild(root);
  const part = n => root.querySelector(`[data-part="${n}"]`);
  let rows = { products: [], materials: [], ducts: [], total: 0 };
  function render() {
    rows = estimateRows(activeFloor(store.get()));
    part('table').innerHTML = tableHtml(rows);
    part('total').textContent = `합계 ${won(rows.total)}`;
    // 항목이 0이면 빈 CSV·빈 인쇄가 나가지 않게 막고 사유를 말한다(§16.2 · 감사 §5).
    const empty = estimateLines(rows).length === 0;
    for (const name of ['csv', 'print']) {
      const b = root.querySelector(`.est-foot [name="${name}"]`);
      b.disabled = empty;
      if (empty) b.title = EST_EMPTY_TITLE; else b.removeAttribute('title');
    }
  }
  const unsub = store.subscribe(render);
  const close = () => { unsub(); root.remove(); trap.destroy(); if (current === self) current = null; onClose(); };
  const self = { close };
  root.addEventListener('click', ev => {
    const name = ev.target.name;
    if (name === 'close') { close(); return; }
    if (name === 'csv') { downloadText(filenameFor(store.get()).replace(/\.json$/, '-견적서.csv'), estimateCsv(rows)); return; }
    if (name === 'print') {
      const ok = printHtml(`<h1>${esc(store.get().name)} 견적서</h1>${tableHtml(rows)}<p>합계 ${won(rows.total)}</p><p>${PRICE_NOTE}</p>
        <style>body{font-family:sans-serif;padding:24px}table{width:100%;border-collapse:collapse}th,td{border-bottom:1px solid #ccc;padding:6px;text-align:left}</style>`, { title: '견적서' });
      if (!ok) toast(POPUP_BLOCKED);
    }
  });
  root.addEventListener('keydown', ev => { if (ev.key === 'Escape') { ev.stopPropagation(); close(); } });
  render();
  const trap = focusTrap(root, { focus: '[name="close"]', opener: reopenOpener(prev) });   // §15.10
  current = self;
  return self;
}
