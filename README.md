# BeamDraw Live (FastAPI + React)

Preview en tiempo real del casco (desarrollos) + exportación DXF.

## Backend (FastAPI)

En una terminal:

- `cd backend`
- `python -m venv .venv`
- `./.venv/Scripts/python -m pip install -r requirements.txt`
- `./.venv/Scripts/python -m uvicorn app:app --reload --port 8000`

Health: http://localhost:8000/api/health

### Persistencia (Postgres) (opcional)

El frontend intenta guardar/cargar el estado desde el backend usando:

- `GET /api/state`
- `PUT /api/state`

Para habilitarlo, configura `DATABASE_URL` al arrancar el backend (ejemplo):

- PowerShell: `setx DATABASE_URL "postgresql://user:pass@localhost:5432/beamdrawing"`

La tabla `beamdraw_state` se crea automáticamente.

## Frontend (React + Vite)

En otra terminal:

- `cd frontend`
- `npm install`
- `npm run dev`

Abrir: http://localhost:5173

Nota: el frontend llama a `/api/...` (URL relativa). En desarrollo, Vite proxyea `/api` hacia `http://localhost:8000`.

## Despliegue (producción)

Hay dos formas típicas:

### Opción A: Reverse proxy (recomendado)

- Backend:
  - Ejecuta FastAPI en el servidor (ejemplo):
    - `./.venv/Scripts/python -m uvicorn app:app --host 0.0.0.0 --port 8000`
- Frontend:
  - `cd frontend`
  - `npm ci`
  - `npm run build` (genera `frontend/dist`)
  - Sirve `frontend/dist` con Nginx/IIS/Apache.
- Proxy:
  - Configura tu servidor web para servir el frontend y reenviar `/api` al backend (puerto 8000).
  - Así el navegador no necesita CORS y la build del frontend no depende de `localhost`.

### Opción B: Frontend y backend en dominios distintos

- Define la variable de entorno del frontend:
  - `VITE_API_BASE=https://tu-backend.com`
- Reconstruye el frontend (`npm run build`).
- Asegúrate de habilitar CORS en el backend para el dominio del frontend.

## Formato de entrada

El editor usa JSON con esta forma:

- `developments`: lista de desarrollos
  - `spans`: lista de tramos `{L, h}` (metros)
    - opcional: `b` (UI-only; se persiste pero no afecta la geometría)
  - `nodes`: lista de nodos `{a1, a2, b1, b2, project_a, project_b}` (metros)
  - `d`, `unit_scale`, `x0`, `y0`

Notas:
- `unit_scale=100` dibuja en cm.
- `y0` sirve para separar desarrollos (por ejemplo -3.0, -6.0).
- Nodos tipo viga: `project_a=false` y `project_b=false`.
