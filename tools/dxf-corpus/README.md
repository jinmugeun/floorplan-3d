# DXF 코퍼스 도구

여러 사무소의 실제 도면을 **앱과 같은 코드**로 돌려, 한 도면에 맞춘 수정이 다른 도면을 망가뜨리지 않는지 확인한다.
실파일은 저장소 밖에 둔다(기본 `../dxf`, 환경 변수 `DXF_DIR`로 바꾼다). 파일이 없는 항목은 건너뛴다.

| 명령 | 하는 일 |
|---|---|
| `npm run dxf:score` | 도면마다 지표(벽·방·이름 붙은 방·끊긴 끝점·치수 적합 등)를 내고 `baseline.json`과 견준다. 나빠진 지표가 있으면 실패한다. |
| `npm run dxf:score -- --update` | 지금 값을 새 기준으로 쓴다(의도한 변화일 때). |
| `npm run dxf:e2e [-- URL] [-- --only id]` | 실제 브라우저에서 올리기 → 검토 창 → 도면 고르기 → 가져오기 → 2D·3D를 돌린다. 검토 창 숫자가 점수판과 같은지, 다시 추출해도 같은지(표시 = 계산)를 본다. 캡처는 `out/<id>/`. |
| `npm run dxf:public [-- --fetch] [-- --update] [-- --only "<이름>"]` | 공개 정답 코퍼스(아래 절)를 채점하고 `public-baseline.json`과 견준다. |

브라우저 테스트의 URL 기본값은 `http://localhost:5173/`다(`npm run build && npx vite preview --port 5173`).
배포 사이트를 보려면 `npm run dxf:e2e -- https://jinmugeun.github.io/floorplan-3d/`.
`playwright-core`는 의존성에 넣지 않았다 — 설치돼 있으면 그것을, 없으면 `PW_MODULES`(node_modules 경로)에서 찾는다.

도면을 더하려면 `corpus.json`에 `{ id, match(파일 이름 일부), region(도면 후보 번호), note }`를 넣고 `--update`로 기준을 쓴다.

지표의 뜻: `named` 이름이 붙은 방 수(↑) · `unmatched` 방을 못 찾은 실명 수(↓) · `openEnds` 끊긴 벽 끝(↓) ·
`tiny` 1.5 m² 미만 조각 방(↓) · `dimFit` 도면 치수 끝점이 벽 면·중심선·기둥에서 5 mm 안에 드는 비율 %(↑).

`opnAll` 창·문 블록 정답 수(도면 상자 안 · 창·문 INSERT 하나에 전개 도형 bbox 하나) · `opnHit` 우리 개구부(문·창·개구부
아이템)의 중심이 그 bbox에서 200 mm 안(상자 안이면 거리 0)에 있는 수(↑) · `opnWidth` 그중 상자에 가장 가까운 개구부의 폭이
호칭 폭과 50 mm 안인 수(↑) — 이름에 폭 숫자가 없는(폭 0) 블록은 `opnWidth`를 늘 통과한다.
bbox **중심**이 아니라 bbox까지의 거리를 재는 까닭(2026-10-06 측정): 여닫이·포켓 문은 bbox 중심이 개구부 중심에서 ≈ 폭/2
비껴 있다 — 여닫이는 열린 문짝까지, 포켓은 벽 속 주머니까지 그려져서다(사동중 포켓 900 453~502 mm, DR-900 390·442 mm,
내곡중 SD850 394·446 mm). 상자까지 재면 포켓의 개구부 중심은 상자 안, 여닫이는 문틀 쪽 상자 변 위라 이 비낌이 사라지고,
4800 창처럼 긴 창도 상자 곁 200 mm로 엄격해진다.

## 공개 정답 코퍼스 (`public.mjs`)

다른 나라·다른 사무소 관례에서 벽·방·문이 얼마나 서는지 재는 **측정** 도구다(정확도 수정은 하지 않는다).

- **자료**: [WeiyaChen/CAD_rule_checker](https://github.com/WeiyaChen/CAD_rule_checker)(MIT 라이선스)의 중국 아파트 평면.
  원본은 `input_data/dxf/<n>suite (k).dxf`, 사람이 단 정답은 `input_data/dxf_gt/<n>suite_annotated (k).dxf`.
  목록은 GitHub API(`contents/input_data/dxf`)로 받는다.
- **유효 39쌍**: 목록 41 파일 중 `<n>suite (k).dxf` 꼴 40개만 쓴다 — `sample.dxf`는 `2suite (6).dxf`와 같은 파일이고
  정답 이름 꼴(`sample_Annotated.dxf`)이 달라 뺀다. `6suite_annotated (5).dxf`는 원본과 같은 파일이라 정답이 0개다
  (표에는 나오지만 합계에 더하는 정답이 없다).
- **정답 형식**: 레이어 `GT_<공간 종류>`(卧室 · 客厅 · 餐厅 · 厨房 · 卫生间 · 阳台 · 过道 · 玄关 · 花园 · 储藏间 · 衣帽间 · 书房 ·
  电梯 · 楼梯 · 电机房 · 水机房 · 风机房 · 阳光房)의 닫힌 LWPOLYLINE = 방 폴리곤, 레이어 `GT_门`의 LWPOLYLINE(5점 사각형) = 문.
  원본 레이어는 영문(WALL · WINDOW · FUR · STAIR · PUB_DIM · PUB_TEXT …)이고 `$INSUNITS 0`(mm로 추정 · 배율 1)이다.
- **지표**(도면마다): `walls` `rooms` `openEnds` · `gtRooms` 정답 방 수 · `roomHit` 그중 우리 방과 IoU ≥ 0.5인 것(↑ · IoU는 200 mm
  격자 표본점의 안팎 비율로 근사) · `gtDoors` 정답 문 수 · `doorHit` 정답 문 사각형 **중심**에서 400 mm 안에 우리 문·창·개구부
  아이템이 있는 것(↑) · `ms`. 합계 줄 `Σ`와 비율을 내고, `roomHit`·`doorHit`가 줄거나 되던 도면이 오류가 나면 실패한다(종료 코드 1).
  기준 `public-baseline.json`은 도면별 값과 `Σ`를 담는다.
  주의(2026-10-06 측정): 정답 문 사각형은 대개 여닫이 궤적까지 그린 정사각형(900×900 · 800×800 …)이라 중심이 개구부 중심에서
  ≈ 폭/2 비껴 있다 — 위 절의 `opnHit`가 상자 **중심**을 버린 까닭과 같다. 그래서 `doorHit`는 앉힌 문도 많이 놓친다
  (같은 결과를 "상자까지 150 mm 안"으로 재면 712/1505가 아니라 1264/1505). 지표를 바꾸면 기준을 다시 써야 한다.
- **명령**: `npm run dxf:public -- --fetch`가 캐시에 없는 쌍만 받는다(80 파일 · 약 82 MB). 한 쌍이 실패해도(404·네트워크)
  나머지는 받고, 그 도면은 표에 `파일 없음(--fetch)` 오류로 나온다. `--only`는 **파일 이름 전체**(확장자 없이)로 고른다:
  `npm run dxf:public -- --only "2suite (10)"` — 숫자만으로는 고르지 못한다(2suite·3suite·4suite·6suite에 같은 번호가 있다).
  `--update`는 지금 값을 새 기준으로 쓴다.
- **캐시**: 저장소 밖 `../dxf-public`(환경 변수 `DXF_PUBLIC_DIR`로 바꾼다). 한 번 받으면 다시 받지 않는다.
- **오프라인**: 목록을 못 받으면(네트워크 없음 · API 한도 403) "목록을 못 받아 캐시를 쓴다"를 찍고 캐시 폴더의 파일로 채점한다 —
  점수판은 네트워크 없이 돈다. 캐시 폴더도 없으면 목록 오류로 멈춘다.
