import type { BastonCfg, DevelopmentIn, SpanIn, SteelColRule, SteelLayoutSettings, SteelMeta, StirrupsSectionIn } from './types';

type Face = 'top' | 'bottom';

export type SteelFaceLayoutResult = {
  ok: true;
  rows: number;
  cols: number;
  // Coordenadas en cm dentro de la sección (y: desde la base; z: 0 en el eje vertical de simetría)
  bars_cm: Array<{ y_cm: number; z_cm: number }>;
  s_min_cm: number;
  db_cm: number;
  debug?: Record<string, any>;
} | {
  ok: false;
  reason: string;
  debug?: Record<string, any>;
};

export type SteelSpanFaceBarsResult = {
  ok: true;
  rows: number;
  cols: number;
  s_min_cm: number;
  db_governing_cm: number;
  main_db_cm: number;
  baston_db_cm: number;
  main_bars_cm: Array<{ y_cm: number; z_cm: number }>;
  baston_pool_bars_cm: Array<{ y_cm: number; z_cm: number }>;
  // Pools por línea (para colorear/identidad estable). Si no se usan, baston_pool_bars_cm mantiene compatibilidad.
  baston_l1_bars_cm?: Array<{ y_cm: number; z_cm: number }>;
  baston_l2_bars_cm?: Array<{ y_cm: number; z_cm: number }>;
  debug?: Record<string, any>;
} | {
  ok: false;
  reason: string;
  debug?: Record<string, any>;
};

const DEFAULT_COL_RULES: SteelColRule[] = [
  { b_min_cm: 0, b_max_cm: 20, min_cols: 2, max_cols: 2 },
  { b_min_cm: 20, b_max_cm: 27.5, min_cols: 2, max_cols: 3 },
  { b_min_cm: 27.5, b_max_cm: 32.5, min_cols: 2, max_cols: 4 },
  { b_min_cm: 32.5, b_max_cm: 40, min_cols: 2, max_cols: 5 },
  { b_min_cm: 45, b_max_cm: 50, min_cols: 3, max_cols: 6 },
  { b_min_cm: 55, b_max_cm: 60, min_cols: 4, max_cols: 7 },
];

const DEFAULT_REBAR_DIAMETERS_CM: Record<string, number> = {
  '1/2': 1.27,
  '5/8': 1.5875,
  '3/4': 1.905,
  '1': 2.54,
  '1-3/8': 3.4925,
};

function normalizeDiaKey(dia: string) {
  const s = String(dia || '').trim().replace(/"/g, '');
  if (s === '1 3/8' || s === '1-3/8' || s === "1-3/8'" || s === '1-3/8in') return '1-3/8';
  return s;
}

function parseInches(raw: string): number | null {
  const s0 = String(raw || '').trim();
  if (!s0) return null;

  const s = s0
    .replace(/in(ch(es)?)?/gi, '')
    .replace(/\s+/g, ' ')
    .trim();

  // soporta: "3/4", "1-3/8", "1 3/8", "0.75"
  const tryNumber = Number(s);
  if (Number.isFinite(tryNumber)) return tryNumber;

  const sDash = s.replace('-', ' ');
  const parts = sDash.split(' ').filter(Boolean);
  if (!parts.length) return null;

  const parseFrac = (t: string): number | null => {
    const m = /^(-?\d+)\s*\/\s*(\d+)$/.exec(t);
    if (!m) return null;
    const a = Number(m[1]);
    const b = Number(m[2]);
    if (!Number.isFinite(a) || !Number.isFinite(b) || b === 0) return null;
    return a / b;
  };

  if (parts.length === 1) {
    const f = parseFrac(parts[0]);
    return f;
  }

  if (parts.length === 2) {
    const whole = Number(parts[0]);
    const frac = parseFrac(parts[1]);
    if (!Number.isFinite(whole) || frac === null) return null;
    return whole + frac;
  }

  return null;
}

function inchesToCm(inches: number) {
  return inches * 2.54;
}

export function diameterToCm(diaKey: string, settings?: SteelLayoutSettings | null): number {
  const key = normalizeDiaKey(diaKey);
  const table = settings?.rebar_diameters_cm ?? DEFAULT_REBAR_DIAMETERS_CM;
  const fromTable = table[key];
  if (typeof fromTable === 'number' && Number.isFinite(fromTable) && fromTable > 0) return fromTable;
  const inches = parseInches(key);
  if (inches && Number.isFinite(inches) && inches > 0) return inchesToCm(inches);
  // fallback: 3/4
  return DEFAULT_REBAR_DIAMETERS_CM['3/4'];
}

function normalizeStirrupsSection(input: unknown): Required<Pick<StirrupsSectionIn, 'shape' | 'diameter' | 'qty'>> {
  const src = (input ?? {}) as any;
  const shape = String(src.shape ?? 'rect').trim().toLowerCase() === 'rect' ? 'rect' : 'rect';
  const diameterRaw = String(src.diameter ?? '3/8').trim();
  const diameter = normalizeDiaKey(diameterRaw.replace(/[∅Ø\s]/g, '')) || '3/8';
  const qtyRaw = Number(src.qty ?? 1);
  const qty = Number.isFinite(qtyRaw) ? Math.max(0, Math.floor(qtyRaw)) : 1;
  return { shape: shape as any, diameter, qty };
}

function totalStirrupsSectionThicknessCm(span: SpanIn, settings: SteelLayoutSettings | null): number {
  const sec = normalizeStirrupsSection((span as any).stirrups_section ?? (span as any).stirrupsSection);
  if (!(sec.qty > 0)) return 0;
  const db = diameterToCm(sec.diameter, settings);
  if (!(db > 0)) return 0;
  return sec.qty * db;
}

export function e060SMinCm(db_cm: number, settings?: SteelLayoutSettings | null): number {
  const dag_cm = Number(settings?.dag_cm ?? 2.5);
  const usePractical = settings?.use_practical_min ?? true;
  const practicalMin = Number(settings?.practical_min_cm ?? 4.0);

  const base = Math.max(db_cm, 2.5, 1.3 * dag_cm);
  if (usePractical) return Math.max(base, practicalMin);
  return base;
}

function resolveColRule(b_cm: number, rules: SteelColRule[]): { min: number; max: number } {
  for (const r of rules) {
    const lo = Number(r.b_min_cm);
    const hi = Number(r.b_max_cm);
    if (!Number.isFinite(lo) || !Number.isFinite(hi)) continue;
    if (b_cm >= lo && b_cm <= hi) {
      const min = Math.max(2, Math.floor(Number(r.min_cols) || 2));
      const max = Math.max(min, Math.floor(Number(r.max_cols) || min));
      return { min, max };
    }
  }
  return { min: 2, max: 5 };
}

function symmetricZsCm(cols: number, b_centers_cm: number): number[] {
  if (cols <= 1) return [0];
  const dx = b_centers_cm / (cols - 1);
  const half = (cols - 1) / 2;
  const zs: number[] = [];
  for (let c = 0; c < cols; c++) {
    zs.push((c - half) * dx);
  }
  return zs;
}

function buildPairSlots(rows: number, cols: number): Array<{ r: number; cL: number; cR: number }> {
  const pairs: Array<{ r: number; cL: number; cR: number }> = [];
  const halfPairs = Math.floor(cols / 2);
  for (let r = 0; r < rows; r++) {
    for (let k = 0; k < halfPairs; k++) {
      const cL = k;
      const cR = cols - 1 - k;
      pairs.push({ r, cL, cR });
    }
  }
  return pairs;
}

function centerSlots(rows: number, cols: number): Array<{ r: number; c: number }> {
  if (cols % 2 === 0) return [];
  const c = Math.floor(cols / 2);
  const out: Array<{ r: number; c: number }> = [];
  for (let r = 0; r < rows; r++) out.push({ r, c });
  return out;
}

function yForRowCm(face: Face, h_cm: number, cover_cm: number, db_cm: number, s_min_cm: number, rowIndex: number): number {
  const r = db_cm / 2;
  const pitch = db_cm + s_min_cm; // c/c
  if (face === 'top') {
    const y0 = h_cm - cover_cm - r;
    return y0 - rowIndex * pitch;
  }
  const y0 = cover_cm + r;
  return y0 + rowIndex * pitch;
}

function validateYBounds(face: Face, h_cm: number, cover_cm: number, db_cm: number, s_min_cm: number, rows: number): boolean {
  const r = db_cm / 2;
  const minY = cover_cm + r;
  const maxY = h_cm - cover_cm - r;
  for (let ri = 0; ri < rows; ri++) {
    const y = yForRowCm(face, h_cm, cover_cm, db_cm, s_min_cm, ri);
    if (!(y >= minY - 1e-6 && y <= maxY + 1e-6)) return false;
  }
  return true;
}

export function computeFaceLayoutCm(opts: {
  face: Face;
  b_cm: number;
  h_cm: number;
  cover_cm: number;
  steel: SteelMeta | null | undefined;
  settings?: SteelLayoutSettings | null;
  cols_override?: number | null;
  rows_override?: number | null;
  max_rows_per_face?: number | null;
  db_cm_override?: number | null;
  s_min_cm_override?: number | null;
}): SteelFaceLayoutResult {
  const qty = Math.max(0, Math.floor(Number(opts.steel?.qty ?? 0) || 0));
  if (qty <= 0) return { ok: false, reason: 'Sin barras (qty<=0)' };

  const b_cm = Number(opts.b_cm);
  const h_cm = Number(opts.h_cm);
  const cover_cm = Number(opts.cover_cm);
  if (!(b_cm > 0) || !(h_cm > 0) || !(cover_cm >= 0)) return { ok: false, reason: 'Geometría inválida' };

  const settings = opts.settings ?? null;
  const rules = (settings?.col_rules?.length ? settings.col_rules : DEFAULT_COL_RULES) as SteelColRule[];

  const db_cm_raw = diameterToCm(String(opts.steel?.diameter ?? '3/4'), settings);
  const db_cm = (() => {
    const v = Number(opts.db_cm_override ?? NaN);
    return Number.isFinite(v) && v > 0 ? v : db_cm_raw;
  })();
  const s_min_cm_raw = e060SMinCm(db_cm, settings);
  const s_min_cm = (() => {
    const v = Number(opts.s_min_cm_override ?? NaN);
    return Number.isFinite(v) && v > 0 ? v : s_min_cm_raw;
  })();
  const r = db_cm / 2;

  // espacio útil para centros en ancho
  const b_centers_cm = b_cm - 2 * (cover_cm + r);
  if (!(b_centers_cm > 0)) return { ok: false, reason: 'No hay espacio útil en ancho', debug: { b_centers_cm } };

  const maxRows = Math.max(1, Math.min(3, Math.floor(Number(opts.max_rows_per_face ?? (settings?.max_rows_per_face ?? 3)) || 3)));

  const tryCandidate = (rows: number, cols: number) => {
    if (cols < 2) return null;
    // separación horizontal
    const dx = cols === 1 ? 0 : b_centers_cm / (cols - 1);
    const okX = dx >= (db_cm + s_min_cm) - 1e-9;
    if (!okX) return null;
    if (!validateYBounds(opts.face, h_cm, cover_cm, db_cm, s_min_cm, rows)) return null;
    return { rows, cols, dx };
  };

  const rowsForced = Number(opts.rows_override ?? NaN);
  const colsForced = Number(opts.cols_override ?? NaN);

  const candidates: Array<{ rows: number; cols: number; dx: number }> = [];

  const rowsList = Number.isFinite(rowsForced) && rowsForced > 0 ? [Math.max(1, Math.min(maxRows, Math.floor(rowsForced)))] : Array.from({ length: maxRows }, (_, i) => i + 1);

  for (const rows of rowsList) {
    const colsNeeded = Math.ceil(qty / rows);

    let colsMin: number;
    let colsMax: number;

    if (Number.isFinite(colsForced) && colsForced > 0) {
      colsMin = Math.floor(colsForced);
      colsMax = Math.floor(colsForced);
    } else {
      const lim = resolveColRule(b_cm, rules);
      colsMin = Math.max(lim.min, colsNeeded);
      colsMax = Math.max(colsMin, lim.max);
    }

    for (let cols = colsMin; cols <= colsMax; cols++) {
      const c = tryCandidate(rows, cols);
      if (c) candidates.push(c);
    }

    // Optimización: si ya encontramos algo con 1 o 2 filas, no seguimos a 3 salvo que sea necesario
    if (candidates.length && !(Number.isFinite(rowsForced) && rowsForced > 0)) {
      // si rows=1 o 2, paramos temprano
      if (rows <= 2) break;
    }
  }

  if (!candidates.length) {
    return {
      ok: false,
      reason: 'No hay layout factible (separación/filas/columnas)',
      debug: { qty, b_cm, h_cm, cover_cm, db_cm, s_min_cm, b_centers_cm },
    };
  }

  // score: menor filas, mayor dx
  candidates.sort((a, b) => {
    if (a.rows !== b.rows) return a.rows - b.rows;
    return b.dx - a.dx;
  });

  const best = candidates[0];
  const { rows, cols } = best;
  const zs = symmetricZsCm(cols, b_centers_cm);

  const filled = new Set<string>();
  const bars: Array<{ y_cm: number; z_cm: number }> = [];

  const add = (r0: number, c0: number) => {
    const key = `${r0}:${c0}`;
    if (filled.has(key)) return false;
    filled.add(key);
    bars.push({
      y_cm: yForRowCm(opts.face, h_cm, cover_cm, db_cm, s_min_cm, r0),
      z_cm: zs[c0] ?? 0,
    });
    return true;
  };

  let remaining = qty;

  // 1) llenar pares (esquinas primero, por fila exterior a interior)
  const pairs = buildPairSlots(rows, cols);
  for (const p of pairs) {
    if (remaining < 2) break;
    // esquina izquierda + derecha del mismo nivel
    const ok1 = add(p.r, p.cL);
    const ok2 = add(p.r, p.cR);
    if (ok1) remaining--;
    if (ok2) remaining--;
    if (remaining <= 0) break;
  }

  // 2) si queda 1 barra, ponerla lo más centrada posible (prefiere fila 1)
  if (remaining === 1) {
    const centers = centerSlots(rows, cols);
    let placed = false;
    if (centers.length) {
      // fila exterior primero
      for (const c of centers) {
        if (add(c.r, c.c)) {
          remaining--;
          placed = true;
          break;
        }
      }
    }

    if (!placed) {
      // no hay columna central; escoger el slot más cercano al eje
      const centerCol = (cols - 1) / 2;
      let bestSlot: { r: number; c: number; d: number } | null = null;
      for (let r0 = 0; r0 < rows; r0++) {
        for (let c0 = 0; c0 < cols; c0++) {
          const key = `${r0}:${c0}`;
          if (filled.has(key)) continue;
          const d = Math.abs(c0 - centerCol) + r0 * 0.01;
          if (!bestSlot || d < bestSlot.d) bestSlot = { r: r0, c: c0, d };
        }
      }
      if (bestSlot) {
        add(bestSlot.r, bestSlot.c);
        remaining--;
      }
    }
  }

  if (remaining !== 0) {
    return {
      ok: false,
      reason: 'No se pudo ubicar todas las barras (capacidad insuficiente)',
      debug: { qty, rows, cols, placed: bars.length },
    };
  }

  return {
    ok: true,
    rows,
    cols,
    bars_cm: bars,
    s_min_cm,
    db_cm,
    debug: { b_centers_cm, dx_cm: best.dx },
  };
}

export function getSteelLayoutSettings(dev: DevelopmentIn): SteelLayoutSettings {
  const s = (dev as any).steel_layout_settings ?? null;
  const dag_cm = Number(s?.dag_cm ?? 2.5);
  return {
    dag_cm: Number.isFinite(dag_cm) && dag_cm > 0 ? dag_cm : 2.5,
    use_practical_min: s?.use_practical_min ?? true,
    practical_min_cm: Number(s?.practical_min_cm ?? 4.0),
    max_rows_per_face: Number(s?.max_rows_per_face ?? 3),
    col_rules: Array.isArray(s?.col_rules) ? s.col_rules : DEFAULT_COL_RULES,
    rebar_diameters_cm: typeof s?.rebar_diameters_cm === 'object' && s.rebar_diameters_cm ? s.rebar_diameters_cm : DEFAULT_REBAR_DIAMETERS_CM,
  };
}

export function computeSpanSectionLayoutCm(args: {
  dev: DevelopmentIn;
  span: SpanIn;
  cover_m: number;
  face: Face;
}): SteelFaceLayoutResult {
  const cover_cm = Number(args.cover_m) * 100;
  const b_cm = Number(args.span.b ?? 0.3) * 100;
  const h_cm = Number(args.span.h ?? 0.5) * 100;
  const settings = getSteelLayoutSettings(args.dev);
  const layout = (args.span as any).steel_layout ?? {};
  const override = args.face === 'top' ? layout.top : layout.bottom;

  const steel = args.face === 'top' ? (args.span.steel_top ?? null) : (args.span.steel_bottom ?? null);

  return computeFaceLayoutCm({
    face: args.face,
    b_cm,
    h_cm,
    cover_cm,
    steel,
    settings,
    cols_override: override?.cols_override ?? null,
    rows_override: override?.rows_override ?? null,
    max_rows_per_face: settings.max_rows_per_face ?? 3,
  });
}

function normalizeBastonCfgLight(input: unknown): BastonCfg {
  const src = (input ?? {}) as any;
  const legacyEnabled = src.enabled;
  const legacyQty = src.qty;
  const legacyDia = src.diameter;

  const l1_enabled = Boolean(src.l1_enabled ?? legacyEnabled ?? false);
  const l2_enabled = Boolean(src.l2_enabled ?? legacyEnabled ?? false);

  const l1_qty_raw = Number(src.l1_qty ?? legacyQty ?? 1);
  const l2_qty_raw = Number(src.l2_qty ?? legacyQty ?? 1);
  const l1_qty = Math.max(1, Math.min(3, Math.round(Number.isFinite(l1_qty_raw) ? l1_qty_raw : 1)));
  const l2_qty = Math.max(1, Math.min(3, Math.round(Number.isFinite(l2_qty_raw) ? l2_qty_raw : 1)));

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
    enabled: Boolean(legacyEnabled ?? (l1_enabled || l2_enabled)),
    qty: Number.isFinite(Number(legacyQty)) ? legacyQty : undefined,
    diameter: legacyDia != null ? String(legacyDia) : undefined,
    L1_m,
    L2_m,
    L3_m,
  };
}

function bastonDemandForFace(
  dev: DevelopmentIn,
  span: SpanIn,
  face: Face,
  settings: SteelLayoutSettings
): { qty_max: number; qty_l1_max: number; qty_l2_max: number; db_max_cm: number } {
  const Lm = Number(span.L ?? 0);
  if (!(Lm > 0)) return { qty_max: 0, qty_l1_max: 0, qty_l2_max: 0, db_max_cm: 0 };

  const b = (span as any).bastones ?? null;
  const side = face === 'top' ? (b?.top ?? null) : (b?.bottom ?? null);
  if (!side) return { qty_max: 0, qty_l1_max: 0, qty_l2_max: 0, db_max_cm: 0 };

  // Importante: usar el mismo Lc que el render/UI (no forzar mínimo 0.5m aquí)
  // para que el conteo de demanda coincida con lo que se dibuja.
  const rawLc = Number((dev as any).baston_Lc ?? 0.5);
  const bastonLcM = Number.isFinite(rawLc) ? Math.max(0, rawLc) : 0.5;
  const defaultLenM = Lm / 5;
  const defaultL3M = Lm / 3;

  const resolvedLenM = (cfg: BastonCfg, field: 'L1_m' | 'L2_m' | 'L3_m', fallbackM: number) => {
    const v = (cfg as any)[field];
    const n = typeof v === 'number' ? v : NaN;
    const out = Number.isFinite(n) && n > 0 ? n : fallbackM;
    return Math.min(Lm, Math.max(0, out));
  };

  type Interval = { a: number; b: number; w: number };
  const intervals: Interval[] = [];
  const intervalsL1: Interval[] = [];
  const intervalsL2: Interval[] = [];
  const add = (a: number, b: number, w: number) => {
    if (!(w > 0)) return;
    const lo = Math.max(0, Math.min(a, b));
    const hi = Math.min(Lm, Math.max(a, b));
    if (hi > lo + 1e-9) intervals.push({ a: lo, b: hi, w });
  };
  const addL1 = (a: number, b: number, w: number) => {
    if (!(w > 0)) return;
    const lo = Math.max(0, Math.min(a, b));
    const hi = Math.min(Lm, Math.max(a, b));
    if (hi > lo + 1e-9) intervalsL1.push({ a: lo, b: hi, w });
  };
  const addL2 = (a: number, b: number, w: number) => {
    if (!(w > 0)) return;
    const lo = Math.max(0, Math.min(a, b));
    const hi = Math.min(Lm, Math.max(a, b));
    if (hi > lo + 1e-9) intervalsL2.push({ a: lo, b: hi, w });
  };

  const zones = ['z1', 'z2', 'z3'] as const;
  let maxDb = 0;
  for (const z of zones) {
    const cfg = normalizeBastonCfgLight((side as any)[z]);
    const anyEnabled = Boolean(cfg.l1_enabled) || Boolean(cfg.l2_enabled);
    if (!anyEnabled) continue;

    const q1 = Math.max(1, Math.min(3, Math.round(Number((cfg as any).l1_qty ?? 1) || 1)));
    const q2 = Math.max(1, Math.min(3, Math.round(Number((cfg as any).l2_qty ?? 1) || 1)));
    const db1 = diameterToCm(String((cfg as any).l1_diameter ?? '3/4'), settings);
    const db2 = diameterToCm(String((cfg as any).l2_diameter ?? '3/4'), settings);
    if (cfg.l1_enabled && Number.isFinite(db1) && db1 > 0) maxDb = Math.max(maxDb, db1);
    if (cfg.l2_enabled && Number.isFinite(db2) && db2 > 0) maxDb = Math.max(maxDb, db2);

    if (z === 'z1') {
      const L3 = resolvedLenM(cfg, 'L3_m', defaultL3M);
      if (cfg.l1_enabled) {
        add(0, L3, q1); // línea exterior
        addL1(0, L3, q1);
      }
      if (cfg.l2_enabled && L3 > bastonLcM + 1e-9) {
        add(0, L3 - bastonLcM, q2); // línea interior
        addL2(0, L3 - bastonLcM, q2);
      }
    } else if (z === 'z3') {
      const L3 = resolvedLenM(cfg, 'L3_m', defaultL3M);
      if (cfg.l1_enabled) {
        add(Lm - L3, Lm, q1);
        addL1(Lm - L3, Lm, q1);
      }
      if (cfg.l2_enabled && L3 > bastonLcM + 1e-9) {
        add(Lm - L3 + bastonLcM, Lm, q2);
        addL2(Lm - L3 + bastonLcM, Lm, q2);
      }
    } else {
      const L1 = resolvedLenM(cfg, 'L1_m', defaultLenM);
      const L2 = resolvedLenM(cfg, 'L2_m', defaultLenM);
      const a = L1;
      const b2 = Lm - L2;
      if (b2 > a + 1e-9) {
        if (cfg.l1_enabled) {
          add(a, b2, q1);
          addL1(a, b2, q1);
        }
        if (cfg.l2_enabled && b2 > a + 2 * bastonLcM + 1e-9) {
          add(a + bastonLcM, b2 - bastonLcM, q2);
          addL2(a + bastonLcM, b2 - bastonLcM, q2);
        }
      }
    }
  }

  if (!intervals.length) return { qty_max: 0, qty_l1_max: 0, qty_l2_max: 0, db_max_cm: maxDb };

  const sweepMax = (arr: Interval[]) => {
    if (!arr.length) return 0;
    const events: Array<{ x: number; d: number }> = [];
    for (const it of arr) {
      events.push({ x: it.a, d: it.w });
      events.push({ x: it.b, d: -it.w });
    }
    events.sort((p, q) => (p.x !== q.x ? p.x - q.x : q.d - p.d));
    let cur = 0;
    let best = 0;
    for (const e of events) {
      cur += e.d;
      if (cur > best) best = cur;
    }
    return Math.max(0, Math.round(best));
  };

  // Sweep line para máximo solape total y por línea.
  const qty_max = sweepMax(intervals);
  const qty_l1_max = sweepMax(intervalsL1);
  const qty_l2_max = sweepMax(intervalsL2);

  return { qty_max, qty_l1_max, qty_l2_max, db_max_cm: maxDb };
}

export function computeSpanSectionLayoutWithBastonesCm(args: {
  dev: DevelopmentIn;
  span: SpanIn;
  cover_m: number;
  face: Face;
}): SteelSpanFaceBarsResult {
  const cover_cm = Number(args.cover_m) * 100;
  const b_cm = Number(args.span.b ?? 0.3) * 100;
  const h_cm = Number(args.span.h ?? 0.5) * 100;
  const settings = getSteelLayoutSettings(args.dev);

  // El recubrimiento (cover) es hasta la cara exterior del estribo.
  // Para acomodar el acero longitudinal dentro del/los estribos, desplazamos el layout hacia adentro
  // por el espesor total (suma de diámetros si hay estribos concéntricos).
  const stirrupsThicknessCm = totalStirrupsSectionThicknessCm(args.span, settings);
  const cover_eff_cm = cover_cm + stirrupsThicknessCm;

  const layout = (args.span as any).steel_layout ?? {};
  const override = args.face === 'top' ? layout.top : layout.bottom;

  const mainSteel = args.face === 'top' ? (args.span.steel_top ?? null) : (args.span.steel_bottom ?? null);
  const mainQty = Math.max(0, Math.floor(Number(mainSteel?.qty ?? 0) || 0));
  if (mainQty <= 0) return { ok: false, reason: 'Sin acero principal (qty<=0)' };

  const mainDb = diameterToCm(String(mainSteel?.diameter ?? '3/4'), settings);
  const bastonDem = bastonDemandForFace(args.dev, args.span, args.face, settings);
  const bastonL1QtyRequested = bastonDem.qty_l1_max;
  const bastonL2QtyRequested = bastonDem.qty_l2_max;
  const bastonQtyRequested = Math.max(0, bastonL1QtyRequested + bastonL2QtyRequested);
  const bastonDb = bastonDem.db_max_cm;

  const totalQtyRequested = mainQty + bastonQtyRequested;
  const governingDb = Math.max(mainDb, bastonDb, mainDb);
  const sMin = e060SMinCm(governingDb, settings);

  // --- Nuevo: grid y asignación por filas ---
  // Regla: completar una fila antes de pasar a la siguiente.
  // Orden: acero corrido primero (fila 1), luego bastones (prioriza L1 sobre L2) llenando fila por fila.

  const rules = (settings?.col_rules?.length ? settings.col_rules : DEFAULT_COL_RULES) as SteelColRule[];
  const b_centers_cm = b_cm - 2 * (cover_eff_cm + governingDb / 2);
  if (!(b_centers_cm > 0)) return { ok: false, reason: 'No hay espacio útil en ancho', debug: { b_centers_cm } };

  const maxRows = Math.max(1, Math.min(3, Math.floor(Number(settings.max_rows_per_face ?? 3) || 3)));

  const colsForced = Number(override?.cols_override ?? NaN);
  const rowsForced = Number(override?.rows_override ?? NaN);

  const resolveColsRange = () => {
    if (Number.isFinite(colsForced) && colsForced > 0) {
      const c = Math.max(2, Math.floor(colsForced));
      return { min: c, max: c };
    }
    const lim = resolveColRule(b_cm, rules);
    return { min: lim.min, max: lim.max };
  };

  const colOrderForRow = (cols: number) => {
    const out: number[] = [];
    const halfPairs = Math.floor(cols / 2);
    for (let k = 0; k < halfPairs; k++) {
      out.push(k);
      out.push(cols - 1 - k);
    }
    if (cols % 2 === 1) out.push(Math.floor(cols / 2));
    return out;
  };

  type Grid = { rows: number; cols: number; dx: number };
  const candidates: Grid[] = [];
  const { min: colsMin0, max: colsMax0 } = resolveColsRange();

  const rowsList = Number.isFinite(rowsForced) && rowsForced > 0 ? [Math.max(1, Math.min(maxRows, Math.floor(rowsForced)))] : Array.from({ length: maxRows }, (_, i) => i + 1);

  for (const rows of rowsList) {
    for (let cols = colsMin0; cols <= colsMax0; cols++) {
      if (cols < 2) continue;
      const dx = cols === 1 ? 0 : b_centers_cm / (cols - 1);
      if (!(dx >= (governingDb + sMin) - 1e-9)) continue;
      if (!validateYBounds(args.face, h_cm, cover_eff_cm, governingDb, sMin, rows)) continue;

      // Capacidad total. Como los bastones pueden rellenar huecos en filas ya usadas
      // (incluida la primera fila), el criterio factible es por capacidad.
      const capacity = rows * cols;
      if (capacity >= (mainQty + bastonQtyRequested)) candidates.push({ rows, cols, dx });
    }

    // optimización: si encontramos con 1 o 2 filas, parar temprano
    if (candidates.length && !(Number.isFinite(rowsForced) && rowsForced > 0)) {
      if (rows <= 2) break;
    }
  }

  if (!candidates.length) {
    return {
      ok: false,
      reason: 'No hay layout factible (separación/filas/columnas)',
      debug: { mainQty, bastonQtyRequested, b_cm, h_cm, cover_cm, governingDb, sMin, b_centers_cm },
    };
  }

  candidates.sort((a, b) => {
    if (a.rows !== b.rows) return a.rows - b.rows;
    return b.dx - a.dx;
  });

  const best = candidates[0];
  const rows = best.rows;
  const cols = best.cols;
  const zs = symmetricZsCm(cols, b_centers_cm);

  const mainRowsUsed = Math.max(1, Math.ceil(mainQty / cols));

  const slotCols = colOrderForRow(cols);
  const slotIter = function* (rowStart: number, rowEndExclusive: number) {
    for (let r = rowStart; r < rowEndExclusive; r++) {
      for (const c of slotCols) yield { r, c };
    }
  };

  const main_bars_cm: Array<{ y_cm: number; z_cm: number }> = [];
  const baston_l1_bars_cm: Array<{ y_cm: number; z_cm: number }> = [];
  const baston_l2_bars_cm: Array<{ y_cm: number; z_cm: number }> = [];

  const occupied = new Array(rows * cols).fill(false);
  const keyOf = (r: number, c: number) => r * cols + c;

  // Main: desde fila 0
  {
    let remaining = mainQty;
    for (const s of slotIter(0, rows)) {
      if (remaining <= 0) break;
      main_bars_cm.push({
        y_cm: yForRowCm(args.face, h_cm, cover_eff_cm, governingDb, sMin, s.r),
        z_cm: zs[s.c] ?? 0,
      });
      occupied[keyOf(s.r, s.c)] = true;
      remaining--;
    }
  }

  // Bastones: rellenan huecos desde la primera fila (sin pisar el acero corrido).
  // Regla: si la primera fila queda incompleta con acero corrido, se completa con bastones.
  // Orden: L1 primero, luego L2.
  {
    let remainingL1 = bastonL1QtyRequested;
    let remainingL2 = bastonL2QtyRequested;
    for (const s of slotIter(0, rows)) {
      if (remainingL1 <= 0 && remainingL2 <= 0) break;
      if (occupied[keyOf(s.r, s.c)]) continue;
      const pt = {
        y_cm: yForRowCm(args.face, h_cm, cover_eff_cm, governingDb, sMin, s.r),
        z_cm: zs[s.c] ?? 0,
      };
      if (remainingL1 > 0) {
        baston_l1_bars_cm.push(pt);
        remainingL1--;
      } else if (remainingL2 > 0) {
        baston_l2_bars_cm.push(pt);
        remainingL2--;
      }
    }
  }

  // Si no entran todos los bastones solicitados, recortar (best-effort) sin tocar el acero principal.
  const bastonQtyUsed = baston_l1_bars_cm.length + baston_l2_bars_cm.length;
  const baston_pool_bars_cm = [...baston_l1_bars_cm, ...baston_l2_bars_cm];

  return {
    ok: true,
    rows,
    cols,
    s_min_cm: sMin,
    db_governing_cm: governingDb,
    main_db_cm: mainDb,
    baston_db_cm: bastonDb,
    main_bars_cm,
    baston_pool_bars_cm,
    baston_l1_bars_cm,
    baston_l2_bars_cm,
    debug: {
      mainQty,
      bastonQty_requested: bastonQtyRequested,
      bastonL1Qty_requested: bastonL1QtyRequested,
      bastonL2Qty_requested: bastonL2QtyRequested,
      bastonQty_used: bastonQtyUsed,
      totalQty_requested: totalQtyRequested,
      totalQty_used: mainQty + bastonQtyUsed,
      mainRowsUsed,
        stirrups_section_thickness_cm: stirrupsThicknessCm,
        cover_cm_effective: cover_eff_cm,
    },
  };
}
