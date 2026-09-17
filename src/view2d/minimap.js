import { createView2D } from './view2d.js';

// 우측 상단 미니맵(명세 9.5): 2D에서는 현재 화면 범위를, 3D에서는 카메라 위치와 방향을 보여 주고,
// 클릭·드래그로 그 위치로 화면을 옮긴다. 도면 자체는 readonly view2d가 그린다.
export function createMinimap(canvas, store, ui, { view2d, view3d }) {
  function overlay(ctx, api) {
    if (ui.get().mode === '2d') {
      const [p0, p1] = view2d.viewportRect();
      const s0 = api.toScreen(p0), s1 = api.toScreen(p1);
      ctx.strokeStyle = '#1f5fd0'; ctx.lineWidth = 2;
      ctx.strokeRect(s0[0], s0[1], s1[0] - s0[0], s1[1] - s0[1]);
      ctx.lineWidth = 1;
      return;
    }
    const { pos, heading } = view3d.getCameraInfo();
    const s = api.toScreen(pos);
    const a = (heading * Math.PI) / 180; // 0 = 북(화면 위), 시계방향
    const tri = [[0, -11], [7, 8], [-7, 8]].map(([dx, dy]) => [s[0] + dx * Math.cos(a) - dy * Math.sin(a), s[1] + dx * Math.sin(a) + dy * Math.cos(a)]);
    ctx.fillStyle = '#d8452c'; ctx.beginPath();
    tri.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
    ctx.closePath(); ctx.fill();
  }
  const onPick = world => { if (ui.get().mode === '2d') view2d.centerOn(world); else view3d.setTarget(world); };
  return createView2D(canvas, store, ui, { readonly: true, labels: false, overlay, onPick });
}
