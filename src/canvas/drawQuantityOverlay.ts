import type { DevelopmentIn, PreviewResponse } from '../types';
import { canvasMapper, type Bounds, spanIndexAtX } from '../services';
import {
  buildQuantityCutsXU,
  computeBeamSectionQuantities,
  QUANTITY_RHO_MAX,
  QUANTITY_RHO_MIN,
  type QuantityDisplayState,
} from '../services/quantityService';

type DrawQuantityOverlayOpts = {
  yScale?: number;
  cutsXU: number[];
  recubrimientoM: number;
  display: QuantityDisplayState;
};

function fmt4(v: number) { return v.toFixed(4); }
function fmt2(v: number) { return v.toFixed(2); }

export function drawQuantityOverlay(
  canvas: HTMLCanvasElement,
  preview: PreviewResponse,
  dev: DevelopmentIn,
  renderBounds: Bounds,
  opts: DrawQuantityOverlayOpts,
) {
  if (!opts.display.enabled) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const rect = canvas.getBoundingClientRect();
  const cssW = Math.max(1, Math.round(rect.width));
  const cssH = Math.max(1, Math.round(rect.height));
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const yScale = opts.yScale ?? 1;

  const { toCanvas: toCanvasBase } = canvasMapper(renderBounds, cssW, cssH);
  const toCanvas = (x: number, y: number): [number, number] => {
    const [cx, cy] = toCanvasBase(x, y);
    if (yScale === 1) return [cx, cy];
    const midY = cssH / 2;
    return [cx, midY + (cy - midY) * yScale];
  };

  const mode = opts.display.mode ?? 'section';
  const sourceCuts = mode === 'zones'
    ? buildQuantityCutsXU(dev, 'zones', opts.cutsXU?.[0] ?? 0)
    : (opts.cutsXU ?? []).slice(0, 1);
  const cuts = Array.from(new Set(sourceCuts.filter((n) => Number.isFinite(n)).map((n) => Math.round(n * 1e6) / 1e6)));
  if (!cuts.length) return;

  const bounds = preview.bounds;
  const yTopWorld = bounds.max_y;
  const yBotWorld = bounds.min_y;
  const textStartY = 16;
  const lineH = 14;

  ctx.save();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.font = '12px ui-monospace, monospace';
  ctx.textBaseline = 'top';

  cuts.forEach((xU, idx) => {
    const spans = dev.spans ?? [];
    const spanIdx = spans.length ? Math.max(0, Math.min(spanIndexAtX(dev, xU), spans.length - 1)) : 0;
    const q = computeBeamSectionQuantities(dev, dev.spans?.[spanIdx], spanIdx, xU, opts.recubrimientoM);
    if (!q) return;
    // set x_m with local x in development coordinates
    q.x_m = xU / (dev.unit_scale ?? 2);

    const [cxTop, cyTop] = toCanvas(xU, yTopWorld);
    const [, cyBot] = toCanvas(xU, yBotWorld);
    const cx = Math.round(cxTop) + 0.5;
    const yA = Math.min(cyTop, cyBot);
    const yB = Math.max(cyTop, cyBot);

    // vertical marker
    ctx.strokeStyle = 'rgba(34,197,94,0.85)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(cx, Math.round(yA) + 0.5);
    ctx.lineTo(cx, Math.round(yB) + 0.5);
    ctx.stroke();

    const topLines: string[] = [];
    const botLines: string[] = [];
    if (opts.display.show_p_min) { topLines.push(`ρmin=${fmt4(QUANTITY_RHO_MIN)}`); botLines.push(`ρmin=${fmt4(QUANTITY_RHO_MIN)}`); }
    if (opts.display.show_p_max) { topLines.push(`ρmax=${fmt4(QUANTITY_RHO_MAX)}`); botLines.push(`ρmax=${fmt4(QUANTITY_RHO_MAX)}`); }
    if (opts.display.show_As_min) { topLines.push(`Asmin=${fmt2(q.As_min)} cm²`); botLines.push(`Asmin=${fmt2(q.As_min)} cm²`); }
    if (opts.display.show_As_max) { topLines.push(`Asmax=${fmt2(q.As_max)} cm²`); botLines.push(`Asmax=${fmt2(q.As_max)} cm²`); }
    if (opts.display.show_As_instalada) { topLines.push(`Asi=${fmt2(q.As_instalada_top)} cm²`); botLines.push(`Asi=${fmt2(q.As_instalada_bottom)} cm²`); }
    if (opts.display.show_p_instalada) { topLines.push(`pi=${fmt4(q.rho_instalada_top)}`); botLines.push(`pi=${fmt4(q.rho_instalada_bottom)}`); }
    if (opts.display.show_As_requerida) {
      topLines.push(`Asr=${fmt2(q.As_requerida_top)} cm²`);
      botLines.push(`Asr=${fmt2(q.As_requerida_bottom)} cm²`);
    }
    if (opts.display.show_p_requerida) { topLines.push(`pr=${fmt4(q.rho_requerida_top)}`); botLines.push(`pr=${fmt4(q.rho_requerida_bottom)}`); }
    if (opts.display.show_margin) {
      topLines.push(`ΔAs=${fmt2(q.margin_top)} cm²`);
      botLines.push(`ΔAs=${fmt2(q.margin_bottom)} cm²`);
    }
    if (!topLines.length && !botLines.length) return;

    const drawBox = (lines: string[], x: number, y: number, ok: boolean) => {
      if (!lines.length) return;
      const padX = 8;
      const padY = 6;
      let maxW = 0;
      for (const line of lines) {
        maxW = Math.max(maxW, ctx.measureText(line).width);
      }
      const boxW = Math.ceil(maxW + padX * 2);
      const boxH = Math.ceil(padY * 2 + lineH * lines.length);
      const boxX = Math.max(4, Math.min(cssW - boxW - 4, x - boxW / 2));
      const boxY = Math.max(4, Math.min(cssH - boxH - 4, y));
      ctx.fillStyle = ok ? 'rgba(20,83,45,0.60)' : 'rgba(127,29,29,0.60)';
      ctx.strokeStyle = ok ? 'rgba(74,222,128,0.85)' : 'rgba(248,113,113,0.85)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.rect(boxX, boxY, boxW, boxH);
      ctx.fill();
      ctx.stroke();
      let yy = boxY + padY;
      for (const line of lines) {
        const isAsInst = line.startsWith('Asi=');
        ctx.fillStyle =
          isAsInst
            ? (ok ? 'rgba(74,222,128,0.98)' : 'rgba(248,113,113,0.98)')
            : 'rgba(226,232,240,0.95)';
        ctx.fillText(line, boxX + padX, yy);
        yy += lineH;
      }
    };

    drawBox(topLines, cx, yA + 6, q.top_ok);
    drawBox(botLines, cx, yB - (8 + lineH * botLines.length), q.bottom_ok);
  });

  ctx.restore();
}
