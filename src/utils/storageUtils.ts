/**
 * Utilidades para localStorage con manejo seguro de errores
 */

/**
 * Lee un valor de localStorage de forma segura
 * @returns El valor almacenado o null si no existe o hay error
 */
export function safeGetLocalStorage(key: string): string | null {
  try {
    if (typeof window === 'undefined') return null;
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

/**
 * Guarda un valor en localStorage de forma segura
 * Ignora errores (modo privado, storage deshabilitado, etc.)
 */
export function safeSetLocalStorage(key: string, value: string): void {
  try {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(key, value);
  } catch {
    // ignore storage errors
  }
}
