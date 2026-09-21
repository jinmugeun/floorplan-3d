// 라벨 글자폭의 정본(§15.12). 2D 라벨 패스(view2d/labels2d.js)와 3D 라벨 텍스처
// (view3d/labels3d.js)가 같은 규칙을 써야 한다: 3D가 128×128 정사각 텍스처에 글자를 그려
// 긴 단면 표기(`750×400`)가 잘렸다(감사 §11).
// ctx.measureText를 쓰지 않는 이유는 예전과 같다 — 순수 함수여야 node 테스트가 캔버스 없이 돈다.
// 실 브라우저 실측(Chromium, IBM Plex Sans KR)에 맞춘 값이다: 한글·CJK·원문자·전각은 글자당
// 1.0 em(실측 0.892 — 조금 넉넉히 잡아 "겹치면 생략" 쪽으로 안전하게), ASCII·숫자는 0.62 em
// (실측 0.50~0.60).
export const WIDE_CHAR = /[ᄀ-ᇿ①-⓿　-〿぀-ヿ㄰-㆏㐀-鿿가-힯豈-﫿！-｠￠-￦]/;
export const CHAR_EM = { wide: 1, narrow: 0.62 };
export const textWidth = (text, size) =>
  [...String(text)].reduce((w, ch) => w + (WIDE_CHAR.test(ch) ? CHAR_EM.wide : CHAR_EM.narrow), 0) * size;
