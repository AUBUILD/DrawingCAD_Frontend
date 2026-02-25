import React, { useCallback } from 'react';
import type { SpanIn, NodeIn, SteelKind } from '../types';
import { PopoverShell } from './PopoverShell';

// ============================================================================
// Constants
// ============================================================================
const DIAMETERS = ['3/8', '1/2', '5/8', '3/4', '1', '1-3/8'];
const KIND_LABELS: Record<SteelKind, string> = { continuous: 'Continuo', hook: 'Gancho', development: 'Anclaje' };

// ============================================================================
// Span steel popover (qty + diameter for top/bottom, up to 2 diameters)
// ============================================================================
interface SpanSteelProps {
  spanIdx: number;
  span: SpanIn;
  anchorX: number;
  anchorY: number;
  containerRect: DOMRect | null;
  onClose: () => void;
  onUpdateSpanSteel: (spanIdx: number, side: 'top' | 'bottom', patch: Partial<{ qty: number; diameter: string }>) => void;
}

export const SpanSteelPopover: React.FC<SpanSteelProps> = ({
  spanIdx, span, anchorX, anchorY, containerRect, onClose, onUpdateSpanSteel,
}) => {
  const topQty = span.steel_top?.qty ?? 2;
  const topDia = span.steel_top?.diameter ?? '5/8';
  const botQty = span.steel_bottom?.qty ?? 2;
  const botDia = span.steel_bottom?.diameter ?? '5/8';

  return (
    <PopoverShell
      title={`Acero Corrido — T${spanIdx + 1}`}
      anchorX={anchorX} anchorY={anchorY}
      containerRect={containerRect} onClose={onClose}
    >
      {/* Superior */}
      <div className="soSectionTitle">Superior (−)</div>
      <div className="soRow">
        <span className="soLabel">Qty</span>
        <input
          className="soInput soInput--sm"
          type="number" min={1} max={10} step={1}
          value={topQty}
          onChange={(e) => onUpdateSpanSteel(spanIdx, 'top', { qty: Math.max(1, Number(e.target.value) || 1) })}
        />
        <span className="soLabel">⌀</span>
        <select
          className="soSelect"
          value={topDia}
          onChange={(e) => onUpdateSpanSteel(spanIdx, 'top', { diameter: e.target.value })}
        >
          {DIAMETERS.map((d) => <option key={d} value={d}>{d}"</option>)}
        </select>
      </div>

      <hr className="soDivider" />

      {/* Inferior */}
      <div className="soSectionTitle">Inferior (+)</div>
      <div className="soRow">
        <span className="soLabel">Qty</span>
        <input
          className="soInput soInput--sm"
          type="number" min={1} max={10} step={1}
          value={botQty}
          onChange={(e) => onUpdateSpanSteel(spanIdx, 'bottom', { qty: Math.max(1, Number(e.target.value) || 1) })}
        />
        <span className="soLabel">⌀</span>
        <select
          className="soSelect"
          value={botDia}
          onChange={(e) => onUpdateSpanSteel(spanIdx, 'bottom', { diameter: e.target.value })}
        >
          {DIAMETERS.map((d) => <option key={d} value={d}>{d}"</option>)}
        </select>
      </div>
    </PopoverShell>
  );
};

// ============================================================================
// Node connection popover (steel kind per end, per face)
// ============================================================================
interface NodeEndProps {
  nodeIdx: number;
  node: NodeIn;
  side: 'top' | 'bottom';
  end: 1 | 2;
  anchorX: number;
  anchorY: number;
  containerRect: DOMRect | null;
  onClose: () => void;
  onUpdateNode: (nodeIdx: number, patch: Partial<NodeIn>) => void;
}

export const NodeEndPopover: React.FC<NodeEndProps> = ({
  nodeIdx, node, side, end, anchorX, anchorY, containerRect, onClose, onUpdateNode,
}) => {
  const sideLabel = side === 'top' ? 'Superior (−)' : 'Inferior (+)';
  const endLabel = end === 1 ? `Izq (T${nodeIdx})` : `Der (T${nodeIdx + 1})`;

  const getKind = useCallback((_side: 'top' | 'bottom', _end: 1 | 2): SteelKind => {
    const key = `steel_${_side}_${_end}_kind` as keyof NodeIn;
    const v = node[key] as SteelKind | undefined;
    return v === 'hook' || v === 'development' || v === 'continuous' ? v : 'continuous';
  }, [node]);

  const setKind = useCallback((_side: 'top' | 'bottom', _end: 1 | 2, kind: SteelKind) => {
    const key = `steel_${_side}_${_end}_kind` as keyof NodeIn;
    onUpdateNode(nodeIdx, { [key]: kind } as any);
  }, [nodeIdx, onUpdateNode]);

  const getToFace = useCallback((_side: 'top' | 'bottom', _end: 1 | 2): boolean => {
    const key = `steel_${_side}_${_end}_to_face` as keyof NodeIn;
    return Boolean(node[key]);
  }, [node]);

  const setToFace = useCallback((_side: 'top' | 'bottom', _end: 1 | 2, val: boolean) => {
    const key = `steel_${_side}_${_end}_to_face` as keyof NodeIn;
    onUpdateNode(nodeIdx, { [key]: val } as any);
  }, [nodeIdx, onUpdateNode]);

  return (
    <PopoverShell
      title={`Conexión N${nodeIdx + 1} — ${sideLabel}`}
      anchorX={anchorX} anchorY={anchorY}
      containerRect={containerRect} onClose={onClose}
    >
      <div style={{ fontSize: 11, color: 'rgba(229,231,235,0.55)', marginBottom: 4 }}>{endLabel}</div>
      <div className="soRow" style={{ flexWrap: 'wrap' }}>
        <div className="soSegmented">
          {(['continuous', 'hook', 'development'] as SteelKind[]).map((k) => (
            <button
              key={k}
              className={`soSegBtn ${getKind(side, end) === k ? 'soSegBtnActive' : ''}`}
              onClick={() => setKind(side, end, k)}
              type="button"
            >
              {KIND_LABELS[k]}
            </button>
          ))}
        </div>
        {getKind(side, end) !== 'continuous' && (
          <label className="soCheck" style={{ marginLeft: 4 }}>
            <input
              type="checkbox"
              checked={getToFace(side, end)}
              onChange={(e) => setToFace(side, end, e.target.checked)}
            />
            <span>a cara</span>
          </label>
        )}
      </div>
    </PopoverShell>
  );
};
