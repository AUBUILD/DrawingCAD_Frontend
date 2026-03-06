import React, { useState } from 'react';
import { C, NIVEL_COLOR, ORDINALS, ordIdx } from '../shared/tokens';
import { Icon } from '../shared/Icon';
import type { Ordinal } from '../shared/tokens';
import type { useBeams } from './useBeams';
import type { EditorTabProps } from './editorTabProps';

import { ConcreteTab } from '../../tabs/ConcreteTab';
import { SteelTab } from '../../tabs/SteelTab';
import { MetradoTab } from '../../tabs/MetradoTab';
import { JsonTab } from '../../tabs/JsonTab';

type EditTab = 'grupos' | 'concreto' | 'acero' | 'metrado' | 'json';

const S = {
  header: {
    display: 'flex',
    alignItems: 'center' as const,
    gap: 6,
    marginBottom: 6,
  },
  backBtn: {
    display: 'flex',
    padding: 3,
    border: 'none',
    background: 'transparent',
    cursor: 'pointer' as const,
    transform: 'rotate(180deg)',
  },
  beamTitle: { fontSize: 13, fontWeight: 700 },
  tabs: {
    display: 'flex',
    gap: 6,
    marginBottom: 8,
    paddingBottom: 6,
    borderBottom: `1px solid ${C.border}`,
    flexWrap: 'wrap' as const,
  },
  tab: (active: boolean) => ({
    display: 'inline-flex',
    alignItems: 'center' as const,
    gap: 5,
    padding: '5px 10px',
    border: `1px solid ${active ? C.tealBd : C.border}`,
    borderBottom: `1px solid ${active ? C.tealBd : C.border}`,
    borderRadius: 7,
    background: active ? 'rgba(24,208,184,0.14)' : C.card,
    color: active ? C.text : C.sub,
    cursor: 'pointer' as const,
    fontSize: 10.5,
    fontWeight: active ? 700 : 600,
    boxShadow: active ? 'inset 0 0 0 1px rgba(24,208,184,0.18)' : 'none',
  }),
  section: { marginBottom: 12 },
  sectionTitle: { fontSize: 10, fontWeight: 600, color: C.sub, marginBottom: 6, textTransform: 'uppercase' as const, letterSpacing: 0.5 },
  groupCard: (selected: boolean) => ({
    display: 'flex',
    alignItems: 'center' as const,
    gap: 6,
    padding: '6px 8px',
    background: selected ? C.tealBg : C.card,
    border: `1px solid ${selected ? C.tealBd : C.border}`,
    borderRadius: 5,
    marginBottom: 3,
    cursor: 'pointer' as const,
  }),
  groupLabel: { flex: 1, fontSize: 11 },
  addRow: {
    display: 'flex',
    gap: 5,
    alignItems: 'flex-end' as const,
    marginTop: 6,
  },
  select: {
    padding: '4px 6px',
    background: C.card,
    border: `1px solid ${C.border}`,
    borderRadius: 4,
    color: C.text,
    fontSize: 11,
  },
  addBtn: {
    display: 'flex',
    alignItems: 'center' as const,
    gap: 3,
    padding: '4px 8px',
    background: C.teal,
    border: 'none',
    borderRadius: 4,
    color: C.text,
    cursor: 'pointer' as const,
    fontSize: 10,
    fontWeight: 600,
  },
  empty: { color: C.dim, fontSize: 11, textAlign: 'center' as const, padding: 12 },
} as const;

interface EditarPanelProps {
  ctx: ReturnType<typeof useBeams>;
  editorTabProps: EditorTabProps;
  onEditorTabChange?: (tab: string) => void;
}

const TABS: Array<{ key: EditTab; label: string; icon: 'layers' | 'beam' | 'vigas' | 'table' | 'cfg' }> = [
  { key: 'grupos',   label: 'Grupos', icon: 'layers' },
  { key: 'concreto', label: 'Concreto', icon: 'beam' },
  { key: 'acero',    label: 'Acero', icon: 'vigas' },
  { key: 'metrado',  label: 'Metrado', icon: 'table' },
  { key: 'json',     label: 'JSON', icon: 'cfg' },
];

export const EditarPanel: React.FC<EditarPanelProps> = ({ ctx, editorTabProps, onEditorTabChange }) => {
  const [tab, setTabRaw] = useState<EditTab>('grupos');
  const setTab = (t: EditTab) => { setTabRaw(t); onEditorTabChange?.(t); };
  const [iniDraft, setIniDraft] = useState<Ordinal>(ORDINALS[0]);
  const [finDraft, setFinDraft] = useState<Ordinal>(ORDINALS[1]);

  const beam = ctx.selectedBeam;
  if (!beam) return null;

  const color = NIVEL_COLOR[beam.type];

  const finOpts = ORDINALS.filter((o) => ordIdx(o) > ordIdx(iniDraft));

  const [overlapWarning, setOverlapWarning] = useState(false);

  const handleAddGroup = () => {
    if (ordIdx(finDraft) <= ordIdx(iniDraft)) return;
    const result = ctx.addGroup(beam.id, iniDraft, finDraft);
    if (result === null) {
      setOverlapWarning(true);
      setTimeout(() => setOverlapWarning(false), 3000);
    } else {
      setOverlapWarning(false);
    }
  };

  return (
    <>
      {/* Header: back + beam title */}
      <div style={S.header}>
        <button type="button" style={S.backBtn} onClick={() => ctx.setView('vigas')}>
          <Icon name="arrow" size={16} color={C.sub} />
        </button>
        <span style={{ ...S.beamTitle, color }}>{beam.id}</span>
        <span style={{ fontSize: 11, color: C.sub }}>{beam.type}</span>
      </div>

      {/* L2 tabs: Grupos + existing editor tabs */}
      <div style={S.tabs}>
        {TABS.map(({ key, label, icon }) => (
          <button key={key} type="button" style={S.tab(tab === key)} onClick={() => setTab(key)}>
            <Icon name={icon} size={11} color={tab === key ? '#a6fff2' : C.dim} />
            {label}
          </button>
        ))}
      </div>

      {/* Grupos tab — entity group management */}
      {tab === 'grupos' && (
        <div style={S.section}>
          <div style={S.sectionTitle}>Agrupaciones de pisos</div>

          {beam.groups.length === 0 && (
            <div style={S.empty}>Sin agrupaciones. Agrega un rango de pisos.</div>
          )}

          {beam.groups.map((g) => (
            <div
              key={g.id}
              style={S.groupCard(g.id === ctx.selectedGroupId)}
              onClick={() => ctx.setSelectedGroupId(g.id)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === 'Enter') ctx.setSelectedGroupId(g.id); }}
            >
              <Icon name="layers" size={14} color={color} />
              <span style={S.groupLabel}>
                {g.nivelInicial} — {g.nivelFinal}
              </span>
              <button
                type="button"
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 2 }}
                onClick={(e) => { e.stopPropagation(); ctx.deleteGroup(beam.id, g.id); }}
              >
                <Icon name="close" size={12} color={C.red} />
              </button>
            </div>
          ))}

          <div style={S.addRow}>
            <label>
              <div style={{ fontSize: 11, color: C.sub, marginBottom: 3 }}>Inicio</div>
              <select
                style={S.select}
                value={iniDraft}
                onChange={(e) => {
                  const v = e.target.value as Ordinal;
                  setIniDraft(v);
                  if (ordIdx(finDraft) <= ordIdx(v)) {
                    const nextValid = ORDINALS.find((o) => ordIdx(o) > ordIdx(v));
                    if (nextValid) setFinDraft(nextValid);
                  }
                }}
              >
                {ORDINALS.slice(0, -1).map((o) => (
                  <option key={o} value={o}>{o}</option>
                ))}
              </select>
            </label>
            <label>
              <div style={{ fontSize: 11, color: C.sub, marginBottom: 3 }}>Fin</div>
              <select style={S.select} value={finDraft} onChange={(e) => setFinDraft(e.target.value as Ordinal)}>
                {finOpts.map((o) => (
                  <option key={o} value={o}>{o}</option>
                ))}
              </select>
            </label>
            <button type="button" style={S.addBtn} onClick={handleAddGroup}>
              <Icon name="plus" size={12} color={C.text} />
              Agregar
            </button>
          </div>

          {overlapWarning && (
            <div style={{ fontSize: 10, color: C.red, marginTop: 4 }}>
              El rango se solapa con una agrupacion existente.
            </div>
          )}
        </div>
      )}

      {/* Existing editor tabs — rendered inline */}
      {tab === 'concreto'  && <ConcreteTab {...editorTabProps.concreteTabProps} />}
      {tab === 'acero'     && <SteelTab    {...editorTabProps.steelTabProps} />}
      {tab === 'metrado'   && <MetradoTab  {...editorTabProps.metradoTabProps} />}
      {tab === 'json'      && <JsonTab     {...editorTabProps.jsonTabProps} />}
    </>
  );
};
