import * as THREE from 'three';

export function addXSegmentTo(
  parent: THREE.Object3D,
  xa: number,
  xb: number,
  yU: number,
  zU: number,
  radiusU: number,
  mat: THREE.Material,
) {
  const lo = Math.min(xa, xb);
  const hi = Math.max(xa, xb);
  const Lx = hi - lo;
  if (!(Lx > 1e-6)) return;
  if (!(radiusU > 0)) return;
  const geom = new THREE.CylinderGeometry(radiusU, radiusU, Lx, 12);
  geom.rotateZ(Math.PI / 2);
  const mesh = new THREE.Mesh(geom, mat);
  mesh.position.set((lo + hi) / 2, yU, zU);
  parent.add(mesh);
}

export function addYSegmentTo(
  parent: THREE.Object3D,
  xU: number,
  y0U: number,
  y1U: number,
  zU: number,
  radiusU: number,
  mat: THREE.Material,
) {
  const lo = Math.min(y0U, y1U);
  const hi = Math.max(y0U, y1U);
  const Ly = hi - lo;
  if (!(Ly > 1e-6)) return;
  if (!(radiusU > 0)) return;
  const geom = new THREE.CylinderGeometry(radiusU, radiusU, Ly, 12);
  const mesh = new THREE.Mesh(geom, mat);
  mesh.position.set(xU, (lo + hi) / 2, zU);
  parent.add(mesh);
}

export function addArbitrarySegmentTo(
  parent: THREE.Object3D,
  x0: number,
  y0: number,
  z0: number,
  x1: number,
  y1: number,
  z1: number,
  radiusU: number,
  mat: THREE.Material,
) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const dz = z1 - z0;
  const L = Math.hypot(dx, dy, dz);
  if (!(L > 1e-6)) return;
  if (!(radiusU > 0)) return;

  const geom = new THREE.CylinderGeometry(radiusU, radiusU, L, 12);
  const mesh = new THREE.Mesh(geom, mat);

  const dir = new THREE.Vector3(dx, dy, dz).normalize();
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
  mesh.quaternion.copy(q);

  mesh.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  parent.add(mesh);
}

export function createConcreteMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: 0x14b8a6,
    roughness: 0.48,
    metalness: 0.05,
    transparent: true,
    opacity: 0.20,
  });
}

export function createSteelMaterials() {
  return {
    main: new THREE.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.35, metalness: 0.25 }),
    main2: new THREE.MeshStandardMaterial({ color: 0xfb923c, roughness: 0.35, metalness: 0.25 }),
    bastonL1: new THREE.MeshStandardMaterial({ color: 0x22c55e, roughness: 0.40, metalness: 0.15 }),
    bastonL2: new THREE.MeshStandardMaterial({ color: 0x06b6d4, roughness: 0.40, metalness: 0.15 }),
    extra: new THREE.MeshStandardMaterial({ color: 0xd946ef, roughness: 0.45, metalness: 0.10 }),
  };
}

export function createStirrupMaterials() {
  return {
    b: new THREE.MeshStandardMaterial({ color: 0x22c55e, roughness: 0.55, metalness: 0.05 }),
    c: new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.55, metalness: 0.05 }),
    r: new THREE.MeshStandardMaterial({ color: 0x06b6d4, roughness: 0.55, metalness: 0.05 }),
    mid: new THREE.MeshStandardMaterial({ color: 0xd946ef, roughness: 0.55, metalness: 0.05 }),
  };
}
