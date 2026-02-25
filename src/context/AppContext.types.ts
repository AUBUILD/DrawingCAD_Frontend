import type {
  DevelopmentIn,
  NodeIn,
  PreviewResponse,
  SpanIn,
  SteelMeta,
  StirrupsDistributionIn,
  StirrupsSectionIn,
  BackendAppConfig,
} from '../types';

/**
 * Tipo de tab activo
 */
export type Tab = 'config' | 'concreto' | 'acero' | 'json';

/**
 * Vista de preview (2D o 3D)
 */
export type PreviewView = '2d' | '3d';

/**
 * Proyección 3D
 */
export type ThreeProjection = 'perspective' | 'orthographic';

/**
 * Preferencia por defecto
 */
export type DefaultPreferenceId = 'basico' | 'basico_bastones' | 'personalizado';

/**
 * Estado de guardado
 */
export type SaveStatus = 'saved' | 'saving' | 'error' | null;

/**
 * Selección actual (del hook useSelection)
 */
export interface Selection {
  kind: 'none' | 'span' | 'node';
  spanIdx?: number;
  nodeIdx?: number;
}

/**
 * Bounds para viewport
 */
export interface Bounds {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

/**
 * AppConfig local (diferente de BackendAppConfig)
 */
export interface AppConfig {
  d: number;
  unit_scale: number;
  x0: number;
  y0: number;
  recubrimiento: number;
  baston_Lc: number;
  hook_leg: number;
}

/**
 * Configuración de BastonCfg (del SteelTab)
 */
export interface BastonCfg {
  l1_enabled?: boolean;
  l2_enabled?: boolean;
  l1_qty?: number;
  l2_qty?: number;
  l1_diameter?: string;
  l2_diameter?: string;
  L1_m?: number;
  L2_m?: number;
  L3_m?: number;
}

/**
 * Corte guardado
 */
export interface SavedCut {
  xU: number;
}

/**
 * Estado global de la aplicación
 */
export interface AppState {
  // Core data
  dev: DevelopmentIn;
  appCfg: AppConfig;
  preview: PreviewResponse | null;
  backendCfg: BackendAppConfig | null;

  // UI state
  tab: Tab;
  busy: boolean;
  error: string | null;
  warning: string | null;
  saveStatus: SaveStatus;

  // View state
  previewView: PreviewView;
  threeProjection: ThreeProjection;
  showLongitudinal: boolean;
  showStirrups: boolean;
  steelYScale2: boolean;
  steelViewPinned: boolean;
  showNT: boolean;
  zoomEnabled: boolean;

  // Selection & viewport
  selection: Selection;
  detailViewport: Bounds | null;
  sectionXU: number;
  savedCuts: SavedCut[];

  // Editor & preferences
  jsonText: string;
  defaultPref: DefaultPreferenceId;
  editorOpen: boolean;
  concretoLocked: boolean;

  // Template & export
  templateName: string | null;
  templateLayers: string[];
  cascoLayer: string;
  steelLayer: string;
  drawSteel: boolean;

  // Draft states (para edición inline)
  hookLegDraft: string;
  steelTextLayerDraft: string;
  steelTextStyleDraft: string;
  steelTextHeightDraft: string;
  steelTextWidthDraft: string;
  steelTextObliqueDraft: string;
  steelTextRotationDraft: string;
  slabProjOffsetDraft: string;
  slabProjLayerDraft: string;
  steelLayoutDraft: string;
  bastonLenEdits: Record<string, string>;
  stirrupsAbcrEdits: Record<string, string>;
}

/**
 * Acciones del reducer
 */
export type AppAction =
  // Development mutations
  | { type: 'SET_DEV'; payload: DevelopmentIn }
  | { type: 'UPDATE_DEV_PATCH'; payload: Partial<DevelopmentIn> }
  | { type: 'UPDATE_SPAN'; payload: { spanIdx: number; patch: Partial<SpanIn> } }
  | { type: 'UPDATE_NODE'; payload: { nodeIdx: number; patch: Partial<NodeIn> } }
  | { type: 'UPDATE_SPAN_STEEL'; payload: { spanIdx: number; side: 'top' | 'bottom'; patch: Partial<SteelMeta> } }
  | { type: 'UPDATE_SPAN_STIRRUPS'; payload: { spanIdx: number; patch: Partial<StirrupsDistributionIn> } }
  | { type: 'UPDATE_SPAN_STIRRUPS_SECTION'; payload: { spanIdx: number; patch: Partial<StirrupsSectionIn> } }
  | { type: 'UPDATE_BASTON'; payload: { spanIdx: number; side: 'top' | 'bottom'; zone: 'z1' | 'z2' | 'z3'; patch: Partial<BastonCfg> } }

  // App config
  | { type: 'SET_APP_CFG'; payload: AppConfig }
  | { type: 'UPDATE_APP_CFG_PATCH'; payload: Partial<AppConfig> }
  | { type: 'SET_BACKEND_CFG'; payload: BackendAppConfig | null }

  // UI state
  | { type: 'SET_TAB'; payload: Tab }
  | { type: 'SET_BUSY'; payload: boolean }
  | { type: 'SET_ERROR'; payload: string | null }
  | { type: 'SET_WARNING'; payload: string | null }
  | { type: 'SET_SAVE_STATUS'; payload: SaveStatus }

  // Preview
  | { type: 'SET_PREVIEW'; payload: PreviewResponse | null }
  | { type: 'SET_PREVIEW_VIEW'; payload: PreviewView }
  | { type: 'SET_THREE_PROJECTION'; payload: ThreeProjection }
  | { type: 'SET_SHOW_LONGITUDINAL'; payload: boolean }
  | { type: 'SET_SHOW_STIRRUPS'; payload: boolean }
  | { type: 'SET_STEEL_Y_SCALE_2'; payload: boolean }
  | { type: 'SET_STEEL_VIEW_PINNED'; payload: boolean }
  | { type: 'SET_SHOW_NT'; payload: boolean }
  | { type: 'SET_ZOOM_ENABLED'; payload: boolean }

  // Selection & viewport
  | { type: 'SET_SELECTION'; payload: Selection }
  | { type: 'SET_DETAIL_VIEWPORT'; payload: Bounds | null }
  | { type: 'SET_SECTION_XU'; payload: number }
  | { type: 'SET_SAVED_CUTS'; payload: SavedCut[] }
  | { type: 'UPDATE_SAVED_CUTS'; payload: (prev: SavedCut[]) => SavedCut[] }

  // Editor & preferences
  | { type: 'SET_JSON_TEXT'; payload: string }
  | { type: 'SET_DEFAULT_PREF'; payload: DefaultPreferenceId }
  | { type: 'SET_EDITOR_OPEN'; payload: boolean }
  | { type: 'SET_CONCRETO_LOCKED'; payload: boolean }

  // Template & export
  | { type: 'SET_TEMPLATE_NAME'; payload: string | null }
  | { type: 'SET_TEMPLATE_LAYERS'; payload: string[] }
  | { type: 'SET_CASCO_LAYER'; payload: string }
  | { type: 'SET_STEEL_LAYER'; payload: string }
  | { type: 'SET_DRAW_STEEL'; payload: boolean }

  // Draft states
  | { type: 'SET_HOOK_LEG_DRAFT'; payload: string }
  | { type: 'SET_STEEL_TEXT_LAYER_DRAFT'; payload: string }
  | { type: 'SET_STEEL_TEXT_STYLE_DRAFT'; payload: string }
  | { type: 'SET_STEEL_TEXT_HEIGHT_DRAFT'; payload: string }
  | { type: 'SET_STEEL_TEXT_WIDTH_DRAFT'; payload: string }
  | { type: 'SET_STEEL_TEXT_OBLIQUE_DRAFT'; payload: string }
  | { type: 'SET_STEEL_TEXT_ROTATION_DRAFT'; payload: string }
  | { type: 'SET_SLAB_PROJ_OFFSET_DRAFT'; payload: string }
  | { type: 'SET_SLAB_PROJ_LAYER_DRAFT'; payload: string }
  | { type: 'SET_STEEL_LAYOUT_DRAFT'; payload: string }
  | { type: 'SET_BASTON_LEN_EDITS'; payload: Record<string, string> }
  | { type: 'UPDATE_BASTON_LEN_EDITS'; payload: (prev: Record<string, string>) => Record<string, string> }
  | { type: 'SET_STIRRUPS_ABCR_EDITS'; payload: Record<string, string> }
  | { type: 'UPDATE_STIRRUPS_ABCR_EDITS'; payload: (prev: Record<string, string>) => Record<string, string> };
