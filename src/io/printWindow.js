// HTML 문자열을 새 창에 써서 인쇄한다(견적서·시방서가 함께 쓴다).
// 팝업이 막히면 null을 돌려준다(호출자가 안내한다).
export function printHtml(html, { title = '인쇄', autoPrint = true } = {}) {
  const win = window.open('', '_blank');
  if (!win) return null;
  win.document.open();
  win.document.write(`<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>${title}</title></head><body>${html}</body></html>`);
  win.document.close();
  if (autoPrint) { win.focus(); win.print(); }
  return win;
}
