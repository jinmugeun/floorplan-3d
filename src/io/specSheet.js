// 시방서: 인쇄용 HTML 한 장을 문자열로 만든다(순수 함수 — DOM도 파일 시스템도 건드리지 않는다).
// 편집기(도형·지시선)는 이번 범위 밖이라, 대신 도면 이미지 + 표(제품·공간·벽)를 정해진 서식으로 찍는다.
// **숨긴 것은 세지 않는다** — 풍량 집계(vent/airflow.js)·견적서(io/estimate.js)와 같은 규칙이다(§12.5에서 통일했다).
// 제품 목록과 풍량 표가 같은 규칙을 써야 한다: 한쪽만 숨김을 빼면 같은 도면에서 뽑은 두 산출물이
// 서로 다른 수량을 말한다(견적서 수량은 줄었는데 시방서 제품 목록만 그대로 남는 식이다).
import { productById, fmtSize } from '../products/catalog.js';
import { materialById } from '../materials/catalog.js';
import { wallLength } from '../geom/walls.js';
import { fmtLen, fmtArea } from '../util/units.js';
import { roomAirflow, systemAirflow, UNPLACED_ROOM } from '../vent/airflow.js';
import { ROOM_TYPES } from '../state/roomTypes.js';   // src/io/ → src/ui/ import는 계층 역전이다(아키텍처 §9)
import { esc } from '../util/html.js';

export const SPEC_SECTIONS = [['plan', '평면도'], ['elevations', '입면도'], ['products', '제품 목록'], ['rooms', '공간 목록'], ['walls', '벽 목록'], ['airflow', '풍량 집계'], ['notes', '비고']];
export const PAPER = { A4: [210, 297], A3: [297, 420] };
const ELEVATIONS = [['front', '정면도'], ['back', '배면도'], ['left', '좌측면도'], ['right', '우측면도'], ['top', '천장 평면도']];
const FLOW_LABELS = { supply: '급기', exhaust: '배기', mixed: '급·배기' };
// 풍량 두 표는 제목과 단위를 갖는다(§16.2 · 감사 §6): 앱의 풍량 패널이 쓰는 말과 같아야
// 한 도면에서 뽑은 두 화면이 서로 다른 이름으로 불리지 않는다(airflowPanel.js의 h3와 같다).
export const AIRFLOW_TITLES = { room: '실별 풍량', system: '계통별 풍량' };
export const CMH = '(CMH)';

const typeLabel = t => ROOM_TYPES.find(([v]) => v === t)?.[1] ?? '미지정';
const matName = a => (a?.id ? materialById(a.id)?.name ?? a.id : '-');
// rowAttr(i)는 그 행의 <tr> 속성이다(미배치 행의 경고색에만 쓴다).
const table = (head, rows, rowAttr = () => '') => `<table><thead><tr>${head.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead>
    <tbody>${rows.length ? rows.map((r, i) => `<tr${rowAttr(i)}>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('') : `<tr><td colspan="${head.length}">항목이 없습니다.</td></tr>`}</tbody></table>`;

export function specHtml({ project, floorIndex = 0, images = {}, options = {} }) {
  const { paper = 'A4', landscape = false, sections = {}, notes = '' } = options;
  const [pw, ph] = PAPER[paper] ?? PAPER.A4;                       // 모르는 용지는 A4로 떨어뜨린다
  const size = landscape ? `${ph}mm ${pw}mm` : `${pw}mm ${ph}mm`;
  const f = project.floors?.[floorIndex] ?? project.floors?.[0] ?? { walls: [], rooms: [], items: [] };
  const on = k => sections[k] !== false;                           // 지정하지 않은 구역은 켜진 것으로 본다
  const units = project.units === 'ftin' ? 'ftin' : 'mm';
  const uLabel = units === 'ftin' ? 'ft·in' : 'mm';
  const len = v => esc(fmtLen(v, units));
  const pyeong = !!project.settings?.pyeong;

  // 같은 제품은 한 줄로 합치고 수량만 센다(개구부는 제품이 아니다. 숨긴 것도 빼면 아래 풍량 표와 수량이 맞는다).
  const productRows = [...(f.items ?? []).reduce((m, it) => {
    if (it.kind === 'opening' || it.hidden) return m;
    const p = productById(it.productId);
    const key = it.productId || it.id;
    const row = m.get(key) ?? { name: it.name || p?.name || '제품', code: it.code || p?.code || '', size: fmtSize(it.size ?? p?.size ?? [0, 0, 0]), qty: 0 };
    row.qty += 1;
    return m.set(key, row);
  }, new Map()).values()].sort((a, b) => a.name.localeCompare(b.name, 'ko'))
    .map(r => [esc(r.name), esc(r.code), esc(r.size), r.qty]);

  const roomRows = (f.rooms ?? []).map(r => [
    esc(r.name || '이름 없는 공간'), esc(typeLabel(r.type)), esc(fmtArea(r.area, { pyeong })), len(r.height),
    esc(matName(r.floorMat)), esc(r.hideCeiling ? '천장 감춤' : matName(r.ceilingMat)),
  ]);
  const wallRows = (f.walls ?? []).map((w, i) => [
    `W${i + 1}`, len(wallLength(w)), len(w.thickness), len(w.height ?? f.height),
    esc(matName(w.matIn)), esc(matName(w.matOut)),
  ]);
  // 풍량 집계(명세 §11.3). 설비도 덕트도 없는 층에서는 빈 표가 되고, table()이 "항목이 없습니다"를 찍는다.
  const cmh = n => Number(n || 0).toLocaleString('ko-KR');
  const air = roomAirflow(f).filter(r => r.EA || r.SA || r.design.EA || r.design.SA);
  const airRows = air.map(r => [esc(r.name), cmh(r.EA), cmh(r.SA), cmh(r.design.EA), cmh(r.design.SA), r.ratio === null ? '-' : `${r.ratio.toFixed(1)}%`]);
  // '미배치'는 어느 방에도 들지 않은 설비다(roomId === null): 인쇄물에서도 눈에 걸려야 한다(§16.2).
  const airAttr = i => (air[i]?.roomId === null || air[i]?.name === UNPLACED_ROOM ? ' class="warn"' : '');
  const sysRows = systemAirflow(f).map(x => [esc(x.system), FLOW_LABELS[x.kind], cmh(x.EA), cmh(x.SA), x.itemIds.length]);
  const img = (src, label) => (src ? `<figure><img src="${esc(src)}" alt="${esc(label)}"><figcaption>${esc(label)}</figcaption></figure>` : '');
  const elevFigs = ELEVATIONS.map(([k, l]) => img(images[k], l)).join('');
  const noImage = '<p class="meta">이미지가 없습니다.</p>';

  return `<style>
    @page { size: ${size}; margin: 12mm; }
    body { font-family: "IBM Plex Sans KR", sans-serif; color: #1b2430; }
    h1 { font-size: 20px; margin: 0 0 4px; }
    h2 { font-size: 14px; margin: 18px 0 6px; border-bottom: 1px solid #1b2430; page-break-after: avoid; }
    h3 { font-size: 12px; margin: 10px 0 4px; color: #5b6775; page-break-after: avoid; }
    tr.warn td { color: #b4231a; font-weight: 600; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    th, td { border: 1px solid #c8ccd2; padding: 4px 6px; text-align: left; }
    .figs { display: flex; flex-wrap: wrap; gap: 8px; }
    figure { margin: 0; flex: 1 1 45%; }
    figure img { width: 100%; border: 1px solid #c8ccd2; }
    figcaption { font-size: 11px; color: #5b6775; }
    .meta { font-size: 12px; color: #5b6775; }
    pre.notes { white-space: pre-wrap; font: inherit; border: 1px solid #c8ccd2; padding: 8px; min-height: 40px; }
  </style>
  <h1>${esc(project.name || '프로젝트')} 시방서</h1>
  <p class="meta">${esc(f.name || 'Floor 1')} · 층 높이 ${len(f.height ?? 0)} ${esc(uLabel)} · 작성 ${esc(new Date().toLocaleDateString('ko-KR'))}</p>
  ${on('plan') ? `<h2>평면도</h2><div class="figs">${img(images.plan, '평면도') || noImage}</div>` : ''}
  ${on('elevations') ? `<h2>입면도</h2><div class="figs">${elevFigs || noImage}</div>` : ''}
  ${on('products') ? `<h2>제품 목록</h2>${table(['품명', '코드', '규격(W×D×H, mm)', '수량'], productRows)}` : ''}
  ${on('rooms') ? `<h2>공간 목록</h2>${table(['공간', '타입', '면적', `높이(${uLabel})`, '바닥 마감', '천장 마감'], roomRows)}` : ''}
  ${on('walls') ? `<h2>벽 목록</h2>${table(['기호', `길이(${uLabel})`, `두께(${uLabel})`, `높이(${uLabel})`, '내벽 마감', '외벽 마감'], wallRows)}` : ''}
  ${on('airflow') ? `<h2>풍량 집계</h2>
    <h3>${AIRFLOW_TITLES.room} ${CMH}</h3>${table(['공간', 'EA', 'SA', '설계 EA', '설계 SA', '급기율'], airRows, airAttr)}
    <h3>${AIRFLOW_TITLES.system} ${CMH}</h3>${table(['계통', '구분', 'EA', 'SA', '설비 수'], sysRows)}` : ''}
  ${on('notes') ? `<h2>비고</h2><pre class="notes">${esc(notes)}</pre>` : ''}`;
}
