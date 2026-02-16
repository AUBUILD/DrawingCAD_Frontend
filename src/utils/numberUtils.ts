/**
 * Utilidades para manipulación de números
 */

/**
 * Convierte un valor desconocido a número, con fallback
 * Soporta strings con coma decimal (ej: "3,25")
 */
export function clampNumber(n: unknown, fallback: number): number {
  if (typeof n === 'string') {
    const s = n.trim().replace(',', '.');
    if (!s) return fallback;
    const v = Number(s);
    return Number.isFinite(v) ? v : fallback;
  }

  const v = typeof n === 'number' ? n : Number(n);
  return Number.isFinite(v) ? v : fallback;
}

/**
 * Convierte un valor desconocido a entero, con fallback
 */
export function clampInt(n: unknown, fallback: number): number {
  const v = typeof n === 'number' ? n : Number(String(n ?? '').trim());
  if (!Number.isFinite(v)) return fallback;
  return Math.trunc(v);
}

/**
 * Redondea un valor a múltiplos de 0.05m (5cm)
 * @param v - Valor en metros
 * @returns Valor redondeado a 2 decimales
 */
export function snap05m(v: number): number {
  const step = 0.05; // 5 cm
  const snapped = Math.round(v / step) * step;
  return Math.round(snapped * 100) / 100;
}

/**
 * Formatea un número a 2 decimales
 */
export function fmt2(v: number): string {
  return Number.isFinite(v) ? v.toFixed(2) : '';
}
