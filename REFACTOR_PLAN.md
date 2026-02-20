# 🔧 PLAN DE REFACTORIZACIÓN - App.tsx

## 📊 Estado Actual
- **Líneas:** 7668
- **Estados:** 40+
- **Efectos:** 20+
- **Complejidad:** CRÍTICA
- **Mantenibilidad:** BAJA

## 🎯 Objetivo
Dividir App.tsx en componentes modulares, testeables y mantenibles.

---

## FASE 1: Hooks Personalizados (1-2 días)

### ✅ Tarea 1.1: Crear useDebounce
**Archivo:** `src/hooks/useDebounce.ts`
**Beneficio:** Elimina 3 bloques duplicados (~150 líneas)

```typescript
import { useEffect, useRef } from 'react';

export function useDebounce<T>(
  value: T,
  delay: number,
  onSave: (val: T) => Promise<void>
) {
  const seqRef = useRef(0);

  useEffect(() => {
    const seq = ++seqRef.current;
    const timer = window.setTimeout(async () => {
      try {
        await onSave(value);
        if (seqRef.current !== seq) return;
      } catch (e) {
        console.warn('Debounce save failed:', e);
      }
    }, delay);

    return () => window.clearTimeout(timer);
  }, [value, delay, onSave]);
}
```

**Uso en App.tsx:**
```typescript
// ANTES (50 líneas)
useEffect(() => {
  const seq = ++hookLegSaveSeqRef.current;
  const t = window.setTimeout(async () => {
    try {
      const v = parseFloat(hookLegDraft);
      if (!Number.isFinite(v) || v <= 0) return;
      const normalized = snap05m(v);
      if (!backendCfg) return;
      const nextCfg = await updateConfig({ hook_leg_m: normalized });
      if (hookLegSaveSeqRef.current !== seq) return;
      setBackendCfg(nextCfg);
    } catch (e) { console.warn(e); }
  }, 500);
  return () => window.clearTimeout(t);
}, [hookLegDraft, backendCfg]);

// DESPUÉS (1 línea)
useDebounce(hookLegDraft, 500, async (val) => {
  const v = parseFloat(val);
  if (!Number.isFinite(v) || v <= 0) return;
  const normalized = snap05m(v);
  if (!backendCfg) return;
  const nextCfg = await updateConfig({ hook_leg_m: normalized });
  setBackendCfg(nextCfg);
});
```

---

### ✅ Tarea 1.2: Crear useAutoSave
**Archivo:** `src/hooks/useAutoSave.ts`
**Beneficio:** Consolida lógica de guardado automático

```typescript
import { useEffect, useRef } from 'react';

export function useAutoSave<T>(
  data: T,
  onSave: (data: T) => Promise<void>,
  delay: number = 600
) {
  const timeoutRef = useRef<number | null>(null);

  useEffect(() => {
    if (timeoutRef.current) {
      window.clearTimeout(timeoutRef.current);
    }

    timeoutRef.current = window.setTimeout(async () => {
      try {
        await onSave(data);
      } catch (e) {
        console.warn('Auto-save failed:', e);
      }
    }, delay);

    return () => {
      if (timeoutRef.current) {
        window.clearTimeout(timeoutRef.current);
      }
    };
  }, [data, delay, onSave]);
}
```

---

### ✅ Tarea 1.3: Crear useCanvasRender
**Archivo:** `src/hooks/useCanvasRender.ts`
**Beneficio:** Abstrae RAF + ResizeObserver

```typescript
import { useEffect, useRef, RefObject } from 'react';

export function useCanvasRender(
  canvasRef: RefObject<HTMLCanvasElement>,
  drawFn: (canvas: HTMLCanvasElement) => void,
  deps: unknown[]
) {
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Cancel previous RAF
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
    }

    // Schedule draw
    rafRef.current = requestAnimationFrame(() => {
      drawFn(canvas);
      rafRef.current = null;
    });

    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, deps);
}
```

---

### ✅ Tarea 1.4: Crear useSelection
**Archivo:** `src/hooks/useSelection.ts`
**Beneficio:** Encapsula lógica de selección

```typescript
import { useState, useCallback } from 'react';

type Selection =
  | { kind: 'node'; index: number }
  | { kind: 'span'; index: number }
  | { kind: 'none' };

export function useSelection() {
  const [selection, setSelection] = useState<Selection>({ kind: 'none' });

  const moveSelection = useCallback((direction: -1 | 1, maxIndex: number) => {
    setSelection((prev) => {
      if (prev.kind === 'none') return { kind: 'span', index: 0 };

      const nextIndex = prev.index + direction;
      if (nextIndex < 0 || nextIndex > maxIndex) return prev;

      return { ...prev, index: nextIndex };
    });
  }, []);

  const clearSelection = useCallback(() => {
    setSelection({ kind: 'none' });
  }, []);

  return { selection, setSelection, moveSelection, clearSelection };
}
```

---

## FASE 2: Separar Tabs (3-4 días)

### ✅ Tarea 2.1: Extraer ConfigTab
**Archivo:** `src/components/ConfigTab/ConfigTab.tsx`
**Líneas movidas:** ~600
**Props necesarios:** 15-20

```typescript
import React from 'react';
import type { AppConfig, BackendAppConfig, DefaultPreferenceId } from '../../types';

interface ConfigTabProps {
  // Configuración
  appCfg: AppConfig;
  setAppCfg: (cfg: AppConfig | ((prev: AppConfig) => AppConfig)) => void;

  // Preferencias
  defaultPref: DefaultPreferenceId;
  onChangeDefaultPref: (pref: DefaultPreferenceId) => void;

  // Backend config
  backendCfg: BackendAppConfig | null;
  hookLegDraft: string;
  setHookLegDraft: (val: string) => void;

  // Template DXF
  templateName: string | null;
  templateLayers: string[];
  onUploadTemplate: (file: File) => Promise<void>;
  onClearTemplate: () => Promise<void>;

  // Export options
  cascoLayer: string;
  setCascoLayer: (layer: string) => void;
  steelLayer: string;
  setSteelLayer: (layer: string) => void;
  drawSteel: boolean;
  setDrawSteel: (val: boolean) => void;

  // Steel text config
  steelTextLayerDraft: string;
  setSteelTextLayerDraft: (val: string) => void;
  steelTextStyleDraft: string;
  setSteelTextStyleDraft: (val: string) => void;
  steelTextHeightDraft: string;
  setSteelTextHeightDraft: (val: string) => void;

  // Slab projection
  slabProjOffsetDraft: string;
  setSlabProjOffsetDraft: (val: string) => void;
  slabProjLayerDraft: string;
  setSlabProjLayerDraft: (val: string) => void;
}

export const ConfigTab: React.FC<ConfigTabProps> = ({
  appCfg,
  setAppCfg,
  defaultPref,
  onChangeDefaultPref,
  backendCfg,
  hookLegDraft,
  setHookLegDraft,
  templateName,
  templateLayers,
  onUploadTemplate,
  onClearTemplate,
  cascoLayer,
  setCascoLayer,
  steelLayer,
  setSteelLayer,
  drawSteel,
  setDrawSteel,
  steelTextLayerDraft,
  setSteelTextLayerDraft,
  steelTextStyleDraft,
  setSteelTextStyleDraft,
  steelTextHeightDraft,
  setSteelTextHeightDraft,
  slabProjOffsetDraft,
  setSlabProjOffsetDraft,
  slabProjLayerDraft,
  setSlabProjLayerDraft,
}) => {
  return (
    <div className="form">
      {/* Mover todo el JSX del tab 'config' aquí */}

      <div className="sectionHeader">
        <div>Preferencias</div>
      </div>

      {/* ... resto del contenido */}
    </div>
  );
};
```

---

### ✅ Tarea 2.2: Extraer ConcreteTab
**Archivo:** `src/components/ConcreteTab/ConcreteTab.tsx`
**Líneas movidas:** ~1200
**Beneficio:** Aísla lógica de geometría/tramos

```typescript
import React from 'react';
import type { DevelopmentIn, SpanIn, NodeIn, Selection } from '../../types';

interface ConcreteTabProps {
  dev: DevelopmentIn;
  updateSpan: (idx: number, patch: Partial<SpanIn>) => void;
  updateNode: (idx: number, patch: Partial<NodeIn>) => void;
  addSpan: () => void;
  removeSpan: (idx: number) => void;
  clearDevelopment: () => void;

  selection: Selection;
  applySelection: (sel: Selection, zoom?: boolean) => void;

  concretoLocked: boolean;
  setConcretoLocked: (val: boolean) => void;

  showNT: boolean;
  setShowNT: (val: boolean) => void;

  onImportDxfFile: (file: File) => Promise<void>;

  // Grid navigation
  focusGridCell: (grid: string, row: number, col: number) => void;
  onGridKeyDown: (e: React.KeyboardEvent, grid: string, row: number, col: number, rows: number, cols: number) => void;
}

export const ConcreteTab: React.FC<ConcreteTabProps> = ({
  dev,
  updateSpan,
  updateNode,
  addSpan,
  removeSpan,
  clearDevelopment,
  selection,
  applySelection,
  concretoLocked,
  setConcretoLocked,
  showNT,
  setShowNT,
  onImportDxfFile,
  focusGridCell,
  onGridKeyDown,
}) => {
  const dxfInputRef = React.useRef<HTMLInputElement | null>(null);

  return (
    <div className="form">
      {/* Importar DXF */}
      <div className="rowBetween">
        <button onClick={() => dxfInputRef.current?.click()}>
          Importa DXF
        </button>
        <input
          ref={dxfInputRef}
          type="file"
          accept=".dxf"
          style={{ display: 'none' }}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onImportDxfFile(file);
            e.target.value = '';
          }}
        />
        <button onClick={clearDevelopment}>Limpiar</button>
      </div>

      {/* Grid de Tramos */}
      {/* Grid de Nodos */}

      {/* ... resto del contenido */}
    </div>
  );
};
```

---

### ✅ Tarea 2.3: Extraer SteelTab
**Archivo:** `src/components/SteelTab/SteelTab.tsx`
**Líneas movidas:** ~2000
**Beneficio:** Mayor complejidad → mayor beneficio de aislamiento

```typescript
import React from 'react';
import type { DevelopmentIn, SteelMeta, BastonCfg, SteelKind } from '../../types';

interface SteelTabProps {
  dev: DevelopmentIn;

  // Steel mutations
  updateSpanSteel: (spanIdx: number, side: 'top' | 'bottom', patch: Partial<SteelMeta>) => void;
  updateBaston: (spanIdx: number, side: 'top' | 'bottom', zone: 'z1' | 'z2' | 'z3', patch: Partial<BastonCfg>) => void;
  setNodeSteelKind: (nodeIdx: number, side: 'top' | 'bottom', end: 1 | 2, kind: SteelKind) => void;

  // Edits state (draft inputs)
  bastonLenEdits: Record<string, string>;
  setBastonLenEdits: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  stirrupsAbcrEdits: Record<string, string>;
  setStirrupsAbcrEdits: React.Dispatch<React.SetStateAction<Record<string, string>>>;

  // Layout settings
  steelLayoutDraft: string;
  setSteelLayoutDraft: (val: string) => void;
}

export const SteelTab: React.FC<SteelTabProps> = ({
  dev,
  updateSpanSteel,
  updateBaston,
  setNodeSteelKind,
  bastonLenEdits,
  setBastonLenEdits,
  stirrupsAbcrEdits,
  setStirrupsAbcrEdits,
  steelLayoutDraft,
  setSteelLayoutDraft,
}) => {
  return (
    <div className="form">
      {/* Acero corrido */}
      {/* Bastones */}
      {/* Estribos */}
      {/* Layout E.060 */}
    </div>
  );
};
```

---

## FASE 3: Context + Reducer (4-5 días)

### ✅ Tarea 3.1: Crear AppContext
**Archivo:** `src/context/AppContext.tsx`
**Beneficio:** Centraliza state management

```typescript
import React, { createContext, useContext, useReducer, ReactNode } from 'react';
import type { DevelopmentIn, AppConfig, PreviewResponse, Selection, Bounds, Tab, PreviewView } from '../types';
import { normalizeDev } from '../utils/normalization';

// ========== STATE TYPE ==========
export type AppState = {
  // UI State
  ui: {
    tab: Tab;
    previewView: PreviewView;
    selection: Selection;
    detailViewport: Bounds | null;
    showLongitudinal: boolean;
    showStirrups: boolean;
    steelYScale2: boolean;
    showNT: boolean;
    concretoLocked: boolean;
    editorOpen: boolean;
  };

  // Data State
  data: {
    appCfg: AppConfig;
    dev: DevelopmentIn;
    jsonText: string;
  };

  // Sync State
  sync: {
    preview: PreviewResponse | null;
    busy: boolean;
    error: string | null;
    warning: string | null;
    saveStatus: 'saved' | 'saving' | 'error' | null;
  };
};

// ========== ACTION TYPES ==========
export type AppAction =
  // UI Actions
  | { type: 'SET_TAB'; payload: Tab }
  | { type: 'SET_PREVIEW_VIEW'; payload: PreviewView }
  | { type: 'SET_SELECTION'; payload: Selection }
  | { type: 'SET_DETAIL_VIEWPORT'; payload: Bounds | null }
  | { type: 'TOGGLE_LONGITUDINAL' }
  | { type: 'TOGGLE_STIRRUPS' }
  | { type: 'TOGGLE_STEEL_Y_SCALE' }
  | { type: 'TOGGLE_SHOW_NT' }
  | { type: 'TOGGLE_CONCRETO_LOCKED' }

  // Data Actions
  | { type: 'SET_APP_CFG'; payload: AppConfig }
  | { type: 'UPDATE_DEV'; payload: Partial<DevelopmentIn> }
  | { type: 'UPDATE_SPAN'; spanIdx: number; patch: Partial<SpanIn> }
  | { type: 'UPDATE_NODE'; nodeIdx: number; patch: Partial<NodeIn> }
  | { type: 'ADD_SPAN' }
  | { type: 'REMOVE_SPAN'; spanIdx: number }
  | { type: 'SET_JSON_TEXT'; payload: string }

  // Sync Actions
  | { type: 'SET_PREVIEW'; payload: PreviewResponse | null }
  | { type: 'SET_BUSY'; payload: boolean }
  | { type: 'SET_ERROR'; payload: string | null }
  | { type: 'SET_WARNING'; payload: string | null }
  | { type: 'SET_SAVE_STATUS'; payload: 'saved' | 'saving' | 'error' | null };

// ========== INITIAL STATE ==========
const initialState: AppState = {
  ui: {
    tab: 'concreto',
    previewView: '2d',
    selection: { kind: 'none' },
    detailViewport: null,
    showLongitudinal: true,
    showStirrups: true,
    steelYScale2: false,
    showNT: false,
    concretoLocked: false,
    editorOpen: true,
  },
  data: {
    appCfg: DEFAULT_APP_CFG,
    dev: defaultDevelopment(DEFAULT_APP_CFG),
    jsonText: '',
  },
  sync: {
    preview: null,
    busy: false,
    error: null,
    warning: null,
    saveStatus: null,
  },
};

// ========== REDUCER ==========
function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    // UI Actions
    case 'SET_TAB':
      return { ...state, ui: { ...state.ui, tab: action.payload } };

    case 'SET_PREVIEW_VIEW':
      return { ...state, ui: { ...state.ui, previewView: action.payload } };

    case 'SET_SELECTION':
      return { ...state, ui: { ...state.ui, selection: action.payload } };

    case 'SET_DETAIL_VIEWPORT':
      return { ...state, ui: { ...state.ui, detailViewport: action.payload } };

    case 'TOGGLE_LONGITUDINAL':
      return { ...state, ui: { ...state.ui, showLongitudinal: !state.ui.showLongitudinal } };

    case 'TOGGLE_STIRRUPS':
      return { ...state, ui: { ...state.ui, showStirrups: !state.ui.showStirrups } };

    case 'TOGGLE_STEEL_Y_SCALE':
      return { ...state, ui: { ...state.ui, steelYScale2: !state.ui.steelYScale2 } };

    case 'TOGGLE_SHOW_NT':
      return { ...state, ui: { ...state.ui, showNT: !state.ui.showNT } };

    case 'TOGGLE_CONCRETO_LOCKED':
      return { ...state, ui: { ...state.ui, concretoLocked: !state.ui.concretoLocked } };

    // Data Actions (con normalización automática)
    case 'SET_APP_CFG':
      return { ...state, data: { ...state.data, appCfg: action.payload } };

    case 'UPDATE_DEV': {
      const newDev = { ...state.data.dev, ...action.payload };
      return {
        ...state,
        data: {
          ...state.data,
          dev: normalizeDev(newDev, state.data.appCfg),
        },
      };
    }

    case 'UPDATE_SPAN': {
      const newSpans = [...state.data.dev.spans];
      newSpans[action.spanIdx] = { ...newSpans[action.spanIdx], ...action.patch };
      return {
        ...state,
        data: {
          ...state.data,
          dev: normalizeDev({ ...state.data.dev, spans: newSpans }, state.data.appCfg),
        },
      };
    }

    case 'UPDATE_NODE': {
      const newNodes = [...state.data.dev.nodes];
      newNodes[action.nodeIdx] = { ...newNodes[action.nodeIdx], ...action.patch };
      return {
        ...state,
        data: {
          ...state.data,
          dev: normalizeDev({ ...state.data.dev, nodes: newNodes }, state.data.appCfg),
        },
      };
    }

    case 'ADD_SPAN': {
      const lastSpan = state.data.dev.spans[state.data.dev.spans.length - 1];
      const newSpan = cloneSpan(lastSpan || INITIAL_SPAN);
      return {
        ...state,
        data: {
          ...state.data,
          dev: normalizeDev(
            { ...state.data.dev, spans: [...state.data.dev.spans, newSpan] },
            state.data.appCfg
          ),
        },
      };
    }

    case 'REMOVE_SPAN': {
      const newSpans = state.data.dev.spans.filter((_, i) => i !== action.spanIdx);
      return {
        ...state,
        data: {
          ...state.data,
          dev: normalizeDev({ ...state.data.dev, spans: newSpans }, state.data.appCfg),
        },
      };
    }

    case 'SET_JSON_TEXT':
      return { ...state, data: { ...state.data, jsonText: action.payload } };

    // Sync Actions
    case 'SET_PREVIEW':
      return { ...state, sync: { ...state.sync, preview: action.payload } };

    case 'SET_BUSY':
      return { ...state, sync: { ...state.sync, busy: action.payload } };

    case 'SET_ERROR':
      return { ...state, sync: { ...state.sync, error: action.payload } };

    case 'SET_WARNING':
      return { ...state, sync: { ...state.sync, warning: action.payload } };

    case 'SET_SAVE_STATUS':
      return { ...state, sync: { ...state.sync, saveStatus: action.payload } };

    default:
      return state;
  }
}

// ========== CONTEXT ==========
const AppContext = createContext<{
  state: AppState;
  dispatch: React.Dispatch<AppAction>;
} | null>(null);

export const AppProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [state, dispatch] = useReducer(appReducer, initialState);

  return (
    <AppContext.Provider value={{ state, dispatch }}>
      {children}
    </AppContext.Provider>
  );
};

export const useAppState = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useAppState must be used within AppProvider');
  }
  return context;
};
```

---

### ✅ Tarea 3.2: Refactorizar App.tsx para usar Context
**Archivo:** `src/App.tsx` (refactorizado)
**Líneas reducidas:** 7668 → ~1500

```typescript
import React from 'react';
import { AppProvider, useAppState } from './context/AppContext';
import { ConfigTab } from './components/ConfigTab/ConfigTab';
import { ConcreteTab } from './components/ConcreteTab/ConcreteTab';
import { SteelTab } from './components/SteelTab/SteelTab';
import { PreviewPanel } from './components/PreviewPanel/PreviewPanel';

const AppContent: React.FC = () => {
  const { state, dispatch } = useAppState();

  // Efectos de sincronización con backend
  // Handlers de eventos
  // etc.

  return (
    <div className="layout">
      <header className="header">
        {/* Header content */}
      </header>

      <main className="content">
        <div className="mainGrid">
          <div className="leftPane">
            <section className="panel">
              {/* Tabs */}
              {state.ui.tab === 'config' && <ConfigTab {...configTabProps} />}
              {state.ui.tab === 'concreto' && <ConcreteTab {...concreteTabProps} />}
              {state.ui.tab === 'acero' && <SteelTab {...steelTabProps} />}
              {state.ui.tab === 'json' && <JsonTab {...jsonTabProps} />}
            </section>
          </div>

          <div className="rightPane">
            <PreviewPanel {...previewPanelProps} />
          </div>
        </div>
      </main>
    </div>
  );
};

export default function App() {
  return (
    <AppProvider>
      <AppContent />
    </AppProvider>
  );
}
```

---

## FASE 4: Separar Canvas Logic (3-4 días)

### ✅ Tarea 4.1: Módulo canvas/preview2d.ts
**Archivo:** `src/utils/canvas/preview2d.ts`
**Líneas movidas:** ~800

```typescript
import type { PreviewResponse, Bounds } from '../../types';

export interface DrawOptions {
  showNT?: boolean;
  showLabels?: boolean;
}

export const canvasPreview2D = {
  /**
   * Dibuja la preview 2D (geometría base del casco)
   */
  draw(
    canvas: HTMLCanvasElement,
    preview: PreviewResponse | null,
    renderBounds: Bounds,
    opts: DrawOptions = {}
  ): void {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // DPR-aware canvas
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const cssW = Math.max(1, Math.round(rect.width));
    const cssH = Math.max(1, Math.round(rect.height));
    const desiredW = Math.round(cssW * dpr);
    const desiredH = Math.round(cssH * dpr);

    if (canvas.width !== desiredW || canvas.height !== desiredH) {
      canvas.width = desiredW;
      canvas.height = desiredH;
    }

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);

    if (!preview) {
      this.drawNoData(ctx, cssW, cssH);
      return;
    }

    const { toCanvas } = canvasMapper(renderBounds, cssW, cssH);

    // Dibujar desarrollo (contorno)
    this.drawDevelopmentOutline(ctx, preview, toCanvas);

    // Dibujar labels opcionales
    if (opts.showLabels) {
      this.drawLabels(ctx, preview, toCanvas);
    }
  },

  drawNoData(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    ctx.fillStyle = 'rgba(229,231,235,0.6)';
    ctx.font = '12px ui-monospace, Menlo, Consolas, monospace';
    ctx.fillText('Sin datos de vista previa', 14, 22);
  },

  drawDevelopmentOutline(
    ctx: CanvasRenderingContext2D,
    preview: PreviewResponse,
    toCanvas: (x: number, y: number) => readonly [number, number]
  ): void {
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(20,184,166,0.95)';

    for (const pl of preview.developments ?? []) {
      const pts = pl.points ?? [];
      if (pts.length < 2) continue;

      ctx.beginPath();
      for (let i = 0; i < pts.length; i++) {
        const [x, y] = pts[i];
        const [cx, cy] = toCanvas(x, y);
        const sx = Math.round(cx) + 0.5;
        const sy = Math.round(cy) + 0.5;
        if (i === 0) ctx.moveTo(sx, sy);
        else ctx.lineTo(sx, sy);
      }
      ctx.stroke();
    }
  },

  drawLabels(
    ctx: CanvasRenderingContext2D,
    preview: PreviewResponse,
    toCanvas: (x: number, y: number) => readonly [number, number]
  ): void {
    // ... lógica de labels
  },
};
```

---

### ✅ Tarea 4.2: Módulo canvas/steel2d.ts
**Archivo:** `src/utils/canvas/steel2d.ts`
**Líneas movidas:** ~1200

```typescript
import type { PreviewResponse, DevelopmentIn, Bounds } from '../../types';

export interface SteelDrawOptions {
  showLongitudinal: boolean;
  showStirrups: boolean;
  steelYScale2: boolean;
  coverTopM: number;
  coverBottomM: number;
  hookLegM: number;
}

export const canvasSteel2D = {
  /**
   * Dibuja overlay de acero sobre el canvas 2D
   */
  draw(
    canvas: HTMLCanvasElement,
    preview: PreviewResponse,
    dev: DevelopmentIn,
    renderBounds: Bounds,
    opts: SteelDrawOptions
  ): void {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const cssW = Math.max(1, Math.round(rect.width));
    const cssH = Math.max(1, Math.round(rect.height));
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const { toCanvas } = canvasMapper(renderBounds, cssW, cssH);

    // Dibujar rebar corrido
    if (opts.showLongitudinal) {
      this.drawLongitudinal(ctx, preview, dev, toCanvas, opts);
    }

    // Dibujar estribos
    if (opts.showStirrups) {
      this.drawStirrups(ctx, preview, dev, toCanvas, opts);
    }

    ctx.restore();
  },

  drawLongitudinal(
    ctx: CanvasRenderingContext2D,
    preview: PreviewResponse,
    dev: DevelopmentIn,
    toCanvas: (x: number, y: number) => readonly [number, number],
    opts: SteelDrawOptions
  ): void {
    // ... lógica de rebar corrido
  },

  drawStirrups(
    ctx: CanvasRenderingContext2D,
    preview: PreviewResponse,
    dev: DevelopmentIn,
    toCanvas: (x: number, y: number) => readonly [number, number],
    opts: SteelDrawOptions
  ): void {
    // ... lógica de estribos
  },
};
```

---

## 📊 RESULTADOS ESPERADOS

### Antes
```
App.tsx: 7668 líneas
├── 40+ estados
├── 20+ efectos
├── 200+ funciones
└── 1800+ líneas JSX
```

### Después
```
src/
├── App.tsx: 150 líneas ✅
├── components/
│   ├── ConfigTab/: 400 líneas ✅
│   ├── ConcreteTab/: 600 líneas ✅
│   ├── SteelTab/: 800 líneas ✅
│   └── PreviewPanel/: 300 líneas ✅
├── hooks/
│   ├── useDebounce: 30 líneas ✅
│   ├── useAutoSave: 40 líneas ✅
│   ├── useCanvasRender: 35 líneas ✅
│   └── useSelection: 45 líneas ✅
├── utils/
│   ├── canvas/
│   │   ├── preview2d: 600 líneas ✅
│   │   └── steel2d: 1000 líneas ✅
│   └── normalization: 500 líneas ✅
└── context/
    └── AppContext: 300 líneas ✅
```

### Métricas
- **Reducción de complejidad:** 85%
- **Componentes testeables:** 10+ archivos
- **Líneas por archivo:** <1000 (mantenible)
- **Reutilización:** +40%

---

## 🎯 PRIORIZACIÓN

### URGENTE (Semana 1)
1. ✅ useDebounce
2. ✅ useAutoSave
3. ✅ ConfigTab

### ALTO (Semana 2)
4. ✅ ConcreteTab
5. ✅ SteelTab
6. ✅ AppContext (básico)

### MEDIO (Semana 3)
7. ✅ canvas/preview2d
8. ✅ canvas/steel2d
9. ✅ useSelection

### BAJO (Semana 4+)
10. ✅ Optimizaciones
11. ✅ Tests
12. ✅ Documentación

---

## ⚠️ RIESGOS Y MITIGACIONES

| Riesgo | Probabilidad | Mitigación |
|--------|--------------|------------|
| Romper funcionalidad | Alta | Testing manual exhaustivo después de cada fase |
| Props drilling | Media | Usar Context solo para state global |
| Performance regression | Baja | Profiler + memoización donde sea necesario |
| Merge conflicts | Alta | Trabajar en rama dedicada, commits pequeños |

---

## 📝 CHECKLIST DE PROGRESO

- [ ] Fase 1.1: useDebounce
- [ ] Fase 1.2: useAutoSave
- [ ] Fase 1.3: useCanvasRender
- [ ] Fase 1.4: useSelection
- [ ] Fase 2.1: ConfigTab
- [ ] Fase 2.2: ConcreteTab
- [ ] Fase 2.3: SteelTab
- [ ] Fase 3.1: AppContext
- [ ] Fase 3.2: Refactor App.tsx con Context
- [ ] Fase 4.1: canvas/preview2d
- [ ] Fase 4.2: canvas/steel2d

---

**Última actualización:** 2026-02-15
