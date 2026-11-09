// Idol 생성 워크플로(ComfyUI API 형식) — 순수 함수(2026-11-06 · 계획 20 Task 1). 네트워크는 upscale.mjs · run.mjs가 한다.
// idolWorkflow: 공식 템플릿 3d_idol_image_to_gaussian_splat.json(서브그래프)을 API 형식으로 풀고, 우리 노드(comfy-node/splat_solid_mesh)로
//   닫힌 메시 → 감축 2만(qem) → UV 2048 → 스플랫 색 굽기까지 잇는다. 출력 = SaveGLB 'exp/<tag>-meshx' + 전처리 이미지 SaveImage 'exp/<tag>-input'.
// seedvrWorkflow: 공식 템플릿 utility_seedvr2_7b_int8_upscale_image(SeedVR2 7B int8 · Apache-2.0)를 풀어 쓴 것. 출력 = SaveImage 'exp/<tag>-up'.
// 값의 근거: 신상중 31종 재생성(2026-11-06 · 시드 46·1046 · 62건 실패 0) — scratch/q/ss-up.sh · idol-run.mjs · seedvr-up.mjs에서 옮겼다.

export const SEEDS = Object.freeze([46, 1046]);    // 시드에 따라 결과가 크게 달라 둘 다 만들고 나은 쪽을 고른다(고르기 표 from: up-s1 | up-s2)
export const UPSCALE_BELOW = 900;                  // 짧은 변이 이 값보다 작은 사진만 업스케일한다(Idol은 제품을 1024로 늘려 받는다)
// 우리 노드 SplatToSolidMesh 설정(v4 = v3 + 평판 넓히기 2칸 — 금속 반사가 드러내던 평판 움푹한 곳을 편다).
export const SOLID_MESH = Object.freeze({
  resolution: 288, thickness: 0.6, max_kernel: 24, occupancy: 'alpha', level: 0.25, close_radius: 2, blur: 0.8, smooth: 8,
  min_component: 2000, min_opacity: 0.05, denoise: 6, denoise_normal_iters: 10, denoise_vertex_iters: 20, denoise_sigma_r: 0.3,
  planarize: true, plane_angle: 15, plane_min_area: 0.005, plane_grow: 2,
});

// 짧은 변(px) → 업스케일 배율: 짧은 변이 1200 px 안팎이 되게 2~4.
export const upscaleMult = short => Math.min(4, Math.max(2, Math.round(1200 / short)));

export function seedvrWorkflow({ image, tag, mult, seed = 7 }) {
  return {
    1: { inputs: { image }, class_type: 'LoadImage' },
    2: { inputs: { input: ['1', 0], resize_type: 'scale by multiplier', 'resize_type.multiplier': mult, scale_method: 'lanczos' }, class_type: 'ResizeImageMaskNode' },
    3: { inputs: { resized_images: ['2', 0] }, class_type: 'SeedVR2Preprocess' },
    4: { inputs: { vae_name: 'seedvr2_ema_vae_fp16.safetensors' }, class_type: 'VAELoader' },
    5: { inputs: { unet_name: 'seedvr2_7b_int8_convrot.safetensors', weight_dtype: 'default' }, class_type: 'UNETLoader' },
    6: { inputs: { pixels: ['3', 0], vae: ['4', 0], tile_size: 512, overlap: 128, temporal_size: 4096, temporal_overlap: 8 }, class_type: 'VAEEncodeTiled' },
    7: { inputs: { model: ['5', 0], vae_conditioning: ['6', 0] }, class_type: 'SeedVR2Conditioning' },
    8: { inputs: { model: ['5', 0], seed, steps: 1, cfg: 1, sampler_name: 'euler', scheduler: 'simple', denoise: 1, positive: ['7', 0], negative: ['7', 1], latent_image: ['6', 0] }, class_type: 'KSampler' },
    9: { inputs: { samples: ['8', 0], vae: ['4', 0], tile_size: 512, overlap: 128, temporal_size: 4096, temporal_overlap: 8 }, class_type: 'VAEDecodeTiled' },
    10: { inputs: { images: ['9', 0], original_resized_images: ['2', 0], color_correction_method: 'lab' }, class_type: 'SeedVR2PostProcessing' },
    11: { inputs: { images: ['10', 0], filename_prefix: `exp/${tag}-up` }, class_type: 'SaveImage' },
  };
}

export function idolWorkflow({ image, tag, seed = 46, gaussians = 262144, steps = 20 }) {
  return {
    1: { inputs: { image }, class_type: 'LoadImage' },
    2: { inputs: { bg_removal_name: 'birefnet.safetensors' }, class_type: 'LoadBackgroundRemovalModel' },
    3: { inputs: { bg_removal_model: ['2', 0], image: ['1', 0] }, class_type: 'RemoveBackground' },
    4: { inputs: { image: ['1', 0], mask: ['3', 0], erode_radius: 1, size: 1024 }, class_type: 'TripoSplatPreprocessImage' },
    5: { inputs: { clip_name: 'dino_v3_vit_h_bf16.safetensors' }, class_type: 'CLIPVisionLoader' },
    6: { inputs: { vae_name: 'flux2-vae.safetensors' }, class_type: 'VAELoader' },
    7: { inputs: { vae_name: 'idol_decoder_fp16.safetensors' }, class_type: 'VAELoader' },
    8: { inputs: { unet_name: 'idol_fp16.safetensors', weight_dtype: 'default' }, class_type: 'UNETLoader' },
    9: { inputs: { clip_vision: ['5', 0], vae: ['6', 0], image: ['4', 0] }, class_type: 'TripoSplatConditioning' },
    10: { inputs: { model: ['8', 0], seed, steps, cfg: 3, sampler_name: 'dpmpp_2m', scheduler: 'simple', denoise: 1, positive: ['9', 0], negative: ['9', 1], latent_image: ['9', 2] }, class_type: 'KSampler' },
    11: { inputs: { samples: ['10', 0], vae: ['7', 0], num_gaussians: gaussians, seed: 790219963981395 }, class_type: 'VAEDecodeTripoSplat' },
    18: { inputs: { images: ['4', 0], filename_prefix: `exp/${tag}-input` }, class_type: 'SaveImage' },
    200: { inputs: { splat: ['11', 0], ...SOLID_MESH }, class_type: 'SplatToSolidMesh' },
    202: { inputs: { mesh: ['200', 0], target_face_count: 20000, placement_mode: 'qem', 'placement_mode.line_quadric_weight': 1, 'placement_mode.feature_edge_quadric_weight': 10, 'placement_mode.feature_edge_min_dihedral_deg': 30, 'placement_mode.clamp_v_to_edge': true }, class_type: 'DecimateMesh' },
    203: { inputs: { mesh: ['202', 0], crease_angle: 40 }, class_type: 'MeshSmoothNormals' },
    204: { inputs: { mesh: ['203', 0], segmenter: 'pec', resolution: 2048, padding: 1, weld_distance: 0.0002 }, class_type: 'UnwrapMesh' },
    205: { inputs: { mesh: ['204', 0], splat: ['11', 0], texture_size: 2048, resolution: 384, thickness: 0.6, color_sharpen: 2, min_opacity: 0.05, search_depth: 6, search_out: 6, alpha_gain: 2, reference_mesh: ['200', 0] }, class_type: 'BakeSplatTexture' },
    206: { inputs: { mesh: ['204', 0], base_color: ['205', 0] }, class_type: 'ApplyTextureToMesh' },
    207: { inputs: { mesh: ['206', 0], crease_angle: 40 }, class_type: 'MeshSmoothNormals' },
    208: { inputs: { mesh: ['207', 0], filename_prefix: `exp/${tag}-meshx` }, class_type: 'SaveGLB' },
  };
}
