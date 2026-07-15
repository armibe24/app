/* Settings modal (Sonitus layout): UI style cards, custom CSS file,
   project JSON save/load and reset. */

import { useEffect, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { X, Download, Upload, RotateCcw, FileCode2, Trash2 } from 'lucide-react';
import { store } from '../state/store';
import { useSourceImage } from '../hooks/useSourceImage';
import { Settings } from '../state/types';
import {
  UI_STYLES, getUiStyle, applyUiStyle, onUiStyleChange,
  getCustomCss, setCustomCss, clearCustomCss,
} from '../themes/uiStyles';
import { toast } from './ui/toast';

const PROJECT_VERSION = 1;
const MAX_CSS_BYTES = 400_000;

function useUiStyle(): string {
  return useSyncExternalStore(onUiStyleChange, getUiStyle);
}

export function SettingsModal(props: { onClose: () => void }) {
  const img = useSourceImage();
  const activeStyle = useUiStyle();
  useSyncExternalStore(onUiStyleChange, () => getCustomCss()?.name ?? '');
  const custom = getCustomCss();

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

  const loadCss = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'text/css,.css';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      if (file.size > MAX_CSS_BYTES) {
        toast('CSS file too large (max 400 KB)', true);
        return;
      }
      const css = await file.text();
      setCustomCss(file.name, css);
      toast(`Custom CSS applied: ${file.name}`);
    };
    input.click();
  };

  /* portaled to <body>: the topbar's backdrop-filter would otherwise
     become the containing block for the fixed overlay */
  return createPortal(
    <div className="overlay" onMouseDown={e => { if (e.target === e.currentTarget) props.onClose(); }}>
      <div className="modal-panel">
        <div className="modal-head">
          <h2>Settings</h2>
          <button className="iconbtn" onClick={props.onClose} title="Close (Esc)">
            <X size={15} strokeWidth={2.4} />
          </button>
        </div>
        <div className="modal-body">
          <div className="modal-subhead">Interface style</div>
          <div className="style-grid">
            {UI_STYLES.map(s => (
              <button
                key={s.id}
                type="button"
                className={`style-card${activeStyle === s.id ? ' selected' : ''}`}
                onClick={() => { applyUiStyle(s.id); toast(`Style: ${s.name}`); }}
              >
                <span className="style-card-head">{s.name}</span>
                <span className="style-card-desc">{s.desc}</span>
              </button>
            ))}
          </div>

          <div className="customcss">
            <div className="modal-subhead">Custom CSS</div>
            <p className="modal-note">
              Load a stylesheet on top of the selected style. Override the design
              tokens (<code>--paper</code>, <code>--accent</code>, <code>--font-mono</code>, …)
              or any component class. The file is stored in this browser and
              re-applied on every start.
            </p>
            <div className="customcss-actions">
              <button className="btn btn--sm" onClick={loadCss}>
                <FileCode2 size={12} strokeWidth={2.5} /> Load CSS file
              </button>
              {custom ? (
                <button className="btn btn--sm" onClick={() => { clearCustomCss(); toast('Custom CSS removed'); }}>
                  <Trash2 size={12} strokeWidth={2.5} /> Remove
                </button>
              ) : null}
            </div>
            <p className="import-meta customcss-status">
              {custom
                ? <>Active: <b>{custom.name}</b> · {(custom.css.length / 1024).toFixed(1)} KB</>
                : 'No custom CSS loaded.'}
            </p>
          </div>

          <div className="modal-subhead">Project file</div>
          <p className="modal-note">
            Settings save to this browser automatically. A project file stores every
            setting (geometry, height, animation, keyframes, camera, appearance,
            background, export) as JSON. The source image is <code>not</code> embedded —
            reimport it after loading a project.
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
          <p className="modal-note">Restores every setting to its default value. The imported image is kept.</p>
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
        </div>
      </div>
    </div>,
    document.body,
  );
}
