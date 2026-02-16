import { useEffect, useRef, useCallback } from 'react';

/**
 * Hook para auto-guardado con debounce
 *
 * Útil para persistir estado automáticamente después de cambios del usuario
 *
 * @param data - Datos a guardar (puede ser cualquier tipo)
 * @param onSave - Función asíncrona para guardar los datos
 * @param delay - Delay en milisegundos (default: 600ms)
 * @param deps - Dependencias adicionales para el efecto
 *
 * @example
 * ```tsx
 * useAutoSave(
 *   { appCfg, dev, exportOpts },
 *   async (data) => {
 *     await saveState(data);
 *   },
 *   600
 * );
 * ```
 */
export function useAutoSave<T>(
  data: T,
  onSave: (data: T) => Promise<void>,
  delay: number = 600,
  deps: unknown[] = []
): void {
  const timeoutRef = useRef<number | null>(null);
  const isMountedRef = useRef(false);

  // Memoizar onSave para evitar recrearlo en cada render
  const memoizedOnSave = useCallback(onSave, deps);

  useEffect(() => {
    // Marcar como montado
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    // Cancelar timeout anterior si existe
    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    // No guardar en el primer render (solo después de cambios)
    if (!isMountedRef.current) {
      isMountedRef.current = true;
      return;
    }

    // Programar guardado
    timeoutRef.current = window.setTimeout(async () => {
      try {
        await memoizedOnSave(data);
      } catch (e) {
        console.warn('[useAutoSave] Error al guardar:', e);
      } finally {
        timeoutRef.current = null;
      }
    }, delay);

    // Cleanup: cancelar timeout pendiente
    return () => {
      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [data, delay, memoizedOnSave]);
}
