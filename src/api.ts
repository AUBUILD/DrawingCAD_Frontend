import type {
  BackendAppConfig,
  ExportDxfRequest,
  ForceImportResponse,
  ForceImportTarget,
  ImportDxfBatchResponse,
  ImportDxfResponse,
  PreviewRequest,
  PreviewResponse,
  TemplateDxfInfo,
} from './types';

function normalizeBaseUrl(raw: unknown): string {
  const v = typeof raw === 'string' ? raw.trim() : '';
  if (!v) return '';
  return v.replace(/\/+$/, '');
}

// Prod on Render: set VITE_API_URL to your backend base (e.g. https://beamdraw-backend.onrender.com)
// Back-compat: accept VITE_API_BASE from older docs.
const BASE = normalizeBaseUrl(import.meta.env.VITE_API_URL ?? import.meta.env.VITE_API_BASE ?? '');

let AUTH_TOKEN = '';

export type BackendVersionInfo = {
  service: string;
  backend_version: string;
  commit: string;
};

export type AuthUser = {
  id: number;
  email: string;
};

export type AuthOut = {
  access_token: string;
  token_type: 'bearer';
  user: AuthUser;
};

export type VariantScope = {
  project_name: string;
  story_i: string;
  story_f: string;
  beam_code: string;
  beam_type: 'convencional' | 'prefabricado';
  variant_name: string;
};

export type VariantOut = VariantScope & {
  data: PreviewRequest;
  updated_at?: string | null;
};

export type VariantListItem = VariantScope & {
  updated_at: string;
};

export type SaveLoadOpts = {
  token?: string | null;
  variant?: VariantScope | null;
};

function resolveToken(token?: string | null): string {
  return (token ?? AUTH_TOKEN ?? '').trim();
}

function jsonHeaders(token?: string | null): HeadersInit {
  const t = resolveToken(token);
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (t) headers.Authorization = `Bearer ${t}`;
  return headers;
}

function authHeaders(token?: string | null): HeadersInit {
  const t = resolveToken(token);
  const headers: Record<string, string> = {};
  if (t) headers.Authorization = `Bearer ${t}`;
  return headers;
}

let _onAuthExpired: (() => void) | null = null;

/** Register a callback invoked when any API call receives 401. */
export function onAuthExpired(cb: (() => void) | null): void {
  _onAuthExpired = cb;
}

async function parseError(res: Response): Promise<never> {
  if (res.status === 401 && _onAuthExpired) {
    _onAuthExpired();
  }
  const text = await res.text();
  throw new Error(text || `HTTP ${res.status}`);
}

export function setAuthToken(token: string | null | undefined): void {
  AUTH_TOKEN = (token ?? '').trim();
}

export function getAuthToken(): string {
  return AUTH_TOKEN;
}

export async function registerAuth(email: string, password: string): Promise<AuthOut> {
  const res = await fetch(`${BASE}/api/auth/register`, {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) return parseError(res);
  return res.json();
}

export async function loginAuth(email: string, password: string): Promise<AuthOut> {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) return parseError(res);
  return res.json();
}

export async function fetchMe(token?: string | null): Promise<AuthUser> {
  const res = await fetch(`${BASE}/api/auth/me`, {
    method: 'GET',
    headers: authHeaders(token),
  });
  if (!res.ok) return parseError(res);
  return res.json();
}

export async function fetchPreview(payload: PreviewRequest): Promise<PreviewResponse> {
  const res = await fetch(`${BASE}/api/preview`, {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify(payload),
  });
  if (!res.ok) return parseError(res);
  return res.json();
}

export async function fetchConfig(): Promise<BackendAppConfig> {
  const res = await fetch(`${BASE}/api/config`, { method: 'GET' });
  if (!res.ok) return parseError(res);
  return res.json();
}

export async function updateConfig(patch: Partial<BackendAppConfig>): Promise<BackendAppConfig> {
  const res = await fetch(`${BASE}/api/config`, {
    method: 'PUT',
    headers: jsonHeaders(),
    body: JSON.stringify(patch ?? {}),
  });
  if (!res.ok) return parseError(res);
  return res.json();
}

export async function exportDxf(
  payload: ExportDxfRequest,
  opts?: { cascoLayer?: string; steelLayer?: string; drawSteel?: boolean }
): Promise<Blob> {
  const q = new URLSearchParams();
  if (opts?.cascoLayer) q.set('casco_layer', opts.cascoLayer);
  if (opts?.steelLayer) q.set('steel_layer', opts.steelLayer);
  if (opts?.drawSteel !== undefined) q.set('draw_steel', opts.drawSteel ? 'true' : 'false');

  const res = await fetch(`${BASE}/api/export-dxf${q.toString() ? `?${q.toString()}` : ''}`, {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify(payload),
  });
  if (!res.ok) return parseError(res);
  return res.blob();
}

export async function fetchVariants(
  filters?: Partial<Pick<VariantScope, 'project_name' | 'story_i' | 'story_f' | 'beam_code' | 'beam_type'>>,
  token?: string | null
): Promise<VariantListItem[]> {
  const q = new URLSearchParams();
  if (filters?.project_name) q.set('project_name', filters.project_name);
  if (filters?.story_i) q.set('story_i', filters.story_i);
  if (filters?.story_f) q.set('story_f', filters.story_f);
  if (filters?.beam_code) q.set('beam_code', filters.beam_code);
  if (filters?.beam_type) q.set('beam_type', filters.beam_type);
  const res = await fetch(`${BASE}/api/variants${q.toString() ? `?${q.toString()}` : ''}`, {
    method: 'GET',
    headers: authHeaders(token),
  });
  if (!res.ok) return parseError(res);
  return res.json();
}

export async function fetchVariant(scope: VariantScope, token?: string | null): Promise<VariantOut> {
  const q = new URLSearchParams({
    project_name: scope.project_name,
    story_i: scope.story_i,
    story_f: scope.story_f,
    beam_code: scope.beam_code,
    beam_type: scope.beam_type,
    variant_name: scope.variant_name,
  });
  const res = await fetch(`${BASE}/api/variants/current?${q.toString()}`, {
    method: 'GET',
    headers: authHeaders(token),
  });
  if (!res.ok) return parseError(res);
  return res.json();
}

export async function saveVariant(scope: VariantScope, data: PreviewRequest, token?: string | null): Promise<void> {
  const res = await fetch(`${BASE}/api/variants/current`, {
    method: 'PUT',
    headers: jsonHeaders(token),
    body: JSON.stringify({ ...scope, data }),
  });
  if (!res.ok) return parseError(res);
}

export async function deleteProject(projectName: string, password: string, token?: string | null): Promise<void> {
  const res = await fetch(`${BASE}/api/projects/delete`, {
    method: 'POST',
    headers: jsonHeaders(token),
    body: JSON.stringify({ project_name: projectName, password }),
  });
  if (!res.ok) return parseError(res);
}

export async function assignProject(projectName: string, assigneeEmail: string, token?: string | null): Promise<void> {
  const res = await fetch(`${BASE}/api/projects/assign`, {
    method: 'POST',
    headers: jsonHeaders(token),
    body: JSON.stringify({ project_name: projectName, assignee_email: assigneeEmail }),
  });
  if (!res.ok) return parseError(res);
}

export type UserWithAssignment = AuthUser & { assigned?: boolean };

export async function fetchUsers(token?: string | null, projectName?: string): Promise<UserWithAssignment[]> {
  const q = new URLSearchParams();
  if (projectName) q.set('project_name', projectName);
  const res = await fetch(`${BASE}/api/users${q.toString() ? `?${q.toString()}` : ''}`, {
    method: 'GET',
    headers: authHeaders(token),
  });
  if (!res.ok) return parseError(res);
  return res.json();
}

export async function deleteAllProjects(password: string, token?: string | null): Promise<void> {
  const res = await fetch(`${BASE}/api/projects/delete-all`, {
    method: 'POST',
    headers: jsonHeaders(token),
    body: JSON.stringify({ project_name: '_all_', password }),
  });
  if (!res.ok) return parseError(res);
}

// Optional persistence (Postgres). Backend may not be configured; callers should handle errors.
export async function fetchState(opts?: SaveLoadOpts): Promise<PreviewRequest> {
  const variant = opts?.variant;
  if (variant) {
    try {
      const out = await fetchVariant(variant, opts?.token);
      return out.data;
    } catch (e: any) {
      const msg = String(e?.message ?? '');
      if (msg.includes('404')) return { developments: [] };
      throw e;
    }
  }

  const res = await fetch(`${BASE}/api/projects/current`, {
    method: 'GET',
    headers: authHeaders(opts?.token),
  });
  if (!res.ok) return parseError(res);
  return res.json();
}

export async function saveState(payload: PreviewRequest, opts?: SaveLoadOpts): Promise<void> {
  const variant = opts?.variant;
  if (variant) {
    await saveVariant(variant, payload, opts?.token);
    return;
  }

  const res = await fetch(`${BASE}/api/projects/current`, {
    method: 'PUT',
    headers: jsonHeaders(opts?.token),
    body: JSON.stringify(payload),
  });
  if (!res.ok) return parseError(res);
}

export async function importDxf(file: File): Promise<ImportDxfResponse> {
  const fd = new FormData();
  fd.append('file', file);
  let res: Response;
  try {
    res = await fetch(`${BASE}/api/import-dxf`, { method: 'POST', headers: authHeaders(), body: fd });
  } catch {
    throw new Error(
      'No se pudo conectar al servidor para importar DXF. '
      + (BASE ? `Verifica que el backend (${BASE}) este activo.` : 'VITE_API_URL no esta configurado.')
    );
  }
  if (!res.ok) return parseError(res);
  return res.json();
}

export async function importDxfBatch(file: File, orderBy: 'name' | 'location' = 'location'): Promise<ImportDxfBatchResponse> {
  const fd = new FormData();
  fd.append('file', file);
  const q = new URLSearchParams();
  q.set('order_by', orderBy);
  let res: Response;
  try {
    res = await fetch(`${BASE}/api/import-dxf-batch?${q.toString()}`, {
      method: 'POST',
      headers: authHeaders(),
      body: fd,
    });
  } catch {
    throw new Error(
      'No se pudo conectar al servidor para importar DXF batch. '
      + (BASE ? `Verifica que el backend (${BASE}) este activo.` : 'VITE_API_URL no esta configurado.')
    );
  }
  if (!res.ok) return parseError(res);
  return res.json();
}

async function importForces(
  path: string,
  file: File,
  targets: ForceImportTarget[],
): Promise<ForceImportResponse> {
  const fd = new FormData();
  fd.append('file', file);
  fd.append('payload', JSON.stringify({ targets }));
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: authHeaders(),
    body: fd,
  });
  if (!res.ok) return parseError(res);
  return res.json();
}

export async function importDesignForcesBatch(file: File, targets: ForceImportTarget[]): Promise<ForceImportResponse> {
  return importForces('/api/design/import-forces/batch', file, targets);
}

export async function importDesignForcesGroup(file: File, target: ForceImportTarget): Promise<ForceImportResponse> {
  return importForces('/api/design/import-forces/group', file, [target]);
}

export async function uploadTemplateDxf(file: File): Promise<TemplateDxfInfo> {
  const fd = new FormData();
  fd.append('file', file);
  const res = await fetch(`${BASE}/api/template-dxf`, {
    method: 'POST',
    headers: authHeaders(),
    body: fd,
  });
  if (!res.ok) return parseError(res);
  return res.json();
}

export async function getTemplateDxf(): Promise<TemplateDxfInfo> {
  const res = await fetch(`${BASE}/api/template-dxf`, {
    method: 'GET',
    headers: authHeaders(),
  });
  if (!res.ok) return parseError(res);
  return res.json();
}

export async function clearTemplateDxf(): Promise<void> {
  const res = await fetch(`${BASE}/api/template-dxf`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  if (!res.ok) return parseError(res);
}

export async function fetchBackendVersion(): Promise<BackendVersionInfo> {
  const res = await fetch(`${BASE}/api/version`, { method: 'GET' });
  if (!res.ok) return parseError(res);
  return res.json();
}
