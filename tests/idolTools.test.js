// Idol 생성 절차(계획 20 Task 1): 워크플로 빌더(순수)와 B 반광 재질 계산(순수)을 네트워크·GPU 없이 본다.
// 값의 근거: 신상중 31종 재생성(2026-11-06 · 시드 46·1046 · 62건 실패 0) — scratch/q/ss-up.sh · idol-run.mjs · idol-mat.mjs에서 옮겼다.
import { test, expect } from 'vitest';
import { idolWorkflow, seedvrWorkflow, upscaleMult, SOLID_MESH, SEEDS, UPSCALE_BELOW } from '../tools/assets/idol/workflows.mjs';
import { steelTexels, STEEL_B } from '../tools/assets/idol/steel.mjs';

const links = wf => Object.entries(wf).flatMap(([id, n]) => Object.values(n.inputs).filter(v => Array.isArray(v) && typeof v[0] === 'string').map(v => [id, v[0]]));

test('idolWorkflow: 사진 → 배경 지우기 → Idol → 우리 노드(v4 · 평판 넓히기 2) → 감축 2만 qem → UV 2048 → 굽기 → SaveGLB <tag>-meshx', () => {
  const wf = idolWorkflow({ image: 'a.png', tag: 'upi-svr-x', seed: 1046 });
  const byType = t => Object.entries(wf).filter(([, n]) => n.class_type === t);
  expect(byType('LoadImage')[0][1].inputs.image).toBe('a.png');
  expect(byType('KSampler')[0][1].inputs).toMatchObject({ seed: 1046, steps: 20, cfg: 3, sampler_name: 'dpmpp_2m', scheduler: 'simple' });
  const [[sid, solid]] = byType('SplatToSolidMesh');
  expect(solid.inputs).toEqual({ splat: ['11', 0], ...SOLID_MESH });
  expect(SOLID_MESH).toMatchObject({ resolution: 288, level: 0.25, blur: 0.8, denoise: 6, denoise_normal_iters: 10, denoise_vertex_iters: 20, denoise_sigma_r: 0.3, planarize: true, plane_grow: 2 });
  expect(byType('DecimateMesh')[0][1].inputs).toMatchObject({ mesh: [sid, 0], target_face_count: 20000, placement_mode: 'qem', 'placement_mode.clamp_v_to_edge': true });
  expect(byType('UnwrapMesh')[0][1].inputs.resolution).toBe(2048);
  expect(byType('BakeSplatTexture')[0][1].inputs).toMatchObject({ texture_size: 2048, reference_mesh: [sid, 0] });
  expect(byType('SaveGLB').map(([, n]) => n.inputs.filename_prefix)).toEqual(['exp/upi-svr-x-meshx']);
  expect(byType('SaveImage').map(([, n]) => n.inputs.filename_prefix)).toEqual(['exp/upi-svr-x-input']);
  for (const [from, to] of links(wf)) expect(wf[to], `${from} → ${to}`).toBeTruthy();
});

test('seedvrWorkflow: 배율 lanczos → SeedVR2 7B int8 1단계 → 색 보정 lab → SaveImage <tag>-up · 배율은 짧은 변 1200 px 안팎(2~4)', () => {
  const wf = seedvrWorkflow({ image: 'b.jpg', tag: 'up-svr-y', mult: 3 });
  const of = t => Object.values(wf).find(n => n.class_type === t)?.inputs;
  expect(of('ResizeImageMaskNode')).toMatchObject({ 'resize_type.multiplier': 3, scale_method: 'lanczos' });
  expect(of('UNETLoader').unet_name).toBe('seedvr2_7b_int8_convrot.safetensors');
  expect(of('VAELoader').vae_name).toBe('seedvr2_ema_vae_fp16.safetensors');
  expect(of('KSampler')).toMatchObject({ seed: 7, steps: 1, cfg: 1, sampler_name: 'euler', scheduler: 'simple' });
  expect(of('SeedVR2PostProcessing').color_correction_method).toBe('lab');
  expect(of('SaveImage').filename_prefix).toBe('exp/up-svr-y-up');
  for (const [from, to] of links(wf)) expect(wf[to], `${from} → ${to}`).toBeTruthy();
  expect([121, 262, 400, 600, 899].map(upscaleMult)).toEqual([4, 4, 3, 2, 2]);
  expect([SEEDS, UPSCALE_BELOW]).toEqual([[46, 1046], 900]);
});

test('steelTexels(B 반광): 밝은 무채색 = 스테인리스(금속 0.9 · 거칠기 0.4 · 톤 0.78), 빨간 라벨 = 비금속(거칠기 0.6 · 색 그대로)', () => {
  const gray = [200, 200, 200, 255], red = [200, 30, 30, 255];
  const data = Uint8Array.from([...gray, ...gray, ...gray, ...gray, ...red, ...red, ...red, ...red]);
  const r = steelTexels(data, 8);
  expect(STEEL_B).toEqual({ metal: 0.9, rough: 0.4, roughOther: 0.6, steel: 0.78, detail: 0.3, satLo: 0.1, satHi: 0.25, lumLo: 0.18, lumHi: 0.35 });
  expect([...r.base.subarray(0, 4)]).toEqual([199, 199, 199, 255]);
  expect([...r.base.subarray(16, 20)]).toEqual(red);
  expect([...r.mr.subarray(0, 3)]).toEqual([255, 102, 230]);
  expect([...r.mr.subarray(12, 15)]).toEqual([255, 153, 0]);
  expect(r.metalShare).toBeCloseTo(0.5, 6);
  expect(r.ref).toBeCloseTo(200 / 255, 6);
});
