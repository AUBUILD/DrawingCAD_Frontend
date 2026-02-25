import React from 'react';
import { type SteelOverlayLayer } from '../overlay';

interface HeaderBarProps {
  devName: string | undefined;
  saveStatus: 'saved' | 'saving' | 'error' | null;
  steelOverlayLayer: SteelOverlayLayer | null;
  setSteelOverlayLayer: (layer: SteelOverlayLayer | null) => void;
  onExportDxf: () => void;
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
  saveStatus,
  steelOverlayLayer,
  setSteelOverlayLayer,
  onExportDxf,
  busy,
}) => {
  const name = devName ?? 'DESARROLLO 01';

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
        <button className="btn" onClick={onExportDxf} type="button" disabled={busy}>
          Exportar DXF
        </button>
      </div>
    </header>
  );
};
