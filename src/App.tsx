import React, { useEffect, useMemo, useRef, useState } from 'react';
import { fetchPreview } from './api';
import type { BackendAppConfig, DevelopmentIn, PreviewResponse } from './types';
import { getSteelLayoutSettings } from './steelLayout';
import {
  mToUnits, spanIndexAtX, normalizeBastonCfg, normalizeDev,
  defaultDevelopment, toBackendPayload, toPreviewPayload, DEFAULT_APP_CFG,
  type AppConfig, nodeSteelKind, nodeToFaceEnabled,
  nodeBastonLineKind, nodeBastonLineToFaceEnabled, buildNodeSlots,
  type Bounds, type Selection, type QuantityDisplayState,
} from './services';
import {
  clampNumber, clampInt, snap05m, formatOrdinalEs, parseDefaultPref,
  indexToLetters, safeGetLocalStorage, safeSetLocalStorage,
  formatStirrupsABCR, parseStirrupsABCR, pickDefaultABCRForH,
  normalizeDiaKey, safeParseJson, toJson, type DefaultPreferenceId,
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

import { AppLayout, HeaderBar, StatusBar } from './layouts';
import { LeftPanel } from './panels/LeftPanel';
import { RightPanel } from './panels/RightPanel';
import { SteelOverlay, type SteelOverlayLayer } from './overlay';

type Tab = 'config' | 'concreto' | 'acero' | 'metrado' | 'json';
type PreviewView = '2d' | '3d';
type ThreeProjection = 'perspective' | 'orthographic';

const DEFAULT_PREF_KEY = 'beamdraw:defaultPref';

export default function App() {
  // ── UI state ──────────────────────────────────────────────
  const [tab, setTab] = useState<Tab>('concreto');
  const [previewView, setPreviewView] = useState<PreviewView>('2d');
  const [showLongitudinal, setShowLongitudinal] = useState(true);
  const [showStirrups, setShowStirrups] = useState(true);
  const [quantityDisplay, setQuantityDisplay] = useState<QuantityDisplayState>({
    enabled: true,
    mode: 'section',
    show_p_min: false,
    show_p_max: false,
    show_p_instalada: false,
    show_p_requerida: false,
    show_As_min: false,
    show_As_max: false,
    show_As_instalada: true,
    show_As_requerida: true,
    show_margin: true,
    show_compliance: false,
  });
  const [steelYScale2, setSteelYScale2] = useState(false);
  const [threeOpacity, setThreeOpacity] = useState(20);
  const [steelViewPinned, setSteelViewPinned] = useState(false);
  const [selection, setSelection] = useState<Selection>({ kind: 'none' });
  const [selectedBastonDetailTags, setSelectedBastonDetailTags] = useState<string[] | null>(null);
  const [selectedBastonDetailSpans, setSelectedBastonDetailSpans] = useState<number[] | null>(null);
  const [detailViewport, setDetailViewport] = useState<Bounds | null>(null);
  const tabRef = useRef<Tab>(tab);
  const detailViewportRef = useRef<Bounds | null>(detailViewport);
  const steelViewActive = tab === 'acero' || steelViewPinned;
  const [steelOverlayLayer, setSteelOverlayLayer] = useState<SteelOverlayLayer | null>(null);

  useEffect(() => { if (tab === 'acero') setSteelViewPinned(true); }, [tab]);

  // ── Domain state ──────────────────────────────────────────
  const [appCfg, setAppCfg] = useState<AppConfig>(DEFAULT_APP_CFG);
  const [dev, setDev] = useState<DevelopmentIn>(() => defaultDevelopment(DEFAULT_APP_CFG));
  const [jsonText, setJsonText] = useState(() => toJson(toBackendPayload(defaultDevelopment(DEFAULT_APP_CFG))));
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
    if (!saved) safeSetLocalStorage(DEFAULT_PREF_KEY, 'personalizado');
    return pref;
  });
  const [editorOpen, setEditorOpen] = useState(false);

  // ── Backend config state ──────────────────────────────────
  const [backendCfg, setBackendCfg] = useState<BackendAppConfig | null>(null);
  const hookLegM = backendCfg?.hook_leg_m ?? 0.15;
  const [hookLegDraft, setHookLegDraft] = useState<string>('0.15');
  const [steelTextLayerDraft, setSteelTextLayerDraft] = useState<string>('');
  const [steelTextStyleDraft, setSteelTextStyleDraft] = useState<string>('');
  const [steelTextHeightDraft, setSteelTextHeightDraft] = useState<string>('');
  const [steelTextWidthDraft, setSteelTextWidthDraft] = useState<string>('');
  const [steelTextObliqueDraft, setSteelTextObliqueDraft] = useState<string>('');
  const [steelTextRotationDraft, setSteelTextRotationDraft] = useState<string>('');
  const [slabProjOffsetDraft, setSlabProjOffsetDraft] = useState<string>('0.20');
  const [slabProjLayerDraft, setSlabProjLayerDraft] = useState<string>('-- SECCION CORTE');

  // ── Template / layer state ────────────────────────────────
  const [templateName, setTemplateName] = useState<string | null>(null);
  const [templateLayers, setTemplateLayers] = useState<string[]>([]);
  const [cascoLayer, setCascoLayer] = useState<string>('-- SECCION CORTE');
  const [steelLayer, setSteelLayer] = useState<string>('FIERRO');
  const [drawSteel, setDrawSteel] = useState<boolean>(true);

  // ── Section / steel editing state ─────────────────────────
  const sectionCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [sectionXU, setSectionXU] = useState<number>(0);
  const [savedCuts, setSavedCuts] = useState<Array<{ xU: number }>>([]);
  const [steelLayoutDraft, setSteelLayoutDraft] = useState<string>('');
  const steelLayoutDraftDirtyRef = useRef(false);
  const [bastonLenEdits, setBastonLenEdits] = useState<Record<string, string>>({});
  const [stirrupsAbcrEdits, setStirrupsAbcrEdits] = useState<Record<string, string>>({});
  const snapBastonM = snap05m;
  const fmt2 = (v: number) => (Number.isFinite(v) ? v.toFixed(2) : '');

  // ── Canvas refs ───────────────────────────────────────────
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const overviewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [threeProjection, setThreeProjection] = useState<ThreeProjection>('perspective');

  // ── Derived ───────────────────────────────────────────────
  const spansCols = (dev.spans ?? []).length;
  const nodesCols = (dev.nodes ?? []).length;

  // ── Hooks ─────────────────────────────────────────────────
  const {
    updateDevPatch, updateSpan, updateSpanStirrups, updateSpanStirrupsSection,
    updateNode, updateSpanSteel, updateBaston,
    setNodeSteelKind, setNodeBastonLineKind, setNodeBastonLineToFace, setNodeToFace,
    addSpan, removeSpan,
  } = useDataMutations(setDev, appCfg, defaultPref);

  useEffect(() => { safeSetLocalStorage(DEFAULT_PREF_KEY, defaultPref); }, [defaultPref]);
  useEffect(() => { detailViewportRef.current = detailViewport; }, [detailViewport]);
  useEffect(() => { tabRef.current = tab; }, [tab]);
  useEffect(() => { setEditorOpen(false); }, [tab]);
  useEffect(() => { setDev((prev) => normalizeDev(prev, appCfg)); }, [appCfg]);

  useEffect(() => {
    if (steelLayoutDraftDirtyRef.current) return;
    try { setSteelLayoutDraft(toJson(getSteelLayoutSettings(dev))); } catch { /* ignore */ }
  }, [(dev as any).steel_layout_settings]);

  const payloadInfo = useMemo(() => {
    const payload = toBackendPayload(dev);
    return { payload, error: null as string | null, warning: null as string | null };
  }, [dev]);
  const payload = payloadInfo.payload;

  const previewPayloadInfo = useMemo(() => {
    const payload = toPreviewPayload(dev);
    return { payload, key: JSON.stringify(payload) };
  }, [dev]);

  const {
    handleSaveManual, clearDevelopment, onExportDxf,
    onUploadTemplate, onClearTemplate, onImportDxfFile, applyJsonToForm,
  } = useApiActions({
    dev, setDev, appCfg, setAppCfg,
    payload, savedCuts, cascoLayer, steelLayer, drawSteel, defaultPref,
    quantityDisplay, sectionXU, recubrimientoM: appCfg.recubrimiento,
    setBusy, setError, setWarning,
    setTemplateName, setTemplateLayers, setCascoLayer, setSteelLayer,
    jsonText, setSaveStatus, setSelection, setDetailViewport, setConcretoLocked,
  });

  const {
    applyBasicoPreference, applyBasicoBastonesPreference,
    applyPersonalizadoPreference, onChangeDefaultPref,
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
    pan2dRef, applySelection, moveZoomSelection,
    onCanvasWheel, onCanvasPointerDown, onCanvasPointerMove, onCanvasPointerUp,
    onCanvasClick, onOverviewCanvasClick,
  } = useCanvasInteractions({
    preview, dev, selection, setSelection,
    detailViewport, detailViewportRef, setDetailViewport,
    zoomEnabled, previewView, steelViewActive, steelYScale2,
  });

  const { focusGridCell, onGridKeyDown } = useGridNavigation();

  useEffect(() => { if (tabRef.current === 'json') return; setJsonText(toJson(payload)); }, [payload]);

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
    selectedBastonDetailTags,
    selectedBastonDetailSpans,
    quantityDisplay,
    quantityCutsXU: [sectionXU, ...savedCuts.map((c) => c.xU)],
    selection, tab, steelViewPinned, sectionXU,
  });

  useOverviewCanvas({
    overviewCanvasRef, preview, dev, selection, previewPayloadInfo,
    showNT, steelViewActive, sectionXU,
    recubrimiento: appCfg.recubrimiento,
    quantityDisplay,
    quantityCutsXU: [sectionXU, ...savedCuts.map((c) => c.xU)],
    tab, steelViewPinned,
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setBusy(true); setError(null); setWarning(null);
      try {
        const data = await fetchPreview(previewPayloadInfo.payload);
        if (cancelled) return;
        setPreview(data);
      } catch (e: any) {
        if (cancelled) return;
        setError(e?.message ?? String(e));
        setPreview(null);
      } finally { if (!cancelled) setBusy(false); }
    })();
    return () => { cancelled = true; };
  }, [previewPayloadInfo.key]);

  const { sectionXRangeU, sectionInfo, defaultCutAXU } = useSectionCanvas({
    dev, appCfg, sectionCanvasRef, sectionXU, setSectionXU, setSavedCuts, backendCfg,
  });

  const { threeHostRef, threeRef, threeOverviewHostRef, threeOverviewRef } = useThreeScene({
    previewView, preview, dev, appCfg,
    selection, threeOpacity, zoomEnabled,
    showLongitudinal, showStirrups, hookLegM, threeProjection,
  });

  useEffect(() => { if (zoomEnabled) return; setDetailViewport(null); setSelection({ kind: 'none' }); setSelectedBastonDetailTags(null); setSelectedBastonDetailSpans(null); }, [zoomEnabled]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (detailViewport) { setDetailViewport(null); e.preventDefault(); return; }
      if (selection.kind !== 'none') { setSelection({ kind: 'none' }); setSelectedBastonDetailTags(null); setSelectedBastonDetailSpans(null); e.preventDefault(); }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [detailViewport, selection.kind]);

  // ── Render ────────────────────────────────────────────────
  if (!dev || !appCfg) {
    return (
      <div style={{ color: '#fff', background: '#0b1220', height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>
        Error: Datos principales no cargados. Revisa la inicializacion de la app o el backend.
      </div>
    );
  }

  const detailOverlay = previewView === '2d' && steelOverlayLayer ? (
    <SteelOverlay
      dev={dev} preview={preview}
      renderBounds={(detailViewport ?? (preview?.bounds as Bounds | undefined)) ?? null}
      canvasRef={canvasRef} layer={steelOverlayLayer}
      yScale={steelViewActive && steelYScale2 ? 2 : 1}
      onUpdateSpanSteel={updateSpanSteel} onUpdateNode={updateNode}
      onUpdateBaston={updateBaston} onUpdateStirrups={updateSpanStirrups}
      onUpdateStirrupsSection={updateSpanStirrupsSection}
    />
  ) : undefined;

  return (
    <AppLayout
      header={
        <HeaderBar
          devName={dev.name}
          saveStatus={saveStatus}
          steelOverlayLayer={steelOverlayLayer}
          setSteelOverlayLayer={setSteelOverlayLayer}
          onExportDxf={onExportDxf}
          busy={busy}
        />
      }
      left={
        <LeftPanel
          tab={tab} setTab={setTab}
          editorOpen={editorOpen} setEditorOpen={setEditorOpen}
          defaultPref={defaultPref} onChangeDefaultPref={onChangeDefaultPref}
          configTabProps={{
            defaultPref, onChangeDefaultPref,
            slabProjOffsetDraft, setSlabProjOffsetDraft,
            slabProjLayerDraft, setSlabProjLayerDraft,
            templateName, templateLayers: templateLayers ?? [],
            onUploadTemplate, onClearTemplate, busy,
            cascoLayer, setCascoLayer, steelLayer, setSteelLayer,
            drawSteel, setDrawSteel, appCfg, setAppCfg, clampNumber,
            hookLegDraft, setHookLegDraft,
            steelTextLayerDraft, setSteelTextLayerDraft,
            steelTextStyleDraft, setSteelTextStyleDraft,
            steelTextHeightDraft, setSteelTextHeightDraft,
            steelTextWidthDraft, setSteelTextWidthDraft,
            steelTextObliqueDraft, setSteelTextObliqueDraft,
            steelTextRotationDraft, setSteelTextRotationDraft,
          }}
          concreteTabProps={{
            dev, selection, spansCols, nodesCols, busy, concretoLocked,
            showNT, setConcretoLocked, setShowNT,
            clearDevelopment, onImportDxfFile, onSave: handleSaveManual,
            addSpan, removeSpan, updateDevPatch, updateSpan, updateNode,
            applySelection, onGridKeyDown, formatOrdinalEs,
            clampInt, clampNumber, fmt2,
          }}
          steelTabProps={{
            dev, appCfg, defaultPref, steelLayoutDraft, setSteelLayoutDraft,
            steelLayoutDraftDirtyRef, warning, setWarning,
            updateDevPatch, bastonLenEdits, setBastonLenEdits,
            stirrupsAbcrEdits, setStirrupsAbcrEdits,
            updateSpanSteel, updateSpanStirrupsSection, updateSpanStirrups,
            updateBaston, nodeSteelKind, setNodeSteelKind,
            nodeToFaceEnabled, setNodeToFace, buildNodeSlots,
            nodeBastonLineKind, setNodeBastonLineKind,
            nodeBastonLineToFaceEnabled, setNodeBastonLineToFace,
            normalizeBastonCfg, snapBastonM,
            parseStirrupsABCR, formatStirrupsABCR, pickDefaultABCRForH,
            normalizeDiaKey, safeParseJson, getSteelLayoutSettings,
            clampNumber, fmt2,
          }}
          metradoTabProps={{
            dev,
            recubrimiento: appCfg.recubrimiento,
            quantityDisplay,
            setQuantityDisplay,
            onSelectBastonDetalleSpan: (spanIdx, tagsTxt, spansTxt) => {
              setSelectedBastonDetailTags(tagsTxt ? tagsTxt.split('|').map((s) => s.trim()).filter(Boolean) : null);
              setSelectedBastonDetailSpans(
                spansTxt
                  ? Array.from(spansTxt.matchAll(/T(\d+)/g)).map((m) => Number(m[1]) - 1).filter((n) => Number.isInteger(n) && n >= 0)
                  : null
              );
              setSelection({ kind: 'span', index: spanIdx });
            },
          }}
          jsonTabProps={{ jsonText, setJsonText, onApply: applyJsonToForm }}
        />
      }
      right={
        <RightPanel
          previewPanelProps={{
            preview, previewView, setPreviewView,
            threeProjection, setThreeProjection, dev,
            overviewCanvasRef, canvasRef, sectionCanvasRef, threeHostRef,
            onOverviewCanvasClick, onCanvasWheel,
            onCanvasPointerDown, onCanvasPointerMove, onCanvasPointerUp,
            onCanvasClick, moveZoomSelection, setDetailViewport,
            showLongitudinal, setShowLongitudinal,
            showStirrups, setShowStirrups,
            quantityDisplay, setQuantityDisplay,
            steelViewActive, steelYScale2, setSteelYScale2,
            threeOpacity, setThreeOpacity,
            savedCuts, setSavedCuts, sectionXU, setSectionXU,
            sectionXRangeU, sectionInfo, defaultCutAXU,
            mToUnits, spanIndexAtX, indexToLetters,
          }}
          detailOverlay={detailOverlay}
        />
      }
      statusBar={
        <StatusBar busy={busy} warning={warning} error={error} saveStatus={saveStatus} />
      }
    />
  );
}
