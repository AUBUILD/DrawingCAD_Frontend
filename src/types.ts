export type SteelKind = 'continuous' | 'hook' | 'development';

export type SupportType = 'columna_inferior' | 'columna_superior' | 'placa' | 'apoyo_intermedio' | 'ninguno';

export type NodeIn = {
  a1?: number;
  a2: number;
  b1: number;
  b2: number;
  project_a?: boolean;
  project_b?: boolean;
  support_type?: SupportType; // Tipo de apoyo para calcular longitudes de acero

  // Ajuste de gancho/anclaje a la cara del nodo (por extremo).
  // Si está activo, el tramo de desarrollo/hook se recorta hasta la cara opuesta del nodo.
  steel_top_1_to_face?: boolean;
  steel_top_2_to_face?: boolean;
  steel_bottom_1_to_face?: boolean;
  steel_bottom_2_to_face?: boolean;

  // Acero corrido: conexión con el siguiente tramo (por cara)
  steel_top_continuous?: boolean;
  steel_top_hook?: boolean;
  steel_top_development?: boolean;
  steel_bottom_continuous?: boolean;
  steel_bottom_hook?: boolean;
  steel_bottom_development?: boolean;

  // Acero corrido: comportamiento por extremo en el nodo.
  // N.i.1 (cara izquierda del nodo): rige el acero del tramo izquierdo.
  // N.i.2 (cara derecha del nodo): rige el acero del tramo derecho.
  // En el primer nodo solo aplica *.2, en el último nodo solo aplica *.1.
  steel_top_1_kind?: SteelKind;
  steel_top_2_kind?: SteelKind;
  steel_bottom_1_kind?: SteelKind;
  steel_bottom_2_kind?: SteelKind;

  // Bastones (Z1/Z3): comportamiento por extremo en el nodo.
  // *.1 = cara izquierda (rige Zona 3 del tramo izquierdo)
  // *.2 = cara derecha (rige Zona 1 del tramo derecho)
  baston_top_1_kind?: SteelKind;
  baston_top_2_kind?: SteelKind;
  baston_bottom_1_kind?: SteelKind;
  baston_bottom_2_kind?: SteelKind;

  // Bastones: ajuste de gancho/anclaje a la cara opuesta del nodo (por extremo)
  baston_top_1_to_face?: boolean;
  baston_top_2_to_face?: boolean;
  baston_bottom_1_to_face?: boolean;
  baston_bottom_2_to_face?: boolean;

  // Bastones (Z1/Z3): parámetros por línea (cada zona tiene 2 líneas).
  // l1 = línea exterior, l2 = línea interior (offset por recubrimiento).
  baston_top_1_l1_kind?: SteelKind;
  baston_top_1_l2_kind?: SteelKind;
  baston_top_2_l1_kind?: SteelKind;
  baston_top_2_l2_kind?: SteelKind;
  baston_bottom_1_l1_kind?: SteelKind;
  baston_bottom_1_l2_kind?: SteelKind;
  baston_bottom_2_l1_kind?: SteelKind;
  baston_bottom_2_l2_kind?: SteelKind;

  baston_top_1_l1_to_face?: boolean;
  baston_top_1_l2_to_face?: boolean;
  baston_top_2_l1_to_face?: boolean;
  baston_top_2_l2_to_face?: boolean;
  baston_bottom_1_l1_to_face?: boolean;
  baston_bottom_1_l2_to_face?: boolean;
  baston_bottom_2_l1_to_face?: boolean;
  baston_bottom_2_l2_to_face?: boolean;
};

export type SteelMeta = {
  qty: number;
  diameter: string; // ej: "3/4"
};

export type SteelColRule = {
  b_min_cm: number;
  b_max_cm: number;
  min_cols: number;
  max_cols: number;
};

export type SteelLayoutSettings = {
  // E.060
  dag_cm: number;
  use_practical_min?: boolean; // default: true
  practical_min_cm?: number; // default: 4.0

  // Límites
  max_rows_per_face?: number; // default: 3

  // Reglas de columnas por ancho
  col_rules?: SteelColRule[];

  // Diámetros reales (cm) por designación en pulgadas ("3/4", "5/8", etc)
  rebar_diameters_cm?: Record<string, number>;
};

export type SteelFaceOverride = {
  mode?: 'auto' | 'manual';
  rows_override?: number | null;
  cols_override?: number | null;
};

export type SteelLayoutOverrides = {
  top?: SteelFaceOverride;
  bottom?: SteelFaceOverride;
};

export type BastonCfg = {
  // Nuevo (por línea)
  l1_enabled?: boolean;
  l1_qty?: number; // 1..3
  l1_diameter?: string; // ej: "3/4"

  l2_enabled?: boolean;
  l2_qty?: number; // 1..3
  l2_diameter?: string; // ej: "3/4"

  // Legacy (se acepta para compatibilidad; el normalizador lo mapea a l1/l2)
  enabled?: boolean;
  qty?: number;
  diameter?: string;

  // Longitudes editables (m). Si no se especifican, el default es L/5.
  // - Zona 1 y 3: usa L3_m (longitud desde el extremo)
  // - Zona 2: usa L1_m (izquierda) y L2_m (derecha)
  L1_m?: number;
  L2_m?: number;
  L3_m?: number;
};

export type BastonesSideCfg = {
  z1?: BastonCfg;
  z2?: BastonCfg;
  z3?: BastonCfg;
};

export type BastonesCfg = {
  top?: BastonesSideCfg;
  bottom?: BastonesSideCfg;
};

export type StirrupsCaseType = 'simetrica' | 'asim_ambos' | 'asim_uno';

export type StirrupsSectionShape = 'rect';

// Estribos en sección (amarre alrededor del acero longitudinal).
// `qty` representa la cantidad de estribos concéntricos (anidados) del mismo tipo.
export type StirrupsSectionIn = {
  shape?: StirrupsSectionShape;
  diameter?: string; // ej: "3/8"
  qty?: number; // 0..n
};

export type StirrupsDistributionIn = {
  case_type?: StirrupsCaseType;
  // Default presets depend on beam height (h) and this mode
  design_mode?: 'sismico' | 'gravedad' | null;

  // Diámetro del estribo (para 3D/etiquetas). No afecta el parsing ABCR.
  diameter?: string; // ej: "3/8"

  left_spec?: string | null;
  center_spec?: string | null;
  right_spec?: string | null;

  // asim_uno: cuál extremo usa left_spec como patrón especial
  single_end?: 'left' | 'right' | null;

  // longitudes de zonas de extremo (m). Default backend: 2*d
  ext_left_m?: number | null;
  ext_right_m?: number | null;
};

export type SpanIn = {
  L: number;
  h: number;
  // UI-only (por ahora no se utiliza en backend)
  b?: number;

  // Estribo(s) en sección (afecta el espacio interior del acero longitudinal)
  stirrups_section?: StirrupsSectionIn;

  // Estribos (opcional)
  stirrups?: StirrupsDistributionIn;

  // Acero corrido por tramo
  steel_top?: SteelMeta;
  steel_bottom?: SteelMeta;

  // Overrides de layout (opcional). Si no existe, se usa auto.
  steel_layout?: SteelLayoutOverrides;

  // Bastones por zonas (1/2/3) en superior e inferior
  bastones?: BastonesCfg;
};

/**
 * Viga transversal (perpendicular al desarrollo principal).
 *
 * Se lee desde la capa 'VIGAS' en el DXF template.
 * - La longitud de la línea en DXF = ancho (b)
 * - El peralte (h) se toma del tramo donde está ubicada
 * - Se dibuja perpendicular al desarrollo en 3D (1.00m de longitud)
 */
export type Crossbeam = {
  x: number;  // Posición X en metros
  b: number;  // Ancho en metros
  h: number;  // Peralte en metros
  span_index: number;  // Índice del tramo
};

export type DevelopmentIn = {
  name?: string;
  nodes: NodeIn[];
  spans: SpanIn[];
  floor_start?: string;
  floor_end?: string;

  // Identificación del rótulo (UI + backend título)
  level_type?: 'piso' | 'sotano' | 'azotea';
  beam_no?: number;

  d?: number;
  unit_scale?: number;
  x0?: number;
  y0?: number;

  // Config de acero (m)
  recubrimiento?: number;
  baston_Lc?: number;
  steel_cover_top?: number;
  steel_cover_bottom?: number;

  // Config global de layout para sección (E.060 + reglas de columnas)
  steel_layout_settings?: SteelLayoutSettings;

  // Vigas transversales (perpendiculares al desarrollo)
  crossbeams?: Crossbeam[];
};

export type PreviewRequest = {
  developments: DevelopmentIn[];
};

export type SavedCut = {
  xU: number;
};

export type ExportDxfRequest = PreviewRequest & {
  // Cortes guardados para exportar secciones (backend acepta también saved_cuts)
  savedCuts?: SavedCut[];
  // Metadata opcional de cuantías para textos/overlay en DXF (backend puede ignorarlo)
  dxf_quantity_overlay?: any;
};

export type PreviewPolyline = {
  name: string;
  points: [number, number][];
  bounds: { min_x: number; max_x: number; min_y: number; max_y: number };
};

export type PreviewResponse = {
  developments: PreviewPolyline[];
  bounds: { min_x: number; max_x: number; min_y: number; max_y: number };
};

export type ImportDxfResponse = {
  development: DevelopmentIn;
  warnings: string[];
};

export type ImportDxfBatchResponse = {
  developments: DevelopmentIn[];
  warnings: string[];
};

export type TemplateDxfInfo = {
  filename: string;
  layers: string[];
};

// Config global provista por el backend (fuente de verdad)
export type BackendAppConfig = {
  hook_leg_m: number;

  steel_text_layer?: string | null;
  steel_text_style?: string | null;
  steel_text_height?: number | null;
  steel_text_width?: number | null;
  steel_text_oblique?: number | null;
  steel_text_rotation?: number | null;

  slab_proj_offset_m?: number; // (m) se interpreta hacia abajo desde la línea superior
  slab_proj_layer?: string | null;
};
