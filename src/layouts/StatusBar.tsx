import React from 'react';

interface StatusBarProps {
  busy: boolean;
  warning: string | null;
  error: string | null;
  saveStatus: 'saved' | 'saving' | 'error' | null;
  backendVersion?: string | null;
  frontendVersion?: string | null;
}

export const StatusBar: React.FC<StatusBarProps> = ({
  busy,
  warning,
  error,
  saveStatus,
  backendVersion,
  frontendVersion,
}) => {
  return (
    <footer className="statusBar">
      {/* Left group */}
      <div className="statusItem">
        <span className="statusDot statusDot--ok" />
        Backend conectado
      </div>

      {busy && (
        <div className="statusItem statusItem--info">
          <span className="statusSpinner" />
          Procesando...
        </div>
      )}

      {saveStatus === 'saving' && (
        <div className="statusItem statusItem--info">Guardando...</div>
      )}
      {saveStatus === 'saved' && (
        <div className="statusItem statusItem--ok">Guardado</div>
      )}
      {saveStatus === 'error' && (
        <div className="statusItem statusItem--error">Error al guardar</div>
      )}

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* Right group — warnings/errors */}
      {warning && <div className="statusItem statusItem--warn">{warning}</div>}
      {error && <div className="statusItem statusItem--error">{error}</div>}

      <div className="statusItem" style={{ opacity: 0.4 }}>
        DrawingCAD FE {frontendVersion ?? 'dev'} | BE {backendVersion ?? 'unknown'} - @Aubuild 2026
      </div>
    </footer>
  );
};
