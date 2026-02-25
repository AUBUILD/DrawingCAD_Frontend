import type { DevelopmentIn, SpanIn } from '../types';
import { clampNumber } from '../utils';
import { computeNodeOrigins } from './geometryService';
import { normalizeBastonCfg } from './developmentService';

export const QUANTITY_FC = 210;
export const QUANTITY_FY = 4200;
export const QUANTITY_RHO_MIN = 14 / QUANTITY_FY; // 0.00333...
const BETA1 = QUANTITY_FC <= 280 ? 0.85 : Math.max(0.65, 0.85 - 0.05 * (QUANTITY_FC - 280) / 70);
const RHO_B = 0.85 * BETA1 * (QUANTITY_FC / QUANTITY_FY) * (6000 / (6000 + QUANTITY_FY));
export const QUANTITY_RHO_MAX = 0.75 * RHO_B;

const REBAR_AREA_CM2: Record<string, number> = {
  '6mm': 0.28,
  '8mm': 0.50,
  '3/8': 0.713,
  '12mm': 1.13,
  '1/2': 1.267,
  '5/8': 1.979,
  '3/4': 2.85,
  '1': 5.067,
  '1-3/8': 9.583,
};

export type QuantityDisplayState = {
  enabled: boolean;
  mode?: 'zones' | 'section';
  show_p_min: boolean;
  show_p_max: boolean;
  show_p_instalada: boolean;
  show_p_requerida: boolean;
  show_As_min: boolean;
  show_As_max: boolean;
  show_As_instalada: boolean;
  show_As_requerida: boolean;
  show_margin: boolean;
  show_compliance: boolean;
};

export type QuantityCutMode = NonNullable<QuantityDisplayState['mode']>;

export type QuantityExportCut = {
  xU: number;
  spanIdx: number;
  x_m: number;
  As_min: number;
  As_max: number;
  As_instalada_top: number;
  As_instalada_bottom: number;
  As_requerida_top: number;
  As_requerida_bottom: number;
  rho_instalada_top: number;
  rho_instalada_bottom: number;
  rho_requerida_top: number;
  rho_requerida_bottom: number;
  top_ok: boolean;
  bottom_ok: boolean;
  margin_top: number;
  margin_bottom: number;
};

export type QuantityExportOverlayPayload = {
  enabled: boolean;
  mode: QuantityCutMode;
  shell_only: boolean;
  offset_y_m: number;
  include_as_min_max: boolean;
  layer_shell?: string;
  layer_text?: string;
  cuts: QuantityExportCut[];
};

export type BeamSectionQuantities = {
  spanIdx: number;
  xU: number;
  x_m: number;
  b_cm: number;
  d_cm: number;
  As_instalada_top: number;
  As_instalada_bottom: number;
  As_requerida_top: number;
  As_requerida_bottom: number;
  As_min: number;
  As_max: number;
  rho_instalada_top: number;
  rho_instalada_bottom: number;
  rho_requerida_top: number;
  rho_requerida_bottom: number;
  top_ok: boolean;
  bottom_ok: boolean;
  margin_top: number; // As_inst - As_req (cm2)
  margin_bottom: number; // As_inst - As_req (cm2)
  margin_rho_top: number;
  margin_rho_bottom: number;
};

function areaCm2(dia?: string | null): number {
  return REBAR_AREA_CM2[String(dia ?? '')] ?? 0;
}

function getAsMainInstalled(span: SpanIn | undefined, side: 'top' | 'bottom'): number {
  const steel = side === 'top' ? span?.steel_top : span?.steel_bottom;
  const qty = Math.max(0, Number(steel?.qty ?? 0));
  const dia = String(steel?.diameter ?? '');
  return qty * areaCm2(dia);
}

function bastonLineActiveAtX(
  dev: DevelopmentIn,
  span: SpanIn,
  spanIdx: number,
  side: 'top' | 'bottom',
  zone: 'z1' | 'z2' | 'z3',
  line: 1 | 2,
  xU: number,
): { active: boolean; qty: number; dia: string } {
  const b = (span as any).bastones ?? {};
  const sideCfgRaw = (side === 'top' ? b.top : b.bottom) ?? {};
  const cfg = normalizeBastonCfg((sideCfgRaw as any)[zone]);
  const enabled = line === 1 ? Boolean(cfg?.l1_enabled ?? cfg?.enabled ?? false) : Boolean(cfg?.l2_enabled ?? false);
  if (!enabled) return { active: false, qty: 0, dia: '3/4' };
  const qty = Math.max(0, Math.round(Number(line === 1 ? (cfg?.l1_qty ?? cfg?.qty ?? 1) : (cfg?.l2_qty ?? 1))));
  const dia = String(line === 1 ? (cfg?.l1_diameter ?? cfg?.diameter ?? '3/4') : (cfg?.l2_diameter ?? '3/4'));
  if (!(qty > 0)) return { active: false, qty: 0, dia };

  const unitScale = dev.unit_scale ?? 2;
  const mToU = (m: number) => m * unitScale;
  const origins = computeNodeOrigins(dev);
  const nodes = dev.nodes ?? [];
  const Lm = Math.max(0, Number(span.L ?? 0));
  const x0Side = (() => {
    if (side === 'top') return (origins[spanIdx] ?? 0) + mToU(clampNumber(nodes[spanIdx]?.b2 ?? 0, 0));
    return (origins[spanIdx] ?? 0) + mToU(clampNumber(nodes[spanIdx]?.a2 ?? 0, 0));
  })();
  const x1Side = (() => {
    if (side === 'top') return (origins[spanIdx + 1] ?? 0) + mToU(clampNumber(nodes[spanIdx + 1]?.b1 ?? 0, 0));
    return x0Side + mToU(Lm);
  })();
  const xa = Math.min(x0Side, x1Side);
  const xb = Math.max(x0Side, x1Side);
  const defLenM = Lm / 5;
  const defL3M = Lm / 3;
  const LcU = mToU(clampNumber((dev as any).baston_Lc ?? 0.45, 0.45));
  const snap05 = (m: number) => Math.round(m / 0.05) * 0.05;
  const resolved = (field: 'L1_m' | 'L2_m' | 'L3_m', fb: number) => {
    const v = Number((cfg as any)?.[field]);
    const out = Number.isFinite(v) && v > 0 ? v : fb;
    return Math.min(Lm, Math.max(0, snap05(out)));
  };
  let x0 = xa;
  let x1 = xb;
  if (zone === 'z1') {
    const L3u = mToU(resolved('L3_m', defL3M));
    x0 = xa;
    x1 = Math.min(xb, xa + L3u);
    if (line === 2) x1 -= LcU;
  } else if (zone === 'z3') {
    const L3u = mToU(resolved('L3_m', defL3M));
    x1 = xb;
    x0 = Math.max(xa, xb - L3u);
    if (line === 2) x0 += LcU;
  } else {
    const L1u = mToU(resolved('L1_m', defLenM));
    const L2u = mToU(resolved('L2_m', defLenM));
    x0 = xa + L1u;
    x1 = xb - L2u;
    if (line === 2) { x0 += LcU; x1 -= LcU; }
  }
  return { active: xU >= x0 - 1e-6 && xU <= x1 + 1e-6 && x1 > x0 + 1e-6, qty, dia };
}

function readRequiredAs(span: SpanIn | undefined, side: 'top' | 'bottom', fallbackAsMin: number): number {
  const s: any = span ?? {};
  const candidates = side === 'top'
    ? ['As_requerida_top', 'as_requerida_top', 'As_req_top', 'as_req_top', 'As_req_top_cm2', 'as_req_top_cm2']
    : ['As_requerida_bottom', 'as_requerida_bottom', 'As_req_bottom', 'as_req_bottom', 'As_req_bottom_cm2', 'as_req_bottom_cm2'];
  for (const k of candidates) {
    const v = Number(s[k]);
    if (Number.isFinite(v) && v >= 0) return v;
  }
  // Decisión pragmática: si no hay dato requerido explícito, usar mínimo normativo como referencia.
  return fallbackAsMin;
}

export function computeBeamSectionQuantities(dev: DevelopmentIn, span: SpanIn | undefined, spanIdx: number, xU: number, recubrimientoM = 0.04): BeamSectionQuantities | null {
  if (!span) return null;
  const b_cm = Math.max(0, clampNumber((span.b ?? 0.25), 0.25) * 100);
  const d_cm = Math.max(0, (clampNumber(span.h ?? 0, 0) - clampNumber(recubrimientoM, 0.04)) * 100);
  const bd = b_cm * d_cm;
  if (!(bd > 0)) return null;

  const As_min = QUANTITY_RHO_MIN * bd;
  const As_max = QUANTITY_RHO_MAX * bd;
  let As_instalada_top = getAsMainInstalled(span, 'top');
  let As_instalada_bottom = getAsMainInstalled(span, 'bottom');
  for (const side of ['top', 'bottom'] as const) {
    for (const zone of ['z1', 'z2', 'z3'] as const) {
      for (const line of [1, 2] as const) {
        const s = bastonLineActiveAtX(dev, span, spanIdx, side, zone, line, xU);
        if (!s.active) continue;
        const asLine = s.qty * areaCm2(s.dia);
        if (side === 'top') As_instalada_top += asLine;
        else As_instalada_bottom += asLine;
      }
    }
  }
  const As_requerida_top = readRequiredAs(span, 'top', As_min);
  const As_requerida_bottom = readRequiredAs(span, 'bottom', As_min);

  const rho_instalada_top = As_instalada_top / bd;
  const rho_instalada_bottom = As_instalada_bottom / bd;
  const rho_requerida_top = As_requerida_top / bd;
  const rho_requerida_bottom = As_requerida_bottom / bd;

  const top_ok =
    rho_instalada_top >= QUANTITY_RHO_MIN &&
    rho_instalada_top <= QUANTITY_RHO_MAX &&
    rho_instalada_top >= rho_requerida_top;
  const bottom_ok =
    rho_instalada_bottom >= QUANTITY_RHO_MIN &&
    rho_instalada_bottom <= QUANTITY_RHO_MAX &&
    rho_instalada_bottom >= rho_requerida_bottom;

  return {
    spanIdx,
    xU,
    x_m: 0,
    b_cm,
    d_cm,
    As_instalada_top,
    As_instalada_bottom,
    As_requerida_top,
    As_requerida_bottom,
    As_min,
    As_max,
    rho_instalada_top,
    rho_instalada_bottom,
    rho_requerida_top,
    rho_requerida_bottom,
    top_ok,
    bottom_ok,
    margin_top: As_instalada_top - As_requerida_top,
    margin_bottom: As_instalada_bottom - As_requerida_bottom,
    margin_rho_top: rho_instalada_top - rho_requerida_top,
    margin_rho_bottom: rho_instalada_bottom - rho_requerida_bottom,
  };
}

export function sectionSpanIndexAtXU(dev: DevelopmentIn, xU: number): number {
  const spans = dev.spans ?? [];
  if (!spans.length) return 0;
  const origins = computeNodeOrigins(dev);
  for (let i = 0; i < spans.length; i++) {
    const x0 = origins[i] ?? 0;
    const x1 = origins[i + 1] ?? x0;
    const xa = Math.min(x0, x1);
    const xb = Math.max(x0, x1);
    if (xU >= xa - 1e-6 && xU <= xb + 1e-6) return i;
  }
  return Math.max(0, Math.min(spans.length - 1, 0));
}

export function buildQuantityCutsXU(
  dev: DevelopmentIn,
  mode: QuantityCutMode,
  activeSectionXU: number,
): number[] {
  if (mode === 'section') return [activeSectionXU].filter((n) => Number.isFinite(n));

  const spans = dev.spans ?? [];
  const nodes = dev.nodes ?? [];
  if (!spans.length) return [activeSectionXU].filter((n) => Number.isFinite(n));
  const origins = computeNodeOrigins(dev);
  const unitScale = dev.unit_scale ?? 2;
  const cuts: number[] = [];

  for (let i = 0; i < spans.length; i++) {
    const left = (origins[i] ?? 0) + unitScale * clampNumber(nodes[i]?.b2 ?? nodes[i]?.a2 ?? 0, 0);
    const right = (origins[i + 1] ?? 0) + unitScale * clampNumber(nodes[i + 1]?.b1 ?? nodes[i + 1]?.a1 ?? 0, 0);
    const xa = Math.min(left, right);
    const xb = Math.max(left, right);
    const len = xb - xa;
    if (!(len > 1e-6)) continue;
    cuts.push(xa + len / 6, xa + len / 2, xb - len / 6);
  }

  return Array.from(new Set(cuts.map((n) => Math.round(n * 1e6) / 1e6)));
}

export function buildQuantityExportOverlayPayload(
  dev: DevelopmentIn,
  recubrimientoM: number,
  activeSectionXU: number,
  display: QuantityDisplayState,
): QuantityExportOverlayPayload | null {
  if (!display.enabled) return null;
  const mode: QuantityCutMode = display.mode ?? 'section';
  const cutsXU = buildQuantityCutsXU(dev, mode, activeSectionXU);
  const cuts: QuantityExportCut[] = [];
  const unitScale = dev.unit_scale ?? 2;

  for (const xU of cutsXU) {
    const spanIdx = sectionSpanIndexAtXU(dev, xU);
    const q = computeBeamSectionQuantities(dev, dev.spans?.[spanIdx], spanIdx, xU, recubrimientoM);
    if (!q) continue;
    cuts.push({
      xU,
      spanIdx,
      x_m: xU / unitScale,
      As_min: q.As_min,
      As_max: q.As_max,
      As_instalada_top: q.As_instalada_top,
      As_instalada_bottom: q.As_instalada_bottom,
      As_requerida_top: q.As_requerida_top,
      As_requerida_bottom: q.As_requerida_bottom,
      rho_instalada_top: q.rho_instalada_top,
      rho_instalada_bottom: q.rho_instalada_bottom,
      rho_requerida_top: q.rho_requerida_top,
      rho_requerida_bottom: q.rho_requerida_bottom,
      top_ok: q.top_ok,
      bottom_ok: q.bottom_ok,
      margin_top: q.margin_top,
      margin_bottom: q.margin_bottom,
    });
  }

  return {
    enabled: true,
    mode,
    shell_only: true,
    offset_y_m: 3.0,
    include_as_min_max: true,
    layer_shell: "A-CUANTIAS-CASCO",
    layer_text: "A-CUANTIAS-TEXT",
    cuts,
  };
}
