import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fetchBackendVersion, fetchPreview } from './api';
import type { BackendAppConfig, BeamType, DevelopmentIn, ExportMode, PreviewResponse } from './types';
import { getSteelLayoutSettings } from './steelLayout';
import {
  mToUnits, spanIndexAtX, normalizeBastonCfg, normalizeDev,
  defaultDevelopment, toBackendPayload,
  toBackendPayloadMulti, toPreviewPayload, DEFAULT_APP_CFG,
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

/** Sync geometry-only fields from `src` into `twin`, preserving twin's steel config. */
function syncGeometryToTwin(src: DevelopmentIn, twin: DevelopmentIn): DevelopmentIn {
  // Map spans: copy geometry (L, h, b) from src, keep steel/bastones/stirrups from twin
  const spans = src.spans.map((s, i) => ({
    ...(twin.spans[i] ?? twin.spans[twin.spans.length - 1] ?? s),
    L: s.L, h: s.h, b: s.b,
  }));
  // Map nodes: copy geometry (a1, a2, b1, b2, projections) from src, keep steel from twin
  const nodes = src.nodes.map((n, i) => ({
    ...(twin.nodes[i] ?? twin.nodes[twin.nodes.length - 1] ?? n),
    a1: n.a1, a2: n.a2, b1: n.b1, b2: n.b2,
    project_a: n.project_a, project_b: n.project_b,
    support_type: n.support_type,
  }));
  return {
    ...twin,
    spans,
    nodes,
    crossbeams: src.crossbeams,
    floor_start: src.floor_start,
    floor_end: src.floor_end,
    level_type: src.level_type,
    beam_no: src.beam_no,
    d: src.d,
    unit_scale: src.unit_scale,
    recubrimiento: src.recubrimiento,
  };
}

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
  const [exportMode, setExportMode] = useState<ExportMode>('single');

  useEffect(() => { if (tab === 'acero') setSteelViewPinned(true); }, [tab]);

  // ── Domain state ──────────────────────────────────────────
  const [appCfg, setAppCfg] = useState<AppConfig>(DEFAULT_APP_CFG);
  const [developments, setDevelopments] = useState<DevelopmentIn[]>(() => [defaultDevelopment(DEFAULT_APP_CFG)]);
  const [activeDevIdx, setActiveDevIdx] = useState(0);

  // Derived dev + adapter setDev for existing hooks (they operate on the active development)
  const dev = developments[activeDevIdx] ?? developments[0] ?? defaultDevelopment(DEFAULT_APP_CFG);
  const setDev: React.Dispatch<React.SetStateAction<DevelopmentIn>> = useCallback(
    (action) => {
      setDevelopments((prev) => {
        const idx = Math.min(activeDevIdx, prev.length - 1);
        const current = prev[idx];
        const next = typeof action === 'function' ? action(current) : action;
        const copy = [...prev];
        copy[idx] = next;
        // Sync geometry to twin (if linked)
        const twinId = next.twin_id;
        if (twinId) {
          const twinIdx = copy.findIndex((d, i) => i !== idx && d.twin_id === twinId);
          if (twinIdx >= 0) {
            copy[twinIdx] = syncGeometryToTwin(next, copy[twinIdx]);
          }
        }
        return copy;
      });
    },
    [activeDevIdx],
  );

  const [jsonText, setJsonText] = useState(() => toJson(toBackendPayload(defaultDevelopment(DEFAULT_APP_CFG))));
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [backendVersion, setBackendVersion] = useState<string | null>(null);
  const [showNT, setShowNT] = useState(true);
  const [batchImportOrder, setBatchImportOrder] = useState<'name' | 'location'>('location');
  const [zoomEnabled, setZoomEnabled] = useState(true);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'error' | null>(null);
  const [concretoLocked, setConcretoLocked] = useState(false);
  const frontendVersion = ((import.meta as any).env?.VITE_APP_VERSION as string | undefined) ?? 'dev';

  useEffect(() => {
    let alive = true;
    fetchBackendVersion()
      .then((v) => {
        if (!alive) return;
        const be = `${v.backend_version ?? 'dev'} (${v.commit ?? 'unknown'})`;
        setBackendVersion(be);
      })
      .catch(() => {
        if (!alive) return;
        setBackendVersion('unknown');
      });
    return () => { alive = false; };
  }, []);

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
    const payload = toBackendPayloadMulti(developments);
    return { payload, error: null as string | null, warning: null as string | null };
  }, [developments]);
  const payload = payloadInfo.payload;

  const previewPayloadInfo = useMemo(() => {
    const payload = toPreviewPayload(dev);
    return { payload, key: JSON.stringify(payload) };
  }, [dev]);

  const {
    handleSaveManual, clearDevelopment, onExportDxf,
    onUploadTemplate, onClearTemplate, onImportDxfFile, onImportDxfBatchFile, applyJsonToForm,
  } = useApiActions({
    dev, developments, exportMode, setExportMode, setDev, setDevelopments, setActiveDevIdx, appCfg, setAppCfg,
    payload, savedCuts, cascoLayer, steelLayer, drawSteel, defaultPref,
    quantityDisplay, sectionXU, recubrimientoM: appCfg.recubrimiento,
    setBusy, setError, setWarning,
    setTemplateName, setTemplateLayers, setCascoLayer, setSteelLayer,
    jsonText, setSaveStatus, setSelection, setDetailViewport, setConcretoLocked, batchImportOrder,
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
    dev, setDev, setDevelopments, setActiveDevIdx, appCfg, setAppCfg,
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

  // ── Development selector handlers ────────────────────────
  const onSelectDev = useCallback((idx: number) => {
    if (idx >= 0 && idx < developments.length) {
      setActiveDevIdx(idx);
      setSelection({ kind: 'none' });
      setDetailViewport(null);
      setSelectedBastonDetailTags(null);
      setSelectedBastonDetailSpans(null);
    }
  }, [developments.length]);

  const onAddDev = useCallback(() => {
    const newDev = defaultDevelopment(appCfg);
    setDevelopments((prev) => [...prev, newDev]);
    setActiveDevIdx(developments.length);
    setSelection({ kind: 'none' });
    setDetailViewport(null);
  }, [appCfg, developments.length]);

  const onRemoveDev = useCallback((idx: number) => {
    if (developments.length <= 1) return;
    const removing = developments[idx];
    setDevelopments((prev) => {
      const copy = prev.filter((_, i) => i !== idx);
      // Unlink twin if removing a linked dev
      if (removing?.twin_id) {
        const twinIdx = copy.findIndex((d) => d.twin_id === removing.twin_id);
        if (twinIdx >= 0) copy[twinIdx] = { ...copy[twinIdx], twin_id: undefined };
      }
      return copy;
    });
    setActiveDevIdx((prev) => Math.min(prev, developments.length - 2));
    setSelection({ kind: 'none' });
    setDetailViewport(null);
  }, [developments]);

  // ── Twin beam handlers ──────────────────────────────────
  const onCreateTwin = useCallback((idx: number) => {
    const source = developments[idx];
    if (!source || source.twin_id) return; // already has a twin
    const twinId = crypto.randomUUID();
    // Clone geometry, reset steel to defaults
    const clone: DevelopmentIn = {
      ...defaultDevelopment(appCfg),
      // Copy geometry from source
      spans: source.spans.map((s) => ({
        ...defaultDevelopment(appCfg).spans[0],
        L: s.L, h: s.h, b: s.b,
      })),
      nodes: source.nodes.map((n) => ({
        ...defaultDevelopment(appCfg).nodes[0],
        a1: n.a1, a2: n.a2, b1: n.b1, b2: n.b2,
        project_a: n.project_a, project_b: n.project_b,
        support_type: n.support_type,
      })),
      crossbeams: source.crossbeams,
      name: (source.name ?? 'Desarrollo') + ' (Prefab)',
      floor_start: source.floor_start,
      floor_end: source.floor_end,
      level_type: source.level_type,
      beam_no: source.beam_no,
      d: source.d,
      unit_scale: source.unit_scale,
      recubrimiento: source.recubrimiento,
      beam_type: 'prefabricada' as BeamType,
      twin_id: twinId,
    };
    setDevelopments((prev) => {
      const copy = [...prev];
      // Mark original as convencional with twin_id
      copy[idx] = { ...copy[idx], beam_type: 'convencional', twin_id: twinId };
      // Insert clone right after the original
      copy.splice(idx + 1, 0, normalizeDev(clone, appCfg));
      return copy;
    });
    setActiveDevIdx(idx + 1);
    setSelection({ kind: 'none' });
    setDetailViewport(null);
  }, [developments, appCfg]);

  const onToggleTwin = useCallback(() => {
    const current = developments[activeDevIdx];
    if (!current?.twin_id) return;
    const twinIdx = developments.findIndex((d, i) => i !== activeDevIdx && d.twin_id === current.twin_id);
    if (twinIdx >= 0) {
      setActiveDevIdx(twinIdx);
      setSelection({ kind: 'none' });
      setDetailViewport(null);
    }
  }, [developments, activeDevIdx]);

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
          developments={developments}
          activeDevIdx={activeDevIdx}
          onSelectDev={onSelectDev}
          onAddDev={onAddDev}
          onRemoveDev={onRemoveDev}
          onCreateTwin={onCreateTwin}
          onToggleTwin={onToggleTwin}
          saveStatus={saveStatus}
          steelOverlayLayer={steelOverlayLayer}
          setSteelOverlayLayer={setSteelOverlayLayer}
          onExportDxf={onExportDxf}
          exportMode={exportMode}
          setExportMode={setExportMode}
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
            batchImportOrder, setBatchImportOrder,
            clearDevelopment, onImportDxfFile, onImportDxfBatchFile, onSave: handleSaveManual,
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
        <StatusBar
          busy={busy}
          warning={warning}
          error={error}
          saveStatus={saveStatus}
          backendVersion={backendVersion}
          frontendVersion={frontendVersion}
        />
      }
    />
  );
}
