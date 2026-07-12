/* Rendering engine. Owns the Three.js scene, cameras, controls and
   the animation clock. Consumes the settings store diff-wise:
   cheap changes (uniforms) apply immediately, expensive ones
   (resampling / geometry rebuilds) are debounced. All motion derives
   from a normalized loop time so playback and export stay in sync. */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Settings, cloneSettings } from '../state/types';
import { evalTrack } from '../state/keyframes';
import { SourceImage } from '../image/source';
import { SampledImage, buildSample, computeHeight } from '../image/sampler';
import {
  buildPointsGeometry, buildScanlinesGeometry, buildHeightfieldGeometry,
  updateHeightAttribute, worldSize,
} from './build';
import { VERT, FRAG } from './shaders';

const TAU = Math.PI * 2;

/** Mutating dot-path setter for the per-frame effective settings. */
function setPathValue(obj: unknown, path: string, value: number): void {
  const parts = path.split('.');
  let node = obj as Record<string, unknown>;
  for (let i = 0; i < parts.length - 1; i++) {
    node = node[parts[i]] as Record<string, unknown>;
    if (!node) return;
  }
  node[parts[parts.length - 1]] = value;
}

export interface EngineStats {
  count: number;
  cols: number;
  rows: number;
}

type UniformMap = Record<string, THREE.IUniform>;

function makeUniforms(): UniformMap {
  return {
    uPhase: { value: 0 },
    uHeightAmt: { value: 0.6 },
    uHeightMode: { value: 0 },
    uHeightOffset: { value: 0 },
    uSpread: { value: 1 },
    uHalf: { value: new THREE.Vector2(1.5, 1.5) },
    uPreset: { value: 0 },
    uP: { value: new Array(10).fill(0) as number[] },
    uPointSize: { value: 2.4 },
    uSizeAtten: { value: 1 },
    uRefDist: { value: 5 },
    uDpr: { value: 1 },
    uPointShape: { value: 1 },
    uOpacity: { value: 1 },
    uAlphaThresh: { value: 0.05 },
    uRemove: { value: 0 },
    uColorMode: { value: 0 },
    uMono: { value: new THREE.Color('#5fc6e8') },
    uDuoA: { value: new THREE.Color('#071318') },
    uDuoB: { value: new THREE.Color('#7fd4ff') },
    uGradA: { value: new THREE.Color('#46b3cc') },
    uGradB: { value: new THREE.Color('#ff9d5c') },
    uSolid: { value: new THREE.Color('#5fc6e8') },
    uBrightness: { value: 0 },
    uContrast: { value: 1 },
    uSaturation: { value: 1 },
    uGammaC: { value: 1 },
    uHue: { value: 0 },
    uQuantize: { value: 0 },
    uDepthFade: { value: 0 },
    uFadeRange: { value: new THREE.Vector2(3, 9) },
  };
}

export class Engine {
  renderer: THREE.WebGLRenderer | null = null;
  readonly scene = new THREE.Scene();
  /** Object root: geometry lives here; scene transform applies here. */
  readonly root = new THREE.Group();

  perspCam = new THREE.PerspectiveCamera(45, 1, 0.01, 200);
  orthoCam = new THREE.OrthographicCamera(-3, 3, 3, -3, -50, 200);
  private activeProjection: 'perspective' | 'orthographic' = 'perspective';
  controls: OrbitControls | null = null;

  private container: HTMLElement | null = null;
  private resizeObs: ResizeObserver | null = null;

  readonly uniforms = makeUniforms();
  /** Mesh shares every uniform except uOpacity, so surface opacity and
      point opacity stay independent in points+surface mode. */
  private meshOpacity: THREE.IUniform = { value: 1 };
  private pointsMat: THREE.ShaderMaterial;
  private meshMat: THREE.ShaderMaterial;
  private pointsObj: THREE.Points | null = null;
  private meshObj: THREE.Mesh | null = null;

  private gridHelper: THREE.GridHelper | null = null;
  private axesHelper: THREE.AxesHelper | null = null;
  private boxHelper: THREE.Box3Helper | null = null;

  private image: SourceImage | null = null;
  private sample: SampledImage | null = null;
  private sampleKey = '';
  private heightKey = '';
  private geomKey = '';
  private rebuildTimer: ReturnType<typeof setTimeout> | null = null;

  private settings: Settings | null = null;
  /** Per-frame working copy: keyframed paths are written into this
      clone each frame before uniforms/transforms are applied. */
  private effective: Settings | null = null;
  private bgTexture: THREE.CanvasTexture | null = null;
  private bgKey = '';

  /* playback */
  playing = false;
  time = 0;
  private lastTs: number | null = null;

  private stats: EngineStats = { count: 0, cols: 0, rows: 0 };
  private tickListeners = new Set<() => void>();
  private statsListeners = new Set<() => void>();

  constructor() {
    this.scene.add(this.root);
    this.pointsMat = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG,
      uniforms: this.uniforms,
      defines: { IS_POINTS: 1 },
      transparent: true, depthWrite: true, depthTest: true,
    });
    this.meshMat = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG,
      uniforms: { ...this.uniforms, uOpacity: this.meshOpacity },
      transparent: true, depthWrite: true, depthTest: true,
      side: THREE.DoubleSide,
    });
    this.perspCam.position.set(1.6, 1.1, 4.6);
    this.orthoCam.position.set(1.6, 1.1, 4.6);
  }

  /* ---------------- lifecycle ---------------- */

  init(container: HTMLElement): void {
    this.container = container;
    const renderer = new THREE.WebGLRenderer({
      antialias: true, alpha: true, powerPreference: 'high-performance',
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(renderer.domElement);
    this.renderer = renderer;

    this.attachControls();
    this.resize();
    this.resizeObs = new ResizeObserver(() => this.resize());
    this.resizeObs.observe(container);

    renderer.setAnimationLoop((ts) => this.frame(ts));
  }

  destroy(): void {
    this.renderer?.setAnimationLoop(null);
    this.resizeObs?.disconnect();
    this.controls?.dispose();
    this.disposeObjects();
    this.bgTexture?.dispose();
    this.pointsMat.dispose();
    this.meshMat.dispose();
    if (this.renderer) {
      this.renderer.dispose();
      this.renderer.domElement.remove();
      this.renderer = null;
    }
    this.container = null;
  }

  private attachControls(): void {
    if (!this.renderer) return;
    const cam = this.activeCamera();
    this.controls?.dispose();
    const c = new OrbitControls(cam, this.renderer.domElement);
    c.enableDamping = true;
    c.dampingFactor = 0.09;
    c.minDistance = 0.2;
    c.maxDistance = 60;
    this.controls = c;
  }

  activeCamera(): THREE.Camera {
    return this.activeProjection === 'perspective' ? this.perspCam : this.orthoCam;
  }

  resize(): void {
    if (!this.renderer || !this.container) return;
    const w = Math.max(1, this.container.clientWidth);
    const h = Math.max(1, this.container.clientHeight);
    this.renderer.setSize(w, h, false);
    this.perspCam.aspect = w / h;
    this.perspCam.updateProjectionMatrix();
    this.syncOrtho();
  }

  private syncOrtho(): void {
    if (!this.container) return;
    const w = Math.max(1, this.container.clientWidth);
    const h = Math.max(1, this.container.clientHeight);
    const target = this.controls ? this.controls.target : new THREE.Vector3();
    const dist = this.perspCam.position.distanceTo(target);
    const halfH = Math.tan(THREE.MathUtils.degToRad(this.perspCam.fov / 2)) * dist;
    const halfW = halfH * (w / h);
    this.orthoCam.left = -halfW; this.orthoCam.right = halfW;
    this.orthoCam.top = halfH; this.orthoCam.bottom = -halfH;
    this.orthoCam.updateProjectionMatrix();
  }

  setProjection(p: 'perspective' | 'orthographic'): void {
    if (p === this.activeProjection) return;
    const target = this.controls ? this.controls.target.clone() : new THREE.Vector3();
    if (p === 'orthographic') {
      this.orthoCam.position.copy(this.perspCam.position);
      this.orthoCam.quaternion.copy(this.perspCam.quaternion);
      this.orthoCam.zoom = 1;
      this.syncOrtho();
    } else {
      this.perspCam.position.copy(this.orthoCam.position);
      this.perspCam.quaternion.copy(this.orthoCam.quaternion);
    }
    this.activeProjection = p;
    this.attachControls();
    if (this.controls) { this.controls.target.copy(target); this.controls.update(); }
  }

  /* ---------------- camera actions ---------------- */

  resetCamera(): void {
    if (!this.controls) return;
    this.controls.target.set(0, 0, 0);
    const cam = this.activeCamera();
    cam.position.set(1.6, 1.1, 4.6);
    if (cam instanceof THREE.OrthographicCamera) { cam.zoom = 1; cam.updateProjectionMatrix(); }
    this.controls.update();
    this.syncOrtho();
  }

  frontView(): void {
    if (!this.controls) return;
    const t = this.controls.target;
    const cam = this.activeCamera();
    const dist = cam.position.distanceTo(t);
    cam.position.set(t.x, t.y, t.z + dist);
    this.controls.update();
  }

  fitToView(): void {
    if (!this.controls) return;
    const box = new THREE.Box3().setFromObject(this.root);
    if (box.isEmpty()) return;
    const center = box.getCenter(new THREE.Vector3());
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    const cam = this.activeCamera();
    const dir = cam.position.clone().sub(this.controls.target).normalize();
    if (cam instanceof THREE.PerspectiveCamera) {
      const fitDist = sphere.radius / Math.sin(THREE.MathUtils.degToRad(cam.fov / 2)) * 1.06;
      cam.position.copy(center).addScaledVector(dir, fitDist);
    } else if (cam instanceof THREE.OrthographicCamera) {
      const halfH = Math.abs(cam.top);
      cam.zoom = halfH / (sphere.radius * 1.1);
      cam.updateProjectionMatrix();
      cam.position.copy(center).addScaledVector(dir, sphere.radius * 4);
    }
    this.controls.target.copy(center);
    this.controls.update();
  }

  /* ---------------- image & geometry ---------------- */

  setImage(img: SourceImage | null): void {
    this.image = img;
    this.sample = null;
    this.sampleKey = '';
    this.heightKey = '';
    this.geomKey = '';
    if (!img) {
      this.disposeObjects();
      this.setStats({ count: 0, cols: 0, rows: 0 });
      return;
    }
    if (this.settings) this.rebuildNow(this.settings);
  }

  hasImage(): boolean { return this.image !== null; }

  private samplesFor(s: Settings): number {
    return s.geometry.mode === 'heightfield'
      ? s.geometry.grid.resolution
      : s.geometry.points.density;
  }

  private computeKeys(s: Settings): { sample: string; height: string; geom: string } {
    const sampleKey = `${this.image?.url ?? ''}|${this.samplesFor(s)}|${s.geometry.mode === 'heightfield'}`;
    const smoothing = s.geometry.mode === 'heightfield' ? s.geometry.grid.smoothing : 0;
    const heightKey = JSON.stringify(s.height) + `|${smoothing}|${sampleKey}`;
    const geomKey = `${s.geometry.mode}|${JSON.stringify(s.geometry.scan)}|${s.geometry.grid.render}|${sampleKey}|${heightKey}`;
    return { sample: sampleKey, height: heightKey, geom: geomKey };
  }

  private disposeObjects(): void {
    if (this.pointsObj) {
      this.pointsObj.geometry.dispose();
      this.root.remove(this.pointsObj);
      this.pointsObj = null;
    }
    if (this.meshObj) {
      this.meshObj.geometry.dispose();
      this.root.remove(this.meshObj);
      this.meshObj = null;
    }
    if (this.boxHelper) {
      this.scene.remove(this.boxHelper);
      this.boxHelper.dispose();
      this.boxHelper = null;
    }
  }

  private rebuildNow(s: Settings): void {
    if (!this.image) return;
    const keys = this.computeKeys(s);

    if (!this.sample || keys.sample !== this.sampleKey) {
      const base = buildSample(this.image, this.samplesFor(s));
      const smoothing = s.geometry.mode === 'heightfield' ? s.geometry.grid.smoothing : 0;
      const height = computeHeight(s.height, smoothing, base.rgba, base.lum, base.cols, base.rows);
      this.sample = { ...base, height };
      this.sampleKey = keys.sample;
      this.heightKey = keys.height;
    } else if (keys.height !== this.heightKey) {
      const smoothing = s.geometry.mode === 'heightfield' ? s.geometry.grid.smoothing : 0;
      this.sample = {
        ...this.sample,
        height: computeHeight(s.height, smoothing, this.sample.rgba, this.sample.lum, this.sample.cols, this.sample.rows),
      };
      this.heightKey = keys.height;
      // fast path: update attribute in place when geometry itself is unchanged
      if (keys.geom === this.geomKey) {
        if (this.pointsObj) updateHeightAttribute(this.pointsObj.geometry, this.sample, s.geometry.mode);
        if (this.meshObj) updateHeightAttribute(this.meshObj.geometry, this.sample, s.geometry.mode);
        return;
      }
    } else if (keys.geom === this.geomKey) {
      return;
    }

    this.disposeObjects();
    const smp = this.sample;
    const mode = s.geometry.mode;
    let count = 0;

    if (mode === 'points') {
      const g = buildPointsGeometry(smp);
      this.pointsObj = new THREE.Points(g, this.pointsMat);
      this.pointsObj.frustumCulled = false;
      this.root.add(this.pointsObj);
      count = g.getAttribute('position').count;
    } else if (mode === 'scanlines') {
      const g = buildScanlinesGeometry(smp, s.geometry.scan);
      this.pointsObj = new THREE.Points(g, this.pointsMat);
      this.pointsObj.frustumCulled = false;
      this.root.add(this.pointsObj);
      count = g.getAttribute('position').count;
    } else {
      const g = buildHeightfieldGeometry(smp);
      this.meshObj = new THREE.Mesh(g, this.meshMat);
      this.meshObj.frustumCulled = false;
      this.root.add(this.meshObj);
      count = g.getAttribute('position').count;
      if (s.geometry.grid.render === 'points-surface') {
        const pg = buildPointsGeometry(smp);
        this.pointsObj = new THREE.Points(pg, this.pointsMat);
        this.pointsObj.frustumCulled = false;
        this.root.add(this.pointsObj);
        count += pg.getAttribute('position').count;
      }
    }
    this.geomKey = keys.geom;

    const { w, h } = worldSize(smp.cols, smp.rows);
    (this.uniforms.uHalf.value as THREE.Vector2).set(w / 2, h / 2);

    this.setStats({ count, cols: smp.cols, rows: smp.rows });
    this.refreshBoxHelper(s);
  }

  private refreshBoxHelper(s: Settings): void {
    if (this.boxHelper) {
      this.scene.remove(this.boxHelper);
      this.boxHelper.dispose();
      this.boxHelper = null;
    }
    if (s.viewport.showBox && this.image && this.sample) {
      const box = new THREE.Box3().setFromObject(this.root);
      if (!box.isEmpty()) {
        this.boxHelper = new THREE.Box3Helper(box, new THREE.Color('#2c5566'));
        this.scene.add(this.boxHelper);
      }
    }
  }

  /* ---------------- settings application ---------------- */

  applySettings(s: Settings): void {
    this.settings = cloneSettings(s);
    this.effective = cloneSettings(s);

    this.applyUniforms(s);

    /* camera projection */
    this.setProjection(s.camera.projection);

    /* helpers */
    this.applyHelpers(s);

    /* background */
    this.applyBackground(s);

    /* playback bounds */
    if (this.time > s.playback.duration) this.time = 0;

    /* expensive: geometry / sampling — debounce */
    if (this.image) {
      const keys = this.computeKeys(s);
      if (keys.geom !== this.geomKey || keys.sample !== this.sampleKey || keys.height !== this.heightKey) {
        if (this.rebuildTimer) clearTimeout(this.rebuildTimer);
        const heightOnly = keys.sample === this.sampleKey && keys.geom.replace(keys.height, this.heightKey) === this.geomKey;
        this.rebuildTimer = setTimeout(() => {
          this.rebuildTimer = null;
          if (this.settings) this.rebuildNow(this.settings);
        }, heightOnly ? 50 : 130);
      }
    }
  }

  /** Cheap per-frame-safe application of every uniform/material/camera
      value. Called on settings changes and (with keyframed values) on
      every animation frame. */
  private applyUniforms(s: Settings): void {
    const u = this.uniforms;

    u.uHeightAmt.value = s.height.amount;
    u.uHeightMode.value = s.height.direction === 'forward' ? 0 : s.height.direction === 'backward' ? 1 : 2;
    u.uHeightOffset.value = s.height.offset;
    u.uSpread.value = s.geometry.points.spread;
    u.uPointSize.value = s.geometry.mode === 'scanlines'
      ? s.geometry.scan.thickness : s.geometry.points.size;
    u.uSizeAtten.value = s.geometry.points.perspectiveSize ? 1 : 0;
    u.uPointShape.value = ['square', 'circle', 'soft', 'diamond'].indexOf(s.geometry.points.shape);
    u.uOpacity.value = s.geometry.points.opacity;
    this.meshOpacity.value = s.geometry.grid.opacity;
    u.uAlphaThresh.value = Math.max(s.height.source === 'alpha' ? 0 : 0.003, s.geometry.points.alphaThreshold);
    u.uRemove.value = s.geometry.points.removal;

    u.uColorMode.value = ['original', 'monochrome', 'duotone', 'grayscale', 'gradient', 'height', 'solid']
      .indexOf(s.appearance.colorMode);
    (u.uMono.value as THREE.Color).set(s.appearance.monoColor);
    (u.uDuoA.value as THREE.Color).set(s.appearance.duotoneA);
    (u.uDuoB.value as THREE.Color).set(s.appearance.duotoneB);
    (u.uGradA.value as THREE.Color).set(s.appearance.gradientA);
    (u.uGradB.value as THREE.Color).set(s.appearance.gradientB);
    (u.uSolid.value as THREE.Color).set(s.appearance.solidColor);
    u.uBrightness.value = s.appearance.brightness;
    u.uContrast.value = s.appearance.contrast;
    u.uSaturation.value = s.appearance.saturation;
    u.uGammaC.value = s.appearance.gamma;
    u.uHue.value = THREE.MathUtils.degToRad(s.appearance.hueShift);
    u.uQuantize.value = s.appearance.quantize;
    u.uDepthFade.value = s.appearance.depthFade;

    this.applyAnimUniforms(s);

    /* mesh appearance */
    this.meshMat.wireframe = s.geometry.grid.render === 'wire';
    const meshTransparent = s.geometry.grid.opacity < 1 || this.imageHasAlpha();
    this.meshMat.depthWrite = !meshTransparent || s.geometry.grid.opacity >= 0.999;
    this.pointsMat.depthWrite = s.geometry.points.shape !== 'soft' && s.geometry.points.opacity >= 0.999;

    /* object position/scale (rotation is composed in applyTime) */
    this.root.position.set(s.scene.posX, s.scene.posY, s.scene.posZ);
    this.root.scale.setScalar(Math.max(0.01, s.scene.scale));

    /* perspective strength */
    if (this.perspCam.fov !== s.scene.fov) {
      this.perspCam.fov = s.scene.fov;
      this.perspCam.updateProjectionMatrix();
    }
  }

  private imageHasAlpha(): boolean { return this.image?.hasAlpha ?? false; }

  private applyAnimUniforms(s: Settings): void {
    const a = s.animation;
    const u = this.uniforms;
    const P = u.uP.value as number[];
    P.fill(0);
    const d2r = THREE.MathUtils.degToRad;
    const spd = (v: number) => Math.max(1, Math.round(v)); // integer cycles → seamless loops
    switch (a.preset) {
      case 'none': u.uPreset.value = 0; break;
      case 'wave':
        u.uPreset.value = 1;
        P[0] = a.wave.strength; P[1] = d2r(a.wave.direction); P[2] = a.wave.frequency;
        P[3] = a.wave.width; P[4] = a.wave.sharpness; P[5] = spd(a.wave.speed);
        break;
      case 'bend':
        u.uPreset.value = 2;
        P[0] = a.bend.axis === 'x' ? 0 : 1; P[1] = d2r(a.bend.amount);
        P[2] = a.bend.radius; P[3] = a.bend.center; P[4] = spd(a.bend.speed);
        break;
      case 'pulse':
        u.uPreset.value = 3;
        P[0] = a.pulse.minDepth; P[1] = a.pulse.maxDepth; P[2] = spd(a.pulse.speed);
        P[3] = a.pulse.delayBrightness; P[4] = a.pulse.delayPosition;
        break;
      case 'separate':
        u.uPreset.value = 4;
        P[0] = a.separate.amount; P[1] = a.separate.randomness; P[2] = d2r(a.separate.direction);
        P[3] = a.separate.noiseScale; P[4] = a.separate.returnStrength; P[5] = spd(a.separate.speed);
        break;
      case 'twist':
        u.uPreset.value = 5;
        P[0] = a.twist.axis === 'x' ? 0 : a.twist.axis === 'y' ? 1 : 2;
        P[1] = d2r(a.twist.amount); P[2] = a.twist.center; P[3] = a.twist.falloff;
        P[4] = spd(a.twist.speed);
        break;
      case 'collapse':
        u.uPreset.value = 6;
        P[0] = d2r(a.collapse.direction); P[1] = a.collapse.amount; P[2] = a.collapse.position;
        P[3] = d2r(a.collapse.rotation); P[4] = a.collapse.softness; P[5] = spd(a.collapse.speed);
        break;
      case 'ripple':
        u.uPreset.value = 7;
        P[0] = a.ripple.centerX; P[1] = a.ripple.centerY; P[2] = a.ripple.amplitude;
        P[3] = a.ripple.frequency; P[4] = a.ripple.decay; P[5] = spd(a.ripple.speed);
        break;
      case 'scanline':
        u.uPreset.value = 8;
        P[0] = a.scanline.direction === 'horizontal' ? 0 : 1;
        P[1] = a.scanline.displacement; P[2] = a.scanline.delay;
        P[3] = a.scanline.frequency; P[4] = spd(a.scanline.speed);
        break;
    }
  }

  private applyHelpers(s: Settings): void {
    if (s.viewport.showGrid && !this.gridHelper) {
      this.gridHelper = new THREE.GridHelper(8, 16, new THREE.Color('#2c5566'), new THREE.Color('#1d3a46'));
      this.gridHelper.position.y = -2;
      this.scene.add(this.gridHelper);
    } else if (!s.viewport.showGrid && this.gridHelper) {
      this.scene.remove(this.gridHelper);
      this.gridHelper.geometry.dispose();
      (this.gridHelper.material as THREE.Material).dispose();
      this.gridHelper = null;
    }
    if (s.viewport.showAxes && !this.axesHelper) {
      this.axesHelper = new THREE.AxesHelper(2.4);
      this.scene.add(this.axesHelper);
    } else if (!s.viewport.showAxes && this.axesHelper) {
      this.scene.remove(this.axesHelper);
      this.axesHelper.geometry.dispose();
      (this.axesHelper.material as THREE.Material).dispose();
      this.axesHelper = null;
    }
    if (s.viewport.showBox && !this.boxHelper) this.refreshBoxHelper(s);
    else if (!s.viewport.showBox && this.boxHelper) {
      this.scene.remove(this.boxHelper);
      this.boxHelper.dispose();
      this.boxHelper = null;
    }
  }

  private applyBackground(s: Settings): void {
    const key = JSON.stringify(s.background);
    if (key === this.bgKey) return;
    this.bgKey = key;
    this.bgTexture?.dispose();
    this.bgTexture = null;
    const bg = s.background;
    if (bg.type === 'transparent') {
      this.scene.background = null;
    } else if (bg.type === 'solid') {
      this.scene.background = new THREE.Color(bg.colorA);
    } else {
      const canvas = document.createElement('canvas');
      canvas.width = 512; canvas.height = 512;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        let grad: CanvasGradient;
        if (bg.type === 'vgradient') {
          grad = ctx.createLinearGradient(0, 0, 0, 512);
        } else {
          grad = ctx.createRadialGradient(256, 256, 10, 256, 256, 360);
        }
        grad.addColorStop(0, bg.colorB);
        grad.addColorStop(1, bg.colorA);
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, 512, 512);
      }
      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      this.bgTexture = tex;
      this.scene.background = tex;
    }
  }

  /* ---------------- time & rendering ---------------- */

  setTime(t: number): void {
    const dur = this.settings?.playback.duration ?? 4;
    this.time = THREE.MathUtils.clamp(t, 0, dur);
    this.emitTick();
  }

  play(): void { this.playing = true; this.lastTs = null; this.emitTick(); }
  pause(): void { this.playing = false; this.emitTick(); }
  toggle(): void { this.playing ? this.pause() : this.play(); }
  restart(): void { this.time = 0; this.emitTick(); }

  /** Apply deterministic animation state for time t (also used by export).
      Keyframed paths are evaluated at the normalized loop time and applied
      through the same uniform mapping as regular settings. */
  applyTime(t: number): void {
    const base = this.settings;
    if (!base) return;
    const dur = Math.max(0.1, base.playback.duration);
    const progress = (t % dur + dur) % dur / dur;
    const phase = progress * TAU;
    this.uniforms.uPhase.value = phase;

    let s = base;
    const trackPaths = Object.keys(base.keyframes);
    if (trackPaths.length > 0 && this.effective) {
      for (const path of trackPaths) {
        const track = base.keyframes[path];
        if (!track || track.length === 0) continue;
        const v = evalTrack(track, progress);
        if (!Number.isNaN(v)) setPathValue(this.effective, path, v);
      }
      s = this.effective;
      this.applyUniforms(s);
    }

    const g = s.animation.global;
    const d2r = THREE.MathUtils.degToRad;
    const turns = (v: number) => Math.round(v); // integer turns keep loops seamless
    this.root.rotation.set(
      d2r(s.scene.rotX) + turns(g.rotX) * progress * TAU,
      d2r(s.scene.rotY) + turns(g.rotY) * progress * TAU
        + (g.orbit ? Math.sin(phase) * g.orbitStrength * 0.5 : 0),
      d2r(s.scene.rotZ) + turns(g.rotZ) * progress * TAU,
    );
  }

  /** Current normalized loop time (0..1), wrapping at the loop end. */
  getLoopProgress(): number {
    const dur = Math.max(0.1, this.settings?.playback.duration ?? 4);
    return ((this.time % dur) + dur) % dur / dur;
  }

  /** Playhead position (0..1) WITHOUT wrapping — the scrubbed end of
      the loop reads as 1, so keyframes can be placed on the last frame. */
  getPlayheadProgress(): number {
    const dur = Math.max(0.1, this.settings?.playback.duration ?? 4);
    return Math.min(1, Math.max(0, this.time / dur));
  }

  private frame(ts: number): void {
    const s = this.settings;
    if (!this.renderer || !s) return;

    if (this.playing) {
      if (this.lastTs !== null) {
        const dt = Math.min(0.25, (ts - this.lastTs) / 1000);
        this.time += dt;
        const dur = Math.max(0.1, s.playback.duration);
        if (this.time >= dur) {
          if (s.playback.loop) this.time %= dur;
          else { this.time = dur; this.playing = false; }
        }
      }
      this.lastTs = ts;
      this.emitTick();
    } else {
      this.lastTs = null;
    }

    this.applyTime(this.time);
    this.controls?.update();

    /* per-frame view-dependent uniforms */
    const cam = this.activeCamera();
    const target = this.controls?.target ?? new THREE.Vector3();
    const dist = cam.position.distanceTo(target);
    this.uniforms.uRefDist.value = dist;
    this.uniforms.uDpr.value = this.renderer.getPixelRatio();
    const radius = 2.2 * Math.max(0.2, this.settings?.scene.scale ?? 1);
    (this.uniforms.uFadeRange.value as THREE.Vector2).set(dist - radius * 0.4, dist + radius * 1.4);

    this.renderer.render(this.scene, cam);
  }

  /** Render one deterministic frame into an external renderer (export). */
  renderExportFrame(renderer: THREE.WebGLRenderer, camera: THREE.Camera, t: number, dprScale: number): void {
    const helpersVisible: Array<[THREE.Object3D, boolean]> = [];
    for (const h of [this.gridHelper, this.axesHelper, this.boxHelper]) {
      if (h) { helpersVisible.push([h, h.visible]); h.visible = false; }
    }
    this.applyTime(t);
    const target = this.controls?.target ?? new THREE.Vector3();
    this.uniforms.uRefDist.value = camera.position.distanceTo(target);
    this.uniforms.uDpr.value = dprScale;
    renderer.render(this.scene, camera);
    for (const [h, v] of helpersVisible) h.visible = v;
    // restore live values next frame automatically (frame() resets them)
  }

  /* ---------------- events ---------------- */

  onTick(fn: () => void): () => void {
    this.tickListeners.add(fn);
    return () => { this.tickListeners.delete(fn); };
  }
  private emitTick(): void { for (const fn of this.tickListeners) fn(); }

  onStats(fn: () => void): () => void {
    this.statsListeners.add(fn);
    return () => { this.statsListeners.delete(fn); };
  }
  getStats(): EngineStats { return this.stats; }
  private setStats(s: EngineStats): void {
    this.stats = s;
    for (const fn of this.statsListeners) fn();
  }

  getDuration(): number { return this.settings?.playback.duration ?? 4; }
  getViewportCssHeight(): number { return this.container?.clientHeight ?? 800; }
}

export const engine = new Engine();
