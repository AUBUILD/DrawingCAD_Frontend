import type * as THREE from 'three';
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { DevelopmentIn, PreviewResponse } from '../types';
import type { Selection, AppConfig } from '../services';

export type ThreeProjection = 'perspective' | 'orthographic';

export interface ThreeSceneState {
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

export interface UseThreeSceneParams {
  previewView: '2d' | '3d';
  preview: PreviewResponse | null;
  dev: DevelopmentIn;
  appCfg: AppConfig;
  selection: Selection;
  threeOpacity: number;
  zoomEnabled: boolean;
  showLongitudinal: boolean;
  showBastones: boolean;
  showStirrups: boolean;
  hookLegM: number;
  threeProjection: ThreeProjection;
}
