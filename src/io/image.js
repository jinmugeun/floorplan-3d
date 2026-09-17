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
