// ComfyUI 일괄 생성의 순수 부분(2026-10-13 · 계획 15 Task E). comfy-batch.mjs(CLI)가 쓰고 tests/comfyBatch.test.js가 가짜 fetch로 본다 —
// 파일·프로세스·전역 fetch를 건드리지 않는다(fetch는 부르는 쪽이 넘긴다: CLI는 요청마다 시간 제한을 건 전역 fetch, 테스트는 가짜).
// 흐름(조사 2026-10-06-research-comfyui-trellis2.md §7 — ComfyUI 서버는 기본이 헤드리스 HTTP API):
//   POST /upload/image(사진) → 워크플로(API 형식)의 LoadImage·저장 노드를 제품마다 바꿔 POST /prompt → GET /history/<id> 폴링
//   (끝나기 전에는 {} · 끝나면 { <id>: { status, outputs } }) → GET /view?filename&subfolder&type=output으로 GLB 바이트.
// 템플릿 근거: Comfy-Org/workflow_templates 3d_pixal3d_trellis2_image_to_model.json(2026-10-13 받아 확인) — LoadImage 1 · Save3DAdvanced 1
// (filename_prefix '3d/ComfyUI') · Preview3DAdvanced 2 · MeshToFile3D 3. 미리보기도 3D 파일을 낼 수 있어 GLB는 우리가 준 접두사로 고른다.

// 저장 노드: 템플릿의 Save3DAdvanced, 그리고 ComfyUI 코어의 SaveGLB(같은 filename_prefix 입력) — 템플릿이 바뀌어도 스크립트를 고치지 않게.
export const SAVE_NODES = Object.freeze(['Save3DAdvanced', 'SaveGLB']);
export const serverBase = s => String(s).replace(/\/+$/, '');
const isGlb = b => b.length >= 12 && b[0] === 0x67 && b[1] === 0x6c && b[2] === 0x54 && b[3] === 0x46;   // 'glTF'

// 제품 하나용 워크플로: 원본은 그대로 두고(제품마다 같은 원본에서) LoadImage.inputs.image · 저장 노드 inputs.filename_prefix만 바꾼 깊은 복사.
// 노드 id는 워크플로마다 다르므로 class_type으로 찾고, 0개·2개 이상이면 어느 것을 바꿀지 모르니 던진다 — GPU를 쓰기 전에 멈춘다.
export function patchWorkflow(workflow, { image, prefix }) {
  if (!workflow || typeof workflow !== 'object' || Array.isArray(workflow.nodes))
    throw new Error('API 형식 워크플로가 아니다(UI 형식은 nodes 배열이 있다) — Dev mode의 "Save (API Format)"(새 화면은 Workflow → Export (API))으로 저장');
  const wf = structuredClone(workflow);
  const find = types => Object.entries(wf).filter(([, n]) => types.includes(n?.class_type));
  const one = (types, what) => {
    const hits = find(types);
    if (hits.length !== 1) throw new Error(`${what} 노드가 ${hits.length}개다(1개여야 한다: ${types.join(' · ')})${hits.length ? ` — id ${hits.map(([id]) => id).join(', ')}` : ''}`);
    return hits[0][1];
  };
  const load = one(['LoadImage'], 'LoadImage'), save = one(SAVE_NODES, '저장');
  load.inputs = { ...load.inputs, image };
  save.inputs = { ...save.inputs, filename_prefix: prefix };
  return wf;
}

export const viewUrl = (server, { filename, subfolder = '', type = 'output' }) => `${serverBase(server)}/view?${new URLSearchParams({ filename, subfolder, type })}`;

// history 항목의 outputs(노드 id → { 키: [파일…] })에서 .glb만. 파일은 { filename, subfolder, type }이거나(이미지·SaveGLB 방식)
// output 폴더 기준 문자열 경로일 수 있다(옛 Preview3D의 result) — 둘 다 같은 모양으로. 윈도 서버의 역슬래시는 /로.
export function glbOutputs(entry) {
  const out = [];
  for (const node of Object.values(entry?.outputs ?? {})) for (const list of Object.values(node ?? {})) {
    if (!Array.isArray(list)) continue;
    for (const f of list) {
      if (typeof f === 'string' && /\.glb$/i.test(f)) {
        const p = f.replace(/\\/g, '/'), i = p.lastIndexOf('/');
        out.push({ filename: p.slice(i + 1), subfolder: i >= 0 ? p.slice(0, i) : '', type: 'output' });
      } else if (typeof f?.filename === 'string' && /\.glb$/i.test(f.filename)) {
        out.push({ filename: f.filename, subfolder: String(f.subfolder ?? '').replace(/\\/g, '/'), type: f.type ?? 'output' });
      }
    }
  }
  return out;
}

async function body(res) { const t = await res.text(); try { return JSON.parse(t); } catch { return t; } }

// 사진을 서버 input/ 폴더로 올린다(원격 GPU — RunPod — 에서도 같은 길). overwrite: 같은 제품을 다시 돌릴 때 _1 같은 새 이름이 생기지 않게.
// 돌려주는 값은 LoadImage.inputs.image에 넣을 이름(하위 폴더가 있으면 'sub/name').
export async function uploadImage(fetchImpl, server, { name, bytes }) {
  const fd = new FormData();
  fd.append('image', new Blob([bytes]), name);
  fd.append('overwrite', 'true');
  fd.append('type', 'input');
  const res = await fetchImpl(`${serverBase(server)}/upload/image`, { method: 'POST', body: fd });
  if (!res.ok) throw new Error(`사진 올리기 실패 HTTP ${res.status}: ${JSON.stringify(await body(res)).slice(0, 300)}`);
  const j = await res.json();
  return j.subfolder ? `${j.subfolder}/${j.name}` : j.name;
}

// 제출 → prompt_id. 검증 실패(400)는 { error, node_errors: { id: { class_type, errors: [{ message, details }] } } } — 노드 이름과 문구를 적는다
// (모델 파일이 없거나 LoadImage 이름이 틀린 것이 여기서 잡힌다).
export async function submitPrompt(fetchImpl, server, workflow) {
  const res = await fetchImpl(`${serverBase(server)}/prompt`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ prompt: workflow }) });
  const j = await body(res);
  if (!res.ok || !j?.prompt_id) {
    const nodes = Object.entries(j?.node_errors ?? {}).map(([id, n]) => `${n.class_type ?? '?'}(${id}): ${(n.errors ?? []).map(e => [e.message, e.details].filter(Boolean).join(' — ')).join('; ')}`);
    throw new Error(`제출 실패 HTTP ${res.status}: ${[j?.error?.message ?? (typeof j === 'string' ? j.slice(0, 200) : ''), ...nodes].filter(Boolean).join(' · ')}`);
  }
  return j.prompt_id;
}

const errorText = st => {
  const e = (st.messages ?? []).find(m => m?.[0] === 'execution_error')?.[1];
  if (e) return `${e.node_type ?? '?'}(${e.node_id ?? '?'}) — ${e.exception_message ?? ''}`.trim();
  return (st.messages ?? []).map(m => m?.[0]).filter(Boolean).join(', ') || 'status error';
};

// 폴링 시간 초과만 따로 가리는 종류(2026-10-13 · 리뷰 I-1): 다른 실패(메모리 부족 · 검증 · 예산)는 그 제품만의 문제라 다음으로 가지만,
// 시간 초과는 서버가 멎었거나 큐가 막힌 것이라 일괄 전체를 멈춰야 한다(runBatch). cancel = 취소 요청에서 난 문제 목록(generateGlb가 채운다).
export class PollTimeout extends Error {
  constructor(promptId, timeout) {
    super(`시간 초과 ${Math.round(timeout / 1000)}초(prompt ${promptId})`);
    this.name = 'PollTimeout'; this.promptId = promptId; this.cancel = null;
  }
}

// 서버에 남은 작업 취소(2026-10-13 · 리뷰 I-1): 시간 초과된 prompt는 ComfyUI 큐에 그대로 남아 다음 제품이 그 뒤에 줄을 선다.
// POST /queue { delete: [id] } — 대기 중이면 큐에서 뺀다(도는 중인 것은 이것으로 못 뺀다) → POST /interrupt { prompt_id } — 도는 중이면 멈춘다.
// 순서는 이대로: 먼저 빼야 인터럽트로 앞 작업이 끝난 틈에 우리 것이 시작되지 않는다. 최신 ComfyUI는 prompt_id가 지금 도는 것일 때만 멈추고,
// 옛 판은 본문을 무시하고 도는 것을 멈춘다(우리 전용 GPU라 앞에 멎은 작업이 있으면 그것도 멈추는 편이 낫다).
// 하나가 실패해도 다른 하나는 시도한다. 던지지 않고 문제 목록을 돌려준다([] = 둘 다 받아들여짐) — 시간 초과 오류를 가리지 않게.
export async function cancelPrompt(fetchImpl, server, promptId) {
  const problems = [];
  for (const [path, payload] of [['/queue', { delete: [promptId] }], ['/interrupt', { prompt_id: promptId }]]) {
    try {
      const res = await fetchImpl(`${serverBase(server)}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
      if (!res.ok) problems.push(`${path} HTTP ${res.status}`);
    } catch (err) { problems.push(`${path} ${err.message}`); }
  }
  return problems;
}

// GET /history/<id>를 every ms마다 묻는다. 항목이 생기면 끝(성공이면 항목을 돌려주고, status_str 'error'면 노드·예외 문구로 던진다).
// 줄 서 있는 동안도 {}라 timeout은 대기 + 실행 합이다(기본 30분 — 1024³ 기준 4090 약 1분/개 · 조사 §7). 넘으면 PollTimeout(취소는 generateGlb).
// 잠깐의 502·네트워크 오류(RunPod 프록시 등)는 retries번 연속까지 견딘다 — 30분 폴링 하나 끊겼다고 이미 돈 GPU 결과를 버리지 않게.
// sleep·now는 테스트가 가짜 시계를 넣는 자리다.
export async function pollUntilDone(fetchImpl, server, promptId, { every = 2000, timeout = 1_800_000, retries = 3, sleep = ms => new Promise(r => setTimeout(r, ms)), now = Date.now } = {}) {
  const url = `${serverBase(server)}/history/${encodeURIComponent(promptId)}`, start = now();
  let fails = 0;
  for (;;) {
    let h = null;
    try {
      const res = await fetchImpl(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      h = await res.json(); fails = 0;
    } catch (err) {
      if (++fails > retries) throw new Error(`history 조회가 ${fails}번 연속 실패(prompt ${promptId}): ${err.message}`);
    }
    const e = h?.[promptId];
    if (e) {
      if (e.status?.status_str === 'error') throw new Error(`생성 실패(prompt ${promptId}): ${errorText(e.status)}`);
      return e;
    }
    if (now() - start >= timeout) throw new PollTimeout(promptId, timeout);
    await sleep(every);
  }
}

// 제품 하나: 워크플로 바꾸기 → 제출 → 폴링 → 접두사(기본 '3d/<id>' — 조사 §6)로 시작하는 출력 GLB를 /view로 받기 → 'glTF' 머리 확인.
// image는 서버 input/에 이미 있는 이름(uploadImage의 반환값). 돌려주는 값: { promptId, file, bytes(Uint8Array) }.
// 폴링 시간 초과면 제출한 prompt를 서버에서 취소하고(cancelPrompt) 결과를 문구·err.cancel에 붙여 PollTimeout을 그대로 던진다(2026-10-13 · 리뷰 I-1) —
// 제출한 쪽이 치워야 큐에 멎은 작업이 남지 않는다.
export async function generateGlb(fetchImpl, { server, workflow, id, image, prefix = `3d/${id}`, ...poll }) {
  const promptId = await submitPrompt(fetchImpl, server, patchWorkflow(workflow, { image, prefix }));
  let entry;
  try { entry = await pollUntilDone(fetchImpl, server, promptId, poll); } catch (err) {
    if (err instanceof PollTimeout) {
      err.cancel = await cancelPrompt(fetchImpl, server, promptId);
      err.message += err.cancel.length
        ? ` — 서버 작업 취소 실패(${err.cancel.join(' · ')}): ${serverBase(server)}/queue에서 직접 지운다`
        : ' — 서버 작업 취소 요청함(/queue delete · /interrupt)';
    }
    throw err;
  }
  const all = glbOutputs(entry), path = f => (f.subfolder ? `${f.subfolder}/${f.filename}` : f.filename);
  const hits = all.filter(f => path(f).startsWith(prefix));
  const file = hits.find(f => f.type === 'output') ?? hits[0];
  if (!file) throw new Error(`출력에 접두사 ${prefix}의 GLB가 없다(prompt ${promptId}) — 찾은 것: ${all.map(path).join(', ') || '없음'}`);
  const url = viewUrl(server, file), res = await fetchImpl(url);
  if (!res.ok) throw new Error(`GLB 받기 실패 HTTP ${res.status}: ${url}`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (!isGlb(bytes)) throw new Error(`받은 파일이 GLB가 아니다(${bytes.length} B · ${path(file)})`);
  return { promptId, file, bytes };
}

// 일괄 루프(2026-10-13 · 리뷰 I-1로 CLI에서 떼어 옴 — 가짜 fetch로 "시간 초과면 멈춘다"를 보려고). 파일·포장은 부르는 쪽 콜백:
// photo(id) → { name, bytes } · save(id, { promptId, file, bytes }) → 포장 칸 문구(던지면 그 제품 실패). 서버 큐에 몰아 넣지 않고 하나씩.
// 다른 실패는 그 제품만 실패로 적고 다음으로 가지만, PollTimeout이면 멈춘다: 30분 안에 못 끝낸 서버(멎은 노드 · 막힌 큐)에 다음 제품을 넣으면
// 그 뒤에 줄을 서 또 시간 초과 — 남은 제품마다 30분씩 유료 GPU를 태운다. 인터럽트는 노드 사이에서만 듣기 때문에 취소가 먹었는지도 여기서는 모른다.
// 돌려주는 값: results([{ id, ok, ms, …generateGlb 결과, packed } | { id, ok: false, ms, error }]) · stopped(PollTimeout | null) ·
// skipped(멈춰서 돌지 않은 id) · retry(실패 + skipped — CLI의 "다시: --products"). now는 시간 칸과 폴링이 같이 쓴다(테스트의 가짜 시계).
export async function runBatch(fetchImpl, { server, workflow, ids, photo, save = async () => '—', log = () => {}, now = Date.now, ...poll }) {
  const results = [];
  let stopped = null, skipped = [];
  for (const [i, id] of ids.entries()) {
    const t0 = now();
    try {
      const { name, bytes } = await photo(id);
      log(`[${i + 1}/${ids.length}] ${id} ← ${name}`);
      const image = await uploadImage(fetchImpl, server, { name, bytes });
      const r = await generateGlb(fetchImpl, { server, workflow, id, image, now, ...poll });
      results.push({ id, ok: true, ...r, packed: await save(id, r), ms: now() - t0 });
    } catch (error) {
      results.push({ id, ok: false, error, ms: now() - t0 });
      if (error instanceof PollTimeout) { stopped = error; skipped = ids.slice(i + 1); break; }
    }
  }
  return { results, stopped, skipped, retry: [...results.filter(r => !r.ok).map(r => r.id), ...skipped] };
}

// pack.mjs 인자: 생성 모델은 URL이 없으므로 출처 종류를 직접 준다(--source-kind generated · lib.SOURCE_KINDS). glTF는 Y-up이 규격이라 --up은 기본(y).
// 정면 기본 +Z(사진 찍은 쪽 = 앱의 정면이라는 가정) — 첫 생성의 검수 시트로 확인하고 틀리면 --front로 배치 전체를 바꾼다(README).
export const packArgs = ({ glb, id, front = '+z', author, license }) =>
  [glb, '--product', id, '--front', front, '--source-kind', 'generated', '--author', author, '--license', license];
