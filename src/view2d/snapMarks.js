// 커서 옆의 스냅 마커(§16.6 · 감사 §42). snapPoint가 이미 돌려주던 hit을 화면에 보이게 한다:
// 끝점에 물렸는지 벽면에 물렸는지 보조선에 물렸는지가 커서 원 하나로는 구분되지 않았다.
// 그리기만 하는 파일이라 도구 여섯이 draw()에서 한 줄로 부른다(view2d.js는 건드리지 않는다).
import { LABEL_BG } from './ducts2d.js';

// §16.6이 글자까지 정한 글리프와 라벨.
export const SNAP_GLYPH = { point: '■', wall: '△', guide: '┆', align: '⋯', ortho: '⊾' };
export const SNAP_LABEL = { point: '끝점', wall: '벽면', guide: '보조선', align: '정렬', ortho: '직교' };
// 커서와 겹치지 않는 거리. 커서 원(반지름 5 px)과 8 px 사각형 밖이다.
export const MARK_OFFSET_PX = 14;
const MARK_FONT = '13px "IBM Plex Sans KR", sans-serif';

// mark = snapPoint의 결과 { point, hit }. 그렸으면 true.
export function drawSnapMark(ctx, view, mark) {
  const hit = mark?.hit, p = mark?.point;
  if (!hit || !p || !SNAP_GLYPH[hit]) return false;
  const s = view.toScreen(p);
  const text = `${SNAP_GLYPH[hit]} ${SNAP_LABEL[hit]}`;
  ctx.save();
  ctx.font = MARK_FONT;
  ctx.textBaseline = 'middle';
  // 라벨은 반투명 흰 상자 위에 올린다(덕트 띠·방 이름 위에서도 읽히게 — 라벨 규칙과 같은 LABEL_BG).
  const w = ctx.measureText(text).width + 8;
  // 캔버스 우변에서는 커서 왼쪽에 그린다(리뷰 M-16): 늘 오른쪽에만 그리면 상자와 글자가 잘려
  // 새 §16.6 기능이 그 자리에서 읽히지 않았다.
  const cw = ctx.canvas?.clientWidth || ctx.canvas?.width || 0;
  const flip = cw > 0 && s[0] + MARK_OFFSET_PX + w > cw;   // 폭을 모르면 예전처럼 오른쪽이다
  ctx.textAlign = flip ? 'right' : 'left';
  const x = flip ? s[0] - MARK_OFFSET_PX : s[0] + MARK_OFFSET_PX;
  ctx.fillStyle = LABEL_BG;
  ctx.fillRect(flip ? x - w + 4 : x - 4, s[1] - 9, w, 18);
  ctx.fillStyle = view.COLORS.dim;
  ctx.fillText(text, x, s[1]);
  // 스냅이 잡은 **자리**도 표시한다: 라벨만 있으면 어디에 물렸는지가 여전히 애매하다.
  ctx.strokeStyle = view.COLORS.wallSel;
  ctx.lineWidth = 2;
  ctx.strokeRect(s[0] - 4, s[1] - 4, 8, 8);
  ctx.restore();
  return true;
}
