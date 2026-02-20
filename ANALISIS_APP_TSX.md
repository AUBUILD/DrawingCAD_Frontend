# 📋 Análisis Completo de App.tsx

**Total:** 5,940 líneas
**Archivo:** `src/App.tsx`

---

## 🗂️ Estructura General

```
App.tsx
├── 📦 IMPORTS (líneas 1-52)           ~50 líneas
├── 🏷️  TYPE DEFINITIONS (53-125)      ~70 líneas
├── 📋 CONSTANTS (126-225)             ~100 líneas
├── ⚙️  HELPER FUNCTIONS (226-2635)    ~2,400 líneas
└── 🎯 MAIN COMPONENT (2636-5940)      ~3,300 líneas
```

---

## 📦 1. IMPORTS (líneas 1-52) - ~50 líneas

**Librerías Externas:**
- `React` (useState, useEffect, useMemo, useRef)
- `THREE.js` (para visualización 3D)
- `OrbitControls` (controles de cámara 3D)

**Módulos Internos:**
- `./api` - Funciones de backend (fetchPreview, exportDxf, saveState, etc.)
- `./types` - TypeScript types (DevelopmentIn, SpanIn, NodeIn, etc.)
- `./steelLayout` - Cálculos de distribución de acero
- `./hooks` - Custom hooks (useDebounce)
- `./context` - Context API (AppProvider, useAppState, useAppActions)
- `./components` - Componentes UI (ConfigTab, ConcreteTab, SteelTab, PreviewPanel)
- `./utils` - Utilidades extraídas (18 funciones)

**Total:** 13 import statements

---

## 🏷️ 2. TYPE DEFINITIONS (líneas 53-125) - ~70 líneas

**Types Locales:**
```typescript
type Tab = 'config' | 'concreto' | 'acero' | 'json'
type PreviewView = '2d' | '3d'
type ThreeProjection = 'perspective' | 'orthographic'
type PersonalizadoPayloadV1 = { ... }  // Payload de preferencias personalizadas
```

**Interfaces Locales:**
```typescript
interface AppConfig {
  d: number                    // Distancia al borde (m)
  unit_scale: number           // Escala de unidades
  x0: number, y0: number       // Origen de coordenadas
  recubrimiento: number        // Recubrimiento de acero (m)
  baston_Lc: number           // Longitud de bastones (m)
}

interface Selection {
  kind: 'none' | 'span' | 'node'
  spanIdx?: number
  nodeIdx?: number
}

interface Bounds {
  x0: number, x1: number
  y0: number, y1: number
}

interface ThreeSceneState {
  scene: THREE.Scene
  camera: THREE.Camera
  renderer: THREE.WebGLRenderer
  controls: OrbitControls
  ... (objetos 3D)
}
```

**Total:** 11 type/interface definitions

---

## 📋 3. GLOBAL CONSTANTS (líneas 75-225) - ~100 líneas

**Constantes de Storage:**
```typescript
const DEFAULT_PREF_KEY = 'beamdraw:defaultPref'
const PERSONALIZADO_KEY = 'beamdraw:personalizado'
```

**Configuración Default:**
```typescript
const DEFAULT_APP_CFG: AppConfig = {
  d: 0.25,
  unit_scale: 2,
  x0: 0,
  y0: 0,
  recubrimiento: 0.04,
  baston_Lc: 0.5,
}
```

**Valores Iniciales:**
```typescript
const DEFAULT_STEEL_META: SteelMeta = { qty: 3, diameter: '3/4' }

const DEFAULT_STEEL_LAYOUT_SETTINGS: SteelLayoutSettings = {
  dag_cm: 2.5,
  use_practical_min: true,
  practical_min_cm: 4.0,
  max_rows_per_face: 3,
}

const INITIAL_SPAN: SpanIn = {
  L: 3.0,
  h: 0.5,
  b: 0.3,
  stirrups_section: { shape: 'rect', diameter: '3/8', qty: 1 },
  steel_top: { qty: 3, diameter: '3/4' },
  steel_bottom: { qty: 3, diameter: '3/4' },
}

const INITIAL_NODE: NodeIn = {
  a1: 0.0,
  a2: 0.5,
  b1: 0.0,
  b2: 0.5,
  // ... muchas propiedades de configuración de nodos
}
```

**Tabla de Datos de Rebar:**
```typescript
const REBAR_TABLE_CM: Record<string, { ldg: number; ld_inf: number; ld_sup: number }> = {
  '3/8': { ldg: 28, ld_inf: 60, ld_sup: 75 },
  '1/2': { ldg: 38, ld_inf: 80, ld_sup: 100 },
  '5/8': { ldg: 47, ld_inf: 95, ld_sup: 120 },
  '3/4': { ldg: 56, ld_inf: 115, ld_sup: 145 },
  '1': { ldg: 56, ld_inf: 115, ld_sup: 145 },
  '1-3/8': { ldg: 77, ld_inf: 155, ld_sup: 200 },
}
```

**Total:** 8 constantes globales principales

---

## ⚙️ 4. HELPER FUNCTIONS (líneas 127-2635) - ~2,400 líneas

Estas son **51 funciones auxiliares** que se ejecutan ANTES del componente App.

### 4.1 Funciones de Persistencia (~100 líneas)
```typescript
function readPersonalizado(): PersonalizadoPayloadV1 | null
function writePersonalizado(p: PersonalizadoPayloadV1): void
```

### 4.2 Funciones de Normalización (~500 líneas)
```typescript
function normalizeStirrupsDistribution(input: unknown): StirrupsDistributionIn
function normalizeStirrupsSection(input: unknown)
function normalizeBastonCfg(input: unknown): BastonCfg
function normalizeBastonesSideCfg(input: unknown): BastonesSideCfg
function normalizeBastonesCfg(input: unknown): BastonesCfg
function normalizeDev(input: DevelopmentIn, appCfg: AppConfig): DevelopmentIn
```

### 4.3 Funciones de Clonación (~200 líneas)
```typescript
function cloneSteelMeta(m?: SteelMeta | null): SteelMeta
function cloneSpan(span: SpanIn): SpanIn
function cloneNode(node: NodeIn): NodeIn
```

### 4.4 Funciones Factory (~100 líneas)
```typescript
function defaultDevelopment(appCfg: AppConfig, name?: string): DevelopmentIn
```

### 4.5 Funciones de Transformación (~100 líneas)
```typescript
function toBackendPayload(dev: DevelopmentIn): PreviewRequest
function toPreviewPayload(dev: DevelopmentIn): PreviewRequest
```

### 4.6 Funciones de Rendering Canvas (~800 líneas)
```typescript
function canvasMapper(bounds: Bounds, cssW: number, cssH: number)
function drawPreview(canvas: HTMLCanvasElement, data: PreviewResponse, ...)
function drawSteel2D(canvas: HTMLCanvasElement, data: PreviewResponse, ...)
function drawDetailViewport(canvas: HTMLCanvasElement, ...)
function drawCutMarker2D(canvas: HTMLCanvasElement, ...)
function drawSteelLabels(canvas: HTMLCanvasElement, ...)
// ... más funciones de dibujo
```

### 4.7 Funciones de 3D/Three.js (~300 líneas)
```typescript
function ensureThreeScene(host: HTMLDivElement, ...): ThreeSceneState
function updateThreeScene(threeState: ThreeSceneState, ...)
function cleanupThreeScene(threeState: ThreeSceneState)
// ... funciones de creación de geometría 3D
```

### 4.8 Funciones de Cálculo de Acero (~200 líneas)
```typescript
function lengthFromTableMeters(dia: string, kind: ..., side: ...): number
function steelKindLegacy(node: NodeIn, side: ...): SteelKind
function nodeSteelKind(node: NodeIn, side: ..., end: ...): SteelKind
function nodeToFaceEnabled(node: NodeIn, side: ..., end: ...): boolean
// ... más funciones de cálculo
```

### 4.9 Funciones de Parsing de Estribos (~200 líneas)
```typescript
function parseStirrupsSpec(text: string): StirrupToken[]
function abcrFromLegacyTokens(tokens: StirrupToken[]): StirrupsABCR | null
function stirrupsPositionsFromTokens(...)
function computeStirrupsBlocks(...)
```

**Total:** ~2,400 líneas de funciones auxiliares

---

## 🎯 5. MAIN APP COMPONENT (líneas 2637-5940) - ~3,300 líneas

Este es el corazón de la aplicación. Contiene:

### 5.1 State Declarations (~100 líneas)

**~30 useState hooks:**
```typescript
const [tab, setTab] = useState<Tab>('concreto')
const [previewView, setPreviewView] = useState<PreviewView>('2d')
const [showLongitudinal, setShowLongitudinal] = useState(true)
const [showStirrups, setShowStirrups] = useState(true)
const [steelYScale2, setSteelYScale2] = useState(false)
const [selection, setSelection] = useState<Selection>({ kind: 'none' })
const [detailViewport, setDetailViewport] = useState<Bounds | null>(null)

const [appCfg, setAppCfg] = useState<AppConfig>(DEFAULT_APP_CFG)
const [dev, setDev] = useState<DevelopmentIn>(...)
const [jsonText, setJsonText] = useState(...)

const [preview, setPreview] = useState<PreviewResponse | null>(null)
const [busy, setBusy] = useState(false)
const [error, setError] = useState<string | null>(null)
const [warning, setWarning] = useState<string | null>(null)
const [saveStatus, setSaveStatus] = useState<...>(null)

const [defaultPref, setDefaultPref] = useState<DefaultPreferenceId>(...)
const [backendCfg, setBackendCfg] = useState<BackendAppConfig | null>(null)
const [templateName, setTemplateName] = useState<string | null>(null)
const [templateLayers, setTemplateLayers] = useState<string[]>([])

// ... y muchos más
```

**~15 useRef hooks:**
```typescript
const tabRef = useRef<Tab>(tab)
const canvasRef = useRef<HTMLCanvasElement | null>(null)
const overviewCanvasRef = useRef<HTMLCanvasElement | null>(null)
const sectionCanvasRef = useRef<HTMLCanvasElement | null>(null)
const threeHostRef = useRef<HTMLDivElement | null>(null)
const threeRef = useRef<ThreeSceneState | null>(null)
// ... más refs
```

### 5.2 Helper Functions Inside App (~800 líneas)

**Funciones de Aplicar Preferencias:**
```typescript
const applyBasicoPreference = () => { ... }
const applyPersonalizadoPreference = (p: ...) => { ... }
const onChangeDefaultPref = (next: ...) => { ... }
```

**Handlers de Desarrollo:**
```typescript
const onUpdateSpanDimension = (idx: number, key: ..., val: ...) => { ... }
const onUpdateNodeDimension = (idx: number, key: ..., val: ...) => { ... }
const onUpdateSpanSteel = (idx: number, side: ..., patch: ...) => { ... }
const onUpdateStirrupsDistribution = (idx: number, patch: ...) => { ... }
const onUpdateBaston = (idx: number, side: ..., zone: ..., patch: ...) => { ... }
```

**Handlers de UI:**
```typescript
const onAddSpan = () => { ... }
const onRemoveSpan = (idx: number) => { ... }
const onTabChange = (t: Tab) => { ... }
const onToggleEditor = () => { ... }
const onSectionCutChange = (xU: number) => { ... }
```

**Handlers de Template:**
```typescript
const handleUploadTemplate = async (file: File) => { ... }
const handleClearTemplate = async () => { ... }
const handleGetTemplate = async () => { ... }
```

**Handlers de Export:**
```typescript
const onExportDxf = async () => { ... }
const onImportDxf = async (file: File) => { ... }
```

**~50-60 funciones handler** dentro del componente

### 5.3 useEffect Hooks (~300 líneas)

**Efectos de inicialización:**
```typescript
useEffect(() => {
  // Cargar config del backend al montar
  fetchConfig().then(...)
}, [])

useEffect(() => {
  // Cargar state guardado
  fetchState().then(...)
}, [])
```

**Efectos de sincronización:**
```typescript
useEffect(() => {
  // Sincronizar dev con backend cuando cambia
  if (dev) { ... }
}, [dev])

useEffect(() => {
  // Auto-guardar preferencias
  safeSetLocalStorage(DEFAULT_PREF_KEY, defaultPref)
}, [defaultPref])
```

**Efectos de rendering:**
```typescript
useEffect(() => {
  // Actualizar preview canvas
  if (canvasRef.current && preview) {
    drawPreview(canvasRef.current, preview, ...)
  }
}, [preview, previewView, ...])

useEffect(() => {
  // Actualizar scene 3D
  if (threeRef.current && preview) {
    updateThreeScene(threeRef.current, preview, ...)
  }
}, [preview, threeProjection, ...])
```

**~15-20 useEffect hooks** con lógica compleja

### 5.4 useMemo / useDebounce (~100 líneas)

```typescript
const debouncedDev = useDebounce(dev, 500)

const spansCols = useMemo(() => (dev.spans ?? []).length, [dev])
const nodesCols = useMemo(() => (dev.nodes ?? []).length, [dev])

const steelLayoutDraftParsed = useMemo(() => { ... }, [steelLayoutDraft])
```

### 5.5 JSX Return (~2,000 líneas)

El render del componente contiene una estructura ENORME:

```tsx
return (
  <div className="app-container">
    {/* Header con tabs */}
    <div className="tabs">
      <button onClick={() => onTabChange('config')}>Config</button>
      <button onClick={() => onTabChange('concreto')}>Concreto</button>
      <button onClick={() => onTabChange('acero')}>Acero</button>
      <button onClick={() => onTabChange('json')}>JSON</button>
    </div>

    {/* Contenido según tab activo */}
    {tab === 'config' && (
      <ConfigTab
        appCfg={appCfg}
        setAppCfg={setAppCfg}
        defaultPref={defaultPref}
        onChangeDefaultPref={onChangeDefaultPref}
        backendCfg={backendCfg}
        hookLegDraft={hookLegDraft}
        setHookLegDraft={setHookLegDraft}
        // ... muchos más props
      />
    )}

    {tab === 'concreto' && (
      <ConcreteTab
        dev={dev}
        setDev={setDev}
        appCfg={appCfg}
        onUpdateSpanDimension={onUpdateSpanDimension}
        onUpdateNodeDimension={onUpdateNodeDimension}
        onAddSpan={onAddSpan}
        onRemoveSpan={onRemoveSpan}
        // ... muchos más props
      />
    )}

    {tab === 'acero' && (
      <SteelTab
        dev={dev}
        preview={preview}
        onUpdateSpanSteel={onUpdateSpanSteel}
        onUpdateStirrupsDistribution={onUpdateStirrupsDistribution}
        onUpdateBaston={onUpdateBaston}
        // ... muchos más props
      />
    )}

    {tab === 'json' && (
      <div className="json-editor">
        <textarea
          value={jsonText}
          onChange={(e) => setJsonText(e.target.value)}
        />
        <button onClick={onApplyJson}>Aplicar</button>
      </div>
    )}

    {/* Panel de Preview (siempre visible) */}
    <PreviewPanel
      preview={preview}
      previewView={previewView}
      setPreviewView={setPreviewView}
      busy={busy}
      error={error}
      warning={warning}
      // Canvas 2D
      canvasRef={canvasRef}
      overviewCanvasRef={overviewCanvasRef}
      sectionCanvasRef={sectionCanvasRef}
      // 3D
      threeHostRef={threeHostRef}
      threeOverviewHostRef={threeOverviewHostRef}
      threeProjection={threeProjection}
      setThreeProjection={setThreeProjection}
      // ... muchos más props
    />

    {/* Sección de corte */}
    {sectionXU > 0 && (
      <div className="section-view">
        <canvas ref={sectionCanvasRef} />
        <button onClick={() => setSavedCuts([...savedCuts, { xU: sectionXU }])}>
          Guardar Corte
        </button>
      </div>
    )}

    {/* Modales, overlays, etc. */}
    {editorOpen && <div className="modal">...</div>}

  </div>
)
```

**Estructura del JSX:**
- Header con tabs
- Conditional rendering según tab activo
- 4 componentes de tab (ConfigTab, ConcreteTab, SteelTab, JSON)
- Panel de preview (2D y 3D)
- Sección de corte
- Modales y overlays
- Controles de export/import

**Total JSX:** ~2,000 líneas (33% del componente)

---

## 📊 Resumen Numérico

| Sección | Líneas | % del Total | Tipo de Contenido |
|---------|--------|-------------|-------------------|
| **Imports** | ~50 | 0.8% | Dependencias |
| **Types** | ~70 | 1.2% | TypeScript types/interfaces |
| **Constants** | ~100 | 1.7% | Configuración global |
| **Helper Functions** | ~2,400 | 40.4% | 51 funciones auxiliares |
| **App Component** | ~3,300 | 55.6% | Lógica principal |
| ├─ State declarations | ~100 | 1.7% | useState/useRef |
| ├─ Helper functions | ~800 | 13.5% | Handlers y callbacks |
| ├─ Effects | ~300 | 5.1% | useEffect hooks |
| ├─ Memos | ~100 | 1.7% | useMemo/useDebounce |
| └─ JSX Return | ~2,000 | 33.7% | HTML/Rendering |
| **TOTAL** | **5,940** | **100%** | - |

---

## 🎯 Oportunidades de Refactorización

### 1. Helper Functions (~2,400 líneas)
- ✅ **Candidato ideal para extracción**
- Funciones independientes del estado del componente
- Pueden moverse a `services/` o `helpers/`
- **Impacto: -2,000 a -2,400 líneas**

### 2. State Management (~100 líneas)
- ✅ **Context ya preparado**
- Reemplazar useState con useAppState/useAppActions
- Simplificar lógica de estado
- **Impacto: -50 a -100 líneas directas, más simplificación**

### 3. Handlers dentro de App (~800 líneas)
- ⚠️ **Algunos pueden extraerse**
- Dependen del estado, pero podrían usar Context
- Candidatos: handlers de preferencias, export, template
- **Impacto: -200 a -400 líneas**

### 4. JSX Return (~2,000 líneas)
- ⚠️ **Ya está componentizado**
- ConfigTab, ConcreteTab, SteelTab, PreviewPanel ya extraídos
- Resto es estructura necesaria
- **Impacto limitado: -100 a -200 líneas máximo**

---

## 💡 Recomendación de Prioridades

**Orden sugerido para refactorización:**

1. **Fase A: Extraer Helper Functions**
   - Mover 51 funciones a `services/`
   - Impacto: -2,000 a -2,400 líneas
   - Riesgo: Bajo (funciones independientes)
   - Tiempo: 2-3 horas

2. **Fase B: Integrar Context**
   - Reemplazar useState con Context
   - Simplificar handlers
   - Impacto: -300 a -500 líneas
   - Riesgo: Medio
   - Tiempo: 2-3 horas

3. **Fase C: Optimizar JSX**
   - Extraer subcomponentes pequeños
   - Impacto: -100 a -200 líneas
   - Riesgo: Bajo
   - Tiempo: 1 hora

**Target Final: ~3,000-3,500 líneas** (reducción de 40-45%)

---

**Generado:** 2026-02-15 | **Análisis de:** App.tsx (5,940 líneas)
