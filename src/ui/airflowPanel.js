// 레일 "풍량" 탭(명세 §11.3). 스토어를 구독해 설비·연결·설계값이 바뀌면 바로 다시 센다.
import { activeFloor } from '../state/schema.js';
import { airflowSummary, AIRFLOW_TOL } from '../vent/airflow.js';
import { esc } from '../util/html.js';

const cmh = n => Number(n || 0).toLocaleString('ko-KR');
const pct = v => (v === null ? '-' : `${v.toFixed(1)}%`);
const KIND_LABELS = { supply: '급기', exhaust: '배기', mixed: '급·배기' };
// 설계와 5% 이상 벌어진 칸만 붉게 표시한다(설계가 0이면 견줄 대상이 없다).
const warn = off => (off !== null && Math.abs(off) >= AIRFLOW_TOL ? ' class="warn"' : '');

export function createAirflowPanel(container, { store, ui }) {
  function render() {
    const s = airflowSummary(activeFloor(store.get()));
    const rows = s.rooms.filter(r => r.EA || r.SA || r.design.EA || r.design.SA);
    container.innerHTML = `
      <h3>실별 풍량 (CMH)</h3>
      <table class="est-table air-table"><thead><tr><th>공간</th><th>EA</th><th>SA</th><th>설계 EA</th><th>설계 SA</th><th>급기율</th></tr></thead>
      <tbody>${rows.length ? rows.map(r => `<tr data-room="${esc(r.roomId)}"><td>${esc(r.name)}</td><td${warn(r.offEA)}>${cmh(r.EA)}</td><td${warn(r.offSA)}>${cmh(r.SA)}</td><td>${cmh(r.design.EA)}</td><td>${cmh(r.design.SA)}</td><td>${pct(r.ratio)}</td></tr>`).join('')
        : '<tr><td colspan="6">배치된 설비가 없습니다.</td></tr>'}</tbody></table>
      <h3>계통별 풍량 (CMH)</h3>
      <table class="est-table air-table"><thead><tr><th>계통</th><th>구분</th><th>EA</th><th>SA</th><th>설비</th></tr></thead>
      <tbody>${s.systems.length ? s.systems.map(x => `<tr data-system="${esc(x.system)}"><td>${esc(x.system)}</td><td>${KIND_LABELS[x.kind]}</td><td>${cmh(x.EA)}</td><td>${cmh(x.SA)}</td><td>${x.itemIds.length}</td></tr>`).join('')
        : '<tr><td colspan="5">덕트 계통이 없습니다.</td></tr>'}</tbody></table>
      <p class="hint">합계 배기 ${cmh(s.totalEA)} · 급기 ${cmh(s.totalSA)} · 급기율 ${pct(s.ratio)}</p>
      <p class="hint">설계값과 5% 이상 차이 나는 칸은 붉게 표시됩니다. 공간 줄을 누르면 그 공간이 선택됩니다.</p>`;
  }
  const onClick = ev => {
    const tr = ev.target.closest('tr[data-room]');
    if (tr) ui.set({ selection: { type: 'room', id: tr.dataset.room } });
  };
  container.addEventListener('click', onClick);
  const unsub = store.subscribe(render);
  render();
  return { destroy() { unsub(); container.removeEventListener('click', onClick); container.innerHTML = ''; } };
}
