// 레일 "풍량" 탭(기능 명세 §11.3 / 아키텍처 §11.7). 스토어를 구독해 설비·연결·설계값이 바뀌면 바로 다시 센다.
// 패널 폭이 240 px뿐이라 실별 표는 4열(공간·EA·SA·급기율)이고 설계값은 실측값 아래 작은 글씨로 접어 넣는다.
import { activeFloor } from '../state/schema.js';
import { airflowSummary, AIRFLOW_TOL } from '../vent/airflow.js';
import { esc } from '../util/html.js';
// 표 제목과 단위는 시방서와 같은 한 곳에서 온다(§16.8 · 리뷰 M-1): specSheet.js의 주석이 이미
// "앱의 풍량 패널이 쓰는 말과 같아야 한다"고 약속하는데 여기는 같은 문자열을 두 벌 들고 있었다.
// ui → io는 estimateDialog.js의 선례가 있다.
import { AIRFLOW_TITLES, CMH } from '../io/specSheet.js';

const cmh = n => Number(n || 0).toLocaleString('ko-KR');
const pct = v => (v === null ? '-' : `${v.toFixed(1)}%`);
const KIND_LABELS = { supply: '급기', exhaust: '배기', mixed: '급·배기' };
// 설계와 5% 이상 벌어진 칸만 붉게 표시한다(설계가 0이면 견줄 대상이 없다).
const warn = off => (off !== null && Math.abs(off) >= AIRFLOW_TOL ? ' class="warn"' : '');
// 실측값 + 그 아래 설계값. '미배치' 줄(roomId null)과 **설계값을 넣지 않은 방**은 '-'로 찍는다
// (§17.12 이월 · 감사 §19: "값이 없다"와 "값이 0이다"는 다르다 — 견줄 값이 없으면 off도 null이라
// warn이 붙지 않는다).
const cell = (now, design, off, hasDesign) => `<td${warn(off)}>${cmh(now)}<br><small class="muted">설계 ${hasDesign ? cmh(design) : '-'}</small></td>`;

export function createAirflowPanel(container, { store, ui }) {
  function render() {
    const s = airflowSummary(activeFloor(store.get()));
    const rows = s.rooms.filter(r => r.EA || r.SA || r.design.EA || r.design.SA);
    container.innerHTML = `
      <h3>${AIRFLOW_TITLES.room} ${CMH}</h3>
      <div class="air-wrap"><table class="est-table air-table"><thead><tr><th>공간</th><th>EA</th><th>SA</th><th>급기율</th></tr></thead>
      <tbody>${rows.length ? rows.map(r => `<tr${r.roomId === null ? '' : ` data-room="${esc(r.roomId)}"`}><td>${esc(r.name)}</td>${cell(r.EA, r.design.EA, r.offEA, r.roomId !== null && (r.design.EA > 0 || r.design.SA > 0))}${cell(r.SA, r.design.SA, r.offSA, r.roomId !== null && (r.design.EA > 0 || r.design.SA > 0))}<td>${pct(r.ratio)}</td></tr>`).join('')
        : '<tr><td colspan="4">배치된 설비가 없습니다.</td></tr>'}</tbody></table></div>
      <h3>${AIRFLOW_TITLES.system} ${CMH}</h3>
      <div class="air-wrap"><table class="est-table air-table"><thead><tr><th>계통</th><th>구분</th><th>EA</th><th>SA</th><th>설비</th></tr></thead>
      <tbody>${s.systems.length ? s.systems.map(x => `<tr data-system="${esc(x.system)}"><td>${esc(x.system)}</td><td>${KIND_LABELS[x.kind]}</td><td>${cmh(x.EA)}</td><td>${cmh(x.SA)}</td><td>${x.itemIds.length}</td></tr>`).join('')
        : '<tr><td colspan="5">덕트 계통이 없습니다.</td></tr>'}</tbody></table></div>
      <p class="hint">합계 배기 ${cmh(s.totalEA)} · 급기 ${cmh(s.totalSA)} · 급기율 ${pct(s.ratio)}</p>
      <p class="hint">설계값과 5% 이상 차이 나는 칸은 붉게 표시됩니다. 공간 줄을 누르면 그 공간이 선택됩니다. 숨긴 설비와 어느 공간에도 들지 않는 설비('미배치')는 실별 합계에서 구분됩니다.</p>`;
  }
  const onClick = ev => {
    const tr = ev.target.closest('tr[data-room]');
    if (tr) ui.set({ selection: { type: 'room', id: tr.dataset.room } });
  };
  container.addEventListener('click', onClick);
  const unsub = store.subscribe(render);
  render();
  // 계통 줄의 data-system은 Task 12(계통 선택·시방서 연동)가 쓸 자리다 — 지금은 클릭 대상이 아니다.
  return { destroy() { unsub(); container.removeEventListener('click', onClick); container.innerHTML = ''; } };
}
