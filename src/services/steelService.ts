/**
 * Servicios para cálculos relacionados con acero y nodos
 */

import type { NodeIn, SpanIn, SteelKind, SupportType } from '../types';

// ============================================================================
// CONSTANTS
// ============================================================================

const REBAR_TABLE_CM: Record<string, { ldg: number; ld_inf: number; ld_sup: number }> = {
  '3/8': { ldg: 21, ld_inf: 35, ld_sup: 45 },
  '1/2': { ldg: 28, ld_inf: 45, ld_sup: 60 },
  '5/8': { ldg: 35, ld_inf: 60, ld_sup: 75 },
  '3/4': { ldg: 42, ld_inf: 70, ld_sup: 90 },
  '1': { ldg: 56, ld_inf: 115, ld_sup: 145 },
  '1-3/8': { ldg: 77, ld_inf: 155, ld_sup: 200 },
};

// ============================================================================
// TYPES
// ============================================================================

export type NodeSlot = {
  nodeIdx: number;
  end: 1 | 2;
  label: string;
};

// ============================================================================
// STEEL CALCULATIONS
// ============================================================================

export function lengthFromTableMeters(dia: string, kind: 'hook' | 'anchorage', side: 'top' | 'bottom') {
  const key = dia;
  const row = REBAR_TABLE_CM[key] ?? REBAR_TABLE_CM['3/4'];
  const cm = kind === 'hook' ? row.ldg : side === 'top' ? row.ld_sup : row.ld_inf;
  return cm / 100;
}

function steelKindLegacy(node: NodeIn, side: 'top' | 'bottom'): SteelKind {
  const c = side === 'top' ? (node.steel_top_continuous ?? true) : (node.steel_bottom_continuous ?? true);
  const h = side === 'top' ? (node.steel_top_hook ?? false) : (node.steel_bottom_hook ?? false);
  const d = side === 'top' ? (node.steel_top_development ?? false) : (node.steel_bottom_development ?? false);
  if (h) return 'hook';
  if (d) return 'development';
  return c ? 'continuous' : 'continuous';
}

export function nodeSteelKind(node: NodeIn, side: 'top' | 'bottom', end: 1 | 2): SteelKind {
  const key =
    side === 'top'
      ? end === 1
        ? 'steel_top_1_kind'
        : 'steel_top_2_kind'
      : end === 1
        ? 'steel_bottom_1_kind'
        : 'steel_bottom_2_kind';
  const v = (node as any)[key] as SteelKind | undefined;
  if (v === 'continuous' || v === 'hook' || v === 'development') return v;
  return steelKindLegacy(node, side);
}

export function nodeToFaceEnabled(node: NodeIn, side: 'top' | 'bottom', end: 1 | 2): boolean {
  const key =
    side === 'top'
      ? end === 1
        ? 'steel_top_1_to_face'
        : 'steel_top_2_to_face'
      : end === 1
        ? 'steel_bottom_1_to_face'
        : 'steel_bottom_2_to_face';
  return Boolean((node as any)[key] ?? false);
}

export function nodeBastonLineKind(node: NodeIn, side: 'top' | 'bottom', end: 1 | 2, line: 1 | 2): SteelKind {
  const baseSuffix = side === 'top' ? 'top' : 'bottom';
  const endSuffix = end;
  const lineSuffix = `l${line}`;
  const key = `baston_${baseSuffix}_${endSuffix}_${lineSuffix}_kind`;
  const v = (node as any)[key] as SteelKind | undefined;
  if (v === 'continuous' || v === 'hook' || v === 'development') return v;

  const bastonKey = `baston_${baseSuffix}_${endSuffix}_kind`;
  const bastonV = (node as any)[bastonKey] as SteelKind | undefined;
  if (bastonV === 'continuous' || bastonV === 'hook' || bastonV === 'development') return bastonV;

  return 'hook';
}

export function nodeBastonLineToFaceEnabled(node: NodeIn, side: 'top' | 'bottom', end: 1 | 2, line: 1 | 2): boolean {
  const baseSuffix = side === 'top' ? 'top' : 'bottom';
  const endSuffix = end;
  const lineSuffix = `l${line}`;
  const key = `baston_${baseSuffix}_${endSuffix}_${lineSuffix}_to_face`;
  const v = (node as any)[key];
  if (typeof v === 'boolean') return v;

  const bastonKey = `baston_${baseSuffix}_${endSuffix}_to_face`;
  const bastonV = (node as any)[bastonKey];
  if (typeof bastonV === 'boolean') return bastonV;

  return false;
}

export function buildNodeSlots(nodes: NodeIn[]): NodeSlot[] {
  const slots: NodeSlot[] = [];
  const n = nodes.length;
  for (let i = 0; i < n; i++) {
    if (i === 0) {
      slots.push({ nodeIdx: i, end: 2, label: `Nodo ${i + 1}.2` });
      continue;
    }
    if (i === n - 1) {
      slots.push({ nodeIdx: i, end: 1, label: `Nodo ${i + 1}.1` });
      continue;
    }
    slots.push({ nodeIdx: i, end: 1, label: `Nodo ${i + 1}.1` });
    slots.push({ nodeIdx: i, end: 2, label: `Nodo ${i + 1}.2` });
  }
  return slots;
}

/**
 * Calcula la longitud de acero en el nodo según el tipo de apoyo.
 *
 * Esta función implementa la lógica de la Preferencia 01: Básico para determinar
 * la longitud del tramo de barra (gancho, anclaje o continua) dentro del nodo.
 *
 * @param node - El nodo donde se calcula la longitud
 * @param defaultLength - Longitud por defecto (en metros) si no se especifica tipo de apoyo
 * @returns Longitud en metros para dibujar el acero en el nodo
 */
export function calculateNodeSteelLength(node: NodeIn, defaultLength: number = 0.80): number {
  const supportType = node.support_type;

  // Si nodo es columna_inferior:
  if (supportType === 'columna_inferior') {
    return 1.50; // 150 cm = 1.50 m
  }

  // Sino si nodo es columna_superior:
  if (supportType === 'columna_superior') {
    return 1.80; // 180 cm = 1.80 m
  }

  // Sino si nodo es placa o apoyo intermedio:
  if (supportType === 'placa' || supportType === 'apoyo_intermedio') {
    // Longitud = 80 cm, o x2 - x1 si se conoce el ancho real de la placa
    // Por ahora usamos 80 cm por defecto. Si hay b1 y b2, podríamos calcular el ancho.
    const nodeWidth = Math.abs((node.b2 || 0) - (node.b1 || 0));
    if (nodeWidth > 0.01) {
      return nodeWidth; // Usar el ancho real del nodo
    }
    return 0.80; // 80 cm = 0.80 m
  }

  // Sino (ninguno o no especificado):
  return defaultLength; // valor_por_defecto (80 cm = 0.80 m)
}

// ============================================================================
// PREFERENCIA 01: BÁSICO - Configuración automática de acero en nodos
// ============================================================================

/**
 * Constantes para la Preferencia 01: Básico
 */
const BASIC_PREF = {
  // Acero corrido estándar: 2Ø5/8" (qty = cantidad, diameter = diámetro)
  ACERO_CORRIDO_SUPERIOR: { qty: 2, diameter: '5/8' },
  ACERO_CORRIDO_INFERIOR: { qty: 2, diameter: '5/8' },

  // Umbrales de longitud de columna (en metros)
  UMBRAL_GANCHO_EXTREMOS: 0.80, // 80 cm
  UMBRAL_CONTINUO_INFERIOR: 1.50, // 150 cm
  UMBRAL_CONTINUO_SUPERIOR: 1.80, // 180 cm

  // Longitudes de anclaje (en metros)
  LONG_ANCLAJE_SUP_EXTREMOS: 0.75, // 75 cm
  LONG_ANCLAJE_INF_EXTREMOS: 0.60, // 60 cm
  LONG_ANCLAJE_SUP_INTERMEDIOS: 0.75, // 75 cm (igual que extremos)
  LONG_ANCLAJE_INF_INTERMEDIOS: 0.60, // 60 cm
} as const;

/**
 * Configuración resultante para un lado del nodo
 */
export interface NodeSteelConfig {
  kind: SteelKind;
  toFace: boolean;
  anchorageLength?: number; // en metros, solo para tipo 'development'
}

/**
 * Configuración completa de acero para un nodo
 */
export interface NodeSteelSetup {
  nodeIndex: number;
  isStartNode: boolean;
  isEndNode: boolean;
  isIntermediateNode: boolean;
  columnLength: number; // x2 - x1 en metros

  // Configuración para acero corrido
  top1: NodeSteelConfig; // Superior lado 1 (izquierdo)
  top2: NodeSteelConfig; // Superior lado 2 (derecho)
  bottom1: NodeSteelConfig; // Inferior lado 1 (izquierdo)
  bottom2: NodeSteelConfig; // Inferior lado 2 (derecho)
}

/**
 * Aplica la Preferencia 01: Básico a un array de nodos.
 * Configura automáticamente el tipo de conexión del acero (gancho, anclaje, continuo)
 * en cada nodo según su posición y la longitud de la columna.
 *
 * @param nodes - Array de nodos a configurar
 * @returns Array de configuraciones de acero para cada nodo
 */
export function applyBasicPreference(nodes: NodeIn[]): NodeSteelSetup[] {
  const totalNodes = nodes.length;
  const configs: NodeSteelSetup[] = [];

  for (let i = 0; i < totalNodes; i++) {
    const node = nodes[i];
    const isStartNode = i === 0;
    const isEndNode = i === totalNodes - 1;
    const isIntermediateNode = !isStartNode && !isEndNode;

    // Calcular longitud de columna (x2 - x1)
    const columnLength = Math.abs((node.b2 || 0) - (node.b1 || 0));

    let top1: NodeSteelConfig;
    let top2: NodeSteelConfig;
    let bottom1: NodeSteelConfig;
    let bottom2: NodeSteelConfig;

    // ═══════════════════════════════════════════════════════════════════
    // NODOS DE INICIO Y FIN (extremos)
    // ═══════════════════════════════════════════════════════════════════
    if (isStartNode || isEndNode) {
      // ─── ACERO SUPERIOR ───
      if (columnLength <= BASIC_PREF.UMBRAL_GANCHO_EXTREMOS) {
        // Gancho (con check para adaptar a espacio si es necesario)
        const topConfig: NodeSteelConfig = {
          kind: 'hook',
          toFace: true, // Activar check "adaptar a espacio disponible"
        };
        top1 = topConfig;
        top2 = topConfig;
      } else {
        // Anclaje
        const topConfig: NodeSteelConfig = {
          kind: 'development',
          toFace: false,
          anchorageLength: BASIC_PREF.LONG_ANCLAJE_SUP_EXTREMOS,
        };
        top1 = topConfig;
        top2 = topConfig;
      }

      // ─── ACERO INFERIOR ───
      if (columnLength <= BASIC_PREF.UMBRAL_GANCHO_EXTREMOS) {
        // Gancho (con check para adaptar a espacio)
        const bottomConfig: NodeSteelConfig = {
          kind: 'hook',
          toFace: true,
        };
        bottom1 = bottomConfig;
        bottom2 = bottomConfig;
      } else {
        // Anclaje
        const bottomConfig: NodeSteelConfig = {
          kind: 'development',
          toFace: false,
          anchorageLength: BASIC_PREF.LONG_ANCLAJE_INF_EXTREMOS,
        };
        bottom1 = bottomConfig;
        bottom2 = bottomConfig;
      }
    }
    // ═══════════════════════════════════════════════════════════════════
    // NODOS INTERMEDIOS
    // ═══════════════════════════════════════════════════════════════════
    else if (isIntermediateNode) {
      // ─── ACERO SUPERIOR ───
      if (columnLength <= BASIC_PREF.UMBRAL_CONTINUO_SUPERIOR) {
        // Continuo
        const topConfig: NodeSteelConfig = {
          kind: 'continuous',
          toFace: false,
        };
        top1 = topConfig;
        top2 = topConfig;
      } else {
        // Anclaje
        const topConfig: NodeSteelConfig = {
          kind: 'development',
          toFace: false,
          anchorageLength: BASIC_PREF.LONG_ANCLAJE_SUP_INTERMEDIOS,
        };
        top1 = topConfig;
        top2 = topConfig;
      }

      // ─── ACERO INFERIOR ───
      if (columnLength <= BASIC_PREF.UMBRAL_CONTINUO_INFERIOR) {
        // Continuo
        const bottomConfig: NodeSteelConfig = {
          kind: 'continuous',
          toFace: false,
        };
        bottom1 = bottomConfig;
        bottom2 = bottomConfig;
      } else {
        // Anclaje
        const bottomConfig: NodeSteelConfig = {
          kind: 'development',
          toFace: false,
          anchorageLength: BASIC_PREF.LONG_ANCLAJE_INF_INTERMEDIOS,
        };
        bottom1 = bottomConfig;
        bottom2 = bottomConfig;
      }
    } else {
      // Caso por defecto (no debería ocurrir)
      const defaultConfig: NodeSteelConfig = {
        kind: 'continuous',
        toFace: false,
      };
      top1 = defaultConfig;
      top2 = defaultConfig;
      bottom1 = defaultConfig;
      bottom2 = defaultConfig;
    }

    configs.push({
      nodeIndex: i,
      isStartNode,
      isEndNode,
      isIntermediateNode,
      columnLength,
      top1,
      top2,
      bottom1,
      bottom2,
    });
  }

  return configs;
}

// ============================================================================
// RESET DE ACERO — limpia todas las propiedades de steel/baston en nodos y spans
// ============================================================================

const STEEL_NODE_KEYS = [
  'steel_top_1_kind', 'steel_top_2_kind', 'steel_bottom_1_kind', 'steel_bottom_2_kind',
  'steel_top_1_to_face', 'steel_top_2_to_face', 'steel_bottom_1_to_face', 'steel_bottom_2_to_face',
  'steel_top_1_anchorage_length', 'steel_top_2_anchorage_length',
  'steel_bottom_1_anchorage_length', 'steel_bottom_2_anchorage_length',
  'steel_top_continuous', 'steel_top_hook', 'steel_top_development',
  'steel_bottom_continuous', 'steel_bottom_hook', 'steel_bottom_development',
  'baston_top_1_kind', 'baston_top_2_kind', 'baston_bottom_1_kind', 'baston_bottom_2_kind',
  'baston_top_1_to_face', 'baston_top_2_to_face', 'baston_bottom_1_to_face', 'baston_bottom_2_to_face',
  'baston_top_1_l1_kind', 'baston_top_1_l2_kind', 'baston_top_2_l1_kind', 'baston_top_2_l2_kind',
  'baston_bottom_1_l1_kind', 'baston_bottom_1_l2_kind', 'baston_bottom_2_l1_kind', 'baston_bottom_2_l2_kind',
  'baston_top_1_l1_to_face', 'baston_top_1_l2_to_face', 'baston_top_2_l1_to_face', 'baston_top_2_l2_to_face',
  'baston_bottom_1_l1_to_face', 'baston_bottom_1_l2_to_face', 'baston_bottom_2_l1_to_face', 'baston_bottom_2_l2_to_face',
] as const;

/**
 * Limpia TODAS las propiedades de acero/bastones de nodos y spans.
 * Se llama al cambiar entre preferencias para arrancar desde cero.
 */
export function resetAllSteel(nodes: NodeIn[], spans: SpanIn[]): void {
  for (const node of nodes) {
    for (const key of STEEL_NODE_KEYS) {
      delete (node as any)[key];
    }
  }
  for (const span of spans) {
    delete (span as any).steel_top;
    delete (span as any).steel_bottom;
    delete (span as any).bastones;
  }
}

/**
 * Aplica la configuración de Preferencia 01: Básico a los spans,
 * configurando el acero corrido estándar (2Ø5/8" superior e inferior)
 *
 * @param spans - Array de spans a modificar (se modifica in-place)
 * @returns Array de spans modificados
 */
export function applyBasicPreferenceToSpans(spans: SpanIn[]): SpanIn[] {
  for (let i = 0; i < spans.length; i++) {
    const span = spans[i];

    // Configurar acero corrido superior: 2Ø5/8"
    (span as any).steel_top = {
      qty: BASIC_PREF.ACERO_CORRIDO_SUPERIOR.qty,
      diameter: BASIC_PREF.ACERO_CORRIDO_SUPERIOR.diameter,
    };

    // Configurar acero corrido inferior: 2Ø5/8"
    (span as any).steel_bottom = {
      qty: BASIC_PREF.ACERO_CORRIDO_INFERIOR.qty,
      diameter: BASIC_PREF.ACERO_CORRIDO_INFERIOR.diameter,
    };

  }

  return spans;
}

/**
 * Aplica la configuración de Preferencia 01: Básico directamente a los nodos,
 * modificando sus propiedades steel_top_*_kind, steel_bottom_*_kind, etc.
 *
 * @param nodes - Array de nodos a modificar (se modifica in-place)
 * @returns Array de nodos modificados
 */
export function applyBasicPreferenceToNodes(nodes: NodeIn[]): NodeIn[] {
  const configs = applyBasicPreference(nodes);

  for (let i = 0; i < nodes.length; i++) {
    const config = configs[i];
    const node = nodes[i];

    // Aplicar configuración superior
    (node as any).steel_top_1_kind = config.top1.kind;
    (node as any).steel_top_2_kind = config.top2.kind;
    (node as any).steel_top_1_to_face = config.top1.toFace;
    (node as any).steel_top_2_to_face = config.top2.toFace;

    // Aplicar configuración inferior
    (node as any).steel_bottom_1_kind = config.bottom1.kind;
    (node as any).steel_bottom_2_kind = config.bottom2.kind;
    (node as any).steel_bottom_1_to_face = config.bottom1.toFace;
    (node as any).steel_bottom_2_to_face = config.bottom2.toFace;

    // Guardar longitudes de anclaje si aplican
    if (config.top1.anchorageLength) {
      (node as any).steel_top_1_anchorage_length = config.top1.anchorageLength;
    }
    if (config.top2.anchorageLength) {
      (node as any).steel_top_2_anchorage_length = config.top2.anchorageLength;
    }
    if (config.bottom1.anchorageLength) {
      (node as any).steel_bottom_1_anchorage_length = config.bottom1.anchorageLength;
    }
    if (config.bottom2.anchorageLength) {
      (node as any).steel_bottom_2_anchorage_length = config.bottom2.anchorageLength;
    }


  }

  return nodes;
}

// ============================================================================
// PREFERENCIA 02: BÁSICO + BASTONES
// ============================================================================

/**
 * Configuración por defecto de bastones para un zone de un span.
 * L1 y L2 habilitados con 2Ø5/8".
 */
function defaultBastonCfg(): {
  l1_enabled: boolean; l1_qty: number; l1_diameter: string;
  l2_enabled: boolean; l2_qty: number; l2_diameter: string;
} {
  return {
    l1_enabled: true, l1_qty: 2, l1_diameter: '5/8',
    l2_enabled: true, l2_qty: 2, l2_diameter: '5/8',
  };
}

/**
 * Aplica Preferencia 02 a los spans: todo lo de Pref 01 + bastones por defecto.
 *
 * Superior: Z1 y Z3 activados (L1+L2, 2Ø5/8")
 * Inferior: Z2 activado (L1+L2, 2Ø5/8")
 */
export function applyBasicBastonesPreferenceToSpans(spans: SpanIn[], nodes: NodeIn[]): SpanIn[] {
  // Primero aplicar Pref 01 (acero corrido)
  applyBasicPreferenceToSpans(spans);

  /**
   * Verifica si el acero corrido realmente ancla en un nodo/lado/end.
   * Requiere que:
   * 1. El kind no sea 'continuous'
   * 2. El ancho de columna >= longitud mínima de anclaje según REBAR_TABLE_CM
   */
  function steelTrulyAnchors(
    node: any, side: 'top' | 'bottom', end: 1 | 2, dia: string,
  ): boolean {
    const kind = (node[`steel_${side}_${end}_kind`] ?? 'continuous') as string;
    if (kind === 'continuous') return false;

    // Ancho de columna para este lado
    const colWidth = side === 'top'
      ? Math.abs((node.b2 ?? 0) - (node.b1 ?? 0))
      : Math.abs((node.a2 ?? 0) - (node.a1 ?? 0));

    // Longitud mínima de anclaje desde la tabla
    const minLen = lengthFromTableMeters(
      dia, kind === 'hook' ? 'hook' : 'anchorage', side,
    );

    return colWidth >= minLen;
  }

  for (let i = 0; i < spans.length; i++) {
    const span = spans[i] as any;
    const leftNode = (nodes[i] ?? {}) as any;
    const rightNode = (nodes[i + 1] ?? {}) as any;

    // Diámetros del acero corrido de este tramo
    const topDia = span.steel_top?.diameter ?? '5/8';
    const botDia = span.steel_bottom?.diameter ?? '5/8';

    // Verificar si el acero realmente ancla (cumple dimensión mínima)
    const topLeftAnchors = steelTrulyAnchors(leftNode, 'top', 2, topDia);
    const topRightAnchors = steelTrulyAnchors(rightNode, 'top', 1, topDia);
    const botLeftAnchors = steelTrulyAnchors(leftNode, 'bottom', 2, botDia);
    const botRightAnchors = steelTrulyAnchors(rightNode, 'bottom', 1, botDia);

    const hasTopBastones = topLeftAnchors || topRightAnchors;
    const hasBotBastones = botLeftAnchors || botRightAnchors;

    // Si no hay anclaje válido en ningún lado, no agregar bastones
    if (!hasTopBastones && !hasBotBastones) continue;

    // Inicializar bastones si no existen
    if (!span.bastones) span.bastones = {};
    if (!span.bastones.top) span.bastones.top = {};
    if (!span.bastones.bottom) span.bastones.bottom = {};

    // Superior: Z1 solo si ancla en nodo izquierdo, Z3 solo si ancla en nodo derecho
    span.bastones.top.z1 = topLeftAnchors ? { ...defaultBastonCfg() } : (span.bastones.top.z1 ?? {});
    span.bastones.top.z2 = span.bastones.top.z2 ?? {};
    span.bastones.top.z3 = topRightAnchors ? { ...defaultBastonCfg() } : (span.bastones.top.z3 ?? {});

    // Inferior: Z2 solo si ancla en algún lado
    span.bastones.bottom.z1 = span.bastones.bottom.z1 ?? {};
    span.bastones.bottom.z2 = hasBotBastones ? { ...defaultBastonCfg() } : (span.bastones.bottom.z2 ?? {});
    span.bastones.bottom.z3 = span.bastones.bottom.z3 ?? {};
  }

  return spans;
}

/**
 * Aplica las mismas reglas de nodo del acero corrido a los bastones.
 * Para cada nodo, los baston line kinds (L1, L2) toman el mismo valor
 * que el steel kind del acero corrido en ese nodo/lado/end.
 */
export function applyBasicBastonesPreferenceToNodes(nodes: NodeIn[]): NodeIn[] {
  // Primero aplicar Pref 01 (acero corrido)
  applyBasicPreferenceToNodes(nodes);

  // Copiar las reglas de los nodos del acero corrido a los bastones
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i] as any;

    for (const side of ['top', 'bottom'] as const) {
      for (const end of [1, 2] as const) {
        const steelKind = node[`steel_${side}_${end}_kind`] ?? 'continuous';
        const steelToFace = Boolean(node[`steel_${side}_${end}_to_face`] ?? false);
        // Aplicar el mismo kind a L1 y L2 de los bastones
        node[`baston_${side}_${end}_l1_kind`] = steelKind;
        node[`baston_${side}_${end}_l2_kind`] = steelKind;
        // Aplicar el mismo to_face a L1 y L2 de los bastones (misma lógica que acero corrido)
        node[`baston_${side}_${end}_l1_to_face`] = steelToFace;
        node[`baston_${side}_${end}_l2_to_face`] = steelToFace;
      }
    }
  }

  return nodes;
}
