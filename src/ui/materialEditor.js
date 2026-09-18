// 마감재 편집기: 벽 하나의 한 면을 영역으로 나눠 여러 재질을 쓴다(오늘의집의 직선 L·사각형 F).
// 영역 좌표는 벽 왼쪽 끝(a)에서 u(mm), 바닥에서 z(mm)다. band는 벽 전체 폭이라 u를 무시한다.
import { MATERIALS, materialById } from '../materials/catalog.js';
import { drawPattern } from '../materials/pattern.js';
import { activeFloor, uid } from '../state/schema.js';
import { regionsOf, setWallRegions } from '../state/materialOps.js';
import { wallLength } from '../geom/walls.js';
import { esc } from '../util/html.js';

const SIDE_LABEL = { in: '내벽', out: '외벽' };

export function validateRegion(r, { len, height }) {
  if (r.kind !== 'band') {
    const u0 = Number(r.u0), u1 = Number(r.u1);
    if (!(u0 >= 0) || !(u1 > u0) || u1 > len + 0.001) return `가로 범위는 0 ~ ${Math.round(len)} mm 안에서 시작 < 끝이어야 합니다`;
  }
  const z0 = Number(r.z0), z1 = Number(r.z1);
  if (!(z0 >= 0) || !(z1 > z0) || z1 > height + 0.001) return `높이 범위는 0 ~ ${Math.round(height)} mm 안에서 시작 < 끝이어야 합니다`;
  return null;
}

const numCell = (name, value, min, max) => `<input type="number" name="${name}" value="${value}" min="${min}" max="${max}" step="any" aria-label="${name}">`;
const matOptions = id => MATERIALS.map(m => `<option value="${m.id}" ${m.id === id ? 'selected' : ''}>${esc(`${m.category} · ${m.name}`)}</option>`).join('');

export function openMaterialEditor({ store, wallId, side = 'in', onClose = () => {} }) {
  const existing = document.querySelector('.modal.mat-editor');
  if (existing) existing.remove();                       // 두 개를 띄우지 않는다
  const s = side === 'out' ? 'out' : 'in';
  const wall = () => activeFloor(store.get()).walls.find(w => w.id === wallId) ?? null;
  const w0 = wall();
  if (!w0) return { close: () => {} };
  const len = wallLength(w0), height = w0.height;
  // 편집 중 목록은 대화상자가 들고 있다([적용]에서 한 번에 저장한다).
  let rows = regionsOf(activeFloor(store.get()), { kind: 'wall', id: wallId, side: s }).map(r => ({ ...r, mat: { ...r.mat, offset: [...r.mat.offset] } }));

  const root = document.createElement('div');
  root.className = 'modal mat-editor';
  root.innerHTML = `<div class="modal-card">
    <header><h2>마감재 편집기 · ${SIDE_LABEL[s]}</h2><button type="button" name="close" aria-label="닫기">✕</button></header>
    <p class="hint">벽 길이 ${Math.round(len)} mm · 벽 높이 ${Math.round(height)} mm</p>
    <div class="toolbar">
      <button type="button" name="addBand">수평 띠 추가 <kbd>L</kbd></button>
      <button type="button" name="addRect">사각형 추가 <kbd>F</kbd></button>
    </div>
    <div data-part="rows"></div>
    <canvas data-part="preview" width="520" height="220"></canvas>
    <p class="error" data-part="error"></p>
    <div class="toolbar"><button type="button" name="apply" class="primary">적용</button></div>
  </div>`;
  document.body.appendChild(root);
  const part = n => root.querySelector(`[data-part="${n}"]`);

  function renderRows() {
    part('rows').innerHTML = rows.length ? rows.map((r, i) => `<div class="region-row" data-region="${i}">
      <select name="kind" aria-label="종류"><option value="band" ${r.kind === 'band' ? 'selected' : ''}>수평 띠</option><option value="rect" ${r.kind === 'rect' ? 'selected' : ''}>사각형</option></select>
      ${numCell('u0', r.u0, 0, Math.round(len))}${numCell('u1', r.u1, 0, Math.round(len))}
      ${numCell('z0', r.z0, 0, Math.round(height))}${numCell('z1', r.z1, 0, Math.round(height))}
      <select name="mat" aria-label="재질">${matOptions(r.mat.id)}</select>
      <button type="button" name="del" aria-label="영역 삭제">삭제</button>
    </div>`).join('') : '<p class="hint">영역이 없습니다. 수평 띠나 사각형을 추가하세요.</p>';
    for (const row of part('rows').querySelectorAll('[data-region]')) {
      const i = Number(row.dataset.region);
      // 수평 띠는 벽 전체 폭이라 가로 입력을 쓰지 않는다.
      const band = rows[i].kind === 'band';
      row.querySelector('[name="u0"]').disabled = band;
      row.querySelector('[name="u1"]').disabled = band;
    }
  }
  function renderPreview() {
    const c = part('preview');
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, c.width, c.height);
    const pad = 10, W = c.width - pad * 2, H = c.height - pad * 2;
    ctx.fillStyle = '#eef1f4'; ctx.fillRect(pad, pad, W, H);
    ctx.strokeStyle = '#3a4351'; ctx.strokeRect(pad, pad, W, H);
    for (const r of rows) {
      const m = materialById(r.mat.id);
      const u0 = r.kind === 'band' ? 0 : r.u0, u1 = r.kind === 'band' ? len : r.u1;
      const x = pad + (u0 / (len || 1)) * W, rw = ((u1 - u0) / (len || 1)) * W;
      const y = pad + H - (r.z1 / (height || 1)) * H, rh = ((r.z1 - r.z0) / (height || 1)) * H;
      if (!(rw > 0) || !(rh > 0)) continue;
      ctx.save(); ctx.beginPath(); ctx.rect(x, y, rw, rh); ctx.clip();
      ctx.translate(x, y); drawPattern(ctx, m ?? {}, Math.max(rw, rh)); ctx.restore();
      ctx.strokeStyle = '#8b5cf6'; ctx.strokeRect(x, y, rw, rh);
    }
  }
  const render = () => { renderRows(); renderPreview(); };

  const close = () => { root.remove(); onClose(); };
  const addRow = kind => {
    rows.push(kind === 'band'
      ? { id: uid('rg'), kind: 'band', u0: 0, u1: len, z0: 0, z1: Math.min(1200, height), mat: { id: MATERIALS[0].id, offset: [0, 0], angle: 0 } }
      : { id: uid('rg'), kind: 'rect', u0: 0, u1: Math.min(1000, len), z0: 0, z1: Math.min(1000, height), mat: { id: MATERIALS[0].id, offset: [0, 0], angle: 0 } });
    part('error').textContent = '';
    render();
  };
  root.addEventListener('click', ev => {
    const name = ev.target.name;
    if (name === 'close') { close(); return; }
    if (name === 'addBand') { addRow('band'); return; }
    if (name === 'addRect') { addRow('rect'); return; }
    if (name === 'del') { rows.splice(Number(ev.target.closest('[data-region]').dataset.region), 1); render(); return; }
    if (name !== 'apply') return;
    for (const r of rows) {
      const msg = validateRegion(r, { len, height });
      if (msg) { part('error').textContent = msg; return; }
    }
    setWallRegions(store, wallId, s, rows);
    close();
  });
  root.addEventListener('change', ev => {
    const row = ev.target.closest('[data-region]');
    if (!row) return;
    const r = rows[Number(row.dataset.region)];
    const name = ev.target.name;
    if (name === 'kind') { r.kind = ev.target.value === 'rect' ? 'rect' : 'band'; if (r.kind === 'band') { r.u0 = 0; r.u1 = len; } }
    else if (name === 'mat') r.mat = { id: ev.target.value, offset: [...r.mat.offset], angle: r.mat.angle };
    else if (['u0', 'u1', 'z0', 'z1'].includes(name)) { const v = Number(ev.target.value); if (Number.isFinite(v)) r[name] = v; }
    part('error').textContent = '';
    // 값 입력 중에는 행을 다시 그리지 않는다: renderRows()가 part('rows').innerHTML을 갈아 끼우면
    // 호출자가 잡아 둔 행 노드가 DOM에서 떨어져 이후 입력의 change가 root까지 올라오지 않는다(C-6).
    // 종류(수평 띠 ↔ 사각형)를 바꿀 때만 가로 입력의 disabled를 다시 계산해야 하므로 행을 그린다.
    if (name === 'kind') renderRows();
    renderPreview();
  });
  // Esc는 대화상자만 닫고 전역 단축키까지 내려가지 않는다(다른 대화상자와 같은 규칙).
  root.addEventListener('keydown', ev => { if (ev.key === 'Escape') { ev.stopPropagation(); close(); } });
  render();
  root.querySelector('[name="addBand"]').focus();
  return { close };
}
