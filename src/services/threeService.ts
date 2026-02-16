/**
 * Servicios para utilidades de Three.js
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { DevelopmentIn, PreviewResponse } from '../types';
import type { Selection, Bounds } from './canvasService';
import { computeNodeOrigins, mToUnits, computeSpanRangeX } from './geometryService';
import { clampNumber } from '../utils';

const ORTHO_FRUSTUM_SIZE = 220;

// ============================================================================
// THREE.JS UTILITIES
// ============================================================================

export function setEmissiveOnObject(obj: THREE.Object3D, color: number, intensity: number) {
  obj.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) {
      const mat = (child as THREE.Mesh).material;
      if (Array.isArray(mat)) {
        mat.forEach((m) => {
          if ((m as any).emissive) {
            (m as any).emissive.setHex(color);
            (m as any).emissiveIntensity = intensity;
          }
        });
      } else {
        if ((mat as any).emissive) {
          (mat as any).emissive.setHex(color);
          (mat as any).emissiveIntensity = intensity;
        }
      }
    }
  });
}

export function disposeObject3D(obj: THREE.Object3D) {
  obj.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) {
      const mesh = child as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
      const mat = mesh.material;
      if (Array.isArray(mat)) {
        mat.forEach((m) => m.dispose());
      } else if (mat) {
        mat.dispose();
      }
    }
  });
}

export function setOrthoFrustum(camera: THREE.OrthographicCamera, aspect: number) {
  const a = Number.isFinite(aspect) && aspect > 1e-6 ? aspect : 1;
  camera.left = (-ORTHO_FRUSTUM_SIZE * a) / 2;
  camera.right = (ORTHO_FRUSTUM_SIZE * a) / 2;
  camera.top = ORTHO_FRUSTUM_SIZE / 2;
  camera.bottom = -ORTHO_FRUSTUM_SIZE / 2;
}

export function fitCameraToObject(
  camera: THREE.PerspectiveCamera | THREE.OrthographicCamera,
  controls: OrbitControls,
  object: THREE.Object3D,
  viewport?: { w: number; h: number }
) {
  const box = new THREE.Box3().setFromObject(object);
  if (!Number.isFinite(box.min.x) || !Number.isFinite(box.max.x)) return;

  const size = new THREE.Vector3();
  box.getSize(size);
  const center = new THREE.Vector3();
  box.getCenter(center);

  const maxSize = Math.max(size.x, size.y, size.z, 1);

  controls.target.copy(center);

  if ((camera as any).isPerspectiveCamera) {
    const cam = camera as THREE.PerspectiveCamera;
    const fitHeightDistance = maxSize / (2 * Math.tan((cam.fov * Math.PI) / 360));
    const fitWidthDistance = fitHeightDistance / (cam.aspect || 1);
    const distance = 1.2 * Math.max(fitHeightDistance, fitWidthDistance);

    cam.position.set(center.x + distance, center.y + distance * 0.6, center.z + distance);
    cam.near = Math.max(0.01, distance / 2000);
    cam.far = Math.max(2000, distance * 40);
    cam.updateProjectionMatrix();

    // Permitir mucho más zoom-in.
    controls.minDistance = 0.01;
    controls.maxDistance = Math.max(50, distance * 40);
  } else {
    const cam = camera as THREE.OrthographicCamera;
    const w = viewport?.w ?? 1;
    const h = viewport?.h ?? 1;
    const aspect = w / Math.max(1, h);

    setOrthoFrustum(cam, aspect);

    const distance = 2.2 * maxSize;
    const dir = new THREE.Vector3(1, 0.6, 1).normalize();
    cam.position.copy(center.clone().add(dir.multiplyScalar(distance)));
    cam.near = Math.max(0.01, distance / 2000);
    cam.far = Math.max(2000, distance * 40);
    cam.lookAt(center);
    cam.updateMatrixWorld(true);

    // Ajustar zoom para encuadrar el bounding box proyectado en cámara.
    const corners = [
      new THREE.Vector3(box.min.x, box.min.y, box.min.z),
      new THREE.Vector3(box.min.x, box.min.y, box.max.z),
      new THREE.Vector3(box.min.x, box.max.y, box.min.z),
      new THREE.Vector3(box.min.x, box.max.y, box.max.z),
      new THREE.Vector3(box.max.x, box.min.y, box.min.z),
      new THREE.Vector3(box.max.x, box.min.y, box.max.z),
      new THREE.Vector3(box.max.x, box.max.y, box.min.z),
      new THREE.Vector3(box.max.x, box.max.y, box.max.z),
    ];

    const inv = cam.matrixWorldInverse.clone();
    let minX = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    for (const p of corners) {
      p.applyMatrix4(inv);
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y);
      maxY = Math.max(maxY, p.y);
    }

    const boxW = Math.max(1e-6, maxX - minX);
    const boxH = Math.max(1e-6, maxY - minY);
    const viewW = ORTHO_FRUSTUM_SIZE * aspect;
    const viewH = ORTHO_FRUSTUM_SIZE;
    const zoomFit = 0.90 * Math.min(viewW / boxW, viewH / boxH);
    cam.zoom = Math.min(200, Math.max(0.01, zoomFit));
    cam.updateProjectionMatrix();

    // Límites de zoom para ortográfica.
    (controls as any).minZoom = 0.01;
    (controls as any).maxZoom = 200;
  }

  controls.update();
}

export function computeZoomBounds(dev: DevelopmentIn, preview: PreviewResponse, sel: Selection): Bounds | null {
  const bounds = preview.bounds as any;
  if (!bounds) return null;

  if (sel.kind === 'span' && typeof sel.index === 'number') {
    const origins = computeNodeOrigins(dev);
    const { x1, x2 } = computeSpanRangeX(dev, origins, sel.index);
    const margin = Math.abs(x2 - x1) * 0.1;
    const yMargin = (bounds.max_y - bounds.min_y) * 0.1;
    return {
      min_x: x1 - margin,
      max_x: x2 + margin,
      min_y: bounds.min_y - yMargin,
      max_y: bounds.max_y + yMargin,
    };
  }

  if (sel.kind === 'node' && typeof sel.index === 'number') {
    const origins = computeNodeOrigins(dev);
    const nx = origins[sel.index] ?? 0;
    const nodes = dev.nodes ?? [];
    const a2 = mToUnits(dev, clampNumber(nodes[sel.index]?.a2 ?? 0, 0));
    const xc = nx + a2;
    const w = Math.abs(bounds.max_x - bounds.min_x) * 0.15;
    const h = Math.abs(bounds.max_y - bounds.min_y) * 0.15;
    return {
      min_x: xc - w,
      max_x: xc + w,
      min_y: bounds.min_y - h,
      max_y: bounds.max_y + h,
    };
  }

  return null;
}
