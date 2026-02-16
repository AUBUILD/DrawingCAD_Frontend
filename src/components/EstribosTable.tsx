import React from 'react';

interface EstribosTableProps {
  dev: any;
  updateSpanStirrups: Function;
  updateSpanStirrupsSection: Function;
  stirrupsAbcrEdits: any;
  setStirrupsAbcrEdits: Function;
  setABCRField: Function;
}

const EstribosTable: React.FC<EstribosTableProps> = ({
  dev,
  updateSpanStirrups,
  updateSpanStirrupsSection,
  stirrupsAbcrEdits,
  setStirrupsAbcrEdits,
  setABCRField,
}) => {
  const spans = dev.spans ?? [];
  const getSt = (s: any) => (s as any).stirrups ?? {};
  const caseTypeOf = (st: any) => String(st.case_type ?? 'simetrica');
  const singleEndOf = (st: any) => String(st.single_end ?? '');
  const modeOf = (st: any) => {
    const v = String(st.design_mode ?? 'sismico').trim().toLowerCase();
    return v === 'gravedad' ? 'gravedad' : 'sismico';
  };
  const fmt = (v: number | undefined | null) => (typeof v === 'number' && Number.isFinite(v) ? v.toFixed(2) : '');
  const fmtInt = (v: number | undefined | null) => (typeof v === 'number' && Number.isFinite(v) ? String(Math.max(0, Math.round(v))) : '');
  const mkAbcrKey = (spanIdx: number, side: 'L' | 'R', field: 'A' | 'b' | 'B' | 'c' | 'C' | 'R') => `stABCR:${spanIdx}:${side}:${field}`;
  const defaultSpecTextFor = (span: any, mode: 'sismico' | 'gravedad') => {
    const h = typeof span.h === 'number' ? span.h : 0.5;
    return formatStirrupsABCR(pickDefaultABCRForH(h, mode));
  };
  const getSpecKeyForSide = (ct: string, side: 'L' | 'R') => {
    const ctt = String(ct || '').trim().toLowerCase();
    if (ctt === 'asim_uno') {
      return side === 'L' ? 'left_spec' : 'center_spec';
    }
    return side === 'L' ? 'left_spec' : 'right_spec';
  };
  const getABCR = (st: any, key: 'left_spec' | 'center_spec' | 'right_spec'): StirrupsABCR => {
    const parsed = parseStirrupsABCR(String(st?.[key] ?? '').trim());
    return (
      parsed ?? {
        A_m: 0,
        b_n: 0,
        B_m: 0,
        c_n: 0,
        C_m: 0,
        R_m: 0,
      }
    );
  };

  return (
    <div className="tableContainer">
      <div className="tableScroll">
        <div className="matrix" style={{ gridTemplateColumns: `105px repeat(${spans.length}, 90px)` }}>
          <div className="cell head rowLabel">Parámetros</div>
          {spans.map((_, i) => (
            <div className={'cell head'} key={`stirrups-head-${i}`}>
              <div className="mono">Tramo {i + 1}</div>
            </div>
          ))}
          <div className="cell rowLabel">Diámetro</div>
          {spans.map((s, i) => {
            const st = getSt(s);
            const dia = normalizeDiaKey(String(st.diameter ?? '3/8').replace(/[∅\s]/g, '')) || '3/8';
            return (
              <div className="cell" key={`st-dia-${i}`}>
                <select
                  className="cellInput"
                  value={dia}
                  onChange={(e) => updateSpanStirrups(i, { diameter: e.target.value })}
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
                  onChange={(e) => updateSpanStirrups(i, { case_type: e.target.value })}
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
                    const m = (String(e.target.value || '').toLowerCase() === 'gravedad' ? 'gravedad' : 'sismico');
                    const spec = defaultSpecTextFor(s, m);
                    if (ct === 'asim_uno') {
                      updateSpanStirrups(i, { design_mode: m, left_spec: spec, center_spec: spec, right_spec: null });
                    } else {
                      updateSpanStirrups(i, { design_mode: m, left_spec: spec, right_spec: spec, center_spec: null });
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
                  onChange={(e) => updateSpanStirrups(i, { single_end: e.target.value ? e.target.value : null })}
                >
                  <option value="">—</option>
                  <option value="left">Left</option>
                  <option value="right">Right</option>
                </select>
              </div>
            );
          })}
          {/* ABCR por extremo: cada fila tiene inputs Izq/Der (o Especial/Resto en asim_uno) */}
          { [
            { f: 'A', label: 'A (m)', ph: '0.05', isInt: false },
            { f: 'b', label: 'b (cant)', ph: '8', isInt: true },
            { f: 'B', label: 'B (m)', ph: '0.10', isInt: false },
            { f: 'c', label: 'c (cant)', ph: '5', isInt: true },
            { f: 'C', label: 'C (m)', ph: '0.15', isInt: false },
            { f: 'R', label: 'R (m)', ph: '0.25', isInt: false },
          ].map((row) => (
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
                const valueFor = (ab: any) => {
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
                          onChange={(e) => setStirrupsAbcrEdits((p: any) => ({ ...p, [kL]: e.target.value }))}
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
                          onChange={(e) => setStirrupsAbcrEdits((p: any) => ({ ...p, [kR]: e.target.value }))}
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
      </div>
    </div>
  );
};

export default EstribosTable;
