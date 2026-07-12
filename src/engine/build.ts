/* Geometry builders. All modes share the same attribute layout
   (position, uv, aColor, aLum, aHeight, aRand) consumed by the
   über-shader, so switching modes never touches the image pipeline.
   Nothing here creates per-point objects — one BufferGeometry per mode. */

import * as THREE from 'three';
import { SampledImage } from '../image/sampler';
import { Settings } from '../state/types';

/** World size of the object: the larger image dimension spans 3 units. */
export function worldSize(cols: number, rows: number): { w: number; h: number } {
  if (cols >= rows) return { w: 3, h: 3 * rows / cols };
  return { w: 3 * cols / rows, h: 3 };
}

/* Deterministic per-index pseudo random (stable across rebuilds). */
function prand(i: number): number {
  const x = Math.sin(i * 127.1 + 311.7) * 43758.5453123;
  return x - Math.floor(x);
}

interface Arrays {
  pos: number[]; uv: number[]; col: number[];
  lum: number[]; hgt: number[]; rnd: number[];
}

function pushSample(a: Arrays, s: SampledImage, x: number, y: number, w: number, h: number): void {
  const i = y * s.cols + x;
  const u = s.cols > 1 ? x / (s.cols - 1) : 0.5;
  const v = s.rows > 1 ? y / (s.rows - 1) : 0.5;
  a.pos.push((u - 0.5) * w, (0.5 - v) * h, 0);
  a.uv.push(u, 1 - v);
  a.col.push(s.rgba[i * 4], s.rgba[i * 4 + 1], s.rgba[i * 4 + 2], s.rgba[i * 4 + 3]);
  a.lum.push(s.lum[i]);
  a.hgt.push(s.height[i]);
  a.rnd.push(prand(i));
}

function toGeometry(a: Arrays): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(a.pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(a.uv, 2));
  g.setAttribute('aColor', new THREE.Float32BufferAttribute(a.col, 4));
  g.setAttribute('aLum', new THREE.Float32BufferAttribute(a.lum, 1));
  g.setAttribute('aHeight', new THREE.Float32BufferAttribute(a.hgt, 1));
  g.setAttribute('aRand', new THREE.Float32BufferAttribute(a.rnd, 1));
  return g;
}

/** Point cloud: one point per sample with alpha > 0. */
export function buildPointsGeometry(s: SampledImage): THREE.BufferGeometry {
  const { w, h } = worldSize(s.cols, s.rows);
  const a: Arrays = { pos: [], uv: [], col: [], lum: [], hgt: [], rnd: [] };
  for (let y = 0; y < s.rows; y++) {
    for (let x = 0; x < s.cols; x++) {
      if (s.rgba[(y * s.cols + x) * 4 + 3] <= 0.003) continue;
      pushSample(a, s, x, y, w, h);
    }
  }
  return toGeometry(a);
}

/** Scanlines: rows (or columns) of points with independent spacing. */
export function buildScanlinesGeometry(
  s: SampledImage, opts: Settings['geometry']['scan'],
): THREE.BufferGeometry {
  const { w, h } = worldSize(s.cols, s.rows);
  const a: Arrays = { pos: [], uv: [], col: [], lum: [], hgt: [], rnd: [] };
  const lineStep = Math.max(1, Math.round(opts.lineSpacing));
  const ptStep = Math.max(1, Math.round(opts.pointSpacing));
  if (opts.orientation === 'horizontal') {
    for (let y = 0; y < s.rows; y += lineStep) {
      for (let x = 0; x < s.cols; x += ptStep) {
        if (s.rgba[(y * s.cols + x) * 4 + 3] <= 0.003) continue;
        pushSample(a, s, x, y, w, h);
      }
    }
  } else {
    for (let x = 0; x < s.cols; x += lineStep) {
      for (let y = 0; y < s.rows; y += ptStep) {
        if (s.rgba[(y * s.cols + x) * 4 + 3] <= 0.003) continue;
        pushSample(a, s, x, y, w, h);
      }
    }
  }
  return toGeometry(a);
}

/** Subdivided grid mesh whose vertices carry the height channel. */
export function buildHeightfieldGeometry(s: SampledImage): THREE.BufferGeometry {
  const { w, h } = worldSize(s.cols, s.rows);
  const a: Arrays = { pos: [], uv: [], col: [], lum: [], hgt: [], rnd: [] };
  for (let y = 0; y < s.rows; y++) {
    for (let x = 0; x < s.cols; x++) {
      pushSample(a, s, x, y, w, h);
    }
  }
  const g = toGeometry(a);
  const idx: number[] = [];
  for (let y = 0; y < s.rows - 1; y++) {
    for (let x = 0; x < s.cols - 1; x++) {
      const i0 = y * s.cols + x;
      const i1 = i0 + 1;
      const i2 = i0 + s.cols;
      const i3 = i2 + 1;
      // skip cells that are fully transparent (alpha support)
      const alphaOk =
        s.rgba[i0 * 4 + 3] > 0.003 || s.rgba[i1 * 4 + 3] > 0.003 ||
        s.rgba[i2 * 4 + 3] > 0.003 || s.rgba[i3 * 4 + 3] > 0.003;
      if (!alphaOk) continue;
      idx.push(i0, i2, i1, i1, i2, i3);
    }
  }
  g.setIndex(idx);
  return g;
}

/** In-place height channel refresh (no rebuild) for matching geometry. */
export function updateHeightAttribute(g: THREE.BufferGeometry, s: SampledImage, mode: Settings['geometry']['mode'], scan?: Settings['geometry']['scan']): boolean {
  const attr = g.getAttribute('aHeight') as THREE.BufferAttribute | undefined;
  const uvAttr = g.getAttribute('uv') as THREE.BufferAttribute | undefined;
  if (!attr || !uvAttr) return false;
  const arr = attr.array as Float32Array;
  // Recover each vertex's sample index from its uv.
  void mode; void scan;
  for (let i = 0; i < attr.count; i++) {
    const u = uvAttr.getX(i);
    const v = 1 - uvAttr.getY(i);
    const x = Math.round(u * (s.cols - 1));
    const y = Math.round(v * (s.rows - 1));
    arr[i] = s.height[y * s.cols + x];
  }
  attr.needsUpdate = true;
  return true;
}

/** Estimated element count for quality warnings. */
export function estimateCount(mode: Settings['geometry']['mode'], g: Settings['geometry'], cols: number, rows: number): number {
  if (mode === 'points') return cols * rows;
  if (mode === 'heightfield') return cols * rows;
  const lineStep = Math.max(1, Math.round(g.scan.lineSpacing));
  const ptStep = Math.max(1, Math.round(g.scan.pointSpacing));
  return Math.ceil(rows / lineStep) * Math.ceil(cols / ptStep);
}
