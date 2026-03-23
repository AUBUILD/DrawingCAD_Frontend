# 📱 Instrucciones para Integración con el Frontend

## 🔄 Cambios Importantes en la API

### Endpoints Actualizados

**ANTES (deprecado):**
- ❌ `GET /api/state`
- ❌ `PUT /api/state`

**AHORA (usar):**
- ✅ `GET /api/projects/current`
- ✅ `PUT /api/projects/current`

---

## 🔗 Configuración de URLs

### Desarrollo Local
```javascript
const API_URL = 'http://localhost:8001';
```

### Producción (después de desplegar en Render)
```javascript
const API_URL = 'https://beamdraw-backend.onrender.com';
```

**Recomendación**: Usar variable de entorno
```javascript
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8001';
```

Archivo `.env.local` en el frontend:
```env
VITE_API_URL=http://localhost:8001
```

Archivo `.env.production`:
```env
VITE_API_URL=https://beamdraw-backend.onrender.com
```

---

## 💾 Guardar Proyecto

### Ejemplo JavaScript/TypeScript

```javascript
async function saveProject(developments) {
  try {
    const response = await fetch(`${API_URL}/api/projects/current`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        developments: developments
      })
    });

    if (!response.ok) {
      throw new Error(`Error: ${response.status}`);
    }

    const result = await response.json();
    console.log('Proyecto guardado:', result);
    return result;
  } catch (error) {
    console.error('Error al guardar:', error);
    throw error;
  }
}
```

### Ejemplo con Axios

```javascript
import axios from 'axios';

async function saveProject(developments) {
  try {
    const { data } = await axios.put(`${API_URL}/api/projects/current`, {
      developments
    });
    console.log('Proyecto guardado:', data);
    return data;
  } catch (error) {
    console.error('Error al guardar:', error);
    throw error;
  }
}
```

---

## 📥 Cargar Proyecto

### Ejemplo JavaScript/TypeScript

```javascript
async function loadProject() {
  try {
    const response = await fetch(`${API_URL}/api/projects/current`);
    
    if (!response.ok) {
      throw new Error(`Error: ${response.status}`);
    }

    const data = await response.json();
    console.log('Proyecto cargado:', data);
    return data.developments;
  } catch (error) {
    console.error('Error al cargar:', error);
    // Si no hay proyecto, retornar array vacío
    return [];
  }
}
```

### Ejemplo con Axios

```javascript
async function loadProject() {
  try {
    const { data } = await axios.get(`${API_URL}/api/projects/current`);
    return data.developments;
  } catch (error) {
    console.error('Error al cargar:', error);
    return [];
  }
}
```

---

## 📊 Vista Previa (sin cambios)

```javascript
async function getPreview(developments) {
  const response = await fetch(`${API_URL}/api/preview`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ developments })
  });
  
  const data = await response.json();
  return data; // { developments: [...], bounds: {...} }
}
```

---

## 📥 Exportar DXF (sin cambios)

```javascript
async function exportDXF(developments, filename = 'proyecto.dxf') {
  const response = await fetch(`${API_URL}/api/export-dxf?filename=${filename}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ developments })
  });
  
  const blob = await response.blob();
  
  // Descargar archivo
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  window.URL.revokeObjectURL(url);
}
```

---

## 🏗️ Estructura de Datos

### Formato de un Development

```typescript
interface Development {
  name: string;              // "DEV-01"
  nodes: Node[];             // Array de nodos
  spans: Span[];             // Array de tramos (length = nodes.length - 1)
  d: number;                 // 0.25 (metros)
  unit_scale: number;        // 100.0
  x0: number;                // 0.0
  y0: number;                // 0.0 (o separación vertical)
  steel_cover_top: number;   // 0.04 (metros)
  steel_cover_bottom: number;// 0.04 (metros)
}

interface Node {
  a1: number;
  a2: number;
  b1: number;
  b2: number;
  project_a: boolean;
  project_b: boolean;
  // Acero (opcionales)
  steel_top_1_kind?: string;    // "continuous" | "hook" | "development"
  steel_top_2_kind?: string;
  steel_bottom_1_kind?: string;
  steel_bottom_2_kind?: string;
}

interface Span {
  L: number;  // Longitud en metros
  h: number;  // Altura en metros
  b?: number; // Ancho (UI only, opcional)
  // Acero (opcionales)
  steel_top?: SteelMeta;
  steel_bottom?: SteelMeta;
}

interface SteelMeta {
  qty: number;      // 3
  diameter: string; // "3/4" | "5/8" | "1/2" | "1" | "1-3/8"
}
```

---

## 🔄 Flujo Completo de Auto-guardado

```javascript
// Estado global o store
let developments = [];
let saveTimeout = null;

// Función de auto-guardado con debounce
function autoSave() {
  clearTimeout(saveTimeout);
  saveTimeout = setTimeout(async () => {
    try {
      await saveProject(developments);
      console.log('✅ Guardado automático');
    } catch (error) {
      console.error('❌ Error en guardado automático:', error);
    }
  }, 2000); // Espera 2 segundos después del último cambio
}

// Cuando el usuario modifica algo
function onDevelopmentChange(newDevelopments) {
  developments = newDevelopments;
  autoSave();
}

// Al cargar la aplicación
async function initApp() {
  try {
    developments = await loadProject();
    console.log('Proyecto cargado al inicio');
  } catch (error) {
    console.error('Error al cargar proyecto inicial:', error);
    developments = [];
  }
}
```

---

## 🧪 Verificar Conexión

### Health Check Simple

```javascript
async function checkBackendHealth() {
  try {
    const response = await fetch(`${API_URL}/api/health`);
    const data = await response.json();
    return data.status === 'ok';
  } catch (error) {
    console.error('Backend no disponible:', error);
    return false;
  }
}
```

### Health Check con Base de Datos

```javascript
async function checkDatabaseHealth() {
  try {
    const response = await fetch(`${API_URL}/api/health/db`);
    const data = await response.json();
    console.log('Estado de BD:', data);
    return data.status === 'ok';
  } catch (error) {
    console.error('Error al verificar BD:', error);
    return false;
  }
}
```

---

## 🚨 Manejo de Errores

```javascript
async function saveProjectWithRetry(developments, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      return await saveProject(developments);
    } catch (error) {
      console.warn(`Intento ${i + 1} de ${retries} falló:`, error);
      
      if (i === retries - 1) {
        // Último intento falló
        alert('No se pudo guardar el proyecto. Verifica tu conexión.');
        throw error;
      }
      
      // Esperar antes de reintentar (exponential backoff)
      await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
    }
  }
}
```

---

## 📝 Notas Importantes

### CORS
- El backend ya está configurado para aceptar:
  - `http://localhost:5173` (desarrollo)
  - `http://127.0.0.1:5173` (desarrollo)
- Si tu frontend usa otro puerto, necesitas actualizar `BEAMDRAW_ALLOWED_ORIGINS` en el backend

### Base de Datos
- El proyecto se guarda automáticamente en Neon PostgreSQL
- Si `DATABASE_URL` no está configurada, los endpoints de persistencia retornarán error 501
- El endpoint `/api/projects/current` siempre retorna el proyecto más reciente

### Límites
- No hay límite de tamaño para los proyectos actualmente
- El plan gratuito de Render tiene cold starts (~30 segundos si no hay actividad)

---

## ✅ Checklist de Integración

- [ ] Actualizar URLs de `/api/state` a `/api/projects/current`
- [ ] Configurar variable de entorno `VITE_API_URL`
- [ ] Implementar auto-guardado con debounce
- [ ] Cargar proyecto al iniciar la aplicación
- [ ] Agregar health checks
- [ ] Manejar errores de red y timeouts
- [ ] Probar en desarrollo local (localhost:8001)
- [ ] Actualizar URL de producción después del deploy
- [ ] Verificar CORS si frontend está en otro dominio

---

## 🔗 Endpoints Completos

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/api/health` | Estado del servidor |
| GET | `/api/health/db` | Estado de la base de datos |
| GET | `/api/projects/current` | Cargar proyecto actual |
| PUT | `/api/projects/current` | Guardar proyecto actual |
| POST | `/api/preview` | Vista previa de desarrollos |
| POST | `/api/export-dxf` | Exportar a DXF |
| GET | `/docs` | Documentación Swagger |

---

## 🆘 Soporte

Si encuentras problemas:
1. Verifica que el backend esté corriendo (`/api/health`)
2. Revisa la consola del navegador para errores CORS
3. Confirma que la estructura de datos sea correcta
4. Usa `/docs` para probar endpoints manualmente
