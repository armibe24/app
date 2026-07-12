/* Timeline (Sonitus-style): transport controls plus a track area with
   a sticky label column, per-second ruler, one row per keyframed
   property, draggable diamond keyframes (frame-snapped) and per-key
   easing. Deliberately compact — properties get tracks only when the
   user keys them from a slider. */

import { useEffect, useRef, useState } from 'react';
import { Play, Pause, SkipBack, Repeat, X, Diamond, Trash2 } from 'lucide-react';
import { engine } from '../engine/Engine';
import { store, useSettings } from '../state/store';
import { useSourceImage } from '../hooks/useSourceImage';
import { NumField, PlainSelect } from './ui/controls';
import {
  trackLabel, moveKeyframe, removeKeyframe, clearTrack, setKeyframeEase,
  EASE_OPTIONS,
} from '../state/keyframes';
import { EaseType } from '../state/types';

const LABEL_W = 160;

interface KeySelection { path: string; id: string }

export function Timeline() {
  const s = useSettings();
  const img = useSourceImage();
  const [, force] = useState(0);
  const [selected, setSelected] = useState<KeySelection | null>(null);
  const areaRef = useRef<HTMLDivElement>(null);

  useEffect(() => engine.onTick(() => force(n => n + 1)), []);

  const dur = s.playback.duration;
  const fps = s.playback.fps;
  const time = Math.min(engine.time, dur);
  const progress = dur > 0 ? time / dur : 0;
  const frame = Math.floor(time * fps);
  const totalFrames = Math.max(1, Math.round(dur * fps));

  const tracks = Object.entries(s.keyframes).filter(([, kfs]) => kfs.length > 0);
  const selectedKf = selected
    ? s.keyframes[selected.path]?.find(k => k.id === selected.id) ?? null
    : null;
  useEffect(() => {
    if (selected && !selectedKf) setSelected(null);
  }, [selected, selectedKf]);

  /* ---- scrubbing over the lane region ---- */
  const fracFromX = (clientX: number): number => {
    const el = areaRef.current;
    if (!el) return 0;
    const r = el.getBoundingClientRect();
    return Math.min(1, Math.max(0, (clientX - r.left - LABEL_W) / Math.max(1, r.width - LABEL_W)));
  };
  const snap = (f: number) =>
    Math.min(1, Math.round(f * totalFrames) / totalFrames);

  const onScrub = (e: React.PointerEvent) => {
    engine.setTime(fracFromX(e.clientX) * dur);
    const move = (ev: PointerEvent) => engine.setTime(fracFromX(ev.clientX) * dur);
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  /* ---- keyframe dot dragging ---- */
  const onKeyDown_ = (path: string, id: string) => (e: React.PointerEvent) => {
    e.stopPropagation();
    const move = (ev: PointerEvent) => {
      moveKeyframe(path, id, snap(fracFromX(ev.clientX)));
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      setSelected({ path, id });
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const playheadLeft = `calc(${LABEL_W}px + (100% - ${LABEL_W}px) * ${progress})`;
  const fmt = (t: number) => `${t.toFixed(2)}s`;

  /* ruler ticks: one per second, minor every 1/4s when short */
  const ticks: Array<{ frac: number; label?: string; minor?: boolean }> = [];
  const step = dur <= 8 ? 0.25 : dur <= 20 ? 0.5 : 1;
  for (let t = 0; t <= dur + 1e-6; t += step) {
    const whole = Math.abs(t - Math.round(t)) < 1e-6;
    ticks.push({ frac: t / dur, label: whole ? `${Math.round(t)}s` : undefined, minor: !whole });
  }

  return (
    <div className="timeline">
      <div className="timeline-controls">
        <div className="tl-group tl-group--left">
          <div className="tl-transport">
            <button className="iconbtn" title="Restart" onClick={() => engine.restart()}>
              <SkipBack size={13} strokeWidth={2.4} />
            </button>
          </div>
          <button className="tl-play" title="Play / pause (Space)"
            onClick={() => engine.toggle()} disabled={!img}>
            {engine.playing
              ? <Pause size={15} strokeWidth={2.6} fill="currentColor" />
              : <Play size={15} strokeWidth={2.6} fill="currentColor" style={{ marginLeft: 2 }} />}
          </button>
          <span className="tl-counter">
            {fmt(time)} <span>/ {fmt(dur)}</span>
          </span>
          <span className="tl-field">F {String(frame).padStart(3, '0')}<span className="tl-time">/{totalFrames}</span></span>
        </div>

        {selectedKf && selected ? (
          <div className="tl-group tl-group--center tl-keybar">
            <span className="tl-field">
              <Diamond size={10} strokeWidth={2.6} fill="currentColor" style={{ color: 'var(--sky-blue)' }} />
              {trackLabel(selected.path)} @ {(selectedKf.t * dur).toFixed(2)}s
            </span>
            <span style={{ minWidth: 120 }}>
              <PlainSelect
                up
                value={selectedKf.ease}
                options={EASE_OPTIONS}
                onChange={(e: EaseType) => setKeyframeEase(selected.path, selected.id, e)}
              />
            </span>
            <button className="iconbtn" title="Delete this keyframe"
              onClick={() => { removeKeyframe(selected.path, selected.id); setSelected(null); }}>
              <Trash2 size={13} strokeWidth={2.4} />
            </button>
          </div>
        ) : null}

        <div className="tl-group tl-group--right">
          <span className="tl-field">
            Loop
            <button
              className={`iconbtn${s.playback.loop ? ' accent' : ''}`}
              title={s.playback.loop ? 'Looping on' : 'Looping off — plays once'}
              onClick={() => store.set('playback.loop', !s.playback.loop)}
            ><Repeat size={13} strokeWidth={2.4} /></button>
          </span>
          <span className="tl-field">
            Duration
            <NumField value={dur} min={1} max={60} step={1}
              onChange={v => store.set('playback.duration', v)} title="Loop duration in seconds" />
          </span>
          <span className="tl-field" style={{ minWidth: 110 }}>
            <PlainSelect
              up
              value={String(fps)}
              options={[
                { value: '24', label: '24 fps' },
                { value: '25', label: '25 fps' },
                { value: '30', label: '30 fps' },
                { value: '60', label: '60 fps' },
              ]}
              onChange={v => store.set('playback.fps', parseInt(v, 10))}
            />
          </span>
        </div>
      </div>

      <div className="tl-scroll" ref={areaRef}>
        <div className="tl-head" onPointerDown={onScrub}>
          <div className="tl-corner">
            <Diamond size={9} strokeWidth={2.4} /> Tracks
          </div>
          <div className="tl-rulerarea">
            {ticks.map((t, i) => (
              <span key={i}>
                <span className={`tl-tick${t.minor ? ' minor' : ''}`} style={{ left: `${t.frac * 100}%` }} />
                {t.label !== undefined ? (
                  <span className="tl-ticklabel" style={{ left: `${t.frac * 100}%` }}>{t.label}</span>
                ) : null}
              </span>
            ))}
          </div>
        </div>

        {tracks.length === 0 ? (
          <div className="tl-row" onPointerDown={onScrub}>
            <div className="tl-row-label">
              <span className="tl-rowico"><Diamond size={9} strokeWidth={2.4} /></span>
              No tracks
            </div>
            <div className="tl-lane tl-lane--empty">
              Click the ◇ next to a slider to keyframe it
            </div>
          </div>
        ) : tracks.map(([path, kfs]) => (
          <div className="tl-row" key={path}>
            <div className="tl-row-label" title={path}>
              <span className="tl-rowico"><Diamond size={9} strokeWidth={2.4} fill="currentColor" /></span>
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>{trackLabel(path)}</span>
              <button className="tl-rowdel" title="Remove this track and all its keyframes"
                onClick={() => { clearTrack(path); if (selected?.path === path) setSelected(null); }}>
                <X size={10} strokeWidth={2.6} />
              </button>
            </div>
            <div className="tl-lane" onPointerDown={onScrub}>
              <div className="tl-progressfill" style={{ width: `${progress * 100}%` }} />
              {kfs.map(k => (
                <button
                  key={k.id}
                  type="button"
                  className={`tl-key${selected?.id === k.id ? ' selected' : ''}${k.ease === 'hold' ? ' hold' : ''}`}
                  style={{ left: `${k.t * 100}%` }}
                  title={`${(k.t * dur).toFixed(2)}s · ${k.v.toFixed(2)} · ${k.ease} — drag to move, click to select`}
                  onPointerDown={onKeyDown_(path, k.id)}
                  onClick={e => e.stopPropagation()}
                  onDoubleClick={() => removeKeyframe(path, k.id)}
                />
              ))}
            </div>
          </div>
        ))}

        <div className="tl-playhead" style={{ left: playheadLeft }}>
          <div className="tl-playhead-cap" />
        </div>
      </div>
    </div>
  );
}
