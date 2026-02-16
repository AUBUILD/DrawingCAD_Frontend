/**
 * Utilidades para manejo de JSON
 */

export type ParseResult<T> = { ok: true; value: T } | { ok: false; error: string };

/**
 * Parsea JSON de forma segura con Result type
 * @returns {ok: true, value} si el parsing fue exitoso, {ok: false, error} si falló
 */
export function safeParseJson<T>(text: string): ParseResult<T> {
  try {
    return { ok: true, value: JSON.parse(text) as T };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? 'JSON inválido' };
  }
}

/**
 * Convierte un valor a JSON formateado (pretty-print con 2 espacios)
 */
export function toJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}
