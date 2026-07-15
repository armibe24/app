/* About dialog: what the app is + keyboard shortcuts. */

import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

export function AboutModal(props: { onClose: () => void }) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') props.onClose(); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [props]);

  /* portaled to <body>: the topbar's backdrop-filter would otherwise
     become the containing block for the fixed overlay */
  return createPortal(
    <div className="overlay" onMouseDown={e => { if (e.target === e.currentTarget) props.onClose(); }}>
      <div className="modal-panel">
        <div className="modal-head">
          <h2>About PIXELFORM</h2>
          <button className="iconbtn" onClick={props.onClose} title="Close (Esc)">
            <X size={15} strokeWidth={2.4} />
          </button>
        </div>
        <div className="modal-body">
          <div className="modal-subhead">Image sculptor</div>
          <p className="modal-note">
            Turns pasted or imported images into animated 3D heightfields and pixel
            sculptures: point clouds, grid heightfields and scanlines with real depth
            driven by image information, sculptural looping motion, keyframe tracks
            and frame-accurate exports. Everything runs locally in this browser —
            no backend, no cloud processing.
          </p>
          <table className="about-table">
            <tbody>
              <tr><td>Rendering</td><td>Three.js · WebGL2 · custom GLSL</td></tr>
              <tr><td>Video export</td><td>WebCodecs · webm-muxer · mp4-muxer</td></tr>
              <tr><td>Processing</td><td>100% local, in-browser</td></tr>
            </tbody>
          </table>

          <div className="modal-subhead">Shortcuts</div>
          <table className="about-table">
            <tbody>
              <tr><td>Play / pause</td><td>Space</td></tr>
              <tr><td>Paste image</td><td>Ctrl/⌘ + V</td></tr>
              <tr><td>Undo / redo</td><td>Ctrl/⌘ + Z · Ctrl/⌘ + Shift + Z</td></tr>
              <tr><td>Fit image to view</td><td>F</td></tr>
              <tr><td>Reset camera</td><td>R</td></tr>
              <tr><td>Timeline zoom</td><td>Ctrl + wheel on the tracks</td></tr>
              <tr><td>Close dialogs</td><td>Esc</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>,
    document.body,
  );
}
