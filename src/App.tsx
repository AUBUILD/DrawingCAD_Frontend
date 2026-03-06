import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { assignProject, deleteProject, deleteAllProjects, fetchBackendVersion, fetchPreview, fetchUsers, fetchVariants, loginAuth, onAuthExpired, setAuthToken as setApiAuthToken, type UserWithAssignment, type VariantListItem, type VariantScope } from './api';
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

import { StatusBar } from './layouts';
import { RightPanel } from './panels/RightPanel';
import { SteelOverlay, type SteelOverlayLayer } from './overlay';
import { Button, Card, CardContent, CardHeader, CardTitle, Input, Label } from '@/components/ui';
import { TopNavbar } from './components/layout/TopNavbar';
import { LeftSidebar } from './components/layout/LeftSidebar';
import type { EditorTabProps } from './components/DrawBeamPanel';

type Tab = 'config' | 'proyecto' | 'concreto' | 'acero' | 'metrado' | 'json';
type PreviewView = '2d' | '3d';
type ThreeProjection = 'perspective' | 'orthographic';
type WorkspaceView = 'launcher' | 'editor';

type ProjectSummary = {
  project_name: string;
  variant_count: number;
  latest: VariantListItem | null;
  source?: 'backend' | 'local';
};

const DEFAULT_PREF_KEY = 'beamdraw:defaultPref';
const AUTH_TOKEN_KEY = 'beamdraw:authToken';
const AUTH_EMAIL_KEY = 'beamdraw:authEmail';
const VARIANT_SCOPE_KEY = 'beamdraw:variantScope';
const PROJECT_CATALOG_KEY = 'beamdraw:projectCatalog';
const SIDEBAR_OPEN_KEY = 'drawbeam_sidebar_open';
const SIDEBAR_WIDTH_KEY = 'drawbeam_sidebar_width';
const SIDEBAR_MIN_WIDTH = 260;
const SIDEBAR_MAX_WIDTH = 520;
const DEFAULT_LOGIN_EMAIL = 'usuario1@aubuild.ai';
const DEFAULT_LOGIN_PASSWORD = '';
const DEFAULT_VARIANT_SCOPE: VariantScope = {
  project_name: 'Proyecto X',
  story_i: 'Story i',
  story_f: 'Story f',
  beam_code: 'VT-01',
  beam_type: 'convencional',
  variant_name: 'Variante0001',
};
const INITIAL_AUTH_EMAIL = safeGetLocalStorage(AUTH_EMAIL_KEY) ?? DEFAULT_LOGIN_EMAIL;

function normalizeStorageEmail(email: string): string {
  return (email || '').trim().toLowerCase();
}

function projectCatalogKeyFor(email: string): string {
  return `${PROJECT_CATALOG_KEY}:${normalizeStorageEmail(email)}`;
}

function variantScopeKeyFor(email: string): string {
  return `${VARIANT_SCOPE_KEY}:${normalizeStorageEmail(email)}`;
}

function beamsStorageKeyFor(email: string, projectName: string): string {
  const who = normalizeStorageEmail(email) || 'anon';
  const project = (projectName || '').trim().toLowerCase() || 'default';
  return `drawbeam_entities:${who}:${project}`;
}

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
    member_type: src.member_type,
    floor_start: src.floor_start,
    floor_end: src.floor_end,
    level_type: src.level_type,
    beam_no: src.beam_no,
    d: src.d,
    unit_scale: src.unit_scale,
    recubrimiento: src.recubrimiento,
  };
}

function summarizeProjects(items: VariantListItem[]): ProjectSummary[] {
  const byProject = new Map<string, { count: number; latest: VariantListItem | null }>();
  for (const item of items) {
    const key = item.project_name?.trim() || 'Proyecto sin nombre';
    const prev = byProject.get(key);
    if (!prev) {
      byProject.set(key, { count: 1, latest: item });
      continue;
    }
    prev.count += 1;
    if (!prev.latest || (item.updated_at ?? '') > (prev.latest.updated_at ?? '')) {
      prev.latest = item;
    }
  }
  return Array.from(byProject.entries())
    .map(([project_name, info]) => ({
      project_name,
      variant_count: info.count,
      latest: info.latest,
    }))
    .sort((a, b) => (b.latest?.updated_at ?? '').localeCompare(a.latest?.updated_at ?? ''));
}

function readLocalProjectCatalog(email: string): string[] {
  const raw = safeGetLocalStorage(projectCatalogKeyFor(email));
  if (!raw) return [];
  const parsed = safeParseJson<string[]>(raw);
  if (!parsed.ok || !Array.isArray(parsed.value)) return [];
  return parsed.value.map((s) => String(s ?? '').trim()).filter(Boolean);
}

function readVariantScope(email: string): VariantScope {
  const raw = safeGetLocalStorage(variantScopeKeyFor(email));
  if (raw) {
    const parsed = safeParseJson<VariantScope>(raw);
    if (parsed.ok && parsed.value) return parsed.value;
  }
  return DEFAULT_VARIANT_SCOPE;
}

export default function App() {
  // ── UI state ──────────────────────────────────────────────
  const [tab, setTab] = useState<Tab>('proyecto');
  const [sideOpen, setSideOpen] = useState<boolean>(() => safeGetLocalStorage(SIDEBAR_OPEN_KEY) !== 'false');
  const [sidebarWidth, setSidebarWidth] = useState<number>(() => {
    const raw = safeGetLocalStorage(SIDEBAR_WIDTH_KEY);
    const n = raw ? Number(raw) : NaN;
    if (!Number.isFinite(n)) return 320;
    return Math.max(SIDEBAR_MIN_WIDTH, Math.min(SIDEBAR_MAX_WIDTH, Math.round(n)));
  });
  const [sidebarResizing, setSidebarResizing] = useState(false);
  const sidebarResizeRef = useRef<{ startX: number; startW: number } | null>(null);
  const [previewView, setPreviewView] = useState<PreviewView>('2d');
  const [showLongitudinal, setShowLongitudinal] = useState(true);
  const [showBastones, setShowBastones] = useState(true);
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
  const [steelOverlayLayer, setSteelOverlayLayer] = useState<SteelOverlayLayer | null>(() => {
    const saved = safeGetLocalStorage('beamdraw:steelOverlayLayer');
    if (saved === 'acero' || saved === 'bastones' || saved === 'estribos') return saved;
    return null;
  });
  const [exportMode, setExportMode] = useState<ExportMode>('single');

  useEffect(() => { safeSetLocalStorage('beamdraw:steelOverlayLayer', steelOverlayLayer ?? ''); }, [steelOverlayLayer]);
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
  const [authToken, setAuthToken] = useState<string | null>(() => safeGetLocalStorage(AUTH_TOKEN_KEY));
  const [authEmail, setAuthEmail] = useState<string>(INITIAL_AUTH_EMAIL);
  const [authPassword, setAuthPassword] = useState<string>(DEFAULT_LOGIN_PASSWORD);
  const [variantScope, setVariantScope] = useState<VariantScope>(() => readVariantScope(INITIAL_AUTH_EMAIL));
  const [workspaceView, setWorkspaceView] = useState<WorkspaceView>('launcher');
  const [projectDraftName, setProjectDraftName] = useState<string>('');
  const [projectItems, setProjectItems] = useState<VariantListItem[]>([]);
  const [localProjectCatalog, setLocalProjectCatalog] = useState<string[]>(() => readLocalProjectCatalog(INITIAL_AUTH_EMAIL));
  const [projectsBusy, setProjectsBusy] = useState(false);
  const [projectsError, setProjectsError] = useState<string | null>(null);
  const [remotePersistenceEnabled, setRemotePersistenceEnabled] = useState(true);
  const [assignModalProject, setAssignModalProject] = useState<string | null>(null);
  const [assignableUsers, setAssignableUsers] = useState<UserWithAssignment[]>([]);

  useEffect(() => {
    setApiAuthToken(authToken);
    if (authToken) safeSetLocalStorage(AUTH_TOKEN_KEY, authToken);
  }, [authToken]);
  useEffect(() => {
    onAuthExpired(() => {
      setAuthToken(null);
      safeSetLocalStorage(AUTH_TOKEN_KEY, '');
    });
    return () => onAuthExpired(null);
  }, []);
  useEffect(() => { safeSetLocalStorage(AUTH_EMAIL_KEY, authEmail); }, [authEmail]);
  useEffect(() => { safeSetLocalStorage(variantScopeKeyFor(authEmail), JSON.stringify(variantScope)); }, [authEmail, variantScope]);
  useEffect(() => { safeSetLocalStorage(projectCatalogKeyFor(authEmail), JSON.stringify(localProjectCatalog)); }, [authEmail, localProjectCatalog]);
  useEffect(() => { safeSetLocalStorage(SIDEBAR_OPEN_KEY, String(sideOpen)); }, [sideOpen]);
  useEffect(() => { safeSetLocalStorage(SIDEBAR_WIDTH_KEY, String(sidebarWidth)); }, [sidebarWidth]);
  useEffect(() => {
    if (!sidebarResizing) return;
    const onMove = (e: MouseEvent) => {
      const state = sidebarResizeRef.current;
      if (!state) return;
      const next = state.startW + (e.clientX - state.startX);
      setSidebarWidth(Math.max(SIDEBAR_MIN_WIDTH, Math.min(SIDEBAR_MAX_WIDTH, Math.round(next))));
    };
    const onUp = () => {
      setSidebarResizing(false);
      sidebarResizeRef.current = null;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [sidebarResizing]);
  const onSidebarResizeStart = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!sideOpen) return;
    sidebarResizeRef.current = { startX: e.clientX, startW: sidebarWidth };
    setSidebarResizing(true);
  }, [sideOpen, sidebarWidth]);

  useEffect(() => {
    if (!authToken) return;
    setLocalProjectCatalog(readLocalProjectCatalog(authEmail));
    setVariantScope(readVariantScope(authEmail));
  }, [authToken, authEmail]);

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
  const [devTitleYOffsetDraft, setDevTitleYOffsetDraft] = useState<string>('0.40');
  const [devSectionTextRowStepDraft, setDevSectionTextRowStepDraft] = useState<string>('0.16');
  const [steelLabelOffsetDraft, setSteelLabelOffsetDraft] = useState<string>('0.15');

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
  const effectiveAuthToken = remotePersistenceEnabled ? authToken : null;

  const previewPayloadInfo = useMemo(() => {
    const payload = toPreviewPayload(dev);
    return { payload, key: JSON.stringify(payload) };
  }, [dev]);
  const projectSummaries = useMemo(() => {
    const fromBackend = summarizeProjects(projectItems).map((p) => ({ ...p, source: 'backend' as const }));
    const known = new Set(fromBackend.map((p) => p.project_name.trim().toLowerCase()));
    const localOnly: ProjectSummary[] = localProjectCatalog
      .map((name) => name.trim())
      .filter((name) => name && !known.has(name.toLowerCase()))
      .map((project_name) => ({ project_name, variant_count: 0, latest: null, source: 'local' as const }));
    return [...fromBackend, ...localOnly];
  }, [projectItems, localProjectCatalog]);
  const beamsStorageKey = useMemo(
    () => beamsStorageKeyFor(authEmail, variantScope.project_name),
    [authEmail, variantScope.project_name],
  );

  const {
    handleSaveManual, clearDevelopment, onExportDxf, onExportMetrado,
    onUploadTemplate, onClearTemplate, onImportDxfFile, onImportDxfBatchFile, applyJsonToForm,
  } = useApiActions({
    dev, developments, exportMode, setExportMode, setDev, setDevelopments, setActiveDevIdx, appCfg, setAppCfg,
    payload, savedCuts, cascoLayer, steelLayer, drawSteel, defaultPref,
    quantityDisplay, sectionXU, recubrimientoM: appCfg.recubrimiento,
    setBusy, setError, setWarning,
    setTemplateName, setTemplateLayers, setCascoLayer, setSteelLayer,
    jsonText, setSaveStatus, setSelection, setDetailViewport, setConcretoLocked, batchImportOrder,
    authToken: effectiveAuthToken, variantScope,
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
    authToken: effectiveAuthToken, variantScope,
  });

  const resetEditorForNewProject = useCallback(() => {
    setDevelopments([defaultDevelopment(appCfg)]);
    setActiveDevIdx(0);
    setSelection({ kind: 'none' });
    setDetailViewport(null);
    setSelectedBastonDetailTags(null);
    setSelectedBastonDetailSpans(null);
    setTab('proyecto');
  }, [appCfg]);

  const refreshProjects = useCallback(async () => {
    if (!authToken) {
      setProjectItems([]);
      setProjectsError(null);
      return;
    }
    setProjectsBusy(true);
    setProjectsError(null);
    try {
      const items = await fetchVariants(undefined, authToken);
      setProjectItems(items);
      setRemotePersistenceEnabled(true);
    } catch (e: any) {
      setProjectsError('No se pudo conectar a la base de datos. Puedes crear y abrir proyectos en modo local.');
      setProjectItems([]);
      setRemotePersistenceEnabled(false);
    } finally {
      setProjectsBusy(false);
    }
  }, [authToken]);

  const onOpenProject = useCallback((projectName: string, latest?: VariantListItem | null) => {
    const safeName = projectName.trim();
    if (!safeName) return;
    setLocalProjectCatalog((prev) => (prev.some((p) => p.toLowerCase() === safeName.toLowerCase()) ? prev : [...prev, safeName]));
    const nextScope: VariantScope = {
      project_name: safeName,
      story_i: latest?.story_i ?? 'Story i',
      story_f: latest?.story_f ?? 'Story f',
      beam_code: latest?.beam_code ?? 'VT-01',
      beam_type: latest?.beam_type ?? 'convencional',
      variant_name: latest?.variant_name ?? 'Variante0001',
    };
    setVariantScope(nextScope);
    setWorkspaceView('editor');
    setTab('proyecto');
    if (!latest) resetEditorForNewProject();
  }, [resetEditorForNewProject]);

  const onCreateProject = useCallback(() => {
    const name = projectDraftName.trim();
    if (!name) return;
    onOpenProject(name, null);
    setProjectDraftName('');
  }, [projectDraftName, onOpenProject]);

  const onDeleteProject = useCallback(async (projectName: string) => {
    const safeName = projectName.trim();
    if (!safeName) return;
    const ok = window.confirm(`Se eliminara el proyecto "${safeName}". Esta accion no se puede deshacer.\n\nDeseas continuar?`);
    if (!ok) return;

    const password = window.prompt('Confirma tu contrasena para eliminar este proyecto:') ?? '';
    if (!password) return;

    try {
      setBusy(true);
      setError(null);
      if (remotePersistenceEnabled && authToken) {
        try {
          await deleteProject(safeName, password, authToken);
        } catch (e: any) {
          const msg = String(e?.message ?? '');
          // Si no existe remoto para este usuario, igual permitir limpieza local.
          if (!msg.includes('404')) {
            throw e;
          }
        }
      }
      setLocalProjectCatalog((prev) => prev.filter((p) => p.trim().toLowerCase() !== safeName.toLowerCase()));
      try {
        const key = beamsStorageKeyFor(authEmail, safeName);
        window.localStorage.removeItem(key);
      } catch {
        // ignore storage cleanup errors
      }
      if (variantScope.project_name.trim().toLowerCase() === safeName.toLowerCase()) {
        setVariantScope(DEFAULT_VARIANT_SCOPE);
        resetEditorForNewProject();
        setWorkspaceView('launcher');
      }
      await refreshProjects();
    } catch (e: any) {
      setError(e?.message ?? 'No se pudo eliminar el proyecto');
    } finally {
      setBusy(false);
    }
  }, [authEmail, authToken, remotePersistenceEnabled, refreshProjects, resetEditorForNewProject, variantScope.project_name]);

  const onAssignProjectOpen = useCallback(async (projectName: string) => {
    const safeName = projectName.trim();
    if (!safeName || !authToken) return;
    try {
      const users = await fetchUsers(authToken, safeName);
      setAssignableUsers(users);
      setAssignModalProject(safeName);
    } catch (e: any) {
      setError(e?.message ?? 'No se pudo obtener la lista de usuarios');
    }
  }, [authToken]);

  const onToggleAssignment = useCallback(async (email: string, currentlyAssigned: boolean) => {
    if (!assignModalProject || !authToken) return;
    if (currentlyAssigned) {
      // Por ahora no hay unassign endpoint — solo se puede asignar
      return;
    }
    try {
      setBusy(true);
      setError(null);
      await assignProject(assignModalProject, email, authToken);
      setAssignableUsers((prev) =>
        prev.map((u) => u.email === email ? { ...u, assigned: true } : u),
      );
      await refreshProjects();
    } catch (e: any) {
      setError(e?.message ?? 'No se pudo asignar el proyecto');
    } finally {
      setBusy(false);
    }
  }, [authToken, assignModalProject, refreshProjects]);

  const onDeleteAllProjects = useCallback(async () => {
    const ok = window.confirm('Se eliminaran TODOS tus proyectos. Esta accion no se puede deshacer.\n\nDeseas continuar?');
    if (!ok) return;
    const password = window.prompt('Confirma tu contrasena para eliminar todos los proyectos:') ?? '';
    if (!password) return;
    try {
      setBusy(true);
      setError(null);
      if (remotePersistenceEnabled && authToken) {
        await deleteAllProjects(password, authToken);
      }
      setLocalProjectCatalog([]);
      setVariantScope(DEFAULT_VARIANT_SCOPE);
      resetEditorForNewProject();
      setWorkspaceView('launcher');
      await refreshProjects();
    } catch (e: any) {
      setError(e?.message ?? 'No se pudieron eliminar los proyectos');
    } finally {
      setBusy(false);
    }
  }, [authToken, remotePersistenceEnabled, refreshProjects, resetEditorForNewProject]);

  const onLogin = useCallback(async () => {
    try {
      setBusy(true);
      setError(null);
      const out = await loginAuth(authEmail, authPassword);
      setAuthToken(out.access_token);
      setAuthEmail(out.user.email);
      setAuthPassword('');
      setWorkspaceView('launcher');
    } catch (e: any) {
      setError(e?.message ?? 'Error de login');
    } finally {
      setBusy(false);
    }
  }, [authEmail, authPassword]);

  const onLogout = useCallback(() => {
    setAuthToken(null);
    setApiAuthToken('');
    setAuthPassword(DEFAULT_LOGIN_PASSWORD);
    setWorkspaceView('launcher');
    setProjectItems([]);
    setProjectsError(null);
    setRemotePersistenceEnabled(true);
    safeSetLocalStorage(AUTH_TOKEN_KEY, '');
  }, []);

  useEffect(() => {
    if (!authToken) return;
    void refreshProjects();
  }, [authToken, refreshProjects]);

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
    devTitleYOffsetDraft, setDevTitleYOffsetDraft,
    devSectionTextRowStepDraft, setDevSectionTextRowStepDraft,
    steelLabelOffsetDraft, setSteelLabelOffsetDraft,
  });

  useDetailCanvas({
    canvasRef, preview, detailViewport, dev, previewPayloadInfo,
    showNT, steelViewActive, steelYScale2, showLongitudinal, showBastones, showStirrups,
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
    if (workspaceView === 'launcher') return;
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
  }, [previewPayloadInfo.key, workspaceView]);

  const { sectionXRangeU, sectionInfo, defaultCutAXU } = useSectionCanvas({
    dev, appCfg, sectionCanvasRef, sectionXU, setSectionXU, setSavedCuts, backendCfg,
  });

  const { threeHostRef, threeRef, threeOverviewHostRef, threeOverviewRef } = useThreeScene({
    previewView, preview, dev, appCfg,
    selection, threeOpacity, zoomEnabled,
    showLongitudinal, showBastones, showStirrups, hookLegM, threeProjection,
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

  /** When a beam group is selected in DrawBeamPanel, load its stored development into the editor. */
  const onGroupDevelopmentLoad = useCallback((groupDev: DevelopmentIn | undefined) => {
    if (groupDev) {
      setDevelopments((prev) => {
        const copy = [...prev];
        copy[activeDevIdx] = groupDev;
        return copy;
      });
    }
  }, [activeDevIdx]);

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
  if (!authToken) {
    return (
      <div className="layout" style={{ alignItems: 'center', justifyContent: 'center', padding: 20 }}>
        <Card className="panel" style={{ width: 420, maxWidth: '95vw' }}>
          <CardHeader style={{ paddingBottom: 0 }}>
            <CardTitle className="panelTitle">Iniciar Sesion</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="form">
              <div className="field">
                <Label className="label">Correo</Label>
                <Input className="input" value={authEmail} onChange={(e) => setAuthEmail(e.target.value)} />
              </div>
              <div className="field">
                <Label className="label">Contrasena</Label>
                <Input
                  className="input"
                  type="password"
                  value={authPassword}
                  onChange={(e) => setAuthPassword(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') void onLogin(); }}
                />
              </div>
              <div className="actionButtons">
                <Button className="btn" type="button" onClick={onLogin} disabled={busy}>Ingresar</Button>
              </div>
            </div>
            {error && <div className="error">{error}</div>}
          </CardContent>
        </Card>
      </div>
    );
  }

  if (workspaceView === 'launcher') {
    return (
      <div className="layout" style={{ alignItems: 'center', justifyContent: 'center', padding: 20 }}>
        <Card className="panel" style={{ width: 920, maxWidth: '96vw' }}>
          <CardHeader style={{ paddingBottom: 0 }}>
            <CardTitle className="panelTitle">Gestion de Proyectos</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="form">
            <div className="rowBetween" style={{ alignItems: 'flex-end' }}>
              <label className="field" style={{ flex: 1 }}>
                <Label className="label">Nuevo proyecto</Label>
                <Input
                  className="input"
                  placeholder="Ejemplo: Proyecto Torre A"
                  value={projectDraftName}
                  onChange={(e) => setProjectDraftName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') onCreateProject(); }}
                />
              </label>
              <div className="actionButtons">
                <Button className="btn" type="button" onClick={onCreateProject} disabled={!projectDraftName.trim()}>Crear</Button>
                <Button className="btn btnSecondary" variant="outline" type="button" onClick={onLogout}>Cerrar sesion</Button>
              </div>
            </div>

            {projectsError ? <div className="error">{projectsError}</div> : null}

            <div className="sectionHeader">
              <div>Proyectos existentes</div>
              <div className="mutedSmall">{projectsBusy ? 'Cargando...' : `${projectSummaries.length} proyecto(s)`}</div>
            </div>

            {!projectSummaries.length && !projectsBusy ? (
              <div className="hint">No hay proyectos guardados aun. Crea uno nuevo para empezar.</div>
            ) : null}

            <div className="projectCardsGrid">
              {projectSummaries.map((p) => (
                <div
                  key={p.project_name}
                  className="panel projectCard"
                  style={{ padding: 12 }}
                  onClick={() => onOpenProject(p.project_name, p.latest)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onOpenProject(p.project_name, p.latest); }}
                >
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                    <button
                      type="button"
                      title="Asignar proyecto"
                      onClick={(e) => {
                        e.stopPropagation();
                        void onAssignProjectOpen(p.project_name);
                      }}
                      style={{
                        height: 22,
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderRadius: 6,
                        border: '1px solid rgba(24, 208, 184, 0.35)',
                        background: 'rgba(24, 208, 184, 0.08)',
                        color: '#7de7d9',
                        padding: '0 8px',
                        fontSize: 11,
                        fontWeight: 700,
                        boxShadow: 'none',
                      }}
                    >
                      Asignar
                    </button>
                    <button
                      type="button"
                      title="Eliminar proyecto"
                      onClick={(e) => {
                        e.stopPropagation();
                        void onDeleteProject(p.project_name);
                      }}
                      style={{
                        width: 22,
                        height: 22,
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderRadius: 6,
                        border: '1px solid rgba(255, 77, 106, 0.35)',
                        background: 'rgba(255, 77, 106, 0.10)',
                        color: '#ff8fa3',
                        padding: 0,
                        fontSize: 12,
                        fontWeight: 800,
                        boxShadow: 'none',
                      }}
                    >
                      X
                    </button>
                  </div>
                  <div className="panelTitle" style={{ marginBottom: 6 }}>{p.project_name}</div>
                  <div className="mutedSmall">Variantes: {p.variant_count}</div>
                  <div className="mutedSmall">Ultima: {p.latest?.beam_code ?? '-'} / {p.latest?.variant_name ?? '-'}</div>
                  {p.source === 'local' ? <div className="mutedSmall">Modo local (sin BD)</div> : null}
                </div>
              ))}
            </div>
            {projectSummaries.length > 0 ? (
              <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  onClick={() => void onDeleteAllProjects()}
                  disabled={busy}
                  style={{
                    height: 28,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: 6,
                    border: '1px solid rgba(255, 77, 106, 0.5)',
                    background: 'rgba(255, 77, 106, 0.12)',
                    color: '#ff8fa3',
                    padding: '0 14px',
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  Eliminar todos mis proyectos
                </button>
              </div>
            ) : null}
            </div>

            {/* Modal de asignacion */}
            {assignModalProject ? (
              <div
                style={{
                  position: 'fixed', inset: 0, zIndex: 9999,
                  background: 'rgba(0,0,0,0.55)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
                onClick={() => setAssignModalProject(null)}
              >
                <div
                  style={{
                    background: 'var(--color-bg-card, #1e2230)', borderRadius: 12,
                    padding: 24, minWidth: 320, maxWidth: 400,
                    border: '1px solid rgba(255,255,255,0.08)',
                    boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 16, color: '#e0e0e0' }}>
                    Asignar &quot;{assignModalProject}&quot;
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 18 }}>
                    {assignableUsers.map((u) => (
                      <label
                        key={u.id}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 10,
                          padding: '8px 10px', borderRadius: 6,
                          border: u.assigned
                            ? '1px solid rgba(24, 208, 184, 0.4)'
                            : '1px solid rgba(255,255,255,0.1)',
                          background: u.assigned
                            ? 'rgba(24, 208, 184, 0.08)'
                            : 'transparent',
                          cursor: u.assigned ? 'default' : 'pointer',
                          opacity: busy ? 0.6 : 1,
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={!!u.assigned}
                          disabled={!!u.assigned || busy}
                          onChange={() => void onToggleAssignment(u.email, !!u.assigned)}
                          style={{ accentColor: '#18d0b8' }}
                        />
                        <span style={{ fontSize: 13, color: u.assigned ? '#7de7d9' : '#ccc' }}>
                          {u.email}
                        </span>
                        {u.assigned ? (
                          <span style={{ fontSize: 10, color: '#7de7d9', marginLeft: 'auto', fontWeight: 600 }}>
                            Asignado
                          </span>
                        ) : null}
                      </label>
                    ))}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <button
                      type="button"
                      onClick={() => setAssignModalProject(null)}
                      style={{
                        height: 32, padding: '0 16px', borderRadius: 6,
                        border: '1px solid rgba(255,255,255,0.15)',
                        background: 'transparent', color: '#aaa',
                        fontSize: 12, fontWeight: 600, cursor: 'pointer',
                      }}
                    >
                      Cerrar
                    </button>
                  </div>
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!dev || !appCfg) {
    return (
      <div style={{ color: 'var(--color-text-primary)', background: 'var(--color-bg-page)', height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>
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

  const editorTabProps: EditorTabProps = {
    defaultPref,
    onChangeDefaultPref,
    configTabProps: {
      defaultPref, onChangeDefaultPref,
      slabProjOffsetDraft, setSlabProjOffsetDraft,
      slabProjLayerDraft, setSlabProjLayerDraft,
      devTitleYOffsetDraft, setDevTitleYOffsetDraft,
      devSectionTextRowStepDraft, setDevSectionTextRowStepDraft,
      steelLabelOffsetDraft, setSteelLabelOffsetDraft,
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
    },
    projectTabProps: {
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
      onVariantScopeChange: (patch) => setVariantScope((s) => ({ ...s, ...patch })),
      updateDevPatch,
      clampInt,
      formatOrdinalEs,
    },
    concreteTabProps: {
      dev, selection, spansCols, nodesCols, busy, concretoLocked,
      showNT, setConcretoLocked, setShowNT,
      clearDevelopment, onSave: handleSaveManual,
      addSpan, removeSpan, updateSpan, updateNode,
      applySelection, onGridKeyDown,
      clampNumber, fmt2,
    },
    steelTabProps: {
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
    },
    metradoTabProps: {
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
    },
    jsonTabProps: { jsonText, setJsonText, onApply: applyJsonToForm },
  };

  return (
    <div className="layout">
      <TopNavbar
        sideOpen={sideOpen}
        setSideOpen={setSideOpen}
        beamCode={variantScope.beam_code || dev.name}
        userEmail={authEmail}
        onOpenProjects={() => { void refreshProjects(); setWorkspaceView('launcher'); }}
        onLogout={onLogout}
      />
      <div className="aubBody">
        <LeftSidebar
          sideOpen={sideOpen}
          setSideOpen={setSideOpen}
          sidebarWidth={sidebarWidth}
          beamsStorageKey={beamsStorageKey}
          editorTabProps={editorTabProps}
          onExportDxf={onExportDxf}
          onExportMetrado={onExportMetrado}
          busy={busy}
          activeDevelopment={dev}
          onGroupDevelopmentLoad={onGroupDevelopmentLoad}
          onEditorTabChange={(t) => {
            const valid: Tab[] = ['config', 'concreto', 'acero', 'metrado', 'json'];
            if (valid.includes(t as Tab)) setTab(t as Tab);
          }}
          exportMode={exportMode}
          setExportMode={setExportMode}
          onImportDxfFile={onImportDxfFile}
          onImportDxfBatchFile={onImportDxfBatchFile}
          batchImportOrder={batchImportOrder}
          setBatchImportOrder={setBatchImportOrder}
        />
        {sideOpen ? (
          <div
            className={`aubSidebarDivider ${sidebarResizing ? 'isDragging' : ''}`}
            onMouseDown={onSidebarResizeStart}
            role="separator"
            aria-orientation="vertical"
            aria-label="Redimensionar panel lateral"
          />
        ) : null}
        <main className="aubMain">
          <RightPanel
            previewPanelProps={{
            preview, previewView, setPreviewView,
            threeProjection, setThreeProjection, dev,
            overviewCanvasRef, canvasRef, sectionCanvasRef, threeHostRef,
            onOverviewCanvasClick, onCanvasWheel,
            onCanvasPointerDown, onCanvasPointerMove, onCanvasPointerUp,
            onCanvasClick, moveZoomSelection, setDetailViewport,
            showLongitudinal, setShowLongitudinal,
            showBastones, setShowBastones,
            showStirrups, setShowStirrups,
            quantityDisplay, setQuantityDisplay,
            steelViewActive, steelYScale2, setSteelYScale2,
            threeOpacity, setThreeOpacity,
            savedCuts, setSavedCuts, sectionXU, setSectionXU,
            sectionXRangeU, sectionInfo, defaultCutAXU,
            mToUnits, spanIndexAtX, indexToLetters,
            steelOverlayLayer, setSteelOverlayLayer,
          }}
          detailOverlay={detailOverlay}
          />
        </main>
      </div>
      {
        <StatusBar
          busy={busy}
          warning={warning}
          error={error}
          saveStatus={saveStatus}
          backendVersion={backendVersion}
          frontendVersion={frontendVersion}
        />
      }
    </div>
  );
}
