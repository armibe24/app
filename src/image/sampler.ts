/* CPU sampling pipeline: resamples the source image to the working
   geometry resolution and computes the processed height channel from
   the selected source (luminance, channels, edges, radial …).
   Runs only when geometry/height settings actually change; per-frame
   motion is all GPU-side. */

import { SourceImage } from './source';
import { Settings, HeightSource } from '../state/types';

export interface SampledImage {
  cols: number;
  rows: number;
  /** RGBA 0..1, row-major, rows top→bottom. */
  rgba: Float32Array;
  /** Luminance 0..1 (before height processing). */
  lum: Float32Array;
  /** Processed height 0..1. */
  height: Float32Array;
}

export function resolutionFor(img: SourceImage, samplesLargerDim: number): { cols: number; rows: number } {
  const n = Math.max(8, Math.round(samplesLargerDim));
  if (img.width >= img.height) {
    const cols = Math.min(n, img.width);
    const rows = Math.max(2, Math.round(cols * img.height / img.width));
    return { cols, rows };
  }
  const rows = Math.min(n, img.height);
  const cols = Math.max(2, Math.round(rows * img.width / img.height));
  return { cols, rows };
}

/** Resample the source image to cols×rows (area-averaged by canvas). */
export function sampleImage(img: SourceImage, cols: number, rows: number): { rgba: Float32Array; lum: Float32Array } {
  const canvas = document.createElement('canvas');
  canvas.width = cols; canvas.height = rows;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('2D canvas unavailable');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  // Draw via an intermediate ImageBitmap-less path: put full ImageData
  // on a temp canvas, then scale-draw.
  const tmp = document.createElement('canvas');
  tmp.width = img.width; tmp.height = img.height;
  const tctx = tmp.getContext('2d');
  if (!tctx) throw new Error('2D canvas unavailable');
  tctx.putImageData(img.data, 0, 0);
  ctx.clearRect(0, 0, cols, rows);
  ctx.drawImage(tmp, 0, 0, cols, rows);

  const small = ctx.getImageData(0, 0, cols, rows).data;
  const n = cols * rows;
  const rgba = new Float32Array(n * 4);
  const lum = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const r = small[i * 4] / 255;
    const g = small[i * 4 + 1] / 255;
    const b = small[i * 4 + 2] / 255;
    const a = small[i * 4 + 3] / 255;
    rgba[i * 4] = r; rgba[i * 4 + 1] = g; rgba[i * 4 + 2] = b; rgba[i * 4 + 3] = a;
    lum[i] = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }
  return { rgba, lum };
}

function boxBlur(src: Float32Array, cols: number, rows: number, radius: number): Float32Array {
  const r = Math.round(radius);
  if (r <= 0) return src;
  const tmp = new Float32Array(src.length);
  const out = new Float32Array(src.length);
  // horizontal
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      let sum = 0, cnt = 0;
      for (let k = -r; k <= r; k++) {
        const xx = x + k;
        if (xx >= 0 && xx < cols) { sum += src[y * cols + xx]; cnt++; }
      }
      tmp[y * cols + x] = sum / cnt;
    }
  }
  // vertical
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      let sum = 0, cnt = 0;
      for (let k = -r; k <= r; k++) {
        const yy = y + k;
        if (yy >= 0 && yy < rows) { sum += tmp[yy * cols + x]; cnt++; }
      }
      out[y * cols + x] = sum / cnt;
    }
  }
  return out;
}

function sobelEdges(lum: Float32Array, cols: number, rows: number): Float32Array {
  const out = new Float32Array(lum.length);
  const at = (x: number, y: number) =>
    lum[Math.min(rows - 1, Math.max(0, y)) * cols + Math.min(cols - 1, Math.max(0, x))];
  let maxMag = 1e-6;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const gx =
        -at(x - 1, y - 1) - 2 * at(x - 1, y) - at(x - 1, y + 1) +
        at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1);
      const gy =
        -at(x - 1, y - 1) - 2 * at(x, y - 1) - at(x + 1, y - 1) +
        at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1);
      const m = Math.hypot(gx, gy);
      out[y * cols + x] = m;
      if (m > maxMag) maxMag = m;
    }
  }
  for (let i = 0; i < out.length; i++) out[i] /= maxMag;
  return out;
}

function baseHeight(
  source: HeightSource, rgba: Float32Array, lum: Float32Array,
  cols: number, rows: number,
): Float32Array {
  const n = cols * rows;
  const out = new Float32Array(n);
  switch (source) {
    case 'luminance': out.set(lum); break;
    case 'inv-luminance': for (let i = 0; i < n; i++) out[i] = 1 - lum[i]; break;
    case 'red': for (let i = 0; i < n; i++) out[i] = rgba[i * 4]; break;
    case 'green': for (let i = 0; i < n; i++) out[i] = rgba[i * 4 + 1]; break;
    case 'blue': for (let i = 0; i < n; i++) out[i] = rgba[i * 4 + 2]; break;
    case 'alpha': for (let i = 0; i < n; i++) out[i] = rgba[i * 4 + 3]; break;
    case 'edge': return sobelEdges(lum, cols, rows);
    case 'radial': {
      const cx = (cols - 1) / 2, cy = (rows - 1) / 2;
      const maxD = Math.hypot(cx, cy) || 1;
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          out[y * cols + x] = 1 - Math.hypot(x - cx, y - cy) / maxD;
        }
      }
      break;
    }
  }
  return out;
}

/** Full processed height channel for the current settings. */
export function computeHeight(
  s: Settings['height'], extraSmoothing: number,
  rgba: Float32Array, lum: Float32Array, cols: number, rows: number,
): Float32Array {
  let h = baseHeight(s.source, rgba, lum, cols, rows);
  const totalBlur = s.blur + extraSmoothing;
  if (totalBlur > 0) h = boxBlur(h, cols, rows, totalBlur);

  const out = new Float32Array(h.length);
  const lo = Math.min(s.clampLo, s.clampHi);
  const hi = Math.max(s.clampLo, s.clampHi, lo + 1e-4);
  for (let i = 0; i < h.length; i++) {
    let v = h[i];
    v = (v - 0.5) * s.contrast + 0.5;               // contrast around mid
    v = Math.min(1, Math.max(0, v));
    v = Math.pow(v, 1 / Math.max(0.05, s.gamma));   // gamma
    if (s.invert) v = 1 - v;
    v = Math.min(hi, Math.max(lo, v));              // depth clamp
    out[i] = v;
  }
  return out;
}

export function buildSample(img: SourceImage, samplesLargerDim: number): Omit<SampledImage, 'height'> {
  const { cols, rows } = resolutionFor(img, samplesLargerDim);
  const { rgba, lum } = sampleImage(img, cols, rows);
  return { cols, rows, rgba, lum };
}
