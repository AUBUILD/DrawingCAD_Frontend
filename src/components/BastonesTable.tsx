import React from 'react';
import type { DevelopmentIn, SpanIn, BastonCfg, BastonesSideCfg } from '../types';

interface BastonesTableProps {
  dev: DevelopmentIn;
  appCfg: { baston_Lc?: number };
  updateBaston: (spanIdx: number, side: 'top' | 'bottom', zone: 'z1' | 'z2' | 'z3', patch: Partial<BastonCfg>) => void;
  bastonLenEdits: Record<string, string>;
  setBastonLenEdits: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  normalizeBastonCfg: (input: unknown) => BastonCfg;
  snapBastonM: (v: number) => number;
}

const BastonesTable: React.FC<BastonesTableProps> = ({
  dev,
  appCfg,
  updateBaston,
  bastonLenEdits,
  setBastonLenEdits,
  normalizeBastonCfg,
  snapBastonM,
}) => {
  const spans = dev.spans ?? [];
  const Lc = typeof dev.baston_Lc === 'number' ? dev.baston_Lc : appCfg.baston_Lc;
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
    const b = s.bastones ?? {} as Partial<{ top: BastonesSideCfg; bottom: BastonesSideCfg }>;
    const ss = (side === 'top' ? b.top : b.bottom) ?? {} as Partial<BastonesSideCfg>;
    return normalizeBastonCfg((ss as Record<string, unknown>)[zone]);
  };
  const mkLenKey = (spanIdx: number, side: 'top' | 'bottom', zone: 'z1' | 'z2' | 'z3', field: 'L1_m' | 'L2_m' | 'L3_m') =>
    `baston-len:${spanIdx}:${side}:${zone}:${field}`;
  const commitLen = (spanIdx: number, side: 'top' | 'bottom', zone: 'z1' | 'z2' | 'z3', field: 'L1_m' | 'L2_m' | 'L3_m', raw: string) => {
    const s = (raw ?? '').trim();
    const key = mkLenKey(spanIdx, side, zone, field);
    if (!s) {
      updateBaston(spanIdx, side, zone, { [field]: undefined });
      setBastonLenEdits((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
      return;
    }
    const v = Number(s.replace(',', '.'));
    if (!(Number.isFinite(v) && v > 0)) {
      setBastonLenEdits((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
      return;
    }
    const normalized = snapBastonM(v);
    updateBaston(spanIdx, side, zone, { [field]: normalized });
    setBastonLenEdits((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  return (
    <div className="tableContainer">
      <div className="tableScroll">
        <div className="matrix" style={{ gridTemplateColumns: `105px repeat(${spans.length}, 90px)` }}>
          <div className="cell head rowLabel">Parámetros</div>
          {spans.map((_: SpanIn, i: number) => (
            <div className={'cell head'} key={`baston-head-${i}`}>
              <div className="mono">Tramo {i + 1}</div>
            </div>
          ))}
          {(['top', 'bottom'] as const).flatMap((side) =>
            (['z1', 'z2', 'z3'] as const).map((zone) => {
              const rowLabel = `${side === 'top' ? 'Sup.' : 'Inf.'}: ${zoneLabel(zone)}`;
              return (
                <React.Fragment key={`${side}-${zone}`}>
                  <div className="cell rowLabel">{rowLabel}</div>
                  {spans.map((s: SpanIn, i: number) => {
                    const cfg = getCfg(s, side, zone);
                    const qtyKey = 'qty';
                    const diaKey = 'diameter';
                    const def12 = (Lc ?? 1) / 7;
                    const def3 = (Lc ?? 1) / 5;
                    const disabledAll = false;
                    return (
                      <div className="cell" key={`baston-${side}-${zone}-${i}`}>
                        <select
                          className="cellInput"
                          value={String(Math.max(1, Math.min(3, Math.round(Number(cfg[qtyKey] ?? 1)))))}
                          disabled={disabledAll}
                          onChange={(e) => updateBaston(i, side, zone, { [qtyKey]: Number(e.target.value) })}
                          style={{ width: 56 }}
                          title="Cantidad (1-3)"
                        >
                          <option value="1">1</option>
                          <option value="2">2</option>
                          <option value="3">3</option>
                        </select>
                        <select
                          className="cellInput"
                          value={String(cfg[diaKey] ?? '3/4')}
                          disabled={disabledAll}
                          onChange={(e) => updateBaston(i, side, zone, { [diaKey]: e.target.value })}
                          style={{ width: 76 }}
                          title="Diámetro"
                        >
                          {diameterOptions}
                        </select>
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
                                (cfg.L1_m == null ? def12.toFixed(2) : snapBastonM(cfg.L1_m).toFixed(2))
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
                                (cfg.L2_m == null ? def12.toFixed(2) : snapBastonM(cfg.L2_m).toFixed(2))
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
                              bastonLenEdits[mkLenKey(i, side, zone, 'L3_m')] ??
                              (cfg.L3_m == null ? def3.toFixed(2) : snapBastonM(cfg.L3_m).toFixed(2))
                            }
                            onChange={(e) => setBastonLenEdits((p) => ({ ...p, [mkLenKey(i, side, zone, 'L3_m')]: e.target.value }))}
                            onBlur={(e) => commitLen(i, side, zone, 'L3_m', e.target.value)}
                            title="L3 (m)"
                          />
                        )}
                      </div>
                    );
                  })}
                </React.Fragment>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};

export default React.memo(BastonesTable);
