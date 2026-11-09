#!/bin/bash
# 사진 목록 → SeedVR2 업스케일(짧은 변 900 px 미만만) → Idol v4 시드 46·1046 → 자세 보정(Y −90°) → 스테인리스 B 반광
# (계획 20 Task 1 ← scratch/q/ss-up.sh · 2026-11-06 신상중 31종에 쓴 절차 — 62건 실패 0 · 38분)
#   bash tools/assets/idol/batch.sh <목록.txt> [서버 URL]
#   목록 줄 = "<tag> <사진 경로>"(앱 루트 기준) · 결과 tools/assets/incoming/exp/upi-svr-<tag>[-s2]-{meshx,orient,matb}.glb · 업스케일 up-svr-<tag>-up.png
#   이미 있는 결과는 건너뛴다. 한 건이 실패하면 서버 작업을 끊고 ComfyUI를 다시 띄운 뒤 다음 건으로 간다(RESTART — 기본 ssh gpu-dev-bw의 ~/start-comfy.sh).
#   주의: ssh 한 줄에 ComfyUI 실행 명령 문자열을 넣지 않는다(서버의 pkill이 자기 셸을 죽인다) — 서버의 스크립트 파일만 부른다.
#   오래 걸리므로 Windows에서는 별도 프로세스로 띄운다: Start-Process 'C:\Program Files\Git\bin\bash.exe' -ArgumentList '-c "bash tools/assets/idol/batch.sh 목록.txt > batch.log 2>&1"'
set -u
cd "$(dirname "$0")/../../.."
LIST=$1 S=${2:-http://192.168.11.65:8188} E=tools/assets/incoming/exp I=tools/assets/idol
RESTART=${RESTART:-"ssh -o ConnectTimeout=10 gpu-dev-bw bash ~/start-comfy.sh 1"}
up() { for i in $(seq 1 60); do curl -s -m 5 "$S/system_stats" > /dev/null && return 0; sleep 5; done; return 1; }
recover() { curl -s -m 10 -X POST "$S/interrupt" > /dev/null; curl -s -m 10 -X POST -H 'Content-Type: application/json' -d '{"clear":true}' "$S/queue" > /dev/null
  $RESTART < /dev/null; sleep 20; up || { echo "서버가 안 뜸 — 멈춤"; exit 1; }; }
n=0; total=$(grep -c '[^[:space:]]' "$LIST")   # 공백·CR뿐인 줄은 세지 않는다(아래 CR 떼기와 같다)
while read -r tag photo; do
  # Windows에서 만든 목록(CRLF)이면 줄 끝 CR이 사진 경로에 붙어 파일을 못 찾는다 — 떼어 낸다(빈 줄 "\r"도 빈 tag가 된다)
  tag=${tag%$'\r'}; photo=${photo%$'\r'}
  [ -z "${tag:-}" ] && continue
  n=$((n+1))
  short=$(node -e "require('sharp')(process.argv[1]).metadata().then(m=>console.log(Math.min(m.width,m.height)))" "$photo")
  src=$photo
  if [ "$short" -lt 900 ]; then
    src=$E/up-svr-$tag-up.png
    [ -f "$src" ] || timeout 900 node $I/upscale.mjs "$photo" "up-svr-$tag" --server "$S" < /dev/null 2>&1 | tail -1
    [ -f "$src" ] || { echo "[$n/$total] $tag 업스케일 실패"; recover; continue; }
  fi
  for s in 1 2; do
    t=upi-svr-$tag; [ $s = 2 ] && t=$t-s2; seed=$([ $s = 1 ] && echo 46 || echo 1046)
    [ -f "$E/$t-matb.glb" ] && { echo "[$n/$total] $tag 시드$s 이미 있음"; continue; }
    echo "[$n/$total] $tag 시드$s 시작 $(date +%H:%M:%S) (짧은 변 ${short}px)"
    if timeout 900 node $I/run.mjs "$src" "$t" --seed $seed --server "$S" < /dev/null 2>&1 | grep -E "끝|rror"; [ "${PIPESTATUS[0]}" = 0 ] && [ -f "$E/$t-meshx.glb" ]; then
      node $I/orient.mjs $E/$t-meshx.glb $E/$t-orient.glb -90 2>/dev/null | grep -v normals
      node $I/steel.mjs $E/$t-orient.glb $E/$t-matb.glb > /dev/null
    else echo "[$n/$total] $tag 시드$s 실패 — 서버 정리·재시작"; recover; fi
  done
done < "$LIST"
echo IDOL-BATCH-DONE $(date +%H:%M:%S)
