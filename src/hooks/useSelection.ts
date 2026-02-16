import { useState, useCallback } from 'react';

/**
 * Tipo de selección en la aplicación
 */
export type Selection =
  | { kind: 'node'; index: number }
  | { kind: 'span'; index: number }
  | { kind: 'none' };

/**
 * Hook para manejar la selección de elementos (nodos/tramos)
 *
 * Proporciona funciones para seleccionar, navegar y limpiar la selección
 *
 * @param initialSelection - Selección inicial (default: none)
 *
 * @example
 * ```tsx
 * const {
 *   selection,
 *   setSelection,
 *   moveSelection,
 *   clearSelection,
 *   selectSpan,
 *   selectNode
 * } = useSelection();
 *
 * // Navegar con flechas
 * moveSelection(1, spans.length - 1); // Siguiente
 * moveSelection(-1, spans.length - 1); // Anterior
 * ```
 */
export function useSelection(initialSelection: Selection = { kind: 'none' }) {
  const [selection, setSelection] = useState<Selection>(initialSelection);

  /**
   * Navega a la siguiente/anterior selección
   * @param direction -1 (anterior) o 1 (siguiente)
   * @param maxIndex Índice máximo permitido
   */
  const moveSelection = useCallback((direction: -1 | 1, maxIndex: number) => {
    setSelection((prev) => {
      // Si no hay selección, empezar desde el primer span
      if (prev.kind === 'none') {
        return { kind: 'span', index: 0 };
      }

      // Calcular nuevo índice
      const nextIndex = prev.index + direction;

      // Validar límites
      if (nextIndex < 0 || nextIndex > maxIndex) {
        return prev; // No cambiar si está fuera de límites
      }

      // Mantener el mismo kind pero cambiar índice
      return { ...prev, index: nextIndex };
    });
  }, []);

  /**
   * Limpia la selección (vuelve a 'none')
   */
  const clearSelection = useCallback(() => {
    setSelection({ kind: 'none' });
  }, []);

  /**
   * Selecciona un span específico
   */
  const selectSpan = useCallback((index: number) => {
    setSelection({ kind: 'span', index });
  }, []);

  /**
   * Selecciona un nodo específico
   */
  const selectNode = useCallback((index: number) => {
    setSelection({ kind: 'node', index });
  }, []);

  /**
   * Alterna entre seleccionar y deseleccionar un elemento
   */
  const toggleSelection = useCallback((kind: 'span' | 'node', index: number) => {
    setSelection((prev) => {
      // Si ya está seleccionado, deseleccionar
      if (prev.kind === kind && prev.index === index) {
        return { kind: 'none' };
      }
      // Si no, seleccionar
      return { kind, index };
    });
  }, []);

  /**
   * Verifica si un elemento está seleccionado
   */
  const isSelected = useCallback((kind: 'span' | 'node', index: number): boolean => {
    return selection.kind === kind && selection.index === index;
  }, [selection]);

  return {
    selection,
    setSelection,
    moveSelection,
    clearSelection,
    selectSpan,
    selectNode,
    toggleSelection,
    isSelected,
  };
}
