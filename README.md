# PIXELFORM — image sculptor

A focused browser tool that turns pasted or imported images into animated
3D heightfields and pixel sculptures: recognizable images rebuilt from
colored points, real depth driven by image information, sculptural looping
motion, and frame-accurate exports. Everything runs locally in the browser —
no backend, no cloud processing, no CDN dependencies.

## Run

```bash
npm install
npm run dev
```

Then open http://localhost:5173.

## Workflow

Everything lives in one right-hand sidebar with a vertical icon rail
(image · geometry · height · animation · appearance · camera & frame ·
export):

1. **Paste** (Ctrl/⌘+V), drop or import a PNG / JPEG / WebP (alpha supported).
2. Pick a **geometry style** — point cloud, grid heightfield or scanlines.
3. Adjust the **height** (source, amount, direction, contrast…).
4. Pick an **animation preset** and fine-tune a handful of controls.
5. Frame the shot in the **Camera tab**: render **ratio + resolution**,
   black-by-default background (solid/gradient/transparent) and a
   **passepartout** slider that dims the viewport outside the frame.
6. Optionally **keyframe** any live control: click the ◇ next to a slider —
   the property gets a track in the timeline, dragging the slider auto-keys
   at the playhead, diamonds are draggable (frame-snapped) and each segment
   has easing (linear, ease in/out/in-out, hold). Tracks wrap around the
   loop end, so keyframed loops stay seamless.
7. **Preview the loop** in the timeline (scrubbing supported).
8. **Export** — PNG/JPEG/WebP stills, WebM video, PNG sequence (zip), or MP4
   where the browser encoder supports it. Keyframes are evaluated
   deterministically per exported frame.

## Highlights

- **GPU-driven motion** — one über-shader displaces every point/vertex from a
  normalized loop phase, so the first and final frames always match and
  exports are deterministic frame-by-frame renders (never screen recordings).
- **Eight animation presets** — sculptural wave, rigid bend, depth pulse,
  particle separation, twist, directional collapse, terrain ripple and
  scanline motion, plus loop-safe global rotation and camera sway.
- **Eight height sources** — luminance (±), RGB channels, alpha, Sobel edges
  and radial gradient, with contrast/gamma/blur/clamp processing.
- **Keyframe tracks with easing** — any uniform-driven control (depth,
  animation parameters, appearance, object transform, perspective) can be
  keyed; tracks appear as rows in a Sonitus-style timeline with a label
  column, per-second ruler and draggable diamond keys.
- **Local persistence** — settings auto-save to localStorage, the last image
  is restored from IndexedDB, and projects can be exported/imported as JSON
  (images are not embedded; reimport after loading a project).
- **Undo/redo** with slider-drag coalescing, and shortcuts:
  Space (play/pause) · F (fit) · R (reset camera) · Ctrl/⌘+Z / +Shift+Z · Esc.

## Stack

React + Vite + TypeScript + Three.js (WebGL2, custom GLSL), WebCodecs +
webm-muxer / mp4-muxer for video export, fflate for PNG-sequence zips,
lucide-react icons and locally bundled DM Sans / JetBrains Mono fonts.
