export type SteelKind = 'continuous' | 'hook' | 'development';

export type NodeIn = {
  a1?: number;
  a2: number;
  b1: number;
  b2: number;
  project_a?: boolean;
  project_b?: boolean;

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
};

export type SteelMeta = {
  qty: number;
  diameter: string; // ej: "3/4"
};

export type SpanIn = {
  L: number;
  h: number;
  // UI-only (por ahora no se utiliza en backend)
  b?: number;

  // Acero corrido por tramo
  steel_top?: SteelMeta;
  steel_bottom?: SteelMeta;
};

export type DevelopmentIn = {
  name?: string;
  nodes: NodeIn[];
  spans: SpanIn[];
  d?: number;
  unit_scale?: number;
  x0?: number;
  y0?: number;

  // Config de acero (m)
  steel_cover_top?: number;
  steel_cover_bottom?: number;
};

export type PreviewRequest = {
  developments: DevelopmentIn[];
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
