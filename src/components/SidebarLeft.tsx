/* Left sidebar: source image, geometry, height, appearance. */

import { useSyncExternalStore } from 'react';
import { ImagePlus, Trash2 } from 'lucide-react';
import { store, useSettings } from '../state/store';
import { useSourceImage } from '../hooks/useSourceImage';
import { openFilePicker } from '../image/importers';
import { clearSourceImage } from '../image/source';
import { engine } from '../engine/Engine';
import {
  Section, SliderRow, SelectRow, SegRow, ToggleRow, ColorRow,
} from './ui/controls';

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

export function SidebarLeft() {
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
    <aside className="sidebar sidebar--left">
      <div className="side-panel">
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

        <Section title="Appearance" dotColor="var(--sq-ink)" defaultOpen={false}>
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
      </div>
    </aside>
  );
}
