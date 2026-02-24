import React, { useEffect, useMemo, useRef, useState } from 'react';
import { fetchPreview } from './api';
import type {
  BackendAppConfig,
  DevelopmentIn,
  PreviewResponse,
} from './types';

import { getSteelLayoutSettings } from './steelLayout';
import { ConfigTab } from './components/ConfigTab';
import { ConcreteTab } from './components/ConcreteTab';
import { SteelTab } from './components/SteelTab';
import { PreviewPanel } from './components/PreviewPanel';
import { SteelOverlay, type SteelOverlayLayer } from './components/SteelOverlay';
import {
  mToUnits,
  spanIndexAtX,
  normalizeBastonCfg,
  normalizeDev,
  defaultDevelopment,
  toBackendPayload,
  toPreviewPayload,
  DEFAULT_APP_CFG,
  type AppConfig,
  nodeSteelKind,
  nodeToFaceEnabled,
  nodeBastonLineKind,
  nodeBastonLineToFaceEnabled,
  buildNodeSlots,
  type Bounds,
  type Selection,
} from './services';
import {
  clampNumber,
  clampInt,
  snap05m,
  formatOrdinalEs,
  parseDefaultPref,
  indexToLetters,
  safeGetLocalStorage,
  safeSetLocalStorage,
  formatStirrupsABCR,
  parseStirrupsABCR,
  pickDefaultABCRForH,
  normalizeDiaKey,
  safeParseJson,
  toJson,
  type DefaultPreferenceId,
} from './utils';
import { useDataMutations } from './hooks/useDataMutations';
import { useApiActions } from './hooks/useApiActions';
import { usePreferences } from './hooks/usePreferences';
import { useCanvasInteractions } from './hooks/useCanvasInteractions';
import { useGridNavigation } from './hooks/useGridNavigation';
import { useInitData } from './hooks/useInitData';
import { useBackendConfig } from './hooks/useBackendConfig';
import { useThreeScene } from './hooks/useThreeScene';
import { useSectionCanvas } from './hooks/useSectionCanvas';
import { useDetailCanvas } from './hooks/useDetailCanvas';
import { useOverviewCanvas } from './hooks/useOverviewCanvas';

type Tab = 'config' | 'concreto' | 'acero' | 'json';
type PreviewView = '2d' | '3d';
type ThreeProjection = 'perspective' | 'orthographic';

const DEFAULT_PREF_KEY = 'beamdraw:defaultPref';

export default function App() {
  const [tab, setTab] = useState<Tab>('concreto');
  const [previewView, setPreviewView] = useState<PreviewView>('2d');
  const [showLongitudinal, setShowLongitudinal] = useState(true);
  const [showStirrups, setShowStirrups] = useState(true);
  const [steelYScale2, setSteelYScale2] = useState(false);
  const [threeOpacity, setThreeOpacity] = useState(20);
  const [steelViewPinned, setSteelViewPinned] = useState(false);
  const [selection, setSelection] = useState<Selection>({ kind: 'none' });
  const [detailViewport, setDetailViewport] = useState<Bounds | null>(null);
  const tabRef = useRef<Tab>(tab);
  const detailViewportRef = useRef<Bounds | null>(detailViewport);

  const steelViewActive = tab === 'acero' || steelViewPinned;
  const [steelOverlayLayer, setSteelOverlayLayer] = useState<SteelOverlayLayer | null>(null);

  useEffect(() => {
    // Una vez que el usuario entra a Acero, mantener esa vista activa aunque cambie
    // el tab del editor (Config/Concreto/JSON).
    if (tab === 'acero') setSteelViewPinned(true);
  }, [tab]);

  const [appCfg, setAppCfg] = useState<AppConfig>(DEFAULT_APP_CFG);
  const [dev, setDev] = useState<DevelopmentIn>(() => defaultDevelopment(DEFAULT_APP_CFG));

  const [jsonText, setJsonText] = useState(() => {
    return toJson(toBackendPayload(defaultDevelopment(DEFAULT_APP_CFG)));
  });

  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [showNT, setShowNT] = useState(true);
  const [zoomEnabled, setZoomEnabled] = useState(true);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'error' | null>(null);
  const [concretoLocked, setConcretoLocked] = useState(false);

  const [defaultPref, setDefaultPref] = useState<DefaultPreferenceId>(() => {
    const saved = safeGetLocalStorage(DEFAULT_PREF_KEY);
    const pref = parseDefaultPref(saved);
    // Si no había nada guardado, guardar 'basico' como predeterminado
    if (!saved) {
      safeSetLocalStorage(DEFAULT_PREF_KEY, 'basico');
    }
    return pref;
  });
  const [editorOpen, setEditorOpen] = useState(false);

  // Config global desde backend (fuente de verdad)
  const [backendCfg, setBackendCfg] = useState<BackendAppConfig | null>(null);
  const hookLegM = backendCfg?.hook_leg_m ?? 0.15;
  const [hookLegDraft, setHookLegDraft] = useState<string>('0.15');

  const [steelTextLayerDraft, setSteelTextLayerDraft] = useState<string>('');
  const [steelTextStyleDraft, setSteelTextStyleDraft] = useState<string>('');
  const [steelTextHeightDraft, setSteelTextHeightDraft] = useState<string>('');
  const [steelTextWidthDraft, setSteelTextWidthDraft] = useState<string>('');
  const [steelTextObliqueDraft, setSteelTextObliqueDraft] = useState<string>('');
  const [steelTextRotationDraft, setSteelTextRotationDraft] = useState<string>('');

  // Proyección de losa (config backend)
  const [slabProjOffsetDraft, setSlabProjOffsetDraft] = useState<string>('0.20');
  const [slabProjLayerDraft, setSlabProjLayerDraft] = useState<string>('-- SECCION CORTE');

  const [templateName, setTemplateName] = useState<string | null>(null);
  const [templateLayers, setTemplateLayers] = useState<string[]>([]);
  const [cascoLayer, setCascoLayer] = useState<string>('-- SECCION CORTE');
  const [steelLayer, setSteelLayer] = useState<string>('FIERRO');
  const [drawSteel, setDrawSteel] = useState<boolean>(true);

  // Sección (verificación a lo largo del desarrollo)
  const sectionCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [sectionXU, setSectionXU] = useState<number>(0);
  const [savedCuts, setSavedCuts] = useState<Array<{ xU: number }>>([]);

  // Layout de acero en sección (E.060). Editable en UI, con fallback auto.
  const [steelLayoutDraft, setSteelLayoutDraft] = useState<string>('');
  const steelLayoutDraftDirtyRef = useRef(false);

  // Bastones: edición libre en inputs + normalización al salir (0.05m, 2 decimales)
  const [bastonLenEdits, setBastonLenEdits] = useState<Record<string, string>>({});

  // Estribos ABCR: edición por campo (mantener string mientras se escribe)
  const [stirrupsAbcrEdits, setStirrupsAbcrEdits] = useState<Record<string, string>>({});
  const snapBastonM = snap05m;
  const fmt2 = (v: number) => (Number.isFinite(v) ? v.toFixed(2) : '');

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const overviewCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const [threeProjection, setThreeProjection] = useState<ThreeProjection>('perspective');

  const spansCols = (dev.spans ?? []).length;
  const nodesCols = (dev.nodes ?? []).length;

  const {
    updateDevPatch, updateSpan, updateSpanStirrups, updateSpanStirrupsSection,
    updateNode, updateSpanSteel, updateBaston,
    setNodeSteelKind, setNodeBastonLineKind, setNodeBastonLineToFace, setNodeToFace,
    addSpan, removeSpan,
  } = useDataMutations(setDev, appCfg, defaultPref);

  useEffect(() => {
    safeSetLocalStorage(DEFAULT_PREF_KEY, defaultPref);
  }, [defaultPref]);


  useEffect(() => {
    detailViewportRef.current = detailViewport;
  }, [detailViewport]);

  useEffect(() => {
    tabRef.current = tab;
  }, [tab]);

  // Por defecto, los contenedores de parámetros quedan cerrados.
  useEffect(() => {
    setEditorOpen(false);
  }, [tab]);

  // Mantener dev sincronizado con config general
  useEffect(() => {
    setDev((prev) => normalizeDev(prev, appCfg));
  }, [appCfg]);

  // Mantener editor JSON de layout sincronizado (sin pisar mientras se edita)
  useEffect(() => {
    if (steelLayoutDraftDirtyRef.current) return;
    try {
      const normalized = getSteelLayoutSettings(dev);
      setSteelLayoutDraft(toJson(normalized));
    } catch {
      // ignore
    }
  }, [(dev as any).steel_layout_settings]);

  const payloadInfo = useMemo(() => {
    const payload = toBackendPayload(dev);
    return { payload, error: null as string | null, warning: null as string | null };
  }, [dev]);

  const payload = payloadInfo.payload;

  // Payload mínimo para /preview: evita refetch cuando solo cambia acero.
  const previewPayloadInfo = useMemo(() => {
    const payload = toPreviewPayload(dev);
    const key = JSON.stringify(payload);
    return { payload, key };
  }, [dev]);

  const {
    handleSaveManual,
    clearDevelopment,
    onExportDxf,
    onUploadTemplate,
    onClearTemplate,
    onImportDxfFile,
    applyJsonToForm,
  } = useApiActions({
    dev, setDev, appCfg, setAppCfg,
    payload, savedCuts, cascoLayer, steelLayer, drawSteel, defaultPref,
    setBusy, setError, setWarning,
    setTemplateName, setTemplateLayers, setCascoLayer, setSteelLayer,
    jsonText, setSaveStatus, setSelection, setDetailViewport, setConcretoLocked,
  });

  const {
    applyBasicoPreference,
    applyBasicoBastonesPreference,
    applyPersonalizadoPreference,
    onChangeDefaultPref,
  } = usePreferences({
    dev, setDev, appCfg, setAppCfg,
    setHookLegDraft, setSlabProjOffsetDraft, setSlabProjLayerDraft,
    setSteelTextLayerDraft, setSteelTextStyleDraft, setSteelTextHeightDraft,
    setSteelTextWidthDraft, setSteelTextObliqueDraft, setSteelTextRotationDraft,
    setCascoLayer, setSteelLayer, setDrawSteel,
    defaultPref, setDefaultPref,
    hookLegDraft, steelTextLayerDraft, steelTextStyleDraft,
    steelTextHeightDraft, steelTextWidthDraft, steelTextObliqueDraft,
    steelTextRotationDraft, slabProjOffsetDraft, slabProjLayerDraft,
    cascoLayer, steelLayer, drawSteel,
  });

  const {
    pan2dRef,
    applySelection,
    moveZoomSelection,
    onCanvasWheel,
    onCanvasPointerDown,
    onCanvasPointerMove,
    onCanvasPointerUp,
    onCanvasClick,
    onOverviewCanvasClick,
  } = useCanvasInteractions({
    preview, dev, selection, setSelection,
    detailViewport, detailViewportRef, setDetailViewport,
    zoomEnabled, previewView, steelViewActive, steelYScale2,
  });

  const { focusGridCell, onGridKeyDown } = useGridNavigation();

  // Mantener JSON sincronizado con formulario sin pisarlo al cambiar pestañas.
  useEffect(() => {
    if (tabRef.current === 'json') return;
    setJsonText(toJson(payload));
  }, [payload]);

  useInitData({
    dev, setDev, appCfg, setAppCfg,
    defaultPref, applyBasicoPreference, applyBasicoBastonesPreference, applyPersonalizadoPreference,
    setJsonText, payload, setSaveStatus, setTemplateName, setTemplateLayers,
    cascoLayer, steelLayer, drawSteel,
    hookLegDraft, steelTextLayerDraft, steelTextStyleDraft,
    steelTextHeightDraft, steelTextWidthDraft, steelTextObliqueDraft,
    steelTextRotationDraft, slabProjOffsetDraft, slabProjLayerDraft,
  });

  useBackendConfig({
    backendCfg, setBackendCfg,
    hookLegDraft, setHookLegDraft,
    steelTextLayerDraft, setSteelTextLayerDraft,
    steelTextStyleDraft, setSteelTextStyleDraft,
    steelTextHeightDraft, setSteelTextHeightDraft,
    steelTextWidthDraft, setSteelTextWidthDraft,
    steelTextObliqueDraft, setSteelTextObliqueDraft,
    steelTextRotationDraft, setSteelTextRotationDraft,
    slabProjOffsetDraft, setSlabProjOffsetDraft,
    slabProjLayerDraft, setSlabProjLayerDraft,
  });

  useDetailCanvas({
    canvasRef, preview, detailViewport, dev, previewPayloadInfo,
    showNT, steelViewActive, steelYScale2, showLongitudinal, showStirrups,
    recubrimiento: appCfg.recubrimiento, hookLegM,
    selection, tab, steelViewPinned, sectionXU,
  });

  useOverviewCanvas({
    overviewCanvasRef, preview, dev, selection, previewPayloadInfo,
    showNT, steelViewActive, sectionXU, tab, steelViewPinned,
  });

  // Preview
  useEffect(() => {
    let cancelled = false;

    (async () => {
      setBusy(true);
      setError(null);
      setWarning(null);
      try {
        const data = await fetchPreview(previewPayloadInfo.payload);
        if (cancelled) return;
        setPreview(data);
      } catch (e: any) {
        if (cancelled) return;
        setError(e?.message ?? String(e));
        setPreview(null);
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [previewPayloadInfo.key]);

  const { sectionXRangeU, sectionInfo, defaultCutAXU } = useSectionCanvas({
    dev, appCfg, sectionCanvasRef, sectionXU, setSectionXU, setSavedCuts, backendCfg,
  });


  const {
    threeHostRef,
    threeRef,
    threeOverviewHostRef,
    threeOverviewRef,
  } = useThreeScene({
    previewView, preview, dev, appCfg,
    selection, threeOpacity, zoomEnabled,
    showLongitudinal, showStirrups, hookLegM, threeProjection,
  });


  // Si se desactiva Zoom, apaga correlación y vuelve a vista general
  useEffect(() => {
    if (zoomEnabled) return;
    setDetailViewport(null);
    setSelection({ kind: 'none' });
  }, [zoomEnabled]);

  // Escape: si hay zoom vuelve a vista general; si no, limpia selección
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (detailViewport) {
        setDetailViewport(null);
        e.preventDefault();
        return;
      }
      if (selection.kind !== 'none') {
        setSelection({ kind: 'none' });
        e.preventDefault();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [detailViewport, selection.kind]);



  // Fallback visual global: si los datos principales no están listos, mostrar mensaje claro
  if (!dev || !appCfg) {
    return (
      <div style={{ color: '#fff', background: '#0b1220', height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>
        ⚠️ Error: Datos principales no cargados. Revisa la inicialización de la app o el backend.
      </div>
    );
  }
  return (
    <div className="layout">
      <header className="header">
        <div>
          <div className="title">AUBUILD - MASCON TECH.</div>
          <div className="subtitle">Config / Concreto / Acero / JSON</div>
        </div>

        {/* Indicador de guardado */}
        {saveStatus && (
          <div className={`saveIndicator saveIndicator--${saveStatus}`}>
            {saveStatus === 'saving' && (
              <span>💾 Guardando {dev.name ?? 'DESARROLLO 01'}...</span>
            )}
            {saveStatus === 'saved' && (
              <span>✅ {dev.name ?? 'DESARROLLO 01'} guardado</span>
            )}
            {saveStatus === 'error' && (
              <span>❌ Error al guardar {dev.name ?? 'DESARROLLO 01'}</span>
            )}
          </div>
        )}

        <div className="actions" style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <div className="steelLayerSelector">
            {([
              { key: null, label: 'Off' },
              { key: 'acero' as SteelOverlayLayer, label: 'Acero' },
              { key: 'bastones' as SteelOverlayLayer, label: 'Bastones' },
              { key: 'estribos' as SteelOverlayLayer, label: 'Estribos' },
            ] as const).map(({ key, label }) => (
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

      <main className="content">
        <div className="mainGrid">
          <div className="leftPane">
            <section className="panel" style={{ padding: 10 }}>
              <div className="segmented" aria-label="Navegación">
                <button className={tab === 'config' ? 'segBtn segBtnActive' : 'segBtn'} onClick={() => setTab('config')} type="button">
                  Config
                </button>
                <button className={tab === 'concreto' ? 'segBtn segBtnActive' : 'segBtn'} onClick={() => setTab('concreto')} type="button">
                  Concreto
                </button>
                <button className={tab === 'acero' ? 'segBtn segBtnActive' : 'segBtn'} onClick={() => setTab('acero')} type="button">
                  Acero
                </button>
                <button className={tab === 'json' ? 'segBtn segBtnActive' : 'segBtn'} onClick={() => setTab('json')} type="button">
                  JSON
                </button>
              </div>
            </section>

            <details
              className="panel"
              open={editorOpen}
              onToggle={(e) => setEditorOpen((e.currentTarget as HTMLDetailsElement).open)}
            >
              <summary className="panelSummary">
                <div className="panelSummaryInner">
                  <div className="panelTitle" style={{ marginBottom: 0 }}>EDITOR DE DESARROLLO DE VIGA.</div>

                  {tab === 'config' ? (
                    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                      <label
                        className="field"
                        style={{ minWidth: 260, flex: 1 }}
                        onClick={(e) => e.stopPropagation()}
                        onPointerDown={(e) => e.stopPropagation()}
                      >
                        <div className="label">Preferencia</div>
                        <select
                          className="input"
                          value={defaultPref}
                          onChange={(e) => onChangeDefaultPref(e.target.value as DefaultPreferenceId)}
                          onClick={(e) => e.stopPropagation()}
                          onPointerDown={(e) => e.stopPropagation()}
                        >
                          <option value="basico">Preferencia 01: Básico</option>
                          <option value="basico_bastones">Preferencia 02: Básico + Bastones</option>
                          <option value="personalizado">Personalizado</option>
                        </select>
                      </label>
                    </div>
                  ) : null}
                </div>
              </summary>

              {tab === 'config' ? (
                <ConfigTab
                  defaultPref={defaultPref}
                  onChangeDefaultPref={onChangeDefaultPref}
                  slabProjOffsetDraft={slabProjOffsetDraft}
                  setSlabProjOffsetDraft={setSlabProjOffsetDraft}
                  slabProjLayerDraft={slabProjLayerDraft}
                  setSlabProjLayerDraft={setSlabProjLayerDraft}
                  templateName={templateName}
                  templateLayers={templateLayers ?? []}
                  onUploadTemplate={onUploadTemplate}
                  onClearTemplate={onClearTemplate}
                  busy={busy}
                  cascoLayer={cascoLayer}
                  setCascoLayer={setCascoLayer}
                  steelLayer={steelLayer}
                  setSteelLayer={setSteelLayer}
                  drawSteel={drawSteel}
                  setDrawSteel={setDrawSteel}
                  appCfg={appCfg}
                  setAppCfg={setAppCfg}
                  clampNumber={clampNumber}
                  hookLegDraft={hookLegDraft}
                  setHookLegDraft={setHookLegDraft}
                  steelTextLayerDraft={steelTextLayerDraft}
                  setSteelTextLayerDraft={setSteelTextLayerDraft}
                  steelTextStyleDraft={steelTextStyleDraft}
                  setSteelTextStyleDraft={setSteelTextStyleDraft}
                  steelTextHeightDraft={steelTextHeightDraft}
                  setSteelTextHeightDraft={setSteelTextHeightDraft}
                  steelTextWidthDraft={steelTextWidthDraft}
                  setSteelTextWidthDraft={setSteelTextWidthDraft}
                  steelTextObliqueDraft={steelTextObliqueDraft}
                  setSteelTextObliqueDraft={setSteelTextObliqueDraft}
                  steelTextRotationDraft={steelTextRotationDraft}
                  setSteelTextRotationDraft={setSteelTextRotationDraft}
                />
              ) : null}

          {tab === 'concreto' ? (
            <ConcreteTab
              dev={dev}
              selection={selection}
              spansCols={spansCols}
              nodesCols={nodesCols}
              busy={busy}
              concretoLocked={concretoLocked}
              showNT={showNT}
              setConcretoLocked={setConcretoLocked}
              setShowNT={setShowNT}
              clearDevelopment={clearDevelopment}
              onImportDxfFile={onImportDxfFile}
              onSave={handleSaveManual}
              addSpan={addSpan}
              removeSpan={removeSpan}
              updateDevPatch={updateDevPatch}
              updateSpan={updateSpan}
              updateNode={updateNode}
              applySelection={applySelection}
              onGridKeyDown={onGridKeyDown}
              formatOrdinalEs={formatOrdinalEs}
              clampInt={clampInt}
              clampNumber={clampNumber}
              fmt2={fmt2}
            />
          ) : null}

          {tab === 'acero' ? (
            <SteelTab
              dev={dev}
              appCfg={appCfg}
              defaultPref={defaultPref}
              steelLayoutDraft={steelLayoutDraft}
              setSteelLayoutDraft={setSteelLayoutDraft}
              steelLayoutDraftDirtyRef={steelLayoutDraftDirtyRef}
              warning={warning}
              setWarning={setWarning}
              updateDevPatch={updateDevPatch}
              bastonLenEdits={bastonLenEdits}
              setBastonLenEdits={setBastonLenEdits}
              stirrupsAbcrEdits={stirrupsAbcrEdits}
              setStirrupsAbcrEdits={setStirrupsAbcrEdits}
              updateSpanSteel={updateSpanSteel}
              updateSpanStirrupsSection={updateSpanStirrupsSection}
              updateSpanStirrups={updateSpanStirrups}
              updateBaston={updateBaston}
              nodeSteelKind={nodeSteelKind}
              setNodeSteelKind={setNodeSteelKind}
              nodeToFaceEnabled={nodeToFaceEnabled}
              setNodeToFace={setNodeToFace}
              buildNodeSlots={buildNodeSlots}
              nodeBastonLineKind={nodeBastonLineKind}
              setNodeBastonLineKind={setNodeBastonLineKind}
              nodeBastonLineToFaceEnabled={nodeBastonLineToFaceEnabled}
              setNodeBastonLineToFace={setNodeBastonLineToFace}
              normalizeBastonCfg={normalizeBastonCfg}
              snapBastonM={snapBastonM}
              parseStirrupsABCR={parseStirrupsABCR}
              formatStirrupsABCR={formatStirrupsABCR}
              pickDefaultABCRForH={pickDefaultABCRForH}
              normalizeDiaKey={normalizeDiaKey}
              safeParseJson={safeParseJson}
              getSteelLayoutSettings={getSteelLayoutSettings}
              clampNumber={clampNumber}
              fmt2={fmt2}
            />
          ) : null}

          {tab === 'json' ? (
            <div className="form">
              <div className="rowBetween">
                <div className="muted">Editar JSON. Botón aplica al formulario.</div>
                <button className="btnSmall" type="button" onClick={applyJsonToForm}>
                  Aplicar
                </button>
              </div>
              <textarea className="editor" value={jsonText} onChange={(e) => setJsonText(e.target.value)} />
            </div>
          ) : null}

              {busy ? <div className="mutedSmall">Procesando…</div> : null}
              {warning ? <div className="warning">{warning}</div> : null}
              {error ? <div className="error">{error}</div> : null}
            </details>
          </div>

          <PreviewPanel
            preview={preview}
            previewView={previewView}
            setPreviewView={setPreviewView}
            threeProjection={threeProjection}
            setThreeProjection={setThreeProjection}
            dev={dev}
            overviewCanvasRef={overviewCanvasRef}
            canvasRef={canvasRef}
            sectionCanvasRef={sectionCanvasRef}
            threeHostRef={threeHostRef}
            onOverviewCanvasClick={onOverviewCanvasClick}
            onCanvasWheel={onCanvasWheel}
            onCanvasPointerDown={onCanvasPointerDown}
            onCanvasPointerMove={onCanvasPointerMove}
            onCanvasPointerUp={onCanvasPointerUp}
            onCanvasClick={onCanvasClick}
            moveZoomSelection={moveZoomSelection}
            setDetailViewport={setDetailViewport}
            showLongitudinal={showLongitudinal}
            setShowLongitudinal={setShowLongitudinal}
            showStirrups={showStirrups}
            setShowStirrups={setShowStirrups}
            steelViewActive={steelViewActive}
            steelYScale2={steelYScale2}
            setSteelYScale2={setSteelYScale2}
            threeOpacity={threeOpacity}
            setThreeOpacity={setThreeOpacity}
            savedCuts={savedCuts}
            setSavedCuts={setSavedCuts}
            sectionXU={sectionXU}
            setSectionXU={setSectionXU}
            sectionXRangeU={sectionXRangeU}
            sectionInfo={sectionInfo}
            defaultCutAXU={defaultCutAXU}
            mToUnits={mToUnits}
            spanIndexAtX={spanIndexAtX}
            indexToLetters={indexToLetters}
            detailOverlay={
              previewView === '2d' && steelOverlayLayer ? (
                <SteelOverlay
                  dev={dev}
                  preview={preview}
                  renderBounds={(detailViewport ?? (preview?.bounds as Bounds | undefined)) ?? null}
                  canvasRef={canvasRef}
                  layer={steelOverlayLayer}
                  yScale={steelViewActive && steelYScale2 ? 2 : 1}
                  onUpdateSpanSteel={updateSpanSteel}
                  onUpdateNode={updateNode}
                  onUpdateBaston={updateBaston}
                  onUpdateStirrups={updateSpanStirrups}
                  onUpdateStirrupsSection={updateSpanStirrupsSection}
                />
              ) : undefined
            }
          />
        </div>
      </main>
    </div>
  );
}
