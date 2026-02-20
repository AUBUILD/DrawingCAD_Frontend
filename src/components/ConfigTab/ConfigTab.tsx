import React, { useRef } from 'react';

/**
 * Props para ConfigTab
 */
export interface ConfigTabProps {
  // Preferencias
  defaultPref: 'basico' | 'personalizado';
  onChangeDefaultPref: (pref: 'basico' | 'personalizado') => void;

  // Proyección de losa
  slabProjOffsetDraft: string;
  setSlabProjOffsetDraft: (val: string) => void;
  slabProjLayerDraft: string;
  setSlabProjLayerDraft: (val: string) => void;

  // Template
  templateName: string | null;
  templateLayers: string[];
  onUploadTemplate: (file: File) => Promise<void>;
  onClearTemplate: () => Promise<void>;
  busy: boolean;

  // Capas DXF
  cascoLayer: string;
  setCascoLayer: (val: string) => void;
  steelLayer: string;
  setSteelLayer: (val: string) => void;
  drawSteel: boolean;
  setDrawSteel: (val: boolean) => void;

  // App config
  appCfg: {
    d: number;
    unit_scale: number;
    x0: number;
    y0: number;
    recubrimiento: number;
    baston_Lc: number;
  };
  setAppCfg: React.Dispatch<React.SetStateAction<any>>;
  clampNumber: (n: unknown, fallback: number) => number;

  // Hook leg
  hookLegDraft: string;
  setHookLegDraft: (val: string) => void;

  // Steel text
  steelTextLayerDraft: string;
  setSteelTextLayerDraft: (val: string) => void;
  steelTextStyleDraft: string;
  setSteelTextStyleDraft: (val: string) => void;
  steelTextHeightDraft: string;
  setSteelTextHeightDraft: (val: string) => void;
  steelTextWidthDraft: string;
  setSteelTextWidthDraft: (val: string) => void;
  steelTextObliqueDraft: string;
  setSteelTextObliqueDraft: (val: string) => void;
  steelTextRotationDraft: string;
  setSteelTextRotationDraft: (val: string) => void;
}

/**
 * Componente ConfigTab - Configuración global de la aplicación
 *
 * Incluye:
 * - Preferencias por defecto
 * - Exportación DXF (plantilla, capas)
 * - Configuración general (d, unit_scale, x0, y0, recubrimiento)
 * - Texto de acero
 */
export const ConfigTab: React.FC<ConfigTabProps> = ({
  defaultPref,
  onChangeDefaultPref,
  slabProjOffsetDraft,
  setSlabProjOffsetDraft,
  slabProjLayerDraft,
  setSlabProjLayerDraft,
  templateName,
  templateLayers,
  onUploadTemplate,
  onClearTemplate,
  busy,
  cascoLayer,
  setCascoLayer,
  steelLayer,
  setSteelLayer,
  drawSteel,
  setDrawSteel,
  appCfg,
  setAppCfg,
  clampNumber,
  hookLegDraft,
  setHookLegDraft,
  steelTextLayerDraft,
  setSteelTextLayerDraft,
  steelTextStyleDraft,
  setSteelTextStyleDraft,
  steelTextHeightDraft,
  setSteelTextHeightDraft,
  steelTextWidthDraft,
  setSteelTextWidthDraft,
  steelTextObliqueDraft,
  setSteelTextObliqueDraft,
  steelTextRotationDraft,
  setSteelTextRotationDraft,
}) => {
  const templateInputRef = useRef<HTMLInputElement | null>(null);

  return (
    <div className="form">
      <div className="sectionHeader">
        <div>Exportación DXF</div>
        <div className="mutedSmall">Plantilla + asignación de capas (casco y acero opcional)</div>
      </div>

      <div className="grid4">
        <label className="field">
          <div className="label">Proyección losa offset (m, hacia abajo)</div>
          <input className="input" type="number" step="0.01" value={slabProjOffsetDraft} onChange={(e) => setSlabProjOffsetDraft(e.target.value)} />
        </label>
        <label className="field">
          <div className="label">Proyección losa capa</div>
          <select className="input" value={slabProjLayerDraft} onChange={(e) => setSlabProjLayerDraft(e.target.value)}>
            {Array.from(new Set(['-- SECCION CORTE', 'A-BEAM-LOSA-PROY', ...(templateLayers ?? [])])).map((ly) => (
              <option key={ly} value={ly}>
                {ly}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="rowBetween" style={{ gap: 10, alignItems: 'center' }}>
        <div className="mutedSmall">
          Plantilla: <span className="mono">{templateName ?? '—'}</span>
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btnSmall" type="button" onClick={() => templateInputRef.current?.click()} disabled={busy}>
            Cargar plantilla DXF
          </button>
          <button className="btnSmall" type="button" onClick={onClearTemplate} disabled={busy || !templateName}>
            Quitar plantilla
          </button>
          <input
            ref={templateInputRef}
            type="file"
            accept=".dxf"
            style={{ display: 'none' }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) onUploadTemplate(f);
            }}
          />
        </div>
      </div>

      <div className="grid4">
        <label className="field">
          <div className="label">Capa Casco</div>
          <select className="input" value={cascoLayer} onChange={(e) => setCascoLayer(e.target.value)}>
            {Array.from(new Set(['-- SECCION CORTE', 'A-BEAM-CASCO', ...(templateLayers ?? [])])).map((ly) => (
              <option key={ly} value={ly}>
                {ly}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <div className="label">Capa Acero</div>
          <select className="input" value={steelLayer} onChange={(e) => setSteelLayer(e.target.value)} disabled={!drawSteel}>
            {Array.from(new Set(['FIERRO', 'A-REBAR-CORRIDO', ...(templateLayers ?? [])])).map((ly) => (
              <option key={ly} value={ly}>
                {ly}
              </option>
            ))}
          </select>
        </label>

        <label className="field" style={{ justifyContent: 'flex-end' }}>
          <div className="label">Dibujar acero</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, height: 36 }}>
            <input type="checkbox" checked={drawSteel} onChange={(e) => setDrawSteel(e.target.checked)} />
            <div className="mutedSmall">{drawSteel ? 'Incluye' : 'Solo concreto'}</div>
          </div>
        </label>
      </div>

      <div className="hint"></div>
      <div className="muted">Config general (solo estos parámetros).</div>
      <div className="grid4">
        <label className="field">
          <div className="label">d</div>
          <input className="input" type="number" step="0.01" value={appCfg.d} onChange={(e) => setAppCfg((p: any) => ({ ...p, d: clampNumber(e.target.value, p.d) }))} />
        </label>
        <label className="field">
          <div className="label">unit_scale</div>
          <input
            className="input"
            type="number"
            step="0.1"
            value={appCfg.unit_scale}
            onChange={(e) => setAppCfg((p: any) => ({ ...p, unit_scale: clampNumber(e.target.value, p.unit_scale) }))}
          />
        </label>
        <label className="field">
          <div className="label">x0</div>
          <input className="input" type="number" step="0.01" value={appCfg.x0} onChange={(e) => setAppCfg((p: any) => ({ ...p, x0: clampNumber(e.target.value, p.x0) }))} />
        </label>
        <label className="field">
          <div className="label">y0</div>
          <input className="input" type="number" step="0.01" value={appCfg.y0} onChange={(e) => setAppCfg((p: any) => ({ ...p, y0: clampNumber(e.target.value, p.y0) }))} />
        </label>

        <label className="field">
          <div className="label">recubrimiento (m)</div>
          <input
            className="input"
            type="number"
            step="0.01"
            value={appCfg.recubrimiento}
            onChange={(e) => setAppCfg((p: any) => ({ ...p, recubrimiento: clampNumber(e.target.value, p.recubrimiento) }))}
          />
        </label>

        <label className="field">
          <div className="label">Lc bastón (m)</div>
          <input
            className="input"
            type="number"
            step="0.01"
            value={appCfg.baston_Lc}
            onChange={(e) => setAppCfg((p: any) => ({ ...p, baston_Lc: clampNumber(e.target.value, p.baston_Lc) }))}
          />
        </label>

        <label className="field">
          <div className="label">L6 gancho (m)</div>
          <input className="input" type="number" step="0.01" value={hookLegDraft} onChange={(e) => setHookLegDraft(e.target.value)} />
        </label>
      </div>

      <div className="hint"></div>
      <div className="sectionHeader">
        <div>Texto acero</div>
        <div className="mutedSmall">Vacío = usar formato de la plantilla DXF</div>
      </div>

      <div className="grid4">
        <label className="field">
          <div className="label">steel_text_layer</div>
          <input className="input" type="text" value={steelTextLayerDraft} onChange={(e) => setSteelTextLayerDraft(e.target.value)} />
        </label>
        <label className="field">
          <div className="label">steel_text_style</div>
          <input className="input" type="text" value={steelTextStyleDraft} onChange={(e) => setSteelTextStyleDraft(e.target.value)} />
        </label>
        <label className="field">
          <div className="label">steel_text_height</div>
          <input className="input" type="number" step="0.01" value={steelTextHeightDraft} onChange={(e) => setSteelTextHeightDraft(e.target.value)} />
        </label>
        <label className="field">
          <div className="label">steel_text_width</div>
          <input className="input" type="number" step="0.01" value={steelTextWidthDraft} onChange={(e) => setSteelTextWidthDraft(e.target.value)} />
        </label>
        <label className="field">
          <div className="label">steel_text_oblique</div>
          <input className="input" type="number" step="1" value={steelTextObliqueDraft} onChange={(e) => setSteelTextObliqueDraft(e.target.value)} />
        </label>
        <label className="field">
          <div className="label">steel_text_rotation</div>
          <input className="input" type="number" step="1" value={steelTextRotationDraft} onChange={(e) => setSteelTextRotationDraft(e.target.value)} />
        </label>
      </div>
    </div>
  );
};
