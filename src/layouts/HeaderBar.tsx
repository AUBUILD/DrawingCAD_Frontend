import React from 'react';
import type { DevelopmentIn, ExportMode } from '../types';
import { type SteelOverlayLayer } from '../overlay';

export interface HeaderBarProps {
  devName: string | undefined;
  developments: DevelopmentIn[];
  saveStatus: 'saved' | 'saving' | 'error' | null;
  steelOverlayLayer: SteelOverlayLayer | null;
  setSteelOverlayLayer: (layer: SteelOverlayLayer | null) => void;
  onExportDxf: () => void;
  onExportMetrado: () => void;
  exportMode: ExportMode;
  setExportMode: (mode: ExportMode) => void;
  busy: boolean;
  authEmail: string;
  authPassword: string;
  isAuthenticated: boolean;
  onAuthEmailChange: (v: string) => void;
  onAuthPasswordChange: (v: string) => void;
  onLogin: () => void;
  onLogout: () => void;
  onOpenProjects: () => void;
}

export const HeaderBar: React.FC<HeaderBarProps> = ({
  devName,
  saveStatus,
  authEmail,
  authPassword,
  isAuthenticated,
  onAuthEmailChange,
  onAuthPasswordChange,
  onLogin,
  onLogout,
  onOpenProjects,
}) => {
  const name = devName ?? 'DESARROLLO 01';

  return (
    <header className="header">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, width: '100%', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div className="title">AUBUILD</div>
          <div style={{ width: 1, height: 20, background: 'rgba(0,201,167,0.25)' }} />
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, opacity: 0.9 }}>{name}</div>
            <div className="subtitle">DrawingCAD Beam</div>
          </div>
          {saveStatus && (
            <div className={`saveIndicator saveIndicator--${saveStatus}`}>
              {saveStatus === 'saving' && <span>Guardando...</span>}
              {saveStatus === 'saved' && <span>Guardado</span>}
              {saveStatus === 'error' && <span>Error</span>}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <input className="input" placeholder="email" value={authEmail} onChange={(e) => onAuthEmailChange(e.target.value)} style={{ width: 180, padding: '6px 8px' }} />
          {!isAuthenticated && (
            <input className="input" type="password" placeholder="password" value={authPassword} onChange={(e) => onAuthPasswordChange(e.target.value)} style={{ width: 130, padding: '6px 8px' }} />
          )}
          {!isAuthenticated ? (
            <button className="btn" onClick={onLogin} type="button">Login</button>
          ) : (
            <>
              <button className="btn btnSecondary" onClick={onOpenProjects} type="button">Proyectos</button>
              <button className="btn btnSecondary" onClick={onLogout} type="button">Logout</button>
            </>
          )}
        </div>
      </div>
    </header>
  );
};
