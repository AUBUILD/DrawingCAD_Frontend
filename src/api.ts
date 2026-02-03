import type { PreviewRequest, PreviewResponse } from './types';

const BASE = (import.meta as any).env?.VITE_API_URL ?? '';

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

export async function exportDxf(payload: PreviewRequest): Promise<Blob> {
  const res = await fetch(`${BASE}/api/export-dxf`, {
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
