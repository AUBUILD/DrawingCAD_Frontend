import React from 'react';
import type { DevelopmentIn } from '../../types';
import type { VariantScope } from '../../api';

type LevelType = 'piso' | 'sotano' | 'azotea';

export interface ProjectTabProps {
  dev: DevelopmentIn;
  developments: DevelopmentIn[];
  activeDevIdx: number;
  concretoLocked: boolean;
  variantScope: VariantScope;
  onSelectDev: (idx: number) => void;
  onAddDev: () => void;
  onRemoveDev: (idx: number) => void;
  onCreateTwin: (idx: number) => void;
  onToggleTwin: () => void;
  onVariantScopeChange: (patch: Partial<VariantScope>) => void;
  updateDevPatch: (patch: Partial<DevelopmentIn>) => void;
  clampInt: (val: string | number, fallback: number) => number;
  formatOrdinalEs: (n: number) => string;
}

const ProjectTabInner: React.FC<ProjectTabProps> = ({
  dev,
  developments,
  activeDevIdx,
  concretoLocked,
  variantScope,
  onSelectDev,
  onAddDev,
  onRemoveDev,
  onCreateTwin,
  onToggleTwin,
  onVariantScopeChange,
  updateDevPatch,
  clampInt,
  formatOrdinalEs,
}) => {
  const hasManyDevs = developments.length > 1;
  const hasTwin = !!dev.twin_id;
  const activeBeamType = dev.beam_type ?? 'convencional';
  const levelType = (((dev as any).level_type ?? 'piso') as string).toLowerCase() as LevelType;
  const pisos = Array.from({ length: 30 }, (_, i) => formatOrdinalEs(i + 1));

  return (
    <div className="form">
      <div className="sectionHeader">
        <div>Proyecto</div>
      </div>

      <div className="rowBetween">
        <label className="field" style={{ flex: '2 1 auto', minWidth: 170 }}>
          <div className="label">Nombre proyecto</div>
          <input
            className="input"
            value={variantScope.project_name}
            onChange={(e) => onVariantScopeChange({ project_name: e.target.value })}
          />
        </label>
        <label className="field" style={{ flex: '1 1 auto', minWidth: 110 }}>
          <div className="label">Story i</div>
          <input
            className="input"
            value={variantScope.story_i}
            onChange={(e) => onVariantScopeChange({ story_i: e.target.value })}
          />
        </label>
        <label className="field" style={{ flex: '1 1 auto', minWidth: 110 }}>
          <div className="label">Story f</div>
          <input
            className="input"
            value={variantScope.story_f}
            onChange={(e) => onVariantScopeChange({ story_f: e.target.value })}
          />
        </label>
      </div>

      <div className="rowBetween">
        <label className="field" style={{ flex: '1 1 auto', minWidth: 110 }}>
          <div className="label">Codigo viga</div>
          <input
            className="input"
            value={variantScope.beam_code}
            onChange={(e) => onVariantScopeChange({ beam_code: e.target.value.toUpperCase() })}
          />
        </label>
        <label className="field" style={{ flex: '1 1 auto', minWidth: 140 }}>
          <div className="label">Tipo</div>
          <select
            className="input"
            value={variantScope.beam_type}
            onChange={(e) => onVariantScopeChange({ beam_type: e.target.value === 'prefabricado' ? 'prefabricado' : 'convencional' })}
          >
            <option value="convencional">Convencional</option>
            <option value="prefabricado">Prefabricado</option>
          </select>
        </label>
        <label className="field" style={{ flex: '1 1 auto', minWidth: 140 }}>
          <div className="label">Variante</div>
          <input
            className="input"
            value={variantScope.variant_name}
            onChange={(e) => onVariantScopeChange({ variant_name: e.target.value })}
          />
        </label>
      </div>

      <div className="sectionHeader">
        <div>Vigas</div>
        <div className="mutedSmall">{activeDevIdx + 1}/{developments.length}</div>
      </div>

      <div className="actionButtons">
        <button className="btnSmall" type="button" onClick={onAddDev} title="Agregar viga">
          + Viga
        </button>
        <button
          className="btnSmall"
          type="button"
          onClick={() => onRemoveDev(activeDevIdx)}
          disabled={developments.length <= 1}
          title="Eliminar viga actual"
        >
          - Viga
        </button>
        {hasTwin ? (
          <>
            <button
              className={activeBeamType === 'convencional' ? 'btnSmall' : 'btnSmall btnSecondary'}
              type="button"
              onClick={() => { if (activeBeamType !== 'convencional') onToggleTwin(); }}
            >
              Conv
            </button>
            <button
              className={activeBeamType === 'prefabricada' ? 'btnSmall' : 'btnSmall btnSecondary'}
              type="button"
              onClick={() => { if (activeBeamType !== 'prefabricada') onToggleTwin(); }}
            >
              Prefab
            </button>
          </>
        ) : (
          <button className="btnSmall btnSecondary" type="button" onClick={() => onCreateTwin(activeDevIdx)}>
            + Prefab
          </button>
        )}
      </div>

      {hasManyDevs ? (
        <label className="field">
          <div className="label">Seleccionar viga</div>
          <select
            className="input"
            value={activeDevIdx}
            onChange={(e) => onSelectDev(Number(e.target.value))}
          >
            {developments.map((d, i) => (
              <option key={i} value={i}>
                {(d.name ?? `Desarrollo ${i + 1}`) + (d.twin_id ? (d.beam_type === 'prefabricada' ? ' [P]' : ' [C]') : '')}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      <div className="rowBetween">
        <label className="field" style={{ flex: '1 1 auto', minWidth: 150 }}>
          <div className="label">Nombre</div>
          <input className="input" value={dev.name ?? ''} readOnly={true} />
        </label>
        <label className="field" style={{ flex: '1 1 auto', minWidth: 110, maxWidth: 160 }}>
          <div className="label">Numero</div>
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

      <div className="rowBetween">
        <label className="field" style={{ flex: '1 1 auto', minWidth: 110 }}>
          <div className="label">Nivel</div>
          <select
            className="input"
            value={levelType}
            disabled={concretoLocked}
            onChange={(e) => updateDevPatch({ level_type: e.target.value as any } as any)}
          >
            <option value="sotano">Sotano</option>
            <option value="piso">Piso</option>
            <option value="azotea">Azotea</option>
          </select>
        </label>
        {levelType !== 'azotea' ? (
          <>
            <label className="field" style={{ flex: '1 1 auto', minWidth: 110 }}>
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
            <label className="field" style={{ flex: '1 1 auto', minWidth: 110 }}>
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
    </div>
  );
};

export const ProjectTab = React.memo(ProjectTabInner);
