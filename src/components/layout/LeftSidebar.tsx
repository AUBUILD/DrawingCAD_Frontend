import React, { useMemo, useState } from 'react';
import { DrawBeamPanel, type EditorTabProps } from '../DrawBeamPanel';
import { Icon, type IconName } from '../shared/Icon';
import { T } from '../../styles/tokens';
import type { DevelopmentIn, ExportMode } from '../../types';
import type { PanelView } from '../DrawBeamPanel/types';

interface LeftSidebarProps {
  sideOpen: boolean;
  setSideOpen: (open: boolean) => void;
  sidebarWidth: number;
  beamsStorageKey: string;
  editorTabProps: EditorTabProps;
  onExportDxf: () => void;
  onExportMetrado: () => void;
  busy: boolean;
  activeDevelopment?: DevelopmentIn;
  onGroupDevelopmentLoad?: (dev: DevelopmentIn | undefined) => void;
  onEditorTabChange?: (tab: string) => void;
  exportMode: ExportMode;
  setExportMode: (mode: ExportMode) => void;
  onImportDxfFile: (file: File, config?: { h?: number; b?: number }) => void;
  onImportDxfBatchFile: (file: File, config?: { h?: number; b?: number }) => Promise<import('../../types').DevelopmentIn[]>;
  batchImportOrder: 'name' | 'location';
  setBatchImportOrder: React.Dispatch<React.SetStateAction<'name' | 'location'>>;
}

const L1_TABS: Array<{ id: PanelView; icon: IconName; label: string }> = [
  { id: 'vigas', icon: 'vigas', label: 'Vigas' },
  { id: 'nueva', icon: 'plus', label: '+ Nueva' },
  { id: 'config', icon: 'cfg', label: 'Config' },
  { id: 'exportar', icon: 'export', label: 'Exportar' },
];

export const LeftSidebar: React.FC<LeftSidebarProps> = ({
  sideOpen,
  setSideOpen,
  sidebarWidth,
  beamsStorageKey,
  editorTabProps,
  onExportDxf,
  onExportMetrado,
  busy,
  activeDevelopment,
  onGroupDevelopmentLoad,
  onEditorTabChange,
  exportMode,
  setExportMode,
  onImportDxfFile,
  onImportDxfBatchFile,
  batchImportOrder,
  setBatchImportOrder,
}) => {
  const [activePrimary, setActivePrimary] = useState<PanelView>('vigas');

  const miniTabs = useMemo(() => L1_TABS, []);

  return (
    <>
      <aside
        className="sidebar"
        style={{
          width: sideOpen ? sidebarWidth : 0,
          flexShrink: 0,
          overflow: 'hidden',
          background: T.bg2,
          borderRight: 'none',
          display: 'flex',
          flexDirection: 'column',
          opacity: sideOpen ? 1 : 0,
          transform: sideOpen ? 'translateX(0)' : 'translateX(-20px)',
        }}
      >
        <div className="sidebar-content" style={{ width: sidebarWidth, height: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <section className="panel" style={{ padding: 8, flex: 1, overflow: 'auto', width: 'auto' }}>
            <DrawBeamPanel
              editorTabProps={editorTabProps}
              onExportDxf={onExportDxf}
              onExportMetrado={onExportMetrado}
              busy={busy}
              activeDevelopment={activeDevelopment}
              onGroupDevelopmentLoad={onGroupDevelopmentLoad}
              onEditorTabChange={onEditorTabChange}
              exportMode={exportMode}
              setExportMode={setExportMode}
              externalView={activePrimary}
              onExternalViewChange={setActivePrimary}
              storageKey={beamsStorageKey}
              onImportDxfFile={onImportDxfFile}
              onImportDxfBatchFile={onImportDxfBatchFile}
              batchImportOrder={batchImportOrder}
              setBatchImportOrder={setBatchImportOrder}
            />
          </section>
        </div>
      </aside>

      {!sideOpen ? (
        <div className="aubEdgeStrip">
          <button className="aubToggleBtn" type="button" onClick={() => setSideOpen(true)} title="Mostrar panel">
            <svg width={12} height={12} viewBox="0 0 16 16" fill="none" stroke={T.sub} strokeWidth={1.8} strokeLinecap="round">
              <path d="M2 4h12M2 8h12M2 12h12" />
            </svg>
          </button>
          {miniTabs.map((tab) => (
            <button
              key={tab.id}
              className="aubEdgeIcon"
              type="button"
              title={tab.label}
              onClick={() => {
                setActivePrimary(tab.id);
                setSideOpen(true);
              }}
            >
              <Icon name={tab.icon} size={12} color={activePrimary === tab.id ? T.teal : T.dim} />
            </button>
          ))}
        </div>
      ) : null}
    </>
  );
};
