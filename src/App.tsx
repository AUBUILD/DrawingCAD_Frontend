import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { clearTemplateDxf, exportDxf, fetchConfig, fetchPreview, fetchState, getTemplateDxf, importDxf, saveState, updateConfig, uploadTemplateDxf } from './api';
import type {
  BackendAppConfig,
  BastonCfg,
  BastonesCfg,
  BastonesSideCfg,
  DevelopmentIn,
  NodeIn,
  PreviewRequest,
  PreviewResponse,
  SpanIn,
  StirrupsDistributionIn,
  StirrupsSectionIn,
  SteelKind,
  SteelMeta,
  SteelLayoutSettings,
} from './types';

import { computeSpanSectionLayoutWithBastonesCm, diameterToCm, getSteelLayoutSettings } from './steelLayout';

type Tab = 'config' | 'concreto' | 'acero' | 'json';
type PreviewView = '2d' | '3d';
type ThreeProjection = 'perspective' | 'orthographic';

type LevelType = 'piso' | 'sotano' | 'azotea';

function levelPrefix(t: LevelType): 'VT' | 'VS' | 'VA' {
  if (t === 'sotano') return 'VS';
  if (t === 'azotea') return 'VA';
  return 'VT';
}

function clampInt(n: unknown, fallback: number) {
  const v = typeof n === 'number' ? n : Number(String(n ?? '').trim());
  if (!Number.isFinite(v)) return fallback;
  return Math.trunc(v);
}

function formatBeamNo(n: number): string {
  const i = Math.max(1, Math.min(9999, Math.trunc(n || 1)));
  return String(i).padStart(2, '0');
}

function computeBeamName(t: LevelType, beamNo: number): string {
  return `${levelPrefix(t)}-${formatBeamNo(beamNo)}`;
}

function formatOrdinalEs(n: number): string {
  const i = Math.max(1, Math.min(30, Math.trunc(n || 1)));
  // Mantener el estilo de abreviaturas ya usado en la UI (1er, 2do, 7mo, 9no, 10mo, 11vo...)
  if (i === 1) return '1er';
  if (i === 2) return '2do';
  if (i === 3) return '3er';
  const last = i % 10;
  const inTeens = i >= 11 && i <= 15;
  if (inTeens) return `${i}vo`;
  if (last === 1) return `${i}er`;
  if (last === 2) return `${i}do`;
  if (last === 3) return `${i}er`;
  if (last === 4 || last === 5 || last === 6) return `${i}to`;
  if (last === 7 || last === 0) return `${i}mo`;
  if (last === 8) return `${i}vo`;
  if (last === 9) return `${i}no`;
  return `${i}to`;
}

type AppConfig = {
  d: number;
  unit_scale: number;
  x0: number;
  y0: number;

  // Acero (m)
  recubrimiento: number;

  // Bastones
  baston_Lc: number; // m
};

type Bounds = { min_x: number; max_x: number; min_y: number; max_y: number };

type Selection =
  | { kind: 'node'; index: number }
  | { kind: 'span'; index: number }
  | { kind: 'none' };

type ThreeSceneState = {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera | THREE.OrthographicCamera;
  perspCamera: THREE.PerspectiveCamera;
  orthoCamera: THREE.OrthographicCamera;
  controls: OrbitControls;
  root: THREE.Group;
  spans: THREE.Object3D[];
  nodes: THREE.Object3D[];
  spanSteel: THREE.Group[];
  spanStirrups: THREE.Group[];
  nodeSteel: THREE.Group[];
  nodeStirrups: THREE.Group[];
};

function normalizeStirrupsDistribution(input: unknown): StirrupsDistributionIn | undefined {
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

type ParseResult<T> = { ok: true; value: T } | { ok: false; error: string };

const DEFAULT_APP_CFG: AppConfig = {
  d: 0.25,
  unit_scale: 2,
  x0: 0,
  y0: 0,
  recubrimiento: 0.04,
  baston_Lc: 0.5,
};

const DEFAULT_STEEL_META: SteelMeta = { qty: 3, diameter: '3/4' };

const DEFAULT_STEEL_LAYOUT_SETTINGS: SteelLayoutSettings = {
  dag_cm: 2.5,
  use_practical_min: true,
  practical_min_cm: 4.0,
  max_rows_per_face: 3,
  // col_rules + rebar_diameters_cm se completan por normalización (steelLayout.ts)
};

function cloneSteelMeta(m?: SteelMeta | null): SteelMeta {
  const qty = Math.max(1, clampNumber(m?.qty ?? DEFAULT_STEEL_META.qty, DEFAULT_STEEL_META.qty));
  const diameter = String(m?.diameter ?? DEFAULT_STEEL_META.diameter);
  return { qty, diameter };
}

const INITIAL_SPAN: SpanIn = {
  L: 3.0,
  h: 0.5,
  b: 0.3,
  stirrups_section: { shape: 'rect', diameter: '3/8', qty: 1 },
  steel_top: cloneSteelMeta(DEFAULT_STEEL_META),
  steel_bottom: cloneSteelMeta(DEFAULT_STEEL_META),
};

function normalizeStirrupsSection(input: unknown) {
  const src = (input ?? {}) as any;
  const shape = String(src.shape ?? 'rect').trim().toLowerCase() === 'rect' ? 'rect' : 'rect';
  const diameterRaw = String(src.diameter ?? '3/8').trim();
  const diameter = normalizeDiaKey(diameterRaw.replace(/[∅Ø\s]/g, '')) || '3/8';
  const qtyRaw = Number(src.qty ?? 1);
  const qty = Number.isFinite(qtyRaw) ? Math.max(0, Math.floor(qtyRaw)) : 1;
  return { shape: shape as any, diameter, qty } as { shape: 'rect'; diameter: string; qty: number };
}

const INITIAL_NODE: NodeIn = {
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

  // Bastones (Z1/Z3) en nodos
  baston_top_1_kind: 'continuous',
  baston_top_2_kind: 'continuous',
  baston_bottom_1_kind: 'continuous',
  baston_bottom_2_kind: 'continuous',
  baston_top_1_to_face: false,
  baston_top_2_to_face: false,
  baston_bottom_1_to_face: false,
  baston_bottom_2_to_face: false,

  baston_top_1_l1_kind: 'continuous',
  baston_top_1_l2_kind: 'continuous',
  baston_top_2_l1_kind: 'continuous',
  baston_top_2_l2_kind: 'continuous',
  baston_bottom_1_l1_kind: 'continuous',
  baston_bottom_1_l2_kind: 'continuous',
  baston_bottom_2_l1_kind: 'continuous',
  baston_bottom_2_l2_kind: 'continuous',
  baston_top_1_l1_to_face: false,
  baston_top_1_l2_to_face: false,
  baston_top_2_l1_to_face: false,
  baston_top_2_l2_to_face: false,
  baston_bottom_1_l1_to_face: false,
  baston_bottom_1_l2_to_face: false,
  baston_bottom_2_l1_to_face: false,
  baston_bottom_2_l2_to_face: false,
};

function clampNumber(n: unknown, fallback: number) {
  if (typeof n === 'string') {
    // Permitir coma decimal (ej: "3,25") sin romper la edición manual.
    const s = n.trim().replace(',', '.');
    if (!s) return fallback;
    const v = Number(s);
    return Number.isFinite(v) ? v : fallback;
  }

  const v = typeof n === 'number' ? n : Number(n);
  return Number.isFinite(v) ? v : fallback;
}

function snap05m(v: number) {
  const step = 0.05; // 5 cm
  const snapped = Math.round(v / step) * step;
  return Math.round(snapped * 100) / 100;
}

function safeParseJson<T>(text: string): ParseResult<T> {
  try {
    return { ok: true, value: JSON.parse(text) as T };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? 'JSON inválido' };
  }
}

function toJson(value: unknown) {
  return JSON.stringify(value, null, 2);
}

function cloneSpan(span: SpanIn): SpanIn {
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

function cloneNode(node: NodeIn): NodeIn {
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

    baston_top_1_kind: (node as any).baston_top_1_kind ?? 'continuous',
    baston_top_2_kind: (node as any).baston_top_2_kind ?? 'continuous',
    baston_bottom_1_kind: (node as any).baston_bottom_1_kind ?? 'continuous',
    baston_bottom_2_kind: (node as any).baston_bottom_2_kind ?? 'continuous',
    baston_top_1_to_face: (node as any).baston_top_1_to_face ?? false,
    baston_top_2_to_face: (node as any).baston_top_2_to_face ?? false,
    baston_bottom_1_to_face: (node as any).baston_bottom_1_to_face ?? false,
    baston_bottom_2_to_face: (node as any).baston_bottom_2_to_face ?? false,

    baston_top_1_l1_kind: (node as any).baston_top_1_l1_kind ?? (node as any).baston_top_1_kind ?? 'continuous',
    baston_top_1_l2_kind: (node as any).baston_top_1_l2_kind ?? (node as any).baston_top_1_kind ?? 'continuous',
    baston_top_2_l1_kind: (node as any).baston_top_2_l1_kind ?? (node as any).baston_top_2_kind ?? 'continuous',
    baston_top_2_l2_kind: (node as any).baston_top_2_l2_kind ?? (node as any).baston_top_2_kind ?? 'continuous',
    baston_bottom_1_l1_kind: (node as any).baston_bottom_1_l1_kind ?? (node as any).baston_bottom_1_kind ?? 'continuous',
    baston_bottom_1_l2_kind: (node as any).baston_bottom_1_l2_kind ?? (node as any).baston_bottom_1_kind ?? 'continuous',
    baston_bottom_2_l1_kind: (node as any).baston_bottom_2_l1_kind ?? (node as any).baston_bottom_2_kind ?? 'continuous',
    baston_bottom_2_l2_kind: (node as any).baston_bottom_2_l2_kind ?? (node as any).baston_bottom_2_kind ?? 'continuous',

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

function defaultDevelopment(appCfg: AppConfig, name = 'DESARROLLO 01'): DevelopmentIn {
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

function normalizeBastonCfg(input: unknown): BastonCfg {
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

function normalizeBastonesSideCfg(input: unknown): BastonesSideCfg {
  const src = (input ?? {}) as any;
  return {
    z1: normalizeBastonCfg(src.z1),
    z2: normalizeBastonCfg(src.z2),
    z3: normalizeBastonCfg(src.z3),
  };
}

function normalizeBastonesCfg(input: unknown): BastonesCfg {
  const src = (input ?? {}) as any;
  return {
    top: normalizeBastonesSideCfg(src.top),
    bottom: normalizeBastonesSideCfg(src.bottom),
  };
}

function normalizeDev(input: DevelopmentIn, appCfg: AppConfig): DevelopmentIn {
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

      baston_top_1_kind: (n as any).baston_top_1_kind ?? (n as any).bastonTop1Kind ?? 'continuous',
      baston_top_2_kind: (n as any).baston_top_2_kind ?? (n as any).bastonTop2Kind ?? 'continuous',
      baston_bottom_1_kind: (n as any).baston_bottom_1_kind ?? (n as any).bastonBottom1Kind ?? 'continuous',
      baston_bottom_2_kind: (n as any).baston_bottom_2_kind ?? (n as any).bastonBottom2Kind ?? 'continuous',
      baston_top_1_to_face: (n as any).baston_top_1_to_face ?? (n as any).bastonTop1ToFace ?? false,
      baston_top_2_to_face: (n as any).baston_top_2_to_face ?? (n as any).bastonTop2ToFace ?? false,
      baston_bottom_1_to_face: (n as any).baston_bottom_1_to_face ?? (n as any).bastonBottom1ToFace ?? false,
      baston_bottom_2_to_face: (n as any).baston_bottom_2_to_face ?? (n as any).bastonBottom2ToFace ?? false,

      baston_top_1_l1_kind: (n as any).baston_top_1_l1_kind ?? (n as any).bastonTop1L1Kind ?? (n as any).baston_top_1_kind ?? 'continuous',
      baston_top_1_l2_kind: (n as any).baston_top_1_l2_kind ?? (n as any).bastonTop1L2Kind ?? (n as any).baston_top_1_kind ?? 'continuous',
      baston_top_2_l1_kind: (n as any).baston_top_2_l1_kind ?? (n as any).bastonTop2L1Kind ?? (n as any).baston_top_2_kind ?? 'continuous',
      baston_top_2_l2_kind: (n as any).baston_top_2_l2_kind ?? (n as any).bastonTop2L2Kind ?? (n as any).baston_top_2_kind ?? 'continuous',
      baston_bottom_1_l1_kind: (n as any).baston_bottom_1_l1_kind ?? (n as any).bastonBottom1L1Kind ?? (n as any).baston_bottom_1_kind ?? 'continuous',
      baston_bottom_1_l2_kind: (n as any).baston_bottom_1_l2_kind ?? (n as any).bastonBottom1L2Kind ?? (n as any).baston_bottom_1_kind ?? 'continuous',
      baston_bottom_2_l1_kind: (n as any).baston_bottom_2_l1_kind ?? (n as any).bastonBottom2L1Kind ?? (n as any).baston_bottom_2_kind ?? 'continuous',
      baston_bottom_2_l2_kind: (n as any).baston_bottom_2_l2_kind ?? (n as any).bastonBottom2L2Kind ?? (n as any).baston_bottom_2_kind ?? 'continuous',

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
  };
}

function toBackendPayload(dev: DevelopmentIn): PreviewRequest {
  return {
    developments: [dev],
  } as PreviewRequest;
}

function toPreviewPayload(dev: DevelopmentIn): PreviewRequest {
  // Preview backend only needs concrete geometry (spans + nodes + global scales).
  // Stripping steel fields avoids expensive/refetch churn when editing acero.
  const spans = (dev.spans ?? []).map((s) => ({
    L: s.L,
    h: s.h,
    b: (s as any).b,
  }));
  const nodes = (dev.nodes ?? []).map((n) => ({
    a1: (n as any).a1,
    a2: n.a2,
    b1: n.b1,
    b2: n.b2,
    project_a: (n as any).project_a,
    project_b: (n as any).project_b,
  }));
  const minimal: DevelopmentIn = {
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
  };
  return { developments: [minimal] } as PreviewRequest;
}

function fitTransform(bounds: Bounds, w: number, h: number) {
  const pad = 20;
  const dx = Math.max(bounds.max_x - bounds.min_x, 1e-6);
  const dy = Math.max(bounds.max_y - bounds.min_y, 1e-6);
  const scale = Math.min((w - pad * 2) / dx, (h - pad * 2) / dy);
  return { pad, scale };
}

function canvasMapper(bounds: Bounds, w: number, h: number) {
  const { pad, scale } = fitTransform(bounds, w, h);
  const bx0 = bounds.min_x;
  const by1 = bounds.max_y;
  return {
    toCanvas(x: number, y: number) {
      const cx = pad + (x - bx0) * scale;
      const cy = pad + (by1 - y) * scale;
      return [cx, cy] as const;
    },
  };
}

function canvasUnmapper(bounds: Bounds, w: number, h: number) {
  const { pad, scale } = fitTransform(bounds, w, h);
  const bx0 = bounds.min_x;
  const by1 = bounds.max_y;
  return {
    toWorld(cx: number, cy: number) {
      const x = bx0 + (cx - pad) / scale;
      const y = by1 - (cy - pad) / scale;
      return [x, y] as const;
    },
  };
}

function clampBounds(inner: Bounds, outer: Bounds): Bounds {
  const dx = outer.max_x - outer.min_x;
  const dy = outer.max_y - outer.min_y;
  const w = Math.min(inner.max_x - inner.min_x, dx);
  const h = Math.min(inner.max_y - inner.min_y, dy);

  let min_x = inner.min_x;
  let max_x = inner.max_x;
  let min_y = inner.min_y;
  let max_y = inner.max_y;

  if (w < dx) {
    min_x = Math.max(outer.min_x, Math.min(min_x, outer.max_x - w));
    max_x = min_x + w;
  } else {
    min_x = outer.min_x;
    max_x = outer.max_x;
  }

  if (h < dy) {
    min_y = Math.max(outer.min_y, Math.min(min_y, outer.max_y - h));
    max_y = min_y + h;
  } else {
    min_y = outer.min_y;
    max_y = outer.max_y;
  }

  return { min_x, max_x, min_y, max_y };
}

function drawPreview(canvas: HTMLCanvasElement, data: PreviewResponse | null, renderBounds?: Bounds | null) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  // DPR-aware canvas for crisper lines/text
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const cssW = Math.max(1, Math.round(rect.width));
  const cssH = Math.max(1, Math.round(rect.height));
  const desiredW = Math.round(cssW * dpr);
  const desiredH = Math.round(cssH * dpr);
  if (canvas.width !== desiredW || canvas.height !== desiredH) {
    canvas.width = desiredW;
    canvas.height = desiredH;
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  // Clear in CSS pixel space (after setTransform)
  ctx.clearRect(0, 0, cssW, cssH);

  if (!data) {
    ctx.fillStyle = 'rgba(229,231,235,0.6)';
    ctx.font = '12px ui-monospace, Menlo, Consolas, monospace';
    ctx.fillText('Sin datos de vista previa', 14, 22);
    return;
  }

  const bounds = renderBounds ?? data.bounds;
  const { toCanvas } = canvasMapper(bounds, cssW, cssH);

  const snap = (v: number) => Math.round(v) + 0.5;

  // Desarrollo (contorno)
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(20,184,166,0.95)';

  for (const pl of data.developments ?? []) {
    const pts = pl.points ?? [];
    if (pts.length < 2) continue;
    ctx.beginPath();
    for (let i = 0; i < pts.length; i++) {
      const [x, y] = pts[i];
      const [cx, cy] = toCanvas(x, y);
      const sx = snap(cx);
      const sy = snap(cy);
      if (i === 0) ctx.moveTo(sx, sy);
      else ctx.lineTo(sx, sy);
    }
    ctx.stroke();
  }
}

function indexToLetters(idx: number): string {
  // A..Z, AA..AZ, BA.. etc.
  let n = Math.max(0, Math.floor(idx));
  let out = '';
  do {
    out = String.fromCharCode(65 + (n % 26)) + out;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return out;
}

function drawCutMarker2D(canvas: HTMLCanvasElement, data: PreviewResponse, renderBounds: Bounds, xU: number) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const cssW = Math.max(1, Math.round(rect.width));
  const cssH = Math.max(1, Math.round(rect.height));
  // Importante: NO redimensionar el canvas aquí.
  // Redimensionar (canvas.width/height) limpia el buffer y borraría lo ya dibujado por drawPreview.
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const bounds = renderBounds ?? (data.bounds as Bounds);
  const { toCanvas } = canvasMapper(bounds, cssW, cssH);
  const x = Math.min(bounds.max_x, Math.max(bounds.min_x, xU));
  const [cxTop, cyTop] = toCanvas(x, bounds.max_y);
  const [, cyBot] = toCanvas(x, bounds.min_y);

  ctx.save();
  ctx.strokeStyle = 'rgba(249,115,22,0.95)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cxTop, cyTop);
  ctx.lineTo(cxTop, cyBot);
  ctx.stroke();

  // Marcadores simples arriba/abajo
  const tri = 7;
  ctx.fillStyle = 'rgba(249,115,22,0.95)';
  ctx.beginPath();
  ctx.moveTo(cxTop, cyTop + 2);
  ctx.lineTo(cxTop - tri, cyTop + 2 + tri);
  ctx.lineTo(cxTop + tri, cyTop + 2 + tri);
  ctx.closePath();
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(cxTop, cyBot - 2);
  ctx.lineTo(cxTop - tri, cyBot - 2 - tri);
  ctx.lineTo(cxTop + tri, cyBot - 2 - tri);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function mToUnits(dev: DevelopmentIn, m: number): number {
  return m * (dev.unit_scale ?? 2);
}

function computeNodeOrigins(dev: DevelopmentIn): number[] {
  const nodes = dev.nodes ?? [];
  const spans = dev.spans ?? [];
  if (!nodes.length) return [];

  // Igual a regla del backend (origins): (origin[i] + a2_i) + L_i == (origin[i+1] + a1_{i+1})
  const origins: number[] = [clampNumber(dev.x0 ?? 0, 0)];
  for (let i = 0; i < nodes.length - 1; i++) {
    const a2 = mToUnits(dev, clampNumber(nodes[i].a2, 0));
    const L = mToUnits(dev, clampNumber(spans[i]?.L ?? 0, 0));
    const a1Next = mToUnits(dev, clampNumber(nodes[i + 1].a1 ?? 0, 0));
    origins.push(origins[i] + a2 + L - a1Next);
  }
  return origins;
}

function computeSpanMidX(dev: DevelopmentIn, origins: number[], spanIndex: number): number {
  const nodes = dev.nodes ?? [];
  const spans = dev.spans ?? [];
  const o = origins[spanIndex] ?? 0;
  const a2 = mToUnits(dev, clampNumber(nodes[spanIndex]?.a2 ?? 0, 0));
  const L = mToUnits(dev, clampNumber(spans[spanIndex]?.L ?? 0, 0));
  return o + a2 + L / 2;
}

function computeSpanRangeX(dev: DevelopmentIn, origins: number[], spanIndex: number) {
  const nodes = dev.nodes ?? [];
  const spans = dev.spans ?? [];
  const o = origins[spanIndex] ?? 0;
  const a2 = mToUnits(dev, clampNumber(nodes[spanIndex]?.a2 ?? 0, 0));
  const L = mToUnits(dev, clampNumber(spans[spanIndex]?.L ?? 0, 0));
  const x0 = o + a2;
  const x1 = x0 + L;
  return { x0: Math.min(x0, x1), x1: Math.max(x0, x1) };
}

function computeNodeMarkerX(dev: DevelopmentIn, origins: number[], nodeIndex: number): number {
  const nodes = dev.nodes ?? [];
  return (origins[nodeIndex] ?? 0) + mToUnits(dev, clampNumber(nodes[nodeIndex]?.b1 ?? 0, 0));
}

function computeNodeLabelX(dev: DevelopmentIn, origins: number[], nodeIndex: number): number {
  const nodes = dev.nodes ?? [];
  const a1 = mToUnits(dev, clampNumber(nodes[nodeIndex]?.a1 ?? 0, 0));
  const a2 = mToUnits(dev, clampNumber(nodes[nodeIndex]?.a2 ?? 0, 0));
  return (origins[nodeIndex] ?? 0) + (a1 + a2) / 2;
}

function steelKindLegacy(node: NodeIn, side: 'top' | 'bottom'): SteelKind {
  const c = side === 'top' ? (node.steel_top_continuous ?? true) : (node.steel_bottom_continuous ?? true);
  const h = side === 'top' ? (node.steel_top_hook ?? false) : (node.steel_bottom_hook ?? false);
  const d = side === 'top' ? (node.steel_top_development ?? false) : (node.steel_bottom_development ?? false);
  if (h) return 'hook';
  if (d) return 'development'; // se muestra como "Anclaje"
  return c ? 'continuous' : 'continuous';
}

function nodeSteelKind(node: NodeIn, side: 'top' | 'bottom', end: 1 | 2): SteelKind {
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

function nodeToFaceEnabled(node: NodeIn, side: 'top' | 'bottom', end: 1 | 2): boolean {
  const key =
    side === 'top'
      ? end === 1
        ? 'steel_top_1_to_face'
        : 'steel_top_2_to_face'
      : end === 1
        ? 'steel_bottom_1_to_face'
        : 'steel_bottom_2_to_face';
  return Boolean((node as any)[key]);
}

function nodeBastonLineKind(node: NodeIn, side: 'top' | 'bottom', end: 1 | 2, line: 1 | 2): SteelKind {
  const key =
    side === 'top'
      ? end === 1
        ? line === 1
          ? 'baston_top_1_l1_kind'
          : 'baston_top_1_l2_kind'
        : line === 1
          ? 'baston_top_2_l1_kind'
          : 'baston_top_2_l2_kind'
      : end === 1
        ? line === 1
          ? 'baston_bottom_1_l1_kind'
          : 'baston_bottom_1_l2_kind'
        : line === 1
          ? 'baston_bottom_2_l1_kind'
          : 'baston_bottom_2_l2_kind';

  const legacyKey =
    side === 'top'
      ? end === 1
        ? 'baston_top_1_kind'
        : 'baston_top_2_kind'
      : end === 1
        ? 'baston_bottom_1_kind'
        : 'baston_bottom_2_kind';

  const v = ((node as any)[key] ?? (node as any)[legacyKey]) as SteelKind | undefined;
  if (v === 'continuous' || v === 'hook' || v === 'development') return v;
  return 'continuous';
}

function nodeBastonLineToFaceEnabled(node: NodeIn, side: 'top' | 'bottom', end: 1 | 2, line: 1 | 2): boolean {
  const key =
    side === 'top'
      ? end === 1
        ? line === 1
          ? 'baston_top_1_l1_to_face'
          : 'baston_top_1_l2_to_face'
        : line === 1
          ? 'baston_top_2_l1_to_face'
          : 'baston_top_2_l2_to_face'
      : end === 1
        ? line === 1
          ? 'baston_bottom_1_l1_to_face'
          : 'baston_bottom_1_l2_to_face'
        : line === 1
          ? 'baston_bottom_2_l1_to_face'
          : 'baston_bottom_2_l2_to_face';

  const legacyKey =
    side === 'top'
      ? end === 1
        ? 'baston_top_1_to_face'
        : 'baston_top_2_to_face'
      : end === 1
        ? 'baston_bottom_1_to_face'
        : 'baston_bottom_2_to_face';

  return Boolean((node as any)[key] ?? (node as any)[legacyKey]);
}

type NodeSlot = { nodeIdx: number; end: 1 | 2; label: string };

function buildNodeSlots(nodes: NodeIn[]): NodeSlot[] {
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

const REBAR_TABLE_CM: Record<
  string,
  { ldg: number; ld_inf: number; ld_sup: number }
> = {
  '1/2': { ldg: 28, ld_inf: 45, ld_sup: 60 },
  '5/8': { ldg: 35, ld_inf: 60, ld_sup: 75 },
  '3/4': { ldg: 42, ld_inf: 70, ld_sup: 90 },
  '1': { ldg: 56, ld_inf: 115, ld_sup: 145 },
  '1-3/8': { ldg: 77, ld_inf: 155, ld_sup: 200 },
};

function normalizeDiaKey(dia: string) {
  const s = String(dia || '').trim().replace(/"/g, '');
  if (s === '1 3/8' || s === '1-3/8' || s === '1-3/8\'' || s === '1-3/8in') return '1-3/8';
  return s;
}

function lengthFromTableMeters(dia: string, kind: 'hook' | 'anchorage', side: 'top' | 'bottom') {
  const key = normalizeDiaKey(dia);
  const row = REBAR_TABLE_CM[key] ?? REBAR_TABLE_CM['3/4'];
  const cm = kind === 'hook' ? row.ldg : side === 'top' ? row.ld_sup : row.ld_inf;
  return cm / 100;
}

type StirrupToken =
  | { kind: 'count'; count: number; spacing_m: number }
  | { kind: 'rest'; spacing_m: number };

type StirrupBlock = { key: string; positions: number[] };

type StirrupsABCR = {
  A_m: number;
  b_n: number;
  B_m: number;
  c_n: number;
  C_m: number;
  R_m: number;
};

function formatStirrupsABCR(p: StirrupsABCR) {
  const A = Math.max(0, p.A_m || 0);
  const b = Math.max(0, Math.round(p.b_n || 0));
  const B = Math.max(0, p.B_m || 0);
  const c = Math.max(0, Math.round(p.c_n || 0));
  const C = Math.max(0, p.C_m || 0);
  const R = Math.max(0, p.R_m || 0);
  return `A=${A.toFixed(2)} b,B=${b},${B.toFixed(3)} c,C=${c},${C.toFixed(3)} R=${R.toFixed(3)}`;
}

function abcrFromLegacyTokens(tokens: StirrupToken[]): StirrupsABCR | null {
  if (!tokens.length) return null;
  // Esperado: 1@A, N@B, rto@R   ó   1@A, rto@R
  const t0 = tokens[0];
  if (!t0 || t0.kind !== 'count' || Math.floor(t0.count) !== 1) return null;
  const A_m = t0.spacing_m;
  let idx = 1;
  let b_n = 1;
  let B_m = 0;
  if (tokens[idx]?.kind === 'count') {
    const t1 = tokens[idx] as any;
    b_n = 1 + Math.max(0, Math.floor(t1.count));
    B_m = Math.max(0, Number(t1.spacing_m) || 0);
    idx++;
  }
  let R_m = 0;
  for (; idx < tokens.length; idx++) {
    const t = tokens[idx];
    if (t.kind === 'rest') {
      R_m = Math.max(0, Number((t as any).spacing_m) || 0);
      break;
    }
  }
  return { A_m, b_n, B_m, c_n: 0, C_m: 0, R_m };
}

const STIRRUPS_DEFAULTS_BY_H: Array<{
  h_m: number;
  sismico: StirrupsABCR;
  gravedad: StirrupsABCR;
}> = [
  { h_m: 0.4, sismico: { A_m: 0.05, b_n: 9, B_m: 0.1, c_n: 0, C_m: 0, R_m: 0.2 }, gravedad: { A_m: 0.05, b_n: 1, B_m: 0, c_n: 0, C_m: 0, R_m: 0.2 } },
  { h_m: 0.425, sismico: { A_m: 0.05, b_n: 9, B_m: 0.1, c_n: 0, C_m: 0, R_m: 0.2 }, gravedad: { A_m: 0.05, b_n: 1, B_m: 0, c_n: 0, C_m: 0, R_m: 0.2 } },
  { h_m: 0.45, sismico: { A_m: 0.05, b_n: 9, B_m: 0.1, c_n: 0, C_m: 0, R_m: 0.2 }, gravedad: { A_m: 0.05, b_n: 1, B_m: 0, c_n: 0, C_m: 0, R_m: 0.2 } },
  { h_m: 0.475, sismico: { A_m: 0.05, b_n: 9, B_m: 0.1, c_n: 0, C_m: 0, R_m: 0.2 }, gravedad: { A_m: 0.05, b_n: 1, B_m: 0, c_n: 0, C_m: 0, R_m: 0.2 } },
  { h_m: 0.5, sismico: { A_m: 0.05, b_n: 9, B_m: 0.1, c_n: 0, C_m: 0, R_m: 0.22 }, gravedad: { A_m: 0.05, b_n: 1, B_m: 0, c_n: 0, C_m: 0, R_m: 0.22 } },
  { h_m: 0.525, sismico: { A_m: 0.05, b_n: 9, B_m: 0.1, c_n: 0, C_m: 0, R_m: 0.225 }, gravedad: { A_m: 0.05, b_n: 1, B_m: 0, c_n: 0, C_m: 0, R_m: 0.225 } },
  { h_m: 0.55, sismico: { A_m: 0.05, b_n: 9, B_m: 0.125, c_n: 0, C_m: 0, R_m: 0.25 }, gravedad: { A_m: 0.05, b_n: 1, B_m: 0, c_n: 0, C_m: 0, R_m: 0.25 } },
  { h_m: 0.575, sismico: { A_m: 0.05, b_n: 10, B_m: 0.125, c_n: 0, C_m: 0, R_m: 0.25 }, gravedad: { A_m: 0.05, b_n: 1, B_m: 0, c_n: 0, C_m: 0, R_m: 0.25 } },
  { h_m: 0.6, sismico: { A_m: 0.05, b_n: 10, B_m: 0.125, c_n: 0, C_m: 0, R_m: 0.25 }, gravedad: { A_m: 0.05, b_n: 1, B_m: 0, c_n: 0, C_m: 0, R_m: 0.25 } },
  { h_m: 0.625, sismico: { A_m: 0.05, b_n: 10, B_m: 0.125, c_n: 0, C_m: 0, R_m: 0.25 }, gravedad: { A_m: 0.05, b_n: 1, B_m: 0, c_n: 0, C_m: 0, R_m: 0.25 } },
  { h_m: 0.65, sismico: { A_m: 0.05, b_n: 9, B_m: 0.15, c_n: 0, C_m: 0, R_m: 0.3 }, gravedad: { A_m: 0.05, b_n: 1, B_m: 0, c_n: 0, C_m: 0, R_m: 0.3 } },
  { h_m: 0.675, sismico: { A_m: 0.05, b_n: 10, B_m: 0.15, c_n: 0, C_m: 0, R_m: 0.3 }, gravedad: { A_m: 0.05, b_n: 1, B_m: 0, c_n: 0, C_m: 0, R_m: 0.3 } },
  { h_m: 0.7, sismico: { A_m: 0.05, b_n: 10, B_m: 0.15, c_n: 0, C_m: 0, R_m: 0.3 }, gravedad: { A_m: 0.05, b_n: 1, B_m: 0, c_n: 0, C_m: 0, R_m: 0.3 } },
  { h_m: 0.725, sismico: { A_m: 0.05, b_n: 10, B_m: 0.15, c_n: 0, C_m: 0, R_m: 0.3 }, gravedad: { A_m: 0.05, b_n: 1, B_m: 0, c_n: 0, C_m: 0, R_m: 0.3 } },
  { h_m: 0.75, sismico: { A_m: 0.05, b_n: 9, B_m: 0.175, c_n: 0, C_m: 0, R_m: 0.35 }, gravedad: { A_m: 0.05, b_n: 1, B_m: 0, c_n: 0, C_m: 0, R_m: 0.35 } },
  { h_m: 0.775, sismico: { A_m: 0.05, b_n: 10, B_m: 0.175, c_n: 0, C_m: 0, R_m: 0.35 }, gravedad: { A_m: 0.05, b_n: 1, B_m: 0, c_n: 0, C_m: 0, R_m: 0.35 } },
  { h_m: 0.8, sismico: { A_m: 0.05, b_n: 10, B_m: 0.175, c_n: 0, C_m: 0, R_m: 0.35 }, gravedad: { A_m: 0.05, b_n: 1, B_m: 0, c_n: 0, C_m: 0, R_m: 0.35 } },
  { h_m: 0.825, sismico: { A_m: 0.05, b_n: 10, B_m: 0.175, c_n: 0, C_m: 0, R_m: 0.35 }, gravedad: { A_m: 0.05, b_n: 1, B_m: 0, c_n: 0, C_m: 0, R_m: 0.35 } },
  { h_m: 0.85, sismico: { A_m: 0.05, b_n: 10, B_m: 0.175, c_n: 0, C_m: 0, R_m: 0.35 }, gravedad: { A_m: 0.05, b_n: 1, B_m: 0, c_n: 0, C_m: 0, R_m: 0.35 } },
  { h_m: 0.875, sismico: { A_m: 0.05, b_n: 11, B_m: 0.175, c_n: 0, C_m: 0, R_m: 0.35 }, gravedad: { A_m: 0.05, b_n: 1, B_m: 0, c_n: 0, C_m: 0, R_m: 0.35 } },
  { h_m: 0.9, sismico: { A_m: 0.05, b_n: 11, B_m: 0.175, c_n: 0, C_m: 0, R_m: 0.35 }, gravedad: { A_m: 0.05, b_n: 1, B_m: 0, c_n: 0, C_m: 0, R_m: 0.35 } },
  { h_m: 0.925, sismico: { A_m: 0.05, b_n: 11, B_m: 0.175, c_n: 0, C_m: 0, R_m: 0.35 }, gravedad: { A_m: 0.05, b_n: 1, B_m: 0, c_n: 0, C_m: 0, R_m: 0.35 } },
  { h_m: 0.95, sismico: { A_m: 0.05, b_n: 12, B_m: 0.175, c_n: 0, C_m: 0, R_m: 0.35 }, gravedad: { A_m: 0.05, b_n: 1, B_m: 0, c_n: 0, C_m: 0, R_m: 0.35 } },
  { h_m: 0.975, sismico: { A_m: 0.05, b_n: 12, B_m: 0.175, c_n: 0, C_m: 0, R_m: 0.35 }, gravedad: { A_m: 0.05, b_n: 1, B_m: 0, c_n: 0, C_m: 0, R_m: 0.35 } },
  { h_m: 1.0, sismico: { A_m: 0.05, b_n: 12, B_m: 0.175, c_n: 0, C_m: 0, R_m: 0.35 }, gravedad: { A_m: 0.05, b_n: 1, B_m: 0, c_n: 0, C_m: 0, R_m: 0.35 } },
];

function pickDefaultABCRForH(h_m: number, mode: 'sismico' | 'gravedad'): StirrupsABCR {
  const h = Number.isFinite(h_m) ? h_m : 0.5;
  let best = STIRRUPS_DEFAULTS_BY_H[0];
  let bestD = Infinity;
  for (const row of STIRRUPS_DEFAULTS_BY_H) {
    const d = Math.abs(row.h_m - h);
    if (d < bestD) {
      bestD = d;
      best = row;
    }
  }
  return mode === 'gravedad' ? best.gravedad : best.sismico;
}

function parseStirrupsABCR(text: string): StirrupsABCR | null {
  const s = String(text ?? '');
  if (!s.trim()) return null;

  const num = (raw: string | undefined) => {
    const v = Number.parseFloat(String(raw ?? '').trim().replace(',', '.'));
    return Number.isFinite(v) ? v : NaN;
  };
  const int0 = (raw: string | undefined) => {
    const v = Number.parseInt(String(raw ?? '').trim(), 10);
    return Number.isFinite(v) ? v : 0;
  };

  const mA = s.match(/\bA\s*=\s*([0-9]+(?:[.,][0-9]+)?|\.[0-9]+)\s*m?\b/i);
  const mR = s.match(/\bR\s*=\s*([0-9]+(?:[.,][0-9]+)?|\.[0-9]+)\s*m?\b/i);
  const mb = s.match(/\bb\s*,\s*B\s*=\s*(\d+)\s*,\s*([0-9]+(?:[.,][0-9]+)?|\.[0-9]+)\s*m?\b/i);
  const mc = s.match(/\bc\s*,\s*C\s*=\s*(\d+)\s*,\s*([0-9]+(?:[.,][0-9]+)?|\.[0-9]+)\s*m?\b/i);

  // Heurística: si aparece alguno de los parámetros (A/b,B/c,C/R), lo tratamos como formato ABCR.
  if (!mA && !mR && !mb && !mc) return null;

  const A_m = num(mA?.[1]);
  const R_m = num(mR?.[1]);
  const b_n = int0(mb?.[1]);
  const B_m = num(mb?.[2]);
  const c_n = int0(mc?.[1]);
  const C_m = num(mc?.[2]);

  return {
    A_m: Number.isFinite(A_m) ? Math.max(0, A_m) : 0,
    b_n: Math.max(0, b_n),
    B_m: Number.isFinite(B_m) ? Math.max(0, B_m) : 0,
    c_n: Math.max(0, c_n),
    C_m: Number.isFinite(C_m) ? Math.max(0, C_m) : 0,
    R_m: Number.isFinite(R_m) ? Math.max(0, R_m) : 0,
  };
}

function parseStirrupsSpec(text: string): StirrupToken[] {
  let s = String(text ?? '');
  if (!s.trim()) return [];
  if (s.includes(':')) s = s.split(':', 2)[1] ?? '';

  // Formato ABCR: A=0.05  b,B=8,0.10  c,C=5,0.15  R=0.25
  // (no depende de separar por comas, porque b,B y c,C llevan coma interna)
  const abcr = parseStirrupsABCR(s);
  if (abcr) {
    const out: StirrupToken[] = [];
    if (abcr.A_m > 0) out.push({ kind: 'count', count: 1, spacing_m: abcr.A_m });
    if (abcr.b_n > 1 && abcr.B_m > 0) out.push({ kind: 'count', count: abcr.b_n - 1, spacing_m: abcr.B_m });
    if (abcr.c_n > 0 && abcr.C_m > 0) out.push({ kind: 'count', count: abcr.c_n, spacing_m: abcr.C_m });
    if (abcr.R_m > 0) out.push({ kind: 'rest', spacing_m: abcr.R_m });
    return out;
  }

  const parts = s.split(',').map((p) => p.trim()).filter(Boolean);

  const out: StirrupToken[] = [];
  for (const p0 of parts) {
    const p = p0.replace(',', '.').trim();

    // Shorthand: a single number means "rto@<spacing>".
    // Example: ".25" => rto@.25
    const asNumber = Number.parseFloat(p.replace(/\s*m\s*$/i, '').trim());
    if (Number.isFinite(asNumber) && asNumber > 0 && !p.includes('@')) {
      out.push({ kind: 'rest', spacing_m: asNumber });
      continue;
    }

    const m = p.match(/(rto|resto|\d+)\s*@\s*(\d+\.\d+|\d+|\.\d+)/i);
    if (!m) continue;
    const rawCount = String(m[1] ?? '').trim().toLowerCase();
    const spacing = Number.parseFloat(String(m[2] ?? '').trim().replace(',', '.'));
    if (!Number.isFinite(spacing) || spacing <= 0) continue;
    if (rawCount === 'rto' || rawCount === 'resto') {
      out.push({ kind: 'rest', spacing_m: spacing });
    } else {
      const n = Number.parseInt(rawCount, 10);
      if (!Number.isFinite(n) || n <= 0) continue;
      out.push({ kind: 'count', count: n, spacing_m: spacing });
    }
  }
  return out;
}

function stirrupsPositionsFromTokens(dev: DevelopmentIn, tokens: StirrupToken[], faceU: number, endU: number, dir: 1 | -1): number[] {
  if (!tokens.length) return [];
  const within = (v: number) => (dir > 0 ? v <= endU + 1e-6 : v >= endU - 1e-6);
  let cursor = faceU;
  const out: number[] = [];

  for (const seg of tokens) {
    const spacingU = mToUnits(dev, clampNumber((seg as any).spacing_m ?? 0, 0));
    if (!(spacingU > 0)) continue;
    const base = cursor + dir * spacingU;
    if (!within(base)) {
      // No cabe este segmento: saltar y probar el siguiente.
      // Esto permite que R aplique aunque C no quepa, por ejemplo.
      continue;
    }

    if (seg.kind === 'rest') {
      const avail = Math.abs(endU - base);
      const n = Math.floor(avail / spacingU + 1e-12) + 1;
      for (let k = 0; k < n; k++) {
        const v = base + dir * spacingU * k;
        if (within(v)) out.push(v);
      }
      break;
    }

    const nReq = Math.max(1, Math.floor(seg.count));
    let last = cursor;
    for (let k = 0; k < nReq; k++) {
      const v = base + dir * spacingU * k;
      if (!within(v)) break;
      out.push(v);
      last = v;
    }
    cursor = last;
  }

  return out;
}

function stirrupsBlocksFromSpec(dev: DevelopmentIn, specText: string, faceU: number, endU: number, dir: 1 | -1): StirrupBlock[] {
  const within = (v: number) => (dir > 0 ? v <= endU + 1e-6 : v >= endU - 1e-6);
  const abcr = parseStirrupsABCR(specText);

  if (abcr) {
    const blocks: StirrupBlock[] = [];
    let cursor = faceU;

    // Bloque b: el primer estribo está a A desde la cara (incluido dentro de b).
    const bPos: number[] = [];
    if (abcr.A_m > 0 && abcr.b_n > 0) {
      const A_u = mToUnits(dev, abcr.A_m);
      const first = cursor + dir * A_u;
      if (within(first)) {
        bPos.push(first);
        cursor = first;

        if (abcr.b_n > 1 && abcr.B_m > 0) {
          const B_u = mToUnits(dev, abcr.B_m);
          for (let k = 1; k < abcr.b_n; k++) {
            const v = first + dir * B_u * k;
            if (!within(v)) break;
            bPos.push(v);
            cursor = v;
          }
        }
      }
    }
    if (bPos.length) blocks.push({ key: 'b', positions: bPos });

    // Bloque c (opcional): si no cabe el primero, se omite y se intenta R.
    const cPos: number[] = [];
    if (abcr.c_n > 0 && abcr.C_m > 0) {
      const C_u = mToUnits(dev, abcr.C_m);
      const base = cursor + dir * C_u;
      if (within(base)) {
        for (let k = 0; k < abcr.c_n; k++) {
          const v = base + dir * C_u * k;
          if (!within(v)) break;
          cPos.push(v);
          cursor = v;
        }
      }
    }
    if (cPos.length) blocks.push({ key: 'c', positions: cPos });

    // Bloque R (resto) hacia el centro.
    const rPos: number[] = [];
    if (abcr.R_m > 0) {
      const R_u = mToUnits(dev, abcr.R_m);
      const base = cursor + dir * R_u;
      if (within(base)) {
        const avail = Math.abs(endU - base);
        const n = Math.floor(avail / R_u + 1e-12) + 1;
        for (let k = 0; k < n; k++) {
          const v = base + dir * R_u * k;
          if (!within(v)) break;
          rPos.push(v);
          cursor = v;
        }
      }
    }
    if (rPos.length) blocks.push({ key: 'r', positions: rPos });

    return blocks;
  }

  // Legacy: segmentar por token para poder colorear cada bloque.
  const tokens = parseStirrupsSpec(specText);
  if (!tokens.length) return [];

  const blocks: StirrupBlock[] = [];
  let cursor = faceU;
  for (let i = 0; i < tokens.length; i++) {
    const seg = tokens[i];
    const spacingU = mToUnits(dev, clampNumber((seg as any).spacing_m ?? 0, 0));
    if (!(spacingU > 0)) continue;
    const base = cursor + dir * spacingU;
    if (!within(base)) continue;

    if (seg.kind === 'rest') {
      const positions: number[] = [];
      const avail = Math.abs(endU - base);
      const n = Math.floor(avail / spacingU + 1e-12) + 1;
      for (let k = 0; k < n; k++) {
        const v = base + dir * spacingU * k;
        if (!within(v)) break;
        positions.push(v);
        cursor = v;
      }
      if (positions.length) blocks.push({ key: 'r', positions });
      break;
    }

    const nReq = Math.max(1, Math.floor(seg.count));
    const positions: number[] = [];
    for (let k = 0; k < nReq; k++) {
      const v = base + dir * spacingU * k;
      if (!within(v)) break;
      positions.push(v);
      cursor = v;
    }
    if (positions.length) blocks.push({ key: `seg${i + 1}`, positions });
  }

  return blocks;
}

function stirrupsRestSpacingFromSpec(specText: string): number | null {
  const abcr = parseStirrupsABCR(specText);
  if (abcr && abcr.R_m > 0) return abcr.R_m;
  const toks = parseStirrupsSpec(specText);
  for (let i = toks.length - 1; i >= 0; i--) {
    const t = toks[i];
    if (t && (t as any).kind === 'rest') {
      const r = Number((t as any).spacing_m);
      if (Number.isFinite(r) && r > 0) return r;
    }
  }
  return null;
}

function drawSteelOverlay(
  canvas: HTMLCanvasElement,
  preview: PreviewResponse,
  dev: DevelopmentIn,
  renderBounds: Bounds,
  recubrimientoM: number,
  hookLegM: number,
  opts?: { showLongitudinal?: boolean; showStirrups?: boolean }
) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const showLongitudinal = opts?.showLongitudinal ?? true;
  const showStirrups = opts?.showStirrups ?? true;

  const rect = canvas.getBoundingClientRect();
  const cssW = Math.max(1, Math.round(rect.width));
  const cssH = Math.max(1, Math.round(rect.height));
  const dpr = Math.min(window.devicePixelRatio || 1, 2);

  ctx.save();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const { toCanvas } = canvasMapper(renderBounds, cssW, cssH);
  const origins = computeNodeOrigins(dev);
  const y0 = mToUnits(dev, clampNumber((dev as any).y0 ?? 0, 0));
  const coverU = mToUnits(dev, clampNumber(recubrimientoM, 0.04));
  const hookLegU = mToUnits(dev, clampNumber(hookLegM, 0.15));

  // Acero corrido (vista 2D): amarillo
  if (showLongitudinal) {
    ctx.strokeStyle = 'rgba(250, 204, 21, 0.95)';
    ctx.lineWidth = 2;
  }

  const extraStroke = 'rgba(217, 70, 239, 0.95)';
  const bastonL1Stroke = 'rgba(34, 197, 94, 0.95)';
  const bastonL2Stroke = 'rgba(6, 182, 212, 0.95)';
  // Compatibilidad con helpers legacy que asumen un solo color.
  const bastonStroke = bastonL1Stroke;

  const spans = dev.spans ?? [];
  const nodes = dev.nodes ?? [];

  const bastonLcM = clampNumber((dev as any).baston_Lc ?? 0.5, 0.5);
  const bastonLcU = mToUnits(dev, bastonLcM);
  const bastonSpacingU = mToUnits(dev, 0.02);

  function getBastonCfg(span: SpanIn, side: 'top' | 'bottom', zone: 'z1' | 'z2' | 'z3'): BastonCfg {
    const b = (span as any).bastones ?? {};
    const s = (side === 'top' ? b.top : b.bottom) ?? {};
    const z = (s as any)[zone] ?? {};
    return normalizeBastonCfg(z);
  }

  function drawBastonLines(x0: number, x1: number, yBase: number, _qty: number, towardCenterSign: 1 | -1, stroke: string) {
    if (!ctx) return;
    const prev = ctx.strokeStyle;
    ctx.strokeStyle = stroke;
    // En el desarrollo 2D, una sola línea representa el grupo (qty no crea líneas paralelas).
    const y = yBase;
    const [cx0, cy] = toCanvas(x0, y);
    const [cx1] = toCanvas(x1, y);
    ctx.beginPath();
    ctx.moveTo(Math.round(cx0) + 0.5, Math.round(cy) + 0.5);
    ctx.lineTo(Math.round(cx1) + 0.5, Math.round(cy) + 0.5);
    ctx.stroke();

    drawEndDots(x0, y, x1, y, stroke);
    ctx.strokeStyle = prev;
  }

  // Zona 1: 2 líneas (según croquis)
  // - línea 1: 0 → L1
  // - línea 2: recubrimiento hacia adentro, 0 → (L1 - Lc)
  function drawBastonZona1(x0: number, x1Full: number, yBase: number, qty: number, towardCenterSign: 1 | -1) {
    if (!ctx) return;
    const prev = ctx.strokeStyle;
    ctx.strokeStyle = bastonStroke;
    for (let k = 0; k < qty; k++) {
      const y1 = yBase + towardCenterSign * k * bastonSpacingU;

      // línea completa
      {
        const [cx0, cy] = toCanvas(x0, y1);
        const [cx1] = toCanvas(x1Full, y1);
        ctx.beginPath();
        ctx.moveTo(Math.round(cx0) + 0.5, Math.round(cy) + 0.5);
        ctx.lineTo(Math.round(cx1) + 0.5, Math.round(cy) + 0.5);
        ctx.stroke();

        drawEndDots(x0, y1, x1Full, y1, bastonStroke);
      }

      // línea interior (offset recubrimiento) termina en L1 - Lc
      const x1Inner = x1Full - bastonLcU;
      if (x1Inner > x0 + 1e-6) {
        const y2 = y1 + towardCenterSign * coverU;
        const [cx0, cy] = toCanvas(x0, y2);
        const [cx1] = toCanvas(x1Inner, y2);
        ctx.beginPath();
        ctx.moveTo(Math.round(cx0) + 0.5, Math.round(cy) + 0.5);
        ctx.lineTo(Math.round(cx1) + 0.5, Math.round(cy) + 0.5);
        ctx.stroke();

        drawEndDots(x0, y2, x1Inner, y2, bastonStroke);
      }
    }
    ctx.strokeStyle = prev;
  }

  // Zona 3 (espejo de Zona 1):
  // - línea 1: (L - L1) → L
  // - línea 2: recubrimiento hacia adentro, (L - L1 + Lc) → L
  function drawBastonZona3(x0Full: number, x1: number, yBase: number, qty: number, towardCenterSign: 1 | -1) {
    if (!ctx) return;
    const prev = ctx.strokeStyle;
    ctx.strokeStyle = bastonStroke;
    for (let k = 0; k < qty; k++) {
      const y1 = yBase + towardCenterSign * k * bastonSpacingU;

      // línea completa
      {
        const [cx0, cy] = toCanvas(x0Full, y1);
        const [cx1] = toCanvas(x1, y1);
        ctx.beginPath();
        ctx.moveTo(Math.round(cx0) + 0.5, Math.round(cy) + 0.5);
        ctx.lineTo(Math.round(cx1) + 0.5, Math.round(cy) + 0.5);
        ctx.stroke();

        drawEndDots(x0Full, y1, x1, y1, bastonStroke);
      }

      // línea interior (offset recubrimiento) inicia en (L-L1+Lc)
      const x0Inner = x0Full + bastonLcU;
      if (x1 > x0Inner + 1e-6) {
        const y2 = y1 + towardCenterSign * coverU;
        const [cx0, cy] = toCanvas(x0Inner, y2);
        const [cx1] = toCanvas(x1, y2);
        ctx.beginPath();
        ctx.moveTo(Math.round(cx0) + 0.5, Math.round(cy) + 0.5);
        ctx.lineTo(Math.round(cx1) + 0.5, Math.round(cy) + 0.5);
        ctx.stroke();

        drawEndDots(x0Inner, y2, x1, y2, bastonStroke);
      }
    }
    ctx.strokeStyle = prev;
  }

  // Zona 2 (según croquis):
  // - línea 1: L1 → (L - L2)
  // - línea 2: recubrimiento hacia adentro, (L1 + Lc) → (L - L2 - Lc)
  function drawBastonZona2(x0Full: number, x1Full: number, yBase: number, qty: number, towardCenterSign: 1 | -1) {
    if (!ctx) return;
    const prev = ctx.strokeStyle;
    ctx.strokeStyle = bastonStroke;
    for (let k = 0; k < qty; k++) {
      const y1 = yBase + towardCenterSign * k * bastonSpacingU;

      // línea completa
      {
        const [cx0, cy] = toCanvas(x0Full, y1);
        const [cx1] = toCanvas(x1Full, y1);
        ctx.beginPath();
        ctx.moveTo(Math.round(cx0) + 0.5, Math.round(cy) + 0.5);
        ctx.lineTo(Math.round(cx1) + 0.5, Math.round(cy) + 0.5);
        ctx.stroke();

        drawEndDots(x0Full, y1, x1Full, y1, bastonStroke);
      }

      // línea interior (offset recubrimiento) recortada por Lc a ambos lados
      const x0Inner = x0Full + bastonLcU;
      const x1Inner = x1Full - bastonLcU;
      if (x1Inner > x0Inner + 1e-6) {
        const y2 = y1 + towardCenterSign * coverU;
        const [cx0, cy] = toCanvas(x0Inner, y2);
        const [cx1] = toCanvas(x1Inner, y2);
        ctx.beginPath();
        ctx.moveTo(Math.round(cx0) + 0.5, Math.round(cy) + 0.5);
        ctx.lineTo(Math.round(cx1) + 0.5, Math.round(cy) + 0.5);
        ctx.stroke();

        drawEndDots(x0Inner, y2, x1Inner, y2, bastonStroke);
      }
    }
    ctx.strokeStyle = prev;
  }

  function drawHookOrAnchorage(
    x: number,
    y: number,
    dir: 1 | -1,
    dia: string,
    kind: 'hook' | 'anchorage',
    side: 'top' | 'bottom',
    xFace?: number
  ) {
    const c = ctx;
    if (!c) return;
    const prevStroke = c.strokeStyle;
    c.strokeStyle = extraStroke;
    const x2 = (() => {
      if (typeof xFace === 'number' && Number.isFinite(xFace)) {
        // Offset interior: separar del borde por recubrimiento.
        const target = xFace - dir * coverU;
        const lo = Math.min(x, xFace);
        const hi = Math.max(x, xFace);
        return Math.min(hi, Math.max(lo, target));
      }
      return x + dir * mToUnits(dev, lengthFromTableMeters(dia, kind, side));
    })();

    const [cx0, cy0] = toCanvas(x, y);
    const [cx1] = toCanvas(x2, y);

    c.beginPath();
    c.moveTo(Math.round(cx0) + 0.5, Math.round(cy0) + 0.5);
    c.lineTo(Math.round(cx1) + 0.5, Math.round(cy0) + 0.5);

    if (kind === 'hook') {
      const y3 = side === 'top' ? y - hookLegU : y + hookLegU;
      const [, cy3] = toCanvas(x2, y3);
      c.lineTo(Math.round(cx1) + 0.5, Math.round(cy3) + 0.5);
    }
    c.stroke();
    c.strokeStyle = prevStroke;
  }

  // Líneas por tramo (superior + inferior) + nodos
  const dotR = 3;
  ctx.fillStyle = 'rgba(250, 204, 21, 0.95)';

  function drawEndDots(x0: number, y0: number, x1: number, y1: number, color: string) {
    const c = ctx;
    if (!c) return;
    const prevFill = c.fillStyle;
    c.fillStyle = color;
    const [cx0, cy0] = toCanvas(x0, y0);
    const [cx1, cy1] = toCanvas(x1, y1);
    c.beginPath();
    c.arc(Math.round(cx0) + 0.5, Math.round(cy0) + 0.5, dotR, 0, Math.PI * 2);
    c.arc(Math.round(cx1) + 0.5, Math.round(cy1) + 0.5, dotR, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = prevFill;
  }

  for (let i = 0; i < spans.length; i++) {
    const L = mToUnits(dev, clampNumber(spans[i]?.L ?? 0, 0));
    const h = mToUnits(dev, clampNumber(spans[i]?.h ?? 0, 0));

    const a2_i = mToUnits(dev, clampNumber(nodes[i]?.a2 ?? 0, 0));
    const a1_ip1 = mToUnits(dev, clampNumber(nodes[i + 1]?.a1 ?? 0, 0));
    const xBot0 = (origins[i] ?? 0) + a2_i;
    const xBot1 = xBot0 + L;
    const yBot = y0 + coverU;

    const b2_i = mToUnits(dev, clampNumber(nodes[i]?.b2 ?? 0, 0));
    const b1_ip1 = mToUnits(dev, clampNumber(nodes[i + 1]?.b1 ?? 0, 0));
    const xTop0 = (origins[i] ?? 0) + b2_i;
    const xTop1 = (origins[i + 1] ?? 0) + b1_ip1;
    const yTop = y0 + h - coverU;

    if (showLongitudinal) {
      // superior
      {
        const [cx0, cy] = toCanvas(xTop0, yTop);
        const [cx1] = toCanvas(xTop1, yTop);
        ctx.beginPath();
        ctx.moveTo(Math.round(cx0) + 0.5, Math.round(cy) + 0.5);
        ctx.lineTo(Math.round(cx1) + 0.5, Math.round(cy) + 0.5);
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(Math.round(cx0) + 0.5, Math.round(cy) + 0.5, dotR, 0, Math.PI * 2);
        ctx.arc(Math.round(cx1) + 0.5, Math.round(cy) + 0.5, dotR, 0, Math.PI * 2);
        ctx.fill();
      }

      // inferior
      {
        const [cx0, cy] = toCanvas(xBot0, yBot);
        const [cx1] = toCanvas(xBot1, yBot);
        ctx.beginPath();
        ctx.moveTo(Math.round(cx0) + 0.5, Math.round(cy) + 0.5);
        ctx.lineTo(Math.round(cx1) + 0.5, Math.round(cy) + 0.5);
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(Math.round(cx0) + 0.5, Math.round(cy) + 0.5, dotR, 0, Math.PI * 2);
        ctx.arc(Math.round(cx1) + 0.5, Math.round(cy) + 0.5, dotR, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Estribos (vista 2D): gris
    if (showStirrups) {
      const st = (spans[i] as any)?.stirrups as any;
      if (st) {
        const dM = clampNumber((dev as any).d ?? 0.25, 0.25);
        const x0Face = Math.min(xBot0, xBot1);
        const x1Face = Math.max(xBot0, xBot1);
        const LspanU = x1Face - x0Face;

        if (LspanU > 1e-6) {
          const caseType = String(st.case_type ?? 'simetrica').trim().toLowerCase();
          const singleEnd = String(st.single_end ?? '').trim().toLowerCase();
          const leftSpec = String(st.left_spec ?? '').trim();
          const centerSpec = String(st.center_spec ?? '').trim();
          const rightSpec = String(st.right_spec ?? '').trim();

          const specOr = (...vals: string[]) => {
            for (const v of vals) {
              const s = String(v ?? '').trim();
              if (s) return s;
            }
            return '';
          };

          let pL = '';
          let pR = '';
          if (caseType === 'simetrica') {
            pL = specOr(leftSpec, centerSpec, rightSpec);
            pR = specOr(rightSpec, pL) || pL;
          } else if (caseType === 'asim_ambos') {
            pL = specOr(leftSpec, centerSpec);
            pR = specOr(rightSpec, centerSpec, pL);
          } else if (caseType === 'asim_uno') {
            const pSpecial = specOr(leftSpec);
            const pRest = specOr(centerSpec, pSpecial);
            if (singleEnd === 'right') {
              pL = pRest;
              pR = pSpecial;
            } else {
              pL = pSpecial;
              pR = pRest;
            }
          } else {
            pL = specOr(leftSpec, centerSpec, rightSpec);
            pR = specOr(rightSpec, pL) || pL;
          }

          const midU = (x0Face + x1Face) / 2;
          const leftBlocks = pL ? stirrupsBlocksFromSpec(dev, pL, x0Face, midU, +1) : [];
          const rightBlocks = pR ? stirrupsBlocksFromSpec(dev, pR, x1Face, midU, -1) : [];

          // Si el espacio en el centro es mayor que R, agregar un estribo independiente.
          try {
            const flatL = leftBlocks.flatMap((b) => b.positions ?? []);
            const flatR = rightBlocks.flatMap((b) => b.positions ?? []);
            const leftLast = flatL.length ? Math.max(...flatL) : null;
            const rightFirst = flatR.length ? Math.min(...flatR) : null;
            const rLm = pL ? stirrupsRestSpacingFromSpec(pL) : null;
            const rRm = pR ? stirrupsRestSpacingFromSpec(pR) : null;
            const rM = Math.min(...[rLm ?? Infinity, rRm ?? Infinity].filter((v) => Number.isFinite(v)) as number[]);
            const rU = Number.isFinite(rM) && rM > 0 ? mToUnits(dev, rM) : 0;
            if (leftLast != null && rightFirst != null && rightFirst > leftLast + 1e-6 && rU > 0) {
              const gap = rightFirst - leftLast;
              if (gap > rU + 1e-6) {
                const xMid = (leftLast + rightFirst) / 2;
                leftBlocks.push({ key: 'mid', positions: [xMid] });
              }
            }
          } catch {
            // ignore
          }

          if (leftBlocks.length || rightBlocks.length) {
            const prevStroke = ctx.strokeStyle;
            const prevW = ctx.lineWidth;
            ctx.lineWidth = 1;

            const colorFor = (key: string, idx: number) => {
              const k = String(key || '').toLowerCase();
              if (k === 'b') return 'rgba(34,197,94,0.70)';
              if (k === 'c') return 'rgba(148,163,184,0.70)';
              if (k === 'r') return 'rgba(6,182,212,0.70)';
              if (k === 'mid') return 'rgba(217,70,239,0.80)';
              return idx % 3 === 0
                ? 'rgba(34,197,94,0.70)'
                : idx % 3 === 1
                  ? 'rgba(148,163,184,0.70)'
                  : 'rgba(6,182,212,0.70)';
            };

            const yS0 = y0 + coverU;
            const yS1 = y0 + h - coverU;
            if (yS1 > yS0 + 1e-6) {
              const drawGroup = (positions: number[], color: string) => {
                if (!positions.length) return;
                ctx.strokeStyle = color;
                ctx.beginPath();
                for (const xPos of positions) {
                  if (xPos < x0Face - 1e-3 || xPos > x1Face + 1e-3) continue;
                  const [cx0, cy0_] = toCanvas(xPos, yS0);
                  const [, cy1_] = toCanvas(xPos, yS1);
                  const sx = Math.round(cx0) + 0.5;
                  ctx.moveTo(sx, Math.round(cy0_) + 0.5);
                  ctx.lineTo(sx, Math.round(cy1_) + 0.5);
                }
                ctx.stroke();
              };

              let idx = 0;
              for (const b of leftBlocks) {
                drawGroup(b.positions, colorFor(b.key, idx++));
              }
              for (const b of rightBlocks) {
                drawGroup(b.positions, colorFor(b.key, idx++));
              }
            }

            ctx.strokeStyle = prevStroke;
            ctx.lineWidth = prevW;
          }
        }
      }
    }
  }

  if (!showLongitudinal) {
    ctx.restore();
    return;
  }

  // Bastones por zonas (1/2/3) por tramo
  for (let i = 0; i < spans.length; i++) {
    const span = spans[i];
    const Lm = clampNumber(span?.L ?? 0, 0);
    if (!span || Lm <= 0) continue;

    const h_u = mToUnits(dev, clampNumber(span.h ?? 0, 0));

    // X-range por lado (mismo que el acero longitudinal dibujado)
    const a2_i = mToUnits(dev, clampNumber(nodes[i]?.a2 ?? 0, 0));
    const xBot0 = (origins[i] ?? 0) + a2_i;
    const xBot1 = xBot0 + mToUnits(dev, Lm);

    const b2_i = mToUnits(dev, clampNumber(nodes[i]?.b2 ?? 0, 0));
    const b1_ip1 = mToUnits(dev, clampNumber(nodes[i + 1]?.b1 ?? 0, 0));
    const xTop0 = (origins[i] ?? 0) + b2_i;
    const xTop1 = (origins[i + 1] ?? 0) + b1_ip1;

    const yTopLong = y0 + h_u - coverU;
    const yBotLong = y0 + coverU;
    const yTopBaston = yTopLong - coverU;
    const yBotBaston = yBotLong + coverU;

    const defaultLenM = Lm / 5;
    const defaultL3M = Lm / 3;

    const resolvedLenM = (cfg: BastonCfg, field: 'L1_m' | 'L2_m' | 'L3_m', fallbackM: number) => {
      const v = (cfg as any)[field];
      const n = typeof v === 'number' ? v : NaN;
      const out = Number.isFinite(n) && n > 0 ? n : fallbackM;
      const snapped = snap05m(out);
      return Math.min(Lm, Math.max(0, snapped));
    };

    const drawSide = (side: 'top' | 'bottom') => {
      const x0Side = side === 'top' ? xTop0 : xBot0;
      const x1Side = side === 'top' ? xTop1 : xBot1;
      const yBase = side === 'top' ? yTopBaston : yBotBaston;
      const sign: 1 | -1 = side === 'top' ? -1 : +1;

      // Z1
      {
        const cfg = getBastonCfg(span, side, 'z1');
        if (cfg.l1_enabled || cfg.l2_enabled) {
          const q1 = Math.max(1, Math.min(3, Math.round(cfg.l1_qty ?? 1)));
          const q2 = Math.max(1, Math.min(3, Math.round(cfg.l2_qty ?? 1)));
          const L3_u = mToUnits(dev, resolvedLenM(cfg, 'L3_m', defaultL3M));
          const x0 = x0Side;
          const x1 = Math.min(x1Side, x0Side + L3_u);
          if (x1 > x0 + 1e-6) {
            // Línea 1 (exterior)
            if (cfg.l1_enabled) drawBastonLines(x0, x1, yBase, 1, sign, bastonL1Stroke);

            // Línea 2 (interior)
            const x1Inner = x1 - bastonLcU;
            if (cfg.l2_enabled && x1Inner > x0 + 1e-6) {
              drawBastonLines(x0, x1Inner, yBase + sign * coverU, 1, sign, bastonL2Stroke);
            }
          }

          // Conexión en el nodo (Zona 1): usa el nodo izquierdo del tramo (end=2)
          const n0 = nodes[i];
          if (n0) {
            const xFaceFor = (line: 1 | 2) => {
              const toFace = nodeBastonLineToFaceEnabled(n0, side, 2, line);
              if (!toFace) return undefined;
              const o = origins[i] ?? 0;
              return side === 'top'
                ? o + mToUnits(dev, clampNumber(n0.b1 ?? 0, 0))
                : o + mToUnits(dev, clampNumber(n0.a1 ?? 0, 0));
            };

            // Línea 1 (exterior)
            {
              if (cfg.l1_enabled) {
                const dia = String(cfg.l1_diameter ?? '3/4');
                const kEnd = nodeBastonLineKind(n0, side, 2, 1);
                if (kEnd === 'hook' || kEnd === 'development') {
                  const kind = kEnd === 'hook' ? 'hook' : 'anchorage';
                  const xFace = xFaceFor(1);
                  drawHookOrAnchorage(x0, yBase, -1, dia, kind, side, xFace);
                }
              }
            }

            // Línea 2 (interior): solo si existe (L3 > Lc)
            {
              const x1Inner = x1 - bastonLcU;
              if (x1Inner > x0 + 1e-6) {
                if (cfg.l2_enabled) {
                  const dia = String(cfg.l2_diameter ?? '3/4');
                  const kEnd = nodeBastonLineKind(n0, side, 2, 2);
                  if (kEnd === 'hook' || kEnd === 'development') {
                    const kind = kEnd === 'hook' ? 'hook' : 'anchorage';
                    const xFace = xFaceFor(2);
                    drawHookOrAnchorage(x0, yBase + sign * coverU, -1, dia, kind, side, xFace);
                  }
                }
              }
            }
          }
        }
      }

      // Z2
      {
        const cfg = getBastonCfg(span, side, 'z2');
        if (cfg.l1_enabled || cfg.l2_enabled) {
          const q1 = Math.max(1, Math.min(3, Math.round(cfg.l1_qty ?? 1)));
          const q2 = Math.max(1, Math.min(3, Math.round(cfg.l2_qty ?? 1)));
          const L1_u = mToUnits(dev, resolvedLenM(cfg, 'L1_m', defaultLenM));
          const L2_u = mToUnits(dev, resolvedLenM(cfg, 'L2_m', defaultLenM));
          // NOTA: el recorte por Lc se aplica en el segundo trazo, no aquí.
          const x0 = x0Side + L1_u;
          const x1 = x1Side - L2_u;
          if (x1 > x0 + 1e-6) {
            if (cfg.l1_enabled) drawBastonLines(x0, x1, yBase, 1, sign, bastonL1Stroke);
            const x0Inner = x0 + bastonLcU;
            const x1Inner = x1 - bastonLcU;
            if (cfg.l2_enabled && x1Inner > x0Inner + 1e-6) {
              drawBastonLines(x0Inner, x1Inner, yBase + sign * coverU, 1, sign, bastonL2Stroke);
            }
          }
        }
      }

      // Z3 (espejo Z1)
      {
        const cfg = getBastonCfg(span, side, 'z3');
        if (cfg.l1_enabled || cfg.l2_enabled) {
          const q1 = Math.max(1, Math.min(3, Math.round(cfg.l1_qty ?? 1)));
          const q2 = Math.max(1, Math.min(3, Math.round(cfg.l2_qty ?? 1)));
          const L3_u = mToUnits(dev, resolvedLenM(cfg, 'L3_m', defaultL3M));
          const x1 = x1Side;
          const x0 = Math.max(x0Side, x1Side - L3_u);
          if (x1 > x0 + 1e-6) {
            if (cfg.l1_enabled) drawBastonLines(x0, x1, yBase, 1, sign, bastonL1Stroke);
            const x0Inner = x0 + bastonLcU;
            if (cfg.l2_enabled && x1 > x0Inner + 1e-6) {
              drawBastonLines(x0Inner, x1, yBase + sign * coverU, 1, sign, bastonL2Stroke);
            }
          }

          // Conexión en el nodo (Zona 3): usa el nodo derecho del tramo (end=1)
          const n1 = nodes[i + 1];
          if (n1) {
            const xFaceFor = (line: 1 | 2) => {
              const toFace = nodeBastonLineToFaceEnabled(n1, side, 1, line);
              if (!toFace) return undefined;
              const o = origins[i + 1] ?? 0;
              return side === 'top'
                ? o + mToUnits(dev, clampNumber(n1.b2 ?? 0, 0))
                : o + mToUnits(dev, clampNumber(n1.a2 ?? 0, 0));
            };

            // Línea 1 (exterior)
            {
              if (cfg.l1_enabled) {
                const dia = String(cfg.l1_diameter ?? '3/4');
                const kEnd = nodeBastonLineKind(n1, side, 1, 1);
                if (kEnd === 'hook' || kEnd === 'development') {
                  const kind = kEnd === 'hook' ? 'hook' : 'anchorage';
                  const xFace = xFaceFor(1);
                  drawHookOrAnchorage(x1, yBase, +1, dia, kind, side, xFace);
                }
              }
            }

            // Línea 2 (interior): solo si existe (L3 > Lc)
            {
              const x0Inner = x0 + bastonLcU;
              if (x1 > x0Inner + 1e-6) {
                if (cfg.l2_enabled) {
                  const dia = String(cfg.l2_diameter ?? '3/4');
                  const kEnd = nodeBastonLineKind(n1, side, 1, 2);
                  if (kEnd === 'hook' || kEnd === 'development') {
                    const kind = kEnd === 'hook' ? 'hook' : 'anchorage';
                    const xFace = xFaceFor(2);
                    drawHookOrAnchorage(x1, yBase + sign * coverU, +1, dia, kind, side, xFace);
                  }
                }
              }
            }
          }
        }
      }
    };

    drawSide('top');
    drawSide('bottom');
  }

  // Conexiones de bastones en nodos internos (Z3 tramo izq ↔ Z1 tramo der)
  {
    const prev = ctx.strokeStyle;
    for (let i = 1; i < nodes.length - 1; i++) {
      const node = nodes[i];
      const leftSpan = spans[i - 1];
      const rightSpan = spans[i];
      if (!node || !leftSpan || !rightSpan) continue;

      const xTopL = (origins[i] ?? 0) + mToUnits(dev, clampNumber(node.b1 ?? 0, 0));
      const xTopR = (origins[i] ?? 0) + mToUnits(dev, clampNumber(node.b2 ?? 0, 0));
      const yTopL = y0 + mToUnits(dev, clampNumber(leftSpan.h ?? 0, 0)) - coverU;
      const yTopR = y0 + mToUnits(dev, clampNumber(rightSpan.h ?? 0, 0)) - coverU;
      const yTopBastonL = yTopL - coverU;
      const yTopBastonR = yTopR - coverU;

      const xBotL = (origins[i] ?? 0) + mToUnits(dev, clampNumber(node.a1 ?? 0, 0));
      const xBotR = (origins[i] ?? 0) + mToUnits(dev, clampNumber(node.a2 ?? 0, 0));
      const yBotBaston = (y0 + coverU) + coverU;

      const cfgTopL = getBastonCfg(leftSpan, 'top', 'z3');
      const cfgTopR = getBastonCfg(rightSpan, 'top', 'z1');
      const cfgBotL = getBastonCfg(leftSpan, 'bottom', 'z3');
      const cfgBotR = getBastonCfg(rightSpan, 'bottom', 'z1');

      const resolvedL3u = (span: SpanIn, cfg: BastonCfg) => {
        const Lm = clampNumber(span?.L ?? 0, 0);
        const fallbackM = Lm / 3;
        const v = (cfg as any).L3_m;
        const n = typeof v === 'number' ? v : NaN;
        const out = Number.isFinite(n) && n > 0 ? n : fallbackM;
        const snapped = snap05m(out);
        const m = Math.min(Lm, Math.max(0, snapped));
        return mToUnits(dev, m);
      };

      for (const line of [1, 2] as const) {
        const stroke = line === 1 ? bastonL1Stroke : bastonL2Stroke;
        ctx.strokeStyle = stroke;
        const topK1 = nodeBastonLineKind(node, 'top', 1, line);
        const topK2 = nodeBastonLineKind(node, 'top', 2, line);
        const botK1 = nodeBastonLineKind(node, 'bottom', 1, line);
        const botK2 = nodeBastonLineKind(node, 'bottom', 2, line);

        // TOP: continuo solo si ambos extremos son continuos y existen bastones a ambos lados
        if (topK1 === 'continuous' && topK2 === 'continuous') {
          const leftEnabled = line === 1 ? cfgTopL.l1_enabled : cfgTopL.l2_enabled;
          const rightEnabled = line === 1 ? cfgTopR.l1_enabled : cfgTopR.l2_enabled;
          if (leftEnabled && rightEnabled) {
            // Línea 2 solo existe si L3 > Lc en ambos tramos
            const l2Ok = (() => {
              if (line === 1) return true;
              const L3uL = resolvedL3u(leftSpan, cfgTopL);
              const L3uR = resolvedL3u(rightSpan, cfgTopR);
              return L3uL > bastonLcU + 1e-6 && L3uR > bastonLcU + 1e-6;
            })();
            if (l2Ok) {
              // En 2D longitudinal, una sola línea representa el grupo (qty no crea líneas paralelas).
              // Por consistencia, la unión en el nodo interno también se dibuja una sola vez.
              const yOff = line === 1 ? 0 : -coverU;
              const yL = yTopBastonL + yOff;
              const yR = yTopBastonR + yOff;
              const yMid = Math.max(yL, yR);
              const [cxl, cyl] = toCanvas(xTopL, yL);
              const [cxm1, cym] = toCanvas(xTopL, yMid);
              const [cxm2] = toCanvas(xTopR, yMid);
              const [cxr, cyr] = toCanvas(xTopR, yR);
              ctx.beginPath();
              ctx.moveTo(Math.round(cxl) + 0.5, Math.round(cyl) + 0.5);
              ctx.lineTo(Math.round(cxm1) + 0.5, Math.round(cym) + 0.5);
              ctx.lineTo(Math.round(cxm2) + 0.5, Math.round(cym) + 0.5);
              ctx.lineTo(Math.round(cxr) + 0.5, Math.round(cyr) + 0.5);
              ctx.stroke();

              // puntos inicio/fin (como acero corrido)
              drawEndDots(xTopL, yL, xTopR, yR, stroke);
            }
          }
        }

        // BOTTOM: continuo solo si ambos extremos son continuos y existen bastones a ambos lados
        if (botK1 === 'continuous' && botK2 === 'continuous') {
          const leftEnabled = line === 1 ? cfgBotL.l1_enabled : cfgBotL.l2_enabled;
          const rightEnabled = line === 1 ? cfgBotR.l1_enabled : cfgBotR.l2_enabled;
          if (leftEnabled && rightEnabled) {
            const l2Ok = (() => {
              if (line === 1) return true;
              const L3uL = resolvedL3u(leftSpan, cfgBotL);
              const L3uR = resolvedL3u(rightSpan, cfgBotR);
              return L3uL > bastonLcU + 1e-6 && L3uR > bastonLcU + 1e-6;
            })();
            if (l2Ok) {
              const yOff = line === 1 ? 0 : +coverU;
              const y = yBotBaston + yOff;
              const [cxl, cy] = toCanvas(xBotL, y);
              const [cxr] = toCanvas(xBotR, y);
              ctx.beginPath();
              ctx.moveTo(Math.round(cxl) + 0.5, Math.round(cy) + 0.5);
              ctx.lineTo(Math.round(cxr) + 0.5, Math.round(cy) + 0.5);
              ctx.stroke();

              // puntos inicio/fin (como acero corrido)
              drawEndDots(xBotL, y, xBotR, y, stroke);
            }
          }
        }
      }
    }
    ctx.strokeStyle = prev;
  }

  // Conexiones en nodos internos (entre tramo i-1 y tramo i)
  for (let i = 1; i < nodes.length - 1; i++) {
    const node = nodes[i];

    const leftSpan = spans[i - 1];
    const rightSpan = spans[i];
    if (!leftSpan || !rightSpan) continue;

    // Top endpoints en el nodo: fin del tramo izq (B1) y arranque del tramo der (B2)
    const xTopL = (origins[i] ?? 0) + mToUnits(dev, clampNumber(node.b1 ?? 0, 0));
    const xTopR = (origins[i] ?? 0) + mToUnits(dev, clampNumber(node.b2 ?? 0, 0));
    const yTopL = y0 + mToUnits(dev, clampNumber(leftSpan.h ?? 0, 0)) - coverU;
    const yTopR = y0 + mToUnits(dev, clampNumber(rightSpan.h ?? 0, 0)) - coverU;

    // Bottom endpoints en el nodo: fin del tramo izq (A1) y arranque del tramo der (A2)
    const xBotL = (origins[i] ?? 0) + mToUnits(dev, clampNumber(node.a1 ?? 0, 0));
    const xBotR = (origins[i] ?? 0) + mToUnits(dev, clampNumber(node.a2 ?? 0, 0));
    const yBot = y0 + coverU;

    const topK1 = nodeSteelKind(node, 'top', 1);
    const topK2 = nodeSteelKind(node, 'top', 2);
    const botK1 = nodeSteelKind(node, 'bottom', 1);
    const botK2 = nodeSteelKind(node, 'bottom', 2);

    const topToFace1 = nodeToFaceEnabled(node, 'top', 1);
    const topToFace2 = nodeToFaceEnabled(node, 'top', 2);
    const botToFace1 = nodeToFaceEnabled(node, 'bottom', 1);
    const botToFace2 = nodeToFaceEnabled(node, 'bottom', 2);

    // CONTINUO: conectar nodos cercanos (solo si ambos extremos son continuos)
    if (topK1 === 'continuous' && topK2 === 'continuous') {
      const yMid = Math.max(yTopL, yTopR);
      const [cxl, cyl] = toCanvas(xTopL, yTopL);
      const [cxm1, cym] = toCanvas(xTopL, yMid);
      const [cxm2] = toCanvas(xTopR, yMid);
      const [cxr, cyr] = toCanvas(xTopR, yTopR);
      ctx.beginPath();
      ctx.moveTo(Math.round(cxl) + 0.5, Math.round(cyl) + 0.5);
      ctx.lineTo(Math.round(cxm1) + 0.5, Math.round(cym) + 0.5);
      ctx.lineTo(Math.round(cxm2) + 0.5, Math.round(cym) + 0.5);
      ctx.lineTo(Math.round(cxr) + 0.5, Math.round(cyr) + 0.5);
      ctx.stroke();
    }

    // Top: N.i.1 (cara izquierda) -> hacia +X, usa diámetro del tramo izquierdo
    if (topK1 === 'hook')
      drawHookOrAnchorage(xTopL, yTopL, +1, leftSpan.steel_top?.diameter ?? '3/4', 'hook', 'top', topToFace1 ? xTopR : undefined);
    if (topK1 === 'development')
      drawHookOrAnchorage(xTopL, yTopL, +1, leftSpan.steel_top?.diameter ?? '3/4', 'anchorage', 'top', topToFace1 ? xTopR : undefined);

    // Top: N.i.2 (cara derecha) -> hacia -X, usa diámetro del tramo derecho
    if (topK2 === 'hook')
      drawHookOrAnchorage(xTopR, yTopR, -1, rightSpan.steel_top?.diameter ?? '3/4', 'hook', 'top', topToFace2 ? xTopL : undefined);
    if (topK2 === 'development')
      drawHookOrAnchorage(xTopR, yTopR, -1, rightSpan.steel_top?.diameter ?? '3/4', 'anchorage', 'top', topToFace2 ? xTopL : undefined);

    if (botK1 === 'continuous' && botK2 === 'continuous') {
      const [cxl, cy] = toCanvas(xBotL, yBot);
      const [cxr] = toCanvas(xBotR, yBot);
      ctx.beginPath();
      ctx.moveTo(Math.round(cxl) + 0.5, Math.round(cy) + 0.5);
      ctx.lineTo(Math.round(cxr) + 0.5, Math.round(cy) + 0.5);
      ctx.stroke();
    }

    // Bottom: N.i.1 (cara izquierda) -> hacia +X, usa diámetro del tramo izquierdo
    if (botK1 === 'hook')
      drawHookOrAnchorage(
        xBotL,
        yBot,
        +1,
        leftSpan.steel_bottom?.diameter ?? '3/4',
        'hook',
        'bottom',
        botToFace1 ? xBotR : undefined
      );
    if (botK1 === 'development')
      drawHookOrAnchorage(
        xBotL,
        yBot,
        +1,
        leftSpan.steel_bottom?.diameter ?? '3/4',
        'anchorage',
        'bottom',
        botToFace1 ? xBotR : undefined
      );

    // Bottom: N.i.2 (cara derecha) -> hacia -X, usa diámetro del tramo derecho
    if (botK2 === 'hook')
      drawHookOrAnchorage(
        xBotR,
        yBot,
        -1,
        rightSpan.steel_bottom?.diameter ?? '3/4',
        'hook',
        'bottom',
        botToFace2 ? xBotL : undefined
      );
    if (botK2 === 'development')
      drawHookOrAnchorage(
        xBotR,
        yBot,
        -1,
        rightSpan.steel_bottom?.diameter ?? '3/4',
        'anchorage',
        'bottom',
        botToFace2 ? xBotL : undefined
      );
  }

  // Extremos: nodo inicial (solo *.2) y nodo final (solo *.1)
  if (nodes.length >= 2 && spans.length >= 1) {
    // Nodo 1.2 (cara derecha del nodo 1) -> hacia -X, usa tramo 0
    {
      const n0 = nodes[0];
      const s0 = spans[0];
      const h0 = mToUnits(dev, clampNumber(s0.h ?? 0, 0));
      const xTop = (origins[0] ?? 0) + mToUnits(dev, clampNumber(n0.b2 ?? 0, 0));
      const yTop = y0 + h0 - coverU;
      const xBot = (origins[0] ?? 0) + mToUnits(dev, clampNumber(n0.a2 ?? 0, 0));
      const yBot2 = y0 + coverU;
      const kTop = nodeSteelKind(n0, 'top', 2);
      const kBot = nodeSteelKind(n0, 'bottom', 2);
      const xTopFace = (origins[0] ?? 0) + mToUnits(dev, clampNumber(n0.b1 ?? 0, 0));
      const xBotFace = (origins[0] ?? 0) + mToUnits(dev, clampNumber(n0.a1 ?? 0, 0));
      const topToFace = nodeToFaceEnabled(n0, 'top', 2);
      const botToFace = nodeToFaceEnabled(n0, 'bottom', 2);
      if (kTop === 'hook')
        drawHookOrAnchorage(xTop, yTop, -1, s0.steel_top?.diameter ?? '3/4', 'hook', 'top', topToFace ? xTopFace : undefined);
      if (kTop === 'development')
        drawHookOrAnchorage(
          xTop,
          yTop,
          -1,
          s0.steel_top?.diameter ?? '3/4',
          'anchorage',
          'top',
          topToFace ? xTopFace : undefined
        );
      if (kBot === 'hook')
        drawHookOrAnchorage(
          xBot,
          yBot2,
          -1,
          s0.steel_bottom?.diameter ?? '3/4',
          'hook',
          'bottom',
          botToFace ? xBotFace : undefined
        );
      if (kBot === 'development')
        drawHookOrAnchorage(
          xBot,
          yBot2,
          -1,
          s0.steel_bottom?.diameter ?? '3/4',
          'anchorage',
          'bottom',
          botToFace ? xBotFace : undefined
        );
    }

    // Nodo n.1 (cara izquierda del último nodo) -> hacia +X, usa último tramo
    {
      const lastNodeIdx = nodes.length - 1;
      const lastSpanIdx = spans.length - 1;
      const nn = nodes[lastNodeIdx];
      const ss = spans[lastSpanIdx];
      const hh = mToUnits(dev, clampNumber(ss.h ?? 0, 0));
      const xTop = (origins[lastNodeIdx] ?? 0) + mToUnits(dev, clampNumber(nn.b1 ?? 0, 0));
      const yTop = y0 + hh - coverU;
      const xBot = (origins[lastNodeIdx] ?? 0) + mToUnits(dev, clampNumber(nn.a1 ?? 0, 0));
      const yBot2 = y0 + coverU;
      const kTop = nodeSteelKind(nn, 'top', 1);
      const kBot = nodeSteelKind(nn, 'bottom', 1);
      const xTopFace = (origins[lastNodeIdx] ?? 0) + mToUnits(dev, clampNumber(nn.b2 ?? 0, 0));
      const xBotFace = (origins[lastNodeIdx] ?? 0) + mToUnits(dev, clampNumber(nn.a2 ?? 0, 0));
      const topToFace = nodeToFaceEnabled(nn, 'top', 1);
      const botToFace = nodeToFaceEnabled(nn, 'bottom', 1);
      if (kTop === 'hook')
        drawHookOrAnchorage(xTop, yTop, +1, ss.steel_top?.diameter ?? '3/4', 'hook', 'top', topToFace ? xTopFace : undefined);
      if (kTop === 'development')
        drawHookOrAnchorage(
          xTop,
          yTop,
          +1,
          ss.steel_top?.diameter ?? '3/4',
          'anchorage',
          'top',
          topToFace ? xTopFace : undefined
        );
      if (kBot === 'hook')
        drawHookOrAnchorage(
          xBot,
          yBot2,
          +1,
          ss.steel_bottom?.diameter ?? '3/4',
          'hook',
          'bottom',
          botToFace ? xBotFace : undefined
        );
      if (kBot === 'development')
        drawHookOrAnchorage(
          xBot,
          yBot2,
          +1,
          ss.steel_bottom?.diameter ?? '3/4',
          'anchorage',
          'bottom',
          botToFace ? xBotFace : undefined
        );
    }
  }

  ctx.restore();
}

type PolyPt = [number, number];

function uniqueSortedNumbers(values: number[]) {
  const s = new Set<number>();
  for (const v of values) {
    if (Number.isFinite(v)) s.add(v);
  }
  return Array.from(s).sort((a, b) => a - b);
}

function polySliceIntervals(poly: PolyPt[], x: number): Array<[number, number]> {
  const ys: number[] = [];
  const n = poly.length;
  if (n < 3) return [];

  for (let i = 0; i < n; i++) {
    const [x1, y1] = poly[i];
    const [x2, y2] = poly[(i + 1) % n];
    if (y1 !== y2) continue; // solo horizontales

    const xmin = Math.min(x1, x2);
    const xmax = Math.max(x1, x2);
    // x siempre se evalúa en el centro de un intervalo (nunca en vértices), así que estricto sirve y evita duplicados.
    if (x > xmin && x < xmax) ys.push(y1);
  }

  ys.sort((a, b) => a - b);
  const intervals: Array<[number, number]> = [];
  for (let i = 0; i + 1 < ys.length; i += 2) {
    const y0 = ys[i];
    const y1 = ys[i + 1];
    if (Number.isFinite(y0) && Number.isFinite(y1) && y1 > y0) intervals.push([y0, y1]);
  }
  return intervals;
}

function spanIndexAtX(dev: DevelopmentIn, x: number) {
  const origins = computeNodeOrigins(dev);
  const spans = dev.spans ?? [];
  const nodes = dev.nodes ?? [];
  for (let i = 0; i < spans.length; i++) {
    const a2 = mToUnits(dev, clampNumber(nodes[i]?.a2 ?? 0, 0));
    const L = mToUnits(dev, clampNumber(spans[i]?.L ?? 0, 0));
    const x0 = (origins[i] ?? 0) + a2;
    const x1 = x0 + L;
    const lo = Math.min(x0, x1);
    const hi = Math.max(x0, x1);
    if (x >= lo && x <= hi) return i;
  }

  // si cae fuera de tramos, el más cercano por centro
  let best = 0;
  let bestDist = Number.POSITIVE_INFINITY;
  for (let i = 0; i < spans.length; i++) {
    const mx = computeSpanMidX(dev, origins, i);
    const d = Math.abs(x - mx);
    if (d < bestDist) {
      bestDist = d;
      best = i;
    }
  }
  return best;
}

function nodeIndexAtX(dev: DevelopmentIn, x: number) {
  const origins = computeNodeOrigins(dev);
  const nodes = dev.nodes ?? [];
  for (let i = 0; i < nodes.length; i++) {
    const relA1 = mToUnits(dev, clampNumber(nodes[i]?.a1 ?? 0, 0));
    const relA2 = mToUnits(dev, clampNumber(nodes[i]?.a2 ?? 0, 0));
    const relB1 = mToUnits(dev, clampNumber(nodes[i]?.b1 ?? 0, 0));
    const relB2 = mToUnits(dev, clampNumber(nodes[i]?.b2 ?? 0, 0));
    const relMin = Math.min(relA1, relA2, relB1, relB2);
    const relMax = Math.max(relA1, relA2, relB1, relB2);
    const lo = (origins[i] ?? 0) + relMin;
    const hi = (origins[i] ?? 0) + relMax;
    if (x >= lo && x <= hi) return i;
  }
  return -1;
}

function spanBAtX(dev: DevelopmentIn, x: number) {
  const spans = dev.spans ?? [];
  if (!spans.length) return 1;
  const i = spanIndexAtX(dev, x);
  const b = clampNumber((spans[i] as any)?.b ?? 0.3, 0.3);
  return Math.max(1e-6, mToUnits(dev, b));
}

function setEmissiveOnObject(obj: THREE.Object3D, color: number, intensity: number) {
  obj.traverse((child: THREE.Object3D) => {
    const mesh = child as THREE.Mesh;
    const mat = mesh.material as any;
    const apply = (m: any) => {
      if (!m) return;
      if (m.emissive) m.emissive = new THREE.Color(color);
      if (typeof m.emissiveIntensity === 'number') m.emissiveIntensity = intensity;
    };
    if (Array.isArray(mat)) mat.forEach(apply);
    else apply(mat);
  });
}

function disposeObject3D(obj: THREE.Object3D) {
  obj.traverse((child: THREE.Object3D) => {
    const mesh = child as THREE.Mesh;
    if (mesh.geometry) mesh.geometry.dispose?.();
    const mat = mesh.material as any;
    if (Array.isArray(mat)) mat.forEach((m) => m?.dispose?.());
    else mat?.dispose?.();
  });
}

const ORTHO_FRUSTUM_SIZE = 220;

function setOrthoFrustum(camera: THREE.OrthographicCamera, aspect: number) {
  const a = Number.isFinite(aspect) && aspect > 1e-6 ? aspect : 1;
  camera.left = (-ORTHO_FRUSTUM_SIZE * a) / 2;
  camera.right = (ORTHO_FRUSTUM_SIZE * a) / 2;
  camera.top = ORTHO_FRUSTUM_SIZE / 2;
  camera.bottom = -ORTHO_FRUSTUM_SIZE / 2;
}

function fitCameraToObject(
  camera: THREE.PerspectiveCamera | THREE.OrthographicCamera,
  controls: OrbitControls,
  object: THREE.Object3D,
  viewport?: { w: number; h: number }
) {
  const box = new THREE.Box3().setFromObject(object);
  if (!Number.isFinite(box.min.x) || !Number.isFinite(box.max.x)) return;

  const size = new THREE.Vector3();
  box.getSize(size);
  const center = new THREE.Vector3();
  box.getCenter(center);

  const maxSize = Math.max(size.x, size.y, size.z, 1);

  controls.target.copy(center);

  if ((camera as any).isPerspectiveCamera) {
    const cam = camera as THREE.PerspectiveCamera;
    const fitHeightDistance = maxSize / (2 * Math.tan((cam.fov * Math.PI) / 360));
    const fitWidthDistance = fitHeightDistance / (cam.aspect || 1);
    const distance = 1.2 * Math.max(fitHeightDistance, fitWidthDistance);

    cam.position.set(center.x + distance, center.y + distance * 0.6, center.z + distance);
    cam.near = Math.max(0.01, distance / 2000);
    cam.far = Math.max(2000, distance * 40);
    cam.updateProjectionMatrix();

    // Permitir mucho más zoom-in.
    controls.minDistance = 0.01;
    controls.maxDistance = Math.max(50, distance * 40);
  } else {
    const cam = camera as THREE.OrthographicCamera;
    const w = viewport?.w ?? 1;
    const h = viewport?.h ?? 1;
    const aspect = w / Math.max(1, h);

    setOrthoFrustum(cam, aspect);

    const distance = 2.2 * maxSize;
    const dir = new THREE.Vector3(1, 0.6, 1).normalize();
    cam.position.copy(center.clone().add(dir.multiplyScalar(distance)));
    cam.near = Math.max(0.01, distance / 2000);
    cam.far = Math.max(2000, distance * 40);
    cam.lookAt(center);
    cam.updateMatrixWorld(true);

    // Ajustar zoom para encuadrar el bounding box proyectado en cámara.
    const corners = [
      new THREE.Vector3(box.min.x, box.min.y, box.min.z),
      new THREE.Vector3(box.min.x, box.min.y, box.max.z),
      new THREE.Vector3(box.min.x, box.max.y, box.min.z),
      new THREE.Vector3(box.min.x, box.max.y, box.max.z),
      new THREE.Vector3(box.max.x, box.min.y, box.min.z),
      new THREE.Vector3(box.max.x, box.min.y, box.max.z),
      new THREE.Vector3(box.max.x, box.max.y, box.min.z),
      new THREE.Vector3(box.max.x, box.max.y, box.max.z),
    ];

    const inv = cam.matrixWorldInverse.clone();
    let minX = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    for (const p of corners) {
      p.applyMatrix4(inv);
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y);
      maxY = Math.max(maxY, p.y);
    }

    const boxW = Math.max(1e-6, maxX - minX);
    const boxH = Math.max(1e-6, maxY - minY);
    const viewW = ORTHO_FRUSTUM_SIZE * aspect;
    const viewH = ORTHO_FRUSTUM_SIZE;
    const zoomFit = 0.90 * Math.min(viewW / boxW, viewH / boxH);
    cam.zoom = Math.min(200, Math.max(0.01, zoomFit));
    cam.updateProjectionMatrix();

    // Límites de zoom para ortográfica.
    (controls as any).minZoom = 0.01;
    (controls as any).maxZoom = 200;
  }

  controls.update();
}

function computeZoomBounds(dev: DevelopmentIn, preview: PreviewResponse, sel: Selection): Bounds | null {
  if (!preview || sel.kind === 'none') return null;
  const full = preview.bounds as Bounds;
  const dx = Math.max(full.max_x - full.min_x, 1e-6);
  const padX = dx * 0.05;

  const origins = computeNodeOrigins(dev);

  if (sel.kind === 'node') {
    const x = computeNodeMarkerX(dev, origins, sel.index);
    const half = Math.max(dx * 0.12, 1);
    return clampBounds(
      { min_x: x - half - padX, max_x: x + half + padX, min_y: full.min_y, max_y: full.max_y },
      full
    );
  }

  const r = computeSpanRangeX(dev, origins, sel.index);
  const half = Math.max((r.x1 - r.x0) / 2 + dx * 0.06, dx * 0.12);
  const mid = (r.x0 + r.x1) / 2;
  return clampBounds(
    { min_x: mid - half - padX, max_x: mid + half + padX, min_y: full.min_y, max_y: full.max_y },
    full
  );
}

function drawSelectionOverlay(canvas: HTMLCanvasElement, preview: PreviewResponse, dev: DevelopmentIn, sel: Selection, renderBounds: Bounds) {
  if (sel.kind === 'none') return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const rect = canvas.getBoundingClientRect();
  const cssW = Math.max(1, Math.round(rect.width));
  const cssH = Math.max(1, Math.round(rect.height));

  const origins = computeNodeOrigins(dev);
  const { toCanvas } = canvasMapper(renderBounds, cssW, cssH);

  ctx.save();
  ctx.globalCompositeOperation = 'source-over';

  if (sel.kind === 'node') {
    const x = computeNodeMarkerX(dev, origins, sel.index);
    const [cx0] = toCanvas(x, renderBounds.max_y);
    const [cx1] = toCanvas(x, renderBounds.min_y);
    const xpx = Math.round(cx0) + 0.5;
    ctx.strokeStyle = 'rgba(250, 204, 21, 0.55)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(xpx, 8);
    ctx.lineTo(xpx, cssH - 8);
    ctx.stroke();
  } else {
    const r = computeSpanRangeX(dev, origins, sel.index);
    const [x0] = toCanvas(r.x0, renderBounds.max_y);
    const [x1] = toCanvas(r.x1, renderBounds.max_y);
    const left = Math.min(x0, x1);
    const right = Math.max(x0, x1);
    ctx.fillStyle = 'rgba(250, 204, 21, 0.12)';
    ctx.strokeStyle = 'rgba(250, 204, 21, 0.35)';
    ctx.lineWidth = 2;
    ctx.fillRect(left, 6, Math.max(1, right - left), cssH - 12);
    ctx.strokeRect(left, 6, Math.max(1, right - left), cssH - 12);
  }

  ctx.restore();
}

function drawLabels(canvas: HTMLCanvasElement, data: PreviewResponse, dev: DevelopmentIn, renderBounds: Bounds) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const cssW = Math.max(1, Math.round(rect.width));
  const cssH = Math.max(1, Math.round(rect.height));
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const nodes = dev.nodes ?? [];
  const origins = computeNodeOrigins(dev);
  const { toCanvas } = canvasMapper(renderBounds, cssW, cssH);

  ctx.save();
  ctx.font = '12px ui-monospace, Menlo, Consolas, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Etiquetas N/T abajo, separadas del contorno
  const [, yBotPx0] = toCanvas(renderBounds.min_x, renderBounds.min_y);
  const yLabelPx = Math.min(cssH - 14, Math.round(yBotPx0) + 26);

  // Nodos (marca + punto + etiqueta)
  ctx.strokeStyle = 'rgba(250, 204, 21, 0.95)';
  ctx.lineWidth = 1;
  const tickLen = 22;
  const dotR = 3;
  for (let i = 0; i < origins.length; i++) {
    // En el contorno, el cap superior usa x=b1 y x=b2 (ver backend). Si b1=0, coincide con el quiebre vertical.
    const x = computeNodeMarkerX(dev, origins, i);
    const [txTop, tyTop] = toCanvas(x, renderBounds.max_y);
    // Marca corta (evita confundir con la sección)
    const xpx = Math.round(txTop) + 0.5;
    const ypx = Math.round(tyTop) + 0.5;
    ctx.beginPath();
    ctx.moveTo(xpx, ypx);
    ctx.lineTo(xpx, ypx + tickLen);
    ctx.stroke();

    // Punto del nodo
    ctx.fillStyle = 'rgba(250, 204, 21, 0.95)';
    ctx.beginPath();
    ctx.arc(Math.round(txTop) + 0.5, Math.round(tyTop) + 0.5, dotR, 0, Math.PI * 2);
    ctx.fill();

    // Etiqueta
    const xLabel = computeNodeLabelX(dev, origins, i);
    const [txLabel] = toCanvas(xLabel, renderBounds.max_y);
    ctx.fillStyle = 'rgba(250, 204, 21, 0.95)';
    ctx.fillText(`N${i + 1}`, txLabel, yLabelPx);
  }

  // Tramos (etiqueta)
  ctx.fillStyle = 'rgba(147, 197, 253, 0.95)';
  for (let i = 0; i < (dev.spans ?? []).length; i++) {
    const mx = computeSpanMidX(dev, origins, i);
    const [tx] = toCanvas(mx, renderBounds.max_y);
    ctx.fillText(`T${i + 1}`, tx, yLabelPx);
  }

  ctx.restore();
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export default function App() {
  const [tab, setTab] = useState<Tab>('concreto');
  const [previewView, setPreviewView] = useState<PreviewView>('2d');
  const [showLongitudinal, setShowLongitudinal] = useState(true);
  const [showStirrups, setShowStirrups] = useState(true);
  const [selection, setSelection] = useState<Selection>({ kind: 'none' });
  const [viewport, setViewport] = useState<Bounds | null>(null);
  const tabRef = useRef<Tab>(tab);
  const viewportRef = useRef<Bounds | null>(viewport);

  const [appCfg, setAppCfg] = useState<AppConfig>(DEFAULT_APP_CFG);
  const [dev, setDev] = useState<DevelopmentIn>(() => defaultDevelopment(DEFAULT_APP_CFG));

  const [jsonText, setJsonText] = useState(() => {
    return toJson(toBackendPayload(defaultDevelopment(DEFAULT_APP_CFG)));
  });

  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [showNT, setShowNT] = useState(true);
  const [zoomEnabled, setZoomEnabled] = useState(true);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'error' | null>(null);
  const [concretoLocked, setConcretoLocked] = useState(false);

  // Config global desde backend (fuente de verdad)
  const [backendCfg, setBackendCfg] = useState<BackendAppConfig | null>(null);
  const hookLegM = backendCfg?.hook_leg_m ?? 0.15;
  const [hookLegDraft, setHookLegDraft] = useState<string>('0.15');
  const hookLegSaveSeqRef = useRef(0);

  const [steelTextLayerDraft, setSteelTextLayerDraft] = useState<string>('');
  const [steelTextStyleDraft, setSteelTextStyleDraft] = useState<string>('');
  const [steelTextHeightDraft, setSteelTextHeightDraft] = useState<string>('');
  const [steelTextWidthDraft, setSteelTextWidthDraft] = useState<string>('');
  const [steelTextObliqueDraft, setSteelTextObliqueDraft] = useState<string>('');
  const [steelTextRotationDraft, setSteelTextRotationDraft] = useState<string>('');
  const steelTextSaveSeqRef = useRef(0);

  // Proyección de losa (config backend)
  const [slabProjOffsetDraft, setSlabProjOffsetDraft] = useState<string>('0.20');
  const [slabProjLayerDraft, setSlabProjLayerDraft] = useState<string>('');
  const slabProjSaveSeqRef = useRef(0);

  const [templateName, setTemplateName] = useState<string | null>(null);
  const [templateLayers, setTemplateLayers] = useState<string[]>([]);
  const [cascoLayer, setCascoLayer] = useState<string>('A-BEAM-CASCO');
  const [steelLayer, setSteelLayer] = useState<string>('A-REBAR-CORRIDO');
  const [drawSteel, setDrawSteel] = useState<boolean>(true);

  // Sección (verificación a lo largo del desarrollo)
  const sectionCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [sectionXU, setSectionXU] = useState<number>(0);
  const [savedCuts, setSavedCuts] = useState<Array<{ xU: number }>>([]);

  // Layout de acero en sección (E.060). Editable en UI, con fallback auto.
  const [steelLayoutDraft, setSteelLayoutDraft] = useState<string>('');
  const steelLayoutDraftDirtyRef = useRef(false);

  // Bastones: edición libre en inputs + normalización al salir (0.05m, 2 decimales)
  const [bastonLenEdits, setBastonLenEdits] = useState<Record<string, string>>({});

  // Estribos ABCR: edición por campo (mantener string mientras se escribe)
  const [stirrupsAbcrEdits, setStirrupsAbcrEdits] = useState<Record<string, string>>({});
  const snapBastonM = snap05m;
  const fmt2 = (v: number) => (Number.isFinite(v) ? v.toFixed(2) : '');

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const previewDrawRafRef = useRef<number | null>(null);
  const previewOverlayRafRef = useRef<number | null>(null);
  const [previewCanvasResizeTick, setPreviewCanvasResizeTick] = useState(0);

  const threeHostRef = useRef<HTMLDivElement | null>(null);
  const threeRef = useRef<ThreeSceneState | null>(null);
  const [threeProjection, setThreeProjection] = useState<ThreeProjection>('perspective');
  const dxfInputRef = useRef<HTMLInputElement | null>(null);
  const templateInputRef = useRef<HTMLInputElement | null>(null);

  const spansCols = (dev.spans ?? []).length;
  const nodesCols = (dev.nodes ?? []).length;

  useEffect(() => {
    viewportRef.current = viewport;
  }, [viewport]);

  // Asegurar redraw 2D cuando el canvas cambia de tamaño (evita “se queda en blanco” al cambiar tab/layout).
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let raf = 0;
    const ro = new ResizeObserver(() => {
      if (raf) window.cancelAnimationFrame(raf);
      raf = window.requestAnimationFrame(() => setPreviewCanvasResizeTick((t) => t + 1));
    });
    ro.observe(canvas);
    return () => {
      if (raf) window.cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  const pan2dRef = useRef({
    active: false,
    moved: false,
    pointerId: -1,
    startX: 0,
    startY: 0,
    lastX: 0,
    lastY: 0,
  });

  function focusGridCell(grid: 'spans' | 'nodes', row: number, col: number) {
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
  }

  function onGridKeyDown(
    e: React.KeyboardEvent<HTMLInputElement>,
    grid: 'spans' | 'nodes',
    row: number,
    col: number,
    maxRows: number,
    maxCols: number
  ) {
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
  }

  useEffect(() => {
    tabRef.current = tab;
  }, [tab]);

  // Mantener dev sincronizado con config general
  useEffect(() => {
    setDev((prev) => normalizeDev(prev, appCfg));
  }, [appCfg]);

  // Mantener editor JSON de layout sincronizado (sin pisar mientras se edita)
  useEffect(() => {
    if (steelLayoutDraftDirtyRef.current) return;
    try {
      const normalized = getSteelLayoutSettings(dev);
      setSteelLayoutDraft(toJson(normalized));
    } catch {
      // ignore
    }
  }, [(dev as any).steel_layout_settings]);

  const payloadInfo = useMemo(() => {
    const payload = toBackendPayload(dev);
    return { payload, error: null as string | null, warning: null as string | null };
  }, [dev]);

  const payload = payloadInfo.payload;

  // Payload mínimo para /preview: evita refetch cuando solo cambia acero.
  const previewPayloadInfo = useMemo(() => {
    const payload = toPreviewPayload(dev);
    const key = JSON.stringify(payload);
    return { payload, key };
  }, [dev]);

  // Mantener JSON sincronizado con formulario sin pisarlo al cambiar pestañas.
  useEffect(() => {
    if (tabRef.current === 'json') return;
    setJsonText(toJson(payload));
  }, [payload]);

  // Cargar estado persistido (si existe backend/DB). Ignora fallos.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const stored = await fetchState();
        if (cancelled) return;
        if (stored?.developments?.length) {
          const incoming = stored.developments[0];
          const nextCfg: AppConfig = {
            d: clampNumber(incoming.d ?? DEFAULT_APP_CFG.d, DEFAULT_APP_CFG.d),
            unit_scale: clampNumber(incoming.unit_scale ?? DEFAULT_APP_CFG.unit_scale, DEFAULT_APP_CFG.unit_scale),
            x0: clampNumber(incoming.x0 ?? DEFAULT_APP_CFG.x0, DEFAULT_APP_CFG.x0),
            y0: clampNumber(incoming.y0 ?? DEFAULT_APP_CFG.y0, DEFAULT_APP_CFG.y0),
            recubrimiento: clampNumber(
              (incoming as any).recubrimiento
                ?? (incoming as any).steel_cover_top
                ?? (incoming as any).steel_cover_bottom
                ?? DEFAULT_APP_CFG.recubrimiento,
              DEFAULT_APP_CFG.recubrimiento
            ),
            baston_Lc: clampNumber(
              (incoming as any).baston_Lc ?? (incoming as any).bastonLc ?? DEFAULT_APP_CFG.baston_Lc,
              DEFAULT_APP_CFG.baston_Lc
            ),
          };
          setAppCfg(nextCfg);
          setDev(normalizeDev(incoming, nextCfg));
          setJsonText(toJson(stored));
        }
      } catch {
        // ignore
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // Intentar cargar info de plantilla si ya existe en backend.
  useEffect(() => {
    (async () => {
      try {
        const info = await getTemplateDxf();
        setTemplateName(info.filename);
        setTemplateLayers(info.layers ?? []);
      } catch {
        // ignore
      }
    })();
  }, []);

  // Guardar estado persistido (debounced). Ignora fallos.
  useEffect(() => {
    setSaveStatus('saving');
    const t = window.setTimeout(async () => {
      try {
        await saveState(payload);
        setSaveStatus('saved');
        // Ocultar mensaje después de 2 segundos
        setTimeout(() => setSaveStatus(null), 2000);
      } catch (err) {
        setSaveStatus('error');
        console.error('Error al guardar:', err);
        // Ocultar mensaje de error después de 4 segundos
        setTimeout(() => setSaveStatus(null), 4000);
      }
    }, 600);
    return () => window.clearTimeout(t);
  }, [payload]);

  // Cargar config global (gancho, etc). Ignora fallos.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const cfg = await fetchConfig();
        if (cancelled) return;
        if (cfg && typeof cfg.hook_leg_m === 'number' && Number.isFinite(cfg.hook_leg_m)) setBackendCfg(cfg);
      } catch {
        // ignore
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (backendCfg && typeof backendCfg.hook_leg_m === 'number' && Number.isFinite(backendCfg.hook_leg_m)) {
      setHookLegDraft(String(backendCfg.hook_leg_m));
    }
  }, [backendCfg?.hook_leg_m]);

  // Sync drafts desde backend (vacío = null => usar plantilla)
  useEffect(() => {
    setSteelTextLayerDraft(String(backendCfg?.steel_text_layer ?? ''));
    setSteelTextStyleDraft(String(backendCfg?.steel_text_style ?? ''));
    setSteelTextHeightDraft(backendCfg?.steel_text_height == null ? '' : String(backendCfg.steel_text_height));
    setSteelTextWidthDraft(backendCfg?.steel_text_width == null ? '' : String(backendCfg.steel_text_width));
    setSteelTextObliqueDraft(backendCfg?.steel_text_oblique == null ? '' : String(backendCfg.steel_text_oblique));
    setSteelTextRotationDraft(backendCfg?.steel_text_rotation == null ? '' : String(backendCfg.steel_text_rotation));

    // Proyección de losa
    setSlabProjOffsetDraft(String(backendCfg?.slab_proj_offset_m ?? 0.2));
    setSlabProjLayerDraft(String(backendCfg?.slab_proj_layer ?? ''));
  }, [
    backendCfg?.steel_text_layer,
    backendCfg?.steel_text_style,
    backendCfg?.steel_text_height,
    backendCfg?.steel_text_width,
    backendCfg?.steel_text_oblique,
    backendCfg?.steel_text_rotation,
    backendCfg?.slab_proj_offset_m,
    backendCfg?.slab_proj_layer,
  ]);

  // Autosave (debounced) al modificar L6 gancho en Config.
  useEffect(() => {
    if (!backendCfg) return;
    const current = backendCfg.hook_leg_m;
    const next = clampNumber(hookLegDraft, current ?? 0.15);
    if (!Number.isFinite(next) || !Number.isFinite(current)) return;
    if (Math.abs(next - current) < 1e-9) return;

    const seq = ++hookLegSaveSeqRef.current;
    const t = window.setTimeout(async () => {
      try {
        const cfg = await updateConfig({ hook_leg_m: next });
        // Evitar condiciones de carrera si el usuario siguió editando.
        if (hookLegSaveSeqRef.current !== seq) return;
        setBackendCfg(cfg);
      } catch (e) {
        // Silencioso por requisito (sin botón ni mensajes); dejar rastro en consola.
        console.warn('No se pudo guardar hook_leg_m', e);
      }
    }, 500);

    return () => window.clearTimeout(t);
  }, [hookLegDraft, backendCfg]);

  // Autosave (debounced) al modificar formato de texto de acero.
  useEffect(() => {
    if (!backendCfg) return;

    const normText = (v: string) => {
      const s = String(v ?? '').trim();
      return s ? s : null;
    };
    const normNum = (v: string) => {
      const n = Number.parseFloat(String(v ?? '').trim());
      return Number.isFinite(n) ? n : null;
    };

    const patch: Partial<BackendAppConfig> = {};
    const nextLayer = normText(steelTextLayerDraft);
    const nextStyle = normText(steelTextStyleDraft);
    const nextHeight = normNum(steelTextHeightDraft);
    const nextWidth = normNum(steelTextWidthDraft);
    const nextOblique = normNum(steelTextObliqueDraft);
    const nextRotation = normNum(steelTextRotationDraft);

    if ((backendCfg.steel_text_layer ?? null) !== nextLayer) patch.steel_text_layer = nextLayer;
    if ((backendCfg.steel_text_style ?? null) !== nextStyle) patch.steel_text_style = nextStyle;
    if ((backendCfg.steel_text_height ?? null) !== nextHeight) patch.steel_text_height = nextHeight;
    if ((backendCfg.steel_text_width ?? null) !== nextWidth) patch.steel_text_width = nextWidth;
    if ((backendCfg.steel_text_oblique ?? null) !== nextOblique) patch.steel_text_oblique = nextOblique;
    if ((backendCfg.steel_text_rotation ?? null) !== nextRotation) patch.steel_text_rotation = nextRotation;

    if (!Object.keys(patch).length) return;

    const seq = ++steelTextSaveSeqRef.current;
    const t = window.setTimeout(async () => {
      try {
        const cfg = await updateConfig(patch);
        if (steelTextSaveSeqRef.current !== seq) return;
        setBackendCfg(cfg);
      } catch (e) {
        console.warn('No se pudo guardar steel_text_*', e);
      }
    }, 500);

    return () => window.clearTimeout(t);
  }, [
    steelTextLayerDraft,
    steelTextStyleDraft,
    steelTextHeightDraft,
    steelTextWidthDraft,
    steelTextObliqueDraft,
    steelTextRotationDraft,
    backendCfg,
  ]);

  // Autosave (debounced) al modificar proyección de losa.
  useEffect(() => {
    if (!backendCfg) return;

    const normText = (v: string) => {
      const s = String(v ?? '').trim();
      return s ? s : null;
    };

    const currentOffset = typeof backendCfg.slab_proj_offset_m === 'number' && Number.isFinite(backendCfg.slab_proj_offset_m) ? backendCfg.slab_proj_offset_m : 0.2;
    const nextOffsetRaw = Number.parseFloat(String(slabProjOffsetDraft ?? '').trim().replace(',', '.'));
    const nextOffset = Number.isFinite(nextOffsetRaw) ? Math.max(0, nextOffsetRaw) : currentOffset;
    const nextLayer = normText(slabProjLayerDraft);

    const patch: Partial<BackendAppConfig> = {};
    if (Math.abs(nextOffset - currentOffset) > 1e-9) patch.slab_proj_offset_m = nextOffset;
    if ((backendCfg.slab_proj_layer ?? null) !== nextLayer) patch.slab_proj_layer = nextLayer;
    if (!Object.keys(patch).length) return;

    const seq = ++slabProjSaveSeqRef.current;
    const t = window.setTimeout(async () => {
      try {
        const cfg = await updateConfig(patch);
        if (slabProjSaveSeqRef.current !== seq) return;
        setBackendCfg(cfg);
      } catch (e) {
        console.warn('No se pudo guardar slab_proj_*', e);
      }
    }, 500);

    return () => window.clearTimeout(t);
  }, [slabProjOffsetDraft, slabProjLayerDraft, backendCfg]);

  // Preview
  useEffect(() => {
    let cancelled = false;

    (async () => {
      setBusy(true);
      setError(null);
      setWarning(null);
      try {
        const data = await fetchPreview(previewPayloadInfo.payload);
        if (cancelled) return;
        setPreview(data);
      } catch (e: any) {
        if (cancelled) return;
        setError(e?.message ?? String(e));
        setPreview(null);
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [previewPayloadInfo.key]);

  // Render del canvas (sin refetch) para que el toggle N/T responda inmediato
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (previewDrawRafRef.current != null) {
      window.cancelAnimationFrame(previewDrawRafRef.current);
      previewDrawRafRef.current = null;
    }
    if (previewOverlayRafRef.current != null) {
      window.cancelAnimationFrame(previewOverlayRafRef.current);
      previewOverlayRafRef.current = null;
    }

    const rect = canvas.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) return;

    previewDrawRafRef.current = window.requestAnimationFrame(() => {
      const renderBounds = (viewport ?? (preview?.bounds as Bounds | undefined)) ?? null;
      drawPreview(canvas, preview, renderBounds);
      if (preview && renderBounds) drawSelectionOverlay(canvas, preview, dev, selection, renderBounds);

      const dev0 = previewPayloadInfo.payload.developments?.[0];
      if (preview && dev0 && showNT && renderBounds) drawLabels(canvas, preview, dev0, renderBounds);

      // Dibujar acero en un segundo frame para evitar bloquear la primera pintura.
      if (preview && renderBounds && (showLongitudinal || showStirrups || tab === 'acero')) {
        previewOverlayRafRef.current = window.requestAnimationFrame(() => {
          try {
            // En Concreto no debe verse el acero: el overlay de acero solo se dibuja en la pestaña Acero.
            if (tab === 'acero' && (showLongitudinal || showStirrups)) {
              drawSteelOverlay(canvas, preview, dev, renderBounds, appCfg.recubrimiento, hookLegM, { showLongitudinal, showStirrups });
            }
            if (tab === 'acero') drawCutMarker2D(canvas, preview, renderBounds, sectionXU);
          } catch (e) {
            console.warn('Error dibujando overlay 2D de acero', e);
          }
        });
      }
    });

    return () => {
      if (previewDrawRafRef.current != null) {
        window.cancelAnimationFrame(previewDrawRafRef.current);
        previewDrawRafRef.current = null;
      }
      if (previewOverlayRafRef.current != null) {
        window.cancelAnimationFrame(previewOverlayRafRef.current);
        previewOverlayRafRef.current = null;
      }
    };
  }, [
    preview,
    showNT,
    selection,
    viewport,
    dev,
    tab,
    appCfg.recubrimiento,
    hookLegM,
    sectionXU,
    showLongitudinal,
    showStirrups,
    previewPayloadInfo.key,
    previewCanvasResizeTick,
  ]);

  // Rango X del desarrollo en unidades (considera top y bottom, igual que overlay)
  const sectionXRangeU = useMemo(() => {
    const spans = dev.spans ?? [];
    const nodes = dev.nodes ?? [];
    const origins = computeNodeOrigins(dev);
    let xmin = Number.POSITIVE_INFINITY;
    let xmax = Number.NEGATIVE_INFINITY;
    for (let i = 0; i < spans.length; i++) {
      const span = spans[i];
      const Lm = clampNumber(span?.L ?? 0, 0);
      if (!span || !(Lm > 0)) continue;

      const a2_i = mToUnits(dev, clampNumber(nodes[i]?.a2 ?? 0, 0));
      const xBot0 = (origins[i] ?? 0) + a2_i;
      const xBot1 = xBot0 + mToUnits(dev, Lm);

      const b2_i = mToUnits(dev, clampNumber(nodes[i]?.b2 ?? 0, 0));
      const b1_ip1 = mToUnits(dev, clampNumber(nodes[i + 1]?.b1 ?? 0, 0));
      const xTop0 = (origins[i] ?? 0) + b2_i;
      const xTop1 = (origins[i + 1] ?? 0) + b1_ip1;

      xmin = Math.min(xmin, xBot0, xBot1, xTop0, xTop1);
      xmax = Math.max(xmax, xBot0, xBot1, xTop0, xTop1);
    }

    if (!Number.isFinite(xmin) || !Number.isFinite(xmax) || !(xmax > xmin)) {
      const x0 = clampNumber(dev.x0 ?? 0, 0);
      return { xmin: x0, xmax: x0 + mToUnits(dev, 1) };
    }
    return { xmin, xmax };
  }, [dev]);

  const sectionInfo = useMemo(() => {
    const spans = dev.spans ?? [];
    const si = spans.length ? Math.max(0, Math.min(spanIndexAtX(dev, sectionXU), spans.length - 1)) : 0;
    const xm = sectionXU / (dev.unit_scale ?? 2);
    return { spanIndex: si, x_m: xm };
  }, [dev, sectionXU]);

  // Corte A: siempre en el X con mayor cantidad de varillas longitudinales de acero corrido.
  // (Se mantiene como primer elemento de savedCuts y no debe desaparecer.)
  const defaultCutAXU = useMemo(() => {
    const spans = dev.spans ?? [];
    const nodes = dev.nodes ?? [];
    const origins = computeNodeOrigins(dev);

    const rangeMid = (sectionXRangeU.xmin + sectionXRangeU.xmax) / 2;
    const coverM = clampNumber((dev as any).recubrimiento ?? appCfg.recubrimiento ?? 0.04, 0.04);
    const bastonLcU = mToUnits(dev, clampNumber((dev as any).baston_Lc ?? 0.5, 0.5));

    const resolvedLenM = (span: any, cfg: BastonCfg, field: 'L1_m' | 'L2_m' | 'L3_m', fallbackM: number) => {
      const v = (cfg as any)[field];
      const n = typeof v === 'number' ? v : NaN;
      const out = Number.isFinite(n) && n > 0 ? n : fallbackM;
      const snapped = snap05m(out);
      return Math.min(clampNumber(span?.L ?? 0, 0), Math.max(0, snapped));
    };

    const getBastonCfg = (span: any, side: 'top' | 'bottom', zone: 'z1' | 'z2' | 'z3'): BastonCfg => {
      const b = (span as any)?.bastones ?? {};
      const s = (side === 'top' ? b.top : b.bottom) ?? {};
      const z = (s as any)[zone] ?? {};
      return normalizeBastonCfg(z);
    };

    const activeBastonCountsAtX = (spanIndex: number, span: any, xU: number, side: 'top' | 'bottom') => {
      const Lm = clampNumber(span?.L ?? 0, 0);
      const defaultLenM = Lm / 5;
      const defaultL3M = Lm / 3;

      const a2_i = mToUnits(dev, clampNumber(nodes[spanIndex]?.a2 ?? 0, 0));
      const xBot0 = (origins[spanIndex] ?? 0) + a2_i;
      const xBot1 = xBot0 + mToUnits(dev, Lm);

      const b2_i = mToUnits(dev, clampNumber(nodes[spanIndex]?.b2 ?? 0, 0));
      const b1_ip1 = mToUnits(dev, clampNumber(nodes[spanIndex + 1]?.b1 ?? 0, 0));
      const xTop0 = (origins[spanIndex] ?? 0) + b2_i;
      const xTop1 = (origins[spanIndex + 1] ?? 0) + b1_ip1;

      const xa = side === 'top' ? Math.min(xTop0, xTop1) : Math.min(xBot0, xBot1);
      const xb = side === 'top' ? Math.max(xTop0, xTop1) : Math.max(xBot0, xBot1);
      const x = Math.min(xb, Math.max(xa, xU));
      let l1 = 0;
      let l2 = 0;

      // Z1
      {
        const cfg = getBastonCfg(span, side, 'z1');
        const q1 = Math.max(1, Math.min(3, Math.round(cfg.l1_qty ?? 1)));
        const q2 = Math.max(1, Math.min(3, Math.round(cfg.l2_qty ?? 1)));
        if (cfg.l1_enabled || cfg.l2_enabled) {
          const L3_u = mToUnits(dev, resolvedLenM(span, cfg, 'L3_m', defaultL3M));
          const x1 = Math.min(xb, xa + L3_u);
          if (cfg.l1_enabled && x >= xa && x <= x1) l1 += q1;
          const x1Inner = x1 - bastonLcU;
          if (cfg.l2_enabled && x1Inner > xa + 1e-6 && x >= xa && x <= x1Inner) l2 += q2;
        }
      }

      // Z2
      {
        const cfg = getBastonCfg(span, side, 'z2');
        const q1 = Math.max(1, Math.min(3, Math.round(cfg.l1_qty ?? 1)));
        const q2 = Math.max(1, Math.min(3, Math.round(cfg.l2_qty ?? 1)));
        if (cfg.l1_enabled || cfg.l2_enabled) {
          const L1_u = mToUnits(dev, resolvedLenM(span, cfg, 'L1_m', defaultLenM));
          const L2_u = mToUnits(dev, resolvedLenM(span, cfg, 'L2_m', defaultLenM));
          const x0 = xa + L1_u;
          const x1 = xb - L2_u;
          if (cfg.l1_enabled && x1 > x0 + 1e-6 && x >= x0 && x <= x1) l1 += q1;
          const x0Inner = x0 + bastonLcU;
          const x1Inner = x1 - bastonLcU;
          if (cfg.l2_enabled && x1Inner > x0Inner + 1e-6 && x >= x0Inner && x <= x1Inner) l2 += q2;
        }
      }

      // Z3
      {
        const cfg = getBastonCfg(span, side, 'z3');
        const q1 = Math.max(1, Math.min(3, Math.round(cfg.l1_qty ?? 1)));
        const q2 = Math.max(1, Math.min(3, Math.round(cfg.l2_qty ?? 1)));
        if (cfg.l1_enabled || cfg.l2_enabled) {
          const L3_u = mToUnits(dev, resolvedLenM(span, cfg, 'L3_m', defaultL3M));
          const x0 = Math.max(xa, xb - L3_u);
          if (cfg.l1_enabled && x >= x0 && x <= xb) l1 += q1;
          const x0Inner = x0 + bastonLcU;
          if (cfg.l2_enabled && xb > x0Inner + 1e-6 && x >= x0Inner && x <= xb) l2 += q2;
        }
      }

      return { l1: Math.max(0, l1), l2: Math.max(0, l2) };
    };

    const totalLongBarsAtX = (xU: number) => {
      if (!spans.length) return 0;
      const si = Math.max(0, Math.min(spanIndexAtX(dev, xU), spans.length - 1));
      const span: any = spans[si];
      if (!span) return 0;

      let total = 0;
      for (const face of ['top', 'bottom'] as const) {
        const res: any = computeSpanSectionLayoutWithBastonesCm({ dev, span, cover_m: coverM, face });
        if (!res?.ok) continue;

        total += (res.main_bars_cm?.length ?? 0);

        const active = activeBastonCountsAtX(si, span, xU, face);
        const l1PoolLen = (res.baston_l1_bars_cm?.length ?? 0);
        const l2PoolLen = (res.baston_l2_bars_cm?.length ?? 0);
        total += Math.min(active.l1, l1PoolLen);
        total += Math.min(active.l2, l2PoolLen);
      }

      return total;
    };

    const clampToRange = (x: number) => Math.min(sectionXRangeU.xmax, Math.max(sectionXRangeU.xmin, x));
    const addBreakpointsForFace = (out: number[], spanIndex: number, span: any, side: 'top' | 'bottom') => {
      const Lm = clampNumber(span?.L ?? 0, 0);
      if (!(Lm > 0)) return;

      const a2_i = mToUnits(dev, clampNumber(nodes[spanIndex]?.a2 ?? 0, 0));
      const xBot0 = (origins[spanIndex] ?? 0) + a2_i;
      const xBot1 = xBot0 + mToUnits(dev, Lm);

      const b2_i = mToUnits(dev, clampNumber(nodes[spanIndex]?.b2 ?? 0, 0));
      const b1_ip1 = mToUnits(dev, clampNumber(nodes[spanIndex + 1]?.b1 ?? 0, 0));
      const xTop0 = (origins[spanIndex] ?? 0) + b2_i;
      const xTop1 = (origins[spanIndex + 1] ?? 0) + b1_ip1;

      const xa = side === 'top' ? Math.min(xTop0, xTop1) : Math.min(xBot0, xBot1);
      const xb = side === 'top' ? Math.max(xTop0, xTop1) : Math.max(xBot0, xBot1);
      out.push(clampToRange(xa), clampToRange(xb));

      const defaultLenM = Lm / 5;
      const defaultL3M = Lm / 3;

      // Z1
      {
        const cfg = getBastonCfg(span, side, 'z1');
        if (cfg.l1_enabled || cfg.l2_enabled) {
          const L3_u = mToUnits(dev, resolvedLenM(span, cfg, 'L3_m', defaultL3M));
          const x1 = Math.min(xb, xa + L3_u);
          out.push(clampToRange(x1));
          out.push(clampToRange(x1 - bastonLcU));
        }
      }

      // Z2
      {
        const cfg = getBastonCfg(span, side, 'z2');
        if (cfg.l1_enabled || cfg.l2_enabled) {
          const L1_u = mToUnits(dev, resolvedLenM(span, cfg, 'L1_m', defaultLenM));
          const L2_u = mToUnits(dev, resolvedLenM(span, cfg, 'L2_m', defaultLenM));
          const x0 = xa + L1_u;
          const x1 = xb - L2_u;
          out.push(clampToRange(x0), clampToRange(x1));
          out.push(clampToRange(x0 + bastonLcU), clampToRange(x1 - bastonLcU));
        }
      }

      // Z3
      {
        const cfg = getBastonCfg(span, side, 'z3');
        if (cfg.l1_enabled || cfg.l2_enabled) {
          const L3_u = mToUnits(dev, resolvedLenM(span, cfg, 'L3_m', defaultL3M));
          const x0 = Math.max(xa, xb - L3_u);
          out.push(clampToRange(x0));
          out.push(clampToRange(x0 + bastonLcU));
        }
      }
    };

    const candidates: number[] = [];
    candidates.push(sectionXRangeU.xmin, sectionXRangeU.xmax, clampToRange(rangeMid));

    for (let i = 0; i < spans.length; i++) {
      const span: any = spans[i];
      const Lm = clampNumber(span?.L ?? 0, 0);
      if (!span || !(Lm > 0)) continue;

      const a2_i = mToUnits(dev, clampNumber(nodes[i]?.a2 ?? 0, 0));
      const xBot0 = (origins[i] ?? 0) + a2_i;
      const xBot1 = xBot0 + mToUnits(dev, Lm);
      const b2_i = mToUnits(dev, clampNumber(nodes[i]?.b2 ?? 0, 0));
      const b1_ip1 = mToUnits(dev, clampNumber(nodes[i + 1]?.b1 ?? 0, 0));
      const xTop0 = (origins[i] ?? 0) + b2_i;
      const xTop1 = (origins[i + 1] ?? 0) + b1_ip1;

      const spanLo = clampToRange(Math.min(xBot0, xBot1, xTop0, xTop1));
      const spanHi = clampToRange(Math.max(xBot0, xBot1, xTop0, xTop1));
      const spanMid = (spanLo + spanHi) / 2;
      candidates.push(spanLo, spanHi, spanMid);

      addBreakpointsForFace(candidates, i, span, 'top');
      addBreakpointsForFace(candidates, i, span, 'bottom');
    }

    const bp = uniqueSortedNumbers(candidates);
    const mids: number[] = [];
    for (let i = 0; i + 1 < bp.length; i++) {
      const a = bp[i];
      const b = bp[i + 1];
      if (!(b > a)) continue;
      mids.push((a + b) / 2);
    }

    const evals = uniqueSortedNumbers([...bp, ...mids]).map(clampToRange);
    let bestX = clampToRange(rangeMid);
    let bestN = -1;
    for (const x of evals) {
      const n = totalLongBarsAtX(x);
      if (n > bestN || (n === bestN && x < bestX)) {
        bestN = n;
        bestX = x;
      }
    }

    return Number.isFinite(bestX) ? bestX : clampToRange(rangeMid);
  }, [dev, appCfg.recubrimiento, sectionXRangeU]);

  // Center cursor when dev changes
  useEffect(() => {
    const { xmin, xmax } = sectionXRangeU;
    const mid = (xmin + xmax) / 2;
    setSectionXU(mid);
  }, [sectionXRangeU]);

  // Mantener siempre el Corte A (savedCuts[0]) en defaultCutAXU.
  useEffect(() => {
    setSavedCuts((prev) => {
      const xA = defaultCutAXU;
      if (!Number.isFinite(xA)) return prev;
      if (!prev.length) return [{ xU: xA }];
      if (Math.abs(prev[0].xU - xA) < 1e-6) return prev;
      return [{ xU: xA }, ...prev.slice(1)];
    });
  }, [defaultCutAXU]);

  // Dibuja sección para verificación (en base a sectionXU)
  useEffect(() => {
    const canvas = sectionCanvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const cssW = Math.max(1, Math.round(rect.width));
    const cssH = Math.max(1, Math.round(rect.height));
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const desiredW = Math.max(1, Math.round(cssW * dpr));
    const desiredH = Math.max(1, Math.round(cssH * dpr));
    if (canvas.width !== desiredW) canvas.width = desiredW;
    if (canvas.height !== desiredH) canvas.height = desiredH;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);

    const spans = dev.spans ?? [];
    const nodes = dev.nodes ?? [];
    if (!spans.length) {
      ctx.fillStyle = 'rgba(229,231,235,0.6)';
      ctx.font = '12px ui-monospace, Menlo, Consolas, monospace';
      ctx.fillText('Sin tramos', 12, 18);
      ctx.restore();
      return;
    }

    const origins = computeNodeOrigins(dev);
    const si = Math.max(0, Math.min(spanIndexAtX(dev, sectionXU), spans.length - 1));
    const span = spans[si];
    if (!span) {
      ctx.restore();
      return;
    }

    const coverM = clampNumber((dev as any).recubrimiento ?? appCfg.recubrimiento ?? 0.04, 0.04);
    const bCm = clampNumber((span as any).b ?? 0.3, 0.3) * 100;
    const hCm = clampNumber(span.h ?? 0.5, 0.5) * 100;
    const slabOffsetM = clampNumber(backendCfg?.slab_proj_offset_m ?? 0.2, 0.2);
    const slabOffsetCm = Math.max(0, slabOffsetM * 100);
    const yTopCm = hCm;
    const ySlabCm = Math.max(0, hCm - slabOffsetCm);
    const slabExtraCm = bCm * 0.5;
    const slabHalfZCm = bCm / 2 + slabExtraCm;

    // Determine active baston qty at X (por cara)
    const bastonLcU = mToUnits(dev, clampNumber((dev as any).baston_Lc ?? 0.5, 0.5));
    const resolvedLenM = (cfg: BastonCfg, field: 'L1_m' | 'L2_m' | 'L3_m', fallbackM: number) => {
      const v = (cfg as any)[field];
      const n = typeof v === 'number' ? v : NaN;
      const out = Number.isFinite(n) && n > 0 ? n : fallbackM;
      const snapped = snap05m(out);
      return Math.min(clampNumber(span.L ?? 0, 0), Math.max(0, snapped));
    };

    const getBastonCfg = (side: 'top' | 'bottom', zone: 'z1' | 'z2' | 'z3'): BastonCfg => {
      const b = (span as any).bastones ?? {};
      const s = (side === 'top' ? b.top : b.bottom) ?? {};
      const z = (s as any)[zone] ?? {};
      return normalizeBastonCfg(z);
    };

    const activeBastonCountsAtX = (side: 'top' | 'bottom') => {
      const Lm = clampNumber(span.L ?? 0, 0);
      const defaultLenM = Lm / 5;
      const defaultL3M = Lm / 3;

      const a2_i = mToUnits(dev, clampNumber(nodes[si]?.a2 ?? 0, 0));
      const xBot0 = (origins[si] ?? 0) + a2_i;
      const xBot1 = xBot0 + mToUnits(dev, Lm);

      const b2_i = mToUnits(dev, clampNumber(nodes[si]?.b2 ?? 0, 0));
      const b1_ip1 = mToUnits(dev, clampNumber(nodes[si + 1]?.b1 ?? 0, 0));
      const xTop0 = (origins[si] ?? 0) + b2_i;
      const xTop1 = (origins[si + 1] ?? 0) + b1_ip1;

      const xa = side === 'top' ? Math.min(xTop0, xTop1) : Math.min(xBot0, xBot1);
      const xb = side === 'top' ? Math.max(xTop0, xTop1) : Math.max(xBot0, xBot1);
      const x = Math.min(xb, Math.max(xa, sectionXU));
      let l1 = 0;
      let l2 = 0;

      // Z1
      {
        const cfg = getBastonCfg(side, 'z1');
        const q1 = Math.max(1, Math.min(3, Math.round(cfg.l1_qty ?? 1)));
        const q2 = Math.max(1, Math.min(3, Math.round(cfg.l2_qty ?? 1)));
        if (cfg.l1_enabled || cfg.l2_enabled) {
          const L3_u = mToUnits(dev, resolvedLenM(cfg, 'L3_m', defaultL3M));
          const x1 = Math.min(xb, xa + L3_u);
          if (cfg.l1_enabled && x >= xa && x <= x1) l1 += q1;
          const x1Inner = x1 - bastonLcU;
          if (cfg.l2_enabled && x1Inner > xa + 1e-6 && x >= xa && x <= x1Inner) l2 += q2;
        }
      }

      // Z2
      {
        const cfg = getBastonCfg(side, 'z2');
        const q1 = Math.max(1, Math.min(3, Math.round(cfg.l1_qty ?? 1)));
        const q2 = Math.max(1, Math.min(3, Math.round(cfg.l2_qty ?? 1)));
        if (cfg.l1_enabled || cfg.l2_enabled) {
          const L1_u = mToUnits(dev, resolvedLenM(cfg, 'L1_m', defaultLenM));
          const L2_u = mToUnits(dev, resolvedLenM(cfg, 'L2_m', defaultLenM));
          const x0 = xa + L1_u;
          const x1 = xb - L2_u;
          if (cfg.l1_enabled && x1 > x0 + 1e-6 && x >= x0 && x <= x1) l1 += q1;
          const x0Inner = x0 + bastonLcU;
          const x1Inner = x1 - bastonLcU;
          if (cfg.l2_enabled && x1Inner > x0Inner + 1e-6 && x >= x0Inner && x <= x1Inner) l2 += q2;
        }
      }

      // Z3
      {
        const cfg = getBastonCfg(side, 'z3');
        const q1 = Math.max(1, Math.min(3, Math.round(cfg.l1_qty ?? 1)));
        const q2 = Math.max(1, Math.min(3, Math.round(cfg.l2_qty ?? 1)));
        if (cfg.l1_enabled || cfg.l2_enabled) {
          const L3_u = mToUnits(dev, resolvedLenM(cfg, 'L3_m', defaultL3M));
          const x0 = Math.max(xa, xb - L3_u);
          if (cfg.l1_enabled && x >= x0 && x <= xb) l1 += q1;
          const x0Inner = x0 + bastonLcU;
          if (cfg.l2_enabled && xb > x0Inner + 1e-6 && x >= x0Inner && x <= xb) l2 += q2;
        }
      }

      return { l1: Math.max(0, l1), l2: Math.max(0, l2) };
    };

    type SteelPt = { y_cm: number; z_cm: number; db_cm: number; fill: string };
    const pts: SteelPt[] = [];

    const pushFace = (face: 'top' | 'bottom') => {
      const res = computeSpanSectionLayoutWithBastonesCm({ dev, span, cover_m: coverM, face });
      if (!res.ok) return;

      const active = activeBastonCountsAtX(face);
      const l1Pool = (res as any).baston_l1_bars_cm ?? [];
      const l2Pool = (res as any).baston_l2_bars_cm ?? [];
      const activeL1 = Math.min(active.l1, l1Pool.length);
      const activeL2 = Math.min(active.l2, l2Pool.length);
      for (const p of res.main_bars_cm) pts.push({ ...p, db_cm: res.main_db_cm, fill: 'rgba(250, 204, 21, 0.95)' });
      for (const p of l1Pool.slice(0, activeL1)) pts.push({ ...p, db_cm: res.baston_db_cm || res.main_db_cm, fill: 'rgba(34, 197, 94, 0.95)' });
      for (const p of l2Pool.slice(0, activeL2)) pts.push({ ...p, db_cm: res.baston_db_cm || res.main_db_cm, fill: 'rgba(6, 182, 212, 0.95)' });
    };

    pushFace('top');
    pushFace('bottom');

    if (!pts.length) {
      ctx.fillStyle = 'rgba(229,231,235,0.6)';
      ctx.font = '12px ui-monospace, Menlo, Consolas, monospace';
      ctx.fillText('Sin acero', 12, 18);
      ctx.restore();
      return;
    }

    let minY = Number.POSITIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    let minZ = Number.POSITIVE_INFINITY;
    let maxZ = Number.NEGATIVE_INFINITY;
    let maxRcm = 0;
    for (const p of pts) {
      minY = Math.min(minY, p.y_cm);
      maxY = Math.max(maxY, p.y_cm);
      minZ = Math.min(minZ, p.z_cm);
      maxZ = Math.max(maxZ, p.z_cm);
      maxRcm = Math.max(maxRcm, p.db_cm / 2);
    }

    // Incluir perímetro de viga y proyección de losa en el encuadre
    minY = Math.min(minY, 0, ySlabCm);
    maxY = Math.max(maxY, yTopCm);
    minZ = Math.min(minZ, -slabHalfZCm);
    maxZ = Math.max(maxZ, +slabHalfZCm);

    const pad = 18;
    const usableW = Math.max(1, cssW - pad * 2);
    const usableH = Math.max(1, cssH - pad * 2);
    const spanY = Math.max(1e-6, (maxY - minY) + 2 * maxRcm);
    const spanZ = Math.max(1e-6, (maxZ - minZ) + 2 * maxRcm);
    const scale = Math.min(usableW / spanZ, usableH / spanY);

    const yC = (minY + maxY) / 2;
    const zC = (minZ + maxZ) / 2;
    const cx = cssW / 2;
    const cy = cssH / 2;

    const toCanvas = (y_cm: number, z_cm: number) => {
      const x = cx + (z_cm - zC) * scale;
      const y = cy - (y_cm - yC) * scale;
      return [x, y] as const;
    };

    // Perímetro de viga (rectángulo)
    {
      const z0 = -bCm / 2;
      const z1 = +bCm / 2;
      const y0 = 0;
      const y1 = hCm;
      const [x00, y00] = toCanvas(y0, z0);
      const [x01, y01] = toCanvas(y1, z0);
      const [x11, y11] = toCanvas(y1, z1);
      const [x10, y10] = toCanvas(y0, z1);

      ctx.save();
      ctx.strokeStyle = 'rgba(148,163,184,0.55)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x00, y00);
      ctx.lineTo(x01, y01);
      ctx.lineTo(x11, y11);
      ctx.lineTo(x10, y10);
      ctx.closePath();
      ctx.stroke();
      ctx.restore();
    }

    // Proyección de losa (banda superior, sin relleno)
    {
      const z0 = -slabHalfZCm;
      const z1 = +slabHalfZCm;
      const y0 = ySlabCm;
      const y1 = yTopCm;
      const [x00, y00] = toCanvas(y0, z0);
      const [x01, y01] = toCanvas(y1, z0);
      const [x11, y11] = toCanvas(y1, z1);
      const [x10, y10] = toCanvas(y0, z1);

      ctx.save();
      ctx.strokeStyle = 'rgba(148,163,184,0.30)';
      ctx.lineWidth = 1;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(x00, y00);
      ctx.lineTo(x01, y01);
      ctx.lineTo(x11, y11);
      ctx.lineTo(x10, y10);
      ctx.closePath();
      ctx.stroke();
      ctx.restore();
    }

    // Estribos en sección (rectangulares concéntricos), con espesor por diámetro.
    {
      const sec = normalizeStirrupsSection((span as any).stirrups_section ?? (span as any).stirrupsSection);
      const settings = getSteelLayoutSettings(dev);
      const dbCm = diameterToCm(sec.diameter, settings);
      if (sec.qty > 0 && dbCm > 0) {
        const coverCm = coverM * 100;
        ctx.save();
        ctx.strokeStyle = 'rgba(34, 197, 94, 0.55)';
        ctx.setLineDash([]);

        for (let k = 0; k < sec.qty; k++) {
          const offCm = coverCm + (k + 0.5) * dbCm;
          const y0 = offCm;
          const y1 = hCm - offCm;
          const z0 = -bCm / 2 + offCm;
          const z1 = +bCm / 2 - offCm;
          if (!(y1 > y0 + 1e-6) || !(z1 > z0 + 1e-6)) break;

          const [x00, y00] = toCanvas(y0, z0);
          const [x01, y01] = toCanvas(y1, z0);
          const [x11, y11] = toCanvas(y1, z1);
          const [x10, y10] = toCanvas(y0, z1);

          ctx.lineWidth = Math.max(1, dbCm * scale);
          ctx.beginPath();
          ctx.moveTo(x00, y00);
          ctx.lineTo(x01, y01);
          ctx.lineTo(x11, y11);
          ctx.lineTo(x10, y10);
          ctx.closePath();
          ctx.stroke();
        }

        ctx.restore();
      }
    }

    for (const p of pts) {
      const [x, y] = toCanvas(p.y_cm, p.z_cm);
      const r = Math.max(2.2, (p.db_cm / 2) * scale);
      ctx.fillStyle = p.fill;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }, [dev, sectionXU, appCfg.recubrimiento, sectionXRangeU, backendCfg?.slab_proj_offset_m]);

  // Inicializar escena 3D (solo cuando la vista 3D está activa)
  useEffect(() => {
    if (previewView !== '3d') return;
    const host = threeHostRef.current;
    if (!host) return;
    if (threeRef.current) return;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.physicallyCorrectLights = true;

    const scene = new THREE.Scene();

    const perspCamera = new THREE.PerspectiveCamera(45, 1, 0.01, 5000);
    perspCamera.position.set(120, 80, 120);

    const orthoCamera = new THREE.OrthographicCamera(-100, 100, 100, -100, 0.01, 5000);
    orthoCamera.position.set(120, 80, 120);

    const camera = threeProjection === 'orthographic' ? orthoCamera : perspCamera;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.07;
    controls.rotateSpeed = 0.75;
    controls.zoomSpeed = 1.0;
    controls.panSpeed = 0.75;
    controls.screenSpacePanning = true;
    controls.zoomToCursor = true;
    controls.minPolarAngle = 0.05;
    controls.maxPolarAngle = Math.PI - 0.05;

    const hemi = new THREE.HemisphereLight(0xffffff, 0xffffff, 0.45);
    scene.add(hemi);
    const ambient = new THREE.AmbientLight(0xffffff, 0.35);
    scene.add(ambient);
    const key = new THREE.DirectionalLight(0xffffff, 0.95);
    key.position.set(200, 250, 120);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xffffff, 0.35);
    fill.position.set(-220, 140, -180);
    scene.add(fill);

    const root = new THREE.Group();
    scene.add(root);

    host.appendChild(renderer.domElement);

    const onDblClick = () => {
      // Reset rápido para volver a encuadrar.
      const rect = host.getBoundingClientRect();
      fitCameraToObject(
        (threeRef.current?.camera ?? camera) as any,
        controls,
        root,
        { w: Math.max(1, Math.round(rect.width)), h: Math.max(1, Math.round(rect.height)) }
      );
    };
    renderer.domElement.addEventListener('dblclick', onDblClick);

    const onResize = () => {
      const rect = host.getBoundingClientRect();
      const w = Math.max(1, Math.round(rect.width));
      const h = Math.max(1, Math.round(rect.height));
      renderer.setSize(w, h, false);
      const s = threeRef.current;
      const cam = (s?.camera ?? camera) as any;
      if (cam?.isPerspectiveCamera) {
        cam.aspect = w / h;
        cam.updateProjectionMatrix();
      } else if (cam?.isOrthographicCamera) {
        setOrthoFrustum(cam as THREE.OrthographicCamera, w / h);
        cam.updateProjectionMatrix();
      }
    };

    const ro = new ResizeObserver(onResize);
    ro.observe(host);
    onResize();

    let raf = 0;
    const tick = () => {
      const s = threeRef.current;
      if (!s) return;
      s.controls.update();
      s.renderer.render(s.scene, s.camera);
      raf = window.requestAnimationFrame(tick);
    };
    raf = window.requestAnimationFrame(tick);

    threeRef.current = {
      renderer,
      scene,
      camera,
      perspCamera,
      orthoCamera,
      controls,
      root,
      spans: [],
      nodes: [],
      spanSteel: [],
      spanStirrups: [],
      nodeSteel: [],
      nodeStirrups: [],
    };

    return () => {
      window.cancelAnimationFrame(raf);
      ro.disconnect();
      renderer.domElement.removeEventListener('dblclick', onDblClick);
      disposeObject3D(root);
      renderer.dispose();
      renderer.domElement.remove();
      threeRef.current = null;
    };
  }, [previewView, threeProjection]);

  // Cambiar proyección 3D sin reconstruir geometría.
  useEffect(() => {
    if (previewView !== '3d') return;
    const state = threeRef.current;
    const host = threeHostRef.current;
    if (!state || !host) return;

    const rect = host.getBoundingClientRect();
    const w = Math.max(1, Math.round(rect.width));
    const h = Math.max(1, Math.round(rect.height));
    const next = threeProjection === 'orthographic' ? state.orthoCamera : state.perspCamera;

    state.camera = next;
    (state.controls as any).object = next;
    if ((next as any).isPerspectiveCamera) {
      (next as THREE.PerspectiveCamera).aspect = w / h;
      (next as THREE.PerspectiveCamera).updateProjectionMatrix();
    } else {
      setOrthoFrustum(next as THREE.OrthographicCamera, w / h);
      (next as THREE.OrthographicCamera).updateProjectionMatrix();
    }

    fitCameraToObject(next, state.controls, state.root, { w, h });
  }, [threeProjection, previewView]);

  // Construir/reconstruir geometría 3D (extrusión fiel del contorno 2D)
  useEffect(() => {
    if (previewView !== '3d') return;
    const state = threeRef.current;
    if (!state) return;

    // Limpiar root
    while (state.root.children.length) {
      const child = state.root.children[0];
      state.root.remove(child);
      disposeObject3D(child);
    }
    state.spans = [];
    state.nodes = [];
    state.spanSteel = [];
    state.spanStirrups = [];
    state.nodeSteel = [];
    state.nodeStirrups = [];

    const dev0 = preview?.developments?.[0];
    const pts0 = dev0?.points ?? [];
    if (!pts0.length) {
      // sin preview aún
      return;
    }

    const poly: PolyPt[] = pts0.map((p) => [Number(p[0]), Number(p[1])] as PolyPt);
    // asegurar cierre
    if (poly.length >= 2) {
      const a = poly[0];
      const b = poly[poly.length - 1];
      if (a[0] !== b[0] || a[1] !== b[1]) poly.push([a[0], a[1]]);
    }

    const xs = uniqueSortedNumbers(poly.map((p) => p[0]));
    const spansCount = (dev.spans ?? []).length;
    const nodesCount = (dev.nodes ?? []).length;

    // grupos por tramo/nodo para highlight
    const spanGroups: THREE.Group[] = Array.from({ length: Math.max(spansCount, 1) }, () => new THREE.Group());
    const nodeGroups: THREE.Group[] = Array.from({ length: Math.max(nodesCount, 1) }, () => new THREE.Group());
    for (let i = 0; i < spanGroups.length; i++) state.root.add(spanGroups[i]);
    for (let i = 0; i < nodeGroups.length; i++) state.root.add(nodeGroups[i]);
    state.spans = spanGroups;
    state.nodes = nodeGroups;

    // Subgrupos por tipo para permitir toggles de visibilidad.
    const spanSteelGroups = spanGroups.map((g) => {
      const sg = new THREE.Group();
      sg.name = '__steel';
      g.add(sg);
      return sg;
    });
    const spanStirrupsGroups = spanGroups.map((g) => {
      const sg = new THREE.Group();
      sg.name = '__stirrups';
      g.add(sg);
      return sg;
    });
    const nodeSteelGroups = nodeGroups.map((g) => {
      const sg = new THREE.Group();
      sg.name = '__steel';
      g.add(sg);
      return sg;
    });
    const nodeStirrupsGroups = nodeGroups.map((g) => {
      const sg = new THREE.Group();
      sg.name = '__stirrups';
      g.add(sg);
      return sg;
    });
    state.spanSteel = spanSteelGroups;
    state.spanStirrups = spanStirrupsGroups;
    state.nodeSteel = nodeSteelGroups;
    state.nodeStirrups = nodeStirrupsGroups;

    // Concreto semi-transparente para visualizar acero interno.
    const baseMat = new THREE.MeshStandardMaterial({
      color: 0x14b8a6,
      roughness: 0.48,
      metalness: 0.05,
      transparent: true,
      opacity: 0.20,
    });

    // Rebanadas entre cada borde vertical del polígono.
    for (let i = 0; i + 1 < xs.length; i++) {
      const x0 = xs[i];
      const x1 = xs[i + 1];
      const dx = x1 - x0;
      if (!(dx > 1e-6)) continue;
      const xm = (x0 + x1) / 2;

      const intervals = polySliceIntervals(poly, xm);
      if (!intervals.length) continue;

      const b = spanBAtX(dev, xm);
      const spanIdx = spanIndexAtX(dev, xm);
      const nodeIdx = nodeIndexAtX(dev, xm);

      const parent = nodeIdx >= 0 ? nodeGroups[nodeIdx] : spanGroups[Math.max(0, Math.min(spanIdx, spanGroups.length - 1))];

      for (const [y0, y1] of intervals) {
        const dy = y1 - y0;
        if (!(dy > 1e-6)) continue;
        const geom = new THREE.BoxGeometry(dx, dy, b);
        const mesh = new THREE.Mesh(geom, baseMat.clone());
        mesh.position.set((x0 + x1) / 2, (y0 + y1) / 2, 0);
        parent.add(mesh);
      }
    }

    // Acero longitudinal (simplificado): barras rectas por tramo según layout de sección.
    // Incluye bastones como segmentos por zonas (Z1/Z2/Z3).
    try {
      const steelMat = new THREE.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.35, metalness: 0.25 });
      const bastonL1Mat = new THREE.MeshStandardMaterial({ color: 0x22c55e, roughness: 0.40, metalness: 0.15 });
      const bastonL2Mat = new THREE.MeshStandardMaterial({ color: 0x06b6d4, roughness: 0.40, metalness: 0.15 });
      const extraMat = new THREE.MeshStandardMaterial({ color: 0xd946ef, roughness: 0.45, metalness: 0.10 });
      const origins = computeNodeOrigins(dev);
      const yBaseU = mToUnits(dev, clampNumber((dev as any).y0 ?? 0, 0));
      const coverM = clampNumber((dev as any).recubrimiento ?? appCfg.recubrimiento ?? 0.04, 0.04);
      const nodes = dev.nodes ?? [];
      const bastonLcM = clampNumber((dev as any).baston_Lc ?? 0.5, 0.5);
      const bastonLcU = mToUnits(dev, bastonLcM);
      const coverU = mToUnits(dev, coverM);
      const hookLegU = mToUnits(dev, clampNumber(hookLegM, 0.15));

      const addXSegmentTo = (
        parent: THREE.Object3D,
        xa: number,
        xb: number,
        yU: number,
        zU: number,
        radiusU: number,
        mat: THREE.Material
      ) => {
        const lo = Math.min(xa, xb);
        const hi = Math.max(xa, xb);
        const Lx = hi - lo;
        if (!(Lx > 1e-6)) return;
        if (!(radiusU > 0)) return;
        const geom = new THREE.CylinderGeometry(radiusU, radiusU, Lx, 12);
        geom.rotateZ(Math.PI / 2);
        const mesh = new THREE.Mesh(geom, mat);
        mesh.position.set((lo + hi) / 2, yU, zU);
        parent.add(mesh);
      };

      const addYSegmentTo = (
        parent: THREE.Object3D,
        xU: number,
        y0U: number,
        y1U: number,
        zU: number,
        radiusU: number,
        mat: THREE.Material
      ) => {
        const lo = Math.min(y0U, y1U);
        const hi = Math.max(y0U, y1U);
        const Ly = hi - lo;
        if (!(Ly > 1e-6)) return;
        if (!(radiusU > 0)) return;
        const geom = new THREE.CylinderGeometry(radiusU, radiusU, Ly, 12);
        const mesh = new THREE.Mesh(geom, mat);
        mesh.position.set(xU, (lo + hi) / 2, zU);
        parent.add(mesh);
      };

      const addSegmentTo = (
        parent: THREE.Object3D,
        x0: number,
        y0: number,
        z0: number,
        x1: number,
        y1: number,
        z1: number,
        radiusU: number,
        mat: THREE.Material
      ) => {
        const dx = x1 - x0;
        const dy = y1 - y0;
        const dz = z1 - z0;
        const L = Math.hypot(dx, dy, dz);
        if (!(L > 1e-6)) return;
        if (!(radiusU > 0)) return;

        const geom = new THREE.CylinderGeometry(radiusU, radiusU, L, 12);
        const mesh = new THREE.Mesh(geom, mat);

        // CylinderGeometry is aligned with +Y by default.
        const dir = new THREE.Vector3(dx, dy, dz).normalize();
        const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
        mesh.quaternion.copy(q);

        mesh.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
        parent.add(mesh);
      };

      const resolvedLenMWithLm = (cfg: BastonCfg, field: 'L1_m' | 'L2_m' | 'L3_m', fallbackM: number, Lm: number) => {
        const v = (cfg as any)[field];
        const n = typeof v === 'number' ? v : NaN;
        const out = Number.isFinite(n) && n > 0 ? n : fallbackM;
        const snapped = snap05m(out);
        return Math.min(Lm, Math.max(0, snapped));
      };

      const getBastonCfgForSpan = (span: SpanIn, side: 'top' | 'bottom', zone: 'z1' | 'z2' | 'z3'): BastonCfg => {
        const b = (span as any).bastones ?? {};
        const s = (side === 'top' ? b.top : b.bottom) ?? {};
        const z = (s as any)[zone] ?? {};
        return normalizeBastonCfg(z);
      };

      for (let si = 0; si < (dev.spans ?? []).length; si++) {
        const span = (dev.spans ?? [])[si];
        if (!span) continue;
        const Lm = clampNumber(span.L ?? 0, 0);
        if (!(Lm > 0)) continue;

        // X-range por lado (mismo que el overlay 2D)
        const a2_i = mToUnits(dev, clampNumber(nodes[si]?.a2 ?? 0, 0));
        const xBot0 = (origins[si] ?? 0) + a2_i;
        const xBot1 = xBot0 + mToUnits(dev, Lm);

        const b2_i = mToUnits(dev, clampNumber(nodes[si]?.b2 ?? 0, 0));
        const b1_ip1 = mToUnits(dev, clampNumber(nodes[si + 1]?.b1 ?? 0, 0));
        const xTop0 = (origins[si] ?? 0) + b2_i;
        const xTop1 = (origins[si + 1] ?? 0) + b1_ip1;

        const parentSteel = state.spanSteel[Math.max(0, Math.min(si, state.spanSteel.length - 1))] as THREE.Group | undefined;
        const parentStirrups = state.spanStirrups[Math.max(0, Math.min(si, state.spanStirrups.length - 1))] as THREE.Group | undefined;
        if (!parentSteel || !parentStirrups) continue;

        const getBastonCfg3D = (side: 'top' | 'bottom', zone: 'z1' | 'z2' | 'z3'): BastonCfg => {
          const b = (span as any).bastones ?? {};
          const s = (side === 'top' ? b.top : b.bottom) ?? {};
          const z = (s as any)[zone] ?? {};
          return normalizeBastonCfg(z);
        };

        const defaultLenM = Lm / 5;
        const defaultL3M = Lm / 3;
        const resolvedLenM = (cfg: BastonCfg, field: 'L1_m' | 'L2_m' | 'L3_m', fallbackM: number) => {
          const v = (cfg as any)[field];
          const n = typeof v === 'number' ? v : NaN;
          const out = Number.isFinite(n) && n > 0 ? n : fallbackM;
          const snapped = snap05m(out);
          return Math.min(Lm, Math.max(0, snapped));
        };

        const addXSegment = (xa: number, xb: number, yU: number, zU: number, radiusU: number, mat: THREE.Material) => {
          const lo = Math.min(xa, xb);
          const hi = Math.max(xa, xb);
          const Lx = hi - lo;
          if (!(Lx > 1e-6)) return;
          if (!(radiusU > 0)) return;
          const geom = new THREE.CylinderGeometry(radiusU, radiusU, Lx, 12);
          geom.rotateZ(Math.PI / 2);
          const mesh = new THREE.Mesh(geom, mat);
          mesh.position.set((lo + hi) / 2, yU, zU);
          parentSteel.add(mesh);
        };

        const addYSegment = (xU: number, y0U: number, y1U: number, zU: number, radiusU: number, mat: THREE.Material) => {
          const lo = Math.min(y0U, y1U);
          const hi = Math.max(y0U, y1U);
          const Ly = hi - lo;
          if (!(Ly > 1e-6)) return;
          if (!(radiusU > 0)) return;
          const geom = new THREE.CylinderGeometry(radiusU, radiusU, Ly, 12);
          const mesh = new THREE.Mesh(geom, mat);
          mesh.position.set(xU, (lo + hi) / 2, zU);
          parentSteel.add(mesh);
        };

        const computeEndX2 = (
          xU: number,
          dir: 1 | -1,
          diaKey: string,
          kind: 'hook' | 'anchorage',
          side: 'top' | 'bottom',
          xFaceU?: number
        ) => {
          if (typeof xFaceU === 'number' && Number.isFinite(xFaceU)) {
            const target = xFaceU - dir * coverU;
            const lo = Math.min(xU, xFaceU);
            const hi = Math.max(xU, xFaceU);
            return Math.min(hi, Math.max(lo, target));
          }
          return xU + dir * mToUnits(dev, lengthFromTableMeters(diaKey, kind, side));
        };

        const addBars = (face: 'top' | 'bottom') => {
          const res = computeSpanSectionLayoutWithBastonesCm({ dev, span, cover_m: coverM, face });
          if (!res.ok) return;

          const xaSide = face === 'top' ? Math.min(xTop0, xTop1) : Math.min(xBot0, xBot1);
          const xbSide = face === 'top' ? Math.max(xTop0, xTop1) : Math.max(xBot0, xBot1);

          // Acero principal: barra a lo largo del tramo + uniones por nodo (gancho/anclaje).
          const mainRadiusU = mToUnits(dev, (res.main_db_cm / 100) / 2);
          const mainSteel = face === 'top' ? (span.steel_top ?? null) : (span.steel_bottom ?? null);
          const diaKey = String((mainSteel as any)?.diameter ?? '3/4');
          const nL = nodes[si] as NodeIn | undefined;
          const nR = nodes[si + 1] as NodeIn | undefined;

          const leftKind = nL ? nodeSteelKind(nL, face, 2) : 'continuous';
          const rightKind = nR ? nodeSteelKind(nR, face, 1) : 'continuous';
          const leftToFace = nL ? nodeToFaceEnabled(nL, face, 2) : false;
          const rightToFace = nR ? nodeToFaceEnabled(nR, face, 1) : false;

          const xFaceLeft = (() => {
            if (!leftToFace || !nL) return undefined;
            const o = origins[si] ?? 0;
            return face === 'top'
              ? o + mToUnits(dev, clampNumber((nL as any).b1 ?? 0, 0))
              : o + mToUnits(dev, clampNumber((nL as any).a1 ?? 0, 0));
          })();

          const xFaceRight = (() => {
            if (!rightToFace || !nR) return undefined;
            const o = origins[si + 1] ?? 0;
            return face === 'top'
              ? o + mToUnits(dev, clampNumber((nR as any).b2 ?? 0, 0))
              : o + mToUnits(dev, clampNumber((nR as any).a2 ?? 0, 0));
          })();

          for (const b of res.main_bars_cm) {
            const yU = yBaseU + mToUnits(dev, b.y_cm / 100);
            const zU = mToUnits(dev, b.z_cm / 100);
            addXSegment(xaSide, xbSide, yU, zU, mainRadiusU, steelMat);

            if (leftKind === 'hook' || leftKind === 'development') {
              const kind2 = leftKind === 'hook' ? 'hook' : 'anchorage';
              const x2 = computeEndX2(xaSide, -1, diaKey, kind2, face, xFaceLeft);
              addXSegment(x2, xaSide, yU, zU, mainRadiusU, extraMat);
              if (leftKind === 'hook') {
                const y2 = face === 'top' ? yU - hookLegU : yU + hookLegU;
                addYSegment(x2, yU, y2, zU, mainRadiusU, extraMat);
              }
            }

            if (rightKind === 'hook' || rightKind === 'development') {
              const kind2 = rightKind === 'hook' ? 'hook' : 'anchorage';
              const x2 = computeEndX2(xbSide, +1, diaKey, kind2, face, xFaceRight);
              addXSegment(xbSide, x2, yU, zU, mainRadiusU, extraMat);
              if (rightKind === 'hook') {
                const y2 = face === 'top' ? yU - hookLegU : yU + hookLegU;
                addYSegment(x2, yU, y2, zU, mainRadiusU, extraMat);
              }
            }
          }

          // Bastones: segmentos por zonas.
          const l1Pool = (res as any).baston_l1_bars_cm ?? [];
          const l2Pool = (res as any).baston_l2_bars_cm ?? [];
          if (!((l1Pool.length + l2Pool.length) > 0) || !(res.baston_db_cm > 0)) return;
          const bastonRadiusU = mToUnits(dev, (res.baston_db_cm / 100) / 2);

          const side: 'top' | 'bottom' = face;

          // Z1
          {
            const cfg = getBastonCfg3D(side, 'z1');
            if (cfg.l1_enabled || cfg.l2_enabled) {
              const q1 = Math.max(1, Math.min(3, Math.round(cfg.l1_qty ?? 1)));
              const q2 = Math.max(1, Math.min(3, Math.round(cfg.l2_qty ?? 1)));

              const L3_u = mToUnits(dev, resolvedLenM(cfg, 'L3_m', defaultL3M));
              const x0z = xaSide;
              const x1z = Math.min(xbSide, xaSide + L3_u);
              const innerExists = x1z - x0z > bastonLcU + 1e-6;

              const l1Bars = cfg.l1_enabled ? l1Pool.slice(0, q1) : [];
              const l2Bars = cfg.l2_enabled && innerExists ? l2Pool.slice(0, q2) : [];

              for (const bb of l1Bars) {
                const yU = yBaseU + mToUnits(dev, bb.y_cm / 100);
                const zU = mToUnits(dev, bb.z_cm / 100);
                addXSegment(x0z, x1z, yU, zU, bastonRadiusU, bastonL1Mat);
              }
              for (const bb of l2Bars) {
                const yU = yBaseU + mToUnits(dev, bb.y_cm / 100);
                const zU = mToUnits(dev, bb.z_cm / 100);
                addXSegment(x0z, x1z - bastonLcU, yU, zU, bastonRadiusU, bastonL2Mat);
              }

              // Uniones en el nodo izquierdo (end=2) por línea
              const n0 = nodes[si] as NodeIn | undefined;
              if (n0) {
                const xFaceFor = (line: 1 | 2) => {
                  const toFace = nodeBastonLineToFaceEnabled(n0, side, 2, line);
                  if (!toFace) return undefined;
                  const o = origins[si] ?? 0;
                  return side === 'top'
                    ? o + mToUnits(dev, clampNumber((n0 as any).b1 ?? 0, 0))
                    : o + mToUnits(dev, clampNumber((n0 as any).a1 ?? 0, 0));
                };

                if (cfg.l1_enabled) {
                  const dia = String(cfg.l1_diameter ?? '3/4');
                  const kEnd = nodeBastonLineKind(n0, side, 2, 1);
                  if (kEnd === 'hook' || kEnd === 'development') {
                    const kind = kEnd === 'hook' ? 'hook' : 'anchorage';
                    const xFace = xFaceFor(1);
                    const x2 = computeEndX2(x0z, -1, dia, kind, side, xFace);
                    for (const bb of l1Bars) {
                      const yU = yBaseU + mToUnits(dev, bb.y_cm / 100);
                      const zU = mToUnits(dev, bb.z_cm / 100);
                      addXSegment(x2, x0z, yU, zU, bastonRadiusU, extraMat);
                      if (kEnd === 'hook') {
                        const y2 = side === 'top' ? yU - hookLegU : yU + hookLegU;
                        addYSegment(x2, yU, y2, zU, bastonRadiusU, extraMat);
                      }
                    }
                  }
                }

                if (cfg.l2_enabled && innerExists) {
                  const dia = String(cfg.l2_diameter ?? '3/4');
                  const kEnd = nodeBastonLineKind(n0, side, 2, 2);
                  if (kEnd === 'hook' || kEnd === 'development') {
                    const kind = kEnd === 'hook' ? 'hook' : 'anchorage';
                    const xFace = xFaceFor(2);
                    const x2 = computeEndX2(x0z, -1, dia, kind, side, xFace);
                    for (const bb of l2Bars) {
                      const yU = yBaseU + mToUnits(dev, bb.y_cm / 100);
                      const zU = mToUnits(dev, bb.z_cm / 100);
                      addXSegment(x2, x0z, yU, zU, bastonRadiusU, extraMat);
                      if (kEnd === 'hook') {
                        const y2 = side === 'top' ? yU - hookLegU : yU + hookLegU;
                        addYSegment(x2, yU, y2, zU, bastonRadiusU, extraMat);
                      }
                    }
                  }
                }
              }
            }
          }

          // Z2
          {
            const cfg = getBastonCfg3D(side, 'z2');
            if (cfg.l1_enabled || cfg.l2_enabled) {
              const q1 = Math.max(1, Math.min(3, Math.round(cfg.l1_qty ?? 1)));
              const q2 = Math.max(1, Math.min(3, Math.round(cfg.l2_qty ?? 1)));
              const L1_u = mToUnits(dev, resolvedLenM(cfg, 'L1_m', defaultLenM));
              const L2_u = mToUnits(dev, resolvedLenM(cfg, 'L2_m', defaultLenM));
              const x0z = xaSide + L1_u;
              const x1z = xbSide - L2_u;
              if (x1z > x0z + 1e-6) {
                const innerExists = x1z - x0z > 2 * bastonLcU + 1e-6;
                const idxL1 = 0;
                const idxL2 = cfg.l1_enabled ? q1 : 0;
                const l1Bars = cfg.l1_enabled ? l1Pool.slice(0, q1) : [];
                const l2Bars = cfg.l2_enabled && innerExists ? l2Pool.slice(0, q2) : [];

                for (const bb of l1Bars) {
                  const yU = yBaseU + mToUnits(dev, bb.y_cm / 100);
                  const zU = mToUnits(dev, bb.z_cm / 100);
                  addXSegment(x0z, x1z, yU, zU, bastonRadiusU, bastonL1Mat);
                }
                for (const bb of l2Bars) {
                  const yU = yBaseU + mToUnits(dev, bb.y_cm / 100);
                  const zU = mToUnits(dev, bb.z_cm / 100);
                  addXSegment(x0z + bastonLcU, x1z - bastonLcU, yU, zU, bastonRadiusU, bastonL2Mat);
                }
              }
            }
          }

          // Z3
          {
            const cfg = getBastonCfg3D(side, 'z3');
            if (cfg.l1_enabled || cfg.l2_enabled) {
              const q1 = Math.max(1, Math.min(3, Math.round(cfg.l1_qty ?? 1)));
              const q2 = Math.max(1, Math.min(3, Math.round(cfg.l2_qty ?? 1)));

              const L3_u = mToUnits(dev, resolvedLenM(cfg, 'L3_m', defaultL3M));
              const x1z = xbSide;
              const x0z = Math.max(xaSide, xbSide - L3_u);
              const innerExists = x1z - x0z > bastonLcU + 1e-6;

              const l1Bars = cfg.l1_enabled ? l1Pool.slice(0, q1) : [];
              const l2Bars = cfg.l2_enabled && innerExists ? l2Pool.slice(0, q2) : [];

              for (const bb of l1Bars) {
                const yU = yBaseU + mToUnits(dev, bb.y_cm / 100);
                const zU = mToUnits(dev, bb.z_cm / 100);
                addXSegment(x0z, x1z, yU, zU, bastonRadiusU, bastonL1Mat);
              }
              for (const bb of l2Bars) {
                const yU = yBaseU + mToUnits(dev, bb.y_cm / 100);
                const zU = mToUnits(dev, bb.z_cm / 100);
                addXSegment(x0z + bastonLcU, x1z, yU, zU, bastonRadiusU, bastonL2Mat);
              }

              // Uniones en el nodo derecho (end=1) por línea
              const n1 = nodes[si + 1] as NodeIn | undefined;
              if (n1) {
                const xFaceFor = (line: 1 | 2) => {
                  const toFace = nodeBastonLineToFaceEnabled(n1, side, 1, line);
                  if (!toFace) return undefined;
                  const o = origins[si + 1] ?? 0;
                  return side === 'top'
                    ? o + mToUnits(dev, clampNumber((n1 as any).b2 ?? 0, 0))
                    : o + mToUnits(dev, clampNumber((n1 as any).a2 ?? 0, 0));
                };

                if (cfg.l1_enabled) {
                  const dia = String(cfg.l1_diameter ?? '3/4');
                  const kEnd = nodeBastonLineKind(n1, side, 1, 1);
                  if (kEnd === 'hook' || kEnd === 'development') {
                    const kind = kEnd === 'hook' ? 'hook' : 'anchorage';
                    const xFace = xFaceFor(1);
                    const x2 = computeEndX2(x1z, +1, dia, kind, side, xFace);
                    for (const bb of l1Bars) {
                      const yU = yBaseU + mToUnits(dev, bb.y_cm / 100);
                      const zU = mToUnits(dev, bb.z_cm / 100);
                      addXSegment(x1z, x2, yU, zU, bastonRadiusU, extraMat);
                      if (kEnd === 'hook') {
                        const y2 = side === 'top' ? yU - hookLegU : yU + hookLegU;
                        addYSegment(x2, yU, y2, zU, bastonRadiusU, extraMat);
                      }
                    }
                  }
                }

                if (cfg.l2_enabled && innerExists) {
                  const dia = String(cfg.l2_diameter ?? '3/4');
                  const kEnd = nodeBastonLineKind(n1, side, 1, 2);
                  if (kEnd === 'hook' || kEnd === 'development') {
                    const kind = kEnd === 'hook' ? 'hook' : 'anchorage';
                    const xFace = xFaceFor(2);
                    const x2 = computeEndX2(x1z, +1, dia, kind, side, xFace);
                    for (const bb of l2Bars) {
                      const yU = yBaseU + mToUnits(dev, bb.y_cm / 100);
                      const zU = mToUnits(dev, bb.z_cm / 100);
                      addXSegment(x1z, x2, yU, zU, bastonRadiusU, extraMat);
                      if (kEnd === 'hook') {
                        const y2 = side === 'top' ? yU - hookLegU : yU + hookLegU;
                        addYSegment(x2, yU, y2, zU, bastonRadiusU, extraMat);
                      }
                    }
                  }
                }
              }
            }
          }
        };

        addBars('top');
        addBars('bottom');

        // Estribos 3D: lazos rectangulares cerrados (en el plano Y-Z) por cada posición ABCR.
        try {
          const st = (span as any).stirrups as any;
          if (st) {
            const dM = clampNumber((dev as any).d ?? 0.25, 0.25);
            const x0Face = Math.min(xBot0, xBot1);
            const x1Face = Math.max(xBot0, xBot1);
            const LspanU = x1Face - x0Face;
            if (LspanU > 1e-6) {
              const caseType = String(st.case_type ?? 'simetrica').trim().toLowerCase();
              const singleEnd = String(st.single_end ?? '').trim().toLowerCase();
              const leftSpec = String(st.left_spec ?? '').trim();
              const centerSpec = String(st.center_spec ?? '').trim();
              const rightSpec = String(st.right_spec ?? '').trim();

              const specOr = (...vals: string[]) => {
                for (const v of vals) {
                  const s = String(v ?? '').trim();
                  if (s) return s;
                }
                return '';
              };

              let pL = '';
              let pR = '';
              if (caseType === 'simetrica') {
                pL = specOr(leftSpec, centerSpec, rightSpec);
                pR = specOr(rightSpec, pL) || pL;
              } else if (caseType === 'asim_ambos') {
                pL = specOr(leftSpec, centerSpec);
                pR = specOr(rightSpec, centerSpec, pL);
              } else if (caseType === 'asim_uno') {
                const pSpecial = specOr(leftSpec);
                const pRest = specOr(centerSpec, pSpecial);
                if (singleEnd === 'right') {
                  pL = pRest;
                  pR = pSpecial;
                } else {
                  pL = pSpecial;
                  pR = pRest;
                }
              } else {
                pL = specOr(leftSpec, centerSpec, rightSpec);
                pR = specOr(rightSpec, pL) || pL;
              }

              const midU = (x0Face + x1Face) / 2;
              const leftBlocks = pL ? stirrupsBlocksFromSpec(dev, pL, x0Face, midU, +1) : [];
              const rightBlocks = pR ? stirrupsBlocksFromSpec(dev, pR, x1Face, midU, -1) : [];

              // Si el espacio en el centro es mayor que R, agregar un estribo independiente.
              try {
                const flatL = leftBlocks.flatMap((b) => b.positions ?? []);
                const flatR = rightBlocks.flatMap((b) => b.positions ?? []);
                const leftLast = flatL.length ? Math.max(...flatL) : null;
                const rightFirst = flatR.length ? Math.min(...flatR) : null;
                const rLm = pL ? stirrupsRestSpacingFromSpec(pL) : null;
                const rRm = pR ? stirrupsRestSpacingFromSpec(pR) : null;
                const rM = Math.min(...[rLm ?? Infinity, rRm ?? Infinity].filter((v) => Number.isFinite(v)) as number[]);
                const rU = Number.isFinite(rM) && rM > 0 ? mToUnits(dev, rM) : 0;
                if (leftLast != null && rightFirst != null && rightFirst > leftLast + 1e-6 && rU > 0) {
                  const gap = rightFirst - leftLast;
                  if (gap > rU + 1e-6) {
                    const xMid = (leftLast + rightFirst) / 2;
                    leftBlocks.push({ key: 'mid', positions: [xMid] });
                  }
                }
              } catch {
                // ignore
              }

              if (leftBlocks.length || rightBlocks.length) {
                const matB = new THREE.MeshStandardMaterial({ color: 0x22c55e, roughness: 0.55, metalness: 0.05 });
                const matC = new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.55, metalness: 0.05 });
                const matR = new THREE.MeshStandardMaterial({ color: 0x06b6d4, roughness: 0.55, metalness: 0.05 });
                const matMid = new THREE.MeshStandardMaterial({ color: 0xd946ef, roughness: 0.55, metalness: 0.05 });
                const mats = [matB, matC, matR];

                const matFor = (key: string, idx: number) => {
                  const k = String(key || '').toLowerCase();
                  if (k === 'b') return matB;
                  if (k === 'c') return matC;
                  if (k === 'r') return matR;
                  if (k === 'mid') return matMid;
                  return mats[idx % mats.length];
                };

                const sec = normalizeStirrupsSection((span as any).stirrups_section ?? (span as any).stirrupsSection);
                const settings = getSteelLayoutSettings(dev);
                const diaKey = normalizeDiaKey(String(st.diameter ?? '3/8').replace(/[∅Ø\s]/g, '')) || '3/8';
                const dbCm = diameterToCm(diaKey, settings);
                const dbU = mToUnits(dev, dbCm / 100);
                const hU = mToUnits(dev, clampNumber(span.h ?? 0, 0));

                const addLoopAtX = (xPos: number, mat: THREE.Material) => {
                  if (xPos < x0Face - 1e-3 || xPos > x1Face + 1e-3) return;
                  if (!(sec.qty > 0) || !(dbU > 1e-9)) return;
                  const bU = spanBAtX(dev, xPos);

                  for (let k = 0; k < sec.qty; k++) {
                    const offU = coverU + (k + 0.5) * dbU;
                    const y0 = yBaseU + offU;
                    const y1 = yBaseU + hU - offU;
                    const z0 = -bU / 2 + offU;
                    const z1 = +bU / 2 - offU;
                    if (!(y1 > y0 + 1e-6) || !(z1 > z0 + 1e-6)) break;
                    const radiusU = Math.max(1e-9, dbU / 2);

                    // Rectángulo en Y-Z (x constante)
                    addSegmentTo(parentStirrups, xPos, y0, z0, xPos, y1, z0, radiusU, mat);
                    addSegmentTo(parentStirrups, xPos, y1, z0, xPos, y1, z1, radiusU, mat);
                    addSegmentTo(parentStirrups, xPos, y1, z1, xPos, y0, z1, radiusU, mat);
                    addSegmentTo(parentStirrups, xPos, y0, z1, xPos, y0, z0, radiusU, mat);
                  }
                };

                let idx = 0;
                const seen = new Set<number>();
                const pushPositions = (positions: number[], mat: THREE.Material) => {
                  for (const xPos of positions) {
                    const key = Math.round(xPos * 1000); // 1e-3 unidades
                    if (seen.has(key)) continue;
                    seen.add(key);
                    addLoopAtX(xPos, mat);
                  }
                };

                for (const b of leftBlocks) pushPositions(b.positions ?? [], matFor(b.key, idx++));
                for (const b of rightBlocks) pushPositions(b.positions ?? [], matFor(b.key, idx++));
              }
            }
          }
        } catch {
          // ignore (3D stirrups best-effort)
        }
      }

      // Conexiones en nodos internos (best-effort):
      // - Acero principal continuo: conecta barras entre tramos
      // - Bastones: conecta Z3 del tramo izquierdo con Z1 del tramo derecho (por línea)
      const spans = dev.spans ?? [];

      for (let ni = 1; ni < nodes.length - 1; ni++) {
        const node = nodes[ni] as NodeIn | undefined;
        const leftSpan = spans[ni - 1] as SpanIn | undefined;
        const rightSpan = spans[ni] as SpanIn | undefined;
        if (!node || !leftSpan || !rightSpan) continue;

        const parent = (state.nodeSteel[ni] as THREE.Group | undefined) ?? state.root;
        const LmL = clampNumber(leftSpan.L ?? 0, 0);
        const LmR = clampNumber(rightSpan.L ?? 0, 0);
        if (!(LmL > 0) || !(LmR > 0)) continue;

        for (const face of ['top', 'bottom'] as const) {
          // X fin tramo izq en el nodo y X inicio tramo der en el nodo (misma lógica de overlay 2D)
          let xLeftEnd = 0;
          let xRightStart = 0;

          if (face === 'top') {
            const o = origins[ni] ?? 0;
            const b1 = mToUnits(dev, clampNumber((nodes[ni] as any)?.b1 ?? 0, 0));
            const b2 = mToUnits(dev, clampNumber((nodes[ni] as any)?.b2 ?? 0, 0));
            xLeftEnd = o + b1;
            xRightStart = o + b2;
          } else {
            const oL = origins[ni - 1] ?? 0;
            const a2L = mToUnits(dev, clampNumber((nodes[ni - 1] as any)?.a2 ?? 0, 0));
            const x0L = oL + a2L;
            xLeftEnd = x0L + mToUnits(dev, LmL);

            const oR = origins[ni] ?? 0;
            const a2R = mToUnits(dev, clampNumber((nodes[ni] as any)?.a2 ?? 0, 0));
            xRightStart = oR + a2R;
          }

          const xA = xLeftEnd;
          const xB = xRightStart;

          // 1) Acero principal continuo
          const k1 = nodeSteelKind(node, face, 1);
          const k2 = nodeSteelKind(node, face, 2);
          if (k1 === 'continuous' && k2 === 'continuous') {
            const resL = computeSpanSectionLayoutWithBastonesCm({ dev, span: leftSpan, cover_m: coverM, face });
            const resR = computeSpanSectionLayoutWithBastonesCm({ dev, span: rightSpan, cover_m: coverM, face });
            if (resL.ok && resR.ok) {
              const nBars = Math.min(resL.main_bars_cm.length, resR.main_bars_cm.length);
              const radiusU = mToUnits(dev, (Math.max(resL.main_db_cm, resR.main_db_cm) / 100) / 2);
              for (let bi = 0; bi < nBars; bi++) {
                const bL = resL.main_bars_cm[bi];
                const bR = resR.main_bars_cm[bi];
                if (!bL || !bR) continue;
                const yL = yBaseU + mToUnits(dev, bL.y_cm / 100);
                const yR = yBaseU + mToUnits(dev, bR.y_cm / 100);
                const zL = mToUnits(dev, bL.z_cm / 100);
                const zR = mToUnits(dev, bR.z_cm / 100);

                // Recta (sin escalón) también en top.
                addSegmentTo(parent, xA, yL, zL, xB, yR, zR, radiusU, steelMat);
              }
            }
          }

          // 2) Bastones continuos en nodo interno: Z3 (izq) ↔ Z1 (der)
          const cfgL = getBastonCfgForSpan(leftSpan, face, 'z3');
          const cfgR = getBastonCfgForSpan(rightSpan, face, 'z1');
          const q1L = Math.max(1, Math.min(3, Math.round(cfgL.l1_qty ?? 1)));
          const q2L = Math.max(1, Math.min(3, Math.round(cfgL.l2_qty ?? 1)));
          const q1R = Math.max(1, Math.min(3, Math.round(cfgR.l1_qty ?? 1)));
          const q2R = Math.max(1, Math.min(3, Math.round(cfgR.l2_qty ?? 1)));

          const resL = computeSpanSectionLayoutWithBastonesCm({ dev, span: leftSpan, cover_m: coverM, face });
          const resR = computeSpanSectionLayoutWithBastonesCm({ dev, span: rightSpan, cover_m: coverM, face });
          if (!(resL.ok && resR.ok)) continue;
          const l1PoolL = (resL as any).baston_l1_bars_cm ?? [];
          const l2PoolL = (resL as any).baston_l2_bars_cm ?? [];
          const l1PoolR = (resR as any).baston_l1_bars_cm ?? [];
          const l2PoolR = (resR as any).baston_l2_bars_cm ?? [];
          if (!((l1PoolL.length + l2PoolL.length) > 0) || !((l1PoolR.length + l2PoolR.length) > 0)) continue;
          const bastonRadiusU = mToUnits(dev, (Math.max(resL.baston_db_cm, resR.baston_db_cm) / 100) / 2);

          // helper: innerExists para una zona (solo usado para línea 2)
          const innerExistsFor = (span: SpanIn, cfg: BastonCfg, zone: 'z1' | 'z3', Lm: number) => {
            const defaultL3 = Lm / 3;
            const L3_u = mToUnits(dev, resolvedLenMWithLm(cfg, 'L3_m', defaultL3, Lm));

            // x-range por lado en ese tramo
            let xaSide = 0;
            let xbSide = 0;
            if (face === 'top') {
              const siSpan = zone === 'z3' ? ni - 1 : ni;
              const o0 = origins[siSpan] ?? 0;
              const o1 = origins[siSpan + 1] ?? 0;
              const b2_i = mToUnits(dev, clampNumber(nodes[siSpan]?.b2 ?? 0, 0));
              const b1_ip1 = mToUnits(dev, clampNumber(nodes[siSpan + 1]?.b1 ?? 0, 0));
              xaSide = Math.min(o0 + b2_i, o1 + b1_ip1);
              xbSide = Math.max(o0 + b2_i, o1 + b1_ip1);
            } else {
              const siSpan = zone === 'z3' ? ni - 1 : ni;
              const o = origins[siSpan] ?? 0;
              const a2_i = mToUnits(dev, clampNumber(nodes[siSpan]?.a2 ?? 0, 0));
              xaSide = o + a2_i;
              xbSide = xaSide + mToUnits(dev, clampNumber((spans[siSpan] as any)?.L ?? 0, 0));
              xaSide = Math.min(xaSide, xbSide);
              xbSide = Math.max(xaSide, xbSide);
            }

            if (zone === 'z1') {
              const x0z = xaSide;
              const x1z = Math.min(xbSide, xaSide + L3_u);
              return x1z - x0z > bastonLcU + 1e-6;
            }
            // z3
            const x1z = xbSide;
            const x0z = Math.max(xaSide, xbSide - L3_u);
            return x1z - x0z > bastonLcU + 1e-6;
          };

          for (const line of [1, 2] as const) {
            const kLeft = nodeBastonLineKind(node, face, 1, line);
            const kRight = nodeBastonLineKind(node, face, 2, line);
            if (!(kLeft === 'continuous' && kRight === 'continuous')) continue;

            const enabledL = line === 1 ? cfgL.l1_enabled : cfgL.l2_enabled;
            const enabledR = line === 1 ? cfgR.l1_enabled : cfgR.l2_enabled;
            if (!enabledL || !enabledR) continue;

            const qL = line === 1 ? q1L : q2L;
            const qR = line === 1 ? q1R : q2R;
            const poolL = line === 1 ? l1PoolL : l2PoolL;
            const poolR = line === 1 ? l1PoolR : l2PoolR;
            const q = Math.min(qL, qR, poolL.length, poolR.length);
            if (!(q > 0)) continue;

            // Línea 2 solo si existe interior en ambos tramos
            if (line === 2) {
              if (!innerExistsFor(leftSpan, cfgL, 'z3', LmL)) continue;
              if (!innerExistsFor(rightSpan, cfgR, 'z1', LmR)) continue;
            }

            for (let bi = 0; bi < q; bi++) {
              const bL = poolL[bi];
              const bR = poolR[bi];
              if (!bL || !bR) continue;
              const yL = yBaseU + mToUnits(dev, bL.y_cm / 100);
              const yR = yBaseU + mToUnits(dev, bR.y_cm / 100);
              const zL = mToUnits(dev, bL.z_cm / 100);
              const zR = mToUnits(dev, bR.z_cm / 100);

              // Recta (sin escalón) también en top.
              addSegmentTo(parent, xA, yL, zL, xB, yR, zR, bastonRadiusU, line === 1 ? bastonL1Mat : bastonL2Mat);
            }
          }
        }
      }
    } catch {
      // ignore (3D steel is best-effort)
    }

    {
      const host = threeHostRef.current;
      const rect = host?.getBoundingClientRect();
      const viewport = rect ? { w: Math.max(1, Math.round(rect.width)), h: Math.max(1, Math.round(rect.height)) } : undefined;
      fitCameraToObject(state.camera, state.controls, state.root, viewport);
    }
  }, [dev, preview, previewView]);

  // Togglear visibilidad de capas 3D (sin reconstruir)
  useEffect(() => {
    if (previewView !== '3d') return;
    const state = threeRef.current;
    if (!state) return;

    for (const g of [...(state.spanSteel ?? []), ...(state.nodeSteel ?? [])]) g.visible = showLongitudinal;
    for (const g of [...(state.spanStirrups ?? []), ...(state.nodeStirrups ?? [])]) g.visible = showStirrups;
  }, [showLongitudinal, showStirrups, previewView]);

  // Highlight 3D por selección
  useEffect(() => {
    if (previewView !== '3d') return;
    const state = threeRef.current;
    if (!state) return;

    for (const g of state.spans) setEmissiveOnObject(g, 0x000000, 0);
    for (const g of state.nodes) setEmissiveOnObject(g, 0x000000, 0);

    if (!zoomEnabled) return;

    if (selection.kind === 'span') {
      const g = state.spans[selection.index];
      if (g) setEmissiveOnObject(g, 0xfacc15, 0.25);
    } else if (selection.kind === 'node') {
      const g = state.nodes[selection.index];
      if (g) setEmissiveOnObject(g, 0xfacc15, 0.40);
    }
  }, [selection, zoomEnabled, previewView]);

  // Si se desactiva Zoom, apaga correlación y vuelve a vista general
  useEffect(() => {
    if (zoomEnabled) return;
    setViewport(null);
    setSelection({ kind: 'none' });
  }, [zoomEnabled]);

  // Escape: si hay zoom vuelve a vista general; si no, limpia selección
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (viewport) {
        setViewport(null);
        e.preventDefault();
        return;
      }
      if (selection.kind !== 'none') {
        setSelection({ kind: 'none' });
        e.preventDefault();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [viewport, selection.kind]);

  function applySelection(sel: Selection, nextViewport: boolean) {
    if (!zoomEnabled) return;
    setSelection(sel);
    if (nextViewport && preview) setViewport(computeZoomBounds(dev, preview, sel));
  }

  function onCanvasWheel(e: React.WheelEvent<HTMLCanvasElement>) {
    if (previewView !== '2d') return;
    if (!preview) return;
    // Evitar scroll de la página mientras se usa el canvas.
    e.preventDefault();

    const b0 = (viewportRef.current ?? (preview.bounds as Bounds)) as Bounds;
    const w0 = Math.max(1e-6, b0.max_x - b0.min_x);
    const h0 = Math.max(1e-6, b0.max_y - b0.min_y);
    const cx = (b0.min_x + b0.max_x) / 2;
    const cy = (b0.min_y + b0.max_y) / 2;

    // Wheel up -> zoom in (bounds smaller)
    const dir = e.deltaY < 0 ? -1 : 1;
    const factor = dir < 0 ? 0.90 : 1.10;
    const w1 = Math.max(1e-6, w0 * factor);
    const h1 = Math.max(1e-6, h0 * factor);

    setViewport({
      min_x: cx - w1 / 2,
      max_x: cx + w1 / 2,
      min_y: cy - h1 / 2,
      max_y: cy + h1 / 2,
    });
  }

  function onCanvasPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    if (previewView !== '2d') return;
    if (!preview) return;

    // Capturar pointer para pan (mouse/touch).
    const el = e.currentTarget as HTMLCanvasElement;
    try {
      el.setPointerCapture(e.pointerId);
    } catch {
      // ignore
    }

    pan2dRef.current.active = true;
    pan2dRef.current.moved = false;
    pan2dRef.current.pointerId = e.pointerId;
    pan2dRef.current.startX = e.clientX;
    pan2dRef.current.startY = e.clientY;
    pan2dRef.current.lastX = e.clientX;
    pan2dRef.current.lastY = e.clientY;
  }

  function onCanvasPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (previewView !== '2d') return;
    if (!preview) return;
    if (!pan2dRef.current.active) return;
    if (pan2dRef.current.pointerId !== e.pointerId) return;

    const dxPx = e.clientX - pan2dRef.current.lastX;
    const dyPx = e.clientY - pan2dRef.current.lastY;
    pan2dRef.current.lastX = e.clientX;
    pan2dRef.current.lastY = e.clientY;

    const totalDx = e.clientX - pan2dRef.current.startX;
    const totalDy = e.clientY - pan2dRef.current.startY;
    if (!pan2dRef.current.moved) {
      if (Math.hypot(totalDx, totalDy) < 3) return;
      pan2dRef.current.moved = true;
    }

    e.preventDefault();

    const canvas = e.currentTarget as HTMLCanvasElement;
    const rect = canvas.getBoundingClientRect();
    const cssW = Math.max(1, Math.round(rect.width));
    const cssH = Math.max(1, Math.round(rect.height));

    const b0 = (viewportRef.current ?? (preview.bounds as Bounds)) as Bounds;
    const { scale } = fitTransform(b0, cssW, cssH);
    const s = Math.max(1e-6, scale);

    const dxW = dxPx / s;
    const dyW = dyPx / s;

    setViewport((prev) => {
      const b = (prev ?? (preview.bounds as Bounds)) as Bounds;
      // Drag “arrastra” el dibujo: mover bounds en sentido contrario en X.
      return {
        min_x: b.min_x - dxW,
        max_x: b.max_x - dxW,
        // En Y: arrastrar hacia abajo baja el dibujo -> bounds suben.
        min_y: b.min_y + dyW,
        max_y: b.max_y + dyW,
      };
    });
  }

  function onCanvasPointerUp(e: React.PointerEvent<HTMLCanvasElement>) {
    if (pan2dRef.current.pointerId !== e.pointerId) return;
    pan2dRef.current.active = false;
    try {
      (e.currentTarget as HTMLCanvasElement).releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
  }

  function onCanvasClick(e: React.MouseEvent<HTMLCanvasElement>) {
    // Si fue un drag (pan), no disparar selección por click.
    if (pan2dRef.current.moved) {
      pan2dRef.current.moved = false;
      return;
    }
    if (!preview || !zoomEnabled) return;

    const rect = (e.currentTarget as HTMLCanvasElement).getBoundingClientRect();
    const cssW = Math.max(1, Math.round(rect.width));
    const cssH = Math.max(1, Math.round(rect.height));
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;

    const rb = (viewport ?? (preview.bounds as Bounds)) as Bounds;
    const { toWorld } = canvasUnmapper(rb, cssW, cssH);
    const [wx] = toWorld(cx, cy);

    const origins = computeNodeOrigins(dev);
    const nodeXs = origins.map((_, i) => computeNodeMarkerX(dev, origins, i));
    const spanXs = (dev.spans ?? []).map((_, i) => computeSpanMidX(dev, origins, i));

    let best: Selection = { kind: 'none' };
    let bestDist = Number.POSITIVE_INFINITY;

    for (let i = 0; i < nodeXs.length; i++) {
      const d = Math.abs(wx - nodeXs[i]);
      if (d < bestDist) {
        bestDist = d;
        best = { kind: 'node', index: i };
      }
    }
    for (let i = 0; i < spanXs.length; i++) {
      const d = Math.abs(wx - spanXs[i]);
      if (d < bestDist) {
        bestDist = d;
        best = { kind: 'span', index: i };
      }
    }

    // Umbral relativo para evitar selecciones accidentales
    const dx = (rb.max_x - rb.min_x) || 1;
    const threshold = dx * 0.06;
    if (best.kind !== 'none' && bestDist <= threshold) {
      applySelection(best, true);
    }
  }

  function updateDevPatch(patch: Partial<DevelopmentIn>) {
    setDev((prev) => normalizeDev({ ...prev, ...patch } as DevelopmentIn, appCfg));
  }

  function updateSpan(spanIdx: number, patch: Partial<SpanIn>) {
    setDev((prev) => {
      const spans = (prev.spans ?? []).map((s, i) => (i === spanIdx ? { ...s, ...patch } : s));
      return normalizeDev({ ...prev, spans } as DevelopmentIn, appCfg);
    });
  }

  function updateSpanStirrups(spanIdx: number, patch: Partial<StirrupsDistributionIn>) {
    setDev((prev) => {
      const spans = (prev.spans ?? []).map((s, i) => {
        if (i !== spanIdx) return s;
        const current = (s as any).stirrups ? { ...(s as any).stirrups } : {};
        const next = { ...current, ...patch } as StirrupsDistributionIn;
        return { ...s, stirrups: next } as any;
      });
      return normalizeDev({ ...prev, spans } as DevelopmentIn, appCfg);
    });
  }

  function updateSpanStirrupsSection(spanIdx: number, patch: Partial<StirrupsSectionIn>) {
    setDev((prev) => {
      const spans = (prev.spans ?? []).map((s, i) => {
        if (i !== spanIdx) return s;
        const current = normalizeStirrupsSection((s as any).stirrups_section ?? (s as any).stirrupsSection);
        const next = normalizeStirrupsSection({ ...current, ...patch });
        return { ...s, stirrups_section: next } as any;
      });
      return normalizeDev({ ...prev, spans } as DevelopmentIn, appCfg);
    });
  }

  function updateNode(nodeIdx: number, patch: Partial<NodeIn>) {
    setDev((prev) => {
      const nodes = (prev.nodes ?? []).map((n, i) => (i === nodeIdx ? { ...n, ...patch } : n));
      return normalizeDev({ ...prev, nodes } as DevelopmentIn, appCfg);
    });
  }

  function updateSpanSteel(spanIdx: number, side: 'top' | 'bottom', patch: Partial<SteelMeta>) {
    const key = side === 'top' ? 'steel_top' : 'steel_bottom';
    setDev((prev) => {
      const spans = (prev.spans ?? []).map((s, i) => {
        if (i !== spanIdx) return s;
        const current = (s as any)[key] as SteelMeta | undefined;
        const next = { ...cloneSteelMeta(current), ...patch } as SteelMeta;
        return { ...s, [key]: next } as any;
      });
      return normalizeDev({ ...prev, spans } as DevelopmentIn, appCfg);
    });
  }

  function updateBaston(spanIdx: number, side: 'top' | 'bottom', zone: 'z1' | 'z2' | 'z3', patch: Partial<BastonCfg>) {
    setDev((prev) => {
      const spans = (prev.spans ?? []).map((s, i) => {
        if (i !== spanIdx) return s;
        const bastones: BastonesCfg = (s as any).bastones ? JSON.parse(JSON.stringify((s as any).bastones)) : { top: {}, bottom: {} };
        const sideObj: BastonesSideCfg = (side === 'top' ? bastones.top : bastones.bottom) ?? {};
        const current = normalizeBastonCfg((sideObj as any)[zone]);
        const next = { ...current, ...patch } as BastonCfg;
        const nextSide = { ...sideObj, [zone]: next } as any;
        const nextBastones = { ...bastones, [side]: nextSide } as any;
        return { ...s, bastones: nextBastones } as any;
      });
      return normalizeDev({ ...prev, spans } as DevelopmentIn, appCfg);
    });
  }

  function setNodeSteelKind(nodeIdx: number, side: 'top' | 'bottom', end: 1 | 2, kind: SteelKind) {
    setDev((prev) => {
      const nodes = (prev.nodes ?? []).map((n, i) => {
        if (i !== nodeIdx) return n;
        const isInternal = nodeIdx > 0 && nodeIdx < (prev.nodes?.length ?? 0) - 1;
        const k1 = side === 'top' ? 'steel_top_1_kind' : 'steel_bottom_1_kind';
        const k2 = side === 'top' ? 'steel_top_2_kind' : 'steel_bottom_2_kind';

        // Regla: si uno es "Continuo", el otro también (solo nodos internos que tienen 1 y 2)
        if (isInternal && kind === 'continuous') {
          return { ...n, [k1]: 'continuous', [k2]: 'continuous' } as any;
        }

        const key = end === 1 ? k1 : k2;
        return { ...n, [key]: kind } as any;
      });
      return normalizeDev({ ...prev, nodes } as DevelopmentIn, appCfg);
    });
  }

  function setNodeBastonLineKind(nodeIdx: number, side: 'top' | 'bottom', end: 1 | 2, line: 1 | 2, kind: SteelKind) {
    setDev((prev) => {
      const nodes = (prev.nodes ?? []).map((n, i) => {
        if (i !== nodeIdx) return n;
        const isInternal = nodeIdx > 0 && nodeIdx < (prev.nodes?.length ?? 0) - 1;

        const k1 =
          side === 'top'
            ? line === 1
              ? 'baston_top_1_l1_kind'
              : 'baston_top_1_l2_kind'
            : line === 1
              ? 'baston_bottom_1_l1_kind'
              : 'baston_bottom_1_l2_kind';
        const k2 =
          side === 'top'
            ? line === 1
              ? 'baston_top_2_l1_kind'
              : 'baston_top_2_l2_kind'
            : line === 1
              ? 'baston_bottom_2_l1_kind'
              : 'baston_bottom_2_l2_kind';

        // Regla: si uno es "Continuo", el otro también (solo nodos internos)
        if (isInternal && kind === 'continuous') {
          return { ...n, [k1]: 'continuous', [k2]: 'continuous' } as any;
        }

        const key = end === 1 ? k1 : k2;
        return { ...n, [key]: kind } as any;
      });
      return normalizeDev({ ...prev, nodes } as DevelopmentIn, appCfg);
    });
  }

  function setNodeBastonLineToFace(nodeIdx: number, side: 'top' | 'bottom', end: 1 | 2, line: 1 | 2, enabled: boolean) {
    const key =
      side === 'top'
        ? end === 1
          ? line === 1
            ? 'baston_top_1_l1_to_face'
            : 'baston_top_1_l2_to_face'
          : line === 1
            ? 'baston_top_2_l1_to_face'
            : 'baston_top_2_l2_to_face'
        : end === 1
          ? line === 1
            ? 'baston_bottom_1_l1_to_face'
            : 'baston_bottom_1_l2_to_face'
          : line === 1
            ? 'baston_bottom_2_l1_to_face'
            : 'baston_bottom_2_l2_to_face';

    setDev((prev) => {
      const nodes = (prev.nodes ?? []).map((n, i) => (i === nodeIdx ? ({ ...n, [key]: enabled } as any) : n));
      return normalizeDev({ ...prev, nodes } as DevelopmentIn, appCfg);
    });
  }

  function setNodeToFace(nodeIdx: number, side: 'top' | 'bottom', end: 1 | 2, enabled: boolean) {
    const key =
      side === 'top'
        ? end === 1
          ? 'steel_top_1_to_face'
          : 'steel_top_2_to_face'
        : end === 1
          ? 'steel_bottom_1_to_face'
          : 'steel_bottom_2_to_face';

    setDev((prev) => {
      const nodes = (prev.nodes ?? []).map((n, i) => (i === nodeIdx ? ({ ...n, [key]: enabled } as any) : n));
      return normalizeDev({ ...prev, nodes } as DevelopmentIn, appCfg);
    });
  }

  function addSpan() {
    setDev((prev) => {
      const spans0 = prev.spans ?? [];
      const nodes0 = prev.nodes ?? [];
      const lastSpan = spans0.length ? spans0[spans0.length - 1] : INITIAL_SPAN;
      const lastNode = nodes0.length ? nodes0[nodes0.length - 1] : INITIAL_NODE;

      const spans = [...spans0, cloneSpan(lastSpan)];
      const nodes = [...nodes0, cloneNode(lastNode)];
      return normalizeDev({ ...prev, spans, nodes } as DevelopmentIn, appCfg);
    });
  }

  function clearDevelopment() {
    const ok = window.confirm('¿Limpiar todos los datos y empezar un nuevo desarrollo?');
    if (!ok) return;
    setError(null);
    setWarning(null);
    setSelection({ kind: 'none' });
    setViewport(null);
    setConcretoLocked(false);
    setDev(defaultDevelopment(appCfg));
  }

  function removeSpan(spanIdx: number) {
    setDev((prev) => {
      const spans = (prev.spans ?? []).filter((_, i) => i !== spanIdx);
      return normalizeDev({ ...prev, spans } as DevelopmentIn, appCfg);
    });
  }

  async function onExportDxf() {
    try {
      setBusy(true);
      const blob = await exportDxf({ ...payload, savedCuts }, { cascoLayer, steelLayer, drawSteel });
      downloadBlob(blob, `beamdrawing-${(dev.name ?? 'desarrollo').replace(/\s+/g, '_')}.dxf`);
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }

  async function onUploadTemplate(file: File) {
    try {
      setBusy(true);
      setError(null);
      const info = await uploadTemplateDxf(file);
      setTemplateName(info.filename);
      setTemplateLayers(info.layers ?? []);

      if (info.layers?.length && !info.layers.includes(cascoLayer)) {
        setCascoLayer(info.layers.includes('A-BEAM-CASCO') ? 'A-BEAM-CASCO' : info.layers[0]);
      }
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }

  async function onClearTemplate() {
    try {
      setBusy(true);
      setError(null);
      await clearTemplateDxf();
      setTemplateName(null);
      setTemplateLayers([]);
      setCascoLayer('A-BEAM-CASCO');
      setSteelLayer('A-REBAR-CORRIDO');
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }

  async function onImportDxfFile(file: File) {
    try {
      setBusy(true);
      setError(null);
      setWarning(null);
      const res = await importDxf(file);
      // El DXF define geometría (L y nodos). Mantén h/b según el Tramo 1 actual.
      const span1 = (dev.spans ?? [])[0] ?? INITIAL_SPAN;
      const h0 = span1.h;
      const b0 = span1.b ?? INITIAL_SPAN.b ?? 0;
      const incoming: DevelopmentIn = {
        ...res.development,
        floor_start: (dev as any).floor_start ?? '6to',
        floor_end: (dev as any).floor_end ?? '9no',
        spans: (res.development.spans ?? []).map((s) => ({ ...s, h: h0, b: b0 })),
      };
      setDev(normalizeDev(incoming, appCfg));
      if (res.warnings?.length) setWarning(res.warnings.join('\n'));
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }

  function applyJsonToForm() {
    const parsed = safeParseJson<PreviewRequest>(jsonText);
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    if (!parsed.value.developments?.length) {
      setError('JSON no contiene developments');
      return;
    }

    const incoming = parsed.value.developments[0];
    const nextCfg: AppConfig = {
      d: clampNumber(incoming.d ?? appCfg.d, appCfg.d),
      unit_scale: clampNumber(incoming.unit_scale ?? appCfg.unit_scale, appCfg.unit_scale),
      x0: clampNumber(incoming.x0 ?? appCfg.x0, appCfg.x0),
      y0: clampNumber(incoming.y0 ?? appCfg.y0, appCfg.y0),
      recubrimiento: clampNumber(
        (incoming as any).recubrimiento ?? (incoming as any).steel_cover_top ?? (incoming as any).steel_cover_bottom ?? appCfg.recubrimiento,
        appCfg.recubrimiento
      ),
      baston_Lc: clampNumber((incoming as any).baston_Lc ?? (incoming as any).bastonLc ?? appCfg.baston_Lc, appCfg.baston_Lc),
    };
    setAppCfg(nextCfg);
    setDev(normalizeDev(incoming, nextCfg));
    setError(null);
  }

  return (
    <div className="layout">
      <header className="header">
        <div>
          <div className="title">AUBUILD - MASCON TECH.</div>
          <div className="subtitle">Config / Concreto / Acero / JSON</div>
        </div>

        {/* Indicador de guardado */}
        {saveStatus && (
          <div className={`saveIndicator saveIndicator--${saveStatus}`}>
            {saveStatus === 'saving' && (
              <span>💾 Guardando {dev.name ?? 'DESARROLLO 01'}...</span>
            )}
            {saveStatus === 'saved' && (
              <span>✅ {dev.name ?? 'DESARROLLO 01'} guardado</span>
            )}
            {saveStatus === 'error' && (
              <span>❌ Error al guardar {dev.name ?? 'DESARROLLO 01'}</span>
            )}
          </div>
        )}

        <div className="actions">
          <div className="segmented">
            <button className={tab === 'config' ? 'segBtn segBtnActive' : 'segBtn'} onClick={() => setTab('config')} type="button">
              Config
            </button>
            <button className={tab === 'concreto' ? 'segBtn segBtnActive' : 'segBtn'} onClick={() => setTab('concreto')} type="button">
              Concreto
            </button>
            <button className={tab === 'acero' ? 'segBtn segBtnActive' : 'segBtn'} onClick={() => setTab('acero')} type="button">
              Acero
            </button>
            <button className={tab === 'json' ? 'segBtn segBtnActive' : 'segBtn'} onClick={() => setTab('json')} type="button">
              JSON
            </button>
          </div>

          <button className="btn" onClick={onExportDxf} type="button" disabled={busy}>
            Exportar DXF
          </button>
        </div>
      </header>

      <main className="content">
        <section className="panel">
          <div className="panelTitle">EDITOR DE DESARROLLO DE VIGA.</div>

          {tab === 'config' ? (
            <div className="form">
              <div className="muted">Config general (solo estos parámetros).</div>
              <div className="grid4">
                <label className="field">
                  <div className="label">d</div>
                  <input className="input" type="number" step="0.01" value={appCfg.d} onChange={(e) => setAppCfg((p) => ({ ...p, d: clampNumber(e.target.value, p.d) }))} />
                </label>
                <label className="field">
                  <div className="label">unit_scale</div>
                  <input
                    className="input"
                    type="number"
                    step="0.1"
                    value={appCfg.unit_scale}
                    onChange={(e) => setAppCfg((p) => ({ ...p, unit_scale: clampNumber(e.target.value, p.unit_scale) }))}
                  />
                </label>
                <label className="field">
                  <div className="label">x0</div>
                  <input className="input" type="number" step="0.01" value={appCfg.x0} onChange={(e) => setAppCfg((p) => ({ ...p, x0: clampNumber(e.target.value, p.x0) }))} />
                </label>
                <label className="field">
                  <div className="label">y0</div>
                  <input className="input" type="number" step="0.01" value={appCfg.y0} onChange={(e) => setAppCfg((p) => ({ ...p, y0: clampNumber(e.target.value, p.y0) }))} />
                </label>

                <label className="field">
                  <div className="label">recubrimiento (m)</div>
                  <input
                    className="input"
                    type="number"
                    step="0.01"
                    value={appCfg.recubrimiento}
                    onChange={(e) => setAppCfg((p) => ({ ...p, recubrimiento: clampNumber(e.target.value, p.recubrimiento) }))}
                  />
                </label>

                <label className="field">
                  <div className="label">Lc bastón (m)</div>
                  <input
                    className="input"
                    type="number"
                    step="0.01"
                    value={appCfg.baston_Lc}
                    onChange={(e) => setAppCfg((p) => ({ ...p, baston_Lc: clampNumber(e.target.value, p.baston_Lc) }))}
                  />
                </label>

                <label className="field">
                  <div className="label">L6 gancho (m)</div>
                  <input className="input" type="number" step="0.01" value={hookLegDraft} onChange={(e) => setHookLegDraft(e.target.value)} />
                </label>
              </div>

              <div className="hint"></div>
              <div className="sectionHeader">
                <div>Texto acero</div>
                <div className="mutedSmall">Vacío = usar formato de la plantilla DXF</div>
              </div>

              <div className="grid4">
                <label className="field">
                  <div className="label">steel_text_layer</div>
                  <input className="input" type="text" value={steelTextLayerDraft} onChange={(e) => setSteelTextLayerDraft(e.target.value)} />
                </label>
                <label className="field">
                  <div className="label">steel_text_style</div>
                  <input className="input" type="text" value={steelTextStyleDraft} onChange={(e) => setSteelTextStyleDraft(e.target.value)} />
                </label>
                <label className="field">
                  <div className="label">steel_text_height</div>
                  <input className="input" type="number" step="0.01" value={steelTextHeightDraft} onChange={(e) => setSteelTextHeightDraft(e.target.value)} />
                </label>
                <label className="field">
                  <div className="label">steel_text_width</div>
                  <input className="input" type="number" step="0.01" value={steelTextWidthDraft} onChange={(e) => setSteelTextWidthDraft(e.target.value)} />
                </label>
                <label className="field">
                  <div className="label">steel_text_oblique</div>
                  <input className="input" type="number" step="1" value={steelTextObliqueDraft} onChange={(e) => setSteelTextObliqueDraft(e.target.value)} />
                </label>
                <label className="field">
                  <div className="label">steel_text_rotation</div>
                  <input className="input" type="number" step="1" value={steelTextRotationDraft} onChange={(e) => setSteelTextRotationDraft(e.target.value)} />
                </label>
              </div>

              <div className="hint"></div>
              <div className="sectionHeader">
                <div>Exportación DXF</div>
                <div className="mutedSmall">Plantilla + asignación de capas (casco y acero opcional)</div>
              </div>

              <div className="grid4">
                <label className="field">
                  <div className="label">Proyección losa offset (m, hacia abajo)</div>
                  <input className="input" type="number" step="0.01" value={slabProjOffsetDraft} onChange={(e) => setSlabProjOffsetDraft(e.target.value)} />
                </label>
                <label className="field">
                  <div className="label">Proyección losa capa</div>
                  <select className="input" value={slabProjLayerDraft} onChange={(e) => setSlabProjLayerDraft(e.target.value)}>
                    {Array.from(new Set(['A-BEAM-LOSA-PROY', ...(templateLayers ?? [])])).map((ly) => (
                      <option key={ly} value={ly}>
                        {ly}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="rowBetween" style={{ gap: 10, alignItems: 'center' }}>
                <div className="mutedSmall">
                  Plantilla: <span className="mono">{templateName ?? '—'}</span>
                </div>

                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btnSmall" type="button" onClick={() => templateInputRef.current?.click()} disabled={busy}>
                    Cargar plantilla DXF
                  </button>
                  <button className="btnSmall" type="button" onClick={onClearTemplate} disabled={busy || !templateName}>
                    Quitar plantilla
                  </button>
                  <input
                    ref={templateInputRef}
                    type="file"
                    accept=".dxf"
                    style={{ display: 'none' }}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      e.target.value = '';
                      if (f) onUploadTemplate(f);
                    }}
                  />
                </div>
              </div>

              <div className="grid4">
                <label className="field">
                  <div className="label">Capa Casco</div>
                  <select className="input" value={cascoLayer} onChange={(e) => setCascoLayer(e.target.value)}>
                    {Array.from(new Set(['A-BEAM-CASCO', ...(templateLayers ?? [])])).map((ly) => (
                      <option key={ly} value={ly}>
                        {ly}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="field">
                  <div className="label">Capa Acero</div>
                  <select className="input" value={steelLayer} onChange={(e) => setSteelLayer(e.target.value)} disabled={!drawSteel}>
                    {Array.from(new Set(['A-REBAR-CORRIDO', ...(templateLayers ?? [])])).map((ly) => (
                      <option key={ly} value={ly}>
                        {ly}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="field" style={{ justifyContent: 'flex-end' }}>
                  <div className="label">Dibujar acero</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, height: 36 }}>
                    <input type="checkbox" checked={drawSteel} onChange={(e) => setDrawSteel(e.target.checked)} />
                    <div className="mutedSmall">{drawSteel ? 'Incluye' : 'Solo concreto'}</div>
                  </div>
                </label>
              </div>
            </div>
          ) : null}

          {tab === 'concreto' ? (
            <div className="form">
              <div className="rowBetween">
                <div className="muted"></div>
              </div>

              <div className="nameRow">
                <label className="field nameField">
                  <div className="label">Nombre</div>
                  <input className="input" value={dev.name ?? ''} readOnly={true} />
                </label>
                <div className="nameActions">
                  {(() => {
                    const levelType = (((dev as any).level_type ?? 'piso') as string).toLowerCase() as LevelType;
                    const pisos = Array.from({ length: 30 }, (_, i) => formatOrdinalEs(i + 1));
                    return (
                      <>
                        <label className="field" style={{ width: 140 }}>
                          <div className="label">Tipo</div>
                          <select
                            className="input"
                            value={levelType}
                            disabled={concretoLocked}
                            onChange={(e) => updateDevPatch({ level_type: e.target.value as any } as any)}
                          >
                            <option value="sotano">Sótano</option>
                            <option value="piso">Piso</option>
                            <option value="azotea">Azotea</option>
                          </select>
                        </label>
                        <label className="field" style={{ width: 120 }}>
                          <div className="label">Número</div>
                          <input
                            className="input"
                            type="number"
                            min={1}
                            step={1}
                            value={String((dev as any).beam_no ?? 1)}
                            disabled={concretoLocked}
                            onChange={(e) => updateDevPatch({ beam_no: clampInt(e.target.value, (dev as any).beam_no ?? 1) } as any)}
                          />
                        </label>

                        {levelType !== 'azotea' ? (
                          <>
                        <label className="field" style={{ width: 120 }}>
                          <div className="label">Piso inicial</div>
                          <select
                            className="input"
                            value={(dev as any).floor_start ?? '6to'}
                            disabled={concretoLocked}
                            onChange={(e) => updateDevPatch({ floor_start: e.target.value } as any)}
                          >
                            {pisos.map((p) => (
                              <option key={`fs-${p}`} value={p}>
                                {p}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="field" style={{ width: 120 }}>
                          <div className="label">Piso final</div>
                          <select
                            className="input"
                            value={(dev as any).floor_end ?? '9no'}
                            disabled={concretoLocked}
                            onChange={(e) => updateDevPatch({ floor_end: e.target.value } as any)}
                          >
                            {pisos.map((p) => (
                              <option key={`fe-${p}`} value={p}>
                                {p}
                              </option>
                            ))}
                          </select>
                        </label>
                          </>
                        ) : null}
                      </>
                    );
                  })()}
                  <button className="btnSmall" type="button" onClick={addSpan} disabled={concretoLocked}>
                    Añadir Tramo
                  </button>
                  <button
                    className="btnSmall"
                    type="button"
                    onClick={() => dxfInputRef.current?.click()}
                    disabled={busy}
                    title="Importar DXF (una viga)"
                  >
                    Importa DXF
                  </button>
                  <button className="btnSmall" type="button" onClick={clearDevelopment} disabled={busy} title="Reiniciar el desarrollo">
                    Limpiar
                  </button>
                  <input
                    ref={dxfInputRef}
                    type="file"
                    accept=".dxf"
                    style={{ display: 'none' }}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      e.target.value = '';
                      if (f) onImportDxfFile(f);
                    }}
                  />
                  <label className="toggle toggleTight" title={concretoLocked ? 'Edición bloqueada' : 'Edición habilitada'}>
                    <input type="checkbox" checked={concretoLocked} onChange={(e) => setConcretoLocked(e.target.checked)} />
                    <span>{concretoLocked ? '🔒' : '🔓'}</span>
                  </label>
                  <label className="toggle toggleTight" title="Mostrar marcadores N/T">
                    <input type="checkbox" checked={showNT} onChange={(e) => setShowNT(e.target.checked)} />
                    <span>N/T</span>
                  </label>
                  <label className="toggle toggleTight" title="Correlación tablas ↔ gráfico (selección + zoom)">
                    <input type="checkbox" checked={zoomEnabled} onChange={(e) => setZoomEnabled(e.target.checked)} />
                    <span>Zoom</span>
                  </label>
                </div>
              </div>

              <div className="twoCol">
                <div>
                  <div className="sectionHeader">
                    <div>Tramos</div>
                  </div>

                  <div className="matrix" style={{ gridTemplateColumns: `110px repeat(${(dev.spans ?? []).length}, 110px)` }}>
                    <div className="cell head"></div>
                    {(dev.spans ?? []).map((_, i) => (
                      <div className={selection.kind === 'span' && selection.index === i ? 'cell head cellSelected' : 'cell head'} key={`span-head-${i}`}>
                        <div className="colHead">
                          <div className="mono">Tramo {i + 1}</div>
                          <button className="btnX" type="button" title="Quitar tramo" onClick={() => removeSpan(i)} disabled={concretoLocked}>
                            ✕
                          </button>
                        </div>
                      </div>
                    ))}

                    <div className="cell rowLabel">L (m)</div>
                    {(dev.spans ?? []).map((s, i) => (
                      <div className={selection.kind === 'span' && selection.index === i ? 'cell cellSelected' : 'cell'} key={`span-L-${i}`}>
                        <input
                          className="cellInput"
                          type="number"
                          step="0.01"
                          value={s.L}
                          readOnly={concretoLocked}
                          onChange={(e) => updateSpan(i, { L: clampNumber(e.target.value, s.L) })}
                          onKeyDown={(e) => onGridKeyDown(e, 'spans', 0, i, 3, spansCols)}
                          onFocus={(e) => {
                            applySelection({ kind: 'span', index: i }, true);
                            (e.target as HTMLInputElement).select?.();
                          }}
                          data-grid="spans"
                          data-row={0}
                          data-col={i}
                        />
                      </div>
                    ))}

                    <div className="cell rowLabel">h (m)</div>
                    {(dev.spans ?? []).map((s, i) => (
                      <div className={selection.kind === 'span' && selection.index === i ? 'cell cellSelected' : 'cell'} key={`span-h-${i}`}>
                        <input
                          className="cellInput"
                          type="number"
                          step="0.01"
                          value={s.h}
                          readOnly={concretoLocked}
                          onChange={(e) => updateSpan(i, { h: clampNumber(e.target.value, s.h) })}
                          onKeyDown={(e) => onGridKeyDown(e, 'spans', 1, i, 3, spansCols)}
                          onFocus={(e) => {
                            applySelection({ kind: 'span', index: i }, true);
                            (e.target as HTMLInputElement).select?.();
                          }}
                          data-grid="spans"
                          data-row={1}
                          data-col={i}
                        />
                      </div>
                    ))}

                    <div className="cell rowLabel">b (m)</div>
                    {(dev.spans ?? []).map((s, i) => (
                      <div className={selection.kind === 'span' && selection.index === i ? 'cell cellSelected' : 'cell'} key={`span-b-${i}`}>
                        <input
                          className="cellInput"
                          type="number"
                          step="0.01"
                          value={s.b ?? 0}
                          readOnly={concretoLocked}
                          onChange={(e) => updateSpan(i, { b: clampNumber(e.target.value, s.b ?? 0) })}
                          onKeyDown={(e) => onGridKeyDown(e, 'spans', 2, i, 3, spansCols)}
                          onFocus={(e) => {
                            applySelection({ kind: 'span', index: i }, true);
                            (e.target as HTMLInputElement).select?.();
                          }}
                          data-grid="spans"
                          data-row={2}
                          data-col={i}
                        />
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="sectionHeader">
                    <div>Nodos</div>
                    <div className="mutedSmall">Nodos = Tramos + 1</div>
                  </div>

                  <div className="matrix" style={{ gridTemplateColumns: `110px repeat(${(dev.nodes ?? []).length}, 110px)` }}>
                    <div className="cell head"></div>
                    {(dev.nodes ?? []).map((_, i) => (
                      <div className={selection.kind === 'node' && selection.index === i ? 'cell head cellSelected' : 'cell head'} key={`node-head-${i}`}>
                        <div className="mono">Nodo {i + 1}</div>
                      </div>
                    ))}
                    <div className="cell rowLabel">X1 superior (b1)</div>
                    {(dev.nodes ?? []).map((n, i) => (
                      <div className={selection.kind === 'node' && selection.index === i ? 'cell cellSelected' : 'cell'} key={`node-b1-${i}`}>
                        <input
                          className="cellInput"
                          type="number"
                          step="0.01"
                          value={n.b1}
                          readOnly={concretoLocked}
                          onChange={(e) => updateNode(i, { b1: clampNumber(e.target.value, n.b1) })}
                          onKeyDown={(e) => onGridKeyDown(e, 'nodes', 0, i, 5, nodesCols)}
                          onFocus={(e) => {
                            applySelection({ kind: 'node', index: i }, true);
                            (e.target as HTMLInputElement).select?.();
                          }}
                          data-grid="nodes"
                          data-row={0}
                          data-col={i}
                        />
                      </div>
                    ))}

                    <div className="cell rowLabel">X2 superior (b2)</div>
                    {(dev.nodes ?? []).map((n, i) => (
                      <div className={selection.kind === 'node' && selection.index === i ? 'cell cellSelected' : 'cell'} key={`node-b2-${i}`}>
                        <input
                          className="cellInput"
                          type="number"
                          step="0.01"
                          value={n.b2}
                          readOnly={concretoLocked}
                          onChange={(e) => updateNode(i, { b2: clampNumber(e.target.value, n.b2) })}
                          onKeyDown={(e) => onGridKeyDown(e, 'nodes', 1, i, 5, nodesCols)}
                          onFocus={(e) => {
                            applySelection({ kind: 'node', index: i }, true);
                            (e.target as HTMLInputElement).select?.();
                          }}
                          data-grid="nodes"
                          data-row={1}
                          data-col={i}
                        />
                      </div>
                    ))}

                    <div className="cell rowLabel">proj Superior</div>
                    {(dev.nodes ?? []).map((n, i) => (
                      <div className={selection.kind === 'node' && selection.index === i ? 'cell cellSelected' : 'cell'} key={`node-pb-${i}`}>
                        <label className="check">
                          <input
                            type="checkbox"
                            checked={n.project_b ?? true}
                            disabled={concretoLocked}
                            onChange={(e) => updateNode(i, { project_b: e.target.checked })}
                            onKeyDown={(e) => onGridKeyDown(e as any, 'nodes', 2, i, 5, nodesCols)}
                            onFocus={() => applySelection({ kind: 'node', index: i }, true)}
                            data-grid="nodes"
                            data-row={2}
                            data-col={i}
                          />
                        </label>
                      </div>
                    ))}

                    <div className="cell rowLabel">X2 inferior (a2)</div>
                    {(dev.nodes ?? []).map((n, i) => (
                      <div className={selection.kind === 'node' && selection.index === i ? 'cell cellSelected' : 'cell'} key={`node-a2-${i}`}>
                        <input
                          className="cellInput"
                          type="number"
                          step="0.01"
                          value={n.a2}
                          readOnly={concretoLocked}
                          onChange={(e) => updateNode(i, { a2: clampNumber(e.target.value, n.a2) })}
                          onKeyDown={(e) => onGridKeyDown(e, 'nodes', 3, i, 5, nodesCols)}
                          onFocus={(e) => {
                            applySelection({ kind: 'node', index: i }, true);
                            (e.target as HTMLInputElement).select?.();
                          }}
                          data-grid="nodes"
                          data-row={3}
                          data-col={i}
                        />
                      </div>
                    ))}

                    <div className="cell rowLabel">proj Inferior</div>
                    {(dev.nodes ?? []).map((n, i) => (
                      <div className={selection.kind === 'node' && selection.index === i ? 'cell cellSelected' : 'cell'} key={`node-pa-${i}`}>
                        <label className="check">
                          <input
                            type="checkbox"
                            checked={n.project_a ?? true}
                            disabled={concretoLocked}
                            onChange={(e) => updateNode(i, { project_a: e.target.checked })}
                            onKeyDown={(e) => onGridKeyDown(e as any, 'nodes', 4, i, 5, nodesCols)}
                            onFocus={() => applySelection({ kind: 'node', index: i }, true)}
                            data-grid="nodes"
                            data-row={4}
                            data-col={i}
                          />
                        </label>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="hint"></div>
            </div>
          ) : null}

          {tab === 'acero' ? (
            <div className="form">
              <div className="muted">
                <b>Acero corrido</b> (por tramo). Se dibuja en cyan en la Vista previa 2D.
              </div>

              <div>
                <div className="sectionHeader">
                  <div>Distribución en sección (E.060)</div>
                  <div className="mutedSmall">Auto-optimizada (esquinas primero + simetría). Editable y persistible.</div>
                </div>

                {(() => {
                  const s = getSteelLayoutSettings(dev);
                  const dag = clampNumber((s as any).dag_cm ?? 2.5, 2.5);
                  const maxRows = Math.max(1, Math.min(3, Math.round(clampNumber((s as any).max_rows_per_face ?? 3, 3))));
                  const usePractical = Boolean((s as any).use_practical_min ?? true);
                  const practicalMin = clampNumber((s as any).practical_min_cm ?? 4.0, 4.0);

                  return (
                    <>
                      <div className="row" style={{ display: 'grid', gridTemplateColumns: '200px 160px 200px 160px', gap: 10, alignItems: 'center' }}>
                        <div className="mutedSmall">Dag (cm)</div>
                        <input
                          className="cellInput"
                          type="number"
                          step="0.1"
                          min={0.5}
                          value={String(dag)}
                          onChange={(e) => {
                            const next = clampNumber(e.target.value, dag);
                            updateDevPatch({ steel_layout_settings: { ...s, dag_cm: Math.max(0.5, next) } as any } as any);
                          }}
                        />

                        <div className="mutedSmall">Máx. filas por cara</div>
                        <input
                          className="cellInput"
                          type="number"
                          step="1"
                          min={1}
                          max={3}
                          value={String(maxRows)}
                          onChange={(e) => {
                            const next = Math.max(1, Math.min(3, Math.round(clampNumber(e.target.value, maxRows))));
                            updateDevPatch({ steel_layout_settings: { ...s, max_rows_per_face: next } as any } as any);
                          }}
                        />
                      </div>

                      <div className="row" style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: 10, alignItems: 'center', marginTop: 8 }}>
                        <label className="check" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                          <input
                            type="checkbox"
                            checked={usePractical}
                            onChange={(e) => updateDevPatch({ steel_layout_settings: { ...s, use_practical_min: e.target.checked } as any } as any)}
                          />
                          <span className="mutedSmall">Aplicar mínimo práctico (≥ 4.0 cm)</span>
                        </label>

                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div className="mutedSmall">Mín. práctico (cm)</div>
                          <input
                            className="cellInput"
                            style={{ maxWidth: 120 }}
                            type="number"
                            step="0.1"
                            min={2.5}
                            value={String(practicalMin)}
                            disabled={!usePractical}
                            onChange={(e) => {
                              const next = clampNumber(e.target.value, practicalMin);
                              updateDevPatch({ steel_layout_settings: { ...s, practical_min_cm: Math.max(2.5, next) } as any } as any);
                            }}
                          />
                        </div>
                      </div>

                      <div style={{ marginTop: 10 }}>
                        <div className="mutedSmall" style={{ marginBottom: 6 }}>
                          Avanzado (JSON): reglas de columnas por ancho + tabla de diámetros reales (cm).
                        </div>
                        <textarea
                          className="cellInput"
                          style={{ width: '100%', minHeight: 160, fontFamily: 'ui-monospace, Menlo, Consolas, monospace' }}
                          value={steelLayoutDraft}
                          onChange={(e) => {
                            steelLayoutDraftDirtyRef.current = true;
                            setSteelLayoutDraft(e.target.value);
                          }}
                          onBlur={() => {
                            const parsed = safeParseJson<SteelLayoutSettings>(steelLayoutDraft);
                            steelLayoutDraftDirtyRef.current = false;
                            if (!parsed.ok) {
                              setWarning(`Layout JSON inválido: ${parsed.error}`);
                              return;
                            }
                            setWarning(null);
                            updateDevPatch({ steel_layout_settings: parsed.value as any } as any);
                          }}
                        />
                      </div>
                    </>
                  );
                })()}
              </div>

              <div>
                <div className="sectionHeader">
                  <div>Acero corrido por tramo</div>
                  <div className="mutedSmall">Cantidad y diámetro por cada línea (sup/inf)</div>
                </div>

                <div className="matrix" style={{ gridTemplateColumns: `160px repeat(${(dev.spans ?? []).length}, 130px)` }}>
                  <div className="cell head"></div>
                  {(dev.spans ?? []).map((_, i) => (
                    <div className={'cell head'} key={`steel-span-head-${i}`}>
                      <div className="mono">Tramo {i + 1}</div>
                    </div>
                  ))}

                  <div className="cell rowLabel">Superior: Cantidad</div>
                  {(dev.spans ?? []).map((s, i) => (
                    <div className="cell" key={`steel-top-qty-${i}`}>
                      <input
                        className="cellInput"
                        type="number"
                        step="1"
                        min={1}
                        value={(s.steel_top?.qty ?? 3) as any}
                        onChange={(e) => updateSpanSteel(i, 'top', { qty: Math.max(1, clampNumber(e.target.value, s.steel_top?.qty ?? 3)) })}
                      />
                    </div>
                  ))}

                  <div className="cell rowLabel">Superior: Diámetro</div>
                  {(dev.spans ?? []).map((s, i) => (
                    <div className="cell" key={`steel-top-dia-${i}`}>
                      <select
                        className="cellInput"
                        value={String(s.steel_top?.diameter ?? '3/4')}
                        onChange={(e) => updateSpanSteel(i, 'top', { diameter: e.target.value })}
                      >
                        <option value="3/8">3/8</option>
                        <option value="1/2">1/2</option>
                        <option value="5/8">5/8</option>
                        <option value="3/4">3/4</option>
                        <option value="1">1</option>
                      </select>
                    </div>
                  ))}

                  <div className="cell rowLabel">Inferior: Cantidad</div>
                  {(dev.spans ?? []).map((s, i) => (
                    <div className="cell" key={`steel-bot-qty-${i}`}>
                      <input
                        className="cellInput"
                        type="number"
                        step="1"
                        min={1}
                        value={(s.steel_bottom?.qty ?? 3) as any}
                        onChange={(e) => updateSpanSteel(i, 'bottom', { qty: Math.max(1, clampNumber(e.target.value, s.steel_bottom?.qty ?? 3)) })}
                      />
                    </div>
                  ))}

                  <div className="cell rowLabel">Inferior: Diámetro</div>
                  {(dev.spans ?? []).map((s, i) => (
                    <div className="cell" key={`steel-bot-dia-${i}`}>
                      <select
                        className="cellInput"
                        value={String(s.steel_bottom?.diameter ?? '3/4')}
                        onChange={(e) => updateSpanSteel(i, 'bottom', { diameter: e.target.value })}
                      >
                        <option value="3/8">3/8</option>
                        <option value="1/2">1/2</option>
                        <option value="5/8">5/8</option>
                        <option value="3/4">3/4</option>
                        <option value="1">1</option>
                      </select>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <div className="sectionHeader">
                  <div>Estribos en sección por tramo</div>
                  <div className="mutedSmall">Rectangular concéntrico. Afecta el recubrimiento efectivo del layout.</div>
                </div>

                <div className="matrix" style={{ gridTemplateColumns: `160px repeat(${(dev.spans ?? []).length}, 130px)` }}>
                  <div className="cell head"></div>
                  {(dev.spans ?? []).map((_, i) => (
                    <div className={'cell head'} key={`stsec-span-head-${i}`}>
                      <div className="mono">Tramo {i + 1}</div>
                    </div>
                  ))}

                  <div className="cell rowLabel">Cantidad (concéntricos)</div>
                  {(dev.spans ?? []).map((s, i) => (
                    <div className="cell" key={`stsec-qty-${i}`}>
                      <input
                        className="cellInput"
                        type="number"
                        step="1"
                        min={0}
                        value={(s as any).stirrups_section?.qty ?? 1}
                        onChange={(e) => {
                          const next = Math.max(0, Math.floor(clampNumber(e.target.value, (s as any).stirrups_section?.qty ?? 1)));
                          updateSpanStirrupsSection(i, { qty: next });
                        }}
                      />
                    </div>
                  ))}

                  <div className="cell rowLabel">Diámetro</div>
                  {(dev.spans ?? []).map((s, i) => (
                    <div className="cell" key={`stsec-dia-${i}`}>
                      <select
                        className="cellInput"
                        value={String((s as any).stirrups_section?.diameter ?? '3/8')}
                        onChange={(e) => updateSpanStirrupsSection(i, { diameter: e.target.value })}
                      >
                        <option value="3/8">3/8</option>
                        <option value="1/2">1/2</option>
                        <option value="5/8">5/8</option>
                        <option value="3/4">3/4</option>
                        <option value="1">1</option>
                      </select>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <div className="sectionHeader">
                  <div>Conexión en nodos (hacia el siguiente tramo)</div>
                  <div className="mutedSmall">Continuo / Gancho / Anclaje (sup/inf)</div>
                </div>

                {(() => {
                  const nodes = dev.nodes ?? [];
                  const slots = buildNodeSlots(nodes);

                  return (
                    <div className="matrix" style={{ gridTemplateColumns: `200px repeat(${slots.length}, 110px)` }}>
                      <div className="cell head"></div>
                      {slots.map((s) => (
                        <div className={'cell head'} key={`steel-node-head-${s.nodeIdx}-${s.end}`}>
                          <div className="mono">{s.label}</div>
                        </div>
                      ))}

                      <div className="cell rowLabel">Superior</div>
                      {slots.map((s) => {
                        const n = nodes[s.nodeIdx];
                        const v = nodeSteelKind(n, 'top', s.end);
                        const toFace = nodeToFaceEnabled(n, 'top', s.end);
                        return (
                          <div className="cell" key={`n-top-sel-${s.nodeIdx}-${s.end}`}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <select
                                className="cellInput"
                                value={v}
                                onChange={(e) => setNodeSteelKind(s.nodeIdx, 'top', s.end, e.target.value as any)}
                              >
                                <option value="continuous">Continuo</option>
                                <option value="hook">Gancho</option>
                                <option value="development">Anclaje</option>
                              </select>
                              <label title="Ajustar gancho/anclaje a la cara del nodo" style={{ display: 'inline-flex', alignItems: 'center' }}>
                                <input
                                  type="checkbox"
                                  checked={toFace}
                                  disabled={v === 'continuous'}
                                  onChange={(e) => setNodeToFace(s.nodeIdx, 'top', s.end, e.target.checked)}
                                />
                              </label>
                            </div>
                          </div>
                        );
                      })}

                      <div className="cell rowLabel">Inferior</div>
                      {slots.map((s) => {
                        const n = nodes[s.nodeIdx];
                        const v = nodeSteelKind(n, 'bottom', s.end);
                        const toFace = nodeToFaceEnabled(n, 'bottom', s.end);
                        return (
                          <div className="cell" key={`n-bot-sel-${s.nodeIdx}-${s.end}`}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <select
                                className="cellInput"
                                value={v}
                                onChange={(e) => setNodeSteelKind(s.nodeIdx, 'bottom', s.end, e.target.value as any)}
                              >
                                <option value="continuous">Continuo</option>
                                <option value="hook">Gancho</option>
                                <option value="development">Anclaje</option>
                              </select>
                              <label title="Ajustar gancho/anclaje a la cara del nodo" style={{ display: 'inline-flex', alignItems: 'center' }}>
                                <input
                                  type="checkbox"
                                  checked={toFace}
                                  disabled={v === 'continuous'}
                                  onChange={(e) => setNodeToFace(s.nodeIdx, 'bottom', s.end, e.target.checked)}
                                />
                              </label>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>

              <div style={{ marginTop: 14 }}>
                <div className="sectionHeader">
                  <div>Conexión en nodos (Bastones Z1 / Z3)</div>
                  <div className="mutedSmall">Configura el extremo en el nodo: *.1 → Z3, *.2 → Z1 (sup/inf)</div>
                </div>

                {(() => {
                  const nodes = dev.nodes ?? [];
                  const spans = dev.spans ?? [];
                  const slots = buildNodeSlots(nodes);

                  const zoneEnabledForSlot = (side: 'top' | 'bottom', s: NodeSlot) => {
                    const spanIdx = s.end === 2 ? s.nodeIdx : s.nodeIdx - 1;
                    const zone = s.end === 2 ? 'z1' : 'z3';
                    const span = spans[spanIdx];
                    if (!span) return false;
                    const b = (span as any).bastones ?? {};
                    const ss = (side === 'top' ? b.top : b.bottom) ?? {};
                    const cfg = normalizeBastonCfg((ss as any)[zone]);
                    return {
                      l1: Boolean(cfg.l1_enabled),
                      l2: Boolean(cfg.l2_enabled),
                    };
                  };

                  const Cell = (props: {
                    slot: NodeSlot;
                    side: 'top' | 'bottom';
                  }) => {
                    const { slot, side } = props;
                    const n = nodes[slot.nodeIdx];
                    const enabled = zoneEnabledForSlot(side, slot);
                    const v1 = nodeBastonLineKind(n, side, slot.end, 1);
                    const v2 = nodeBastonLineKind(n, side, slot.end, 2);
                    const tf1 = nodeBastonLineToFaceEnabled(n, side, slot.end, 1);
                    const tf2 = nodeBastonLineToFaceEnabled(n, side, slot.end, 2);
                    const rowStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 6 };
                    const labelStyle = (isEnabled: boolean): React.CSSProperties => ({
                      width: 22,
                      textAlign: 'right',
                      opacity: isEnabled ? 0.9 : 0.5,
                    });
                    return (
                      <div className="cell" key={`baston-${side}-sel-${slot.nodeIdx}-${slot.end}`}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          <div style={rowStyle}>
                            <div style={labelStyle(enabled.l1)}>L1</div>
                            <select
                              className="cellInput"
                              value={v1}
                              disabled={!enabled.l1}
                              onChange={(e) => setNodeBastonLineKind(slot.nodeIdx, side, slot.end, 1, e.target.value as any)}
                            >
                              <option value="continuous">Continuo</option>
                              <option value="hook">Gancho</option>
                              <option value="development">Anclaje</option>
                            </select>
                            <label title="Ajustar gancho/anclaje a la cara del nodo" style={{ display: 'inline-flex', alignItems: 'center' }}>
                              <input
                                type="checkbox"
                                checked={tf1}
                                disabled={!enabled.l1 || v1 === 'continuous'}
                                onChange={(e) => setNodeBastonLineToFace(slot.nodeIdx, side, slot.end, 1, e.target.checked)}
                              />
                            </label>
                          </div>

                          <div style={rowStyle}>
                            <div style={labelStyle(enabled.l2)}>L2</div>
                            <select
                              className="cellInput"
                              value={v2}
                              disabled={!enabled.l2}
                              onChange={(e) => setNodeBastonLineKind(slot.nodeIdx, side, slot.end, 2, e.target.value as any)}
                            >
                              <option value="continuous">Continuo</option>
                              <option value="hook">Gancho</option>
                              <option value="development">Anclaje</option>
                            </select>
                            <label title="Ajustar gancho/anclaje a la cara del nodo" style={{ display: 'inline-flex', alignItems: 'center' }}>
                              <input
                                type="checkbox"
                                checked={tf2}
                                disabled={!enabled.l2 || v2 === 'continuous'}
                                onChange={(e) => setNodeBastonLineToFace(slot.nodeIdx, side, slot.end, 2, e.target.checked)}
                              />
                            </label>
                          </div>
                        </div>
                      </div>
                    );
                  };
                  return (
                    <div className="matrix" style={{ gridTemplateColumns: `200px repeat(${slots.length}, 180px)` }}>
                      <div className="cell head"></div>
                      {slots.map((s) => (
                        <div className={'cell head'} key={`baston-node-head-${s.nodeIdx}-${s.end}`}>
                          <div className="mono">{s.label}</div>
                        </div>
                      ))}

                      <div className="cell rowLabel">Superior</div>
                      {slots.map((s) => (
                        <Cell slot={s} side="top" key={`baston-top-cell-${s.nodeIdx}-${s.end}`} />
                      ))}

                      <div className="cell rowLabel">Inferior</div>
                      {slots.map((s) => (
                        <Cell slot={s} side="bottom" key={`baston-bot-cell-${s.nodeIdx}-${s.end}`} />
                      ))}
                    </div>
                  );
                })()}
              </div>

              <div style={{ marginTop: 14 }}>
                <div className="sectionHeader">
                  <div>Bastones por zonas</div>
                  <div className="mutedSmall">Z1/Z2/Z3 por tramo (sup/inf). L1= L/5 (Z1,Z3) y L/7 (Z2). Lc configurable en Config.</div>
                </div>

                {(() => {
                  const spans = dev.spans ?? [];
                  const nodes = dev.nodes ?? [];
                  const Lc = clampNumber((dev as any).baston_Lc ?? appCfg.baston_Lc, appCfg.baston_Lc);

                  const zoneLabel = (z: 'z1' | 'z2' | 'z3') => (z === 'z1' ? 'Zona 1' : z === 'z2' ? 'Zona 2' : 'Zona 3');

                  const diameterOptions = (
                    <>
                      <option value="3/8">3/8</option>
                      <option value="1/2">1/2</option>
                      <option value="5/8">5/8</option>
                      <option value="3/4">3/4</option>
                      <option value="1">1</option>
                    </>
                  );

                  const getCfg = (s: SpanIn, side: 'top' | 'bottom', zone: 'z1' | 'z2' | 'z3') => {
                    const b = (s as any).bastones ?? {};
                    const ss = (side === 'top' ? b.top : b.bottom) ?? {};
                    return normalizeBastonCfg((ss as any)[zone]);
                  };

                  const mkLenKey = (spanIdx: number, side: 'top' | 'bottom', zone: 'z1' | 'z2' | 'z3', field: 'L1_m' | 'L2_m' | 'L3_m') =>
                    `baston-len:${spanIdx}:${side}:${zone}:${field}`;

                  const commitLen = (spanIdx: number, side: 'top' | 'bottom', zone: 'z1' | 'z2' | 'z3', field: 'L1_m' | 'L2_m' | 'L3_m', raw: string) => {
                    const s = (raw ?? '').trim();
                    const key = mkLenKey(spanIdx, side, zone, field);

                    // vacío => volver a default (guardado como undefined)
                    if (!s) {
                      updateBaston(spanIdx, side, zone, { [field]: undefined } as any);
                      setBastonLenEdits((prev) => {
                        const next = { ...prev };
                        delete next[key];
                        return next;
                      });
                      return;
                    }

                    const v = clampNumber(s, NaN);
                    if (!(Number.isFinite(v) && v > 0)) {
                      // Si no parsea, no tocar el valor numérico guardado; solo limpiar el draft.
                      setBastonLenEdits((prev) => {
                        const next = { ...prev };
                        delete next[key];
                        return next;
                      });
                      return;
                    }

                    const normalized = snapBastonM(v);
                    updateBaston(spanIdx, side, zone, { [field]: normalized } as any);
                    setBastonLenEdits((prev) => {
                      const next = { ...prev };
                      delete next[key];
                      return next;
                    });
                  };

                  return (
                    <div className="matrix" style={{ gridTemplateColumns: `240px repeat(${spans.length}, 1fr)` }}>
                      <div className="cell head"></div>
                      {spans.map((_, i) => (
                        <div className={'cell head'} key={`baston-head-${i}`}>
                          <div className="mono">Tramo {i + 1}</div>
                        </div>
                      ))}

                      {(['top', 'bottom'] as const).flatMap((side) =>
                        (['z1', 'z2', 'z3'] as const).map((zone) => {
                          const rowKey = `${side}-${zone}`;
                          const rowLabel = `${side === 'top' ? 'Superior' : 'Inferior'}: ${zoneLabel(zone)}`;
                          return (
                            <React.Fragment key={rowKey}>
                              <div className="cell rowLabel">
                                <div>{rowLabel}</div>
                              </div>
                              {spans.map((s, i) => {
                                const cfg = getCfg(s, side, zone);
                                const disabledAll = !cfg.l1_enabled && !cfg.l2_enabled;
                                const L = clampNumber(s?.L ?? 0, 0);
                                const def12 = snapBastonM(L / 5);
                                const def3 = snapBastonM(L / 3);
                                return (
                                  <div className="cell" key={`baston-${rowKey}-${i}`}>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                      {([1, 2] as const).map((line) => {
                                        const enabledKey = line === 1 ? 'l1_enabled' : 'l2_enabled';
                                        const qtyKey = line === 1 ? 'l1_qty' : 'l2_qty';
                                        const diaKey = line === 1 ? 'l1_diameter' : 'l2_diameter';
                                        const enabled = Boolean((cfg as any)[enabledKey]);
                                        return (
                                          <div key={`baston-line-${rowKey}-${i}-${line}`} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                                            <div className="mono" style={{ width: 26, opacity: enabled ? 0.9 : 0.5 }}>
                                              L{line}
                                            </div>

                                            <label title="Habilitar línea">
                                              <input
                                                type="checkbox"
                                                checked={enabled}
                                                onChange={(e) => updateBaston(i, side, zone, { [enabledKey]: e.target.checked } as any)}
                                              />
                                            </label>

                                            <select
                                              className="cellInput"
                                              value={String(Math.max(1, Math.min(3, Math.round(Number((cfg as any)[qtyKey] ?? 1)))))}
                                              disabled={!enabled}
                                              onChange={(e) => updateBaston(i, side, zone, { [qtyKey]: clampNumber(e.target.value, 1) } as any)}
                                              style={{ width: 56 }}
                                              title="Cantidad (1-3)"
                                            >
                                              <option value="1">1</option>
                                              <option value="2">2</option>
                                              <option value="3">3</option>
                                            </select>

                                            <select
                                              className="cellInput"
                                              value={String((cfg as any)[diaKey] ?? '3/4')}
                                              disabled={!enabled}
                                              onChange={(e) => updateBaston(i, side, zone, { [diaKey]: e.target.value } as any)}
                                              style={{ width: 76 }}
                                              title="Diámetro"
                                            >
                                              {diameterOptions}
                                            </select>
                                          </div>
                                        );
                                      })}

                                      {zone === 'z2' ? (
                                        <>
                                          <input
                                            className="cellInput"
                                            style={{ width: 86 }}
                                            type="text"
                                            inputMode="decimal"
                                            placeholder="L1"
                                            disabled={disabledAll}
                                            value={
                                              bastonLenEdits[mkLenKey(i, side, zone, 'L1_m')] ??
                                              (cfg.L1_m == null ? fmt2(def12) : fmt2(snapBastonM(cfg.L1_m)))
                                            }
                                            onChange={(e) => setBastonLenEdits((p) => ({ ...p, [mkLenKey(i, side, zone, 'L1_m')]: e.target.value }))}
                                            onBlur={(e) => commitLen(i, side, zone, 'L1_m', e.target.value)}
                                            title="L1 (m)"
                                          />
                                          <input
                                            className="cellInput"
                                            style={{ width: 86 }}
                                            type="text"
                                            inputMode="decimal"
                                            placeholder="L2"
                                            disabled={disabledAll}
                                            value={
                                              bastonLenEdits[mkLenKey(i, side, zone, 'L2_m')] ??
                                              (cfg.L2_m == null ? fmt2(def12) : fmt2(snapBastonM(cfg.L2_m)))
                                            }
                                            onChange={(e) => setBastonLenEdits((p) => ({ ...p, [mkLenKey(i, side, zone, 'L2_m')]: e.target.value }))}
                                            onBlur={(e) => commitLen(i, side, zone, 'L2_m', e.target.value)}
                                            title="L2 (m)"
                                          />
                                        </>
                                      ) : (
                                        <input
                                          className="cellInput"
                                          style={{ width: 86 }}
                                          type="text"
                                          inputMode="decimal"
                                          placeholder="L3"
                                          disabled={disabledAll}
                                          value={
                                            bastonLenEdits[mkLenKey(i, side, zone, 'L3_m')] ?? (cfg.L3_m == null ? fmt2(def3) : fmt2(snapBastonM(cfg.L3_m)))
                                          }
                                          onChange={(e) => setBastonLenEdits((p) => ({ ...p, [mkLenKey(i, side, zone, 'L3_m')]: e.target.value }))}
                                          onBlur={(e) => commitLen(i, side, zone, 'L3_m', e.target.value)}
                                          title="L3 (m)"
                                        />
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </React.Fragment>
                          );
                        })
                      )}
                    </div>
                  );
                })()}
              </div>

              <div style={{ marginTop: 14 }}>
                <div className="sectionHeader">
                  <div>Estribos (por tramo)</div>
                  <div className="mutedSmall">Parámetros: A, b,B, c,C, R (por extremo)</div>
                </div>

                {(() => {
                  const spans = dev.spans ?? [];
                  const getSt = (s: SpanIn) => (s as any).stirrups ?? {};
                  const caseTypeOf = (st: any) => String(st.case_type ?? 'simetrica');
                  const singleEndOf = (st: any) => String(st.single_end ?? '');
                  const modeOf = (st: any) => {
                    const v = String(st.design_mode ?? 'sismico').trim().toLowerCase();
                    return v === 'gravedad' ? 'gravedad' : 'sismico';
                  };

                  const fmt = (v: number | undefined | null) => (typeof v === 'number' && Number.isFinite(v) ? v.toFixed(2) : '');
                  const fmtInt = (v: number | undefined | null) => (typeof v === 'number' && Number.isFinite(v) ? String(Math.max(0, Math.round(v))) : '');

                  const mkAbcrKey = (spanIdx: number, side: 'L' | 'R', field: 'A' | 'b' | 'B' | 'c' | 'C' | 'R') => `stABCR:${spanIdx}:${side}:${field}`;

                  const defaultSpecTextFor = (span: SpanIn, mode: 'sismico' | 'gravedad') => {
                    const h = clampNumber((span as any).h ?? 0.5, 0.5);
                    return formatStirrupsABCR(pickDefaultABCRForH(h, mode));
                  };

                  const getSpecKeyForSide = (ct: string, side: 'L' | 'R') => {
                    const ctt = String(ct || '').trim().toLowerCase();
                    if (ctt === 'asim_uno') {
                      // UI: L = Especial (left_spec), R = Resto (center_spec)
                      return side === 'L' ? ('left_spec' as const) : ('center_spec' as const);
                    }
                    // simetrica / asim_ambos / fallback
                    return side === 'L' ? ('left_spec' as const) : ('right_spec' as const);
                  };

                  const getABCR = (st: any, key: 'left_spec' | 'center_spec' | 'right_spec'): StirrupsABCR => {
                    const parsed = parseStirrupsABCR(String(st?.[key] ?? '').trim());
                    return (
                      parsed ??
                      ({
                        A_m: 0,
                        b_n: 0,
                        B_m: 0,
                        c_n: 0,
                        C_m: 0,
                        R_m: 0,
                      } as StirrupsABCR)
                    );
                  };

                  const setABCRField = (
                    spanIdx: number,
                    st: any,
                    ct: string,
                    side: 'L' | 'R',
                    field: 'A' | 'b' | 'B' | 'c' | 'C' | 'R',
                    raw: string
                  ) => {
                    const specKey = getSpecKeyForSide(ct, side);
                    const cur = getABCR(st, specKey);

                    const s = String(raw ?? '').trim().replace(',', '.');
                    if (!s) {
                      // limpiar draft; mantener valor previo
                      setStirrupsAbcrEdits((p) => {
                        const k = mkAbcrKey(spanIdx, side, field);
                        const { [k]: _, ...rest } = p;
                        return rest;
                      });
                      return;
                    }

                    let next = { ...cur };
                    if (field === 'b' || field === 'c') {
                      const n = Number.parseInt(s, 10);
                      if (!Number.isFinite(n)) return;
                      if (field === 'b') next.b_n = Math.max(0, n);
                      else next.c_n = Math.max(0, n);
                    } else {
                      const n = Number.parseFloat(s);
                      if (!Number.isFinite(n)) return;
                      if (field === 'A') next.A_m = Math.max(0, n);
                      if (field === 'B') next.B_m = Math.max(0, n);
                      if (field === 'C') next.C_m = Math.max(0, n);
                      if (field === 'R') next.R_m = Math.max(0, n);
                    }

                    const specText = formatStirrupsABCR(next);
                    if (ct === 'simetrica') {
                      // En simétrica, espejo: ambos extremos usan el mismo spec.
                      updateSpanStirrups(spanIdx, { left_spec: specText, right_spec: specText } as any);
                    } else {
                      updateSpanStirrups(spanIdx, { [specKey]: specText } as any);
                    }

                    // limpiar draft al commitear
                    setStirrupsAbcrEdits((p) => {
                      const k = mkAbcrKey(spanIdx, side, field);
                      const { [k]: _, ...rest } = p;
                      return rest;
                    });
                  };

                  return (
                    <div className="matrix" style={{ gridTemplateColumns: `210px repeat(${spans.length}, 280px)` }}>
                      <div className="cell head"></div>
                      {spans.map((_, i) => (
                        <div className={'cell head'} key={`stirrups-head-${i}`}>
                          <div className="mono">Tramo {i + 1}</div>
                        </div>
                      ))}

                      <div className="cell rowLabel">Diámetro</div>
                      {spans.map((s, i) => {
                        const st = getSt(s);
                        const dia = normalizeDiaKey(String(st.diameter ?? '3/8').replace(/[∅Ø\s]/g, '')) || '3/8';
                        return (
                          <div className="cell" key={`st-dia-${i}`}>
                            <select
                              className="cellInput"
                              value={dia}
                              onChange={(e) => updateSpanStirrups(i, { diameter: e.target.value } as any)}
                            >
                              <option value="3/8">3/8</option>
                              <option value="1/2">1/2</option>
                              <option value="5/8">5/8</option>
                              <option value="3/4">3/4</option>
                              <option value="1">1</option>
                            </select>
                          </div>
                        );
                      })}

                      <div className="cell rowLabel">Caso</div>
                      {spans.map((s, i) => {
                        const st = getSt(s);
                        return (
                          <div className="cell" key={`st-case-${i}`}>
                            <select
                              className="cellInput"
                              value={caseTypeOf(st)}
                              onChange={(e) => updateSpanStirrups(i, { case_type: e.target.value as any })}
                            >
                              <option value="simetrica">Simétrica</option>
                              <option value="asim_ambos">Asim (ambos)</option>
                              <option value="asim_uno">Asim (uno)</option>
                            </select>
                          </div>
                        );
                      })}

                      <div className="cell rowLabel">Modo</div>
                      {spans.map((s, i) => {
                        const st = getSt(s);
                        const ct = String(caseTypeOf(st) || '').trim().toLowerCase();
                        const cur = modeOf(st) as 'sismico' | 'gravedad';
                        return (
                          <div className="cell" key={`st-mode-${i}`}>
                            <select
                              className="cellInput"
                              value={cur}
                              onChange={(e) => {
                                const m = (String(e.target.value || '').toLowerCase() === 'gravedad' ? 'gravedad' : 'sismico') as any;
                                const spec = defaultSpecTextFor(s, m);
                                if (ct === 'asim_uno') {
                                  updateSpanStirrups(i, { design_mode: m, left_spec: spec, center_spec: spec, right_spec: null } as any);
                                } else {
                                  updateSpanStirrups(i, { design_mode: m, left_spec: spec, right_spec: spec, center_spec: null } as any);
                                }
                              }}
                            >
                              <option value="sismico">Sísmico</option>
                              <option value="gravedad">Gravedad</option>
                            </select>
                          </div>
                        );
                      })}

                      <div className="cell rowLabel">Single end</div>
                      {spans.map((s, i) => {
                        const st = getSt(s);
                        const ct = caseTypeOf(st);
                        return (
                          <div className="cell" key={`st-single-${i}`}>
                            <select
                              className="cellInput"
                              value={singleEndOf(st)}
                              disabled={ct !== 'asim_uno'}
                              onChange={(e) => updateSpanStirrups(i, { single_end: e.target.value ? (e.target.value as any) : null })}
                            >
                              <option value="">—</option>
                              <option value="left">Left</option>
                              <option value="right">Right</option>
                            </select>
                          </div>
                        );
                      })}

                      {/* ABCR por extremo: cada fila tiene inputs Izq/Der (o Especial/Resto en asim_uno) */}
                      {(
                        [
                          { f: 'A' as const, label: 'A (m)', ph: '0.05', isInt: false },
                          { f: 'b' as const, label: 'b (cant)', ph: '8', isInt: true },
                          { f: 'B' as const, label: 'B (m)', ph: '0.10', isInt: false },
                          { f: 'c' as const, label: 'c (cant)', ph: '5', isInt: true },
                          { f: 'C' as const, label: 'C (m)', ph: '0.15', isInt: false },
                          { f: 'R' as const, label: 'R (m)', ph: '0.25', isInt: false },
                        ] as const
                      ).map((row) => (
                        <React.Fragment key={`st-abcr-row-${row.f}`}>
                          <div className="cell rowLabel">{row.label}</div>
                          {spans.map((s, si) => {
                            const st = getSt(s);
                            const ct = String(caseTypeOf(st) || '').trim().toLowerCase();
                            const leftKey = getSpecKeyForSide(ct, 'L');
                            const rightKey = getSpecKeyForSide(ct, 'R');
                            const abL = getABCR(st, leftKey);
                            const abR = getABCR(st, rightKey);

                            const sideLabelL = ct === 'asim_uno' ? 'Especial' : 'Izq';
                            const sideLabelR = ct === 'asim_uno' ? 'Resto' : 'Der';

                            const valueFor = (ab: StirrupsABCR) => {
                              if (row.f === 'A') return fmt(ab.A_m);
                              if (row.f === 'b') return fmtInt(ab.b_n);
                              if (row.f === 'B') return fmt(ab.B_m);
                              if (row.f === 'c') return fmtInt(ab.c_n);
                              if (row.f === 'C') return fmt(ab.C_m);
                              return fmt(ab.R_m);
                            };

                            const kL = mkAbcrKey(si, 'L', row.f);
                            const kR = mkAbcrKey(si, 'R', row.f);

                            const disabledR = ct === 'simetrica';

                            return (
                              <div className="cell" key={`st-abcr-${row.f}-${si}`}>
                                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                                    <span className="mutedSmall" style={{ minWidth: 56 }}>{sideLabelL}</span>
                                    <input
                                      className="cellInput"
                                      style={{ width: 86 }}
                                      type="text"
                                      inputMode={row.isInt ? 'numeric' : 'decimal'}
                                      placeholder={row.ph}
                                      value={stirrupsAbcrEdits[kL] ?? valueFor(abL)}
                                      onChange={(e) => setStirrupsAbcrEdits((p) => ({ ...p, [kL]: e.target.value }))}
                                      onBlur={(e) => setABCRField(si, st, ct, 'L', row.f, e.target.value)}
                                    />
                                  </div>
                                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                                    <span className="mutedSmall" style={{ minWidth: 42 }}>{sideLabelR}</span>
                                    <input
                                      className="cellInput"
                                      style={{ width: 86 }}
                                      type="text"
                                      inputMode={row.isInt ? 'numeric' : 'decimal'}
                                      placeholder={row.ph}
                                      disabled={disabledR}
                                      value={stirrupsAbcrEdits[kR] ?? valueFor(abR)}
                                      onChange={(e) => setStirrupsAbcrEdits((p) => ({ ...p, [kR]: e.target.value }))}
                                      onBlur={(e) => setABCRField(si, st, ct, 'R', row.f, e.target.value)}
                                    />
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </React.Fragment>
                      ))}
                    </div>
                  );
                })()}
              </div>
            </div>
          ) : null}

          {tab === 'json' ? (
            <div className="form">
              <div className="rowBetween">
                <div className="muted">Editar JSON. Botón aplica al formulario.</div>
                <button className="btnSmall" type="button" onClick={applyJsonToForm}>
                  Aplicar
                </button>
              </div>
              <textarea className="editor" value={jsonText} onChange={(e) => setJsonText(e.target.value)} />
            </div>
          ) : null}

          {busy ? <div className="mutedSmall">Procesando…</div> : null}
          {warning ? <div className="warning">{warning}</div> : null}
          {error ? <div className="error">{error}</div> : null}
        </section>

        {tab !== 'config' ? (
          <section className="panel">
            <div className="rowBetween" style={{ marginBottom: 8 }}>
              <div className="panelTitle" style={{ marginBottom: 0 }}>Vista previa</div>
              <div className="segmented" aria-label="Vista previa 2D/3D">
                <button
                  className={previewView === '2d' ? 'segBtn segBtnActive' : 'segBtn'}
                  onClick={() => setPreviewView('2d')}
                  type="button"
                >
                  2D
                </button>
                <button
                  className={previewView === '3d' ? 'segBtn segBtnActive' : 'segBtn'}
                  onClick={() => setPreviewView('3d')}
                  type="button"
                >
                  3D
                </button>
              </div>
            </div>

            <div className="row" style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap', marginBottom: 10 }}>
              <label className="check" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <input type="checkbox" checked={showLongitudinal} onChange={(e) => setShowLongitudinal(e.target.checked)} />
                <span className="mutedSmall">Longitudinal</span>
              </label>
              <label className="check" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <input type="checkbox" checked={showStirrups} onChange={(e) => setShowStirrups(e.target.checked)} />
                <span className="mutedSmall">Estribos</span>
              </label>

              {previewView === '3d' ? (
                <div className="segmented" aria-label="Proyección 3D">
                  <button
                    className={threeProjection === 'perspective' ? 'segBtn segBtnActive' : 'segBtn'}
                    onClick={() => setThreeProjection('perspective')}
                    type="button"
                    title="Cámara en perspectiva"
                  >
                    Perspectiva
                  </button>
                  <button
                    className={threeProjection === 'orthographic' ? 'segBtn segBtnActive' : 'segBtn'}
                    onClick={() => setThreeProjection('orthographic')}
                    type="button"
                    title="Cámara ortográfica"
                  >
                    Ortográfica
                  </button>
                </div>
              ) : null}
            </div>

            <div style={{ display: 'flex', gap: 12, alignItems: 'stretch' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                {previewView === '2d' ? (
                  <canvas
                    ref={canvasRef}
                    width={900}
                    height={300}
                    className="canvas"
                    style={{ touchAction: 'none' }}
                    onWheel={onCanvasWheel}
                    onPointerDown={onCanvasPointerDown}
                    onPointerMove={onCanvasPointerMove}
                    onPointerUp={onCanvasPointerUp}
                    onPointerCancel={onCanvasPointerUp}
                    onDoubleClick={() => setViewport(null)}
                    onContextMenu={(e) => e.preventDefault()}
                    onClick={onCanvasClick}
                    title="2D: rueda = zoom, arrastrar = pan, doble click = reset"
                  />
                ) : null}
                {previewView === '3d' ? <div ref={threeHostRef} className="canvas3d" /> : null}
              </div>

              {previewView === '2d' && tab === 'acero' ? (
                <div style={{ width: 260, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div className="rowBetween" style={{ gap: 8 }}>
                    <div className="mutedSmall">Sección (corte en desarrollo)</div>
                    <button
                      className="btnSmall"
                      type="button"
                      onClick={() =>
                        setSavedCuts((p) => {
                          const xmin = sectionXRangeU.xmin;
                          const xmax = sectionXRangeU.xmax;
                          const x = Math.min(xmax, Math.max(xmin, sectionXU));
                          const xA = defaultCutAXU;

                          const next = (p.length ? [...p] : [{ xU: xA }]).concat([{ xU: x }]);

                          // De-dup (mantener A y no permitir duplicados en B/C/..)
                          const eps = 1e-6;
                          const out: Array<{ xU: number }> = [];
                          for (let i = 0; i < next.length; i++) {
                            const xi = next[i].xU;
                            if (i === 0) {
                              out.push({ xU: xi });
                              continue;
                            }
                            if (Math.abs(out[0].xU - xi) < eps) continue;
                            if (out.slice(1).some((c) => Math.abs(c.xU - xi) < eps)) continue;
                            out.push({ xU: xi });
                          }

                          return out;
                        })
                      }
                      title="Guardar este corte"
                    >
                      Guardar
                    </button>
                  </div>

                  <input
                    className="input"
                    type="range"
                    min={sectionXRangeU.xmin}
                    max={sectionXRangeU.xmax}
                    step={mToUnits(dev, 0.05)}
                    value={sectionXU}
                    onChange={(e) => setSectionXU(Number(e.target.value))}
                    title="Desliza para cambiar el corte a lo largo del desarrollo"
                  />

                  <div className="rowBetween" style={{ gap: 8 }}>
                    <div className="mutedSmall">Tramo {sectionInfo.spanIndex + 1} | x={sectionInfo.x_m.toFixed(2)} m</div>
                    <div className="mutedSmall">{(sectionXRangeU.xmax / (dev.unit_scale ?? 2)).toFixed(2)} m</div>
                  </div>

                  <canvas
                    ref={sectionCanvasRef}
                    width={240}
                    height={240}
                    className="canvas"
                    style={{ height: 240 }}
                    title="Corte (solo acero): amarillo = principal, verde = bastones activos"
                  />

                  {savedCuts.length ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {savedCuts.map((c, i) => {
                        const label = indexToLetters(i);
                        const si = Math.max(0, Math.min(spanIndexAtX(dev, c.xU), (dev.spans ?? []).length - 1));
                        const xm = c.xU / (dev.unit_scale ?? 2);
                        return (
                          <div key={`cut-${i}`} className="rowBetween" style={{ gap: 8 }}>
                            <button
                              type="button"
                              className="btnSmall"
                              onClick={() => setSectionXU(c.xU)}
                              title="Ir al corte"
                              style={{ flex: 1, textAlign: 'left' as any }}
                            >
                              Corte {label} — Tramo {si + 1} | x={xm.toFixed(2)} m
                            </button>
                            <button
                              type="button"
                              className="btnSmall"
                              onClick={() => setSavedCuts((p) => (i === 0 ? p : p.filter((_, j) => j !== i)))}
                              disabled={i === 0}
                              title={i === 0 ? 'Corte A es automático' : 'Eliminar corte'}
                            >
                              Eliminar
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>

            <div className="meta">
              <div>
                <span className="mono">Spans:</span> {(dev.spans ?? []).length}
              </div>
              <div>
                <span className="mono">Nodes:</span> {(dev.nodes ?? []).length}
              </div>
            </div>
            {!preview ? <div className="mutedSmall">Sin preview (revisa backend).</div> : null}
          </section>
        ) : null}
      </main>
    </div>
  );
}
