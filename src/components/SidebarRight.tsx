/* Right sidebar: animation preset & controls, camera/scene, export. */

import { useSyncExternalStore } from 'react';
import { Camera, Image as ImageIcon, Film, XCircle } from 'lucide-react';
import { store, useSettings } from '../state/store';
import { useSourceImage } from '../hooks/useSourceImage';
import { engine } from '../engine/Engine';
import { startingPresets } from '../state/presets';
import {
  exportStill, exportAnimation, cancelExport, onExportState, getExportState,
} from '../engine/exporter';
import {
  Section, SliderRow, SelectRow, SegRow, ToggleRow, ColorRow, NumberRow, PlainSelect,
} from './ui/controls';
import { toast } from './ui/toast';

const SIZE_PRESETS = [
  { label: '1080 × 1080', w: 1080, h: 1080 },
  { label: '1080 × 1350', w: 1080, h: 1350 },
  { label: '1080 × 1920', w: 1080, h: 1920 },
  { label: '1920 × 1080', w: 1920, h: 1080 },
  { label: '3840 × 2160', w: 3840, h: 2160 },
];

export function useExportState() {
  return useSyncExternalStore(onExportState, getExportState);
}

export function SidebarRight() {
  const s = useSettings();
  const img = useSourceImage();
  const ex = useExportState();
  const preset = s.animation.preset;

  const sizePresetValue = (() => {
    const hit = SIZE_PRESETS.find(p => p.w === s.export.width && p.h === s.export.height);
    return hit ? hit.label : 'Custom';
  })();

  const applyStartingPreset = (id: string) => {
    const p = startingPresets.find(x => x.id === id);
    if (!p) return;
    store.patch(p.patch);
    toast(`Preset: ${p.label}`);
  };

  const noVideoAlpha = s.export.animFormat === 'webm' || s.export.animFormat === 'mp4';

  return (
    <aside className="sidebar sidebar--right">
      <div className="side-panel">
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

        <Section title="Camera & scene" dotColor="var(--sq-peach)" defaultOpen={false}>
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
          <div className="side-subhead">Object</div>
          <SliderRow label="Scale" path="scene.scale" min={0.2} max={3} step={0.01} />
          <SliderRow label="Position X" path="scene.posX" min={-3} max={3} step={0.01} />
          <SliderRow label="Position Y" path="scene.posY" min={-3} max={3} step={0.01} />
          <SliderRow label="Position Z" path="scene.posZ" min={-3} max={3} step={0.01} />
          <SliderRow label="X rotation" path="scene.rotX" min={-180} max={180} step={1} unit="°" />
          <SliderRow label="Y rotation" path="scene.rotY" min={-180} max={180} step={1} unit="°" />
          <SliderRow label="Z rotation" path="scene.rotZ" min={-180} max={180} step={1} unit="°" />
          <div className="side-subhead">Background</div>
          <SegRow label="Type" path="background.type"
            options={[
              { value: 'transparent', label: 'None' },
              { value: 'solid', label: 'Solid' },
              { value: 'vgradient', label: 'V-Grad' },
              { value: 'rgradient', label: 'R-Grad' },
            ]} />
          {s.background.type !== 'transparent' ? (
            <ColorRow label={s.background.type === 'solid' ? 'Color' : 'Outer color'} path="background.colorA" />
          ) : null}
          {s.background.type === 'vgradient' || s.background.type === 'rgradient' ? (
            <ColorRow label="Inner color" path="background.colorB" />
          ) : null}
          <div className="side-subhead">Helpers (never exported)</div>
          <ToggleRow label="Grid" path="viewport.showGrid" />
          <ToggleRow label="Axes" path="viewport.showAxes" />
          <ToggleRow label="Bounding box" path="viewport.showBox" />
          <ToggleRow label="Export frame" path="viewport.showFrame"
            tooltip="Shows the exact export crop in the viewport" />
        </Section>

        <Section title="Export" dotColor="var(--sq-coral)">
          <PlainSelect
            label="Size" value={sizePresetValue}
            tooltip="Output resolution"
            options={[
              ...SIZE_PRESETS.map(p => ({ value: p.label, label: p.label })),
              { value: 'Custom', label: 'Custom' },
            ]}
            onChange={(label) => {
              const p = SIZE_PRESETS.find(x => x.label === label);
              if (p) store.patch({ 'export.width': p.w, 'export.height': p.h });
            }}
          />
          <div className="inline-pair">
            <NumberRow label="Width" path="export.width" min={16} max={7680} step={2} />
            <NumberRow label="Height" path="export.height" min={16} max={7680} step={2} />
          </div>
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
          <button className="btn btn--teal btn--sm" style={{ justifyContent: 'center' }}
            disabled={!img || ex.active}
            title={img ? 'Render the current frame at export size' : 'Import an image first'}
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
          <button className="btn btn--cyan btn--sm" style={{ justifyContent: 'center' }}
            disabled={!img || ex.active}
            title={img ? 'Render the loop frame by frame' : 'Import an image first'}
            onClick={() => void exportAnimation(store.get())}>
            <Film size={12} strokeWidth={2.5} /> Export animation
          </button>
          <p className="export-note">
            Animations render <b>frame by frame</b> with deterministic loop time —
            the last frame leads straight back into the first.
          </p>

          {ex.active ? (
            <div className="export-progress">
              <div className="export-progress-head">
                <span className="export-progress-label"><span className="pulse" /> {ex.label}</span>
                <button className="iconbtn" title="Cancel export" onClick={cancelExport}>
                  <XCircle size={13} strokeWidth={2.4} />
                </button>
              </div>
              <div className="progress-track">
                <div className="progress-fill" style={{ width: `${ex.total ? (ex.frame / ex.total) * 100 : 0}%` }} />
              </div>
              <p className="export-note">Frame <b>{ex.frame}</b> / {ex.total}</p>
            </div>
          ) : null}
          {ex.doneMessage && !ex.active ? (
            <p className="export-note"><b>{ex.doneMessage}</b></p>
          ) : null}
          {ex.error && !ex.active ? (
            <div className="warnbox"><span>{ex.error}</span></div>
          ) : null}
        </Section>
      </div>
    </aside>
  );
}
