/* Central settings model. Everything the app persists, undoes and
   exports as a project file lives in this one tree. The source image
   itself is kept outside (module state + IndexedDB blob). */

export type GeometryMode = 'points' | 'heightfield' | 'scanlines';
export type PointShape = 'square' | 'circle' | 'soft' | 'diamond';
export type HeightSource =
  | 'luminance' | 'inv-luminance' | 'red' | 'green' | 'blue'
  | 'alpha' | 'edge' | 'radial';
export type HeightDir = 'forward' | 'backward' | 'both';
export type Quality = 'draft' | 'medium' | 'high' | 'custom';
export type GridRender = 'fill' | 'wire' | 'points-surface';
export type Orientation = 'horizontal' | 'vertical';

export type AnimPreset =
  | 'none' | 'wave' | 'bend' | 'pulse' | 'separate'
  | 'twist' | 'collapse' | 'ripple' | 'scanline';

export type Axis = 'x' | 'y' | 'z';
export type ColorMode =
  | 'original' | 'monochrome' | 'duotone' | 'grayscale'
  | 'gradient' | 'height' | 'solid';
export type BgType = 'transparent' | 'solid' | 'vgradient' | 'rgradient';
export type Projection = 'perspective' | 'orthographic';
export type StillFormat = 'png' | 'jpeg' | 'webp';
export type AnimFormat = 'webm' | 'png-seq' | 'mp4';

export type EaseType = 'linear' | 'in' | 'out' | 'in-out' | 'hold';

/** One keyframe on a numeric setting track. `t` is normalized loop
    time (0..1) so tracks stay loop-safe when the duration changes;
    the UI displays seconds/frames. */
export interface Keyframe {
  id: string;
  t: number;
  v: number;
  ease: EaseType;
}

/** path → keyframe list (sorted by t). Only shader/transform-driven
    numeric paths are keyable (see state/keyframes.ts). */
export type KeyframeMap = Record<string, Keyframe[]>;

export interface Settings {
  geometry: {
    mode: GeometryMode;
    quality: Quality;
    points: {
      density: number;        // samples along the larger image dimension
      size: number;           // px at reference distance
      shape: PointShape;
      spread: number;         // spacing multiplier between points
      opacity: number;
      alphaThreshold: number; // 0..1 discard below
      perspectiveSize: boolean;
      removal: number;        // 0..1 random fraction removed
    };
    grid: {
      resolution: number;     // vertices along the larger image dimension
      render: GridRender;
      smoothing: number;      // extra height blur
      opacity: number;
    };
    scan: {
      orientation: Orientation;
      lineSpacing: number;    // rows step in samples
      thickness: number;      // point size
      pointSpacing: number;   // step along the row
    };
  };
  height: {
    source: HeightSource;
    amount: number;           // world units at image width 3
    direction: HeightDir;
    offset: number;
    contrast: number;         // 0.2..3
    gamma: number;            // 0.2..3
    blur: number;             // blur radius in samples
    invert: boolean;
    clampLo: number;          // 0..1
    clampHi: number;          // 0..1
  };
  animation: {
    preset: AnimPreset;
    wave: { strength: number; direction: number; frequency: number; width: number; sharpness: number; speed: number };
    bend: { axis: Axis; amount: number; radius: number; center: number; speed: number };
    pulse: { minDepth: number; maxDepth: number; speed: number; delayBrightness: number; delayPosition: number };
    separate: { amount: number; randomness: number; direction: number; noiseScale: number; returnStrength: number; speed: number };
    twist: { axis: Axis; amount: number; center: number; falloff: number; speed: number };
    collapse: { direction: number; amount: number; position: number; rotation: number; softness: number; speed: number };
    ripple: { centerX: number; centerY: number; amplitude: number; frequency: number; decay: number; speed: number };
    scanline: { direction: Orientation; displacement: number; delay: number; frequency: number; speed: number };
    global: {
      rotX: number; rotY: number; rotZ: number;   // turns per loop (integers keep loops seamless)
      orbit: boolean; orbitStrength: number;       // camera sway, sin-based
    };
  };
  playback: { duration: number; fps: number; loop: boolean };
  appearance: {
    colorMode: ColorMode;
    brightness: number; contrast: number; saturation: number;
    gamma: number; hueShift: number; opacity: number;
    quantize: number;         // 0 = off, else levels
    monoColor: string;
    duotoneA: string; duotoneB: string;
    gradientA: string; gradientB: string;
    solidColor: string;
    depthFade: number;        // 0..1
  };
  background: { type: BgType; colorA: string; colorB: string };
  scene: {
    scale: number;
    posX: number; posY: number; posZ: number;
    rotX: number; rotY: number; rotZ: number;    // static offsets, degrees
    fov: number;                                  // perspective strength
  };
  camera: { projection: Projection };
  viewport: {
    showGrid: boolean; showAxes: boolean; showBox: boolean;
    showFrame: boolean;
    /** Dimming of the viewport outside the render frame (0..1). */
    passepartout: number;
  };
  keyframes: KeyframeMap;
  export: {
    width: number; height: number; fps: number; duration: number;
    quality: number;          // 0..1 (jpeg/webp/webm bitrate scale)
    transparent: boolean;
    fileName: string;
    stillFormat: StillFormat;
    animFormat: AnimFormat;
  };
}

export const defaultSettings: Settings = {
  geometry: {
    mode: 'points',
    quality: 'medium',
    points: {
      density: 200, size: 2.4, shape: 'circle', spread: 1, opacity: 1,
      alphaThreshold: 0.05, perspectiveSize: true, removal: 0,
    },
    grid: { resolution: 256, render: 'fill', smoothing: 0, opacity: 1 },
    scan: { orientation: 'horizontal', lineSpacing: 3, thickness: 2.2, pointSpacing: 1 },
  },
  height: {
    source: 'luminance', amount: 0.6, direction: 'forward', offset: 0,
    contrast: 1, gamma: 1, blur: 0, invert: false, clampLo: 0, clampHi: 1,
  },
  animation: {
    preset: 'wave',
    wave: { strength: 0.35, direction: 90, frequency: 1.5, width: 0.35, sharpness: 1.2, speed: 1 },
    bend: { axis: 'y', amount: 60, radius: 1.2, center: 0.5, speed: 1 },
    pulse: { minDepth: 0.15, maxDepth: 1.6, speed: 1, delayBrightness: 0.35, delayPosition: 0 },
    separate: { amount: 0.9, randomness: 0.75, direction: 0, noiseScale: 3, returnStrength: 1.6, speed: 1 },
    twist: { axis: 'y', amount: 120, center: 0.5, falloff: 1, speed: 1 },
    collapse: { direction: 0, amount: 0.9, position: 0.5, rotation: 90, softness: 0.4, speed: 1 },
    ripple: { centerX: 0.5, centerY: 0.5, amplitude: 0.4, frequency: 3, decay: 1.2, speed: 1 },
    scanline: { direction: 'horizontal', displacement: 0.3, delay: 1, frequency: 1, speed: 1 },
    global: { rotX: 0, rotY: 0, rotZ: 0, orbit: false, orbitStrength: 0.3 },
  },
  playback: { duration: 4, fps: 30, loop: true },
  appearance: {
    colorMode: 'original',
    brightness: 0, contrast: 1, saturation: 1, gamma: 1, hueShift: 0,
    opacity: 1, quantize: 0,
    monoColor: '#5fc6e8',
    duotoneA: '#071318', duotoneB: '#7fd4ff',
    gradientA: '#46b3cc', gradientB: '#ff9d5c',
    solidColor: '#5fc6e8',
    depthFade: 0,
  },
  background: { type: 'solid', colorA: '#000000', colorB: '#0e2a35' },
  scene: {
    scale: 1, posX: 0, posY: 0, posZ: 0, rotX: 0, rotY: 0, rotZ: 0, fov: 45,
  },
  camera: { projection: 'orthographic' },
  viewport: {
    showGrid: false, showAxes: false, showBox: false,
    showFrame: true, passepartout: 0.6,
  },
  keyframes: {},
  export: {
    width: 1080, height: 1080, fps: 30, duration: 4, quality: 0.85,
    transparent: false, fileName: 'pixelform',
    stillFormat: 'png', animFormat: 'webm',
  },
};

/** Deep-clone helper for settings snapshots. */
export const cloneSettings = (s: Settings): Settings =>
  JSON.parse(JSON.stringify(s)) as Settings;
