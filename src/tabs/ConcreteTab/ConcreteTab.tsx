import React, { useRef } from 'react';
import type { DevelopmentIn, SpanIn, NodeIn } from '../../types';
import type { Selection } from '../../hooks/useSelection';
import { EditableCell } from './EditableCell';

type LevelType = 'piso' | 'sotano' | 'azotea';

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
  onImportDxfFile: (file: File) => void;
  onImportDxfBatchFile: (file: File) => void;
  onSave: () => void;
  addSpan: () => void;
  removeSpan: (index: number) => void;
  updateDevPatch: (patch: Partial<DevelopmentIn>) => void;
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
  formatOrdinalEs: (n: number) => string;
  clampInt: (val: string | number, fallback: number) => number;
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
  onImportDxfFile,
  onImportDxfBatchFile,
  onSave,
  addSpan,
  removeSpan,
  updateDevPatch,
  updateSpan,
  updateNode,
  applySelection,
  onGridKeyDown,
  formatOrdinalEs,
  clampInt,
  clampNumber,
  fmt2,
}) => {
  const dxfInputRef = useRef<HTMLInputElement | null>(null);
  const batchDxfInputRef = useRef<HTMLInputElement | null>(null);

  return (
    <div className="form">
      <div className="actionRow">
        <div className="mutedSmall">Acciones</div>
        <div className="actionButtons">
          <button
            className="btnSmall"
            type="button"
            onClick={() => dxfInputRef.current?.click()}
            disabled={busy}
            title="Importar DXF (una viga)"
          >
            Importa DXF
          </button>
          <button
            className="btnSmall"
            type="button"
            onClick={() => batchDxfInputRef.current?.click()}
            disabled={busy}
            title="Importar DXF con multiples vigas"
          >
            Batch DXF
          </button>
          <button className="btnSmall" type="button" onClick={clearDevelopment} disabled={busy} title="Reiniciar el desarrollo">
            Limpiar
          </button>
          <button className="btnSmall" type="button" onClick={addSpan} disabled={concretoLocked}>
            Añadir Tramo
          </button>
          <button className="btnSmall" type="button" onClick={onSave} disabled={busy} title="Guardar viga actual">
            💾 Guardar
          </button>
          <label className="toggle toggleTight" title={concretoLocked ? 'Edición bloqueada' : 'Edición habilitada'}>
            <input type="checkbox" checked={concretoLocked} onChange={(e) => setConcretoLocked(e.target.checked)} />
            <span>{concretoLocked ? '🔒' : '🔓'}</span>
          </label>
          <label className="toggle toggleTight" title="Mostrar marcadores N/T">
            <input type="checkbox" checked={showNT} onChange={(e) => setShowNT(e.target.checked)} />
            <span>N/T</span>
          </label>
          <input
            ref={dxfInputRef}
            type="file"
            accept=".dxf"
            style={{ display: 'none' }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) onImportDxfFile(f);
            }}
          />
          <input
            ref={batchDxfInputRef}
            type="file"
            accept=".dxf"
            style={{ display: 'none' }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) onImportDxfBatchFile(f);
            }}
          />
        </div>
      </div>

      {(() => {
        const levelType = (((dev as any).level_type ?? 'piso') as string).toLowerCase() as LevelType;
        const pisos = Array.from({ length: 30 }, (_, i) => formatOrdinalEs(i + 1));
        return (
          <>
            {/* Fila 1: Nombre + Número */}
            <div className="rowBetween">
              <label className="field" style={{ flex: '1 1 auto', minWidth: '150px' }}>
                <div className="label">Nombre</div>
                <input className="input" value={dev.name ?? ''} readOnly={true} />
              </label>
              <label className="field" style={{ flex: '1 1 auto', minWidth: '100px', maxWidth: '150px' }}>
                <div className="label">Número</div>
                <input
                  className="input"
                  type="number"
                  min={1}
                  step={1}
                  value={String((dev as any).beam_no ?? 1)}
                  disabled={concretoLocked}
                  onChange={(e) => updateDevPatch({ beam_no: clampInt(e.target.value, (dev as any).beam_no ?? 1) } as any)}
                />
              </label>
            </div>

            {/* Fila 2: Tipo + Piso inicial + Piso final */}
            <div className="rowBetween">
              <label className="field" style={{ flex: '1 1 auto', minWidth: '100px' }}>
                <div className="label">Tipo</div>
                <select
                  className="input"
                  value={levelType}
                  disabled={concretoLocked}
                  onChange={(e) => updateDevPatch({ level_type: e.target.value as any } as any)}
                >
                  <option value="sotano">Sótano</option>
                  <option value="piso">Piso</option>
                  <option value="azotea">Azotea</option>
                </select>
              </label>
              {levelType !== 'azotea' ? (
                <>
                  <label className="field" style={{ flex: '1 1 auto', minWidth: '110px' }}>
                    <div className="label">Piso inicial</div>
                    <select
                      className="input"
                      value={(dev as any).floor_start ?? '6to'}
                      disabled={concretoLocked}
                      onChange={(e) => updateDevPatch({ floor_start: e.target.value } as any)}
                    >
                      {pisos.map((p) => (
                        <option key={`fs-${p}`} value={p}>
                          {p}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field" style={{ flex: '1 1 auto', minWidth: '110px' }}>
                    <div className="label">Piso final</div>
                    <select
                      className="input"
                      value={(dev as any).floor_end ?? '9no'}
                      disabled={concretoLocked}
                      onChange={(e) => updateDevPatch({ floor_end: e.target.value } as any)}
                    >
                      {pisos.map((p) => (
                        <option key={`fe-${p}`} value={p}>
                          {p}
                        </option>
                      ))}
                    </select>
                  </label>
                </>
              ) : null}
            </div>
          </>
        );
      })()}

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
                    <div className="mono">Tramo {i + 1}</div>
                    <button className="btnX" type="button" title="Quitar tramo" onClick={() => removeSpan(i)} disabled={concretoLocked}>
                      ✕
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
                  <div className="mono">Nodo {i + 1}</div>
                </div>
              ))}

              <div className="cell rowLabel">X1 superior (b1)</div>
              {(dev.nodes ?? []).map((n, i) => (
                <div className={selection.kind === 'node' && selection.index === i ? 'cell cellSelected' : 'cell'} key={`node-b1-${i}`}>
                  <EditableCell
                    className="cellInput"
                    value={n.b1 ?? 0}
                    readOnly={concretoLocked}
                    fmt={fmt2}
                    parse={clampNumber}
                    onChange={(v) => updateNode(i, { b1: v })}
                    onKeyDown={(e) => onGridKeyDown(e, 'nodes', 0, i, 5, nodesCols)}
                    onFocus={() => applySelection({ kind: 'node', index: i }, true)}
                    data-grid="nodes"
                    data-row={0}
                    data-col={i}
                  />
                </div>
              ))}

              <div className="cell rowLabel">X2 superior (b2)</div>
              {(dev.nodes ?? []).map((n, i) => (
                <div className={selection.kind === 'node' && selection.index === i ? 'cell cellSelected' : 'cell'} key={`node-b2-${i}`}>
                  <EditableCell
                    className="cellInput"
                    value={n.b2 ?? 0}
                    readOnly={concretoLocked}
                    fmt={fmt2}
                    parse={clampNumber}
                    onChange={(v) => updateNode(i, { b2: v })}
                    onKeyDown={(e) => onGridKeyDown(e, 'nodes', 1, i, 5, nodesCols)}
                    onFocus={() => applySelection({ kind: 'node', index: i }, true)}
                    data-grid="nodes"
                    data-row={1}
                    data-col={i}
                  />
                </div>
              ))}

              <div className="cell rowLabel">proj Superior</div>
              {(dev.nodes ?? []).map((n, i) => (
                <div className={selection.kind === 'node' && selection.index === i ? 'cell cellSelected' : 'cell'} key={`node-pb-${i}`}>
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={n.project_b ?? true}
                      disabled={concretoLocked}
                      onChange={(e) => updateNode(i, { project_b: e.target.checked })}
                      onKeyDown={(e) => onGridKeyDown(e as any, 'nodes', 2, i, 5, nodesCols)}
                      onFocus={() => applySelection({ kind: 'node', index: i }, true)}
                      data-grid="nodes"
                      data-row={2}
                      data-col={i}
                    />
                  </label>
                </div>
              ))}

              <div className="cell rowLabel">X2 inferior (a2)</div>
              {(dev.nodes ?? []).map((n, i) => (
                <div className={selection.kind === 'node' && selection.index === i ? 'cell cellSelected' : 'cell'} key={`node-a2-${i}`}>
                  <EditableCell
                    className="cellInput"
                    value={n.a2 ?? 0}
                    readOnly={concretoLocked}
                    fmt={fmt2}
                    parse={clampNumber}
                    onChange={(v) => updateNode(i, { a2: v })}
                    onKeyDown={(e) => onGridKeyDown(e, 'nodes', 3, i, 5, nodesCols)}
                    onFocus={() => applySelection({ kind: 'node', index: i }, true)}
                    data-grid="nodes"
                    data-row={3}
                    data-col={i}
                  />
                </div>
              ))}

              <div className="cell rowLabel">proj Inferior</div>
              {(dev.nodes ?? []).map((n, i) => (
                <div className={selection.kind === 'node' && selection.index === i ? 'cell cellSelected' : 'cell'} key={`node-pa-${i}`}>
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={n.project_a ?? true}
                      disabled={concretoLocked}
                      onChange={(e) => updateNode(i, { project_a: e.target.checked })}
                      onKeyDown={(e) => onGridKeyDown(e as any, 'nodes', 4, i, 5, nodesCols)}
                      onFocus={() => applySelection({ kind: 'node', index: i }, true)}
                      data-grid="nodes"
                      data-row={4}
                      data-col={i}
                    />
                  </label>
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
