import { loadImageFile, rotateCanvas, flipCanvas } from '../io/image.js';
import { rectifyImage } from '../geom/homography.js';
import { dist } from '../geom/vec.js';

export function openBackgroundDialog({ store, onClose = () => {} }) {
  const root = document.createElement('div'); root.className = 'modal';
  root.innerHTML = `<div class="modal-card">
    <header><h2>도면 이미지 업로드</h2><button type="button" name="close" aria-label="닫기">✕</button></header>
    <div class="modal-body">
      <p class="step" data-step="1">① 이미지를 고르고 방향을 맞춘 뒤, 도면의 네 모서리를 <b>좌상 → 우상 → 우하 → 좌하</b> 순서로 클릭하세요. 정면에서 찍은 스캔이면 "보정 생략"을 누르세요.</p>
      <p class="step" data-step="2" hidden>② 도면 위 치수를 아는 두 점을 클릭하고 실제 거리를 입력하세요.</p>
      <div class="toolbar"><input type="file" name="file" accept="image/png,image/jpeg"><button type="button" name="rotL">↺ 회전</button><button type="button" name="rotR">↻ 회전</button><button type="button" name="flipH">좌우 반전</button><button type="button" name="flipV">상하 반전</button><button type="button" name="skip">보정 생략</button></div>
      <canvas name="preview" width="900" height="600"></canvas>
      <div class="toolbar" data-step="2" hidden><label>실제 거리 <input type="number" name="mm" min="1" step="1" placeholder="mm"></label><button type="button" name="apply" disabled>적용</button></div>
    </div></div>`;
  document.body.appendChild(root);
  const q = s => root.querySelector(`[name="${s}"]`);
  const cv = q('preview'), ctx = cv.getContext('2d');
  let src = null, rect = null, corners = [], pts = [], step = 1;

  const fitDraw = img => { ctx.clearRect(0, 0, cv.width, cv.height); if (!img) return 1; const k = Math.min(cv.width / img.width, cv.height / img.height); ctx.drawImage(img, 0, 0, img.width * k, img.height * k); return k; };
  const draw = () => {
    const img = step === 1 ? src : rect, k = fitDraw(img); if (!img) return;
    const marks = step === 1 ? corners : pts;
    ctx.fillStyle = '#e8b100'; ctx.strokeStyle = '#e8b100'; ctx.lineWidth = 2;
    marks.forEach((p, i) => { ctx.beginPath(); ctx.arc(p[0] * k, p[1] * k, 6, 0, Math.PI * 2); ctx.fill(); ctx.fillText(String(i + 1), p[0] * k + 8, p[1] * k - 8); });
    if (marks.length >= 2 && step === 2) { ctx.beginPath(); ctx.moveTo(marks[0][0] * k, marks[0][1] * k); ctx.lineTo(marks[1][0] * k, marks[1][1] * k); ctx.stroke(); }
    if (step === 1 && corners.length === 4) { ctx.beginPath(); corners.forEach((p, i) => (i ? ctx.lineTo(p[0] * k, p[1] * k) : ctx.moveTo(p[0] * k, p[1] * k))); ctx.closePath(); ctx.stroke(); }
  };
  const toStep2 = () => { step = 2; root.querySelectorAll('[data-step="1"]').forEach(e => e.hidden = true); root.querySelectorAll('[data-step="2"]').forEach(e => e.hidden = false); draw(); };
  const imgPoint = ev => { const r = cv.getBoundingClientRect(); const img = step === 1 ? src : rect; const k = Math.min(cv.width / img.width, cv.height / img.height); return [(ev.clientX - r.left) * (cv.width / r.width) / k, (ev.clientY - r.top) * (cv.height / r.height) / k]; };

  q('file').addEventListener('change', async ev => { src = await loadImageFile(ev.target.files[0]); corners = []; draw(); });
  q('rotL').onclick = () => { if (src) { src = rotateCanvas(src, -1); corners = []; draw(); } };
  q('rotR').onclick = () => { if (src) { src = rotateCanvas(src, 1); corners = []; draw(); } };
  q('flipH').onclick = () => { if (src) { src = flipCanvas(src, true); corners = []; draw(); } };
  q('flipV').onclick = () => { if (src) { src = flipCanvas(src, false); corners = []; draw(); } };
  q('skip').onclick = () => { if (src) { rect = src; toStep2(); } };
  cv.addEventListener('click', ev => {
    if (step === 1 && src) { corners.push(imgPoint(ev)); if (corners.length === 4) { const w = Math.round((dist(corners[0], corners[1]) + dist(corners[3], corners[2])) / 2), h = Math.round((dist(corners[0], corners[3]) + dist(corners[1], corners[2])) / 2); rect = rectifyImage(src, corners, w, h); toStep2(); } draw(); }
    else if (step === 2 && rect) { pts = pts.length >= 2 ? [imgPoint(ev)] : [...pts, imgPoint(ev)]; q('apply').disabled = !(pts.length === 2 && Number(q('mm').value) > 0); draw(); }
  });
  q('mm').addEventListener('input', () => { q('apply').disabled = !(pts.length === 2 && Number(q('mm').value) > 0); });
  q('apply').onclick = () => {
    const scale = Number(q('mm').value) / dist(pts[0], pts[1]);
    store.dispatch(d => { d.background = { src: rect.toDataURL('image/jpeg', 0.85), width: rect.width, height: rect.height, scale, offset: [0, 0], opacity: 0.5, visible: true, locked: true }; });
    close();
  };
  const close = () => { root.remove(); onClose(); };
  q('close').onclick = close;
  return { close };
}
