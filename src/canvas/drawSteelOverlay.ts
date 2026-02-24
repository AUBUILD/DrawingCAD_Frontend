import type { PreviewResponse, DevelopmentIn, BastonCfg, SpanIn } from '../types';
import {
  canvasMapper,
  mToUnits,
  computeNodeOrigins,
  normalizeBastonCfg,
  lengthFromTableMeters,
  nodeSteelKind,
  nodeToFaceEnabled,
  nodeBastonLineKind,
  nodeBastonLineToFaceEnabled,
  stirrupsBlocksFromSpec,
  stirrupsRestSpacingFromSpec,
  type Bounds,
} from '../services';
import { clampNumber, snap05m } from '../utils';

export function drawSteelOverlay(
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
