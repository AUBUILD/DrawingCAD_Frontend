import React, { useMemo, useState } from 'react';
import type { DevelopmentIn, SpanIn } from '../../types';
import { parseStirrupsABCR } from '../../utils';

// ─── Constants ──────────────────────────────────────────────────

const REBAR: Record<string, { area_cm2: number; kg_m: number }> = {
  '3/8':   { area_cm2: 0.713,  kg_m: 0.560 },
  '1/2':   { area_cm2: 1.267,  kg_m: 0.994 },
  '5/8':   { area_cm2: 1.979,  kg_m: 1.552 },
  '3/4':   { area_cm2: 2.850,  kg_m: 2.235 },
  '1':     { area_cm2: 5.067,  kg_m: 3.973 },
  '1-3/8': { area_cm2: 9.583,  kg_m: 7.907 },
};

const LOSA_M = 0.20;
const FY = 4200;
const FC = 210;
const RHO_MIN = 14 / FY; // 0.00333
const BETA1 = FC <= 280 ? 0.85 : Math.max(0.65, 0.85 - 0.05 * (FC - 280) / 70);
const RHO_B = 0.85 * BETA1 * (FC / FY) * (6000 / (6000 + FY));
const RHO_MAX = 0.75 * RHO_B;

function kgM(dia: string): number { return REBAR[dia]?.kg_m ?? 0; }
function areaCm2(dia: string): number { return REBAR[dia]?.area_cm2 ?? 0; }

// ─── Props ──────────────────────────────────────────────────────

export interface MetradoTabProps {
  dev: DevelopmentIn;
  recubrimiento: number;
}

// ─── Calculation types ──────────────────────────────────────────

type ByDia = Record<string, number>;

interface SpanMetrado {
  idx: number;
  L: number;
  h: number;
  b: number;
  concreto_m3: number;
  encofrado_m2: number;
  corrido_kg: number;
  bastones_kg: number;
  estribos_kg: number;
  corrido_byDia: ByDia;
  bastones_byDia: ByDia;
  estribos_byDia: ByDia;
  estribos_count: number;
  // cuantias
  topAs_cm2: number;
  botAs_cm2: number;
  rhoTop: number;
  rhoBot: number;
}

interface MetradoResult {
  spans: SpanMetrado[];
  totalConcreto: number;
  totalEncofrado: number;
  totalCorrido: number;
  totalBastones: number;
  totalEstribos: number;
  totalAcero: number;
  corridoByDia: ByDia;
  bastonesByDia: ByDia;
  estribosByDia: ByDia;
  totalByDia: ByDia;
  allDias: string[];
}

// ─── Helpers ────────────────────────────────────────────────────

function mergeDia(target: ByDia, source: ByDia) {
  for (const [k, v] of Object.entries(source)) target[k] = (target[k] ?? 0) + v;
}

function countABCR(spec: string | null | undefined, zoneLen: number): number {
  if (!spec) return 0;
  const abcr = parseStirrupsABCR(spec);
  if (!abcr) return 0;
  let n = 0, cursor = 0;
  if (abcr.A_m > 0) { cursor = abcr.A_m; n = 1; }
  if (abcr.b_n > 1 && abcr.B_m > 0)
    for (let k = 1; k < abcr.b_n; k++) { cursor += abcr.B_m; if (cursor > zoneLen + 1e-3) break; n++; }
  if (abcr.c_n > 0 && abcr.C_m > 0)
    for (let k = 0; k < abcr.c_n; k++) { cursor += abcr.C_m; if (cursor > zoneLen + 1e-3) break; n++; }
  if (abcr.R_m > 0)
    while (cursor + abcr.R_m <= zoneLen + 1e-3) { cursor += abcr.R_m; n++; }
  return n;
}

function calcSpan(span: SpanIn, idx: number, recub: number): SpanMetrado {
  const L = span.L ?? 0;
  const h = span.h ?? 0;
  const b = span.b ?? 0.25;
  const d_cm = Math.max(0, (h - recub)) * 100;
  const b_cm = b * 100;

  // Concreto & encofrado
  const concreto_m3 = b * h * L;
  const encofrado_m2 = (b + 2 * Math.max(0, h - LOSA_M)) * L;

  // Corrido
  const corrido_byDia: ByDia = {};
  let corrido_kg = 0;
  for (const side of ['top', 'bottom'] as const) {
    const meta = side === 'top' ? span.steel_top : span.steel_bottom;
    if (!meta) continue;
    const qty = meta.qty ?? 0;
    const dia = meta.diameter ?? '3/4';
    const kg = qty * L * kgM(dia);
    if (kg > 0) { corrido_kg += kg; corrido_byDia[dia] = (corrido_byDia[dia] ?? 0) + kg; }
  }

  // Bastones
  const bastones_byDia: ByDia = {};
  let bastones_kg = 0;
  const defLen = L / 5;
  for (const side of ['top', 'bottom'] as const) {
    const sideCfg = span.bastones?.[side];
    if (!sideCfg) continue;
    for (const zone of ['z1', 'z2', 'z3'] as const) {
      const cfg = sideCfg[zone];
      if (!cfg) continue;
      for (const line of [1, 2] as const) {
        const enabled = line === 1 ? (cfg.l1_enabled ?? cfg.enabled ?? false) : (cfg.l2_enabled ?? false);
        if (!enabled) continue;
        const qty = line === 1 ? (cfg.l1_qty ?? cfg.qty ?? 1) : (cfg.l2_qty ?? 1);
        const dia = line === 1 ? (cfg.l1_diameter ?? cfg.diameter ?? '3/4') : (cfg.l2_diameter ?? '3/4');
        const len = zone === 'z2'
          ? (cfg.L1_m ?? defLen) + (cfg.L2_m ?? defLen)
          : (cfg.L3_m ?? defLen);
        const kg = qty * len * kgM(dia);
        if (kg > 0) { bastones_kg += kg; bastones_byDia[dia] = (bastones_byDia[dia] ?? 0) + kg; }
      }
    }
  }

  // Estribos
  const estribos_byDia: ByDia = {};
  let estribos_kg = 0;
  let estribos_count = 0;
  const st = span.stirrups;
  if (st) {
    const dia = st.diameter ?? '3/8';
    const secQty = span.stirrups_section?.qty ?? 1;
    const hookLeg = 0.135;
    const perim = 2 * Math.max(0, b - 2 * recub) + 2 * Math.max(0, h - 2 * recub) + 2 * hookLeg;
    const caseT = st.case_type ?? 'simetrica';

    if (caseT === 'simetrica') {
      estribos_count = countABCR(st.left_spec, L / 2) * 2;
    } else if (caseT === 'asim_ambos') {
      const extL = st.ext_left_m ?? 2 * Math.max(0, h - recub);
      const extR = st.ext_right_m ?? 2 * Math.max(0, h - recub);
      estribos_count = countABCR(st.left_spec, extL) + countABCR(st.right_spec, extR);
      const centerLen = Math.max(0, L - extL - extR);
      if (centerLen > 0) estribos_count += countABCR(st.center_spec, centerLen);
    } else { // asim_uno
      const singleEnd = st.single_end ?? 'left';
      const ext = singleEnd === 'left'
        ? (st.ext_left_m ?? 2 * Math.max(0, h - recub))
        : (st.ext_right_m ?? 2 * Math.max(0, h - recub));
      const specialSpec = singleEnd === 'left' ? st.left_spec : st.right_spec;
      estribos_count = countABCR(specialSpec, ext);
      const centerLen = Math.max(0, L - ext);
      if (centerLen > 0) estribos_count += countABCR(st.center_spec, centerLen);
    }
    estribos_count *= secQty;
    estribos_kg = estribos_count * perim * kgM(dia);
    if (estribos_kg > 0) estribos_byDia[dia] = estribos_kg;
  }

  // Cuantias
  const topAs = (span.steel_top?.qty ?? 0) * areaCm2(span.steel_top?.diameter ?? '3/4');
  const botAs = (span.steel_bottom?.qty ?? 0) * areaCm2(span.steel_bottom?.diameter ?? '3/4');
  const rhoTop = (b_cm > 0 && d_cm > 0) ? topAs / (b_cm * d_cm) : 0;
  const rhoBot = (b_cm > 0 && d_cm > 0) ? botAs / (b_cm * d_cm) : 0;

  return {
    idx, L, h, b, concreto_m3, encofrado_m2,
    corrido_kg, bastones_kg, estribos_kg,
    corrido_byDia, bastones_byDia, estribos_byDia,
    estribos_count,
    topAs_cm2: topAs, botAs_cm2: botAs,
    rhoTop, rhoBot,
  };
}

function calcMetrado(dev: DevelopmentIn, recub: number): MetradoResult {
  const spansData = (dev.spans ?? []).map((s, i) => calcSpan(s, i, recub));

  const corridoByDia: ByDia = {};
  const bastonesByDia: ByDia = {};
  const estribosByDia: ByDia = {};
  let totalConcreto = 0, totalEncofrado = 0;
  let totalCorrido = 0, totalBastones = 0, totalEstribos = 0;

  for (const s of spansData) {
    totalConcreto += s.concreto_m3;
    totalEncofrado += s.encofrado_m2;
    totalCorrido += s.corrido_kg;
    totalBastones += s.bastones_kg;
    totalEstribos += s.estribos_kg;
    mergeDia(corridoByDia, s.corrido_byDia);
    mergeDia(bastonesByDia, s.bastones_byDia);
    mergeDia(estribosByDia, s.estribos_byDia);
  }

  const totalByDia: ByDia = {};
  mergeDia(totalByDia, corridoByDia);
  mergeDia(totalByDia, bastonesByDia);
  mergeDia(totalByDia, estribosByDia);

  const allDias = Object.keys(totalByDia).sort((a, b) => (kgM(a) || 0) - (kgM(b) || 0));

  return {
    spans: spansData,
    totalConcreto, totalEncofrado,
    totalCorrido, totalBastones, totalEstribos,
    totalAcero: totalCorrido + totalBastones + totalEstribos,
    corridoByDia, bastonesByDia, estribosByDia, totalByDia, allDias,
  };
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

export const MetradoTab: React.FC<MetradoTabProps> = ({ dev, recubrimiento }) => {
  const recub = recubrimiento ?? 0.04;
  const m = useMemo(() => calcMetrado(dev, recub), [dev, recub]);
  const totalL = m.spans.reduce((s, sp) => s + sp.L, 0);

  return (
    <div className="form" style={S.wrap}>
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

        {/* Per-span breakdown */}
        {m.spans.length > 1 && (
          <>
            <div style={{ ...S.divider, marginTop: 10 }} />
            <div style={{ fontSize: 10, fontWeight: 700, opacity: 0.5, letterSpacing: 0.5, marginBottom: 4 }}>POR TRAMO</div>
            <table style={S.table}>
              <thead>
                <tr>
                  <th style={S.th}>Tramo</th>
                  <th style={{ ...S.th, textAlign: 'right' }}>Corrido</th>
                  <th style={{ ...S.th, textAlign: 'right' }}>Bastones</th>
                  <th style={{ ...S.th, textAlign: 'right' }}>Estribos</th>
                  <th style={{ ...S.th, textAlign: 'right' }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {m.spans.map((sp) => (
                  <tr key={sp.idx}>
                    <td style={S.td}>T{sp.idx + 1}</td>
                    <td style={S.tdRight}>{f2(sp.corrido_kg)}</td>
                    <td style={S.tdRight}>{f2(sp.bastones_kg)}</td>
                    <td style={S.tdRight}>{f2(sp.estribos_kg)}</td>
                    <td style={{ ...S.tdRight, fontWeight: 700 }}>
                      {f2(sp.corrido_kg + sp.bastones_kg + sp.estribos_kg)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </Section>

      {/* ─── CUANTIAS E.060 ───────────────────────────── */}
      <Section title={`Cuant\u00EDas E.060`} defaultOpen={false}>
        <div style={{ fontSize: 10, opacity: 0.5, marginBottom: 6 }}>
          f&apos;c={FC} kg/cm&sup2; &middot; fy={FY} kg/cm&sup2; &middot;
          {' '}&rho;min={f4(RHO_MIN)} &middot; &rho;max={f4(RHO_MAX)}
        </div>
        <table style={S.table}>
          <thead>
            <tr>
              <th style={S.th}>Tramo</th>
              <th style={{ ...S.th, textAlign: 'right' }}>As sup</th>
              <th style={{ ...S.th, textAlign: 'right' }}>&rho; sup</th>
              <th style={{ ...S.th, textAlign: 'right' }}>As inf</th>
              <th style={{ ...S.th, textAlign: 'right' }}>&rho; inf</th>
            </tr>
          </thead>
          <tbody>
            {m.spans.map((sp) => {
              const topOk = sp.rhoTop >= RHO_MIN && sp.rhoTop <= RHO_MAX;
              const botOk = sp.rhoBot >= RHO_MIN && sp.rhoBot <= RHO_MAX;
              return (
                <tr key={sp.idx}>
                  <td style={S.td}>T{sp.idx + 1} ({f2(sp.b * 100)}x{f2(sp.h * 100)})</td>
                  <td style={S.tdRight}>{f2(sp.topAs_cm2)}</td>
                  <td style={S.tdRight}>
                    <span style={S.badge(topOk)} />
                    {f4(sp.rhoTop)}
                  </td>
                  <td style={S.tdRight}>{f2(sp.botAs_cm2)}</td>
                  <td style={S.tdRight}>
                    <span style={S.badge(botOk)} />
                    {f4(sp.rhoBot)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Section>

      {/* ─── RATIOS ───────────────────────────────────── */}
      <Section title="Ratios" defaultOpen>
        <div style={{ display: 'flex', gap: 8 }}>
          <div style={S.kpiCard}>
            <div style={S.kpiValue}>
              {m.totalConcreto > 0 ? f2(m.totalAcero / m.totalConcreto) : '—'}
            </div>
            <div style={S.kpiLabel}>kg/m&sup3;</div>
          </div>
          <div style={S.kpiCard}>
            <div style={S.kpiValue}>
              {m.totalEncofrado > 0 ? f2(m.totalAcero / m.totalEncofrado) : '—'}
            </div>
            <div style={S.kpiLabel}>kg/m&sup2;</div>
          </div>
          <div style={S.kpiCard}>
            <div style={S.kpiValue}>
              {totalL > 0 ? f2(m.totalAcero / totalL) : '—'}
            </div>
            <div style={S.kpiLabel}>kg/ml</div>
          </div>
        </div>
      </Section>
    </div>
  );
};
