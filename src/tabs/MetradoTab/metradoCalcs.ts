import type { DevelopmentIn, NodeIn, SpanIn } from '../../types';
import { parseStirrupsABCR } from '../../utils';
import { clampNumber, snap05m } from '../../utils';
import {
  lengthFromTableMeters,
  nodeBastonLineKind,
  nodeBastonLineToFaceEnabled,
  nodeSteelKind,
  nodeToFaceEnabled,
} from '../../services/steelService';
import { computeNodeOrigins } from '../../services/geometryService';
import { normalizeBastonCfg } from '../../services/developmentService';

// ─── Constants ──────────────────────────────────────────────────

export const REBAR: Record<string, { area_cm2: number; kg_m: number; splice_m: number }> = {
  '6mm':   { area_cm2: 0.28,   kg_m: 0.222, splice_m: 0.24 },
  '8mm':   { area_cm2: 0.50,   kg_m: 0.395, splice_m: 0.32 },
  '3/8':   { area_cm2: 0.713,  kg_m: 0.560, splice_m: 0.48 },
  '12mm':  { area_cm2: 1.13,   kg_m: 0.888, splice_m: 0.48 },
  '1/2':   { area_cm2: 1.267,  kg_m: 0.994, splice_m: 0.60 },
  '5/8':   { area_cm2: 1.979,  kg_m: 1.552, splice_m: 0.80 },
  '3/4':   { area_cm2: 2.850,  kg_m: 2.235, splice_m: 0.96 },
  '1':     { area_cm2: 5.067,  kg_m: 3.937, splice_m: 1.27 },
  '1-3/8': { area_cm2: 9.583,  kg_m: 7.907, splice_m: 1.65 },
};

export const LOSA_M = 0.20;
export const FY = 4200;
export const FC = 210;
export const RHO_MIN = 14 / FY;
export const BETA1 = FC <= 280 ? 0.85 : Math.max(0.65, 0.85 - 0.05 * (FC - 280) / 70);
export const RHO_B = 0.85 * BETA1 * (FC / FY) * (6000 / (6000 + FY));
export const RHO_MAX = 0.75 * RHO_B;
export const COMMERCIAL_BAR_LEN_M = 9.0;
export const LONG_HOOK_LEG_M = 0.15;

export function kgM(dia: string): number { return REBAR[dia]?.kg_m ?? 0; }
export function areaCm2(dia: string): number { return REBAR[dia]?.area_cm2 ?? 0; }
export function spliceM(dia: string): number { return REBAR[dia]?.splice_m ?? 0; }

// ─── Types ──────────────────────────────────────────────────────

export type ByDia = Record<string, number>;
export type SteelBucket = 'corrido' | 'bastones';

export interface SpanMetrado {
  idx: number;
  L: number;
  h: number;
  b: number;
  concreto_m3: number;
  encofrado_m2: number;
  corrido_kg: number;
  bastones_kg: number;
  estribos_kg: number;
  corrido_byDia: ByDia;
  bastones_byDia: ByDia;
  estribos_byDia: ByDia;
  estribos_count: number;
  topAs_cm2: number;
  botAs_cm2: number;
  rhoTop: number;
  rhoBot: number;
}

export interface MetradoResult {
  spans: SpanMetrado[];
  totalConcreto: number;
  totalEncofrado: number;
  totalCorrido: number;
  totalBastones: number;
  totalEstribos: number;
  totalAcero: number;
  corridoByDia: ByDia;
  bastonesByDia: ByDia;
  estribosByDia: ByDia;
  totalByDia: ByDia;
  allDias: string[];
  corridoDetalle: Array<{
    codigo: string;
    dia: string;
    len_m: number;
    qty: number;
    kg_m: number;
    peso_kg: number;
    nSplices: number;
  }>;
  bastonesDetalle: Array<{
    codigo: string;
    comp: number;
    dia: string;
    len_m: number;
    qty: number;
    kg_m: number;
    peso_kg: number;
    nSplices: number;
    spans: string;
    tags_txt: string;
  }>;
}

// ─── Internal types ─────────────────────────────────────────────

type GeoPiece = {
  id: string;
  bucket: SteelBucket;
  spanIdx: number;
  dia: string;
  len_m: number;
};

type GeoTrack = {
  id: string;
  bucket: SteelBucket;
  spanIdx: number;
  face: 'top' | 'bottom';
  zone: 'main' | 'z1' | 'z2' | 'z3';
  line: 0 | 1 | 2;
  qty: number;
  dia: string;
  straight_m: number;
  left_extra_m: number;
  right_extra_m: number;
};

type GeoEdge = {
  bucket: SteelBucket;
  dia: string;
  a: string;
  b: string;
  bridge_m: number;
  leftSpanIdx: number;
  rightSpanIdx: number;
};

type GeoSteelResult = {
  perSpan: Array<{
    corrido_kg: number;
    bastones_kg: number;
    corrido_byDia: ByDia;
    bastones_byDia: ByDia;
  }>;
  totalCorrido: number;
  totalBastones: number;
  corridoByDia: ByDia;
  bastonesByDia: ByDia;
  corridoDetalle: Array<{
    codigo: string;
    dia: string;
    len_m: number;
    qty: number;
    kg_m: number;
    peso_kg: number;
    nSplices: number;
  }>;
};

type BastonesTopoResult = {
  perSpan: Array<{ bastones_kg: number; bastones_byDia: ByDia }>;
  totalBastones: number;
  bastonesByDia: ByDia;
  detalle: Array<{
    codigo: string;
    comp: number;
    dia: string;
    len_m: number;
    qty: number;
    kg_m: number;
    peso_kg: number;
    nSplices: number;
    spans: string;
    tags_txt: string;
  }>;
};

// ─── Helpers ────────────────────────────────────────────────────

export function mergeDia(target: ByDia, source: ByDia) {
  for (const [k, v] of Object.entries(source)) target[k] = (target[k] ?? 0) + v;
}

export function countABCR(spec: string | null | undefined, zoneLen: number): number {
  if (!spec) return 0;
  const abcr = parseStirrupsABCR(spec);
  if (!abcr) return 0;
  let n = 0, cursor = 0;
  if (abcr.A_m > 0) { cursor = abcr.A_m; n = 1; }
  if (abcr.b_n > 1 && abcr.B_m > 0)
    for (let k = 1; k < abcr.b_n; k++) { cursor += abcr.B_m; if (cursor > zoneLen + 1e-3) break; n++; }
  if (abcr.c_n > 0 && abcr.C_m > 0)
    for (let k = 0; k < abcr.c_n; k++) { cursor += abcr.C_m; if (cursor > zoneLen + 1e-3) break; n++; }
  if (abcr.R_m > 0)
    while (cursor + abcr.R_m <= zoneLen + 1e-3) { cursor += abcr.R_m; n++; }
  return n;
}

function clampPos(v: number): number { return Number.isFinite(v) ? Math.max(0, v) : 0; }

function nodeWidthForFace(node: NodeIn | undefined, face: 'top' | 'bottom'): number {
  if (!node) return 0;
  if (face === 'top') return Math.abs((node.b2 ?? 0) - (node.b1 ?? 0));
  return Math.abs(((node.a2 ?? 0) ?? 0) - ((node.a1 ?? 0) ?? 0));
}

function mainSteelEndExtraM(
  node: NodeIn | undefined,
  face: 'top' | 'bottom',
  end: 1 | 2,
  dia: string,
  recub: number,
): number {
  if (!node) return 0;
  const kind = nodeSteelKind(node, face, end);
  if (kind === 'continuous') return 0;
  const toFace = nodeToFaceEnabled(node, face, end);
  let horiz = 0;
  if (toFace) {
    horiz = Math.max(0, nodeWidthForFace(node, face) - recub);
  } else {
    const customField = `steel_${face}_${end}_anchorage_length`;
    const custom = Number((node as any)[customField]);
    horiz = custom > 0
      ? custom
      : lengthFromTableMeters(dia, kind === 'hook' ? 'hook' : 'anchorage', face);
  }
  const vert = kind === 'hook' ? LONG_HOOK_LEG_M : 0;
  return clampPos(horiz + vert);
}

function bastonEndExtraM(
  node: NodeIn | undefined,
  face: 'top' | 'bottom',
  end: 1 | 2,
  line: 1 | 2,
  dia: string,
  recub: number,
): number {
  if (!node) return 0;
  const kind = nodeBastonLineKind(node, face, end, line);
  if (kind === 'continuous') return 0;
  const toFace = nodeBastonLineToFaceEnabled(node, face, end, line);
  const horiz = toFace
    ? Math.max(0, nodeWidthForFace(node, face) - recub)
    : lengthFromTableMeters(dia, kind === 'hook' ? 'hook' : 'anchorage', face);
  const vert = kind === 'hook' ? LONG_HOOK_LEG_M : 0;
  return clampPos(horiz + vert);
}

function lineEnabled(cfg: any, line: 1 | 2): boolean {
  return line === 1 ? Boolean(cfg?.l1_enabled ?? cfg?.enabled ?? false) : Boolean(cfg?.l2_enabled ?? false);
}

function lineQty(cfg: any, line: 1 | 2): number {
  const raw = line === 1 ? (cfg?.l1_qty ?? cfg?.qty ?? 1) : (cfg?.l2_qty ?? 1);
  return Math.max(1, Math.min(3, Math.round(Number(raw) || 1)));
}

function lineDia(cfg: any, line: 1 | 2): string {
  return String(line === 1 ? (cfg?.l1_diameter ?? cfg?.diameter ?? '3/4') : (cfg?.l2_diameter ?? '3/4'));
}

// ─── Main calc functions ────────────────────────────────────────

export function calcSteelGeometryMetrado(dev: DevelopmentIn, recub: number): GeoSteelResult {
  const spans = dev.spans ?? [];
  const nodes = dev.nodes ?? [];
  const originsU = computeNodeOrigins(dev);
  const unitScale = dev.unit_scale ?? 2;
  const uToM = (u: number) => u / unitScale;
  const pieces: GeoPiece[] = [];
  const tracks: GeoTrack[] = [];
  const edges: GeoEdge[] = [];
  const parent = new Map<string, string>();
  const rank = new Map<string, number>();
  const corridoRef = new Map<string, { id: string; dia: string }>();
  const bastonRef = new Map<string, { id: string; dia: string }>();
  const baseContrib: Array<{ refId: string; bucket: SteelBucket; spanIdx: number; dia: string; len_m: number }> = [];
  const perSpan = spans.map(() => ({ corrido_kg: 0, bastones_kg: 0, corrido_byDia: {} as ByDia, bastones_byDia: {} as ByDia }));
  const corridoByDia: ByDia = {};
  const bastonesByDia: ByDia = {};
  const validations: string[] = [];

  const makeSet = (id: string) => { if (!parent.has(id)) { parent.set(id, id); rank.set(id, 0); } };
  const find = (id: string): string => {
    const p = parent.get(id);
    if (!p || p === id) return id;
    const r = find(p);
    parent.set(id, r);
    return r;
  };
  const union = (a: string, b: string) => {
    let ra = find(a), rb = find(b);
    if (ra === rb) return;
    const ka = rank.get(ra) ?? 0;
    const kb = rank.get(rb) ?? 0;
    if (ka < kb) [ra, rb] = [rb, ra];
    parent.set(rb, ra);
    if (ka === kb) rank.set(ra, ka + 1);
  };
  const addPiece = (p: GeoPiece) => {
    pieces.push(p);
    makeSet(p.id);
    baseContrib.push({ refId: p.id, bucket: p.bucket, spanIdx: p.spanIdx, dia: p.dia, len_m: p.len_m });
  };
  const addTrack = (t: GeoTrack) => {
    tracks.push(t);
    if (t.qty <= 0) validations.push(`Track qty<=0: ${t.id}`);
    if (!(t.straight_m >= 0) || !(t.left_extra_m >= 0) || !(t.right_extra_m >= 0)) {
      validations.push(`Track longitud negativa: ${t.id}`);
    }
    for (let qi = 0; qi < t.qty; qi++) {
      const id = `${t.id}:q${qi}`;
      addPiece({ id, bucket: t.bucket, spanIdx: t.spanIdx, dia: t.dia, len_m: clampPos(t.straight_m + t.left_extra_m + t.right_extra_m) });
      if (t.bucket === 'corrido') {
        corridoRef.set(`${t.face}:${t.spanIdx}:${qi}`, { id, dia: t.dia });
      } else {
        bastonRef.set(`${t.face}:${t.zone}:${t.line}:${t.spanIdx}:${qi}`, { id, dia: t.dia });
      }
    }
  };
  const addEdge = (e: GeoEdge) => {
    if (!(e.bridge_m > 0)) return;
    edges.push(e);
    union(e.a, e.b);
    baseContrib.push({ refId: e.a, bucket: e.bucket, spanIdx: e.leftSpanIdx, dia: e.dia, len_m: e.bridge_m / 2 });
    baseContrib.push({ refId: e.a, bucket: e.bucket, spanIdx: e.rightSpanIdx, dia: e.dia, len_m: e.bridge_m / 2 });
  };

  for (let si = 0; si < spans.length; si++) {
    const span = spans[si];
    const L = clampPos(span.L ?? 0);
    const nL = nodes[si];
    const nR = nodes[si + 1];

    for (const face of ['top', 'bottom'] as const) {
      const meta = face === 'top' ? span.steel_top : span.steel_bottom;
      const qty = Math.max(0, Math.round(Number(meta?.qty ?? 0)));
      const dia = String(meta?.diameter ?? '3/4');
      addTrack({
        id: `c:${face}:${si}`,
        bucket: 'corrido',
        spanIdx: si,
        face,
        zone: 'main',
        line: 0,
        qty,
        dia,
        straight_m: L,
        left_extra_m: mainSteelEndExtraM(nL, face, 2, dia, recub),
        right_extra_m: mainSteelEndExtraM(nR, face, 1, dia, recub),
      });
    }

    for (const face of ['top', 'bottom'] as const) {
      const sideCfg = span.bastones?.[face];
      if (!sideCfg) continue;
      const xaSideM = (() => {
        if (face === 'top') {
          const xTop0U = (originsU[si] ?? 0) + unitScale * clampNumber(nodes[si]?.b2 ?? 0, 0);
          const xTop1U = (originsU[si + 1] ?? 0) + unitScale * clampNumber(nodes[si + 1]?.b1 ?? 0, 0);
          return uToM(Math.min(xTop0U, xTop1U));
        }
        const xBot0U = (originsU[si] ?? 0) + unitScale * clampNumber(nodes[si]?.a2 ?? 0, 0);
        const xBot1U = xBot0U + unitScale * L;
        return uToM(Math.min(xBot0U, xBot1U));
      })();
      const xbSideM = (() => {
        if (face === 'top') {
          const xTop0U = (originsU[si] ?? 0) + unitScale * clampNumber(nodes[si]?.b2 ?? 0, 0);
          const xTop1U = (originsU[si + 1] ?? 0) + unitScale * clampNumber(nodes[si + 1]?.b1 ?? 0, 0);
          return uToM(Math.max(xTop0U, xTop1U));
        }
        const xBot0U = (originsU[si] ?? 0) + unitScale * clampNumber(nodes[si]?.a2 ?? 0, 0);
        const xBot1U = xBot0U + unitScale * L;
        return uToM(Math.max(xBot0U, xBot1U));
      })();
      const sideLenM = Math.max(0, xbSideM - xaSideM);
      const defLenM = L / 5;
      const defL3M = L / 3;
      const resolvedLenM = (cfg: any, field: 'L1_m' | 'L2_m' | 'L3_m', fallbackM: number) => {
        const v = cfg?.[field];
        const n = typeof v === 'number' ? v : NaN;
        const out = Number.isFinite(n) && n > 0 ? n : fallbackM;
        const snapped = snap05m(out);
        return Math.min(L, Math.max(0, snapped));
      };
      for (const zone of ['z1', 'z2', 'z3'] as const) {
        const cfg: any = normalizeBastonCfg((sideCfg as any)[zone]);
        if (!cfg) continue;
        for (const line of [1, 2] as const) {
          if (!lineEnabled(cfg, line)) continue;
          const qty = lineQty(cfg, line);
          const dia = lineDia(cfg, line);
          let straightLen = 0;
          if (zone === 'z1') {
            const L3 = resolvedLenM(cfg, 'L3_m', defL3M);
            const x0z = xaSideM;
            const x1z = Math.min(xbSideM, xaSideM + L3);
            straightLen = clampPos(x1z - x0z);
          } else if (zone === 'z3') {
            const L3 = resolvedLenM(cfg, 'L3_m', defL3M);
            const x1z = xbSideM;
            const x0z = Math.max(xaSideM, xbSideM - L3);
            straightLen = clampPos(x1z - x0z);
          } else {
            const L1m = resolvedLenM(cfg, 'L1_m', defLenM);
            const L2m = resolvedLenM(cfg, 'L2_m', defLenM);
            const x0z = xaSideM + L1m;
            const x1z = xbSideM - L2m;
            straightLen = clampPos(Math.min(sideLenM, x1z - x0z));
            const expectedGeom = clampPos(sideLenM - L1m - L2m);
            if (Math.abs(straightLen - expectedGeom) > 1e-6) {
              validations.push(`Z2 geom mismatch s${si}:${face}:l${line} -> ${straightLen.toFixed(3)} vs ${expectedGeom.toFixed(3)}`);
            }
          }
          if (!(straightLen > 0)) continue;
          const leftExtra = zone === 'z1' ? bastonEndExtraM(nL, face, 2, line, dia, recub) : 0;
          const rightExtra = zone === 'z3' ? bastonEndExtraM(nR, face, 1, line, dia, recub) : 0;
          addTrack({
            id: `b:${face}:${zone}:${line}:${si}`,
            bucket: 'bastones',
            spanIdx: si,
            face,
            zone,
            line,
            qty,
            dia,
            straight_m: straightLen,
            left_extra_m: leftExtra,
            right_extra_m: rightExtra,
          });
        }
      }
    }
  }

  for (let ni = 1; ni < nodes.length - 1; ni++) {
    const node = nodes[ni];
    const li = ni - 1;
    const ri = ni;
    for (const face of ['top', 'bottom'] as const) {
      const bridge = nodeWidthForFace(node, face);
      if (!(bridge > 0)) continue;

      const k1 = nodeSteelKind(node, face, 1);
      const k2 = nodeSteelKind(node, face, 2);
      if (k1 === 'continuous' && k2 === 'continuous') {
        const qL = Math.max(0, Math.round(Number((face === 'top' ? spans[li]?.steel_top?.qty : spans[li]?.steel_bottom?.qty) ?? 0)));
        const qR = Math.max(0, Math.round(Number((face === 'top' ? spans[ri]?.steel_top?.qty : spans[ri]?.steel_bottom?.qty) ?? 0)));
        const q = Math.min(qL, qR);
        for (let bi = 0; bi < q; bi++) {
          const a = corridoRef.get(`${face}:${li}:${bi}`);
          const b = corridoRef.get(`${face}:${ri}:${bi}`);
          if (!a || !b || a.dia !== b.dia) continue;
          addEdge({ bucket: 'corrido', dia: a.dia, a: a.id, b: b.id, bridge_m: bridge, leftSpanIdx: li, rightSpanIdx: ri });
        }
      }

      for (const line of [1, 2] as const) {
        const bk1 = nodeBastonLineKind(node, face, 1, line);
        const bk2 = nodeBastonLineKind(node, face, 2, line);
        if (!(bk1 === 'continuous' && bk2 === 'continuous')) continue;
        for (let bi = 0; bi < 3; bi++) {
          const a = bastonRef.get(`${face}:z3:${line}:${li}:${bi}`);
          const b = bastonRef.get(`${face}:z1:${line}:${ri}:${bi}`);
          if (!a || !b || a.dia !== b.dia) continue;
          addEdge({ bucket: 'bastones', dia: a.dia, a: a.id, b: b.id, bridge_m: bridge, leftSpanIdx: li, rightSpanIdx: ri });
        }
      }
    }
  }

  const compTotalLen = new Map<string, number>();
  for (const p of pieces) {
    const root = find(p.id);
    compTotalLen.set(root, (compTotalLen.get(root) ?? 0) + p.len_m);
  }
  for (const e of edges) {
    const root = find(e.a);
    compTotalLen.set(root, (compTotalLen.get(root) ?? 0) + e.bridge_m);
  }

  const compContrib = new Map<string, Array<{ bucket: SteelBucket; spanIdx: number; dia: string; len_m: number }>>();
  for (const c of baseContrib) {
    const root = find(c.refId);
    const arr = compContrib.get(root) ?? [];
    arr.push({ bucket: c.bucket, spanIdx: c.spanIdx, dia: c.dia, len_m: c.len_m });
    compContrib.set(root, arr);
  }

  const corridoDetalle: GeoSteelResult['corridoDetalle'] = [];
  let corridoSeq = 1;

  for (const [root, entries] of compContrib.entries()) {
    if (entries.length === 0 || entries[0].bucket !== 'corrido') continue;
    const totalLen = clampPos(compTotalLen.get(root) ?? 0);
    if (!(totalLen > 0)) continue;
    const dia = entries[0].dia;
    const nSplices = Math.max(0, Math.ceil(totalLen / COMMERCIAL_BAR_LEN_M) - 1);
    const extraSpliceLen = nSplices * spliceM(dia);
    corridoDetalle.push({
      codigo: `C${String(corridoSeq++).padStart(4, '0')}`,
      dia,
      len_m: Math.round(totalLen * 1000) / 1000,
      qty: 1,
      kg_m: kgM(dia),
      peso_kg: Math.round((totalLen + extraSpliceLen) * kgM(dia) * 10000) / 10000,
      nSplices,
    });
  }
  corridoDetalle.sort((a, b) => b.len_m - a.len_m);

  const addKg = (bucket: SteelBucket, spanIdx: number, dia: string, len_m: number) => {
    const kg = clampPos(len_m) * kgM(dia);
    if (!(kg > 0) || !perSpan[spanIdx]) return;
    if (bucket === 'corrido') {
      perSpan[spanIdx].corrido_kg += kg;
      perSpan[spanIdx].corrido_byDia[dia] = (perSpan[spanIdx].corrido_byDia[dia] ?? 0) + kg;
      corridoByDia[dia] = (corridoByDia[dia] ?? 0) + kg;
    } else {
      perSpan[spanIdx].bastones_kg += kg;
      perSpan[spanIdx].bastones_byDia[dia] = (perSpan[spanIdx].bastones_byDia[dia] ?? 0) + kg;
      bastonesByDia[dia] = (bastonesByDia[dia] ?? 0) + kg;
    }
  };

  for (const [root, entries] of compContrib.entries()) {
    const totalLen = clampPos(compTotalLen.get(root) ?? 0);
    if (!(totalLen > 0) || entries.length === 0) continue;
    const dia = entries[0].dia;
    const nSplices = Math.max(0, Math.ceil(totalLen / COMMERCIAL_BAR_LEN_M) - 1);
    const extraSpliceLen = nSplices * spliceM(dia);
    const baseSum = entries.reduce((acc, e) => acc + e.len_m, 0);
    for (const e of entries) {
      const share = baseSum > 0 ? (e.len_m / baseSum) : 0;
      addKg(e.bucket, e.spanIdx, e.dia, e.len_m + extraSpliceLen * share);
    }
  }

  if (tracks.length > 0) {
    const invalid = tracks.filter((t) => t.bucket === 'bastones' && !(t.straight_m > 0));
    for (const t of invalid) validations.push(`Baston track sin longitud: ${t.id}`);
  }
  if (validations.length > 0 && typeof console !== 'undefined') {
    console.warn('[Metrado] Validaciones acero longitudinal', validations.slice(0, 20));
  }

  let totalCorrido = 0;
  let totalBastones = 0;
  for (const s of perSpan) {
    totalCorrido += s.corrido_kg;
    totalBastones += s.bastones_kg;
  }

  return { perSpan, totalCorrido, totalBastones, corridoByDia, bastonesByDia, corridoDetalle };
}

export function calcBastonesTopologyMetrado(dev: DevelopmentIn, recub: number): BastonesTopoResult {
  type Seg = {
    id: string;
    x0: number; y0: number;
    x1: number; y1: number;
    len_m: number;
    spanIdx: number;
    dia: string;
    tag: string;
  };
  type EndRef = { xNode: number; y: number };
  type LogicalBridge = {
    aKey: string;
    bKey: string;
    bridge_m: number;
    dia: string;
    leftSpanIdx: number;
    rightSpanIdx: number;
  };
  const spans = dev.spans ?? [];
  const nodes = dev.nodes ?? [];
  const unitScale = dev.unit_scale ?? 2;
  const uToM = (u: number) => u / unitScale;
  const originsU = computeNodeOrigins(dev);
  const bastonLc = clampPos(clampNumber((dev as any).baston_Lc ?? 0.45, 0.45));
  const segs: Seg[] = [];
  const endpointIndex = new Map<string, number[]>();
  const endpointRefs = new Map<string, EndRef>();
  const logicalBridges: LogicalBridge[] = [];
  const validations: string[] = [];

  const yLane = (face: 'top' | 'bottom', line: 1 | 2, bi: number) =>
    (face === 'top' ? 10 : -10) + (line === 1 ? 0 : 1) + bi * 0.01;
  const yHook2 = (face: 'top' | 'bottom', y: number) => face === 'top' ? (y - LONG_HOOK_LEG_M) : (y + LONG_HOOK_LEG_M);
  const qk = (v: number) => Math.round(v * 1e6) / 1e6;
  const pkey = (x: number, y: number) => `${qk(x)},${qk(y)}`;
  const addSeg = (seg: Omit<Seg, 'id' | 'len_m'>) => {
    const len = Math.hypot(seg.x1 - seg.x0, seg.y1 - seg.y0);
    if (!(len > 1e-9)) return;
    const id = `bs:${segs.length}`;
    const s: Seg = { ...seg, id, len_m: len };
    segs.push(s);
    const a = pkey(s.x0, s.y0);
    const b = pkey(s.x1, s.y1);
    endpointIndex.set(a, [...(endpointIndex.get(a) ?? []), segs.length - 1]);
    endpointIndex.set(b, [...(endpointIndex.get(b) ?? []), segs.length - 1]);
  };
  const nodeFaceWidth = (node: NodeIn | undefined, face: 'top' | 'bottom') =>
    face === 'top'
      ? Math.abs((node?.b2 ?? 0) - (node?.b1 ?? 0))
      : Math.abs(((node?.a2 ?? 0) ?? 0) - ((node?.a1 ?? 0) ?? 0));
  const bastonEndGeom = (
    node: NodeIn | undefined,
    face: 'top' | 'bottom',
    end: 1 | 2,
    line: 1 | 2,
    dia: string,
  ) => {
    if (!node) return { kind: 'continuous' as const, horiz: 0, hook: false };
    const kind = nodeBastonLineKind(node, face, end, line);
    if (kind === 'continuous') return { kind, horiz: 0, hook: false };
    const toFace = nodeBastonLineToFaceEnabled(node, face, end, line);
    const horiz = toFace
      ? Math.max(0, nodeFaceWidth(node, face) - recub)
      : lengthFromTableMeters(dia, kind === 'hook' ? 'hook' : 'anchorage', face);
    return { kind, horiz: clampPos(horiz), hook: kind === 'hook' };
  };
  const resolvedLenM = (cfg: any, field: 'L1_m' | 'L2_m' | 'L3_m', fallbackM: number, Lm: number) => {
    const v = cfg?.[field];
    const n = typeof v === 'number' ? v : NaN;
    const out = Number.isFinite(n) && n > 0 ? n : fallbackM;
    return Math.min(Lm, Math.max(0, snap05m(out)));
  };

  for (let si = 0; si < spans.length; si++) {
    const span = spans[si];
    const Lm = clampPos(span.L ?? 0);
    if (!(Lm > 0)) continue;
    const nL = nodes[si];
    const nR = nodes[si + 1];

    for (const face of ['top', 'bottom'] as const) {
      const sideCfg = span.bastones?.[face];
      if (!sideCfg) continue;
      const xa = (() => {
        if (face === 'top') {
          const x0u = (originsU[si] ?? 0) + unitScale * clampNumber(nodes[si]?.b2 ?? 0, 0);
          const x1u = (originsU[si + 1] ?? 0) + unitScale * clampNumber(nodes[si + 1]?.b1 ?? 0, 0);
          return uToM(Math.min(x0u, x1u));
        }
        const x0u = (originsU[si] ?? 0) + unitScale * clampNumber(nodes[si]?.a2 ?? 0, 0);
        const x1u = x0u + unitScale * Lm;
        return uToM(Math.min(x0u, x1u));
      })();
      const xb = (() => {
        if (face === 'top') {
          const x0u = (originsU[si] ?? 0) + unitScale * clampNumber(nodes[si]?.b2 ?? 0, 0);
          const x1u = (originsU[si + 1] ?? 0) + unitScale * clampNumber(nodes[si + 1]?.b1 ?? 0, 0);
          return uToM(Math.max(x0u, x1u));
        }
        const x0u = (originsU[si] ?? 0) + unitScale * clampNumber(nodes[si]?.a2 ?? 0, 0);
        const x1u = x0u + unitScale * Lm;
        return uToM(Math.max(x0u, x1u));
      })();
      const sideLen = clampPos(xb - xa);
      const defL = Lm / 5;
      const defL3 = Lm / 3;

      for (const zone of ['z1', 'z2', 'z3'] as const) {
        const cfg = normalizeBastonCfg((sideCfg as any)[zone]);
        for (const line of [1, 2] as const) {
          if (!lineEnabled(cfg, line)) continue;
          const qty = lineQty(cfg, line);
          const dia = lineDia(cfg, line);

          let x0 = 0, x1 = 0;
          if (zone === 'z1') {
            const L3 = resolvedLenM(cfg, 'L3_m', defL3, Lm);
            x0 = xa;
            x1 = Math.min(xb, xa + L3);
            if (line === 2) x1 -= bastonLc;
          } else if (zone === 'z3') {
            const L3 = resolvedLenM(cfg, 'L3_m', defL3, Lm);
            x1 = xb;
            x0 = Math.max(xa, xb - L3);
            if (line === 2) x0 += bastonLc;
          } else {
            const L1m = resolvedLenM(cfg, 'L1_m', defL, Lm);
            const L2m = resolvedLenM(cfg, 'L2_m', defL, Lm);
            x0 = xa + L1m;
            x1 = xb - L2m;
            if (line === 2) {
              x0 += bastonLc;
              x1 -= bastonLc;
            }
            const expected = clampPos(sideLen - L1m - L2m - (line === 2 ? 2 * bastonLc : 0));
            const got = clampPos(x1 - x0);
            if (Math.abs(got - expected) > 1e-6) validations.push(`Z2 topo mismatch s${si} ${face} L${line}`);
          }
          if (!(x1 > x0 + 1e-9)) continue;

          for (let bi = 0; bi < qty; bi++) {
            const y = yLane(face, line, bi);
            const baseTag = `${face}.${zone}.L${line}`;
            addSeg({ x0, y0: y, x1, y1: y, spanIdx: si, dia, tag: baseTag });

            if (zone === 'z1') {
              endpointRefs.set(`${face}:z1:${line}:${si}:${bi}`, { xNode: x0, y });
              const e = bastonEndGeom(nL, face, 2, line, dia);
              if (e.kind === 'hook' || e.kind === 'development') {
                const x2 = x0 - e.horiz;
                addSeg({ x0: x2, y0: y, x1: x0, y1: y, spanIdx: si, dia, tag: `${baseTag}.ext` });
                if (e.hook) addSeg({ x0: x2, y0: y, x1: x2, y1: yHook2(face, y), spanIdx: si, dia, tag: `${baseTag}.hook` });
              }
            }
            if (zone === 'z3') {
              endpointRefs.set(`${face}:z3:${line}:${si}:${bi}`, { xNode: x1, y });
              const e = bastonEndGeom(nR, face, 1, line, dia);
              if (e.kind === 'hook' || e.kind === 'development') {
                const x2 = x1 + e.horiz;
                addSeg({ x0: x1, y0: y, x1: x2, y1: y, spanIdx: si, dia, tag: `${baseTag}.ext` });
                if (e.hook) addSeg({ x0: x2, y0: y, x1: x2, y1: yHook2(face, y), spanIdx: si, dia, tag: `${baseTag}.hook` });
              }
            }
            if (zone === 'z2') {
              endpointRefs.set(`${face}:z2L:${line}:${si}:${bi}`, { xNode: x0, y });
              endpointRefs.set(`${face}:z2R:${line}:${si}:${bi}`, { xNode: x1, y });
              if (si === 0) {
                const eL = bastonEndGeom(nL, face, 2, line, dia);
                if (eL.kind === 'hook' || eL.kind === 'development') {
                  const x2 = x0 - eL.horiz;
                  addSeg({ x0: x2, y0: y, x1: x0, y1: y, spanIdx: si, dia, tag: `${baseTag}.extZ2` });
                }
              }
              if (si === spans.length - 1) {
                const eR = bastonEndGeom(nR, face, 1, line, dia);
                if (eR.kind === 'hook' || eR.kind === 'development') {
                  const x2 = x1 + eR.horiz;
                  addSeg({ x0: x1, y0: y, x1: x2, y1: y, spanIdx: si, dia, tag: `${baseTag}.extZ2` });
                }
              }
            }
          }
        }
      }
    }
  }

  for (let ni = 1; ni < nodes.length - 1; ni++) {
    const node = nodes[ni];
    const li = ni - 1;
    const ri = ni;
    for (const face of ['top', 'bottom'] as const) {
      const bridge = nodeFaceWidth(node, face);
      if (!(bridge > 0)) continue;
      for (const line of [1, 2] as const) {
        const kL = nodeBastonLineKind(node, face, 1, line);
        const kR = nodeBastonLineKind(node, face, 2, line);
        if (!(kL === 'continuous' && kR === 'continuous')) continue;
        for (let bi = 0; bi < 3; bi++) {
          const a = endpointRefs.get(`${face}:z3:${line}:${li}:${bi}`);
          const b = endpointRefs.get(`${face}:z1:${line}:${ri}:${bi}`);
          if (!a || !b) continue;
          addSeg({ x0: a.xNode, y0: a.y, x1: b.xNode, y1: b.y, spanIdx: li, dia: line === 1
            ? lineDia(normalizeBastonCfg((spans[li] as any)?.bastones?.[face]?.z3), 1)
            : lineDia(normalizeBastonCfg((spans[li] as any)?.bastones?.[face]?.z3), 2), tag: `${face}.z3z1.L${line}.bridge` });
          if (Math.abs(Math.hypot(b.xNode - a.xNode, b.y - a.y) - bridge) > 0.2) {
            validations.push(`Bridge len diff n${ni} ${face} L${line} ~${bridge.toFixed(2)}`);
          }
        }
        for (let bi = 0; bi < 3; bi++) {
          const a2 = endpointRefs.get(`${face}:z2R:${line}:${li}:${bi}`);
          const b2 = endpointRefs.get(`${face}:z2L:${line}:${ri}:${bi}`);
          if (!a2 || !b2) continue;
          const diaL = lineDia(normalizeBastonCfg((spans[li] as any)?.bastones?.[face]?.z2), line);
          const diaR = lineDia(normalizeBastonCfg((spans[ri] as any)?.bastones?.[face]?.z2), line);
          if (diaL !== diaR) continue;
          logicalBridges.push({
            aKey: pkey(a2.xNode, a2.y),
            bKey: pkey(b2.xNode, b2.y),
            bridge_m: bridge,
            dia: diaL,
            leftSpanIdx: li,
            rightSpanIdx: ri,
          });
        }
      }
    }
  }

  const parent = new Map<number, number>();
  const rank = new Map<number, number>();
  const make = (i: number) => { if (!parent.has(i)) { parent.set(i, i); rank.set(i, 0); } };
  const find = (i: number): number => {
    const p = parent.get(i);
    if (p == null || p === i) return i;
    const r = find(p);
    parent.set(i, r);
    return r;
  };
  const union = (a: number, b: number) => {
    let ra = find(a), rb = find(b);
    if (ra === rb) return;
    const ka = rank.get(ra) ?? 0, kb = rank.get(rb) ?? 0;
    if (ka < kb) [ra, rb] = [rb, ra];
    parent.set(rb, ra);
    if (ka === kb) rank.set(ra, ka + 1);
  };
  for (let i = 0; i < segs.length; i++) make(i);
  for (const idxs of endpointIndex.values()) {
    for (let i = 1; i < idxs.length; i++) union(idxs[0], idxs[i]);
  }
  const bridgeResolved: Array<{ segIdx: number; bridge_m: number; leftSpanIdx: number; rightSpanIdx: number }> = [];
  for (const lb of logicalBridges) {
    const ia = endpointIndex.get(lb.aKey)?.[0];
    const ib = endpointIndex.get(lb.bKey)?.[0];
    if (ia == null || ib == null) continue;
    if (segs[ia]?.dia !== lb.dia || segs[ib]?.dia !== lb.dia) continue;
    union(ia, ib);
    bridgeResolved.push({ segIdx: ia, bridge_m: lb.bridge_m, leftSpanIdx: lb.leftSpanIdx, rightSpanIdx: lb.rightSpanIdx });
  }

  const perSpan = spans.map(() => ({ bastones_kg: 0, bastones_byDia: {} as ByDia }));
  const bastonesByDia: ByDia = {};
  const compLen = new Map<number, number>();
  const compBySpan = new Map<number, Map<number, number>>();
  const compDia = new Map<number, string>();
  const compTags = new Map<number, Set<string>>();
  for (let i = 0; i < segs.length; i++) {
    const r = find(i);
    const s = segs[i];
    const metrableLen = s.tag.endsWith('.extZ2') ? 0 : s.len_m;
    compLen.set(r, (compLen.get(r) ?? 0) + metrableLen);
    const bySpan = compBySpan.get(r) ?? new Map<number, number>();
    bySpan.set(s.spanIdx, (bySpan.get(s.spanIdx) ?? 0) + metrableLen);
    compBySpan.set(r, bySpan);
    const prevDia = compDia.get(r);
    if (!prevDia) compDia.set(r, s.dia);
    else if (prevDia !== s.dia) validations.push(`Componente baston con dias mixtos ${prevDia}/${s.dia}`);
    const ts = compTags.get(r) ?? new Set<string>();
    ts.add(s.tag);
    compTags.set(r, ts);
  }

  const detalleRows: BastonesTopoResult['detalle'] = [];
  let bastonCodeSeq = 1;
  for (const [r, totalLen0] of compLen.entries()) {
    const dia = compDia.get(r) ?? '3/4';
    const totalLen = clampPos(totalLen0);
    const nSplices = Math.max(0, Math.ceil(totalLen / COMMERCIAL_BAR_LEN_M) - 1);
    const extraSp = nSplices * spliceM(dia);
    const bySpanRaw = compBySpan.get(r) ?? new Map<number, number>();
    const bySpan = new Map<number, number>();
    for (const [si, len] of bySpanRaw.entries()) {
      if (len > 1e-9) bySpan.set(si, len);
    }
    let base = 0; for (const v of bySpan.values()) base += v;
    if (!(totalLen > 1e-9) || !(base > 1e-9)) continue;
    for (const [si, len] of bySpan.entries()) {
      const lenWithSp = len + (base > 0 ? (len / base) * extraSp : 0);
      const kg = lenWithSp * kgM(dia);
      if (!(kg > 0) || !perSpan[si]) continue;
      perSpan[si].bastones_kg += kg;
      perSpan[si].bastones_byDia[dia] = (perSpan[si].bastones_byDia[dia] ?? 0) + kg;
      bastonesByDia[dia] = (bastonesByDia[dia] ?? 0) + kg;
    }
    const spansTxt = Array.from(bySpan.keys()).map((si) => `T${si + 1}`).sort().join(',');
    detalleRows.push({
      codigo: `B${String(bastonCodeSeq++).padStart(4, '0')}`,
      comp: r,
      dia,
      len_m: Math.round(totalLen * 1000) / 1000,
      qty: 1,
      kg_m: kgM(dia),
      peso_kg: Math.round((totalLen + extraSp) * kgM(dia) * 10000) / 10000,
      nSplices,
      spans: spansTxt,
      tags_txt: Array.from(compTags.get(r) ?? []).sort().join(' | '),
    });
  }
  detalleRows.sort((a, b) => b.len_m - a.len_m);
  if (validations.length && typeof console !== 'undefined') {
    console.warn('[Metrado Bastones Topologia]', validations.slice(0, 40));
  }

  let totalBastones = 0;
  for (const s of perSpan) totalBastones += s.bastones_kg;
  return { perSpan, totalBastones, bastonesByDia, detalle: detalleRows };
}

export function calcSpan(span: SpanIn, idx: number, recub: number): SpanMetrado {
  const L = span.L ?? 0;
  const h = span.h ?? 0;
  const b = span.b ?? 0.25;
  const d_cm = Math.max(0, (h - recub)) * 100;
  const b_cm = b * 100;

  const concreto_m3 = b * h * L;
  const encofrado_m2 = (b + 2 * Math.max(0, h - LOSA_M)) * L;

  const corrido_byDia: ByDia = {};
  let corrido_kg = 0;
  for (const side of ['top', 'bottom'] as const) {
    const meta = side === 'top' ? span.steel_top : span.steel_bottom;
    if (!meta) continue;
    const qty = meta.qty ?? 0;
    const dia = meta.diameter ?? '3/4';
    const kg = qty * L * kgM(dia);
    if (kg > 0) { corrido_kg += kg; corrido_byDia[dia] = (corrido_byDia[dia] ?? 0) + kg; }
  }

  const bastones_byDia: ByDia = {};
  let bastones_kg = 0;
  const defLen = L / 5;
  for (const side of ['top', 'bottom'] as const) {
    const sideCfg = span.bastones?.[side];
    if (!sideCfg) continue;
    for (const zone of ['z1', 'z2', 'z3'] as const) {
      const cfg = sideCfg[zone];
      if (!cfg) continue;
      for (const line of [1, 2] as const) {
        const enabled = line === 1 ? (cfg.l1_enabled ?? cfg.enabled ?? false) : (cfg.l2_enabled ?? false);
        if (!enabled) continue;
        const qty = line === 1 ? (cfg.l1_qty ?? cfg.qty ?? 1) : (cfg.l2_qty ?? 1);
        const dia = line === 1 ? (cfg.l1_diameter ?? cfg.diameter ?? '3/4') : (cfg.l2_diameter ?? '3/4');
        const len = zone === 'z2'
          ? (cfg.L1_m ?? defLen) + (cfg.L2_m ?? defLen)
          : (cfg.L3_m ?? defLen);
        const kg = qty * len * kgM(dia);
        if (kg > 0) { bastones_kg += kg; bastones_byDia[dia] = (bastones_byDia[dia] ?? 0) + kg; }
      }
    }
  }

  const estribos_byDia: ByDia = {};
  let estribos_kg = 0;
  let estribos_count = 0;
  const st = span.stirrups;
  if (st) {
    const dia = st.diameter ?? '8mm';
    const secQty = span.stirrups_section?.qty ?? 1;
    const hookLeg = 0.135;
    const perim = 2 * Math.max(0, b - 2 * recub) + 2 * Math.max(0, h - 2 * recub) + 2 * hookLeg;
    const caseT = st.case_type ?? 'simetrica';

    if (caseT === 'simetrica') {
      estribos_count = countABCR(st.left_spec, L / 2) * 2;
    } else if (caseT === 'asim_ambos') {
      const extL = st.ext_left_m ?? 2 * Math.max(0, h - recub);
      const extR = st.ext_right_m ?? 2 * Math.max(0, h - recub);
      estribos_count = countABCR(st.left_spec, extL) + countABCR(st.right_spec, extR);
      const centerLen = Math.max(0, L - extL - extR);
      if (centerLen > 0) estribos_count += countABCR(st.center_spec, centerLen);
    } else {
      const singleEnd = st.single_end ?? 'left';
      const ext = singleEnd === 'left'
        ? (st.ext_left_m ?? 2 * Math.max(0, h - recub))
        : (st.ext_right_m ?? 2 * Math.max(0, h - recub));
      const specialSpec = singleEnd === 'left' ? st.left_spec : st.right_spec;
      estribos_count = countABCR(specialSpec, ext);
      const centerLen = Math.max(0, L - ext);
      if (centerLen > 0) estribos_count += countABCR(st.center_spec, centerLen);
    }
    estribos_count *= secQty;
    estribos_kg = estribos_count * perim * kgM(dia);
    if (estribos_kg > 0) estribos_byDia[dia] = estribos_kg;
  }

  const topAs = (span.steel_top?.qty ?? 0) * areaCm2(span.steel_top?.diameter ?? '3/4');
  const botAs = (span.steel_bottom?.qty ?? 0) * areaCm2(span.steel_bottom?.diameter ?? '3/4');
  const rhoTop = (b_cm > 0 && d_cm > 0) ? topAs / (b_cm * d_cm) : 0;
  const rhoBot = (b_cm > 0 && d_cm > 0) ? botAs / (b_cm * d_cm) : 0;

  return {
    idx, L, h, b, concreto_m3, encofrado_m2,
    corrido_kg, bastones_kg, estribos_kg,
    corrido_byDia, bastones_byDia, estribos_byDia,
    estribos_count,
    topAs_cm2: topAs, botAs_cm2: botAs,
    rhoTop, rhoBot,
  };
}

export function calcMetrado(dev: DevelopmentIn, recub: number): MetradoResult {
  const spansData = (dev.spans ?? []).map((s, i) => calcSpan(s, i, recub));
  const geoSteel = calcSteelGeometryMetrado(dev, recub);
  const bastonesTopo = calcBastonesTopologyMetrado(dev, recub);

  for (let i = 0; i < spansData.length; i++) {
    const g = geoSteel.perSpan[i];
    if (!g) continue;
    spansData[i].corrido_kg = g.corrido_kg;
    spansData[i].bastones_kg = bastonesTopo.perSpan[i]?.bastones_kg ?? g.bastones_kg;
    spansData[i].corrido_byDia = g.corrido_byDia;
    spansData[i].bastones_byDia = bastonesTopo.perSpan[i]?.bastones_byDia ?? g.bastones_byDia;
  }

  const corridoByDia: ByDia = {};
  const bastonesByDia: ByDia = {};
  const estribosByDia: ByDia = {};
  let totalConcreto = 0, totalEncofrado = 0;
  let totalCorrido = 0, totalBastones = 0, totalEstribos = 0;

  for (const s of spansData) {
    totalConcreto += s.concreto_m3;
    totalEncofrado += s.encofrado_m2;
    totalCorrido += s.corrido_kg;
    totalBastones += s.bastones_kg;
    totalEstribos += s.estribos_kg;
    mergeDia(corridoByDia, s.corrido_byDia);
    mergeDia(bastonesByDia, s.bastones_byDia);
    mergeDia(estribosByDia, s.estribos_byDia);
  }

  totalCorrido = geoSteel.totalCorrido;
  totalBastones = bastonesTopo.totalBastones;
  for (const k of Object.keys(corridoByDia)) delete corridoByDia[k];
  for (const k of Object.keys(bastonesByDia)) delete bastonesByDia[k];
  mergeDia(corridoByDia, geoSteel.corridoByDia);
  mergeDia(bastonesByDia, bastonesTopo.bastonesByDia);

  const totalByDia: ByDia = {};
  mergeDia(totalByDia, corridoByDia);
  mergeDia(totalByDia, bastonesByDia);
  mergeDia(totalByDia, estribosByDia);

  const allDias = Object.keys(totalByDia).sort((a, b) => (kgM(a) || 0) - (kgM(b) || 0));

  return {
    spans: spansData,
    totalConcreto, totalEncofrado,
    totalCorrido, totalBastones, totalEstribos,
    totalAcero: totalCorrido + totalBastones + totalEstribos,
    corridoByDia, bastonesByDia, estribosByDia, totalByDia, allDias,
    corridoDetalle: geoSteel.corridoDetalle,
    bastonesDetalle: bastonesTopo.detalle,
  };
}
