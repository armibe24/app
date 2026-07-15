/* Keyframe tracks on numeric settings. Only paths that apply per-frame
   (shader uniforms / object transforms / camera fov) are keyable —
   anything that triggers CPU resampling or geometry rebuilds is not,
   so keyframed playback never stalls.

   Times are normalized loop time (0..1). Interpolation wraps around
   the loop end, so keyframed loops stay seamless by construction.
   Each keyframe's `ease` shapes the segment LEAVING it. */

import { Keyframe, KeyframeMap, EaseType, Settings } from './types';
import { store, getPath } from './store';

/* ---------------- keyable paths ---------------- */

const KEYABLE = [
  /^geometry\.points\.(size|spread|opacity|alphaThreshold|removal)$/,
  /^geometry\.grid\.opacity$/,
  /^geometry\.scan\.thickness$/,
  /^height\.(amount|offset)$/,
  /^animation\.(wave|bend|pulse|separate|twist|collapse|ripple|scanline)\.[a-zA-Z]+$/,
  /^animation\.global\.orbitStrength$/,
  /^appearance\.(brightness|contrast|saturation|gamma|hueShift|opacity|quantize|depthFade)$/,
  /^scene\.(scale|posX|posY|posZ|rotX|rotY|rotZ|fov)$/,
];

/** Speed params must stay whole cycles per loop — keyframing them
    would break seamless loops, so they are excluded. */
const NOT_KEYABLE = [/\.speed$/];

export function isKeyable(path: string): boolean {
  if (NOT_KEYABLE.some(re => re.test(path))) return false;
  return KEYABLE.some(re => re.test(path));
}

/* ---------------- easing ---------------- */

export const EASE_OPTIONS: Array<{ value: EaseType; label: string }> = [
  { value: 'linear', label: 'Linear' },
  { value: 'in', label: 'Ease in' },
  { value: 'out', label: 'Ease out' },
  { value: 'in-out', label: 'Ease in-out' },
  { value: 'hold', label: 'Hold' },
];

function ease(u: number, e: EaseType): number {
  switch (e) {
    case 'in': return u * u * u;
    case 'out': return 1 - Math.pow(1 - u, 3);
    case 'in-out': return u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
    case 'hold': return 0;
    default: return u;
  }
}

/* ---------------- evaluation ---------------- */

/** Value of a track at normalized loop time u (0..1), wrapping
    across the loop boundary so frame 0 === frame N. */
export function evalTrack(kfs: Keyframe[], u: number): number {
  if (kfs.length === 0) return NaN;
  if (kfs.length === 1) return kfs[0].v;
  const sorted = kfs; // kept sorted by ops below
  u = ((u % 1) + 1) % 1;

  let prev = sorted[sorted.length - 1];
  let next = sorted[0];
  let span: number, local: number;
  if (u < sorted[0].t || u >= sorted[sorted.length - 1].t) {
    // wrap segment: last → first (across the loop end)
    span = (1 - prev.t) + next.t;
    local = u >= prev.t ? u - prev.t : u + 1 - prev.t;
  } else {
    for (let i = 0; i < sorted.length - 1; i++) {
      if (u >= sorted[i].t && u < sorted[i + 1].t) {
        prev = sorted[i]; next = sorted[i + 1];
        break;
      }
    }
    span = next.t - prev.t;
    local = u - prev.t;
  }
  if (span <= 1e-6) return next.v;
  const k = ease(Math.min(1, Math.max(0, local / span)), prev.ease);
  return prev.v + (next.v - prev.v) * k;
}

/** Effective value for a path: keyframed value at u, else base value. */
export function effectiveValue(s: Settings, path: string, u: number): number {
  const track = s.keyframes[path];
  if (track && track.length > 0) {
    const v = evalTrack(track, u);
    if (!Number.isNaN(v)) return v;
  }
  return getPath(s, path) as number;
}

/* ---------------- track operations (via the store) ---------------- */

let nextId = 1;
const genId = () => `k${Date.now().toString(36)}${(nextId++).toString(36)}`;

function withTrack(map: KeyframeMap, path: string, next: Keyframe[]): KeyframeMap {
  const out: KeyframeMap = { ...map };
  if (next.length === 0) delete out[path];
  else out[path] = [...next].sort((a, b) => a.t - b.t);
  return out;
}

// "same key slot" tolerance — must stay below the tightest frame
// spacing (60 s × 60 fps → 2.8e-4 between frames)
const EPS = 1e-4;

export function upsertKeyframe(path: string, t: number, v: number): void {
  const map = store.get().keyframes;
  const track = map[path] ?? [];
  const clamped = Math.min(1, Math.max(0, t)); // t = 1 is the loop end, a valid key slot
  const hit = track.find(k => Math.abs(k.t - clamped) < EPS);
  const next = hit
    ? track.map(k => (k === hit ? { ...k, v } : k))
    : [...track, { id: genId(), t: clamped, v, ease: 'linear' as EaseType }];
  store.set('keyframes', withTrack(map, path, next));
}

export function keyframeAt(track: Keyframe[] | undefined, t: number): Keyframe | undefined {
  return track?.find(k => Math.abs(k.t - t) < EPS);
}

export function removeKeyframe(path: string, id: string): void {
  const map = store.get().keyframes;
  const track = map[path] ?? [];
  store.set('keyframes', withTrack(map, path, track.filter(k => k.id !== id)));
}

export function moveKeyframe(path: string, id: string, t: number): void {
  const map = store.get().keyframes;
  const track = map[path] ?? [];
  const clamped = Math.min(1, Math.max(0, t));
  // don't land on another key of the same track
  if (track.some(k => k.id !== id && Math.abs(k.t - clamped) < EPS)) return;
  store.set('keyframes', withTrack(map, path,
    track.map(k => (k.id === id ? { ...k, t: clamped } : k))));
}

export function setKeyframeEase(path: string, id: string, e: EaseType): void {
  const map = store.get().keyframes;
  const track = map[path] ?? [];
  store.set('keyframes', withTrack(map, path,
    track.map(k => (k.id === id ? { ...k, ease: e } : k))));
}

export function clearTrack(path: string): void {
  const map = store.get().keyframes;
  store.set('keyframes', withTrack(map, path, []));
}

/* ---------------- labels ---------------- */

const NICE: Record<string, string> = {
  posX: 'Position X', posY: 'Position Y', posZ: 'Position Z',
  rotX: 'Rotation X', rotY: 'Rotation Y', rotZ: 'Rotation Z',
  hueShift: 'Hue shift', depthFade: 'Depth fade',
  alphaThreshold: 'Alpha thresh', orbitStrength: 'Orbit strength',
  minDepth: 'Min depth', maxDepth: 'Max depth',
  delayBrightness: 'Delay bright', delayPosition: 'Delay pos',
  returnStrength: 'Return', noiseScale: 'Noise scale',
  centerX: 'Center X', centerY: 'Center Y',
};

export function trackLabel(path: string): string {
  const parts = path.split('.');
  const leaf = parts[parts.length - 1];
  const group = parts.length > 2 ? parts[parts.length - 2] : parts[0];
  const nice = NICE[leaf] ?? leaf.charAt(0).toUpperCase() + leaf.slice(1);
  return `${group} · ${nice}`;
}
