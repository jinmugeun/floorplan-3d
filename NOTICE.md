# NOTICE — 제품 3D 모델 출처

`public/models/`에 든 제품 3D 모델(GLB)의 출처·작가·라이선스다. `public/models/manifest.json`에서 `tools/assets/pack.mjs`가 만든다 — 손으로 고치지 않는다(`npm run assets:seed`·`assets:pack`이 다시 쓴다).
Poly Haven 에셋은 사이트 전체가 CC0-1.0(퍼블릭 도메인 헌정)이다 — https://polyhaven.com/license . 표기 의무는 없지만 출처와 작가를 남긴다. 포장 때 크기·축·원점을 앱 규약에 맞추고, 삼각형이 많으면 줄이고, 텍스처를 WebP로 바꿨다.
생성 모델(출처 종류 generated)은 제품 사진 한 장에서 만든 자체 생성물이다. 입력 사진은 S2B(학교장터) 등록 제품 사진과 제조사 공개 제품 사진이다 — 출처 칸이 그 사진(또는 제품 페이지) 주소다(입력 사진 규칙 `tools/assets/README.md` §5). 작가 칸에 TRELLIS.2가 있는 항목은 ComfyUI 네이티브 TRELLIS.2/Pixal3D(가중치 MIT · nvdiffrast 없는 경로)로 만들어 같은 규약으로 포장한 것이다.
Idol 생성 모델(작가 칸에 Idol)은 제품 사진(배경 지우기 BiRefNet · MIT · 짧은 변이 900 px보다 작으면 SeedVR2 7B로 키움 · Apache-2.0 — 작가 칸에 SeedVR2가 있는 항목)에서 ComfyUI Idol(가우시안 스플랫 · Apache-2.0 · FLUX.2 VAE Apache-2.0 · 영상 특징 DINOv3 · Meta DINOv3 License — 상업적 사용 허용)로 만들고, 우리 노드 splat_solid_mesh(tools/assets/idol/comfy-node)로 닫힌 메시와 질감을 구운 뒤 스테인리스 B 반광 재질을 입혀, 축마다 카탈로그 규격에 맞춰 포장한 것이다.

| 제품 | 이름 | 출처 | 작가 | 라이선스 |
|---|---|---|---|---|
| chair-dining | 식탁 의자 | https://polyhaven.com/a/painted_wooden_chair_01 | Kuutti Siitonen | CC0-1.0 (https://polyhaven.com/license) |
| chair-office | 사무용 의자 | https://polyhaven.com/a/GreenChair_01 | Kirill Sannikov | CC0-1.0 (https://polyhaven.com/license) |
| desk-student | 학생 책상 | https://polyhaven.com/a/SchoolDesk_01 | Ethan Place | CC0-1.0 (https://polyhaven.com/license) |
| dining-6 | 6인 식탁 | https://polyhaven.com/a/painted_wooden_table | Kirill Sannikov | CC0-1.0 (https://polyhaven.com/license) |
| k-202210055017379 | 곡물받침대(스텐) | https://www.s2b.kr/S2BNfiledata/remu_product/rema/2022/10/05/202210055017379_1664929939331.jpg | ComfyUI Idol(TripoSplat) + SeedVR2 업스케일 · splat_solid_mesh v4 · 스테인리스 B 반광 — 3dtodomyen 생성 | 자체 생성물 |
| k-202210055019220 | 잔반 회수통(이중잔반통) | https://www.s2b.kr/S2BNfiledata/remu_product/rema/2022/10/05/202210055019220_1664939728224.jpg | ComfyUI Idol(TripoSplat) + SeedVR2 업스케일 · splat_solid_mesh v4 · 스테인리스 B 반광 — 3dtodomyen 생성 | 자체 생성물 |
| k-202211225284092 | 높은 인덕션렌지 2구 | https://www.s2b.kr/S2BNfiledata/remu_product/rema/2022/11/22/202211225284092_1669103541278.jpg | ComfyUI Idol(TripoSplat) + SeedVR2 업스케일 · splat_solid_mesh v4 · 스테인리스 B 반광 — 3dtodomyen 생성 | 자체 생성물 |
| k-202303095951444 | 발판소독기 | https://www.s2b.kr/S2BNfiledata/remu_product/rema/2023/03/09/202303095951444_1678347541860.JPG | ComfyUI TRELLIS.2(옛 설정 8천 면) | 자체 생성물 |
| k-202303206019265 | 자동워터릴 | https://www.s2b.kr/S2BNfiledata/remu_product/rema/2023/03/20/202303206019265_1679304339602.jpg | ComfyUI Idol(TripoSplat) + SeedVR2 업스케일 · splat_solid_mesh v4 · 스테인리스 B 반광 — 3dtodomyen 생성 | 자체 생성물 |
| k-202506092622734 | 보냉고 2도어 | https://www.s2b.kr/S2BNfiledata/remu_product/rema/2025/06/09/202506092622734_1749456410658.jpg | ComfyUI Idol(TripoSplat) · splat_solid_mesh v4 · 스테인리스 B 반광 — 3dtodomyen 생성(원본 사진) | 자체 생성물 |
| k-202506092623836 | 보존식 냉동고(1식) | https://www.s2b.kr/S2BNfiledata/remu_product/rema/2025/06/09/202506092623836_1749459802691.jpg | ComfyUI Idol(TripoSplat) + SeedVR2 업스케일 · splat_solid_mesh v4 · 스테인리스 B 반광 — 3dtodomyen 생성 | 자체 생성물 |
| k-202602137002127 | 밀대짤통 | https://www.s2b.kr/S2BNfiledata/remu_product/rema/2026/02/13/202602137002127_1770966879456.jpg | ComfyUI Idol(TripoSplat) + SeedVR2 업스케일 · splat_solid_mesh v4 · 스테인리스 B 반광 — 3dtodomyen 생성 | 자체 생성물 |
| k-202606158754353 | 전기 인덕션 취반기 | https://ssung.kr/portfolio-category/pro01/ | ComfyUI Idol(TripoSplat) + SeedVR2 업스케일 · splat_solid_mesh v4 · 스테인리스 B 반광 — 3dtodomyen 생성 | 자체 생성물 |
| k-22796924 | 위생복 보관고(12벌) | https://www.s2b.kr/S2BNfiledata/remu_product/rema/2026/02/11/202602116956927_1770785248500.jpg | ComfyUI Idol(TripoSplat) + SeedVR2 업스케일 · splat_solid_mesh v4 · 스테인리스 B 반광 — 3dtodomyen 생성 | 자체 생성물 |
| k-22796938 | 청소도구 소독기 | https://www.s2b.kr/S2BNfiledata/remu_product/rema/2026/02/11/202602116957867_1770787468020.jpg | ComfyUI Idol(TripoSplat) + SeedVR2 업스케일 · splat_solid_mesh v4 · 스테인리스 B 반광 — 3dtodomyen 생성 | 자체 생성물 |
| k-23237948 | 신발장(외부신발소독) | https://www.s2b.kr/S2BNfiledata/remu_product/rema/2026/09/22/202609229500411_1790056927847.jpg | ComfyUI Idol(TripoSplat) · splat_solid_mesh v4 · 스테인리스 B 반광 — 3dtodomyen 생성(사진 짧은 변 900 px 이상 — 업스케일 안 함) | 자체 생성물 |
| k-23498622 | 야채절단기 및 믹서기테이블 겸용소독기 | https://www.s2b.kr/S2BNfiledata/remu_product/rema/2026/08/05/202608059182332_1785908748818.jpg | ComfyUI Idol(TripoSplat) + SeedVR2 업스케일 · splat_solid_mesh v4 · 스테인리스 B 반광 — 3dtodomyen 생성 | 자체 생성물 |
| k-23688167 | 에어커튼 | https://www.s2b.kr/S2BNfiledata/remu_product/rema/2026/06/02/202606028610413_1780387399175.jpg | ComfyUI Idol(TripoSplat) + SeedVR2 업스케일 · splat_solid_mesh v4 · 스테인리스 B 반광 — 3dtodomyen 생성 | 자체 생성물 |
| k-23907340 | 1조 세정대(STS 배수구) | https://www.s2b.kr/S2BNfiledata/remu_product/rema/2026/08/20/202608209273217_1787210833057.jpg | ComfyUI Idol(TripoSplat) + SeedVR2 업스케일 · splat_solid_mesh v4 · 스테인리스 B 반광 — 3dtodomyen 생성 | 자체 생성물 |
| k-23907341 | 1조 세정대(STS 배수구) | https://www.s2b.kr/S2BNfiledata/remu_product/rema/2026/08/20/202608209273322_1787210564264.jpg | ComfyUI TRELLIS.2 생성(S2B 23907341 사진) | 자체 생성물 |
| k-23907349 | 2조 세정대(STS 배수구) | https://www.s2b.kr/S2BNfiledata/remu_product/rema/2026/08/20/202608209273529_1787211828361.jpg | ComfyUI Idol(TripoSplat) + SeedVR2 업스케일 · splat_solid_mesh v4 · 스테인리스 B 반광 — 3dtodomyen 생성 | 자체 생성물 |
| k-24290770 | 초음파야채세척기(40kg/회) | https://www.s2b.kr/S2BNfiledata/remu_product/rema/2023/02/24/202302245877850_1677223878496.jpg | ComfyUI Idol(TripoSplat) + SeedVR2 업스케일 · splat_solid_mesh v4 · 스테인리스 B 반광 — 3dtodomyen 생성 | 자체 생성물 |
| k-24397271 | 복합 손세정대 | https://www.s2b.kr/S2BNfiledata/remu_product/rema/2026/10/14/202610149620953_1791963681062.jpg | ComfyUI Idol(TripoSplat) · splat_solid_mesh v4 · 스테인리스 B 반광 — 3dtodomyen 생성(사진 짧은 변 900 px 이상 — 업스케일 안 함) | 자체 생성물 |
| k-24430449 | 냉장 냉동고 4도어 | https://www.s2b.kr/S2BNfiledata/remu_product/rema/2026/08/13/202608139235143_1786610324865.JPG | ComfyUI Idol(TripoSplat) + SeedVR2 업스케일 · splat_solid_mesh v4 · 스테인리스 B 반광 — 3dtodomyen 생성 | 자체 생성물 |
| k-24742924 | 복합 소독보관고(조리실) | https://www.s2b.kr/S2BNfiledata/remu_product/rema/2026/03/05/202603057201869_1772709728706.JPG | ComfyUI Idol(TripoSplat) + SeedVR2 업스케일 · splat_solid_mesh v4 · 스테인리스 B 반광 — 3dtodomyen 생성 | 자체 생성물 |
| k-24756275 | 컵자동세척기 | https://www.s2b.kr/S2BNfiledata/remu_product/rema/2026/07/21/202607219076949_1784617384130.jpg | ComfyUI Idol(TripoSplat) + SeedVR2 업스케일 · splat_solid_mesh v4 · 스테인리스 B 반광 — 3dtodomyen 생성 | 자체 생성물 |
| k-25110875 | 트롤리 | https://www.s2b.kr/S2BNfiledata/remu_product/rema/2024/03/22/202403228371770_1711097095739.jpg | ComfyUI Idol(TripoSplat) + SeedVR2 업스케일 · splat_solid_mesh v4 · 스테인리스 B 반광 — 3dtodomyen 생성 | 자체 생성물 |
| k-25125194 | 다단식 운반차 | https://www.s2b.kr/S2BNfiledata/remu_product/rema/2024/03/26/202403268391893_1711429896880.jpg | ComfyUI Idol(TripoSplat) + SeedVR2 업스케일 · splat_solid_mesh v4 · 스테인리스 B 반광 — 3dtodomyen 생성 | 자체 생성물 |
| k-25157834 | 전기 물끓이기 | https://www.s2b.kr/S2BNfiledata/remu_product/rema/2024/03/12/202403128292876_1710231747769.jpg | ComfyUI Idol(TripoSplat) + SeedVR2 업스케일 · splat_solid_mesh v4 · 스테인리스 B 반광 — 3dtodomyen 생성 | 자체 생성물 |
| k-25255110 | 고정식 작업대 | https://www.s2b.kr/S2BNfiledata/remu_product/rema/2026/08/21/202608219276407_1787276910372.jpg | ComfyUI Idol(TripoSplat) + SeedVR2 업스케일 · splat_solid_mesh v4 · 스테인리스 B 반광 — 3dtodomyen 생성 | 자체 생성물 |
| light-pendant | 펜던트 조명 | https://polyhaven.com/a/modern_ceiling_lamp_01 | James Ray Cock | CC0-1.0 (https://polyhaven.com/license) |
| range-gas-3 | 가스 테이블렌지 3구 | https://www.s2b.kr/S2BNfiledata/remu_product/rema/2026/01/24/202601246554971_1769236508956.jpg | ComfyUI TRELLIS.2 생성(S2B 24441916 사진) | 자체 생성물 |
| side-table | 사이드 테이블 | https://polyhaven.com/a/painted_wooden_nightstand | Kirill Sannikov | CC0-1.0 (https://polyhaven.com/license) |
| sink-single | 1조 싱크대 | https://www.s2b.kr/S2BNfiledata/remu_product/rema/2026/08/20/202608209273322_1787210564264.jpg | ComfyUI TRELLIS.2 생성(S2B 23907341 사진) | 자체 생성물 |
| sofa-3 | 3인 소파 | https://polyhaven.com/a/sofa_02 | Kirill Sannikov | CC0-1.0 (https://polyhaven.com/license) |
