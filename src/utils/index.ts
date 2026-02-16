/**
 * Barrel export de todas las utilidades
 */

// Number utils
export { clampNumber, clampInt, snap05m, fmt2 } from './numberUtils';

// String utils
export { formatBeamNo, levelPrefix, computeBeamName, formatOrdinalEs, parseDefaultPref, indexToLetters } from './stringUtils';
export type { LevelType, DefaultPreferenceId } from './stringUtils';

// Storage utils
export { safeGetLocalStorage, safeSetLocalStorage } from './storageUtils';

// Stirrups utils
export { formatStirrupsABCR, parseStirrupsABCR, pickDefaultABCRForH, normalizeDiaKey } from './stirrupsUtils';
export type { StirrupsABCR, StirrupToken } from './stirrupsUtils';

// JSON utils
export { safeParseJson, toJson } from './jsonUtils';
export type { ParseResult } from './jsonUtils';
