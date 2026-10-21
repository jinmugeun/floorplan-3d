# 텍스처 출처(계획 17 · 계획 18)

- `metal-brushed/` — ambientCG "Metal009"(https://ambientcg.com/view?id=Metal009), CC0 1.0. 1K JPG → WebP 1024²(`tools/look/textures.mjs`). 스테인리스 형상의 헤어라인.
- `granite-gray/` — ambientCG "Granite002A"(https://ambientcg.com/view?id=Granite002A), CC0 1.0. 같은 변환. 마감재 '그레이 칩 에폭시'(계획 17 Task 7).
- `mma-darkgray/` · `mma-gray/` · `mma-black/` · `mma-beige/` · `mma-yellow/`(색 지도) · `mma-grit/`(법선·거칠기) · `ud200/`(색·법선·거칠기) — 바닥 코팅(계획 18). 이 프로젝트가 절차적으로 생성했다(제3자 자료 없음). 생성 도구 `tools/look/floor-textures.mjs`(sharp · 시드 고정 · 외부 다운로드 없음 — 같은 입력이면 같은 파일). MMA 칩의 색·덮임 팔레트는 사용자가 준 제조사 견본 캡처(MMA 논슬립 규사컬러 · BASF Ucrete UD200/MF)에서 뽑아 도구 안 상수로 두었다(캡처는 저장소 밖). Ucrete 색은 텍스처가 아니라 카탈로그 `tint`다.

CC0이라 출처 표기 의무는 없지만 어디서 왔는지 남긴다.
