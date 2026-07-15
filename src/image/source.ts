/* Source image handling: decoding, module-level state, change events
   and IndexedDB persistence so the last session can be restored.
   The image is deliberately kept outside the undo/settings store. */

export interface SourceImage {
  name: string;
  width: number;
  height: number;
  /** Full-resolution pixels (capped at MAX_DIM on the larger side). */
  data: ImageData;
  /** Object URL for thumbnails. */
  url: string;
  hasAlpha: boolean;
}

const MAX_DIM = 2048;
const ACCEPTED = ['image/png', 'image/jpeg', 'image/webp'];

let current: SourceImage | null = null;
const listeners = new Set<() => void>();

export const getSourceImage = (): SourceImage | null => current;

export function onSourceImageChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

function emit() { for (const fn of listeners) fn(); }

export function isAcceptedImage(file: File | Blob): boolean {
  return ACCEPTED.includes(file.type);
}

export async function loadImageBlob(blob: Blob, name: string): Promise<SourceImage> {
  const bmp = await createImageBitmap(blob);
  let w = bmp.width, h = bmp.height;
  if (Math.max(w, h) > MAX_DIM) {
    const k = MAX_DIM / Math.max(w, h);
    w = Math.max(1, Math.round(w * k));
    h = Math.max(1, Math.round(h * k));
  }
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('2D canvas unavailable');
  ctx.drawImage(bmp, 0, 0, w, h);
  bmp.close();
  const data = ctx.getImageData(0, 0, w, h);

  let hasAlpha = false;
  const px = data.data;
  for (let i = 3; i < px.length; i += 4) {
    if (px[i] < 255) { hasAlpha = true; break; }
  }

  const img: SourceImage = {
    name, width: w, height: h, data,
    url: URL.createObjectURL(blob), hasAlpha,
  };
  return img;
}

/** Load and make current; persists the blob for session restore. */
export async function setSourceImage(blob: Blob, name: string): Promise<SourceImage> {
  const img = await loadImageBlob(blob, name);
  if (current) URL.revokeObjectURL(current.url);
  current = img;
  emit();
  void persistImage(blob, name);
  return img;
}

export function clearSourceImage(): void {
  if (current) URL.revokeObjectURL(current.url);
  current = null;
  emit();
  void deletePersistedImage();
}

/* ---------------- IndexedDB persistence ---------------- */

const DB_NAME = 'pixelform';
const DB_STORE = 'files';
const IMG_KEY = 'lastImage';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(DB_STORE)) {
        req.result.createObjectStore(DB_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function persistImage(blob: Blob, name: string): Promise<void> {
  try {
    const db = await openDb();
    const tx = db.transaction(DB_STORE, 'readwrite');
    tx.objectStore(DB_STORE).put({ blob, name }, IMG_KEY);
    await new Promise<void>((res, rej) => {
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    });
    db.close();
  } catch { /* persistence is best-effort */ }
}

async function deletePersistedImage(): Promise<void> {
  try {
    const db = await openDb();
    const tx = db.transaction(DB_STORE, 'readwrite');
    tx.objectStore(DB_STORE).delete(IMG_KEY);
    db.close();
  } catch { /* ignore */ }
}

/** Restore the last session's image (if any) on startup. */
export async function restorePersistedImage(): Promise<boolean> {
  try {
    const db = await openDb();
    const tx = db.transaction(DB_STORE, 'readonly');
    const req = tx.objectStore(DB_STORE).get(IMG_KEY);
    const rec = await new Promise<{ blob: Blob; name: string } | undefined>((res, rej) => {
      req.onsuccess = () => res(req.result as { blob: Blob; name: string } | undefined);
      req.onerror = () => rej(req.error);
    });
    db.close();
    if (!rec?.blob) return false;
    const img = await loadImageBlob(rec.blob, rec.name);
    if (current) URL.revokeObjectURL(current.url);
    current = img;
    emit();
    return true;
  } catch {
    return false;
  }
}
