import React from 'react';
import type { DevelopmentIn, SpanIn, NodeIn } from '../../types';
import type { Selection } from '../../hooks/useSelection';
import { EditableCell } from './EditableCell';

/**
 * Props para ConcreteTab
 */
export interface ConcreteTabProps {
  // Data
  dev: DevelopmentIn;
  selection: Selection;
  spansCols: number;
  nodesCols: number;

  // State
  busy: boolean;
  concretoLocked: boolean;
  showNT: boolean;

  // State setters
  setConcretoLocked: (locked: boolean) => void;
  setShowNT: (show: boolean) => void;

  // Actions
  clearDevelopment: () => void;
  onSave: () => void;
  addSpan: () => void;
  removeSpan: (index: number) => void;
  updateSpan: (index: number, patch: Partial<SpanIn>) => void;
  updateNode: (index: number, patch: Partial<NodeIn>) => void;
  applySelection: (sel: Selection, nextViewport: boolean) => void;
  onGridKeyDown: (
    e: React.KeyboardEvent<HTMLInputElement>,
    grid: 'spans' | 'nodes',
    row: number,
    col: number,
    maxRows: number,
    maxCols: number
  ) => void;

  // Helper functions
  clampNumber: (val: string | number, fallback: number) => number;
  fmt2: (n: number) => string;
}

/**
 * Componente ConcreteTab - Geometría de la viga (tramos y nodos)
 *
 * Incluye:
 * - Importar/Limpiar DXF
 * - Configuración de nombre y tipo de nivel
 * - Edición de tramos (L, h, b)
 * - Edición de nodos (b1, b2, a2, project_b, project_a)
 */
const ConcreteTabInner: React.FC<ConcreteTabProps> = ({
  dev,
  selection,
  spansCols,
  nodesCols,
  busy,
  concretoLocked,
  showNT,
  setConcretoLocked,
  setShowNT,
  clearDevelopment,
  onSave,
  addSpan,
  removeSpan,
  updateSpan,
  updateNode,
  applySelection,
  onGridKeyDown,
  clampNumber,
  fmt2,
}) => {
  return (
    <div className="form">
      <div className="actionRow">
        <div className="mutedSmall">Acciones</div>
        <div className="actionButtons">
          <button className="btnSmall btnSubtleAction" type="button" onClick={clearDevelopment} disabled={busy} title="Reiniciar el desarrollo">
            Limpiar
          </button>
          <button className="btnSmall btnSubtleAction" type="button" onClick={addSpan} disabled={concretoLocked}>
            Añadir tramo
          </button>
          <button className="btnSmall btnPrimaryAction" type="button" onClick={onSave} disabled={busy} title="Guardar viga actual">
            Guardar
          </button>
          <label className="toggle toggleTight" title={concretoLocked ? 'Edición bloqueada' : 'Edición habilitada'}>
            <input type="checkbox" checked={concretoLocked} onChange={(e) => setConcretoLocked(e.target.checked)} />
            <span>{concretoLocked ? '🔒' : '🔓'}</span>
          </label>
          <label className="toggle toggleTight" title="Mostrar marcadores N/T">
            <input type="checkbox" checked={showNT} onChange={(e) => setShowNT(e.target.checked)} />
            <span>N/T</span>
          </label>
        </div>
      </div>


      <div>
        <div className="sectionHeader">
          <div>Tramos</div>
        </div>

        <div className="tableContainer">
          <div className="tableScroll">
            <div className="matrix" style={{ gridTemplateColumns: `100px repeat(${(dev.spans ?? []).length}, 80px)` }}>
              <div className="cell head rowLabel"></div>
              {(dev.spans ?? []).map((_, i) => (
                <div className={selection.kind === 'span' && selection.index === i ? 'cell head cellSelected' : 'cell head'} key={`span-head-${i}`}>
                  <div className="colHead">
                    <div className="mono">{`T${i + 1}`}</div>
                    <button className="btnX" type="button" title="Quitar tramo" onClick={() => removeSpan(i)} disabled={concretoLocked}>
                      X
                    </button>
                  </div>
                </div>
              ))}

              <div className="cell rowLabel">L (m)</div>
              {(dev.spans ?? []).map((s, i) => (
                <div className={selection.kind === 'span' && selection.index === i ? 'cell cellSelected' : 'cell'} key={`span-L-${i}`}>
                  <EditableCell
                    className="cellInput"
                    value={s.L ?? 0}
                    readOnly={concretoLocked}
                    fmt={fmt2}
                    parse={clampNumber}
                    onChange={(v) => updateSpan(i, { L: v })}
                    onKeyDown={(e) => onGridKeyDown(e, 'spans', 0, i, 3, spansCols)}
                    onFocus={() => applySelection({ kind: 'span', index: i }, true)}
                    data-grid="spans"
                    data-row={0}
                    data-col={i}
                  />
                </div>
              ))}

              <div className="cell rowLabel">h (m)</div>
              {(dev.spans ?? []).map((s, i) => (
                <div className={selection.kind === 'span' && selection.index === i ? 'cell cellSelected' : 'cell'} key={`span-h-${i}`}>
                  <EditableCell
                    className="cellInput"
                    value={s.h ?? 0}
                    readOnly={concretoLocked}
                    fmt={fmt2}
                    parse={clampNumber}
                    onChange={(v) => updateSpan(i, { h: v })}
                    onKeyDown={(e) => onGridKeyDown(e, 'spans', 1, i, 3, spansCols)}
                    onFocus={() => applySelection({ kind: 'span', index: i }, true)}
                    data-grid="spans"
                    data-row={1}
                    data-col={i}
                  />
                </div>
              ))}

              <div className="cell rowLabel">b (m)</div>
              {(dev.spans ?? []).map((s, i) => (
                <div className={selection.kind === 'span' && selection.index === i ? 'cell cellSelected' : 'cell'} key={`span-b-${i}`}>
                  <EditableCell
                    className="cellInput"
                    value={s.b ?? 0}
                    readOnly={concretoLocked}
                    fmt={fmt2}
                    parse={clampNumber}
                    onChange={(v) => updateSpan(i, { b: v })}
                    onKeyDown={(e) => onGridKeyDown(e, 'spans', 2, i, 3, spansCols)}
                    onFocus={() => applySelection({ kind: 'span', index: i }, true)}
                    data-grid="spans"
                    data-row={2}
                    data-col={i}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div>
        <div className="sectionHeader">
          <div>Nodos</div>
          <div className="mutedSmall">Nodos = Tramos + 1</div>
        </div>

        <div className="tableContainer">
          <div className="tableScroll">
            <div className="matrix" style={{ gridTemplateColumns: `80px repeat(${(dev.nodes ?? []).length}, 80px)` }}>
              <div className="cell head rowLabel"></div>
              {(dev.nodes ?? []).map((_, i) => (
                <div className={selection.kind === 'node' && selection.index === i ? 'cell head cellSelected' : 'cell head'} key={`node-head-${i}`}>
                  <div className="mono">{`N${i + 1}`}</div>
                </div>
              ))}

              <div className="cell rowLabel">b1 sup</div>
              {(dev.nodes ?? []).map((n, i) => (
                <div className={selection.kind === 'node' && selection.index === i ? 'cell cellSelected' : 'cell'} key={`node-b1-${i}`}>
                  <EditableCell
                    className="cellInput"
                    value={n.b1 ?? 0}
                    readOnly={concretoLocked}
                    fmt={fmt2}
                    parse={clampNumber}
                    onChange={(v) => updateNode(i, { b1: v })}
                    onKeyDown={(e) => onGridKeyDown(e, 'nodes', 0, i, 6, nodesCols)}
                    onFocus={() => applySelection({ kind: 'node', index: i }, true)}
                    data-grid="nodes"
                    data-row={0}
                    data-col={i}
                  />
                </div>
              ))}

              <div className="cell rowLabel">b2 sup</div>
              {(dev.nodes ?? []).map((n, i) => (
                <div className={selection.kind === 'node' && selection.index === i ? 'cell cellSelected' : 'cell'} key={`node-b2-${i}`}>
                  <EditableCell
                    className="cellInput"
                    value={n.b2 ?? 0}
                    readOnly={concretoLocked}
                    fmt={fmt2}
                    parse={clampNumber}
                    onChange={(v) => updateNode(i, { b2: v })}
                    onKeyDown={(e) => onGridKeyDown(e, 'nodes', 1, i, 6, nodesCols)}
                    onFocus={() => applySelection({ kind: 'node', index: i }, true)}
                    data-grid="nodes"
                    data-row={1}
                    data-col={i}
                  />
                </div>
              ))}

              <div className="cell rowLabel">proj sup</div>
              {(dev.nodes ?? []).map((n, i) => (
                <div className={selection.kind === 'node' && selection.index === i ? 'cell cellSelected' : 'cell'} key={`node-pb-${i}`}>
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={n.project_b ?? true}
                      disabled={concretoLocked}
                      onChange={(e) => updateNode(i, { project_b: e.target.checked })}
                      onKeyDown={(e) => onGridKeyDown(e as any, 'nodes', 2, i, 6, nodesCols)}
                      onFocus={() => applySelection({ kind: 'node', index: i }, true)}
                      data-grid="nodes"
                      data-row={2}
                      data-col={i}
                    />
                  </label>
                </div>
              ))}

              <div className="cell rowLabel">a2 inf</div>
              {(dev.nodes ?? []).map((n, i) => (
                <div className={selection.kind === 'node' && selection.index === i ? 'cell cellSelected' : 'cell'} key={`node-a2-${i}`}>
                  <EditableCell
                    className="cellInput"
                    value={n.a2 ?? 0}
                    readOnly={concretoLocked}
                    fmt={fmt2}
                    parse={clampNumber}
                    onChange={(v) => updateNode(i, { a2: v })}
                    onKeyDown={(e) => onGridKeyDown(e, 'nodes', 3, i, 6, nodesCols)}
                    onFocus={() => applySelection({ kind: 'node', index: i }, true)}
                    data-grid="nodes"
                    data-row={3}
                    data-col={i}
                  />
                </div>
              ))}

              <div className="cell rowLabel">proj inf</div>
              {(dev.nodes ?? []).map((n, i) => (
                <div className={selection.kind === 'node' && selection.index === i ? 'cell cellSelected' : 'cell'} key={`node-pa-${i}`}>
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={n.project_a ?? true}
                      disabled={concretoLocked}
                      onChange={(e) => updateNode(i, { project_a: e.target.checked })}
                      onKeyDown={(e) => onGridKeyDown(e as any, 'nodes', 4, i, 6, nodesCols)}
                      onFocus={() => applySelection({ kind: 'node', index: i }, true)}
                      data-grid="nodes"
                      data-row={4}
                      data-col={i}
                    />
                  </label>
                </div>
              ))}

              <div className="cell rowLabel">apoyo</div>
              {(dev.nodes ?? []).map((n, i) => (
                <div className={selection.kind === 'node' && selection.index === i ? 'cell cellSelected' : 'cell'} key={`node-st-${i}`}>
                  <select
                    className="cellInput"
                    value={n.support_type ?? 'columna_inferior'}
                    disabled={concretoLocked}
                    onChange={(e) => {
                      const st = e.target.value as any;
                      const noProjection = st === 'apoyo_intermedio' || st === 'ninguno';
                      updateNode(i, {
                        support_type: st,
                        ...(noProjection ? { project_a: false, project_b: false } : {}),
                      });
                    }}
                    onFocus={() => applySelection({ kind: 'node', index: i }, true)}
                    data-grid="nodes"
                    data-row={5}
                    data-col={i}
                    style={{ fontSize: '0.7em', padding: '1px 2px', width: '100%' }}
                  >
                    <option value="columna_inferior">Col. inf</option>
                    <option value="columna_superior">Col. sup</option>
                    <option value="placa">Placa</option>
                    <option value="apoyo_intermedio">Apoyo int.</option>
                    <option value="ninguno">Ninguno</option>
                  </select>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="hint"></div>
    </div>
  );
};

export const ConcreteTab = React.memo(ConcreteTabInner);

