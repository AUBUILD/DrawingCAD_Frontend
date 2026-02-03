import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { exportDxf, fetchPreview, fetchState, saveState } from './api';
import type { DevelopmentIn, NodeIn, PreviewRequest, PreviewResponse, SpanIn, SteelKind, SteelMeta } from './types';

type Tab = 'config' | 'concreto' | 'acero' | 'json';
type PreviewView = '2d' | '3d';

type AppConfig = {
  d: number;
  unit_scale: number;
  x0: number;
  y0: number;

  // Acero (m)
  steel_cover_top: number;
  steel_cover_bottom: number;
};

type Bounds = { min_x: number; max_x: number; min_y: number; max_y: number };

type Selection =
  | { kind: 'node'; index: number }
  | { kind: 'span'; index: number }
  | { kind: 'none' };

type ThreeSceneState = {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  root: THREE.Group;
  spans: THREE.Object3D[];
  nodes: THREE.Object3D[];
};

type ParseResult<T> = { ok: true; value: T } | { ok: false; error: string };

const DEFAULT_APP_CFG: AppConfig = {
  d: 0.25,
  unit_scale: 2,
  x0: 0,
  y0: 0,
  steel_cover_top: 0.04,
  steel_cover_bottom: 0.04,
};

const DEFAULT_STEEL_META: SteelMeta = { qty: 3, diameter: '3/4' };

function cloneSteelMeta(m?: SteelMeta | null): SteelMeta {
  const qty = Math.max(1, clampNumber(m?.qty ?? DEFAULT_STEEL_META.qty, DEFAULT_STEEL_META.qty));
  const diameter = String(m?.diameter ?? DEFAULT_STEEL_META.diameter);
  return { qty, diameter };
}

const INITIAL_SPAN: SpanIn = {
  L: 3.0,
  h: 0.5,
  b: 0.3,
  steel_top: cloneSteelMeta(DEFAULT_STEEL_META),
  steel_bottom: cloneSteelMeta(DEFAULT_STEEL_META),
};

const INITIAL_NODE: NodeIn = {
  a1: 0.0,
  a2: 0.5,
  b1: 0.0,
  b2: 0.5,
  project_a: true,
  project_b: true,
  steel_top_continuous: true,
  steel_top_hook: false,
  steel_top_development: false,
  steel_bottom_continuous: true,
  steel_bottom_hook: false,
  steel_bottom_development: false,
  steel_top_1_kind: 'continuous',
  steel_top_2_kind: 'continuous',
  steel_bottom_1_kind: 'continuous',
  steel_bottom_2_kind: 'continuous',
};

function clampNumber(n: unknown, fallback: number) {
  const v = typeof n === 'number' ? n : Number(n);
  return Number.isFinite(v) ? v : fallback;
}

function safeParseJson<T>(text: string): ParseResult<T> {
  try {
    return { ok: true, value: JSON.parse(text) as T };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? 'JSON inválido' };
  }
}

function toJson(value: unknown) {
  return JSON.stringify(value, null, 2);
}

function cloneSpan(span: SpanIn): SpanIn {
  return {
    L: span.L,
    h: span.h,
    b: span.b ?? 0,
    steel_top: cloneSteelMeta(span.steel_top),
    steel_bottom: cloneSteelMeta(span.steel_bottom),
  };
}

function cloneNode(node: NodeIn): NodeIn {
  const legacyTop = steelKindLegacy(node, 'top');
  const legacyBottom = steelKindLegacy(node, 'bottom');
  return {
    a1: 0.0,
    a2: node.a2,
    b1: node.b1 ?? 0,
    b2: node.b2,
    project_a: node.project_a ?? true,
    project_b: node.project_b ?? true,
    steel_top_continuous: node.steel_top_continuous ?? true,
    steel_top_hook: node.steel_top_hook ?? false,
    steel_top_development: node.steel_top_development ?? false,
    steel_bottom_continuous: node.steel_bottom_continuous ?? true,
    steel_bottom_hook: node.steel_bottom_hook ?? false,
    steel_bottom_development: node.steel_bottom_development ?? false,
    steel_top_1_kind: node.steel_top_1_kind ?? legacyTop,
    steel_top_2_kind: node.steel_top_2_kind ?? legacyTop,
    steel_bottom_1_kind: node.steel_bottom_1_kind ?? legacyBottom,
    steel_bottom_2_kind: node.steel_bottom_2_kind ?? legacyBottom,
  };
}

function defaultDevelopment(appCfg: AppConfig, name = 'DESARROLLO 01'): DevelopmentIn {
  return {
    name,
    d: appCfg.d,
    unit_scale: appCfg.unit_scale,
    x0: appCfg.x0,
    y0: appCfg.y0,
    steel_cover_top: appCfg.steel_cover_top,
    steel_cover_bottom: appCfg.steel_cover_bottom,
    spans: [cloneSpan(INITIAL_SPAN)],
    nodes: [cloneNode(INITIAL_NODE), cloneNode(INITIAL_NODE)],
  };
}

function normalizeDev(input: DevelopmentIn, appCfg: AppConfig): DevelopmentIn {
  const spans = (input.spans ?? []).map((s) => ({
    L: Math.max(0, clampNumber(s.L, INITIAL_SPAN.L)),
    h: Math.max(0, clampNumber(s.h, INITIAL_SPAN.h)),
    b: Math.max(0, clampNumber((s as any).b ?? INITIAL_SPAN.b, INITIAL_SPAN.b ?? 0)),
    steel_top: cloneSteelMeta((s as any).steel_top ?? (s as any).steelTop),
    steel_bottom: cloneSteelMeta((s as any).steel_bottom ?? (s as any).steelBottom),
  }));

  const nodes: NodeIn[] = (input.nodes ?? []).map((n) => {
    const legacyTop = steelKindLegacy(n, 'top');
    const legacyBottom = steelKindLegacy(n, 'bottom');
    return {
      a1: 0.0,
      a2: Math.max(0, clampNumber(n.a2, INITIAL_NODE.a2)),
      b1: Math.max(0, clampNumber(n.b1 ?? INITIAL_NODE.b1, INITIAL_NODE.b1)),
      b2: Math.max(0, clampNumber(n.b2, INITIAL_NODE.b2)),
      project_a: n.project_a ?? true,
      project_b: n.project_b ?? true,
      steel_top_continuous: n.steel_top_continuous ?? true,
      steel_top_hook: n.steel_top_hook ?? false,
      steel_top_development: n.steel_top_development ?? false,
      steel_bottom_continuous: n.steel_bottom_continuous ?? true,
      steel_bottom_hook: n.steel_bottom_hook ?? false,
      steel_bottom_development: n.steel_bottom_development ?? false,
      steel_top_1_kind: (n as any).steel_top_1_kind ?? (n as any).steelTop1Kind ?? legacyTop,
      steel_top_2_kind: (n as any).steel_top_2_kind ?? (n as any).steelTop2Kind ?? legacyTop,
      steel_bottom_1_kind: (n as any).steel_bottom_1_kind ?? (n as any).steelBottom1Kind ?? legacyBottom,
      steel_bottom_2_kind: (n as any).steel_bottom_2_kind ?? (n as any).steelBottom2Kind ?? legacyBottom,
    };
  });

  const safeSpans = spans.length ? spans : [cloneSpan(INITIAL_SPAN)];
  const desiredNodes = safeSpans.length + 1;
  const safeNodes = nodes.slice(0, desiredNodes);

  const lastNode = safeNodes.length ? safeNodes[safeNodes.length - 1] : cloneNode(INITIAL_NODE);
  while (safeNodes.length < desiredNodes) safeNodes.push(cloneNode(lastNode));

  return {
    ...input,
    name: input.name ?? 'DESARROLLO 01',
    d: appCfg.d,
    unit_scale: appCfg.unit_scale,
    x0: appCfg.x0,
    y0: appCfg.y0,
    steel_cover_top: appCfg.steel_cover_top,
    steel_cover_bottom: appCfg.steel_cover_bottom,
    spans: safeSpans,
    nodes: safeNodes,
  };
}

function toBackendPayload(dev: DevelopmentIn): PreviewRequest {
  return {
    developments: [dev],
  } as PreviewRequest;
}

function fitTransform(bounds: Bounds, w: number, h: number) {
  const pad = 20;
  const dx = Math.max(bounds.max_x - bounds.min_x, 1e-6);
  const dy = Math.max(bounds.max_y - bounds.min_y, 1e-6);
  const scale = Math.min((w - pad * 2) / dx, (h - pad * 2) / dy);
  return { pad, scale };
}

function canvasMapper(bounds: Bounds, w: number, h: number) {
  const { pad, scale } = fitTransform(bounds, w, h);
  const bx0 = bounds.min_x;
  const by1 = bounds.max_y;
  return {
    toCanvas(x: number, y: number) {
      const cx = pad + (x - bx0) * scale;
      const cy = pad + (by1 - y) * scale;
      return [cx, cy] as const;
    },
  };
}

function canvasUnmapper(bounds: Bounds, w: number, h: number) {
  const { pad, scale } = fitTransform(bounds, w, h);
  const bx0 = bounds.min_x;
  const by1 = bounds.max_y;
  return {
    toWorld(cx: number, cy: number) {
      const x = bx0 + (cx - pad) / scale;
      const y = by1 - (cy - pad) / scale;
      return [x, y] as const;
    },
  };
}

function clampBounds(inner: Bounds, outer: Bounds): Bounds {
  const dx = outer.max_x - outer.min_x;
  const dy = outer.max_y - outer.min_y;
  const w = Math.min(inner.max_x - inner.min_x, dx);
  const h = Math.min(inner.max_y - inner.min_y, dy);

  let min_x = inner.min_x;
  let max_x = inner.max_x;
  let min_y = inner.min_y;
  let max_y = inner.max_y;

  if (w < dx) {
    min_x = Math.max(outer.min_x, Math.min(min_x, outer.max_x - w));
    max_x = min_x + w;
  } else {
    min_x = outer.min_x;
    max_x = outer.max_x;
  }

  if (h < dy) {
    min_y = Math.max(outer.min_y, Math.min(min_y, outer.max_y - h));
    max_y = min_y + h;
  } else {
    min_y = outer.min_y;
    max_y = outer.max_y;
  }

  return { min_x, max_x, min_y, max_y };
}

function drawPreview(canvas: HTMLCanvasElement, data: PreviewResponse | null, renderBounds?: Bounds | null) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  // DPR-aware canvas for crisper lines/text
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const cssW = Math.max(1, Math.round(rect.width));
  const cssH = Math.max(1, Math.round(rect.height));
  const desiredW = Math.round(cssW * dpr);
  const desiredH = Math.round(cssH * dpr);
  if (canvas.width !== desiredW || canvas.height !== desiredH) {
    canvas.width = desiredW;
    canvas.height = desiredH;
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  // Clear in CSS pixel space (after setTransform)
  ctx.clearRect(0, 0, cssW, cssH);

  if (!data) {
    ctx.fillStyle = 'rgba(229,231,235,0.6)';
    ctx.font = '12px ui-monospace, Menlo, Consolas, monospace';
    ctx.fillText('Sin datos de vista previa', 14, 22);
    return;
  }

  const bounds = renderBounds ?? data.bounds;
  const { toCanvas } = canvasMapper(bounds, cssW, cssH);

  const snap = (v: number) => Math.round(v) + 0.5;

  // Desarrollo (contorno)
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(20,184,166,0.95)';

  for (const pl of data.developments ?? []) {
    const pts = pl.points ?? [];
    if (pts.length < 2) continue;
    ctx.beginPath();
    for (let i = 0; i < pts.length; i++) {
      const [x, y] = pts[i];
      const [cx, cy] = toCanvas(x, y);
      const sx = snap(cx);
      const sy = snap(cy);
      if (i === 0) ctx.moveTo(sx, sy);
      else ctx.lineTo(sx, sy);
    }
    ctx.stroke();
  }
}

function mToUnits(dev: DevelopmentIn, m: number): number {
  return m * (dev.unit_scale ?? 2);
}

function computeNodeOrigins(dev: DevelopmentIn): number[] {
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

function computeSpanMidX(dev: DevelopmentIn, origins: number[], spanIndex: number): number {
  const nodes = dev.nodes ?? [];
  const spans = dev.spans ?? [];
  const o = origins[spanIndex] ?? 0;
  const a2 = mToUnits(dev, clampNumber(nodes[spanIndex]?.a2 ?? 0, 0));
  const L = mToUnits(dev, clampNumber(spans[spanIndex]?.L ?? 0, 0));
  return o + a2 + L / 2;
}

function computeSpanRangeX(dev: DevelopmentIn, origins: number[], spanIndex: number) {
  const nodes = dev.nodes ?? [];
  const spans = dev.spans ?? [];
  const o = origins[spanIndex] ?? 0;
  const a2 = mToUnits(dev, clampNumber(nodes[spanIndex]?.a2 ?? 0, 0));
  const L = mToUnits(dev, clampNumber(spans[spanIndex]?.L ?? 0, 0));
  const x0 = o + a2;
  const x1 = x0 + L;
  return { x0: Math.min(x0, x1), x1: Math.max(x0, x1) };
}

function computeNodeMarkerX(dev: DevelopmentIn, origins: number[], nodeIndex: number): number {
  const nodes = dev.nodes ?? [];
  return (origins[nodeIndex] ?? 0) + mToUnits(dev, clampNumber(nodes[nodeIndex]?.b1 ?? 0, 0));
}

function computeNodeLabelX(dev: DevelopmentIn, origins: number[], nodeIndex: number): number {
  const nodes = dev.nodes ?? [];
  const a1 = mToUnits(dev, clampNumber(nodes[nodeIndex]?.a1 ?? 0, 0));
  const a2 = mToUnits(dev, clampNumber(nodes[nodeIndex]?.a2 ?? 0, 0));
  return (origins[nodeIndex] ?? 0) + (a1 + a2) / 2;
}

function steelKindLegacy(node: NodeIn, side: 'top' | 'bottom'): SteelKind {
  const c = side === 'top' ? (node.steel_top_continuous ?? true) : (node.steel_bottom_continuous ?? true);
  const h = side === 'top' ? (node.steel_top_hook ?? false) : (node.steel_bottom_hook ?? false);
  const d = side === 'top' ? (node.steel_top_development ?? false) : (node.steel_bottom_development ?? false);
  if (h) return 'hook';
  if (d) return 'development'; // se muestra como "Anclaje"
  return c ? 'continuous' : 'continuous';
}

function nodeSteelKind(node: NodeIn, side: 'top' | 'bottom', end: 1 | 2): SteelKind {
  const key =
    side === 'top'
      ? end === 1
        ? 'steel_top_1_kind'
        : 'steel_top_2_kind'
      : end === 1
        ? 'steel_bottom_1_kind'
        : 'steel_bottom_2_kind';
  const v = (node as any)[key] as SteelKind | undefined;
  if (v === 'continuous' || v === 'hook' || v === 'development') return v;
  return steelKindLegacy(node, side);
}

type NodeSlot = { nodeIdx: number; end: 1 | 2; label: string };

function buildNodeSlots(nodes: NodeIn[]): NodeSlot[] {
  const slots: NodeSlot[] = [];
  const n = nodes.length;
  for (let i = 0; i < n; i++) {
    if (i === 0) {
      slots.push({ nodeIdx: i, end: 2, label: `Nodo ${i + 1}.2` });
      continue;
    }
    if (i === n - 1) {
      slots.push({ nodeIdx: i, end: 1, label: `Nodo ${i + 1}.1` });
      continue;
    }
    slots.push({ nodeIdx: i, end: 1, label: `Nodo ${i + 1}.1` });
    slots.push({ nodeIdx: i, end: 2, label: `Nodo ${i + 1}.2` });
  }
  return slots;
}

const REBAR_TABLE_CM: Record<
  string,
  { ldg: number; ld_inf: number; ld_sup: number }
> = {
  '1/2': { ldg: 28, ld_inf: 45, ld_sup: 60 },
  '5/8': { ldg: 35, ld_inf: 60, ld_sup: 75 },
  '3/4': { ldg: 42, ld_inf: 70, ld_sup: 90 },
  '1': { ldg: 56, ld_inf: 115, ld_sup: 145 },
  '1-3/8': { ldg: 77, ld_inf: 155, ld_sup: 200 },
};

function normalizeDiaKey(dia: string) {
  const s = String(dia || '').trim().replace(/"/g, '');
  if (s === '1 3/8' || s === '1-3/8' || s === '1-3/8\'' || s === '1-3/8in') return '1-3/8';
  return s;
}

function lengthFromTableMeters(dia: string, kind: 'hook' | 'anchorage', side: 'top' | 'bottom') {
  const key = normalizeDiaKey(dia);
  const row = REBAR_TABLE_CM[key] ?? REBAR_TABLE_CM['3/4'];
  const cm = kind === 'hook' ? row.ldg : side === 'top' ? row.ld_sup : row.ld_inf;
  return cm / 100;
}

function drawSteelOverlay(
  canvas: HTMLCanvasElement,
  preview: PreviewResponse,
  dev: DevelopmentIn,
  renderBounds: Bounds,
  coverTopM: number,
  coverBottomM: number
) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const rect = canvas.getBoundingClientRect();
  const cssW = Math.max(1, Math.round(rect.width));
  const cssH = Math.max(1, Math.round(rect.height));
  const dpr = Math.min(window.devicePixelRatio || 1, 2);

  ctx.save();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const { toCanvas } = canvasMapper(renderBounds, cssW, cssH);
  const origins = computeNodeOrigins(dev);
  const y0 = mToUnits(dev, clampNumber((dev as any).y0 ?? 0, 0));
  const coverTopU = mToUnits(dev, clampNumber(coverTopM, 0.04));
  const coverBotU = mToUnits(dev, clampNumber(coverBottomM, 0.04));
  const hookLegU = mToUnits(dev, 0.15);

  ctx.strokeStyle = 'rgba(34, 211, 238, 0.95)';
  ctx.lineWidth = 2;

  const extraStroke = 'rgba(217, 70, 239, 0.95)';

  const spans = dev.spans ?? [];
  const nodes = dev.nodes ?? [];

  function drawHookOrAnchorage(
    x: number,
    y: number,
    dir: 1 | -1,
    dia: string,
    kind: 'hook' | 'anchorage',
    side: 'top' | 'bottom'
  ) {
    const c = ctx;
    if (!c) return;
    const prevStroke = c.strokeStyle;
    c.strokeStyle = extraStroke;
    const Lm = lengthFromTableMeters(dia, kind, side);
    const Lu = mToUnits(dev, Lm);
    const x2 = x + dir * Lu;

    const [cx0, cy0] = toCanvas(x, y);
    const [cx1] = toCanvas(x2, y);

    c.beginPath();
    c.moveTo(Math.round(cx0) + 0.5, Math.round(cy0) + 0.5);
    c.lineTo(Math.round(cx1) + 0.5, Math.round(cy0) + 0.5);

    if (kind === 'hook') {
      const y3 = side === 'top' ? y - hookLegU : y + hookLegU;
      const [, cy3] = toCanvas(x2, y3);
      c.lineTo(Math.round(cx1) + 0.5, Math.round(cy3) + 0.5);
    }
    c.stroke();
    c.strokeStyle = prevStroke;
  }

  // Líneas por tramo (superior + inferior) + nodos
  const dotR = 3;
  ctx.fillStyle = 'rgba(34, 211, 238, 0.95)';

  for (let i = 0; i < spans.length; i++) {
    const L = mToUnits(dev, clampNumber(spans[i]?.L ?? 0, 0));
    const h = mToUnits(dev, clampNumber(spans[i]?.h ?? 0, 0));

    const a2_i = mToUnits(dev, clampNumber(nodes[i]?.a2 ?? 0, 0));
    const a1_ip1 = mToUnits(dev, clampNumber(nodes[i + 1]?.a1 ?? 0, 0));
    const xBot0 = (origins[i] ?? 0) + a2_i;
    const xBot1 = xBot0 + L;
    const yBot = y0 + coverBotU;

    const b2_i = mToUnits(dev, clampNumber(nodes[i]?.b2 ?? 0, 0));
    const b1_ip1 = mToUnits(dev, clampNumber(nodes[i + 1]?.b1 ?? 0, 0));
    const xTop0 = (origins[i] ?? 0) + b2_i;
    const xTop1 = (origins[i + 1] ?? 0) + b1_ip1;
    const yTop = y0 + h - coverTopU;

    // superior
    {
      const [cx0, cy] = toCanvas(xTop0, yTop);
      const [cx1] = toCanvas(xTop1, yTop);
      ctx.beginPath();
      ctx.moveTo(Math.round(cx0) + 0.5, Math.round(cy) + 0.5);
      ctx.lineTo(Math.round(cx1) + 0.5, Math.round(cy) + 0.5);
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(Math.round(cx0) + 0.5, Math.round(cy) + 0.5, dotR, 0, Math.PI * 2);
      ctx.arc(Math.round(cx1) + 0.5, Math.round(cy) + 0.5, dotR, 0, Math.PI * 2);
      ctx.fill();
    }

    // inferior
    {
      const [cx0, cy] = toCanvas(xBot0, yBot);
      const [cx1] = toCanvas(xBot1, yBot);
      ctx.beginPath();
      ctx.moveTo(Math.round(cx0) + 0.5, Math.round(cy) + 0.5);
      ctx.lineTo(Math.round(cx1) + 0.5, Math.round(cy) + 0.5);
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(Math.round(cx0) + 0.5, Math.round(cy) + 0.5, dotR, 0, Math.PI * 2);
      ctx.arc(Math.round(cx1) + 0.5, Math.round(cy) + 0.5, dotR, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Conexiones en nodos internos (entre tramo i-1 y tramo i)
  for (let i = 1; i < nodes.length - 1; i++) {
    const node = nodes[i];

    const leftSpan = spans[i - 1];
    const rightSpan = spans[i];
    if (!leftSpan || !rightSpan) continue;

    // Top endpoints en el nodo: fin del tramo izq (B1) y arranque del tramo der (B2)
    const xTopL = (origins[i] ?? 0) + mToUnits(dev, clampNumber(node.b1 ?? 0, 0));
    const xTopR = (origins[i] ?? 0) + mToUnits(dev, clampNumber(node.b2 ?? 0, 0));
    const yTopL = y0 + mToUnits(dev, clampNumber(leftSpan.h ?? 0, 0)) - coverTopU;
    const yTopR = y0 + mToUnits(dev, clampNumber(rightSpan.h ?? 0, 0)) - coverTopU;

    // Bottom endpoints en el nodo: fin del tramo izq (A1) y arranque del tramo der (A2)
    const xBotL = (origins[i] ?? 0) + mToUnits(dev, clampNumber(node.a1 ?? 0, 0));
    const xBotR = (origins[i] ?? 0) + mToUnits(dev, clampNumber(node.a2 ?? 0, 0));
    const yBot = y0 + coverBotU;

    const topK1 = nodeSteelKind(node, 'top', 1);
    const topK2 = nodeSteelKind(node, 'top', 2);
    const botK1 = nodeSteelKind(node, 'bottom', 1);
    const botK2 = nodeSteelKind(node, 'bottom', 2);

    // CONTINUO: conectar nodos cercanos (solo si ambos extremos son continuos)
    if (topK1 === 'continuous' && topK2 === 'continuous') {
      const yMid = Math.max(yTopL, yTopR);
      const [cxl, cyl] = toCanvas(xTopL, yTopL);
      const [cxm1, cym] = toCanvas(xTopL, yMid);
      const [cxm2] = toCanvas(xTopR, yMid);
      const [cxr, cyr] = toCanvas(xTopR, yTopR);
      ctx.beginPath();
      ctx.moveTo(Math.round(cxl) + 0.5, Math.round(cyl) + 0.5);
      ctx.lineTo(Math.round(cxm1) + 0.5, Math.round(cym) + 0.5);
      ctx.lineTo(Math.round(cxm2) + 0.5, Math.round(cym) + 0.5);
      ctx.lineTo(Math.round(cxr) + 0.5, Math.round(cyr) + 0.5);
      ctx.stroke();
    }

    // Top: N.i.1 (cara izquierda) -> hacia +X, usa diámetro del tramo izquierdo
    if (topK1 === 'hook') drawHookOrAnchorage(xTopL, yTopL, +1, leftSpan.steel_top?.diameter ?? '3/4', 'hook', 'top');
    if (topK1 === 'development')
      drawHookOrAnchorage(xTopL, yTopL, +1, leftSpan.steel_top?.diameter ?? '3/4', 'anchorage', 'top');

    // Top: N.i.2 (cara derecha) -> hacia -X, usa diámetro del tramo derecho
    if (topK2 === 'hook') drawHookOrAnchorage(xTopR, yTopR, -1, rightSpan.steel_top?.diameter ?? '3/4', 'hook', 'top');
    if (topK2 === 'development')
      drawHookOrAnchorage(xTopR, yTopR, -1, rightSpan.steel_top?.diameter ?? '3/4', 'anchorage', 'top');

    if (botK1 === 'continuous' && botK2 === 'continuous') {
      const [cxl, cy] = toCanvas(xBotL, yBot);
      const [cxr] = toCanvas(xBotR, yBot);
      ctx.beginPath();
      ctx.moveTo(Math.round(cxl) + 0.5, Math.round(cy) + 0.5);
      ctx.lineTo(Math.round(cxr) + 0.5, Math.round(cy) + 0.5);
      ctx.stroke();
    }

    // Bottom: N.i.1 (cara izquierda) -> hacia +X, usa diámetro del tramo izquierdo
    if (botK1 === 'hook') drawHookOrAnchorage(xBotL, yBot, +1, leftSpan.steel_bottom?.diameter ?? '3/4', 'hook', 'bottom');
    if (botK1 === 'development')
      drawHookOrAnchorage(xBotL, yBot, +1, leftSpan.steel_bottom?.diameter ?? '3/4', 'anchorage', 'bottom');

    // Bottom: N.i.2 (cara derecha) -> hacia -X, usa diámetro del tramo derecho
    if (botK2 === 'hook') drawHookOrAnchorage(xBotR, yBot, -1, rightSpan.steel_bottom?.diameter ?? '3/4', 'hook', 'bottom');
    if (botK2 === 'development')
      drawHookOrAnchorage(xBotR, yBot, -1, rightSpan.steel_bottom?.diameter ?? '3/4', 'anchorage', 'bottom');
  }

  // Extremos: nodo inicial (solo *.2) y nodo final (solo *.1)
  if (nodes.length >= 2 && spans.length >= 1) {
    // Nodo 1.2 (cara derecha del nodo 1) -> hacia -X, usa tramo 0
    {
      const n0 = nodes[0];
      const s0 = spans[0];
      const h0 = mToUnits(dev, clampNumber(s0.h ?? 0, 0));
      const xTop = (origins[0] ?? 0) + mToUnits(dev, clampNumber(n0.b2 ?? 0, 0));
      const yTop = y0 + h0 - coverTopU;
      const xBot = (origins[0] ?? 0) + mToUnits(dev, clampNumber(n0.a2 ?? 0, 0));
      const yBot2 = y0 + coverBotU;
      const kTop = nodeSteelKind(n0, 'top', 2);
      const kBot = nodeSteelKind(n0, 'bottom', 2);
      if (kTop === 'hook') drawHookOrAnchorage(xTop, yTop, -1, s0.steel_top?.diameter ?? '3/4', 'hook', 'top');
      if (kTop === 'development') drawHookOrAnchorage(xTop, yTop, -1, s0.steel_top?.diameter ?? '3/4', 'anchorage', 'top');
      if (kBot === 'hook') drawHookOrAnchorage(xBot, yBot2, -1, s0.steel_bottom?.diameter ?? '3/4', 'hook', 'bottom');
      if (kBot === 'development')
        drawHookOrAnchorage(xBot, yBot2, -1, s0.steel_bottom?.diameter ?? '3/4', 'anchorage', 'bottom');
    }

    // Nodo n.1 (cara izquierda del último nodo) -> hacia +X, usa último tramo
    {
      const lastNodeIdx = nodes.length - 1;
      const lastSpanIdx = spans.length - 1;
      const nn = nodes[lastNodeIdx];
      const ss = spans[lastSpanIdx];
      const hh = mToUnits(dev, clampNumber(ss.h ?? 0, 0));
      const xTop = (origins[lastNodeIdx] ?? 0) + mToUnits(dev, clampNumber(nn.b1 ?? 0, 0));
      const yTop = y0 + hh - coverTopU;
      const xBot = (origins[lastNodeIdx] ?? 0) + mToUnits(dev, clampNumber(nn.a1 ?? 0, 0));
      const yBot2 = y0 + coverBotU;
      const kTop = nodeSteelKind(nn, 'top', 1);
      const kBot = nodeSteelKind(nn, 'bottom', 1);
      if (kTop === 'hook') drawHookOrAnchorage(xTop, yTop, +1, ss.steel_top?.diameter ?? '3/4', 'hook', 'top');
      if (kTop === 'development') drawHookOrAnchorage(xTop, yTop, +1, ss.steel_top?.diameter ?? '3/4', 'anchorage', 'top');
      if (kBot === 'hook') drawHookOrAnchorage(xBot, yBot2, +1, ss.steel_bottom?.diameter ?? '3/4', 'hook', 'bottom');
      if (kBot === 'development')
        drawHookOrAnchorage(xBot, yBot2, +1, ss.steel_bottom?.diameter ?? '3/4', 'anchorage', 'bottom');
    }
  }

  ctx.restore();
}

type PolyPt = [number, number];

function uniqueSortedNumbers(values: number[]) {
  const s = new Set<number>();
  for (const v of values) {
    if (Number.isFinite(v)) s.add(v);
  }
  return Array.from(s).sort((a, b) => a - b);
}

function polySliceIntervals(poly: PolyPt[], x: number): Array<[number, number]> {
  const ys: number[] = [];
  const n = poly.length;
  if (n < 3) return [];

  for (let i = 0; i < n; i++) {
    const [x1, y1] = poly[i];
    const [x2, y2] = poly[(i + 1) % n];
    if (y1 !== y2) continue; // solo horizontales

    const xmin = Math.min(x1, x2);
    const xmax = Math.max(x1, x2);
    // x siempre se evalúa en el centro de un intervalo (nunca en vértices), así que estricto sirve y evita duplicados.
    if (x > xmin && x < xmax) ys.push(y1);
  }

  ys.sort((a, b) => a - b);
  const intervals: Array<[number, number]> = [];
  for (let i = 0; i + 1 < ys.length; i += 2) {
    const y0 = ys[i];
    const y1 = ys[i + 1];
    if (Number.isFinite(y0) && Number.isFinite(y1) && y1 > y0) intervals.push([y0, y1]);
  }
  return intervals;
}

function spanIndexAtX(dev: DevelopmentIn, x: number) {
  const origins = computeNodeOrigins(dev);
  const spans = dev.spans ?? [];
  const nodes = dev.nodes ?? [];
  for (let i = 0; i < spans.length; i++) {
    const a2 = mToUnits(dev, clampNumber(nodes[i]?.a2 ?? 0, 0));
    const L = mToUnits(dev, clampNumber(spans[i]?.L ?? 0, 0));
    const x0 = (origins[i] ?? 0) + a2;
    const x1 = x0 + L;
    const lo = Math.min(x0, x1);
    const hi = Math.max(x0, x1);
    if (x >= lo && x <= hi) return i;
  }

  // si cae fuera de tramos, el más cercano por centro
  let best = 0;
  let bestDist = Number.POSITIVE_INFINITY;
  for (let i = 0; i < spans.length; i++) {
    const mx = computeSpanMidX(dev, origins, i);
    const d = Math.abs(x - mx);
    if (d < bestDist) {
      bestDist = d;
      best = i;
    }
  }
  return best;
}

function nodeIndexAtX(dev: DevelopmentIn, x: number) {
  const origins = computeNodeOrigins(dev);
  const nodes = dev.nodes ?? [];
  for (let i = 0; i < nodes.length; i++) {
    const relA1 = mToUnits(dev, clampNumber(nodes[i]?.a1 ?? 0, 0));
    const relA2 = mToUnits(dev, clampNumber(nodes[i]?.a2 ?? 0, 0));
    const relB1 = mToUnits(dev, clampNumber(nodes[i]?.b1 ?? 0, 0));
    const relB2 = mToUnits(dev, clampNumber(nodes[i]?.b2 ?? 0, 0));
    const relMin = Math.min(relA1, relA2, relB1, relB2);
    const relMax = Math.max(relA1, relA2, relB1, relB2);
    const lo = (origins[i] ?? 0) + relMin;
    const hi = (origins[i] ?? 0) + relMax;
    if (x >= lo && x <= hi) return i;
  }
  return -1;
}

function spanBAtX(dev: DevelopmentIn, x: number) {
  const spans = dev.spans ?? [];
  if (!spans.length) return 1;
  const i = spanIndexAtX(dev, x);
  const b = clampNumber((spans[i] as any)?.b ?? 0.3, 0.3);
  return Math.max(1, mToUnits(dev, b));
}

function setEmissiveOnObject(obj: THREE.Object3D, color: number, intensity: number) {
  obj.traverse((child: THREE.Object3D) => {
    const mesh = child as THREE.Mesh;
    const mat = mesh.material as any;
    const apply = (m: any) => {
      if (!m) return;
      if (m.emissive) m.emissive = new THREE.Color(color);
      if (typeof m.emissiveIntensity === 'number') m.emissiveIntensity = intensity;
    };
    if (Array.isArray(mat)) mat.forEach(apply);
    else apply(mat);
  });
}

function disposeObject3D(obj: THREE.Object3D) {
  obj.traverse((child: THREE.Object3D) => {
    const mesh = child as THREE.Mesh;
    if (mesh.geometry) mesh.geometry.dispose?.();
    const mat = mesh.material as any;
    if (Array.isArray(mat)) mat.forEach((m) => m?.dispose?.());
    else mat?.dispose?.();
  });
}

function fitCameraToObject(camera: THREE.PerspectiveCamera, controls: OrbitControls, object: THREE.Object3D) {
  const box = new THREE.Box3().setFromObject(object);
  if (!Number.isFinite(box.min.x) || !Number.isFinite(box.max.x)) return;

  const size = new THREE.Vector3();
  box.getSize(size);
  const center = new THREE.Vector3();
  box.getCenter(center);

  const maxSize = Math.max(size.x, size.y, size.z, 1);
  const fitHeightDistance = maxSize / (2 * Math.tan((camera.fov * Math.PI) / 360));
  const fitWidthDistance = fitHeightDistance / (camera.aspect || 1);
  const distance = 1.2 * Math.max(fitHeightDistance, fitWidthDistance);

  camera.position.set(center.x + distance, center.y + distance * 0.6, center.z + distance);
  camera.near = Math.max(0.1, distance / 200);
  camera.far = Math.max(2000, distance * 10);
  camera.updateProjectionMatrix();

  controls.target.copy(center);
  controls.update();
}

function computeZoomBounds(dev: DevelopmentIn, preview: PreviewResponse, sel: Selection): Bounds | null {
  if (!preview || sel.kind === 'none') return null;
  const full = preview.bounds as Bounds;
  const dx = Math.max(full.max_x - full.min_x, 1e-6);
  const padX = dx * 0.05;

  const origins = computeNodeOrigins(dev);

  if (sel.kind === 'node') {
    const x = computeNodeMarkerX(dev, origins, sel.index);
    const half = Math.max(dx * 0.12, 1);
    return clampBounds(
      { min_x: x - half - padX, max_x: x + half + padX, min_y: full.min_y, max_y: full.max_y },
      full
    );
  }

  const r = computeSpanRangeX(dev, origins, sel.index);
  const half = Math.max((r.x1 - r.x0) / 2 + dx * 0.06, dx * 0.12);
  const mid = (r.x0 + r.x1) / 2;
  return clampBounds(
    { min_x: mid - half - padX, max_x: mid + half + padX, min_y: full.min_y, max_y: full.max_y },
    full
  );
}

function drawSelectionOverlay(canvas: HTMLCanvasElement, preview: PreviewResponse, dev: DevelopmentIn, sel: Selection, renderBounds: Bounds) {
  if (sel.kind === 'none') return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const rect = canvas.getBoundingClientRect();
  const cssW = Math.max(1, Math.round(rect.width));
  const cssH = Math.max(1, Math.round(rect.height));

  const origins = computeNodeOrigins(dev);
  const { toCanvas } = canvasMapper(renderBounds, cssW, cssH);

  ctx.save();
  ctx.globalCompositeOperation = 'source-over';

  if (sel.kind === 'node') {
    const x = computeNodeMarkerX(dev, origins, sel.index);
    const [cx0] = toCanvas(x, renderBounds.max_y);
    const [cx1] = toCanvas(x, renderBounds.min_y);
    const xpx = Math.round(cx0) + 0.5;
    ctx.strokeStyle = 'rgba(250, 204, 21, 0.55)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(xpx, 8);
    ctx.lineTo(xpx, cssH - 8);
    ctx.stroke();
  } else {
    const r = computeSpanRangeX(dev, origins, sel.index);
    const [x0] = toCanvas(r.x0, renderBounds.max_y);
    const [x1] = toCanvas(r.x1, renderBounds.max_y);
    const left = Math.min(x0, x1);
    const right = Math.max(x0, x1);
    ctx.fillStyle = 'rgba(250, 204, 21, 0.12)';
    ctx.strokeStyle = 'rgba(250, 204, 21, 0.35)';
    ctx.lineWidth = 2;
    ctx.fillRect(left, 6, Math.max(1, right - left), cssH - 12);
    ctx.strokeRect(left, 6, Math.max(1, right - left), cssH - 12);
  }

  ctx.restore();
}

function drawLabels(canvas: HTMLCanvasElement, data: PreviewResponse, dev: DevelopmentIn, renderBounds: Bounds) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const cssW = Math.max(1, Math.round(rect.width));
  const cssH = Math.max(1, Math.round(rect.height));
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const nodes = dev.nodes ?? [];
  const origins = computeNodeOrigins(dev);
  const { toCanvas } = canvasMapper(renderBounds, cssW, cssH);

  ctx.save();
  ctx.font = '12px ui-monospace, Menlo, Consolas, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Etiquetas N/T abajo, separadas del contorno
  const [, yBotPx0] = toCanvas(renderBounds.min_x, renderBounds.min_y);
  const yLabelPx = Math.min(cssH - 14, Math.round(yBotPx0) + 26);

  // Nodos (marca + punto + etiqueta)
  ctx.strokeStyle = 'rgba(250, 204, 21, 0.95)';
  ctx.lineWidth = 1;
  const tickLen = 22;
  const dotR = 3;
  for (let i = 0; i < origins.length; i++) {
    // En el contorno, el cap superior usa x=b1 y x=b2 (ver backend). Si b1=0, coincide con el quiebre vertical.
    const x = computeNodeMarkerX(dev, origins, i);
    const [txTop, tyTop] = toCanvas(x, renderBounds.max_y);
    // Marca corta (evita confundir con la sección)
    const xpx = Math.round(txTop) + 0.5;
    const ypx = Math.round(tyTop) + 0.5;
    ctx.beginPath();
    ctx.moveTo(xpx, ypx);
    ctx.lineTo(xpx, ypx + tickLen);
    ctx.stroke();

    // Punto del nodo
    ctx.fillStyle = 'rgba(250, 204, 21, 0.95)';
    ctx.beginPath();
    ctx.arc(Math.round(txTop) + 0.5, Math.round(tyTop) + 0.5, dotR, 0, Math.PI * 2);
    ctx.fill();

    // Etiqueta
    const xLabel = computeNodeLabelX(dev, origins, i);
    const [txLabel] = toCanvas(xLabel, renderBounds.max_y);
    ctx.fillStyle = 'rgba(250, 204, 21, 0.95)';
    ctx.fillText(`N${i + 1}`, txLabel, yLabelPx);
  }

  // Tramos (etiqueta)
  ctx.fillStyle = 'rgba(147, 197, 253, 0.95)';
  for (let i = 0; i < (dev.spans ?? []).length; i++) {
    const mx = computeSpanMidX(dev, origins, i);
    const [tx] = toCanvas(mx, renderBounds.max_y);
    ctx.fillText(`T${i + 1}`, tx, yLabelPx);
  }

  ctx.restore();
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export default function App() {
  const [tab, setTab] = useState<Tab>('concreto');
  const [previewView, setPreviewView] = useState<PreviewView>('2d');
  const [selection, setSelection] = useState<Selection>({ kind: 'none' });
  const [viewport, setViewport] = useState<Bounds | null>(null);
  const tabRef = useRef<Tab>(tab);

  const [appCfg, setAppCfg] = useState<AppConfig>(DEFAULT_APP_CFG);
  const [dev, setDev] = useState<DevelopmentIn>(() => defaultDevelopment(DEFAULT_APP_CFG));

  const [jsonText, setJsonText] = useState(() => {
    return toJson(toBackendPayload(defaultDevelopment(DEFAULT_APP_CFG)));
  });

  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [showNT, setShowNT] = useState(true);
  const [zoomEnabled, setZoomEnabled] = useState(true);
  const [concretoLocked, setConcretoLocked] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const threeHostRef = useRef<HTMLDivElement | null>(null);
  const threeRef = useRef<ThreeSceneState | null>(null);

  const spansCols = (dev.spans ?? []).length;
  const nodesCols = (dev.nodes ?? []).length;

  function focusGridCell(grid: 'spans' | 'nodes', row: number, col: number) {
    const selector = `[data-grid="${grid}"][data-row="${row}"][data-col="${col}"]`;
    const el = document.querySelector<HTMLInputElement>(selector);
    if (!el) return;
    el.focus();
    // select() only works for text-like inputs; number inputs still focus correctly.
    try {
      (el as any).select?.();
    } catch {
      // ignore
    }
    el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  function onGridKeyDown(
    e: React.KeyboardEvent<HTMLInputElement>,
    grid: 'spans' | 'nodes',
    row: number,
    col: number,
    maxRows: number,
    maxCols: number
  ) {
    const k = e.key;
    let nextRow = row;
    let nextCol = col;

    if (k === 'ArrowRight') nextCol = col + 1;
    else if (k === 'ArrowLeft') nextCol = col - 1;
    else if (k === 'ArrowDown' || k === 'Enter') nextRow = row + (e.shiftKey ? -1 : 1);
    else if (k === 'ArrowUp') nextRow = row - 1;
    else return;

    if (nextRow < 0 || nextRow >= maxRows) return;
    if (nextCol < 0 || nextCol >= maxCols) return;

    e.preventDefault();
    focusGridCell(grid, nextRow, nextCol);
  }

  useEffect(() => {
    tabRef.current = tab;
  }, [tab]);

  // Mantener dev sincronizado con config general
  useEffect(() => {
    setDev((prev) => normalizeDev(prev, appCfg));
  }, [appCfg]);

  const payloadInfo = useMemo(() => {
    const payload = toBackendPayload(dev);
    return { payload, error: null as string | null, warning: null as string | null };
  }, [dev]);

  const payload = payloadInfo.payload;

  // Mantener JSON sincronizado con formulario sin pisarlo al cambiar pestañas.
  useEffect(() => {
    if (tabRef.current === 'json') return;
    setJsonText(toJson(payload));
  }, [payload]);

  // Cargar estado persistido (si existe backend/DB). Ignora fallos.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const stored = await fetchState();
        if (cancelled) return;
        if (stored?.developments?.length) {
          const incoming = stored.developments[0];
          const nextCfg: AppConfig = {
            d: clampNumber(incoming.d ?? DEFAULT_APP_CFG.d, DEFAULT_APP_CFG.d),
            unit_scale: clampNumber(incoming.unit_scale ?? DEFAULT_APP_CFG.unit_scale, DEFAULT_APP_CFG.unit_scale),
            x0: clampNumber(incoming.x0 ?? DEFAULT_APP_CFG.x0, DEFAULT_APP_CFG.x0),
            y0: clampNumber(incoming.y0 ?? DEFAULT_APP_CFG.y0, DEFAULT_APP_CFG.y0),
            steel_cover_top: clampNumber((incoming as any).steel_cover_top ?? DEFAULT_APP_CFG.steel_cover_top, DEFAULT_APP_CFG.steel_cover_top),
            steel_cover_bottom: clampNumber(
              (incoming as any).steel_cover_bottom ?? DEFAULT_APP_CFG.steel_cover_bottom,
              DEFAULT_APP_CFG.steel_cover_bottom
            ),
          };
          setAppCfg(nextCfg);
          setDev(normalizeDev(incoming, nextCfg));
          setJsonText(toJson(stored));
        }
      } catch {
        // ignore
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // Guardar estado persistido (debounced). Ignora fallos.
  useEffect(() => {
    const t = window.setTimeout(async () => {
      try {
        await saveState(payload);
      } catch {
        // ignore
      }
    }, 600);
    return () => window.clearTimeout(t);
  }, [payload]);

  // Preview
  useEffect(() => {
    let cancelled = false;

    (async () => {
      setBusy(true);
      setError(null);
      setWarning(null);
      try {
        const data = await fetchPreview(payload);
        if (cancelled) return;
        setPreview(data);
      } catch (e: any) {
        if (cancelled) return;
        setError(e?.message ?? String(e));
        setPreview(null);
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [payload]);

  // Render del canvas (sin refetch) para que el toggle N/T responda inmediato
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const renderBounds = (viewport ?? (preview?.bounds as Bounds | undefined)) ?? null;
    drawPreview(canvas, preview, renderBounds);
    if (preview && renderBounds) drawSelectionOverlay(canvas, preview, dev, selection, renderBounds);
    const dev0 = payload.developments?.[0];
    if (preview && dev0 && showNT && renderBounds) drawLabels(canvas, preview, dev0, renderBounds);
    if (preview && renderBounds && tab === 'acero') {
      drawSteelOverlay(canvas, preview, dev, renderBounds, appCfg.steel_cover_top, appCfg.steel_cover_bottom);
    }
  }, [preview, showNT, payload, selection, viewport, dev, tab, appCfg.steel_cover_top, appCfg.steel_cover_bottom]);

  // Inicializar escena 3D (solo cuando la vista 3D está activa)
  useEffect(() => {
    if (previewView !== '3d') return;
    const host = threeHostRef.current;
    if (!host) return;
    if (threeRef.current) return;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x000000, 0);

    const scene = new THREE.Scene();

    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 5000);
    camera.position.set(120, 80, 120);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.rotateSpeed = 0.7;
    controls.zoomSpeed = 0.9;
    controls.panSpeed = 0.6;

    const ambient = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambient);
    const key = new THREE.DirectionalLight(0xffffff, 0.9);
    key.position.set(200, 250, 120);
    scene.add(key);

    const root = new THREE.Group();
    scene.add(root);

    host.appendChild(renderer.domElement);

    const onResize = () => {
      const rect = host.getBoundingClientRect();
      const w = Math.max(1, Math.round(rect.width));
      const h = Math.max(1, Math.round(rect.height));
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };

    const ro = new ResizeObserver(onResize);
    ro.observe(host);
    onResize();

    let raf = 0;
    const tick = () => {
      controls.update();
      renderer.render(scene, camera);
      raf = window.requestAnimationFrame(tick);
    };
    raf = window.requestAnimationFrame(tick);

    threeRef.current = { renderer, scene, camera, controls, root, spans: [], nodes: [] };

    return () => {
      window.cancelAnimationFrame(raf);
      ro.disconnect();
      disposeObject3D(root);
      renderer.dispose();
      renderer.domElement.remove();
      threeRef.current = null;
    };
  }, [previewView]);

  // Construir/reconstruir geometría 3D (extrusión fiel del contorno 2D)
  useEffect(() => {
    if (previewView !== '3d') return;
    const state = threeRef.current;
    if (!state) return;

    // Limpiar root
    while (state.root.children.length) {
      const child = state.root.children[0];
      state.root.remove(child);
      disposeObject3D(child);
    }
    state.spans = [];
    state.nodes = [];

    const dev0 = preview?.developments?.[0];
    const pts0 = dev0?.points ?? [];
    if (!pts0.length) {
      // sin preview aún
      return;
    }

    const poly: PolyPt[] = pts0.map((p) => [Number(p[0]), Number(p[1])] as PolyPt);
    // asegurar cierre
    if (poly.length >= 2) {
      const a = poly[0];
      const b = poly[poly.length - 1];
      if (a[0] !== b[0] || a[1] !== b[1]) poly.push([a[0], a[1]]);
    }

    const xs = uniqueSortedNumbers(poly.map((p) => p[0]));
    const spansCount = (dev.spans ?? []).length;
    const nodesCount = (dev.nodes ?? []).length;

    // grupos por tramo/nodo para highlight
    const spanGroups: THREE.Group[] = Array.from({ length: Math.max(spansCount, 1) }, () => new THREE.Group());
    const nodeGroups: THREE.Group[] = Array.from({ length: Math.max(nodesCount, 1) }, () => new THREE.Group());
    for (let i = 0; i < spanGroups.length; i++) state.root.add(spanGroups[i]);
    for (let i = 0; i < nodeGroups.length; i++) state.root.add(nodeGroups[i]);
    state.spans = spanGroups;
    state.nodes = nodeGroups;

    const baseMat = new THREE.MeshStandardMaterial({ color: 0x14b8a6, roughness: 0.48, metalness: 0.05 });

    // Rebanadas entre cada borde vertical del polígono.
    for (let i = 0; i + 1 < xs.length; i++) {
      const x0 = xs[i];
      const x1 = xs[i + 1];
      const dx = x1 - x0;
      if (!(dx > 1e-6)) continue;
      const xm = (x0 + x1) / 2;

      const intervals = polySliceIntervals(poly, xm);
      if (!intervals.length) continue;

      const b = spanBAtX(dev, xm);
      const spanIdx = spanIndexAtX(dev, xm);
      const nodeIdx = nodeIndexAtX(dev, xm);

      const parent = nodeIdx >= 0 ? nodeGroups[nodeIdx] : spanGroups[Math.max(0, Math.min(spanIdx, spanGroups.length - 1))];

      for (const [y0, y1] of intervals) {
        const dy = y1 - y0;
        if (!(dy > 1e-6)) continue;
        const geom = new THREE.BoxGeometry(dx, dy, b);
        const mesh = new THREE.Mesh(geom, baseMat.clone());
        mesh.position.set((x0 + x1) / 2, (y0 + y1) / 2, 0);
        parent.add(mesh);
      }
    }

    fitCameraToObject(state.camera, state.controls, state.root);
  }, [dev, preview, previewView]);

  // Highlight 3D por selección
  useEffect(() => {
    if (previewView !== '3d') return;
    const state = threeRef.current;
    if (!state) return;

    for (const g of state.spans) setEmissiveOnObject(g, 0x000000, 0);
    for (const g of state.nodes) setEmissiveOnObject(g, 0x000000, 0);

    if (!zoomEnabled) return;

    if (selection.kind === 'span') {
      const g = state.spans[selection.index];
      if (g) setEmissiveOnObject(g, 0xfacc15, 0.25);
    } else if (selection.kind === 'node') {
      const g = state.nodes[selection.index];
      if (g) setEmissiveOnObject(g, 0xfacc15, 0.40);
    }
  }, [selection, zoomEnabled, previewView]);

  // Si se desactiva Zoom, apaga correlación y vuelve a vista general
  useEffect(() => {
    if (zoomEnabled) return;
    setViewport(null);
    setSelection({ kind: 'none' });
  }, [zoomEnabled]);

  // Escape: si hay zoom vuelve a vista general; si no, limpia selección
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (viewport) {
        setViewport(null);
        e.preventDefault();
        return;
      }
      if (selection.kind !== 'none') {
        setSelection({ kind: 'none' });
        e.preventDefault();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [viewport, selection.kind]);

  function applySelection(sel: Selection, nextViewport: boolean) {
    if (!zoomEnabled) return;
    setSelection(sel);
    if (nextViewport && preview) setViewport(computeZoomBounds(dev, preview, sel));
  }

  function onCanvasClick(e: React.MouseEvent<HTMLCanvasElement>) {
    if (!preview || !zoomEnabled) return;

    const rect = (e.currentTarget as HTMLCanvasElement).getBoundingClientRect();
    const cssW = Math.max(1, Math.round(rect.width));
    const cssH = Math.max(1, Math.round(rect.height));
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;

    const rb = (viewport ?? (preview.bounds as Bounds)) as Bounds;
    const { toWorld } = canvasUnmapper(rb, cssW, cssH);
    const [wx] = toWorld(cx, cy);

    const origins = computeNodeOrigins(dev);
    const nodeXs = origins.map((_, i) => computeNodeMarkerX(dev, origins, i));
    const spanXs = (dev.spans ?? []).map((_, i) => computeSpanMidX(dev, origins, i));

    let best: Selection = { kind: 'none' };
    let bestDist = Number.POSITIVE_INFINITY;

    for (let i = 0; i < nodeXs.length; i++) {
      const d = Math.abs(wx - nodeXs[i]);
      if (d < bestDist) {
        bestDist = d;
        best = { kind: 'node', index: i };
      }
    }
    for (let i = 0; i < spanXs.length; i++) {
      const d = Math.abs(wx - spanXs[i]);
      if (d < bestDist) {
        bestDist = d;
        best = { kind: 'span', index: i };
      }
    }

    // Umbral relativo para evitar selecciones accidentales
    const dx = (rb.max_x - rb.min_x) || 1;
    const threshold = dx * 0.06;
    if (best.kind !== 'none' && bestDist <= threshold) {
      applySelection(best, true);
    }
  }

  function updateDevPatch(patch: Partial<DevelopmentIn>) {
    setDev((prev) => normalizeDev({ ...prev, ...patch } as DevelopmentIn, appCfg));
  }

  function updateSpan(spanIdx: number, patch: Partial<SpanIn>) {
    setDev((prev) => {
      const spans = (prev.spans ?? []).map((s, i) => (i === spanIdx ? { ...s, ...patch } : s));
      return normalizeDev({ ...prev, spans } as DevelopmentIn, appCfg);
    });
  }

  function updateNode(nodeIdx: number, patch: Partial<NodeIn>) {
    setDev((prev) => {
      const nodes = (prev.nodes ?? []).map((n, i) => (i === nodeIdx ? { ...n, ...patch } : n));
      return normalizeDev({ ...prev, nodes } as DevelopmentIn, appCfg);
    });
  }

  function updateSpanSteel(spanIdx: number, side: 'top' | 'bottom', patch: Partial<SteelMeta>) {
    const key = side === 'top' ? 'steel_top' : 'steel_bottom';
    setDev((prev) => {
      const spans = (prev.spans ?? []).map((s, i) => {
        if (i !== spanIdx) return s;
        const current = (s as any)[key] as SteelMeta | undefined;
        const next = { ...cloneSteelMeta(current), ...patch } as SteelMeta;
        return { ...s, [key]: next } as any;
      });
      return normalizeDev({ ...prev, spans } as DevelopmentIn, appCfg);
    });
  }

  function setNodeSteelKind(nodeIdx: number, side: 'top' | 'bottom', end: 1 | 2, kind: SteelKind) {
    setDev((prev) => {
      const nodes = (prev.nodes ?? []).map((n, i) => {
        if (i !== nodeIdx) return n;
        const isInternal = nodeIdx > 0 && nodeIdx < (prev.nodes?.length ?? 0) - 1;
        const k1 = side === 'top' ? 'steel_top_1_kind' : 'steel_bottom_1_kind';
        const k2 = side === 'top' ? 'steel_top_2_kind' : 'steel_bottom_2_kind';

        // Regla: si uno es "Continuo", el otro también (solo nodos internos que tienen 1 y 2)
        if (isInternal && kind === 'continuous') {
          return { ...n, [k1]: 'continuous', [k2]: 'continuous' } as any;
        }

        const key = end === 1 ? k1 : k2;
        return { ...n, [key]: kind } as any;
      });
      return normalizeDev({ ...prev, nodes } as DevelopmentIn, appCfg);
    });
  }

  function addSpan() {
    setDev((prev) => {
      const spans0 = prev.spans ?? [];
      const nodes0 = prev.nodes ?? [];
      const lastSpan = spans0.length ? spans0[spans0.length - 1] : INITIAL_SPAN;
      const lastNode = nodes0.length ? nodes0[nodes0.length - 1] : INITIAL_NODE;

      const spans = [...spans0, cloneSpan(lastSpan)];
      const nodes = [...nodes0, cloneNode(lastNode)];
      return normalizeDev({ ...prev, spans, nodes } as DevelopmentIn, appCfg);
    });
  }

  function removeSpan(spanIdx: number) {
    setDev((prev) => {
      const spans = (prev.spans ?? []).filter((_, i) => i !== spanIdx);
      return normalizeDev({ ...prev, spans } as DevelopmentIn, appCfg);
    });
  }

  async function onExportDxf() {
    try {
      setBusy(true);
      const blob = await exportDxf(payload);
      downloadBlob(blob, `beamdrawing-${(dev.name ?? 'desarrollo').replace(/\s+/g, '_')}.dxf`);
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }

  function applyJsonToForm() {
    const parsed = safeParseJson<PreviewRequest>(jsonText);
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    if (!parsed.value.developments?.length) {
      setError('JSON no contiene developments');
      return;
    }

    const incoming = parsed.value.developments[0];
    const nextCfg: AppConfig = {
      d: clampNumber(incoming.d ?? appCfg.d, appCfg.d),
      unit_scale: clampNumber(incoming.unit_scale ?? appCfg.unit_scale, appCfg.unit_scale),
      x0: clampNumber(incoming.x0 ?? appCfg.x0, appCfg.x0),
      y0: clampNumber(incoming.y0 ?? appCfg.y0, appCfg.y0),
      steel_cover_top: clampNumber((incoming as any).steel_cover_top ?? appCfg.steel_cover_top, appCfg.steel_cover_top),
      steel_cover_bottom: clampNumber((incoming as any).steel_cover_bottom ?? appCfg.steel_cover_bottom, appCfg.steel_cover_bottom),
    };
    setAppCfg(nextCfg);
    setDev(normalizeDev(incoming, nextCfg));
    setError(null);
  }

  return (
    <div className="layout">
      <header className="header">
        <div>
          <div className="title">BeamDraw - @MasconTech</div>
          <div className="subtitle">Config / Concreto / Acero / JSON</div>
        </div>

        <div className="actions">
          <div className="segmented">
            <button className={tab === 'config' ? 'segBtn segBtnActive' : 'segBtn'} onClick={() => setTab('config')} type="button">
              Config
            </button>
            <button className={tab === 'concreto' ? 'segBtn segBtnActive' : 'segBtn'} onClick={() => setTab('concreto')} type="button">
              Concreto
            </button>
            <button className={tab === 'acero' ? 'segBtn segBtnActive' : 'segBtn'} onClick={() => setTab('acero')} type="button">
              Acero
            </button>
            <button className={tab === 'json' ? 'segBtn segBtnActive' : 'segBtn'} onClick={() => setTab('json')} type="button">
              JSON
            </button>
          </div>

          <button className="btn" onClick={onExportDxf} type="button" disabled={busy}>
            Exportar DXF
          </button>
        </div>
      </header>

      <main className="content">
        <section className="panel">
          <div className="panelTitle">EDITOR DE DESARROLLO DE VIGA.</div>

          {tab === 'config' ? (
            <div className="form">
              <div className="muted">Config general (solo estos parámetros).</div>
              <div className="grid4">
                <label className="field">
                  <div className="label">d</div>
                  <input className="input" type="number" step="0.01" value={appCfg.d} onChange={(e) => setAppCfg((p) => ({ ...p, d: clampNumber(e.target.value, p.d) }))} />
                </label>
                <label className="field">
                  <div className="label">unit_scale</div>
                  <input
                    className="input"
                    type="number"
                    step="0.1"
                    value={appCfg.unit_scale}
                    onChange={(e) => setAppCfg((p) => ({ ...p, unit_scale: clampNumber(e.target.value, p.unit_scale) }))}
                  />
                </label>
                <label className="field">
                  <div className="label">x0</div>
                  <input className="input" type="number" step="0.01" value={appCfg.x0} onChange={(e) => setAppCfg((p) => ({ ...p, x0: clampNumber(e.target.value, p.x0) }))} />
                </label>
                <label className="field">
                  <div className="label">y0</div>
                  <input className="input" type="number" step="0.01" value={appCfg.y0} onChange={(e) => setAppCfg((p) => ({ ...p, y0: clampNumber(e.target.value, p.y0) }))} />
                </label>

                <label className="field">
                  <div className="label">recubrimiento acero sup (m)</div>
                  <input
                    className="input"
                    type="number"
                    step="0.01"
                    value={appCfg.steel_cover_top}
                    onChange={(e) => setAppCfg((p) => ({ ...p, steel_cover_top: clampNumber(e.target.value, p.steel_cover_top) }))}
                  />
                </label>

                <label className="field">
                  <div className="label">recubrimiento acero inf (m)</div>
                  <input
                    className="input"
                    type="number"
                    step="0.01"
                    value={appCfg.steel_cover_bottom}
                    onChange={(e) => setAppCfg((p) => ({ ...p, steel_cover_bottom: clampNumber(e.target.value, p.steel_cover_bottom) }))}
                  />
                </label>
              </div>
            </div>
          ) : null}

          {tab === 'concreto' ? (
            <div className="form">
              <div className="rowBetween">
                <div className="muted"></div>
              </div>

              <div className="nameRow">
                <label className="field nameField">
                  <div className="label">Nombre</div>
                  <input className="input" value={dev.name ?? ''} readOnly={concretoLocked} onChange={(e) => updateDevPatch({ name: e.target.value })} />
                </label>
                <div className="nameActions">
                  <button className="btnSmall" type="button" onClick={addSpan} disabled={concretoLocked}>
                    Añadir Tramo
                  </button>
                  <label className="toggle toggleTight" title={concretoLocked ? 'Edición bloqueada' : 'Edición habilitada'}>
                    <input type="checkbox" checked={concretoLocked} onChange={(e) => setConcretoLocked(e.target.checked)} />
                    <span>{concretoLocked ? '🔒' : '🔓'}</span>
                  </label>
                  <label className="toggle toggleTight" title="Mostrar marcadores N/T">
                    <input type="checkbox" checked={showNT} onChange={(e) => setShowNT(e.target.checked)} />
                    <span>N/T</span>
                  </label>
                  <label className="toggle toggleTight" title="Correlación tablas ↔ gráfico (selección + zoom)">
                    <input type="checkbox" checked={zoomEnabled} onChange={(e) => setZoomEnabled(e.target.checked)} />
                    <span>Zoom</span>
                  </label>
                </div>
              </div>

              <div className="twoCol">
                <div>
                  <div className="sectionHeader">
                    <div>Tramos</div>
                  </div>

                  <div className="matrix" style={{ gridTemplateColumns: `110px repeat(${(dev.spans ?? []).length}, 110px)` }}>
                    <div className="cell head"></div>
                    {(dev.spans ?? []).map((_, i) => (
                      <div className={selection.kind === 'span' && selection.index === i ? 'cell head cellSelected' : 'cell head'} key={`span-head-${i}`}>
                        <div className="colHead">
                          <div className="mono">Tramo {i + 1}</div>
                          <button className="btnX" type="button" title="Quitar tramo" onClick={() => removeSpan(i)} disabled={concretoLocked}>
                            ✕
                          </button>
                        </div>
                      </div>
                    ))}

                    <div className="cell rowLabel">L (m)</div>
                    {(dev.spans ?? []).map((s, i) => (
                      <div className={selection.kind === 'span' && selection.index === i ? 'cell cellSelected' : 'cell'} key={`span-L-${i}`}>
                        <input
                          className="cellInput"
                          type="number"
                          step="0.01"
                          value={s.L}
                          readOnly={concretoLocked}
                          onChange={(e) => updateSpan(i, { L: clampNumber(e.target.value, s.L) })}
                          onKeyDown={(e) => onGridKeyDown(e, 'spans', 0, i, 3, spansCols)}
                          onFocus={(e) => {
                            applySelection({ kind: 'span', index: i }, true);
                            (e.target as HTMLInputElement).select?.();
                          }}
                          data-grid="spans"
                          data-row={0}
                          data-col={i}
                        />
                      </div>
                    ))}

                    <div className="cell rowLabel">h (m)</div>
                    {(dev.spans ?? []).map((s, i) => (
                      <div className={selection.kind === 'span' && selection.index === i ? 'cell cellSelected' : 'cell'} key={`span-h-${i}`}>
                        <input
                          className="cellInput"
                          type="number"
                          step="0.01"
                          value={s.h}
                          readOnly={concretoLocked}
                          onChange={(e) => updateSpan(i, { h: clampNumber(e.target.value, s.h) })}
                          onKeyDown={(e) => onGridKeyDown(e, 'spans', 1, i, 3, spansCols)}
                          onFocus={(e) => {
                            applySelection({ kind: 'span', index: i }, true);
                            (e.target as HTMLInputElement).select?.();
                          }}
                          data-grid="spans"
                          data-row={1}
                          data-col={i}
                        />
                      </div>
                    ))}

                    <div className="cell rowLabel">b (m)</div>
                    {(dev.spans ?? []).map((s, i) => (
                      <div className={selection.kind === 'span' && selection.index === i ? 'cell cellSelected' : 'cell'} key={`span-b-${i}`}>
                        <input
                          className="cellInput"
                          type="number"
                          step="0.01"
                          value={s.b ?? 0}
                          readOnly={concretoLocked}
                          onChange={(e) => updateSpan(i, { b: clampNumber(e.target.value, s.b ?? 0) })}
                          onKeyDown={(e) => onGridKeyDown(e, 'spans', 2, i, 3, spansCols)}
                          onFocus={(e) => {
                            applySelection({ kind: 'span', index: i }, true);
                            (e.target as HTMLInputElement).select?.();
                          }}
                          data-grid="spans"
                          data-row={2}
                          data-col={i}
                        />
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="sectionHeader">
                    <div>Nodos</div>
                    <div className="mutedSmall">Nodos = Tramos + 1</div>
                  </div>

                  <div className="matrix" style={{ gridTemplateColumns: `110px repeat(${(dev.nodes ?? []).length}, 110px)` }}>
                    <div className="cell head"></div>
                    {(dev.nodes ?? []).map((_, i) => (
                      <div className={selection.kind === 'node' && selection.index === i ? 'cell head cellSelected' : 'cell head'} key={`node-head-${i}`}>
                        <div className="mono">Nodo {i + 1}</div>
                      </div>
                    ))}
                    <div className="cell rowLabel">X1 superior (b1)</div>
                    {(dev.nodes ?? []).map((n, i) => (
                      <div className={selection.kind === 'node' && selection.index === i ? 'cell cellSelected' : 'cell'} key={`node-b1-${i}`}>
                        <input
                          className="cellInput"
                          type="number"
                          step="0.01"
                          value={n.b1}
                          readOnly={concretoLocked}
                          onChange={(e) => updateNode(i, { b1: clampNumber(e.target.value, n.b1) })}
                          onKeyDown={(e) => onGridKeyDown(e, 'nodes', 0, i, 5, nodesCols)}
                          onFocus={(e) => {
                            applySelection({ kind: 'node', index: i }, true);
                            (e.target as HTMLInputElement).select?.();
                          }}
                          data-grid="nodes"
                          data-row={0}
                          data-col={i}
                        />
                      </div>
                    ))}

                    <div className="cell rowLabel">X2 superior (b2)</div>
                    {(dev.nodes ?? []).map((n, i) => (
                      <div className={selection.kind === 'node' && selection.index === i ? 'cell cellSelected' : 'cell'} key={`node-b2-${i}`}>
                        <input
                          className="cellInput"
                          type="number"
                          step="0.01"
                          value={n.b2}
                          readOnly={concretoLocked}
                          onChange={(e) => updateNode(i, { b2: clampNumber(e.target.value, n.b2) })}
                          onKeyDown={(e) => onGridKeyDown(e, 'nodes', 1, i, 5, nodesCols)}
                          onFocus={(e) => {
                            applySelection({ kind: 'node', index: i }, true);
                            (e.target as HTMLInputElement).select?.();
                          }}
                          data-grid="nodes"
                          data-row={1}
                          data-col={i}
                        />
                      </div>
                    ))}

                    <div className="cell rowLabel">proj Superior</div>
                    {(dev.nodes ?? []).map((n, i) => (
                      <div className={selection.kind === 'node' && selection.index === i ? 'cell cellSelected' : 'cell'} key={`node-pb-${i}`}>
                        <label className="check">
                          <input
                            type="checkbox"
                            checked={n.project_b ?? true}
                            disabled={concretoLocked}
                            onChange={(e) => updateNode(i, { project_b: e.target.checked })}
                            onKeyDown={(e) => onGridKeyDown(e as any, 'nodes', 2, i, 5, nodesCols)}
                            onFocus={() => applySelection({ kind: 'node', index: i }, true)}
                            data-grid="nodes"
                            data-row={2}
                            data-col={i}
                          />
                        </label>
                      </div>
                    ))}

                    <div className="cell rowLabel">X2 inferior (a2)</div>
                    {(dev.nodes ?? []).map((n, i) => (
                      <div className={selection.kind === 'node' && selection.index === i ? 'cell cellSelected' : 'cell'} key={`node-a2-${i}`}>
                        <input
                          className="cellInput"
                          type="number"
                          step="0.01"
                          value={n.a2}
                          readOnly={concretoLocked}
                          onChange={(e) => updateNode(i, { a2: clampNumber(e.target.value, n.a2) })}
                          onKeyDown={(e) => onGridKeyDown(e, 'nodes', 3, i, 5, nodesCols)}
                          onFocus={(e) => {
                            applySelection({ kind: 'node', index: i }, true);
                            (e.target as HTMLInputElement).select?.();
                          }}
                          data-grid="nodes"
                          data-row={3}
                          data-col={i}
                        />
                      </div>
                    ))}

                    <div className="cell rowLabel">proj Inferior</div>
                    {(dev.nodes ?? []).map((n, i) => (
                      <div className={selection.kind === 'node' && selection.index === i ? 'cell cellSelected' : 'cell'} key={`node-pa-${i}`}>
                        <label className="check">
                          <input
                            type="checkbox"
                            checked={n.project_a ?? true}
                            disabled={concretoLocked}
                            onChange={(e) => updateNode(i, { project_a: e.target.checked })}
                            onKeyDown={(e) => onGridKeyDown(e as any, 'nodes', 4, i, 5, nodesCols)}
                            onFocus={() => applySelection({ kind: 'node', index: i }, true)}
                            data-grid="nodes"
                            data-row={4}
                            data-col={i}
                          />
                        </label>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="hint"></div>
            </div>
          ) : null}

          {tab === 'acero' ? (
            <div className="form">
              <div className="muted">
                <b>Acero corrido</b> (por tramo). Se dibuja en cyan en la Vista previa 2D.
              </div>

              <div>
                <div className="sectionHeader">
                  <div>Acero corrido por tramo</div>
                  <div className="mutedSmall">Cantidad y diámetro por cada línea (sup/inf)</div>
                </div>

                <div className="matrix" style={{ gridTemplateColumns: `160px repeat(${(dev.spans ?? []).length}, 130px)` }}>
                  <div className="cell head"></div>
                  {(dev.spans ?? []).map((_, i) => (
                    <div className={'cell head'} key={`steel-span-head-${i}`}>
                      <div className="mono">Tramo {i + 1}</div>
                    </div>
                  ))}

                  <div className="cell rowLabel">Superior: Cantidad</div>
                  {(dev.spans ?? []).map((s, i) => (
                    <div className="cell" key={`steel-top-qty-${i}`}>
                      <input
                        className="cellInput"
                        type="number"
                        step="1"
                        min={1}
                        value={(s.steel_top?.qty ?? 3) as any}
                        onChange={(e) => updateSpanSteel(i, 'top', { qty: Math.max(1, clampNumber(e.target.value, s.steel_top?.qty ?? 3)) })}
                      />
                    </div>
                  ))}

                  <div className="cell rowLabel">Superior: Diámetro</div>
                  {(dev.spans ?? []).map((s, i) => (
                    <div className="cell" key={`steel-top-dia-${i}`}>
                      <select
                        className="cellInput"
                        value={String(s.steel_top?.diameter ?? '3/4')}
                        onChange={(e) => updateSpanSteel(i, 'top', { diameter: e.target.value })}
                      >
                        <option value="3/8">3/8</option>
                        <option value="1/2">1/2</option>
                        <option value="5/8">5/8</option>
                        <option value="3/4">3/4</option>
                        <option value="1">1</option>
                      </select>
                    </div>
                  ))}

                  <div className="cell rowLabel">Inferior: Cantidad</div>
                  {(dev.spans ?? []).map((s, i) => (
                    <div className="cell" key={`steel-bot-qty-${i}`}>
                      <input
                        className="cellInput"
                        type="number"
                        step="1"
                        min={1}
                        value={(s.steel_bottom?.qty ?? 3) as any}
                        onChange={(e) => updateSpanSteel(i, 'bottom', { qty: Math.max(1, clampNumber(e.target.value, s.steel_bottom?.qty ?? 3)) })}
                      />
                    </div>
                  ))}

                  <div className="cell rowLabel">Inferior: Diámetro</div>
                  {(dev.spans ?? []).map((s, i) => (
                    <div className="cell" key={`steel-bot-dia-${i}`}>
                      <select
                        className="cellInput"
                        value={String(s.steel_bottom?.diameter ?? '3/4')}
                        onChange={(e) => updateSpanSteel(i, 'bottom', { diameter: e.target.value })}
                      >
                        <option value="3/8">3/8</option>
                        <option value="1/2">1/2</option>
                        <option value="5/8">5/8</option>
                        <option value="3/4">3/4</option>
                        <option value="1">1</option>
                      </select>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <div className="sectionHeader">
                  <div>Conexión en nodos (hacia el siguiente tramo)</div>
                  <div className="mutedSmall">Continuo / Gancho / Anclaje (sup/inf)</div>
                </div>

                {(() => {
                  const nodes = dev.nodes ?? [];
                  const slots = buildNodeSlots(nodes);
                  return (
                    <div className="matrix" style={{ gridTemplateColumns: `200px repeat(${slots.length}, 110px)` }}>
                      <div className="cell head"></div>
                      {slots.map((s) => (
                        <div className={'cell head'} key={`steel-node-head-${s.nodeIdx}-${s.end}`}>
                          <div className="mono">{s.label}</div>
                        </div>
                      ))}

                      <div className="cell rowLabel">Superior</div>
                      {slots.map((s) => {
                        const n = nodes[s.nodeIdx];
                        const v = nodeSteelKind(n, 'top', s.end);
                        return (
                          <div className="cell" key={`n-top-sel-${s.nodeIdx}-${s.end}`}>
                            <select
                              className="cellInput"
                              value={v}
                              onChange={(e) => setNodeSteelKind(s.nodeIdx, 'top', s.end, e.target.value as any)}
                            >
                              <option value="continuous">Continuo</option>
                              <option value="hook">Gancho</option>
                              <option value="development">Anclaje</option>
                            </select>
                          </div>
                        );
                      })}

                      <div className="cell rowLabel">Inferior</div>
                      {slots.map((s) => {
                        const n = nodes[s.nodeIdx];
                        const v = nodeSteelKind(n, 'bottom', s.end);
                        return (
                          <div className="cell" key={`n-bot-sel-${s.nodeIdx}-${s.end}`}>
                            <select
                              className="cellInput"
                              value={v}
                              onChange={(e) => setNodeSteelKind(s.nodeIdx, 'bottom', s.end, e.target.value as any)}
                            >
                              <option value="continuous">Continuo</option>
                              <option value="hook">Gancho</option>
                              <option value="development">Anclaje</option>
                            </select>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>
            </div>
          ) : null}

          {tab === 'json' ? (
            <div className="form">
              <div className="rowBetween">
                <div className="muted">Editar JSON. Botón aplica al formulario.</div>
                <button className="btnSmall" type="button" onClick={applyJsonToForm}>
                  Aplicar
                </button>
              </div>
              <textarea className="editor" value={jsonText} onChange={(e) => setJsonText(e.target.value)} />
            </div>
          ) : null}

          {busy ? <div className="mutedSmall">Procesando…</div> : null}
          {warning ? <div className="warning">{warning}</div> : null}
          {error ? <div className="error">{error}</div> : null}
        </section>

        {tab !== 'config' ? (
          <section className="panel">
            <div className="rowBetween" style={{ marginBottom: 8 }}>
              <div className="panelTitle" style={{ marginBottom: 0 }}>Vista previa</div>
              <div className="segmented" aria-label="Vista previa 2D/3D">
                <button
                  className={previewView === '2d' ? 'segBtn segBtnActive' : 'segBtn'}
                  onClick={() => setPreviewView('2d')}
                  type="button"
                >
                  2D
                </button>
                <button
                  className={previewView === '3d' ? 'segBtn segBtnActive' : 'segBtn'}
                  onClick={() => setPreviewView('3d')}
                  type="button"
                >
                  3D
                </button>
              </div>
            </div>

            {previewView === '2d' ? <canvas ref={canvasRef} width={900} height={300} className="canvas" onClick={onCanvasClick} /> : null}
            {previewView === '3d' ? <div ref={threeHostRef} className="canvas3d" /> : null}

            <div className="meta">
              <div>
                <span className="mono">Spans:</span> {(dev.spans ?? []).length}
              </div>
              <div>
                <span className="mono">Nodes:</span> {(dev.nodes ?? []).length}
              </div>
            </div>
            {!preview ? <div className="mutedSmall">Sin preview (revisa backend).</div> : null}
          </section>
        ) : null}
      </main>
    </div>
  );
}
