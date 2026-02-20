// Utilidades y helpers centralizados para el frontend de DrawingCAD

export function clampNumber(n: unknown, fallback: number) {
  if (typeof n === 'string') {
    const s = n.trim().replace(',', '.');
    if (!s) return fallback;
    const v = Number(s);
    return Number.isFinite(v) ? v : fallback;
  }
  const v = typeof n === 'number' ? n : Number(n);
  return Number.isFinite(v) ? v : fallback;
}

export function clampInt(n: unknown, fallback: number) {
  const v = typeof n === 'number' ? n : Number(String(n ?? '').trim());
  if (!Number.isFinite(v)) return fallback;
  return Math.trunc(v);
}

export function snap05m(v: number) {
  const step = 0.05;
  const snapped = Math.round(v / step) * step;
  return Math.round(snapped * 100) / 100;
}

export function fmt2(v: number) {
  return Number.isFinite(v) ? v.toFixed(2) : '';
}

export function safeParseJson<T>(text: string): { ok: true; value: T } | { ok: false; error: string } {
  try {
    return { ok: true, value: JSON.parse(text) as T };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? 'JSON inválido' };
  }
}

export function normalizeDiaKey(dia: string) {
  const s = String(dia || '').trim().replace(/"/g, '');
  if (s === '1 3/8' || s === '1-3/8' || s === "1-3/8'" || s === '1-3/8in') return '1-3/8';
  return s;
}

export function formatBeamNo(n: number): string {
  const i = Math.max(1, Math.min(9999, Math.trunc(n || 1)));
  return String(i).padStart(2, '0');
}

export function computeBeamName(t: string, beamNo: number): string {
  return `${levelPrefix(t)}-${formatBeamNo(beamNo)}`;
}

export function levelPrefix(t: string): 'VT' | 'VS' | 'VA' {
  if (t === 'sotano') return 'VS';
  if (t === 'azotea') return 'VA';
  return 'VT';
}
