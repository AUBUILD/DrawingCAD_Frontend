import type React from 'react';
import type {
  DevelopmentIn,
  StirrupsDistributionIn,
  StirrupsSectionIn,
  SteelMeta,
  SteelKind,
  SteelLayoutSettings,
} from '../../types';

export interface NodeSlot {
  nodeIdx: number;
  end: 1 | 2;
  label: string;
}

export interface BastonCfg {
  l1_enabled?: boolean;
  l2_enabled?: boolean;
  l1_qty?: number;
  l2_qty?: number;
  l1_diameter?: string;
  l2_diameter?: string;
  L1_m?: number;
  L2_m?: number;
  L3_m?: number;
}

export interface StirrupsABCR {
  A_m: number;
  b_n: number;
  B_m: number;
  c_n: number;
  C_m: number;
  R_m: number;
}

export interface SteelTabProps {
  dev: DevelopmentIn;
  appCfg: any;
  defaultPref: 'basico' | 'basico_bastones' | 'personalizado';

  steelLayoutDraft: string;
  setSteelLayoutDraft: (draft: string) => void;
  steelLayoutDraftDirtyRef: React.MutableRefObject<boolean>;

  bastonLenEdits: Record<string, string>;
  setBastonLenEdits: React.Dispatch<React.SetStateAction<Record<string, string>>>;

  stirrupsAbcrEdits: Record<string, string>;
  setStirrupsAbcrEdits: React.Dispatch<React.SetStateAction<Record<string, string>>>;

  warning: string | null;
  setWarning: (warning: string | null) => void;

  updateDevPatch: (patch: Partial<DevelopmentIn>) => void;
  updateSpanSteel: (spanIdx: number, side: 'top' | 'bottom', patch: Partial<SteelMeta>) => void;
  updateSpanStirrups: (spanIdx: number, patch: Partial<StirrupsDistributionIn>) => void;
  updateSpanStirrupsSection: (spanIdx: number, patch: Partial<StirrupsSectionIn>) => void;
  updateBaston: (spanIdx: number, side: 'top' | 'bottom', zone: 'z1' | 'z2' | 'z3', patch: Partial<BastonCfg>) => void;
  setNodeSteelKind: (nodeIdx: number, side: 'top' | 'bottom', end: 1 | 2, kind: SteelKind) => void;
  setNodeToFace: (nodeIdx: number, side: 'top' | 'bottom', end: 1 | 2, enabled: boolean) => void;
  setNodeBastonLineKind: (nodeIdx: number, side: 'top' | 'bottom', end: 1 | 2, line: 1 | 2, kind: SteelKind) => void;
  setNodeBastonLineToFace: (nodeIdx: number, side: 'top' | 'bottom', end: 1 | 2, line: 1 | 2, enabled: boolean) => void;

  getSteelLayoutSettings: (dev: DevelopmentIn) => SteelLayoutSettings;
  clampNumber: (val: string | number, fallback: number) => number;
  safeParseJson: <T>(json: string) => { ok: boolean; value?: T; error?: string };
  fmt2: (n: number) => string;
  buildNodeSlots: (nodes: any[]) => NodeSlot[];
  nodeSteelKind: (node: any, side: 'top' | 'bottom', end: 1 | 2) => SteelKind;
  nodeToFaceEnabled: (node: any, side: 'top' | 'bottom', end: 1 | 2) => boolean;
  nodeBastonLineKind: (node: any, side: 'top' | 'bottom', end: 1 | 2, line: 1 | 2) => SteelKind;
  nodeBastonLineToFaceEnabled: (node: any, side: 'top' | 'bottom', end: 1 | 2, line: 1 | 2) => boolean;
  normalizeBastonCfg: (input: unknown) => BastonCfg;
  snapBastonM: (v: number) => number;
  formatStirrupsABCR: (p: StirrupsABCR) => string;
  pickDefaultABCRForH: (h_m: number, mode: 'sismico' | 'gravedad') => StirrupsABCR;
  parseStirrupsABCR: (text: string) => StirrupsABCR | null;
  normalizeDiaKey: (dia: string) => string;
}
