import React, { useState, useMemo, useCallback } from 'react';
import type { SpanIn, StirrupsDistributionIn, StirrupsSectionIn, StirrupsCaseType } from '../types';
import { pickDefaultABCRForH, formatStirrupsABCR, parseStirrupsABCR } from '../utils/stirrupsUtils';
import { PopoverShell } from './PopoverShell';

// ============================================================================
// Constants
// ============================================================================
const DIAMETERS = ['3/8', '1/2', '5/8', '3/4'];
const CASE_TYPES: Array<{ value: StirrupsCaseType; label: string }> = [
  { value: 'simetrica', label: 'Simétrica' },
  { value: 'asim_ambos', label: 'Asim. Ambos' },
  { value: 'asim_uno', label: 'Asim. Uno' },
];
const DESIGN_MODES = [
  { value: 'sismico', label: 'Sísmico' },
  { value: 'gravedad', label: 'Gravedad' },
];

// ============================================================================
// Estribos Popover
// ============================================================================
interface Props {
  spanIdx: number;
  span: SpanIn;
  anchorX: number;
  anchorY: number;
  containerRect: DOMRect | null;
  onClose: () => void;
  onUpdateStirrups: (spanIdx: number, patch: Partial<StirrupsDistributionIn>) => void;
  onUpdateStirrupsSection: (spanIdx: number, patch: Partial<StirrupsSectionIn>) => void;
}

export const EstribosPopover: React.FC<Props> = ({
  spanIdx, span, anchorX, anchorY, containerRect, onClose,
  onUpdateStirrups, onUpdateStirrupsSection,
}) => {
  const dist = span.stirrups ?? {};
  const sec = span.stirrups_section ?? {};
  const h = span.h ?? 0.5;

  const caseType = dist.case_type ?? 'simetrica';
  const designMode = (dist.design_mode ?? 'gravedad') as 'sismico' | 'gravedad';
  const diameter = dist.diameter ?? '3/8';
  const singleEnd = dist.single_end ?? 'left';

  // Section
  const secDia = sec.diameter ?? '3/8';
  const secQty = sec.qty ?? 1;

  // Spec strings (one per zone)
  const leftSpec = dist.left_spec ?? '';
  const centerSpec = dist.center_spec ?? '';
  const rightSpec = dist.right_spec ?? '';

  // Draft state for ABCR editing
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const draftOrValue = useCallback((key: string, actual: string) => {
    return key in drafts ? drafts[key] : actual;
  }, [drafts]);

  const commitDraft = useCallback((key: string, field: 'left_spec' | 'center_spec' | 'right_spec') => {
    const val = drafts[key];
    if (val !== undefined) {
      onUpdateStirrups(spanIdx, { [field]: val });
      setDrafts((prev) => { const next = { ...prev }; delete next[key]; return next; });
    }
  }, [drafts, spanIdx, onUpdateStirrups]);

  // Preset application
  const applyPreset = useCallback((mode: 'sismico' | 'gravedad') => {
    const abcr = pickDefaultABCRForH(h, mode);
    const specStr = formatStirrupsABCR(abcr);
    onUpdateStirrups(spanIdx, {
      design_mode: mode,
      left_spec: specStr,
      center_spec: specStr,
      right_spec: specStr,
    });
    setDrafts({});
  }, [h, spanIdx, onUpdateStirrups]);

  // Zone labels depend on case_type
  const zones = useMemo(() => {
    if (caseType === 'simetrica') {
      return [{ key: 'left', field: 'left_spec' as const, label: 'Patrón (simétrico)', value: leftSpec }];
    }
    if (caseType === 'asim_uno') {
      return [
        { key: 'left', field: 'left_spec' as const, label: `Extremo (${singleEnd === 'left' ? 'izq' : 'der'})`, value: leftSpec },
        { key: 'center', field: 'center_spec' as const, label: 'Resto', value: centerSpec },
      ];
    }
    // asim_ambos
    return [
      { key: 'left', field: 'left_spec' as const, label: 'Izquierda', value: leftSpec },
      { key: 'center', field: 'center_spec' as const, label: 'Centro', value: centerSpec },
      { key: 'right', field: 'right_spec' as const, label: 'Derecha', value: rightSpec },
    ];
  }, [caseType, leftSpec, centerSpec, rightSpec, singleEnd]);

  return (
    <PopoverShell
      title={`Estribos — T${spanIdx + 1}  (h=${h.toFixed(2)}m)`}
      anchorX={anchorX} anchorY={anchorY}
      containerRect={containerRect} onClose={onClose}
    >
      {/* Presets */}
      <div className="soSectionTitle">Preset</div>
      <div className="soRow">
        {DESIGN_MODES.map((m) => (
          <button
            key={m.value}
            className={`soSegBtn ${designMode === m.value ? 'soSegBtnActive' : ''}`}
            style={{ border: '1px solid rgba(255,255,255,0.10)', borderRadius: 6, padding: '4px 10px' }}
            onClick={() => applyPreset(m.value as 'sismico' | 'gravedad')}
            type="button"
          >
            {m.label}
          </button>
        ))}
      </div>

      <hr className="soDivider" />

      {/* Case type */}
      <div className="soSectionTitle">Tipo</div>
      <div className="soSegmented" style={{ marginBottom: 6 }}>
        {CASE_TYPES.map((ct) => (
          <button
            key={ct.value}
            className={`soSegBtn ${caseType === ct.value ? 'soSegBtnActive' : ''}`}
            onClick={() => onUpdateStirrups(spanIdx, { case_type: ct.value })}
            type="button"
          >
            {ct.label}
          </button>
        ))}
      </div>

      {caseType === 'asim_uno' && (
        <div className="soRow">
          <span className="soLabel">Extremo</span>
          <div className="soSegmented">
            <button
              className={`soSegBtn ${singleEnd === 'left' ? 'soSegBtnActive' : ''}`}
              onClick={() => onUpdateStirrups(spanIdx, { single_end: 'left' })}
              type="button"
            >Izq</button>
            <button
              className={`soSegBtn ${singleEnd === 'right' ? 'soSegBtnActive' : ''}`}
              onClick={() => onUpdateStirrups(spanIdx, { single_end: 'right' })}
              type="button"
            >Der</button>
          </div>
        </div>
      )}

      <hr className="soDivider" />

      {/* ABCR specs per zone */}
      <div className="soSectionTitle">Distribución ABCR</div>
      {zones.map(({ key, field, label, value }) => (
        <div key={key} style={{ marginBottom: 4 }}>
          <div style={{ fontSize: 10, color: 'rgba(229,231,235,0.5)', marginBottom: 1 }}>{label}</div>
          <input
            className="soInput"
            value={draftOrValue(key, value)}
            onChange={(e) => setDrafts((prev) => ({ ...prev, [key]: e.target.value }))}
            onBlur={() => commitDraft(key, field)}
            onKeyDown={(e) => { if (e.key === 'Enter') commitDraft(key, field); }}
            placeholder="A=0.05 b,B=8,0.100 c,C=0,0 R=0.200"
          />
        </div>
      ))}

      <hr className="soDivider" />

      {/* Section (diameter + qty) */}
      <div className="soSectionTitle">Sección del estribo</div>
      <div className="soRow">
        <span className="soLabel">⌀</span>
        <select
          className="soSelect"
          value={secDia}
          onChange={(e) => onUpdateStirrupsSection(spanIdx, { diameter: e.target.value })}
        >
          {DIAMETERS.map((d) => <option key={d} value={d}>{d}"</option>)}
        </select>
        <span className="soLabel">Lazos</span>
        <input
          className="soInput soInput--sm"
          type="number" min={1} max={5} step={1}
          value={secQty}
          onChange={(e) => onUpdateStirrupsSection(spanIdx, { qty: Math.max(1, Number(e.target.value) || 1) })}
        />
      </div>

      {/* Stirrup distribution diameter */}
      <div className="soRow">
        <span className="soLabel">⌀ dist</span>
        <select
          className="soSelect"
          value={diameter}
          onChange={(e) => onUpdateStirrups(spanIdx, { diameter: e.target.value })}
        >
          {DIAMETERS.map((d) => <option key={d} value={d}>{d}"</option>)}
        </select>
      </div>
    </PopoverShell>
  );
};
