import React, { useMemo, useState } from 'react';
import { C, NIVEL_COLOR, ORDINALS, ordIdx } from '../shared/tokens';
import { Icon } from '../shared/Icon';
import type { Ordinal } from '../shared/tokens';
import type { useBeams } from './useBeams';
import type { EditorTabProps } from './editorTabProps';
import type { DevelopmentIn, ForceImportResponse, ForceImportTarget } from '../../types';

import { MetradoTab } from '../../tabs/MetradoTab';
import { JsonTab } from '../../tabs/JsonTab';
import { ParametrizationTab } from '../../tabs/ParametrizationTab';
import { DesignTab } from '../../tabs/DesignTab';

type EditTab = 'grupos' | 'parametrizacion' | 'diseno' | 'metrado' | 'json';

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
  onImportForcesGroupFile?: (file: File, target: ForceImportTarget) => Promise<ForceImportResponse>;
  onGroupDevelopmentLoad?: (dev: DevelopmentIn | undefined) => void;
}

const TABS: Array<{ key: EditTab; label: string; icon: 'layers' | 'beam' | 'vigas' | 'table' | 'cfg' | 'section' | 'edit' }> = [
  { key: 'grupos',           label: 'Grupos',           icon: 'layers' },
  { key: 'parametrizacion',  label: 'Parametrizacion',  icon: 'beam' },
  { key: 'diseno',           label: 'Diseno',           icon: 'section' },
  { key: 'metrado',          label: 'Metrado',          icon: 'table' },
  { key: 'json',             label: 'JSON',             icon: 'cfg' },
];

const LEVEL_TYPE_MAP: Record<string, string> = { Piso: 'piso', 'Sótano': 'sotano', Azotea: 'azotea' };

function syncDevMeta(dev: DevelopmentIn, beam: any, group: any): DevelopmentIn {
  return {
    ...dev,
    name: beam.id ?? dev.name,
    floor_start: group.nivelInicial ?? dev.floor_start,
    floor_end: group.nivelFinal ?? dev.floor_end,
    level_type: (LEVEL_TYPE_MAP[beam.type] ?? dev.level_type ?? 'piso') as DevelopmentIn['level_type'],
  };
}

export const EditarPanel: React.FC<EditarPanelProps> = ({ ctx, editorTabProps, onEditorTabChange, onImportForcesGroupFile, onGroupDevelopmentLoad }) => {
  const [tab, setTabRaw] = useState<EditTab>('grupos');
  const setTab = (t: EditTab) => { setTabRaw(t); onEditorTabChange?.(t); };
  const [iniDraft, setIniDraft] = useState<Ordinal>(ORDINALS[0]);
  const [finDraft, setFinDraft] = useState<Ordinal>(ORDINALS[1]);

  const beam = ctx.selectedBeam;
  if (!beam) return null;

  const color = NIVEL_COLOR[beam.type];

  const finOpts = ORDINALS.filter((o) => ordIdx(o) >= ordIdx(iniDraft));

  const [overlapWarning, setOverlapWarning] = useState(false);

  const handleImportForcesGroup = async (file: File) => {
    if (!onImportForcesGroupFile) {
      throw new Error('La importacion de fuerzas por grupo no esta disponible en este flujo.');
    }
    const group = ctx.selectedGroup;
    const designProps = editorTabProps.designTabProps;
    if (!group || !designProps) {
      throw new Error('No hay un grupo activo para importar fuerzas.');
    }
    const sourceDev = syncDevMeta(designProps.dev, beam, group);
    const target: ForceImportTarget = {
      beam_id: beam.id,
      group_id: group.id,
      beam_type: beam.type,
      floor_start: group.nivelInicial,
      floor_end: group.nivelFinal,
      excluded_levels: group.excludedLevels ?? [],
      development: sourceDev,
    };
    const response = await onImportForcesGroupFile(file, target);
    const updated = response.results.find((result) => result.matched && result.group_id === group.id && result.development);
    if (updated?.development) {
      ctx.applyGroupDevelopments([{ beamId: beam.id, groupId: group.id, development: updated.development }]);
      onGroupDevelopmentLoad?.(updated.development);
    }
    return response;
  };

  const handleAddGroup = () => {
    if (ordIdx(finDraft) < ordIdx(iniDraft)) return;
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

          {beam.groups.map((g) => {
            const isSelected = g.id === ctx.selectedGroupId;
            const excl = g.excludedLevels ?? [];
            const exclLabel = excl.length > 0 ? ` (exc: ${excl.join(', ')})` : '';
            return (
              <div key={g.id}>
                <div
                  style={S.groupCard(isSelected)}
                  onClick={() => ctx.setSelectedGroupId(g.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === 'Enter') ctx.setSelectedGroupId(g.id); }}
                >
                  <Icon name="layers" size={14} color={color} />
                  <span style={S.groupLabel}>
                    {g.nivelInicial} — {g.nivelFinal}
                    {exclLabel && <span style={{ fontSize: 9, color: C.dim }}>{exclLabel}</span>}
                  </span>
                  <button
                    type="button"
                    style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 2 }}
                    onClick={(e) => {
                      e.stopPropagation();
                      const ok = window.confirm(`Se eliminara el grupo "${g.nivelInicial} — ${g.nivelFinal}".\n\nDeseas continuar?`);
                      if (!ok) return;
                      ctx.deleteGroup(beam.id, g.id);
                    }}
                  >
                    <Icon name="close" size={12} color={C.red} />
                  </button>
                </div>
                {/* Inline excluded floors editor when group is selected */}
                {isSelected && (
                  <ExcludedFloorsEditor
                    group={g}
                    color={color}
                    onUpdate={(newExcl) => ctx.updateGroup(beam.id, g.id, { excludedLevels: newExcl.length > 0 ? newExcl : undefined })}
                  />
                )}
              </div>
            );
          })}

          <div style={S.addRow}>
            <label>
              <div style={{ fontSize: 11, color: C.sub, marginBottom: 3 }}>Inicio</div>
              <select
                style={S.select}
                value={iniDraft}
                onChange={(e) => {
                  const v = e.target.value as Ordinal;
                  setIniDraft(v);
                  if (ordIdx(finDraft) < ordIdx(v)) {
                    setFinDraft(v);
                  }
                }}
              >
                {ORDINALS.map((o) => (
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
      {tab === 'parametrizacion' && (
        <ParametrizationTab
          concreteTabProps={editorTabProps.concreteTabProps}
          steelTabProps={editorTabProps.steelTabProps}
          onInnerTabChange={(innerTab) => onEditorTabChange?.(innerTab)}
        />
      )}
      {tab === 'diseno' && editorTabProps.designTabProps && (
        <DesignTab {...editorTabProps.designTabProps} onImportForcesGroup={handleImportForcesGroup} />
      )}
      {tab === 'metrado'   && <MetradoTab  {...editorTabProps.metradoTabProps} />}
      {tab === 'json'      && <JsonTab     {...editorTabProps.jsonTabProps} />}
    </>
  );
};

/** Inline editor to toggle excluded floors within a group range. */
const ExcludedFloorsEditor: React.FC<{
  group: import('./types').GrupoViga;
  color: string;
  onUpdate: (excl: Ordinal[]) => void;
}> = ({ group, color, onUpdate }) => {
  const floors = useMemo(() => {
    const result: Ordinal[] = [];
    const ini = ordIdx(group.nivelInicial);
    const fin = ordIdx(group.nivelFinal);
    // Only show interior floors (first and last are always included)
    for (let i = ini + 1; i < fin; i++) {
      result.push(ORDINALS[i]);
    }
    return result;
  }, [group.nivelInicial, group.nivelFinal]);

  if (floors.length === 0) return null;

  const exclSet = new Set(group.excludedLevels ?? []);

  return (
    <div style={{
      padding: '4px 8px 6px',
      marginBottom: 3,
      background: 'rgba(0,0,0,0.15)',
      borderRadius: '0 0 5px 5px',
      borderTop: 'none',
    }}>
      <div style={{ fontSize: 9, color: C.dim, marginBottom: 3, textTransform: 'uppercase', letterSpacing: 0.5 }}>
        Excluir pisos
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
        {floors.map((f) => {
          const excluded = exclSet.has(f);
          return (
            <button
              key={f}
              type="button"
              onClick={() => {
                const next = excluded
                  ? [...exclSet].filter((x) => x !== f)
                  : [...exclSet, f];
                onUpdate(next as Ordinal[]);
              }}
              style={{
                padding: '2px 6px',
                fontSize: 10,
                fontWeight: 600,
                border: `1px solid ${excluded ? C.red + '88' : color + '44'}`,
                borderRadius: 4,
                background: excluded ? C.red + '22' : 'transparent',
                color: excluded ? C.red : C.sub,
                cursor: 'pointer',
                textDecoration: excluded ? 'line-through' : 'none',
              }}
            >
              {f}
            </button>
          );
        })}
      </div>
    </div>
  );
};
