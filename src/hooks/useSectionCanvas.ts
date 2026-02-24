import { useEffect, useMemo } from 'react';
import type { DevelopmentIn, BackendAppConfig, BastonCfg } from '../types';
import type { AppConfig } from '../services';
import {
  mToUnits,
  computeNodeOrigins,
  computeSpanRangeX,
  canvasMapper,
  spanIndexAtX,
  nodeIndexAtX,
  normalizeBastonCfg,
  normalizeStirrupsSection,
  uniqueSortedNumbers,
} from '../services';
import {
  computeSpanSectionLayoutWithBastonesCm,
  diameterToCm,
  getSteelLayoutSettings,
} from '../steelLayout';
import { clampNumber, normalizeDiaKey, snap05m } from '../utils';

interface UseSectionCanvasParams {
  dev: DevelopmentIn;
  appCfg: AppConfig;
  sectionCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  sectionXU: number;
  setSectionXU: React.Dispatch<React.SetStateAction<number>>;
  setSavedCuts: React.Dispatch<React.SetStateAction<Array<{ xU: number }>>>;
  backendCfg: BackendAppConfig | null;
}

export function useSectionCanvas({
  dev,
  appCfg,
  sectionCanvasRef,
  sectionXU,
  setSectionXU,
  setSavedCuts,
  backendCfg,
}: UseSectionCanvasParams) {
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

  return { sectionXRangeU, sectionInfo, defaultCutAXU };
}
