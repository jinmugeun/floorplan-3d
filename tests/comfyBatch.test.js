// ComfyUI 일괄 생성(2026-10-13 · 계획 15 Task E): tools/assets/comfy-lib.mjs의 순수 함수를 가짜 fetch로 본다 — 네트워크·GPU 없이.
// 흐름(조사 2026-10-06-research-comfyui-trellis2.md §7): 사진 올리기(POST /upload/image) → 워크플로(API 형식)의 LoadImage·Save3DAdvanced를 제품마다
// 바꿔 POST /prompt → GET /history/<id> 폴링(끝나기 전에는 {} · 끝나면 { <id>: { status, outputs } }) → GET /view?filename&subfolder&type=output로 GLB.
// 템플릿 3d_pixal3d_trellis2_image_to_model.json(2026-10-13 받아 확인)은 LoadImage 1 · Save3DAdvanced 1(filename_prefix '3d/ComfyUI')이고,
// Preview3DAdvanced 2 · MeshToFile3D 3도 있어 출력 목록에 다른 3D 파일이 섞일 수 있다 → GLB는 우리가 준 접두사로 고른다.
// 끝 두 묶음은 생성 경로가 기대는 pack.mjs `--source-kind`와 NOTICE 문장이다(lib.mjs).
import { describe, test, expect } from 'vitest';
import { Document, NodeIO } from '@gltf-transform/core';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateGlb, glbOutputs, packArgs, patchWorkflow, pollUntilDone, submitPrompt, uploadImage, viewUrl } from '../tools/assets/comfy-lib.mjs';
import { noticeMarkdown } from '../tools/assets/lib.mjs';

// API 형식(Dev mode "Save (API Format)") — 노드 id는 문자열 키이고 값은 { class_type, inputs }. id는 워크플로마다 다르므로 class_type으로 찾는다.
const WF = Object.freeze({
  3: { class_type: 'KSampler', inputs: { seed: 1, steps: 12 } },
  76: { class_type: 'LoadImage', inputs: { image: 'viking_wolf_rune_axe.png', upload: 'image' } },
  120: { class_type: 'Save3DAdvanced', inputs: { filename_prefix: '3d/ComfyUI', model_3d: ['119', 0] } },
});
const GLB = new Uint8Array([0x67, 0x6c, 0x54, 0x46, 2, 0, 0, 0, 12, 0, 0, 0]);       // 'glTF' · v2 · 길이 12(머리만)
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
// 가짜 fetch: 요청을 적어 두고 handler(요청, 번호)가 Response를 돌려준다(던지면 네트워크 오류).
function fake(handler) {
  const calls = [];
  const fetch = async (url, init = {}) => {
    const u = new URL(url), call = { method: init.method ?? 'GET', path: u.pathname, query: Object.fromEntries(u.searchParams), body: init.body };
    calls.push(call);
    return handler(call, calls.length);
  };
  return { fetch, calls };
}
// 가짜 시계: sleep이 시간을 흘려보낸다(실제로 기다리지 않는다).
function clock() { let t = 0; return { now: () => t, sleep: async ms => { t += ms; } }; }
const done = (id, outputs, status = { status_str: 'success', completed: true, messages: [] }) => json({ [id]: { prompt: [], outputs, status } });

describe('patchWorkflow', () => {
  test('class_type으로 LoadImage.inputs.image · Save3DAdvanced.inputs.filename_prefix를 바꾸고 나머지·원본은 그대로', () => {
    const out = patchWorkflow(WF, { image: 'fridge-2door.png', prefix: '3d/fridge-2door' });
    expect(out[76].inputs).toEqual({ image: 'fridge-2door.png', upload: 'image' });
    expect(out[120].inputs).toEqual({ filename_prefix: '3d/fridge-2door', model_3d: ['119', 0] });
    expect(out[3]).toEqual(WF[3]);
    expect(WF[76].inputs.image).toBe('viking_wolf_rune_axe.png');                    // 깊은 복사 — 제품마다 같은 원본에서
    expect(WF[120].inputs.filename_prefix).toBe('3d/ComfyUI');
    // ComfyUI 코어의 SaveGLB(filename_prefix)도 저장 노드로 받는다 — 템플릿이 바뀌어도 스크립트를 고치지 않게.
    const glbWf = { 1: { class_type: 'LoadImage', inputs: { image: 'a.png' } }, 9: { class_type: 'SaveGLB', inputs: { filename_prefix: 'mesh/ComfyUI' } } };
    expect(patchWorkflow(glbWf, { image: 'b.png', prefix: '3d/b' })[9].inputs.filename_prefix).toBe('3d/b');
  });

  test('UI 형식 · LoadImage 없음/둘 · 저장 노드 없음은 이유를 적어 던진다(GPU를 쓰기 전에 멈춘다)', () => {
    expect(() => patchWorkflow({ nodes: [], links: [] }, { image: 'a.png', prefix: '3d/a' })).toThrow(/API/);
    const { 76: _l, ...noLoad } = WF;
    expect(() => patchWorkflow(noLoad, { image: 'a.png', prefix: '3d/a' })).toThrow(/LoadImage/);
    expect(() => patchWorkflow({ ...WF, 77: { class_type: 'LoadImage', inputs: { image: 'x.png' } } }, { image: 'a.png', prefix: '3d/a' })).toThrow(/LoadImage.*2/);
    const { 120: _s, ...noSave } = WF;
    expect(() => patchWorkflow(noSave, { image: 'a.png', prefix: '3d/a' })).toThrow(/Save3DAdvanced/);
  });
});

describe('제출 · 폴링 · 받기', () => {
  test('generateGlb: 제출 → history 대기(빈 객체 두 번) → 끝 → 접두사가 맞는 출력 GLB를 /view로 받는다', async () => {
    const { fetch, calls } = fake(call => {
      if (call.method === 'POST' && call.path === '/prompt') return json({ prompt_id: 'p1', number: 0, node_errors: {} });
      if (call.path === '/history/p1') {
        const n = calls.filter(c => c.path === '/history/p1').length;
        if (n < 3) return json({});                                                    // 줄 서 있거나 도는 중
        return done('p1', {
          31: { images: [{ filename: 'ComfyUI_temp_00001_.png', subfolder: '', type: 'temp' }] },
          88: { '3d': [{ filename: 'preview_00001_.glb', subfolder: '3d', type: 'temp' }] },   // 미리보기 — 고르면 안 된다
          120: { '3d': [{ filename: 'fridge-2door_00001_.glb', subfolder: '3d', type: 'output' }] },
        });
      }
      if (call.path === '/view') return new Response(GLB);
      throw new Error(`예상 밖 요청 ${call.method} ${call.path}`);
    });
    const c = clock();
    const r = await generateGlb(fetch, { server: 'http://127.0.0.1:8188/', workflow: WF, id: 'fridge-2door', image: 'fridge-2door.png', every: 2000, timeout: 60_000, ...c });
    expect(r.promptId).toBe('p1');
    expect(r.file).toEqual({ filename: 'fridge-2door_00001_.glb', subfolder: '3d', type: 'output' });
    expect([...r.bytes]).toEqual([...GLB]);
    expect(calls.map(x => `${x.method} ${x.path}`)).toEqual(['POST /prompt', 'GET /history/p1', 'GET /history/p1', 'GET /history/p1', 'GET /view']);
    expect(calls[4].query).toEqual({ filename: 'fridge-2door_00001_.glb', subfolder: '3d', type: 'output' });
    const sent = JSON.parse(calls[0].body).prompt;
    expect(sent[76].inputs.image).toBe('fridge-2door.png');
    expect(sent[120].inputs.filename_prefix).toBe('3d/fridge-2door');                 // 기본 접두사 3d/<id>(조사 §6)
    expect(c.now()).toBe(4000);                                                        // 두 번 기다렸다(2초 간격)
  });

  test('pollUntilDone: 끝나지 않으면 timeout에서 멈춘다 — 0 · 2 · … · 10초 여섯 번 묻고 던진다', async () => {
    const { fetch, calls } = fake(() => json({}));
    await expect(pollUntilDone(fetch, 'http://h:8188', 'p9', { every: 2000, timeout: 10_000, ...clock() })).rejects.toThrow(/시간 초과.*p9/);
    expect(calls).toHaveLength(6);
  });

  test('pollUntilDone: 실행 오류(status_str error)는 노드와 예외 문구를 적어 던진다', async () => {
    const st = { status_str: 'error', completed: false, messages: [['execution_start', {}], ['execution_error', { node_id: '57', node_type: 'Trellis2UpsampleStage', exception_message: 'CUDA out of memory' }]] };
    const { fetch } = fake(() => done('p2', {}, st));
    await expect(pollUntilDone(fetch, 'http://h:8188', 'p2', clock())).rejects.toThrow(/Trellis2UpsampleStage.*CUDA out of memory/);
  });

  test('pollUntilDone: 잠깐의 502·네트워크 오류는 견디고(연속 3번까지), 4번 연속이면 던진다', async () => {
    const seq = [() => json({}, 502), () => { throw new TypeError('fetch failed'); }, () => done('p3', { 1: {} })];
    const ok = fake((_, n) => seq[n - 1]());
    await expect(pollUntilDone(ok.fetch, 'http://h:8188', 'p3', clock())).resolves.toMatchObject({ outputs: { 1: {} } });
    const bad = fake(() => json({ error: 'bad gateway' }, 502));
    await expect(pollUntilDone(bad.fetch, 'http://h:8188', 'p4', clock())).rejects.toThrow(/502/);
    expect(bad.calls).toHaveLength(4);
  });

  test('submitPrompt: 검증 실패(400 · node_errors)는 노드 이름과 문구를 적어 던진다', async () => {
    const { fetch } = fake(() => json({
      error: { type: 'prompt_outputs_failed_validation', message: 'Prompt outputs failed validation', details: '' },
      node_errors: { 76: { class_type: 'LoadImage', errors: [{ message: 'Invalid image file', details: 'image - Invalid image file: fridge-2door.png' }] } },
    }, 400));
    await expect(submitPrompt(fetch, 'http://h:8188', WF)).rejects.toThrow(/LoadImage.*Invalid image file/);
  });

  test('uploadImage: /upload/image에 multipart(image · overwrite · type input)로 올리고 LoadImage가 쓸 이름을 돌려준다', async () => {
    const { fetch, calls } = fake(() => json({ name: 'fridge-2door.png', subfolder: '', type: 'input' }));
    expect(await uploadImage(fetch, 'http://h:8188', { name: 'fridge-2door.png', bytes: new Uint8Array([1, 2, 3]) })).toBe('fridge-2door.png');
    expect(calls[0]).toMatchObject({ method: 'POST', path: '/upload/image' });
    const fd = calls[0].body;
    expect(fd).toBeInstanceOf(FormData);
    expect([fd.get('overwrite'), fd.get('type'), fd.get('image').name, fd.get('image').size]).toEqual(['true', 'input', 'fridge-2door.png', 3]);
    const sub = fake(() => json({ name: 'b.png', subfolder: 'kvp', type: 'input' }));
    expect(await uploadImage(sub.fetch, 'http://h:8188', { name: 'b.png', bytes: new Uint8Array([1]) })).toBe('kvp/b.png');
  });

  test('glbOutputs · viewUrl: 출력 목록에서 .glb만(문자열 경로 포함) · 쿼리는 인코딩', () => {
    expect(glbOutputs({ outputs: { 1: { images: [{ filename: 'a.png', subfolder: '', type: 'temp' }] }, 2: { '3d': [{ filename: 'x.GLB', subfolder: '3d', type: 'output' }] }, 3: { result: ['3d\\y_00001_.glb', null] } } }))
      .toEqual([{ filename: 'x.GLB', subfolder: '3d', type: 'output' }, { filename: 'y_00001_.glb', subfolder: '3d', type: 'output' }]);
    expect(glbOutputs({})).toEqual([]);
    expect(viewUrl('https://abc-8188.proxy.runpod.net/', { filename: 'a b&c.glb', subfolder: '3d', type: 'output' }))
      .toBe('https://abc-8188.proxy.runpod.net/view?filename=a+b%26c.glb&subfolder=3d&type=output');
  });

  test('generateGlb: 접두사가 맞는 GLB가 없거나 받은 바이트가 GLB가 아니면 던진다', async () => {
    const outputs = { 88: { '3d': [{ filename: 'preview_00001_.glb', subfolder: '3d', type: 'temp' }] } };
    const none = fake(call => (call.path === '/prompt' ? json({ prompt_id: 'p5' }) : done('p5', outputs)));
    await expect(generateGlb(none.fetch, { server: 'http://h:8188', workflow: WF, id: 'bed-queen', image: 'bed-queen.png', ...clock() })).rejects.toThrow(/3d\/bed-queen.*preview_00001_\.glb/);
    const html = fake(call => (call.path === '/prompt' ? json({ prompt_id: 'p6' }) : call.path === '/view' ? new Response('<html>')
      : done('p6', { 120: { '3d': [{ filename: 'bed-queen_00001_.glb', subfolder: '3d', type: 'output' }] } })));
    await expect(generateGlb(html.fetch, { server: 'http://h:8188', workflow: WF, id: 'bed-queen', image: 'bed-queen.png', ...clock() })).rejects.toThrow(/GLB가 아니다/);
  });
});

describe('포장 연결(pack --source-kind · NOTICE)', () => {
  test('packArgs: 생성 모델은 정면 +Z 기본 · 출처 종류 generated · 작가·라이선스를 넘긴다', () => {
    expect(packArgs({ glb: 'in/bed-queen.glb', id: 'bed-queen', author: 'A', license: 'L' }))
      .toEqual(['in/bed-queen.glb', '--product', 'bed-queen', '--front', '+z', '--source-kind', 'generated', '--author', 'A', '--license', 'L']);
    expect(packArgs({ glb: 'g', id: 'x', front: '-z', author: 'A', license: 'L' })).toContain('-z');
  });

  // pack.mjs는 출처 종류를 URL로 짐작했다(polyhaven · other) — 생성 모델은 URL이 없으므로 종류를 직접 준다. 임시 --out·--manifest라 저장소 NOTICE는 그대로.
  test('pack --source-kind generated는 manifest source.kind에 그대로 들어가고, 모르는 종류는 종료 1', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'p15-comfy-'));
    try {
      const doc = new Document(), buf = doc.createBuffer();
      const P = [0, 0, 0, 0.9, 0, 0, 0.9, 1.8, 0, 0, 1.8, 0, 0, 0, 0.75, 0.9, 0, 0.75, 0.9, 1.8, 0.75, 0, 1.8, 0.75];   // 0.9 × 1.8 × 0.75 상자(8 정점)
      const I = [0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 3, 7, 6, 3, 6, 2, 0, 4, 7, 0, 7, 3, 1, 2, 6, 1, 6, 5];
      const prim = doc.createPrimitive().setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(new Float32Array(P)).setBuffer(buf))
        .setIndices(doc.createAccessor().setType('SCALAR').setArray(new Uint16Array(I)).setBuffer(buf));
      doc.createScene('s').addChild(doc.createNode('n').setMesh(doc.createMesh('m').addPrimitive(prim)));
      const input = join(tmp, 'in.glb'); writeFileSync(input, await new NodeIO().writeBinary(doc));
      const PACK = fileURLToPath(new URL('../tools/assets/pack.mjs', import.meta.url));
      const run = extra => spawnSync(process.execPath, [PACK, input, '--product', 'fridge-2door', '--out', tmp, '--manifest', join(tmp, 'manifest.json'), ...extra], { encoding: 'utf8' });
      const ok = run(['--source-kind', 'generated', '--author', 'ComfyUI TRELLIS.2', '--license', '자체 생성물']);
      expect([ok.status, ok.stderr]).toEqual([0, '']);
      const entry = JSON.parse(ok.stdout);
      expect(entry.source).toEqual({ kind: 'generated', url: null, license: '자체 생성물', author: 'ComfyUI TRELLIS.2' });
      expect(JSON.parse(readFileSync(join(tmp, 'manifest.json'), 'utf8')).products['fridge-2door'].source.kind).toBe('generated');
      const bad = run(['--source-kind', 'genrated']);
      expect(bad.status).toBe(1);
      expect(bad.stderr).toMatch(/--source-kind/);
    } finally { rmSync(tmp, { recursive: true, force: true }); }
  }, 30000);

  test('noticeMarkdown: 생성 항목이 있을 때만 생성 경로 문장이 붙는다(시드만이면 지금 NOTICE 그대로)', () => {
    const seed = { products: { 'chair-dining': { source: { kind: 'polyhaven', url: 'https://polyhaven.com/a/x', license: 'CC0-1.0', author: 'K' } } } };
    const gen = { products: { ...seed.products, 'bed-queen': { source: { kind: 'generated', url: null, license: '자체 생성물', author: 'ComfyUI TRELLIS.2' } } } };
    expect(noticeMarkdown(seed)).not.toMatch(/TRELLIS/);
    const text = noticeMarkdown(gen);
    expect(text).toMatch(/생성 모델.*TRELLIS\.2.*MIT/);
    expect(text).toContain('| bed-queen | — | — | ComfyUI TRELLIS.2 | 자체 생성물 |');
    expect(text.split('\n').length).toBe(noticeMarkdown(seed).split('\n').length + 2);   // 생성 문장 1줄 + 표 1행
  });
});
