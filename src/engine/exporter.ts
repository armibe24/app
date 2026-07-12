/* Export pipeline. Renders deterministic frames into a dedicated
   offscreen renderer (never a screen recording): stills as PNG/JPEG/
   WebP, animations as WebM (WebCodecs + webm-muxer), PNG sequence
   (zip via fflate) or MP4 (mp4-muxer, only where the browser encoder
   supports it — otherwise a clear error, no fake export). */

import * as THREE from 'three';
import { Muxer as WebMMuxer, ArrayBufferTarget as WebMTarget } from 'webm-muxer';
import { Muxer as Mp4Muxer, ArrayBufferTarget as Mp4Target } from 'mp4-muxer';
import { zipSync } from 'fflate';
import { engine } from './Engine';
import { Settings } from '../state/types';

export interface ExportState {
  active: boolean;
  label: string;
  frame: number;
  total: number;
  error: string | null;
  doneMessage: string | null;
}

let state: ExportState = { active: false, label: '', frame: 0, total: 0, error: null, doneMessage: null };
let cancelled = false;
const listeners = new Set<() => void>();

export function onExportState(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}
export function getExportState(): ExportState { return state; }
function setState(patch: Partial<ExportState>): void {
  state = { ...state, ...patch };
  for (const fn of listeners) fn();
}
export function cancelExport(): void { cancelled = true; }

function download(blob: Blob, name: string): void {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

interface RenderRig {
  renderer: THREE.WebGLRenderer;
  camera: THREE.PerspectiveCamera | THREE.OrthographicCamera;
  dprScale: number;
  restore: () => void;
}

function makeRig(s: Settings): RenderRig {
  const { width, height } = s.export;
  const renderer = new THREE.WebGLRenderer({
    antialias: true, alpha: true, preserveDrawingBuffer: true,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(1);
  renderer.setSize(width, height, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const live = engine.activeCamera();
  let camera: THREE.PerspectiveCamera | THREE.OrthographicCamera;
  if (live instanceof THREE.PerspectiveCamera) {
    camera = live.clone();
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  } else {
    const o = (live as THREE.OrthographicCamera).clone();
    const halfH = Math.abs(o.top);
    o.left = -halfH * (width / height);
    o.right = halfH * (width / height);
    o.updateProjectionMatrix();
    camera = o;
  }

  const prevBg = engine.scene.background;
  if (s.export.transparent) engine.scene.background = null;

  const dprScale = s.export.height / Math.max(1, engine.getViewportCssHeight());
  return {
    renderer, camera, dprScale,
    restore: () => {
      engine.scene.background = prevBg;
      renderer.dispose();
    },
  };
}

const yieldFrame = (): Promise<void> => new Promise(r => setTimeout(r, 0));

/* ---------------- stills ---------------- */

export async function exportStill(s: Settings): Promise<void> {
  if (state.active) return;
  cancelled = false;
  setState({ active: true, label: 'Rendering still', frame: 0, total: 1, error: null, doneMessage: null });
  const rig = makeRig(s);
  try {
    engine.renderExportFrame(rig.renderer, rig.camera, engine.time, rig.dprScale);
    const fmt = s.export.stillFormat;
    const mime = fmt === 'png' ? 'image/png' : fmt === 'jpeg' ? 'image/jpeg' : 'image/webp';
    const blob = await new Promise<Blob | null>(res =>
      rig.renderer.domElement.toBlob(res, mime, s.export.quality));
    if (!blob) throw new Error('The browser could not encode the image.');
    const ext = fmt === 'jpeg' ? 'jpg' : fmt;
    download(blob, `${s.export.fileName || 'pixelform'}.${ext}`);
    setState({ active: false, doneMessage: `Saved ${s.export.width}×${s.export.height} ${fmt.toUpperCase()}` });
  } catch (err) {
    setState({ active: false, error: (err as Error).message });
  } finally {
    rig.restore();
  }
}

/* ---------------- animation ---------------- */

/** Deterministic loop time for frame i of n over the playback loop.
    Whole loops are fitted into the export duration so the final frame
    always leads seamlessly back into the first. */
function loopTimeAt(i: number, n: number, s: Settings): number {
  const loops = Math.max(1, Math.round(s.export.duration / s.playback.duration));
  return ((i / n) * loops % 1) * s.playback.duration;
}

export async function exportAnimation(s: Settings): Promise<void> {
  if (state.active) return;
  cancelled = false;
  const fmt = s.export.animFormat;
  try {
    if (fmt === 'webm') await exportWebMOrMp4(s, 'webm');
    else if (fmt === 'mp4') await exportWebMOrMp4(s, 'mp4');
    else await exportPngSequence(s);
  } catch (err) {
    setState({ active: false, error: (err as Error).message });
  }
}

async function exportPngSequence(s: Settings): Promise<void> {
  const total = Math.max(1, Math.round(s.export.duration * s.export.fps));
  setState({ active: true, label: 'Rendering PNG sequence', frame: 0, total, error: null, doneMessage: null });
  const rig = makeRig(s);
  const files: Record<string, Uint8Array> = {};
  try {
    for (let i = 0; i < total; i++) {
      if (cancelled) { setState({ active: false, doneMessage: 'Export cancelled' }); return; }
      engine.renderExportFrame(rig.renderer, rig.camera, loopTimeAt(i, total, s), rig.dprScale);
      const blob = await new Promise<Blob | null>(res =>
        rig.renderer.domElement.toBlob(res, 'image/png'));
      if (!blob) throw new Error('PNG encoding failed.');
      files[`${s.export.fileName || 'pixelform'}_${String(i).padStart(4, '0')}.png`] =
        new Uint8Array(await blob.arrayBuffer());
      setState({ frame: i + 1 });
      await yieldFrame();
    }
    const zipped = zipSync(files, { level: 0 });
    const buf = new Uint8Array(zipped.length);
    buf.set(zipped);
    download(new Blob([buf.buffer], { type: 'application/zip' }), `${s.export.fileName || 'pixelform'}_png-seq.zip`);
    setState({ active: false, doneMessage: `Saved ${total} PNG frames (zip)` });
  } finally {
    rig.restore();
  }
}

async function exportWebMOrMp4(s: Settings, kind: 'webm' | 'mp4'): Promise<void> {
  if (typeof VideoEncoder === 'undefined') {
    throw new Error('This browser has no WebCodecs video encoder. Use the PNG sequence export instead.');
  }
  const { width, height, fps } = s.export;
  if (width % 2 || height % 2) {
    throw new Error('Video export needs even width and height values.');
  }
  const total = Math.max(1, Math.round(s.export.duration * fps));
  const bitrate = Math.max(1_000_000, Math.round(width * height * fps * 0.1 * s.export.quality));

  let codec = '';
  if (kind === 'webm') {
    for (const c of ['vp09.00.41.08', 'vp8']) {
      const support = await VideoEncoder.isConfigSupported({ codec: c, width, height, bitrate, framerate: fps });
      if (support.supported) { codec = c; break; }
    }
    if (!codec) throw new Error('No supported WebM codec (VP9/VP8) in this browser. Try the PNG sequence export.');
  } else {
    for (const c of ['avc1.640028', 'avc1.42001f']) {
      const support = await VideoEncoder.isConfigSupported({ codec: c, width, height, bitrate, framerate: fps });
      if (support.supported) { codec = c; break; }
    }
    if (!codec) {
      throw new Error('This browser cannot encode H.264 MP4 at this size. Use WebM or the PNG sequence export.');
    }
  }

  setState({ active: true, label: `Encoding ${kind.toUpperCase()}`, frame: 0, total, error: null, doneMessage: null });
  const rig = makeRig(s);

  try {
    let muxer: WebMMuxer<WebMTarget> | Mp4Muxer<Mp4Target>;
    if (kind === 'webm') {
      muxer = new WebMMuxer({
        target: new WebMTarget(),
        video: { codec: codec.startsWith('vp09') ? 'V_VP9' : 'V_VP8', width, height, frameRate: fps },
      });
    } else {
      muxer = new Mp4Muxer({
        target: new Mp4Target(),
        video: { codec: 'avc', width, height },
        fastStart: 'in-memory',
      });
    }

    let encodeError: Error | null = null;
    const encoder = new VideoEncoder({
      output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
      error: (e) => { encodeError = e as Error; },
    });
    encoder.configure({ codec, width, height, bitrate, framerate: fps });

    for (let i = 0; i < total; i++) {
      if (cancelled) {
        encoder.close();
        setState({ active: false, doneMessage: 'Export cancelled' });
        return;
      }
      if (encodeError) throw encodeError;
      engine.renderExportFrame(rig.renderer, rig.camera, loopTimeAt(i, total, s), rig.dprScale);
      const frame = new VideoFrame(rig.renderer.domElement, {
        timestamp: Math.round(i * 1_000_000 / fps),
        duration: Math.round(1_000_000 / fps),
      });
      encoder.encode(frame, { keyFrame: i % (fps * 2) === 0 });
      frame.close();
      while (encoder.encodeQueueSize > 4) await yieldFrame();
      setState({ frame: i + 1 });
      await yieldFrame();
    }

    await encoder.flush();
    encoder.close();
    if (encodeError) throw encodeError;
    muxer.finalize();
    const buffer = (muxer.target as WebMTarget | Mp4Target).buffer;
    if (!buffer) throw new Error('Muxing produced no data.');
    const mime = kind === 'webm' ? 'video/webm' : 'video/mp4';
    download(new Blob([buffer], { type: mime }), `${s.export.fileName || 'pixelform'}.${kind}`);
    setState({ active: false, doneMessage: `Saved ${total}-frame ${kind.toUpperCase()} (${width}×${height})` });
  } finally {
    rig.restore();
  }
}
