/* UI style (theme) registry — mirrors the Sonitus reference. The
   active style is applied as `data-theme` on <html>; every theme in
   src/styles/themes.css overrides the base design tokens. A custom
   CSS file can be layered on top and persists in localStorage. */

export interface UiStyle {
  id: string;
  name: string;
  desc: string;
}

export const UI_STYLES: UiStyle[] = [
  { id: 'aqua', name: 'Aqua', desc: 'Deep aqua glass with glowing cyan accents — the default look.' },
  { id: 'light', name: 'Light', desc: 'The same aqua design language on bright surfaces.' },
  { id: 'clean', name: 'Clean', desc: 'Minimal neutral UI: flat zinc surfaces, hairline borders, no glow.' },
  { id: 'xp', name: 'Experience', desc: 'Early-2000s desktop: silver dialogs, blue title bar, beveled controls.' },
  { id: 'signal', name: 'Signal Core', desc: 'Console dashboard: near-black panels with lime glow accents.' },
];

const STYLE_KEY = 'pixelform:uistyle:v1';
const CUSTOM_CSS_KEY = 'pixelform:customcss:v1';
const CUSTOM_STYLE_ID = 'pixelform-custom-css';

const listeners = new Set<() => void>();
export function onUiStyleChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}
function emit(): void { for (const fn of listeners) fn(); }

export function getUiStyle(): string {
  return document.documentElement.dataset.theme ?? 'aqua';
}

export function applyUiStyle(id: string): void {
  if (id === 'aqua') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = id;
  try { localStorage.setItem(STYLE_KEY, id); } catch { /* ignore */ }
  emit();
}

/* ---------------- custom css ---------------- */

export interface CustomCss { name: string; css: string }

export function getCustomCss(): CustomCss | null {
  try {
    const raw = localStorage.getItem(CUSTOM_CSS_KEY);
    return raw ? JSON.parse(raw) as CustomCss : null;
  } catch {
    return null;
  }
}

function injectCustomCss(css: string): void {
  let el = document.getElementById(CUSTOM_STYLE_ID) as HTMLStyleElement | null;
  if (!el) {
    el = document.createElement('style');
    el.id = CUSTOM_STYLE_ID;
    document.head.appendChild(el);
  }
  el.textContent = css;
}

export function setCustomCss(name: string, css: string): void {
  injectCustomCss(css);
  try { localStorage.setItem(CUSTOM_CSS_KEY, JSON.stringify({ name, css })); } catch { /* too large */ }
  emit();
}

export function clearCustomCss(): void {
  document.getElementById(CUSTOM_STYLE_ID)?.remove();
  try { localStorage.removeItem(CUSTOM_CSS_KEY); } catch { /* ignore */ }
  emit();
}

/** Apply the persisted style + custom css before first paint. */
export function initUiStyle(): void {
  try {
    const saved = localStorage.getItem(STYLE_KEY);
    if (saved && saved !== 'aqua' && UI_STYLES.some(s => s.id === saved)) {
      document.documentElement.dataset.theme = saved;
    }
  } catch { /* ignore */ }
  const custom = getCustomCss();
  if (custom) injectCustomCss(custom.css);
}
