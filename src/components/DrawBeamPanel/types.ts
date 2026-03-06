import type { NivelType, Ordinal } from '../shared/tokens';
import type { DevelopmentIn } from '../../types';

export interface ConcretoData {
  fc: number;           // kg/cm²
  recubrimiento: number; // cm
  b: number;            // cm
  h: number;            // cm
}

export interface AceroData {
  fy: number;           // kg/cm²
  corrido_sup: string;  // ej: "2Ø5/8"
  corrido_inf: string;
  bastones: string[];   // ej: ["1Ø3/4 Z1", "1Ø3/4 Z3"]
}

export interface MetradoData {
  volConcreto: number;  // m³
  pesoAcero: number;    // kg
  encofrado: number;    // m²
}

export interface GrupoViga {
  id: string;
  nivelInicial: Ordinal;
  nivelFinal: Ordinal;
  concreto?: ConcretoData;
  acero?: AceroData;
  metrados?: MetradoData;
  development?: DevelopmentIn;
}

export interface Viga {
  id: string;           // "VT-01"
  type: NivelType;
  number: number;
  groups: GrupoViga[];
}

export type PanelView = 'config' | 'nueva' | 'vigas' | 'editar' | 'exportar';
