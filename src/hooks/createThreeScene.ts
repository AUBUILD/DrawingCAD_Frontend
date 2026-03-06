import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { setOrthoFrustum, fitCameraToObject, disposeObject3D } from '../services';
import type { ThreeSceneState, ThreeProjection } from './threeScene.types';

interface CreateSceneOptions {
  projection: ThreeProjection;
  interactive: boolean;
}

interface CreateSceneResult {
  state: ThreeSceneState;
  cleanup: () => void;
}

export function createThreeScene(
  host: HTMLDivElement,
  stateRef: React.MutableRefObject<ThreeSceneState | null>,
  options: CreateSceneOptions,
): CreateSceneResult {
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

  const camera = options.projection === 'orthographic' ? orthoCamera : perspCamera;

  const controls = new OrbitControls(camera, renderer.domElement);
  if (options.interactive) {
    controls.enableDamping = true;
    controls.dampingFactor = 0.09;
    controls.rotateSpeed = 0.65;
    controls.zoomSpeed = 1.15;
    controls.panSpeed = 1.05;
    controls.screenSpacePanning = true;
    controls.zoomToCursor = true;
    controls.minPolarAngle = 0.05;
    controls.maxPolarAngle = Math.PI - 0.05;
    controls.mouseButtons = {
      LEFT: THREE.MOUSE.ROTATE,
      MIDDLE: THREE.MOUSE.PAN,
      RIGHT: THREE.MOUSE.PAN,
    } as any;
  } else {
    controls.enableDamping = false;
    controls.enableRotate = false;
    controls.enableZoom = false;
    controls.enablePan = false;
  }

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

  let onDblClickHandler: (() => void) | null = null;
  if (options.interactive) {
    onDblClickHandler = () => {
      const rect = host.getBoundingClientRect();
      fitCameraToObject(
        (stateRef.current?.camera ?? camera) as any,
        controls,
        root,
        { w: Math.max(1, Math.round(rect.width)), h: Math.max(1, Math.round(rect.height)) }
      );
    };
    renderer.domElement.addEventListener('dblclick', onDblClickHandler);
  }

  const onResize = () => {
    const rect = host.getBoundingClientRect();
    const w = Math.max(1, Math.round(rect.width));
    const h = Math.max(1, Math.round(rect.height));
    renderer.setSize(w, h, false);
    const s = stateRef.current;
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
    const s = stateRef.current;
    if (!s) return;
    s.controls.update();
    s.renderer.render(s.scene, s.camera);
    raf = window.requestAnimationFrame(tick);
  };
  raf = window.requestAnimationFrame(tick);

  const state: ThreeSceneState = {
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

  const cleanup = () => {
    window.cancelAnimationFrame(raf);
    ro.disconnect();
    if (onDblClickHandler) {
      renderer.domElement.removeEventListener('dblclick', onDblClickHandler);
    }
    disposeObject3D(root);
    renderer.dispose();
    renderer.domElement.remove();
    stateRef.current = null;
  };

  return { state, cleanup };
}
