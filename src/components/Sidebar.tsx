/* The single right sidebar: a Sonitus-style vertical icon rail (lucide,
   bundled locally) switching seven tabbed panels — image, geometry,
   height, animation, appearance, camera/frame, export. The active tab
   is remembered across sessions. */

import { useState, useSyncExternalStore } from 'react';
import {
  Image as ImageIcon, LayoutGrid, Mountain, Waves, Palette, Video, Download,
  ImagePlus, Trash2, Camera, Film, XCircle, Move3d,
} from 'lucide-react';
import { store, useSettings } from '../state/store';
import { useSourceImage } from '../hooks/useSourceImage';
import { openFilePicker } from '../image/importers';
import { clearSourceImage } from '../image/source';
import { engine } from '../engine/Engine';
import { startingPresets } from '../state/presets';
import {
  exportStill, exportAnimation, cancelExport, onExportState, getExportState,
} from '../engine/exporter';
import {
  Section, SliderRow, SelectRow, SegRow, ToggleRow, ColorRow, NumberRow,
  PlainSelect, NumField, Label,
} from './ui/controls';
import { toast } from './ui/toast';

/* ---------------- tabs ---------------- */

type TabId = 'image' | 'geometry' | 'height' | 'animation' | 'appearance' | 'object' | 'camera' | 'export';

const TABS: Array<{ id: TabId; label: string; icon: typeof ImageIcon }> = [
  { id: 'image', label: 'Source image', icon: ImageIcon },
  { id: 'geometry', label: 'Geometry', icon: LayoutGrid },
  { id: 'height', label: 'Height', icon: Mountain },
  { id: 'animation', label: 'Animation', icon: Waves },
  { id: 'appearance', label: 'Appearance', icon: Palette },
  { id: 'object', label: 'Object', icon: Move3d },
  { id: 'camera', label: 'Camera & frame', icon: Video },
  { id: 'export', label: 'Export', icon: Download },
];

const TAB_KEY = 'pixelform:tab:v1';

export function useExportState() {
  return useSyncExternalStore(onExportState, getExportState);
}

/* ---------------- frame ratio helpers ---------------- */

const RATIOS: Array<{ id: string; label: string; r: number }> = [
  { id: '1:1', label: '1 : 1 — square', r: 1 },
  { id: '4:5', label: '4 : 5 — portrait', r: 4 / 5 },
  { id: '2:3', label: '2 : 3 — portrait', r: 2 / 3 },
  { id: '9:16', label: '9 : 16 — story', r: 9 / 16 },
  { id: '3:2', label: '3 : 2 — landscape', r: 3 / 2 },
  { id: '16:9', label: '16 : 9 — wide', r: 16 / 9 },
  { id: '21:9', label: '21 : 9 — cinema', r: 21 / 9 },
];

const even = (n: number) => Math.max(16, Math.round(n / 2) * 2);

function currentRatioId(w: number, h: number): string {
  const r = w / Math.max(1, h);
  const hit = RATIOS.find(x => Math.abs(x.r - r) < 0.005);
  return hit ? hit.id : 'custom';
}

/* ---------------- component ---------------- */

export function Sidebar() {
  const s = useSettings();
  const img = useSourceImage();
  const ex = useExportState();
  const [tab, setTab] = useState<TabId>(() => {
    const saved = localStorage.getItem(TAB_KEY) as TabId | null;
    return saved && TABS.some(t => t.id === saved) ? saved : 'image';
  });

  const pickTab = (id: TabId) => {
    setTab(id);
    try { localStorage.setItem(TAB_KEY, id); } catch { /* ignore */ }
  };

  return (
    <aside className="sidebar sidebar--right">
      <nav className="side-rail">
        {TABS.map(t => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              className={`rail-btn${tab === t.id ? ' active' : ''}`}
              title={t.label}
              onClick={() => pickTab(t.id)}
            >
              <Icon size={15} strokeWidth={2.2} />
            </button>
          );
        })}
      </nav>
      {/* plain function calls (not JSX components): a fresh component
          identity every render would remount the subtree and reset
          collapse state / input focus */}
      <div className="side-panel">
        {tab === 'image' ? ImageTab() : null}
        {tab === 'geometry' ? <GeometrySections /> : null}
        {tab === 'height' ? HeightTab() : null}
        {tab === 'animation' ? <AnimationSections /> : null}
        {tab === 'appearance' ? AppearanceTab() : null}
        {tab === 'object' ? ObjectTab() : null}
        {tab === 'camera' ? CameraTab() : null}
        {tab === 'export' ? ExportTab({ img: !!img, ex }) : null}
      </div>
    </aside>
  );

  function ImageTab() {
    return (
      <Section title="Source image" dotColor="var(--sq-blue)">
        {img ? (
          <>
            <div className="imgfield">
              <img className="imgfield-thumb" src={img.url} alt="" />
              <span className="imgfield-name">
                <b>{img.name}</b>
                {img.width} × {img.height}{img.hasAlpha ? ' · alpha' : ''}
              </span>
            </div>
            <div className="inline-pair">
              <button className="btn btn--sm" onClick={openFilePicker}
                title="Replace the image — all settings are kept" style={{ justifyContent: 'center' }}>
                <ImagePlus size={12} strokeWidth={2.5} /> Replace
              </button>
              <button className="btn btn--sm" style={{ justifyContent: 'center' }}
                title="Remove the image" onClick={clearSourceImage}>
                <Trash2 size={12} strokeWidth={2.5} /> Remove
              </button>
            </div>
            <p className="import-meta">Replacing keeps every setting.</p>
          </>
        ) : (
          <>
            <button className="btn btn--teal btn--sm" style={{ justifyContent: 'center' }} onClick={openFilePicker}>
              <ImagePlus size={12} strokeWidth={2.5} /> Import image
            </button>
            <p className="import-meta">Or paste (<b>Ctrl/⌘+V</b>) · drop a file<br />PNG · JPEG · WebP</p>
          </>
        )}
      </Section>
    );
  }

  function HeightTab() {
    return (
      <Section title="Height" dotColor="var(--sq-coral)">
        <SelectRow label="Source" path="height.source"
          tooltip="Which image information drives the depth"
          options={[
            { value: 'luminance', label: 'Luminance' },
            { value: 'inv-luminance', label: 'Inverted luminance' },
            { value: 'red', label: 'Red channel' },
            { value: 'green', label: 'Green channel' },
            { value: 'blue', label: 'Blue channel' },
            { value: 'alpha', label: 'Alpha' },
            { value: 'edge', label: 'Edge detection' },
            { value: 'radial', label: 'Radial gradient' },
          ]} />
        <SliderRow label="Amount" path="height.amount" min={0} max={3} step={0.01}
          tooltip="Depth strength — the core control" />
        <SegRow label="Direction" path="height.direction"
          tooltip="Push depth forward, backward or both ways"
          options={[
            { value: 'forward', label: 'Forward' },
            { value: 'backward', label: 'Backward' },
            { value: 'both', label: 'Both' },
          ]} />
        <SliderRow label="Offset" path="height.offset" min={-1.5} max={1.5} step={0.01} />
        <SliderRow label="Contrast" path="height.contrast" min={0.2} max={3} step={0.01} />
        <SliderRow label="Gamma" path="height.gamma" min={0.2} max={3} step={0.01} />
        <SliderRow label="Blur" path="height.blur" min={0} max={8} step={1}
          tooltip="Smooths the height map before displacement" />
        <ToggleRow label="Invert" path="height.invert" />
        <SliderRow label="Clamp low" path="height.clampLo" min={0} max={1} step={0.01}
          tooltip="Depth values below this are clipped" />
        <SliderRow label="Clamp high" path="height.clampHi" min={0} max={1} step={0.01}
          tooltip="Depth values above this are clipped" />
      </Section>
    );
  }

  function AppearanceTab() {
    return (
      <Section title="Appearance" dotColor="var(--sq-ink)">
        <SelectRow label="Colors" path="appearance.colorMode"
          options={[
            { value: 'original', label: 'Original image colors' },
            { value: 'monochrome', label: 'Monochrome' },
            { value: 'duotone', label: 'Duotone' },
            { value: 'grayscale', label: 'Grayscale' },
            { value: 'gradient', label: 'Gradient map' },
            { value: 'height', label: 'Height-based' },
            { value: 'solid', label: 'Solid color' },
          ]} />
        {s.appearance.colorMode === 'monochrome' ? (
          <ColorRow label="Tint" path="appearance.monoColor" />
        ) : null}
        {s.appearance.colorMode === 'duotone' ? (
          <>
            <ColorRow label="Shadows" path="appearance.duotoneA" />
            <ColorRow label="Highlights" path="appearance.duotoneB" />
          </>
        ) : null}
        {s.appearance.colorMode === 'gradient' || s.appearance.colorMode === 'height' ? (
          <>
            <ColorRow label={s.appearance.colorMode === 'height' ? 'Low' : 'Dark'} path="appearance.gradientA" />
            <ColorRow label={s.appearance.colorMode === 'height' ? 'High' : 'Bright'} path="appearance.gradientB" />
          </>
        ) : null}
        {s.appearance.colorMode === 'solid' ? (
          <ColorRow label="Color" path="appearance.solidColor" />
        ) : null}
        <SliderRow label="Brightness" path="appearance.brightness" min={-1} max={1} step={0.01} />
        <SliderRow label="Contrast" path="appearance.contrast" min={0} max={3} step={0.01} />
        <SliderRow label="Saturation" path="appearance.saturation" min={0} max={2} step={0.01} />
        <SliderRow label="Gamma" path="appearance.gamma" min={0.2} max={3} step={0.01} />
        <SliderRow label="Hue shift" path="appearance.hueShift" min={-180} max={180} step={1} unit="°" />
        <SliderRow label="Quantize" path="appearance.quantize" min={0} max={16} step={1}
          tooltip="Reduce colors to N levels per channel (0 = off)" />
        <SliderRow label="Depth fade" path="appearance.depthFade" min={0} max={1} step={0.01}
          tooltip="Fade far parts of the sculpture" />
      </Section>
    );
  }

  function ObjectTab() {
    return (
      <Section title="Object" dotColor="var(--sq-ink)">
        <SliderRow label="Scale" path="scene.scale" min={0.2} max={3} step={0.01} />
        <SliderRow label="Position X" path="scene.posX" min={-3} max={3} step={0.01} />
        <SliderRow label="Position Y" path="scene.posY" min={-3} max={3} step={0.01} />
        <SliderRow label="Position Z" path="scene.posZ" min={-3} max={3} step={0.01} />
        <SliderRow label="X rotation" path="scene.rotX" min={-180} max={180} step={1} unit="°" />
        <SliderRow label="Y rotation" path="scene.rotY" min={-180} max={180} step={1} unit="°" />
        <SliderRow label="Z rotation" path="scene.rotZ" min={-180} max={180} step={1} unit="°" />
      </Section>
    );
  }

  function CameraTab() {
    const ratioId = currentRatioId(s.export.width, s.export.height);
    return (
      <>
        <Section title="Frame" dotColor="var(--sq-blue)">
          <PlainSelect
            label="Ratio"
            tooltip="Aspect ratio of the rendered frame"
            value={ratioId}
            options={[
              ...RATIOS.map(r => ({ value: r.id, label: r.label })),
              { value: 'custom', label: 'Custom' },
            ]}
            onChange={id => {
              const r = RATIOS.find(x => x.id === id);
              if (r) {
                store.patch({ 'export.height': even(s.export.width / r.r) });
              }
            }}
          />
          <div className="inline-field">
            <Label text="Resolution" tooltip="Rendered output size in pixels" />
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <NumField
                value={s.export.width} min={16} max={7680} step={2}
                title="Frame width in pixels"
                onChange={w => {
                  const r = RATIOS.find(x => x.id === ratioId);
                  if (r) store.patch({ 'export.width': even(w), 'export.height': even(w / r.r) });
                  else store.set('export.width', even(w));
                }}
              />
              <span className="control-unit">×</span>
              <NumField
                value={s.export.height} min={16} max={7680} step={2}
                title={ratioId === 'custom' ? 'Frame height in pixels' : 'Height follows the selected ratio — pick Custom to edit freely'}
                disabled={ratioId !== 'custom'}
                onChange={h => store.set('export.height', even(h))}
              />
            </span>
          </div>
          <ToggleRow label="Show frame" path="viewport.showFrame"
            tooltip="Shows the exact render crop in the viewport" />
          <SliderRow label="Passepartout" path="viewport.passepartout" min={0} max={1} step={0.01}
            tooltip="Dims the viewport outside the render frame"
            disabled={!s.viewport.showFrame} disabledReason="Enable the frame first" />
        </Section>

        <Section title="Background" dotColor="var(--sq-peach)">
          <SegRow label="Type" path="background.type"
            tooltip="Black by default — used in renders too"
            options={[
              { value: 'solid', label: 'Solid' },
              { value: 'vgradient', label: 'V-Grad' },
              { value: 'rgradient', label: 'R-Grad' },
              { value: 'transparent', label: 'None' },
            ]} />
          {s.background.type !== 'transparent' ? (
            <ColorRow label={s.background.type === 'solid' ? 'Color' : 'Outer color'} path="background.colorA" />
          ) : null}
          {s.background.type === 'vgradient' || s.background.type === 'rgradient' ? (
            <ColorRow label="Inner color" path="background.colorB" />
          ) : null}
        </Section>

        <Section title="Camera" dotColor="var(--sq-coral)">
          <SegRow label="Projection" path="camera.projection"
            options={[
              { value: 'perspective', label: 'Perspective' },
              { value: 'orthographic', label: 'Orthographic' },
            ]} />
          <SliderRow label="Perspective strength" path="scene.fov" min={15} max={100} step={1} unit="°"
            tooltip="Camera field of view"
            disabled={s.camera.projection === 'orthographic'}
            disabledReason="Only affects the perspective camera" />
          <div className="inline-pair">
            <button className="btn btn--sm" style={{ justifyContent: 'center' }}
              onClick={() => engine.resetCamera()}>
              <Camera size={12} strokeWidth={2.5} /> Reset
            </button>
            <button className="btn btn--sm" style={{ justifyContent: 'center' }}
              onClick={() => engine.fitToView()} disabled={!img}>
              Fit view
            </button>
          </div>
        </Section>

        <Section title="Helpers (never rendered)" dotColor="var(--sq-blue)" defaultOpen={false}>
          <ToggleRow label="Grid" path="viewport.showGrid" />
          <ToggleRow label="Axes" path="viewport.showAxes" />
          <ToggleRow label="Bounding box" path="viewport.showBox" />
        </Section>
      </>
    );
  }

  function ExportTab(props: { img: boolean; ex: ReturnType<typeof getExportState> }) {
    const noVideoAlpha = s.export.animFormat === 'webm' || s.export.animFormat === 'mp4';
    return (
      <Section title="Export" dotColor="var(--sq-coral)">
        <p className="export-note">
          Frame: <b>{s.export.width} × {s.export.height}</b> — set ratio &amp; resolution
          in the Camera tab.
        </p>
        <div className="control">
          <div className="control-head">
            <span className="control-label" title="Export file name (without extension)">File name</span>
          </div>
          <input
            className="colorfield-hexinput"
            style={{ letterSpacing: '.02em' }}
            value={s.export.fileName}
            spellCheck={false}
            onChange={e => store.set('export.fileName', e.target.value.replace(/[^\w.-]+/g, '-'))}
            onKeyDown={e => e.stopPropagation()}
          />
        </div>

        <div className="side-subhead">Still image</div>
        <SegRow label="Format" path="export.stillFormat"
          options={[
            { value: 'png', label: 'PNG' },
            { value: 'jpeg', label: 'JPEG' },
            { value: 'webp', label: 'WebP' },
          ]} />
        <ToggleRow label="Transparent background" path="export.transparent"
          disabled={s.export.stillFormat === 'jpeg' && s.export.animFormat !== 'png-seq'}
          disabledReason="JPEG has no alpha channel — use PNG or WebP"
          tooltip="Renders without a background (PNG/WebP stills, PNG sequences)" />
        <button className="btn btn--sm" style={{ justifyContent: 'center' }}
          disabled={!props.img || props.ex.active}
          title={props.img ? 'Render the current frame at export size' : 'Import an image first'}
          onClick={() => void exportStill(store.get())}>
          <ImageIcon size={12} strokeWidth={2.5} /> Export still
        </button>

        <div className="side-subhead">Animation</div>
        <SegRow label="Format" path="export.animFormat"
          options={[
            { value: 'webm', label: 'WebM' },
            { value: 'png-seq', label: 'PNG seq' },
            { value: 'mp4', label: 'MP4' },
          ]} />
        <div className="inline-pair">
          <NumberRow label="FPS" path="export.fps" min={1} max={60} step={1} />
          <NumberRow label="Seconds" path="export.duration" min={1} max={60} step={1} />
        </div>
        <SliderRow label="Quality" path="export.quality" min={0.3} max={1} step={0.01}
          tooltip="Image quality / video bitrate" />
        {noVideoAlpha && s.export.transparent ? (
          <div className="warnbox">
            <span>
              Browser video encoders have no alpha channel — the {s.export.animFormat.toUpperCase()} export
              uses the scene background. For transparency, export a PNG sequence.
            </span>
          </div>
        ) : null}
        <button className="btn btn--sm" style={{ justifyContent: 'center' }}
          disabled={!props.img || props.ex.active}
          title={props.img ? 'Render the loop frame by frame' : 'Import an image first'}
          onClick={() => void exportAnimation(store.get())}>
          <Film size={12} strokeWidth={2.5} /> Export animation
        </button>
        <p className="export-note">
          Animations render <b>frame by frame</b> with deterministic loop time —
          the last frame leads straight back into the first.
        </p>

        {props.ex.active ? (
          <div className="export-progress">
            <div className="export-progress-head">
              <span className="export-progress-label"><span className="pulse" /> {props.ex.label}</span>
              <button className="iconbtn" title="Cancel export" onClick={cancelExport}>
                <XCircle size={13} strokeWidth={2.4} />
              </button>
            </div>
            <div className="progress-track">
              <div className="progress-fill" style={{ width: `${props.ex.total ? (props.ex.frame / props.ex.total) * 100 : 0}%` }} />
            </div>
            <p className="export-note">Frame <b>{props.ex.frame}</b> / {props.ex.total}</p>
          </div>
        ) : null}
        {props.ex.doneMessage && !props.ex.active ? (
          <p className="export-note"><b>{props.ex.doneMessage}</b></p>
        ) : null}
        {props.ex.error && !props.ex.active ? (
          <div className="warnbox"><span>{props.ex.error}</span></div>
        ) : null}
      </Section>
    );
  }
}

/* ---------------- geometry (extracted for readability) ---------------- */

const QUALITY_VALUES: Record<string, { density: number; resolution: number }> = {
  draft: { density: 96, resolution: 128 },
  medium: { density: 200, resolution: 256 },
  high: { density: 340, resolution: 420 },
};

const COUNT_WARN = 450_000;

function useStats() {
  return useSyncExternalStore(
    (fn) => engine.onStats(fn),
    () => engine.getStats(),
  );
}

function GeometrySections() {
  const s = useSettings();
  const img = useSourceImage();
  const stats = useStats();
  const mode = s.geometry.mode;

  const derivedQuality = (() => {
    for (const [q, v] of Object.entries(QUALITY_VALUES)) {
      if (s.geometry.points.density === v.density && s.geometry.grid.resolution === v.resolution) return q;
    }
    return 'custom';
  })();

  const setQuality = (q: string) => {
    if (q === 'custom') { store.set('geometry.quality', 'custom'); return; }
    const v = QUALITY_VALUES[q];
    store.patch({
      'geometry.quality': q,
      'geometry.points.density': v.density,
      'geometry.grid.resolution': v.resolution,
    });
  };

  return (
    <Section title="Geometry" dotColor="var(--sq-peach)">
      <SelectRow
        label="Style" path="geometry.mode"
        tooltip="How the image is rebuilt in 3D"
        options={[
          { value: 'points', label: 'Point cloud' },
          { value: 'heightfield', label: 'Grid heightfield' },
          { value: 'scanlines', label: 'Scanlines' },
        ]}
      />
      <div className="control">
        <div className="control-head">
          <span className="control-label" title="Sampling resolution presets">Quality</span>
        </div>
        <div className="seg">
          {['draft', 'medium', 'high', 'custom'].map(q => (
            <button key={q} type="button"
              className={derivedQuality === q ? 'active' : ''}
              onClick={() => setQuality(q)}
              disabled={q === 'custom'}
              title={q === 'custom' ? 'Set automatically when you adjust density/resolution manually' : `${QUALITY_VALUES[q]?.density ?? ''} samples`}
            >{q}</button>
          ))}
        </div>
      </div>

      {mode === 'points' ? (
        <>
          <SliderRow label="Density" path="geometry.points.density" min={24} max={640} step={4}
            tooltip="Samples along the larger image side" />
          <SliderRow label="Point size" path="geometry.points.size" min={0.5} max={14} step={0.1} unit="px" />
          <SelectRow label="Point shape" path="geometry.points.shape"
            options={[
              { value: 'square', label: 'Square' },
              { value: 'circle', label: 'Circle' },
              { value: 'soft', label: 'Soft circle' },
              { value: 'diamond', label: 'Diamond' },
            ]} />
          <SliderRow label="Spacing" path="geometry.points.spread" min={0.5} max={2.5} step={0.01}
            tooltip="Spreads points apart without changing their size" />
          <SliderRow label="Opacity" path="geometry.points.opacity" min={0} max={1} step={0.01} />
          <SliderRow label="Alpha threshold" path="geometry.points.alphaThreshold" min={0} max={1} step={0.01}
            tooltip="Hide points whose source alpha is below this" />
          <SliderRow label="Random removal" path="geometry.points.removal" min={0} max={0.95} step={0.01}
            tooltip="Randomly hides a fraction of the points" />
          <ToggleRow label="Perspective size" path="geometry.points.perspectiveSize"
            tooltip="Points get smaller with distance" />
        </>
      ) : null}

      {mode === 'heightfield' ? (
        <>
          <SliderRow label="Resolution" path="geometry.grid.resolution" min={32} max={640} step={4}
            tooltip="Grid vertices along the larger image side" />
          <SegRow label="Surface" path="geometry.grid.render"
            options={[
              { value: 'fill', label: 'Filled' },
              { value: 'wire', label: 'Wire' },
              { value: 'points-surface', label: 'Pts+Surf' },
            ]} />
          <SliderRow label="Smoothing" path="geometry.grid.smoothing" min={0} max={8} step={1}
            tooltip="Extra blur applied to the surface height" />
          <SliderRow label="Surface opacity" path="geometry.grid.opacity" min={0} max={1} step={0.01} />
          {s.geometry.grid.render === 'points-surface' ? (
            <SliderRow label="Point size" path="geometry.points.size" min={0.5} max={14} step={0.1} unit="px" />
          ) : null}
        </>
      ) : null}

      {mode === 'scanlines' ? (
        <>
          <SegRow label="Direction" path="geometry.scan.orientation"
            options={[
              { value: 'horizontal', label: 'Horizontal' },
              { value: 'vertical', label: 'Vertical' },
            ]} />
          <SliderRow label="Density" path="geometry.points.density" min={24} max={640} step={4}
            tooltip="Sampling resolution before rows are taken" />
          <SliderRow label="Line spacing" path="geometry.scan.lineSpacing" min={1} max={16} step={1}
            tooltip="Keep every Nth row" />
          <SliderRow label="Line thickness" path="geometry.scan.thickness" min={0.5} max={12} step={0.1} unit="px" />
          <SliderRow label="Point spacing" path="geometry.scan.pointSpacing" min={1} max={8} step={1}
            tooltip="Keep every Nth sample along a row" />
        </>
      ) : null}

      {img && stats.count > 0 ? (
        <p className="import-meta">
          <b>{stats.count.toLocaleString()}</b> {mode === 'heightfield' ? 'vertices' : 'points'} · {stats.cols}×{stats.rows}
        </p>
      ) : null}
      {stats.count > COUNT_WARN ? (
        <div className="warnbox">
          <span>
            High element count ({stats.count.toLocaleString()}). Playback may slow down
            on weaker GPUs — exports still render at full quality.
          </span>
        </div>
      ) : null}
    </Section>
  );
}

/* ---------------- animation (extracted for readability) ---------------- */

function AnimationSections() {
  const s = useSettings();
  const preset = s.animation.preset;

  const applyStartingPreset = (id: string) => {
    const p = startingPresets.find(x => x.id === id);
    if (!p) return;
    store.patch(p.patch);
    toast(`Preset: ${p.label}`);
  };

  return (
    <Section title="Animation" dotColor="var(--sq-blue)">
      <SelectRow label="Preset" path="animation.preset"
        tooltip="The main sculptural motion"
        options={[
          { value: 'none', label: 'None (static)' },
          { value: 'wave', label: 'Sculptural wave' },
          { value: 'bend', label: 'Rigid bend' },
          { value: 'pulse', label: 'Depth pulse' },
          { value: 'separate', label: 'Particle separation' },
          { value: 'twist', label: 'Twist' },
          { value: 'collapse', label: 'Directional collapse' },
          { value: 'ripple', label: 'Terrain ripple' },
          { value: 'scanline', label: 'Scanline motion' },
        ]} />

      {preset === 'wave' ? (
        <>
          <SliderRow label="Strength" path="animation.wave.strength" min={0} max={1.5} step={0.01} />
          <SliderRow label="Direction" path="animation.wave.direction" min={0} max={360} step={1} unit="°" />
          <SliderRow label="Frequency" path="animation.wave.frequency" min={0.25} max={6} step={0.05} />
          <SliderRow label="Wave width" path="animation.wave.width" min={0.05} max={1} step={0.01} />
          <SliderRow label="Sharpness" path="animation.wave.sharpness" min={0.2} max={4} step={0.05} />
          <SliderRow label="Speed" path="animation.wave.speed" min={1} max={4} step={1}
            tooltip="Wave cycles per loop (whole numbers keep the loop seamless)" />
        </>
      ) : null}

      {preset === 'bend' ? (
        <>
          <SegRow label="Bend axis" path="animation.bend.axis"
            options={[{ value: 'x', label: 'X' }, { value: 'y', label: 'Y' }]} />
          <SliderRow label="Amount" path="animation.bend.amount" min={0} max={180} step={1} unit="°" />
          <SliderRow label="Radius" path="animation.bend.radius" min={0.2} max={4} step={0.01} />
          <SliderRow label="Center" path="animation.bend.center" min={0} max={1} step={0.01} />
          <SliderRow label="Speed" path="animation.bend.speed" min={1} max={4} step={1}
            tooltip="Bend cycles per loop" />
        </>
      ) : null}

      {preset === 'pulse' ? (
        <>
          <SliderRow label="Min depth" path="animation.pulse.minDepth" min={0} max={2} step={0.01} />
          <SliderRow label="Max depth" path="animation.pulse.maxDepth" min={0} max={3} step={0.01} />
          <SliderRow label="Delay by brightness" path="animation.pulse.delayBrightness" min={0} max={1} step={0.01}
            tooltip="Bright pixels pulse later" />
          <SliderRow label="Delay by position" path="animation.pulse.delayPosition" min={0} max={1} step={0.01} />
          <SliderRow label="Speed" path="animation.pulse.speed" min={1} max={4} step={1} />
        </>
      ) : null}

      {preset === 'separate' ? (
        <>
          <SliderRow label="Amount" path="animation.separate.amount" min={0} max={3} step={0.01} />
          <SliderRow label="Randomness" path="animation.separate.randomness" min={0} max={1} step={0.01} />
          <SliderRow label="Direction" path="animation.separate.direction" min={0} max={360} step={1} unit="°" />
          <SliderRow label="Noise scale" path="animation.separate.noiseScale" min={0.5} max={20} step={0.5}
            tooltip="Size of the drift clusters" />
          <SliderRow label="Return strength" path="animation.separate.returnStrength" min={0.2} max={5} step={0.05}
            tooltip="How sharply points snap back to the image" />
          <SliderRow label="Speed" path="animation.separate.speed" min={1} max={4} step={1} />
        </>
      ) : null}

      {preset === 'twist' ? (
        <>
          <SegRow label="Axis" path="animation.twist.axis"
            options={[{ value: 'x', label: 'X' }, { value: 'y', label: 'Y' }, { value: 'z', label: 'Z' }]} />
          <SliderRow label="Amount" path="animation.twist.amount" min={0} max={360} step={1} unit="°" />
          <SliderRow label="Center" path="animation.twist.center" min={0} max={1} step={0.01} />
          <SliderRow label="Falloff" path="animation.twist.falloff" min={0.2} max={4} step={0.05} />
          <SliderRow label="Speed" path="animation.twist.speed" min={1} max={4} step={1} />
        </>
      ) : null}

      {preset === 'collapse' ? (
        <>
          <SliderRow label="Direction" path="animation.collapse.direction" min={0} max={360} step={1} unit="°"
            tooltip="0° collapses toward a vertical line, 90° toward a horizontal one" />
          <SliderRow label="Amount" path="animation.collapse.amount" min={0} max={1} step={0.01} />
          <SliderRow label="Position" path="animation.collapse.position" min={0} max={1} step={0.01}
            tooltip="Where the collapse line sits" />
          <SliderRow label="Rotation" path="animation.collapse.rotation" min={0} max={360} step={1} unit="°"
            tooltip="Points roll around the line while collapsing" />
          <SliderRow label="Softness" path="animation.collapse.softness" min={0} max={1} step={0.01}
            tooltip="Staggers points so the collapse feels organic" />
          <SliderRow label="Speed" path="animation.collapse.speed" min={1} max={4} step={1} />
        </>
      ) : null}

      {preset === 'ripple' ? (
        <>
          <SliderRow label="Center X" path="animation.ripple.centerX" min={0} max={1} step={0.01} />
          <SliderRow label="Center Y" path="animation.ripple.centerY" min={0} max={1} step={0.01} />
          <SliderRow label="Amplitude" path="animation.ripple.amplitude" min={0} max={1.5} step={0.01} />
          <SliderRow label="Frequency" path="animation.ripple.frequency" min={0.5} max={10} step={0.1} />
          <SliderRow label="Decay" path="animation.ripple.decay" min={0} max={4} step={0.05}
            tooltip="How quickly the waves fade with distance" />
          <SliderRow label="Speed" path="animation.ripple.speed" min={1} max={6} step={1} />
        </>
      ) : null}

      {preset === 'scanline' ? (
        <>
          <SegRow label="Direction" path="animation.scanline.direction"
            options={[
              { value: 'horizontal', label: 'Rows' },
              { value: 'vertical', label: 'Columns' },
            ]} />
          <SliderRow label="Displacement" path="animation.scanline.displacement" min={0} max={1.5} step={0.01} />
          <SliderRow label="Delay" path="animation.scanline.delay" min={0} max={2} step={0.01}
            tooltip="Random per-row stagger" />
          <SliderRow label="Frequency" path="animation.scanline.frequency" min={0} max={8} step={0.1}
            tooltip="Ordered wave cycles across the rows" />
          <SliderRow label="Speed" path="animation.scanline.speed" min={1} max={4} step={1} />
        </>
      ) : null}

      <div className="side-subhead">Starting points</div>
      <div className="matpresets">
        {startingPresets.map(p => (
          <button key={p.id} className="matpreset" type="button"
            style={{ ['--c' as never]: p.dot }}
            onClick={() => applyStartingPreset(p.id)}
            title="Applies a full set of editable settings">
            <span className="dot" />{p.label}
          </button>
        ))}
      </div>

      <div className="side-subhead">Global movement</div>
      <SliderRow label="X rotation" path="animation.global.rotX" min={-2} max={2} step={1}
        tooltip="Full turns per loop — whole numbers keep loops seamless" />
      <SliderRow label="Y rotation" path="animation.global.rotY" min={-2} max={2} step={1}
        tooltip="Full turns per loop" />
      <SliderRow label="Z rotation" path="animation.global.rotZ" min={-2} max={2} step={1}
        tooltip="Full turns per loop" />
      <ToggleRow label="Camera orbit" path="animation.global.orbit"
        tooltip="Gentle side-to-side sway, always loop-safe" />
      <SliderRow label="Orbit strength" path="animation.global.orbitStrength" min={0} max={1} step={0.01}
        disabled={!s.animation.global.orbit} disabledReason="Enable camera orbit first" />
    </Section>
  );
}
