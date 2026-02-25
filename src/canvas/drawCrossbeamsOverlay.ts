import type { DevelopmentIn } from '../types';
import { canvasMapper, mToUnits, type Bounds } from '../services';

export function drawCrossbeamsOverlay(
  canvas: HTMLCanvasElement,
  dev: DevelopmentIn,
  renderBounds: Bounds,
  opts?: { yScale?: number }
) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const crossbeams = (dev as any).crossbeams || [];
  if (crossbeams.length === 0) return;

  const yScale = opts?.yScale ?? 1;

  const rect = canvas.getBoundingClientRect();
  const cssW = Math.max(1, Math.round(rect.width));
  const cssH = Math.max(1, Math.round(rect.height));
  const dpr = Math.min(window.devicePixelRatio || 1, 2);

  ctx.save();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const { toCanvas: toCanvasBase } = canvasMapper(renderBounds, cssW, cssH);
  const toCanvas = (x: number, y: number): [number, number] => {
    const [cx, cy] = toCanvasBase(x, y);
    if (yScale === 1) return [cx, cy];
    const midY = cssH / 2;
    return [cx, midY + (cy - midY) * yScale];
  };

  const y0 = mToUnits(dev, (dev as any).y0 ?? 0);

  ctx.strokeStyle = 'rgba(139, 92, 246, 0.8)';  // Purple
  ctx.fillStyle = 'rgba(139, 92, 246, 0.15)';    // Light purple fill
  ctx.lineWidth = 2;

  for (const cb of crossbeams) {
    try {
      const x_u = mToUnits(dev, cb.x);
      const b_u = mToUnits(dev, cb.b);
      const h_u = mToUnits(dev, cb.h);

      // El ancho (b) se extiende en dirección X, centrado en x_u
      const half_b = b_u / 2.0;
      const y_bottom = y0;
      const y_top = y0 + h_u;

      // Cuatro esquinas del rectángulo
      const [px1, py1] = toCanvas(x_u - half_b, y_bottom);
      const [px2, py2] = toCanvas(x_u + half_b, y_bottom);
      const [px3, py3] = toCanvas(x_u + half_b, y_top);
      const [px4, py4] = toCanvas(x_u - half_b, y_top);

      // Dibujar rectángulo
      ctx.beginPath();
      ctx.moveTo(px1, py1);
      ctx.lineTo(px2, py2);
      ctx.lineTo(px3, py3);
      ctx.lineTo(px4, py4);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    } catch (e) {
      console.warn('Error dibujando viga transversal en 2D:', e);
    }
  }

  ctx.restore();
}
