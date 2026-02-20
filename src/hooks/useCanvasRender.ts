import { useEffect, useRef, RefObject } from 'react';

/**
 * Hook para renderizar canvas con RAF (RequestAnimationFrame)
 *
 * Optimiza el rendering cancelando frames anteriores y usando RAF
 * para evitar bloquear el thread principal
 *
 * @param canvasRef - Referencia al elemento canvas
 * @param drawFn - Función de dibujo que recibe el canvas
 * @param deps - Array de dependencias que triggean re-render
 *
 * @example
 * ```tsx
 * const canvasRef = useRef<HTMLCanvasElement>(null);
 *
 * useCanvasRender(
 *   canvasRef,
 *   (canvas) => {
 *     const ctx = canvas.getContext('2d');
 *     if (!ctx) return;
 *     // ... drawing logic
 *   },
 *   [preview, dev, selection]
 * );
 * ```
 */
export function useCanvasRender(
  canvasRef: RefObject<HTMLCanvasElement>,
  drawFn: (canvas: HTMLCanvasElement) => void,
  deps: unknown[]
): void {
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      console.warn('[useCanvasRender] Canvas ref no disponible');
      return;
    }

    // Cancelar RAF anterior si existe
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }

    // Programar dibujo en el próximo frame
    rafRef.current = requestAnimationFrame(() => {
      try {
        drawFn(canvas);
      } catch (e) {
        console.error('[useCanvasRender] Error en drawFn:', e);
      } finally {
        rafRef.current = null;
      }
    });

    // Cleanup: cancelar RAF pendiente
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, deps);
}

/**
 * Hook para detectar resize de canvas con ResizeObserver
 *
 * @param canvasRef - Referencia al elemento canvas
 * @param onResize - Callback cuando el canvas cambia de tamaño
 *
 * @example
 * ```tsx
 * const [resizeTick, setResizeTick] = useState(0);
 *
 * useCanvasResize(canvasRef, () => {
 *   setResizeTick(t => t + 1);
 * });
 * ```
 */
export function useCanvasResize(
  canvasRef: RefObject<HTMLCanvasElement>,
  onResize: () => void
): void {
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const observer = new ResizeObserver(() => {
      onResize();
    });

    observer.observe(canvas);

    return () => {
      observer.disconnect();
    };
  }, [canvasRef, onResize]);
}
