# 📋 Flujo Actual y Propuesta: Gestión de Múltiples Configuraciones

## 🔄 FLUJO ACTUAL (Estado Actual del Frontend)

### **Estructura de Datos**
```typescript
// El estado actual maneja UN SOLO desarrollo a la vez:
DevelopmentIn {
  name: string;              // Ej: "DESARROLLO 01"
  nodes: NodeIn[];           // Nodos de conexión
  spans: SpanIn[];           // Tramos entre nodos
  d: number;                 // Config general
  unit_scale: number;
  x0, y0: number;
  steel_cover_top/bottom: number;
}

// El payload que se envía al backend:
PreviewRequest {
  developments: [DevelopmentIn]  // Array con 1 solo elemento
}
```

### **Guardado Automático (Actual)**
**Ubicación**: [App.tsx líneas 1075-1084](src/App.tsx#L1075-L1084)

```typescript
// 1. Cada vez que el usuario modifica algo (spans, nodes, config)
//    se actualiza el state `dev` y `appCfg`

// 2. useEffect con debounce de 600ms:
useEffect(() => {
  const t = window.setTimeout(async () => {
    try {
      await saveState(payload);  // PUT /api/projects/current
    } catch {
      // ignore
    }
  }, 600);
  return () => window.clearTimeout(t);
}, [payload]);  // Se ejecuta cada vez que payload cambia

// 3. payload = { developments: [dev] }
//    Siempre guarda 1 solo desarrollo
```

### **Carga al Inicio (Actual)**
**Ubicación**: [App.tsx líneas 1042-1071](src/App.tsx#L1042-L1071)

```typescript
useEffect(() => {
  (async () => {
    const stored = await fetchState();  // GET /api/projects/current
    if (stored?.developments?.length) {
      const incoming = stored.developments[0];  // Toma el primero
      setAppCfg({ d, unit_scale, x0, y0, steel_covers... });
      setDev(normalizeDev(incoming, nextCfg));
      setJsonText(toJson(stored));
    }
  })();
}, []);  // Solo al montar el componente
```

### **Problema Actual**
❌ **Solo se puede guardar/cargar 1 configuración a la vez**
❌ **No hay lista de configuraciones guardadas**
❌ **No hay dropdown/selector para elegir entre configuraciones**
❌ **Si creas una nueva configuración, sobrescribe la anterior**

---

## ✅ PROPUESTA: Sistema de Múltiples Configuraciones

### **Funcionalidad Deseada**

1. **Dropdown en la UI** con lista de configuraciones guardadas
   - Mostrar nombre de cada configuración guardada
   - Opción "Nueva configuración +"
   - Seleccionar una configuración carga todos sus datos

2. **Al seleccionar una configuración**:
   - Cargar todos los datos en las 4 pestañas:
     - **Config**: d, unit_scale, x0, y0, steel covers
     - **Concreto**: nodes y spans
     - **Acero**: steel_top, steel_bottom por span, y conexiones por node
     - **JSON**: Representación completa

3. **Guardar configuración**:
   - Con nombre personalizado
   - Actualizar automáticamente si ya existe
   - Crear nueva si cambia el nombre

4. **Exportar DXF**:
   - De la configuración actualmente seleccionada

---

## 🔧 CAMBIOS NECESARIOS

### **1. BACKEND: Nuevos Endpoints Requeridos**

El backend necesita implementar endpoints para gestionar múltiples proyectos:

```python
# ❌ ACTUAL (solo 1 proyecto):
GET  /api/projects/current
PUT  /api/projects/current

# ✅ NUEVO (múltiples proyectos):
GET    /api/projects              # Lista todos los proyectos guardados
                                   # Response: [{ id, name, created_at, updated_at }]

GET    /api/projects/{id}         # Cargar proyecto específico por ID
                                   # Response: { id, name, data: DevelopmentIn, ... }

POST   /api/projects              # Crear nuevo proyecto
                                   # Request: { name, data: DevelopmentIn }
                                   # Response: { id, name, ... }

PUT    /api/projects/{id}         # Actualizar proyecto existente
                                   # Request: { name?, data: DevelopmentIn }

DELETE /api/projects/{id}         # Eliminar proyecto (opcional)
```

**Tabla en PostgreSQL (Propuesta)**:
```sql
CREATE TABLE projects (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    data JSONB NOT NULL,  -- DevelopmentIn completo
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);
```

---

### **2. FRONTEND: Nuevas Funciones API**

**Ubicación**: [src/api.ts](src/api.ts)

```typescript
// Nuevas funciones a agregar:

export type ProjectListItem = {
  id: number;
  name: string;
  created_at: string;
  updated_at: string;
};

export type ProjectDetail = {
  id: number;
  name: string;
  data: DevelopmentIn;
  created_at: string;
  updated_at: string;
};

// Listar todos los proyectos
export async function listProjects(): Promise<ProjectListItem[]> {
  const res = await fetch(`${BASE}/api/projects`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// Cargar proyecto específico
export async function loadProject(id: number): Promise<ProjectDetail> {
  const res = await fetch(`${BASE}/api/projects/${id}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// Crear nuevo proyecto
export async function createProject(
  name: string, 
  data: DevelopmentIn
): Promise<ProjectDetail> {
  const res = await fetch(`${BASE}/api/projects`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, data }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// Actualizar proyecto existente
export async function updateProject(
  id: number,
  name: string,
  data: DevelopmentIn
): Promise<ProjectDetail> {
  const res = await fetch(`${BASE}/api/projects/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, data }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// Eliminar proyecto (opcional)
export async function deleteProject(id: number): Promise<void> {
  const res = await fetch(`${BASE}/api/projects/${id}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}
```

---

### **3. FRONTEND: Cambios en App.tsx**

#### **A. Nuevo State para Gestión de Proyectos**

```typescript
// Agregar después de línea 952:
const [projects, setProjects] = useState<ProjectListItem[]>([]);
const [currentProjectId, setCurrentProjectId] = useState<number | null>(null);
const [currentProjectName, setCurrentProjectName] = useState('DESARROLLO 01');
const [showNewProjectDialog, setShowNewProjectDialog] = useState(false);
```

#### **B. Cargar Lista de Proyectos al Inicio**

```typescript
// Reemplazar useEffect de líneas 1042-1071:
useEffect(() => {
  let cancelled = false;
  (async () => {
    try {
      // 1. Cargar lista de proyectos
      const projectsList = await listProjects();
      if (cancelled) return;
      setProjects(projectsList);

      // 2. Cargar último proyecto modificado (o el primero)
      if (projectsList.length > 0) {
        const latest = projectsList.sort(
          (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
        )[0];
        
        const project = await loadProject(latest.id);
        if (cancelled) return;

        setCurrentProjectId(project.id);
        setCurrentProjectName(project.name);
        
        const dev = project.data;
        const nextCfg: AppConfig = {
          d: clampNumber(dev.d ?? DEFAULT_APP_CFG.d, DEFAULT_APP_CFG.d),
          unit_scale: clampNumber(dev.unit_scale ?? DEFAULT_APP_CFG.unit_scale, DEFAULT_APP_CFG.unit_scale),
          x0: clampNumber(dev.x0 ?? DEFAULT_APP_CFG.x0, DEFAULT_APP_CFG.x0),
          y0: clampNumber(dev.y0 ?? DEFAULT_APP_CFG.y0, DEFAULT_APP_CFG.y0),
          steel_cover_top: clampNumber(dev.steel_cover_top ?? DEFAULT_APP_CFG.steel_cover_top, DEFAULT_APP_CFG.steel_cover_top),
          steel_cover_bottom: clampNumber(dev.steel_cover_bottom ?? DEFAULT_APP_CFG.steel_cover_bottom, DEFAULT_APP_CFG.steel_cover_bottom),
        };
        
        setAppCfg(nextCfg);
        setDev(normalizeDev(dev, nextCfg));
        setJsonText(toJson({ developments: [dev] }));
      }
    } catch (error) {
      console.error('Error al cargar proyectos:', error);
      // Modo offline: trabajar con desarrollo por defecto
    }
  })();

  return () => {
    cancelled = true;
  };
}, []);
```

#### **C. Auto-guardado Actualizado**

```typescript
// Reemplazar useEffect de líneas 1075-1084:
useEffect(() => {
  const t = window.setTimeout(async () => {
    try {
      if (currentProjectId) {
        // Actualizar proyecto existente
        await updateProject(currentProjectId, currentProjectName, dev);
      } else {
        // Crear nuevo proyecto
        const newProject = await createProject(currentProjectName, dev);
        setCurrentProjectId(newProject.id);
        
        // Actualizar lista de proyectos
        const projectsList = await listProjects();
        setProjects(projectsList);
      }
    } catch (error) {
      console.error('Error al guardar:', error);
    }
  }, 600);
  
  return () => window.clearTimeout(t);
}, [dev, currentProjectId, currentProjectName]);
```

#### **D. UI: Dropdown de Proyectos**

Agregar en el header (antes de las tabs, alrededor de línea 1450):

```tsx
{/* Selector de Proyectos */}
<div className="projectSelector">
  <label>
    <strong>Proyecto:</strong>
    <select
      value={currentProjectId ?? ''}
      onChange={async (e) => {
        const id = Number(e.target.value);
        if (!id) return;
        
        try {
          const project = await loadProject(id);
          setCurrentProjectId(project.id);
          setCurrentProjectName(project.name);
          
          const dev = project.data;
          const nextCfg: AppConfig = {
            d: clampNumber(dev.d ?? DEFAULT_APP_CFG.d, DEFAULT_APP_CFG.d),
            unit_scale: clampNumber(dev.unit_scale ?? DEFAULT_APP_CFG.unit_scale, DEFAULT_APP_CFG.unit_scale),
            x0: clampNumber(dev.x0 ?? DEFAULT_APP_CFG.x0, DEFAULT_APP_CFG.x0),
            y0: clampNumber(dev.y0 ?? DEFAULT_APP_CFG.y0, DEFAULT_APP_CFG.y0),
            steel_cover_top: clampNumber(dev.steel_cover_top ?? DEFAULT_APP_CFG.steel_cover_top, DEFAULT_APP_CFG.steel_cover_top),
            steel_cover_bottom: clampNumber(dev.steel_cover_bottom ?? DEFAULT_APP_CFG.steel_cover_bottom, DEFAULT_APP_CFG.steel_cover_bottom),
          };
          
          setAppCfg(nextCfg);
          setDev(normalizeDev(dev, nextCfg));
          setJsonText(toJson({ developments: [dev] }));
        } catch (error) {
          setError(`Error al cargar proyecto: ${error}`);
        }
      }}
    >
      <option value="">-- Seleccionar proyecto --</option>
      {projects.map((p) => (
        <option key={p.id} value={p.id}>
          {p.name} ({new Date(p.updated_at).toLocaleDateString()})
        </option>
      ))}
    </select>
  </label>
  
  <button
    onClick={() => {
      // Crear nuevo proyecto
      setCurrentProjectId(null);
      setCurrentProjectName('NUEVO DESARROLLO');
      setAppCfg(DEFAULT_APP_CFG);
      setDev(defaultDevelopment(DEFAULT_APP_CFG, 'NUEVO DESARROLLO'));
      setJsonText(toJson({ developments: [defaultDevelopment(DEFAULT_APP_CFG, 'NUEVO DESARROLLO')] }));
    }}
    title="Crear nuevo proyecto"
  >
    ➕ Nuevo
  </button>
</div>
```

#### **E. UI: Input para Nombre del Proyecto**

Agregar en la pestaña Config o en el header:

```tsx
<div className="formRow">
  <label>
    <strong>Nombre del proyecto:</strong>
    <input
      type="text"
      value={currentProjectName}
      onChange={(e) => setCurrentProjectName(e.target.value)}
      placeholder="Ej: DESARROLLO 01"
    />
  </label>
</div>
```

---

### **4. ESTILOS CSS**

Agregar a [src/styles.css](src/styles.css):

```css
.projectSelector {
  display: flex;
  gap: 1rem;
  align-items: center;
  margin-bottom: 1rem;
  padding: 1rem;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 4px;
}

.projectSelector label {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  flex: 1;
}

.projectSelector select {
  padding: 0.5rem;
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 4px;
  cursor: pointer;
}

.projectSelector select option {
  background: #1a1a1a;
  color: #fff;
}

.projectSelector button {
  padding: 0.5rem 1rem;
  background: #14b8a6;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-weight: 600;
}

.projectSelector button:hover {
  background: #0d9488;
}
```

---

## 📊 RESUMEN DEL FLUJO COMPLETO

### **Flujo de Usuario**

```
1. Usuario abre la aplicación
   └─> Frontend carga lista de proyectos (GET /api/projects)
   └─> Muestra dropdown con todos los proyectos
   └─> Carga automáticamente el último modificado

2. Usuario selecciona un proyecto del dropdown
   └─> Frontend carga datos del proyecto (GET /api/projects/{id})
   └─> Popula todas las pestañas:
       ├─> Config: d, unit_scale, steel covers
       ├─> Concreto: spans y nodes
       ├─> Acero: steel_top/bottom por span, conexiones por node
       └─> JSON: representación completa

3. Usuario modifica datos (cualquier pestaña)
   └─> State se actualiza instantáneamente
   └─> Debounce de 600ms
   └─> Auto-guarda (PUT /api/projects/{id})

4. Usuario crea nuevo proyecto
   └─> Click en "➕ Nuevo"
   └─> Limpia todos los campos
   └─> Al guardar, crea nuevo proyecto (POST /api/projects)
   └─> Actualiza lista de proyectos

5. Usuario exporta DXF
   └─> Se usa el proyecto actualmente cargado
   └─> POST /api/export-dxf con data actual
```

---

## ⚠️ CONSIDERACIONES IMPORTANTES

### **Retrocompatibilidad**

- Los endpoints actuales (`/api/projects/current`) pueden seguir existiendo
- O se deprecan a favor del nuevo sistema

### **Migración de Datos**

Si ya tienes datos en `/api/projects/current`, el backend debe:
1. Crear una tabla `projects` nueva
2. Migrar el proyecto actual como primer registro
3. O mantener ambos sistemas en paralelo temporalmente

### **Validación**

- El nombre del proyecto debe ser único (validar en backend)
- Manejar errores de red (mostrar al usuario)
- Confirmación antes de sobrescribir

### **Optimización**

- Cachear la lista de proyectos localmente
- Solo recargar al crear/eliminar proyectos
- Indicador visual de "guardando..." mientras se ejecuta el debounce

---

## 🎯 PRIORIDADES DE IMPLEMENTACIÓN

### **Fase 1: Backend** (Prioridad ALTA)
1. ✅ Crear tabla `projects` en PostgreSQL
2. ✅ Implementar endpoints CRUD para proyectos
3. ✅ Migrar datos existentes (si los hay)
4. ✅ Actualizar CORS si es necesario

### **Fase 2: Frontend API** (Prioridad ALTA)
1. ✅ Agregar funciones en [api.ts](src/api.ts)
2. ✅ Agregar tipos en [types.ts](src/types.ts)

### **Fase 3: Frontend UI** (Prioridad ALTA)
1. ✅ State para proyectos y proyecto actual
2. ✅ Dropdown selector de proyectos
3. ✅ Botón "Nuevo proyecto"
4. ✅ Input para nombre del proyecto
5. ✅ Auto-guardado con nuevo sistema

### **Fase 4: Pulido** (Prioridad MEDIA)
1. 🟡 Confirmación antes de cambiar proyecto sin guardar
2. 🟡 Indicador de "guardando..."
3. 🟡 Botón eliminar proyecto
4. 🟡 Búsqueda/filtrado de proyectos

---

## ❓ PREGUNTAS PARA EL BACKEND

1. **¿Quieres mantener `/api/projects/current`** o deprecarlo?
2. **¿Validación de nombre único** en backend o frontend?
3. **¿Soft delete** (marcar como eliminado) o **hard delete**?
4. **¿Paginación** para la lista de proyectos si hay muchos?
5. **¿Multi-usuario?** (cada usuario ve solo sus proyectos, o todos comparten)

---

## 📝 SIGUIENTE PASO

**¿Qué prefieres hacer primero?**

A. **Coordinar con el backend** - Definir exactamente los endpoints y el contrato de la API
B. **Prototipar la UI** - Crear el dropdown y botones en el frontend (sin funcionalidad)
C. **Revisar el flujo propuesto** - Ajustar antes de implementar

Recomiendo: **Opción A** - Primero coordinamos con el backend para que implemente los endpoints, y luego adaptamos el frontend.
