/**
 * Utilidades para manejo de estribos (stirrups)
 * Incluye parsing, formateo y defaults por altura de viga
 */

export type StirrupToken =
  | { kind: 'count'; count: number; spacing_m: number }
  | { kind: 'rest'; spacing_m: number };

export type StirrupsABCR = {
  A_m: number;
  b_n: number;
  B_m: number;
  c_n: number;
  C_m: number;
  R_m: number;
};

/**
 * Formatea StirrupsABCR a string en formato: A=0.05 b,B=8,0.100 c,C=5,0.150 R=0.250
 */
export function formatStirrupsABCR(p: StirrupsABCR): string {
  const A = Math.max(0, p.A_m || 0);
  const b = Math.max(0, Math.round(p.b_n || 0));
  const B = Math.max(0, p.B_m || 0);
  const c = Math.max(0, Math.round(p.c_n || 0));
  const C = Math.max(0, p.C_m || 0);
  const R = Math.max(0, p.R_m || 0);
  return `A=${A.toFixed(2)} b,B=${b},${B.toFixed(3)} c,C=${c},${C.toFixed(3)} R=${R.toFixed(3)}`;
}

/**
 * Parsea string en formato ABCR a objeto StirrupsABCR
 * Formato esperado: A=0.05 b,B=8,0.10 c,C=5,0.15 R=0.25
 */
export function parseStirrupsABCR(text: string): StirrupsABCR | null {
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

/**
 * Defaults de estribos por altura de viga (h en metros)
 * Para modo sísmico y gravedad
 */
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

/**
 * Elige el ABCR por defecto según la altura de viga y el modo (sísmico/gravedad)
 */
export function pickDefaultABCRForH(h_m: number, mode: 'sismico' | 'gravedad'): StirrupsABCR {
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

/**
 * Normaliza clave de diámetro: "3/8", "1/2", "5/8", "3/4", "1", "1-3/8"
 * Maneja tanto diámetros de estribos como de varillas
 */
export function normalizeDiaKey(dia: string): string {
  const s = String(dia ?? '').trim().replace(/"/g, '');

  // Manejar formatos especiales de 1-3/8
  if (s === '1 3/8' || s === '1-3/8' || s === '1-3/8\'' || s === '1-3/8in') return '1-3/8';

  // Diámetros estándar
  if (s === '3/8' || s === '1/2' || s === '5/8' || s === '3/4' || s === '1' || s === '1-3/8') return s;

  // Fallback a parsing numérico y mapeo
  const n = Number.parseFloat(s);
  if (!Number.isFinite(n)) return '3/8';
  if (n <= 0.375) return '3/8';
  if (n <= 0.5) return '1/2';
  if (n <= 0.625) return '5/8';
  if (n <= 0.75) return '3/4';
  return '1';
}
