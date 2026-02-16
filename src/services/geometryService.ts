/**
 * Servicios de cálculos geométricos y conversiones de unidades
 */

import type { DevelopmentIn, PreviewResponse, SpanIn } from '../types';
import { clampNumber } from '../utils';

/**
 * Convierte metros a unidades según el unit_scale del desarrollo
 */
export function mToUnits(dev: DevelopmentIn, m: number): number {
  return m * (dev.unit_scale ?? 2);
}

/**
 * Calcula los orígenes (x) de cada nodo en unidades
 */
export function computeNodeOrigins(dev: DevelopmentIn): number[] {
  const nodes = dev.nodes ?? [];
  const spans = dev.spans ?? [];
  if (!nodes.length) return [];

  // Igual a regla del backend (origins): (origin[i] + a2_i) + L_i == (origin[i+1] + a1_{i+1})
  const origins: number[] = [clampNumber(dev.x0 ?? 0, 0)];
  for (let i = 0; i < nodes.length - 1; i++) {
    const a2 = mToUnits(dev, clampNumber(nodes[i].a2, 0));
    const L = mToUnits(dev, clampNumber(spans[i]?.L ?? 0, 0));
    const a1Next = mToUnits(dev, clampNumber(nodes[i + 1].a1 ?? 0, 0));
    origins.push(origins[i] + a2 + L - a1Next);
  }
  return origins;
}

/**
 * Calcula la coordenada X del centro de un tramo
 */
export function computeSpanMidX(dev: DevelopmentIn, origins: number[], spanIndex: number): number {
  const nodes = dev.nodes ?? [];
  const spans = dev.spans ?? [];
  const o = origins[spanIndex] ?? 0;
  const a2 = mToUnits(dev, clampNumber(nodes[spanIndex]?.a2 ?? 0, 0));
  const L = mToUnits(dev, clampNumber(spans[spanIndex]?.L ?? 0, 0));
  return o + a2 + L / 2;
}

/**
 * Calcula el rango X (inicio y fin) de un tramo
 */
export function computeSpanRangeX(dev: DevelopmentIn, origins: number[], spanIndex: number) {
  const nodes = dev.nodes ?? [];
  const spans = dev.spans ?? [];
  const o = origins[spanIndex] ?? 0;
  const a2 = mToUnits(dev, clampNumber(nodes[spanIndex]?.a2 ?? 0, 0));
  const L = mToUnits(dev, clampNumber(spans[spanIndex]?.L ?? 0, 0));
  const a1Next = mToUnits(dev, clampNumber(nodes[spanIndex + 1]?.a1 ?? 0, 0));
  const x1 = o + a2;
  const x2 = o + a2 + L - a1Next;
  return { x1, x2 };
}

/**
 * Calcula la coordenada X del marcador de un nodo
 */
export function computeNodeMarkerX(dev: DevelopmentIn, origins: number[], nodeIndex: number): number {
  const nodes = dev.nodes ?? [];
  const o = origins[nodeIndex] ?? 0;
  const a2 = mToUnits(dev, clampNumber(nodes[nodeIndex]?.a2 ?? 0, 0));
  return o + a2;
}

/**
 * Calcula la coordenada X de la etiqueta de un nodo
 */
export function computeNodeLabelX(dev: DevelopmentIn, origins: number[], nodeIndex: number): number {
  const a1 = mToUnits(dev, clampNumber((dev.nodes ?? [])[nodeIndex]?.a1 ?? 0, 0));
  return (origins[nodeIndex] ?? 0) + a1;
}

/**
 * Encuentra el índice del tramo que contiene la coordenada X
 */
export function spanIndexAtX(dev: DevelopmentIn, x: number) {
  const origins = computeNodeOrigins(dev);
  const spans = dev.spans ?? [];
  for (let i = 0; i < spans.length; i++) {
    const { x1, x2 } = computeSpanRangeX(dev, origins, i);
    if (x >= x1 && x <= x2) return i;
  }
  return null;
}

/**
 * Encuentra el índice del nodo más cercano a la coordenada X
 */
export function nodeIndexAtX(dev: DevelopmentIn, x: number) {
  const origins = computeNodeOrigins(dev);
  const nodes = dev.nodes ?? [];
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < nodes.length; i++) {
    const nx = computeNodeMarkerX(dev, origins, i);
    const d = Math.abs(nx - x);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

/**
 * Obtiene el ancho (b) del tramo en la coordenada X
 */
export function spanBAtX(dev: DevelopmentIn, x: number) {
  const idx = spanIndexAtX(dev, x);
  if (idx == null) return 0.3;
  const b = clampNumber((dev.spans ?? [])[idx]?.b ?? 0.3, 0.3);
  return b;
}

/**
 * Retorna un array de números únicos y ordenados
 */
export function uniqueSortedNumbers(values: number[]) {
  const set = new Set(values.map((v) => Number(v)).filter(Number.isFinite));
  return Array.from(set).sort((a, b) => a - b);
}
