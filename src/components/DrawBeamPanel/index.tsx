import React, { useEffect, useRef } from 'react';
import { C } from '../shared/tokens';
import { Icon, type IconName } from '../shared/Icon';
import { useBeams } from './useBeams';
import { NuevaPanel } from './NuevaPanel';
import { VigasPanel } from './VigasPanel';
import { EditarPanel } from './EditarPanel';
import { ExportarPanel } from './ExportarPanel';
import { ConfigTab } from '../../tabs/ConfigTab';
import type { DevelopmentIn, ExportMode } from '../../types';
import type { PanelView } from './types';
import type { EditorTabProps } from './editorTabProps';

const FONT = "'Inter', 'SF Pro Display', 'Segoe UI', system-ui, sans-serif";

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
  { key: 'nueva',    label: '+ Nueva',  icon: 'plus' },
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
  /** Optional externally controlled L1 view (used by collapsed sidebar strip). */
  externalView?: PanelView;
  onExternalViewChange?: (view: PanelView) => void;
  /** localStorage namespace key for beams/groups to isolate by user+project */
  storageKey?: string;
  /** DXF import actions. */
  onImportDxfFile: (file: File, config?: { h?: number; b?: number }) => void;
  onImportDxfBatchFile: (file: File, config?: { h?: number; b?: number }) => Promise<DevelopmentIn[]>;
  batchImportOrder: 'name' | 'location';
  setBatchImportOrder: React.Dispatch<React.SetStateAction<'name' | 'location'>>;
}

export const DrawBeamPanel: React.FC<DrawBeamPanelProps> = ({
  editorTabProps, onExportDxf, onExportMetrado, busy,
  activeDevelopment, onGroupDevelopmentLoad, onEditorTabChange,
  exportMode, setExportMode,
  externalView, onExternalViewChange,
  storageKey,
  onImportDxfFile, onImportDxfBatchFile, batchImportOrder, setBatchImportOrder,
}) => {
  const ctx = useBeams(storageKey);

  useEffect(() => {
    if (!externalView) return;
    if (ctx.view === externalView) return;
    // Avoid forcing away from 'editar' when sidebar stays on "Vigas".
    // This prevents a ping-pong loop between internal and external view states.
    if (ctx.view === 'editar' && externalView === 'vigas') return;
    ctx.setView(externalView);
  }, [externalView, ctx.view, ctx.setView]);

  // When the selected group changes, emit its stored development to App
  const prevGroupIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (ctx.selectedGroupId === prevGroupIdRef.current) return;
    prevGroupIdRef.current = ctx.selectedGroupId;
    if (onGroupDevelopmentLoad) {
      onGroupDevelopmentLoad(ctx.selectedGroup?.development);
    }
  }, [ctx.selectedGroupId, ctx.selectedGroup, onGroupDevelopmentLoad]);

  // When L1 view changes away from 'editar', reset editor tab notification
  const prevViewRef = useRef<PanelView>(ctx.view);
  useEffect(() => {
    if (prevViewRef.current === 'editar' && ctx.view !== 'editar') {
      onEditorTabChange?.('');
    }
    prevViewRef.current = ctx.view;
  }, [ctx.view, onEditorTabChange]);

  // When the active development changes in App, save it back to the selected group
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!activeDevelopment || !ctx.selectedGroupId) return;
    // Debounce to avoid saving on every keystroke
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      ctx.saveGroupDevelopment(activeDevelopment);
    }, 500);
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
  }, [activeDevelopment, ctx.selectedGroupId, ctx.saveGroupDevelopment]);

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
        {ctx.view === 'vigas' && <VigasPanel ctx={ctx} />}
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
          <EditarPanel ctx={ctx} editorTabProps={editorTabProps} onEditorTabChange={onEditorTabChange} />
        )}
        {ctx.view === 'exportar' && (
          <ExportarPanel ctx={ctx} onExportDxf={onExportDxf} onExportMetrado={onExportMetrado} busy={busy} exportMode={exportMode} setExportMode={setExportMode} />
        )}
      </div>
    </>
  );
};

export type { Viga, GrupoViga, PanelView } from './types';
export type { EditorTabProps } from './editorTabProps';
