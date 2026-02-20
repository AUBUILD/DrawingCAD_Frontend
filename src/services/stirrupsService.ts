/**
 * Servicios para parsing y cálculo de estribos
 */

import type { DevelopmentIn } from '../types';
import { parseStirrupsABCR, formatStirrupsABCR, clampNumber, type StirrupsABCR, type StirrupToken } from '../utils';
import { mToUnits } from './geometryService';

/**
 * Bloque de estribos con posiciones
 */
export type StirrupBlock = { key: string; positions: number[] };

/**
 * Convierte tokens legacy a formato ABCR
 */
export function abcrFromLegacyTokens(tokens: StirrupToken[]): StirrupsABCR | null {
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

/**
 * Parsea especificación de estribos en formato legacy o ABCR
 */
export function parseStirrupsSpec(text: string): StirrupToken[] {
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

/**
 * Calcula posiciones de estribos desde tokens
 */
export function stirrupsPositionsFromTokens(dev: DevelopmentIn, tokens: StirrupToken[], faceU: number, endU: number, dir: 1 | -1): number[] {
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

/**
 * Calcula bloques de estribos desde especificación de texto
 */
export function stirrupsBlocksFromSpec(dev: DevelopmentIn, specText: string, faceU: number, endU: number, dir: 1 | -1): StirrupBlock[] {
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

/**
 * Obtiene el spacing del resto (R) desde la especificación
 */
export function stirrupsRestSpacingFromSpec(specText: string): number | null {
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
