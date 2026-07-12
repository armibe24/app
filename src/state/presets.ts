/* Starting-point presets. Each preset just patches real controls —
   everything stays editable afterwards. */

export interface StartingPreset {
  id: string;
  label: string;
  dot: string; // swatch color
  patch: Record<string, unknown>;
}

export const startingPresets: StartingPreset[] = [
  {
    id: 'soft-wave', label: 'Soft Image Wave', dot: '#5fc6e8',
    patch: {
      'geometry.mode': 'points',
      'animation.preset': 'wave',
      'animation.wave': { strength: 0.28, direction: 90, frequency: 1, width: 0.55, sharpness: 1, speed: 1 },
      'height.amount': 0.45, 'height.source': 'luminance',
      'animation.global': { rotX: 0, rotY: 0, rotZ: 0, orbit: true, orbitStrength: 0.25 },
    },
  },
  {
    id: 'rigid-fold', label: 'Rigid Image Fold', dot: '#54d6cf',
    patch: {
      'geometry.mode': 'points',
      'animation.preset': 'bend',
      'animation.bend': { axis: 'x', amount: 80, radius: 1, center: 0.5, speed: 1 },
      'height.amount': 0.2,
      'animation.global': { rotX: 0, rotY: 0, rotZ: 0, orbit: false, orbitStrength: 0.3 },
    },
  },
  {
    id: 'pixel-terrain', label: 'Pixel Terrain', dot: '#5aa6e6',
    patch: {
      'geometry.mode': 'points',
      'animation.preset': 'pulse',
      'animation.pulse': { minDepth: 0.2, maxDepth: 1.8, speed: 1, delayBrightness: 0.4, delayPosition: 0.2 },
      'height.amount': 0.8, 'height.source': 'luminance', 'height.blur': 1,
      'scene.rotX': -28,
      'animation.global': { rotX: 0, rotY: 0, rotZ: 0, orbit: false, orbitStrength: 0.3 },
    },
  },
  {
    id: 'particle-dissolve', label: 'Particle Dissolve', dot: '#7fd4ff',
    patch: {
      'geometry.mode': 'points',
      'animation.preset': 'separate',
      'animation.separate': { amount: 1.2, randomness: 0.85, direction: 0, noiseScale: 4, returnStrength: 2.2, speed: 1 },
      'height.amount': 0.35,
      'animation.global': { rotX: 0, rotY: 0, rotZ: 0, orbit: true, orbitStrength: 0.35 },
    },
  },
  {
    id: 'twisted-relief', label: 'Twisted Relief', dot: '#8fd21c',
    patch: {
      'geometry.mode': 'heightfield',
      'geometry.grid.render': 'fill',
      'animation.preset': 'twist',
      'animation.twist': { axis: 'y', amount: 100, center: 0.5, falloff: 1.2, speed: 1 },
      'height.amount': 0.5,
      'animation.global': { rotX: 0, rotY: 0, rotZ: 0, orbit: false, orbitStrength: 0.3 },
    },
  },
  {
    id: 'h-collapse', label: 'Horizontal Collapse', dot: '#ff9d5c',
    patch: {
      'geometry.mode': 'points',
      'animation.preset': 'collapse',
      'animation.collapse': { direction: 0, amount: 0.95, position: 0.5, rotation: 120, softness: 0.5, speed: 1 },
      'height.amount': 0.3,
      'animation.global': { rotX: 0, rotY: 0, rotZ: 0, orbit: false, orbitStrength: 0.3 },
    },
  },
  {
    id: 'v-collapse', label: 'Vertical Collapse', dot: '#e6a44c',
    patch: {
      'geometry.mode': 'points',
      'animation.preset': 'collapse',
      'animation.collapse': { direction: 90, amount: 0.95, position: 0.5, rotation: 120, softness: 0.5, speed: 1 },
      'height.amount': 0.3,
      'animation.global': { rotX: 0, rotY: 0, rotZ: 0, orbit: false, orbitStrength: 0.3 },
    },
  },
  {
    id: 'scan-landscape', label: 'Scanline Landscape', dot: '#b6f42e',
    patch: {
      'geometry.mode': 'scanlines',
      'geometry.scan': { orientation: 'horizontal', lineSpacing: 4, thickness: 2.4, pointSpacing: 1 },
      'animation.preset': 'scanline',
      'animation.scanline': { direction: 'horizontal', displacement: 0.35, delay: 0.6, frequency: 2, speed: 1 },
      'height.amount': 0.7,
      'scene.rotX': -20,
      'animation.global': { rotX: 0, rotY: 0, rotZ: 0, orbit: false, orbitStrength: 0.3 },
    },
  },
];
