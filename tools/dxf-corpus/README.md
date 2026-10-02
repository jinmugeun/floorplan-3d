# DXF 코퍼스 도구

여러 사무소의 실제 도면을 **앱과 같은 코드**로 돌려, 한 도면에 맞춘 수정이 다른 도면을 망가뜨리지 않는지 확인한다.
실파일은 저장소 밖에 둔다(기본 `../dxf`, 환경 변수 `DXF_DIR`로 바꾼다). 파일이 없는 항목은 건너뛴다.

| 명령 | 하는 일 |
|---|---|
| `npm run dxf:score` | 도면마다 지표(벽·방·이름 붙은 방·끊긴 끝점·치수 적합 등)를 내고 `baseline.json`과 견준다. 나빠진 지표가 있으면 실패한다. |
| `npm run dxf:score -- --update` | 지금 값을 새 기준으로 쓴다(의도한 변화일 때). |
| `npm run dxf:e2e [-- URL] [-- --only id]` | 실제 브라우저에서 올리기 → 검토 창 → 도면 고르기 → 가져오기 → 2D·3D를 돌린다. 검토 창 숫자가 점수판과 같은지, 다시 추출해도 같은지(표시 = 계산)를 본다. 캡처는 `out/<id>/`. |

브라우저 테스트의 URL 기본값은 `http://localhost:5173/`다(`npm run build && npx vite preview --port 5173`).
배포 사이트를 보려면 `npm run dxf:e2e -- https://jinmugeun.github.io/floorplan-3d/`.
`playwright-core`는 의존성에 넣지 않았다 — 설치돼 있으면 그것을, 없으면 `PW_MODULES`(node_modules 경로)에서 찾는다.

도면을 더하려면 `corpus.json`에 `{ id, match(파일 이름 일부), region(도면 후보 번호), note }`를 넣고 `--update`로 기준을 쓴다.

지표의 뜻: `named` 이름이 붙은 방 수(↑) · `unmatched` 방을 못 찾은 실명 수(↓) · `openEnds` 끊긴 벽 끝(↓) ·
`tiny` 1.5 m² 미만 조각 방(↓) · `dimFit` 도면 치수 끝점이 벽 면·중심선·기둥에서 5 mm 안에 드는 비율 %(↑).
