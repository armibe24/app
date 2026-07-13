/* Application shell: header, sidebars, viewport, playback bar,
   global keyboard shortcuts and session restore. */

import { useEffect } from 'react';
import { TopBar } from './components/TopBar';
import { Sidebar } from './components/Sidebar';
import { Viewport } from './components/Viewport';
import { Timeline } from './components/Timeline';
import { ToastHost, toast } from './components/ui/toast';
import { installPasteHandler } from './image/importers';
import { restorePersistedImage } from './image/source';
import { engine } from './engine/Engine';
import { store } from './state/store';
import { useSourceImage } from './hooks/useSourceImage';

function isTypingTarget(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  return t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable;
}

export default function App() {
  const img = useSourceImage();

  /* paste-to-import + session restore */
  useEffect(() => {
    const uninstall = installPasteHandler();
    void restorePersistedImage().then(ok => {
      if (ok) toast('Previous session restored');
    });
    return uninstall;
  }, []);

  /* global shortcuts (never while typing) */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && !e.shiftKey && e.key.toLowerCase() === 'z') {
        e.preventDefault(); store.undo(); return;
      }
      if (mod && e.shiftKey && e.key.toLowerCase() === 'z') {
        e.preventDefault(); store.redo(); return;
      }
      if (mod) return;
      switch (e.key) {
        case ' ':
          e.preventDefault();
          if (engine.hasImage()) engine.toggle();
          break;
        case 'f': case 'F':
          if (engine.hasImage()) engine.fitToView();
          break;
        case 'r': case 'R':
          engine.resetCamera();
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="app">
      <TopBar />
      <div className="app-main">
        <div className="app-center">
          <Viewport />
          {img ? <Timeline /> : null}
        </div>
        <Sidebar />
      </div>
      <ToastHost />
    </div>
  );
}
