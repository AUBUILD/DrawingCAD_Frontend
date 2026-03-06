import React, { useMemo, useState } from 'react';
import { C, NIVEL_COLOR, NIVEL_TYPES } from '../shared/tokens';
import { Icon } from '../shared/Icon';
import { Cap, Pill } from '../shared/primitives';
import type { NivelType } from '../shared/tokens';
import type { useBeams } from './useBeams';

interface VigasPanelProps {
  ctx: ReturnType<typeof useBeams>;
}

export const VigasPanel: React.FC<VigasPanelProps> = ({ ctx }) => {
  const [filter, setFilter] = useState<NivelType | 'Todas'>('Todas');
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const counts = useMemo(
    () =>
      ctx.beams.reduce<Record<string, number>>((acc, beam) => {
        acc[beam.type] = (acc[beam.type] ?? 0) + 1;
        return acc;
      }, {}),
    [ctx.beams],
  );

  const visible = filter === 'Todas' ? ctx.beams : ctx.beams.filter((b) => b.type === filter);
  const visibleIds = useMemo(() => visible.map((b) => b.id), [visible]);
  const selectedCount = selectedIds.size;

  const toggleSelected = (beamId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(beamId)) next.delete(beamId);
      else next.add(beamId);
      return next;
    });
  };

  const clearSelection = () => setSelectedIds(new Set());

  const exitSelectionMode = () => {
    setSelectionMode(false);
    clearSelection();
  };

  const selectAllVisible = () => {
    setSelectedIds(new Set(visibleIds));
  };

  const deleteSelected = () => {
    if (selectedCount === 0) return;
    const ok = window.confirm(`Se eliminaran ${selectedCount} viga(s) seleccionadas.\n\nDeseas continuar?`);
    if (!ok) return;
    ctx.deleteBeams(Array.from(selectedIds));
    exitSelectionMode();
  };

  const deleteAllProjectBeams = () => {
    if (ctx.beams.length === 0) return;
    const ok = window.confirm(
      `Se eliminaran TODAS las vigas del proyecto actual (${ctx.beams.length}).\n\nEsta accion no se puede deshacer.\n\nDeseas continuar?`,
    );
    if (!ok) return;
    ctx.clearBeams();
    exitSelectionMode();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', gap: 4, overflowX: 'auto', scrollbarWidth: 'none' }}>
        <Pill active={filter === 'Todas'} color={C.teal} onClick={() => setFilter('Todas')}>
          Todas {ctx.beams.length}
        </Pill>
        {NIVEL_TYPES.map((tipo) => (
          <Pill
            key={tipo}
            active={filter === tipo}
            color={NIVEL_COLOR[tipo]}
            onClick={() => setFilter(tipo)}
          >
            {tipo} {counts[tipo] ?? 0}
          </Pill>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {!selectionMode ? (
          <>
            <button
              type="button"
              className="btnSmall btnSubtleAction"
              onClick={() => setSelectionMode(true)}
              disabled={ctx.beams.length === 0}
              title="Seleccionar varias vigas"
            >
              Seleccionar
            </button>
            <button
              type="button"
              className="btnSmall"
              onClick={deleteAllProjectBeams}
              disabled={ctx.beams.length === 0}
              title="Eliminar todas las vigas del proyecto"
            >
              Eliminar todas
            </button>
          </>
        ) : (
          <>
            <button type="button" className="btnSmall btnSubtleAction" onClick={selectAllVisible} disabled={visible.length === 0}>
              Check todo
            </button>
            <button type="button" className="btnSmall btnSubtleAction" onClick={clearSelection} disabled={selectedCount === 0}>
              Limpiar check
            </button>
            <button type="button" className="btnSmall" onClick={deleteSelected} disabled={selectedCount === 0}>
              Eliminar seleccionadas ({selectedCount})
            </button>
            <button type="button" className="btnSmall btnSubtleAction" onClick={exitSelectionMode}>
              Cancelar
            </button>
          </>
        )}
      </div>

      {visible.length === 0 ? (
        <div style={{ color: C.dim, fontSize: 11, textAlign: 'center', padding: 14 }}>
          No hay vigas para este filtro.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {visible.map((beam) => {
            const color = NIVEL_COLOR[beam.type];
            const selected = ctx.selectedBeamId === beam.id;
            const checked = selectedIds.has(beam.id);
            return (
              <div
                key={beam.id}
                onClick={() => {
                  if (selectionMode) {
                    toggleSelected(beam.id);
                    return;
                  }
                  ctx.selectBeam(beam.id);
                }}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key !== 'Enter') return;
                  if (selectionMode) {
                    toggleSelected(beam.id);
                    return;
                  }
                  ctx.selectBeam(beam.id);
                }}
                style={{
                  display: 'flex',
                  alignItems: 'stretch',
                  padding: 0,
                  margin: 0,
                  borderRadius: 7,
                  border: `1px solid ${selectionMode && checked ? `${C.teal}66` : selected ? `${color}66` : 'transparent'}`,
                  background: selectionMode && checked ? C.tealBg : selected ? C.cardHi : 'transparent',
                  cursor: 'pointer',
                  textAlign: 'left',
                  boxShadow: 'none',
                  overflow: 'hidden',
                }}
              >
                <div style={{ width: 2.5, background: selectionMode ? C.teal : color, opacity: selected || checked ? 1 : 0.35 }} />
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '8px 10px' }}>
                  {selectionMode ? (
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleSelected(beam.id)}
                      onClick={(e) => e.stopPropagation()}
                      title="Seleccionar viga"
                    />
                  ) : null}

                  <div
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: 6,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      border: `1px solid ${selected ? `${color}66` : C.border}`,
                      background: selected ? `${color}14` : C.card,
                      flexShrink: 0,
                    }}
                  >
                    <Icon name="beam" size={11} color={selected ? color : C.sub} />
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12, fontWeight: 900, color: selected ? C.text : C.sub }}>
                      {beam.id}
                    </div>
                    <Cap ch={`${beam.type} · ${beam.groups.length} grupo(s)`} />
                  </div>

                  {!selectionMode ? (
                    <button
                      type="button"
                      title="Eliminar viga"
                      onClick={(e) => {
                        e.stopPropagation();
                        const ok = window.confirm(`Se eliminara la viga "${beam.id}" con todos sus grupos.\n\nDeseas continuar?`);
                        if (!ok) return;
                        ctx.deleteBeam(beam.id);
                      }}
                      style={{
                        width: 22,
                        height: 22,
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderRadius: 6,
                        border: `1px solid ${C.redBd}`,
                        background: C.redBg,
                        color: C.red,
                        padding: 0,
                        boxShadow: 'none',
                        flexShrink: 0,
                      }}
                    >
                      <Icon name="trash" size={11} color={C.red} />
                    </button>
                  ) : null}

                  {selected ? (
                    <div style={{ width: 5, height: 5, borderRadius: '50%', background: color, boxShadow: `0 0 5px ${color}` }} />
                  ) : null}
                  <Icon name="chevR" size={10} color={selectionMode && checked ? C.teal : selected ? color : C.dim} />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {ctx.storageWarning && (
        <div style={{ fontSize: 10, color: C.red, textAlign: 'center', padding: '6px 8px', background: C.redBg, border: `1px solid ${C.redBd}`, borderRadius: 5, marginTop: 6 }}>
          No se pudo guardar. Los cambios pueden perderse al recargar.
        </div>
      )}
    </div>
  );
};
