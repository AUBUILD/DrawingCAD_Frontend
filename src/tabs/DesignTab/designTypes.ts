import type { DesignFace } from '../../types';

export type DesignEngine = 'simplified' | 'precise' | 'compare';

export interface DesignConfig {
  norm: 'E060';
  engine: DesignEngine;
  runScope: 'active_beam' | 'active_group';
  demandCase: 'envelope' | 'selected_combo';
  selectedCombo?: string | null;
  useCapacityChecks: boolean;
  useServiceChecks: boolean;
  tolerancePct: number;
  lockAppliedDesign: boolean;
}

export const DEFAULT_DESIGN_CONFIG: DesignConfig = {
  norm: 'E060',
  engine: 'simplified',
  runScope: 'active_beam',
  demandCase: 'envelope',
  selectedCombo: null,
  useCapacityChecks: true,
  useServiceChecks: false,
  tolerancePct: 5,
  lockAppliedDesign: false,
};

export interface DesignMaterialsInput {
  fc_kgcm2: number;
  fy_kgcm2: number;
  Es_kgcm2: number;
  ecu: number;
}

export interface DesignSectionGeometryInput {
  b_cm: number;
  h_cm: number;
  d_cm: number;
  dp_cm: number;
  L_m: number;
}

export interface DesignSectionReinforcementInput {
  As_tension_cm2: number;
  As_compression_cm2: number;
}

export interface DesignSectionDemandInput {
  combo: string;
  Mu_tf_m: number;
  Vu_tf: number;
}

export interface DesignSectionInput {
  location: string;
  face: DesignFace;
  spanIndex: number;
  role: 'support_left' | 'midspan' | 'support_right';
  geometry: DesignSectionGeometryInput;
  reinforcement: DesignSectionReinforcementInput;
  demand: DesignSectionDemandInput;
}

export interface DesignInput {
  beamId: string;
  groupId?: string | null;
  settings: DesignConfig;
  materials: DesignMaterialsInput;
  availableCombos: string[];
  source: 'manual' | 'etabs' | 'imported' | 'unknown';
  sections: DesignSectionInput[];
}

export interface FlexureResult {
  location: string;
  face: DesignFace;
  Mu_tf_m: number;
  d_cm: number;
  d_precise_cm?: number;
  As_min_cm2: number;
  As_max_cm2: number;
  As_req_cm2: number;
  As_prov_cm2: number;
  Mn_tf_m: number;
  phiMn_tf_m: number;
  rho: number;
  rho_min: number;
  rho_max: number;
  status: 'ok' | 'warning' | 'fail';
  message?: string;
}

export interface ShearResult {
  location: string;
  Vu_tf: number;
  Vc_tf: number;
  Vs_tf: number;
  phiVn_tf: number;
  s_req_cm: number;
  s_prov_cm: number;
  Av_cm2: number;
  status: 'ok' | 'warning' | 'fail';
  message?: string;
}

export interface DesignSnapshot {
  inputHash: string;
  generatedAt: string;
  engine: DesignEngine;
  source: 'manual' | 'auto';
}

export interface DesignResult {
  engine: DesignEngine;
  snapshot: DesignSnapshot;
  flexure: FlexureResult[];
  shear: ShearResult[];
  detailingWarnings: string[];
  summary: {
    okCount: number;
    warningCount: number;
    failCount: number;
  };
}

export interface DesignRunRequest {
  input: DesignInput;
}

export interface DesignRunResponse {
  result: DesignResult;
  simplified?: DesignResult;
  precise?: DesignResult;
}
