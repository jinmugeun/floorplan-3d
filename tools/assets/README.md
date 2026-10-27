# 제품 3D 에셋 — 도구와 생성 절차서

`tools/assets/`는 제품 실사 3D 모델(glTF)을 앱 규약에 맞춰 `public/models/<제품 id>.glb`로 만들고 검사하는 도구다(계획 15 · 2026-10-13).
규약의 정본은 아키텍처 문서 §19(`docs/superpowers/plans/2026-09-17-plan2-architecture.md` — 저장소 밖)다. 이 문서는 그 요약과 **생성 트랙(ComfyUI · GPU) 절차서**다.
근거 조사: `docs/superpowers/plans/2026-10-06-research-comfyui-trellis2.md`(이하 "조사"). 수치·URL은 2026-10-13에 다시 확인했다(템플릿 JSON · Hugging Face 파일 목록).

## 0. 도구 한눈에

| 파일 | npm | 하는 일 |
|---|---|---|
| `lib.mjs` | — | 순수 함수: 정규화(`normalizeTransform`) · 예산(`ASSET_BUDGET` · `checkManifestEntry`) · manifest 항목 · NOTICE 본문 · 검수 시트 격자 |
| `pack.mjs` | `assets:pack` | GLB/glTF 하나 → 정규화 · 감량 · 텍스처 WebP · meshopt → `public/models/<id>.glb` + `manifest.json` + `NOTICE.md` |
| `check.mjs` | `assets:check` | manifest 전 항목을 파일과 대조(존재 · bytes · sha256 · 예산) — 게이트, 문제면 종료 1 |
| `seed.mjs` + `sources.json` | `assets:seed` | Poly Haven CC0 시드 7종 받기(md5 검증) → pack |
| `snapshot.mjs` + `browser.mjs` | `assets:snapshot` | 프리뷰 빌드에서 제품마다 여섯 장(앞·뒤·좌·위 + 원근 둘) → `snapshots/<id>.png` 검수 시트 |
| `perf.mjs` | `assets:perf` | 의자 100개 장면의 첫 프레임 · 궤도 프레임 간격 · draw · 메모리 |
| `comfy-lib.mjs` · `comfy-batch.mjs` | `assets:comfy` | **ComfyUI 일괄 생성**: 사진 올리기 → 워크플로 제출 → 폴링 → GLB 받기 → (선택) pack |
| `incoming/` | — | 생성 원본 GLB(수 MB · `.gitignore` — 커밋하지 않는다) |

## 1. 규약(요약 — 정본은 아키텍처 §19)

- 파일 `public/models/<제품 id>.glb` 하나(바이너리 glTF 2.0) · 단위 m · 원점 = 바닥 중심(y = 0) · +Y 위 · **정면 +Z**(등받이·헤드보드가 −Z — 2D 심벌·조합 형상과 같다).
- 축: x = 너비 w · y = 높이 h · z = 깊이 d(카탈로그 size `[w, d, h]` mm).
- 포장은 **균일 배율**: 가장 큰 축을 카탈로그 size에 맞추고 나머지 축의 fit(맞춘 길이 / 카탈로그 길이)이 **0.85 이상**(생성 모델은 **0.75 이상** — 2026-10-15 계획 15b: 사진 한 장 복원의 비율 오차 15~20 %)이어야 통과. 런타임은 아이템 size에 축별로 늘려 맞춘다.
- 예산: ≤ 1.5 MB · 삼각형 ≤ 10,000 · 텍스처 ≤ 1024²(생성 모델은 삼각형 ≤ 20,000 · 텍스처 ≤ 2048² — 2026-10-27 §12) · 확장은 meshopt · 양자화 · WebP 등 허용 목록만(Draco·KTX2 입력은 받지 않는다).

## 2. 생성 트랙 — 어디서 돌리나

이 PC(인텔 UHD 730, NVIDIA 없음)에서는 TRELLIS.2/Pixal3D가 돌지 않는다. 고르는 것은 사용자다(조사 §2).

| 선택 | 비용 | 장단 |
|---|---|---|
| **A. 16 GB NVIDIA PC**(RTX 4060 Ti 16G · 4080 · 5070 Ti) | 0 | Windows 포터블 그대로. 1024³까지 무난, 1536³는 메모리 부족 위험(제3자 보고) |
| **B. RunPod RTX 4090 24 GB** | 커뮤니티 0.34 $/h · 보안 0.69 $/h | 1024³ 약 1분/개 → 아래 목록 64종 ≈ 1.1~2시간 → **1~2달러**. 이 PC에서 `assets:comfy`로 원격 서버에 붙는다 |
| **C. Comfy Cloud** | 무료 400 크레딧/월(예제 워크플로 1회 6 크레딧) · Standard 20 $/월 4,200 크레딧 | 설치 없음. 64종 × 6 = 384 크레딧이라 무료분으로 한 번 돌 수 있지만 다시 돌릴 여유가 거의 없다. 안정판이라 nightly 노드가 늦을 수 있다. **스크립트는 쓰지 않는다**(웹에서 한 장씩) |

권장 순서(조사 §10): B(또는 A)에서 **첫 시험 5종**으로 TRELLIS.2와 Pixal3D를 비교 → 설정 확정 → 일괄.

## 3. 설치

### 3.1 모델 파일(A·B 공통 — 템플릿 노트 · Hugging Face 2026-10-13)

템플릿 "Pixal3D & TRELLIS.2: Image to Model"(`templates/3d_pixal3d_trellis2_image_to_model.json`)은 아래 7개를 쓴다. 저장소 폴더 이름이 ComfyUI `models/` 아래 폴더와 같다.
템플릿에 TRELLIS.2와 Pixal3D 로더가 **둘 다** 있어 둘 다 받는다(한쪽만 쓰려면 다른 쪽 로더를 지우고 다시 저장). 합 ≈ 15.2 GB → 디스크 30 GB 이상.

| 파일 | 받는 곳(`https://huggingface.co/…/resolve/main/` 뒤) | 크기 | `ComfyUI/models/` 아래 |
|---|---|---|---|
| trellis_2_int8_convrot.safetensors | `Comfy-Org/TRELLIS.2` · `diffusion_models/…` | 5.25 GB | `diffusion_models/` |
| pixal3d_int8_convrot.safetensors | `Comfy-Org/Pixal3D` · `diffusion_models/…` | 5.58 GB | `diffusion_models/` |
| trellis_2_shape_vae_bf16.safetensors | `Comfy-Org/Pixal3D` · `vae/…` | 1.10 GB | `vae/` |
| trellis_2_texture_vae_bf16.safetensors | `Comfy-Org/Pixal3D` · `vae/…` | 0.95 GB | `vae/` |
| dino_v3_L_naf_fp32.safetensors | `Comfy-Org/Pixal3D` · `clip_vision/…` | 1.22 GB | `clip_vision/` |
| moge_2_vitl_normal_fp16.safetensors | `Comfy-Org/MoGe` · `geometry_estimation/…` | 0.66 GB | `geometry_estimation/` |
| birefnet.safetensors | `Comfy-Org/BiRefNet` · `background_removal/…` | 0.44 GB | `background_removal/` |

24 GB 카드라면 int8 대신 `trellis_2_bf16.safetensors`(10.34 GB)를 쓸 수 있다(로더의 파일 이름도 바꾼다). 템플릿을 열었을 때 뜨는 "missing models" 목록이 늘 정본이다.

### 3.2 A. 16 GB NVIDIA PC(Windows 포터블 — 조사 §3)

1. `ComfyUI_windows_portable_nvidia.7z`(CUDA 13 · Python 3.13 — GTX 10 시리즈는 `_cu126.7z`)를 받아 **공백 없는 경로**(예: `C:\ComfyUI`)에 푼다.
2. `update\update_comfyui.bat`로 최신으로(템플릿이 nightly 노드를 쓴다 — 안정판이면 "missing node").
3. 3.1의 7개 파일을 브라우저로 받아 `C:\ComfyUI\ComfyUI\models\<폴더>`에 둔다.
4. `run_nvidia_gpu.bat` → http://127.0.0.1:8188 . 같은 PC에서 돌리면 `--server`는 기본값 그대로, 이 PC에서 그 PC로 붙으려면 ComfyUI를 `--listen 0.0.0.0`으로 띄우고 `--server http://<그 PC IP>:8188`.

### 3.3 B. RunPod RTX 4090

1. Pods → Deploy: GPU **RTX 4090**, ComfyUI가 든 템플릿, 볼륨 디스크 40 GB 이상(모델 15 GB + ComfyUI).
2. Pod가 뜨면 Connect의 HTTP 8188 주소를 연다(형식 `https://<pod-id>-8188.proxy.runpod.net` — 화면에 나온 주소를 그대로 쓴다).
3. 템플릿의 ComfyUI가 0.34(2026-08 · TRELLIS.2/Pixal3D 네이티브 지원) 이전이면 업데이트하고 재시작한다(Manager의 Update ComfyUI 또는 터미널에서 ComfyUI 폴더 `git pull`).
4. 웹 터미널에서 모델을 받는다(ComfyUI 폴더 위치는 템플릿마다 다르다 — `models/`가 있는 곳):
   ```sh
   cd /workspace/ComfyUI/models          # 템플릿에 맞게
   HF=https://huggingface.co
   wget -nc -P diffusion_models    $HF/Comfy-Org/TRELLIS.2/resolve/main/diffusion_models/trellis_2_int8_convrot.safetensors
   wget -nc -P diffusion_models    $HF/Comfy-Org/Pixal3D/resolve/main/diffusion_models/pixal3d_int8_convrot.safetensors
   wget -nc -P vae                 $HF/Comfy-Org/Pixal3D/resolve/main/vae/trellis_2_shape_vae_bf16.safetensors
   wget -nc -P vae                 $HF/Comfy-Org/Pixal3D/resolve/main/vae/trellis_2_texture_vae_bf16.safetensors
   wget -nc -P clip_vision         $HF/Comfy-Org/Pixal3D/resolve/main/clip_vision/dino_v3_L_naf_fp32.safetensors
   wget -nc -P geometry_estimation $HF/Comfy-Org/MoGe/resolve/main/geometry_estimation/moge_2_vitl_normal_fp16.safetensors
   wget -nc -P background_removal  $HF/Comfy-Org/BiRefNet/resolve/main/background_removal/birefnet.safetensors
   ```
5. 이 PC에서 `npm run assets:comfy -- --server https://<pod-id>-8188.proxy.runpod.net …`(6절).
6. **끝나면 Pod를 Terminate**(멈춰 둔 Pod도 디스크 요금이 붙는다). 결과 GLB는 이미 이 PC의 `tools/assets/incoming/`에 있다.

### 3.4 C. Comfy Cloud

설치 없음. 웹에서 같은 템플릿을 열어 4절 설정을 넣고 제품마다 사진을 바꿔 실행 → 결과 GLB를 내려받아 `tools/assets/incoming/<제품 id>.glb`로 두고 7절 2번(`assets:pack`)부터 같은 길이다.

## 4. 워크플로 준비(한 번)

1. 템플릿 라이브러리에서 **"Pixal3D & TRELLIS.2: Image to Model"**을 연다.
2. 우리 값으로 바꾼다(조사 §6 — 기본값은 게임 원본용이라 그대로면 수십 MB · 70만 면):

| 노드(템플릿 2026-10-13) | 템플릿 값 | 우리 값 |
|---|---|---|
| PrimitiveBoolean "Switch to Trellis2" | false = **Pixal3D** | 첫 시험에서 둘 다(true = TRELLIS.2) → 나은 쪽 |
| Trellis2UpsampleStage | 1536 | **1024**(16 GB) · 24 GB면 1536도 가능 |
| DecimateMesh.target_face_count | 700,000 | **20,000**(생성 예산 · pack의 생성 기본 `--tris 20000`과 같게 — 두 번 감량하지 않게) |
| DecimateMesh.placement_mode | midpoint | **qem** · line_quadric_weight 1 · feature_edge_quadric_weight 10 · feature_edge_min_dihedral_deg 30 · clamp_v_to_edge 켬 — midpoint로 크게 줄이면 판이 구겨진다(§12 2026-10-27) |
| RemeshMesh.smooth_iters | 20 | **3**(노드 설명의 권장 2~3 — 많으면 모서리가 뭉개진다) |
| MeshSmoothNormals.crease_angle(두 개) | 180 | **40**(각진 기구 — 노드 설명 30~60) |
| PrimitiveInt "Texture Resolution"(→ UnwrapMesh · BakeTextureFromVoxel) | 4096 | **2048**(생성 예산 · pack의 생성 기본 `--tex 2048`) |
| BakeNormalMapFromMesh | 2048 | 1024(멀리서 보는 제품이면 빼도 된다) |
| BakeAmbientOcclusion | 1024 · 64 | 512 · 32(또는 뺀다) |
| LoadImage.image · Save3DAdvanced.filename_prefix | 예제 사진 · `3d/ComfyUI` | 손대지 않는다 — **스크립트가 제품마다** `<id>.png` · `3d/<id>`로 바꾼다 |

3. 예제 사진으로 한 번 돌려 GLB가 나오는지 본다.
4. **API 형식으로 저장**: 설정에서 Dev mode를 켜면 생기는 **Save (API Format)**(새 화면은 Workflow → **Export (API)**). 보통 저장(UI 형식 — `nodes` 배열)은 스크립트가 거부한다.
   API 형식은 `{ "<노드 id>": { "class_type": …, "inputs": … } }`이고 스크립트는 `class_type`으로 `LoadImage` 하나 · `Save3DAdvanced`(또는 `SaveGLB`) 하나를 찾는다(둘 이상이면 멈춘다).
   확정된 파일은 `tools/assets/comfy-workflow.api.json` 같은 이름으로 커밋해 두면 다음 일괄이 같은 설정으로 돈다.

## 5. 입력 사진 규칙

- 제품 **하나만**, 흰색·단색 배경(배경은 BiRefNet이 지우지만 깨끗할수록 낫다), 1024 px 이상, 그림자·소품 없이.
- **정면 = 앱의 +Z**: 사람이 다가가 쓰는 쪽(의자 앉는 쪽 · 냉장고 문 · 레인지 손잡이 · 싱크 앞 · 침대 발치 · 옷장 문)을 카메라 쪽에 두고, 정면에서 약 45° 위에서 찍은 사진(조사 §6).
  스크립트는 기본으로 `--front +z`(사진 찍은 쪽 = 모델 +Z)로 포장한다 — 첫 시험의 검수 시트에서 반대로 나오면 일괄에 `--front -z`를 준다.
- 파일 이름은 **`<제품 id>.png`**(또는 .jpg · .jpeg · .webp) — 한 폴더에 모은다. 크기만 다른 변형(침대 4 · 옷장 2 · 싱크 2 · 식탁)은 비율이 달라 **따로 찍어 따로 생성**한다(한 모델을 늘리면 fit 하한 0.85에 걸리거나 늘어나 보인다).
- **쓸 권리가 있는 사진만**: 직접 찍은 사진 · CC0 사진 · 허락받은 제조사 사진. 제조사 카탈로그 사진을 허락 없이 쓰지 않는다(생성 모델은 사진의 2차 저작물이 될 수 있다).
- 제조사 사진이 여러 방향으로 있으면 "Pixal3D: Multi Views to 3D" 템플릿이 낫다(스크립트는 LoadImage 하나인 워크플로만 받는다 — 그때는 웹에서).

## 6. 실행

```sh
# 첫 시험(조사 §10): 냉장고 · 6구 레인지 · 2조 싱크 + 시드와 비교할 의자 · 식탁 — 시드가 있는 제품은 --pack 없이(덮어쓰지 않게)
npm run assets:comfy -- --server https://<pod-id>-8188.proxy.runpod.net --workflow tools/assets/comfy-workflow.api.json --images D:/photos --products fridge-2door,range-gas-6,sink-double --pack
npm run assets:comfy -- --server https://<pod-id>-8188.proxy.runpod.net --workflow tools/assets/comfy-workflow.api.json --images D:/photos --products chair-dining,dining-6 --out tools/assets/incoming/compare
# 일괄(9절 목록을 붙여 넣는다)
npm run assets:comfy -- --server … --workflow … --images … --products <목록> --pack
```

| 옵션 | 기본 | 뜻 |
|---|---|---|
| `--server` | `http://127.0.0.1:8188` | ComfyUI 주소(RunPod 프록시 주소 그대로) |
| `--workflow` | (필수) | 4절의 API 형식 JSON |
| `--images` | (필수) | `<제품 id>.png` 등이 든 폴더 |
| `--products` | (필수) | 쉼표로 제품 id |
| `--out` | `tools/assets/incoming` | 원본 GLB를 둘 곳(`<id>.glb`) |
| `--pack` | 끔 | 받자마자 `pack.mjs`로 `public/models`까지(manifest · NOTICE 갱신) — **있는 모델을 덮는다** |
| `--front` | `+z` | pack에 넘길 정면 축(+z · -z · +x · -x) |
| `--author` · `--license` | `ComfyUI TRELLIS.2/Pixal3D 생성` · `자체 생성물` | NOTICE의 작가 · 라이선스 칸 |

- 시작 전에 다 확인하고 멈춘다: 제품 id(카탈로그) · 사진 · 워크플로 형식과 노드 · 서버(`/system_stats` — GPU 이름과 VRAM을 찍는다).
- 제품마다 차례로: `POST /upload/image` → `POST /prompt` → `GET /history/<id>` 2초 간격(한도 30분 · 잠깐의 502는 3번 연속까지 견딘다) → `GET /view`로 접두사 `3d/<id>`인 GLB.
- 하나가 실패해도(메모리 부족 · 검증 오류 · 예산 밖) 다음으로 간다. **시간 초과만은 멈춘다**: 그 작업을 서버에서 취소하고(`POST /queue {"delete":[id]}` → `POST /interrupt {"prompt_id":id}`) 남은 제품은 돌리지 않는다 — 30분 안에 못 끝낸 서버(멎은 노드 · 막힌 큐)에 다음 제품을 넣으면 그 뒤에 줄을 서 또 시간 초과, 남은 제품마다 30분씩 유료 GPU를 태운다.
- 끝에 표와 `다시: --products …` 한 줄(실패 + 멈춰서 돌지 않은 제품) · 실패가 있으면 종료 1.

## 7. 생성 뒤 — 포장 → 게이트 → 검수 → 카탈로그 → NOTICE

1. (`--pack`을 안 줬다면) 포장:
   `npm run assets:pack -- tools/assets/incoming/<id>.glb --product <id> --front +z --source-kind generated --author "ComfyUI TRELLIS.2/Pixal3D 생성" --license "자체 생성물"`
   (`--source-kind generated`면 감량·텍스처 기본이 생성 예산 2만 면 · 2048이다. 사진 출처 URL을 남기려면 `--source-url <URL>`을 더한다. 정면이 틀렸을 때도 생성은 다시 하지 않고 이 명령을 `--front`만 바꿔 다시 돌린다.)
2. `npm run assets:check` — 종료 0이어야 한다. fit이 걸리면(시드 0.85 · 생성 0.75 미만) 사진 비율·구도를 바꿔 다시 생성하거나 그 제품은 상자로 둔다(특히 얇은 제품: 인덕션 · TV · 매트리스 · 벽거울 · 형광등).
3. 카탈로그에 `asset: '<id>'`를 단다(`src/products/catalog.js` · `catalogExtra.js` — 값 = 제품 id). 앱은 asset이 있는 제품만 모델을 받으므로 **검수 시트보다 먼저** 단다.
4. `npm run build` → `npm run assets:snapshot -- --only <id,…>` → `tools/assets/snapshots/<id>.png`.
5. 검수(사람이 시트를 본다): 정면이 +Z인가(평면도에서 정면이 아래 · 좌측도에서 오른쪽) · 구멍 · 뒤집힌 면 · 비율 · 질감 번짐 · 천장 제품은 윗면이 천장에 닿는가.
   떨어지면 그 제품의 asset을 빼고 `public/models/<id>.glb` · manifest · NOTICE를 되돌린다(`git restore public/models NOTICE.md`) — 또는 사진을 바꿔 다시 생성.
6. NOTICE: pack이 저장소 manifest를 쓸 때마다 `NOTICE.md`를 다시 만든다(손대지 않는다). 생성 항목이 생기면 생성 경로 문장이 붙고 표에 작가 · 라이선스가 들어간다.
7. 테스트: `tests/assetsCatalog.test.js`는 지금 시드 7종(`SEEDS` · source polyhaven)을 고정한다 — 첫 생성 모델을 넣을 때 "manifest = 시드 + 생성 목록 · 생성 source = `{ kind: 'generated', url: null, license, author }`"로 넓힌다.
8. `npm test` · `npm run build`(모델은 `public/`이라 index 청크는 그대로) · `npm run assets:check` → GLB · manifest · NOTICE · 시트 · 카탈로그를 함께 커밋(`.gitattributes`가 `*.glb`를 바이너리로 둔다).

## 8. 라이선스(조사 §8 · Hugging Face 메타데이터 2026-10-13)

| 구성 요소 | 라이선스 | 상용 · 결과물 |
|---|---|---|
| ComfyUI | GPL-3.0 | 도구로 쓰는 것 · 결과물은 무관 |
| TRELLIS.2 가중치(Comfy-Org/TRELLIS.2 ← microsoft/TRELLIS.2-4B) | MIT | 가능 |
| Pixal3D 가중치(Comfy-Org/Pixal3D ← TencentARC/Pixal3D) | MIT | 가능(Hunyuan 계열이 아니다) |
| 네이티브 후처리 노드(리메시 · 굽기) | ComfyUI 코어(PyTorch · SciPy 재구현) | 가능 — **nvdiffrast 없음** |
| BiRefNet | MIT | 가능 |
| MoGe | 재포장 저장소 메타데이터 MIT(원본 microsoft/moge — 확인 권장) | 전처리(화각 추정) 전용 |
| DINOv3(dino_v3_L_naf_fp32) | Meta DINOv3 라이선스 — **확인 필요**(재포장 저장소 메타데이터는 MIT지만 원본 라이선스가 우선) | 특징 추출 전용 · 결과물에 가중치가 들지 않는다 |
| 입력 사진 | 사진마다 | 5절 — 쓸 권리가 있는 것만 |

쓰지 않는 것: 원본 TRELLIS.2 저장소 경로(nvdiffrast · nvdiffrec 비상업) · **Tencent Hunyuan3D 계열**(라이선스가 한국을 지역에서 뺀다).

## 9. 생성 대상(2026-10-13 카탈로그 90종 = 시드 7 + 생성 64 + 대상 아님 19)

Poly Haven에 맞는 것이 없던 제품이다. 침대 · 냉장고 · 레인지가 대표다.

**1순위 — 급식실 · 주방(28)** · 이 앱의 주 용도. 제조사 CAD가 있는 기구는 생성보다 CAD 감량이 낫다(조사 §9).
```
fridge-2door,fridge-kimchi,range-gas-6,range-gas-high,range-induction,oven-built,dishwasher,dishwasher-conveyor,warmer-cabinet,coffee-machine,ricecooker-gas,soup-kettle,wok-kettle,griddle-electric,steamer-combi,worktable-1800,serve-counter,sink-double,sink-single,shelf-steel-4,cabinet-upper,cabinet-lower,hood-wall,hood-box,hood-box-filter,fan-exhaust-700,fan-supply-filter,fan-wall-500
```
2도어 냉장고 · 김치냉장고 · 업소용 6구 레인지 · 가스높은렌지 · 인덕션(얇다) · 빌트인 오븐 · 식기세척기 · 컨베이어 식기세척기 · 보온고 · 에스프레소 머신 · 가스자동취반기 · 국솥 · 볶음솥 · 전기부침기 · 콤비스티머 · 스테인리스 작업대 · 배식대 · 2조/1조 싱크대 · 4단 스틸 선반 · 상부장 · 하부장 · 벽걸이 후드 · 천장형 배기 후드 2 · 배기팬 · 급기 필터팬 · 벽부형 환기팬.

**2순위 — 주거 · 교실 · 사무(36)**
```
washer-drum,dryer,aircon-stand,tv-55,bed-single,bed-super-single,bed-queen,bed-king,mattress-queen,wardrobe-1200,wardrobe-1800,hanger-open,drawer-5,bookshelf,storage-box,sofa-2,sofa-corner,sofa-recliner,desk-1400,dining-4,stool-round,bench-1200,vanity-800,dresser,mirror-wall,washbasin,toilet,bathtub,shower-booth,light-ceiling,light-fluorescent,light-wall,bar-counter,locker-12,meeting-table-2400,lectern
```
드럼세탁기 · 건조기 · 스탠드 에어컨 · TV 55(얇다) · 침대 4(싱글 · 슈퍼싱글 · 퀸 · 킹) · 퀸 매트리스(얇다) · 옷장 2 · 오픈 행거 · 5단 서랍장 · 책장 · 수납 박스 · 2인/코너 소파 · 리클라이너 · 책상 · 4인 식탁(예비 시드 wooden_table_02는 fit 0.83으로 탈락) · 원형 스툴 · 벤치 · 화장대 · 드레서 · 벽거울(얇다) · 세면대 · 변기 · 욕조 · 샤워부스 · 원형 천장등 · 형광등(얇다) · 벽등 · 바 카운터 · 사물함 · 회의 탁자 · 교탁.

**교체 후보(1)**: `chair-office` — 시드(GreenChair_01)가 고풍 팔걸이의자라 이름(사무용 회전 의자)과 다르다(계획 15 Task D 검수). 생성 결과가 낫으면 바꾼다(`--pack` 전에 시드 manifest 항목이 덮인다는 것을 알고).

**대상 아님(19)** — 지금의 조합 형상이 맞다:
- 문 6 · 창 3: 벽 구멍과 짝인 두께 40 mm 판이라 균일 맞춤 fit 하한에 못 맞고, 문짝 · 유리 조합 형상이 이미 있다.
- 개구부(`opening-pass`): 3D에 그리지 않는다(items3d — `kind === 'opening'`).
- 기둥 2: 구조물 — 상자 · 원기둥이 정확하다.
- 도면 기구(`equip-generic`): DXF 기구 블록의 자리표시라 크기가 도면마다 다르다(한 모델을 축별로 늘리면 일그러진다).
- 디퓨저 3 · 환기캡 2 · 매입 다운라이트: 천장 · 벽의 평판 · 소형 부품 — 상자로 충분하다.

## 10. 문제 해결

| 증상 | 원인 · 할 일 |
|---|---|
| 웹에서 "missing node" | 안정판 ComfyUI — nightly로 업데이트(템플릿이 nightly 노드를 쓴다) |
| `제출 실패 HTTP 400 … UNETLoader … not in list` | 모델 파일이 없거나 폴더가 틀렸다(3.1) |
| `제출 실패 … LoadImage … Invalid image file` | 사진 파일이 깨졌거나 이미지가 아니다 — `--images`의 `<id>.png`를 열어 본다 |
| `생성 실패 … CUDA out of memory` | Upsample 1536 → 1024, 텍스처 1024, AO 끄기(4절) · 16 GB에서 bf16 → int8 |
| `시간 초과 1800초 … 서버 작업 취소 요청함` · 일괄이 멈춤 | 서버가 30분 안에 못 끝냈다(멎은 노드 · 다른 작업이 큐를 막음). 스크립트가 그 작업을 취소 요청했지만 인터럽트는 노드 사이에서만 먹는다 — `<server>/queue`의 running · pending이 비었는지 본다(남았으면 웹의 Queue에서 지우거나 ComfyUI 재시작 · RunPod면 Pod 재시작) → 찍힌 `다시: --products …`를 그대로 |
| `시간 초과 … 서버 작업 취소 실패(…)` | 취소 요청도 닿지 않았다(서버 · 프록시가 멎음) — 위와 같이 `/queue`를 직접 비우고 다시 |
| `출력에 접두사 3d/<id>의 GLB가 없다` | 저장 노드가 GLB가 아닌 형식으로 썼거나 다른 노드의 접두사를 바꿨다 — 오류 문구의 "찾은 것"과 저장 노드 설정(GLB)을 본다 |
| `assets:check`의 `fit` | 사진의 비율 · 구도가 카탈로그 size와 다르다 — 정면 사진으로 다시, 또는 상자로 둔다 |
| 시트에서 정면이 뒤 | 다시 생성하지 말고 `assets:pack`을 `--front -z`로(7절 1번) — 일괄 전체가 그렇다면 `assets:comfy`에 `--front -z` |

## 11. 2026-10-15 첫 실행 기록(계획 15b)

- 서버: 사용자 GPU 서버의 컨테이너 gpu-comfy(RTX 5070 Ti 16 GB · ComfyUI 0.40.0 · http://192.168.11.65:8188). 모델 7개는 `C:\comfy\ComfyUI\models`.
- 워크플로: 템플릿을 화면에서 열어 4절 값으로 바꾼 뒤 `app.graphToPrompt().output`으로 뽑은 `comfy-workflow.api.json`(Pixal3D) · `comfy-workflow-trellis2.api.json`(TRELLIS.2). **안 쓰는 쪽 UNETLoader와 스위치 노드를 지운 57노드 버전** — 둘 다 두면 16 GB에서 첫 실행이 OOM(KSampler)이었다.
- 비교(시드 렌더 입력): TRELLIS.2 채택 — 의자 fit [0.85, 1, 0.96] · 식탁 [0.98, 1, 0.97]. Pixal3D는 기울고 비율이 깨졌다([0.42~0.83]).
- 실사진(S2B) 5종: 가스레인지·세정대 좋음, 바닥 그림자가 있는 사진은 넓은 바닥판이 붙고, 합성 사진(두 대 + 열린 문)은 덩어리가 갈라진다 — 제품 하나 · 바닥 그림자 없음 · 콜라주 아님을 고른다.
- 생성 모델은 metallic 1 + MR 텍스처라 **환경 맵이 없으면 검게** 보인다 — 앱은 에셋 재질에만 RoomEnvironment PMREM을 건다(`src/view3d/envMap.js`).
- 첫 배포: `range-gas-3`(가스 테이블렌지 3구 · S2B 24441916) · `sink-single`(1조 세정대 · S2B 23907341). 원본 GLB·비교 렌더는 `tools/assets/incoming/s2b-trellis2/`(커밋 안 함)와 `.superpowers/sdd/scratch/p15-gen/compare/`.

## 12. 2026-10-27 생성 품질 고침(설정 2)

- 증상: 두 생성 모델의 넓은 판(가스레인지 상판·선반 · 싱크 앞판·테두리)이 구겨지고 화구 받침·손잡이가 뭉개졌다.
- 원인(같은 사진·시드로 단계별 GLB를 받아 확인): TRELLIS.2가 막 만든 형상(가스레인지 1,020만 면)은 멀쩡했다. **DecimateMesh `midpoint`로 8천 면(약 1/1,300)까지 줄이는 단계**가 판을 구겼다.
  같은 원본을 meshoptimizer로 8천 면까지 줄이거나, 노드를 `qem`으로만 바꿔도 깨끗했다. 부원인: RemeshMesh smooth_iters 20(권장 2~3) · 노멀 crease 180 · 1K 텍스처(591조각 아틀라스) · 작은 입력 사진(800 · 567 px).
  앱 재질·조명과 int8 가중치는 원인이 아니었다(요철 텍스처를 빼도 그대로였다).
- 고침(사용자 선택 '설정 2' · 4절 표): DecimateMesh 20,000면 · `qem` · 다듬기 3 · crease 40 · 텍스처 2048. 예산은 생성 모델만 2만 면 · 2048²(`ASSET_BUDGET.trisGenerated` · `textureGenerated`)로 올렸고, 시드는 그대로다.
- 결과: `range-gas-3` 18,589 삼각형 · 1,266,704 B · `sink-single` 19,256 삼각형 · 674,344 B(전에는 7,901 · 624 KB / 7,807 · 388 KB).
- **싱크대만 예외 — `placement_mode.clamp_v_to_edge` 끔**: 워크플로 그대로(켬) 만든 싱크대는 그릇 안쪽 모서리에 삼각형 조각이 솟았다(qem 접힘 — 8천 면은 양 끝 둘 · 2만 면은 하나, 돌릴 때마다 자리가 바뀐다).
  끄면 사라졌다. 같은 설정을 가스레인지에 주면 아래 타공 선반의 구멍이 커져서, 워크플로 파일은 켬으로 두고 싱크대만 노드 186의 이 값을 false로 바꿔 만들었다.
  다른 시험 — 모서리 가중 1: 조각 그대로 · 6만 면 → pack 2만: 긁힌 줄무늬 · 다듬기 20: 작은 접힘.
  다시 만들 때는 웹에서 이 값만 바꿔 돌리거나 같은 값을 넣은 워크플로 사본으로 `assets:comfy --products sink-single`.
  KSampler 시드를 고정해도 GPU에서 다시 돌리면 면 수가 1 % 안쪽으로 달라진다(실험 18,460 → 다시 18,589).
- 성능(`assets:perf --product range-gas-3 --n 20` · 인텔 UHD 730 · 3회 중앙값):
  - 궤도 간격(새 세션 / 캐시 뒤): 3.2 / 2.6 ms → 3.1 / 2.0 ms로 그대로다(조합 형상 상자는 6.3 ms).
  - 모델이 상자를 대신하는 첫 프레임: 473 / 329 ms → 539 / 424 ms. 2K WebP를 풀고 GPU에 올리는 시간이다(참고 지표 · 목표 3은 통과).
- 검수 시트 도구 고침: 모델 도착을 `__three.scenes` 아무 곳에서나 보던 대기가 GLTFLoader 장면에 먼저 걸렸다. 그래서 1.27 MB 모델의 첫 원근 칸이 상자로 찍혔다. 이제 렌더러가 마지막에 그린 앱 장면을 본다(`snapshot.mjs`).
- Pixal3D 워크플로(`comfy-workflow.api.json`)는 쓰지 않아(11절 — TRELLIS.2 채택) 그대로 두었다. 다시 쓰려면 4절 표의 값을 같이 넣는다.
- 1.5 MB에 걸리면(`range-gas-3`은 84 %) 그 제품만 `--tex 1024`로 다시 포장한다.
- 실험 원본은 `tools/assets/incoming/exp/` · `incoming/gen-20k/`(커밋하지 않는다).
