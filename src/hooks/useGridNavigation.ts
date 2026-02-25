import { useCallback } from 'react';

export function useGridNavigation() {
  const focusGridCell = useCallback((grid: 'spans' | 'nodes', row: number, col: number) => {
    const selector = `[data-grid="${grid}"][data-row="${row}"][data-col="${col}"]`;
    const el = document.querySelector<HTMLInputElement>(selector);
    if (!el) return;
    el.focus();
    // select() only works for text-like inputs; number inputs still focus correctly.
    try {
      (el as any).select?.();
    } catch {
      // ignore
    }
    el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, []);

  const onGridKeyDown = useCallback((
    e: React.KeyboardEvent<HTMLInputElement>,
    grid: 'spans' | 'nodes',
    row: number,
    col: number,
    maxRows: number,
    maxCols: number
  ) => {
    const k = e.key;
    let nextRow = row;
    let nextCol = col;

    if (k === 'ArrowRight') nextCol = col + 1;
    else if (k === 'ArrowLeft') nextCol = col - 1;
    else if (k === 'ArrowDown' || k === 'Enter') nextRow = row + (e.shiftKey ? -1 : 1);
    else if (k === 'ArrowUp') nextRow = row - 1;
    else return;

    if (nextRow < 0 || nextRow >= maxRows) return;
    if (nextCol < 0 || nextCol >= maxCols) return;

    e.preventDefault();
    focusGridCell(grid, nextRow, nextCol);
  }, [focusGridCell]);

  return { focusGridCell, onGridKeyDown };
}
