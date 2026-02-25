import React, { useCallback } from 'react';
import type { SpanIn, NodeIn, BastonCfg, SteelKind } from '../types';
import { PopoverShell } from './PopoverShell';

// ============================================================================
// Constants
// ============================================================================
const DIAMETERS = ['3/8', '1/2', '5/8', '3/4', '1', '1-3/8'];
const KIND_LABELS: Record<SteelKind, string> = { continuous: 'Cont', hook: 'Gancho', development: 'Anclaje' };
const ZONES: Array<{ zone: 'z1' | 'z2' | 'z3'; label: string; badge: string }> = [
  { zone: 'z1', label: 'Zona 1 (izq)', badge: 'soBadge--z1' },
  { zone: 'z2', label: 'Zona 2 (centro)', badge: 'soBadge--z2' },
  { zone: 'z3', label: 'Zona 3 (der)', badge: 'soBadge--z3' },
];

// ============================================================================
// Helpers
// ============================================================================
function getBastonCfg(span: SpanIn, side: 'top' | 'bottom', zone: 'z1' | 'z2' | 'z3'): BastonCfg {
  const b = (span as any).bastones ?? {};
  const s = (side === 'top' ? b.top : b.bottom) ?? {};
  return (s as any)[zone] ?? {};
}

// ============================================================================
// Span Bastones Popover
// ============================================================================
interface SpanBastonesProps {
  spanIdx: number;
  span: SpanIn;
  side: 'top' | 'bottom';
  zone: 'z1' | 'z2' | 'z3';
  anchorX: number;
  anchorY: number;
  containerRect: DOMRect | null;
  onClose: () => void;
  onUpdateBaston: (spanIdx: number, side: 'top' | 'bottom', zone: 'z1' | 'z2' | 'z3', patch: Partial<BastonCfg>) => void;
}

export const SpanBastonesPopover: React.FC<SpanBastonesProps> = ({
  spanIdx, span, side, zone, anchorX, anchorY, containerRect, onClose, onUpdateBaston,
}) => {
  const sideLabel = side === 'top' ? 'Superior' : 'Inferior';
  const zoneInfo = ZONES.find((z) => z.zone === zone) ?? ZONES[0];
  const cfg = getBastonCfg(span, side, zone);
  const l1Enabled = cfg.l1_enabled ?? false;
  const l2Enabled = cfg.l2_enabled ?? false;

  return (
    <PopoverShell
      title={`Bastones ${sideLabel} ${zoneInfo.label} — T${spanIdx + 1}`}
      anchorX={anchorX} anchorY={anchorY}
      containerRect={containerRect} onClose={onClose}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
        <span className={`soBadge ${zoneInfo.badge}`}>{zone.toUpperCase()}</span>
        <span style={{ fontSize: 11, color: 'rgba(229,231,235,0.6)' }}>{zoneInfo.label}</span>
      </div>

      {/* Line 1 (outer) */}
      <div className="soRow">
        <label className="soCheck" style={{ minWidth: 48 }}>
          <input
            type="checkbox"
            checked={l1Enabled}
            onChange={(e) => onUpdateBaston(spanIdx, side, zone, { l1_enabled: e.target.checked })}
          />
          <span>L1</span>
        </label>
        {l1Enabled && (
          <>
            <input
              className="soInput soInput--sm"
              type="number" min={1} max={5} step={1}
              value={cfg.l1_qty ?? 1}
              onChange={(e) => onUpdateBaston(spanIdx, side, zone, { l1_qty: Math.max(1, Number(e.target.value) || 1) })}
              title="Cantidad"
            />
            <select
              className="soSelect"
              value={cfg.l1_diameter ?? '5/8'}
              onChange={(e) => onUpdateBaston(spanIdx, side, zone, { l1_diameter: e.target.value })}
            >
              {DIAMETERS.map((d) => <option key={d} value={d}>{d}"</option>)}
            </select>
          </>
        )}
      </div>

      {/* Line 2 (inner) */}
      <div className="soRow">
        <label className="soCheck" style={{ minWidth: 48 }}>
          <input
            type="checkbox"
            checked={l2Enabled}
            onChange={(e) => onUpdateBaston(spanIdx, side, zone, { l2_enabled: e.target.checked })}
          />
          <span>L2</span>
        </label>
        {l2Enabled && (
          <>
            <input
              className="soInput soInput--sm"
              type="number" min={1} max={5} step={1}
              value={cfg.l2_qty ?? 1}
              onChange={(e) => onUpdateBaston(spanIdx, side, zone, { l2_qty: Math.max(1, Number(e.target.value) || 1) })}
              title="Cantidad"
            />
            <select
              className="soSelect"
              value={cfg.l2_diameter ?? '5/8'}
              onChange={(e) => onUpdateBaston(spanIdx, side, zone, { l2_diameter: e.target.value })}
            >
              {DIAMETERS.map((d) => <option key={d} value={d}>{d}"</option>)}
            </select>
          </>
        )}
      </div>

      {/* Lengths (only Z2 has L1_m/L2_m, Z1/Z3 have L3_m) */}
      {l1Enabled || l2Enabled ? (
        <div className="soRow" style={{ marginTop: 2 }}>
          {zone === 'z2' ? (
            <>
              <span className="soLabel">L1</span>
              <input
                className="soInput soInput--sm"
                type="number" min={0} step={0.05}
                value={cfg.L1_m ?? ''}
                placeholder="auto"
                onChange={(e) => {
                  const v = parseFloat(e.target.value);
                  onUpdateBaston(spanIdx, side, zone, { L1_m: Number.isFinite(v) ? Math.max(0, v) : undefined });
                }}
                title="Longitud izq (m)"
              />
              <span className="soLabel">L2</span>
              <input
                className="soInput soInput--sm"
                type="number" min={0} step={0.05}
                value={cfg.L2_m ?? ''}
                placeholder="auto"
                onChange={(e) => {
                  const v = parseFloat(e.target.value);
                  onUpdateBaston(spanIdx, side, zone, { L2_m: Number.isFinite(v) ? Math.max(0, v) : undefined });
                }}
                title="Longitud der (m)"
              />
            </>
          ) : (
            <>
              <span className="soLabel">L3</span>
              <input
                className="soInput soInput--sm"
                type="number" min={0} step={0.05}
                value={cfg.L3_m ?? ''}
                placeholder="auto"
                onChange={(e) => {
                  const v = parseFloat(e.target.value);
                  onUpdateBaston(spanIdx, side, zone, { L3_m: Number.isFinite(v) ? Math.max(0, v) : undefined });
                }}
                title="Longitud desde extremo (m)"
              />
            </>
          )}
        </div>
      ) : null}
    </PopoverShell>
  );
};

// ============================================================================
// Node Bastones Connection Popover (l1/l2 kind per end)
// ============================================================================
interface NodeBastonesProps {
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

export const NodeBastonesPopover: React.FC<NodeBastonesProps> = ({
  nodeIdx, node, side, end, anchorX, anchorY, containerRect, onClose, onUpdateNode,
}) => {
  const sideLabel = side === 'top' ? 'Superior' : 'Inferior';
  const endLabel = end === 1 ? `Izq (Z3 T${nodeIdx})` : `Der (Z1 T${nodeIdx + 1})`;

  const getLineKind = useCallback((_side: 'top' | 'bottom', _end: 1 | 2, line: 1 | 2): SteelKind => {
    const key = `baston_${_side}_${_end}_l${line}_kind` as keyof NodeIn;
    const v = node[key] as SteelKind | undefined;
    return v === 'hook' || v === 'development' || v === 'continuous' ? v : 'hook';
  }, [node]);

  const setLineKind = useCallback((_side: 'top' | 'bottom', _end: 1 | 2, line: 1 | 2, kind: SteelKind) => {
    const key = `baston_${_side}_${_end}_l${line}_kind` as keyof NodeIn;
    onUpdateNode(nodeIdx, { [key]: kind } as any);
  }, [nodeIdx, onUpdateNode]);

  const getLineToFace = useCallback((_side: 'top' | 'bottom', _end: 1 | 2, line: 1 | 2): boolean => {
    const key = `baston_${_side}_${_end}_l${line}_to_face` as keyof NodeIn;
    return Boolean(node[key]);
  }, [node]);

  const setLineToFace = useCallback((_side: 'top' | 'bottom', _end: 1 | 2, line: 1 | 2, val: boolean) => {
    const key = `baston_${_side}_${_end}_l${line}_to_face` as keyof NodeIn;
    onUpdateNode(nodeIdx, { [key]: val } as any);
  }, [nodeIdx, onUpdateNode]);

  return (
    <PopoverShell
      title={`Bastones N${nodeIdx + 1} — ${sideLabel}`}
      anchorX={anchorX} anchorY={anchorY}
      containerRect={containerRect} onClose={onClose}
    >
      <div style={{ fontSize: 11, color: 'rgba(229,231,235,0.55)', marginBottom: 4 }}>{endLabel}</div>
      {([1, 2] as const).map((line) => (
        <div key={`l${line}`} className="soRow" style={{ flexWrap: 'wrap' }}>
          <span className="soLabel" style={{ minWidth: 22 }}>L{line}</span>
          <div className="soSegmented">
            {(['continuous', 'hook', 'development'] as SteelKind[]).map((k) => (
              <button
                key={k}
                className={`soSegBtn ${getLineKind(side, end, line) === k ? 'soSegBtnActive' : ''}`}
                onClick={() => setLineKind(side, end, line, k)}
                type="button"
              >
                {KIND_LABELS[k]}
              </button>
            ))}
          </div>
          {getLineKind(side, end, line) !== 'continuous' && (
            <label className="soCheck" style={{ marginLeft: 4 }}>
              <input
                type="checkbox"
                checked={getLineToFace(side, end, line)}
                onChange={(e) => setLineToFace(side, end, line, e.target.checked)}
              />
              <span>a cara</span>
            </label>
          )}
        </div>
      ))}
    </PopoverShell>
  );
};
