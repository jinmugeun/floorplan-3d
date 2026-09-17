export function loadImageFile(file, maxEdge = 1600) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => {
      const k = Math.min(1, maxEdge / Math.max(img.width, img.height));
      const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url); resolve(c);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('이미지를 읽을 수 없습니다')); };
    img.src = url;
  });
}
export function rotateCanvas(c, quarterTurns) {
  const t = ((quarterTurns % 4) + 4) % 4, o = document.createElement('canvas');
  o.width = t % 2 ? c.height : c.width; o.height = t % 2 ? c.width : c.height;
  const ctx = o.getContext('2d'); ctx.translate(o.width / 2, o.height / 2); ctx.rotate(t * Math.PI / 2); ctx.drawImage(c, -c.width / 2, -c.height / 2);
  return o;
}
export function flipCanvas(c, horizontal) {
  const o = document.createElement('canvas'); o.width = c.width; o.height = c.height;
  const ctx = o.getContext('2d'); ctx.translate(horizontal ? c.width : 0, horizontal ? 0 : c.height); ctx.scale(horizontal ? -1 : 1, horizontal ? 1 : -1); ctx.drawImage(c, 0, 0);
  return o;
}
// 영역 자르기: 사각형을 원본 안으로 잘라 내고(시작점·끝점 모두) 최소 1px을 보장한다.
export function cropCanvas(c, [x, y, w, h]) {
  const x0 = Math.max(0, Math.min(c.width, Math.round(x)));
  const y0 = Math.max(0, Math.min(c.height, Math.round(y)));
  const x1 = Math.max(x0, Math.min(c.width, Math.round(x + w)));
  const y1 = Math.max(y0, Math.min(c.height, Math.round(y + h)));
  const sw = Math.max(1, x1 - x0), sh = Math.max(1, y1 - y0);
  const o = document.createElement('canvas');
  o.width = sw; o.height = sh;
  o.getContext('2d').drawImage(c, x0, y0, sw, sh, 0, 0, sw, sh);
  return o;
}
