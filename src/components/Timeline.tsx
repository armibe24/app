/* Timeline — modeled directly on the Sonitus reference:
   transport (skip/step/play/loop) · frame+time counter · FPS/DUR
   fields · zoom cluster (± / px-per-second readout / FIT) on top;
   below, a PROPERTY/KEYFRAME label column with per-track keyframe
   navigation and a REMOVE pill, and a horizontally zoomable lane
   area with per-second ruler and gridlines, draggable diamond keys,
   a connecting line, and per-segment easing chips that open a
   Linear / Ease In / Ease Out / Ease In Out / Hold menu. */

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Play, Pause, SkipBack, SkipForward, ChevronLeft, ChevronRight,
  Repeat, Diamond, ZoomIn, ZoomOut, Check,
} from 'lucide-react';
import { engine } from '../engine/Engine';
import { store, useSettings } from '../state/store';
import { useSourceImage } from '../hooks/useSourceImage';
import { NumField } from './ui/controls';
import {
  trackLabel, moveKeyframe, removeKeyframe, keyframeAt, setKeyframeEase,
} from '../state/keyframes';
import { EaseType, Keyframe } from '../state/types';

const RULER_H = 24;
const ROW_H = 46;
const MAX_PPS = 4000;
const ZOOM_KEY = 'pixelform:tlzoom:v1';
const HEIGHT_KEY = 'pixelform:tlheight:v1';
const MIN_AREA_H = RULER_H + ROW_H;      // ruler + one row
const MAX_AREA_H = 420;
const DEFAULT_AREA_H = RULER_H + ROW_H * 2;

const EASE_SYMBOL: Record<EaseType, string> = {
  linear: '/', in: '~', out: '~', 'in-out': '~', hold: '□',
};

const EASE_MENU: Array<{ value: EaseType; symbol: string; label: string }> = [
  { value: 'linear', symbol: '/', label: 'Linear' },
  { value: 'in', symbol: '~', label: 'Ease In' },
  { value: 'out', symbol: '~', label: 'Ease Out' },
  { value: 'in-out', symbol: '~', label: 'Ease In Out' },
  { value: 'hold', symbol: '□', label: 'Hold / Step' },
];

interface EaseMenuState { path: string; keyId: string; x: number; y: number }

const pad3 = (n: number) => String(Math.max(0, n)).padStart(3, '0');

export function Timeline() {
  const s = useSettings();
  const img = useSourceImage();
  const [, force] = useState(0);
  const viewportRef = useRef<HTMLDivElement>(null);
  const [viewW, setViewW] = useState(0);
  const [zoom, setZoom] = useState<number | 'fit'>(() => {
    const raw = localStorage.getItem(ZOOM_KEY);
    if (!raw || raw === 'fit') return 'fit';
    const n = parseFloat(raw);
    return Number.isFinite(n) ? n : 'fit';
  });
  const pendingScroll = useRef<number | null>(null);
  const [easeMenu, setEaseMenu] = useState<EaseMenuState | null>(null);
  const [areaH, setAreaH] = useState(() => {
    const n = parseFloat(localStorage.getItem(HEIGHT_KEY) ?? '');
    return Number.isFinite(n)
      ? Math.min(MAX_AREA_H, Math.max(MIN_AREA_H, n))
      : DEFAULT_AREA_H;
  });

  /* drag the top edge to resize the track area (persisted) */
  const onResize = (e: React.PointerEvent) => {
    e.preventDefault();
    const startY = e.clientY;
    const startH = areaH;
    const move = (ev: PointerEvent) => {
      const h = Math.min(MAX_AREA_H, Math.max(MIN_AREA_H, startH + (startY - ev.clientY)));
      setAreaH(h);
      try { localStorage.setItem(HEIGHT_KEY, String(h)); } catch { /* ignore */ }
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  useEffect(() => engine.onTick(() => force(n => n + 1)), []);

  /* viewport width tracking */
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const obs = new ResizeObserver(() => setViewW(el.clientWidth));
    obs.observe(el);
    setViewW(el.clientWidth);
    return () => obs.disconnect();
  }, []);

  const dur = s.playback.duration;
  const fps = s.playback.fps;
  const time = Math.min(engine.time, dur);
  const playhead = engine.getPlayheadProgress();
  const frame = Math.min(Math.round(time * fps), Math.round(dur * fps));
  const totalFrames = Math.max(1, Math.round(dur * fps));

  const fitPps = viewW > 0 ? viewW / dur : 100;
  const pps = zoom === 'fit' ? fitPps : Math.min(MAX_PPS, Math.max(fitPps, zoom));
  const contentW = Math.max(1, dur * pps);

  const setZoomPersist = (z: number | 'fit') => {
    setZoom(z);
    try { localStorage.setItem(ZOOM_KEY, z === 'fit' ? 'fit' : String(z)); } catch { /* ignore */ }
  };

  const zoomBy = (factor: number, anchorClientX?: number) => {
    const vp = viewportRef.current;
    const next = Math.min(MAX_PPS, Math.max(fitPps, pps * factor));
    if (vp) {
      const rect = vp.getBoundingClientRect();
      const localX = anchorClientX !== undefined
        ? anchorClientX - rect.left
        : vp.clientWidth / 2;
      const tAtAnchor = (vp.scrollLeft + localX) / pps;
      pendingScroll.current = tAtAnchor * next - localX;
    }
    setZoomPersist(Math.abs(next - fitPps) < 0.5 ? 'fit' : next);
  };

  useLayoutEffect(() => {
    if (pendingScroll.current !== null && viewportRef.current) {
      viewportRef.current.scrollLeft = Math.max(0, pendingScroll.current);
      pendingScroll.current = null;
    }
  });

  /* ctrl+wheel: cursor-anchored zoom (Sonitus behavior) */
  useEffect(() => {
    const vp = viewportRef.current;
    if (!vp) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      zoomBy(e.deltaY < 0 ? 1.2 : 1 / 1.2, e.clientX);
    };
    vp.addEventListener('wheel', onWheel, { passive: false });
    return () => vp.removeEventListener('wheel', onWheel);
  });

  /* ---- time helpers ---- */
  const timeFromClientX = (clientX: number): number => {
    const vp = viewportRef.current;
    if (!vp) return 0;
    const rect = vp.getBoundingClientRect();
    const x = vp.scrollLeft + clientX - rect.left;
    return Math.min(1, Math.max(0, x / contentW)) * dur;
  };
  const snapFrac = (f: number) =>
    Math.min(1, Math.max(0, Math.round(f * totalFrames) / totalFrames));
  const snappedPlayhead = snapFrac(playhead);

  const onScrub = (e: React.PointerEvent) => {
    engine.setTime(timeFromClientX(e.clientX));
    const move = (ev: PointerEvent) => engine.setTime(timeFromClientX(ev.clientX));
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const onKeyDrag = (path: string, id: string) => (e: React.PointerEvent) => {
    e.stopPropagation();
    const move = (ev: PointerEvent) =>
      moveKeyframe(path, id, snapFrac(timeFromClientX(ev.clientX) / dur));
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const stepFrame = (dir: 1 | -1) =>
    engine.setTime(Math.min(dur, Math.max(0, (frame + dir) / fps)));

  /* ---- ease menu ---- */
  useEffect(() => {
    if (!easeMenu) return;
    const close = (e: PointerEvent) => {
      if (!(e.target as HTMLElement).closest?.('.ease-menu')) setEaseMenu(null);
    };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setEaseMenu(null); };
    window.addEventListener('pointerdown', close);
    window.addEventListener('keydown', esc);
    return () => {
      window.removeEventListener('pointerdown', close);
      window.removeEventListener('keydown', esc);
    };
  }, [easeMenu]);

  const openEaseMenu = (path: string, keyId: string) => (e: React.MouseEvent) => {
    e.stopPropagation();
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setEaseMenu({ path, keyId, x: r.left + r.width / 2, y: r.top - 8 });
  };

  const tracks = Object.entries(s.keyframes).filter(([, kfs]) => kfs.length > 0);
  const menuKey: Keyframe | undefined = easeMenu
    ? s.keyframes[easeMenu.path]?.find(k => k.id === easeMenu.keyId)
    : undefined;

  /* ---- ruler ticks ---- */
  const labelStep = pps >= 26 ? 1 : pps >= 13 ? 2 : 5;
  const minorStep = pps >= 130 ? 0.1 : pps >= 60 ? 0.25 : pps >= 26 ? 0.5 : 0;
  const majors: number[] = [];
  for (let t = 0; t <= dur + 1e-6; t += labelStep) majors.push(t);
  const minors: number[] = [];
  if (minorStep > 0) {
    for (let t = minorStep; t < dur; t += minorStep) {
      if (Math.abs(t / labelStep - Math.round(t / labelStep)) > 1e-6) minors.push(t);
    }
  }

  const rowsCount = Math.max(1, tracks.length);
  const contentH = RULER_H + rowsCount * ROW_H;

  /* per-track helpers */
  const keyNav = (kfs: Keyframe[]) => {
    const u = snappedPlayhead;
    const at = keyframeAt(kfs, u);
    const before = kfs.filter(k => k.t <= u + 1e-4).length;
    const prev = [...kfs].reverse().find(k => k.t < u - 1e-4);
    const next = kfs.find(k => k.t > u + 1e-4);
    return { at, index: before, prev, next };
  };

  /* ease chips: one per segment, plus the wrap segment when a gap shows */
  const chipsFor = (kfs: Keyframe[]): Array<{ key: Keyframe; t: number }> => {
    const chips: Array<{ key: Keyframe; t: number }> = [];
    for (let i = 0; i < kfs.length - 1; i++) {
      if (kfs[i + 1].t - kfs[i].t > 0.015) {
        chips.push({ key: kfs[i], t: (kfs[i].t + kfs[i + 1].t) / 2 });
      }
    }
    if (kfs.length >= 2) {
      const first = kfs[0], last = kfs[kfs.length - 1];
      const tail = 1 - last.t, head = first.t;
      if (tail + head > 0.03) {
        chips.push({ key: last, t: tail >= head ? (last.t + 1) / 2 : first.t / 2 });
      }
    }
    return chips;
  };

  return (
    <div className="timeline">
      <div
        className="tl-resizer"
        title="Drag to resize the timeline"
        onPointerDown={onResize}
        onDoubleClick={() => {
          setAreaH(DEFAULT_AREA_H);
          try { localStorage.setItem(HEIGHT_KEY, String(DEFAULT_AREA_H)); } catch { /* ignore */ }
        }}
      />
      <div className="timeline-controls">
        <div className="tl-group tl-group--left">
          <div className="tl-transport">
            <button className="iconbtn" title="Jump to start" onClick={() => engine.setTime(0)}>
              <SkipBack size={13} strokeWidth={2.4} />
            </button>
            <button className="iconbtn" title="Previous frame" onClick={() => stepFrame(-1)}>
              <ChevronLeft size={14} strokeWidth={2.4} />
            </button>
            <button className="tl-play" title="Play / pause (Space)"
              onClick={() => engine.toggle()} disabled={!img}>
              {engine.playing
                ? <Pause size={15} strokeWidth={2.6} fill="currentColor" />
                : <Play size={15} strokeWidth={2.6} fill="currentColor" style={{ marginLeft: 2 }} />}
            </button>
            <button className="iconbtn" title="Next frame" onClick={() => stepFrame(1)}>
              <ChevronRight size={14} strokeWidth={2.4} />
            </button>
            <button className="iconbtn" title="Jump to end" onClick={() => engine.setTime(dur)}>
              <SkipForward size={13} strokeWidth={2.4} />
            </button>
            <button
              className={`iconbtn${s.playback.loop ? ' accent' : ''}`}
              title={s.playback.loop ? 'Looping on' : 'Looping off — plays once'}
              onClick={() => store.set('playback.loop', !s.playback.loop)}
            ><Repeat size={13} strokeWidth={2.4} /></button>
          </div>
        </div>

        <div className="tl-group tl-group--center">
          <span className="tl-counter">
            <b>{pad3(frame)}</b> <span>/ {pad3(totalFrames)}</span>
            <span className="tl-sep">|</span>
            <b>{time.toFixed(2)}s</b> <span>/ {dur.toFixed(2)}s</span>
          </span>
          <span className="tl-field">
            FPS
            <NumField value={fps} min={1} max={60} step={1}
              onChange={v => store.set('playback.fps', Math.round(v))}
              title="Frames per second (24 / 25 / 30 / 60 for export-safe values)" />
          </span>
          <span className="tl-field">
            Dur
            <NumField value={dur} min={1} max={60} step={1}
              onChange={v => store.set('playback.duration', v)}
              title="Loop duration in seconds" />
            s
          </span>
        </div>

        <div className="tl-group tl-group--right">
          <button className="iconbtn" title="Zoom out (Ctrl+wheel on the tracks)"
            onClick={() => zoomBy(1 / 1.4)} disabled={pps <= fitPps + 0.5}>
            <ZoomOut size={13} strokeWidth={2.4} />
          </button>
          <button className="iconbtn" title="Zoom in (Ctrl+wheel on the tracks)"
            onClick={() => zoomBy(1.4)} disabled={pps >= MAX_PPS - 1}>
            <ZoomIn size={13} strokeWidth={2.4} />
          </button>
          <span className="tl-zoomreadout">{Math.round(pps)}px/s</span>
          <button className="tl-fitbtn" title="Fit the whole loop into view"
            onClick={() => { setZoomPersist('fit'); }}>Fit</button>
        </div>
      </div>

      <div className="tl-area" style={{ height: areaH }}>
        {/* label column */}
        <div className="tl-labels" style={{ minHeight: contentH }}>
          <div className="tl-labels-head" style={{ height: RULER_H }}>
            <span>Property</span><span>Keyframe</span>
          </div>
          {tracks.length === 0 ? (
            <div className="tl-labelcell" style={{ height: ROW_H }}>
              <div className="tl-labelrow1">
                <span className="tl-rowico"><Diamond size={9} strokeWidth={2.4} /></span>
                <span className="tl-trackname">No tracks</span>
              </div>
            </div>
          ) : tracks.map(([path, kfs]) => {
            const nav = keyNav(kfs);
            return (
              <div className="tl-labelcell" style={{ height: ROW_H }} key={path} title={path}>
                <div className="tl-labelrow1">
                  <span className="tl-rowico">
                    <Diamond size={9} strokeWidth={2.4} fill="currentColor" />
                  </span>
                  <span className="tl-trackname">{trackLabel(path)}</span>
                  <span className="tl-keynav">
                    <button className="tl-navbtn" title="Previous keyframe"
                      disabled={!nav.prev}
                      onClick={() => nav.prev && engine.setTime(nav.prev.t * dur)}>
                      <ChevronLeft size={11} strokeWidth={2.6} />
                    </button>
                    <span className="tl-navcount">{nav.index}/{kfs.length}</span>
                    <button className="tl-navbtn" title="Next keyframe"
                      disabled={!nav.next}
                      onClick={() => nav.next && engine.setTime(nav.next.t * dur)}>
                      <ChevronRight size={11} strokeWidth={2.6} />
                    </button>
                  </span>
                </div>
                <button
                  className="tl-removepill"
                  disabled={!nav.at}
                  title={nav.at
                    ? 'Remove the keyframe at the playhead'
                    : 'Move the playhead onto a keyframe to remove it'}
                  onClick={() => nav.at && removeKeyframe(path, nav.at.id)}
                >
                  <Diamond size={8} strokeWidth={2.6} fill="currentColor" /> Remove
                </button>
              </div>
            );
          })}
        </div>

        {/* zoomable lanes */}
        <div className="tl-lanes" ref={viewportRef}>
          <div className="tl-content" style={{ width: contentW, height: contentH }}>
            <div className="tl-ruler" style={{ height: RULER_H }} onPointerDown={onScrub}>
              {majors.map(t => (
                <span key={`M${t}`}>
                  <span className="tl-tick" style={{ left: t * pps }} />
                  <span className="tl-ticklabel" style={{ left: t * pps }}>{Math.round(t)}s</span>
                </span>
              ))}
              {minors.map(t => (
                <span key={`m${t.toFixed(3)}`} className="tl-tick minor" style={{ left: t * pps }} />
              ))}
            </div>

            {/* per-second gridlines through the rows */}
            {majors.slice(1).map(t => (
              <span key={`g${t}`} className="tl-gridline"
                style={{ left: t * pps, top: RULER_H, height: contentH - RULER_H }} />
            ))}

            {tracks.length === 0 ? (
              <div className="tl-lanerow tl-lanerow--empty" style={{ height: ROW_H }} onPointerDown={onScrub}>
                Click the ◇ next to a slider to keyframe it
              </div>
            ) : tracks.map(([path, kfs]) => (
              <div className="tl-lanerow" style={{ height: ROW_H }} key={path} onPointerDown={onScrub}>
                {kfs.length >= 2 ? (
                  <span className="tl-connect" style={{
                    left: kfs[0].t * contentW,
                    width: (kfs[kfs.length - 1].t - kfs[0].t) * contentW,
                  }} />
                ) : null}
                {chipsFor(kfs).map(({ key, t }) => (
                  <button
                    key={`c${key.id}${t.toFixed(4)}`}
                    type="button"
                    className="tl-easechip"
                    style={{ left: t * contentW }}
                    title={`Easing: ${EASE_MENU.find(o => o.value === key.ease)?.label ?? key.ease} — click to change`}
                    onPointerDown={e => e.stopPropagation()}
                    onClick={openEaseMenu(path, key.id)}
                  >{EASE_SYMBOL[key.ease]}</button>
                ))}
                {kfs.map(k => (
                  <button
                    key={k.id}
                    type="button"
                    className={`tl-key${k.ease === 'hold' ? ' hold' : ''}`}
                    style={{ left: k.t * contentW }}
                    title={`${(k.t * dur).toFixed(2)}s · ${k.v.toFixed(2)} — drag to move, double-click to delete`}
                    onPointerDown={onKeyDrag(path, k.id)}
                    onClick={e => e.stopPropagation()}
                    onDoubleClick={() => removeKeyframe(path, k.id)}
                  />
                ))}
              </div>
            ))}

            <div className="tl-playhead" style={{ left: playhead * contentW }}>
              <div className="tl-playhead-cap" />
            </div>
          </div>
        </div>
      </div>

      {/* easing menu — portaled to <body>: the timeline's backdrop-filter
          would otherwise become the containing block for position:fixed
          and push the menu off-screen */}
      {easeMenu && menuKey ? createPortal(
        <div className="ease-menu" style={{ left: easeMenu.x, top: easeMenu.y }}>
          {EASE_MENU.map(o => (
            <button
              key={o.value}
              type="button"
              className={`ease-option${menuKey.ease === o.value ? ' selected' : ''}`}
              onClick={() => {
                setKeyframeEase(easeMenu.path, easeMenu.keyId, o.value);
                setEaseMenu(null);
              }}
            >
              <span className="ease-sym">{o.symbol}</span>
              <span className="ease-name">{o.label}</span>
              {menuKey.ease === o.value ? <Check size={12} strokeWidth={3} /> : null}
            </button>
          ))}
        </div>,
        document.body,
      ) : null}
    </div>
  );
}
