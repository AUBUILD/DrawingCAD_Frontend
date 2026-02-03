# ⚠️ PROBLEMA: ¿Cómo sé que NO está creando múltiples proyectos duplicados?

## 🎯 RESPUESTA DIRECTA

**Actualmente NO LO SABES con certeza** porque:

❌ El frontend **NO mantiene un ID de proyecto**
❌ El endpoint `/api/projects/current` es **ambiguo** - ¿qué es "current"?
❌ No hay forma de verificar desde el frontend si está actualizando o creando

---

## 🔍 CÓMO FUNCIONA ACTUALMENTE

### **Frontend** (lo que vemos)
```typescript
// src/api.ts línea 47-56
export async function saveState(payload: PreviewRequest): Promise<void> {
  const res = await fetch(`${BASE}/api/projects/current`, {
    method: 'PUT',  // ← PUT sugiere "actualizar"
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  // ❌ NO recibe ni envía un ID de proyecto
  // ❌ NO sabe qué proyecto está actualizando
}
```

### **Backend** (lo que DEBE estar haciendo)

El backend puede estar implementando `/api/projects/current` de 3 formas:

#### **Opción 1: UPSERT (Actualizar o Insertar) - Probablemente esto**
```python
# Backend FastAPI
@app.put("/api/projects/current")
def save_current_project(data: PreviewRequest):
    # Siempre actualiza el MISMO registro (id=1, por ejemplo)
    # O borra todo y guarda nuevo (TRUNCATE + INSERT)
    db.execute("""
        INSERT INTO beamdraw_state (id, data, updated_at)
        VALUES (1, %s, NOW())
        ON CONFLICT (id) DO UPDATE
        SET data = %s, updated_at = NOW()
    """, (data, data))
    
    # ✅ Solo hay 1 registro en la tabla
    # ✅ Siempre se actualiza el mismo
```

#### **Opción 2: Último registro (podría crear duplicados)**
```python
@app.put("/api/projects/current")
def save_current_project(data: PreviewRequest):
    # ❌ Podría estar creando un nuevo registro cada vez
    db.execute("""
        INSERT INTO beamdraw_state (data, created_at)
        VALUES (%s, NOW())
    """, (data,))
    
    # ❌ PROBLEMA: Cada guardado crea un nuevo registro
    # ❌ La tabla crece indefinidamente
```

#### **Opción 3: Flag "is_current"**
```python
@app.put("/api/projects/current")
def save_current_project(data: PreviewRequest):
    # Marca todos como no actuales
    db.execute("UPDATE beamdraw_state SET is_current = FALSE")
    
    # Crea nuevo registro marcado como actual
    db.execute("""
        INSERT INTO beamdraw_state (data, is_current, created_at)
        VALUES (%s, TRUE, NOW())
    """, (data,))
    
    # ❌ PROBLEMA: Crea un nuevo registro cada vez
    # ⚠️ Necesita limpieza periódica
```

---

## 🧪 CÓMO VERIFICAR EN LA BASE DE DATOS

### **Paso 1: Conectarte a PostgreSQL**

```bash
# Si usas Neon PostgreSQL (según FRONTEND_INTEGRATION.md)
psql "postgresql://usuario:password@host/database"

# O desde el dashboard de Neon, abre SQL Editor
```

### **Paso 2: Ver la tabla actual**

```sql
-- Ver la estructura de la tabla
\d beamdraw_state

-- Ver TODOS los registros
SELECT id, created_at, updated_at, 
       LENGTH(data::text) as json_size
FROM beamdraw_state
ORDER BY updated_at DESC;
```

### **Paso 3: Interpretar resultados**

**Escenario A: Solo 1 registro (✅ CORRECTO)**
```
 id |     created_at      |     updated_at      | json_size
----+---------------------+---------------------+-----------
  1 | 2026-02-03 10:00:00 | 2026-02-03 14:30:00 |      2048
```
✅ **Solo hay 1 proyecto**
✅ **Se actualiza el mismo (updated_at cambia)**
✅ **No hay duplicados**

**Escenario B: Múltiples registros (❌ PROBLEMA)**
```
 id |     created_at      |     updated_at      | json_size
----+---------------------+---------------------+-----------
 15 | 2026-02-03 14:30:00 | 2026-02-03 14:30:00 |      2048
 14 | 2026-02-03 14:20:00 | 2026-02-03 14:20:00 |      2045
 13 | 2026-02-03 14:10:00 | 2026-02-03 14:10:00 |      2050
 12 | 2026-02-03 14:00:00 | 2026-02-03 14:00:00 |      2040
```
❌ **Se está creando un nuevo registro cada vez**
❌ **Hay duplicados**
❌ **La tabla crece indefinidamente**

---

## 🔧 CÓMO SABER EN TIEMPO REAL (Sin ir a la DB)

### **Modificar api.ts para ver la respuesta del backend**

```typescript
// src/api.ts
export async function saveState(payload: PreviewRequest): Promise<void> {
  const res = await fetch(`${BASE}/api/projects/current`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `HTTP ${res.status}`);
  }
  
  // ✅ AGREGAR: Leer la respuesta del backend
  const result = await res.json();
  console.log('✅ Guardado en DB:', {
    id: result.id,              // ← El backend debería devolver el ID
    created_at: result.created_at,
    updated_at: result.updated_at,
    was_created: result.created_at === result.updated_at  // ← Si son iguales, se creó nuevo
  });
}
```

**Luego en la consola del navegador (F12):**
```javascript
// Si siempre ves el MISMO id:
✅ Guardado en DB: { id: 1, created_at: "...", updated_at: "..." }
✅ Guardado en DB: { id: 1, created_at: "...", updated_at: "..." }
✅ Se está actualizando el mismo registro

// Si ves IDs diferentes:
❌ Guardado en DB: { id: 15, created_at: "...", updated_at: "..." }
❌ Guardado en DB: { id: 16, created_at: "...", updated_at: "..." }
❌ Guardado en DB: { id: 17, created_at: "...", updated_at: "..." }
❌ PROBLEMA: Se están creando registros nuevos
```

---

## 💡 SOLUCIÓN CORRECTA: Usar IDs de Proyecto

### **Lo que DEBERÍA hacer el backend:**

```python
# Backend - /api/projects/current
@app.get("/api/projects/current")
def get_current_project():
    project = db.query("""
        SELECT id, data, created_at, updated_at 
        FROM beamdraw_state 
        ORDER BY updated_at DESC 
        LIMIT 1
    """).fetchone()
    
    return {
        "id": project.id,          # ← DEVOLVER ID
        "developments": project.data["developments"],
        "created_at": project.created_at,
        "updated_at": project.updated_at
    }

@app.put("/api/projects/current")
def update_current_project(data: PreviewRequest):
    # Siempre actualiza el registro con id=1 (o el último)
    result = db.execute("""
        INSERT INTO beamdraw_state (id, data, updated_at)
        VALUES (1, %s, NOW())
        ON CONFLICT (id) DO UPDATE
        SET data = EXCLUDED.data, updated_at = NOW()
        RETURNING id, created_at, updated_at
    """, (data,))
    
    project = result.fetchone()
    
    return {
        "id": project.id,           # ← DEVOLVER ID
        "created_at": project.created_at,
        "updated_at": project.updated_at
    }
```

### **Lo que DEBERÍA hacer el frontend:**

```typescript
// src/App.tsx
const [currentProjectId, setCurrentProjectId] = useState<number | null>(null);

// Al cargar
useEffect(() => {
  (async () => {
    const stored = await fetchState();
    setCurrentProjectId(stored.id);  // ← Guardar el ID
    // ... cargar datos
  })();
}, []);

// Al guardar
useEffect(() => {
  const t = window.setTimeout(async () => {
    try {
      const result = await saveState(payload);
      
      if (!currentProjectId) {
        setCurrentProjectId(result.id);  // ← Guardar ID si es nuevo
      }
      
      // Verificar que el ID no cambió
      if (result.id !== currentProjectId) {
        console.warn('⚠️ Se creó un nuevo proyecto!', {
          esperado: currentProjectId,
          recibido: result.id
        });
      }
    } catch (error) {
      console.error('Error al guardar:', error);
    }
  }, 600);
  
  return () => window.clearTimeout(t);
}, [payload, currentProjectId]);
```

---

## 📋 CHECKLIST DE VERIFICACIÓN

**Para saber si está funcionando correctamente:**

- [ ] **Revisar tabla en PostgreSQL**
  - ¿Cuántos registros hay en `beamdraw_state`?
  - ¿El `id` es siempre el mismo?
  - ¿El `updated_at` cambia pero `id` no?

- [ ] **Agregar logs en api.ts**
  - ¿El backend devuelve un `id` en la respuesta?
  - ¿El `id` es constante entre guardados?

- [ ] **Probar manualmente**
  - Modifica un valor
  - Espera 600ms
  - Modifica otro valor
  - Espera 600ms
  - Verifica en DB: ¿hay 1 o 2 registros?

---

## 🎯 RECOMENDACIÓN INMEDIATA

**Opción 1: Pregunta al backend** (más rápido)
```
"¿El endpoint PUT /api/projects/current siempre actualiza el MISMO 
registro, o crea uno nuevo cada vez? ¿Puedes verificar en la tabla 
beamdraw_state cuántos registros hay?"
```

**Opción 2: Revisa la DB tú mismo**
```sql
SELECT COUNT(*) FROM beamdraw_state;
-- Si COUNT(*) > 1, hay duplicados
```

**Opción 3: Agrega el log temporal**
```typescript
// En src/api.ts después de saveState
console.log('✅ Respuesta del backend:', await res.json());
```

---

## ⚠️ RESPUESTA A TU PREGUNTA

**"¿Cómo sé que no está creando múltiples proyectos?"**

**Respuesta corta:** Actualmente **NO LO SABES** porque el frontend no tiene visibilidad del ID.

**Solución:**
1. Verifica en la base de datos con la query SQL de arriba
2. O pregúntale al backend si devuelve el ID en la respuesta
3. Idealmente, implementa el sistema de IDs propuesto

¿Quieres que te ayude a verificarlo agregando los logs o prefieres revisar la DB directamente?
