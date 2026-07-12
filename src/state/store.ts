/* Tiny observable settings store with dot-path updates, undo/redo
   (coalescing rapid changes to the same path into one history entry)
   and debounced localStorage persistence. */

import { useSyncExternalStore } from 'react';
import { Settings, defaultSettings, cloneSettings } from './types';

const LS_KEY = 'pixelform:settings:v1';
const HISTORY_LIMIT = 120;
const COALESCE_MS = 700;

type Listener = () => void;

/** Merge persisted values over defaults so new fields keep working
    after the schema grows. */
function mergeDeep<T>(base: T, over: unknown): T {
  if (over === null || typeof over !== 'object' || Array.isArray(over)) return base;
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [k, v] of Object.entries(over as Record<string, unknown>)) {
    if (!(k in out)) continue;
    const b = out[k];
    if (b !== null && typeof b === 'object' && !Array.isArray(b) &&
        v !== null && typeof v === 'object' && !Array.isArray(v)) {
      out[k] = mergeDeep(b, v);
    } else if (typeof v === typeof b) {
      out[k] = v;
    }
  }
  return out as T;
}

function loadPersisted(): Settings {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return cloneSettings(defaultSettings);
    return mergeDeep(cloneSettings(defaultSettings), JSON.parse(raw));
  } catch {
    return cloneSettings(defaultSettings);
  }
}

class SettingsStore {
  private state: Settings = loadPersisted();
  private listeners = new Set<Listener>();
  private past: Settings[] = [];
  private future: Settings[] = [];
  private lastPushPath = '';
  private lastPushTime = 0;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;

  get = (): Settings => this.state;

  subscribe = (fn: Listener): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  private emit() {
    for (const fn of this.listeners) fn();
    this.scheduleSave();
  }

  private scheduleSave() {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      try { localStorage.setItem(LS_KEY, JSON.stringify(this.state)); } catch { /* full/blocked */ }
    }, 300);
  }

  /** Set a value by dot path, e.g. set('height.amount', 0.5).
      Rapid changes to the same path merge into one undo entry. */
  set = (path: string, value: unknown): void => {
    const now = performance.now();
    const coalesce = path === this.lastPushPath && now - this.lastPushTime < COALESCE_MS;
    if (!coalesce) {
      this.past.push(cloneSettings(this.state));
      if (this.past.length > HISTORY_LIMIT) this.past.shift();
      this.future = [];
      this.lastPushPath = path;
    }
    this.lastPushTime = now;

    const next = cloneSettings(this.state);
    const parts = path.split('.');
    let node: Record<string, unknown> = next as unknown as Record<string, unknown>;
    for (let i = 0; i < parts.length - 1; i++) {
      node = node[parts[i]] as Record<string, unknown>;
      if (!node) return;
    }
    node[parts[parts.length - 1]] = value;
    this.state = next;
    this.emit();
  };

  /** Replace several paths at once as a single history entry. */
  patch = (entries: Record<string, unknown>): void => {
    this.past.push(cloneSettings(this.state));
    if (this.past.length > HISTORY_LIMIT) this.past.shift();
    this.future = [];
    this.lastPushPath = '';
    const next = cloneSettings(this.state);
    for (const [path, value] of Object.entries(entries)) {
      const parts = path.split('.');
      let node: Record<string, unknown> = next as unknown as Record<string, unknown>;
      for (let i = 0; i < parts.length - 1; i++) {
        node = node[parts[i]] as Record<string, unknown>;
        if (!node) break;
      }
      if (node) node[parts[parts.length - 1]] = value;
    }
    this.state = next;
    this.emit();
  };

  /** Replace the whole tree (project import / reset). */
  replace = (s: Settings, pushHistory = true): void => {
    if (pushHistory) {
      this.past.push(cloneSettings(this.state));
      if (this.past.length > HISTORY_LIMIT) this.past.shift();
      this.future = [];
    }
    this.lastPushPath = '';
    this.state = mergeDeep(cloneSettings(defaultSettings), s);
    this.emit();
  };

  reset = (): void => this.replace(cloneSettings(defaultSettings));

  canUndo = (): boolean => this.past.length > 0;
  canRedo = (): boolean => this.future.length > 0;

  undo = (): void => {
    const prev = this.past.pop();
    if (!prev) return;
    this.future.push(cloneSettings(this.state));
    this.lastPushPath = '';
    this.state = prev;
    this.emit();
  };

  redo = (): void => {
    const next = this.future.pop();
    if (!next) return;
    this.past.push(cloneSettings(this.state));
    this.lastPushPath = '';
    this.state = next;
    this.emit();
  };
}

export const store = new SettingsStore();

/** React hook: subscribe to the whole settings tree. */
export function useSettings(): Settings {
  return useSyncExternalStore(store.subscribe, store.get);
}

/** Read a value by dot path (for generic controls). */
export function getPath(s: Settings, path: string): unknown {
  let node: unknown = s;
  for (const p of path.split('.')) {
    if (node === null || typeof node !== 'object') return undefined;
    node = (node as Record<string, unknown>)[p];
  }
  return node;
}
