import { useCallback, useRef } from 'react';
import type { DevelopmentIn, PreviewResponse } from '../types';
import {
  fitTransform,
  canvasUnmapper,
  computeNodeOrigins,
  computeSpanMidX,
  computeNodeMarkerX,
  computeZoomBounds,
  type Bounds,
  type Selection,
} from '../services';

interface UseCanvasInteractionsParams {
  preview: PreviewResponse | null;
  dev: DevelopmentIn;
  selection: Selection;
  setSelection: React.Dispatch<React.SetStateAction<Selection>>;
  detailViewport: Bounds | null;
  detailViewportRef: React.MutableRefObject<Bounds | null>;
  setDetailViewport: React.Dispatch<React.SetStateAction<Bounds | null>>;
  zoomEnabled: boolean;
  previewView: '2d' | '3d';
  steelViewActive: boolean;
  steelYScale2: boolean;
}

export function useCanvasInteractions({
  preview,
  dev,
  selection,
  setSelection,
  detailViewport,
  detailViewportRef,
  setDetailViewport,
  zoomEnabled,
  previewView,
  steelViewActive,
  steelYScale2,
}: UseCanvasInteractionsParams) {

  const pan2dRef = useRef({
    active: false,
    moved: false,
    pointerId: -1,
    startX: 0,
    startY: 0,
    lastX: 0,
    lastY: 0,
  });

  const applySelection = useCallback((sel: Selection, nextViewport: boolean) => {
    if (!zoomEnabled) return;
    setSelection(sel);
    if (nextViewport && preview) setDetailViewport(computeZoomBounds(dev, preview, sel));
  }, [zoomEnabled, setSelection, setDetailViewport, dev, preview]);

  const moveZoomSelection = useCallback((dir: -1 | 1) => {
    if (!zoomEnabled) return;
    const spansCount = (dev.spans ?? []).length;
    const nodesCount = (dev.nodes ?? []).length;
    if (!(nodesCount >= 1) || nodesCount !== spansCount + 1) {
      // fallback
      return;
    }

    const maxIdx = 2 * spansCount; // N1..Tn..N(n+1)

    const selToIdx = (s: Selection): number | null => {
      if (s.kind === 'node') return Math.max(0, Math.min(maxIdx, 2 * s.index));
      if (s.kind === 'span') return Math.max(0, Math.min(maxIdx, 2 * s.index + 1));
      return null;
    };

    const idxToSel = (i: number): Selection => {
      const ii = Math.max(0, Math.min(maxIdx, Math.trunc(i)));
      if (ii % 2 === 0) return { kind: 'node', index: Math.min(nodesCount - 1, Math.max(0, ii / 2)) };
      return { kind: 'span', index: Math.min(spansCount - 1, Math.max(0, (ii - 1) / 2)) };
    };

    const cur = selToIdx(selection);
    let next = 0;
    if (cur == null) next = dir > 0 ? 0 : maxIdx;
    else next = Math.max(0, Math.min(maxIdx, cur + dir));

    applySelection(idxToSel(next), true);
  }, [zoomEnabled, dev, selection, applySelection]);

  const onCanvasWheel = useCallback((e: React.WheelEvent<HTMLCanvasElement>) => {
    if (previewView !== '2d') return;
    if (!preview) return;
    // Evitar scroll de la página mientras se usa el canvas.
    e.preventDefault();

    const b0 = (detailViewportRef.current ?? (preview.bounds as Bounds)) as Bounds;
    const w0 = Math.max(1e-6, b0.max_x - b0.min_x);
    const h0 = Math.max(1e-6, b0.max_y - b0.min_y);
    const cx = (b0.min_x + b0.max_x) / 2;
    const cy = (b0.min_y + b0.max_y) / 2;

    // Wheel up -> zoom in (bounds smaller)
    const dir = e.deltaY < 0 ? -1 : 1;
    const factor = dir < 0 ? 0.90 : 1.10;
    const w1 = Math.max(1e-6, w0 * factor);
    const h1 = Math.max(1e-6, h0 * factor);

    setDetailViewport({
      min_x: cx - w1 / 2,
      max_x: cx + w1 / 2,
      min_y: cy - h1 / 2,
      max_y: cy + h1 / 2,
    });
  }, [previewView, preview, detailViewportRef, setDetailViewport]);

  const onCanvasPointerDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    if (previewView !== '2d') return;
    if (!preview) return;

    // Capturar pointer para pan (mouse/touch).
    const el = e.currentTarget as HTMLCanvasElement;
    try {
      el.setPointerCapture(e.pointerId);
    } catch {
      // ignore
    }

    pan2dRef.current.active = true;
    pan2dRef.current.moved = false;
    pan2dRef.current.pointerId = e.pointerId;
    pan2dRef.current.startX = e.clientX;
    pan2dRef.current.startY = e.clientY;
    pan2dRef.current.lastX = e.clientX;
    pan2dRef.current.lastY = e.clientY;
  }, [previewView, preview]);

  const onCanvasPointerMove = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    if (previewView !== '2d') return;
    if (!preview) return;
    if (!pan2dRef.current.active) return;
    if (pan2dRef.current.pointerId !== e.pointerId) return;

    const dxPx = e.clientX - pan2dRef.current.lastX;
    const dyPx = e.clientY - pan2dRef.current.lastY;
    pan2dRef.current.lastX = e.clientX;
    pan2dRef.current.lastY = e.clientY;

    const totalDx = e.clientX - pan2dRef.current.startX;
    const totalDy = e.clientY - pan2dRef.current.startY;
    if (!pan2dRef.current.moved) {
      if (Math.hypot(totalDx, totalDy) < 3) return;
      pan2dRef.current.moved = true;
    }

    e.preventDefault();

    const canvas = e.currentTarget as HTMLCanvasElement;
    const rect = canvas.getBoundingClientRect();
    const cssW = Math.max(1, Math.round(rect.width));
    const cssH = Math.max(1, Math.round(rect.height));

    const b0 = (detailViewportRef.current ?? (preview.bounds as Bounds)) as Bounds;
    const { scale } = fitTransform(b0, cssW, cssH);
    const s = Math.max(1e-6, scale);

    const dxW = dxPx / s;
    const yScale = steelViewActive && steelYScale2 ? 2 : 1;
    const dyW = dyPx / (s * Math.max(1e-6, yScale));

    setDetailViewport((prev) => {
      const b = (prev ?? (preview.bounds as Bounds)) as Bounds;
      // Drag "arrastra" el dibujo: mover bounds en sentido contrario en X.
      return {
        min_x: b.min_x - dxW,
        max_x: b.max_x - dxW,
        // En Y: arrastrar hacia abajo baja el dibujo -> bounds suben.
        min_y: b.min_y + dyW,
        max_y: b.max_y + dyW,
      };
    });
  }, [previewView, preview, detailViewportRef, steelViewActive, steelYScale2, setDetailViewport]);

  const onCanvasPointerUp = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    if (pan2dRef.current.pointerId !== e.pointerId) return;
    pan2dRef.current.active = false;
    try {
      (e.currentTarget as HTMLCanvasElement).releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
  }, []);

  const onCanvasClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    // Si fue un drag (pan), no disparar selección por click.
    if (pan2dRef.current.moved) {
      pan2dRef.current.moved = false;
      return;
    }
    if (!preview || !zoomEnabled) return;

    const rect = (e.currentTarget as HTMLCanvasElement).getBoundingClientRect();
    const cssW = Math.max(1, Math.round(rect.width));
    const cssH = Math.max(1, Math.round(rect.height));
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;

    const rb = (detailViewport ?? (preview.bounds as Bounds)) as Bounds;
    const { toWorld } = canvasUnmapper(rb, cssW, cssH);
    const [wx] = toWorld(cx, cy);

    const origins = computeNodeOrigins(dev);
    const nodeXs = origins.map((_: number, i: number) => computeNodeMarkerX(dev, origins, i));
    const spanXs = (dev.spans ?? []).map((_: any, i: number) => computeSpanMidX(dev, origins, i));

    let best: Selection = { kind: 'none' };
    let bestDist = Number.POSITIVE_INFINITY;

    for (let i = 0; i < nodeXs.length; i++) {
      const d = Math.abs(wx - nodeXs[i]);
      if (d < bestDist) {
        bestDist = d;
        best = { kind: 'node', index: i };
      }
    }
    for (let i = 0; i < spanXs.length; i++) {
      const d = Math.abs(wx - spanXs[i]);
      if (d < bestDist) {
        bestDist = d;
        best = { kind: 'span', index: i };
      }
    }

    // Umbral relativo para evitar selecciones accidentales
    const dx = (rb.max_x - rb.min_x) || 1;
    const threshold = dx * 0.06;
    if (best.kind !== 'none' && bestDist <= threshold) {
      applySelection(best, true);
    }
  }, [preview, zoomEnabled, detailViewport, dev, applySelection]);

  const onOverviewCanvasClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!preview || !zoomEnabled) return;

    const rect = (e.currentTarget as HTMLCanvasElement).getBoundingClientRect();
    const cssW = Math.max(1, Math.round(rect.width));
    const cssH = Math.max(1, Math.round(rect.height));
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;

    const rb = (preview.bounds as Bounds) as Bounds;
    const { toWorld } = canvasUnmapper(rb, cssW, cssH);
    const [wx] = toWorld(cx, cy);

    const origins = computeNodeOrigins(dev);
    const nodeXs = origins.map((_: number, i: number) => computeNodeMarkerX(dev, origins, i));
    const spanXs = (dev.spans ?? []).map((_: any, i: number) => computeSpanMidX(dev, origins, i));

    let best: Selection = { kind: 'none' };
    let bestDist = Number.POSITIVE_INFINITY;

    for (let i = 0; i < nodeXs.length; i++) {
      const d = Math.abs(wx - nodeXs[i]);
      if (d < bestDist) {
        bestDist = d;
        best = { kind: 'node', index: i };
      }
    }

    for (let i = 0; i < spanXs.length; i++) {
      const d = Math.abs(wx - spanXs[i]);
      if (d < bestDist) {
        bestDist = d;
        best = { kind: 'span', index: i };
      }
    }

    applySelection(best, true);
  }, [preview, zoomEnabled, dev, applySelection]);

  return {
    pan2dRef,
    applySelection,
    moveZoomSelection,
    onCanvasWheel,
    onCanvasPointerDown,
    onCanvasPointerMove,
    onCanvasPointerUp,
    onCanvasClick,
    onOverviewCanvasClick,
  };
}
