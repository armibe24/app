/* Header: brand, project actions, undo/redo, settings, export. */

import { useState } from 'react';
import {
  FilePlus2, ImagePlus, Undo2, Redo2, Settings2, Download, Grid3X3,
} from 'lucide-react';
import { store, useSettings } from '../state/store';
import { openFilePicker } from '../image/importers';
import { clearSourceImage } from '../image/source';
import { useSourceImage } from '../hooks/useSourceImage';
import { SettingsModal } from './SettingsModal';
import { toast } from './ui/toast';

export function TopBar(props: { onExport: () => void; exporting: boolean }) {
  useSettings(); // rerender on every store change so undo/redo state stays fresh
  const img = useSourceImage();
  const [showSettings, setShowSettings] = useState(false);

  const newProject = () => {
    if (!window.confirm('Start a new project? This clears the image and resets all settings.')) return;
    clearSourceImage();
    store.reset();
    toast('New project');
  };

  return (
    <header className="topbar">
      <div className="topbar-brand">
        <span className="topbar-logo"><Grid3X3 size={17} strokeWidth={2.2} /></span>
        PIXELFORM <span className="sub">IMAGE SCULPTOR</span>
      </div>

      <div className="topbar-sep" />
      <div className="topbar-group">
        <button className="topbtn" onClick={newProject} title="New project (clears image and settings)">
          <FilePlus2 size={13} strokeWidth={2.4} /> New
        </button>
        <button className="topbtn" onClick={openFilePicker} title="Import an image (PNG, JPEG, WebP)">
          <ImagePlus size={13} strokeWidth={2.4} /> Import
        </button>
      </div>

      <div className="topbar-sep" />
      <div className="topbar-group">
        <button
          className="iconbtn" title="Undo (Ctrl+Z)"
          disabled={!store.canUndo()}
          onClick={() => store.undo()}
        ><Undo2 size={14} strokeWidth={2.4} /></button>
        <button
          className="iconbtn" title="Redo (Ctrl+Shift+Z)"
          disabled={!store.canRedo()}
          onClick={() => store.redo()}
        ><Redo2 size={14} strokeWidth={2.4} /></button>
      </div>

      <div className="topbar-spacer" />

      <div className="topbar-group">
        <button className="iconbtn" title="Project settings" onClick={() => setShowSettings(true)}>
          <Settings2 size={14} strokeWidth={2.4} />
        </button>
        <button
          className="topbtn topbtn--primary"
          onClick={props.onExport}
          disabled={!img || props.exporting}
          title={img ? 'Export with the current export settings' : 'Import an image first'}
        >
          <Download size={13} strokeWidth={2.4} /> Export
        </button>
      </div>

      {showSettings ? <SettingsModal onClose={() => setShowSettings(false)} /> : null}
    </header>
  );
}
