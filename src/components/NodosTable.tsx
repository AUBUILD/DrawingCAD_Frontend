import React from 'react';

// Types and utility functions (extract from App2.tsx as needed)
// Example types (replace with actual types from App2.tsx):
// type NodeSlot = { nodeIdx: number; end: number; label: string };
// type DevType = { nodes: any[]; spans: any[] };

interface NodosTableProps {
  dev: any;
  setNodeBastonLineKind: Function;
  setNodeBastonLineToFace: Function;
  nodeBastonLineKind: Function;
  nodeBastonLineToFaceEnabled: Function;
  normalizeBastonCfg: Function;
  buildNodeSlots: Function;
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

  const zoneEnabledForSlot = (side: 'top' | 'bottom', s: any) => {
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

  const Cell = (props: { slot: any; side: 'top' | 'bottom' }) => {
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
              onChange={(e) => setNodeBastonLineKind(slot.nodeIdx, side, slot.end, 1, e.target.value)}
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
              onChange={(e) => setNodeBastonLineKind(slot.nodeIdx, side, slot.end, 2, e.target.value)}
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
          {slots.map((s: any) => (
            <div className={'cell head'} key={`baston-node-head-${s.nodeIdx}-${s.end}`}>
              <div className="mono">{s.label}</div>
            </div>
          ))}
          <div className="cell rowLabel">Sup.</div>
          {slots.map((s: any) => (
            <Cell slot={s} side="top" key={`baston-top-cell-${s.nodeIdx}-${s.end}`} />
          ))}
          <div className="cell rowLabel">Inf.</div>
          {slots.map((s: any) => (
            <Cell slot={s} side="bottom" key={`baston-bot-cell-${s.nodeIdx}-${s.end}`} />
          ))}
        </div>
      </div>
    </div>
  );
};

export default NodosTable;
