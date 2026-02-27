import React from 'react';
import type { DevelopmentIn, ExportMode } from '../types';
import { type SteelOverlayLayer } from '../overlay';

export interface HeaderBarProps {
  devName: string | undefined;
  developments: DevelopmentIn[];
  activeDevIdx: number;
  onSelectDev: (idx: number) => void;
  onAddDev: () => void;
  onRemoveDev: (idx: number) => void;
  onCreateTwin: (idx: number) => void;
  onToggleTwin: () => void;
  saveStatus: 'saved' | 'saving' | 'error' | null;
  steelOverlayLayer: SteelOverlayLayer | null;
  setSteelOverlayLayer: (layer: SteelOverlayLayer | null) => void;
  onExportDxf: () => void;
  exportMode: ExportMode;
  setExportMode: (mode: ExportMode) => void;
  busy: boolean;
}

const LAYER_OPTIONS: Array<{ key: SteelOverlayLayer | null; label: string }> = [
  { key: null, label: 'Off' },
  { key: 'acero', label: 'Acero' },
  { key: 'bastones', label: 'Bastones' },
  { key: 'estribos', label: 'Estribos' },
];

export const HeaderBar: React.FC<HeaderBarProps> = ({
  devName,
  developments,
  activeDevIdx,
  onSelectDev,
  onAddDev,
  onRemoveDev,
  onCreateTwin,
  onToggleTwin,
  saveStatus,
  steelOverlayLayer,
  setSteelOverlayLayer,
  onExportDxf,
  exportMode,
  setExportMode,
  busy,
}) => {
  const name = devName ?? 'DESARROLLO 01';
  const hasManyDevs = developments.length > 1;
  const activeDev = developments[activeDevIdx];
  const hasTwin = !!activeDev?.twin_id;
  const activeBeamType = activeDev?.beam_type ?? 'convencional';

  return (
    <header className="header">
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <div className="title">AUBUILD</div>
        <div style={{ width: 1, height: 20, background: 'rgba(20,184,166,0.25)' }} />
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, opacity: 0.9 }}>{name}</div>
          <div className="subtitle">DrawingCAD Beam</div>
        </div>
      </div>

      {/* Development selector dropdown */}
      {hasManyDevs && (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <select
            value={activeDevIdx}
            onChange={(e) => onSelectDev(Number(e.target.value))}
            style={{
              padding: '4px 8px',
              fontSize: 12,
              fontWeight: 600,
              background: 'rgba(20,184,166,0.12)',
              color: '#14b8a6',
              border: '1px solid rgba(20,184,166,0.4)',
              borderRadius: 4,
              cursor: 'pointer',
              outline: 'none',
              minWidth: 120,
            }}
          >
            {developments.map((d, i) => (
              <option key={i} value={i}>
                {(d.name ?? `Desarrollo ${i + 1}`) + (d.twin_id ? (d.beam_type === 'prefabricada' ? ' [P]' : ' [C]') : '')}
              </option>
            ))}
          </select>
          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>
            {activeDevIdx + 1}/{developments.length}
          </span>
          <button
            onClick={onAddDev}
            title="Agregar desarrollo"
            type="button"
            style={{
              padding: '3px 8px',
              fontSize: 12,
              fontWeight: 600,
              background: 'rgba(255,255,255,0.05)',
              color: 'rgba(255,255,255,0.5)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 4,
              cursor: 'pointer',
            }}
          >
            +
          </button>
          <button
            onClick={() => onRemoveDev(activeDevIdx)}
            title="Eliminar desarrollo actual"
            type="button"
            disabled={developments.length <= 1}
            style={{
              padding: '3px 8px',
              fontSize: 12,
              fontWeight: 600,
              background: 'rgba(255,255,255,0.05)',
              color: developments.length <= 1 ? 'rgba(255,255,255,0.2)' : 'rgba(255,100,100,0.7)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 4,
              cursor: developments.length <= 1 ? 'not-allowed' : 'pointer',
            }}
          >
            x
          </button>
        </div>
      )}

      {/* Twin beam controls */}
      {hasTwin ? (
        <div style={{ display: 'flex', gap: 2, alignItems: 'center' }}>
          <button
            type="button"
            onClick={() => { if (activeBeamType !== 'convencional') onToggleTwin(); }}
            style={{
              padding: '4px 10px',
              fontSize: 11,
              fontWeight: 600,
              background: activeBeamType === 'convencional' ? 'rgba(20,184,166,0.25)' : 'rgba(255,255,255,0.05)',
              color: activeBeamType === 'convencional' ? '#14b8a6' : 'rgba(255,255,255,0.5)',
              border: activeBeamType === 'convencional' ? '1px solid rgba(20,184,166,0.5)' : '1px solid rgba(255,255,255,0.1)',
              borderRadius: '4px 0 0 4px',
              cursor: activeBeamType === 'convencional' ? 'default' : 'pointer',
            }}
          >
            Conv
          </button>
          <button
            type="button"
            onClick={() => { if (activeBeamType !== 'prefabricada') onToggleTwin(); }}
            style={{
              padding: '4px 10px',
              fontSize: 11,
              fontWeight: 600,
              background: activeBeamType === 'prefabricada' ? 'rgba(168,85,247,0.25)' : 'rgba(255,255,255,0.05)',
              color: activeBeamType === 'prefabricada' ? '#a855f7' : 'rgba(255,255,255,0.5)',
              border: activeBeamType === 'prefabricada' ? '1px solid rgba(168,85,247,0.5)' : '1px solid rgba(255,255,255,0.1)',
              borderRadius: '0 4px 4px 0',
              cursor: activeBeamType === 'prefabricada' ? 'default' : 'pointer',
            }}
          >
            Prefab
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => onCreateTwin(activeDevIdx)}
          title="Crear versión prefabricada (gemelo)"
          style={{
            padding: '4px 10px',
            fontSize: 11,
            fontWeight: 600,
            background: 'rgba(168,85,247,0.1)',
            color: 'rgba(168,85,247,0.7)',
            border: '1px solid rgba(168,85,247,0.3)',
            borderRadius: 4,
            cursor: 'pointer',
          }}
        >
          + Prefab
        </button>
      )}

      {saveStatus && (
        <div className={`saveIndicator saveIndicator--${saveStatus}`}>
          {saveStatus === 'saving' && <span>Guardando {name}...</span>}
          {saveStatus === 'saved' && <span>{name} guardado</span>}
          {saveStatus === 'error' && <span>Error al guardar {name}</span>}
        </div>
      )}

      <div className="actions" style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <div className="steelLayerSelector">
          {LAYER_OPTIONS.map(({ key, label }) => (
            <button
              key={label}
              className={`steelLayerBtn ${steelOverlayLayer === key ? 'steelLayerBtnActive' : ''}`}
              onClick={() => setSteelOverlayLayer(key)}
              type="button"
            >
              {label}
            </button>
          ))}
        </div>

        {/* Export mode selector (only when multiple developments) */}
        {hasManyDevs && (
          <select
            value={exportMode}
            onChange={(e) => setExportMode(e.target.value as ExportMode)}
            style={{
              padding: '4px 6px',
              fontSize: 11,
              background: 'rgba(255,255,255,0.08)',
              color: 'rgba(255,255,255,0.8)',
              border: '1px solid rgba(255,255,255,0.15)',
              borderRadius: 4,
              cursor: 'pointer',
              outline: 'none',
            }}
          >
            <option value="single">Exportar solo esta viga</option>
            <option value="all">Exportar todas (espaciadas)</option>
            {developments.some((d) => d.twin_id) && (
              <>
                <option value="all_conv">Exportar todas Conv.</option>
                <option value="all_prefab">Exportar todas Prefab.</option>
              </>
            )}
          </select>
        )}

        <button className="btn" onClick={onExportDxf} type="button" disabled={busy}>
          Exportar DXF
        </button>
      </div>
    </header>
  );
};
