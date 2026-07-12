/* Compact playback bar: transport, loop, duration/fps, scrubber.
   Deliberately not a keyframe timeline. */

import { useEffect, useRef, useState } from 'react';
import { Play, Pause, SkipBack, Repeat } from 'lucide-react';
import { engine } from '../engine/Engine';
import { store, useSettings } from '../state/store';
import { useSourceImage } from '../hooks/useSourceImage';
import { NumField, PlainSelect } from './ui/controls';

export function PlaybackBar() {
  const s = useSettings();
  const img = useSourceImage();
  const [, force] = useState(0);
  const scrubRef = useRef<HTMLDivElement>(null);

  useEffect(() => engine.onTick(() => force(n => n + 1)), []);

  const dur = s.playback.duration;
  const fps = s.playback.fps;
  const time = Math.min(engine.time, dur);
  const progress = dur > 0 ? time / dur : 0;
  const frame = Math.floor(time * fps);
  const totalFrames = Math.max(1, Math.round(dur * fps));

  const scrubTo = (clientX: number) => {
    const el = scrubRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const frac = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
    engine.setTime(frac * dur);
  };

  const onScrubDown = (e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    scrubTo(e.clientX);
    const move = (ev: PointerEvent) => scrubTo(ev.clientX);
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const fmt = (t: number) => `${t.toFixed(2)}s`;

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

      <div className="tl-scrub" ref={scrubRef} onPointerDown={onScrubDown}
        title="Drag to scrub through the loop">
        <div className="tl-progressfill" style={{ width: `${progress * 100}%` }} />
        {Array.from({ length: 9 }, (_, i) => (
          <span key={i} className="tl-tick" style={{ left: `${(i + 1) * 10}%` }} />
        ))}
        <div className="tl-playhead" style={{ left: `${progress * 100}%` }}>
          <div className="tl-playhead-cap" />
        </div>
      </div>
    </div>
  );
}
