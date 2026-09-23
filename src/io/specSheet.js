// 시방서: 인쇄용 HTML 한 장을 문자열로 만든다(순수 함수 — DOM도 파일 시스템도 건드리지 않는다).
// 편집기(도형·지시선)는 이번 범위 밖이라, 대신 도면 이미지 + 표(제품·공간·벽)를 정해진 서식으로 찍는다.
// **숨긴 것은 세지 않는다** — 풍량 집계(vent/airflow.js)·견적서(io/estimate.js)와 같은 규칙이다(§12.5에서 통일했다).
// 제품 목록과 풍량 표가 같은 규칙을 써야 한다: 한쪽만 숨김을 빼면 같은 도면에서 뽑은 두 산출물이
// 서로 다른 수량을 말한다(견적서 수량은 줄었는데 시방서 제품 목록만 그대로 남는 식이다).
import { productById, fmtSize } from '../products/catalog.js';
import { materialById } from '../materials/catalog.js';
import { wallLength } from '../geom/walls.js';
import { elevationFrame, planExtent } from '../geom/elevation.js';   // 입면 프레임의 정본(리뷰 M-7)
import { fmtLen, fmtArea } from '../util/units.js';
import { roomAirflow, systemAirflow, UNPLACED_ROOM } from '../vent/airflow.js';
import { ROOM_TYPES } from '../state/roomTypes.js';   // src/io/ → src/ui/ import는 계층 역전이다(아키텍처 §9)
import { assignmentOf, explicitAssignmentOf } from '../state/materialOps.js';   // io/ → state/는 열려 있는 방향이다(roomTypes와 같다)
import { esc } from '../util/html.js';
import { pageGroups, pageFootHtml, pageCss } from './specPages.js';

export const SPEC_SECTIONS = [['plan', '평면도'], ['elevations', '입면도'], ['products', '제품 목록'], ['rooms', '공간 목록'], ['walls', '벽 목록'], ['airflow', '풍량 집계'], ['notes', '비고']];
export const PAPER = { A4: [210, 297], A3: [297, 420] };
const ELEVATIONS = [['front', '정면도'], ['back', '배면도'], ['left', '좌측면도'], ['right', '우측면도'], ['top', '천장 평면도']];
const FLOW_LABELS = { supply: '급기', exhaust: '배기', mixed: '급·배기' };
// 풍량 두 표는 제목과 단위를 갖는다(§16.2 · 감사 §6): 앱의 풍량 패널이 쓰는 말과 같아야
// 한 도면에서 뽑은 두 화면이 서로 다른 이름으로 불리지 않는다(airflowPanel.js의 h3와 같다).
export const AIRFLOW_TITLES = { room: '실별 풍량', system: '계통별 풍량' };
export const CMH = '(CMH)';

const typeLabel = t => ROOM_TYPES.find(([v]) => v === t)?.[1] ?? '미지정';
// 인쇄물의 마감재 이름은 보고용 조회(assignmentOf)에서 온다 — 레거시 문자열·별칭까지 읽어 칸이
// `-`로 비지 않는다(감사 §38). 다만 그렇게 **유도된** 이름은 사용자가 고른 값이 아니다: 같은 면을
// 견적서는 0 m²로 세고 속성 패널은 '미지정'으로 그린다(리뷰 O-1). 그래서 유도값에는 꼬리를 붙여
// 읽는 사람이 "고른 것"과 "기본값"을 구분하게 한다(§17.4(1) 개정 — 두 문서가 같은 말을 한다).
export const DERIVED_MAT_TAG = '(기본값)';
const matName = a => (a?.id ? materialById(a.id)?.name ?? a.id : '-');
const matOf = (f, target) => {
  const name = matName(assignmentOf(f, target));
  return name === '-' || explicitAssignmentOf(f, target) ? name : `${name} ${DERIVED_MAT_TAG}`;
};
// rowAttr(i)는 그 행의 <tr> 속성이다(미배치 행의 경고색에만 쓴다).
const table = (head, rows, rowAttr = () => '') => `<table><thead><tr>${head.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead>
    <tbody>${rows.length ? rows.map((r, i) => `<tr${rowAttr(i)}>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('') : `<tr><td colspan="${head.length}">항목이 없습니다.</td></tr>`}</tbody></table>`;

export function specHtml({ project, floorIndex = 0, images = {}, options = {} }) {
  const { paper = 'A4', landscape = false, sections = {}, notes = '', sheet = {} } = options;
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
    esc(matOf(f, { kind: 'floor', id: r.id })), esc(r.hideCeiling ? '천장 감춤' : matOf(f, { kind: 'ceiling', id: r.id })),
  ]);
  const wallRows = (f.walls ?? []).map((w, i) => [
    `W${i + 1}`, len(wallLength(w)), len(w.thickness), len(w.height ?? f.height),
    esc(matOf(f, { kind: 'wall', id: w.id, side: 'in' })), esc(matOf(f, { kind: 'wall', id: w.id, side: 'out' })),
  ]);
  // 풍량 집계(명세 §11.3). 설비도 덕트도 없는 층에서는 빈 표가 되고, table()이 "항목이 없습니다"를 찍는다.
  const cmh = n => Number(n || 0).toLocaleString('ko-KR');
  const air = roomAirflow(f).filter(r => r.EA || r.SA || r.design.EA || r.design.SA);
  // 설계값이 없는 방은 '-'다(§17.12 이월 · 감사 §19): "값이 없다"와 "값이 0이다"는 다르다.
  const design = r => (r.design.EA > 0 || r.design.SA > 0);
  const airRows = air.map(r => [esc(r.name), cmh(r.EA), cmh(r.SA), design(r) ? cmh(r.design.EA) : '-', design(r) ? cmh(r.design.SA) : '-', r.ratio === null ? '-' : `${r.ratio.toFixed(1)}%`]);
  // '미배치'는 어느 방에도 들지 않은 설비다(roomId === null): 인쇄물에서도 눈에 걸려야 한다(§16.2).
  const airAttr = i => (air[i]?.roomId === null || air[i]?.name === UNPLACED_ROOM ? ' class="warn"' : '');
  const sysRows = systemAirflow(f).map(x => [esc(x.system), FLOW_LABELS[x.kind], cmh(x.EA), cmh(x.SA), x.itemIds.length]);
  // 캡션은 그림이 여럿인 절(입면도)에만 붙인다(§17.4(3) · 감사 §41): 절 제목이 곧 캡션인 평면도에는
  // 같은 말을 두 번 적지 않는다. 층고는 **그림 밖 캡션**에 적는다 — 렌더에 글자를 그리지 않는다.
  const img = (src, label, caption = '') => (src ? `<figure><img src="${esc(src)}" alt="${esc(label)}">${caption ? `<figcaption>${esc(caption)}</figcaption>` : ''}</figure>` : '');
  // 바닥선·천장선과 층고 치수선을 그림 **위에** 겹쳐 그린다(§17.4(2) 개정 · 리뷰 I-3 · 감사 §37):
  // 렌더에 글자를 굽지 않는 규칙은 그대로고, 선의 자리는 촬영 카메라와 같은 elevationFrame이 준다.
  // 비율을 넘기지 않는다: 그림의 비율이 곧 내용 비율이고(§17.4(2) 개정), specDialog가 비트맵 높이를
  // 같은 값으로 잡으므로 선과 사진이 같은 프레임을 본다.
  // 천장 평면도(top)는 위에서 내려다본 그림이라 바닥선·천장선이 없다.
  const fr = elevationFrame({ extent: planExtent(f.walls), height: f.height ?? 0 });
  const pct = n => `${(n * 100).toFixed(2)}%`;
  const guides = `<span class="gl" style="top:${pct(fr.ceilFrac)}"></span><span class="gl" style="top:${pct(fr.floorFrac)}"></span>`
    + `<span class="dim" style="top:${pct(fr.ceilFrac)};height:${pct(fr.floorFrac - fr.ceilFrac)}"><b>${len(f.height ?? 0)} ${esc(uLabel)}</b></span>`;
  const elevFig = (src, label, guide) => (src
    ? `<figure><div class="shot">${guide}<img src="${esc(src)}" alt="${esc(label)}"></div><figcaption>${esc(`${label} · 층고 ${fmtLen(f.height ?? 0, units)} ${uLabel}`)}</figcaption></figure>`
    : '');
  const elevFigs = ELEVATIONS.map(([k, l]) => elevFig(images[k], l, k === 'top' ? '' : guides)).join('');
  // 제목 블록(§16.11 · 감사 §8): 값이 없어도 칸은 남는다 — 인쇄물에 손으로 적을 자리다.
  const cell = (label, v) => `<td><b>${esc(label)}</b> ${esc(String(v ?? '').trim())}</td>`;
  const sheetHead = `<table class="title-block"><tbody><tr>
    ${cell('도면번호', sheet.number)}${cell('작성자', sheet.author)}${cell('현장', sheet.site)}
  </tr></tbody></table>`;

  // 절을 먼저 만들고 쪽 블록으로 묶는다(§17.11(6)). 제목·메타·제목 블록은 첫 블록 머리에 남는다.
  const parts = {
    plan: on('plan') && images.plan ? `<h2>평면도</h2><div class="figs">${img(images.plan, '평면도')}</div>` : '',
    elevations: on('elevations') && elevFigs ? `<h2>입면도</h2><div class="figs elev">${elevFigs}</div>` : '',
    products: on('products') ? `<h2>제품 목록</h2>${table(['품명', '코드', '규격(W×D×H, mm)', '수량'], productRows)}` : '',
    rooms: on('rooms') ? `<h2>공간 목록</h2>${table(['공간', '타입', '면적', `높이(${uLabel})`, '바닥 마감', '천장 마감'], roomRows)}` : '',
    walls: on('walls') ? `<h2>벽 목록</h2>${table(['기호', `길이(${uLabel})`, `두께(${uLabel})`, `높이(${uLabel})`, '내벽 마감', '외벽 마감'], wallRows)}` : '',
    airflow: on('airflow') ? `<h2>풍량 집계</h2>
      <h3>${AIRFLOW_TITLES.room} ${CMH}</h3>${table(['공간', 'EA', 'SA', '설계 EA', '설계 SA', '급기율'], airRows, airAttr)}
      <h3>${AIRFLOW_TITLES.system} ${CMH}</h3>${table(['계통', '구분', 'EA', 'SA', '설비 수'], sysRows)}` : '',
    notes: on('notes') && String(notes).trim() ? `<h2>비고</h2><pre class="notes">${esc(notes)}</pre>` : '',
  };
  const dateText = new Date().toLocaleDateString('ko-KR');
  const head = `<h1>${esc(project.name || '프로젝트')} 시방서</h1>
  <p class="meta">${esc(f.name || 'Floor 1')} · 층 높이 ${len(f.height ?? 0)} ${esc(uLabel)} · 작성 ${esc(dateText)}</p>
  ${sheetHead}`;
  const foot = { name: project.name || '프로젝트', date: dateText };
  const groups = pageGroups(parts);
  const body = (groups.length ? groups : [{ keys: [], html: '' }])
    .map((g, i) => `<section class="page">${i === 0 ? head : ''}${g.html}${pageFootHtml(i + 1, Math.max(1, groups.length), foot)}</section>`)
    .join('');

  return `<style>
    /* 쪽 번호는 본문 블록의 꼬리가 찍는다(§17.11(6) · 감사 §39): Chromium이 @page의 여백 상자를
       무시한다는 것이 page.pdf() 실측으로 확인됐다. 용지 크기·여백만 여기 남는다. */
    @page { size: ${size}; margin: 12mm; }
    ${pageCss((landscape ? pw : ph) - 24)}
    .title-block { width: 100%; border-collapse: collapse; margin: 4px 0 10px; font-size: 11px; }
    .title-block td { border: 1px solid #c8ccd2; padding: 3px 6px; }
    .title-block b { color: #5b6775; font-weight: 600; margin-right: 4px; }
    body { font-family: "IBM Plex Sans KR", sans-serif; color: #1b2430; }
    h1 { font-size: 20px; margin: 0 0 4px; }
    h2 { font-size: 14px; margin: 18px 0 6px; border-bottom: 1px solid #1b2430; page-break-after: avoid; }
    h3 { font-size: 12px; margin: 10px 0 4px; color: #5b6775; page-break-after: avoid; }
    tr.warn td { color: #b4231a; font-weight: 600; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    th, td { border: 1px solid #c8ccd2; padding: 4px 6px; text-align: left; }
    .figs { display: flex; flex-wrap: wrap; gap: 8px; }
    figure { margin: 0; flex: 1 1 45%; }
    /* 입면도 절(그림 여러 장)은 한 줄 한 장이다(§17.4(2)): 두 장씩 놓으면 본문 폭의 절반이 되어
       배율이 0.25로 떨어진다. */
    .figs.elev figure { flex: 1 1 100%; }
    figure img { width: 100%; border: 1px solid #c8ccd2; }
    /* 바닥선·천장선과 층고 치수선(§17.4(2) 개정 · 감사 §37): 그림 위에 겹치고 자리는 인라인 style이
       준다(elevationFrame). 배경색은 인쇄에서 꺼질 수 있으므로 선과 글자만으로 읽히게 둔다. */
    .shot { position: relative; line-height: 0; }
    .shot .gl { position: absolute; left: 0; right: 0; border-top: 1px dashed #5b6775; }
    .shot .dim { position: absolute; left: 8px; border-left: 1px solid #5b6775; }
    .shot .dim b { position: absolute; left: 4px; top: 50%; transform: translateY(-50%); font-size: 10px; font-weight: 600; color: #5b6775; line-height: 1; white-space: nowrap; }
    figcaption { font-size: 11px; color: #5b6775; }
    .meta { font-size: 12px; color: #5b6775; }
    pre.notes { white-space: pre-wrap; font: inherit; border: 1px solid #c8ccd2; padding: 8px; min-height: 40px; }
  </style>
  ${body}`;
}
