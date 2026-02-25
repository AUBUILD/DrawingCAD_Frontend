import { useEffect, useRef, useState } from 'react';
import type { DevelopmentIn, PreviewResponse } from '../types';
import type { AppConfig, Bounds, QuantityDisplayState } from '../services';
import {
  drawPreview,
  drawLabels,
} from '../services';
import { drawSteelOverlay, drawCrossbeamsOverlay } from '../canvas';

interface UseDetailCanvasParams {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  preview: PreviewResponse | null;
  detailViewport: Bounds | null;
  dev: DevelopmentIn;
  previewPayloadInfo: { payload: any; key: string };
  showNT: boolean;
  steelViewActive: boolean;
  steelYScale2: boolean;
  showLongitudinal: boolean;
  showStirrups: boolean;
  recubrimiento: number;
  hookLegM: number;
  selectedBastonDetailTags?: string[] | null;
  selectedBastonDetailSpans?: number[] | null;
  quantityDisplay?: QuantityDisplayState;
  quantityCutsXU?: number[];
  selection: any;
  tab: string;
  steelViewPinned: boolean;
  sectionXU: number;
}

export function useDetailCanvas({
  canvasRef,
  preview,
  detailViewport,
  dev,
  previewPayloadInfo,
  showNT,
  steelViewActive,
  steelYScale2,
  showLongitudinal,
  showStirrups,
  recubrimiento,
  hookLegM,
  selectedBastonDetailTags,
  selectedBastonDetailSpans,
  quantityDisplay,
  quantityCutsXU,
  selection,
  tab,
  steelViewPinned,
  sectionXU,
}: UseDetailCanvasParams) {
  const previewDrawRafRef = useRef<number | null>(null);
  const previewOverlayRafRef = useRef<number | null>(null);
  const [previewCanvasResizeTick, setPreviewCanvasResizeTick] = useState(0);

  // Asegurar redraw 2D cuando el canvas cambia de tamaño (evita "se queda en blanco" al cambiar tab/layout).
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let raf = 0;
    const ro = new ResizeObserver(() => {
      if (raf) window.cancelAnimationFrame(raf);
      raf = window.requestAnimationFrame(() => setPreviewCanvasResizeTick((t) => t + 1));
    });
    ro.observe(canvas);
    return () => {
      if (raf) window.cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  // Render del canvas (sin refetch) para que el toggle N/T responda inmediato
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (previewDrawRafRef.current != null) {
      window.cancelAnimationFrame(previewDrawRafRef.current);
      previewDrawRafRef.current = null;
    }
    if (previewOverlayRafRef.current != null) {
      window.cancelAnimationFrame(previewOverlayRafRef.current);
      previewOverlayRafRef.current = null;
    }

    const rect = canvas.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) return;

    previewDrawRafRef.current = window.requestAnimationFrame(() => {
      const renderBounds = (detailViewport ?? (preview?.bounds as Bounds | undefined)) ?? null;
      const yScale = steelViewActive && steelYScale2 ? 2 : 1;
      drawPreview(canvas, preview, renderBounds, { yScale });
      // En la Vista con zoom NO se colorea la selección (solo en Vista general).

      const dev0 = previewPayloadInfo.payload.developments?.[0];
      if (preview && dev0 && showNT && renderBounds) drawLabels(canvas, preview, dev0, renderBounds, { yScale });

      // Dibujar vigas transversales
      if (dev && renderBounds) {
        try {
          drawCrossbeamsOverlay(canvas, dev, renderBounds, { yScale });
        } catch (e) {
          console.warn('Error dibujando vigas transversales en 2D:', e);
        }
      }

      // Dibujar acero en un segundo frame para evitar bloquear la primera pintura.
      if (preview && renderBounds && steelViewActive && ((showLongitudinal || showStirrups) || Boolean(quantityDisplay?.enabled))) {
        previewOverlayRafRef.current = window.requestAnimationFrame(() => {
          try {
            // Vista de acero activa (pestaña Acero o anclada): dibujar overlay 2D.
            if (showLongitudinal || showStirrups) {
              drawSteelOverlay(canvas, preview, dev, renderBounds, recubrimiento, hookLegM, {
                showLongitudinal,
                showStirrups,
                yScale: steelViewActive && steelYScale2 ? 2 : 1,
                highlightBastonTags: selectedBastonDetailTags ?? undefined,
                highlightBastonSpans: selectedBastonDetailSpans ?? undefined,
              });
            }
            // Cuantías se renderizan en Vista General (useOverviewCanvas) para una visualización más limpia.
          } catch (e) {
            console.warn('Error dibujando overlay 2D de acero', e);
          }
        });
      }
    });

    return () => {
      if (previewDrawRafRef.current != null) {
        window.cancelAnimationFrame(previewDrawRafRef.current);
        previewDrawRafRef.current = null;
      }
      if (previewOverlayRafRef.current != null) {
        window.cancelAnimationFrame(previewOverlayRafRef.current);
        previewOverlayRafRef.current = null;
      }
    };
  }, [
    preview,
    showNT,
    selection,
    detailViewport,
    dev,
    tab,
    steelViewPinned,
    recubrimiento,
    hookLegM,
    sectionXU,
    showLongitudinal,
    showStirrups,
    steelYScale2,
    quantityDisplay,
    quantityCutsXU,
    previewPayloadInfo.key,
    previewCanvasResizeTick,
  ]);
}
