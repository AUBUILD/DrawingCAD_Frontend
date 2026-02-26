/**
 * Servicios para gestión de desarrollo, normalización y transformación de datos
 */

import type {
  DevelopmentIn,
  NodeIn,
  SpanIn,
  SteelMeta,
  SteelLayoutSettings,
  StirrupsDistributionIn,
  BastonCfg,
  BastonesSideCfg,
  BastonesCfg,
  PreviewRequest,
  SteelKind,
} from '../types';
import {
  clampNumber,
  clampInt,
  formatStirrupsABCR,
  parseStirrupsABCR,
  pickDefaultABCRForH,
  normalizeDiaKey,
  safeGetLocalStorage,
  computeBeamName,
  type LevelType,
} from '../utils';
import { abcrFromLegacyTokens, parseStirrupsSpec } from './stirrupsService';

// ============================================================================
// TYPES
// ============================================================================

export type AppConfig = {
  d: number;
  unit_scale: number;
  x0: number;
  y0: number;

  // Acero (m)
  recubrimiento: number;

  // Bastones
  baston_Lc: number; // m
};

export type PersonalizadoPayloadV1 = {
  v: 1;
  appCfg: AppConfig;
  dev: DevelopmentIn;
  exportOpts: { cascoLayer: string; steelLayer: string; drawSteel: boolean };
  drafts: {
    hookLegDraft: string;
    steelTextLayerDraft: string;
    steelTextStyleDraft: string;
    steelTextHeightDraft: string;
    steelTextWidthDraft: string;
    steelTextObliqueDraft: string;
    steelTextRotationDraft: string;
    slabProjOffsetDraft: string;
    slabProjLayerDraft: string;
  };
};

// ============================================================================
// CONSTANTS
// ============================================================================

export const PERSONALIZADO_KEY = 'beamdraw:personalizado';

export const DEFAULT_APP_CFG: AppConfig = {
  d: 0.25,
  unit_scale: 2,
  x0: 0,
  y0: 0,
  recubrimiento: 0.04,
  baston_Lc: 0.5,
};

export const DEFAULT_STEEL_META: SteelMeta = { qty: 3, diameter: '3/4' };

export const DEFAULT_STEEL_LAYOUT_SETTINGS: SteelLayoutSettings = {
  dag_cm: 2.5,
  use_practical_min: true,
  practical_min_cm: 4.0,
  max_rows_per_face: 3,
  // col_rules + rebar_diameters_cm se completan por normalización (steelLayout.ts)
};

export const INITIAL_SPAN: SpanIn = {
  L: 3.0,
  h: 0.5,
  b: 0.3,
  stirrups_section: { shape: 'rect', diameter: '3/8', qty: 1 },
  steel_top: { qty: 3, diameter: '3/4' },
  steel_bottom: { qty: 3, diameter: '3/4' },
};

export const INITIAL_NODE: NodeIn = {
  a1: 0.0,
  a2: 0.5,
  b1: 0.0,
  b2: 0.5,
  project_a: true,
  project_b: true,
  steel_top_1_to_face: false,
  steel_top_2_to_face: false,
  steel_bottom_1_to_face: false,
  steel_bottom_2_to_face: false,
  steel_top_continuous: true,
  steel_top_hook: false,
  steel_top_development: false,
  steel_bottom_continuous: true,
  steel_bottom_hook: false,
  steel_bottom_development: false,
  steel_top_1_kind: 'continuous',
  steel_top_2_kind: 'continuous',
  steel_bottom_1_kind: 'continuous',
  steel_bottom_2_kind: 'continuous',

  // Bastones (Z1/Z3) en nodos — default: gancho
  baston_top_1_kind: 'hook',
  baston_top_2_kind: 'hook',
  baston_bottom_1_kind: 'hook',
  baston_bottom_2_kind: 'hook',
  baston_top_1_to_face: false,
  baston_top_2_to_face: false,
  baston_bottom_1_to_face: false,
  baston_bottom_2_to_face: false,

  baston_top_1_l1_kind: 'hook',
  baston_top_1_l2_kind: 'hook',
  baston_top_2_l1_kind: 'hook',
  baston_top_2_l2_kind: 'hook',
  baston_bottom_1_l1_kind: 'hook',
  baston_bottom_1_l2_kind: 'hook',
  baston_bottom_2_l1_kind: 'hook',
  baston_bottom_2_l2_kind: 'hook',
  baston_top_1_l1_to_face: false,
  baston_top_1_l2_to_face: false,
  baston_top_2_l1_to_face: false,
  baston_top_2_l2_to_face: false,
  baston_bottom_1_l1_to_face: false,
  baston_bottom_1_l2_to_face: false,
  baston_bottom_2_l1_to_face: false,
  baston_bottom_2_l2_to_face: false,
};

// ============================================================================
// PERSISTENCE
// ============================================================================

export function readPersonalizado(): PersonalizadoPayloadV1 | null {
  const raw = safeGetLocalStorage(PERSONALIZADO_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as PersonalizadoPayloadV1;
    if (!parsed || parsed.v !== 1) return null;
    return parsed;
  } catch {
    return null;
  }
}

// ============================================================================
// HELPER FUNCTIONS (internal)
// ============================================================================

function steelKindLegacy(node: NodeIn, side: 'top' | 'bottom'): SteelKind {
  const c = side === 'top' ? (node.steel_top_continuous ?? true) : (node.steel_bottom_continuous ?? true);
  const h = side === 'top' ? (node.steel_top_hook ?? false) : (node.steel_bottom_hook ?? false);
  const d = side === 'top' ? (node.steel_top_development ?? false) : (node.steel_bottom_development ?? false);
  if (h) return 'hook';
  if (d) return 'development';
  return c ? 'continuous' : 'continuous';
}

// ============================================================================
// CLONE FUNCTIONS
// ============================================================================

export function cloneSteelMeta(m?: SteelMeta | null): SteelMeta {
  const qty = Math.max(1, clampNumber(m?.qty ?? DEFAULT_STEEL_META.qty, DEFAULT_STEEL_META.qty));
  const diameter = String(m?.diameter ?? DEFAULT_STEEL_META.diameter);
  return { qty, diameter };
}


export function cloneSpan(span: SpanIn): SpanIn {
  return {
    L: span.L,
    h: span.h,
    b: span.b ?? 0,
    stirrups_section: normalizeStirrupsSection((span as any).stirrups_section ?? (span as any).stirrupsSection),
    steel_top: cloneSteelMeta(span.steel_top),
    steel_bottom: cloneSteelMeta(span.steel_bottom),
    bastones: span.bastones ? JSON.parse(JSON.stringify(span.bastones)) : undefined,
  };
}

export function cloneNode(node: NodeIn): NodeIn {
  const legacyTop = steelKindLegacy(node, 'top');
  const legacyBottom = steelKindLegacy(node, 'bottom');
  return {
    a1: 0.0,
    a2: node.a2,
    b1: node.b1 ?? 0,
    b2: node.b2,
    project_a: node.project_a ?? true,
    project_b: node.project_b ?? true,
    steel_top_1_to_face: (node as any).steel_top_1_to_face ?? false,
    steel_top_2_to_face: (node as any).steel_top_2_to_face ?? false,
    steel_bottom_1_to_face: (node as any).steel_bottom_1_to_face ?? false,
    steel_bottom_2_to_face: (node as any).steel_bottom_2_to_face ?? false,
    steel_top_continuous: node.steel_top_continuous ?? true,
    steel_top_hook: node.steel_top_hook ?? false,
    steel_top_development: node.steel_top_development ?? false,
    steel_bottom_continuous: node.steel_bottom_continuous ?? true,
    steel_bottom_hook: node.steel_bottom_hook ?? false,
    steel_bottom_development: node.steel_bottom_development ?? false,
    steel_top_1_kind: node.steel_top_1_kind ?? legacyTop,
    steel_top_2_kind: node.steel_top_2_kind ?? legacyTop,
    steel_bottom_1_kind: node.steel_bottom_1_kind ?? legacyBottom,
    steel_bottom_2_kind: node.steel_bottom_2_kind ?? legacyBottom,
    baston_top_1_kind: (node as any).baston_top_1_kind ?? 'hook',
    baston_top_2_kind: (node as any).baston_top_2_kind ?? 'hook',
    baston_bottom_1_kind: (node as any).baston_bottom_1_kind ?? 'hook',
    baston_bottom_2_kind: (node as any).baston_bottom_2_kind ?? 'hook',
    baston_top_1_to_face: (node as any).baston_top_1_to_face ?? false,
    baston_top_2_to_face: (node as any).baston_top_2_to_face ?? false,
    baston_bottom_1_to_face: (node as any).baston_bottom_1_to_face ?? false,
    baston_bottom_2_to_face: (node as any).baston_bottom_2_to_face ?? false,
    baston_top_1_l1_kind: (node as any).baston_top_1_l1_kind ?? (node as any).baston_top_1_kind ?? 'hook',
    baston_top_1_l2_kind: (node as any).baston_top_1_l2_kind ?? (node as any).baston_top_1_kind ?? 'hook',
    baston_top_2_l1_kind: (node as any).baston_top_2_l1_kind ?? (node as any).baston_top_2_kind ?? 'hook',
    baston_top_2_l2_kind: (node as any).baston_top_2_l2_kind ?? (node as any).baston_top_2_kind ?? 'hook',
    baston_bottom_1_l1_kind: (node as any).baston_bottom_1_l1_kind ?? (node as any).baston_bottom_1_kind ?? 'hook',
    baston_bottom_1_l2_kind: (node as any).baston_bottom_1_l2_kind ?? (node as any).baston_bottom_1_kind ?? 'hook',
    baston_bottom_2_l1_kind: (node as any).baston_bottom_2_l1_kind ?? (node as any).baston_bottom_2_kind ?? 'hook',
    baston_bottom_2_l2_kind: (node as any).baston_bottom_2_l2_kind ?? (node as any).baston_bottom_2_kind ?? 'hook',
    baston_top_1_l1_to_face: (node as any).baston_top_1_l1_to_face ?? (node as any).baston_top_1_to_face ?? false,
    baston_top_1_l2_to_face: (node as any).baston_top_1_l2_to_face ?? (node as any).baston_top_1_to_face ?? false,
    baston_top_2_l1_to_face: (node as any).baston_top_2_l1_to_face ?? (node as any).baston_top_2_to_face ?? false,
    baston_top_2_l2_to_face: (node as any).baston_top_2_l2_to_face ?? (node as any).baston_top_2_to_face ?? false,
    baston_bottom_1_l1_to_face: (node as any).baston_bottom_1_l1_to_face ?? (node as any).baston_bottom_1_to_face ?? false,
    baston_bottom_1_l2_to_face: (node as any).baston_bottom_1_l2_to_face ?? (node as any).baston_bottom_1_to_face ?? false,
    baston_bottom_2_l1_to_face: (node as any).baston_bottom_2_l1_to_face ?? (node as any).baston_bottom_2_to_face ?? false,
    baston_bottom_2_l2_to_face: (node as any).baston_bottom_2_l2_to_face ?? (node as any).baston_bottom_2_to_face ?? false,
  };
}

// ============================================================================
// NORMALIZE FUNCTIONS
// ============================================================================

export function normalizeStirrupsSection(input: unknown) {
  const src = (input ?? {}) as any;
  const shape = String(src.shape ?? 'rect').trim().toLowerCase() === 'rect' ? 'rect' : 'rect';
  const diameterRaw = String(src.diameter ?? '3/8').trim();
  const diameter = normalizeDiaKey(diameterRaw.replace(/[∅Ø\s]/g, '')) || '3/8';
  const qtyRaw = Number(src.qty ?? 1);
  const qty = Number.isFinite(qtyRaw) ? Math.max(0, Math.floor(qtyRaw)) : 1;
  return { shape: shape as any, diameter, qty } as { shape: 'rect'; diameter: string; qty: number };
}

export function normalizeStirrupsDistribution(input: unknown): StirrupsDistributionIn | undefined {
  if (!input || typeof input !== 'object') return undefined;
  const src = input as any;
  const cleanSpec = (v: any) => {
    if (v == null) return null;
    const s = String(v).trim();
    return s ? s : null;
  };

  const design_mode = (() => {
    const v = String(src.design_mode ?? '').trim().toLowerCase();
    if (v === 'sismico' || v === 'sísmico') return 'sismico' as any;
    if (v === 'gravedad') return 'gravedad' as any;
    return null;
  })();

  const migrateSpec = (raw: any) => {
    const s = String(raw ?? '').trim();
    if (!s) return raw;
    // si ya es ABCR, dejarlo.
    if (parseStirrupsABCR(s)) return s;
    // intentar migrar legacy tipo: 1@.05,8@.10,rto@.20
    if (s.includes('@')) {
      const toks = parseStirrupsSpec(s);
      const abcr = abcrFromLegacyTokens(toks);
      if (abcr) return formatStirrupsABCR(abcr);
    }
    return s;
  };
  const case_type = (() => {
    const v = String(src.case_type ?? '').trim().toLowerCase();
    if (v === 'simetrica' || v === 'asim_ambos' || v === 'asim_uno') return v as any;
    return undefined;
  })();
  const single_end = (() => {
    const v = String(src.single_end ?? '').trim().toLowerCase();
    if (v === 'left' || v === 'right') return v as any;
    return null;
  })();
  const ext_left_m = (() => {
    if (src.ext_left_m == null || src.ext_left_m === '') return null;
    const n = Number(src.ext_left_m);
    return Number.isFinite(n) ? Math.max(0, n) : null;
  })();
  const ext_right_m = (() => {
    if (src.ext_right_m == null || src.ext_right_m === '') return null;
    const n = Number(src.ext_right_m);
    return Number.isFinite(n) ? Math.max(0, n) : null;
  })();

  const out: StirrupsDistributionIn = {
    case_type,
    design_mode,
    diameter: (() => {
      const raw = String(src.diameter ?? '').trim();
      const cleaned = normalizeDiaKey(raw.replace(/[∅Ø\s]/g, ''));
      return cleaned ? cleaned : undefined;
    })(),
    left_spec: cleanSpec(migrateSpec(src.left_spec)),
    center_spec: cleanSpec(migrateSpec(src.center_spec)),
    right_spec: cleanSpec(migrateSpec(src.right_spec)),
    single_end,
    ext_left_m,
    ext_right_m,
  };

  const hasAny =
    out.case_type != null ||
    (out.design_mode ?? null) != null ||
    (out.diameter ?? null) != null ||
    (out.left_spec ?? null) != null ||
    (out.center_spec ?? null) != null ||
    (out.right_spec ?? null) != null ||
    (out.single_end ?? null) != null ||
    (out.ext_left_m ?? null) != null ||
    (out.ext_right_m ?? null) != null;

  return hasAny ? out : undefined;
}

export function normalizeBastonCfg(input: unknown): BastonCfg {
  const src = (input ?? {}) as any;
  // Legacy -> new mapping: if only legacy is present, mirror into both lines.
  const legacyEnabled = src.enabled;
  const legacyQty = src.qty;
  const legacyDia = src.diameter;

  const legacyEnabledTrue = legacyEnabled === true;

  const l1_enabled = Boolean(src.l1_enabled ?? legacyEnabled ?? false);
  const l2_enabled = Boolean(src.l2_enabled ?? legacyEnabled ?? false);

  const l1_qty_raw = clampNumber(src.l1_qty ?? legacyQty ?? 1, 1);
  const l2_qty_raw = clampNumber(src.l2_qty ?? legacyQty ?? 1, 1);
  const l1_qty = Math.max(1, Math.min(3, Math.round(l1_qty_raw)));
  const l2_qty = Math.max(1, Math.min(3, Math.round(l2_qty_raw)));

  const l1_diameter = String(src.l1_diameter ?? legacyDia ?? '3/4');
  const l2_diameter = String(src.l2_diameter ?? legacyDia ?? '3/4');

  const L1_m_raw = typeof src.L1_m === 'number' ? src.L1_m : undefined;
  const L2_m_raw = typeof src.L2_m === 'number' ? src.L2_m : undefined;
  const L3_m_raw = typeof src.L3_m === 'number' ? src.L3_m : undefined;
  const L1_m = typeof L1_m_raw === 'number' && Number.isFinite(L1_m_raw) && L1_m_raw > 0 ? L1_m_raw : undefined;
  const L2_m = typeof L2_m_raw === 'number' && Number.isFinite(L2_m_raw) && L2_m_raw > 0 ? L2_m_raw : undefined;
  const L3_m = typeof L3_m_raw === 'number' && Number.isFinite(L3_m_raw) && L3_m_raw > 0 ? L3_m_raw : undefined;

  return {
    l1_enabled,
    l1_qty,
    l1_diameter,
    l2_enabled,
    l2_qty,
    l2_diameter,
    // keep legacy mirrors for any older code paths
    // Important: don't let a legacy `enabled: false` override the new per-line toggles.
    enabled: Boolean(legacyEnabledTrue || l1_enabled || l2_enabled),
    qty: Number.isFinite(Number(legacyQty)) ? legacyQty : l1_qty,
    diameter: legacyDia != null ? String(legacyDia) : l1_diameter,
    L1_m,
    L2_m,
    L3_m,
  };
}

export function normalizeBastonesSideCfg(input: unknown): BastonesSideCfg {
  const src = (input ?? {}) as any;
  return {
    z1: normalizeBastonCfg(src.z1),
    z2: normalizeBastonCfg(src.z2),
    z3: normalizeBastonCfg(src.z3),
  };
}

export function normalizeBastonesCfg(input: unknown): BastonesCfg {
  const src = (input ?? {}) as any;
  return {
    top: normalizeBastonesSideCfg(src.top),
    bottom: normalizeBastonesSideCfg(src.bottom),
  };
}

// ============================================================================
// NORMALIZE DEV (Main normalization)
// ============================================================================

export function normalizeDev(input: DevelopmentIn, appCfg: AppConfig): DevelopmentIn {
  const spans = (input.spans ?? []).map((s) => {
    const L = Math.max(0, clampNumber(s.L, INITIAL_SPAN.L));
    const h = Math.max(0, clampNumber(s.h, INITIAL_SPAN.h));
    const b = Math.max(0, clampNumber((s as any).b ?? INITIAL_SPAN.b, INITIAL_SPAN.b ?? 0));

    let stirrups = normalizeStirrupsDistribution((s as any).stirrups);
    const ct = String((stirrups as any)?.case_type ?? 'simetrica').trim().toLowerCase();
    const modeRaw = String((stirrups as any)?.design_mode ?? 'sismico').trim().toLowerCase();
    const mode: 'sismico' | 'gravedad' = modeRaw === 'gravedad' ? 'gravedad' : 'sismico';

    const defaultSpec = formatStirrupsABCR(pickDefaultABCRForH(h, mode));
    const applyDefaults = () => {
      if (ct === 'asim_uno') {
        return {
          case_type: 'asim_uno' as any,
          design_mode: mode as any,
          diameter: '3/8',
          left_spec: defaultSpec,
          center_spec: defaultSpec,
          right_spec: null,
        } as StirrupsDistributionIn;
      }
      return {
        case_type: (ct === 'asim_ambos' ? 'asim_ambos' : 'simetrica') as any,
        design_mode: mode as any,
        diameter: '3/8',
        left_spec: defaultSpec,
        center_spec: null,
        right_spec: defaultSpec,
      } as StirrupsDistributionIn;
    };

    if (!stirrups) {
      stirrups = applyDefaults();
    } else {
      // Completar modo si falta
      if ((stirrups as any).design_mode == null) (stirrups as any).design_mode = mode;

      // Completar diámetro si falta
      const diaRaw = String((stirrups as any).diameter ?? '').trim();
      const diaClean = normalizeDiaKey(diaRaw.replace(/[∅Ø\s]/g, ''));
      (stirrups as any).diameter = diaClean || '3/8';

      const hasAnySpec = Boolean(
        String((stirrups as any).left_spec ?? '').trim() ||
          String((stirrups as any).center_spec ?? '').trim() ||
          String((stirrups as any).right_spec ?? '').trim()
      );

      if (!hasAnySpec) {
        stirrups = { ...stirrups, ...applyDefaults() };
      } else if (ct === 'simetrica') {
        // En simétrica, si falta uno de los lados, completarlo con el otro.
        const ls = String((stirrups as any).left_spec ?? '').trim();
        const rs = String((stirrups as any).right_spec ?? '').trim();
        if (ls && !rs) stirrups = { ...stirrups, right_spec: ls };
        if (rs && !ls) stirrups = { ...stirrups, left_spec: rs };
      }
    }

    return {
      L,
      h,
      b,
      stirrups_section: normalizeStirrupsSection((s as any).stirrups_section ?? (s as any).stirrupsSection ?? (INITIAL_SPAN as any).stirrups_section),
      stirrups,
      steel_top: cloneSteelMeta((s as any).steel_top ?? (s as any).steelTop),
      steel_bottom: cloneSteelMeta((s as any).steel_bottom ?? (s as any).steelBottom),
      bastones: normalizeBastonesCfg((s as any).bastones),
    };
  });

  const nodes: NodeIn[] = (input.nodes ?? []).map((n) => {
    const legacyTop = steelKindLegacy(n, 'top');
    const legacyBottom = steelKindLegacy(n, 'bottom');
    return {
      a1: 0.0,
      a2: Math.max(0, clampNumber(n.a2, INITIAL_NODE.a2)),
      b1: Math.max(0, clampNumber(n.b1 ?? INITIAL_NODE.b1, INITIAL_NODE.b1)),
      b2: Math.max(0, clampNumber(n.b2, INITIAL_NODE.b2)),
      project_a: n.project_a ?? true,
      project_b: n.project_b ?? true,
      steel_top_1_to_face: (n as any).steel_top_1_to_face ?? (n as any).steelTop1ToFace ?? false,
      steel_top_2_to_face: (n as any).steel_top_2_to_face ?? (n as any).steelTop2ToFace ?? false,
      steel_bottom_1_to_face: (n as any).steel_bottom_1_to_face ?? (n as any).steelBottom1ToFace ?? false,
      steel_bottom_2_to_face: (n as any).steel_bottom_2_to_face ?? (n as any).steelBottom2ToFace ?? false,
      steel_top_continuous: n.steel_top_continuous ?? true,
      steel_top_hook: n.steel_top_hook ?? false,
      steel_top_development: n.steel_top_development ?? false,
      steel_bottom_continuous: n.steel_bottom_continuous ?? true,
      steel_bottom_hook: n.steel_bottom_hook ?? false,
      steel_bottom_development: n.steel_bottom_development ?? false,
      steel_top_1_kind: (n as any).steel_top_1_kind ?? (n as any).steelTop1Kind ?? legacyTop,
      steel_top_2_kind: (n as any).steel_top_2_kind ?? (n as any).steelTop2Kind ?? legacyTop,
      steel_bottom_1_kind: (n as any).steel_bottom_1_kind ?? (n as any).steelBottom1Kind ?? legacyBottom,
      steel_bottom_2_kind: (n as any).steel_bottom_2_kind ?? (n as any).steelBottom2Kind ?? legacyBottom,

      // Longitudes personalizadas de anclaje (Preferencia 01)
      steel_top_1_anchorage_length: (n as any).steel_top_1_anchorage_length,
      steel_top_2_anchorage_length: (n as any).steel_top_2_anchorage_length,
      steel_bottom_1_anchorage_length: (n as any).steel_bottom_1_anchorage_length,
      steel_bottom_2_anchorage_length: (n as any).steel_bottom_2_anchorage_length,

      baston_top_1_kind: (n as any).baston_top_1_kind ?? (n as any).bastonTop1Kind ?? 'hook',
      baston_top_2_kind: (n as any).baston_top_2_kind ?? (n as any).bastonTop2Kind ?? 'hook',
      baston_bottom_1_kind: (n as any).baston_bottom_1_kind ?? (n as any).bastonBottom1Kind ?? 'hook',
      baston_bottom_2_kind: (n as any).baston_bottom_2_kind ?? (n as any).bastonBottom2Kind ?? 'hook',
      baston_top_1_to_face: (n as any).baston_top_1_to_face ?? (n as any).bastonTop1ToFace ?? false,
      baston_top_2_to_face: (n as any).baston_top_2_to_face ?? (n as any).bastonTop2ToFace ?? false,
      baston_bottom_1_to_face: (n as any).baston_bottom_1_to_face ?? (n as any).bastonBottom1ToFace ?? false,
      baston_bottom_2_to_face: (n as any).baston_bottom_2_to_face ?? (n as any).bastonBottom2ToFace ?? false,

      baston_top_1_l1_kind: (n as any).baston_top_1_l1_kind ?? (n as any).bastonTop1L1Kind ?? (n as any).baston_top_1_kind ?? 'hook',
      baston_top_1_l2_kind: (n as any).baston_top_1_l2_kind ?? (n as any).bastonTop1L2Kind ?? (n as any).baston_top_1_kind ?? 'hook',
      baston_top_2_l1_kind: (n as any).baston_top_2_l1_kind ?? (n as any).bastonTop2L1Kind ?? (n as any).baston_top_2_kind ?? 'hook',
      baston_top_2_l2_kind: (n as any).baston_top_2_l2_kind ?? (n as any).bastonTop2L2Kind ?? (n as any).baston_top_2_kind ?? 'hook',
      baston_bottom_1_l1_kind: (n as any).baston_bottom_1_l1_kind ?? (n as any).bastonBottom1L1Kind ?? (n as any).baston_bottom_1_kind ?? 'hook',
      baston_bottom_1_l2_kind: (n as any).baston_bottom_1_l2_kind ?? (n as any).bastonBottom1L2Kind ?? (n as any).baston_bottom_1_kind ?? 'hook',
      baston_bottom_2_l1_kind: (n as any).baston_bottom_2_l1_kind ?? (n as any).bastonBottom2L1Kind ?? (n as any).baston_bottom_2_kind ?? 'hook',
      baston_bottom_2_l2_kind: (n as any).baston_bottom_2_l2_kind ?? (n as any).bastonBottom2L2Kind ?? (n as any).baston_bottom_2_kind ?? 'hook',

      baston_top_1_l1_to_face: (n as any).baston_top_1_l1_to_face ?? (n as any).bastonTop1L1ToFace ?? (n as any).baston_top_1_to_face ?? false,
      baston_top_1_l2_to_face: (n as any).baston_top_1_l2_to_face ?? (n as any).bastonTop1L2ToFace ?? (n as any).baston_top_1_to_face ?? false,
      baston_top_2_l1_to_face: (n as any).baston_top_2_l1_to_face ?? (n as any).bastonTop2L1ToFace ?? (n as any).baston_top_2_to_face ?? false,
      baston_top_2_l2_to_face: (n as any).baston_top_2_l2_to_face ?? (n as any).bastonTop2L2ToFace ?? (n as any).baston_top_2_to_face ?? false,
      baston_bottom_1_l1_to_face: (n as any).baston_bottom_1_l1_to_face ?? (n as any).bastonBottom1L1ToFace ?? (n as any).baston_bottom_1_to_face ?? false,
      baston_bottom_1_l2_to_face: (n as any).baston_bottom_1_l2_to_face ?? (n as any).bastonBottom1L2ToFace ?? (n as any).baston_bottom_1_to_face ?? false,
      baston_bottom_2_l1_to_face: (n as any).baston_bottom_2_l1_to_face ?? (n as any).bastonBottom2L1ToFace ?? (n as any).baston_bottom_2_to_face ?? false,
      baston_bottom_2_l2_to_face: (n as any).baston_bottom_2_l2_to_face ?? (n as any).bastonBottom2L2ToFace ?? (n as any).baston_bottom_2_to_face ?? false,
    };
  });

  const safeSpans = spans.length ? spans : [cloneSpan(INITIAL_SPAN)];
  const desiredNodes = safeSpans.length + 1;
  const safeNodes = nodes.slice(0, desiredNodes);

  const lastNode = safeNodes.length ? safeNodes[safeNodes.length - 1] : cloneNode(INITIAL_NODE);
  while (safeNodes.length < desiredNodes) safeNodes.push(cloneNode(lastNode));

  const prevName = String((input as any).name ?? '').trim();
  const inferredType = (() => {
    const m = prevName.match(/^\s*(VT|VS|VA)\s*[-=]?\s*(\d+)/i);
    const p = (m?.[1] ?? '').toUpperCase();
    if (p === 'VS') return 'sotano' as LevelType;
    if (p === 'VA') return 'azotea' as LevelType;
    if (p === 'VT') return 'piso' as LevelType;
    return null;
  })();
  const level_type: LevelType = (() => {
    const raw = String((input as any).level_type ?? (input as any).levelType ?? '').trim().toLowerCase();
    if (raw === 'sotano' || raw === 'sótano') return 'sotano';
    if (raw === 'azotea') return 'azotea';
    if (raw === 'piso') return 'piso';
    return inferredType ?? 'piso';
  })();
  const beam_no: number = (() => {
    const raw = (input as any).beam_no ?? (input as any).beamNo;
    const inferred = (() => {
      const m = prevName.match(/^\s*(VT|VS|VA)\s*[-=]?\s*(\d+)/i);
      if (!m?.[2]) return null;
      const v = Number(m[2]);
      return Number.isFinite(v) ? v : null;
    })();
    const v = clampInt(raw ?? inferred ?? 1, 1);
    return Math.max(1, Math.min(9999, v));
  })();

  const nextName = computeBeamName(level_type, beam_no);

  return {
    ...input,
    name: nextName,
    level_type: level_type as any,
    beam_no: beam_no as any,
    floor_start: level_type === 'azotea' ? undefined : ((input as any).floor_start ?? (input as any).floorStart ?? '6to'),
    floor_end: level_type === 'azotea' ? undefined : ((input as any).floor_end ?? (input as any).floorEnd ?? '9no'),
    d: appCfg.d,
    unit_scale: appCfg.unit_scale,
    x0: appCfg.x0,
    y0: appCfg.y0,
    recubrimiento: appCfg.recubrimiento,
    baston_Lc: appCfg.baston_Lc,
    steel_layout_settings: (() => {
      const incoming = (input as any).steel_layout_settings ?? (input as any).steelLayoutSettings ?? null;
      const dag_cm = clampNumber(incoming?.dag_cm ?? DEFAULT_STEEL_LAYOUT_SETTINGS.dag_cm, DEFAULT_STEEL_LAYOUT_SETTINGS.dag_cm);
      const max_rows_per_face = Math.max(1, Math.min(3, Math.round(clampNumber(incoming?.max_rows_per_face ?? DEFAULT_STEEL_LAYOUT_SETTINGS.max_rows_per_face, DEFAULT_STEEL_LAYOUT_SETTINGS.max_rows_per_face ?? 3))));
      return {
        dag_cm,
        use_practical_min: (incoming?.use_practical_min ?? incoming?.usePracticalMin ?? DEFAULT_STEEL_LAYOUT_SETTINGS.use_practical_min) as any,
        practical_min_cm: clampNumber(incoming?.practical_min_cm ?? incoming?.practicalMinCm ?? DEFAULT_STEEL_LAYOUT_SETTINGS.practical_min_cm, DEFAULT_STEEL_LAYOUT_SETTINGS.practical_min_cm ?? 4.0),
        max_rows_per_face,
        col_rules: Array.isArray(incoming?.col_rules ?? incoming?.colRules) ? (incoming?.col_rules ?? incoming?.colRules) : undefined,
        rebar_diameters_cm: (incoming?.rebar_diameters_cm ?? incoming?.rebarDiametersCm) ?? undefined,
      } as SteelLayoutSettings;
    })(),
    spans: safeSpans,
    nodes: safeNodes,
    crossbeams: ((input as any).crossbeams || []).map((cb: any) => {
      const spanIdx = typeof cb.span_index === 'number' ? cb.span_index : 0;
      const spanH = safeSpans[spanIdx]?.h ?? INITIAL_SPAN.h;
      return { ...cb, h: spanH };
    }),
  };
}

// ============================================================================
// FACTORY/DEFAULT FUNCTIONS
// ============================================================================

export function defaultDevelopment(appCfg: AppConfig, name = 'DESARROLLO 01'): DevelopmentIn {
  const level_type: LevelType = 'piso';
  const beam_no = 1;
  return {
    // El nombre se genera automáticamente por tipo + número.
    name: computeBeamName(level_type, beam_no),
    level_type: level_type as any,
    beam_no: beam_no as any,
    floor_start: '6to',
    floor_end: '9no',
    d: appCfg.d,
    unit_scale: appCfg.unit_scale,
    x0: appCfg.x0,
    y0: appCfg.y0,
    recubrimiento: appCfg.recubrimiento,
    baston_Lc: appCfg.baston_Lc,
    steel_layout_settings: { ...DEFAULT_STEEL_LAYOUT_SETTINGS },
    spans: [cloneSpan(INITIAL_SPAN)],
    nodes: [cloneNode(INITIAL_NODE), cloneNode(INITIAL_NODE)],
  };
}

// ============================================================================
// TRANSFORMATION FUNCTIONS
// ============================================================================

export function toBackendPayload(dev: DevelopmentIn): PreviewRequest {
  return {
    developments: [dev],
  } as PreviewRequest;
}

export function toPreviewPayloadSingle(dev: DevelopmentIn): DevelopmentIn {
  // Preview backend needs concrete geometry + essential steel info for correct visualization
  const spans = (dev.spans ?? []).map((s) => ({
    L: s.L,
    h: s.h,
    b: (s as any).b,
    steel_top: (s as any).steel_top,
    steel_bottom: (s as any).steel_bottom,
    bastones: (s as any).bastones,
    stirrups: (s as any).stirrups,
    stirrups_section: (s as any).stirrups_section,
  }));
  const nodes = (dev.nodes ?? []).map((n) => ({
    a1: (n as any).a1,
    a2: n.a2,
    b1: n.b1,
    b2: n.b2,
    project_a: (n as any).project_a,
    project_b: (n as any).project_b,
    support_type: (n as any).support_type,
    steel_top_1_kind: (n as any).steel_top_1_kind,
    steel_top_2_kind: (n as any).steel_top_2_kind,
    steel_bottom_1_kind: (n as any).steel_bottom_1_kind,
    steel_bottom_2_kind: (n as any).steel_bottom_2_kind,
    steel_top_1_to_face: (n as any).steel_top_1_to_face,
    steel_top_2_to_face: (n as any).steel_top_2_to_face,
    steel_bottom_1_to_face: (n as any).steel_bottom_1_to_face,
    steel_bottom_2_to_face: (n as any).steel_bottom_2_to_face,
    steel_top_1_anchorage_length: (n as any).steel_top_1_anchorage_length,
    steel_top_2_anchorage_length: (n as any).steel_top_2_anchorage_length,
    steel_bottom_1_anchorage_length: (n as any).steel_bottom_1_anchorage_length,
    steel_bottom_2_anchorage_length: (n as any).steel_bottom_2_anchorage_length,
    steel_top_continuous: (n as any).steel_top_continuous,
    steel_top_hook: (n as any).steel_top_hook,
    steel_top_development: (n as any).steel_top_development,
    steel_bottom_continuous: (n as any).steel_bottom_continuous,
    steel_bottom_hook: (n as any).steel_bottom_hook,
    steel_bottom_development: (n as any).steel_bottom_development,
  }));
  return {
    name: dev.name,
    level_type: (dev as any).level_type,
    beam_no: (dev as any).beam_no,
    floor_start: (dev as any).floor_start,
    floor_end: (dev as any).floor_end,
    d: (dev as any).d,
    unit_scale: dev.unit_scale,
    x0: dev.x0,
    y0: dev.y0,
    spans,
    nodes,
    crossbeams: (dev as any).crossbeams || [],
  };
}

export function toPreviewPayload(dev: DevelopmentIn): PreviewRequest {
  return { developments: [toPreviewPayloadSingle(dev)] } as PreviewRequest;
}

export function toBackendPayloadMulti(devs: DevelopmentIn[]): PreviewRequest {
  return { developments: devs } as PreviewRequest;
}

export function toPreviewPayloadMulti(devs: DevelopmentIn[]): PreviewRequest {
  return { developments: devs.map(toPreviewPayloadSingle) } as PreviewRequest;
}
