import React from 'react';
import type { DevelopmentIn, PreviewResponse } from '../../types';

type PreviewView = '2d' | '3d';
type ThreeProjection = 'perspective' | 'orthographic';

interface SavedCut {
  xU: number;
}

interface SectionInfo {
  spanIndex: number;
  x_m: number;
}

interface SectionXRangeU {
  xmin: number;
  xmax: number;
}

/**
 * Props para PreviewPanel
 */
export interface PreviewPanelProps {
  // Preview state
  preview: PreviewResponse | null;
  previewView: PreviewView;
  setPreviewView: (view: PreviewView) => void;
  threeProjection: ThreeProjection;
  setThreeProjection: (projection: ThreeProjection) => void;

  // Development data
  dev: DevelopmentIn;

  // Canvas refs
  overviewCanvasRef: React.RefObject<HTMLCanvasElement>;
  canvasRef: React.RefObject<HTMLCanvasElement>;
  sectionCanvasRef: React.RefObject<HTMLCanvasElement>;
  threeHostRef: React.RefObject<HTMLDivElement>;

  // Canvas event handlers
  onOverviewCanvasClick: (e: React.MouseEvent<HTMLCanvasElement>) => void;
  onCanvasWheel: (e: React.WheelEvent<HTMLCanvasElement>) => void;
  onCanvasPointerDown: (e: React.PointerEvent<HTMLCanvasElement>) => void;
  onCanvasPointerMove: (e: React.PointerEvent<HTMLCanvasElement>) => void;
  onCanvasPointerUp: (e: React.PointerEvent<HTMLCanvasElement>) => void;
  onCanvasClick: (e: React.MouseEvent<HTMLCanvasElement>) => void;

  // Navigation
  moveZoomSelection: (dir: 1 | -1) => void;
  setDetailViewport: (viewport: any) => void;

  // Display options
  showLongitudinal: boolean;
  setShowLongitudinal: (show: boolean) => void;
  showStirrups: boolean;
  setShowStirrups: (show: boolean) => void;
  steelViewActive: boolean;
  steelYScale2: boolean;
  setSteelYScale2: (scale: boolean) => void;

  // Section cuts
  savedCuts: SavedCut[];
  setSavedCuts: React.Dispatch<React.SetStateAction<SavedCut[]>>;
  sectionXU: number;
  setSectionXU: (x: number) => void;
  sectionXRangeU: SectionXRangeU;
  sectionInfo: SectionInfo;
  defaultCutAXU: number;

  // Helper functions
  mToUnits: (dev: DevelopmentIn, m: number) => number;
  spanIndexAtX: (dev: DevelopmentIn, xU: number) => number;
  indexToLetters: (index: number) => string;
}

/**
 * Componente PreviewPanel - Panel de visualización 2D/3D
 *
 * Incluye:
 * - Vista general (overview)
 * - Vista con zoom (2D/3D)
 * - Sección transversal con cortes guardados
 * - Controles de navegación y visualización
 */
export const PreviewPanel: React.FC<PreviewPanelProps> = ({
  preview,
  previewView,
  setPreviewView,
  threeProjection,
  setThreeProjection,
  dev,
  overviewCanvasRef,
  canvasRef,
  sectionCanvasRef,
  threeHostRef,
  onOverviewCanvasClick,
  onCanvasWheel,
  onCanvasPointerDown,
  onCanvasPointerMove,
  onCanvasPointerUp,
  onCanvasClick,
  moveZoomSelection,
  setDetailViewport,
  showLongitudinal,
  setShowLongitudinal,
  showStirrups,
  setShowStirrups,
  steelViewActive,
  steelYScale2,
  setSteelYScale2,
  savedCuts,
  setSavedCuts,
  sectionXU,
  setSectionXU,
  sectionXRangeU,
  sectionInfo,
  defaultCutAXU,
  mToUnits,
  spanIndexAtX,
  indexToLetters,
}) => {
  
  return (
    <div className="rightPane">
      <section className="panelOverview">
        <div className="rowBetween" style={{ marginBottom: 8 }}>
          <div className="panelTitle" style={{ marginBottom: 0 }}>VISTA GENERAL</div>
        </div>

        <canvas
          ref={overviewCanvasRef}
          width={900}
          height={150}
          className="canvas overviewCanvas"
          style={{ touchAction: 'none' }}
          onContextMenu={(e) => e.preventDefault()}
          onClick={onOverviewCanvasClick}
          title="General 2D: click = seleccionar y hacer zoom en la vista con zoom"
        />
      </section>

      <section className="panelDetail">
        <div className="rowBetween" style={{ marginBottom: 8 }}>
          <div className="panelTitle" style={{ marginBottom: 0 }}>DETALLE DE VISTA</div>

          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <div className="segmented" aria-label="Vista con zoom 2D/3D">
              <button
                className={previewView === '2d' ? 'segBtn segBtnActive' : 'segBtn'}
                onClick={() => setPreviewView('2d')}
                type="button"
              >
                2D
              </button>
              <button
                className={previewView === '3d' ? 'segBtn segBtnActive' : 'segBtn'}
                onClick={() => setPreviewView('3d')}
                type="button"
              >
                3D
              </button>
            </div>

            {previewView === '3d' ? (
              <div className="segmented" aria-label="Proyección 3D">
                <button
                  className={threeProjection === 'perspective' ? 'segBtn segBtnActive' : 'segBtn'}
                  onClick={() => setThreeProjection('perspective')}
                  type="button"
                  title="Cámara en perspectiva"
                >
                  Perspectiva
                </button>
                <button
                  className={threeProjection === 'orthographic' ? 'segBtn segBtnActive' : 'segBtn'}
                  onClick={() => setThreeProjection('orthographic')}
                  type="button"
                  title="Cámara ortográfica"
                >
                  Ortográfica
                </button>
              </div>
            ) : null}

            <button className="btnIcon" type="button" onClick={() => moveZoomSelection(-1)} disabled={!preview} title="Anterior">
              {'<'}
            </button>
            <button className="btnIcon" type="button" onClick={() => moveZoomSelection(1)} disabled={!preview} title="Siguiente">
              {'>'}
            </button>

            <label className="check" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <input type="checkbox" checked={showLongitudinal} onChange={(e) => setShowLongitudinal(e.target.checked)} />
              <span className="mutedSmall">Longitudinal</span>
            </label>
            <label className="check" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <input type="checkbox" checked={showStirrups} onChange={(e) => setShowStirrups(e.target.checked)} />
              <span className="mutedSmall">Estribos</span>
            </label>
            {previewView === '2d' && steelViewActive ? (
              <label className="check" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <input
                  type="checkbox"
                  checked={steelYScale2}
                  onChange={(e) => setSteelYScale2(e.target.checked)}
                />
                <span className="mutedSmall">Escala Y x2</span>
              </label>
            ) : null}
          </div>
        </div>

        <div className="zoomBody" style={{ display: 'flex', gap: 12, alignItems: 'stretch' }}>
          <div className="zoomStage" style={{ flex: steelViewActive && previewView === '2d' ? '3 1 0%' : '1 1 0%', minWidth: 0 }}>
            {previewView === '2d' ? (
              <canvas
                ref={canvasRef}
                width={900}
                height={300}
                className="canvas detailCanvas"
                style={{ touchAction: 'none' }}
                onWheel={onCanvasWheel}
                onPointerDown={onCanvasPointerDown}
                onPointerMove={onCanvasPointerMove}
                onPointerUp={onCanvasPointerUp}
                onPointerCancel={onCanvasPointerUp}
                onDoubleClick={() => setDetailViewport(null)}
                onContextMenu={(e) => e.preventDefault()}
                onClick={onCanvasClick}
                title="2D (zoom): rueda = zoom, arrastrar = pan, doble click = reset"
              />
            ) : null}
            {previewView === '3d' ? <div ref={threeHostRef} className="canvas3d detailCanvas3d" /> : null}
          </div>

          {previewView === '2d' && steelViewActive ? (
            <div style={{ flex: '1 1 0%', minWidth: 240, maxWidth: 360, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div className="rowBetween" style={{ gap: 8 }}>
                <div className="mutedSmall">Sección (corte en desarrollo)</div>
                <button
                  className="btnSmall"
                  type="button"
                  onClick={() =>
                    setSavedCuts((p) => {
                      const xmin = sectionXRangeU.xmin;
                      const xmax = sectionXRangeU.xmax;
                      const x = Math.min(xmax, Math.max(xmin, sectionXU));
                      const xA = defaultCutAXU;

                      const next = (p.length ? [...p] : [{ xU: xA }]).concat([{ xU: x }]);

                      // De-dup (mantener A y no permitir duplicados en B/C/..)
                      const eps = 1e-6;
                      const out: Array<{ xU: number }> = [];
                      for (let i = 0; i < next.length; i++) {
                        const xi = next[i].xU;
                        if (i === 0) {
                          out.push({ xU: xi });
                          continue;
                        }
                        if (Math.abs(out[0].xU - xi) < eps) continue;
                        if (out.slice(1).some((c) => Math.abs(c.xU - xi) < eps)) continue;
                        out.push({ xU: xi });
                      }

                      return out;
                    })
                  }
                  title="Guardar este corte"
                >
                  Guardar
                </button>
              </div>

              <input
                className="input"
                type="range"
                min={sectionXRangeU.xmin}
                max={sectionXRangeU.xmax}
                step={mToUnits(dev, 0.05)}
                value={sectionXU}
                onChange={(e) => setSectionXU(Number(e.target.value))}
                title="Desliza para cambiar el corte a lo largo del desarrollo"
              />

              <div className="rowBetween" style={{ gap: 8 }}>
                <div className="mutedSmall">Tramo {sectionInfo.spanIndex + 1} | x={sectionInfo.x_m.toFixed(2)} m</div>
                <div className="mutedSmall">{(sectionXRangeU.xmax / (dev.unit_scale ?? 2)).toFixed(2)} m</div>
              </div>

              <canvas
                ref={sectionCanvasRef}
                width={240}
                height={240}
                className="canvas"
                style={{ height: 240 }}
                title="Corte (solo acero): amarillo = principal, verde = bastones activos"
              />

              {savedCuts.length ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {savedCuts.map((c, i) => {
                    const label = indexToLetters(i);
                    const si = Math.max(0, Math.min(spanIndexAtX(dev, c.xU), (dev.spans ?? []).length - 1));
                    const xm = c.xU / (dev.unit_scale ?? 2);
                    return (
                      <div key={`cut-${i}`} className="rowBetween" style={{ gap: 8 }}>
                        <button
                          type="button"
                          className="btnSmall cutBtn"
                          onClick={() => setSectionXU(c.xU)}
                          title="Ir al corte"
                          style={{ flex: 1, textAlign: 'left' as any }}
                        >
                          Corte {label} — Tramo {si + 1} | x={xm.toFixed(2)} m
                        </button>
                        <button
                          type="button"
                          className="btnSmall"
                          onClick={() => setSavedCuts((p) => (i === 0 ? p : p.filter((_, j) => j !== i)))}
                          disabled={i === 0}
                          title={i === 0 ? 'Corte A es automático' : 'Eliminar corte'}
                        >
                          Eliminar
                        </button>
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="meta">
          <div>
            <span className="mono">Spans:</span> {(dev.spans ?? []).length}
          </div>
          <div>
            <span className="mono">Nodes:</span> {(dev.nodes ?? []).length}
          </div>
        </div>
        {!preview ? <div className="mutedSmall">Sin preview (revisa backend).</div> : null}
      </section>
    </div>
  );
};
