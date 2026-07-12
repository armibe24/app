/* Reusable, store-bound controls in the supplied design language:
   slider rows with editable values, custom select, segmented picker,
   toggle, color field, number field, collapsible sections.
   Double-clicking any control label resets that setting. */

import {
  ReactNode, useEffect, useRef, useState, KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import { ChevronDown, ChevronUp, Check } from 'lucide-react';
import { store, useSettings, getPath } from '../../state/store';
import { defaultSettings } from '../../state/types';

/* ---------------- collapsible section ---------------- */

export function Section(props: {
  title: string; defaultOpen?: boolean; children: ReactNode; dotColor?: string;
}) {
  const [open, setOpen] = useState(props.defaultOpen ?? true);
  return (
    <section className={`side-section${open ? ' open' : ''}`}>
      <button className="side-heading" onClick={() => setOpen(o => !o)} type="button">
        <span className="dot" style={props.dotColor ? { background: props.dotColor } : undefined} />
        {props.title}
        <ChevronDown className="chev" size={13} strokeWidth={2.5} />
      </button>
      <div className="side-body">
        <div className="side-rows">{props.children}</div>
      </div>
    </section>
  );
}

/* ---------------- helpers ---------------- */

function useValue<T>(path: string): T {
  const s = useSettings();
  return getPath(s, path) as T;
}

function resetPath(path: string): void {
  store.set(path, getPath(defaultSettings, path));
}

export function Label(props: { text: string; path?: string; tooltip?: string }) {
  return (
    <span
      className="control-label"
      title={props.tooltip ?? (props.path ? 'Double-click to reset' : undefined)}
      onDoubleClick={props.path ? () => resetPath(props.path!) : undefined}
    >
      {props.text}
    </span>
  );
}

/* ---------------- slider row ---------------- */

export function SliderRow(props: {
  label: string; path: string; min: number; max: number; step?: number;
  unit?: string; decimals?: number; tooltip?: string;
  disabled?: boolean; disabledReason?: string;
}) {
  const value = useValue<number>(props.path);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const decimals = props.decimals ?? ((props.step ?? 1) < 1 ? 2 : 0);

  useEffect(() => { if (editing) inputRef.current?.select(); }, [editing]);

  const commitDraft = () => {
    const n = parseFloat(draft);
    if (!Number.isNaN(n)) {
      store.set(props.path, Math.min(props.max, Math.max(props.min, n)));
    }
    setEditing(false);
  };

  const title = props.disabled ? props.disabledReason : props.tooltip;
  return (
    <div className={`control${props.disabled ? ' disabled' : ''}`} title={props.disabled ? props.disabledReason : undefined}>
      <div className="control-head">
        <Label text={props.label} path={props.path} tooltip={title} />
        <div className="control-valuebox">
          {editing ? (
            <input
              ref={inputRef}
              className="control-valueinput"
              defaultValue={value.toFixed(decimals)}
              onChange={e => setDraft(e.target.value)}
              onBlur={commitDraft}
              onKeyDown={(e: ReactKeyboardEvent<HTMLInputElement>) => {
                if (e.key === 'Enter') commitDraft();
                if (e.key === 'Escape') setEditing(false);
                e.stopPropagation();
              }}
            />
          ) : (
            <button
              className="control-value"
              type="button"
              title="Click to type a value"
              onClick={() => { setDraft(String(value)); setEditing(true); }}
            >
              {value.toFixed(decimals)}
              {props.unit ? <span className="control-unit">{props.unit}</span> : null}
            </button>
          )}
        </div>
      </div>
      <input
        type="range"
        min={props.min} max={props.max} step={props.step ?? 0.01}
        value={value}
        disabled={props.disabled}
        onChange={e => store.set(props.path, parseFloat(e.target.value))}
      />
    </div>
  );
}

/* ---------------- custom select ---------------- */

export interface SelectOption<T extends string = string> {
  value: T; label: string; icon?: ReactNode;
}

export function SelectRow<T extends string>(props: {
  label?: string; path: string; options: SelectOption<T>[];
  tooltip?: string; disabled?: boolean; disabledReason?: string;
  onAfterChange?: (v: T) => void;
}) {
  const value = useValue<T>(props.path);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('pointerdown', close);
    window.addEventListener('keydown', esc);
    return () => {
      window.removeEventListener('pointerdown', close);
      window.removeEventListener('keydown', esc);
    };
  }, [open]);

  const current = props.options.find(o => o.value === value);
  return (
    <div className={`control${props.disabled ? ' disabled' : ''}`} title={props.disabled ? props.disabledReason : undefined}>
      {props.label ? (
        <div className="control-head"><Label text={props.label} path={props.path} tooltip={props.tooltip} /></div>
      ) : null}
      <div className={`select${props.disabled ? ' disabled' : ''}`} ref={rootRef}>
        <button
          type="button"
          className={`select-trigger${open ? ' open' : ''}`}
          onClick={() => setOpen(o => !o)}
          disabled={props.disabled}
        >
          <span className="select-value">{current?.label ?? value}</span>
          <ChevronDown className="select-chevron" size={13} strokeWidth={2.5} />
        </button>
        {open ? (
          <div className="select-menu" role="listbox">
            {props.options.map(o => (
              <button
                key={o.value}
                type="button"
                className={`select-option${o.value === value ? ' selected' : ''}`}
                onClick={() => {
                  store.set(props.path, o.value);
                  props.onAfterChange?.(o.value);
                  setOpen(false);
                }}
              >
                <span>{o.label}</span>
                {o.value === value ? <Check size={12} strokeWidth={3} /> : null}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/* ---------------- plain (value-driven) select ---------------- */

export function PlainSelect<T extends string>(props: {
  label?: string; value: T; options: SelectOption<T>[];
  onChange: (v: T) => void; tooltip?: string; disabled?: boolean;
  /** Open the menu upward (for controls near the bottom edge). */
  up?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('pointerdown', close);
    window.addEventListener('keydown', esc);
    return () => {
      window.removeEventListener('pointerdown', close);
      window.removeEventListener('keydown', esc);
    };
  }, [open]);

  const current = props.options.find(o => o.value === props.value);
  return (
    <div className={`control${props.disabled ? ' disabled' : ''}`}>
      {props.label ? (
        <div className="control-head">
          <span className="control-label" title={props.tooltip}>{props.label}</span>
        </div>
      ) : null}
      <div className={`select${props.disabled ? ' disabled' : ''}`} ref={rootRef}>
        <button type="button" className={`select-trigger${open ? ' open' : ''}`}
          onClick={() => setOpen(o => !o)} disabled={props.disabled}>
          <span className="select-value">{current?.label ?? props.value}</span>
          <ChevronDown className="select-chevron" size={13} strokeWidth={2.5} />
        </button>
        {open ? (
          <div className={`select-menu${props.up ? ' up' : ''}`} role="listbox">
            {props.options.map(o => (
              <button key={o.value} type="button"
                className={`select-option${o.value === props.value ? ' selected' : ''}`}
                onClick={() => { props.onChange(o.value); setOpen(false); }}>
                <span>{o.label}</span>
                {o.value === props.value ? <Check size={12} strokeWidth={3} /> : null}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/* ---------------- segmented picker ---------------- */

export function SegRow<T extends string>(props: {
  label?: string; path: string; options: Array<{ value: T; label: string }>;
  tooltip?: string; disabled?: boolean;
}) {
  const value = useValue<T>(props.path);
  return (
    <div className={`control${props.disabled ? ' disabled' : ''}`}>
      {props.label ? (
        <div className="control-head"><Label text={props.label} path={props.path} tooltip={props.tooltip} /></div>
      ) : null}
      <div className="seg">
        {props.options.map(o => (
          <button
            key={o.value}
            type="button"
            className={o.value === value ? 'active' : ''}
            onClick={() => store.set(props.path, o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ---------------- toggle ---------------- */

export function ToggleRow(props: {
  label: string; path: string; tooltip?: string;
  disabled?: boolean; disabledReason?: string;
}) {
  const value = useValue<boolean>(props.path);
  return (
    <label className={`toggle${props.disabled ? ' disabled' : ''}`}
      title={props.disabled ? props.disabledReason : props.tooltip}>
      <Label text={props.label} path={props.path} tooltip={props.disabled ? props.disabledReason : props.tooltip} />
      <input
        type="checkbox"
        checked={value}
        disabled={props.disabled}
        onChange={e => store.set(props.path, e.target.checked)}
      />
      <span className="track" />
    </label>
  );
}

/* ---------------- color field ---------------- */

const HEX_RE = /^#?[0-9a-fA-F]{6}$/;

export function ColorRow(props: {
  label: string; path: string; tooltip?: string; disabled?: boolean;
}) {
  const value = useValue<string>(props.path);
  const [draft, setDraft] = useState<string | null>(null);
  const invalid = draft !== null && !HEX_RE.test(draft);

  const commit = (raw: string) => {
    if (HEX_RE.test(raw)) {
      store.set(props.path, raw.startsWith('#') ? raw.toLowerCase() : `#${raw.toLowerCase()}`);
    }
    setDraft(null);
  };

  return (
    <div className={`control${props.disabled ? ' disabled' : ''}`}>
      <div className="control-head"><Label text={props.label} path={props.path} tooltip={props.tooltip} /></div>
      <div className="colorfield-body">
        <button className="color-swatch" type="button" style={{ background: value }} title="Pick a color">
          <input
            type="color"
            value={value}
            onChange={e => store.set(props.path, e.target.value)}
            disabled={props.disabled}
          />
        </button>
        <input
          className={`colorfield-hexinput${invalid ? ' invalid' : ''}`}
          value={draft ?? value}
          spellCheck={false}
          onChange={e => setDraft(e.target.value)}
          onBlur={e => commit(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') commit((e.target as HTMLInputElement).value);
            if (e.key === 'Escape') setDraft(null);
            e.stopPropagation();
          }}
        />
      </div>
    </div>
  );
}

/* ---------------- number field ---------------- */

export function NumField(props: {
  value: number; min: number; max: number; step?: number;
  onChange: (v: number) => void; disabled?: boolean; title?: string;
}) {
  const step = props.step ?? 1;
  const clamp = (v: number) => Math.min(props.max, Math.max(props.min, v));
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <span className={`numfield${props.disabled ? ' disabled' : ''}`} title={props.title}>
      <input
        type="number"
        value={draft ?? props.value}
        min={props.min} max={props.max} step={step}
        disabled={props.disabled}
        onChange={e => setDraft(e.target.value)}
        onBlur={() => {
          if (draft !== null) {
            const n = parseFloat(draft);
            if (!Number.isNaN(n)) props.onChange(clamp(n));
          }
          setDraft(null);
        }}
        onKeyDown={e => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          e.stopPropagation();
        }}
      />
      <span className="numfield-steppers">
        <button type="button" tabIndex={-1} onClick={() => props.onChange(clamp(props.value + step))}>
          <ChevronUp size={9} strokeWidth={3} />
        </button>
        <button type="button" tabIndex={-1} onClick={() => props.onChange(clamp(props.value - step))}>
          <ChevronDown size={9} strokeWidth={3} />
        </button>
      </span>
    </span>
  );
}

export function NumberRow(props: {
  label: string; path: string; min: number; max: number; step?: number; tooltip?: string;
}) {
  const value = useValue<number>(props.path);
  return (
    <div className="inline-field">
      <Label text={props.label} path={props.path} tooltip={props.tooltip} />
      <NumField
        value={value} min={props.min} max={props.max} step={props.step}
        onChange={v => store.set(props.path, v)}
      />
    </div>
  );
}
