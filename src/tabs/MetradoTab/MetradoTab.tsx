import React, { useMemo, useState } from 'react';
import type { QuantityDisplayState } from '../../services';
import type { DevelopmentIn } from '../../types';
import {
  calcMetrado,
  kgM,
  FC,
  FY,
  RHO_MIN,
  RHO_MAX,
} from './metradoCalcs';

// ─── Props ──────────────────────────────────────────────────────

export interface MetradoTabProps {
  dev: DevelopmentIn;
  recubrimiento: number;
  onSelectBastonDetalleSpan?: (spanIdx: number, tagsTxt?: string, spansTxt?: string) => void;
  quantityDisplay: QuantityDisplayState;
  setQuantityDisplay: React.Dispatch<React.SetStateAction<QuantityDisplayState>>;
}

// ─── Styles ─────────────────────────────────────────────────────

const S = {
  wrap: { padding: '4px 0' } as React.CSSProperties,
  section: {
    borderRadius: 6,
    border: '1px solid rgba(20,184,166,0.12)',
    background: 'rgba(0,0,0,0.18)',
    marginBottom: 8,
    overflow: 'hidden',
  } as React.CSSProperties,
  sectionHeader: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '8px 10px', cursor: 'pointer', userSelect: 'none',
    fontSize: 11, fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase',
    color: 'rgba(229,231,235,0.7)',
  } as React.CSSProperties,
  sectionBody: {
    padding: '6px 10px 10px',
  } as React.CSSProperties,
  row: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '3px 0', fontSize: 12,
  } as React.CSSProperties,
  label: { opacity: 0.75, fontSize: 12 } as React.CSSProperties,
  value: { fontWeight: 700, fontFamily: 'ui-monospace, monospace', fontSize: 12 } as React.CSSProperties,
  valueTeal: { fontWeight: 700, fontFamily: 'ui-monospace, monospace', fontSize: 12, color: '#5eead4' } as React.CSSProperties,
  divider: {
    borderTop: '1px solid rgba(255,255,255,0.06)', margin: '6px 0',
  } as React.CSSProperties,
  table: {
    width: '100%', fontSize: 11, borderCollapse: 'collapse',
  } as React.CSSProperties,
  th: {
    textAlign: 'left' as const, fontWeight: 700, opacity: 0.6,
    padding: '4px 6px', borderBottom: '1px solid rgba(255,255,255,0.08)',
    fontSize: 10, textTransform: 'uppercase' as const, letterSpacing: 0.5,
  } as React.CSSProperties,
  td: {
    padding: '3px 6px', fontFamily: 'ui-monospace, monospace', fontSize: 11,
  } as React.CSSProperties,
  tdRight: {
    padding: '3px 6px', fontFamily: 'ui-monospace, monospace', fontSize: 11,
    textAlign: 'right' as const,
  } as React.CSSProperties,
  badge: (ok: boolean): React.CSSProperties => ({
    display: 'inline-block', width: 8, height: 8, borderRadius: '50%',
    background: ok ? '#22c55e' : '#ef4444', marginRight: 6,
  }),
  kpiCard: {
    display: 'flex', flexDirection: 'column' as const, alignItems: 'center',
    padding: '8px 4px', borderRadius: 6,
    background: 'rgba(20,184,166,0.06)', border: '1px solid rgba(20,184,166,0.10)',
    flex: '1 1 0', minWidth: 70,
  } as React.CSSProperties,
  kpiValue: {
    fontSize: 16, fontWeight: 800, color: '#5eead4',
    fontFamily: 'ui-monospace, monospace',
  } as React.CSSProperties,
  kpiLabel: { fontSize: 9, opacity: 0.6, marginTop: 2, textAlign: 'center' as const } as React.CSSProperties,
  chevron: (open: boolean): React.CSSProperties => ({
    transition: 'transform 0.15s', transform: open ? 'rotate(90deg)' : 'rotate(0deg)',
    fontSize: 10, opacity: 0.5,
  }),
} as const;

// ─── Collapsible section ────────────────────────────────────────

function Section({ title, defaultOpen, children }: {
  title: string; defaultOpen?: boolean; children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen ?? true);
  return (
    <div style={S.section}>
      <div style={S.sectionHeader} onClick={() => setOpen(!open)}>
        <span>{title}</span>
        <span style={S.chevron(open)}>&#9654;</span>
      </div>
      {open && <div style={S.sectionBody}>{children}</div>}
    </div>
  );
}

// ─── Formatters ─────────────────────────────────────────────────

const f2 = (v: number) => v.toFixed(2);
const f3 = (v: number) => v.toFixed(3);
const f4 = (v: number) => v.toFixed(4);

function Row({ label, value, teal }: { label: string; value: string; teal?: boolean }) {
  return (
    <div style={S.row}>
      <span style={S.label}>{label}</span>
      <span style={teal ? S.valueTeal : S.value}>{value}</span>
    </div>
  );
}

// ─── Component ──────────────────────────────────────────────────

export const MetradoTab: React.FC<MetradoTabProps> = ({
  dev,
  recubrimiento,
  onSelectBastonDetalleSpan,
  quantityDisplay,
  setQuantityDisplay,
}) => {
  const recub = recubrimiento ?? 0.04;
  const m = useMemo(() => calcMetrado(dev, recub), [dev, recub]);
  const totalL = m.spans.reduce((s, sp) => s + sp.L, 0);
  const estribosDetalle = useMemo(() => {
    const rows: Array<{ codigo: string; tramo: string; cant: number; long_m: number; dia: string; kg_m: number; peso_kg: number }> = [];
    let seq = 1;
    m.spans.forEach((sp) => {
      const src = dev.spans?.[sp.idx];
      const st = src?.stirrups;
      if (!st || !(sp.estribos_count > 0)) return;
      const dia = String(st.diameter ?? '8mm');
      const hookLeg = 0.135;
      const perim = 2 * Math.max(0, sp.b - 2 * recub) + 2 * Math.max(0, sp.h - 2 * recub) + 2 * hookLeg;
      rows.push({
        codigo: `E${String(seq++).padStart(4, '0')}`,
        tramo: `T${sp.idx + 1}`,
        cant: sp.estribos_count,
        long_m: perim,
        dia,
        kg_m: kgM(dia),
        peso_kg: sp.estribos_count * perim * kgM(dia),
      });
    });
    return rows;
  }, [dev.spans, m.spans, recub]);
  const pickFirstSpanIdx = (spansTxt: string): number | null => {
    const m = /\bT(\d+)\b/.exec(spansTxt);
    if (!m) return null;
    const idx = Number(m[1]) - 1;
    return Number.isInteger(idx) && idx >= 0 ? idx : null;
  };

  return (
    <div className="form" style={S.wrap}>
      <Section title="Ratios" defaultOpen>
        <div style={{ display: 'flex', gap: 8 }}>
          <div style={S.kpiCard}>
            <div style={S.kpiValue}>{m.totalConcreto > 0 ? f2(m.totalAcero / m.totalConcreto) : '—'}</div>
            <div style={S.kpiLabel}>kg/m&sup3;</div>
          </div>
          <div style={S.kpiCard}>
            <div style={S.kpiValue}>{m.totalEncofrado > 0 ? f2(m.totalAcero / m.totalEncofrado) : '—'}</div>
            <div style={S.kpiLabel}>kg/m&sup2;</div>
          </div>
          <div style={S.kpiCard}>
            <div style={S.kpiValue}>{totalL > 0 ? f2(m.totalAcero / totalL) : '—'}</div>
            <div style={S.kpiLabel}>kg/ml</div>
          </div>
        </div>
      </Section>
      {/* ─── METRADO GENERAL ──────────────────────────── */}
      <Section title="Metrado" defaultOpen>
        <Row label="Concreto" value={`${f2(m.totalConcreto)} m\u00B3`} />
        <Row label="Encofrado" value={`${f2(m.totalEncofrado)} m\u00B2`} />
        <div style={S.divider} />
        <Row label="Acero corrido" value={`${f2(m.totalCorrido)} kg`} />
        <Row label="Acero bastones" value={`${f2(m.totalBastones)} kg`} />
        <Row label="Acero estribos" value={`${f2(m.totalEstribos)} kg`} />
        <div style={S.divider} />
        <Row label="ACERO TOTAL" value={`${f2(m.totalAcero)} kg`} teal />
      </Section>

      {/* ─── DESGLOSE POR DIAMETRO ────────────────────── */}
      <Section title="Desglose Acero" defaultOpen={false}>
        {m.allDias.length > 0 ? (
          <table style={S.table}>
            <thead>
              <tr>
                <th style={S.th}>Dia</th>
                <th style={{ ...S.th, textAlign: 'right' }}>Corrido</th>
                <th style={{ ...S.th, textAlign: 'right' }}>Bastones</th>
                <th style={{ ...S.th, textAlign: 'right' }}>Estribos</th>
                <th style={{ ...S.th, textAlign: 'right' }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {m.allDias.map((dia) => (
                <tr key={dia}>
                  <td style={S.td}>{dia}&quot;</td>
                  <td style={S.tdRight}>{f2(m.corridoByDia[dia] ?? 0)}</td>
                  <td style={S.tdRight}>{f2(m.bastonesByDia[dia] ?? 0)}</td>
                  <td style={S.tdRight}>{f2(m.estribosByDia[dia] ?? 0)}</td>
                  <td style={{ ...S.tdRight, fontWeight: 700, color: '#5eead4' }}>
                    {f2(m.totalByDia[dia] ?? 0)}
                  </td>
                </tr>
              ))}
              <tr>
                <td style={{ ...S.td, fontWeight: 700, borderTop: '1px solid rgba(255,255,255,0.08)' }}>Total</td>
                <td style={{ ...S.tdRight, fontWeight: 700, borderTop: '1px solid rgba(255,255,255,0.08)' }}>{f2(m.totalCorrido)}</td>
                <td style={{ ...S.tdRight, fontWeight: 700, borderTop: '1px solid rgba(255,255,255,0.08)' }}>{f2(m.totalBastones)}</td>
                <td style={{ ...S.tdRight, fontWeight: 700, borderTop: '1px solid rgba(255,255,255,0.08)' }}>{f2(m.totalEstribos)}</td>
                <td style={{ ...S.tdRight, fontWeight: 800, borderTop: '1px solid rgba(255,255,255,0.08)', color: '#5eead4' }}>{f2(m.totalAcero)}</td>
              </tr>
            </tbody>
          </table>
        ) : (
          <div style={{ fontSize: 11, opacity: 0.5 }}>Sin datos de acero</div>
        )}

        {m.bastonesDetalle.length > 0 && (
          <>
            <div style={{ ...S.divider, marginTop: 10 }} />
            <Section title="Detalle Bastones (Topología)" defaultOpen={false}>
              <div style={{ fontSize: 10, opacity: 0.55, marginBottom: 6 }}>
                Longitud por componente topológico de bastón. Peso = Longitud x Cantidad x kg/ml.
              </div>
              <table style={S.table}>
                <thead>
                  <tr>
                    <th style={S.th}>Código</th>
                    <th style={{ ...S.th, textAlign: 'right' }}>Long. (m)</th>
                    <th style={{ ...S.th, textAlign: 'right' }}>Cant.</th>
                    <th style={S.th}>Ø</th>
                    <th style={{ ...S.th, textAlign: 'right' }}>kg/ml</th>
                    <th style={{ ...S.th, textAlign: 'right' }}>Peso (kg)</th>
                  </tr>
                </thead>
                <tbody>
                  {m.bastonesDetalle.map((d) => (
                    <tr
                      key={`${d.comp}:${d.dia}:${d.tags_txt}`}
                      onClick={() => {
                        const spanIdx = pickFirstSpanIdx(d.spans);
                        if (spanIdx != null) onSelectBastonDetalleSpan?.(spanIdx, d.tags_txt, d.spans);
                      }}
                      title="Clic para seleccionar/enfocar tramo asociado en la vista"
                      style={{ cursor: onSelectBastonDetalleSpan ? 'pointer' : 'default' }}
                    >
                      <td style={S.td}>{d.codigo}</td>
                      <td style={S.tdRight}>{f2(d.len_m)}</td>
                      <td style={S.tdRight}>{d.qty}</td>
                      <td style={S.td}>{d.dia}&quot;</td>
                      <td style={S.tdRight}>{f3(d.kg_m)}</td>
                      <td style={S.tdRight}>{f4(d.peso_kg)}</td>
                    </tr>
                  ))}
                  <tr>
                    <td style={{ ...S.td, fontWeight: 700, borderTop: '1px solid rgba(255,255,255,0.08)' }} colSpan={5}>
                      Total detalle bastones
                    </td>
                    <td style={{ ...S.tdRight, fontWeight: 800, borderTop: '1px solid rgba(255,255,255,0.08)', color: '#5eead4' }}>
                      {f4(m.bastonesDetalle.reduce((acc, d) => acc + d.peso_kg, 0))}
                    </td>
                  </tr>
                </tbody>
              </table>
            </Section>
          </>
        )}

        {m.corridoDetalle.length > 0 && (
          <>
            <div style={{ ...S.divider, marginTop: 10 }} />
            <Section title="Detalle Acero Corrido" defaultOpen={false}>
              <table style={S.table}>
                <thead>
                  <tr>
                    <th style={S.th}>Código</th>
                    <th style={{ ...S.th, textAlign: 'right' }}>Long. (m)</th>
                    <th style={{ ...S.th, textAlign: 'right' }}>Cant.</th>
                    <th style={S.th}>Ø</th>
                    <th style={{ ...S.th, textAlign: 'right' }}>kg/ml</th>
                    <th style={{ ...S.th, textAlign: 'right' }}>Peso (kg)</th>
                  </tr>
                </thead>
                <tbody>
                  {m.corridoDetalle.map((r) => (
                    <tr key={r.codigo}>
                      <td style={S.td}>{r.codigo}</td>
                      <td style={S.tdRight}>{f2(r.len_m)}</td>
                      <td style={S.tdRight}>{r.qty}</td>
                      <td style={S.td}>{r.dia}&quot;</td>
                      <td style={S.tdRight}>{f3(r.kg_m)}</td>
                      <td style={S.tdRight}>{f4(r.peso_kg)}</td>
                    </tr>
                  ))}
                  <tr>
                    <td style={{ ...S.td, fontWeight: 700, borderTop: '1px solid rgba(255,255,255,0.08)' }} colSpan={5}>
                      Total detalle corrido
                    </td>
                    <td style={{ ...S.tdRight, fontWeight: 800, borderTop: '1px solid rgba(255,255,255,0.08)', color: '#5eead4' }}>
                      {f4(m.corridoDetalle.reduce((acc, r) => acc + r.peso_kg, 0))}
                    </td>
                  </tr>
                </tbody>
              </table>
            </Section>
          </>
        )}

        {estribosDetalle.length > 0 && (
          <>
            <div style={{ ...S.divider, marginTop: 10 }} />
            <Section title="Detalle Estribos" defaultOpen={false}>
              <table style={S.table}>
                <thead>
                  <tr>
                    <th style={S.th}>Código</th>
                    <th style={{ ...S.th, textAlign: 'right' }}>Long. c/u (m)</th>
                    <th style={{ ...S.th, textAlign: 'right' }}>Cant.</th>
                    <th style={S.th}>Ø</th>
                    <th style={{ ...S.th, textAlign: 'right' }}>kg/ml</th>
                    <th style={{ ...S.th, textAlign: 'right' }}>Peso (kg)</th>
                  </tr>
                </thead>
                <tbody>
                  {estribosDetalle.map((r) => (
                    <tr key={r.codigo}>
                      <td style={S.td}>{r.codigo}</td>
                      <td style={S.tdRight}>{f2(r.long_m)}</td>
                      <td style={S.tdRight}>{r.cant}</td>
                      <td style={S.td}>{r.dia}&quot;</td>
                      <td style={S.tdRight}>{f3(r.kg_m)}</td>
                      <td style={S.tdRight}>{f4(r.peso_kg)}</td>
                    </tr>
                  ))}
                  <tr>
                    <td style={{ ...S.td, fontWeight: 700, borderTop: '1px solid rgba(255,255,255,0.08)' }} colSpan={5}>
                      Total detalle estribos
                    </td>
                    <td style={{ ...S.tdRight, fontWeight: 800, borderTop: '1px solid rgba(255,255,255,0.08)', color: '#5eead4' }}>
                      {f4(estribosDetalle.reduce((acc, r) => acc + r.peso_kg, 0))}
                    </td>
                  </tr>
                </tbody>
              </table>
            </Section>
          </>
        )}

      </Section>

      {/* ─── CUANTIAS E.060 ───────────────────────────── */}
      <Section title={`Cuant\u00EDas E.060`} defaultOpen={false}>
        <div style={{ fontSize: 10, opacity: 0.55, marginBottom: 8 }}>
          f&apos;c={FC} kg/cm&sup2; &middot; fy={FY} kg/cm&sup2; &middot; &rho;min={f4(RHO_MIN)} &middot; &rho;max={f4(RHO_MAX)}
        </div>
        <div style={{ marginBottom: 8, display: 'grid', gap: 6 }}>
          <div style={{ fontSize: 10, opacity: 0.7, textTransform: 'uppercase', letterSpacing: 0.5 }}>Modo de visualización</div>
          <label className="check" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <input
              type="radio"
              name="quantity-mode"
              checked={(quantityDisplay.mode ?? 'section') === 'zones'}
              onChange={() => setQuantityDisplay((p) => ({ ...p, mode: 'zones', enabled: true }))}
            />
            <span className="mutedSmall">Por zonas (Z1/Z2/Z3 en cada tramo)</span>
          </label>
          <label className="check" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <input
              type="radio"
              name="quantity-mode"
              checked={(quantityDisplay.mode ?? 'section') === 'section'}
              onChange={() => setQuantityDisplay((p) => ({ ...p, mode: 'section', enabled: true }))}
            />
            <span className="mutedSmall">Solo sección activa (iterativo en X)</span>
          </label>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
          {[
            ['Activar overlay', 'enabled'],
            ['\u03C1min', 'show_p_min'],
            ['\u03C1max', 'show_p_max'],
            ['\u03C1instalada', 'show_p_instalada'],
            ['\u03C1requerida', 'show_p_requerida'],
            ['As min', 'show_As_min'],
            ['As max', 'show_As_max'],
            ['As instalada', 'show_As_instalada'],
            ['As requerida', 'show_As_requerida'],
            ['Margen (ΔAs)', 'show_margin'],
          ].map(([label, key]) => (
            <label key={key} className="check" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <input
                type="checkbox"
                checked={Boolean((quantityDisplay as any)[key])}
                onChange={(e) => setQuantityDisplay((p) => ({ ...p, [key]: e.target.checked }))}
              />
              <span className="mutedSmall">{label}</span>
            </label>
          ))}
        </div>
        <div style={{ fontSize: 10, opacity: 0.45, marginTop: 8 }}>
          Se visualiza en Vista General (2D). En DXF se envía un bloque de cuantías para casco + textos (offset superior 3.0m, incluye Asmin/Asmax).
        </div>
      </Section>

    </div>
  );
};
