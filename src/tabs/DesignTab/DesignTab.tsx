import React, { useCallback, useMemo, useState } from 'react';
import { C } from '../../components/shared/tokens';
import { Icon, type IconName } from '../../components/shared/Icon';
import type { DevelopmentIn, ForceImportResponse } from '../../types';
import type {
  DesignConfig,
  DesignEngine,
  DesignResult,
  DesignRunResponse,
  FlexureResult,
  ShearResult,
} from './designTypes';
import { DEFAULT_DESIGN_CONFIG } from './designTypes';
import { listDesignDemandCombos } from './designMappers';

// ============================================================================
// Props
// ============================================================================
export interface DesignTabProps {
  dev: DevelopmentIn;
  /** Hash of the parametrization to detect staleness. */
  paramHash: string;
  /** Call backend /api/design/run */
  onRunDesign: (config: DesignConfig, dev: DevelopmentIn) => Promise<DesignRunResponse>;
  /** Apply a design proposal back to parametrization. */
  onApplyProposal?: (result: DesignResult) => void;
  /** Importa fuerzas para el grupo activo y actualiza el DevelopmentIn persistido. */
  onImportForcesGroup?: (file: File) => Promise<ForceImportResponse>;
}

// ============================================================================
// Sub-views
// ============================================================================
type DesignView = 'config' | 'results';

const FONT = "'Inter', 'SF Pro Display', 'Segoe UI', system-ui, sans-serif";

const S = {
  section: { marginBottom: 12 },
  sectionTitle: {
    fontSize: 10, fontWeight: 600, color: C.sub,
    marginBottom: 6, textTransform: 'uppercase' as const, letterSpacing: 0.5,
  },
  row: { display: 'flex', gap: 6, alignItems: 'center' as const, marginBottom: 6 },
  label: { fontSize: 11, color: C.sub, minWidth: 100 },
  select: {
    padding: '4px 6px', background: C.card,
    border: `1px solid ${C.border}`, borderRadius: 4,
    color: C.text, fontSize: 11, flex: 1,
  },
  runBtn: (busy: boolean) => ({
    display: 'flex', alignItems: 'center' as const, justifyContent: 'center' as const,
    gap: 6, border: 'none', borderRadius: 7, padding: '8px 14px',
    fontSize: 11, fontWeight: 800, letterSpacing: '0.05em',
    color: C.bg, background: busy ? C.dim : C.teal, cursor: busy ? 'default' : 'pointer',
    fontFamily: FONT, width: '100%',
  }),
  staleBar: {
    fontSize: 10, color: C.orange, background: `${C.orange}18`,
    border: `1px solid ${C.orange}44`, borderRadius: 5,
    padding: '4px 8px', marginBottom: 8,
  },
  statusBadge: (status: 'ok' | 'warning' | 'fail') => ({
    display: 'inline-flex', padding: '1px 6px', borderRadius: 4,
    fontSize: 9, fontWeight: 700,
    background: status === 'ok' ? `${C.teal}22` : status === 'warning' ? `${C.orange}22` : `${C.red}22`,
    color: status === 'ok' ? C.teal : status === 'warning' ? C.orange : C.red,
  }),
  table: {
    width: '100%', borderCollapse: 'collapse' as const, fontSize: 10,
    fontFamily: 'JetBrains Mono, monospace',
  },
  th: {
    textAlign: 'left' as const, padding: '4px 6px', borderBottom: `1px solid ${C.border}`,
    fontSize: 9, color: C.dim, fontWeight: 600, textTransform: 'uppercase' as const,
  },
  td: {
    padding: '3px 6px', borderBottom: `1px solid ${C.border}22`, color: C.text,
  },
  emptyMsg: { color: C.dim, fontSize: 11, textAlign: 'center' as const, padding: 20 },
} as const;

const ENGINE_LABELS: Record<DesignEngine, string> = {
  simplified: 'Simplificado',
  precise: 'Preciso',
  compare: 'Comparar',
};

// ============================================================================
// Component
// ============================================================================
export const DesignTab: React.FC<DesignTabProps> = ({
  dev, paramHash, onRunDesign, onApplyProposal, onImportForcesGroup,
}) => {
  const [config, setConfig] = useState<DesignConfig>(DEFAULT_DESIGN_CONFIG);
  const [result, setResult] = useState<DesignResult | null>(null);
  const [simplified, setSimplified] = useState<DesignResult | null>(null);
  const [precise, setPrecise] = useState<DesignResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const [view, setView] = useState<DesignView>('config');
  const [lastHash, setLastHash] = useState<string>('');

  const isStale = result && lastHash !== paramHash;
  const demandCombos = useMemo(() => listDesignDemandCombos(dev), [dev]);
  const canRunDesign = demandCombos.length > 0;
  const effectiveSelectedCombo = config.selectedCombo ?? demandCombos[0] ?? '';

  const handleRun = useCallback(async () => {
    if (!canRunDesign) {
      setError('No hay design_demands cargadas para esta viga. Cargalas desde JSON o importacion antes de calcular.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const resp = await onRunDesign(config, dev);
      setResult(resp.result);
      setSimplified(resp.simplified ?? null);
      setPrecise(resp.precise ?? null);
      setLastHash(paramHash);
      setView('results');
    } catch (e: any) {
      setError(String(e?.message ?? e));
    } finally {
      setBusy(false);
    }
  }, [canRunDesign, config, dev, paramHash, onRunDesign]);

  const handleImportForces = useCallback(async (file: File) => {
    if (!onImportForcesGroup) return;
    setBusy(true);
    setError(null);
    setImportMsg(null);
    try {
      const response = await onImportForcesGroup(file);
      const matched = response.results.find((result) => result.matched);
      const cases = matched?.matched_cases.length ?? response.detected_cases.length;
      setImportMsg(`Fuerzas importadas. Casos detectados: ${cases}.`);
    } catch (e: any) {
      setError(String(e?.message ?? e));
    } finally {
      setBusy(false);
    }
  }, [onImportForcesGroup]);

  const patchCfg = useCallback(<K extends keyof DesignConfig>(key: K, val: DesignConfig[K]) => {
    setConfig((prev) => ({ ...prev, [key]: val }));
  }, []);

  // Summary counts
  const summary = result?.summary ?? { okCount: 0, warningCount: 0, failCount: 0 };

  return (
    <div style={{ fontFamily: FONT }}>
      {/* Sub-nav: Config | Results */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
        {(['config', 'results'] as DesignView[]).map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => setView(v)}
            style={{
              padding: '4px 10px', borderRadius: 6, fontSize: 10, fontWeight: view === v ? 700 : 500,
              border: `1px solid ${view === v ? C.tealBd : C.border}`,
              background: view === v ? 'rgba(24,208,184,0.12)' : 'transparent',
              color: view === v ? C.teal : C.sub, cursor: 'pointer',
            }}
          >
            {v === 'config' ? 'Configuracion' : 'Resultados'}
            {v === 'results' && result && (
              <span style={{ marginLeft: 4, fontSize: 9 }}>
                ({summary.okCount}/{summary.okCount + summary.warningCount + summary.failCount})
              </span>
            )}
          </button>
        ))}
      </div>

      {isStale && (
        <div style={S.staleBar}>
          <Icon name="warning" size={11} color={C.orange} /> La parametrizacion cambio desde el ultimo calculo. Recalcula para actualizar.
        </div>
      )}

      {!canRunDesign && (
        <div style={S.staleBar}>
          <Icon name="warning" size={11} color={C.orange} /> No hay `design_demands` cargadas. Usa JSON/importacion para cargar Mu y Vu reales antes de ejecutar Diseno.
        </div>
      )}

      {/* ── CONFIG VIEW ── */}
      {view === 'config' && (
        <>
          {onImportForcesGroup && (
            <div style={S.section}>
              <div style={S.sectionTitle}>Importacion de fuerzas</div>
              <label style={{ ...S.runBtn(busy), display: 'flex', cursor: busy ? 'default' : 'pointer' }}>
                <Icon name="layers" size={12} color={C.bg} />
                {busy ? 'Procesando...' : 'IMPORTAR FUERZAS DEL GRUPO'}
                <input
                  type="file"
                  accept=".xlsx,.xlsm"
                  disabled={busy}
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = '';
                    if (file) void handleImportForces(file);
                  }}
                />
              </label>
              {importMsg && (
                <div style={{ fontSize: 10, color: C.sub, marginTop: 6 }}>{importMsg}</div>
              )}
            </div>
          )}

          <div style={S.section}>
            <div style={S.sectionTitle}>Motor de calculo</div>
            <div style={S.row}>
              <span style={S.label}>Motor</span>
              <select
                style={S.select}
                value={config.engine}
                onChange={(e) => patchCfg('engine', e.target.value as DesignEngine)}
              >
                {(['simplified', 'precise', 'compare'] as DesignEngine[]).map((eng) => (
                  <option key={eng} value={eng}>{ENGINE_LABELS[eng]}</option>
                ))}
              </select>
            </div>
            <div style={S.row}>
              <span style={S.label}>Alcance</span>
              <select
                style={S.select}
                value={config.runScope}
                onChange={(e) => patchCfg('runScope', e.target.value as DesignConfig['runScope'])}
              >
                <option value="active_beam">Viga activa</option>
                <option value="active_group">Grupo activo</option>
              </select>
            </div>
          </div>

          <div style={S.section}>
            <div style={S.sectionTitle}>Criterios</div>
            <div style={S.row}>
              <span style={S.label}>Norma</span>
              <span style={{ fontSize: 11, color: C.text }}>E.060</span>
            </div>
            <div style={S.row}>
              <span style={S.label}>Demanda</span>
              <select
                style={S.select}
                value={config.demandCase}
                onChange={(e) => patchCfg('demandCase', e.target.value as DesignConfig['demandCase'])}
              >
                <option value="envelope">Envolvente</option>
                <option value="selected_combo">Combinacion especifica</option>
              </select>
            </div>
            {config.demandCase === 'selected_combo' && (
              <div style={S.row}>
                <span style={S.label}>Combo</span>
                <select
                  style={S.select}
                  value={effectiveSelectedCombo}
                  disabled={!demandCombos.length}
                  onChange={(e) => patchCfg('selectedCombo', e.target.value || null)}
                >
                  {demandCombos.length === 0 && <option value="">Sin combos</option>}
                  {demandCombos.map((combo) => (
                    <option key={combo} value={combo}>{combo}</option>
                  ))}
                </select>
              </div>
            )}
            <label style={{ ...S.row, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={config.useCapacityChecks}
                onChange={(e) => patchCfg('useCapacityChecks', e.target.checked)}
              />
              <span style={{ fontSize: 11, color: C.text }}>Chequeos de capacidad</span>
            </label>
            <label style={{ ...S.row, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={config.useServiceChecks}
                onChange={(e) => patchCfg('useServiceChecks', e.target.checked)}
              />
              <span style={{ fontSize: 11, color: C.text }}>Chequeos de servicio</span>
            </label>
            <div style={S.row}>
              <span style={S.label}>Tolerancia (%)</span>
              <input
                type="number"
                min={0}
                max={20}
                step={1}
                value={config.tolerancePct}
                onChange={(e) => patchCfg('tolerancePct', Number(e.target.value) || 5)}
                style={{ ...S.select, width: 60, flex: 'unset' }}
              />
            </div>
          </div>

          <button
            type="button"
            style={S.runBtn(busy || !canRunDesign)}
            disabled={busy || !canRunDesign}
            onClick={handleRun}
          >
            <Icon name="check" size={12} color={C.bg} />
            {busy ? 'Calculando...' : 'CALCULAR DISENO'}
          </button>

          {error && (
            <div style={{ fontSize: 10, color: C.red, marginTop: 6 }}>{error}</div>
          )}
        </>
      )}

      {/* ── RESULTS VIEW ── */}
      {view === 'results' && (
        <>
          {!result ? (
            <div style={S.emptyMsg}>No hay resultados. Ejecuta el calculo primero.</div>
          ) : (
            <>
              {/* Summary bar */}
              <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                <span style={S.statusBadge('ok')}>{summary.okCount} Cumple</span>
                <span style={S.statusBadge('warning')}>{summary.warningCount} Advertencia</span>
                <span style={S.statusBadge('fail')}>{summary.failCount} No cumple</span>
              </div>

              {/* Flexure table */}
              <div style={S.section}>
                <div style={S.sectionTitle}>Flexion</div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={S.table}>
                    <thead>
                      <tr>
                        <th style={S.th}>Ubicacion</th>
                        <th style={S.th}>Cara</th>
                        <th style={S.th}>Mu</th>
                        <th style={S.th}>As req</th>
                        <th style={S.th}>As prov</th>
                        <th style={S.th}>phiMn</th>
                        <th style={S.th}>Estado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.flexure.map((f, i) => (
                        <tr key={i}>
                          <td style={S.td}>{f.location}</td>
                          <td style={S.td}>{f.face === 'top' ? '(-)' : '(+)'}</td>
                          <td style={S.td}>{f.Mu_tf_m.toFixed(2)}</td>
                          <td style={S.td}>{f.As_req_cm2.toFixed(2)}</td>
                          <td style={S.td}>{f.As_prov_cm2.toFixed(2)}</td>
                          <td style={S.td}>{f.phiMn_tf_m.toFixed(2)}</td>
                          <td style={S.td}><span style={S.statusBadge(f.status)}>{f.status}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Shear table */}
              <div style={S.section}>
                <div style={S.sectionTitle}>Corte</div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={S.table}>
                    <thead>
                      <tr>
                        <th style={S.th}>Ubicacion</th>
                        <th style={S.th}>Vu</th>
                        <th style={S.th}>Vc</th>
                        <th style={S.th}>phiVn</th>
                        <th style={S.th}>s prov</th>
                        <th style={S.th}>Estado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.shear.map((s, i) => (
                        <tr key={i}>
                          <td style={S.td}>{s.location}</td>
                          <td style={S.td}>{s.Vu_tf.toFixed(2)}</td>
                          <td style={S.td}>{s.Vc_tf.toFixed(2)}</td>
                          <td style={S.td}>{s.phiVn_tf.toFixed(2)}</td>
                          <td style={S.td}>{s.s_prov_cm.toFixed(1)}</td>
                          <td style={S.td}><span style={S.statusBadge(s.status)}>{s.status}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Compare mode */}
              {config.engine === 'compare' && simplified && precise && (
                <div style={S.section}>
                  <div style={S.sectionTitle}>Comparacion de motores</div>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={S.table}>
                      <thead>
                        <tr>
                          <th style={S.th}>Ubicacion</th>
                          <th style={S.th}>d simp</th>
                          <th style={S.th}>d prec</th>
                          <th style={S.th}>As simp</th>
                          <th style={S.th}>As prec</th>
                          <th style={S.th}>phiMn simp</th>
                          <th style={S.th}>phiMn prec</th>
                        </tr>
                      </thead>
                      <tbody>
                        {simplified.flexure.map((sf, i) => {
                          const pf = precise.flexure[i];
                          if (!pf) return null;
                          return (
                            <tr key={i}>
                              <td style={S.td}>{sf.location}</td>
                              <td style={S.td}>{sf.d_cm.toFixed(1)}</td>
                              <td style={S.td}>{(pf.d_precise_cm ?? pf.d_cm).toFixed(1)}</td>
                              <td style={S.td}>{sf.As_req_cm2.toFixed(2)}</td>
                              <td style={S.td}>{pf.As_req_cm2.toFixed(2)}</td>
                              <td style={S.td}>{sf.phiMn_tf_m.toFixed(2)}</td>
                              <td style={S.td}>{pf.phiMn_tf_m.toFixed(2)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Detailing warnings */}
              {result.detailingWarnings.length > 0 && (
                <div style={S.section}>
                  <div style={S.sectionTitle}>Advertencias de detallado</div>
                  {result.detailingWarnings.map((w, i) => (
                    <div key={i} style={{ fontSize: 10, color: C.orange, marginBottom: 3 }}>
                      <Icon name="warning" size={9} color={C.orange} /> {w}
                    </div>
                  ))}
                </div>
              )}

              {/* Actions */}
              <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                <button
                  type="button"
                  style={{ ...S.runBtn(busy), background: C.teal, flex: 1 }}
                  disabled={busy}
                  onClick={handleRun}
                >
                  Recalcular
                </button>
                {onApplyProposal && (
                  <button
                    type="button"
                    style={{ ...S.runBtn(false), background: C.blue, flex: 1 }}
                    onClick={() => onApplyProposal(result)}
                  >
                    Aplicar propuesta
                  </button>
                )}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
};
