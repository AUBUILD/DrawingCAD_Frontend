# BeamDraw Frontend (React + TypeScript)

Interfaz para edicion de vigas de concreto armado con preview 2D/3D en tiempo real y exportacion DXF.

## Stack

- **React 18** + **TypeScript 5.3**
- **Vite 5** (build + dev server)
- **Three.js 0.182** (visualizacion 3D)
- **Context API + useReducer** (estado global)

## Inicio rapido

```bash
cd DrawingCAD_Frontend
npm install
npm run dev
```

Abrir: http://localhost:5178

El dev server proxyea `/api/*` hacia `http://localhost:8000` (backend).

## Scripts

| Comando | Descripcion |
|---------|-------------|
| `npm run dev` | Servidor de desarrollo (puerto 5178) |
| `npm run build` | Build de produccion (output: `dist/`) |
| `npm run preview` | Preview del build de produccion |

## Variables de entorno

| Variable | Descripcion | Default |
|----------|-------------|---------|
| `VITE_API_URL` | URL base del backend | _(proxy a localhost:8000)_ |

En produccion, definir `VITE_API_URL` apuntando al backend (ej: `https://beamdraw-backend.onrender.com`).

## Arquitectura

### Estructura de archivos

```
src/
  main.tsx                  Punto de entrada con ErrorBoundary
  App.tsx                   Componente principal (~4700 lineas)
  api.ts                    Cliente REST para el backend
  types.ts                  Interfaces TypeScript (SpanIn, NodeIn, DevelopmentIn, etc.)
  steelLayout.ts            Calculos de layout de acero E.060
  styles.css                Estilos globales

  components/
    ConfigTab/
      ConfigTab.tsx         Configuracion global (template, layers, texto acero)
    ConcreteTab/
      ConcreteTab.tsx       Editor de geometria (tramos y nodos)
      EditableCell.tsx      Input numerico editable con estado local
    SteelTab/
      SteelTab.tsx          Editor de acero (continuo, estribos, bastones)
    PreviewPanel/
      PreviewPanel.tsx      Panel de visualizacion 2D/3D
    BastonesTable.tsx       Tabla de bastones por tramo
    EstribosTable.tsx       Tabla de estribos por tramo
    NodosTable.tsx          Tabla de configuracion de nodos

  context/
    AppContext.tsx           Provider principal (AppStateContext + AppDispatchContext)
    AppContext.types.ts      Tipos del estado y acciones (AppState, AppAction, Tab)
    AppContext.reducer.ts    Reducer con 30+ tipos de accion

  hooks/
    useDebounce.ts          Debounce con prevencion de race conditions
    useAutoSave.ts          Auto-guardado con debounce (600ms)
    useSelection.ts         Estado de seleccion (span/node)
    useCanvasRender.ts      Renderizado canvas con RAF + ResizeObserver
    useBastonLen.ts         Edicion draft de longitudes de bastones
    useStirrupsAbcr.ts      Edicion draft de patrones ABCR

  services/
    geometryService.ts      Calculos geometricos (mToUnits, nodeOrigins, spanRange)
    steelService.ts         Calculos de acero (anchorage, hook lengths, rebar table)
    stirrupsService.ts      Parsing de estribos (ABCR, N@S, rto@S)
    developmentService.ts   Normalizacion y clonacion de DevelopmentIn
    canvasService.ts        Renderizado 2D (polylines, cortes, overlays)
    threeService.ts         Utilidades Three.js (camera, materials, dispose)
    appUtils.ts             Utilidades generales (downloadBlob)

  utils/
    numberUtils.ts          clampNumber, clampInt, fmt2, snap05m
    stringUtils.ts          formatBeamNo, levelPrefix, formatOrdinalEs
    storageUtils.ts         Acceso seguro a localStorage
    stirrupsUtils.ts        Parsing/formato ABCR, tablas default por peralte
    jsonUtils.ts            safeParseJson, toJson
```

### Flujo de datos

```
Usuario edita UI (ConfigTab / ConcreteTab / SteelTab)
  -> dispatch(action) via useAppActions()
  -> appReducer actualiza AppState inmutablemente
  -> Componentes re-renderizan
  -> useAutoSave persiste al backend (600ms debounce)
  -> PreviewPanel renderiza con datos actualizados
```

### Tabs principales

| Tab | Componente | Descripcion |
|-----|-----------|-------------|
| Config | `ConfigTab` | Template DXF, layers, texto de acero, proyeccion de losa |
| Concreto | `ConcreteTab` | Geometria: tramos (L, h, b) y nodos (b1, b2, a2, proyecciones) |
| Acero | `SteelTab` | Acero continuo, estribos, bastones, layout E.060 |
| Preview | `PreviewPanel` | Vista 2D overview + detalle zoom + 3D con OrbitControls |

### Estado global (AppState)

```typescript
dev: DevelopmentIn          // Datos del desarrollo activo
appCfg: AppConfig           // Configuracion de la app
preview: PreviewResponse    // Respuesta del backend (polylines)
backendCfg: BackendAppConfig // Config del backend (hook_leg, text styles)
tab: Tab                    // Tab activo
busy: boolean               // Estado de carga
saveStatus: SaveStatus      // 'saved' | 'saving' | 'error' | null
selection: Selection        // Seleccion actual (span/node/none)
savedCuts: SavedCut[]       // Cortes de seccion guardados
previewView: '2d' | '3d'   // Vista actual del preview
```

## API del backend (endpoints consumidos)

| Metodo | Ruta | Funcion en api.ts |
|--------|------|-------------------|
| POST | `/api/preview` | `fetchPreview()` |
| POST | `/api/export-dxf` | `exportDxf()` |
| POST | `/api/import-dxf` | `importDxf()` |
| GET | `/api/config` | `fetchConfig()` |
| PUT | `/api/config` | `updateConfig()` |
| POST | `/api/template-dxf` | `uploadTemplateDxf()` |
| GET | `/api/template-dxf` | `getTemplateDxf()` |
| DELETE | `/api/template-dxf` | `clearTemplateDxf()` |
| GET | `/api/projects/current` | `fetchState()` |
| PUT | `/api/projects/current` | `saveState()` |

## Despliegue

### Build

```bash
VITE_API_URL=https://tu-backend.com npm run build
```

### Render.com

El repo incluye `render.yaml` para despliegue como Static Site:

- Build command: `npm ci && npm run build`
- Publish directory: `dist`
- Env var: `VITE_API_URL` con la URL del backend

### Reverse proxy (alternativa)

Servir `dist/` con Nginx/Apache y reenviar `/api/*` al backend en puerto 8000.
No requiere CORS ni `VITE_API_URL`.
