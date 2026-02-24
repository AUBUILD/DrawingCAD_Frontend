import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { DevelopmentIn, PreviewResponse, BastonCfg, SpanIn, NodeIn } from '../types';
import type { Selection, Bounds, PolyPt } from '../services';
import {
  mToUnits,
  computeNodeOrigins,
  computeSpanRangeX,
  spanIndexAtX,
  nodeIndexAtX,
  spanBAtX,
  uniqueSortedNumbers,
  polySliceIntervals,
  abcrFromLegacyTokens,
  stirrupsPositionsFromTokens,
  stirrupsBlocksFromSpec,
  stirrupsRestSpacingFromSpec,
  lengthFromTableMeters,
  computeNodeMarkerX,
  computeSpanMidX,
  setEmissiveOnObject,
  disposeObject3D,
  setOrthoFrustum,
  fitCameraToObject,
  canvasMapper,
  normalizeBastonCfg,
  normalizeStirrupsSection,
  nodeSteelKind,
  nodeToFaceEnabled,
  nodeBastonLineKind,
  nodeBastonLineToFaceEnabled,
  type StirrupBlock,
} from '../services';
import {
  computeSpanSectionLayoutWithBastonesCm,
  diameterToCm,
  getSteelLayoutSettings,
} from '../steelLayout';
import type { AppConfig } from '../services';
import { clampNumber, normalizeDiaKey, snap05m } from '../utils';

type ThreeProjection = 'perspective' | 'orthographic';

interface ThreeSceneState {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera | THREE.OrthographicCamera;
  perspCamera: THREE.PerspectiveCamera;
  orthoCamera: THREE.OrthographicCamera;
  controls: OrbitControls;
  root: THREE.Group;
  spans: THREE.Group[];
  nodes: THREE.Group[];
  spanSteel: THREE.Group[];
  spanStirrups: THREE.Group[];
  nodeSteel: THREE.Group[];
  nodeStirrups: THREE.Group[];
}

interface UseThreeSceneParams {
  previewView: '2d' | '3d';
  preview: PreviewResponse | null;
  dev: DevelopmentIn;
  appCfg: AppConfig;
  selection: Selection;
  threeOpacity: number;
  zoomEnabled: boolean;
  showLongitudinal: boolean;
  showStirrups: boolean;
  hookLegM: number;
  threeProjection: ThreeProjection;
}

export function useThreeScene({
  previewView,
  preview,
  dev,
  appCfg,
  selection,
  threeOpacity,
  zoomEnabled,
  showLongitudinal,
  showStirrups,
  hookLegM,
  threeProjection,
}: UseThreeSceneParams) {
  const threeHostRef = useRef<HTMLDivElement | null>(null);
  const threeRef = useRef<ThreeSceneState | null>(null);
  const threeOverviewHostRef = useRef<HTMLDivElement | null>(null);
  const threeOverviewRef = useRef<ThreeSceneState | null>(null);

  // Inicializar escena 3D (solo cuando la vista 3D está activa)
  useEffect(() => {
    if (previewView !== '3d') return;
    const host = threeHostRef.current;
    if (!host) return;
    if (threeRef.current) return;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    (renderer as any).physicallyCorrectLights = true;

    const scene = new THREE.Scene();

    const perspCamera = new THREE.PerspectiveCamera(45, 1, 0.01, 5000);
    perspCamera.position.set(120, 80, 120);

    const orthoCamera = new THREE.OrthographicCamera(-100, 100, 100, -100, 0.01, 5000);
    orthoCamera.position.set(120, 80, 120);

    const camera = threeProjection === 'orthographic' ? orthoCamera : perspCamera;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.09;
    controls.rotateSpeed = 0.65;
    controls.zoomSpeed = 1.15;
    controls.panSpeed = 1.05;
    controls.screenSpacePanning = true;
    controls.zoomToCursor = true;
    controls.minPolarAngle = 0.05;
    controls.maxPolarAngle = Math.PI - 0.05;
    // Navegación 3D más fluida: zoom con wheel, pan con botón medio (y también con derecho), rotación con izquierdo.
    // Esto suele sentirse más cercano a CAD/BIM en práctica.
    controls.mouseButtons = {
      LEFT: THREE.MOUSE.ROTATE,
      MIDDLE: THREE.MOUSE.PAN,
      RIGHT: THREE.MOUSE.PAN,
    } as any;

    const hemi = new THREE.HemisphereLight(0xffffff, 0xffffff, 0.45);
    scene.add(hemi);
    const ambient = new THREE.AmbientLight(0xffffff, 0.35);
    scene.add(ambient);
    const key = new THREE.DirectionalLight(0xffffff, 0.95);
    key.position.set(200, 250, 120);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xffffff, 0.35);
    fill.position.set(-220, 140, -180);
    scene.add(fill);

    const root = new THREE.Group();
    scene.add(root);

    host.appendChild(renderer.domElement);

    const onDblClick = () => {
      // Reset rápido para volver a encuadrar.
      const rect = host.getBoundingClientRect();
      fitCameraToObject(
        (threeRef.current?.camera ?? camera) as any,
        controls,
        root,
        { w: Math.max(1, Math.round(rect.width)), h: Math.max(1, Math.round(rect.height)) }
      );
    };
    renderer.domElement.addEventListener('dblclick', onDblClick);

    const onResize = () => {
      const rect = host.getBoundingClientRect();
      const w = Math.max(1, Math.round(rect.width));
      const h = Math.max(1, Math.round(rect.height));
      renderer.setSize(w, h, false);
      const s = threeRef.current;
      const cam = (s?.camera ?? camera) as any;
      if (cam?.isPerspectiveCamera) {
        cam.aspect = w / h;
        cam.updateProjectionMatrix();
      } else if (cam?.isOrthographicCamera) {
        setOrthoFrustum(cam as THREE.OrthographicCamera, w / h);
        cam.updateProjectionMatrix();
      }
    };

    const ro = new ResizeObserver(onResize);
    ro.observe(host);
    onResize();

    let raf = 0;
    const tick = () => {
      const s = threeRef.current;
      if (!s) return;
      s.controls.update();
      s.renderer.render(s.scene, s.camera);
      raf = window.requestAnimationFrame(tick);
    };
    raf = window.requestAnimationFrame(tick);

    threeRef.current = {
      renderer,
      scene,
      camera,
      perspCamera,
      orthoCamera,
      controls,
      root,
      spans: [],
      nodes: [],
      spanSteel: [],
      spanStirrups: [],
      nodeSteel: [],
      nodeStirrups: [],
    };

    return () => {
      window.cancelAnimationFrame(raf);
      ro.disconnect();
      renderer.domElement.removeEventListener('dblclick', onDblClick);
      disposeObject3D(root);
      renderer.dispose();
      renderer.domElement.remove();
      threeRef.current = null;
    };
  }, [previewView, threeProjection]);

  // Inicializar escena 3D overview (estática, sin zoom/pan/rotate)
  useEffect(() => {
    if (previewView !== '3d') return;
    const host = threeOverviewHostRef.current;
    if (!host) return;
    if (threeOverviewRef.current) return;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    (renderer as any).physicallyCorrectLights = true;

    const scene = new THREE.Scene();

    const perspCamera = new THREE.PerspectiveCamera(45, 1, 0.01, 5000);
    perspCamera.position.set(120, 80, 120);

    const orthoCamera = new THREE.OrthographicCamera(-100, 100, 100, -100, 0.01, 5000);
    orthoCamera.position.set(120, 80, 120);

    const camera = threeProjection === 'orthographic' ? orthoCamera : perspCamera;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = false;
    controls.enableRotate = false;
    controls.enableZoom = false;
    controls.enablePan = false;

    const hemi = new THREE.HemisphereLight(0xffffff, 0xffffff, 0.45);
    scene.add(hemi);
    const ambient = new THREE.AmbientLight(0xffffff, 0.35);
    scene.add(ambient);
    const key = new THREE.DirectionalLight(0xffffff, 0.95);
    key.position.set(200, 250, 120);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xffffff, 0.35);
    fill.position.set(-220, 140, -180);
    scene.add(fill);

    const root = new THREE.Group();
    scene.add(root);

    host.appendChild(renderer.domElement);

    const onResize = () => {
      const rect = host.getBoundingClientRect();
      const w = Math.max(1, Math.round(rect.width));
      const h = Math.max(1, Math.round(rect.height));
      renderer.setSize(w, h, false);
      const s = threeOverviewRef.current;
      const cam = (s?.camera ?? camera) as any;
      if (cam?.isPerspectiveCamera) {
        cam.aspect = w / h;
        cam.updateProjectionMatrix();
      } else if (cam?.isOrthographicCamera) {
        setOrthoFrustum(cam as THREE.OrthographicCamera, w / h);
        cam.updateProjectionMatrix();
      }
    };

    const ro = new ResizeObserver(onResize);
    ro.observe(host);
    onResize();

    let raf = 0;
    const tick = () => {
      const s = threeOverviewRef.current;
      if (!s) return;
      s.controls.update();
      s.renderer.render(s.scene, s.camera);
      raf = window.requestAnimationFrame(tick);
    };
    raf = window.requestAnimationFrame(tick);

    threeOverviewRef.current = {
      renderer,
      scene,
      camera,
      perspCamera,
      orthoCamera,
      controls,
      root,
      spans: [],
      nodes: [],
      spanSteel: [],
      spanStirrups: [],
      nodeSteel: [],
      nodeStirrups: [],
    };

    return () => {
      window.cancelAnimationFrame(raf);
      ro.disconnect();
      disposeObject3D(root);
      renderer.dispose();
      renderer.domElement.remove();
      threeOverviewRef.current = null;
    };
  }, [previewView, threeProjection]);

  // Cambiar proyección 3D sin reconstruir geometría.
  useEffect(() => {
    if (previewView !== '3d') return;
    const state = threeRef.current;
    const host = threeHostRef.current;
    if (!state || !host) return;

    const rect = host.getBoundingClientRect();
    const w = Math.max(1, Math.round(rect.width));
    const h = Math.max(1, Math.round(rect.height));
    const next = threeProjection === 'orthographic' ? state.orthoCamera : state.perspCamera;

    state.camera = next;
    (state.controls as any).object = next;
    if ((next as any).isPerspectiveCamera) {
      (next as THREE.PerspectiveCamera).aspect = w / h;
      (next as THREE.PerspectiveCamera).updateProjectionMatrix();
    } else {
      setOrthoFrustum(next as THREE.OrthographicCamera, w / h);
      (next as THREE.OrthographicCamera).updateProjectionMatrix();
    }

    fitCameraToObject(next, state.controls, state.root, { w, h });
  }, [threeProjection, previewView]);

  // Cambiar proyección 3D (overview) sin reconstruir geometría.
  useEffect(() => {
    if (previewView !== '3d') return;
    const state = threeOverviewRef.current;
    const host = threeOverviewHostRef.current;
    if (!state || !host) return;

    const rect = host.getBoundingClientRect();
    const w = Math.max(1, Math.round(rect.width));
    const h = Math.max(1, Math.round(rect.height));
    const next = threeProjection === 'orthographic' ? state.orthoCamera : state.perspCamera;

    state.camera = next;
    (state.controls as any).object = next;
    if ((next as any).isPerspectiveCamera) {
      (next as THREE.PerspectiveCamera).aspect = w / h;
      (next as THREE.PerspectiveCamera).updateProjectionMatrix();
    } else {
      setOrthoFrustum(next as THREE.OrthographicCamera, w / h);
      (next as THREE.OrthographicCamera).updateProjectionMatrix();
    }

    fitCameraToObject(next, state.controls, state.root, { w, h });
  }, [threeProjection, previewView]);

  // Construir/reconstruir geometría 3D (extrusión fiel del contorno 2D)
  useEffect(() => {
    if (previewView !== '3d') return;
    const state = threeRef.current;
    if (!state) return;

    // Limpiar root
    while (state.root.children.length) {
      const child = state.root.children[0];
      state.root.remove(child);
      disposeObject3D(child);
    }
    state.spans = [];
    state.nodes = [];
    state.spanSteel = [];
    state.spanStirrups = [];
    state.nodeSteel = [];
    state.nodeStirrups = [];

    const dev0 = preview?.developments?.[0];
    const pts0 = dev0?.points ?? [];
    if (!pts0.length) {
      // sin preview aún
      return;
    }

    const poly: PolyPt[] = pts0.map((p) => [Number(p[0]), Number(p[1])] as PolyPt);
    // asegurar cierre
    if (poly.length >= 2) {
      const a = poly[0];
      const b = poly[poly.length - 1];
      if (a[0] !== b[0] || a[1] !== b[1]) poly.push([a[0], a[1]]);
    }

    const xs = uniqueSortedNumbers(poly.map((p) => p[0]));
    const spansCount = (dev.spans ?? []).length;
    const nodesCount = (dev.nodes ?? []).length;

    // grupos por tramo/nodo para highlight
    const spanGroups: THREE.Group[] = Array.from({ length: Math.max(spansCount, 1) }, () => new THREE.Group());
    const nodeGroups: THREE.Group[] = Array.from({ length: Math.max(nodesCount, 1) }, () => new THREE.Group());
    for (let i = 0; i < spanGroups.length; i++) state.root.add(spanGroups[i]);
    for (let i = 0; i < nodeGroups.length; i++) state.root.add(nodeGroups[i]);
    state.spans = spanGroups;
    state.nodes = nodeGroups;

    // Subgrupos por tipo para permitir toggles de visibilidad.
    const spanSteelGroups = spanGroups.map((g) => {
      const sg = new THREE.Group();
      sg.name = '__steel';
      g.add(sg);
      return sg;
    });
    const spanStirrupsGroups = spanGroups.map((g) => {
      const sg = new THREE.Group();
      sg.name = '__stirrups';
      g.add(sg);
      return sg;
    });
    const nodeSteelGroups = nodeGroups.map((g) => {
      const sg = new THREE.Group();
      sg.name = '__steel';
      g.add(sg);
      return sg;
    });
    const nodeStirrupsGroups = nodeGroups.map((g) => {
      const sg = new THREE.Group();
      sg.name = '__stirrups';
      g.add(sg);
      return sg;
    });
    state.spanSteel = spanSteelGroups;
    state.spanStirrups = spanStirrupsGroups;
    state.nodeSteel = nodeSteelGroups;
    state.nodeStirrups = nodeStirrupsGroups;

    // Concreto semi-transparente para visualizar acero interno.
    const baseMat = new THREE.MeshStandardMaterial({
      color: 0x14b8a6,
      roughness: 0.48,
      metalness: 0.05,
      transparent: true,
      opacity: 0.20,
    });

    // Rebanadas entre cada borde vertical del polígono.
    for (let i = 0; i + 1 < xs.length; i++) {
      const x0 = xs[i];
      const x1 = xs[i + 1];
      const dx = x1 - x0;
      if (!(dx > 1e-6)) continue;
      const xm = (x0 + x1) / 2;

      const intervals = polySliceIntervals(poly, xm);
      if (!intervals.length) continue;

      const b = spanBAtX(dev, xm);
      const spanIdx = spanIndexAtX(dev, xm);
      const nodeIdx = nodeIndexAtX(dev, xm);

      const parent = nodeIdx >= 0 ? nodeGroups[nodeIdx] : spanGroups[Math.max(0, Math.min(spanIdx, spanGroups.length - 1))];

      for (const [y0, y1] of intervals) {
        const dy = y1 - y0;
        if (!(dy > 1e-6)) continue;
        const bU = mToUnits(dev, b);
        const geom = new THREE.BoxGeometry(dx, dy, bU);
        const mesh = new THREE.Mesh(geom, baseMat.clone());
        mesh.userData.__casco = true;
        mesh.position.set((x0 + x1) / 2, (y0 + y1) / 2, 0);
        parent.add(mesh);
      }
    }

    // Vigas transversales (crossbeams): 1.00m perpendiculares solo con geometría del casco
    try {
      const crossbeams = (dev as any).crossbeams || [];
      for (const cb of crossbeams) {
        try {
          const x = mToUnits(dev, cb.x);
          const h = mToUnits(dev, cb.h);
          const b = mToUnits(dev, cb.b);
          const depth = mToUnits(dev, 1.0); // 1.00m fijo perpendicular

          const spanIdx = cb.span_index;
          if (spanIdx < 0 || spanIdx >= spanGroups.length) continue;

          // Crear geometría de caja
          // Width (perpendicular al desarrollo) = 1.00m
          // Height = h
          // Depth (ancho de la viga) = b
          const geom = new THREE.BoxGeometry(depth, h, b);
          const mat = baseMat.clone();
          mat.opacity = 0.35; // Ligeramente más opaco para distinguir

          const mesh = new THREE.Mesh(geom, mat);
          mesh.userData.__casco = true;

          // Posicionar en X, centrado verticalmente en h/2
          const yBaseU = mToUnits(dev, clampNumber((dev as any).y0 ?? 0, 0));
          mesh.position.set(x, yBaseU + h / 2, 0);

          // Rotar 90° alrededor del eje Y para que sea perpendicular
          mesh.rotation.y = Math.PI / 2;

          spanGroups[spanIdx].add(mesh);
        } catch (e) {
          console.warn('Error creando mesh de viga transversal:', e);
        }
      }
    } catch (e) {
      console.warn('Error procesando vigas transversales en 3D:', e);
    }

    // Acero longitudinal (simplificado): barras rectas por tramo según layout de sección.
    // Incluye bastones como segmentos por zonas (Z1/Z2/Z3).
    try {
      const steelMat = new THREE.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.35, metalness: 0.25 });
      const bastonL1Mat = new THREE.MeshStandardMaterial({ color: 0x22c55e, roughness: 0.40, metalness: 0.15 });
      const bastonL2Mat = new THREE.MeshStandardMaterial({ color: 0x06b6d4, roughness: 0.40, metalness: 0.15 });
      const extraMat = new THREE.MeshStandardMaterial({ color: 0xd946ef, roughness: 0.45, metalness: 0.10 });
      const origins = computeNodeOrigins(dev);
      const yBaseU = mToUnits(dev, clampNumber((dev as any).y0 ?? 0, 0));
      const coverM = clampNumber((dev as any).recubrimiento ?? appCfg.recubrimiento ?? 0.04, 0.04);
      const nodes = dev.nodes ?? [];
      const bastonLcM = clampNumber((dev as any).baston_Lc ?? 0.5, 0.5);
      const bastonLcU = mToUnits(dev, bastonLcM);
      const coverU = mToUnits(dev, coverM);
      const hookLegU = mToUnits(dev, clampNumber(hookLegM, 0.15));

      const addXSegmentTo = (
        parent: THREE.Object3D,
        xa: number,
        xb: number,
        yU: number,
        zU: number,
        radiusU: number,
        mat: THREE.Material
      ) => {
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
      };

      const addYSegmentTo = (
        parent: THREE.Object3D,
        xU: number,
        y0U: number,
        y1U: number,
        zU: number,
        radiusU: number,
        mat: THREE.Material
      ) => {
        const lo = Math.min(y0U, y1U);
        const hi = Math.max(y0U, y1U);
        const Ly = hi - lo;
        if (!(Ly > 1e-6)) return;
        if (!(radiusU > 0)) return;
        const geom = new THREE.CylinderGeometry(radiusU, radiusU, Ly, 12);
        const mesh = new THREE.Mesh(geom, mat);
        mesh.position.set(xU, (lo + hi) / 2, zU);
        parent.add(mesh);
      };

      const addSegmentTo = (
        parent: THREE.Object3D,
        x0: number,
        y0: number,
        z0: number,
        x1: number,
        y1: number,
        z1: number,
        radiusU: number,
        mat: THREE.Material
      ) => {
        const dx = x1 - x0;
        const dy = y1 - y0;
        const dz = z1 - z0;
        const L = Math.hypot(dx, dy, dz);
        if (!(L > 1e-6)) return;
        if (!(radiusU > 0)) return;

        const geom = new THREE.CylinderGeometry(radiusU, radiusU, L, 12);
        const mesh = new THREE.Mesh(geom, mat);

        // CylinderGeometry is aligned with +Y by default.
        const dir = new THREE.Vector3(dx, dy, dz).normalize();
        const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
        mesh.quaternion.copy(q);

        mesh.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
        parent.add(mesh);
      };

      const resolvedLenMWithLm = (cfg: BastonCfg, field: 'L1_m' | 'L2_m' | 'L3_m', fallbackM: number, Lm: number) => {
        const v = (cfg as any)[field];
        const n = typeof v === 'number' ? v : NaN;
        const out = Number.isFinite(n) && n > 0 ? n : fallbackM;
        const snapped = snap05m(out);
        return Math.min(Lm, Math.max(0, snapped));
      };

      const getBastonCfgForSpan = (span: SpanIn, side: 'top' | 'bottom', zone: 'z1' | 'z2' | 'z3'): BastonCfg => {
        const b = (span as any).bastones ?? {};
        const s = (side === 'top' ? b.top : b.bottom) ?? {};
        const z = (s as any)[zone] ?? {};
        return normalizeBastonCfg(z);
      };

      for (let si = 0; si < (dev.spans ?? []).length; si++) {
        const span = (dev.spans ?? [])[si];
        if (!span) continue;
        const Lm = clampNumber(span.L ?? 0, 0);
        if (!(Lm > 0)) continue;

        // X-range por lado (mismo que el overlay 2D)
        const a2_i = mToUnits(dev, clampNumber(nodes[si]?.a2 ?? 0, 0));
        const xBot0 = (origins[si] ?? 0) + a2_i;
        const xBot1 = xBot0 + mToUnits(dev, Lm);

        const b2_i = mToUnits(dev, clampNumber(nodes[si]?.b2 ?? 0, 0));
        const b1_ip1 = mToUnits(dev, clampNumber(nodes[si + 1]?.b1 ?? 0, 0));
        const xTop0 = (origins[si] ?? 0) + b2_i;
        const xTop1 = (origins[si + 1] ?? 0) + b1_ip1;

        const parentSteel = state.spanSteel[Math.max(0, Math.min(si, state.spanSteel.length - 1))] as THREE.Group | undefined;
        const parentStirrups = state.spanStirrups[Math.max(0, Math.min(si, state.spanStirrups.length - 1))] as THREE.Group | undefined;
        if (!parentSteel || !parentStirrups) continue;

        const getBastonCfg3D = (side: 'top' | 'bottom', zone: 'z1' | 'z2' | 'z3'): BastonCfg => {
          const b = (span as any).bastones ?? {};
          const s = (side === 'top' ? b.top : b.bottom) ?? {};
          const z = (s as any)[zone] ?? {};
          return normalizeBastonCfg(z);
        };

        const defaultLenM = Lm / 5;
        const defaultL3M = Lm / 3;
        const resolvedLenM = (cfg: BastonCfg, field: 'L1_m' | 'L2_m' | 'L3_m', fallbackM: number) => {
          const v = (cfg as any)[field];
          const n = typeof v === 'number' ? v : NaN;
          const out = Number.isFinite(n) && n > 0 ? n : fallbackM;
          const snapped = snap05m(out);
          return Math.min(Lm, Math.max(0, snapped));
        };

        const addXSegment = (xa: number, xb: number, yU: number, zU: number, radiusU: number, mat: THREE.Material) => {
          const lo = Math.min(xa, xb);
          const hi = Math.max(xa, xb);
          const Lx = hi - lo;
          if (!(Lx > 1e-6)) return;
          if (!(radiusU > 0)) return;
          const geom = new THREE.CylinderGeometry(radiusU, radiusU, Lx, 12);
          geom.rotateZ(Math.PI / 2);
          const mesh = new THREE.Mesh(geom, mat);
          mesh.position.set((lo + hi) / 2, yU, zU);
          parentSteel.add(mesh);
        };

        const addYSegment = (xU: number, y0U: number, y1U: number, zU: number, radiusU: number, mat: THREE.Material) => {
          const lo = Math.min(y0U, y1U);
          const hi = Math.max(y0U, y1U);
          const Ly = hi - lo;
          if (!(Ly > 1e-6)) return;
          if (!(radiusU > 0)) return;
          const geom = new THREE.CylinderGeometry(radiusU, radiusU, Ly, 12);
          const mesh = new THREE.Mesh(geom, mat);
          mesh.position.set(xU, (lo + hi) / 2, zU);
          parentSteel.add(mesh);
        };

        const computeEndX2 = (
          xU: number,
          dir: 1 | -1,
          diaKey: string,
          kind: 'hook' | 'anchorage',
          side: 'top' | 'bottom',
          xFaceU?: number,
          customLengthM?: number
        ) => {
          if (typeof xFaceU === 'number' && Number.isFinite(xFaceU)) {
            const target = xFaceU - dir * coverU;
            const lo = Math.min(xU, xFaceU);
            const hi = Math.max(xU, xFaceU);
            return Math.min(hi, Math.max(lo, target));
          }
          // Use custom length if provided (Preferencia 01), otherwise use table
          const lengthM = (typeof customLengthM === 'number' && customLengthM > 0)
            ? customLengthM
            : lengthFromTableMeters(diaKey, kind, side);
          return xU + dir * mToUnits(dev, lengthM);
        };

        const addBars = (face: 'top' | 'bottom') => {
          const res = computeSpanSectionLayoutWithBastonesCm({ dev, span, cover_m: coverM, face });
          if (!res.ok) return;

          const xaSide = face === 'top' ? Math.min(xTop0, xTop1) : Math.min(xBot0, xBot1);
          const xbSide = face === 'top' ? Math.max(xTop0, xTop1) : Math.max(xBot0, xBot1);

          // Acero principal: barra a lo largo del tramo + uniones por nodo (gancho/anclaje).
          const mainRadiusU = mToUnits(dev, (res.main_db_cm / 100) / 2);
          const mainSteel = face === 'top' ? (span.steel_top ?? null) : (span.steel_bottom ?? null);
          const diaKey = String((mainSteel as any)?.diameter ?? '3/4');
          const nL = nodes[si] as NodeIn | undefined;
          const nR = nodes[si + 1] as NodeIn | undefined;

          const leftKind = nL ? nodeSteelKind(nL, face, 2) : 'continuous';
          const rightKind = nR ? nodeSteelKind(nR, face, 1) : 'continuous';
          const leftToFace = nL ? nodeToFaceEnabled(nL, face, 2) : false;
          const rightToFace = nR ? nodeToFaceEnabled(nR, face, 1) : false;

          const xFaceLeft = (() => {
            if (!leftToFace || !nL) return undefined;
            const o = origins[si] ?? 0;
            return face === 'top'
              ? o + mToUnits(dev, clampNumber((nL as any).b1 ?? 0, 0))
              : o + mToUnits(dev, clampNumber((nL as any).a1 ?? 0, 0));
          })();

          const xFaceRight = (() => {
            if (!rightToFace || !nR) return undefined;
            const o = origins[si + 1] ?? 0;
            return face === 'top'
              ? o + mToUnits(dev, clampNumber((nR as any).b2 ?? 0, 0))
              : o + mToUnits(dev, clampNumber((nR as any).a2 ?? 0, 0));
          })();

          for (const b of res.main_bars_cm) {
            const yU = yBaseU + mToUnits(dev, b.y_cm / 100);
            const zU = mToUnits(dev, b.z_cm / 100);
            addXSegment(xaSide, xbSide, yU, zU, mainRadiusU, steelMat);

            if (leftKind === 'hook' || leftKind === 'development') {
              const kind2 = leftKind === 'hook' ? 'hook' : 'anchorage';
              const customLengthField = face === 'top' ? 'steel_top_2_anchorage_length' : 'steel_bottom_2_anchorage_length';
              const customLength = nL ? (nL as any)[customLengthField] : undefined;
              const x2 = computeEndX2(xaSide, -1, diaKey, kind2, face, xFaceLeft, customLength);
              addXSegment(x2, xaSide, yU, zU, mainRadiusU, extraMat);
              if (leftKind === 'hook') {
                const y2 = face === 'top' ? yU - hookLegU : yU + hookLegU;
                addYSegment(x2, yU, y2, zU, mainRadiusU, extraMat);
              }
            }

            if (rightKind === 'hook' || rightKind === 'development') {
              const kind2 = rightKind === 'hook' ? 'hook' : 'anchorage';
              const customLengthField = face === 'top' ? 'steel_top_1_anchorage_length' : 'steel_bottom_1_anchorage_length';
              const customLength = nR ? (nR as any)[customLengthField] : undefined;
              const x2 = computeEndX2(xbSide, +1, diaKey, kind2, face, xFaceRight, customLength);
              addXSegment(xbSide, x2, yU, zU, mainRadiusU, extraMat);
              if (rightKind === 'hook') {
                const y2 = face === 'top' ? yU - hookLegU : yU + hookLegU;
                addYSegment(x2, yU, y2, zU, mainRadiusU, extraMat);
              }
            }
          }

          // Bastones: segmentos por zonas.
          const l1Pool = (res as any).baston_l1_bars_cm ?? [];
          const l2Pool = (res as any).baston_l2_bars_cm ?? [];
          if (!((l1Pool.length + l2Pool.length) > 0) || !(res.baston_db_cm > 0)) return;
          const bastonRadiusU = mToUnits(dev, (res.baston_db_cm / 100) / 2);

          const side: 'top' | 'bottom' = face;

          // Z1
          {
            const cfg = getBastonCfg3D(side, 'z1');
            if (cfg.l1_enabled || cfg.l2_enabled) {
              const q1 = Math.max(1, Math.min(3, Math.round(cfg.l1_qty ?? 1)));
              const q2 = Math.max(1, Math.min(3, Math.round(cfg.l2_qty ?? 1)));

              const L3_u = mToUnits(dev, resolvedLenM(cfg, 'L3_m', defaultL3M));
              const x0z = xaSide;
              const x1z = Math.min(xbSide, xaSide + L3_u);
              const innerExists = x1z - x0z > bastonLcU + 1e-6;

              const l1Bars = cfg.l1_enabled ? l1Pool.slice(0, q1) : [];
              const l2Bars = cfg.l2_enabled && innerExists ? l2Pool.slice(0, q2) : [];

              for (const bb of l1Bars) {
                const yU = yBaseU + mToUnits(dev, bb.y_cm / 100);
                const zU = mToUnits(dev, bb.z_cm / 100);
                addXSegment(x0z, x1z, yU, zU, bastonRadiusU, bastonL1Mat);
              }
              for (const bb of l2Bars) {
                const yU = yBaseU + mToUnits(dev, bb.y_cm / 100);
                const zU = mToUnits(dev, bb.z_cm / 100);
                addXSegment(x0z, x1z - bastonLcU, yU, zU, bastonRadiusU, bastonL2Mat);
              }

              // Uniones en el nodo izquierdo (end=2) por línea
              const n0 = nodes[si] as NodeIn | undefined;
              if (n0) {
                const xFaceFor = (line: 1 | 2) => {
                  const toFace = nodeBastonLineToFaceEnabled(n0, side, 2, line);
                  if (!toFace) return undefined;
                  const o = origins[si] ?? 0;
                  return side === 'top'
                    ? o + mToUnits(dev, clampNumber((n0 as any).b1 ?? 0, 0))
                    : o + mToUnits(dev, clampNumber((n0 as any).a1 ?? 0, 0));
                };

                if (cfg.l1_enabled) {
                  const dia = String(cfg.l1_diameter ?? '3/4');
                  const kEnd = nodeBastonLineKind(n0, side, 2, 1);
                  if (kEnd === 'hook' || kEnd === 'development') {
                    const kind = kEnd === 'hook' ? 'hook' : 'anchorage';
                    const xFace = xFaceFor(1);
                    const x2 = computeEndX2(x0z, -1, dia, kind, side, xFace);
                    for (const bb of l1Bars) {
                      const yU = yBaseU + mToUnits(dev, bb.y_cm / 100);
                      const zU = mToUnits(dev, bb.z_cm / 100);
                      addXSegment(x2, x0z, yU, zU, bastonRadiusU, extraMat);
                      if (kEnd === 'hook') {
                        const y2 = side === 'top' ? yU - hookLegU : yU + hookLegU;
                        addYSegment(x2, yU, y2, zU, bastonRadiusU, extraMat);
                      }
                    }
                  }
                }

                if (cfg.l2_enabled && innerExists) {
                  const dia = String(cfg.l2_diameter ?? '3/4');
                  const kEnd = nodeBastonLineKind(n0, side, 2, 2);
                  if (kEnd === 'hook' || kEnd === 'development') {
                    const kind = kEnd === 'hook' ? 'hook' : 'anchorage';
                    const xFace = xFaceFor(2);
                    const x2 = computeEndX2(x0z, -1, dia, kind, side, xFace);
                    for (const bb of l2Bars) {
                      const yU = yBaseU + mToUnits(dev, bb.y_cm / 100);
                      const zU = mToUnits(dev, bb.z_cm / 100);
                      addXSegment(x2, x0z, yU, zU, bastonRadiusU, extraMat);
                      if (kEnd === 'hook') {
                        const y2 = side === 'top' ? yU - hookLegU : yU + hookLegU;
                        addYSegment(x2, yU, y2, zU, bastonRadiusU, extraMat);
                      }
                    }
                  }
                }
              }
            }
          }

          // Z2
          {
            const cfg = getBastonCfg3D(side, 'z2');
            if (cfg.l1_enabled || cfg.l2_enabled) {
              const q1 = Math.max(1, Math.min(3, Math.round(cfg.l1_qty ?? 1)));
              const q2 = Math.max(1, Math.min(3, Math.round(cfg.l2_qty ?? 1)));
              const L1_u = mToUnits(dev, resolvedLenM(cfg, 'L1_m', defaultLenM));
              const L2_u = mToUnits(dev, resolvedLenM(cfg, 'L2_m', defaultLenM));
              const x0z = xaSide + L1_u;
              const x1z = xbSide - L2_u;
              if (x1z > x0z + 1e-6) {
                const innerExists = x1z - x0z > 2 * bastonLcU + 1e-6;
                const idxL1 = 0;
                const idxL2 = cfg.l1_enabled ? q1 : 0;
                const l1Bars = cfg.l1_enabled ? l1Pool.slice(0, q1) : [];
                const l2Bars = cfg.l2_enabled && innerExists ? l2Pool.slice(0, q2) : [];

                for (const bb of l1Bars) {
                  const yU = yBaseU + mToUnits(dev, bb.y_cm / 100);
                  const zU = mToUnits(dev, bb.z_cm / 100);
                  addXSegment(x0z, x1z, yU, zU, bastonRadiusU, bastonL1Mat);
                }
                for (const bb of l2Bars) {
                  const yU = yBaseU + mToUnits(dev, bb.y_cm / 100);
                  const zU = mToUnits(dev, bb.z_cm / 100);
                  addXSegment(x0z + bastonLcU, x1z - bastonLcU, yU, zU, bastonRadiusU, bastonL2Mat);
                }
              }
            }
          }

          // Z3
          {
            const cfg = getBastonCfg3D(side, 'z3');
            if (cfg.l1_enabled || cfg.l2_enabled) {
              const q1 = Math.max(1, Math.min(3, Math.round(cfg.l1_qty ?? 1)));
              const q2 = Math.max(1, Math.min(3, Math.round(cfg.l2_qty ?? 1)));

              const L3_u = mToUnits(dev, resolvedLenM(cfg, 'L3_m', defaultL3M));
              const x1z = xbSide;
              const x0z = Math.max(xaSide, xbSide - L3_u);
              const innerExists = x1z - x0z > bastonLcU + 1e-6;

              const l1Bars = cfg.l1_enabled ? l1Pool.slice(0, q1) : [];
              const l2Bars = cfg.l2_enabled && innerExists ? l2Pool.slice(0, q2) : [];

              for (const bb of l1Bars) {
                const yU = yBaseU + mToUnits(dev, bb.y_cm / 100);
                const zU = mToUnits(dev, bb.z_cm / 100);
                addXSegment(x0z, x1z, yU, zU, bastonRadiusU, bastonL1Mat);
              }
              for (const bb of l2Bars) {
                const yU = yBaseU + mToUnits(dev, bb.y_cm / 100);
                const zU = mToUnits(dev, bb.z_cm / 100);
                addXSegment(x0z + bastonLcU, x1z, yU, zU, bastonRadiusU, bastonL2Mat);
              }

              // Uniones en el nodo derecho (end=1) por línea
              const n1 = nodes[si + 1] as NodeIn | undefined;
              if (n1) {
                const xFaceFor = (line: 1 | 2) => {
                  const toFace = nodeBastonLineToFaceEnabled(n1, side, 1, line);
                  if (!toFace) return undefined;
                  const o = origins[si + 1] ?? 0;
                  return side === 'top'
                    ? o + mToUnits(dev, clampNumber((n1 as any).b2 ?? 0, 0))
                    : o + mToUnits(dev, clampNumber((n1 as any).a2 ?? 0, 0));
                };

                if (cfg.l1_enabled) {
                  const dia = String(cfg.l1_diameter ?? '3/4');
                  const kEnd = nodeBastonLineKind(n1, side, 1, 1);
                  if (kEnd === 'hook' || kEnd === 'development') {
                    const kind = kEnd === 'hook' ? 'hook' : 'anchorage';
                    const xFace = xFaceFor(1);
                    const x2 = computeEndX2(x1z, +1, dia, kind, side, xFace);
                    for (const bb of l1Bars) {
                      const yU = yBaseU + mToUnits(dev, bb.y_cm / 100);
                      const zU = mToUnits(dev, bb.z_cm / 100);
                      addXSegment(x1z, x2, yU, zU, bastonRadiusU, extraMat);
                      if (kEnd === 'hook') {
                        const y2 = side === 'top' ? yU - hookLegU : yU + hookLegU;
                        addYSegment(x2, yU, y2, zU, bastonRadiusU, extraMat);
                      }
                    }
                  }
                }

                if (cfg.l2_enabled && innerExists) {
                  const dia = String(cfg.l2_diameter ?? '3/4');
                  const kEnd = nodeBastonLineKind(n1, side, 1, 2);
                  if (kEnd === 'hook' || kEnd === 'development') {
                    const kind = kEnd === 'hook' ? 'hook' : 'anchorage';
                    const xFace = xFaceFor(2);
                    const x2 = computeEndX2(x1z, +1, dia, kind, side, xFace);
                    for (const bb of l2Bars) {
                      const yU = yBaseU + mToUnits(dev, bb.y_cm / 100);
                      const zU = mToUnits(dev, bb.z_cm / 100);
                      addXSegment(x1z, x2, yU, zU, bastonRadiusU, extraMat);
                      if (kEnd === 'hook') {
                        const y2 = side === 'top' ? yU - hookLegU : yU + hookLegU;
                        addYSegment(x2, yU, y2, zU, bastonRadiusU, extraMat);
                      }
                    }
                  }
                }
              }
            }
          }
        };

        addBars('top');
        addBars('bottom');

        // Estribos 3D: lazos rectangulares cerrados (en el plano Y-Z) por cada posición ABCR.
        try {
          const st = (span as any).stirrups as any;
          if (st) {
            const dM = clampNumber((dev as any).d ?? 0.25, 0.25);
            const x0Face = Math.min(xBot0, xBot1);
            const x1Face = Math.max(xBot0, xBot1);
            const LspanU = x1Face - x0Face;
            if (LspanU > 1e-6) {
              const caseType = String(st.case_type ?? 'simetrica').trim().toLowerCase();
              const singleEnd = String(st.single_end ?? '').trim().toLowerCase();
              const leftSpec = String(st.left_spec ?? '').trim();
              const centerSpec = String(st.center_spec ?? '').trim();
              const rightSpec = String(st.right_spec ?? '').trim();

              const specOr = (...vals: string[]) => {
                for (const v of vals) {
                  const s = String(v ?? '').trim();
                  if (s) return s;
                }
                return '';
              };

              let pL = '';
              let pR = '';
              if (caseType === 'simetrica') {
                pL = specOr(leftSpec, centerSpec, rightSpec);
                pR = specOr(rightSpec, pL) || pL;
              } else if (caseType === 'asim_ambos') {
                pL = specOr(leftSpec, centerSpec);
                pR = specOr(rightSpec, centerSpec, pL);
              } else if (caseType === 'asim_uno') {
                const pSpecial = specOr(leftSpec);
                const pRest = specOr(centerSpec, pSpecial);
                if (singleEnd === 'right') {
                  pL = pRest;
                  pR = pSpecial;
                } else {
                  pL = pSpecial;
                  pR = pRest;
                }
              } else {
                pL = specOr(leftSpec, centerSpec, rightSpec);
                pR = specOr(rightSpec, pL) || pL;
              }

              const midU = (x0Face + x1Face) / 2;
              const leftBlocks = pL ? stirrupsBlocksFromSpec(dev, pL, x0Face, midU, +1) : [];
              const rightBlocks = pR ? stirrupsBlocksFromSpec(dev, pR, x1Face, midU, -1) : [];

              // Si el espacio en el centro es mayor que R, agregar un estribo independiente.
              try {
                const flatL = leftBlocks.flatMap((b) => b.positions ?? []);
                const flatR = rightBlocks.flatMap((b) => b.positions ?? []);
                const leftLast = flatL.length ? Math.max(...flatL) : null;
                const rightFirst = flatR.length ? Math.min(...flatR) : null;
                const rLm = pL ? stirrupsRestSpacingFromSpec(pL) : null;
                const rRm = pR ? stirrupsRestSpacingFromSpec(pR) : null;
                const rM = Math.min(...[rLm ?? Infinity, rRm ?? Infinity].filter((v) => Number.isFinite(v)) as number[]);
                const rU = Number.isFinite(rM) && rM > 0 ? mToUnits(dev, rM) : 0;
                if (leftLast != null && rightFirst != null && rightFirst > leftLast + 1e-6 && rU > 0) {
                  const gap = rightFirst - leftLast;
                  if (gap > rU + 1e-6) {
                    const xMid = (leftLast + rightFirst) / 2;
                    leftBlocks.push({ key: 'mid', positions: [xMid] });
                  }
                }
              } catch {
                // ignore
              }

              if (leftBlocks.length || rightBlocks.length) {
                const matB = new THREE.MeshStandardMaterial({ color: 0x22c55e, roughness: 0.55, metalness: 0.05 });
                const matC = new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.55, metalness: 0.05 });
                const matR = new THREE.MeshStandardMaterial({ color: 0x06b6d4, roughness: 0.55, metalness: 0.05 });
                const matMid = new THREE.MeshStandardMaterial({ color: 0xd946ef, roughness: 0.55, metalness: 0.05 });
                const mats = [matB, matC, matR];

                const matFor = (key: string, idx: number) => {
                  const k = String(key || '').toLowerCase();
                  if (k === 'b') return matB;
                  if (k === 'c') return matC;
                  if (k === 'r') return matR;
                  if (k === 'mid') return matMid;
                  return mats[idx % mats.length];
                };

                const sec = normalizeStirrupsSection((span as any).stirrups_section ?? (span as any).stirrupsSection);
                const settings = getSteelLayoutSettings(dev);
                const diaKey = normalizeDiaKey(String(st.diameter ?? '3/8').replace(/[∅Ø\s]/g, '')) || '3/8';
                const dbCm = diameterToCm(diaKey, settings);
                const dbU = mToUnits(dev, dbCm / 100);
                const hU = mToUnits(dev, clampNumber(span.h ?? 0, 0));

                const addLoopAtX = (xPos: number, mat: THREE.Material) => {
                  if (xPos < x0Face - 1e-3 || xPos > x1Face + 1e-3) return;
                  if (!(sec.qty > 0) || !(dbU > 1e-9)) return;
                  const bU = mToUnits(dev, spanBAtX(dev, xPos));

                  for (let k = 0; k < sec.qty; k++) {
                    const offU = coverU + (k + 0.5) * dbU;
                    const y0 = yBaseU + offU;
                    const y1 = yBaseU + hU - offU;
                    const z0 = -bU / 2 + offU;
                    const z1 = +bU / 2 - offU;
                    if (!(y1 > y0 + 1e-6) || !(z1 > z0 + 1e-6)) break;
                    const radiusU = Math.max(1e-9, dbU / 2);

                    // Rectángulo en Y-Z (x constante)
                    addSegmentTo(parentStirrups, xPos, y0, z0, xPos, y1, z0, radiusU, mat);
                    addSegmentTo(parentStirrups, xPos, y1, z0, xPos, y1, z1, radiusU, mat);
                    addSegmentTo(parentStirrups, xPos, y1, z1, xPos, y0, z1, radiusU, mat);
                    addSegmentTo(parentStirrups, xPos, y0, z1, xPos, y0, z0, radiusU, mat);
                  }
                };

                let idx = 0;
                const seen = new Set<number>();
                const pushPositions = (positions: number[], mat: THREE.Material) => {
                  for (const xPos of positions) {
                    const key = Math.round(xPos * 1000); // 1e-3 unidades
                    if (seen.has(key)) continue;
                    seen.add(key);
                    addLoopAtX(xPos, mat);
                  }
                };

                for (const b of leftBlocks) pushPositions(b.positions ?? [], matFor(b.key, idx++));
                for (const b of rightBlocks) pushPositions(b.positions ?? [], matFor(b.key, idx++));
              }
            }
          }
        } catch {
          // ignore (3D stirrups best-effort)
        }
      }

      // Conexiones en nodos internos (best-effort):
      // - Acero principal continuo: conecta barras entre tramos
      // - Bastones: conecta Z3 del tramo izquierdo con Z1 del tramo derecho (por línea)
      const spans = dev.spans ?? [];

      for (let ni = 1; ni < nodes.length - 1; ni++) {
        const node = nodes[ni] as NodeIn | undefined;
        const leftSpan = spans[ni - 1] as SpanIn | undefined;
        const rightSpan = spans[ni] as SpanIn | undefined;
        if (!node || !leftSpan || !rightSpan) continue;

        const parent = (state.nodeSteel[ni] as THREE.Group | undefined) ?? state.root;
        const LmL = clampNumber(leftSpan.L ?? 0, 0);
        const LmR = clampNumber(rightSpan.L ?? 0, 0);
        if (!(LmL > 0) || !(LmR > 0)) continue;

        for (const face of ['top', 'bottom'] as const) {
          // X fin tramo izq en el nodo y X inicio tramo der en el nodo (misma lógica de overlay 2D)
          let xLeftEnd = 0;
          let xRightStart = 0;

          if (face === 'top') {
            const o = origins[ni] ?? 0;
            const b1 = mToUnits(dev, clampNumber((nodes[ni] as any)?.b1 ?? 0, 0));
            const b2 = mToUnits(dev, clampNumber((nodes[ni] as any)?.b2 ?? 0, 0));
            xLeftEnd = o + b1;
            xRightStart = o + b2;
          } else {
            const oL = origins[ni - 1] ?? 0;
            const a2L = mToUnits(dev, clampNumber((nodes[ni - 1] as any)?.a2 ?? 0, 0));
            const x0L = oL + a2L;
            xLeftEnd = x0L + mToUnits(dev, LmL);

            const oR = origins[ni] ?? 0;
            const a2R = mToUnits(dev, clampNumber((nodes[ni] as any)?.a2 ?? 0, 0));
            xRightStart = oR + a2R;
          }

          const xA = xLeftEnd;
          const xB = xRightStart;

          // 1) Acero principal continuo
          const k1 = nodeSteelKind(node, face, 1);
          const k2 = nodeSteelKind(node, face, 2);
          if (k1 === 'continuous' && k2 === 'continuous') {
            const resL = computeSpanSectionLayoutWithBastonesCm({ dev, span: leftSpan, cover_m: coverM, face });
            const resR = computeSpanSectionLayoutWithBastonesCm({ dev, span: rightSpan, cover_m: coverM, face });
            if (resL.ok && resR.ok) {
              const nBars = Math.min(resL.main_bars_cm.length, resR.main_bars_cm.length);
              const radiusU = mToUnits(dev, (Math.max(resL.main_db_cm, resR.main_db_cm) / 100) / 2);
              for (let bi = 0; bi < nBars; bi++) {
                const bL = resL.main_bars_cm[bi];
                const bR = resR.main_bars_cm[bi];
                if (!bL || !bR) continue;
                const yL = yBaseU + mToUnits(dev, bL.y_cm / 100);
                const yR = yBaseU + mToUnits(dev, bR.y_cm / 100);
                const zL = mToUnits(dev, bL.z_cm / 100);
                const zR = mToUnits(dev, bR.z_cm / 100);

                // Recta (sin escalón) también en top.
                addSegmentTo(parent, xA, yL, zL, xB, yR, zR, radiusU, steelMat);
              }
            }
          }

          // 2) Bastones continuos en nodo interno: Z3 (izq) ↔ Z1 (der)
          const cfgL = getBastonCfgForSpan(leftSpan, face, 'z3');
          const cfgR = getBastonCfgForSpan(rightSpan, face, 'z1');
          const q1L = Math.max(1, Math.min(3, Math.round(cfgL.l1_qty ?? 1)));
          const q2L = Math.max(1, Math.min(3, Math.round(cfgL.l2_qty ?? 1)));
          const q1R = Math.max(1, Math.min(3, Math.round(cfgR.l1_qty ?? 1)));
          const q2R = Math.max(1, Math.min(3, Math.round(cfgR.l2_qty ?? 1)));

          const resL = computeSpanSectionLayoutWithBastonesCm({ dev, span: leftSpan, cover_m: coverM, face });
          const resR = computeSpanSectionLayoutWithBastonesCm({ dev, span: rightSpan, cover_m: coverM, face });
          if (!(resL.ok && resR.ok)) continue;
          const l1PoolL = (resL as any).baston_l1_bars_cm ?? [];
          const l2PoolL = (resL as any).baston_l2_bars_cm ?? [];
          const l1PoolR = (resR as any).baston_l1_bars_cm ?? [];
          const l2PoolR = (resR as any).baston_l2_bars_cm ?? [];
          if (!((l1PoolL.length + l2PoolL.length) > 0) || !((l1PoolR.length + l2PoolR.length) > 0)) continue;
          const bastonRadiusU = mToUnits(dev, (Math.max(resL.baston_db_cm, resR.baston_db_cm) / 100) / 2);

          // helper: innerExists para una zona (solo usado para línea 2)
          const innerExistsFor = (span: SpanIn, cfg: BastonCfg, zone: 'z1' | 'z3', Lm: number) => {
            const defaultL3 = Lm / 3;
            const L3_u = mToUnits(dev, resolvedLenMWithLm(cfg, 'L3_m', defaultL3, Lm));

            // x-range por lado en ese tramo
            let xaSide = 0;
            let xbSide = 0;
            if (face === 'top') {
              const siSpan = zone === 'z3' ? ni - 1 : ni;
              const o0 = origins[siSpan] ?? 0;
              const o1 = origins[siSpan + 1] ?? 0;
              const b2_i = mToUnits(dev, clampNumber(nodes[siSpan]?.b2 ?? 0, 0));
              const b1_ip1 = mToUnits(dev, clampNumber(nodes[siSpan + 1]?.b1 ?? 0, 0));
              xaSide = Math.min(o0 + b2_i, o1 + b1_ip1);
              xbSide = Math.max(o0 + b2_i, o1 + b1_ip1);
            } else {
              const siSpan = zone === 'z3' ? ni - 1 : ni;
              const o = origins[siSpan] ?? 0;
              const a2_i = mToUnits(dev, clampNumber(nodes[siSpan]?.a2 ?? 0, 0));
              xaSide = o + a2_i;
              xbSide = xaSide + mToUnits(dev, clampNumber((spans[siSpan] as any)?.L ?? 0, 0));
              xaSide = Math.min(xaSide, xbSide);
              xbSide = Math.max(xaSide, xbSide);
            }

            if (zone === 'z1') {
              const x0z = xaSide;
              const x1z = Math.min(xbSide, xaSide + L3_u);
              return x1z - x0z > bastonLcU + 1e-6;
            }
            // z3
            const x1z = xbSide;
            const x0z = Math.max(xaSide, xbSide - L3_u);
            return x1z - x0z > bastonLcU + 1e-6;
          };

          for (const line of [1, 2] as const) {
            const kLeft = nodeBastonLineKind(node, face, 1, line);
            const kRight = nodeBastonLineKind(node, face, 2, line);
            if (!(kLeft === 'continuous' && kRight === 'continuous')) continue;

            const enabledL = line === 1 ? cfgL.l1_enabled : cfgL.l2_enabled;
            const enabledR = line === 1 ? cfgR.l1_enabled : cfgR.l2_enabled;
            if (!enabledL || !enabledR) continue;

            const qL = line === 1 ? q1L : q2L;
            const qR = line === 1 ? q1R : q2R;
            const poolL = line === 1 ? l1PoolL : l2PoolL;
            const poolR = line === 1 ? l1PoolR : l2PoolR;
            const q = Math.min(qL, qR, poolL.length, poolR.length);
            if (!(q > 0)) continue;

            // Línea 2 solo si existe interior en ambos tramos
            if (line === 2) {
              if (!innerExistsFor(leftSpan, cfgL, 'z3', LmL)) continue;
              if (!innerExistsFor(rightSpan, cfgR, 'z1', LmR)) continue;
            }

            for (let bi = 0; bi < q; bi++) {
              const bL = poolL[bi];
              const bR = poolR[bi];
              if (!bL || !bR) continue;
              const yL = yBaseU + mToUnits(dev, bL.y_cm / 100);
              const yR = yBaseU + mToUnits(dev, bR.y_cm / 100);
              const zL = mToUnits(dev, bL.z_cm / 100);
              const zR = mToUnits(dev, bR.z_cm / 100);

              // Recta (sin escalón) también en top.
              addSegmentTo(parent, xA, yL, zL, xB, yR, zR, bastonRadiusU, line === 1 ? bastonL1Mat : bastonL2Mat);
            }
          }
        }
      }
    } catch {
      // ignore (3D steel is best-effort)
    }

    {
      const host = threeHostRef.current;
      const rect = host?.getBoundingClientRect();
      const viewport = rect ? { w: Math.max(1, Math.round(rect.width)), h: Math.max(1, Math.round(rect.height)) } : undefined;
      fitCameraToObject(state.camera, state.controls, state.root, viewport);
    }
  }, [dev, preview, previewView]);

  // Mantener 3D overview sincronizado (clon del root del detalle)
  useEffect(() => {
    if (previewView !== '3d') return;
    const src = threeRef.current;
    const dst = threeOverviewRef.current;
    const host = threeOverviewHostRef.current;
    if (!src || !dst || !host) return;

    // Limpiar dst.root
    while (dst.root.children.length) {
      const child = dst.root.children[0];
      dst.root.remove(child);
      disposeObject3D(child);
    }

    // Clonar geometría del detalle
    const clonedRoot = src.root.clone(true);
    while (clonedRoot.children.length) {
      const child = clonedRoot.children[0];
      clonedRoot.remove(child);
      dst.root.add(child);
    }

    // Aplicar toggles de visibilidad por nombre de grupo
    dst.root.traverse((o: any) => {
      if (!o) return;
      if (o.name === '__steel') o.visible = showLongitudinal;
      if (o.name === '__stirrups') o.visible = showStirrups;
    });

    const rect = host.getBoundingClientRect();
    const viewport = { w: Math.max(1, Math.round(rect.width)), h: Math.max(1, Math.round(rect.height)) };
    fitCameraToObject(dst.camera, dst.controls, dst.root, viewport);
  }, [dev, preview, previewView, showLongitudinal, showStirrups]);

  // Togglear visibilidad de capas 3D (sin reconstruir)
  useEffect(() => {
    if (previewView !== '3d') return;
    const state = threeRef.current;
    if (!state) return;

    for (const g of [...(state.spanSteel ?? []), ...(state.nodeSteel ?? [])]) g.visible = showLongitudinal;
    for (const g of [...(state.spanStirrups ?? []), ...(state.nodeStirrups ?? [])]) g.visible = showStirrups;
  }, [showLongitudinal, showStirrups, previewView]);

  // Aplicar opacidad (transparencia) a todos los materiales 3D
  useEffect(() => {
    if (previewView !== '3d') return;
    const state = threeRef.current;
    if (!state) return;
    const opacity = threeOpacity / 100;
    state.root.traverse((obj: any) => {
      if (obj.isMesh && obj.material && obj.userData?.__casco) {
        const mat = obj.material;
        mat.transparent = true;
        mat.opacity = opacity;
        mat.needsUpdate = true;
      }
    });
  }, [threeOpacity, previewView, dev, preview]);

  // Highlight 3D por selección
  useEffect(() => {
    if (previewView !== '3d') return;
    const state = threeRef.current;
    if (!state) return;

    for (const g of state.spans) setEmissiveOnObject(g, 0x000000, 0);
    for (const g of state.nodes) setEmissiveOnObject(g, 0x000000, 0);

    if (!zoomEnabled) return;

    if (selection.kind === 'span') {
      const g = state.spans[selection.index];
      if (g) setEmissiveOnObject(g, 0xfacc15, 0.25);
      if (g) {
        const host = threeHostRef.current;
        const rect = host?.getBoundingClientRect();
        const viewport = rect ? { w: Math.max(1, Math.round(rect.width)), h: Math.max(1, Math.round(rect.height)) } : undefined;
        fitCameraToObject(state.camera, state.controls, g, viewport);
      }
    } else if (selection.kind === 'node') {
      const g = state.nodes[selection.index];
      if (g) setEmissiveOnObject(g, 0xfacc15, 0.40);
      if (g) {
        const host = threeHostRef.current;
        const rect = host?.getBoundingClientRect();
        const viewport = rect ? { w: Math.max(1, Math.round(rect.width)), h: Math.max(1, Math.round(rect.height)) } : undefined;
        fitCameraToObject(state.camera, state.controls, g, viewport);
      }
    }
  }, [selection, zoomEnabled, previewView]);

  return {
    threeHostRef,
    threeRef,
    threeOverviewHostRef,
    threeOverviewRef,
  };
}
