import React from 'react';
import type {
  DevelopmentIn,
  SpanIn,
  StirrupsDistributionIn,
  StirrupsSectionIn,
  SteelMeta,
  SteelKind,
  SteelLayoutSettings,
} from '../../types';

/**
 * Slot de nodo para conexión
 */
interface NodeSlot {
  nodeIdx: number;
  end: 1 | 2;
  label: string;
}

/**
 * Tipo BastonCfg (del App.tsx)
 */
interface BastonCfg {
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

/**
 * Tipo StirrupsABCR (del App.tsx)
 */
interface StirrupsABCR {
  A_m: number;
  b_n: number;
  B_m: number;
  c_n: number;
  C_m: number;
  R_m: number;
}

/**
 * Props para SteelTab
 */
export interface SteelTabProps {
  // Data
  dev: DevelopmentIn;
  appCfg: any;

  // Draft states
  steelLayoutDraft: string;
  setSteelLayoutDraft: (draft: string) => void;
  steelLayoutDraftDirtyRef: React.MutableRefObject<boolean>;

  // Baston length edits
  bastonLenEdits: Record<string, string>;
  setBastonLenEdits: React.Dispatch<React.SetStateAction<Record<string, string>>>;

  // Stirrups ABCR edits
  stirrupsAbcrEdits: Record<string, string>;
  setStirrupsAbcrEdits: React.Dispatch<React.SetStateAction<Record<string, string>>>;

  // Warning state
  warning: string | null;
  setWarning: (warning: string | null) => void;

  // Update functions
  updateDevPatch: (patch: Partial<DevelopmentIn>) => void;
  updateSpanSteel: (spanIdx: number, side: 'top' | 'bottom', patch: Partial<SteelMeta>) => void;
  updateSpanStirrups: (spanIdx: number, patch: Partial<StirrupsDistributionIn>) => void;
  updateSpanStirrupsSection: (spanIdx: number, patch: Partial<StirrupsSectionIn>) => void;
  updateBaston: (spanIdx: number, side: 'top' | 'bottom', zone: 'z1' | 'z2' | 'z3', patch: Partial<BastonCfg>) => void;
  setNodeSteelKind: (nodeIdx: number, side: 'top' | 'bottom', end: 1 | 2, kind: SteelKind) => void;
  setNodeToFace: (nodeIdx: number, side: 'top' | 'bottom', end: 1 | 2, enabled: boolean) => void;
  setNodeBastonLineKind: (nodeIdx: number, side: 'top' | 'bottom', end: 1 | 2, line: 1 | 2, kind: SteelKind) => void;
  setNodeBastonLineToFace: (nodeIdx: number, side: 'top' | 'bottom', end: 1 | 2, line: 1 | 2, enabled: boolean) => void;

  // Helper functions
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

/**
 * Componente SteelTab - Configuración de acero corrido
 *
 * Incluye:
 * - Distribución en sección (E.060)
 * - Acero corrido superior e inferior por tramo
 * - Estribos en sección por tramo
 * - Conexión en nodos (continuo/gancho/anclaje)
 * - Bastones (superior e inferior)
 * - Distribución de estribos por tramo (ABCR)
 */
export const SteelTab: React.FC<SteelTabProps> = ({
  dev,
  appCfg,
  steelLayoutDraft,
  setSteelLayoutDraft,
  steelLayoutDraftDirtyRef,
  bastonLenEdits,
  setBastonLenEdits,
  stirrupsAbcrEdits,
  setStirrupsAbcrEdits,
  warning,
  setWarning,
  updateDevPatch,
  updateSpanSteel,
  updateSpanStirrups,
  updateSpanStirrupsSection,
  updateBaston,
  setNodeSteelKind,
  setNodeToFace,
  setNodeBastonLineKind,
  setNodeBastonLineToFace,
  getSteelLayoutSettings,
  clampNumber,
  safeParseJson,
  fmt2,
  buildNodeSlots,
  nodeSteelKind,
  nodeToFaceEnabled,
  nodeBastonLineKind,
  nodeBastonLineToFaceEnabled,
  normalizeBastonCfg,
  snapBastonM,
  formatStirrupsABCR,
  pickDefaultABCRForH,
  parseStirrupsABCR,
  normalizeDiaKey,
}) => {
  return (
    <div className="form">
      <div className="muted">
        <b>Acero corrido</b> (por tramo). Se dibuja en cyan en la Vista previa 2D.
      </div>

      <div>
        <div className="sectionHeader">
          <div>Distribución en sección (E.060)</div>
          <div className="mutedSmall">Auto-optimizada (esquinas primero + simetría). Editable y persistible.</div>
        </div>

        {(() => {
          const s = getSteelLayoutSettings(dev);
          const dag = clampNumber((s as any).dag_cm ?? 2.5, 2.5);
          const maxRows = Math.max(1, Math.min(3, Math.round(clampNumber((s as any).max_rows_per_face ?? 3, 3))));
          const usePractical = Boolean((s as any).use_practical_min ?? true);
          const practicalMin = clampNumber((s as any).practical_min_cm ?? 4.0, 4.0);

          return (
            <>
              <div className="row" style={{ display: 'grid', gridTemplateColumns: '200px 160px 200px 160px', gap: 10, alignItems: 'center' }}>
                <div className="mutedSmall">Dag (cm)</div>
                <input
                  className="cellInput"
                  type="number"
                  step="0.1"
                  min={0.5}
                  value={String(dag)}
                  onChange={(e) => {
                    const next = clampNumber(e.target.value, dag);
                    updateDevPatch({ steel_layout_settings: { ...s, dag_cm: Math.max(0.5, next) } as any } as any);
                  }}
                />

                <div className="mutedSmall">Máx. filas por cara</div>
                <input
                  className="cellInput"
                  type="number"
                  step="1"
                  min={1}
                  max={3}
                  value={String(maxRows)}
                  onChange={(e) => {
                    const next = Math.max(1, Math.min(3, Math.round(clampNumber(e.target.value, maxRows))));
                    updateDevPatch({ steel_layout_settings: { ...s, max_rows_per_face: next } as any } as any);
                  }}
                />
              </div>

              <div className="row" style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: 10, alignItems: 'center', marginTop: 8 }}>
                <label className="check" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  <input
                    type="checkbox"
                    checked={usePractical}
                    onChange={(e) => updateDevPatch({ steel_layout_settings: { ...s, use_practical_min: e.target.checked } as any } as any)}
                  />
                  <span className="mutedSmall">Aplicar mínimo práctico (≥ 4.0 cm)</span>
                </label>

                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div className="mutedSmall">Mín. práctico (cm)</div>
                  <input
                    className="cellInput"
                    style={{ maxWidth: 120 }}
                    type="number"
                    step="0.1"
                    min={2.5}
                    value={String(practicalMin)}
                    disabled={!usePractical}
                    onChange={(e) => {
                      const next = clampNumber(e.target.value, practicalMin);
                      updateDevPatch({ steel_layout_settings: { ...s, practical_min_cm: Math.max(2.5, next) } as any } as any);
                    }}
                  />
                </div>
              </div>

              <div style={{ marginTop: 10 }}>
                <div className="mutedSmall" style={{ marginBottom: 6 }}>
                  Avanzado (JSON): reglas de columnas por ancho + tabla de diámetros reales (cm).
                </div>
                <textarea
                  className="cellInput"
                  style={{ width: '100%', minHeight: 160, fontFamily: 'ui-monospace, Menlo, Consolas, monospace' }}
                  value={steelLayoutDraft}
                  onChange={(e) => {
                    steelLayoutDraftDirtyRef.current = true;
                    setSteelLayoutDraft(e.target.value);
                  }}
                  onBlur={() => {
                    const parsed = safeParseJson<SteelLayoutSettings>(steelLayoutDraft);
                    steelLayoutDraftDirtyRef.current = false;
                    if (!parsed.ok) {
                      setWarning(`Layout JSON inválido: ${parsed.error}`);
                      return;
                    }
                    setWarning(null);
                    updateDevPatch({ steel_layout_settings: parsed.value as any } as any);
                  }}
                />
              </div>
            </>
          );
        })()}
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
          <div>Estribos en sección por tramo</div>
          <div className="mutedSmall">Rectangular concéntrico. Afecta el recubrimiento efectivo del layout.</div>
        </div>

        <div className="matrix" style={{ gridTemplateColumns: `160px repeat(${(dev.spans ?? []).length}, 130px)` }}>
          <div className="cell head"></div>
          {(dev.spans ?? []).map((_, i) => (
            <div className={'cell head'} key={`stsec-span-head-${i}`}>
              <div className="mono">Tramo {i + 1}</div>
            </div>
          ))}

          <div className="cell rowLabel">Cantidad (concéntricos)</div>
          {(dev.spans ?? []).map((s, i) => (
            <div className="cell" key={`stsec-qty-${i}`}>
              <input
                className="cellInput"
                type="number"
                step="1"
                min={0}
                value={(s as any).stirrups_section?.qty ?? 1}
                onChange={(e) => {
                  const next = Math.max(0, Math.floor(clampNumber(e.target.value, (s as any).stirrups_section?.qty ?? 1)));
                  updateSpanStirrupsSection(i, { qty: next });
                }}
              />
            </div>
          ))}

          <div className="cell rowLabel">Diámetro</div>
          {(dev.spans ?? []).map((s, i) => (
            <div className="cell" key={`stsec-dia-${i}`}>
              <select
                className="cellInput"
                value={String((s as any).stirrups_section?.diameter ?? '3/8')}
                onChange={(e) => updateSpanStirrupsSection(i, { diameter: e.target.value })}
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
                if (!n) return null;
                const v = nodeSteelKind(n, 'top', s.end);
                const toFace = nodeToFaceEnabled(n, 'top', s.end);
                return (
                  <div className="cell" key={`n-top-sel-${s.nodeIdx}-${s.end}`}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <select
                        className="cellInput"
                        value={v}
                        onChange={(e) => setNodeSteelKind(s.nodeIdx, 'top', s.end, e.target.value as any)}
                      >
                        <option value="continuous">Continuo</option>
                        <option value="hook">Gancho</option>
                        <option value="development">Anclaje</option>
                      </select>
                      <label title="Ajustar gancho/anclaje a la cara del nodo" style={{ display: 'inline-flex', alignItems: 'center' }}>
                        <input
                          type="checkbox"
                          checked={toFace}
                          disabled={v === 'continuous'}
                          onChange={(e) => setNodeToFace(s.nodeIdx, 'top', s.end, e.target.checked)}
                        />
                      </label>
                    </div>
                  </div>
                );
              })}

              <div className="cell rowLabel">Inferior</div>
              {slots.map((s) => {
                const n = nodes[s.nodeIdx];
                if (!n) return null;
                const v = nodeSteelKind(n, 'bottom', s.end);
                const toFace = nodeToFaceEnabled(n, 'bottom', s.end);
                return (
                  <div className="cell" key={`n-bot-sel-${s.nodeIdx}-${s.end}`}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <select
                        className="cellInput"
                        value={v}
                        onChange={(e) => setNodeSteelKind(s.nodeIdx, 'bottom', s.end, e.target.value as any)}
                      >
                        <option value="continuous">Continuo</option>
                        <option value="hook">Gancho</option>
                        <option value="development">Anclaje</option>
                      </select>
                      <label title="Ajustar gancho/anclaje a la cara del nodo" style={{ display: 'inline-flex', alignItems: 'center' }}>
                        <input
                          type="checkbox"
                          checked={toFace}
                          disabled={v === 'continuous'}
                          onChange={(e) => setNodeToFace(s.nodeIdx, 'bottom', s.end, e.target.checked)}
                        />
                      </label>
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })()}
      </div>

      <div style={{ marginTop: 14 }}>
        <div className="sectionHeader">
          <div>Conexión en nodos (Bastones Z1 / Z3)</div>
          <div className="mutedSmall">Configura el extremo en el nodo: *.1 → Z3, *.2 → Z1 (sup/inf)</div>
        </div>

        {(() => {
          const nodes = dev.nodes ?? [];
          const spans = dev.spans ?? [];
          const slots = buildNodeSlots(nodes);

          const zoneEnabledForSlot = (side: 'top' | 'bottom', s: NodeSlot) => {
            const spanIdx = s.end === 2 ? s.nodeIdx : s.nodeIdx - 1;
            const zone = s.end === 2 ? 'z1' : 'z3';
            const span = spans[spanIdx];
            if (!span) return { l1: false, l2: false };
            const b = (span as any).bastones ?? {};
            const ss = (side === 'top' ? b.top : b.bottom) ?? {};
            const cfg = normalizeBastonCfg((ss as any)[zone]);
            return {
              l1: Boolean(cfg.l1_enabled),
              l2: Boolean(cfg.l2_enabled),
            };
          };

          const Cell = (props: {
            slot: NodeSlot;
            side: 'top' | 'bottom';
          }) => {
            const { slot, side } = props;
            const n = nodes[slot.nodeIdx];
            if (!n) return null;
            const enabled = zoneEnabledForSlot(side, slot);
            const v1 = nodeBastonLineKind(n, side, slot.end, 1);
            const v2 = nodeBastonLineKind(n, side, slot.end, 2);
            const tf1 = nodeBastonLineToFaceEnabled(n, side, slot.end, 1);
            const tf2 = nodeBastonLineToFaceEnabled(n, side, slot.end, 2);
            const rowStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 6 };
            const labelStyle = (isEnabled: boolean): React.CSSProperties => ({
              width: 22,
              textAlign: 'right',
              opacity: isEnabled ? 0.9 : 0.5,
            });
            return (
              <div className="cell" key={`baston-${side}-sel-${slot.nodeIdx}-${slot.end}`}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={rowStyle}>
                    <div style={labelStyle(enabled.l1)}>L1</div>
                    <select
                      className="cellInput"
                      value={v1}
                      disabled={!enabled.l1}
                      onChange={(e) => setNodeBastonLineKind(slot.nodeIdx, side, slot.end, 1, e.target.value as any)}
                    >
                      <option value="continuous">Continuo</option>
                      <option value="hook">Gancho</option>
                      <option value="development">Anclaje</option>
                    </select>
                    <label title="Ajustar gancho/anclaje a la cara del nodo" style={{ display: 'inline-flex', alignItems: 'center' }}>
                      <input
                        type="checkbox"
                        checked={tf1}
                        disabled={!enabled.l1 || v1 === 'continuous'}
                        onChange={(e) => setNodeBastonLineToFace(slot.nodeIdx, side, slot.end, 1, e.target.checked)}
                      />
                    </label>
                  </div>

                  <div style={rowStyle}>
                    <div style={labelStyle(enabled.l2)}>L2</div>
                    <select
                      className="cellInput"
                      value={v2}
                      disabled={!enabled.l2}
                      onChange={(e) => setNodeBastonLineKind(slot.nodeIdx, side, slot.end, 2, e.target.value as any)}
                    >
                      <option value="continuous">Continuo</option>
                      <option value="hook">Gancho</option>
                      <option value="development">Anclaje</option>
                    </select>
                    <label title="Ajustar gancho/anclaje a la cara del nodo" style={{ display: 'inline-flex', alignItems: 'center' }}>
                      <input
                        type="checkbox"
                        checked={tf2}
                        disabled={!enabled.l2 || v2 === 'continuous'}
                        onChange={(e) => setNodeBastonLineToFace(slot.nodeIdx, side, slot.end, 2, e.target.checked)}
                      />
                    </label>
                  </div>
                </div>
              </div>
            );
          };
          return (
            <div className="matrix" style={{ gridTemplateColumns: `200px repeat(${slots.length}, 180px)` }}>
              <div className="cell head"></div>
              {slots.map((s) => (
                <div className={'cell head'} key={`baston-node-head-${s.nodeIdx}-${s.end}`}>
                  <div className="mono">{s.label}</div>
                </div>
              ))}

              <div className="cell rowLabel">Superior</div>
              {slots.map((s) => (
                <Cell slot={s} side="top" key={`baston-top-cell-${s.nodeIdx}-${s.end}`} />
              ))}

              <div className="cell rowLabel">Inferior</div>
              {slots.map((s) => (
                <Cell slot={s} side="bottom" key={`baston-bot-cell-${s.nodeIdx}-${s.end}`} />
              ))}
            </div>
          );
        })()}
      </div>

      <div style={{ marginTop: 14 }}>
        <div className="sectionHeader">
          <div>Bastones por zonas</div>
          <div className="mutedSmall">Z1/Z2/Z3 por tramo (sup/inf). L1= L/5 (Z1,Z3) y L/7 (Z2). Lc configurable en Config.</div>
        </div>

        {(() => {
          const spans = dev.spans ?? [];
          const nodes = dev.nodes ?? [];
          const Lc = clampNumber((dev as any).baston_Lc ?? appCfg.baston_Lc, appCfg.baston_Lc);

          const zoneLabel = (z: 'z1' | 'z2' | 'z3') => (z === 'z1' ? 'Zona 1' : z === 'z2' ? 'Zona 2' : 'Zona 3');

          const diameterOptions = (
            <>
              <option value="3/8">3/8</option>
              <option value="1/2">1/2</option>
              <option value="5/8">5/8</option>
              <option value="3/4">3/4</option>
              <option value="1">1</option>
            </>
          );

          const getCfg = (s: SpanIn, side: 'top' | 'bottom', zone: 'z1' | 'z2' | 'z3') => {
            const b = (s as any).bastones ?? {};
            const ss = (side === 'top' ? b.top : b.bottom) ?? {};
            return normalizeBastonCfg((ss as any)[zone]);
          };

          const mkLenKey = (spanIdx: number, side: 'top' | 'bottom', zone: 'z1' | 'z2' | 'z3', field: 'L1_m' | 'L2_m' | 'L3_m') =>
            `baston-len:${spanIdx}:${side}:${zone}:${field}`;

          const commitLen = (spanIdx: number, side: 'top' | 'bottom', zone: 'z1' | 'z2' | 'z3', field: 'L1_m' | 'L2_m' | 'L3_m', raw: string) => {
            const s = (raw ?? '').trim();
            const key = mkLenKey(spanIdx, side, zone, field);

            // vacío => volver a default (guardado como undefined)
            if (!s) {
              updateBaston(spanIdx, side, zone, { [field]: undefined } as any);
              setBastonLenEdits((prev) => {
                const next = { ...prev };
                delete next[key];
                return next;
              });
              return;
            }

            const v = clampNumber(s, NaN);
            if (!(Number.isFinite(v) && v > 0)) {
              // Si no parsea, no tocar el valor numérico guardado; solo limpiar el draft.
              setBastonLenEdits((prev) => {
                const next = { ...prev };
                delete next[key];
                return next;
              });
              return;
            }

            const normalized = snapBastonM(v);
            updateBaston(spanIdx, side, zone, { [field]: normalized } as any);
            setBastonLenEdits((prev) => {
              const next = { ...prev };
              delete next[key];
              return next;
            });
          };

          return (
            <div className="matrix" style={{ gridTemplateColumns: `240px repeat(${spans.length}, 1fr)` }}>
              <div className="cell head"></div>
              {spans.map((_, i) => (
                <div className={'cell head'} key={`baston-head-${i}`}>
                  <div className="mono">Tramo {i + 1}</div>
                </div>
              ))}

              {(['top', 'bottom'] as const).flatMap((side) =>
                (['z1', 'z2', 'z3'] as const).map((zone) => {
                  const rowKey = `${side}-${zone}`;
                  const rowLabel = `${side === 'top' ? 'Superior' : 'Inferior'}: ${zoneLabel(zone)}`;
                  return (
                    <React.Fragment key={rowKey}>
                      <div className="cell rowLabel">
                        <div>{rowLabel}</div>
                      </div>
                      {spans.map((s, i) => {
                        const cfg = getCfg(s, side, zone);
                        const disabledAll = !cfg.l1_enabled && !cfg.l2_enabled;
                        const L = clampNumber(s?.L ?? 0, 0);
                        const def12 = snapBastonM(L / 5);
                        const def3 = snapBastonM(L / 3);
                        return (
                          <div className="cell" key={`baston-${rowKey}-${i}`}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                              {([1, 2] as const).map((line) => {
                                const enabledKey = line === 1 ? 'l1_enabled' : 'l2_enabled';
                                const qtyKey = line === 1 ? 'l1_qty' : 'l2_qty';
                                const diaKey = line === 1 ? 'l1_diameter' : 'l2_diameter';
                                const enabled = Boolean((cfg as any)[enabledKey]);
                                return (
                                  <div key={`baston-line-${rowKey}-${i}-${line}`} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                                    <div className="mono" style={{ width: 26, opacity: enabled ? 0.9 : 0.5 }}>
                                      L{line}
                                    </div>

                                    <label title="Habilitar línea">
                                      <input
                                        type="checkbox"
                                        checked={enabled}
                                        onChange={(e) => updateBaston(i, side, zone, { [enabledKey]: e.target.checked } as any)}
                                      />
                                    </label>

                                    <select
                                      className="cellInput"
                                      value={String(Math.max(1, Math.min(3, Math.round(Number((cfg as any)[qtyKey] ?? 1)))))}
                                      disabled={!enabled}
                                      onChange={(e) => updateBaston(i, side, zone, { [qtyKey]: clampNumber(e.target.value, 1) } as any)}
                                      style={{ width: 56 }}
                                      title="Cantidad (1-3)"
                                    >
                                      <option value="1">1</option>
                                      <option value="2">2</option>
                                      <option value="3">3</option>
                                    </select>

                                    <select
                                      className="cellInput"
                                      value={String((cfg as any)[diaKey] ?? '3/4')}
                                      disabled={!enabled}
                                      onChange={(e) => updateBaston(i, side, zone, { [diaKey]: e.target.value } as any)}
                                      style={{ width: 76 }}
                                      title="Diámetro"
                                    >
                                      {diameterOptions}
                                    </select>
                                  </div>
                                );
                              })}

                              {zone === 'z2' ? (
                                <>
                                  <input
                                    className="cellInput"
                                    style={{ width: 86 }}
                                    type="text"
                                    inputMode="decimal"
                                    placeholder="L1"
                                    disabled={disabledAll}
                                    value={
                                      bastonLenEdits[mkLenKey(i, side, zone, 'L1_m')] ??
                                      (cfg.L1_m == null ? fmt2(def12) : fmt2(snapBastonM(cfg.L1_m)))
                                    }
                                    onChange={(e) => setBastonLenEdits((p) => ({ ...p, [mkLenKey(i, side, zone, 'L1_m')]: e.target.value }))}
                                    onBlur={(e) => commitLen(i, side, zone, 'L1_m', e.target.value)}
                                    title="L1 (m)"
                                  />
                                  <input
                                    className="cellInput"
                                    style={{ width: 86 }}
                                    type="text"
                                    inputMode="decimal"
                                    placeholder="L2"
                                    disabled={disabledAll}
                                    value={
                                      bastonLenEdits[mkLenKey(i, side, zone, 'L2_m')] ??
                                      (cfg.L2_m == null ? fmt2(def12) : fmt2(snapBastonM(cfg.L2_m)))
                                    }
                                    onChange={(e) => setBastonLenEdits((p) => ({ ...p, [mkLenKey(i, side, zone, 'L2_m')]: e.target.value }))}
                                    onBlur={(e) => commitLen(i, side, zone, 'L2_m', e.target.value)}
                                    title="L2 (m)"
                                  />
                                </>
                              ) : (
                                <input
                                  className="cellInput"
                                  style={{ width: 86 }}
                                  type="text"
                                  inputMode="decimal"
                                  placeholder="L3"
                                  disabled={disabledAll}
                                  value={
                                    bastonLenEdits[mkLenKey(i, side, zone, 'L3_m')] ?? (cfg.L3_m == null ? fmt2(def3) : fmt2(snapBastonM(cfg.L3_m)))
                                  }
                                  onChange={(e) => setBastonLenEdits((p) => ({ ...p, [mkLenKey(i, side, zone, 'L3_m')]: e.target.value }))}
                                  onBlur={(e) => commitLen(i, side, zone, 'L3_m', e.target.value)}
                                  title="L3 (m)"
                                />
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </React.Fragment>
                  );
                })
              )}
            </div>
          );
        })()}
      </div>

      <div style={{ marginTop: 14 }}>
        <div className="sectionHeader">
          <div>Estribos (por tramo)</div>
          <div className="mutedSmall">Parámetros: A, b,B, c,C, R (por extremo)</div>
        </div>

        {(() => {
          const spans = dev.spans ?? [];
          const getSt = (s: SpanIn) => (s as any).stirrups ?? {};
          const caseTypeOf = (st: any) => String(st.case_type ?? 'simetrica');
          const singleEndOf = (st: any) => String(st.single_end ?? '');
          const modeOf = (st: any) => {
            const v = String(st.design_mode ?? 'sismico').trim().toLowerCase();
            return v === 'gravedad' ? 'gravedad' : 'sismico';
          };

          const fmt = (v: number | undefined | null) => (typeof v === 'number' && Number.isFinite(v) ? v.toFixed(2) : '');
          const fmtInt = (v: number | undefined | null) => (typeof v === 'number' && Number.isFinite(v) ? String(Math.max(0, Math.round(v))) : '');

          const mkAbcrKey = (spanIdx: number, side: 'L' | 'R', field: 'A' | 'b' | 'B' | 'c' | 'C' | 'R') => `stABCR:${spanIdx}:${side}:${field}`;

          const defaultSpecTextFor = (span: SpanIn, mode: 'sismico' | 'gravedad') => {
            const h = clampNumber((span as any).h ?? 0.5, 0.5);
            return formatStirrupsABCR(pickDefaultABCRForH(h, mode));
          };

          const getSpecKeyForSide = (ct: string, side: 'L' | 'R') => {
            const ctt = String(ct || '').trim().toLowerCase();
            if (ctt === 'asim_uno') {
              // UI: L = Especial (left_spec), R = Resto (center_spec)
              return side === 'L' ? ('left_spec' as const) : ('center_spec' as const);
            }
            // simetrica / asim_ambos / fallback
            return side === 'L' ? ('left_spec' as const) : ('right_spec' as const);
          };

          const getABCR = (st: any, key: 'left_spec' | 'center_spec' | 'right_spec'): StirrupsABCR => {
            const parsed = parseStirrupsABCR(String(st?.[key] ?? '').trim());
            return (
              parsed ??
              ({
                A_m: 0,
                b_n: 0,
                B_m: 0,
                c_n: 0,
                C_m: 0,
                R_m: 0,
              } as StirrupsABCR)
            );
          };

          const setABCRField = (
            spanIdx: number,
            st: any,
            ct: string,
            side: 'L' | 'R',
            field: 'A' | 'b' | 'B' | 'c' | 'C' | 'R',
            raw: string
          ) => {
            const specKey = getSpecKeyForSide(ct, side);
            const cur = getABCR(st, specKey);

            const s = String(raw ?? '').trim().replace(',', '.');
            if (!s) {
              // limpiar draft; mantener valor previo
              setStirrupsAbcrEdits((p) => {
                const k = mkAbcrKey(spanIdx, side, field);
                const { [k]: _, ...rest } = p;
                return rest;
              });
              return;
            }

            let next = { ...cur };
            if (field === 'b' || field === 'c') {
              const n = Number.parseInt(s, 10);
              if (!Number.isFinite(n)) return;
              if (field === 'b') next.b_n = Math.max(0, n);
              else next.c_n = Math.max(0, n);
            } else {
              const n = Number.parseFloat(s);
              if (!Number.isFinite(n)) return;
              if (field === 'A') next.A_m = Math.max(0, n);
              if (field === 'B') next.B_m = Math.max(0, n);
              if (field === 'C') next.C_m = Math.max(0, n);
              if (field === 'R') next.R_m = Math.max(0, n);
            }

            const specText = formatStirrupsABCR(next);
            if (ct === 'simetrica') {
              // En simétrica, espejo: ambos extremos usan el mismo spec.
              updateSpanStirrups(spanIdx, { left_spec: specText, right_spec: specText } as any);
            } else {
              updateSpanStirrups(spanIdx, { [specKey]: specText } as any);
            }

            // limpiar draft al commitear
            setStirrupsAbcrEdits((p) => {
              const k = mkAbcrKey(spanIdx, side, field);
              const { [k]: _, ...rest } = p;
              return rest;
            });
          };

          return (
            <div className="matrix" style={{ gridTemplateColumns: `210px repeat(${spans.length}, 280px)` }}>
              <div className="cell head"></div>
              {spans.map((_, i) => (
                <div className={'cell head'} key={`stirrups-head-${i}`}>
                  <div className="mono">Tramo {i + 1}</div>
                </div>
              ))}

              <div className="cell rowLabel">Diámetro</div>
              {spans.map((s, i) => {
                const st = getSt(s);
                const dia = normalizeDiaKey(String(st.diameter ?? '3/8').replace(/[∅Ø\s]/g, '')) || '3/8';
                return (
                  <div className="cell" key={`st-dia-${i}`}>
                    <select
                      className="cellInput"
                      value={dia}
                      onChange={(e) => updateSpanStirrups(i, { diameter: e.target.value } as any)}
                    >
                      <option value="3/8">3/8</option>
                      <option value="1/2">1/2</option>
                      <option value="5/8">5/8</option>
                      <option value="3/4">3/4</option>
                      <option value="1">1</option>
                    </select>
                  </div>
                );
              })}

              <div className="cell rowLabel">Caso</div>
              {spans.map((s, i) => {
                const st = getSt(s);
                return (
                  <div className="cell" key={`st-case-${i}`}>
                    <select
                      className="cellInput"
                      value={caseTypeOf(st)}
                      onChange={(e) => updateSpanStirrups(i, { case_type: e.target.value as any })}
                    >
                      <option value="simetrica">Simétrica</option>
                      <option value="asim_ambos">Asim (ambos)</option>
                      <option value="asim_uno">Asim (uno)</option>
                    </select>
                  </div>
                );
              })}

              <div className="cell rowLabel">Modo</div>
              {spans.map((s, i) => {
                const st = getSt(s);
                const ct = String(caseTypeOf(st) || '').trim().toLowerCase();
                const cur = modeOf(st) as 'sismico' | 'gravedad';
                return (
                  <div className="cell" key={`st-mode-${i}`}>
                    <select
                      className="cellInput"
                      value={cur}
                      onChange={(e) => {
                        const m = (String(e.target.value || '').toLowerCase() === 'gravedad' ? 'gravedad' : 'sismico') as any;
                        const spec = defaultSpecTextFor(s, m);
                        if (ct === 'asim_uno') {
                          updateSpanStirrups(i, { design_mode: m, left_spec: spec, center_spec: spec, right_spec: null } as any);
                        } else {
                          updateSpanStirrups(i, { design_mode: m, left_spec: spec, right_spec: spec, center_spec: null } as any);
                        }
                      }}
                    >
                      <option value="sismico">Sísmico</option>
                      <option value="gravedad">Gravedad</option>
                    </select>
                  </div>
                );
              })}

              <div className="cell rowLabel">Single end</div>
              {spans.map((s, i) => {
                const st = getSt(s);
                const ct = caseTypeOf(st);
                return (
                  <div className="cell" key={`st-single-${i}`}>
                    <select
                      className="cellInput"
                      value={singleEndOf(st)}
                      disabled={ct !== 'asim_uno'}
                      onChange={(e) => updateSpanStirrups(i, { single_end: e.target.value ? (e.target.value as any) : null })}
                    >
                      <option value="">—</option>
                      <option value="left">Left</option>
                      <option value="right">Right</option>
                    </select>
                  </div>
                );
              })}

              {/* ABCR por extremo: cada fila tiene inputs Izq/Der (o Especial/Resto en asim_uno) */}
              {(
                [
                  { f: 'A' as const, label: 'A (m)', ph: '0.05', isInt: false },
                  { f: 'b' as const, label: 'b (cant)', ph: '8', isInt: true },
                  { f: 'B' as const, label: 'B (m)', ph: '0.10', isInt: false },
                  { f: 'c' as const, label: 'c (cant)', ph: '5', isInt: true },
                  { f: 'C' as const, label: 'C (m)', ph: '0.15', isInt: false },
                  { f: 'R' as const, label: 'R (m)', ph: '0.25', isInt: false },
                ] as const
              ).map((row) => (
                <React.Fragment key={`st-abcr-row-${row.f}`}>
                  <div className="cell rowLabel">{row.label}</div>
                  {spans.map((s, si) => {
                    const st = getSt(s);
                    const ct = String(caseTypeOf(st) || '').trim().toLowerCase();
                    const leftKey = getSpecKeyForSide(ct, 'L');
                    const rightKey = getSpecKeyForSide(ct, 'R');
                    const abL = getABCR(st, leftKey);
                    const abR = getABCR(st, rightKey);

                    const sideLabelL = ct === 'asim_uno' ? 'Especial' : 'Izq';
                    const sideLabelR = ct === 'asim_uno' ? 'Resto' : 'Der';

                    const valueFor = (ab: StirrupsABCR) => {
                      if (row.f === 'A') return fmt(ab.A_m);
                      if (row.f === 'b') return fmtInt(ab.b_n);
                      if (row.f === 'B') return fmt(ab.B_m);
                      if (row.f === 'c') return fmtInt(ab.c_n);
                      if (row.f === 'C') return fmt(ab.C_m);
                      return fmt(ab.R_m);
                    };

                    const kL = mkAbcrKey(si, 'L', row.f);
                    const kR = mkAbcrKey(si, 'R', row.f);

                    const disabledR = ct === 'simetrica';

                    return (
                      <div className="cell" key={`st-abcr-${row.f}-${si}`}>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                            <span className="mutedSmall" style={{ minWidth: 56 }}>{sideLabelL}</span>
                            <input
                              className="cellInput"
                              style={{ width: 86 }}
                              type="text"
                              inputMode={row.isInt ? 'numeric' : 'decimal'}
                              placeholder={row.ph}
                              value={stirrupsAbcrEdits[kL] ?? valueFor(abL)}
                              onChange={(e) => setStirrupsAbcrEdits((p) => ({ ...p, [kL]: e.target.value }))}
                              onBlur={(e) => setABCRField(si, st, ct, 'L', row.f, e.target.value)}
                            />
                          </div>
                          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                            <span className="mutedSmall" style={{ minWidth: 42 }}>{sideLabelR}</span>
                            <input
                              className="cellInput"
                              style={{ width: 86 }}
                              type="text"
                              inputMode={row.isInt ? 'numeric' : 'decimal'}
                              placeholder={row.ph}
                              disabled={disabledR}
                              value={stirrupsAbcrEdits[kR] ?? valueFor(abR)}
                              onChange={(e) => setStirrupsAbcrEdits((p) => ({ ...p, [kR]: e.target.value }))}
                              onBlur={(e) => setABCRField(si, st, ct, 'R', row.f, e.target.value)}
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </React.Fragment>
              ))}
            </div>
          );
        })()}
      </div>
    </div>
  );
};
