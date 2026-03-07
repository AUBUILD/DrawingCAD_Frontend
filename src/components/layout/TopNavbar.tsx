import React from 'react';
import { Icon } from '../shared/Icon';
import { T } from '../../styles/tokens';

interface TopNavbarProps {
  sideOpen: boolean;
  setSideOpen: (open: boolean) => void;
  beamCode?: string;
  userEmail: string;
  onOpenProjects: () => void;
  onLogout: () => void;
}

export const TopNavbar: React.FC<TopNavbarProps> = ({
  sideOpen,
  setSideOpen,
  beamCode,
  userEmail,
  onOpenProjects,
  onLogout,
}) => {
  return (
    <header className="aubTopbar">
      <div className="aubTopBrand">
        <div className="aubTopDot" />
        <span className="aubTopLogo">AUBUILD</span>
      </div>

      <button
        className="aubToggleBtn"
        type="button"
        onClick={() => setSideOpen(!sideOpen)}
        title={sideOpen ? 'Ocultar panel' : 'Mostrar panel'}
      >
        <svg width={14} height={14} viewBox="0 0 16 16" fill="none" stroke={T.sub} strokeWidth={1.8} strokeLinecap="round">
          {sideOpen ? (
            <>
              <path d="M2 4h12M2 8h8M2 12h12" />
              <path d="M11 6l3 2-3 2" strokeWidth={1.4} />
            </>
          ) : (
            <path d="M2 4h12M2 8h12M2 12h12" />
          )}
        </svg>
      </button>

      <div className="aubBeamCtx">
        <div className="aubBeamSub">DrawingCAD Beam</div>
      </div>

      <div style={{ flex: 1 }} />

      <div className="aubTopRight">
        <div className="aubUserChip">
          <Icon name="user" size={11} color={T.sub} />
          <span>{userEmail}</span>
        </div>
        <button className="aubGhostBtn" type="button" onClick={onOpenProjects}>
          <Icon name="proj" size={11} color={T.sub} />
          Proyectos
        </button>
        <button className="aubLogoutBtn" type="button" onClick={onLogout}>
          <Icon name="logout" size={11} color={T.red} />
          Logout
        </button>
      </div>
    </header>
  );
};
