import React from 'react';
import type { DevelopmentIn, NodeIn, SteelKind, BastonCfg, BastonesSideCfg } from '../types';
import type { NodeSlot } from '../services/steelService';

interface NodosTableProps {
  dev: DevelopmentIn;
  setNodeBastonLineKind: (nodeIdx: number, side: 'top' | 'bottom', end: 1 | 2, line: 1 | 2, kind: SteelKind) => void;
  setNodeBastonLineToFace: (nodeIdx: number, side: 'top' | 'bottom', end: 1 | 2, line: 1 | 2, enabled: boolean) => void;
  nodeBastonLineKind: (node: NodeIn, side: 'top' | 'bottom', end: 1 | 2, line: 1 | 2) => SteelKind;
  nodeBastonLineToFaceEnabled: (node: NodeIn, side: 'top' | 'bottom', end: 1 | 2, line: 1 | 2) => boolean;
  normalizeBastonCfg: (input: unknown) => BastonCfg;
  buildNodeSlots: (nodes: NodeIn[]) => NodeSlot[];
}

const NodosTable: React.FC<NodosTableProps> = ({
  dev,
  setNodeBastonLineKind,
  setNodeBastonLineToFace,
  nodeBastonLineKind,
  nodeBastonLineToFaceEnabled,
  normalizeBastonCfg,
  buildNodeSlots,
}) => {
  const nodes = dev.nodes ?? [];
  const spans = dev.spans ?? [];
  const slots = buildNodeSlots(nodes);

  const zoneEnabledForSlot = (side: 'top' | 'bottom', s: NodeSlot) => {
    const spanIdx = s.end === 2 ? s.nodeIdx : s.nodeIdx - 1;
    const zone: 'z1' | 'z3' = s.end === 2 ? 'z1' : 'z3';
    const span = spans[spanIdx];
    if (!span) return { l1: false, l2: false };
    const b = span.bastones ?? {} as Partial<{ top: BastonesSideCfg; bottom: BastonesSideCfg }>;
    const ss = (side === 'top' ? b.top : b.bottom) ?? {} as Partial<BastonesSideCfg>;
    const cfg = normalizeBastonCfg((ss as Record<string, unknown>)[zone]);
    return {
      l1: Boolean(cfg.l1_enabled),
      l2: Boolean(cfg.l2_enabled),
    };
  };

  const Cell = (props: { slot: NodeSlot; side: 'top' | 'bottom' }) => {
    const { slot, side } = props;
    const n = nodes[slot.nodeIdx];
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
              onChange={(e) => setNodeBastonLineKind(slot.nodeIdx, side, slot.end, 1, e.target.value as SteelKind)}
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
              onChange={(e) => setNodeBastonLineKind(slot.nodeIdx, side, slot.end, 2, e.target.value as SteelKind)}
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
    <div className="tableContainer">
      <div className="tableScroll">
        <div className="matrix" style={{ gridTemplateColumns: `105px repeat(${slots.length}, 90px)` }}>
          <div className="cell head rowLabel">Parámetros</div>
          {slots.map((s: NodeSlot) => (
            <div className={'cell head'} key={`baston-node-head-${s.nodeIdx}-${s.end}`}>
              <div className="mono">{s.label}</div>
            </div>
          ))}
          <div className="cell rowLabel">Sup.</div>
          {slots.map((s: NodeSlot) => (
            <Cell slot={s} side="top" key={`baston-top-cell-${s.nodeIdx}-${s.end}`} />
          ))}
          <div className="cell rowLabel">Inf.</div>
          {slots.map((s: NodeSlot) => (
            <Cell slot={s} side="bottom" key={`baston-bot-cell-${s.nodeIdx}-${s.end}`} />
          ))}
        </div>
      </div>
    </div>
  );
};

export default React.memo(NodosTable);
