import { useEffect, useRef, useState } from 'react';
import type { DevelopmentIn, PreviewResponse } from '../types';
import type { Bounds, Selection, QuantityDisplayState } from '../services';
import {
  drawPreview,
  drawLabels,
  drawSelectionOverlay,
  drawCutMarker2D,
} from '../services';
import { drawQuantityOverlay } from '../canvas';

interface UseOverviewCanvasParams {
  overviewCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  preview: PreviewResponse | null;
  dev: DevelopmentIn;
  selection: Selection;
  previewPayloadInfo: { payload: any; key: string };
  showNT: boolean;
  steelViewActive: boolean;
  sectionXU: number;
  recubrimiento: number;
  quantityDisplay?: QuantityDisplayState;
  quantityCutsXU?: number[];
  tab: string;
  steelViewPinned: boolean;
}

export function useOverviewCanvas({
  overviewCanvasRef,
  preview,
  dev,
  selection,
  previewPayloadInfo,
  showNT,
  steelViewActive,
  sectionXU,
  recubrimiento,
  quantityDisplay,
  quantityCutsXU,
  tab,
  steelViewPinned,
}: UseOverviewCanvasParams) {
  const overviewPreviewDrawRafRef = useRef<number | null>(null);
  const overviewPreviewOverlayRafRef = useRef<number | null>(null);
  const [overviewCanvasResizeTick, setOverviewCanvasResizeTick] = useState(0);

  // Redraw overview 2D cuando cambia su tamaño.
  useEffect(() => {
    const canvas = overviewCanvasRef.current;
    if (!canvas) return;
    let raf = 0;
    const ro = new ResizeObserver(() => {
      if (raf) window.cancelAnimationFrame(raf);
      raf = window.requestAnimationFrame(() => setOverviewCanvasResizeTick((t) => t + 1));
    });
    ro.observe(canvas);
    return () => {
      if (raf) window.cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  // Render del canvas overview (estático: siempre bounds completos)
  useEffect(() => {
    const canvas = overviewCanvasRef.current;
    if (!canvas) return;
    if (overviewPreviewDrawRafRef.current != null) {
      window.cancelAnimationFrame(overviewPreviewDrawRafRef.current);
      overviewPreviewDrawRafRef.current = null;
    }
    if (overviewPreviewOverlayRafRef.current != null) {
      window.cancelAnimationFrame(overviewPreviewOverlayRafRef.current);
      overviewPreviewOverlayRafRef.current = null;
    }

    const rect = canvas.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) return;

    overviewPreviewDrawRafRef.current = window.requestAnimationFrame(() => {
      const renderBounds = (preview?.bounds as Bounds | undefined) ?? null;
      drawPreview(canvas, preview, renderBounds);
      if (preview && renderBounds) drawSelectionOverlay(canvas, preview, dev, selection, renderBounds);

      const dev0 = previewPayloadInfo.payload.developments?.[0];
      if (preview && dev0 && showNT && renderBounds) drawLabels(canvas, preview, dev0, renderBounds);

      // La línea de corte se visualiza solo en la Vista general.
      if (steelViewActive && preview && renderBounds) {
        drawCutMarker2D(canvas, preview, renderBounds, sectionXU);
      }
      if (preview && renderBounds && quantityDisplay?.enabled) {
        drawQuantityOverlay(canvas, preview, dev, renderBounds, {
          cutsXU: quantityCutsXU ?? [],
          recubrimientoM: recubrimiento,
          display: quantityDisplay,
        });
      }
    });

    return () => {
      if (overviewPreviewDrawRafRef.current != null) {
        window.cancelAnimationFrame(overviewPreviewDrawRafRef.current);
        overviewPreviewDrawRafRef.current = null;
      }
      if (overviewPreviewOverlayRafRef.current != null) {
        window.cancelAnimationFrame(overviewPreviewOverlayRafRef.current);
        overviewPreviewOverlayRafRef.current = null;
      }
    };
  }, [
    preview,
    showNT,
    selection,
    dev,
    tab,
    steelViewPinned,
    sectionXU,
    recubrimiento,
    quantityDisplay,
    quantityCutsXU,
    previewPayloadInfo.key,
    overviewCanvasResizeTick,
  ]);
}
