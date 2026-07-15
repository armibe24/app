/* Center viewport: Three.js canvas, camera chip toolbar, drop zone,
   drag-over state, transparency checker and the export-crop frame. */

import { useEffect, useRef, useState } from 'react';
import { ImagePlus, Maximize2, Scan, RotateCcw, Square } from 'lucide-react';
import { engine } from '../engine/Engine';
import { store, useSettings } from '../state/store';
import { useSourceImage } from '../hooks/useSourceImage';
import { importFile, openFilePicker } from '../image/importers';
import { getSourceImage } from '../image/source';

export function Viewport() {
  const hostRef = useRef<HTMLDivElement>(null);
  const mountRef = useRef<HTMLDivElement>(null);
  const s = useSettings();
  const img = useSourceImage();
  const [dragOver, setDragOver] = useState(false);
  const [frame, setFrame] = useState<{ w: number; h: number } | null>(null);

  /* engine mount */
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    engine.init(mount);
    engine.applySettings(store.get());
    const unsubSettings = store.subscribe(() => engine.applySettings(store.get()));
    engine.setImage(getSourceImage());
    return () => {
      unsubSettings();
      engine.destroy();
    };
  }, []);

  /* keep engine's image current */
  useEffect(() => { engine.setImage(img); }, [img]);

  /* export-crop frame overlay sizing */
  useEffect(() => {
    const host = hostRef.current;
    if (!host || !s.viewport.showFrame) { setFrame(null); return; }
    const update = () => {
      const vw = host.clientWidth, vh = host.clientHeight;
      const margin = 48;
      const exAspect = s.export.width / Math.max(1, s.export.height);
      let w = vw - margin * 2, h = w / exAspect;
      if (h > vh - margin * 2) { h = vh - margin * 2; w = h * exAspect; }
      setFrame({ w: Math.max(40, w), h: Math.max(40, h) });
    };
    update();
    const obs = new ResizeObserver(update);
    obs.observe(host);
    return () => obs.disconnect();
  }, [s.viewport.showFrame, s.export.width, s.export.height]);

  /* drag & drop */
  const onDragOver = (e: React.DragEvent) => {
    if (e.dataTransfer.types.includes('Files')) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      setDragOver(true);
    }
  };
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void importFile(file);
  };

  const isMac = navigator.platform.toUpperCase().includes('MAC');
  const pasteKey = isMac ? '⌘V' : 'Ctrl+V';

  return (
    <div
      ref={hostRef}
      className={[
        'viewport',
        dragOver ? 'dragover' : '',
        s.background.type === 'transparent' ? 'bg-checker' : '',
      ].filter(Boolean).join(' ')}
      onDragOver={onDragOver}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
    >
      <div className="checker" />
      <div ref={mountRef} style={{ position: 'absolute', inset: 0 }} />

      {/* camera chips */}
      <div className="viewport-toolbar">
        <div className="vp-chipgroup">
          <button
            className={`vp-chip${s.camera.projection === 'perspective' ? ' active' : ''}`}
            onClick={() => store.set('camera.projection', 'perspective')}
            title="Perspective camera"
          >Persp</button>
          <button
            className={`vp-chip${s.camera.projection === 'orthographic' ? ' active' : ''}`}
            onClick={() => store.set('camera.projection', 'orthographic')}
            title="Orthographic camera"
          >Ortho</button>
        </div>
        <div className="vp-chipgroup">
          <button className="vp-chip vp-chip--icon" onClick={() => engine.resetCamera()} title="Reset camera (R)">
            <RotateCcw size={11} strokeWidth={2.5} /> Reset
          </button>
          <button className="vp-chip vp-chip--icon" onClick={() => engine.frontView()} title="Straight-on front view">
            <Square size={11} strokeWidth={2.5} /> Front
          </button>
          <button className="vp-chip vp-chip--icon" onClick={() => engine.fitToView()} title="Fit image to view (F)" disabled={!img}>
            <Scan size={11} strokeWidth={2.5} /> Fit
          </button>
        </div>
        <div className="vp-chipgroup">
          <button
            className="vp-chip vp-chip--icon"
            title="Fullscreen preview"
            onClick={() => {
              const host = hostRef.current;
              if (!host) return;
              if (document.fullscreenElement) void document.exitFullscreen();
              else void host.requestFullscreen();
            }}
          >
            <Maximize2 size={11} strokeWidth={2.5} /> Full
          </button>
        </div>
      </div>

      {/* render frame — the exact export crop; the passepartout slider
          controls how strongly the outside area is dimmed */}
      {frame && img ? (
        <div
          className="render-frame"
          style={{
            width: frame.w, height: frame.h,
            boxShadow: `0 0 0 9999px rgba(0,0,0,${s.viewport.passepartout.toFixed(3)})`,
          }}
        >
          <span className="rf-corner tl" /><span className="rf-corner tr" />
          <span className="rf-corner bl" /><span className="rf-corner br" />
          <span className="render-frame-label">{s.export.width} × {s.export.height}</span>
        </div>
      ) : null}

      {img ? (
        <div className="viewport-hint">Drag orbit · Shift pan · Wheel zoom</div>
      ) : (
        <div className="dropzone">
          <div className="dropzone-inner" onClick={openFilePicker} role="button" tabIndex={0}
            onKeyDown={e => { if (e.key === 'Enter') openFilePicker(); }}>
            <ImagePlus className="dropzone-ico" size={34} strokeWidth={1.6} />
            <div className="dropzone-title">Paste or drop an image</div>
            <div className="dropzone-sub">
              PNG · JPEG · WebP — alpha supported<br />
              Paste with <kbd>{pasteKey}</kbd> or
            </div>
            <button className="btn btn--teal btn--sm" type="button"
              onClick={e => { e.stopPropagation(); openFilePicker(); }}>
              <ImagePlus size={13} strokeWidth={2.5} /> Import image
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
