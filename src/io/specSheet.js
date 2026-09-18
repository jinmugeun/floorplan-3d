// 시방서: 인쇄용 HTML 한 장을 문자열로 만든다(순수 함수 — DOM도 파일 시스템도 건드리지 않는다).
// 편집기(도형·지시선)는 이번 범위 밖이라, 대신 도면 이미지 + 표(제품·공간·벽)를 정해진 서식으로 찍는다.
import { productById, fmtSize } from '../products/catalog.js';
import { materialById } from '../materials/catalog.js';
import { wallLength } from '../geom/walls.js';
import { fmtLen, fmtArea } from '../util/units.js';
import { ROOM_TYPES } from '../state/roomTypes.js';   // src/io/ → src/ui/ import는 계층 역전이다(아키텍처 §9)
import { esc } from '../util/html.js';

export const SPEC_SECTIONS = [['plan', '평면도'], ['elevations', '입면도'], ['products', '제품 목록'], ['rooms', '공간 목록'], ['walls', '벽 목록'], ['notes', '비고']];
export const PAPER = { A4: [210, 297], A3: [297, 420] };
const ELEVATIONS = [['front', '정면도'], ['back', '배면도'], ['left', '좌측면도'], ['right', '우측면도'], ['top', '천장 평면도']];

const typeLabel = t => ROOM_TYPES.find(([v]) => v === t)?.[1] ?? '미지정';
const matName = a => (a?.id ? materialById(a.id)?.name ?? a.id : '-');
const table = (head, rows) => `<table><thead><tr>${head.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead>
    <tbody>${rows.length ? rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('') : `<tr><td colspan="${head.length}">항목이 없습니다.</td></tr>`}</tbody></table>`;

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

  // 같은 제품은 한 줄로 합치고 수량만 센다(개구부는 제품이 아니다).
  const productRows = [...(f.items ?? []).reduce((m, it) => {
    if (it.kind === 'opening') return m;
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
  const img = (src, label) => (src ? `<figure><img src="${esc(src)}" alt="${esc(label)}"><figcaption>${esc(label)}</figcaption></figure>` : '');
  const elevFigs = ELEVATIONS.map(([k, l]) => img(images[k], l)).join('');
  const noImage = '<p class="meta">이미지가 없습니다.</p>';

  return `<style>
    @page { size: ${size}; margin: 12mm; }
    body { font-family: "IBM Plex Sans KR", sans-serif; color: #1b2430; }
    h1 { font-size: 20px; margin: 0 0 4px; }
    h2 { font-size: 14px; margin: 18px 0 6px; border-bottom: 1px solid #1b2430; page-break-after: avoid; }
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
  ${on('products') ? `<h2>제품 목록</h2>${table(['품명', '코드', '규격(W×D×H)', '수량'], productRows)}` : ''}
  ${on('rooms') ? `<h2>공간 목록</h2>${table(['공간', '타입', '면적', `높이(${uLabel})`, '바닥 마감', '천장 마감'], roomRows)}` : ''}
  ${on('walls') ? `<h2>벽 목록</h2>${table(['기호', `길이(${uLabel})`, `두께(${uLabel})`, `높이(${uLabel})`, '내벽 마감', '외벽 마감'], wallRows)}` : ''}
  ${on('notes') ? `<h2>비고</h2><pre class="notes">${esc(notes)}</pre>` : ''}`;
}
