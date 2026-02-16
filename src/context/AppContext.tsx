import React, { createContext, useContext, useReducer, type ReactNode } from 'react';
import type { AppState, AppAction } from './AppContext.types';
import { appReducer } from './AppContext.reducer';

/**
 * Context para el estado de la aplicación
 */
const AppStateContext = createContext<AppState | undefined>(undefined);

/**
 * Context para el dispatch de acciones
 */
const AppDispatchContext = createContext<React.Dispatch<AppAction> | undefined>(undefined);

/**
 * Props del AppProvider
 */
export interface AppProviderProps {
  children: ReactNode;
  initialState: AppState;
}

/**
 * Provider principal que envuelve toda la aplicación
 * Provee acceso al estado global y al dispatch de acciones
 */
export function AppProvider({ children, initialState }: AppProviderProps) {
  const [state, dispatch] = useReducer(appReducer, initialState);

  return (
    <AppStateContext.Provider value={state}>
      <AppDispatchContext.Provider value={dispatch}>
        {children}
      </AppDispatchContext.Provider>
    </AppStateContext.Provider>
  );
}

/**
 * Hook para acceder al estado global
 * @throws Error si se usa fuera del AppProvider
 */
export function useAppState(): AppState {
  const context = useContext(AppStateContext);
  if (context === undefined) {
    throw new Error('useAppState must be used within an AppProvider');
  }
  return context;
}

/**
 * Hook para acceder al dispatch de acciones
 * @throws Error si se usa fuera del AppProvider
 */
export function useAppDispatch(): React.Dispatch<AppAction> {
  const context = useContext(AppDispatchContext);
  if (context === undefined) {
    throw new Error('useAppDispatch must be used within an AppProvider');
  }
  return context;
}

/**
 * Hook combinado que retorna tanto el estado como el dispatch
 * Útil cuando se necesitan ambos en el mismo componente
 */
export function useApp(): [AppState, React.Dispatch<AppAction>] {
  return [useAppState(), useAppDispatch()];
}

/**
 * Helpers para dispatch tipado (alternativa a dispatch directo)
 * Estos helpers proveen mejor autocompletado y type safety
 */
export const useAppActions = () => {
  const dispatch = useAppDispatch();

  return {
    // Development
    setDev: (dev: AppState['dev']) => dispatch({ type: 'SET_DEV', payload: dev }),
    updateDevPatch: (patch: Partial<AppState['dev']>) => dispatch({ type: 'UPDATE_DEV_PATCH', payload: patch }),
    updateSpan: (spanIdx: number, patch: any) => dispatch({ type: 'UPDATE_SPAN', payload: { spanIdx, patch } }),
    updateNode: (nodeIdx: number, patch: any) => dispatch({ type: 'UPDATE_NODE', payload: { nodeIdx, patch } }),
    updateSpanSteel: (spanIdx: number, side: 'top' | 'bottom', patch: any) =>
      dispatch({ type: 'UPDATE_SPAN_STEEL', payload: { spanIdx, side, patch } }),
    updateSpanStirrups: (spanIdx: number, patch: any) =>
      dispatch({ type: 'UPDATE_SPAN_STIRRUPS', payload: { spanIdx, patch } }),
    updateSpanStirrupsSection: (spanIdx: number, patch: any) =>
      dispatch({ type: 'UPDATE_SPAN_STIRRUPS_SECTION', payload: { spanIdx, patch } }),
    updateBaston: (spanIdx: number, side: 'top' | 'bottom', zone: 'z1' | 'z2' | 'z3', patch: any) =>
      dispatch({ type: 'UPDATE_BASTON', payload: { spanIdx, side, zone, patch } }),

    // App config
    setAppCfg: (cfg: AppState['appCfg']) => dispatch({ type: 'SET_APP_CFG', payload: cfg }),
    updateAppCfgPatch: (patch: Partial<AppState['appCfg']>) => dispatch({ type: 'UPDATE_APP_CFG_PATCH', payload: patch }),
    setBackendCfg: (cfg: AppState['backendCfg']) => dispatch({ type: 'SET_BACKEND_CFG', payload: cfg }),

    // UI
    setTab: (tab: AppState['tab']) => dispatch({ type: 'SET_TAB', payload: tab }),
    setBusy: (busy: boolean) => dispatch({ type: 'SET_BUSY', payload: busy }),
    setError: (error: string | null) => dispatch({ type: 'SET_ERROR', payload: error }),
    setWarning: (warning: string | null) => dispatch({ type: 'SET_WARNING', payload: warning }),
    setSaveStatus: (status: AppState['saveStatus']) => dispatch({ type: 'SET_SAVE_STATUS', payload: status }),

    // Preview
    setPreview: (preview: AppState['preview']) => dispatch({ type: 'SET_PREVIEW', payload: preview }),
    setPreviewView: (view: AppState['previewView']) => dispatch({ type: 'SET_PREVIEW_VIEW', payload: view }),
    setThreeProjection: (proj: AppState['threeProjection']) => dispatch({ type: 'SET_THREE_PROJECTION', payload: proj }),
    setShowLongitudinal: (show: boolean) => dispatch({ type: 'SET_SHOW_LONGITUDINAL', payload: show }),
    setShowStirrups: (show: boolean) => dispatch({ type: 'SET_SHOW_STIRRUPS', payload: show }),
    setSteelYScale2: (scale: boolean) => dispatch({ type: 'SET_STEEL_Y_SCALE_2', payload: scale }),
    setSteelViewPinned: (pinned: boolean) => dispatch({ type: 'SET_STEEL_VIEW_PINNED', payload: pinned }),
    setShowNT: (show: boolean) => dispatch({ type: 'SET_SHOW_NT', payload: show }),
    setZoomEnabled: (enabled: boolean) => dispatch({ type: 'SET_ZOOM_ENABLED', payload: enabled }),

    // Selection & viewport
    setSelection: (sel: AppState['selection']) => dispatch({ type: 'SET_SELECTION', payload: sel }),
    setDetailViewport: (viewport: AppState['detailViewport']) => dispatch({ type: 'SET_DETAIL_VIEWPORT', payload: viewport }),
    setSectionXU: (xU: number) => dispatch({ type: 'SET_SECTION_XU', payload: xU }),
    setSavedCuts: (cuts: AppState['savedCuts'] | ((prev: AppState['savedCuts']) => AppState['savedCuts'])) => {
      if (typeof cuts === 'function') {
        dispatch({ type: 'UPDATE_SAVED_CUTS', payload: cuts });
      } else {
        dispatch({ type: 'SET_SAVED_CUTS', payload: cuts });
      }
    },

    // Editor & preferences
    setJsonText: (text: string) => dispatch({ type: 'SET_JSON_TEXT', payload: text }),
    setDefaultPref: (pref: AppState['defaultPref']) => dispatch({ type: 'SET_DEFAULT_PREF', payload: pref }),
    setEditorOpen: (open: boolean) => dispatch({ type: 'SET_EDITOR_OPEN', payload: open }),
    setConcretoLocked: (locked: boolean) => dispatch({ type: 'SET_CONCRETO_LOCKED', payload: locked }),

    // Template & export
    setTemplateName: (name: string | null) => dispatch({ type: 'SET_TEMPLATE_NAME', payload: name }),
    setTemplateLayers: (layers: string[]) => dispatch({ type: 'SET_TEMPLATE_LAYERS', payload: layers }),
    setCascoLayer: (layer: string) => dispatch({ type: 'SET_CASCO_LAYER', payload: layer }),
    setSteelLayer: (layer: string) => dispatch({ type: 'SET_STEEL_LAYER', payload: layer }),
    setDrawSteel: (draw: boolean) => dispatch({ type: 'SET_DRAW_STEEL', payload: draw }),

    // Draft states
    setHookLegDraft: (draft: string) => dispatch({ type: 'SET_HOOK_LEG_DRAFT', payload: draft }),
    setSteelTextLayerDraft: (draft: string) => dispatch({ type: 'SET_STEEL_TEXT_LAYER_DRAFT', payload: draft }),
    setSteelTextStyleDraft: (draft: string) => dispatch({ type: 'SET_STEEL_TEXT_STYLE_DRAFT', payload: draft }),
    setSteelTextHeightDraft: (draft: string) => dispatch({ type: 'SET_STEEL_TEXT_HEIGHT_DRAFT', payload: draft }),
    setSteelTextWidthDraft: (draft: string) => dispatch({ type: 'SET_STEEL_TEXT_WIDTH_DRAFT', payload: draft }),
    setSteelTextObliqueDraft: (draft: string) => dispatch({ type: 'SET_STEEL_TEXT_OBLIQUE_DRAFT', payload: draft }),
    setSteelTextRotationDraft: (draft: string) => dispatch({ type: 'SET_STEEL_TEXT_ROTATION_DRAFT', payload: draft }),
    setSlabProjOffsetDraft: (draft: string) => dispatch({ type: 'SET_SLAB_PROJ_OFFSET_DRAFT', payload: draft }),
    setSlabProjLayerDraft: (draft: string) => dispatch({ type: 'SET_SLAB_PROJ_LAYER_DRAFT', payload: draft }),
    setSteelLayoutDraft: (draft: string) => dispatch({ type: 'SET_STEEL_LAYOUT_DRAFT', payload: draft }),
    setBastonLenEdits: (edits: AppState['bastonLenEdits'] | ((prev: AppState['bastonLenEdits']) => AppState['bastonLenEdits'])) => {
      if (typeof edits === 'function') {
        dispatch({ type: 'UPDATE_BASTON_LEN_EDITS', payload: edits });
      } else {
        dispatch({ type: 'SET_BASTON_LEN_EDITS', payload: edits });
      }
    },
    setStirrupsAbcrEdits: (
      edits: AppState['stirrupsAbcrEdits'] | ((prev: AppState['stirrupsAbcrEdits']) => AppState['stirrupsAbcrEdits'])
    ) => {
      if (typeof edits === 'function') {
        dispatch({ type: 'UPDATE_STIRRUPS_ABCR_EDITS', payload: edits });
      } else {
        dispatch({ type: 'SET_STIRRUPS_ABCR_EDITS', payload: edits });
      }
    },
  };
};
