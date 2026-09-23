// DXF 검토 대화상자(§18.6). **이 기능의 절반**이다: 이 도면은 자동으로 완벽히 닫을 수 있는 도면이
// 아니므로(식당–조리실 경계가 벽이 아니라 배식대다) 레이어·두께·끊긴 끝점을 숨기지 않고 보여 주고
// 사람이 심판한다. ui/는 view2d/·view3d/·app/을 모르므로 스토어 교체·뷰 맞추기는 콜백이 받는다.
import { focusTrap } from './dialogBase.js';
import { esc } from '../util/html.js';
import { createDxfClient } from '../io/dxf/client.js';
import { traceBackground } from '../io/dxf/trace.js';
import { layerListHtml, wallOnly, allOn } from './dxfLayerList.js';
import { drawDxfPreview } from './dxfPreview.js';
import { dxfHeight, setDxfHeight, dxfTrace, setDxfTrace, DXF_HEIGHT_RANGE } from './prefs.js';
import { DXF_ERRORS, DXF_IMPORT_FAILED, DXF_MANY_SHEETS, DXF_UNITS_GUESS, DXF_LAYERS_GUESSED, DXF_TRACE_SKIPPED,
  DXF_HEAD, DXF_NUMS, DXF_OPEN_END_COUNT, DXF_UNMATCHED, DXF_STEP_READ, DXF_STEP_PARSE, DXF_STEP_WALLS, DXF_STEP_ROOMS, DXF_PHASE_STEP } from './messages.js';

const UNITS = [['mm', 1], ['cm', 10], ['m', 1000], ['inch', 25.4], ['ft', 304.8]];
const DEBOUNCE = 250;   // 체크가 바뀌면 이만큼 기다렸다 재추출 한 번(실측 재추출 ≈ 0.4 s)
// §18.6이 글자로 정한 `기본 두께` 범위(층고 쪽 정본은 설정에도 남는 prefs.js의 DXF_HEIGHT_RANGE다).
export const DXF_THICKNESS_RANGE = [50, 1000];
// 범위를 화면에만 적어 두면 지켜지지 않는다(최종 리뷰 I-1): <input min max>는 타이핑을 막지 않고
// 이 대화상자에는 폼 제출도 없다. 층고 99999는 normalizeProject를 **빠져나간다** — floor.height와
// wall.height만 8000으로 잘리고 room.height는 detectRooms의 `prev?.height`가 그대로 물려받아
// 3D 천장이 100 m로 선다. 음수 두께는 windowSpans의 밴드를 줄여 미리보기 폴리곤의 법선을 뒤집는다.
// 그래서 워커·설정에 닿기 전에 여기서 자른다(setDxfHeight는 범위 밖 값을 조용히 버린다).
const clampTo = (v, [lo, hi]) => Math.min(hi, Math.max(lo, v));

export function openDxfDialog({ file = null, workerFactory, onImported = async () => true, onCancel = () => {}, toast = () => {} } = {}) {
  const root = document.createElement('div');
  root.className = 'modal';
  root.id = 'dxfDialog';
  root.innerHTML = `<div class="modal-card dxf">
    <header><h2>DXF 가져오기</h2><button type="button" name="close" aria-label="닫기">✕</button></header>
    <p class="dxf-head" name="head"></p>
    <p class="error" name="error" hidden></p>
    <p class="hint" name="notice" hidden></p>
    <div class="dxf-body">
      <div class="dxf-col">
        <div class="toolbar"><input type="file" name="file" accept=".dxf" aria-label="DXF 파일"></div>
        <div class="dxf-layer-list" name="layers"></div>
        <div class="toolbar"><button type="button" name="wallOnly">벽 후보만</button><button type="button" name="all">전체</button><button type="button" name="auto">자동 판정 되돌리기</button></div>
      </div>
      <div class="dxf-col"><canvas name="preview" width="560" height="420" aria-label="추출 미리보기"></canvas></div>
      <div class="dxf-col dxf-opts">
        <label>층고 <input type="number" name="height" min="${DXF_HEIGHT_RANGE[0]}" max="${DXF_HEIGHT_RANGE[1]}" step="10" value="${dxfHeight()}"> mm</label>
        <label>기본 두께 <input type="number" name="thickness" min="${DXF_THICKNESS_RANGE[0]}" max="${DXF_THICKNESS_RANGE[1]}" step="10" value="200"> mm</label>
        <label>단위 <select name="units">${UNITS.map(([n, v]) => `<option value="${v}">${esc(n)}</option>`).join('')}</select></label>
        <label><input type="checkbox" name="preset" checked> 벽만 남기기</label>
        <label><input type="checkbox" name="openFaces" checked> 창·문 레이어의 긴 선도 벽면으로 쓰기</label>
        <label><input type="checkbox" name="autoNames" checked> 방 이름 자동</label>
        <label><input type="checkbox" name="openings" checked> 문·창 배치</label>
        <label><input type="checkbox" name="trace"${dxfTrace() ? ' checked' : ''}> 원 도면을 배경으로 남기기</label>
        <p class="dxf-nums" name="nums"></p>
        <p class="warn" name="warn" hidden></p>
        <p class="warn" name="unmatched" hidden></p>
        <p class="muted" name="hist"></p>
        <p class="muted tiny" name="ms"></p>
      </div>
    </div>
    <div class="dxf-progress" name="progress" hidden><div class="bar"><i name="bar"></i></div><span name="step"></span></div>
    <footer><button type="button" name="cancel">취소</button><button type="button" name="import" disabled>가져오기</button></footer>
  </div>`;
  document.body.appendChild(root);
  const q = n => root.querySelector(`[name="${n}"]`);
  // 층고·두께는 **읽는 자리에서** 자른다(위 clampTo의 주석) — 워커로도 설정으로도 잘린 값만 간다.
  const heightMm = () => clampTo(Number(q('height').value) || 3500, DXF_HEIGHT_RANGE);
  const thicknessMm = () => clampTo(Number(q('thickness').value) || 200, DXF_THICKNESS_RANGE);
  const client = createDxfClient({ workerFactory });
  let summary = null, initial = new Set(), checked = new Set(), last = null, timer = 0, closed = false, importing = false;

  const setError = text => { const e = q('error'); e.textContent = text ?? ''; e.hidden = !text; };
  const showError = code => setError(code ? (DXF_ERRORS[code] ?? DXF_ERRORS.oom) : null);
  // 화면 문장은 코드마다 한 줄이라 원인이 지워진다 — 함께 온 message는 콘솔에 남긴다(Task 10 리뷰).
  // 조용히 넘기는 두 코드는 오류가 아니다: 사용자가 닫았거나(cancelled), 더 최근 요청이 이 요청을
  // 밀어냈다(superseded · 사전 검토 C-5 — 이것을 걸러내지 않으면 연속 드롭이 거짓 오류를 띄운다).
  const warnErr = e => console.warn('dxf:', e?.message ?? e);
  const quiet = e => e?.code === 'cancelled' || e?.code === 'superseded';
  const notice = msg => { const e = q('notice'); e.textContent = msg ?? ''; e.hidden = !msg; };
  const stepLabel = (s, blocks) => (s === 1 ? DXF_STEP_READ : s === 2 ? DXF_STEP_PARSE(blocks ?? summary?.blocks ?? 0) : s === 3 ? DXF_STEP_WALLS : DXF_STEP_ROOMS);
  const progress = (s, blocks) => {
    q('progress').hidden = !s;
    q('bar').style.width = `${s * 25}%`;
    q('step').textContent = s ? stepLabel(s, blocks) : '';
  };
  const onProgress = m => { if (!closed) progress(DXF_PHASE_STEP[m.phase] ?? 1, m.blocks); };
  const unitName = v => UNITS.find(([, x]) => x === v)?.[0] ?? 'mm';
  // "벽만 남기기"는 모드가 아니라 **필터 프리셋**이다(§18.6): 칸은 지금 체크 집합이 기본 집합과
  // 같은지를 그대로 비춘다 — [전체]나 개별 체크 뒤에도 거짓을 말하지 않는다(리뷰 F-4).
  const syncPreset = () => {
    const def = wallOnly(summary?.layers ?? []);
    q('preset').checked = checked.size === def.size && [...def].every(n => checked.has(n));
  };
  const renderLayers = () => { q('layers').innerHTML = summary ? layerListHtml(summary.layers, checked) : ''; syncPreset(); };

  const render = () => {
    if (!last) return;
    const { stats, project, trace } = last;
    const floor = project.floors?.[0] ?? { walls: [], rooms: [] };
    q('nums').textContent = DXF_NUMS(stats.walls, stats.rooms, Number(stats.areaM2).toFixed(1));
    const warn = q('warn'), n = stats.openEnds?.length ?? 0;
    warn.textContent = n ? DXF_OPEN_END_COUNT(n) : '';
    warn.hidden = !n;
    // §18.4: 도면의 실명을 방 폴리곤에 못 붙였다는 것은 그 공간이 닫히지 않았다는 뜻이다 —
    // 사용자가 "어느 공간이 안 닫혔나"를 아는 유일한 신호라 끊긴 끝점 바로 아래에 수를 적는다(I-2).
    const un = q('unmatched'), u = stats.unmatchedNames?.length ?? 0;
    un.textContent = u ? DXF_UNMATCHED(u) : '';
    un.hidden = !u;
    q('hist').textContent = (stats.thickness ?? []).slice(0, 4).map(([mm, c]) => `${mm} mm×${c}`).join(' · ');
    q('ms').textContent = [summary?.ms, stats.ms].filter(Boolean).flatMap(o => Object.entries(o)).map(([k, v]) => `${k} ${v}ms`).join(' · ');
    if (stats.guessed) notice(DXF_LAYERS_GUESSED);
    drawDxfPreview(q('preview'), { trace, walls: floor.walls, rooms: floor.rooms, openEnds: stats.openEnds ?? [] });
  };

  const runExtract = () => {
    if (!summary || closed) return;
    showError(null);
    q('import').disabled = true;
    progress(3);
    client.extract({
      layers: [...checked],
      thickness: thicknessMm(),
      height: heightMm(),
      scale: Number(q('units').value) || summary.unitScale,
      useOpeningFaces: q('openFaces').checked,
      autoNames: q('autoNames').checked,
      openings: q('openings').checked,
      trace: q('trace').checked,
    }, { onProgress })
      .then(m => {
        if (closed) return;
        last = m;
        // §18.6: 폴백(추정)이면 그 벽을 낸 레이어를 **체크리스트에 미리 켠다** — 알림은 "체크를
        // 확인해 주세요"라고 하는데 켜진 줄이 하나도 없으면 확인할 것이 없다(리뷰 F-5).
        const guessed = m.stats?.guessed ? (m.stats.guessedLayers ?? []) : [];
        if (guessed.length) { for (const n of guessed) { checked.add(n); initial.add(n); } renderLayers(); }
        progress(0); render(); q('import').disabled = false;
      })
      .catch(e => { if (!closed && !quiet(e)) { progress(0); warnErr(e); showError(e.code); } });
  };
  const schedule = () => { clearTimeout(timer); timer = setTimeout(runExtract, DEBOUNCE); };

  async function load(f) {
    if (!f || closed) return;
    showError(null); notice(null); last = null;
    q('import').disabled = true;
    progress(1);
    try {
      summary = await client.parse(await f.arrayBuffer(), { fileName: f.name ?? '', onProgress });
      if (closed) return;
      initial = new Set(summary.checked);
      checked = new Set(summary.checked);
      q('units').value = String(summary.unitScale);
      q('head').textContent = DXF_HEAD(summary.title, (summary.size[0] / 1000).toFixed(1), (summary.size[1] / 1000).toFixed(1), unitName(summary.unitScale), summary.insunits, summary.ver);
      renderLayers();
      notice(summary.manySheets ? DXF_MANY_SHEETS : summary.unitsGuessed ? DXF_UNITS_GUESS : null);
      runExtract();
    } catch (e) { if (!closed && !quiet(e)) { progress(0); warnErr(e); showError(e.code); } }
  }

  const close = () => { if (closed) return; closed = true; clearTimeout(timer); client.cancel(); root.remove(); trap.destroy(); };
  const cancel = () => { if (closed) return; close(); onCancel(); };

  async function doImport() {
    // 두 번 눌러도 한 번이다(리뷰 F-1): 두 번째 클릭은 래치가 막고 버튼은 기다리는 동안 잠긴다.
    // 막지 않으면 교체도 토스트도 두 번이고, 2048 px 래스터가 두 번 돌아 §18.9의 300 ms를 넘는다.
    if (!last || closed || importing) return;
    importing = true;
    q('import').disabled = true;
    const { project, stats, trace } = last;
    if (q('trace').checked && trace?.segs?.length) {
      // 래스터는 **메인 스레드**에서 한 번만 한다(워커 OffscreenCanvas를 쓰지 않는 이유는 §18.6).
      const bg = traceBackground(trace.segs, trace.box);
      if (bg) project.background = bg;
      else toast(DXF_TRACE_SKIPPED);
    }
    setDxfHeight(heightMm());
    setDxfTrace(q('trace').checked);
    try {
      const ok = await onImported({ project, stats });
      if (ok !== false) close();
    } catch (e) {
      // 호출자가 실패하면(자동 저장이 localStorage 한도를 넘는 등) 대화상자는 열린 채 이유를 말한다 —
      // 삼킨 거절은 오류 줄도 없이 "버튼이 먹지 않는" 화면이 된다(리뷰 F-3).
      warnErr(e);
      setError(DXF_IMPORT_FAILED);
    } finally {
      importing = false;
      if (!closed) q('import').disabled = false;
    }
  }

  q('file').addEventListener('change', ev => load(ev.target.files?.[0] ?? file));
  root.addEventListener('dragover', ev => ev.preventDefault());
  root.addEventListener('drop', ev => { ev.preventDefault(); load(ev.dataTransfer?.files?.[0]); });
  q('close').addEventListener('click', cancel);
  q('cancel').addEventListener('click', cancel);
  q('import').addEventListener('click', doImport);
  q('wallOnly').addEventListener('click', () => { checked = wallOnly(summary?.layers ?? []); renderLayers(); schedule(); });
  q('all').addEventListener('click', () => { checked = allOn(summary?.layers ?? []); renderLayers(); schedule(); });
  q('auto').addEventListener('click', () => { checked = new Set(initial); renderLayers(); schedule(); });
  q('layers').addEventListener('change', ev => {
    const cb = ev.target.closest?.('input[name="layer"]');
    if (!cb) return;
    if (cb.checked) checked.add(cb.value); else checked.delete(cb.value);
    syncPreset();
    schedule();
  });
  // 켜면 기본 집합, 끄면 전체 — 라벨이 시키는 그대로다(끄면 전체 목록이 그대로 열린다).
  q('preset').addEventListener('change', () => {
    checked = q('preset').checked ? wallOnly(summary?.layers ?? []) : allOn(summary?.layers ?? []);
    renderLayers(); schedule();
  });
  for (const n of ['height', 'thickness', 'units', 'openFaces', 'autoNames', 'openings', 'trace']) q(n).addEventListener('change', schedule);
  root.addEventListener('keydown', ev => { if (ev.key === 'Escape') { ev.stopPropagation(); cancel(); } });

  const trap = focusTrap(root, { focus: '[name="file"]' });
  if (file) load(file);
  return { close };
}
