// 마감재 편집기: 벽 하나의 한 면을 영역으로 나눠 여러 재질을 쓴다(오늘의집의 직선 L·사각형 F).
// 영역 좌표는 벽 왼쪽 끝(a)에서 u(mm), 바닥에서 z(mm)다. band는 벽 전체 폭이라 u를 무시한다.
import { MATERIALS, materialById } from '../materials/catalog.js';
import { drawPattern } from '../materials/pattern.js';
import { activeFloor, uid, MAT_RANGE } from '../state/schema.js';
import { regionsOf, setWallRegions } from '../state/materialOps.js';
import { wallLength } from '../geom/walls.js';
import { esc } from '../util/html.js';

const SIDE_LABEL = { in: '내벽', out: '외벽' };

export function validateRegion(r, { len, height }) {
  if (r.kind !== 'band') {
    const u0 = Number(r.u0), u1 = Number(r.u1);
    // wallLength는 float라 4000 mm 벽이 3999.9999999999995처럼 나올 수 있다. 화면·기본값은
    // Math.round(len)로 보여주므로(아래 addRow), 그 반올림 값까지는 범위 안으로 쳐준다.
    const lenR = Math.round(len);
    // 저장 시 normalizeRegion이 실제 길이 len으로 자르므로, 잘린 뒤에도 시작 < 끝이어야 조용히 사라지지 않는다.
    const cu0 = Math.min(u0, len), cu1 = Math.min(u1, len);
    if (!(u0 >= 0) || !(u1 > u0) || u1 > lenR + 0.001 || !(cu1 > cu0)) return `가로 범위는 0 ~ ${lenR} mm 안에서 시작 < 끝이어야 합니다`;
  }
  const z0 = Number(r.z0), z1 = Number(r.z1);
  if (!(z0 >= 0) || !(z1 > z0) || z1 > height + 0.001) return `높이 범위는 0 ~ ${Math.round(height)} mm 안에서 시작 < 끝이어야 합니다`;
  return null;
}

// 숫자 칸의 접근 가능한 이름(§14.10 이월): 예전에는 aria-label이 'u0'·'scaleW' 같은 내부 이름이었다.
const CELL_LABELS = { u0: '가로 시작', u1: '가로 끝', z0: '높이 시작', z1: '높이 끝', scaleW: '타일 너비', scaleH: '타일 높이' };
const numCell = (name, value, min, max) => `<input type="number" name="${name}" value="${value}" min="${min}" max="${max}" step="any" aria-label="${CELL_LABELS[name] ?? name}">`;
const matOptions = id => MATERIALS.map(m => `<option value="${m.id}" ${m.id === id ? 'selected' : ''}>${esc(`${m.category} · ${m.name}`)}</option>`).join('');
// 영역(면 단위) 타일 크기(§13.3). 값이 없으면 그 재질의 기본 scale을 보여 준다.
const clampScale = v => Math.min(MAT_RANGE.scale[1], Math.max(MAT_RANGE.scale[0], Math.round(Number(v) || MAT_RANGE.scale[0])));
const scaleOf = r => r.mat.scale ?? materialById(r.mat.id)?.scale ?? [1000, 1000];

export function openMaterialEditor({ store, wallId, side = 'in', seedDefault = true, onClose = () => {} }) {
  const existing = document.querySelector('.modal.mat-editor');
  if (existing) existing.remove();                       // 두 개를 띄우지 않는다
  const s = side === 'out' ? 'out' : 'in';
  const wall = () => activeFloor(store.get()).walls.find(w => w.id === wallId) ?? null;
  const w0 = wall();
  if (!w0) return { close: () => {} };
  const len = wallLength(w0), height = w0.height;
  // 편집 중 목록은 대화상자가 들고 있다([적용]에서 한 번에 저장한다).
  let rows = regionsOf(activeFloor(store.get()), { kind: 'wall', id: wallId, side: s }).map(r => ({ ...r, mat: { ...r.mat, offset: [...r.mat.offset], ...(r.mat.scale ? { scale: [...r.mat.scale] } : {}) } }));
  // 빈 캔버스 + "영역이 없습니다"로 열리면 무엇을 편집하는지 알 수 없다(감사 #18):
  // 아직 영역이 없으면 벽 아래쪽 띠 하나를 만든 채 연다(§14.10).
  // seedDefault:false는 "행을 더하는 동작 자체"를 보는 테스트용 문이다(씨앗이 인덱스를 밀지 않게).
  if (seedDefault && !rows.length) rows = [newRow('band', { len, height })];

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
      ${numCell('scaleW', scaleOf(r)[0], MAT_RANGE.scale[0], MAT_RANGE.scale[1])}${numCell('scaleH', scaleOf(r)[1], MAT_RANGE.scale[0], MAT_RANGE.scale[1])}
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
    // 바탕: 지금 이 면에 발려 있는 재질(§14.10). 영역은 그 위에 얹힌다 — 무엇을 덮어쓰는지 보인다.
    const base = materialById((s === 'out' ? wall()?.matOut : wall()?.matIn)?.id);
    if (base) { ctx.save(); ctx.beginPath(); ctx.rect(pad, pad, W, H); ctx.clip(); ctx.translate(pad, pad); drawPattern(ctx, base, Math.max(W, H)); ctx.restore(); }
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
  // 새 영역 하나. wallLength가 float라(예: 4000 mm 벽이 3999.9999999999995) 기본 u1을 반올림해
  // 넣는다 — validateRegion도 이 값을 범위 안으로 받아들인다.
  function newRow(kind, { len: L, height: H }) {
    const lenR = Math.round(L);
    return kind === 'band'
      ? { id: uid('rg'), kind: 'band', u0: 0, u1: lenR, z0: 0, z1: Math.min(1200, H), mat: { id: MATERIALS[0].id, offset: [0, 0], angle: 0 } }
      : { id: uid('rg'), kind: 'rect', u0: 0, u1: Math.min(1000, lenR), z0: 0, z1: Math.min(1000, H), mat: { id: MATERIALS[0].id, offset: [0, 0], angle: 0 } };
  }
  const addRow = kind => {
    rows.push(newRow(kind, { len, height }));
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
    else if (name === 'mat') {
      // 재질을 바꾸면 타일 크기 덮어쓰기를 버린다(새 재질의 기본 scale을 따르는 것이 놀랍지 않다).
      r.mat = { id: ev.target.value, offset: [...r.mat.offset], angle: r.mat.angle };
      // 행을 다시 그리지는 않는다(C-6: 호출자가 잡아 둔 행 노드가 떨어지면 이후 입력의 change가
      // root까지 올라오지 않는다). 두 칸의 값만 새 재질의 기본값으로 고쳐 준다.
      const [sw, sh] = scaleOf(r);
      row.querySelector('[name="scaleW"]').value = String(sw);
      row.querySelector('[name="scaleH"]').value = String(sh);
    }
    else if (name === 'scaleW' || name === 'scaleH') {
      r.mat = { ...r.mat, scale: [clampScale(row.querySelector('[name="scaleW"]').value), clampScale(row.querySelector('[name="scaleH"]').value)] };
    }
    else if (['u0', 'u1', 'z0', 'z1'].includes(name)) { const v = Number(ev.target.value); if (Number.isFinite(v)) r[name] = v; }
    part('error').textContent = '';
    // 값 입력 중에는 행을 다시 그리지 않는다: renderRows()가 part('rows').innerHTML을 갈아 끼우면
    // 호출자가 잡아 둔 행 노드가 DOM에서 떨어져 이후 입력의 change가 root까지 올라오지 않는다(C-6).
    // 종류(수평 띠 ↔ 사각형)를 바꿀 때만 가로 입력의 disabled를 다시 계산해야 하므로 행을 그린다.
    if (name === 'kind') renderRows();
    renderPreview();
  });
  // 대화상자 안의 키는 무엇이든 window의 전역 단축키(L/F로 2D 도구를 바꾸는 등)까지 내려가지 않는다.
  root.addEventListener('keydown', ev => {
    ev.stopPropagation();
    if (ev.key === 'Escape') { close(); return; }
    // select에 포커스가 있을 때는 브라우저가 흔히 Enter를 옵션 선택 등으로 쓰므로 적용하지 않는다.
    if (ev.key === 'Enter') { if (ev.target?.tagName !== 'SELECT') { ev.preventDefault(); root.querySelector('[name="apply"]').click(); } return; }
    if (ev.ctrlKey || ev.altKey || ev.metaKey) return;
    if (['INPUT', 'SELECT', 'TEXTAREA'].includes(ev.target?.tagName)) return; // 입력칸에 타이핑 중인 l/f는 단축키가 아니다
    const k = ev.key.toLowerCase();
    // <kbd>L</kbd>/<kbd>F</kbd> 힌트가 실제로 동작하게 한다(수평 띠/사각형 추가).
    if (k === 'l') { ev.preventDefault(); addRow('band'); }
    else if (k === 'f') { ev.preventDefault(); addRow('rect'); }
  });
  render();
  root.querySelector('[name="addBand"]').focus();
  return { close };
}
