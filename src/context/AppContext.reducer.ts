import type { AppState, AppAction, BastonCfg } from './AppContext.types';

/**
 * Reducer principal de la aplicación
 * Maneja todas las actualizaciones de estado de forma inmutable
 */
export function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    // ========== Development mutations ==========
    case 'SET_DEV':
      return { ...state, dev: action.payload };

    case 'UPDATE_DEV_PATCH':
      return { ...state, dev: { ...state.dev, ...action.payload } };

    case 'UPDATE_SPAN': {
      const { spanIdx, patch } = action.payload;
      const spans = state.dev.spans ?? [];
      if (spanIdx < 0 || spanIdx >= spans.length) return state;
      const newSpans = [...spans];
      newSpans[spanIdx] = { ...newSpans[spanIdx], ...patch };
      return { ...state, dev: { ...state.dev, spans: newSpans } };
    }

    case 'UPDATE_NODE': {
      const { nodeIdx, patch } = action.payload;
      const nodes = state.dev.nodes ?? [];
      if (nodeIdx < 0 || nodeIdx >= nodes.length) return state;
      const newNodes = [...nodes];
      newNodes[nodeIdx] = { ...newNodes[nodeIdx], ...patch };
      return { ...state, dev: { ...state.dev, nodes: newNodes } };
    }

    case 'UPDATE_SPAN_STEEL': {
      const { spanIdx, side, patch } = action.payload;
      const spans = state.dev.spans ?? [];
      if (spanIdx < 0 || spanIdx >= spans.length) return state;
      const span = spans[spanIdx];
      const key = side === 'top' ? 'steel_top' : 'steel_bottom';
      const newSpans = [...spans];
      newSpans[spanIdx] = {
        ...span,
        [key]: { ...(span[key] as any), ...patch },
      };
      return { ...state, dev: { ...state.dev, spans: newSpans } };
    }

    case 'UPDATE_SPAN_STIRRUPS': {
      const { spanIdx, patch } = action.payload;
      const spans = state.dev.spans ?? [];
      if (spanIdx < 0 || spanIdx >= spans.length) return state;
      const span = spans[spanIdx];
      const newSpans = [...spans];
      newSpans[spanIdx] = {
        ...span,
        stirrups: { ...(span as any).stirrups, ...patch } as any,
      };
      return { ...state, dev: { ...state.dev, spans: newSpans } };
    }

    case 'UPDATE_SPAN_STIRRUPS_SECTION': {
      const { spanIdx, patch } = action.payload;
      const spans = state.dev.spans ?? [];
      if (spanIdx < 0 || spanIdx >= spans.length) return state;
      const span = spans[spanIdx];
      const newSpans = [...spans];
      newSpans[spanIdx] = {
        ...span,
        stirrups_section: { ...(span as any).stirrups_section, ...patch } as any,
      };
      return { ...state, dev: { ...state.dev, spans: newSpans } };
    }

    case 'UPDATE_BASTON': {
      const { spanIdx, side, zone, patch } = action.payload;
      const spans = state.dev.spans ?? [];
      if (spanIdx < 0 || spanIdx >= spans.length) return state;
      const span = spans[spanIdx];
      const bastones = (span as any).bastones ?? {};
      const sideCfg = (side === 'top' ? bastones.top : bastones.bottom) ?? {};
      const zoneCfg = (sideCfg[zone] ?? {}) as BastonCfg;

      const newSpans = [...spans];
      newSpans[spanIdx] = {
        ...span,
        bastones: {
          ...bastones,
          [side]: {
            ...sideCfg,
            [zone]: { ...zoneCfg, ...patch },
          },
        },
      } as any;
      return { ...state, dev: { ...state.dev, spans: newSpans } };
    }

    // ========== App config ==========
    case 'SET_APP_CFG':
      return { ...state, appCfg: action.payload };

    case 'UPDATE_APP_CFG_PATCH':
      return { ...state, appCfg: { ...state.appCfg, ...action.payload } };

    case 'SET_BACKEND_CFG':
      return { ...state, backendCfg: action.payload };

    // ========== UI state ==========
    case 'SET_TAB':
      return { ...state, tab: action.payload };

    case 'SET_BUSY':
      return { ...state, busy: action.payload };

    case 'SET_ERROR':
      return { ...state, error: action.payload };

    case 'SET_WARNING':
      return { ...state, warning: action.payload };

    case 'SET_SAVE_STATUS':
      return { ...state, saveStatus: action.payload };

    // ========== Preview ==========
    case 'SET_PREVIEW':
      return { ...state, preview: action.payload };

    case 'SET_PREVIEW_VIEW':
      return { ...state, previewView: action.payload };

    case 'SET_THREE_PROJECTION':
      return { ...state, threeProjection: action.payload };

    case 'SET_SHOW_LONGITUDINAL':
      return { ...state, showLongitudinal: action.payload };

    case 'SET_SHOW_STIRRUPS':
      return { ...state, showStirrups: action.payload };

    case 'SET_STEEL_Y_SCALE_2':
      return { ...state, steelYScale2: action.payload };

    case 'SET_STEEL_VIEW_PINNED':
      return { ...state, steelViewPinned: action.payload };

    case 'SET_SHOW_NT':
      return { ...state, showNT: action.payload };

    case 'SET_ZOOM_ENABLED':
      return { ...state, zoomEnabled: action.payload };

    // ========== Selection & viewport ==========
    case 'SET_SELECTION':
      return { ...state, selection: action.payload };

    case 'SET_DETAIL_VIEWPORT':
      return { ...state, detailViewport: action.payload };

    case 'SET_SECTION_XU':
      return { ...state, sectionXU: action.payload };

    case 'SET_SAVED_CUTS':
      return { ...state, savedCuts: action.payload };

    case 'UPDATE_SAVED_CUTS':
      return { ...state, savedCuts: action.payload(state.savedCuts) };

    // ========== Editor & preferences ==========
    case 'SET_JSON_TEXT':
      return { ...state, jsonText: action.payload };

    case 'SET_DEFAULT_PREF':
      return { ...state, defaultPref: action.payload };

    case 'SET_EDITOR_OPEN':
      return { ...state, editorOpen: action.payload };

    case 'SET_CONCRETO_LOCKED':
      return { ...state, concretoLocked: action.payload };

    // ========== Template & export ==========
    case 'SET_TEMPLATE_NAME':
      return { ...state, templateName: action.payload };

    case 'SET_TEMPLATE_LAYERS':
      return { ...state, templateLayers: action.payload };

    case 'SET_CASCO_LAYER':
      return { ...state, cascoLayer: action.payload };

    case 'SET_STEEL_LAYER':
      return { ...state, steelLayer: action.payload };

    case 'SET_DRAW_STEEL':
      return { ...state, drawSteel: action.payload };

    // ========== Draft states ==========
    case 'SET_HOOK_LEG_DRAFT':
      return { ...state, hookLegDraft: action.payload };

    case 'SET_STEEL_TEXT_LAYER_DRAFT':
      return { ...state, steelTextLayerDraft: action.payload };

    case 'SET_STEEL_TEXT_STYLE_DRAFT':
      return { ...state, steelTextStyleDraft: action.payload };

    case 'SET_STEEL_TEXT_HEIGHT_DRAFT':
      return { ...state, steelTextHeightDraft: action.payload };

    case 'SET_STEEL_TEXT_WIDTH_DRAFT':
      return { ...state, steelTextWidthDraft: action.payload };

    case 'SET_STEEL_TEXT_OBLIQUE_DRAFT':
      return { ...state, steelTextObliqueDraft: action.payload };

    case 'SET_STEEL_TEXT_ROTATION_DRAFT':
      return { ...state, steelTextRotationDraft: action.payload };

    case 'SET_SLAB_PROJ_OFFSET_DRAFT':
      return { ...state, slabProjOffsetDraft: action.payload };

    case 'SET_SLAB_PROJ_LAYER_DRAFT':
      return { ...state, slabProjLayerDraft: action.payload };

    case 'SET_STEEL_LAYOUT_DRAFT':
      return { ...state, steelLayoutDraft: action.payload };

    case 'SET_BASTON_LEN_EDITS':
      return { ...state, bastonLenEdits: action.payload };

    case 'UPDATE_BASTON_LEN_EDITS':
      return { ...state, bastonLenEdits: action.payload(state.bastonLenEdits) };

    case 'SET_STIRRUPS_ABCR_EDITS':
      return { ...state, stirrupsAbcrEdits: action.payload };

    case 'UPDATE_STIRRUPS_ABCR_EDITS':
      return { ...state, stirrupsAbcrEdits: action.payload(state.stirrupsAbcrEdits) };

    default:
      return state;
  }
}
