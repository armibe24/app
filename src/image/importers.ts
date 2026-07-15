/* Image import entry points: file picker, drag&drop, clipboard.
   All routes funnel into setSourceImage; settings are never reset,
   so replacing an image keeps the whole look. */

import { isAcceptedImage, setSourceImage } from './source';
import { toast } from '../components/ui/toast';

export const ACCEPT_ATTR = 'image/png,image/jpeg,image/webp';

export async function importFile(file: File): Promise<boolean> {
  if (!isAcceptedImage(file)) {
    toast(`Unsupported file type: ${file.type || file.name}. Use PNG, JPEG or WebP.`, true);
    return false;
  }
  try {
    await setSourceImage(file, file.name);
    toast(`Imported ${file.name}`);
    return true;
  } catch (err) {
    toast(`Could not decode image: ${(err as Error).message}`, true);
    return false;
  }
}

export function openFilePicker(): void {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = ACCEPT_ATTR;
  input.onchange = () => {
    const file = input.files?.[0];
    if (file) void importFile(file);
  };
  input.click();
}

function isTypingTarget(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  return t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable;
}

/** Global paste handler; skips paste while typing into inputs. */
export function installPasteHandler(): () => void {
  const onPaste = (e: ClipboardEvent) => {
    if (isTypingTarget(e.target)) return;
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.kind === 'file' && item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) {
          e.preventDefault();
          void importFile(new File([file], file.name || 'pasted-image.png', { type: file.type }));
          return;
        }
      }
    }
  };
  window.addEventListener('paste', onPaste);
  return () => window.removeEventListener('paste', onPaste);
}
