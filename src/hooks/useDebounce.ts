import { useEffect, useRef } from 'react';

/**
 * Hook para debounce de valores con callback asíncrono
 *
 * Maneja race conditions usando un sequence counter
 *
 * @param value - Valor a hacer debounce
 * @param delay - Delay en milisegundos
 * @param onSave - Callback asíncrono a ejecutar después del delay
 *
 * @example
 * ```tsx
 * useDebounce(hookLegDraft, 500, async (val) => {
 *   const v = parseFloat(val);
 *   if (!Number.isFinite(v) || v <= 0) return;
 *   await updateConfig({ hook_leg_m: v });
 * });
 * ```
 */
export function useDebounce<T>(
  value: T,
  delay: number,
  onSave: (val: T) => Promise<void>
): void {
  const seqRef = useRef(0);

  useEffect(() => {
    // Incrementar sequence para detectar si este efecto fue cancelado
    const seq = ++seqRef.current;

    const timer = window.setTimeout(async () => {
      try {
        await onSave(value);

        // Verificar si este efecto sigue siendo el más reciente
        if (seqRef.current !== seq) {
          console.log('[useDebounce] Efecto cancelado (sequence mismatch)');
          return;
        }
      } catch (e) {
        console.warn('[useDebounce] Error en onSave:', e);
      }
    }, delay);

    // Cleanup: cancelar timeout si el efecto se ejecuta de nuevo
    return () => {
      window.clearTimeout(timer);
    };
  }, [value, delay, onSave]);
}
