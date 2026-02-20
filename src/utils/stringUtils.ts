/**
 * Utilidades para formateo y parseo de strings
 */

export type LevelType = 'piso' | 'sotano' | 'azotea';
export type DefaultPreferenceId = 'basico' | 'personalizado';

/**
 * Formatea un número de viga con padding (01, 02, ..., 99)
 */
export function formatBeamNo(n: number): string {
  const i = Math.max(1, Math.min(9999, Math.trunc(n || 1)));
  return String(i).padStart(2, '0');
}

/**
 * Prefijo según tipo de nivel
 */
export function levelPrefix(t: LevelType): 'VT' | 'VS' | 'VA' {
  if (t === 'sotano') return 'VS';
  if (t === 'azotea') return 'VA';
  return 'VT';
}

/**
 * Genera nombre de viga: VT-01, VS-02, VA-03, etc.
 */
export function computeBeamName(t: LevelType, beamNo: number): string {
  return `${levelPrefix(t)}-${formatBeamNo(beamNo)}`;
}

/**
 * Formatea ordinal en español: 1er, 2do, 3er, 4to, etc.
 */
export function formatOrdinalEs(n: number): string {
  const i = Math.max(1, Math.min(30, Math.trunc(n || 1)));
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

/**
 * Parsea preferencia por defecto
 */
export function parseDefaultPref(raw: unknown): DefaultPreferenceId {
  const v = String(raw ?? '').trim().toLowerCase();
  return v === 'personalizado' ? 'personalizado' : 'basico';
}

/**
 * Convierte índice a letras: 0→A, 1→B, 2→C, etc.
 */
export function indexToLetters(index: number): string {
  let result = '';
  let i = index;
  while (i >= 0) {
    result = String.fromCharCode(65 + (i % 26)) + result;
    i = Math.floor(i / 26) - 1;
  }
  return result || 'A';
}
