/**
 * Exportación de metrados a Excel (.xlsx).
 *
 * Genera un workbook con múltiples hojas para auditoría:
 *   - Resumen General
 *   - Detalle por Tramo
 *   - Acero Corrido (detalle topológico)
 *   - Bastones (detalle topológico)
 *   - Estribos (detalle por tramo)
 *   - Desglose por Diámetro
 *
 * xlsx se importa dinámicamente para que no entre en el bundle principal.
 */
import type { DevelopmentIn } from '../../types';
import {
  calcMetrado,
  kgM,
  FC,
  FY,
  RHO_MIN,
  RHO_MAX,
  type MetradoResult,
} from './metradoCalcs';

// ─── Helpers ────────────────────────────────────────────────────

function f2(v: number): string { return v.toFixed(2); }
function f3(v: number): string { return v.toFixed(3); }
function f4(v: number): string { return v.toFixed(4); }

interface BeamInput {
  dev: DevelopmentIn;
  recubrimiento: number;
}

// Lazy-loaded xlsx module reference
type XLSXModule = typeof import('xlsx');

async function loadXLSX(): Promise<XLSXModule> {
  return import('xlsx');
}

function buildBeamCalc(dev: DevelopmentIn, recub: number) {
  const m = calcMetrado(dev, recub);
  const beamName = dev.name || 'VIGA';
  return { m, beamName };
}

function buildEstribosDetalle(
  dev: DevelopmentIn,
  m: MetradoResult,
  recub: number,
) {
  const rows: Array<{ tramo: string; cant: number; long_m: number; dia: string; kg_m: number; peso_kg: number }> = [];
  m.spans.forEach((sp) => {
    const src = dev.spans?.[sp.idx];
    const st = src?.stirrups;
    if (!st || !(sp.estribos_count > 0)) return;
    const dia = String(st.diameter ?? '8mm');
    const hookLeg = 0.135;
    const perim = 2 * Math.max(0, sp.b - 2 * recub) + 2 * Math.max(0, sp.h - 2 * recub) + 2 * hookLeg;
    rows.push({
      tramo: `T${sp.idx + 1}`,
      cant: sp.estribos_count,
      long_m: perim,
      dia,
      kg_m: kgM(dia),
      peso_kg: sp.estribos_count * perim * kgM(dia),
    });
  });
  return rows;
}

// ─── Single beam export ─────────────────────────────────────────

export async function exportMetradoSingle(dev: DevelopmentIn, recub: number): Promise<void> {
  const XLSX = await loadXLSX();
  const { m, beamName } = buildBeamCalc(dev, recub);
  const wb = XLSX.utils.book_new();

  addResumenSheet(XLSX, wb, beamName, m);
  addTramoSheet(XLSX, wb, beamName, m);
  addDesgloseSheet(XLSX, wb, beamName, m);
  addCorridoDetalleSheet(XLSX, wb, beamName, m);
  addBastonesDetalleSheet(XLSX, wb, beamName, m);
  addEstribosDetalleSheet(XLSX, wb, beamName, dev, m, recub);

  const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  downloadXlsx(buf, `Metrado_${beamName.replace(/\s+/g, '_')}.xlsx`);
}

// ─── Multi-beam export ──────────────────────────────────────────

export async function exportMetradoAll(beams: BeamInput[]): Promise<void> {
  const XLSX = await loadXLSX();
  const wb = XLSX.utils.book_new();

  // Consolidado
  const consolidadoRows: any[][] = [
    ['METRADO CONSOLIDADO - TODAS LAS VIGAS'],
    [],
    [`f'c = ${FC} kg/cm²`, `fy = ${FY} kg/cm²`, `ρmin = ${f4(RHO_MIN)}`, `ρmax = ${f4(RHO_MAX)}`],
    [],
    ['Viga', 'Concreto (m³)', 'Encofrado (m²)', 'Acero Corrido (kg)', 'Acero Bastones (kg)', 'Acero Estribos (kg)', 'ACERO TOTAL (kg)', 'kg/m³', 'kg/m²', 'kg/ml'],
  ];

  let grandConcreto = 0, grandEncofrado = 0;
  let grandCorrido = 0, grandBastones = 0, grandEstribos = 0;
  const grandCorridoByDia: Record<string, number> = {};
  const grandBastonesByDia: Record<string, number> = {};
  const grandEstribosByDia: Record<string, number> = {};
  let grandL = 0;

  const results: Array<{ beamName: string; m: MetradoResult; dev: DevelopmentIn; recub: number }> = [];

  for (const { dev, recubrimiento } of beams) {
    const { m, beamName } = buildBeamCalc(dev, recubrimiento);
    results.push({ beamName, m, dev, recub: recubrimiento });

    const totalL = m.spans.reduce((s, sp) => s + sp.L, 0);
    grandL += totalL;
    grandConcreto += m.totalConcreto;
    grandEncofrado += m.totalEncofrado;
    grandCorrido += m.totalCorrido;
    grandBastones += m.totalBastones;
    grandEstribos += m.totalEstribos;
    for (const [k, v] of Object.entries(m.corridoByDia)) grandCorridoByDia[k] = (grandCorridoByDia[k] ?? 0) + v;
    for (const [k, v] of Object.entries(m.bastonesByDia)) grandBastonesByDia[k] = (grandBastonesByDia[k] ?? 0) + v;
    for (const [k, v] of Object.entries(m.estribosByDia)) grandEstribosByDia[k] = (grandEstribosByDia[k] ?? 0) + v;

    consolidadoRows.push([
      beamName,
      +f2(m.totalConcreto),
      +f2(m.totalEncofrado),
      +f2(m.totalCorrido),
      +f2(m.totalBastones),
      +f2(m.totalEstribos),
      +f2(m.totalAcero),
      m.totalConcreto > 0 ? +f2(m.totalAcero / m.totalConcreto) : 0,
      m.totalEncofrado > 0 ? +f2(m.totalAcero / m.totalEncofrado) : 0,
      totalL > 0 ? +f2(m.totalAcero / totalL) : 0,
    ]);
  }

  const grandAcero = grandCorrido + grandBastones + grandEstribos;
  consolidadoRows.push([]);
  consolidadoRows.push([
    'TOTAL',
    +f2(grandConcreto),
    +f2(grandEncofrado),
    +f2(grandCorrido),
    +f2(grandBastones),
    +f2(grandEstribos),
    +f2(grandAcero),
    grandConcreto > 0 ? +f2(grandAcero / grandConcreto) : 0,
    grandEncofrado > 0 ? +f2(grandAcero / grandEncofrado) : 0,
    grandL > 0 ? +f2(grandAcero / grandL) : 0,
  ]);

  const wsConsolidado = XLSX.utils.aoa_to_sheet(consolidadoRows);
  wsConsolidado['!cols'] = [{ wch: 20 }, { wch: 14 }, { wch: 14 }, { wch: 18 }, { wch: 18 }, { wch: 18 }, { wch: 16 }, { wch: 10 }, { wch: 10 }, { wch: 10 }];
  XLSX.utils.book_append_sheet(wb, wsConsolidado, 'Consolidado');

  // Desglose global por diámetro
  const allDias = [...new Set([
    ...Object.keys(grandCorridoByDia),
    ...Object.keys(grandBastonesByDia),
    ...Object.keys(grandEstribosByDia),
  ])].sort((a, b) => (kgM(a) || 0) - (kgM(b) || 0));

  const desgloseRows: any[][] = [
    ['DESGLOSE POR DIÁMETRO - CONSOLIDADO'],
    [],
    ['Diámetro', 'Corrido (kg)', 'Bastones (kg)', 'Estribos (kg)', 'Total (kg)'],
  ];
  for (const dia of allDias) {
    const c = grandCorridoByDia[dia] ?? 0;
    const b = grandBastonesByDia[dia] ?? 0;
    const e = grandEstribosByDia[dia] ?? 0;
    desgloseRows.push([dia, +f2(c), +f2(b), +f2(e), +f2(c + b + e)]);
  }
  desgloseRows.push([]);
  desgloseRows.push(['TOTAL', +f2(grandCorrido), +f2(grandBastones), +f2(grandEstribos), +f2(grandAcero)]);

  const wsDesglose = XLSX.utils.aoa_to_sheet(desgloseRows);
  wsDesglose['!cols'] = [{ wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 }];
  XLSX.utils.book_append_sheet(wb, wsDesglose, 'Desglose Global');

  // Per-beam detail sheets
  for (const { beamName, m, dev, recub } of results) {
    const sheetName = beamName.substring(0, 28);
    const rows: any[][] = [];

    rows.push([`METRADO DETALLADO: ${beamName}`]);
    rows.push([`Recubrimiento: ${f2(recub * 100)} cm`, `f'c=${FC}`, `fy=${FY}`]);
    rows.push([]);

    rows.push(['RESUMEN']);
    rows.push(['Concreto (m³)', +f2(m.totalConcreto)]);
    rows.push(['Encofrado (m²)', +f2(m.totalEncofrado)]);
    rows.push(['Acero Corrido (kg)', +f2(m.totalCorrido)]);
    rows.push(['Acero Bastones (kg)', +f2(m.totalBastones)]);
    rows.push(['Acero Estribos (kg)', +f2(m.totalEstribos)]);
    rows.push(['ACERO TOTAL (kg)', +f2(m.totalAcero)]);
    rows.push([]);

    rows.push(['DETALLE POR TRAMO']);
    rows.push(['Tramo', 'L (m)', 'h (m)', 'b (m)', 'Concreto (m³)', 'Encofrado (m²)', 'Corrido (kg)', 'Bastones (kg)', 'Estribos (kg)', 'As sup (cm²)', 'As inf (cm²)', 'ρ sup', 'ρ inf']);
    for (const sp of m.spans) {
      rows.push([
        `T${sp.idx + 1}`, +f2(sp.L), +f2(sp.h), +f2(sp.b),
        +f2(sp.concreto_m3), +f2(sp.encofrado_m2),
        +f2(sp.corrido_kg), +f2(sp.bastones_kg), +f2(sp.estribos_kg),
        +f2(sp.topAs_cm2), +f2(sp.botAs_cm2),
        +f4(sp.rhoTop), +f4(sp.rhoBot),
      ]);
    }
    rows.push([]);

    if (m.corridoDetalle.length > 0) {
      rows.push(['ACERO CORRIDO - DETALLE']);
      rows.push(['Código', 'Diámetro', 'Longitud (m)', 'Cantidad', 'kg/ml', 'Peso (kg)', 'Empalmes']);
      for (const r of m.corridoDetalle) {
        rows.push([r.codigo, r.dia, +f2(r.len_m), r.qty, +f3(r.kg_m), +f4(r.peso_kg), r.nSplices]);
      }
      rows.push(['', '', '', '', 'TOTAL', +f4(m.corridoDetalle.reduce((a, r) => a + r.peso_kg, 0))]);
      rows.push([]);
    }

    if (m.bastonesDetalle.length > 0) {
      rows.push(['BASTONES - DETALLE TOPOLÓGICO']);
      rows.push(['Código', 'Diámetro', 'Longitud (m)', 'Cantidad', 'kg/ml', 'Peso (kg)', 'Empalmes', 'Tramos', 'Etiquetas']);
      for (const d of m.bastonesDetalle) {
        rows.push([d.codigo, d.dia, +f2(d.len_m), d.qty, +f3(d.kg_m), +f4(d.peso_kg), d.nSplices, d.spans, d.tags_txt]);
      }
      rows.push(['', '', '', '', 'TOTAL', +f4(m.bastonesDetalle.reduce((a, d) => a + d.peso_kg, 0))]);
      rows.push([]);
    }

    const estDet = buildEstribosDetalle(dev, m, recub);
    if (estDet.length > 0) {
      rows.push(['ESTRIBOS - DETALLE']);
      rows.push(['Tramo', 'Diámetro', 'Longitud c/u (m)', 'Cantidad', 'kg/ml', 'Peso (kg)']);
      for (const r of estDet) {
        rows.push([r.tramo, r.dia, +f2(r.long_m), r.cant, +f3(r.kg_m), +f4(r.peso_kg)]);
      }
      rows.push(['', '', '', '', 'TOTAL', +f4(estDet.reduce((a, r) => a + r.peso_kg, 0))]);
    }

    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [{ wch: 16 }, { wch: 12 }, { wch: 14 }, { wch: 10 }, { wch: 10 }, { wch: 14 }, { wch: 10 }, { wch: 16 }, { wch: 20 }];
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
  }

  const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  downloadXlsx(buf, 'Metrado_Consolidado.xlsx');
}

// ─── Single-beam sheet helpers ──────────────────────────────────

function addResumenSheet(XLSX: XLSXModule, wb: any, beamName: string, m: MetradoResult) {
  const totalL = m.spans.reduce((s, sp) => s + sp.L, 0);
  const rows: any[][] = [
    [`METRADO: ${beamName}`],
    [],
    [`f'c = ${FC} kg/cm²`, `fy = ${FY} kg/cm²`, `ρmin = ${f4(RHO_MIN)}`, `ρmax = ${f4(RHO_MAX)}`],
    [],
    ['Concepto', 'Valor', 'Unidad'],
    ['Concreto', +f2(m.totalConcreto), 'm³'],
    ['Encofrado', +f2(m.totalEncofrado), 'm²'],
    [],
    ['Acero Corrido', +f2(m.totalCorrido), 'kg'],
    ['Acero Bastones', +f2(m.totalBastones), 'kg'],
    ['Acero Estribos', +f2(m.totalEstribos), 'kg'],
    ['ACERO TOTAL', +f2(m.totalAcero), 'kg'],
    [],
    ['RATIOS'],
    ['kg/m³', m.totalConcreto > 0 ? +f2(m.totalAcero / m.totalConcreto) : '—'],
    ['kg/m²', m.totalEncofrado > 0 ? +f2(m.totalAcero / m.totalEncofrado) : '—'],
    ['kg/ml', totalL > 0 ? +f2(m.totalAcero / totalL) : '—'],
  ];
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{ wch: 20 }, { wch: 14 }, { wch: 10 }];
  XLSX.utils.book_append_sheet(wb, ws, 'Resumen');
}

function addTramoSheet(XLSX: XLSXModule, wb: any, beamName: string, m: MetradoResult) {
  const rows: any[][] = [
    [`DETALLE POR TRAMO: ${beamName}`],
    [],
    ['Tramo', 'L (m)', 'h (m)', 'b (m)', 'Concreto (m³)', 'Encofrado (m²)', 'Corrido (kg)', 'Bastones (kg)', 'Estribos (kg)', 'Estr. Cant.', 'As sup (cm²)', 'As inf (cm²)', 'ρ sup', 'ρ inf'],
  ];
  for (const sp of m.spans) {
    rows.push([
      `T${sp.idx + 1}`, +f2(sp.L), +f2(sp.h), +f2(sp.b),
      +f2(sp.concreto_m3), +f2(sp.encofrado_m2),
      +f2(sp.corrido_kg), +f2(sp.bastones_kg), +f2(sp.estribos_kg), sp.estribos_count,
      +f2(sp.topAs_cm2), +f2(sp.botAs_cm2),
      +f4(sp.rhoTop), +f4(sp.rhoBot),
    ]);
  }
  rows.push([]);
  rows.push([
    'TOTAL', '', '', '',
    +f2(m.totalConcreto), +f2(m.totalEncofrado),
    +f2(m.totalCorrido), +f2(m.totalBastones), +f2(m.totalEstribos), '',
    '', '', '', '',
  ]);
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [
    { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 8 },
    { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 10 },
    { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 10 },
  ];
  XLSX.utils.book_append_sheet(wb, ws, 'Por Tramo');
}

function addDesgloseSheet(XLSX: XLSXModule, wb: any, beamName: string, m: MetradoResult) {
  const rows: any[][] = [
    [`DESGLOSE POR DIÁMETRO: ${beamName}`],
    [],
    ['Diámetro', 'Corrido (kg)', 'Bastones (kg)', 'Estribos (kg)', 'Total (kg)'],
  ];
  for (const dia of m.allDias) {
    const c = m.corridoByDia[dia] ?? 0;
    const b = m.bastonesByDia[dia] ?? 0;
    const e = m.estribosByDia[dia] ?? 0;
    rows.push([dia, +f2(c), +f2(b), +f2(e), +f2(c + b + e)]);
  }
  rows.push([]);
  rows.push(['TOTAL', +f2(m.totalCorrido), +f2(m.totalBastones), +f2(m.totalEstribos), +f2(m.totalAcero)]);
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{ wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 }];
  XLSX.utils.book_append_sheet(wb, ws, 'Por Diámetro');
}

function addCorridoDetalleSheet(XLSX: XLSXModule, wb: any, beamName: string, m: MetradoResult) {
  const rows: any[][] = [
    [`ACERO CORRIDO DETALLE: ${beamName}`],
    [],
    ['Código', 'Diámetro', 'Longitud (m)', 'Cantidad', 'kg/ml', 'Peso (kg)', 'Empalmes'],
  ];
  for (const r of m.corridoDetalle) {
    rows.push([r.codigo, r.dia, +f2(r.len_m), r.qty, +f3(r.kg_m), +f4(r.peso_kg), r.nSplices]);
  }
  if (m.corridoDetalle.length > 0) {
    rows.push([]);
    rows.push(['', '', '', '', 'TOTAL', +f4(m.corridoDetalle.reduce((a, r) => a + r.peso_kg, 0))]);
  }
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{ wch: 12 }, { wch: 10 }, { wch: 14 }, { wch: 10 }, { wch: 10 }, { wch: 14 }, { wch: 10 }];
  XLSX.utils.book_append_sheet(wb, ws, 'Corrido Detalle');
}

function addBastonesDetalleSheet(XLSX: XLSXModule, wb: any, beamName: string, m: MetradoResult) {
  const rows: any[][] = [
    [`BASTONES DETALLE: ${beamName}`],
    [],
    ['Código', 'Diámetro', 'Longitud (m)', 'Cantidad', 'kg/ml', 'Peso (kg)', 'Empalmes', 'Tramos', 'Etiquetas'],
  ];
  for (const d of m.bastonesDetalle) {
    rows.push([d.codigo, d.dia, +f2(d.len_m), d.qty, +f3(d.kg_m), +f4(d.peso_kg), d.nSplices, d.spans, d.tags_txt]);
  }
  if (m.bastonesDetalle.length > 0) {
    rows.push([]);
    rows.push(['', '', '', '', 'TOTAL', +f4(m.bastonesDetalle.reduce((a, d) => a + d.peso_kg, 0))]);
  }
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{ wch: 12 }, { wch: 10 }, { wch: 14 }, { wch: 10 }, { wch: 10 }, { wch: 14 }, { wch: 10 }, { wch: 16 }, { wch: 24 }];
  XLSX.utils.book_append_sheet(wb, ws, 'Bastones Detalle');
}

function addEstribosDetalleSheet(XLSX: XLSXModule, wb: any, beamName: string, dev: DevelopmentIn, m: MetradoResult, recub: number) {
  const estDet = buildEstribosDetalle(dev, m, recub);
  const rows: any[][] = [
    [`ESTRIBOS DETALLE: ${beamName}`],
    [],
    ['Tramo', 'Diámetro', 'Longitud c/u (m)', 'Cantidad', 'kg/ml', 'Peso (kg)'],
  ];
  for (const r of estDet) {
    rows.push([r.tramo, r.dia, +f2(r.long_m), r.cant, +f3(r.kg_m), +f4(r.peso_kg)]);
  }
  if (estDet.length > 0) {
    rows.push([]);
    rows.push(['', '', '', '', 'TOTAL', +f4(estDet.reduce((a, r) => a + r.peso_kg, 0))]);
  }
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{ wch: 10 }, { wch: 10 }, { wch: 18 }, { wch: 10 }, { wch: 10 }, { wch: 14 }];
  XLSX.utils.book_append_sheet(wb, ws, 'Estribos Detalle');
}

// ─── Download helper ────────────────────────────────────────────

function downloadXlsx(buf: ArrayBuffer, filename: string) {
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
