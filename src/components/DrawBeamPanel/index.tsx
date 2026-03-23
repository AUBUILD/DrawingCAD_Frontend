import React, { useEffect, useRef } from 'react';
import { C } from '../shared/tokens';
import { Icon, type IconName } from '../shared/Icon';
import { useBeams } from './useBeams';
import { NuevaPanel } from './NuevaPanel';
import { VigasPanel } from './VigasPanel';
import { EditarPanel } from './EditarPanel';
import { ExportarPanel } from './ExportarPanel';
import { ConfigTab } from '../../tabs/ConfigTab';
import type { DevelopmentIn, ExportMode, ForceImportResponse, ForceImportTarget } from '../../types';
import type { PanelView, Viga, GrupoViga } from './types';
import type { NivelType } from '../shared/tokens';
import type { EditorTabProps } from './editorTabProps';

const FONT = "'Inter', 'SF Pro Display', 'Segoe UI', system-ui, sans-serif";

/** Map beam type to development level_type */
const LEVEL_TYPE_MAP: Record<NivelType, string> = { Piso: 'piso', 'Sótano': 'sotano', Azotea: 'azotea' };

/** Sync development metadata (name, floor range, level type) from beam + group. */
function syncDevMeta(dev: DevelopmentIn, beam: Viga, group: GrupoViga): DevelopmentIn {
  const name = beam.id;
  const floor_start = group.nivelInicial;
  const floor_end = group.nivelFinal;
  const level_type = LEVEL_TYPE_MAP[beam.type] ?? 'piso';
  if (dev.name === name && (dev as any).floor_start === floor_start
      && (dev as any).floor_end === floor_end && (dev as any).level_type === level_type) {
    return dev;
  }
  return { ...dev, name, floor_start, floor_end, level_type } as DevelopmentIn;
}

const S = {
  nav: {
    display: 'flex',
    gap: 0,
    padding: '0 4px',
    borderBottom: `1px solid ${C.border}`,
    fontFamily: FONT,
  },
  navBtn: (active: boolean) => ({
    display: 'flex',
    alignItems: 'center' as const,
    gap: 5,
    padding: '8px 8px',
    border: 'none',
    borderBottom: active ? `2px solid ${C.teal}` : '2px solid transparent',
    background: active ? C.tealBg : 'transparent',
    color: active ? C.teal : C.sub,
    cursor: 'pointer' as const,
    fontSize: 10.5,
    fontFamily: FONT,
    fontWeight: active ? 700 : 500,
    letterSpacing: '0.3px',
    textTransform: 'uppercase' as const,
    transition: 'all 0.15s ease',
    whiteSpace: 'nowrap' as const,
    flex: '1 1 0' as const,
    justifyContent: 'center' as const,
    minWidth: 0,
  }),
  divider: {
    width: 1,
    alignSelf: 'stretch' as const,
    margin: '6px 0',
    background: C.border,
    flexShrink: 0,
  },
  body: {
    flex: 1,
    overflow: 'auto' as const,
    padding: '10px 10px',
    fontFamily: FONT,
  },
} as const;

const NAV_ITEMS: Array<{ key: PanelView; label: string; icon: IconName }> = [
  { key: 'vigas',    label: 'Vigas',    icon: 'beams' },
  { key: 'nueva',    label: 'Nueva',  icon: 'plus' },
  { key: 'config',   label: 'Config',   icon: 'settings' },
  { key: 'exportar', label: 'Exportar', icon: 'export' },
];

export interface DrawBeamPanelProps {
  editorTabProps: EditorTabProps;
  onExportDxf: () => void;
  onExportMetrado: () => void;
  busy?: boolean;
  /** Current active development from App (to save back into the selected group). */
  activeDevelopment?: DevelopmentIn;
  /** Called when a group is selected — App should load this development. */
  onGroupDevelopmentLoad?: (dev: DevelopmentIn | undefined) => void;
  /** Called when the editor L2 tab changes (so App can activate steel view, etc.) */
  onEditorTabChange?: (tab: string) => void;
  /** Export scope control (connected to App-level exportMode). */
  exportMode: ExportMode;
  setExportMode: (mode: ExportMode) => void;
  exportOrder: 'name' | 'location';
  setExportOrder: (order: 'name' | 'location') => void;
  /** Optional externally controlled L1 view (used by collapsed sidebar strip). */
  externalView?: PanelView;
  onExternalViewChange?: (view: PanelView) => void;
  /** localStorage namespace key for beams/groups to isolate by user+project */
  storageKey?: string;
  /** DXF import actions. */
  onImportDxfFile: (file: File, config?: { h?: number; b?: number }) => void;
  onImportDxfBatchFile: (file: File, config?: { h?: number; b?: number }) => Promise<DevelopmentIn[]>;
  onImportForcesBatchFile?: (file: File, targets: ForceImportTarget[]) => Promise<ForceImportResponse>;
  onImportForcesGroupFile?: (file: File, target: ForceImportTarget) => Promise<ForceImportResponse>;
  batchImportOrder: 'name' | 'location';
  setBatchImportOrder: React.Dispatch<React.SetStateAction<'name' | 'location'>>;
  /** Called whenever beams change — provides all group developments for export-all. */
  onAllGroupDevsChange?: (devs: DevelopmentIn[]) => void;
}

export const DrawBeamPanel: React.FC<DrawBeamPanelProps> = ({
  editorTabProps, onExportDxf, onExportMetrado, busy,
  activeDevelopment, onGroupDevelopmentLoad, onEditorTabChange,
  exportMode, setExportMode, exportOrder, setExportOrder,
  externalView, onExternalViewChange,
  storageKey,
  onImportDxfFile, onImportDxfBatchFile, onImportForcesBatchFile, onImportForcesGroupFile, batchImportOrder, setBatchImportOrder,
  onAllGroupDevsChange,
}) => {
  const ctx = useBeams(storageKey);

  // Sync external → internal view, but only when externalView actually changes
  // (not when ctx.view changes internally via addBeam/selectBeam).
  const prevExternalRef = useRef(externalView);
  useEffect(() => {
    if (!externalView) return;
    if (externalView === prevExternalRef.current) {
      prevExternalRef.current = externalView;
      return;
    }
    prevExternalRef.current = externalView;
    if (ctx.view !== externalView) {
      ctx.setView(externalView);
    }
  }, [externalView, ctx.view, ctx.setView]);

  // When the selected beam or group changes, emit its stored development to App
  const prevSelRef = useRef<string>('');
  useEffect(() => {
    const selKey = `${ctx.selectedBeamId ?? ''}::${ctx.selectedGroupId ?? ''}`;
    if (selKey === prevSelRef.current) return;
    prevSelRef.current = selKey;
    if (onGroupDevelopmentLoad) {
      let devToLoad = ctx.selectedGroup?.development;
      if (devToLoad && ctx.selectedBeam && ctx.selectedGroup) {
        devToLoad = syncDevMeta(devToLoad, ctx.selectedBeam, ctx.selectedGroup);
      } else if (!devToLoad && ctx.selectedBeam && ctx.selectedGroup && activeDevelopment) {
        // Group has no development yet — carry current geometry but sync metadata
        devToLoad = syncDevMeta(activeDevelopment, ctx.selectedBeam, ctx.selectedGroup);
      }
      onGroupDevelopmentLoad(devToLoad);
    }
  }, [ctx.selectedBeamId, ctx.selectedGroupId, ctx.selectedGroup, ctx.selectedBeam, activeDevelopment, onGroupDevelopmentLoad]);

  // When L1 view changes away from 'editar', reset editor tab notification
  // and propagate internal view changes (e.g. selectBeam → editar) to parent
  const prevViewRef = useRef<PanelView>(ctx.view);
  useEffect(() => {
    if (prevViewRef.current === 'editar' && ctx.view !== 'editar') {
      onEditorTabChange?.('');
    }
    if (ctx.view !== prevViewRef.current) {
      onExternalViewChange?.(ctx.view);
    }
    prevViewRef.current = ctx.view;
  }, [ctx.view, onEditorTabChange, onExternalViewChange]);

  // When the active development changes in App, save it back to the selected group
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!activeDevelopment || !ctx.selectedGroupId || !ctx.selectedBeam) return;
    // Debounce to avoid saving on every keystroke
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      // Sync metadata (name, floor range, level type) from beam + group
      const group = ctx.selectedBeam!.groups.find(g => g.id === ctx.selectedGroupId);
      const devToSave = group
        ? syncDevMeta(activeDevelopment, ctx.selectedBeam!, group)
        : activeDevelopment;
      ctx.saveGroupDevelopment(devToSave);
    }, 500);
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
  }, [activeDevelopment, ctx.selectedGroupId, ctx.selectedBeam, ctx.saveGroupDevelopment]);

  // Emit all group developments to parent whenever beams change
  useEffect(() => {
    if (!onAllGroupDevsChange) return;
    const devs: DevelopmentIn[] = [];
    for (const beam of ctx.beams) {
      for (const group of beam.groups) {
        if (!group.development) continue;
        devs.push(syncDevMeta(group.development, beam, group));
      }
    }
    onAllGroupDevsChange(devs);
  }, [ctx.beams, onAllGroupDevsChange]);

  return (
    <>
      <nav style={S.nav}>
        {NAV_ITEMS.map(({ key, label, icon }, i) => {
          const active = ctx.view === key || (key === 'vigas' && ctx.view === 'editar');
          return (
            <React.Fragment key={key}>
              {i > 0 && <div style={S.divider} />}
              <button
                type="button"
                style={S.navBtn(active)}
                onClick={() => {
                  onExternalViewChange?.(key);
                  ctx.setView(key);
                }}
              >
                <Icon name={icon} size={11} color={active ? C.teal : C.sub} />
                {label}
              </button>
            </React.Fragment>
          );
        })}
      </nav>
      <div style={S.body}>
        {ctx.view === 'vigas' && (
          <VigasPanel
            ctx={ctx}
            onImportForcesBatchFile={onImportForcesBatchFile}
            onGroupDevelopmentLoad={onGroupDevelopmentLoad}
          />
        )}
        {ctx.view === 'config' && <ConfigTab {...editorTabProps.configTabProps} />}
        {ctx.view === 'nueva' && (
          <NuevaPanel
            ctx={ctx}
            busy={!!busy}
            onImportDxfFile={onImportDxfFile}
            onImportDxfBatchFile={onImportDxfBatchFile}
            batchImportOrder={batchImportOrder}
            setBatchImportOrder={setBatchImportOrder}
          />
        )}
        {ctx.view === 'editar' && ctx.selectedBeam && (
          <EditarPanel
            ctx={ctx}
            editorTabProps={editorTabProps}
            onEditorTabChange={onEditorTabChange}
            onImportForcesGroupFile={onImportForcesGroupFile}
            onGroupDevelopmentLoad={onGroupDevelopmentLoad}
          />
        )}
        {ctx.view === 'exportar' && (
          <ExportarPanel ctx={ctx} onExportDxf={onExportDxf} onExportMetrado={onExportMetrado} busy={busy} exportMode={exportMode} setExportMode={setExportMode} exportOrder={exportOrder} setExportOrder={setExportOrder} />
        )}
      </div>
    </>
  );
};

export type { Viga, GrupoViga, PanelView } from './types';
export type { EditorTabProps } from './editorTabProps';
