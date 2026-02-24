import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { clearTemplateDxf, exportDxf, fetchConfig, fetchPreview, fetchState, getTemplateDxf, importDxf, saveState, updateConfig, uploadTemplateDxf } from './api';
import type {
  BackendAppConfig,
  BastonCfg,
  BastonesCfg,
  BastonesSideCfg,
  DevelopmentIn,
  NodeIn,
  PreviewRequest,
  PreviewResponse,
  SpanIn,
  StirrupsDistributionIn,
  StirrupsSectionIn,
  SteelKind,
  SteelMeta,
  SteelLayoutSettings,
} from './types';

import { computeSpanSectionLayoutWithBastonesCm, diameterToCm, getSteelLayoutSettings } from './steelLayout';
import { applyBasicPreferenceToNodes, applyBasicPreferenceToSpans, applyBasicBastonesPreferenceToSpans, applyBasicBastonesPreferenceToNodes } from './services/steelService';
import { useDebounce } from './hooks';
import { AppProvider, useAppState, useAppActions } from './context';
import { ConfigTab } from './components/ConfigTab';
import { ConcreteTab } from './components/ConcreteTab';
import { SteelTab } from './components/SteelTab';
import { PreviewPanel } from './components/PreviewPanel';
import { SteelOverlay, type SteelOverlayLayer } from './components/SteelOverlay';
import {
  // Geometry
  mToUnits,
  computeNodeOrigins,
  computeSpanMidX,
  computeSpanRangeX,
  computeNodeMarkerX,
  computeNodeLabelX,
  spanIndexAtX,
  nodeIndexAtX,
  spanBAtX,
  uniqueSortedNumbers,
  // Stirrups
  abcrFromLegacyTokens,
  parseStirrupsSpec,
  stirrupsPositionsFromTokens,
  stirrupsBlocksFromSpec,
  stirrupsRestSpacingFromSpec,
  type StirrupBlock,
  // Development
  readPersonalizado,
  cloneSteelMeta,
  cloneSpan,
  cloneNode,
  normalizeStirrupsSection,
  normalizeStirrupsDistribution,
  normalizeBastonCfg,
  normalizeBastonesSideCfg,
  normalizeBastonesCfg,
  normalizeDev,
  defaultDevelopment,
  toBackendPayload,
  toPreviewPayload,
  DEFAULT_APP_CFG,
  DEFAULT_STEEL_META,
  DEFAULT_STEEL_LAYOUT_SETTINGS,
  INITIAL_SPAN,
  INITIAL_NODE,
  PERSONALIZADO_KEY,
  type AppConfig,
  type PersonalizadoPayloadV1,
  // Steel
  lengthFromTableMeters,
  nodeSteelKind,
  nodeToFaceEnabled,
  nodeBastonLineKind,
  nodeBastonLineToFaceEnabled,
  buildNodeSlots,
  type NodeSlot,
  // Canvas
  fitTransform,
  canvasMapper,
  canvasUnmapper,
  clampBounds,
  drawPreview,
  drawCutMarker2D,
  polySliceIntervals,
  drawSelectionOverlay,
  drawLabels,
  type Bounds,
  type Selection,
  type PolyPt,
  // Three
  setEmissiveOnObject,
  disposeObject3D,
  setOrthoFrustum,
  fitCameraToObject,
  computeZoomBounds,
  // App Utils
  downloadBlob,
} from './services';
import {
  clampNumber,
  clampInt,
  snap05m,
  fmt2,
  formatBeamNo,
  levelPrefix,
  computeBeamName,
  formatOrdinalEs,
  parseDefaultPref,
  indexToLetters,
  safeGetLocalStorage,
  safeSetLocalStorage,
  formatStirrupsABCR,
  parseStirrupsABCR,
  pickDefaultABCRForH,
  normalizeDiaKey,
  safeParseJson,
  toJson,
  type LevelType,
  type DefaultPreferenceId,
  type StirrupsABCR,
  type StirrupToken,
  type ParseResult,
} from './utils';

type Tab = 'config' | 'concreto' | 'acero' | 'json';
type PreviewView = '2d' | '3d';
type ThreeProjection = 'perspective' | 'orthographic';

const DEFAULT_PREF_KEY = 'beamdraw:defaultPref';

function drawSteelOverlay(
  canvas: HTMLCanvasElement,
  preview: PreviewResponse,
  dev: DevelopmentIn,
  renderBounds: Bounds,
  recubrimientoM: number,
  hookLegM: number,
  opts?: { showLongitudinal?: boolean; showStirrups?: boolean; yScale?: number }
) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const showLongitudinal = opts?.showLongitudinal ?? true;
  const showStirrups = opts?.showStirrups ?? true;
  const yScale = opts?.yScale ?? 1;

  const rect = canvas.getBoundingClientRect();
  const cssW = Math.max(1, Math.round(rect.width));
  const cssH = Math.max(1, Math.round(rect.height));
  const dpr = Math.min(window.devicePixelRatio || 1, 2);

  ctx.save();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const { toCanvas: toCanvasBase } = canvasMapper(renderBounds, cssW, cssH);
  const toCanvas = (x: number, y: number): [number, number] => {
    const [cx, cy] = toCanvasBase(x, y);
    if (yScale === 1) return [cx, cy];
    const midY = cssH / 2;
    return [cx, midY + (cy - midY) * yScale];
  };
  const origins = computeNodeOrigins(dev);
  const y0 = mToUnits(dev, clampNumber((dev as any).y0 ?? 0, 0));
  const coverU = mToUnits(dev, clampNumber(recubrimientoM, 0.04));
  const hookLegU = mToUnits(dev, clampNumber(hookLegM, 0.15));

  // Acero corrido (vista 2D): amarillo
  if (showLongitudinal) {
    ctx.strokeStyle = 'rgba(250, 204, 21, 0.95)';
    ctx.lineWidth = 2;
  }

  const extraStroke = 'rgba(217, 70, 239, 0.95)';
  const bastonL1Stroke = 'rgba(34, 197, 94, 0.95)';
  const bastonL2Stroke = 'rgba(6, 182, 212, 0.95)';
  // Compatibilidad con helpers legacy que asumen un solo color.
  const bastonStroke = bastonL1Stroke;

  const spans = dev.spans ?? [];
  const nodes = dev.nodes ?? [];

  const bastonLcM = clampNumber((dev as any).baston_Lc ?? 0.5, 0.5);
  const bastonLcU = mToUnits(dev, bastonLcM);
  const bastonSpacingU = mToUnits(dev, 0.02);

  function getBastonCfg(span: SpanIn, side: 'top' | 'bottom', zone: 'z1' | 'z2' | 'z3'): BastonCfg {
    const b = (span as any).bastones ?? {};
    const s = (side === 'top' ? b.top : b.bottom) ?? {};
    const z = (s as any)[zone] ?? {};
    return normalizeBastonCfg(z);
  }

  function drawBastonLines(x0: number, x1: number, yBase: number, _qty: number, towardCenterSign: 1 | -1, stroke: string) {
    if (!ctx) return;
    const prev = ctx.strokeStyle;
    ctx.strokeStyle = stroke;
    // En el desarrollo 2D, una sola línea representa el grupo (qty no crea líneas paralelas).
    const y = yBase;
    const [cx0, cy] = toCanvas(x0, y);
    const [cx1] = toCanvas(x1, y);
    ctx.beginPath();
    ctx.moveTo(Math.round(cx0) + 0.5, Math.round(cy) + 0.5);
    ctx.lineTo(Math.round(cx1) + 0.5, Math.round(cy) + 0.5);
    ctx.stroke();

    drawEndDots(x0, y, x1, y, stroke);
    ctx.strokeStyle = prev;
  }

  // Zona 1: 2 líneas (según croquis)
  // - línea 1: 0 → L1
  // - línea 2: recubrimiento hacia adentro, 0 → (L1 - Lc)
  function drawBastonZona1(x0: number, x1Full: number, yBase: number, qty: number, towardCenterSign: 1 | -1) {
    if (!ctx) return;
    const prev = ctx.strokeStyle;
    ctx.strokeStyle = bastonStroke;
    for (let k = 0; k < qty; k++) {
      const y1 = yBase + towardCenterSign * k * bastonSpacingU;

      // línea completa
      {
        const [cx0, cy] = toCanvas(x0, y1);
        const [cx1] = toCanvas(x1Full, y1);
        ctx.beginPath();
        ctx.moveTo(Math.round(cx0) + 0.5, Math.round(cy) + 0.5);
        ctx.lineTo(Math.round(cx1) + 0.5, Math.round(cy) + 0.5);
        ctx.stroke();

        drawEndDots(x0, y1, x1Full, y1, bastonStroke);
      }

      // línea interior (offset recubrimiento) termina en L1 - Lc
      const x1Inner = x1Full - bastonLcU;
      if (x1Inner > x0 + 1e-6) {
        const y2 = y1 + towardCenterSign * coverU;
        const [cx0, cy] = toCanvas(x0, y2);
        const [cx1] = toCanvas(x1Inner, y2);
        ctx.beginPath();
        ctx.moveTo(Math.round(cx0) + 0.5, Math.round(cy) + 0.5);
        ctx.lineTo(Math.round(cx1) + 0.5, Math.round(cy) + 0.5);
        ctx.stroke();

        drawEndDots(x0, y2, x1Inner, y2, bastonStroke);
      }
    }
    ctx.strokeStyle = prev;
  }

  // Zona 3 (espejo de Zona 1):
  // - línea 1: (L - L1) → L
  // - línea 2: recubrimiento hacia adentro, (L - L1 + Lc) → L
  function drawBastonZona3(x0Full: number, x1: number, yBase: number, qty: number, towardCenterSign: 1 | -1) {
    if (!ctx) return;
    const prev = ctx.strokeStyle;
    ctx.strokeStyle = bastonStroke;
    for (let k = 0; k < qty; k++) {
      const y1 = yBase + towardCenterSign * k * bastonSpacingU;

      // línea completa
      {
        const [cx0, cy] = toCanvas(x0Full, y1);
        const [cx1] = toCanvas(x1, y1);
        ctx.beginPath();
        ctx.moveTo(Math.round(cx0) + 0.5, Math.round(cy) + 0.5);
        ctx.lineTo(Math.round(cx1) + 0.5, Math.round(cy) + 0.5);
        ctx.stroke();

        drawEndDots(x0Full, y1, x1, y1, bastonStroke);
      }

      // línea interior (offset recubrimiento) inicia en (L-L1+Lc)
      const x0Inner = x0Full + bastonLcU;
      if (x1 > x0Inner + 1e-6) {
        const y2 = y1 + towardCenterSign * coverU;
        const [cx0, cy] = toCanvas(x0Inner, y2);
        const [cx1] = toCanvas(x1, y2);
        ctx.beginPath();
        ctx.moveTo(Math.round(cx0) + 0.5, Math.round(cy) + 0.5);
        ctx.lineTo(Math.round(cx1) + 0.5, Math.round(cy) + 0.5);
        ctx.stroke();

        drawEndDots(x0Inner, y2, x1, y2, bastonStroke);
      }
    }
    ctx.strokeStyle = prev;
  }

  // Zona 2 (según croquis):
  // - línea 1: L1 → (L - L2)
  // - línea 2: recubrimiento hacia adentro, (L1 + Lc) → (L - L2 - Lc)
  function drawBastonZona2(x0Full: number, x1Full: number, yBase: number, qty: number, towardCenterSign: 1 | -1) {
    if (!ctx) return;
    const prev = ctx.strokeStyle;
    ctx.strokeStyle = bastonStroke;
    for (let k = 0; k < qty; k++) {
      const y1 = yBase + towardCenterSign * k * bastonSpacingU;

      // línea completa
      {
        const [cx0, cy] = toCanvas(x0Full, y1);
        const [cx1] = toCanvas(x1Full, y1);
        ctx.beginPath();
        ctx.moveTo(Math.round(cx0) + 0.5, Math.round(cy) + 0.5);
        ctx.lineTo(Math.round(cx1) + 0.5, Math.round(cy) + 0.5);
        ctx.stroke();

        drawEndDots(x0Full, y1, x1Full, y1, bastonStroke);
      }

      // línea interior (offset recubrimiento) recortada por Lc a ambos lados
      const x0Inner = x0Full + bastonLcU;
      const x1Inner = x1Full - bastonLcU;
      if (x1Inner > x0Inner + 1e-6) {
        const y2 = y1 + towardCenterSign * coverU;
        const [cx0, cy] = toCanvas(x0Inner, y2);
        const [cx1] = toCanvas(x1Inner, y2);
        ctx.beginPath();
        ctx.moveTo(Math.round(cx0) + 0.5, Math.round(cy) + 0.5);
        ctx.lineTo(Math.round(cx1) + 0.5, Math.round(cy) + 0.5);
        ctx.stroke();

        drawEndDots(x0Inner, y2, x1Inner, y2, bastonStroke);
      }
    }
    ctx.strokeStyle = prev;
  }

  function drawHookOrAnchorage(
    x: number,
    y: number,
    dir: 1 | -1,
    dia: string,
    kind: 'hook' | 'anchorage',
    side: 'top' | 'bottom',
    xFace?: number,
    customLengthM?: number
  ) {
    const c = ctx;
    if (!c) return;
    const prevStroke = c.strokeStyle;
    c.strokeStyle = extraStroke;
    const x2 = (() => {
      if (typeof xFace === 'number' && Number.isFinite(xFace)) {
        // Offset interior: separar del borde por recubrimiento.
        const target = xFace - dir * coverU;
        const lo = Math.min(x, xFace);
        const hi = Math.max(x, xFace);
        return Math.min(hi, Math.max(lo, target));
      }
      // Use custom length if provided (Preferencia 01), otherwise use table
      const lengthM = (typeof customLengthM === 'number' && customLengthM > 0)
        ? customLengthM
        : lengthFromTableMeters(dia, kind, side);
      return x + dir * mToUnits(dev, lengthM);
    })();

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
  ctx.fillStyle = 'rgba(250, 204, 21, 0.95)';

  function drawEndDots(x0: number, y0: number, x1: number, y1: number, color: string) {
    const c = ctx;
    if (!c) return;
    const prevFill = c.fillStyle;
    c.fillStyle = color;
    const [cx0, cy0] = toCanvas(x0, y0);
    const [cx1, cy1] = toCanvas(x1, y1);
    c.beginPath();
    c.arc(Math.round(cx0) + 0.5, Math.round(cy0) + 0.5, dotR, 0, Math.PI * 2);
    c.arc(Math.round(cx1) + 0.5, Math.round(cy1) + 0.5, dotR, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = prevFill;
  }

  for (let i = 0; i < spans.length; i++) {
    const L = mToUnits(dev, clampNumber(spans[i]?.L ?? 0, 0));
    const h = mToUnits(dev, clampNumber(spans[i]?.h ?? 0, 0));

    const a2_i = mToUnits(dev, clampNumber(nodes[i]?.a2 ?? 0, 0));
    const a1_ip1 = mToUnits(dev, clampNumber(nodes[i + 1]?.a1 ?? 0, 0));
    const xBot0 = (origins[i] ?? 0) + a2_i;
    const xBot1 = xBot0 + L;
    const yBot = y0 + coverU;

    const b2_i = mToUnits(dev, clampNumber(nodes[i]?.b2 ?? 0, 0));
    const b1_ip1 = mToUnits(dev, clampNumber(nodes[i + 1]?.b1 ?? 0, 0));
    const xTop0 = (origins[i] ?? 0) + b2_i;
    const xTop1 = (origins[i + 1] ?? 0) + b1_ip1;
    const yTop = y0 + h - coverU;

    if (showLongitudinal) {
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

    // Estribos (vista 2D): gris
    if (showStirrups) {
      const st = (spans[i] as any)?.stirrups as any;
      if (st) {
        const dM = clampNumber((dev as any).d ?? 0.25, 0.25);
        const x0Face = Math.min(xBot0, xBot1);
        const x1Face = Math.max(xBot0, xBot1);
        const LspanU = x1Face - x0Face;

        if (LspanU > 1e-6) {
          const caseType = String(st.case_type ?? 'simetrica').trim().toLowerCase();
          const singleEnd = String(st.single_end ?? '').trim().toLowerCase();
          const leftSpec = String(st.left_spec ?? '').trim();
          const centerSpec = String(st.center_spec ?? '').trim();
          const rightSpec = String(st.right_spec ?? '').trim();

          const specOr = (...vals: string[]) => {
            for (const v of vals) {
              const s = String(v ?? '').trim();
              if (s) return s;
            }
            return '';
          };

          let pL = '';
          let pR = '';
          if (caseType === 'simetrica') {
            pL = specOr(leftSpec, centerSpec, rightSpec);
            pR = specOr(rightSpec, pL) || pL;
          } else if (caseType === 'asim_ambos') {
            pL = specOr(leftSpec, centerSpec);
            pR = specOr(rightSpec, centerSpec, pL);
          } else if (caseType === 'asim_uno') {
            const pSpecial = specOr(leftSpec);
            const pRest = specOr(centerSpec, pSpecial);
            if (singleEnd === 'right') {
              pL = pRest;
              pR = pSpecial;
            } else {
              pL = pSpecial;
              pR = pRest;
            }
          } else {
            pL = specOr(leftSpec, centerSpec, rightSpec);
            pR = specOr(rightSpec, pL) || pL;
          }

          const midU = (x0Face + x1Face) / 2;
          const leftBlocks = pL ? stirrupsBlocksFromSpec(dev, pL, x0Face, midU, +1) : [];
          const rightBlocks = pR ? stirrupsBlocksFromSpec(dev, pR, x1Face, midU, -1) : [];

          // Si el espacio en el centro es mayor que R, agregar un estribo independiente.
          try {
            const flatL = leftBlocks.flatMap((b) => b.positions ?? []);
            const flatR = rightBlocks.flatMap((b) => b.positions ?? []);
            const leftLast = flatL.length ? Math.max(...flatL) : null;
            const rightFirst = flatR.length ? Math.min(...flatR) : null;
            const rLm = pL ? stirrupsRestSpacingFromSpec(pL) : null;
            const rRm = pR ? stirrupsRestSpacingFromSpec(pR) : null;
            const rM = Math.min(...[rLm ?? Infinity, rRm ?? Infinity].filter((v) => Number.isFinite(v)) as number[]);
            const rU = Number.isFinite(rM) && rM > 0 ? mToUnits(dev, rM) : 0;
            if (leftLast != null && rightFirst != null && rightFirst > leftLast + 1e-6 && rU > 0) {
              const gap = rightFirst - leftLast;
              if (gap > rU + 1e-6) {
                const xMid = (leftLast + rightFirst) / 2;
                leftBlocks.push({ key: 'mid', positions: [xMid] });
              }
            }
          } catch {
            // ignore
          }

          if (leftBlocks.length || rightBlocks.length) {
            const prevStroke = ctx.strokeStyle;
            const prevW = ctx.lineWidth;
            ctx.lineWidth = 1;

            const colorFor = (key: string, idx: number) => {
              const k = String(key || '').toLowerCase();
              if (k === 'b') return 'rgba(34,197,94,0.70)';
              if (k === 'c') return 'rgba(148,163,184,0.70)';
              if (k === 'r') return 'rgba(6,182,212,0.70)';
              if (k === 'mid') return 'rgba(217,70,239,0.80)';
              return idx % 3 === 0
                ? 'rgba(34,197,94,0.70)'
                : idx % 3 === 1
                  ? 'rgba(148,163,184,0.70)'
                  : 'rgba(6,182,212,0.70)';
            };

            const yS0 = y0 + coverU;
            const yS1 = y0 + h - coverU;
            if (yS1 > yS0 + 1e-6) {
              const drawGroup = (positions: number[], color: string) => {
                if (!positions.length) return;
                ctx.strokeStyle = color;
                ctx.beginPath();
                for (const xPos of positions) {
                  if (xPos < x0Face - 1e-3 || xPos > x1Face + 1e-3) continue;
                  const [cx0, cy0_] = toCanvas(xPos, yS0);
                  const [, cy1_] = toCanvas(xPos, yS1);
                  const sx = Math.round(cx0) + 0.5;
                  ctx.moveTo(sx, Math.round(cy0_) + 0.5);
                  ctx.lineTo(sx, Math.round(cy1_) + 0.5);
                }
                ctx.stroke();
              };

              let idx = 0;
              for (const b of leftBlocks) {
                drawGroup(b.positions, colorFor(b.key, idx++));
              }
              for (const b of rightBlocks) {
                drawGroup(b.positions, colorFor(b.key, idx++));
              }
            }

            ctx.strokeStyle = prevStroke;
            ctx.lineWidth = prevW;
          }
        }
      }
    }
  }

  if (!showLongitudinal) {
    ctx.restore();
    return;
  }

  // Bastones por zonas (1/2/3) por tramo
  for (let i = 0; i < spans.length; i++) {
    const span = spans[i];
    const Lm = clampNumber(span?.L ?? 0, 0);
    if (!span || Lm <= 0) continue;

    const h_u = mToUnits(dev, clampNumber(span.h ?? 0, 0));

    // X-range por lado (mismo que el acero longitudinal dibujado)
    const a2_i = mToUnits(dev, clampNumber(nodes[i]?.a2 ?? 0, 0));
    const xBot0 = (origins[i] ?? 0) + a2_i;
    const xBot1 = xBot0 + mToUnits(dev, Lm);

    const b2_i = mToUnits(dev, clampNumber(nodes[i]?.b2 ?? 0, 0));
    const b1_ip1 = mToUnits(dev, clampNumber(nodes[i + 1]?.b1 ?? 0, 0));
    const xTop0 = (origins[i] ?? 0) + b2_i;
    const xTop1 = (origins[i + 1] ?? 0) + b1_ip1;

    const yTopLong = y0 + h_u - coverU;
    const yBotLong = y0 + coverU;
    const yTopBaston = yTopLong - coverU;
    const yBotBaston = yBotLong + coverU;

    const defaultLenM = Lm / 5;
    const defaultL3M = Lm / 3;

    const resolvedLenM = (cfg: BastonCfg, field: 'L1_m' | 'L2_m' | 'L3_m', fallbackM: number) => {
      const v = (cfg as any)[field];
      const n = typeof v === 'number' ? v : NaN;
      const out = Number.isFinite(n) && n > 0 ? n : fallbackM;
      const snapped = snap05m(out);
      return Math.min(Lm, Math.max(0, snapped));
    };

    const drawSide = (side: 'top' | 'bottom') => {
      const x0Side = side === 'top' ? xTop0 : xBot0;
      const x1Side = side === 'top' ? xTop1 : xBot1;
      const yBase = side === 'top' ? yTopBaston : yBotBaston;
      const sign: 1 | -1 = side === 'top' ? -1 : +1;

      // Z1
      {
        const cfg = getBastonCfg(span, side, 'z1');
        if (cfg.l1_enabled || cfg.l2_enabled) {
          const q1 = Math.max(1, Math.min(3, Math.round(cfg.l1_qty ?? 1)));
          const q2 = Math.max(1, Math.min(3, Math.round(cfg.l2_qty ?? 1)));
          const L3_u = mToUnits(dev, resolvedLenM(cfg, 'L3_m', defaultL3M));
          const x0 = x0Side;
          const x1 = Math.min(x1Side, x0Side + L3_u);
          if (x1 > x0 + 1e-6) {
            // Línea 1 (exterior)
            if (cfg.l1_enabled) drawBastonLines(x0, x1, yBase, 1, sign, bastonL1Stroke);

            // Línea 2 (interior)
            const x1Inner = x1 - bastonLcU;
            if (cfg.l2_enabled && x1Inner > x0 + 1e-6) {
              drawBastonLines(x0, x1Inner, yBase + sign * coverU, 1, sign, bastonL2Stroke);
            }
          }

          // Conexión en el nodo (Zona 1): usa el nodo izquierdo del tramo (end=2)
          const n0 = nodes[i];
          if (n0) {
            const xFaceFor = (line: 1 | 2) => {
              const toFace = nodeBastonLineToFaceEnabled(n0, side, 2, line);
              if (!toFace) return undefined;
              const o = origins[i] ?? 0;
              return side === 'top'
                ? o + mToUnits(dev, clampNumber(n0.b1 ?? 0, 0))
                : o + mToUnits(dev, clampNumber(n0.a1 ?? 0, 0));
            };

            // Línea 1 (exterior)
            {
              if (cfg.l1_enabled) {
                const dia = String(cfg.l1_diameter ?? '3/4');
                const kEnd = nodeBastonLineKind(n0, side, 2, 1);
                if (kEnd === 'hook' || kEnd === 'development') {
                  const kind = kEnd === 'hook' ? 'hook' : 'anchorage';
                  const xFace = xFaceFor(1);
                  drawHookOrAnchorage(x0, yBase, -1, dia, kind, side, xFace);
                }
              }
            }

            // Línea 2 (interior): solo si existe (L3 > Lc)
            {
              const x1Inner = x1 - bastonLcU;
              if (x1Inner > x0 + 1e-6) {
                if (cfg.l2_enabled) {
                  const dia = String(cfg.l2_diameter ?? '3/4');
                  const kEnd = nodeBastonLineKind(n0, side, 2, 2);
                  if (kEnd === 'hook' || kEnd === 'development') {
                    const kind = kEnd === 'hook' ? 'hook' : 'anchorage';
                    const xFace = xFaceFor(2);
                    drawHookOrAnchorage(x0, yBase + sign * coverU, -1, dia, kind, side, xFace);
                  }
                }
              }
            }
          }
        }
      }

      // Z2
      {
        const cfg = getBastonCfg(span, side, 'z2');
        if (cfg.l1_enabled || cfg.l2_enabled) {
          const q1 = Math.max(1, Math.min(3, Math.round(cfg.l1_qty ?? 1)));
          const q2 = Math.max(1, Math.min(3, Math.round(cfg.l2_qty ?? 1)));
          const L1_u = mToUnits(dev, resolvedLenM(cfg, 'L1_m', defaultLenM));
          const L2_u = mToUnits(dev, resolvedLenM(cfg, 'L2_m', defaultLenM));
          // NOTA: el recorte por Lc se aplica en el segundo trazo, no aquí.
          const x0 = x0Side + L1_u;
          const x1 = x1Side - L2_u;
          if (x1 > x0 + 1e-6) {
            if (cfg.l1_enabled) drawBastonLines(x0, x1, yBase, 1, sign, bastonL1Stroke);
            const x0Inner = x0 + bastonLcU;
            const x1Inner = x1 - bastonLcU;
            if (cfg.l2_enabled && x1Inner > x0Inner + 1e-6) {
              drawBastonLines(x0Inner, x1Inner, yBase + sign * coverU, 1, sign, bastonL2Stroke);
            }
          }
        }
      }

      // Z3 (espejo Z1)
      {
        const cfg = getBastonCfg(span, side, 'z3');
        if (cfg.l1_enabled || cfg.l2_enabled) {
          const q1 = Math.max(1, Math.min(3, Math.round(cfg.l1_qty ?? 1)));
          const q2 = Math.max(1, Math.min(3, Math.round(cfg.l2_qty ?? 1)));
          const L3_u = mToUnits(dev, resolvedLenM(cfg, 'L3_m', defaultL3M));
          const x1 = x1Side;
          const x0 = Math.max(x0Side, x1Side - L3_u);
          if (x1 > x0 + 1e-6) {
            if (cfg.l1_enabled) drawBastonLines(x0, x1, yBase, 1, sign, bastonL1Stroke);
            const x0Inner = x0 + bastonLcU;
            if (cfg.l2_enabled && x1 > x0Inner + 1e-6) {
              drawBastonLines(x0Inner, x1, yBase + sign * coverU, 1, sign, bastonL2Stroke);
            }
          }

          // Conexión en el nodo (Zona 3): usa el nodo derecho del tramo (end=1)
          const n1 = nodes[i + 1];
          if (n1) {
            const xFaceFor = (line: 1 | 2) => {
              const toFace = nodeBastonLineToFaceEnabled(n1, side, 1, line);
              if (!toFace) return undefined;
              const o = origins[i + 1] ?? 0;
              return side === 'top'
                ? o + mToUnits(dev, clampNumber(n1.b2 ?? 0, 0))
                : o + mToUnits(dev, clampNumber(n1.a2 ?? 0, 0));
            };

            // Línea 1 (exterior)
            {
              if (cfg.l1_enabled) {
                const dia = String(cfg.l1_diameter ?? '3/4');
                const kEnd = nodeBastonLineKind(n1, side, 1, 1);
                if (kEnd === 'hook' || kEnd === 'development') {
                  const kind = kEnd === 'hook' ? 'hook' : 'anchorage';
                  const xFace = xFaceFor(1);
                  drawHookOrAnchorage(x1, yBase, +1, dia, kind, side, xFace);
                }
              }
            }

            // Línea 2 (interior): solo si existe (L3 > Lc)
            {
              const x0Inner = x0 + bastonLcU;
              if (x1 > x0Inner + 1e-6) {
                if (cfg.l2_enabled) {
                  const dia = String(cfg.l2_diameter ?? '3/4');
                  const kEnd = nodeBastonLineKind(n1, side, 1, 2);
                  if (kEnd === 'hook' || kEnd === 'development') {
                    const kind = kEnd === 'hook' ? 'hook' : 'anchorage';
                    const xFace = xFaceFor(2);
                    drawHookOrAnchorage(x1, yBase + sign * coverU, +1, dia, kind, side, xFace);
                  }
                }
              }
            }
          }
        }
      }
    };

    drawSide('top');
    drawSide('bottom');
  }

  // Conexiones de bastones en nodos internos (Z3 tramo izq ↔ Z1 tramo der)
  {
    const prev = ctx.strokeStyle;
    for (let i = 1; i < nodes.length - 1; i++) {
      const node = nodes[i];
      const leftSpan = spans[i - 1];
      const rightSpan = spans[i];
      if (!node || !leftSpan || !rightSpan) continue;

      const xTopL = (origins[i] ?? 0) + mToUnits(dev, clampNumber(node.b1 ?? 0, 0));
      const xTopR = (origins[i] ?? 0) + mToUnits(dev, clampNumber(node.b2 ?? 0, 0));
      const yTopL = y0 + mToUnits(dev, clampNumber(leftSpan.h ?? 0, 0)) - coverU;
      const yTopR = y0 + mToUnits(dev, clampNumber(rightSpan.h ?? 0, 0)) - coverU;
      const yTopBastonL = yTopL - coverU;
      const yTopBastonR = yTopR - coverU;

      const xBotL = (origins[i] ?? 0) + mToUnits(dev, clampNumber(node.a1 ?? 0, 0));
      const xBotR = (origins[i] ?? 0) + mToUnits(dev, clampNumber(node.a2 ?? 0, 0));
      const yBotBaston = (y0 + coverU) + coverU;

      const cfgTopL = getBastonCfg(leftSpan, 'top', 'z3');
      const cfgTopR = getBastonCfg(rightSpan, 'top', 'z1');
      const cfgBotL = getBastonCfg(leftSpan, 'bottom', 'z3');
      const cfgBotR = getBastonCfg(rightSpan, 'bottom', 'z1');

      const resolvedL3u = (span: SpanIn, cfg: BastonCfg) => {
        const Lm = clampNumber(span?.L ?? 0, 0);
        const fallbackM = Lm / 3;
        const v = (cfg as any).L3_m;
        const n = typeof v === 'number' ? v : NaN;
        const out = Number.isFinite(n) && n > 0 ? n : fallbackM;
        const snapped = snap05m(out);
        const m = Math.min(Lm, Math.max(0, snapped));
        return mToUnits(dev, m);
      };

      for (const line of [1, 2] as const) {
        const stroke = line === 1 ? bastonL1Stroke : bastonL2Stroke;
        ctx.strokeStyle = stroke;
        const topK1 = nodeBastonLineKind(node, 'top', 1, line);
        const topK2 = nodeBastonLineKind(node, 'top', 2, line);
        const botK1 = nodeBastonLineKind(node, 'bottom', 1, line);
        const botK2 = nodeBastonLineKind(node, 'bottom', 2, line);

        // TOP: continuo solo si ambos extremos son continuos y existen bastones a ambos lados
        if (topK1 === 'continuous' && topK2 === 'continuous') {
          const leftEnabled = line === 1 ? cfgTopL.l1_enabled : cfgTopL.l2_enabled;
          const rightEnabled = line === 1 ? cfgTopR.l1_enabled : cfgTopR.l2_enabled;
          if (leftEnabled && rightEnabled) {
            // Línea 2 solo existe si L3 > Lc en ambos tramos
            const l2Ok = (() => {
              if (line === 1) return true;
              const L3uL = resolvedL3u(leftSpan, cfgTopL);
              const L3uR = resolvedL3u(rightSpan, cfgTopR);
              return L3uL > bastonLcU + 1e-6 && L3uR > bastonLcU + 1e-6;
            })();
            if (l2Ok) {
              // En 2D longitudinal, una sola línea representa el grupo (qty no crea líneas paralelas).
              // Por consistencia, la unión en el nodo interno también se dibuja una sola vez.
              const yOff = line === 1 ? 0 : -coverU;
              const yL = yTopBastonL + yOff;
              const yR = yTopBastonR + yOff;
              const yMid = Math.max(yL, yR);
              const [cxl, cyl] = toCanvas(xTopL, yL);
              const [cxm1, cym] = toCanvas(xTopL, yMid);
              const [cxm2] = toCanvas(xTopR, yMid);
              const [cxr, cyr] = toCanvas(xTopR, yR);
              ctx.beginPath();
              ctx.moveTo(Math.round(cxl) + 0.5, Math.round(cyl) + 0.5);
              ctx.lineTo(Math.round(cxm1) + 0.5, Math.round(cym) + 0.5);
              ctx.lineTo(Math.round(cxm2) + 0.5, Math.round(cym) + 0.5);
              ctx.lineTo(Math.round(cxr) + 0.5, Math.round(cyr) + 0.5);
              ctx.stroke();

              // puntos inicio/fin (como acero corrido)
              drawEndDots(xTopL, yL, xTopR, yR, stroke);
            }
          }
        }

        // BOTTOM: continuo solo si ambos extremos son continuos y existen bastones a ambos lados
        if (botK1 === 'continuous' && botK2 === 'continuous') {
          const leftEnabled = line === 1 ? cfgBotL.l1_enabled : cfgBotL.l2_enabled;
          const rightEnabled = line === 1 ? cfgBotR.l1_enabled : cfgBotR.l2_enabled;
          if (leftEnabled && rightEnabled) {
            const l2Ok = (() => {
              if (line === 1) return true;
              const L3uL = resolvedL3u(leftSpan, cfgBotL);
              const L3uR = resolvedL3u(rightSpan, cfgBotR);
              return L3uL > bastonLcU + 1e-6 && L3uR > bastonLcU + 1e-6;
            })();
            if (l2Ok) {
              const yOff = line === 1 ? 0 : +coverU;
              const y = yBotBaston + yOff;
              const [cxl, cy] = toCanvas(xBotL, y);
              const [cxr] = toCanvas(xBotR, y);
              ctx.beginPath();
              ctx.moveTo(Math.round(cxl) + 0.5, Math.round(cy) + 0.5);
              ctx.lineTo(Math.round(cxr) + 0.5, Math.round(cy) + 0.5);
              ctx.stroke();

              // puntos inicio/fin (como acero corrido)
              drawEndDots(xBotL, y, xBotR, y, stroke);
            }
          }
        }
      }
    }
    ctx.strokeStyle = prev;
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
    const yTopL = y0 + mToUnits(dev, clampNumber(leftSpan.h ?? 0, 0)) - coverU;
    const yTopR = y0 + mToUnits(dev, clampNumber(rightSpan.h ?? 0, 0)) - coverU;

    // Bottom endpoints en el nodo: fin del tramo izq (A1) y arranque del tramo der (A2)
    const xBotL = (origins[i] ?? 0) + mToUnits(dev, clampNumber(node.a1 ?? 0, 0));
    const xBotR = (origins[i] ?? 0) + mToUnits(dev, clampNumber(node.a2 ?? 0, 0));
    const yBot = y0 + coverU;

    const topK1 = nodeSteelKind(node, 'top', 1);
    const topK2 = nodeSteelKind(node, 'top', 2);
    const botK1 = nodeSteelKind(node, 'bottom', 1);
    const botK2 = nodeSteelKind(node, 'bottom', 2);

    const topToFace1 = nodeToFaceEnabled(node, 'top', 1);
    const topToFace2 = nodeToFaceEnabled(node, 'top', 2);
    const botToFace1 = nodeToFaceEnabled(node, 'bottom', 1);
    const botToFace2 = nodeToFaceEnabled(node, 'bottom', 2);

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
    if (topK1 === 'hook')
      drawHookOrAnchorage(xTopL, yTopL, +1, leftSpan.steel_top?.diameter ?? '3/4', 'hook', 'top', topToFace1 ? xTopR : undefined);
    if (topK1 === 'development')
      drawHookOrAnchorage(xTopL, yTopL, +1, leftSpan.steel_top?.diameter ?? '3/4', 'anchorage', 'top', topToFace1 ? xTopR : undefined, (node as any).steel_top_1_anchorage_length);

    // Top: N.i.2 (cara derecha) -> hacia -X, usa diámetro del tramo derecho
    if (topK2 === 'hook')
      drawHookOrAnchorage(xTopR, yTopR, -1, rightSpan.steel_top?.diameter ?? '3/4', 'hook', 'top', topToFace2 ? xTopL : undefined);
    if (topK2 === 'development')
      drawHookOrAnchorage(xTopR, yTopR, -1, rightSpan.steel_top?.diameter ?? '3/4', 'anchorage', 'top', topToFace2 ? xTopL : undefined, (node as any).steel_top_2_anchorage_length);

    if (botK1 === 'continuous' && botK2 === 'continuous') {
      const [cxl, cy] = toCanvas(xBotL, yBot);
      const [cxr] = toCanvas(xBotR, yBot);
      ctx.beginPath();
      ctx.moveTo(Math.round(cxl) + 0.5, Math.round(cy) + 0.5);
      ctx.lineTo(Math.round(cxr) + 0.5, Math.round(cy) + 0.5);
      ctx.stroke();
    }

    // Bottom: N.i.1 (cara izquierda) -> hacia +X, usa diámetro del tramo izquierdo
    if (botK1 === 'hook')
      drawHookOrAnchorage(
        xBotL,
        yBot,
        +1,
        leftSpan.steel_bottom?.diameter ?? '3/4',
        'hook',
        'bottom',
        botToFace1 ? xBotR : undefined
      );
    if (botK1 === 'development')
      drawHookOrAnchorage(
        xBotL,
        yBot,
        +1,
        leftSpan.steel_bottom?.diameter ?? '3/4',
        'anchorage',
        'bottom',
        botToFace1 ? xBotR : undefined,
        (node as any).steel_bottom_1_anchorage_length
      );

    // Bottom: N.i.2 (cara derecha) -> hacia -X, usa diámetro del tramo derecho
    if (botK2 === 'hook')
      drawHookOrAnchorage(
        xBotR,
        yBot,
        -1,
        rightSpan.steel_bottom?.diameter ?? '3/4',
        'hook',
        'bottom',
        botToFace2 ? xBotL : undefined
      );
    if (botK2 === 'development')
      drawHookOrAnchorage(
        xBotR,
        yBot,
        -1,
        rightSpan.steel_bottom?.diameter ?? '3/4',
        'anchorage',
        'bottom',
        botToFace2 ? xBotL : undefined,
        (node as any).steel_bottom_2_anchorage_length
      );
  }

  // Extremos: nodo inicial (solo *.2) y nodo final (solo *.1)
  if (nodes.length >= 2 && spans.length >= 1) {
    // Nodo 1.2 (cara derecha del nodo 1) -> hacia -X, usa tramo 0
    {
      const n0 = nodes[0];
      const s0 = spans[0];
      const h0 = mToUnits(dev, clampNumber(s0.h ?? 0, 0));
      const xTop = (origins[0] ?? 0) + mToUnits(dev, clampNumber(n0.b2 ?? 0, 0));
      const yTop = y0 + h0 - coverU;
      const xBot = (origins[0] ?? 0) + mToUnits(dev, clampNumber(n0.a2 ?? 0, 0));
      const yBot2 = y0 + coverU;
      const kTop = nodeSteelKind(n0, 'top', 2);
      const kBot = nodeSteelKind(n0, 'bottom', 2);
      const xTopFace = (origins[0] ?? 0) + mToUnits(dev, clampNumber(n0.b1 ?? 0, 0));
      const xBotFace = (origins[0] ?? 0) + mToUnits(dev, clampNumber(n0.a1 ?? 0, 0));
      const topToFace = nodeToFaceEnabled(n0, 'top', 2);
      const botToFace = nodeToFaceEnabled(n0, 'bottom', 2);
      if (kTop === 'hook')
        drawHookOrAnchorage(xTop, yTop, -1, s0.steel_top?.diameter ?? '3/4', 'hook', 'top', topToFace ? xTopFace : undefined);
      if (kTop === 'development')
        drawHookOrAnchorage(
          xTop,
          yTop,
          -1,
          s0.steel_top?.diameter ?? '3/4',
          'anchorage',
          'top',
          topToFace ? xTopFace : undefined,
          (n0 as any).steel_top_2_anchorage_length
        );
      if (kBot === 'hook')
        drawHookOrAnchorage(
          xBot,
          yBot2,
          -1,
          s0.steel_bottom?.diameter ?? '3/4',
          'hook',
          'bottom',
          botToFace ? xBotFace : undefined
        );
      if (kBot === 'development')
        drawHookOrAnchorage(
          xBot,
          yBot2,
          -1,
          s0.steel_bottom?.diameter ?? '3/4',
          'anchorage',
          'bottom',
          botToFace ? xBotFace : undefined,
          (n0 as any).steel_bottom_2_anchorage_length
        );
    }

    // Nodo n.1 (cara izquierda del último nodo) -> hacia +X, usa último tramo
    {
      const lastNodeIdx = nodes.length - 1;
      const lastSpanIdx = spans.length - 1;
      const nn = nodes[lastNodeIdx];
      const ss = spans[lastSpanIdx];
      const hh = mToUnits(dev, clampNumber(ss.h ?? 0, 0));
      const xTop = (origins[lastNodeIdx] ?? 0) + mToUnits(dev, clampNumber(nn.b1 ?? 0, 0));
      const yTop = y0 + hh - coverU;
      const xBot = (origins[lastNodeIdx] ?? 0) + mToUnits(dev, clampNumber(nn.a1 ?? 0, 0));
      const yBot2 = y0 + coverU;
      const kTop = nodeSteelKind(nn, 'top', 1);
      const kBot = nodeSteelKind(nn, 'bottom', 1);
      const xTopFace = (origins[lastNodeIdx] ?? 0) + mToUnits(dev, clampNumber(nn.b2 ?? 0, 0));
      const xBotFace = (origins[lastNodeIdx] ?? 0) + mToUnits(dev, clampNumber(nn.a2 ?? 0, 0));
      const topToFace = nodeToFaceEnabled(nn, 'top', 1);
      const botToFace = nodeToFaceEnabled(nn, 'bottom', 1);
      if (kTop === 'hook')
        drawHookOrAnchorage(xTop, yTop, +1, ss.steel_top?.diameter ?? '3/4', 'hook', 'top', topToFace ? xTopFace : undefined);
      if (kTop === 'development')
        drawHookOrAnchorage(
          xTop,
          yTop,
          +1,
          ss.steel_top?.diameter ?? '3/4',
          'anchorage',
          'top',
          topToFace ? xTopFace : undefined,
          (nn as any).steel_top_1_anchorage_length
        );
      if (kBot === 'hook')
        drawHookOrAnchorage(
          xBot,
          yBot2,
          +1,
          ss.steel_bottom?.diameter ?? '3/4',
          'hook',
          'bottom',
          botToFace ? xBotFace : undefined
        );
      if (kBot === 'development')
        drawHookOrAnchorage(
          xBot,
          yBot2,
          +1,
          ss.steel_bottom?.diameter ?? '3/4',
          'anchorage',
          'bottom',
          botToFace ? xBotFace : undefined,
          (nn as any).steel_bottom_1_anchorage_length
        );
    }
  }

  ctx.restore();
}

function drawCrossbeamsOverlay(
  canvas: HTMLCanvasElement,
  dev: DevelopmentIn,
  renderBounds: Bounds,
  opts?: { yScale?: number }
) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const crossbeams = (dev as any).crossbeams || [];
  if (crossbeams.length === 0) return;

  const yScale = opts?.yScale ?? 1;

  const rect = canvas.getBoundingClientRect();
  const cssW = Math.max(1, Math.round(rect.width));
  const cssH = Math.max(1, Math.round(rect.height));
  const dpr = Math.min(window.devicePixelRatio || 1, 2);

  ctx.save();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const { toCanvas: toCanvasBase } = canvasMapper(renderBounds, cssW, cssH);
  const toCanvas = (x: number, y: number): [number, number] => {
    const [cx, cy] = toCanvasBase(x, y);
    if (yScale === 1) return [cx, cy];
    const midY = cssH / 2;
    return [cx, midY + (cy - midY) * yScale];
  };

  const y0 = mToUnits(dev, (dev as any).y0 ?? 0);

  ctx.strokeStyle = 'rgba(139, 92, 246, 0.8)';  // Purple
  ctx.fillStyle = 'rgba(139, 92, 246, 0.15)';    // Light purple fill
  ctx.lineWidth = 2;

  for (const cb of crossbeams) {
    try {
      const x_u = mToUnits(dev, cb.x);
      const b_u = mToUnits(dev, cb.b);
      const h_u = mToUnits(dev, cb.h);

      // El ancho (b) se extiende en dirección X, centrado en x_u
      const half_b = b_u / 2.0;
      const y_bottom = y0;
      const y_top = y0 + h_u;

      // Cuatro esquinas del rectángulo
      const [px1, py1] = toCanvas(x_u - half_b, y_bottom);
      const [px2, py2] = toCanvas(x_u + half_b, y_bottom);
      const [px3, py3] = toCanvas(x_u + half_b, y_top);
      const [px4, py4] = toCanvas(x_u - half_b, y_top);

      // Dibujar rectángulo
      ctx.beginPath();
      ctx.moveTo(px1, py1);
      ctx.lineTo(px2, py2);
      ctx.lineTo(px3, py3);
      ctx.lineTo(px4, py4);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    } catch (e) {
      console.warn('Error dibujando viga transversal en 2D:', e);
    }
  }

  ctx.restore();
}

export default function App() {
  const [tab, setTab] = useState<Tab>('concreto');
  const [previewView, setPreviewView] = useState<PreviewView>('2d');
  const [showLongitudinal, setShowLongitudinal] = useState(true);
  const [showStirrups, setShowStirrups] = useState(true);
  const [steelYScale2, setSteelYScale2] = useState(false);
  const [threeOpacity, setThreeOpacity] = useState(20);
  const [steelViewPinned, setSteelViewPinned] = useState(false);
  const [selection, setSelection] = useState<Selection>({ kind: 'none' });
  const [detailViewport, setDetailViewport] = useState<Bounds | null>(null);
  const tabRef = useRef<Tab>(tab);
  const detailViewportRef = useRef<Bounds | null>(detailViewport);

  const steelViewActive = tab === 'acero' || steelViewPinned;
  const [steelOverlayLayer, setSteelOverlayLayer] = useState<SteelOverlayLayer | null>(null);

  useEffect(() => {
    // Una vez que el usuario entra a Acero, mantener esa vista activa aunque cambie
    // el tab del editor (Config/Concreto/JSON).
    if (tab === 'acero') setSteelViewPinned(true);
  }, [tab]);

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
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'error' | null>(null);
  const [concretoLocked, setConcretoLocked] = useState(false);

  const [defaultPref, setDefaultPref] = useState<DefaultPreferenceId>(() => {
    const saved = safeGetLocalStorage(DEFAULT_PREF_KEY);
    const pref = parseDefaultPref(saved);
    // Si no había nada guardado, guardar 'basico' como predeterminado
    if (!saved) {
      safeSetLocalStorage(DEFAULT_PREF_KEY, 'basico');
    }
    return pref;
  });
  const [editorOpen, setEditorOpen] = useState(false);

  // Config global desde backend (fuente de verdad)
  const [backendCfg, setBackendCfg] = useState<BackendAppConfig | null>(null);
  const hookLegM = backendCfg?.hook_leg_m ?? 0.15;
  const [hookLegDraft, setHookLegDraft] = useState<string>('0.15');

  const [steelTextLayerDraft, setSteelTextLayerDraft] = useState<string>('');
  const [steelTextStyleDraft, setSteelTextStyleDraft] = useState<string>('');
  const [steelTextHeightDraft, setSteelTextHeightDraft] = useState<string>('');
  const [steelTextWidthDraft, setSteelTextWidthDraft] = useState<string>('');
  const [steelTextObliqueDraft, setSteelTextObliqueDraft] = useState<string>('');
  const [steelTextRotationDraft, setSteelTextRotationDraft] = useState<string>('');

  // Proyección de losa (config backend)
  const [slabProjOffsetDraft, setSlabProjOffsetDraft] = useState<string>('0.20');
  const [slabProjLayerDraft, setSlabProjLayerDraft] = useState<string>('-- SECCION CORTE');

  const [templateName, setTemplateName] = useState<string | null>(null);
  const [templateLayers, setTemplateLayers] = useState<string[]>([]);
  const [cascoLayer, setCascoLayer] = useState<string>('-- SECCION CORTE');
  const [steelLayer, setSteelLayer] = useState<string>('FIERRO');
  const [drawSteel, setDrawSteel] = useState<boolean>(true);

  // Sección (verificación a lo largo del desarrollo)
  const sectionCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [sectionXU, setSectionXU] = useState<number>(0);
  const [savedCuts, setSavedCuts] = useState<Array<{ xU: number }>>([]);

  // Layout de acero en sección (E.060). Editable en UI, con fallback auto.
  const [steelLayoutDraft, setSteelLayoutDraft] = useState<string>('');
  const steelLayoutDraftDirtyRef = useRef(false);

  // Bastones: edición libre en inputs + normalización al salir (0.05m, 2 decimales)
  const [bastonLenEdits, setBastonLenEdits] = useState<Record<string, string>>({});

  // Estribos ABCR: edición por campo (mantener string mientras se escribe)
  const [stirrupsAbcrEdits, setStirrupsAbcrEdits] = useState<Record<string, string>>({});
  const snapBastonM = snap05m;
  const fmt2 = (v: number) => (Number.isFinite(v) ? v.toFixed(2) : '');

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const overviewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const previewDrawRafRef = useRef<number | null>(null);
  const previewOverlayRafRef = useRef<number | null>(null);
  const [previewCanvasResizeTick, setPreviewCanvasResizeTick] = useState(0);

  const overviewPreviewDrawRafRef = useRef<number | null>(null);
  const overviewPreviewOverlayRafRef = useRef<number | null>(null);
  const [overviewCanvasResizeTick, setOverviewCanvasResizeTick] = useState(0);

  const threeHostRef = useRef<HTMLDivElement | null>(null);
  const threeRef = useRef<ThreeSceneState | null>(null);
  const threeOverviewHostRef = useRef<HTMLDivElement | null>(null);
  const threeOverviewRef = useRef<ThreeSceneState | null>(null);
  const [threeProjection, setThreeProjection] = useState<ThreeProjection>('perspective');

  const spansCols = (dev.spans ?? []).length;
  const nodesCols = (dev.nodes ?? []).length;

  useEffect(() => {
    safeSetLocalStorage(DEFAULT_PREF_KEY, defaultPref);
  }, [defaultPref]);

  const applyBasicoPreference = () => {
    // Verificar si hay geometría existente ANTES de modificar cualquier estado
    const hasExistingGeometry = (dev.nodes ?? []).length > 0 || (dev.spans ?? []).length > 0;

    if (!hasExistingGeometry) {
      // Si NO hay geometría existente, configurar parámetros por defecto
      setAppCfg((p) => ({
        ...p,
        d: 0.25,
        unit_scale: 2,
        x0: 0,
        y0: 0,
        recubrimiento: 0.04,
        baston_Lc: 0.45,
      }));
      setHookLegDraft('0.15');
      setSlabProjOffsetDraft('0.20');
      setSlabProjLayerDraft('-- SECCION CORTE');
      setCascoLayer('-- SECCION CORTE');
      setSteelLayer('FIERRO');
      // No hay geometría, salir
      return;
    }

    // Si hay geometría existente, SOLO actualizar configuración de acero
    // NO modificar appCfg para preservar la geometría
    setDev((prev) => {
      const currentNodes = prev.nodes ?? [];
      const currentSpans = prev.spans ?? [];
      if (currentNodes.length === 0) return prev;

      // Aplicar configuración a nodos (ganchos, anclajes 75cm/60cm)
      const updatedNodes = applyBasicPreferenceToNodes([...currentNodes]);

      // Aplicar configuración a spans (acero corrido 2Ø5/8")
      const updatedSpans = applyBasicPreferenceToSpans([...currentSpans]);

      // Retornar sin normalizar para no afectar la geometría
      return { ...prev, nodes: updatedNodes, spans: updatedSpans };
    });
  };

  const applyBasicoBastonesPreference = () => {
    const hasExistingGeometry = (dev.nodes ?? []).length > 0 || (dev.spans ?? []).length > 0;

    if (!hasExistingGeometry) {
      // Mismos defaults globales que Pref 01
      setAppCfg((p) => ({
        ...p,
        d: 0.25,
        unit_scale: 2,
        x0: 0,
        y0: 0,
        recubrimiento: 0.04,
        baston_Lc: 0.45,
      }));
      setHookLegDraft('0.15');
      setSlabProjOffsetDraft('0.20');
      setSlabProjLayerDraft('-- SECCION CORTE');
      setCascoLayer('-- SECCION CORTE');
      setSteelLayer('FIERRO');
      return;
    }

    setDev((prev) => {
      const currentNodes = prev.nodes ?? [];
      const currentSpans = prev.spans ?? [];
      if (currentNodes.length === 0) return prev;

      // Pref 02: acero corrido + bastones + nodo bastones
      const updatedNodes = applyBasicBastonesPreferenceToNodes([...currentNodes]);
      const updatedSpans = applyBasicBastonesPreferenceToSpans([...currentSpans]);

      return { ...prev, nodes: updatedNodes, spans: updatedSpans };
    });
  };

  const applyPersonalizadoPreference = (p: PersonalizadoPayloadV1 | null) => {
    if (!p) return;

    // Verificar si hay geometría existente
    const hasExistingGeometry = (dev.nodes ?? []).length > 0 || (dev.spans ?? []).length > 0;

    if (hasExistingGeometry) {
      // Si hay geometría existente, SOLO aplicar parámetros que NO afectan la geometría
      // Preservar d, unit_scale, x0, y0 para mantener la geometría intacta
      setAppCfg((prev) => ({
        ...prev,
        // NO cambiar: d, unit_scale, x0, y0 (preservan geometría)
        recubrimiento: p.appCfg.recubrimiento,
        baston_Lc: p.appCfg.baston_Lc,
      }));
    } else {
      // Si NO hay geometría, aplicar toda la configuración
      setAppCfg(p.appCfg);
      setDev(normalizeDev(p.dev, p.appCfg));
    }

    // Aplicar drafts y exportOpts (no afectan geometría)
    setHookLegDraft(p.drafts.hookLegDraft);
    setSteelTextLayerDraft(p.drafts.steelTextLayerDraft);
    setSteelTextStyleDraft(p.drafts.steelTextStyleDraft);
    setSteelTextHeightDraft(p.drafts.steelTextHeightDraft);
    setSteelTextWidthDraft(p.drafts.steelTextWidthDraft);
    setSteelTextObliqueDraft(p.drafts.steelTextObliqueDraft);
    setSteelTextRotationDraft(p.drafts.steelTextRotationDraft);
    setSlabProjOffsetDraft(p.drafts.slabProjOffsetDraft);
    setSlabProjLayerDraft(p.drafts.slabProjLayerDraft);
    setCascoLayer(p.exportOpts.cascoLayer);
    setSteelLayer(p.exportOpts.steelLayer);
    setDrawSteel(p.exportOpts.drawSteel);
  };

  const onChangeDefaultPref = (next: DefaultPreferenceId) => {
    setDefaultPref(next);
    if (next === 'basico') {
      applyBasicoPreference();
      return;
    }
    if (next === 'basico_bastones') {
      applyBasicoBastonesPreference();
      return;
    }
    const stored = readPersonalizado();
    if (stored) {
      applyPersonalizadoPreference(stored);
      return;
    }
    // Sembrar con el estado actual como “Personalizado” (sin botones extra).
    const seed: PersonalizadoPayloadV1 = {
      v: 1,
      appCfg,
      dev,
      exportOpts: { cascoLayer, steelLayer, drawSteel },
      drafts: {
        hookLegDraft,
        steelTextLayerDraft,
        steelTextStyleDraft,
        steelTextHeightDraft,
        steelTextWidthDraft,
        steelTextObliqueDraft,
        steelTextRotationDraft,
        slabProjOffsetDraft,
        slabProjLayerDraft,
      },
    };
    safeSetLocalStorage(PERSONALIZADO_KEY, JSON.stringify(seed));
  };

  useEffect(() => {
    detailViewportRef.current = detailViewport;
  }, [detailViewport]);

  // Asegurar redraw 2D cuando el canvas cambia de tamaño (evita “se queda en blanco” al cambiar tab/layout).
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let raf = 0;
    const ro = new ResizeObserver(() => {
      if (raf) window.cancelAnimationFrame(raf);
      raf = window.requestAnimationFrame(() => setPreviewCanvasResizeTick((t) => t + 1));
    });
    ro.observe(canvas);
    return () => {
      if (raf) window.cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  // Redraw overview 2D cuando cambia su tamaño.
  useEffect(() => {
    const canvas = overviewCanvasRef.current;
    if (!canvas) return;
    let raf = 0;
    const ro = new ResizeObserver(() => {
      if (raf) window.cancelAnimationFrame(raf);
      raf = window.requestAnimationFrame(() => setOverviewCanvasResizeTick((t) => t + 1));
    });
    ro.observe(canvas);
    return () => {
      if (raf) window.cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  const pan2dRef = useRef({
    active: false,
    moved: false,
    pointerId: -1,
    startX: 0,
    startY: 0,
    lastX: 0,
    lastY: 0,
  });

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

  // Por defecto, los contenedores de parámetros quedan cerrados.
  useEffect(() => {
    setEditorOpen(false);
  }, [tab]);

  // Mantener dev sincronizado con config general
  useEffect(() => {
    setDev((prev) => normalizeDev(prev, appCfg));
  }, [appCfg]);

  // Mantener editor JSON de layout sincronizado (sin pisar mientras se edita)
  useEffect(() => {
    if (steelLayoutDraftDirtyRef.current) return;
    try {
      const normalized = getSteelLayoutSettings(dev);
      setSteelLayoutDraft(toJson(normalized));
    } catch {
      // ignore
    }
  }, [(dev as any).steel_layout_settings]);

  const payloadInfo = useMemo(() => {
    const payload = toBackendPayload(dev);
    return { payload, error: null as string | null, warning: null as string | null };
  }, [dev]);

  const payload = payloadInfo.payload;

  // Payload mínimo para /preview: evita refetch cuando solo cambia acero.
  const previewPayloadInfo = useMemo(() => {
    const payload = toPreviewPayload(dev);
    const key = JSON.stringify(payload);
    return { payload, key };
  }, [dev]);

  // Mantener JSON sincronizado con formulario sin pisarlo al cambiar pestañas.
  useEffect(() => {
    if (tabRef.current === 'json') return;
    setJsonText(toJson(payload));
  }, [payload]);

  // Cargar estado persistido (si existe backend/DB). Ignora fallos.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      let loaded = false;
      try {
        const stored = await fetchState();
        if (cancelled) return;
        if (stored?.developments?.length) {
          loaded = true;
          const incoming = stored.developments[0];
          const nextCfg: AppConfig = {
            d: clampNumber(incoming.d ?? DEFAULT_APP_CFG.d, DEFAULT_APP_CFG.d),
            unit_scale: clampNumber(incoming.unit_scale ?? DEFAULT_APP_CFG.unit_scale, DEFAULT_APP_CFG.unit_scale),
            x0: clampNumber(incoming.x0 ?? DEFAULT_APP_CFG.x0, DEFAULT_APP_CFG.x0),
            y0: clampNumber(incoming.y0 ?? DEFAULT_APP_CFG.y0, DEFAULT_APP_CFG.y0),
            recubrimiento: clampNumber(
              (incoming as any).recubrimiento
                ?? (incoming as any).steel_cover_top
                ?? (incoming as any).steel_cover_bottom
                ?? DEFAULT_APP_CFG.recubrimiento,
              DEFAULT_APP_CFG.recubrimiento
            ),
            baston_Lc: clampNumber(
              (incoming as any).baston_Lc ?? (incoming as any).bastonLc ?? DEFAULT_APP_CFG.baston_Lc,
              DEFAULT_APP_CFG.baston_Lc
            ),
          };
          setAppCfg(nextCfg);

          // Aplicar preferencia ANTES de normalizar
          let finalIncoming = incoming;
          if (defaultPref === 'basico' || defaultPref === 'basico_bastones') {
            const applyNodes = defaultPref === 'basico_bastones' ? applyBasicBastonesPreferenceToNodes : applyBasicPreferenceToNodes;
            const applySpans = defaultPref === 'basico_bastones' ? applyBasicBastonesPreferenceToSpans : applyBasicPreferenceToSpans;
            const updatedNodes = incoming.nodes && incoming.nodes.length > 0
              ? applyNodes([...incoming.nodes])
              : incoming.nodes;
            const updatedSpans = incoming.spans && incoming.spans.length > 0
              ? applySpans([...incoming.spans])
              : incoming.spans;
            finalIncoming = { ...incoming, nodes: updatedNodes, spans: updatedSpans };
          }

          setDev(normalizeDev(finalIncoming, nextCfg));
          setJsonText(toJson(stored));
        }
      } catch {
        // ignore
      } finally {
        if (cancelled) return;
        if (loaded) return;
        // Si no hay estado persistido, aplicar preferencia por defecto.
        if (defaultPref === 'basico_bastones') {
          applyBasicoBastonesPreference();
        } else if (defaultPref === 'basico') {
          applyBasicoPreference();
        } else {
          applyPersonalizadoPreference(readPersonalizado());
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // Auto-guardar preferencia “Personalizado” (debounced) para usarla como default.
  useEffect(() => {
    if (defaultPref !== 'personalizado') return;

    const t = window.setTimeout(() => {
      const out: PersonalizadoPayloadV1 = {
        v: 1,
        appCfg,
        dev,
        exportOpts: { cascoLayer, steelLayer, drawSteel },
        drafts: {
          hookLegDraft,
          steelTextLayerDraft,
          steelTextStyleDraft,
          steelTextHeightDraft,
          steelTextWidthDraft,
          steelTextObliqueDraft,
          steelTextRotationDraft,
          slabProjOffsetDraft,
          slabProjLayerDraft,
        },
      };
      safeSetLocalStorage(PERSONALIZADO_KEY, JSON.stringify(out));
    }, 600);

    return () => window.clearTimeout(t);
  }, [
    defaultPref,
    appCfg,
    dev,
    cascoLayer,
    steelLayer,
    drawSteel,
    hookLegDraft,
    steelTextLayerDraft,
    steelTextStyleDraft,
    steelTextHeightDraft,
    steelTextWidthDraft,
    steelTextObliqueDraft,
    steelTextRotationDraft,
    slabProjOffsetDraft,
    slabProjLayerDraft,
  ]);

  // Intentar cargar info de plantilla si ya existe en backend.
  useEffect(() => {
    (async () => {
      try {
        const info = await getTemplateDxf();
        setTemplateName(info.filename);
        setTemplateLayers(info.layers ?? []);
      } catch {
        // ignore
      }
    })();
  }, []);

  // Guardar estado persistido (debounced). Ignora fallos.
  useEffect(() => {
    setSaveStatus('saving');
    const t = window.setTimeout(async () => {
      try {
        await saveState(payload);
        setSaveStatus('saved');
        // Ocultar mensaje después de 2 segundos
        setTimeout(() => setSaveStatus(null), 2000);
      } catch (err) {
        setSaveStatus('error');
        console.error('Error al guardar:', err);
        // Ocultar mensaje de error después de 4 segundos
        setTimeout(() => setSaveStatus(null), 4000);
      }
    }, 600);
    return () => window.clearTimeout(t);
  }, [payload]);

  // Cargar config global (gancho, etc). Ignora fallos.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const cfg = await fetchConfig();
        if (cancelled) return;
        if (cfg && typeof cfg.hook_leg_m === 'number' && Number.isFinite(cfg.hook_leg_m)) setBackendCfg(cfg);
      } catch {
        // ignore
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (backendCfg && typeof backendCfg.hook_leg_m === 'number' && Number.isFinite(backendCfg.hook_leg_m)) {
      setHookLegDraft(String(backendCfg.hook_leg_m));
    }
  }, [backendCfg?.hook_leg_m]);

  // Sync drafts desde backend (vacío = null => usar plantilla)
  useEffect(() => {
    if (!backendCfg) return;
    setSteelTextLayerDraft(String(backendCfg?.steel_text_layer ?? ''));
    setSteelTextStyleDraft(String(backendCfg?.steel_text_style ?? ''));
    setSteelTextHeightDraft(backendCfg?.steel_text_height == null ? '' : String(backendCfg.steel_text_height));
    setSteelTextWidthDraft(backendCfg?.steel_text_width == null ? '' : String(backendCfg.steel_text_width));
    setSteelTextObliqueDraft(backendCfg?.steel_text_oblique == null ? '' : String(backendCfg.steel_text_oblique));
    setSteelTextRotationDraft(backendCfg?.steel_text_rotation == null ? '' : String(backendCfg.steel_text_rotation));

    // Proyección de losa
    setSlabProjOffsetDraft(String(backendCfg?.slab_proj_offset_m ?? 0.2));
    setSlabProjLayerDraft(String(backendCfg?.slab_proj_layer ?? ''));
  }, [
    backendCfg?.steel_text_layer,
    backendCfg?.steel_text_style,
    backendCfg?.steel_text_height,
    backendCfg?.steel_text_width,
    backendCfg?.steel_text_oblique,
    backendCfg?.steel_text_rotation,
    backendCfg?.slab_proj_offset_m,
    backendCfg?.slab_proj_layer,
  ]);

  // Autosave (debounced) al modificar L6 gancho en Config.
  useDebounce(
    hookLegDraft,
    500,
    async (draft) => {
      if (!backendCfg) return;
      const current = backendCfg.hook_leg_m;
      const next = clampNumber(draft, current ?? 0.15);
      if (!Number.isFinite(next) || !Number.isFinite(current)) return;
      if (Math.abs(next - current) < 1e-9) return;

      const cfg = await updateConfig({ hook_leg_m: next });
      setBackendCfg(cfg);
    }
  );

  // Autosave (debounced) al modificar formato de texto de acero.
  useDebounce(
    {
      layer: steelTextLayerDraft,
      style: steelTextStyleDraft,
      height: steelTextHeightDraft,
      width: steelTextWidthDraft,
      oblique: steelTextObliqueDraft,
      rotation: steelTextRotationDraft,
    },
    500,
    async (drafts) => {
      if (!backendCfg) return;

      const normText = (v: string) => {
        const s = String(v ?? '').trim();
        return s ? s : null;
      };
      const normNum = (v: string) => {
        const n = Number.parseFloat(String(v ?? '').trim());
        return Number.isFinite(n) ? n : null;
      };

      const patch: Partial<BackendAppConfig> = {};
      const nextLayer = normText(drafts.layer);
      const nextStyle = normText(drafts.style);
      const nextHeight = normNum(drafts.height);
      const nextWidth = normNum(drafts.width);
      const nextOblique = normNum(drafts.oblique);
      const nextRotation = normNum(drafts.rotation);

      if ((backendCfg.steel_text_layer ?? null) !== nextLayer) patch.steel_text_layer = nextLayer;
      if ((backendCfg.steel_text_style ?? null) !== nextStyle) patch.steel_text_style = nextStyle;
      if ((backendCfg.steel_text_height ?? null) !== nextHeight) patch.steel_text_height = nextHeight;
      if ((backendCfg.steel_text_width ?? null) !== nextWidth) patch.steel_text_width = nextWidth;
      if ((backendCfg.steel_text_oblique ?? null) !== nextOblique) patch.steel_text_oblique = nextOblique;
      if ((backendCfg.steel_text_rotation ?? null) !== nextRotation) patch.steel_text_rotation = nextRotation;

      if (!Object.keys(patch).length) return;

      const cfg = await updateConfig(patch);
      setBackendCfg(cfg);
    }
  );

  // Autosave (debounced) al modificar proyección de losa.
  useDebounce(
    { offset: slabProjOffsetDraft, layer: slabProjLayerDraft },
    500,
    async (drafts) => {
      if (!backendCfg) return;

      const normText = (v: string) => {
        const s = String(v ?? '').trim();
        return s ? s : null;
      };

      const currentOffset = typeof backendCfg.slab_proj_offset_m === 'number' && Number.isFinite(backendCfg.slab_proj_offset_m) ? backendCfg.slab_proj_offset_m : 0.2;
      const nextOffsetRaw = Number.parseFloat(String(drafts.offset ?? '').trim().replace(',', '.'));
      const nextOffset = Number.isFinite(nextOffsetRaw) ? Math.max(0, nextOffsetRaw) : currentOffset;
      const nextLayer = normText(drafts.layer);

      const patch: Partial<BackendAppConfig> = {};
      if (Math.abs(nextOffset - currentOffset) > 1e-9) patch.slab_proj_offset_m = nextOffset;
      if ((backendCfg.slab_proj_layer ?? null) !== nextLayer) patch.slab_proj_layer = nextLayer;
      if (!Object.keys(patch).length) return;

      const cfg = await updateConfig(patch);
      setBackendCfg(cfg);
    }
  );

  // Preview
  useEffect(() => {
    let cancelled = false;

    (async () => {
      setBusy(true);
      setError(null);
      setWarning(null);
      try {
        const data = await fetchPreview(previewPayloadInfo.payload);
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
  }, [previewPayloadInfo.key]);

  // Render del canvas (sin refetch) para que el toggle N/T responda inmediato
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (previewDrawRafRef.current != null) {
      window.cancelAnimationFrame(previewDrawRafRef.current);
      previewDrawRafRef.current = null;
    }
    if (previewOverlayRafRef.current != null) {
      window.cancelAnimationFrame(previewOverlayRafRef.current);
      previewOverlayRafRef.current = null;
    }

    const rect = canvas.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) return;

    previewDrawRafRef.current = window.requestAnimationFrame(() => {
      const renderBounds = (detailViewport ?? (preview?.bounds as Bounds | undefined)) ?? null;
      const yScale = steelViewActive && steelYScale2 ? 2 : 1;
      drawPreview(canvas, preview, renderBounds, { yScale });
      // En la Vista con zoom NO se colorea la selección (solo en Vista general).

      const dev0 = previewPayloadInfo.payload.developments?.[0];
      if (preview && dev0 && showNT && renderBounds) drawLabels(canvas, preview, dev0, renderBounds, { yScale });

      // Dibujar vigas transversales
      if (dev && renderBounds) {
        try {
          drawCrossbeamsOverlay(canvas, dev, renderBounds, { yScale });
        } catch (e) {
          console.warn('Error dibujando vigas transversales en 2D:', e);
        }
      }

      // Dibujar acero en un segundo frame para evitar bloquear la primera pintura.
      if (preview && renderBounds && steelViewActive && (showLongitudinal || showStirrups)) {
        previewOverlayRafRef.current = window.requestAnimationFrame(() => {
          try {
            // Vista de acero activa (pestaña Acero o anclada): dibujar overlay 2D.
            if (showLongitudinal || showStirrups) {
              drawSteelOverlay(canvas, preview, dev, renderBounds, appCfg.recubrimiento, hookLegM, {
                showLongitudinal,
                showStirrups,
                yScale: steelViewActive && steelYScale2 ? 2 : 1,
              });
            }
          } catch (e) {
            console.warn('Error dibujando overlay 2D de acero', e);
          }
        });
      }
    });

    return () => {
      if (previewDrawRafRef.current != null) {
        window.cancelAnimationFrame(previewDrawRafRef.current);
        previewDrawRafRef.current = null;
      }
      if (previewOverlayRafRef.current != null) {
        window.cancelAnimationFrame(previewOverlayRafRef.current);
        previewOverlayRafRef.current = null;
      }
    };
  }, [
    preview,
    showNT,
    selection,
    detailViewport,
    dev,
    tab,
    steelViewPinned,
    appCfg.recubrimiento,
    hookLegM,
    sectionXU,
    showLongitudinal,
    showStirrups,
    steelYScale2,
    previewPayloadInfo.key,
    previewCanvasResizeTick,
  ]);

  // Render del canvas overview (estático: siempre bounds completos)
  useEffect(() => {
    const canvas = overviewCanvasRef.current;
    if (!canvas) return;
    if (overviewPreviewDrawRafRef.current != null) {
      window.cancelAnimationFrame(overviewPreviewDrawRafRef.current);
      overviewPreviewDrawRafRef.current = null;
    }
    if (overviewPreviewOverlayRafRef.current != null) {
      window.cancelAnimationFrame(overviewPreviewOverlayRafRef.current);
      overviewPreviewOverlayRafRef.current = null;
    }

    const rect = canvas.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) return;

    overviewPreviewDrawRafRef.current = window.requestAnimationFrame(() => {
      const renderBounds = (preview?.bounds as Bounds | undefined) ?? null;
      drawPreview(canvas, preview, renderBounds);
      if (preview && renderBounds) drawSelectionOverlay(canvas, preview, dev, selection, renderBounds);

      const dev0 = previewPayloadInfo.payload.developments?.[0];
      if (preview && dev0 && showNT && renderBounds) drawLabels(canvas, preview, dev0, renderBounds);

      // La línea de corte se visualiza solo en la Vista general.
      if (steelViewActive && preview && renderBounds) {
        drawCutMarker2D(canvas, preview, renderBounds, sectionXU);
      }
    });

    return () => {
      if (overviewPreviewDrawRafRef.current != null) {
        window.cancelAnimationFrame(overviewPreviewDrawRafRef.current);
        overviewPreviewDrawRafRef.current = null;
      }
      if (overviewPreviewOverlayRafRef.current != null) {
        window.cancelAnimationFrame(overviewPreviewOverlayRafRef.current);
        overviewPreviewOverlayRafRef.current = null;
      }
    };
  }, [
    preview,
    showNT,
    selection,
    dev,
    tab,
    steelViewPinned,
    sectionXU,
    previewPayloadInfo.key,
    overviewCanvasResizeTick,
  ]);

  // Rango X del desarrollo en unidades (considera top y bottom, igual que overlay)
  const sectionXRangeU = useMemo(() => {
    const spans = dev.spans ?? [];
    const nodes = dev.nodes ?? [];
    const origins = computeNodeOrigins(dev);
    const marginU = mToUnits(dev, 0.50);
    let xmin = Number.POSITIVE_INFINITY;
    let xmax = Number.NEGATIVE_INFINITY;
    for (let i = 0; i < spans.length; i++) {
      const span = spans[i];
      const Lm = clampNumber(span?.L ?? 0, 0);
      if (!span || !(Lm > 0)) continue;

      const a2_i = mToUnits(dev, clampNumber(nodes[i]?.a2 ?? 0, 0));
      const xFaceLeft = (origins[i] ?? 0) + a2_i;
      const xFaceRight = xFaceLeft + mToUnits(dev, Lm);

      // Solo rango válido dentro del tramo (0.50m desde cada apoyo)
      const xStart = xFaceLeft + marginU;
      const xEnd = xFaceRight - marginU;
      if (xEnd > xStart + 1e-6) {
        xmin = Math.min(xmin, xStart);
        xmax = Math.max(xmax, xEnd);
      }
    }

    if (!Number.isFinite(xmin) || !Number.isFinite(xmax) || !(xmax > xmin)) {
      const x0 = clampNumber(dev.x0 ?? 0, 0);
      return { xmin: x0, xmax: x0 + mToUnits(dev, 1) };
    }
    return { xmin, xmax };
  }, [dev]);

  const sectionInfo = useMemo(() => {
    const spans = dev.spans ?? [];
    const si = spans.length ? Math.max(0, Math.min(spanIndexAtX(dev, sectionXU), spans.length - 1)) : 0;
    const xm = sectionXU / (dev.unit_scale ?? 2);
    return { spanIndex: si, x_m: xm };
  }, [dev, sectionXU]);

  // Corte A: siempre en el X con mayor cantidad de varillas longitudinales de acero corrido.
  // (Se mantiene como primer elemento de savedCuts y no debe desaparecer.)
  const defaultCutAXU = useMemo(() => {
    const spans = dev.spans ?? [];
    const nodes = dev.nodes ?? [];
    const origins = computeNodeOrigins(dev);

    const rangeMid = (sectionXRangeU.xmin + sectionXRangeU.xmax) / 2;
    const coverM = clampNumber((dev as any).recubrimiento ?? appCfg.recubrimiento ?? 0.04, 0.04);
    const bastonLcU = mToUnits(dev, clampNumber((dev as any).baston_Lc ?? 0.5, 0.5));

    const resolvedLenM = (span: any, cfg: BastonCfg, field: 'L1_m' | 'L2_m' | 'L3_m', fallbackM: number) => {
      const v = (cfg as any)[field];
      const n = typeof v === 'number' ? v : NaN;
      const out = Number.isFinite(n) && n > 0 ? n : fallbackM;
      const snapped = snap05m(out);
      return Math.min(clampNumber(span?.L ?? 0, 0), Math.max(0, snapped));
    };

    const getBastonCfg = (span: any, side: 'top' | 'bottom', zone: 'z1' | 'z2' | 'z3'): BastonCfg => {
      const b = (span as any)?.bastones ?? {};
      const s = (side === 'top' ? b.top : b.bottom) ?? {};
      const z = (s as any)[zone] ?? {};
      return normalizeBastonCfg(z);
    };

    const activeBastonCountsAtX = (spanIndex: number, span: any, xU: number, side: 'top' | 'bottom') => {
      const Lm = clampNumber(span?.L ?? 0, 0);
      const defaultLenM = Lm / 5;
      const defaultL3M = Lm / 3;

      const a2_i = mToUnits(dev, clampNumber(nodes[spanIndex]?.a2 ?? 0, 0));
      const xBot0 = (origins[spanIndex] ?? 0) + a2_i;
      const xBot1 = xBot0 + mToUnits(dev, Lm);

      const b2_i = mToUnits(dev, clampNumber(nodes[spanIndex]?.b2 ?? 0, 0));
      const b1_ip1 = mToUnits(dev, clampNumber(nodes[spanIndex + 1]?.b1 ?? 0, 0));
      const xTop0 = (origins[spanIndex] ?? 0) + b2_i;
      const xTop1 = (origins[spanIndex + 1] ?? 0) + b1_ip1;

      const xa = side === 'top' ? Math.min(xTop0, xTop1) : Math.min(xBot0, xBot1);
      const xb = side === 'top' ? Math.max(xTop0, xTop1) : Math.max(xBot0, xBot1);
      const x = Math.min(xb, Math.max(xa, xU));
      let l1 = 0;
      let l2 = 0;

      // Z1
      {
        const cfg = getBastonCfg(span, side, 'z1');
        const q1 = Math.max(1, Math.min(3, Math.round(cfg.l1_qty ?? 1)));
        const q2 = Math.max(1, Math.min(3, Math.round(cfg.l2_qty ?? 1)));
        if (cfg.l1_enabled || cfg.l2_enabled) {
          const L3_u = mToUnits(dev, resolvedLenM(span, cfg, 'L3_m', defaultL3M));
          const x1 = Math.min(xb, xa + L3_u);
          if (cfg.l1_enabled && x >= xa && x <= x1) l1 += q1;
          const x1Inner = x1 - bastonLcU;
          if (cfg.l2_enabled && x1Inner > xa + 1e-6 && x >= xa && x <= x1Inner) l2 += q2;
        }
      }

      // Z2
      {
        const cfg = getBastonCfg(span, side, 'z2');
        const q1 = Math.max(1, Math.min(3, Math.round(cfg.l1_qty ?? 1)));
        const q2 = Math.max(1, Math.min(3, Math.round(cfg.l2_qty ?? 1)));
        if (cfg.l1_enabled || cfg.l2_enabled) {
          const L1_u = mToUnits(dev, resolvedLenM(span, cfg, 'L1_m', defaultLenM));
          const L2_u = mToUnits(dev, resolvedLenM(span, cfg, 'L2_m', defaultLenM));
          const x0 = xa + L1_u;
          const x1 = xb - L2_u;
          if (cfg.l1_enabled && x1 > x0 + 1e-6 && x >= x0 && x <= x1) l1 += q1;
          const x0Inner = x0 + bastonLcU;
          const x1Inner = x1 - bastonLcU;
          if (cfg.l2_enabled && x1Inner > x0Inner + 1e-6 && x >= x0Inner && x <= x1Inner) l2 += q2;
        }
      }

      // Z3
      {
        const cfg = getBastonCfg(span, side, 'z3');
        const q1 = Math.max(1, Math.min(3, Math.round(cfg.l1_qty ?? 1)));
        const q2 = Math.max(1, Math.min(3, Math.round(cfg.l2_qty ?? 1)));
        if (cfg.l1_enabled || cfg.l2_enabled) {
          const L3_u = mToUnits(dev, resolvedLenM(span, cfg, 'L3_m', defaultL3M));
          const x0 = Math.max(xa, xb - L3_u);
          if (cfg.l1_enabled && x >= x0 && x <= xb) l1 += q1;
          const x0Inner = x0 + bastonLcU;
          if (cfg.l2_enabled && xb > x0Inner + 1e-6 && x >= x0Inner && x <= xb) l2 += q2;
        }
      }

      return { l1: Math.max(0, l1), l2: Math.max(0, l2) };
    };

    const totalLongBarsAtX = (xU: number) => {
      if (!spans.length) return 0;
      const si = Math.max(0, Math.min(spanIndexAtX(dev, xU), spans.length - 1));
      const span: any = spans[si];
      if (!span) return 0;

      let total = 0;
      for (const face of ['top', 'bottom'] as const) {
        const res: any = computeSpanSectionLayoutWithBastonesCm({ dev, span, cover_m: coverM, face });
        if (!res?.ok) continue;

        total += (res.main_bars_cm?.length ?? 0);

        const active = activeBastonCountsAtX(si, span, xU, face);
        const l1PoolLen = (res.baston_l1_bars_cm?.length ?? 0);
        const l2PoolLen = (res.baston_l2_bars_cm?.length ?? 0);
        total += Math.min(active.l1, l1PoolLen);
        total += Math.min(active.l2, l2PoolLen);
      }

      return total;
    };

    const clampToRange = (x: number) => Math.min(sectionXRangeU.xmax, Math.max(sectionXRangeU.xmin, x));
    const addBreakpointsForFace = (out: number[], spanIndex: number, span: any, side: 'top' | 'bottom') => {
      const Lm = clampNumber(span?.L ?? 0, 0);
      if (!(Lm > 0)) return;

      const a2_i = mToUnits(dev, clampNumber(nodes[spanIndex]?.a2 ?? 0, 0));
      const xBot0 = (origins[spanIndex] ?? 0) + a2_i;
      const xBot1 = xBot0 + mToUnits(dev, Lm);

      const b2_i = mToUnits(dev, clampNumber(nodes[spanIndex]?.b2 ?? 0, 0));
      const b1_ip1 = mToUnits(dev, clampNumber(nodes[spanIndex + 1]?.b1 ?? 0, 0));
      const xTop0 = (origins[spanIndex] ?? 0) + b2_i;
      const xTop1 = (origins[spanIndex + 1] ?? 0) + b1_ip1;

      const xa = side === 'top' ? Math.min(xTop0, xTop1) : Math.min(xBot0, xBot1);
      const xb = side === 'top' ? Math.max(xTop0, xTop1) : Math.max(xBot0, xBot1);
      out.push(clampToRange(xa), clampToRange(xb));

      const defaultLenM = Lm / 5;
      const defaultL3M = Lm / 3;

      // Z1
      {
        const cfg = getBastonCfg(span, side, 'z1');
        if (cfg.l1_enabled || cfg.l2_enabled) {
          const L3_u = mToUnits(dev, resolvedLenM(span, cfg, 'L3_m', defaultL3M));
          const x1 = Math.min(xb, xa + L3_u);
          out.push(clampToRange(x1));
          out.push(clampToRange(x1 - bastonLcU));
        }
      }

      // Z2
      {
        const cfg = getBastonCfg(span, side, 'z2');
        if (cfg.l1_enabled || cfg.l2_enabled) {
          const L1_u = mToUnits(dev, resolvedLenM(span, cfg, 'L1_m', defaultLenM));
          const L2_u = mToUnits(dev, resolvedLenM(span, cfg, 'L2_m', defaultLenM));
          const x0 = xa + L1_u;
          const x1 = xb - L2_u;
          out.push(clampToRange(x0), clampToRange(x1));
          out.push(clampToRange(x0 + bastonLcU), clampToRange(x1 - bastonLcU));
        }
      }

      // Z3
      {
        const cfg = getBastonCfg(span, side, 'z3');
        if (cfg.l1_enabled || cfg.l2_enabled) {
          const L3_u = mToUnits(dev, resolvedLenM(span, cfg, 'L3_m', defaultL3M));
          const x0 = Math.max(xa, xb - L3_u);
          out.push(clampToRange(x0));
          out.push(clampToRange(x0 + bastonLcU));
        }
      }
    };

    const candidates: number[] = [];
    candidates.push(sectionXRangeU.xmin, sectionXRangeU.xmax, clampToRange(rangeMid));

    for (let i = 0; i < spans.length; i++) {
      const span: any = spans[i];
      const Lm = clampNumber(span?.L ?? 0, 0);
      if (!span || !(Lm > 0)) continue;

      const a2_i = mToUnits(dev, clampNumber(nodes[i]?.a2 ?? 0, 0));
      const xBot0 = (origins[i] ?? 0) + a2_i;
      const xBot1 = xBot0 + mToUnits(dev, Lm);
      const b2_i = mToUnits(dev, clampNumber(nodes[i]?.b2 ?? 0, 0));
      const b1_ip1 = mToUnits(dev, clampNumber(nodes[i + 1]?.b1 ?? 0, 0));
      const xTop0 = (origins[i] ?? 0) + b2_i;
      const xTop1 = (origins[i + 1] ?? 0) + b1_ip1;

      const spanLo = clampToRange(Math.min(xBot0, xBot1, xTop0, xTop1));
      const spanHi = clampToRange(Math.max(xBot0, xBot1, xTop0, xTop1));
      const spanMid = (spanLo + spanHi) / 2;
      candidates.push(spanLo, spanHi, spanMid);

      addBreakpointsForFace(candidates, i, span, 'top');
      addBreakpointsForFace(candidates, i, span, 'bottom');
    }

    const bp = uniqueSortedNumbers(candidates);
    const mids: number[] = [];
    for (let i = 0; i + 1 < bp.length; i++) {
      const a = bp[i];
      const b = bp[i + 1];
      if (!(b > a)) continue;
      mids.push((a + b) / 2);
    }

    const evals = uniqueSortedNumbers([...bp, ...mids]).map(clampToRange);
    let bestX = clampToRange(rangeMid);
    let bestN = -1;
    for (const x of evals) {
      const n = totalLongBarsAtX(x);
      if (n > bestN || (n === bestN && x < bestX)) {
        bestN = n;
        bestX = x;
      }
    }

    return Number.isFinite(bestX) ? bestX : clampToRange(rangeMid);
  }, [dev, appCfg.recubrimiento, sectionXRangeU]);

  // Center cursor when dev changes
  useEffect(() => {
    const { xmin, xmax } = sectionXRangeU;
    const mid = (xmin + xmax) / 2;
    setSectionXU(mid);
  }, [sectionXRangeU]);

  // Mantener siempre el Corte A (savedCuts[0]) en defaultCutAXU.
  useEffect(() => {
    setSavedCuts((prev) => {
      const xA = defaultCutAXU;
      if (!Number.isFinite(xA)) return prev;
      if (!prev.length) return [{ xU: xA }];
      if (Math.abs(prev[0].xU - xA) < 1e-6) return prev;
      return [{ xU: xA }, ...prev.slice(1)];
    });
  }, [defaultCutAXU]);

  // Dibuja sección para verificación (en base a sectionXU)
  useEffect(() => {
    const canvas = sectionCanvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const cssW = Math.max(1, Math.round(rect.width));
    const cssH = Math.max(1, Math.round(rect.height));
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const desiredW = Math.max(1, Math.round(cssW * dpr));
    const desiredH = Math.max(1, Math.round(cssH * dpr));
    if (canvas.width !== desiredW) canvas.width = desiredW;
    if (canvas.height !== desiredH) canvas.height = desiredH;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);

    const spans = dev.spans ?? [];
    const nodes = dev.nodes ?? [];
    if (!spans.length) {
      ctx.fillStyle = 'rgba(229,231,235,0.6)';
      ctx.font = '12px ui-monospace, Menlo, Consolas, monospace';
      ctx.fillText('Sin tramos', 12, 18);
      ctx.restore();
      return;
    }

    const origins = computeNodeOrigins(dev);
    const si = Math.max(0, Math.min(spanIndexAtX(dev, sectionXU), spans.length - 1));
    const span = spans[si];
    if (!span) {
      ctx.restore();
      return;
    }

    const coverM = clampNumber((dev as any).recubrimiento ?? appCfg.recubrimiento ?? 0.04, 0.04);
    const bCm = clampNumber((span as any).b ?? 0.3, 0.3) * 100;
    const hCm = clampNumber(span.h ?? 0.5, 0.5) * 100;
    const slabOffsetM = clampNumber(backendCfg?.slab_proj_offset_m ?? 0.2, 0.2);
    const slabOffsetCm = Math.max(0, slabOffsetM * 100);
    const yTopCm = hCm;
    const ySlabCm = Math.max(0, hCm - slabOffsetCm);
    const slabExtraCm = bCm * 0.5;
    const slabHalfZCm = bCm / 2 + slabExtraCm;

    // Determine active baston qty at X (por cara)
    const bastonLcU = mToUnits(dev, clampNumber((dev as any).baston_Lc ?? 0.5, 0.5));
    const resolvedLenM = (cfg: BastonCfg, field: 'L1_m' | 'L2_m' | 'L3_m', fallbackM: number) => {
      const v = (cfg as any)[field];
      const n = typeof v === 'number' ? v : NaN;
      const out = Number.isFinite(n) && n > 0 ? n : fallbackM;
      const snapped = snap05m(out);
      return Math.min(clampNumber(span.L ?? 0, 0), Math.max(0, snapped));
    };

    const getBastonCfg = (side: 'top' | 'bottom', zone: 'z1' | 'z2' | 'z3'): BastonCfg => {
      const b = (span as any).bastones ?? {};
      const s = (side === 'top' ? b.top : b.bottom) ?? {};
      const z = (s as any)[zone] ?? {};
      return normalizeBastonCfg(z);
    };

    const activeBastonCountsAtX = (side: 'top' | 'bottom') => {
      const Lm = clampNumber(span.L ?? 0, 0);
      const defaultLenM = Lm / 5;
      const defaultL3M = Lm / 3;

      const a2_i = mToUnits(dev, clampNumber(nodes[si]?.a2 ?? 0, 0));
      const xBot0 = (origins[si] ?? 0) + a2_i;
      const xBot1 = xBot0 + mToUnits(dev, Lm);

      const b2_i = mToUnits(dev, clampNumber(nodes[si]?.b2 ?? 0, 0));
      const b1_ip1 = mToUnits(dev, clampNumber(nodes[si + 1]?.b1 ?? 0, 0));
      const xTop0 = (origins[si] ?? 0) + b2_i;
      const xTop1 = (origins[si + 1] ?? 0) + b1_ip1;

      const xa = side === 'top' ? Math.min(xTop0, xTop1) : Math.min(xBot0, xBot1);
      const xb = side === 'top' ? Math.max(xTop0, xTop1) : Math.max(xBot0, xBot1);
      const x = Math.min(xb, Math.max(xa, sectionXU));
      let l1 = 0;
      let l2 = 0;

      // Z1
      {
        const cfg = getBastonCfg(side, 'z1');
        const q1 = Math.max(1, Math.min(3, Math.round(cfg.l1_qty ?? 1)));
        const q2 = Math.max(1, Math.min(3, Math.round(cfg.l2_qty ?? 1)));
        if (cfg.l1_enabled || cfg.l2_enabled) {
          const L3_u = mToUnits(dev, resolvedLenM(cfg, 'L3_m', defaultL3M));
          const x1 = Math.min(xb, xa + L3_u);
          if (cfg.l1_enabled && x >= xa && x <= x1) l1 += q1;
          const x1Inner = x1 - bastonLcU;
          if (cfg.l2_enabled && x1Inner > xa + 1e-6 && x >= xa && x <= x1Inner) l2 += q2;
        }
      }

      // Z2
      {
        const cfg = getBastonCfg(side, 'z2');
        const q1 = Math.max(1, Math.min(3, Math.round(cfg.l1_qty ?? 1)));
        const q2 = Math.max(1, Math.min(3, Math.round(cfg.l2_qty ?? 1)));
        if (cfg.l1_enabled || cfg.l2_enabled) {
          const L1_u = mToUnits(dev, resolvedLenM(cfg, 'L1_m', defaultLenM));
          const L2_u = mToUnits(dev, resolvedLenM(cfg, 'L2_m', defaultLenM));
          const x0 = xa + L1_u;
          const x1 = xb - L2_u;
          if (cfg.l1_enabled && x1 > x0 + 1e-6 && x >= x0 && x <= x1) l1 += q1;
          const x0Inner = x0 + bastonLcU;
          const x1Inner = x1 - bastonLcU;
          if (cfg.l2_enabled && x1Inner > x0Inner + 1e-6 && x >= x0Inner && x <= x1Inner) l2 += q2;
        }
      }

      // Z3
      {
        const cfg = getBastonCfg(side, 'z3');
        const q1 = Math.max(1, Math.min(3, Math.round(cfg.l1_qty ?? 1)));
        const q2 = Math.max(1, Math.min(3, Math.round(cfg.l2_qty ?? 1)));
        if (cfg.l1_enabled || cfg.l2_enabled) {
          const L3_u = mToUnits(dev, resolvedLenM(cfg, 'L3_m', defaultL3M));
          const x0 = Math.max(xa, xb - L3_u);
          if (cfg.l1_enabled && x >= x0 && x <= xb) l1 += q1;
          const x0Inner = x0 + bastonLcU;
          if (cfg.l2_enabled && xb > x0Inner + 1e-6 && x >= x0Inner && x <= xb) l2 += q2;
        }
      }

      return { l1: Math.max(0, l1), l2: Math.max(0, l2) };
    };

    type SteelPt = { y_cm: number; z_cm: number; db_cm: number; fill: string };
    const pts: SteelPt[] = [];

    const pushFace = (face: 'top' | 'bottom') => {
      const res = computeSpanSectionLayoutWithBastonesCm({ dev, span, cover_m: coverM, face });
      if (!res.ok) return;

      const active = activeBastonCountsAtX(face);
      const l1Pool = (res as any).baston_l1_bars_cm ?? [];
      const l2Pool = (res as any).baston_l2_bars_cm ?? [];
      const activeL1 = Math.min(active.l1, l1Pool.length);
      const activeL2 = Math.min(active.l2, l2Pool.length);
      for (const p of res.main_bars_cm) pts.push({ ...p, db_cm: res.main_db_cm, fill: 'rgba(250, 204, 21, 0.95)' });
      for (const p of l1Pool.slice(0, activeL1)) pts.push({ ...p, db_cm: res.baston_db_cm || res.main_db_cm, fill: 'rgba(34, 197, 94, 0.95)' });
      for (const p of l2Pool.slice(0, activeL2)) pts.push({ ...p, db_cm: res.baston_db_cm || res.main_db_cm, fill: 'rgba(6, 182, 212, 0.95)' });
    };

    pushFace('top');
    pushFace('bottom');

    if (!pts.length) {
      ctx.fillStyle = 'rgba(229,231,235,0.6)';
      ctx.font = '12px ui-monospace, Menlo, Consolas, monospace';
      ctx.fillText('Sin acero', 12, 18);
      ctx.restore();
      return;
    }

    let minY = Number.POSITIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    let minZ = Number.POSITIVE_INFINITY;
    let maxZ = Number.NEGATIVE_INFINITY;
    let maxRcm = 0;
    for (const p of pts) {
      minY = Math.min(minY, p.y_cm);
      maxY = Math.max(maxY, p.y_cm);
      minZ = Math.min(minZ, p.z_cm);
      maxZ = Math.max(maxZ, p.z_cm);
      maxRcm = Math.max(maxRcm, p.db_cm / 2);
    }

    // Incluir perímetro de viga y proyección de losa en el encuadre
    minY = Math.min(minY, 0, ySlabCm);
    maxY = Math.max(maxY, yTopCm);
    minZ = Math.min(minZ, -slabHalfZCm);
    maxZ = Math.max(maxZ, +slabHalfZCm);

    const pad = 18;
    const usableW = Math.max(1, cssW - pad * 2);
    const usableH = Math.max(1, cssH - pad * 2);
    const spanY = Math.max(1e-6, (maxY - minY) + 2 * maxRcm);
    const spanZ = Math.max(1e-6, (maxZ - minZ) + 2 * maxRcm);
    const scale = Math.min(usableW / spanZ, usableH / spanY);

    const yC = (minY + maxY) / 2;
    const zC = (minZ + maxZ) / 2;
    const cx = cssW / 2;
    const cy = cssH / 2;

    const toCanvas = (y_cm: number, z_cm: number) => {
      const x = cx + (z_cm - zC) * scale;
      const y = cy - (y_cm - yC) * scale;
      return [x, y] as const;
    };

    // Perímetro de viga (rectángulo)
    {
      const z0 = -bCm / 2;
      const z1 = +bCm / 2;
      const y0 = 0;
      const y1 = hCm;
      const [x00, y00] = toCanvas(y0, z0);
      const [x01, y01] = toCanvas(y1, z0);
      const [x11, y11] = toCanvas(y1, z1);
      const [x10, y10] = toCanvas(y0, z1);

      ctx.save();
      ctx.strokeStyle = 'rgba(148,163,184,0.55)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x00, y00);
      ctx.lineTo(x01, y01);
      ctx.lineTo(x11, y11);
      ctx.lineTo(x10, y10);
      ctx.closePath();
      ctx.stroke();
      ctx.restore();
    }

    // Proyección de losa (banda superior, sin relleno)
    {
      const z0 = -slabHalfZCm;
      const z1 = +slabHalfZCm;
      const y0 = ySlabCm;
      const y1 = yTopCm;
      const [x00, y00] = toCanvas(y0, z0);
      const [x01, y01] = toCanvas(y1, z0);
      const [x11, y11] = toCanvas(y1, z1);
      const [x10, y10] = toCanvas(y0, z1);

      ctx.save();
      ctx.strokeStyle = 'rgba(148,163,184,0.30)';
      ctx.lineWidth = 1;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(x00, y00);
      ctx.lineTo(x01, y01);
      ctx.lineTo(x11, y11);
      ctx.lineTo(x10, y10);
      ctx.closePath();
      ctx.stroke();
      ctx.restore();
    }

    // Estribos en sección (rectangulares concéntricos), con espesor por diámetro.
    {
      const sec = normalizeStirrupsSection((span as any).stirrups_section ?? (span as any).stirrupsSection);
      const settings = getSteelLayoutSettings(dev);
      const dbCm = diameterToCm(sec.diameter, settings);
      if (sec.qty > 0 && dbCm > 0) {
        const coverCm = coverM * 100;
        ctx.save();
        ctx.strokeStyle = 'rgba(34, 197, 94, 0.55)';
        ctx.setLineDash([]);

        for (let k = 0; k < sec.qty; k++) {
          const offCm = coverCm + (k + 0.5) * dbCm;
          const y0 = offCm;
          const y1 = hCm - offCm;
          const z0 = -bCm / 2 + offCm;
          const z1 = +bCm / 2 - offCm;
          if (!(y1 > y0 + 1e-6) || !(z1 > z0 + 1e-6)) break;

          const [x00, y00] = toCanvas(y0, z0);
          const [x01, y01] = toCanvas(y1, z0);
          const [x11, y11] = toCanvas(y1, z1);
          const [x10, y10] = toCanvas(y0, z1);

          ctx.lineWidth = Math.max(1, dbCm * scale);
          ctx.beginPath();
          ctx.moveTo(x00, y00);
          ctx.lineTo(x01, y01);
          ctx.lineTo(x11, y11);
          ctx.lineTo(x10, y10);
          ctx.closePath();
          ctx.stroke();
        }

        ctx.restore();
      }
    }

    for (const p of pts) {
      const [x, y] = toCanvas(p.y_cm, p.z_cm);
      const r = Math.max(2.2, (p.db_cm / 2) * scale);
      ctx.fillStyle = p.fill;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }, [dev, sectionXU, appCfg.recubrimiento, sectionXRangeU, backendCfg?.slab_proj_offset_m]);

  // Inicializar escena 3D (solo cuando la vista 3D está activa)
  useEffect(() => {
    if (previewView !== '3d') return;
    const host = threeHostRef.current;
    if (!host) return;
    if (threeRef.current) return;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    (renderer as any).physicallyCorrectLights = true;

    const scene = new THREE.Scene();

    const perspCamera = new THREE.PerspectiveCamera(45, 1, 0.01, 5000);
    perspCamera.position.set(120, 80, 120);

    const orthoCamera = new THREE.OrthographicCamera(-100, 100, 100, -100, 0.01, 5000);
    orthoCamera.position.set(120, 80, 120);

    const camera = threeProjection === 'orthographic' ? orthoCamera : perspCamera;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.09;
    controls.rotateSpeed = 0.65;
    controls.zoomSpeed = 1.15;
    controls.panSpeed = 1.05;
    controls.screenSpacePanning = true;
    controls.zoomToCursor = true;
    controls.minPolarAngle = 0.05;
    controls.maxPolarAngle = Math.PI - 0.05;
    // Navegación 3D más fluida: zoom con wheel, pan con botón medio (y también con derecho), rotación con izquierdo.
    // Esto suele sentirse más cercano a CAD/BIM en práctica.
    controls.mouseButtons = {
      LEFT: THREE.MOUSE.ROTATE,
      MIDDLE: THREE.MOUSE.PAN,
      RIGHT: THREE.MOUSE.PAN,
    } as any;

    const hemi = new THREE.HemisphereLight(0xffffff, 0xffffff, 0.45);
    scene.add(hemi);
    const ambient = new THREE.AmbientLight(0xffffff, 0.35);
    scene.add(ambient);
    const key = new THREE.DirectionalLight(0xffffff, 0.95);
    key.position.set(200, 250, 120);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xffffff, 0.35);
    fill.position.set(-220, 140, -180);
    scene.add(fill);

    const root = new THREE.Group();
    scene.add(root);

    host.appendChild(renderer.domElement);

    const onDblClick = () => {
      // Reset rápido para volver a encuadrar.
      const rect = host.getBoundingClientRect();
      fitCameraToObject(
        (threeRef.current?.camera ?? camera) as any,
        controls,
        root,
        { w: Math.max(1, Math.round(rect.width)), h: Math.max(1, Math.round(rect.height)) }
      );
    };
    renderer.domElement.addEventListener('dblclick', onDblClick);

    const onResize = () => {
      const rect = host.getBoundingClientRect();
      const w = Math.max(1, Math.round(rect.width));
      const h = Math.max(1, Math.round(rect.height));
      renderer.setSize(w, h, false);
      const s = threeRef.current;
      const cam = (s?.camera ?? camera) as any;
      if (cam?.isPerspectiveCamera) {
        cam.aspect = w / h;
        cam.updateProjectionMatrix();
      } else if (cam?.isOrthographicCamera) {
        setOrthoFrustum(cam as THREE.OrthographicCamera, w / h);
        cam.updateProjectionMatrix();
      }
    };

    const ro = new ResizeObserver(onResize);
    ro.observe(host);
    onResize();

    let raf = 0;
    const tick = () => {
      const s = threeRef.current;
      if (!s) return;
      s.controls.update();
      s.renderer.render(s.scene, s.camera);
      raf = window.requestAnimationFrame(tick);
    };
    raf = window.requestAnimationFrame(tick);

    threeRef.current = {
      renderer,
      scene,
      camera,
      perspCamera,
      orthoCamera,
      controls,
      root,
      spans: [],
      nodes: [],
      spanSteel: [],
      spanStirrups: [],
      nodeSteel: [],
      nodeStirrups: [],
    };

    return () => {
      window.cancelAnimationFrame(raf);
      ro.disconnect();
      renderer.domElement.removeEventListener('dblclick', onDblClick);
      disposeObject3D(root);
      renderer.dispose();
      renderer.domElement.remove();
      threeRef.current = null;
    };
  }, [previewView, threeProjection]);

  // Inicializar escena 3D overview (estática, sin zoom/pan/rotate)
  useEffect(() => {
    if (previewView !== '3d') return;
    const host = threeOverviewHostRef.current;
    if (!host) return;
    if (threeOverviewRef.current) return;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    (renderer as any).physicallyCorrectLights = true;

    const scene = new THREE.Scene();

    const perspCamera = new THREE.PerspectiveCamera(45, 1, 0.01, 5000);
    perspCamera.position.set(120, 80, 120);

    const orthoCamera = new THREE.OrthographicCamera(-100, 100, 100, -100, 0.01, 5000);
    orthoCamera.position.set(120, 80, 120);

    const camera = threeProjection === 'orthographic' ? orthoCamera : perspCamera;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = false;
    controls.enableRotate = false;
    controls.enableZoom = false;
    controls.enablePan = false;

    const hemi = new THREE.HemisphereLight(0xffffff, 0xffffff, 0.45);
    scene.add(hemi);
    const ambient = new THREE.AmbientLight(0xffffff, 0.35);
    scene.add(ambient);
    const key = new THREE.DirectionalLight(0xffffff, 0.95);
    key.position.set(200, 250, 120);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xffffff, 0.35);
    fill.position.set(-220, 140, -180);
    scene.add(fill);

    const root = new THREE.Group();
    scene.add(root);

    host.appendChild(renderer.domElement);

    const onResize = () => {
      const rect = host.getBoundingClientRect();
      const w = Math.max(1, Math.round(rect.width));
      const h = Math.max(1, Math.round(rect.height));
      renderer.setSize(w, h, false);
      const s = threeOverviewRef.current;
      const cam = (s?.camera ?? camera) as any;
      if (cam?.isPerspectiveCamera) {
        cam.aspect = w / h;
        cam.updateProjectionMatrix();
      } else if (cam?.isOrthographicCamera) {
        setOrthoFrustum(cam as THREE.OrthographicCamera, w / h);
        cam.updateProjectionMatrix();
      }
    };

    const ro = new ResizeObserver(onResize);
    ro.observe(host);
    onResize();

    let raf = 0;
    const tick = () => {
      const s = threeOverviewRef.current;
      if (!s) return;
      s.controls.update();
      s.renderer.render(s.scene, s.camera);
      raf = window.requestAnimationFrame(tick);
    };
    raf = window.requestAnimationFrame(tick);

    threeOverviewRef.current = {
      renderer,
      scene,
      camera,
      perspCamera,
      orthoCamera,
      controls,
      root,
      spans: [],
      nodes: [],
      spanSteel: [],
      spanStirrups: [],
      nodeSteel: [],
      nodeStirrups: [],
    };

    return () => {
      window.cancelAnimationFrame(raf);
      ro.disconnect();
      disposeObject3D(root);
      renderer.dispose();
      renderer.domElement.remove();
      threeOverviewRef.current = null;
    };
  }, [previewView, threeProjection]);

  // Cambiar proyección 3D sin reconstruir geometría.
  useEffect(() => {
    if (previewView !== '3d') return;
    const state = threeRef.current;
    const host = threeHostRef.current;
    if (!state || !host) return;

    const rect = host.getBoundingClientRect();
    const w = Math.max(1, Math.round(rect.width));
    const h = Math.max(1, Math.round(rect.height));
    const next = threeProjection === 'orthographic' ? state.orthoCamera : state.perspCamera;

    state.camera = next;
    (state.controls as any).object = next;
    if ((next as any).isPerspectiveCamera) {
      (next as THREE.PerspectiveCamera).aspect = w / h;
      (next as THREE.PerspectiveCamera).updateProjectionMatrix();
    } else {
      setOrthoFrustum(next as THREE.OrthographicCamera, w / h);
      (next as THREE.OrthographicCamera).updateProjectionMatrix();
    }

    fitCameraToObject(next, state.controls, state.root, { w, h });
  }, [threeProjection, previewView]);

  // Cambiar proyección 3D (overview) sin reconstruir geometría.
  useEffect(() => {
    if (previewView !== '3d') return;
    const state = threeOverviewRef.current;
    const host = threeOverviewHostRef.current;
    if (!state || !host) return;

    const rect = host.getBoundingClientRect();
    const w = Math.max(1, Math.round(rect.width));
    const h = Math.max(1, Math.round(rect.height));
    const next = threeProjection === 'orthographic' ? state.orthoCamera : state.perspCamera;

    state.camera = next;
    (state.controls as any).object = next;
    if ((next as any).isPerspectiveCamera) {
      (next as THREE.PerspectiveCamera).aspect = w / h;
      (next as THREE.PerspectiveCamera).updateProjectionMatrix();
    } else {
      setOrthoFrustum(next as THREE.OrthographicCamera, w / h);
      (next as THREE.OrthographicCamera).updateProjectionMatrix();
    }

    fitCameraToObject(next, state.controls, state.root, { w, h });
  }, [threeProjection, previewView]);

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
    state.spanSteel = [];
    state.spanStirrups = [];
    state.nodeSteel = [];
    state.nodeStirrups = [];

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

    // Subgrupos por tipo para permitir toggles de visibilidad.
    const spanSteelGroups = spanGroups.map((g) => {
      const sg = new THREE.Group();
      sg.name = '__steel';
      g.add(sg);
      return sg;
    });
    const spanStirrupsGroups = spanGroups.map((g) => {
      const sg = new THREE.Group();
      sg.name = '__stirrups';
      g.add(sg);
      return sg;
    });
    const nodeSteelGroups = nodeGroups.map((g) => {
      const sg = new THREE.Group();
      sg.name = '__steel';
      g.add(sg);
      return sg;
    });
    const nodeStirrupsGroups = nodeGroups.map((g) => {
      const sg = new THREE.Group();
      sg.name = '__stirrups';
      g.add(sg);
      return sg;
    });
    state.spanSteel = spanSteelGroups;
    state.spanStirrups = spanStirrupsGroups;
    state.nodeSteel = nodeSteelGroups;
    state.nodeStirrups = nodeStirrupsGroups;

    // Concreto semi-transparente para visualizar acero interno.
    const baseMat = new THREE.MeshStandardMaterial({
      color: 0x14b8a6,
      roughness: 0.48,
      metalness: 0.05,
      transparent: true,
      opacity: 0.20,
    });

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
        const bU = mToUnits(dev, b);
        const geom = new THREE.BoxGeometry(dx, dy, bU);
        const mesh = new THREE.Mesh(geom, baseMat.clone());
        mesh.userData.__casco = true;
        mesh.position.set((x0 + x1) / 2, (y0 + y1) / 2, 0);
        parent.add(mesh);
      }
    }

    // Vigas transversales (crossbeams): 1.00m perpendiculares solo con geometría del casco
    try {
      const crossbeams = (dev as any).crossbeams || [];
      for (const cb of crossbeams) {
        try {
          const x = mToUnits(dev, cb.x);
          const h = mToUnits(dev, cb.h);
          const b = mToUnits(dev, cb.b);
          const depth = mToUnits(dev, 1.0); // 1.00m fijo perpendicular

          const spanIdx = cb.span_index;
          if (spanIdx < 0 || spanIdx >= spanGroups.length) continue;

          // Crear geometría de caja
          // Width (perpendicular al desarrollo) = 1.00m
          // Height = h
          // Depth (ancho de la viga) = b
          const geom = new THREE.BoxGeometry(depth, h, b);
          const mat = baseMat.clone();
          mat.opacity = 0.35; // Ligeramente más opaco para distinguir

          const mesh = new THREE.Mesh(geom, mat);
          mesh.userData.__casco = true;

          // Posicionar en X, centrado verticalmente en h/2
          const yBaseU = mToUnits(dev, clampNumber((dev as any).y0 ?? 0, 0));
          mesh.position.set(x, yBaseU + h / 2, 0);

          // Rotar 90° alrededor del eje Y para que sea perpendicular
          mesh.rotation.y = Math.PI / 2;

          spanGroups[spanIdx].add(mesh);
        } catch (e) {
          console.warn('Error creando mesh de viga transversal:', e);
        }
      }
    } catch (e) {
      console.warn('Error procesando vigas transversales en 3D:', e);
    }

    // Acero longitudinal (simplificado): barras rectas por tramo según layout de sección.
    // Incluye bastones como segmentos por zonas (Z1/Z2/Z3).
    try {
      const steelMat = new THREE.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.35, metalness: 0.25 });
      const bastonL1Mat = new THREE.MeshStandardMaterial({ color: 0x22c55e, roughness: 0.40, metalness: 0.15 });
      const bastonL2Mat = new THREE.MeshStandardMaterial({ color: 0x06b6d4, roughness: 0.40, metalness: 0.15 });
      const extraMat = new THREE.MeshStandardMaterial({ color: 0xd946ef, roughness: 0.45, metalness: 0.10 });
      const origins = computeNodeOrigins(dev);
      const yBaseU = mToUnits(dev, clampNumber((dev as any).y0 ?? 0, 0));
      const coverM = clampNumber((dev as any).recubrimiento ?? appCfg.recubrimiento ?? 0.04, 0.04);
      const nodes = dev.nodes ?? [];
      const bastonLcM = clampNumber((dev as any).baston_Lc ?? 0.5, 0.5);
      const bastonLcU = mToUnits(dev, bastonLcM);
      const coverU = mToUnits(dev, coverM);
      const hookLegU = mToUnits(dev, clampNumber(hookLegM, 0.15));

      const addXSegmentTo = (
        parent: THREE.Object3D,
        xa: number,
        xb: number,
        yU: number,
        zU: number,
        radiusU: number,
        mat: THREE.Material
      ) => {
        const lo = Math.min(xa, xb);
        const hi = Math.max(xa, xb);
        const Lx = hi - lo;
        if (!(Lx > 1e-6)) return;
        if (!(radiusU > 0)) return;
        const geom = new THREE.CylinderGeometry(radiusU, radiusU, Lx, 12);
        geom.rotateZ(Math.PI / 2);
        const mesh = new THREE.Mesh(geom, mat);
        mesh.position.set((lo + hi) / 2, yU, zU);
        parent.add(mesh);
      };

      const addYSegmentTo = (
        parent: THREE.Object3D,
        xU: number,
        y0U: number,
        y1U: number,
        zU: number,
        radiusU: number,
        mat: THREE.Material
      ) => {
        const lo = Math.min(y0U, y1U);
        const hi = Math.max(y0U, y1U);
        const Ly = hi - lo;
        if (!(Ly > 1e-6)) return;
        if (!(radiusU > 0)) return;
        const geom = new THREE.CylinderGeometry(radiusU, radiusU, Ly, 12);
        const mesh = new THREE.Mesh(geom, mat);
        mesh.position.set(xU, (lo + hi) / 2, zU);
        parent.add(mesh);
      };

      const addSegmentTo = (
        parent: THREE.Object3D,
        x0: number,
        y0: number,
        z0: number,
        x1: number,
        y1: number,
        z1: number,
        radiusU: number,
        mat: THREE.Material
      ) => {
        const dx = x1 - x0;
        const dy = y1 - y0;
        const dz = z1 - z0;
        const L = Math.hypot(dx, dy, dz);
        if (!(L > 1e-6)) return;
        if (!(radiusU > 0)) return;

        const geom = new THREE.CylinderGeometry(radiusU, radiusU, L, 12);
        const mesh = new THREE.Mesh(geom, mat);

        // CylinderGeometry is aligned with +Y by default.
        const dir = new THREE.Vector3(dx, dy, dz).normalize();
        const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
        mesh.quaternion.copy(q);

        mesh.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
        parent.add(mesh);
      };

      const resolvedLenMWithLm = (cfg: BastonCfg, field: 'L1_m' | 'L2_m' | 'L3_m', fallbackM: number, Lm: number) => {
        const v = (cfg as any)[field];
        const n = typeof v === 'number' ? v : NaN;
        const out = Number.isFinite(n) && n > 0 ? n : fallbackM;
        const snapped = snap05m(out);
        return Math.min(Lm, Math.max(0, snapped));
      };

      const getBastonCfgForSpan = (span: SpanIn, side: 'top' | 'bottom', zone: 'z1' | 'z2' | 'z3'): BastonCfg => {
        const b = (span as any).bastones ?? {};
        const s = (side === 'top' ? b.top : b.bottom) ?? {};
        const z = (s as any)[zone] ?? {};
        return normalizeBastonCfg(z);
      };

      for (let si = 0; si < (dev.spans ?? []).length; si++) {
        const span = (dev.spans ?? [])[si];
        if (!span) continue;
        const Lm = clampNumber(span.L ?? 0, 0);
        if (!(Lm > 0)) continue;

        // X-range por lado (mismo que el overlay 2D)
        const a2_i = mToUnits(dev, clampNumber(nodes[si]?.a2 ?? 0, 0));
        const xBot0 = (origins[si] ?? 0) + a2_i;
        const xBot1 = xBot0 + mToUnits(dev, Lm);

        const b2_i = mToUnits(dev, clampNumber(nodes[si]?.b2 ?? 0, 0));
        const b1_ip1 = mToUnits(dev, clampNumber(nodes[si + 1]?.b1 ?? 0, 0));
        const xTop0 = (origins[si] ?? 0) + b2_i;
        const xTop1 = (origins[si + 1] ?? 0) + b1_ip1;

        const parentSteel = state.spanSteel[Math.max(0, Math.min(si, state.spanSteel.length - 1))] as THREE.Group | undefined;
        const parentStirrups = state.spanStirrups[Math.max(0, Math.min(si, state.spanStirrups.length - 1))] as THREE.Group | undefined;
        if (!parentSteel || !parentStirrups) continue;

        const getBastonCfg3D = (side: 'top' | 'bottom', zone: 'z1' | 'z2' | 'z3'): BastonCfg => {
          const b = (span as any).bastones ?? {};
          const s = (side === 'top' ? b.top : b.bottom) ?? {};
          const z = (s as any)[zone] ?? {};
          return normalizeBastonCfg(z);
        };

        const defaultLenM = Lm / 5;
        const defaultL3M = Lm / 3;
        const resolvedLenM = (cfg: BastonCfg, field: 'L1_m' | 'L2_m' | 'L3_m', fallbackM: number) => {
          const v = (cfg as any)[field];
          const n = typeof v === 'number' ? v : NaN;
          const out = Number.isFinite(n) && n > 0 ? n : fallbackM;
          const snapped = snap05m(out);
          return Math.min(Lm, Math.max(0, snapped));
        };

        const addXSegment = (xa: number, xb: number, yU: number, zU: number, radiusU: number, mat: THREE.Material) => {
          const lo = Math.min(xa, xb);
          const hi = Math.max(xa, xb);
          const Lx = hi - lo;
          if (!(Lx > 1e-6)) return;
          if (!(radiusU > 0)) return;
          const geom = new THREE.CylinderGeometry(radiusU, radiusU, Lx, 12);
          geom.rotateZ(Math.PI / 2);
          const mesh = new THREE.Mesh(geom, mat);
          mesh.position.set((lo + hi) / 2, yU, zU);
          parentSteel.add(mesh);
        };

        const addYSegment = (xU: number, y0U: number, y1U: number, zU: number, radiusU: number, mat: THREE.Material) => {
          const lo = Math.min(y0U, y1U);
          const hi = Math.max(y0U, y1U);
          const Ly = hi - lo;
          if (!(Ly > 1e-6)) return;
          if (!(radiusU > 0)) return;
          const geom = new THREE.CylinderGeometry(radiusU, radiusU, Ly, 12);
          const mesh = new THREE.Mesh(geom, mat);
          mesh.position.set(xU, (lo + hi) / 2, zU);
          parentSteel.add(mesh);
        };

        const computeEndX2 = (
          xU: number,
          dir: 1 | -1,
          diaKey: string,
          kind: 'hook' | 'anchorage',
          side: 'top' | 'bottom',
          xFaceU?: number,
          customLengthM?: number
        ) => {
          if (typeof xFaceU === 'number' && Number.isFinite(xFaceU)) {
            const target = xFaceU - dir * coverU;
            const lo = Math.min(xU, xFaceU);
            const hi = Math.max(xU, xFaceU);
            return Math.min(hi, Math.max(lo, target));
          }
          // Use custom length if provided (Preferencia 01), otherwise use table
          const lengthM = (typeof customLengthM === 'number' && customLengthM > 0)
            ? customLengthM
            : lengthFromTableMeters(diaKey, kind, side);
          return xU + dir * mToUnits(dev, lengthM);
        };

        const addBars = (face: 'top' | 'bottom') => {
          const res = computeSpanSectionLayoutWithBastonesCm({ dev, span, cover_m: coverM, face });
          if (!res.ok) return;

          const xaSide = face === 'top' ? Math.min(xTop0, xTop1) : Math.min(xBot0, xBot1);
          const xbSide = face === 'top' ? Math.max(xTop0, xTop1) : Math.max(xBot0, xBot1);

          // Acero principal: barra a lo largo del tramo + uniones por nodo (gancho/anclaje).
          const mainRadiusU = mToUnits(dev, (res.main_db_cm / 100) / 2);
          const mainSteel = face === 'top' ? (span.steel_top ?? null) : (span.steel_bottom ?? null);
          const diaKey = String((mainSteel as any)?.diameter ?? '3/4');
          const nL = nodes[si] as NodeIn | undefined;
          const nR = nodes[si + 1] as NodeIn | undefined;

          const leftKind = nL ? nodeSteelKind(nL, face, 2) : 'continuous';
          const rightKind = nR ? nodeSteelKind(nR, face, 1) : 'continuous';
          const leftToFace = nL ? nodeToFaceEnabled(nL, face, 2) : false;
          const rightToFace = nR ? nodeToFaceEnabled(nR, face, 1) : false;

          const xFaceLeft = (() => {
            if (!leftToFace || !nL) return undefined;
            const o = origins[si] ?? 0;
            return face === 'top'
              ? o + mToUnits(dev, clampNumber((nL as any).b1 ?? 0, 0))
              : o + mToUnits(dev, clampNumber((nL as any).a1 ?? 0, 0));
          })();

          const xFaceRight = (() => {
            if (!rightToFace || !nR) return undefined;
            const o = origins[si + 1] ?? 0;
            return face === 'top'
              ? o + mToUnits(dev, clampNumber((nR as any).b2 ?? 0, 0))
              : o + mToUnits(dev, clampNumber((nR as any).a2 ?? 0, 0));
          })();

          for (const b of res.main_bars_cm) {
            const yU = yBaseU + mToUnits(dev, b.y_cm / 100);
            const zU = mToUnits(dev, b.z_cm / 100);
            addXSegment(xaSide, xbSide, yU, zU, mainRadiusU, steelMat);

            if (leftKind === 'hook' || leftKind === 'development') {
              const kind2 = leftKind === 'hook' ? 'hook' : 'anchorage';
              const customLengthField = face === 'top' ? 'steel_top_2_anchorage_length' : 'steel_bottom_2_anchorage_length';
              const customLength = nL ? (nL as any)[customLengthField] : undefined;
              const x2 = computeEndX2(xaSide, -1, diaKey, kind2, face, xFaceLeft, customLength);
              addXSegment(x2, xaSide, yU, zU, mainRadiusU, extraMat);
              if (leftKind === 'hook') {
                const y2 = face === 'top' ? yU - hookLegU : yU + hookLegU;
                addYSegment(x2, yU, y2, zU, mainRadiusU, extraMat);
              }
            }

            if (rightKind === 'hook' || rightKind === 'development') {
              const kind2 = rightKind === 'hook' ? 'hook' : 'anchorage';
              const customLengthField = face === 'top' ? 'steel_top_1_anchorage_length' : 'steel_bottom_1_anchorage_length';
              const customLength = nR ? (nR as any)[customLengthField] : undefined;
              const x2 = computeEndX2(xbSide, +1, diaKey, kind2, face, xFaceRight, customLength);
              addXSegment(xbSide, x2, yU, zU, mainRadiusU, extraMat);
              if (rightKind === 'hook') {
                const y2 = face === 'top' ? yU - hookLegU : yU + hookLegU;
                addYSegment(x2, yU, y2, zU, mainRadiusU, extraMat);
              }
            }
          }

          // Bastones: segmentos por zonas.
          const l1Pool = (res as any).baston_l1_bars_cm ?? [];
          const l2Pool = (res as any).baston_l2_bars_cm ?? [];
          if (!((l1Pool.length + l2Pool.length) > 0) || !(res.baston_db_cm > 0)) return;
          const bastonRadiusU = mToUnits(dev, (res.baston_db_cm / 100) / 2);

          const side: 'top' | 'bottom' = face;

          // Z1
          {
            const cfg = getBastonCfg3D(side, 'z1');
            if (cfg.l1_enabled || cfg.l2_enabled) {
              const q1 = Math.max(1, Math.min(3, Math.round(cfg.l1_qty ?? 1)));
              const q2 = Math.max(1, Math.min(3, Math.round(cfg.l2_qty ?? 1)));

              const L3_u = mToUnits(dev, resolvedLenM(cfg, 'L3_m', defaultL3M));
              const x0z = xaSide;
              const x1z = Math.min(xbSide, xaSide + L3_u);
              const innerExists = x1z - x0z > bastonLcU + 1e-6;

              const l1Bars = cfg.l1_enabled ? l1Pool.slice(0, q1) : [];
              const l2Bars = cfg.l2_enabled && innerExists ? l2Pool.slice(0, q2) : [];

              for (const bb of l1Bars) {
                const yU = yBaseU + mToUnits(dev, bb.y_cm / 100);
                const zU = mToUnits(dev, bb.z_cm / 100);
                addXSegment(x0z, x1z, yU, zU, bastonRadiusU, bastonL1Mat);
              }
              for (const bb of l2Bars) {
                const yU = yBaseU + mToUnits(dev, bb.y_cm / 100);
                const zU = mToUnits(dev, bb.z_cm / 100);
                addXSegment(x0z, x1z - bastonLcU, yU, zU, bastonRadiusU, bastonL2Mat);
              }

              // Uniones en el nodo izquierdo (end=2) por línea
              const n0 = nodes[si] as NodeIn | undefined;
              if (n0) {
                const xFaceFor = (line: 1 | 2) => {
                  const toFace = nodeBastonLineToFaceEnabled(n0, side, 2, line);
                  if (!toFace) return undefined;
                  const o = origins[si] ?? 0;
                  return side === 'top'
                    ? o + mToUnits(dev, clampNumber((n0 as any).b1 ?? 0, 0))
                    : o + mToUnits(dev, clampNumber((n0 as any).a1 ?? 0, 0));
                };

                if (cfg.l1_enabled) {
                  const dia = String(cfg.l1_diameter ?? '3/4');
                  const kEnd = nodeBastonLineKind(n0, side, 2, 1);
                  if (kEnd === 'hook' || kEnd === 'development') {
                    const kind = kEnd === 'hook' ? 'hook' : 'anchorage';
                    const xFace = xFaceFor(1);
                    const x2 = computeEndX2(x0z, -1, dia, kind, side, xFace);
                    for (const bb of l1Bars) {
                      const yU = yBaseU + mToUnits(dev, bb.y_cm / 100);
                      const zU = mToUnits(dev, bb.z_cm / 100);
                      addXSegment(x2, x0z, yU, zU, bastonRadiusU, extraMat);
                      if (kEnd === 'hook') {
                        const y2 = side === 'top' ? yU - hookLegU : yU + hookLegU;
                        addYSegment(x2, yU, y2, zU, bastonRadiusU, extraMat);
                      }
                    }
                  }
                }

                if (cfg.l2_enabled && innerExists) {
                  const dia = String(cfg.l2_diameter ?? '3/4');
                  const kEnd = nodeBastonLineKind(n0, side, 2, 2);
                  if (kEnd === 'hook' || kEnd === 'development') {
                    const kind = kEnd === 'hook' ? 'hook' : 'anchorage';
                    const xFace = xFaceFor(2);
                    const x2 = computeEndX2(x0z, -1, dia, kind, side, xFace);
                    for (const bb of l2Bars) {
                      const yU = yBaseU + mToUnits(dev, bb.y_cm / 100);
                      const zU = mToUnits(dev, bb.z_cm / 100);
                      addXSegment(x2, x0z, yU, zU, bastonRadiusU, extraMat);
                      if (kEnd === 'hook') {
                        const y2 = side === 'top' ? yU - hookLegU : yU + hookLegU;
                        addYSegment(x2, yU, y2, zU, bastonRadiusU, extraMat);
                      }
                    }
                  }
                }
              }
            }
          }

          // Z2
          {
            const cfg = getBastonCfg3D(side, 'z2');
            if (cfg.l1_enabled || cfg.l2_enabled) {
              const q1 = Math.max(1, Math.min(3, Math.round(cfg.l1_qty ?? 1)));
              const q2 = Math.max(1, Math.min(3, Math.round(cfg.l2_qty ?? 1)));
              const L1_u = mToUnits(dev, resolvedLenM(cfg, 'L1_m', defaultLenM));
              const L2_u = mToUnits(dev, resolvedLenM(cfg, 'L2_m', defaultLenM));
              const x0z = xaSide + L1_u;
              const x1z = xbSide - L2_u;
              if (x1z > x0z + 1e-6) {
                const innerExists = x1z - x0z > 2 * bastonLcU + 1e-6;
                const idxL1 = 0;
                const idxL2 = cfg.l1_enabled ? q1 : 0;
                const l1Bars = cfg.l1_enabled ? l1Pool.slice(0, q1) : [];
                const l2Bars = cfg.l2_enabled && innerExists ? l2Pool.slice(0, q2) : [];

                for (const bb of l1Bars) {
                  const yU = yBaseU + mToUnits(dev, bb.y_cm / 100);
                  const zU = mToUnits(dev, bb.z_cm / 100);
                  addXSegment(x0z, x1z, yU, zU, bastonRadiusU, bastonL1Mat);
                }
                for (const bb of l2Bars) {
                  const yU = yBaseU + mToUnits(dev, bb.y_cm / 100);
                  const zU = mToUnits(dev, bb.z_cm / 100);
                  addXSegment(x0z + bastonLcU, x1z - bastonLcU, yU, zU, bastonRadiusU, bastonL2Mat);
                }
              }
            }
          }

          // Z3
          {
            const cfg = getBastonCfg3D(side, 'z3');
            if (cfg.l1_enabled || cfg.l2_enabled) {
              const q1 = Math.max(1, Math.min(3, Math.round(cfg.l1_qty ?? 1)));
              const q2 = Math.max(1, Math.min(3, Math.round(cfg.l2_qty ?? 1)));

              const L3_u = mToUnits(dev, resolvedLenM(cfg, 'L3_m', defaultL3M));
              const x1z = xbSide;
              const x0z = Math.max(xaSide, xbSide - L3_u);
              const innerExists = x1z - x0z > bastonLcU + 1e-6;

              const l1Bars = cfg.l1_enabled ? l1Pool.slice(0, q1) : [];
              const l2Bars = cfg.l2_enabled && innerExists ? l2Pool.slice(0, q2) : [];

              for (const bb of l1Bars) {
                const yU = yBaseU + mToUnits(dev, bb.y_cm / 100);
                const zU = mToUnits(dev, bb.z_cm / 100);
                addXSegment(x0z, x1z, yU, zU, bastonRadiusU, bastonL1Mat);
              }
              for (const bb of l2Bars) {
                const yU = yBaseU + mToUnits(dev, bb.y_cm / 100);
                const zU = mToUnits(dev, bb.z_cm / 100);
                addXSegment(x0z + bastonLcU, x1z, yU, zU, bastonRadiusU, bastonL2Mat);
              }

              // Uniones en el nodo derecho (end=1) por línea
              const n1 = nodes[si + 1] as NodeIn | undefined;
              if (n1) {
                const xFaceFor = (line: 1 | 2) => {
                  const toFace = nodeBastonLineToFaceEnabled(n1, side, 1, line);
                  if (!toFace) return undefined;
                  const o = origins[si + 1] ?? 0;
                  return side === 'top'
                    ? o + mToUnits(dev, clampNumber((n1 as any).b2 ?? 0, 0))
                    : o + mToUnits(dev, clampNumber((n1 as any).a2 ?? 0, 0));
                };

                if (cfg.l1_enabled) {
                  const dia = String(cfg.l1_diameter ?? '3/4');
                  const kEnd = nodeBastonLineKind(n1, side, 1, 1);
                  if (kEnd === 'hook' || kEnd === 'development') {
                    const kind = kEnd === 'hook' ? 'hook' : 'anchorage';
                    const xFace = xFaceFor(1);
                    const x2 = computeEndX2(x1z, +1, dia, kind, side, xFace);
                    for (const bb of l1Bars) {
                      const yU = yBaseU + mToUnits(dev, bb.y_cm / 100);
                      const zU = mToUnits(dev, bb.z_cm / 100);
                      addXSegment(x1z, x2, yU, zU, bastonRadiusU, extraMat);
                      if (kEnd === 'hook') {
                        const y2 = side === 'top' ? yU - hookLegU : yU + hookLegU;
                        addYSegment(x2, yU, y2, zU, bastonRadiusU, extraMat);
                      }
                    }
                  }
                }

                if (cfg.l2_enabled && innerExists) {
                  const dia = String(cfg.l2_diameter ?? '3/4');
                  const kEnd = nodeBastonLineKind(n1, side, 1, 2);
                  if (kEnd === 'hook' || kEnd === 'development') {
                    const kind = kEnd === 'hook' ? 'hook' : 'anchorage';
                    const xFace = xFaceFor(2);
                    const x2 = computeEndX2(x1z, +1, dia, kind, side, xFace);
                    for (const bb of l2Bars) {
                      const yU = yBaseU + mToUnits(dev, bb.y_cm / 100);
                      const zU = mToUnits(dev, bb.z_cm / 100);
                      addXSegment(x1z, x2, yU, zU, bastonRadiusU, extraMat);
                      if (kEnd === 'hook') {
                        const y2 = side === 'top' ? yU - hookLegU : yU + hookLegU;
                        addYSegment(x2, yU, y2, zU, bastonRadiusU, extraMat);
                      }
                    }
                  }
                }
              }
            }
          }
        };

        addBars('top');
        addBars('bottom');

        // Estribos 3D: lazos rectangulares cerrados (en el plano Y-Z) por cada posición ABCR.
        try {
          const st = (span as any).stirrups as any;
          if (st) {
            const dM = clampNumber((dev as any).d ?? 0.25, 0.25);
            const x0Face = Math.min(xBot0, xBot1);
            const x1Face = Math.max(xBot0, xBot1);
            const LspanU = x1Face - x0Face;
            if (LspanU > 1e-6) {
              const caseType = String(st.case_type ?? 'simetrica').trim().toLowerCase();
              const singleEnd = String(st.single_end ?? '').trim().toLowerCase();
              const leftSpec = String(st.left_spec ?? '').trim();
              const centerSpec = String(st.center_spec ?? '').trim();
              const rightSpec = String(st.right_spec ?? '').trim();

              const specOr = (...vals: string[]) => {
                for (const v of vals) {
                  const s = String(v ?? '').trim();
                  if (s) return s;
                }
                return '';
              };

              let pL = '';
              let pR = '';
              if (caseType === 'simetrica') {
                pL = specOr(leftSpec, centerSpec, rightSpec);
                pR = specOr(rightSpec, pL) || pL;
              } else if (caseType === 'asim_ambos') {
                pL = specOr(leftSpec, centerSpec);
                pR = specOr(rightSpec, centerSpec, pL);
              } else if (caseType === 'asim_uno') {
                const pSpecial = specOr(leftSpec);
                const pRest = specOr(centerSpec, pSpecial);
                if (singleEnd === 'right') {
                  pL = pRest;
                  pR = pSpecial;
                } else {
                  pL = pSpecial;
                  pR = pRest;
                }
              } else {
                pL = specOr(leftSpec, centerSpec, rightSpec);
                pR = specOr(rightSpec, pL) || pL;
              }

              const midU = (x0Face + x1Face) / 2;
              const leftBlocks = pL ? stirrupsBlocksFromSpec(dev, pL, x0Face, midU, +1) : [];
              const rightBlocks = pR ? stirrupsBlocksFromSpec(dev, pR, x1Face, midU, -1) : [];

              // Si el espacio en el centro es mayor que R, agregar un estribo independiente.
              try {
                const flatL = leftBlocks.flatMap((b) => b.positions ?? []);
                const flatR = rightBlocks.flatMap((b) => b.positions ?? []);
                const leftLast = flatL.length ? Math.max(...flatL) : null;
                const rightFirst = flatR.length ? Math.min(...flatR) : null;
                const rLm = pL ? stirrupsRestSpacingFromSpec(pL) : null;
                const rRm = pR ? stirrupsRestSpacingFromSpec(pR) : null;
                const rM = Math.min(...[rLm ?? Infinity, rRm ?? Infinity].filter((v) => Number.isFinite(v)) as number[]);
                const rU = Number.isFinite(rM) && rM > 0 ? mToUnits(dev, rM) : 0;
                if (leftLast != null && rightFirst != null && rightFirst > leftLast + 1e-6 && rU > 0) {
                  const gap = rightFirst - leftLast;
                  if (gap > rU + 1e-6) {
                    const xMid = (leftLast + rightFirst) / 2;
                    leftBlocks.push({ key: 'mid', positions: [xMid] });
                  }
                }
              } catch {
                // ignore
              }

              if (leftBlocks.length || rightBlocks.length) {
                const matB = new THREE.MeshStandardMaterial({ color: 0x22c55e, roughness: 0.55, metalness: 0.05 });
                const matC = new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.55, metalness: 0.05 });
                const matR = new THREE.MeshStandardMaterial({ color: 0x06b6d4, roughness: 0.55, metalness: 0.05 });
                const matMid = new THREE.MeshStandardMaterial({ color: 0xd946ef, roughness: 0.55, metalness: 0.05 });
                const mats = [matB, matC, matR];

                const matFor = (key: string, idx: number) => {
                  const k = String(key || '').toLowerCase();
                  if (k === 'b') return matB;
                  if (k === 'c') return matC;
                  if (k === 'r') return matR;
                  if (k === 'mid') return matMid;
                  return mats[idx % mats.length];
                };

                const sec = normalizeStirrupsSection((span as any).stirrups_section ?? (span as any).stirrupsSection);
                const settings = getSteelLayoutSettings(dev);
                const diaKey = normalizeDiaKey(String(st.diameter ?? '3/8').replace(/[∅Ø\s]/g, '')) || '3/8';
                const dbCm = diameterToCm(diaKey, settings);
                const dbU = mToUnits(dev, dbCm / 100);
                const hU = mToUnits(dev, clampNumber(span.h ?? 0, 0));

                const addLoopAtX = (xPos: number, mat: THREE.Material) => {
                  if (xPos < x0Face - 1e-3 || xPos > x1Face + 1e-3) return;
                  if (!(sec.qty > 0) || !(dbU > 1e-9)) return;
                  const bU = mToUnits(dev, spanBAtX(dev, xPos));

                  for (let k = 0; k < sec.qty; k++) {
                    const offU = coverU + (k + 0.5) * dbU;
                    const y0 = yBaseU + offU;
                    const y1 = yBaseU + hU - offU;
                    const z0 = -bU / 2 + offU;
                    const z1 = +bU / 2 - offU;
                    if (!(y1 > y0 + 1e-6) || !(z1 > z0 + 1e-6)) break;
                    const radiusU = Math.max(1e-9, dbU / 2);

                    // Rectángulo en Y-Z (x constante)
                    addSegmentTo(parentStirrups, xPos, y0, z0, xPos, y1, z0, radiusU, mat);
                    addSegmentTo(parentStirrups, xPos, y1, z0, xPos, y1, z1, radiusU, mat);
                    addSegmentTo(parentStirrups, xPos, y1, z1, xPos, y0, z1, radiusU, mat);
                    addSegmentTo(parentStirrups, xPos, y0, z1, xPos, y0, z0, radiusU, mat);
                  }
                };

                let idx = 0;
                const seen = new Set<number>();
                const pushPositions = (positions: number[], mat: THREE.Material) => {
                  for (const xPos of positions) {
                    const key = Math.round(xPos * 1000); // 1e-3 unidades
                    if (seen.has(key)) continue;
                    seen.add(key);
                    addLoopAtX(xPos, mat);
                  }
                };

                for (const b of leftBlocks) pushPositions(b.positions ?? [], matFor(b.key, idx++));
                for (const b of rightBlocks) pushPositions(b.positions ?? [], matFor(b.key, idx++));
              }
            }
          }
        } catch {
          // ignore (3D stirrups best-effort)
        }
      }

      // Conexiones en nodos internos (best-effort):
      // - Acero principal continuo: conecta barras entre tramos
      // - Bastones: conecta Z3 del tramo izquierdo con Z1 del tramo derecho (por línea)
      const spans = dev.spans ?? [];

      for (let ni = 1; ni < nodes.length - 1; ni++) {
        const node = nodes[ni] as NodeIn | undefined;
        const leftSpan = spans[ni - 1] as SpanIn | undefined;
        const rightSpan = spans[ni] as SpanIn | undefined;
        if (!node || !leftSpan || !rightSpan) continue;

        const parent = (state.nodeSteel[ni] as THREE.Group | undefined) ?? state.root;
        const LmL = clampNumber(leftSpan.L ?? 0, 0);
        const LmR = clampNumber(rightSpan.L ?? 0, 0);
        if (!(LmL > 0) || !(LmR > 0)) continue;

        for (const face of ['top', 'bottom'] as const) {
          // X fin tramo izq en el nodo y X inicio tramo der en el nodo (misma lógica de overlay 2D)
          let xLeftEnd = 0;
          let xRightStart = 0;

          if (face === 'top') {
            const o = origins[ni] ?? 0;
            const b1 = mToUnits(dev, clampNumber((nodes[ni] as any)?.b1 ?? 0, 0));
            const b2 = mToUnits(dev, clampNumber((nodes[ni] as any)?.b2 ?? 0, 0));
            xLeftEnd = o + b1;
            xRightStart = o + b2;
          } else {
            const oL = origins[ni - 1] ?? 0;
            const a2L = mToUnits(dev, clampNumber((nodes[ni - 1] as any)?.a2 ?? 0, 0));
            const x0L = oL + a2L;
            xLeftEnd = x0L + mToUnits(dev, LmL);

            const oR = origins[ni] ?? 0;
            const a2R = mToUnits(dev, clampNumber((nodes[ni] as any)?.a2 ?? 0, 0));
            xRightStart = oR + a2R;
          }

          const xA = xLeftEnd;
          const xB = xRightStart;

          // 1) Acero principal continuo
          const k1 = nodeSteelKind(node, face, 1);
          const k2 = nodeSteelKind(node, face, 2);
          if (k1 === 'continuous' && k2 === 'continuous') {
            const resL = computeSpanSectionLayoutWithBastonesCm({ dev, span: leftSpan, cover_m: coverM, face });
            const resR = computeSpanSectionLayoutWithBastonesCm({ dev, span: rightSpan, cover_m: coverM, face });
            if (resL.ok && resR.ok) {
              const nBars = Math.min(resL.main_bars_cm.length, resR.main_bars_cm.length);
              const radiusU = mToUnits(dev, (Math.max(resL.main_db_cm, resR.main_db_cm) / 100) / 2);
              for (let bi = 0; bi < nBars; bi++) {
                const bL = resL.main_bars_cm[bi];
                const bR = resR.main_bars_cm[bi];
                if (!bL || !bR) continue;
                const yL = yBaseU + mToUnits(dev, bL.y_cm / 100);
                const yR = yBaseU + mToUnits(dev, bR.y_cm / 100);
                const zL = mToUnits(dev, bL.z_cm / 100);
                const zR = mToUnits(dev, bR.z_cm / 100);

                // Recta (sin escalón) también en top.
                addSegmentTo(parent, xA, yL, zL, xB, yR, zR, radiusU, steelMat);
              }
            }
          }

          // 2) Bastones continuos en nodo interno: Z3 (izq) ↔ Z1 (der)
          const cfgL = getBastonCfgForSpan(leftSpan, face, 'z3');
          const cfgR = getBastonCfgForSpan(rightSpan, face, 'z1');
          const q1L = Math.max(1, Math.min(3, Math.round(cfgL.l1_qty ?? 1)));
          const q2L = Math.max(1, Math.min(3, Math.round(cfgL.l2_qty ?? 1)));
          const q1R = Math.max(1, Math.min(3, Math.round(cfgR.l1_qty ?? 1)));
          const q2R = Math.max(1, Math.min(3, Math.round(cfgR.l2_qty ?? 1)));

          const resL = computeSpanSectionLayoutWithBastonesCm({ dev, span: leftSpan, cover_m: coverM, face });
          const resR = computeSpanSectionLayoutWithBastonesCm({ dev, span: rightSpan, cover_m: coverM, face });
          if (!(resL.ok && resR.ok)) continue;
          const l1PoolL = (resL as any).baston_l1_bars_cm ?? [];
          const l2PoolL = (resL as any).baston_l2_bars_cm ?? [];
          const l1PoolR = (resR as any).baston_l1_bars_cm ?? [];
          const l2PoolR = (resR as any).baston_l2_bars_cm ?? [];
          if (!((l1PoolL.length + l2PoolL.length) > 0) || !((l1PoolR.length + l2PoolR.length) > 0)) continue;
          const bastonRadiusU = mToUnits(dev, (Math.max(resL.baston_db_cm, resR.baston_db_cm) / 100) / 2);

          // helper: innerExists para una zona (solo usado para línea 2)
          const innerExistsFor = (span: SpanIn, cfg: BastonCfg, zone: 'z1' | 'z3', Lm: number) => {
            const defaultL3 = Lm / 3;
            const L3_u = mToUnits(dev, resolvedLenMWithLm(cfg, 'L3_m', defaultL3, Lm));

            // x-range por lado en ese tramo
            let xaSide = 0;
            let xbSide = 0;
            if (face === 'top') {
              const siSpan = zone === 'z3' ? ni - 1 : ni;
              const o0 = origins[siSpan] ?? 0;
              const o1 = origins[siSpan + 1] ?? 0;
              const b2_i = mToUnits(dev, clampNumber(nodes[siSpan]?.b2 ?? 0, 0));
              const b1_ip1 = mToUnits(dev, clampNumber(nodes[siSpan + 1]?.b1 ?? 0, 0));
              xaSide = Math.min(o0 + b2_i, o1 + b1_ip1);
              xbSide = Math.max(o0 + b2_i, o1 + b1_ip1);
            } else {
              const siSpan = zone === 'z3' ? ni - 1 : ni;
              const o = origins[siSpan] ?? 0;
              const a2_i = mToUnits(dev, clampNumber(nodes[siSpan]?.a2 ?? 0, 0));
              xaSide = o + a2_i;
              xbSide = xaSide + mToUnits(dev, clampNumber((spans[siSpan] as any)?.L ?? 0, 0));
              xaSide = Math.min(xaSide, xbSide);
              xbSide = Math.max(xaSide, xbSide);
            }

            if (zone === 'z1') {
              const x0z = xaSide;
              const x1z = Math.min(xbSide, xaSide + L3_u);
              return x1z - x0z > bastonLcU + 1e-6;
            }
            // z3
            const x1z = xbSide;
            const x0z = Math.max(xaSide, xbSide - L3_u);
            return x1z - x0z > bastonLcU + 1e-6;
          };

          for (const line of [1, 2] as const) {
            const kLeft = nodeBastonLineKind(node, face, 1, line);
            const kRight = nodeBastonLineKind(node, face, 2, line);
            if (!(kLeft === 'continuous' && kRight === 'continuous')) continue;

            const enabledL = line === 1 ? cfgL.l1_enabled : cfgL.l2_enabled;
            const enabledR = line === 1 ? cfgR.l1_enabled : cfgR.l2_enabled;
            if (!enabledL || !enabledR) continue;

            const qL = line === 1 ? q1L : q2L;
            const qR = line === 1 ? q1R : q2R;
            const poolL = line === 1 ? l1PoolL : l2PoolL;
            const poolR = line === 1 ? l1PoolR : l2PoolR;
            const q = Math.min(qL, qR, poolL.length, poolR.length);
            if (!(q > 0)) continue;

            // Línea 2 solo si existe interior en ambos tramos
            if (line === 2) {
              if (!innerExistsFor(leftSpan, cfgL, 'z3', LmL)) continue;
              if (!innerExistsFor(rightSpan, cfgR, 'z1', LmR)) continue;
            }

            for (let bi = 0; bi < q; bi++) {
              const bL = poolL[bi];
              const bR = poolR[bi];
              if (!bL || !bR) continue;
              const yL = yBaseU + mToUnits(dev, bL.y_cm / 100);
              const yR = yBaseU + mToUnits(dev, bR.y_cm / 100);
              const zL = mToUnits(dev, bL.z_cm / 100);
              const zR = mToUnits(dev, bR.z_cm / 100);

              // Recta (sin escalón) también en top.
              addSegmentTo(parent, xA, yL, zL, xB, yR, zR, bastonRadiusU, line === 1 ? bastonL1Mat : bastonL2Mat);
            }
          }
        }
      }
    } catch {
      // ignore (3D steel is best-effort)
    }

    {
      const host = threeHostRef.current;
      const rect = host?.getBoundingClientRect();
      const viewport = rect ? { w: Math.max(1, Math.round(rect.width)), h: Math.max(1, Math.round(rect.height)) } : undefined;
      fitCameraToObject(state.camera, state.controls, state.root, viewport);
    }
  }, [dev, preview, previewView]);

  // Mantener 3D overview sincronizado (clon del root del detalle)
  useEffect(() => {
    if (previewView !== '3d') return;
    const src = threeRef.current;
    const dst = threeOverviewRef.current;
    const host = threeOverviewHostRef.current;
    if (!src || !dst || !host) return;

    // Limpiar dst.root
    while (dst.root.children.length) {
      const child = dst.root.children[0];
      dst.root.remove(child);
      disposeObject3D(child);
    }

    // Clonar geometría del detalle
    const clonedRoot = src.root.clone(true);
    while (clonedRoot.children.length) {
      const child = clonedRoot.children[0];
      clonedRoot.remove(child);
      dst.root.add(child);
    }

    // Aplicar toggles de visibilidad por nombre de grupo
    dst.root.traverse((o: any) => {
      if (!o) return;
      if (o.name === '__steel') o.visible = showLongitudinal;
      if (o.name === '__stirrups') o.visible = showStirrups;
    });

    const rect = host.getBoundingClientRect();
    const viewport = { w: Math.max(1, Math.round(rect.width)), h: Math.max(1, Math.round(rect.height)) };
    fitCameraToObject(dst.camera, dst.controls, dst.root, viewport);
  }, [dev, preview, previewView, showLongitudinal, showStirrups]);

  // Togglear visibilidad de capas 3D (sin reconstruir)
  useEffect(() => {
    if (previewView !== '3d') return;
    const state = threeRef.current;
    if (!state) return;

    for (const g of [...(state.spanSteel ?? []), ...(state.nodeSteel ?? [])]) g.visible = showLongitudinal;
    for (const g of [...(state.spanStirrups ?? []), ...(state.nodeStirrups ?? [])]) g.visible = showStirrups;
  }, [showLongitudinal, showStirrups, previewView]);

  // Aplicar opacidad (transparencia) a todos los materiales 3D
  useEffect(() => {
    if (previewView !== '3d') return;
    const state = threeRef.current;
    if (!state) return;
    const opacity = threeOpacity / 100;
    state.root.traverse((obj: any) => {
      if (obj.isMesh && obj.material && obj.userData?.__casco) {
        const mat = obj.material;
        mat.transparent = true;
        mat.opacity = opacity;
        mat.needsUpdate = true;
      }
    });
  }, [threeOpacity, previewView, dev, preview]);

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
      if (g) {
        const host = threeHostRef.current;
        const rect = host?.getBoundingClientRect();
        const viewport = rect ? { w: Math.max(1, Math.round(rect.width)), h: Math.max(1, Math.round(rect.height)) } : undefined;
        fitCameraToObject(state.camera, state.controls, g, viewport);
      }
    } else if (selection.kind === 'node') {
      const g = state.nodes[selection.index];
      if (g) setEmissiveOnObject(g, 0xfacc15, 0.40);
      if (g) {
        const host = threeHostRef.current;
        const rect = host?.getBoundingClientRect();
        const viewport = rect ? { w: Math.max(1, Math.round(rect.width)), h: Math.max(1, Math.round(rect.height)) } : undefined;
        fitCameraToObject(state.camera, state.controls, g, viewport);
      }
    }
  }, [selection, zoomEnabled, previewView]);

  // Si se desactiva Zoom, apaga correlación y vuelve a vista general
  useEffect(() => {
    if (zoomEnabled) return;
    setDetailViewport(null);
    setSelection({ kind: 'none' });
  }, [zoomEnabled]);

  // Escape: si hay zoom vuelve a vista general; si no, limpia selección
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (detailViewport) {
        setDetailViewport(null);
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
  }, [detailViewport, selection.kind]);

  function applySelection(sel: Selection, nextViewport: boolean) {
    if (!zoomEnabled) return;
    setSelection(sel);
    if (nextViewport && preview) setDetailViewport(computeZoomBounds(dev, preview, sel));
  }

  function moveZoomSelection(dir: -1 | 1) {
    if (!zoomEnabled) return;
    const spansCount = (dev.spans ?? []).length;
    const nodesCount = (dev.nodes ?? []).length;
    if (!(nodesCount >= 1) || nodesCount !== spansCount + 1) {
      // fallback
      return;
    }

    const maxIdx = 2 * spansCount; // N1..Tn..N(n+1)

    const selToIdx = (s: Selection): number | null => {
      if (s.kind === 'node') return Math.max(0, Math.min(maxIdx, 2 * s.index));
      if (s.kind === 'span') return Math.max(0, Math.min(maxIdx, 2 * s.index + 1));
      return null;
    };

    const idxToSel = (i: number): Selection => {
      const ii = Math.max(0, Math.min(maxIdx, Math.trunc(i)));
      if (ii % 2 === 0) return { kind: 'node', index: Math.min(nodesCount - 1, Math.max(0, ii / 2)) };
      return { kind: 'span', index: Math.min(spansCount - 1, Math.max(0, (ii - 1) / 2)) };
    };

    const cur = selToIdx(selection);
    let next = 0;
    if (cur == null) next = dir > 0 ? 0 : maxIdx;
    else next = Math.max(0, Math.min(maxIdx, cur + dir));

    applySelection(idxToSel(next), true);
  }

  function onCanvasWheel(e: React.WheelEvent<HTMLCanvasElement>) {
    if (previewView !== '2d') return;
    if (!preview) return;
    // Evitar scroll de la página mientras se usa el canvas.
    e.preventDefault();

    const b0 = (detailViewportRef.current ?? (preview.bounds as Bounds)) as Bounds;
    const w0 = Math.max(1e-6, b0.max_x - b0.min_x);
    const h0 = Math.max(1e-6, b0.max_y - b0.min_y);
    const cx = (b0.min_x + b0.max_x) / 2;
    const cy = (b0.min_y + b0.max_y) / 2;

    // Wheel up -> zoom in (bounds smaller)
    const dir = e.deltaY < 0 ? -1 : 1;
    const factor = dir < 0 ? 0.90 : 1.10;
    const w1 = Math.max(1e-6, w0 * factor);
    const h1 = Math.max(1e-6, h0 * factor);

    setDetailViewport({
      min_x: cx - w1 / 2,
      max_x: cx + w1 / 2,
      min_y: cy - h1 / 2,
      max_y: cy + h1 / 2,
    });
  }

  function onCanvasPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    if (previewView !== '2d') return;
    if (!preview) return;

    // Capturar pointer para pan (mouse/touch).
    const el = e.currentTarget as HTMLCanvasElement;
    try {
      el.setPointerCapture(e.pointerId);
    } catch {
      // ignore
    }

    pan2dRef.current.active = true;
    pan2dRef.current.moved = false;
    pan2dRef.current.pointerId = e.pointerId;
    pan2dRef.current.startX = e.clientX;
    pan2dRef.current.startY = e.clientY;
    pan2dRef.current.lastX = e.clientX;
    pan2dRef.current.lastY = e.clientY;
  }

  function onCanvasPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (previewView !== '2d') return;
    if (!preview) return;
    if (!pan2dRef.current.active) return;
    if (pan2dRef.current.pointerId !== e.pointerId) return;

    const dxPx = e.clientX - pan2dRef.current.lastX;
    const dyPx = e.clientY - pan2dRef.current.lastY;
    pan2dRef.current.lastX = e.clientX;
    pan2dRef.current.lastY = e.clientY;

    const totalDx = e.clientX - pan2dRef.current.startX;
    const totalDy = e.clientY - pan2dRef.current.startY;
    if (!pan2dRef.current.moved) {
      if (Math.hypot(totalDx, totalDy) < 3) return;
      pan2dRef.current.moved = true;
    }

    e.preventDefault();

    const canvas = e.currentTarget as HTMLCanvasElement;
    const rect = canvas.getBoundingClientRect();
    const cssW = Math.max(1, Math.round(rect.width));
    const cssH = Math.max(1, Math.round(rect.height));

    const b0 = (detailViewportRef.current ?? (preview.bounds as Bounds)) as Bounds;
    const { scale } = fitTransform(b0, cssW, cssH);
    const s = Math.max(1e-6, scale);

    const dxW = dxPx / s;
    const yScale = steelViewActive && steelYScale2 ? 2 : 1;
    const dyW = dyPx / (s * Math.max(1e-6, yScale));

    setDetailViewport((prev) => {
      const b = (prev ?? (preview.bounds as Bounds)) as Bounds;
      // Drag “arrastra” el dibujo: mover bounds en sentido contrario en X.
      return {
        min_x: b.min_x - dxW,
        max_x: b.max_x - dxW,
        // En Y: arrastrar hacia abajo baja el dibujo -> bounds suben.
        min_y: b.min_y + dyW,
        max_y: b.max_y + dyW,
      };
    });
  }

  function onCanvasPointerUp(e: React.PointerEvent<HTMLCanvasElement>) {
    if (pan2dRef.current.pointerId !== e.pointerId) return;
    pan2dRef.current.active = false;
    try {
      (e.currentTarget as HTMLCanvasElement).releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
  }

  function onCanvasClick(e: React.MouseEvent<HTMLCanvasElement>) {
    // Si fue un drag (pan), no disparar selección por click.
    if (pan2dRef.current.moved) {
      pan2dRef.current.moved = false;
      return;
    }
    if (!preview || !zoomEnabled) return;

    const rect = (e.currentTarget as HTMLCanvasElement).getBoundingClientRect();
    const cssW = Math.max(1, Math.round(rect.width));
    const cssH = Math.max(1, Math.round(rect.height));
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;

    const rb = (detailViewport ?? (preview.bounds as Bounds)) as Bounds;
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

  function onOverviewCanvasClick(e: React.MouseEvent<HTMLCanvasElement>) {
    if (!preview || !zoomEnabled) return;

    const rect = (e.currentTarget as HTMLCanvasElement).getBoundingClientRect();
    const cssW = Math.max(1, Math.round(rect.width));
    const cssH = Math.max(1, Math.round(rect.height));
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;

    const rb = (preview.bounds as Bounds) as Bounds;
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

    applySelection(best, true);
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

  function updateSpanStirrups(spanIdx: number, patch: Partial<StirrupsDistributionIn>) {
    setDev((prev) => {
      const spans = (prev.spans ?? []).map((s, i) => {
        if (i !== spanIdx) return s;
        const current = (s as any).stirrups ? { ...(s as any).stirrups } : {};
        const next = { ...current, ...patch } as StirrupsDistributionIn;
        return { ...s, stirrups: next } as any;
      });
      return normalizeDev({ ...prev, spans } as DevelopmentIn, appCfg);
    });
  }

  function updateSpanStirrupsSection(spanIdx: number, patch: Partial<StirrupsSectionIn>) {
    setDev((prev) => {
      const spans = (prev.spans ?? []).map((s, i) => {
        if (i !== spanIdx) return s;
        const current = normalizeStirrupsSection((s as any).stirrups_section ?? (s as any).stirrupsSection);
        const next = normalizeStirrupsSection({ ...current, ...patch });
        return { ...s, stirrups_section: next } as any;
      });
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

  function updateBaston(spanIdx: number, side: 'top' | 'bottom', zone: 'z1' | 'z2' | 'z3', patch: Partial<BastonCfg>) {
    setDev((prev) => {
      const spans = (prev.spans ?? []).map((s, i) => {
        if (i !== spanIdx) return s;
        const bastones: BastonesCfg = (s as any).bastones ? JSON.parse(JSON.stringify((s as any).bastones)) : { top: {}, bottom: {} };
        const sideObj: BastonesSideCfg = (side === 'top' ? bastones.top : bastones.bottom) ?? {};
        const current = normalizeBastonCfg((sideObj as any)[zone]);
        const next = { ...current, ...patch } as BastonCfg;
        const nextSide = { ...sideObj, [zone]: next } as any;
        const nextBastones = { ...bastones, [side]: nextSide } as any;
        return { ...s, bastones: nextBastones } as any;
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

  function setNodeBastonLineKind(nodeIdx: number, side: 'top' | 'bottom', end: 1 | 2, line: 1 | 2, kind: SteelKind) {
    setDev((prev) => {
      const nodes = (prev.nodes ?? []).map((n, i) => {
        if (i !== nodeIdx) return n;
        const isInternal = nodeIdx > 0 && nodeIdx < (prev.nodes?.length ?? 0) - 1;

        const k1 =
          side === 'top'
            ? line === 1
              ? 'baston_top_1_l1_kind'
              : 'baston_top_1_l2_kind'
            : line === 1
              ? 'baston_bottom_1_l1_kind'
              : 'baston_bottom_1_l2_kind';
        const k2 =
          side === 'top'
            ? line === 1
              ? 'baston_top_2_l1_kind'
              : 'baston_top_2_l2_kind'
            : line === 1
              ? 'baston_bottom_2_l1_kind'
              : 'baston_bottom_2_l2_kind';

        // Regla: si uno es "Continuo", el otro también (solo nodos internos)
        if (isInternal && kind === 'continuous') {
          return { ...n, [k1]: 'continuous', [k2]: 'continuous' } as any;
        }

        const key = end === 1 ? k1 : k2;
        return { ...n, [key]: kind } as any;
      });
      return normalizeDev({ ...prev, nodes } as DevelopmentIn, appCfg);
    });
  }

  function setNodeBastonLineToFace(nodeIdx: number, side: 'top' | 'bottom', end: 1 | 2, line: 1 | 2, enabled: boolean) {
    const key =
      side === 'top'
        ? end === 1
          ? line === 1
            ? 'baston_top_1_l1_to_face'
            : 'baston_top_1_l2_to_face'
          : line === 1
            ? 'baston_top_2_l1_to_face'
            : 'baston_top_2_l2_to_face'
        : end === 1
          ? line === 1
            ? 'baston_bottom_1_l1_to_face'
            : 'baston_bottom_1_l2_to_face'
          : line === 1
            ? 'baston_bottom_2_l1_to_face'
            : 'baston_bottom_2_l2_to_face';

    setDev((prev) => {
      const nodes = (prev.nodes ?? []).map((n, i) => (i === nodeIdx ? ({ ...n, [key]: enabled } as any) : n));
      return normalizeDev({ ...prev, nodes } as DevelopmentIn, appCfg);
    });
  }

  function setNodeToFace(nodeIdx: number, side: 'top' | 'bottom', end: 1 | 2, enabled: boolean) {
    const key =
      side === 'top'
        ? end === 1
          ? 'steel_top_1_to_face'
          : 'steel_top_2_to_face'
        : end === 1
          ? 'steel_bottom_1_to_face'
          : 'steel_bottom_2_to_face';

    setDev((prev) => {
      const nodes = (prev.nodes ?? []).map((n, i) => (i === nodeIdx ? ({ ...n, [key]: enabled } as any) : n));
      return normalizeDev({ ...prev, nodes } as DevelopmentIn, appCfg);
    });
  }

  function addSpan() {
    setDev((prev) => {
      const spans0 = prev.spans ?? [];
      const nodes0 = prev.nodes ?? [];
      const lastSpan = spans0.length ? spans0[spans0.length - 1] : INITIAL_SPAN;
      const lastNode = nodes0.length ? nodes0[nodes0.length - 1] : INITIAL_NODE;

      let spans = [...spans0, cloneSpan(lastSpan)];
      let nodes = [...nodes0, cloneNode(lastNode)];

      // Aplicar preferencia de acero en nodos y spans
      if (defaultPref === 'basico' || defaultPref === 'basico_bastones') {
        const applyN = defaultPref === 'basico_bastones' ? applyBasicBastonesPreferenceToNodes : applyBasicPreferenceToNodes;
        const applyS = defaultPref === 'basico_bastones' ? applyBasicBastonesPreferenceToSpans : applyBasicPreferenceToSpans;
        if (nodes.length > 0) {
          nodes = applyN(nodes);
        }
        if (spans.length > 0) {
          spans = applyS(spans);
        }
      }

      return normalizeDev({ ...prev, spans, nodes } as DevelopmentIn, appCfg);
    });
  }

  async function handleSaveManual() {
    try {
      setBusy(true);
      setSaveStatus('saving');
      await saveState(payload);
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus(null), 2000);
    } catch (err: any) {
      setSaveStatus('error');
      setError(err?.message ?? 'Error al guardar');
      setTimeout(() => setSaveStatus(null), 4000);
    } finally {
      setBusy(false);
    }
  }

  function clearDevelopment() {
    const ok = window.confirm('¿Limpiar todos los datos y empezar un nuevo desarrollo?');
    if (!ok) return;
    setError(null);
    setWarning(null);
    setSelection({ kind: 'none' });
    setDetailViewport(null);
    setConcretoLocked(false);
    setDev(defaultDevelopment(appCfg));
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
      const blob = await exportDxf({ ...payload, savedCuts }, { cascoLayer, steelLayer, drawSteel });
      downloadBlob(blob, `beamdrawing-${(dev.name ?? 'desarrollo').replace(/\s+/g, '_')}.dxf`);
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }

  async function onUploadTemplate(file: File) {
    try {
      setBusy(true);
      setError(null);
      const info = await uploadTemplateDxf(file);
      setTemplateName(info.filename);
      setTemplateLayers(info.layers ?? []);

      if (info.layers?.length && !info.layers.includes(cascoLayer)) {
        setCascoLayer(info.layers.includes('A-BEAM-CASCO') ? 'A-BEAM-CASCO' : info.layers[0]);
      }
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }

  async function onClearTemplate() {
    try {
      setBusy(true);
      setError(null);
      await clearTemplateDxf();
      setTemplateName(null);
      setTemplateLayers([]);
      setCascoLayer('A-BEAM-CASCO');
      setSteelLayer('A-REBAR-CORRIDO');
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }

  async function onImportDxfFile(file: File) {
    try {
      setBusy(true);
      setError(null);
      setWarning(null);
      const res = await importDxf(file);
      // El DXF define geometría (L y nodos). Mantén h/b según el Tramo 1 actual.
      const span1 = (dev.spans ?? [])[0] ?? INITIAL_SPAN;
      const h0 = span1.h;
      const b0 = span1.b ?? INITIAL_SPAN.b ?? 0;
      let incoming: DevelopmentIn = {
        ...res.development,
        floor_start: (dev as any).floor_start ?? '6to',
        floor_end: (dev as any).floor_end ?? '9no',
        spans: (res.development.spans ?? []).map((s) => ({ ...s, h: h0, b: b0 })),
      };

      // Aplicar preferencia de acero en nodos y spans
      if (defaultPref === 'basico' || defaultPref === 'basico_bastones') {
        const applyN = defaultPref === 'basico_bastones' ? applyBasicBastonesPreferenceToNodes : applyBasicPreferenceToNodes;
        const applyS = defaultPref === 'basico_bastones' ? applyBasicBastonesPreferenceToSpans : applyBasicPreferenceToSpans;
        let updatedNodes = incoming.nodes;
        let updatedSpans = incoming.spans;

        if (incoming.nodes && incoming.nodes.length > 0) {
          updatedNodes = applyN([...incoming.nodes]);
        }
        if (incoming.spans && incoming.spans.length > 0) {
          updatedSpans = applyS([...incoming.spans]);
        }

        incoming = { ...incoming, nodes: updatedNodes, spans: updatedSpans };
      }

      setDev(normalizeDev(incoming, appCfg));
      if (res.warnings?.length) setWarning(res.warnings.join('\n'));
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
      recubrimiento: clampNumber(
        (incoming as any).recubrimiento ?? (incoming as any).steel_cover_top ?? (incoming as any).steel_cover_bottom ?? appCfg.recubrimiento,
        appCfg.recubrimiento
      ),
      baston_Lc: clampNumber((incoming as any).baston_Lc ?? (incoming as any).bastonLc ?? appCfg.baston_Lc, appCfg.baston_Lc),
    };
    setAppCfg(nextCfg);
    setDev(normalizeDev(incoming, nextCfg));
    setError(null);
  }

  // Fallback visual global: si los datos principales no están listos, mostrar mensaje claro
  if (!dev || !appCfg) {
    return (
      <div style={{ color: '#fff', background: '#0b1220', height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>
        ⚠️ Error: Datos principales no cargados. Revisa la inicialización de la app o el backend.
      </div>
    );
  }
  return (
    <div className="layout">
      <header className="header">
        <div>
          <div className="title">AUBUILD - MASCON TECH.</div>
          <div className="subtitle">Config / Concreto / Acero / JSON</div>
        </div>

        {/* Indicador de guardado */}
        {saveStatus && (
          <div className={`saveIndicator saveIndicator--${saveStatus}`}>
            {saveStatus === 'saving' && (
              <span>💾 Guardando {dev.name ?? 'DESARROLLO 01'}...</span>
            )}
            {saveStatus === 'saved' && (
              <span>✅ {dev.name ?? 'DESARROLLO 01'} guardado</span>
            )}
            {saveStatus === 'error' && (
              <span>❌ Error al guardar {dev.name ?? 'DESARROLLO 01'}</span>
            )}
          </div>
        )}

        <div className="actions" style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <div className="steelLayerSelector">
            {([
              { key: null, label: 'Off' },
              { key: 'acero' as SteelOverlayLayer, label: 'Acero' },
              { key: 'bastones' as SteelOverlayLayer, label: 'Bastones' },
              { key: 'estribos' as SteelOverlayLayer, label: 'Estribos' },
            ] as const).map(({ key, label }) => (
              <button
                key={label}
                className={`steelLayerBtn ${steelOverlayLayer === key ? 'steelLayerBtnActive' : ''}`}
                onClick={() => setSteelOverlayLayer(key)}
                type="button"
              >
                {label}
              </button>
            ))}
          </div>
          <button className="btn" onClick={onExportDxf} type="button" disabled={busy}>
            Exportar DXF
          </button>
        </div>
      </header>

      <main className="content">
        <div className="mainGrid">
          <div className="leftPane">
            <section className="panel" style={{ padding: 10 }}>
              <div className="segmented" aria-label="Navegación">
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
            </section>

            <details
              className="panel"
              open={editorOpen}
              onToggle={(e) => setEditorOpen((e.currentTarget as HTMLDetailsElement).open)}
            >
              <summary className="panelSummary">
                <div className="panelSummaryInner">
                  <div className="panelTitle" style={{ marginBottom: 0 }}>EDITOR DE DESARROLLO DE VIGA.</div>

                  {tab === 'config' ? (
                    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                      <label
                        className="field"
                        style={{ minWidth: 260, flex: 1 }}
                        onClick={(e) => e.stopPropagation()}
                        onPointerDown={(e) => e.stopPropagation()}
                      >
                        <div className="label">Preferencia</div>
                        <select
                          className="input"
                          value={defaultPref}
                          onChange={(e) => onChangeDefaultPref(e.target.value as DefaultPreferenceId)}
                          onClick={(e) => e.stopPropagation()}
                          onPointerDown={(e) => e.stopPropagation()}
                        >
                          <option value="basico">Preferencia 01: Básico</option>
                          <option value="basico_bastones">Preferencia 02: Básico + Bastones</option>
                          <option value="personalizado">Personalizado</option>
                        </select>
                      </label>
                    </div>
                  ) : null}
                </div>
              </summary>

              {tab === 'config' ? (
                <ConfigTab
                  defaultPref={defaultPref}
                  onChangeDefaultPref={onChangeDefaultPref}
                  slabProjOffsetDraft={slabProjOffsetDraft}
                  setSlabProjOffsetDraft={setSlabProjOffsetDraft}
                  slabProjLayerDraft={slabProjLayerDraft}
                  setSlabProjLayerDraft={setSlabProjLayerDraft}
                  templateName={templateName}
                  templateLayers={templateLayers ?? []}
                  onUploadTemplate={onUploadTemplate}
                  onClearTemplate={onClearTemplate}
                  busy={busy}
                  cascoLayer={cascoLayer}
                  setCascoLayer={setCascoLayer}
                  steelLayer={steelLayer}
                  setSteelLayer={setSteelLayer}
                  drawSteel={drawSteel}
                  setDrawSteel={setDrawSteel}
                  appCfg={appCfg}
                  setAppCfg={setAppCfg}
                  clampNumber={clampNumber}
                  hookLegDraft={hookLegDraft}
                  setHookLegDraft={setHookLegDraft}
                  steelTextLayerDraft={steelTextLayerDraft}
                  setSteelTextLayerDraft={setSteelTextLayerDraft}
                  steelTextStyleDraft={steelTextStyleDraft}
                  setSteelTextStyleDraft={setSteelTextStyleDraft}
                  steelTextHeightDraft={steelTextHeightDraft}
                  setSteelTextHeightDraft={setSteelTextHeightDraft}
                  steelTextWidthDraft={steelTextWidthDraft}
                  setSteelTextWidthDraft={setSteelTextWidthDraft}
                  steelTextObliqueDraft={steelTextObliqueDraft}
                  setSteelTextObliqueDraft={setSteelTextObliqueDraft}
                  steelTextRotationDraft={steelTextRotationDraft}
                  setSteelTextRotationDraft={setSteelTextRotationDraft}
                />
              ) : null}

          {tab === 'concreto' ? (
            <ConcreteTab
              dev={dev}
              selection={selection}
              spansCols={spansCols}
              nodesCols={nodesCols}
              busy={busy}
              concretoLocked={concretoLocked}
              showNT={showNT}
              setConcretoLocked={setConcretoLocked}
              setShowNT={setShowNT}
              clearDevelopment={clearDevelopment}
              onImportDxfFile={onImportDxfFile}
              onSave={handleSaveManual}
              addSpan={addSpan}
              removeSpan={removeSpan}
              updateDevPatch={updateDevPatch}
              updateSpan={updateSpan}
              updateNode={updateNode}
              applySelection={applySelection}
              onGridKeyDown={onGridKeyDown}
              formatOrdinalEs={formatOrdinalEs}
              clampInt={clampInt}
              clampNumber={clampNumber}
              fmt2={fmt2}
            />
          ) : null}

          {tab === 'acero' ? (
            <SteelTab
              dev={dev}
              appCfg={appCfg}
              defaultPref={defaultPref}
              steelLayoutDraft={steelLayoutDraft}
              setSteelLayoutDraft={setSteelLayoutDraft}
              steelLayoutDraftDirtyRef={steelLayoutDraftDirtyRef}
              warning={warning}
              setWarning={setWarning}
              updateDevPatch={updateDevPatch}
              bastonLenEdits={bastonLenEdits}
              setBastonLenEdits={setBastonLenEdits}
              stirrupsAbcrEdits={stirrupsAbcrEdits}
              setStirrupsAbcrEdits={setStirrupsAbcrEdits}
              updateSpanSteel={updateSpanSteel}
              updateSpanStirrupsSection={updateSpanStirrupsSection}
              updateSpanStirrups={updateSpanStirrups}
              updateBaston={updateBaston}
              nodeSteelKind={nodeSteelKind}
              setNodeSteelKind={setNodeSteelKind}
              nodeToFaceEnabled={nodeToFaceEnabled}
              setNodeToFace={setNodeToFace}
              buildNodeSlots={buildNodeSlots}
              nodeBastonLineKind={nodeBastonLineKind}
              setNodeBastonLineKind={setNodeBastonLineKind}
              nodeBastonLineToFaceEnabled={nodeBastonLineToFaceEnabled}
              setNodeBastonLineToFace={setNodeBastonLineToFace}
              normalizeBastonCfg={normalizeBastonCfg}
              snapBastonM={snapBastonM}
              parseStirrupsABCR={parseStirrupsABCR}
              formatStirrupsABCR={formatStirrupsABCR}
              pickDefaultABCRForH={pickDefaultABCRForH}
              normalizeDiaKey={normalizeDiaKey}
              safeParseJson={safeParseJson}
              getSteelLayoutSettings={getSteelLayoutSettings}
              clampNumber={clampNumber}
              fmt2={fmt2}
            />
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
            </details>
          </div>

          <PreviewPanel
            preview={preview}
            previewView={previewView}
            setPreviewView={setPreviewView}
            threeProjection={threeProjection}
            setThreeProjection={setThreeProjection}
            dev={dev}
            overviewCanvasRef={overviewCanvasRef}
            canvasRef={canvasRef}
            sectionCanvasRef={sectionCanvasRef}
            threeHostRef={threeHostRef}
            onOverviewCanvasClick={onOverviewCanvasClick}
            onCanvasWheel={onCanvasWheel}
            onCanvasPointerDown={onCanvasPointerDown}
            onCanvasPointerMove={onCanvasPointerMove}
            onCanvasPointerUp={onCanvasPointerUp}
            onCanvasClick={onCanvasClick}
            moveZoomSelection={moveZoomSelection}
            setDetailViewport={setDetailViewport}
            showLongitudinal={showLongitudinal}
            setShowLongitudinal={setShowLongitudinal}
            showStirrups={showStirrups}
            setShowStirrups={setShowStirrups}
            steelViewActive={steelViewActive}
            steelYScale2={steelYScale2}
            setSteelYScale2={setSteelYScale2}
            threeOpacity={threeOpacity}
            setThreeOpacity={setThreeOpacity}
            savedCuts={savedCuts}
            setSavedCuts={setSavedCuts}
            sectionXU={sectionXU}
            setSectionXU={setSectionXU}
            sectionXRangeU={sectionXRangeU}
            sectionInfo={sectionInfo}
            defaultCutAXU={defaultCutAXU}
            mToUnits={mToUnits}
            spanIndexAtX={spanIndexAtX}
            indexToLetters={indexToLetters}
            detailOverlay={
              previewView === '2d' && steelOverlayLayer ? (
                <SteelOverlay
                  dev={dev}
                  preview={preview}
                  renderBounds={(detailViewport ?? (preview?.bounds as Bounds | undefined)) ?? null}
                  canvasRef={canvasRef}
                  layer={steelOverlayLayer}
                  yScale={steelViewActive && steelYScale2 ? 2 : 1}
                  onUpdateSpanSteel={updateSpanSteel}
                  onUpdateNode={updateNode}
                  onUpdateBaston={updateBaston}
                  onUpdateStirrups={updateSpanStirrups}
                  onUpdateStirrupsSection={updateSpanStirrupsSection}
                />
              ) : undefined
            }
          />
        </div>
      </main>
    </div>
  );
}
