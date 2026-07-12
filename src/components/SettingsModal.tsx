/* Project settings modal: save/load project JSON, reset, session info. */

import { useEffect } from 'react';
import { X, Download, Upload, RotateCcw } from 'lucide-react';
import { store } from '../state/store';
import { useSourceImage } from '../hooks/useSourceImage';
import { Settings } from '../state/types';
import { toast } from './ui/toast';

const PROJECT_VERSION = 1;

export function SettingsModal(props: { onClose: () => void }) {
  const img = useSourceImage();

  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') props.onClose(); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [props]);

  const exportJson = () => {
    const payload = {
      app: 'pixelform', version: PROJECT_VERSION,
      savedAt: new Date().toISOString(),
      imageName: img?.name ?? null,
      settings: store.get(),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${store.get().export.fileName || 'pixelform'}-project.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast('Project settings exported');
  };

  const importJson = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const parsed = JSON.parse(await file.text()) as { app?: string; settings?: Settings; imageName?: string | null };
        if (parsed.app !== 'pixelform' || !parsed.settings) {
          toast('Not a PIXELFORM project file', true);
          return;
        }
        store.replace(parsed.settings);
        toast(parsed.imageName
          ? `Settings loaded. Reimport the image “${parsed.imageName}” — images are not embedded in project files.`
          : 'Settings loaded');
      } catch {
        toast('Could not read the project file', true);
      }
    };
    input.click();
  };

  return (
    <div className="overlay" onMouseDown={e => { if (e.target === e.currentTarget) props.onClose(); }}>
      <div className="modal-panel">
        <div className="modal-head">
          <h2>Project settings</h2>
          <button className="iconbtn" onClick={props.onClose} title="Close (Esc)">
            <X size={15} strokeWidth={2.4} />
          </button>
        </div>
        <div className="modal-body">
          <div className="modal-subhead">Project file</div>
          <p className="modal-note">
            Settings are saved to this browser automatically and restored on reload.
            A project file stores every setting (geometry, height, animation, camera,
            appearance, background, export) as JSON. The source image is <code>not</code>{' '}
            embedded — reimport it after loading a project.
          </p>
          <div className="modal-actions" style={{ justifyContent: 'flex-start' }}>
            <button className="btn btn--sm" onClick={exportJson}>
              <Download size={12} strokeWidth={2.5} /> Export settings JSON
            </button>
            <button className="btn btn--sm" onClick={importJson}>
              <Upload size={12} strokeWidth={2.5} /> Import settings JSON
            </button>
          </div>

          <div className="modal-subhead">Reset</div>
          <p className="modal-note">
            Restores every setting to its default value. The imported image is kept.
          </p>
          <div className="modal-actions" style={{ justifyContent: 'flex-start' }}>
            <button
              className="btn btn--sm"
              onClick={() => {
                if (window.confirm('Reset all settings to defaults?')) {
                  store.reset();
                  toast('Settings reset (undo available)');
                }
              }}
            >
              <RotateCcw size={12} strokeWidth={2.5} /> Reset project settings
            </button>
          </div>

          <div className="modal-subhead">Shortcuts</div>
          <table className="about-table">
            <tbody>
              <tr><td>Play / pause</td><td>Space</td></tr>
              <tr><td>Paste image</td><td>Ctrl/⌘ + V</td></tr>
              <tr><td>Undo / redo</td><td>Ctrl/⌘ + Z · Ctrl/⌘ + Shift + Z</td></tr>
              <tr><td>Fit image to view</td><td>F</td></tr>
              <tr><td>Reset camera</td><td>R</td></tr>
              <tr><td>Close dialogs</td><td>Esc</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
