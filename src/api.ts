import type { ImportDxfResponse, PreviewRequest, PreviewResponse, TemplateDxfInfo } from './types';

function normalizeBaseUrl(raw: unknown): string {
  const v = typeof raw === 'string' ? raw.trim() : '';
  if (!v) return '';
  return v.replace(/\/+$/, '');
}

// Prod on Render: set VITE_API_URL to your backend base (e.g. https://beamdraw-backend.onrender.com)
// Back-compat: accept VITE_API_BASE from older docs.
const ENV = (import.meta as any).env ?? {};
const BASE = normalizeBaseUrl(ENV.VITE_API_URL ?? ENV.VITE_API_BASE ?? '');

export async function fetchPreview(payload: PreviewRequest): Promise<PreviewResponse> {
  const res = await fetch(`${BASE}/api/preview`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `HTTP ${res.status}`);
  }

  return res.json();
}

export async function exportDxf(
  payload: PreviewRequest,
  opts?: { cascoLayer?: string; steelLayer?: string; drawSteel?: boolean }
): Promise<Blob> {
  const q = new URLSearchParams();
  if (opts?.cascoLayer) q.set('casco_layer', opts.cascoLayer);
  if (opts?.steelLayer) q.set('steel_layer', opts.steelLayer);
  if (opts?.drawSteel !== undefined) q.set('draw_steel', opts.drawSteel ? 'true' : 'false');

  const res = await fetch(`${BASE}/api/export-dxf${q.toString() ? `?${q.toString()}` : ''}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `HTTP ${res.status}`);
  }

  return res.blob();
}

// Optional persistence (Postgres). Backend may not be configured; callers should handle errors.
export async function fetchState(): Promise<PreviewRequest> {
  const res = await fetch(`${BASE}/api/projects/current`, { method: 'GET' });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `HTTP ${res.status}`);
  }
  return res.json();
}

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
}

export async function importDxf(file: File): Promise<ImportDxfResponse> {
  const fd = new FormData();
  fd.append('file', file);

  const res = await fetch(`${BASE}/api/import-dxf`, {
    method: 'POST',
    body: fd,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `HTTP ${res.status}`);
  }

  return res.json();
}

export async function uploadTemplateDxf(file: File): Promise<TemplateDxfInfo> {
  const fd = new FormData();
  fd.append('file', file);

  const res = await fetch(`${BASE}/api/template-dxf`, {
    method: 'POST',
    body: fd,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `HTTP ${res.status}`);
  }

  return res.json();
}

export async function getTemplateDxf(): Promise<TemplateDxfInfo> {
  const res = await fetch(`${BASE}/api/template-dxf`, { method: 'GET' });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `HTTP ${res.status}`);
  }
  return res.json();
}

export async function clearTemplateDxf(): Promise<void> {
  const res = await fetch(`${BASE}/api/template-dxf`, { method: 'DELETE' });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `HTTP ${res.status}`);
  }
}
