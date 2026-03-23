import React from 'react';
import { DrawBeamPanel } from '../components/DrawBeamPanel';
import type { EditorTabProps } from '../components/DrawBeamPanel';
import type { ConfigTabProps } from '../tabs/ConfigTab';
import type { ProjectTabProps } from '../tabs/ProjectTab';
import type { ConcreteTabProps } from '../tabs/ConcreteTab';
import type { SteelTabProps } from '../tabs/SteelTab';
import type { MetradoTabProps } from '../tabs/MetradoTab';
import type { JsonTabProps } from '../tabs/JsonTab';
import type { DefaultPreferenceId } from '../utils';
import type { DevelopmentIn, ExportMode, ForceImportResponse, ForceImportTarget } from '../types';

type Tab = 'config' | 'proyecto' | 'concreto' | 'acero' | 'metrado' | 'json';

export interface LeftPanelProps {
  tab: Tab;
  setTab: (tab: Tab) => void;
  editorOpen: boolean;
  setEditorOpen: (open: boolean) => void;
  defaultPref: DefaultPreferenceId;
  onChangeDefaultPref: (pref: DefaultPreferenceId) => void;
  configTabProps: ConfigTabProps;
  projectTabProps: ProjectTabProps;
  concreteTabProps: ConcreteTabProps;
  steelTabProps: SteelTabProps;
  metradoTabProps: MetradoTabProps;
  jsonTabProps: JsonTabProps;
  onExportDxf: () => void;
  onExportMetrado: () => void;
  busy: boolean;
  activeDevelopment?: DevelopmentIn;
  onGroupDevelopmentLoad?: (dev: DevelopmentIn | undefined) => void;
  onEditorTabChange?: (tab: string) => void;
  exportMode: ExportMode;
  setExportMode: (mode: ExportMode) => void;
  exportOrder: 'name' | 'location';
  setExportOrder: (order: 'name' | 'location') => void;
  onImportDxfFile: (file: File, config?: { h?: number; b?: number }) => void;
  onImportDxfBatchFile: (file: File, config?: { h?: number; b?: number }) => Promise<import('../types').DevelopmentIn[]>;
  onImportForcesBatchFile?: (file: File, targets: ForceImportTarget[]) => Promise<ForceImportResponse>;
  onImportForcesGroupFile?: (file: File, target: ForceImportTarget) => Promise<ForceImportResponse>;
  batchImportOrder: 'name' | 'location';
  setBatchImportOrder: React.Dispatch<React.SetStateAction<'name' | 'location'>>;
}

export const LeftPanel: React.FC<LeftPanelProps> = ({
  defaultPref,
  onChangeDefaultPref,
  configTabProps,
  projectTabProps,
  concreteTabProps,
  steelTabProps,
  metradoTabProps,
  jsonTabProps,
  onExportDxf,
  onExportMetrado,
  busy,
  activeDevelopment,
  onGroupDevelopmentLoad,
  onEditorTabChange,
  exportMode,
  setExportMode,
  exportOrder,
  setExportOrder,
  onImportDxfFile,
  onImportDxfBatchFile,
  onImportForcesBatchFile,
  onImportForcesGroupFile,
  batchImportOrder,
  setBatchImportOrder,
}) => {
  const editorTabProps: EditorTabProps = {
    defaultPref,
    onChangeDefaultPref,
    configTabProps,
    projectTabProps,
    concreteTabProps,
    steelTabProps,
    metradoTabProps,
    jsonTabProps,
  };

  return (
    <div className="leftPane">
      <section className="panel" style={{ padding: 8, flex: 1, overflow: 'auto' }}>
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
          exportOrder={exportOrder}
          setExportOrder={setExportOrder}
          onImportDxfFile={onImportDxfFile}
          onImportDxfBatchFile={onImportDxfBatchFile}
          onImportForcesBatchFile={onImportForcesBatchFile}
          onImportForcesGroupFile={onImportForcesGroupFile}
          batchImportOrder={batchImportOrder}
          setBatchImportOrder={setBatchImportOrder}
        />
      </section>
    </div>
  );
};

