function solve(A, b) { // 가우스 소거, A: n×n, b: n
  const n = b.length, M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let piv = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r;
    [M[c], M[piv]] = [M[piv], M[c]];
    const p = M[c][c]; if (Math.abs(p) < 1e-12) throw new Error('네 점이 한 직선 위에 있습니다');
    for (let k = c; k <= n; k++) M[c][k] /= p;
    for (let r = 0; r < n; r++) if (r !== c) { const f = M[r][c]; for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k]; }
  }
  return M.map(row => row[n]);
}

export function solveHomography(src, dst) {
  const A = [], b = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = src[i], [u, v] = dst[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); b.push(v);
  }
  const h = solve(A, b);
  return [...h, 1];
}

export function applyHomography(H, p) {
  const [x, y] = p;
  const w = H[6] * x + H[7] * y + H[8];
  return [(H[0] * x + H[1] * y + H[2]) / w, (H[3] * x + H[4] * y + H[5]) / w];
}

export function rectifyImage(source, quad, outW, outH) {
  const out = document.createElement('canvas'); out.width = outW; out.height = outH;
  const H = solveHomography([[0, 0], [outW, 0], [outW, outH], [0, outH]], quad); // 출력 → 원본
  const sctx = source.getContext('2d'), sw = source.width, sh = source.height;
  const src = sctx.getImageData(0, 0, sw, sh).data;
  const img = out.getContext('2d').createImageData(outW, outH), d = img.data;
  for (let y = 0; y < outH; y++) for (let x = 0; x < outW; x++) {
    const [sx, sy] = applyHomography(H, [x + 0.5, y + 0.5]);
    const ix = Math.round(sx), iy = Math.round(sy), o = (y * outW + x) * 4;
    if (ix < 0 || iy < 0 || ix >= sw || iy >= sh) { d[o + 3] = 0; continue; }
    const s = (iy * sw + ix) * 4; d[o] = src[s]; d[o + 1] = src[s + 1]; d[o + 2] = src[s + 2]; d[o + 3] = 255;
  }
  out.getContext('2d').putImageData(img, 0, 0);
  return out;
}
