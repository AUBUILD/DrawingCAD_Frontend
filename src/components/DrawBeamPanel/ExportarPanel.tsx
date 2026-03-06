import React, { useMemo, useState } from 'react';
import { C } from '../shared/tokens';
import { Icon } from '../shared/Icon';
import { SectionTitle } from '../shared/primitives';
import type { ExportMode } from '../../types';
import type { useBeams } from './useBeams';

interface ExportarPanelProps {
  ctx: ReturnType<typeof useBeams>;
  onExportDxf: () => void;
  onExportMetrado: () => void;
  busy?: boolean;
  exportMode: ExportMode;
  setExportMode: (mode: ExportMode) => void;
}

export const ExportarPanel: React.FC<ExportarPanelProps> = ({ ctx, onExportDxf, onExportMetrado, busy, exportMode, setExportMode }) => {
  const [status, setStatus] = useState<string | null>(null);

  const selectedLabel = useMemo(() => ctx.selectedBeam?.id ?? 'Ninguna', [ctx.selectedBeam]);

  const runExport = (kind: 'DXF' | 'Metrado', action: () => void) => {
    if (busy) return;
    action();
    setStatus(`${kind} generado (${exportMode === 'single' ? selectedLabel : 'todas las vigas'}).`);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <SectionTitle title="Exportar" />

      <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, color: C.sub }}>
        <input type="radio" checked={exportMode === 'single'} onChange={() => setExportMode('single')} />
        Viga seleccionada ({selectedLabel})
      </label>
      <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, color: C.sub }}>
        <input type="radio" checked={exportMode === 'all'} onChange={() => setExportMode('all')} />
        Todas las vigas ({ctx.beams.length})
      </label>

      <button
        type="button"
        onClick={() => runExport('DXF', onExportDxf)}
        disabled={!!busy}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          borderRadius: 7,
          border: `1px solid ${C.blue}55`,
          background: `${C.blue}12`,
          padding: '9px 10px',
          textAlign: 'left',
          cursor: busy ? 'not-allowed' : 'pointer',
          boxShadow: 'none',
        }}
      >
        <Icon name="dxf" size={16} color={C.blue} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.text }}>Exportar DXF</div>
          <div style={{ fontSize: 10, color: C.sub }}>Plano de vigas</div>
        </div>
        <span style={{ fontSize: 9, fontWeight: 700, color: C.blue }}>DXF</span>
      </button>

      <button
        type="button"
        onClick={() => runExport('Metrado', onExportMetrado)}
        disabled={!!busy}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          borderRadius: 7,
          border: `1px solid ${C.orange}55`,
          background: `${C.orange}12`,
          padding: '9px 10px',
          textAlign: 'left',
          cursor: busy ? 'not-allowed' : 'pointer',
          boxShadow: 'none',
        }}
      >
        <Icon name="xlsx" size={16} color={C.orange} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.text }}>Exportar Metrado</div>
          <div style={{ fontSize: 10, color: C.sub }}>Auditoria en Excel</div>
        </div>
        <span style={{ fontSize: 9, fontWeight: 700, color: C.orange }}>XLSX</span>
      </button>

      {status ? <div style={{ fontSize: 10, color: C.sub }}>{status}</div> : null}
    </div>
  );
};

