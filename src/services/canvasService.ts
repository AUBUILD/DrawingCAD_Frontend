/**
 * Servicios para rendering de canvas 2D
 */

import type { DevelopmentIn, PreviewResponse } from '../types';
import { computeNodeOrigins, mToUnits, computeSpanMidX, computeSpanRangeX, computeNodeMarkerX, computeNodeLabelX } from './geometryService';
import { clampNumber, formatOrdinalEs, indexToLetters } from '../utils';

// ============================================================================
// TYPES
// ============================================================================

export type Bounds = { min_x: number; max_x: number; min_y: number; max_y: number };

export type Selection =
  | { kind: 'node'; index: number }
  | { kind: 'span'; index: number }
  | { kind: 'none' };

export type PolyPt = [number, number];

// ============================================================================
// CANVAS MAPPING UTILITIES
// ============================================================================

export function fitTransform(bounds: Bounds, w: number, h: number) {
  const pad = 20;
  const dx = Math.max(bounds.max_x - bounds.min_x, 1e-6);
  const dy = Math.max(bounds.max_y - bounds.min_y, 1e-6);
  const scale = Math.min((w - pad * 2) / dx, (h - pad * 2) / dy);

  // Si sobra altura después del fit (por ejemplo, viga muy “horizontal”),
  // centrar el dibujo en Y dentro del canvas.
  const innerH = Math.max(0, h - pad * 2);
  const contentH = dy * scale;
  const extraY = Math.max(0, (innerH - contentH) / 2);
  return { pad, scale, extraY };
}

export function canvasMapper(bounds: Bounds, w: number, h: number) {
  const { pad, scale, extraY } = fitTransform(bounds, w, h);
  const bx0 = bounds.min_x;
  const by1 = bounds.max_y;
  return {
    toCanvas(x: number, y: number) {
      const cx = pad + (x - bx0) * scale;
      const cy = pad + extraY + (by1 - y) * scale;
      return [cx, cy] as const;
    },
  };
}

export function canvasUnmapper(bounds: Bounds, w: number, h: number) {
  const { pad, scale, extraY } = fitTransform(bounds, w, h);
  const bx0 = bounds.min_x;
  const by1 = bounds.max_y;
  return {
    toWorld(cx: number, cy: number) {
      const x = bx0 + (cx - pad) / scale;
      const y = by1 - (cy - (pad + extraY)) / scale;
      return [x, y] as const;
    },
  };
}

export function clampBounds(inner: Bounds, outer: Bounds): Bounds {
  const dx = outer.max_x - outer.min_x;
  const dy = outer.max_y - outer.min_y;
  const w = Math.min(inner.max_x - inner.min_x, dx);
  const h = Math.min(inner.max_y - inner.min_y, dy);

  let min_x = inner.min_x;
  let max_x = inner.max_x;
  let min_y = inner.min_y;
  let max_y = inner.max_y;

  if (w < dx) {
    min_x = Math.max(outer.min_x, Math.min(min_x, outer.max_x - w));
    max_x = min_x + w;
  } else {
    min_x = outer.min_x;
    max_x = outer.max_x;
  }

  if (h < dy) {
    min_y = Math.max(outer.min_y, Math.min(min_y, outer.max_y - h));
    max_y = min_y + h;
  } else {
    min_y = outer.min_y;
    max_y = outer.max_y;
  }

  return { min_x, max_x, min_y, max_y };
}

// ============================================================================
// DRAWING FUNCTIONS
// ============================================================================

export function drawPreview(
  canvas: HTMLCanvasElement,
  data: PreviewResponse | null,
  renderBounds?: Bounds | null,
  opts?: { yScale?: number }
) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const yScale = opts?.yScale ?? 1;

  // DPR-aware canvas for crisper lines/text
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const cssW = Math.max(1, Math.round(rect.width));
  const cssH = Math.max(1, Math.round(rect.height));
  const desiredW = Math.round(cssW * dpr);
  const desiredH = Math.round(cssH * dpr);
  if (canvas.width !== desiredW || canvas.height !== desiredH) {
    canvas.width = desiredW;
    canvas.height = desiredH;
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  // Clear in CSS pixel space (after setTransform)
  ctx.clearRect(0, 0, cssW, cssH);

  if (!data) {
    ctx.fillStyle = 'rgba(229,231,235,0.6)';
    ctx.font = '12px ui-monospace, Menlo, Consolas, monospace';
    ctx.fillText('Sin datos de vista previa', 14, 22);
    return;
  }

  const bounds = renderBounds ?? data.bounds;
  const { toCanvas: toCanvasBase } = canvasMapper(bounds, cssW, cssH);
  const toCanvas = (x: number, y: number): [number, number] => {
    const [cx, cy] = toCanvasBase(x, y);
    if (yScale === 1) return [cx, cy];
    const midY = cssH / 2;
    return [cx, midY + (cy - midY) * yScale];
  };

  const snap = (v: number) => Math.round(v) + 0.5;

  // Desarrollo (contorno)
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(20,184,166,0.95)';

  for (const pl of data.developments ?? []) {
    const pts = pl.points ?? [];
    if (pts.length < 2) continue;
    ctx.beginPath();
    for (let i = 0; i < pts.length; i++) {
      const [x, y] = pts[i];
      const [cx, cy] = toCanvas(x, y);
      const sx = snap(cx);
      const sy = snap(cy);
      if (i === 0) ctx.moveTo(sx, sy);
      else ctx.lineTo(sx, sy);
    }
    ctx.stroke();
  }
}

export function drawCutMarker2D(canvas: HTMLCanvasElement, data: PreviewResponse, renderBounds: Bounds, xU: number) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const cssW = Math.max(1, Math.round(rect.width));
  const cssH = Math.max(1, Math.round(rect.height));
  // Importante: NO redimensionar el canvas aquí.
  // Redimensionar (canvas.width/height) limpia el buffer y borraría lo ya dibujado por drawPreview.
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const bounds = renderBounds ?? (data.bounds as Bounds);
  const { toCanvas } = canvasMapper(bounds, cssW, cssH);
  const x = Math.min(bounds.max_x, Math.max(bounds.min_x, xU));
  const [cxTop] = toCanvas(x, bounds.max_y);

  // Dibujar a lo largo de casi toda la altura visible del canvas (no solo del contorno).
  // Esto hace la línea de corte mucho más visible en la Vista general.
  const yTop = 6;
  const yBot = cssH - 6;

  const cutColor = (() => {
    try {
      const v = window
        .getComputedStyle(document.documentElement)
        .getPropertyValue('--cut-color')
        .trim();
      return v || 'rgba(249,115,22,0.95)';
    } catch {
      return 'rgba(249,115,22,0.95)';
    }
  })();

  ctx.save();
  ctx.strokeStyle = cutColor;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(cxTop, yTop);
  ctx.lineTo(cxTop, yBot);
  ctx.stroke();
  ctx.restore();
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

export function polySliceIntervals(poly: PolyPt[], x: number): Array<[number, number]> {
  const ys: number[] = [];
  const n = poly.length;
  if (n < 3) return [];

  for (let i = 0; i < n; i++) {
    const [x1, y1] = poly[i];
    const [x2, y2] = poly[(i + 1) % n];
    if (y1 !== y2) continue; // solo horizontales

    const xmin = Math.min(x1, x2);
    const xmax = Math.max(x1, x2);
    // x siempre se evalúa en el centro de un intervalo (nunca en vértices), así que estricto sirve y evita duplicados.
    if (x > xmin && x < xmax) ys.push(y1);
  }

  ys.sort((a, b) => a - b);
  const intervals: Array<[number, number]> = [];
  for (let i = 0; i + 1 < ys.length; i += 2) {
    const y0 = ys[i];
    const y1 = ys[i + 1];
    if (Number.isFinite(y0) && Number.isFinite(y1) && y1 > y0) intervals.push([y0, y1]);
  }
  return intervals;
}

// ============================================================================
// OVERLAY DRAWING
// ============================================================================

export function drawSelectionOverlay(canvas: HTMLCanvasElement, preview: PreviewResponse, dev: DevelopmentIn, sel: Selection, renderBounds: Bounds) {
  if (sel.kind === 'none') return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const rect = canvas.getBoundingClientRect();
  const cssW = Math.max(1, Math.round(rect.width));
  const cssH = Math.max(1, Math.round(rect.height));

  const origins = computeNodeOrigins(dev);
  const { toCanvas } = canvasMapper(renderBounds, cssW, cssH);

  ctx.save();
  ctx.globalCompositeOperation = 'source-over';

  if (sel.kind === 'node') {
    const node = (dev.nodes ?? [])[sel.index];
    const o = origins[sel.index] ?? 0;
    const b1 = mToUnits(dev, clampNumber(node?.b1 ?? 0, 0));
    const b2 = mToUnits(dev, clampNumber(node?.b2 ?? 0, 0));
    const xL = o + Math.min(b1, b2);
    const xR = o + Math.max(b1, b2);
    const [x0] = toCanvas(xL, renderBounds.max_y);
    const [x1] = toCanvas(xR, renderBounds.max_y);
    const left = Math.min(x0, x1);
    const right = Math.max(x0, x1);
    ctx.fillStyle = 'rgba(250, 204, 21, 0.12)';
    ctx.strokeStyle = 'rgba(250, 204, 21, 0.35)';
    ctx.lineWidth = 2;
    ctx.fillRect(left, 6, Math.max(1, right - left), cssH - 12);
    ctx.strokeRect(left, 6, Math.max(1, right - left), cssH - 12);
  } else {
    const r = computeSpanRangeX(dev, origins, sel.index);
    const [x0] = toCanvas(r.x1, renderBounds.max_y);
    const [x1] = toCanvas(r.x2, renderBounds.max_y);
    const left = Math.min(x0, x1);
    const right = Math.max(x0, x1);
    ctx.fillStyle = 'rgba(250, 204, 21, 0.12)';
    ctx.strokeStyle = 'rgba(250, 204, 21, 0.35)';
    ctx.lineWidth = 2;
    ctx.fillRect(left, 6, Math.max(1, right - left), cssH - 12);
    ctx.strokeRect(left, 6, Math.max(1, right - left), cssH - 12);
  }

  ctx.restore();
}

export function drawLabels(
  canvas: HTMLCanvasElement,
  data: PreviewResponse,
  dev: DevelopmentIn,
  renderBounds: Bounds,
  opts?: { yScale?: number }
) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const yScale = opts?.yScale ?? 1;

  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const cssW = Math.max(1, Math.round(rect.width));
  const cssH = Math.max(1, Math.round(rect.height));
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const nodes = dev.nodes ?? [];
  const origins = computeNodeOrigins(dev);
  const { toCanvas: toCanvasBase } = canvasMapper(renderBounds, cssW, cssH);
  const toCanvas = (x: number, y: number): [number, number] => {
    const [cx, cy] = toCanvasBase(x, y);
    if (yScale === 1) return [cx, cy];
    const midY = cssH / 2;
    return [cx, midY + (cy - midY) * yScale];
  };

  ctx.save();
  ctx.font = '12px ui-monospace, Menlo, Consolas, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Etiquetas N/T abajo, separadas del contorno
  const [, yBotPx0] = toCanvas(renderBounds.min_x, renderBounds.min_y);
  const yLabelPx = Math.min(cssH - 14, Math.round(yBotPx0) + 26);

  // Nodos (marca + punto + etiqueta)
  ctx.strokeStyle = 'rgba(250, 204, 21, 0.95)';
  ctx.lineWidth = 1;
  const tickLen = 22;
  const dotR = 3;
  for (let i = 0; i < origins.length; i++) {
    // En el contorno, el cap superior usa x=b1 y x=b2 (ver backend). Si b1=0, coincide con el quiebre vertical.
    const x = computeNodeMarkerX(dev, origins, i);
    const [txTop, tyTop] = toCanvas(x, renderBounds.max_y);
    // Marca corta (evita confundir con la sección)
    const xpx = Math.round(txTop) + 0.5;
    const ypx = Math.round(tyTop) + 0.5;
    ctx.beginPath();
    ctx.moveTo(xpx, ypx);
    ctx.lineTo(xpx, ypx + tickLen);
    ctx.stroke();

    // Punto del nodo
    ctx.fillStyle = 'rgba(250, 204, 21, 0.95)';
    ctx.beginPath();
    ctx.arc(Math.round(txTop) + 0.5, Math.round(tyTop) + 0.5, dotR, 0, Math.PI * 2);
    ctx.fill();

    // Etiqueta
    const xLabel = computeNodeLabelX(dev, origins, i);
    const [txLabel] = toCanvas(xLabel, renderBounds.max_y);
    ctx.fillStyle = 'rgba(250, 204, 21, 0.95)';
    ctx.fillText(`N${i + 1}`, txLabel, yLabelPx);
  }

  // Tramos (etiqueta)
  ctx.fillStyle = 'rgba(147, 197, 253, 0.95)';
  for (let i = 0; i < (dev.spans ?? []).length; i++) {
    const mx = computeSpanMidX(dev, origins, i);
    const [tx] = toCanvas(mx, renderBounds.max_y);
    ctx.fillText(`T${i + 1}`, tx, yLabelPx);
  }

  ctx.restore();
}
