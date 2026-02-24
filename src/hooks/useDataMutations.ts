import { useCallback } from 'react';
import type {
  DevelopmentIn,
  SpanIn,
  NodeIn,
  SteelMeta,
  SteelKind,
  BastonCfg,
  BastonesCfg,
  BastonesSideCfg,
  StirrupsDistributionIn,
  StirrupsSectionIn,
} from '../types';
import {
  cloneSteelMeta,
  cloneSpan,
  cloneNode,
  normalizeBastonCfg,
  normalizeStirrupsSection,
  normalizeDev,
  INITIAL_SPAN,
  INITIAL_NODE,
  type AppConfig,
} from '../services';
import { applyBasicPreferenceToNodes, applyBasicPreferenceToSpans, applyBasicBastonesPreferenceToSpans, applyBasicBastonesPreferenceToNodes } from '../services/steelService';
import type { DefaultPreferenceId } from '../utils';

export function useDataMutations(
  setDev: React.Dispatch<React.SetStateAction<DevelopmentIn>>,
  appCfg: AppConfig,
  defaultPref: DefaultPreferenceId,
) {
  const updateDevPatch = useCallback((patch: Partial<DevelopmentIn>) => {
    setDev((prev) => normalizeDev({ ...prev, ...patch } as DevelopmentIn, appCfg));
  }, [setDev, appCfg]);

  const updateSpan = useCallback((spanIdx: number, patch: Partial<SpanIn>) => {
    setDev((prev) => {
      const spans = (prev.spans ?? []).map((s, i) => (i === spanIdx ? { ...s, ...patch } : s));
      return normalizeDev({ ...prev, spans } as DevelopmentIn, appCfg);
    });
  }, [setDev, appCfg]);

  const updateSpanStirrups = useCallback((spanIdx: number, patch: Partial<StirrupsDistributionIn>) => {
    setDev((prev) => {
      const spans = (prev.spans ?? []).map((s, i) => {
        if (i !== spanIdx) return s;
        const current = (s as any).stirrups ? { ...(s as any).stirrups } : {};
        const next = { ...current, ...patch } as StirrupsDistributionIn;
        return { ...s, stirrups: next } as any;
      });
      return normalizeDev({ ...prev, spans } as DevelopmentIn, appCfg);
    });
  }, [setDev, appCfg]);

  const updateSpanStirrupsSection = useCallback((spanIdx: number, patch: Partial<StirrupsSectionIn>) => {
    setDev((prev) => {
      const spans = (prev.spans ?? []).map((s, i) => {
        if (i !== spanIdx) return s;
        const current = normalizeStirrupsSection((s as any).stirrups_section ?? (s as any).stirrupsSection);
        const next = normalizeStirrupsSection({ ...current, ...patch });
        return { ...s, stirrups_section: next } as any;
      });
      return normalizeDev({ ...prev, spans } as DevelopmentIn, appCfg);
    });
  }, [setDev, appCfg]);

  const updateNode = useCallback((nodeIdx: number, patch: Partial<NodeIn>) => {
    setDev((prev) => {
      const nodes = (prev.nodes ?? []).map((n, i) => (i === nodeIdx ? { ...n, ...patch } : n));
      return normalizeDev({ ...prev, nodes } as DevelopmentIn, appCfg);
    });
  }, [setDev, appCfg]);

  const updateSpanSteel = useCallback((spanIdx: number, side: 'top' | 'bottom', patch: Partial<SteelMeta>) => {
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
  }, [setDev, appCfg]);

  const updateBaston = useCallback((spanIdx: number, side: 'top' | 'bottom', zone: 'z1' | 'z2' | 'z3', patch: Partial<BastonCfg>) => {
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
  }, [setDev, appCfg]);

  const setNodeSteelKind = useCallback((nodeIdx: number, side: 'top' | 'bottom', end: 1 | 2, kind: SteelKind) => {
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
  }, [setDev, appCfg]);

  const setNodeBastonLineKind = useCallback((nodeIdx: number, side: 'top' | 'bottom', end: 1 | 2, line: 1 | 2, kind: SteelKind) => {
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
  }, [setDev, appCfg]);

  const setNodeBastonLineToFace = useCallback((nodeIdx: number, side: 'top' | 'bottom', end: 1 | 2, line: 1 | 2, enabled: boolean) => {
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
  }, [setDev, appCfg]);

  const setNodeToFace = useCallback((nodeIdx: number, side: 'top' | 'bottom', end: 1 | 2, enabled: boolean) => {
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
  }, [setDev, appCfg]);

  const addSpan = useCallback(() => {
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
  }, [setDev, appCfg, defaultPref]);

  const removeSpan = useCallback((spanIdx: number) => {
    setDev((prev) => {
      const spans = (prev.spans ?? []).filter((_, i) => i !== spanIdx);
      return normalizeDev({ ...prev, spans } as DevelopmentIn, appCfg);
    });
  }, [setDev, appCfg]);

  return {
    updateDevPatch,
    updateSpan,
    updateSpanStirrups,
    updateSpanStirrupsSection,
    updateNode,
    updateSpanSteel,
    updateBaston,
    setNodeSteelKind,
    setNodeBastonLineKind,
    setNodeBastonLineToFace,
    setNodeToFace,
    addSpan,
    removeSpan,
  };
}
