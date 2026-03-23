/**
 * Adapter: DevelopmentIn -> DesignInput for backend /api/design/run
 * Resolves real design demands from DevelopmentIn.design_demands.
 */
import type {
  DesignDemandCaseIn,
  DesignDemandsIn,
  DesignFace,
  DesignSectionForceIn,
  DevelopmentIn,
} from '../../types';
import type {
  DesignConfig,
  DesignInput,
  DesignRunResponse,
  DesignSectionDemandInput,
  DesignSectionInput,
} from './designTypes';

const _env = (import.meta as any).env ?? {};
const API_BASE: string = _env.VITE_API_URL ?? _env.VITE_API_BASE ?? '';

const REBAR_AREA_CM2: Record<string, number> = {
  '6mm': 0.28,
  '8mm': 0.5,
  '3/8': 0.713,
  '12mm': 1.13,
  '1/2': 1.267,
  '5/8': 1.979,
  '3/4': 2.85,
  '1': 5.067,
  '1-3/8': 9.583,
};

const DEFAULT_MATERIALS = {
  fc_kgcm2: 210,
  fy_kgcm2: 4200,
  Es_kgcm2: 2_000_000,
  ecu: 0.003,
} as const;

type SectionTemplate = Omit<DesignSectionInput, 'demand'>;
type NormalizedDemandCase = {
  name: string;
  sections: DesignSectionForceIn[];
};
type NormalizedDemandCatalog = {
  source: DesignInput['source'];
  cases: NormalizedDemandCase[];
};

function toNumber(value: unknown, fallback = 0): number {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function normalizeFace(value: unknown): DesignFace {
  return String(value ?? '').trim().toLowerCase() === 'bottom' ? 'bottom' : 'top';
}

function normalizeDemandSection(raw: any): DesignSectionForceIn | null {
  if (!raw || typeof raw !== 'object') return null;
  const location = String(raw.location ?? '').trim();
  if (!location) return null;
  const roleRaw = String(raw.role ?? '').trim().toLowerCase();
  const role = roleRaw === 'support_left' || roleRaw === 'midspan' || roleRaw === 'support_right'
    ? roleRaw
    : undefined;
  return {
    location,
    face: normalizeFace(raw.face),
    Mu_tf_m: toNumber(raw.Mu_tf_m ?? raw.mu_tf_m ?? raw.Mu ?? raw.mu, 0),
    Vu_tf: toNumber(raw.Vu_tf ?? raw.vu_tf ?? raw.Vu ?? raw.vu, 0),
    station_m: raw.station_m == null ? undefined : toNumber(raw.station_m, 0),
    span_index: raw.span_index == null ? undefined : Math.max(0, Math.floor(toNumber(raw.span_index, 0))),
    role,
  };
}

function normalizeDemandCatalog(dev: DevelopmentIn): NormalizedDemandCatalog | null {
  const raw = ((dev as any).design_demands ?? (dev as any).designDemands) as DesignDemandsIn | undefined;
  if (!raw || !Array.isArray(raw.cases)) return null;
  const sourceRaw = String(raw.source ?? '').trim().toLowerCase();
  const source: DesignInput['source'] =
    sourceRaw === 'manual' || sourceRaw === 'etabs' || sourceRaw === 'imported'
      ? sourceRaw
      : 'unknown';
  const cases = raw.cases
    .map((entry: DesignDemandCaseIn, index) => {
      const name = String((entry as any)?.name ?? (entry as any)?.combo ?? `CASE_${index + 1}`).trim();
      const sections = Array.isArray((entry as any)?.sections)
        ? (entry as any).sections.map(normalizeDemandSection).filter(Boolean) as DesignSectionForceIn[]
        : [];
      if (!name || sections.length === 0) return null;
      return { name, sections };
    })
    .filter(Boolean) as NormalizedDemandCase[];
  if (cases.length === 0) return null;
  return { source, cases };
}

function demandKey(location: string, face: DesignFace) {
  return `${location}::${face}`;
}

function steelArea(meta: any): number {
  if (!meta || typeof meta !== 'object') return 0;
  const dia1 = String(meta.diameter ?? '').trim();
  const dia2 = String(meta.diameter2 ?? '').trim();
  return toNumber(meta.qty, 0) * (REBAR_AREA_CM2[dia1] ?? 0)
    + toNumber(meta.qty2, 0) * (REBAR_AREA_CM2[dia2] ?? 0);
}

function buildSectionTemplates(dev: DevelopmentIn): SectionTemplate[] {
  const recub = toNumber((dev as any).recubrimiento ?? 0.04, 0.04);
  const recubCm = recub < 1 ? recub * 100 : recub;

  return (dev.spans ?? []).flatMap((span, spanIndex) => {
    const hCm = toNumber(span.h, 0.5) * 100;
    const bCm = toNumber((span as any).b ?? 0.25, 0.25) * 100;
    const lengthM = toNumber(span.L, 3);
    const dTop = Math.max(hCm - recubCm, 0);
    const dBottom = Math.max(hCm - recubCm, 0);
    const AsTop = steelArea((span as any).steel_top);
    const AsBottom = steelArea((span as any).steel_bottom);

    const base = {
      spanIndex,
      geometry: {
        b_cm: bCm,
        h_cm: hCm,
        d_cm: dTop,
        dp_cm: recubCm,
        L_m: lengthM,
      },
    };

    return [
      {
        ...base,
        location: `T${spanIndex + 1}-Izq`,
        face: 'top' as const,
        role: 'support_left' as const,
        reinforcement: {
          As_tension_cm2: AsTop,
          As_compression_cm2: AsBottom,
        },
      },
      {
        ...base,
        location: `T${spanIndex + 1}-Centro`,
        face: 'bottom' as const,
        role: 'midspan' as const,
        geometry: {
          ...base.geometry,
          d_cm: dBottom,
        },
        reinforcement: {
          As_tension_cm2: AsBottom,
          As_compression_cm2: AsTop,
        },
      },
      {
        ...base,
        location: `T${spanIndex + 1}-Der`,
        face: 'top' as const,
        role: 'support_right' as const,
        reinforcement: {
          As_tension_cm2: AsTop,
          As_compression_cm2: AsBottom,
        },
      },
    ];
  });
}

function listMissingSections(templates: SectionTemplate[], sectionMap: Map<string, DesignSectionForceIn>) {
  return templates
    .filter((section) => !sectionMap.has(demandKey(section.location, section.face)))
    .map((section) => `${section.location} (${section.face})`);
}

function formatMissingSections(missing: string[]) {
  if (missing.length === 0) return '';
  const preview = missing.slice(0, 6).join(', ');
  return missing.length > 6 ? `${preview}, ...` : preview;
}

function pickByAbs(values: Array<{ value: number; combo: string }>) {
  return values.reduce((best, current) => Math.abs(current.value) > Math.abs(best.value) ? current : best);
}

export function listDesignDemandCombos(dev: DevelopmentIn): string[] {
  return normalizeDemandCatalog(dev)?.cases.map((entry) => entry.name) ?? [];
}

export function buildDesignInput(config: DesignConfig, dev: DevelopmentIn): DesignInput {
  const catalog = normalizeDemandCatalog(dev);
  if (!catalog) {
    throw new Error('No hay design_demands cargadas para esta viga. Cargalas desde JSON o importacion antes de ejecutar Diseno.');
  }

  const templates = buildSectionTemplates(dev);
  if (templates.length === 0) {
    throw new Error('La viga activa no tiene tramos para construir el DesignInput.');
  }

  const availableCombos = catalog.cases.map((entry) => entry.name);
  const resolvedSelectedCombo = config.demandCase === 'selected_combo'
    ? (config.selectedCombo && availableCombos.includes(config.selectedCombo) ? config.selectedCombo : availableCombos[0] ?? null)
    : config.selectedCombo ?? null;

  let resolvedDemands = new Map<string, DesignSectionDemandInput>();

  if (config.demandCase === 'selected_combo') {
    const selectedCase = catalog.cases.find((entry) => entry.name === resolvedSelectedCombo);
    if (!selectedCase) {
      throw new Error(`No existe el combo seleccionado "${resolvedSelectedCombo ?? ''}" en design_demands.`);
    }
    const sectionMap = new Map(selectedCase.sections.map((section) => [demandKey(section.location, section.face), section]));
    const missing = listMissingSections(templates, sectionMap);
    if (missing.length > 0) {
      throw new Error(`Faltan demandas para el combo "${selectedCase.name}" en: ${formatMissingSections(missing)}.`);
    }
    resolvedDemands = new Map(
      templates.map((section) => {
        const demand = sectionMap.get(demandKey(section.location, section.face))!;
        return [demandKey(section.location, section.face), {
          combo: selectedCase.name,
          Mu_tf_m: demand.Mu_tf_m,
          Vu_tf: demand.Vu_tf,
        }];
      }),
    );
  } else {
    resolvedDemands = new Map(
      templates.map((section) => {
        const matches = catalog.cases
          .map((entry) => {
            const found = entry.sections.find((candidate) => candidate.location === section.location && candidate.face === section.face);
            return found ? { combo: entry.name, section: found } : null;
          })
          .filter(Boolean) as Array<{ combo: string; section: DesignSectionForceIn }>;

        if (matches.length === 0) {
          throw new Error(`No hay demandas envelope para ${section.location} (${section.face}).`);
        }

        const muCtrl = pickByAbs(matches.map((entry) => ({ combo: entry.combo, value: entry.section.Mu_tf_m })));
        const vuCtrl = pickByAbs(matches.map((entry) => ({ combo: entry.combo, value: entry.section.Vu_tf })));

        return [demandKey(section.location, section.face), {
          combo: 'ENVELOPE',
          Mu_tf_m: muCtrl.value,
          Vu_tf: vuCtrl.value,
        }];
      }),
    );
  }

  return {
    beamId: dev.name ?? 'BEAM',
    groupId: null,
    settings: {
      ...config,
      selectedCombo: resolvedSelectedCombo,
    },
    materials: { ...DEFAULT_MATERIALS },
    availableCombos,
    source: catalog.source,
    sections: templates.map((section) => ({
      ...section,
      demand: resolvedDemands.get(demandKey(section.location, section.face))!,
    })),
  };
}

function toApiRequest(input: DesignInput) {
  return {
    input: {
      beam_id: input.beamId,
      group_id: input.groupId ?? null,
      settings: {
        norm: input.settings.norm,
        engine: input.settings.engine,
        run_scope: input.settings.runScope,
        demand_case: input.settings.demandCase,
        selected_combo: input.settings.selectedCombo ?? null,
        use_capacity_checks: input.settings.useCapacityChecks,
        use_service_checks: input.settings.useServiceChecks,
        tolerance_pct: input.settings.tolerancePct,
        lock_applied_design: input.settings.lockAppliedDesign,
      },
      materials: {
        fc_kgcm2: input.materials.fc_kgcm2,
        fy_kgcm2: input.materials.fy_kgcm2,
        Es_kgcm2: input.materials.Es_kgcm2,
        ecu: input.materials.ecu,
      },
      available_combos: input.availableCombos,
      source: input.source,
      sections: input.sections.map((section) => ({
        location: section.location,
        face: section.face,
        span_index: section.spanIndex,
        role: section.role,
        geometry: {
          b_cm: section.geometry.b_cm,
          h_cm: section.geometry.h_cm,
          d_cm: section.geometry.d_cm,
          dp_cm: section.geometry.dp_cm,
          L_m: section.geometry.L_m,
        },
        reinforcement: {
          as_tension_cm2: section.reinforcement.As_tension_cm2,
          as_compression_cm2: section.reinforcement.As_compression_cm2,
        },
        demand: {
          combo: section.demand.combo,
          Mu_tf_m: section.demand.Mu_tf_m,
          Vu_tf: section.demand.Vu_tf,
        },
      })),
    },
  };
}

export function computeParamHash(dev: DevelopmentIn): string {
  const designDemands = normalizeDemandCatalog(dev);
  const key = JSON.stringify({
    spans: dev.spans?.map((span) => ({
      L: span.L,
      h: span.h,
      b: (span as any).b,
      steel_top: (span as any).steel_top,
      steel_bottom: (span as any).steel_bottom,
    })),
    nodes: dev.nodes?.length,
    recubrimiento: (dev as any).recubrimiento,
    design_demands: designDemands,
  });
  let hash = 0;
  for (let index = 0; index < key.length; index++) {
    hash = ((hash << 5) - hash + key.charCodeAt(index)) | 0;
  }
  return Math.abs(hash).toString(36);
}

export async function runDesignApi(config: DesignConfig, dev: DevelopmentIn): Promise<DesignRunResponse> {
  const url = `${API_BASE}/api/design/run`;
  const input = buildDesignInput(config, dev);
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(toApiRequest(input)),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Design run failed (${resp.status}): ${text}`);
  }
  return mapRunResponse(await resp.json());
}

function mapRunResponse(raw: any): DesignRunResponse {
  const mapFlexure = (f: any) => ({
    location: f.location,
    face: f.face,
    Mu_tf_m: f.Mu_tf_m ?? f.mu_tf_m ?? 0,
    d_cm: f.d_cm ?? 0,
    d_precise_cm: f.d_precise_cm ?? undefined,
    As_min_cm2: f.As_min_cm2 ?? f.as_min_cm2 ?? 0,
    As_max_cm2: f.As_max_cm2 ?? f.as_max_cm2 ?? 0,
    As_req_cm2: f.As_req_cm2 ?? f.as_req_cm2 ?? 0,
    As_prov_cm2: f.As_prov_cm2 ?? f.as_prov_cm2 ?? 0,
    Mn_tf_m: f.Mn_tf_m ?? f.mn_tf_m ?? 0,
    phiMn_tf_m: f.phiMn_tf_m ?? f.phimn_tf_m ?? 0,
    rho: f.rho ?? 0,
    rho_min: f.rho_min ?? 0,
    rho_max: f.rho_max ?? 0,
    status: f.status ?? 'ok',
    message: f.message ?? '',
  });
  const mapShear = (s: any) => ({
    location: s.location,
    Vu_tf: s.Vu_tf ?? s.vu_tf ?? 0,
    Vc_tf: s.Vc_tf ?? s.vc_tf ?? 0,
    Vs_tf: s.Vs_tf ?? s.vs_tf ?? 0,
    phiVn_tf: s.phiVn_tf ?? s.phivn_tf ?? 0,
    s_req_cm: s.s_req_cm ?? 0,
    s_prov_cm: s.s_prov_cm ?? 0,
    Av_cm2: s.Av_cm2 ?? s.av_cm2 ?? 1.42,
    status: s.status ?? 'ok',
    message: s.message ?? '',
  });
  const mapResult = (result: any) => ({
    engine: result.engine,
    snapshot: {
      inputHash: result.snapshot?.input_hash ?? result.snapshot?.inputHash ?? '',
      generatedAt: result.snapshot?.generated_at ?? result.snapshot?.generatedAt ?? '',
      engine: result.snapshot?.engine ?? result.engine,
      source: result.snapshot?.source ?? 'manual',
    },
    flexure: (result.flexure ?? []).map(mapFlexure),
    shear: (result.shear ?? []).map(mapShear),
    detailingWarnings: result.detailing_warnings ?? result.detailingWarnings ?? [],
    summary: {
      okCount: result.summary?.okCount ?? result.summary?.ok_count ?? 0,
      warningCount: result.summary?.warningCount ?? result.summary?.warning_count ?? 0,
      failCount: result.summary?.failCount ?? result.summary?.fail_count ?? 0,
    },
  });
  return {
    result: mapResult(raw.result),
    simplified: raw.simplified ? mapResult(raw.simplified) : undefined,
    precise: raw.precise ? mapResult(raw.precise) : undefined,
  };
}
