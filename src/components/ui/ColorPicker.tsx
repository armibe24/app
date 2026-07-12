/* App-styled color picker popover (Sonitus design): saturation/value
   field, hue slider, eyedropper (where the browser supports it),
   preview and hex + RGB inputs. Replaces the native color input —
   the HSV state stays authoritative while the popover is open so
   dragging through black/white never loses the hue. */

import { useEffect, useRef, useState } from 'react';
import { Pipette } from 'lucide-react';

/* ---------------- color math ---------------- */

export function hexToRgb(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex(r: number, g: number, b: number): string {
  const c = (v: number) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

function rgbToHsv(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d > 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return [h, max === 0 ? 0 : d / max, max];
}

function hsvToRgb(h: number, s: number, v: number): [number, number, number] {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let rgb: [number, number, number];
  if (h < 60) rgb = [c, x, 0];
  else if (h < 120) rgb = [x, c, 0];
  else if (h < 180) rgb = [0, c, x];
  else if (h < 240) rgb = [0, x, c];
  else if (h < 300) rgb = [x, 0, c];
  else rgb = [c, 0, x];
  return [(rgb[0] + m) * 255, (rgb[1] + m) * 255, (rgb[2] + m) * 255];
}

interface EyeDropperResult { sRGBHex: string }
interface EyeDropperCtor { new(): { open(): Promise<EyeDropperResult> } }
const eyeDropper: EyeDropperCtor | undefined =
  (window as unknown as { EyeDropper?: EyeDropperCtor }).EyeDropper;

/* ---------------- popover ---------------- */

export function ColorPickerPopover(props: {
  color: string;
  onChange: (hex: string) => void;
  onClose: () => void;
}) {
  const init = hexToRgb(props.color) ?? [95, 198, 232];
  const [hsv, setHsv] = useState<[number, number, number]>(() => rgbToHsv(...init));
  const [hexDraft, setHexDraft] = useState<string | null>(null);
  const svRef = useRef<HTMLDivElement>(null);
  const hueRef = useRef<HTMLDivElement>(null);

  const [h, s, v] = hsv;
  const rgb = hsvToRgb(h, s, v);
  const hex = rgbToHex(...rgb);
  const hueHex = rgbToHex(...hsvToRgb(h, 1, 1));

  const apply = (next: [number, number, number]) => {
    setHsv(next);
    props.onChange(rgbToHex(...hsvToRgb(...next)));
  };

  const setFromHex = (raw: string) => {
    const parsed = hexToRgb(raw.startsWith('#') ? raw : `#${raw}`);
    if (parsed) apply(rgbToHsv(...parsed));
  };

  const setChannel = (idx: number, val: number) => {
    const next: [number, number, number] = [rgb[0], rgb[1], rgb[2]];
    next[idx] = Math.min(255, Math.max(0, val));
    apply(rgbToHsv(...next));
  };

  /* drag helpers */
  const dragSv = (e: React.PointerEvent) => {
    const el = svRef.current;
    if (!el) return;
    const move = (clientX: number, clientY: number) => {
      const r = el.getBoundingClientRect();
      const ns = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
      const nv = 1 - Math.min(1, Math.max(0, (clientY - r.top) / r.height));
      apply([h, ns, nv]);
    };
    move(e.clientX, e.clientY);
    const onMove = (ev: PointerEvent) => move(ev.clientX, ev.clientY);
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const dragHue = (e: React.PointerEvent) => {
    const el = hueRef.current;
    if (!el) return;
    const move = (clientX: number) => {
      const r = el.getBoundingClientRect();
      const nh = Math.min(0.9999, Math.max(0, (clientX - r.left) / r.width)) * 360;
      apply([nh, s, v]);
    };
    move(e.clientX);
    const onMove = (ev: PointerEvent) => move(ev.clientX);
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  useEffect(() => {
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); props.onClose(); }
    };
    window.addEventListener('keydown', esc, true);
    return () => window.removeEventListener('keydown', esc, true);
  }, [props]);

  return (
    <div className="cpick" onPointerDown={e => e.stopPropagation()}>
      <div className="cpick-sv" ref={svRef} style={{ backgroundColor: hueHex }} onPointerDown={dragSv}>
        <div
          className="cpick-sv-thumb"
          style={{ left: `${s * 100}%`, top: `${(1 - v) * 100}%`, background: hex }}
        />
      </div>
      <div className="cpick-huerow">
        {eyeDropper ? (
          <button
            type="button" className="iconbtn cpick-eyedrop" title="Pick a color from the screen"
            onClick={() => {
              void new eyeDropper!().open()
                .then(res => setFromHex(res.sRGBHex))
                .catch(() => { /* user cancelled */ });
            }}
          ><Pipette size={13} strokeWidth={2.2} /></button>
        ) : null}
        <span className="cpick-preview" style={{ background: hex }} />
        <div className="cpick-hue" ref={hueRef} onPointerDown={dragHue}>
          <div className="cpick-hue-thumb" style={{ left: `${(h / 360) * 100}%` }} />
        </div>
      </div>
      <div className="cpick-inputs">
        <div className="cpick-field">
          <input
            value={hexDraft ?? hex}
            spellCheck={false}
            onChange={e => setHexDraft(e.target.value)}
            onBlur={e => { setFromHex(e.target.value); setHexDraft(null); }}
            onKeyDown={e => {
              if (e.key === 'Enter') { setFromHex((e.target as HTMLInputElement).value); setHexDraft(null); }
              e.stopPropagation();
            }}
          />
          <span>Hex</span>
        </div>
        {(['R', 'G', 'B'] as const).map((ch, i) => (
          <div className="cpick-field" key={ch}>
            <input
              value={Math.round(rgb[i])}
              inputMode="numeric"
              onChange={e => {
                const n = parseInt(e.target.value, 10);
                if (!Number.isNaN(n)) setChannel(i, n);
              }}
              onKeyDown={e => e.stopPropagation()}
            />
            <span>{ch}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
