/**
 * Hooks personalizados para la aplicación DrawingCAD
 *
 * Fase 1 de refactorización - Hooks reutilizables
 */

export { useDebounce } from './useDebounce';
export { useAutoSave } from './useAutoSave';
export { useCanvasRender, useCanvasResize } from './useCanvasRender';
export { useSelection } from './useSelection';
export type { Selection } from './useSelection';
export { useDataMutations } from './useDataMutations';
export { useApiActions } from './useApiActions';
export { usePreferences } from './usePreferences';
export { useCanvasInteractions } from './useCanvasInteractions';
export { useGridNavigation } from './useGridNavigation';
export { useInitData } from './useInitData';
export { useBackendConfig } from './useBackendConfig';
export { useThreeScene } from './useThreeScene';
export { useSectionCanvas } from './useSectionCanvas';
export { useDetailCanvas } from './useDetailCanvas';
export { useOverviewCanvas } from './useOverviewCanvas';
