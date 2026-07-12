/* GLSL für points / heightfield / scanlines. One über-shader pair:
   height displacement + every animation preset run in the vertex
   stage from a normalized loop phase (uPhase = t/duration * 2π), so
   frame N of a loop always matches frame 0 and exports are
   deterministic. Compiled twice via defines: IS_POINTS on/off. */

export const VERT = /* glsl */ `
attribute vec4 aColor;
attribute float aLum;
attribute float aHeight;
attribute float aRand;

uniform float uPhase;        // 0..2π over one loop
uniform float uHeightAmt;
uniform float uHeightMode;   // 0 forward, 1 backward, 2 both
uniform float uHeightOffset;
uniform float uSpread;
uniform vec2  uHalf;         // object half extents (world units)
uniform float uPreset;       // 0 none, 1 wave, 2 bend, 3 pulse, 4 separate,
                             // 5 twist, 6 collapse, 7 ripple, 8 scanline
uniform float uP[10];        // preset params
#ifdef IS_POINTS
uniform float uPointSize;
uniform float uSizeAtten;    // 1 = perspective size
uniform float uRefDist;      // camera→target distance for attenuation
uniform float uDpr;
#endif

varying vec4 vColor;
varying float vLum;
varying float vHeight;
varying float vRand;
varying float vViewZ;

const float TAU = 6.28318530718;

float hash1(float n){ return fract(sin(n * 127.1) * 43758.5453123); }
vec3 hash3(float n){
  return fract(sin(vec3(n * 127.1, n * 311.7, n * 74.7)) * 43758.5453123);
}
mat2 rot2(float a){ float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }

void main() {
  vColor = aColor;
  vLum = aLum;
  vHeight = aHeight;
  vRand = aRand;

  vec3 pos = position;
  pos.xy *= uSpread;

  /* ---- height displacement (GPU) ---- */
  float hSigned = uHeightMode < 0.5 ? aHeight
                : uHeightMode < 1.5 ? -aHeight
                : aHeight - 0.5;
  float amp = uHeightAmt;

  /* ---- depth pulse modulates the height amplitude ---- */
  if (uPreset > 2.5 && uPreset < 3.5) {
    // P0 min, P1 max, P2 speed, P3 delayByBrightness, P4 delayByPosition
    float lag = aLum * uP[3] * TAU + (uv.x + uv.y) * 0.5 * uP[4] * TAU;
    float m = 0.5 - 0.5 * cos(uPhase * uP[2] - lag);
    amp *= mix(uP[0], uP[1], m);
  }
  pos.z += hSigned * amp + uHeightOffset;

  /* ---- 1 sculptural wave ---- */
  if (uPreset > 0.5 && uPreset < 1.5) {
    // P0 strength, P1 directionRad, P2 frequency, P3 width, P4 sharpness, P5 speed
    vec2 dir = vec2(cos(uP[1]), sin(uP[1]));
    float d = dot(uv - 0.5, dir);
    float travel = d * uP[2] - uPhase * uP[5] / TAU;
    float s = sin(travel * TAU);
    float shaped = sign(s) * pow(abs(s), max(uP[4], 0.01));
    float f = fract(travel) - 0.5;
    float w = max(uP[3] * 0.5, 0.02);
    float envelope = exp(-(f * f) / (2.0 * w * w));
    pos.z += uP[0] * shaped * envelope;
  }

  /* ---- 2 rigid bend around an invisible cylinder ---- */
  if (uPreset > 1.5 && uPreset < 2.5) {
    // P0 axis (0 x → bends across x, 1 y), P1 amountRad, P2 radius, P3 center01, P4 speed
    float alongX = uP[0] < 0.5 ? 1.0 : 0.0;
    float extent = alongX > 0.5 ? uHalf.x : uHalf.y;
    float c = (alongX > 0.5 ? pos.x : pos.y) - (uP[3] * 2.0 - 1.0) * extent;
    float k = uP[1] * sin(uPhase * uP[4]) / max(uP[2], 0.05);
    if (abs(k) > 1e-4) {
      float phi = c * k;
      float nc = sin(phi) / k;
      float nz = (1.0 - cos(phi)) / k;
      if (alongX > 0.5) { pos.x = nc + (uP[3] * 2.0 - 1.0) * extent; }
      else { pos.y = nc + (uP[3] * 2.0 - 1.0) * extent; }
      pos.z += nz;
    }
  }

  /* ---- 4 particle separation ---- */
  if (uPreset > 3.5 && uPreset < 4.5) {
    // P0 amount, P1 randomness, P2 directionRad, P3 noiseScale, P4 returnStrength, P5 speed
    float env = pow(0.5 - 0.5 * cos(uPhase * uP[5]), max(uP[4], 0.1));
    vec3 cell = hash3(dot(floor(uv * max(uP[3], 0.5)), vec2(1.0, 57.0)) + 13.0);
    vec3 own = hash3(aRand * 1723.0 + 31.0);
    vec3 rnd = normalize(mix(cell, own, clamp(uP[1], 0.0, 1.0)) * 2.0 - 1.0 + 1e-4);
    vec3 bias = vec3(cos(uP[2]), sin(uP[2]), 0.6);
    vec3 dir = normalize(mix(bias, rnd, clamp(uP[1], 0.0, 1.0)));
    pos += dir * env * uP[0] * (0.35 + 0.65 * aRand);
  }

  /* ---- 5 twist around an axis ---- */
  if (uPreset > 4.5 && uPreset < 5.5) {
    // P0 axis (0 x,1 y,2 z), P1 amountRad, P2 center01, P3 falloff, P4 speed
    float a0 = uP[1] * sin(uPhase * uP[4]);
    if (uP[0] < 0.5) {           // around X: angle varies along x
      float d = pos.x / max(uHalf.x, 1e-4) * 0.5 + 0.5 - uP[2];
      float ang = a0 * sign(d) * pow(abs(d) * 2.0, max(uP[3], 0.05));
      pos.yz = rot2(ang) * pos.yz;
    } else if (uP[0] < 1.5) {    // around Y
      float d = pos.y / max(uHalf.y, 1e-4) * 0.5 + 0.5 - uP[2];
      float ang = a0 * sign(d) * pow(abs(d) * 2.0, max(uP[3], 0.05));
      pos.xz = rot2(ang) * pos.xz;
    } else {                     // around Z: angle varies with radius
      float d = length(pos.xy) / max(length(uHalf), 1e-4) - uP[2] * 0.5;
      float ang = a0 * sign(d) * pow(abs(d) * 2.0, max(uP[3], 0.05));
      pos.xy = rot2(ang) * pos.xy;
    }
  }

  /* ---- 6 directional collapse ---- */
  if (uPreset > 5.5 && uPreset < 6.5) {
    // P0 directionRad, P1 amount, P2 position01, P3 rotationRad, P4 softness, P5 speed
    float lag = aRand * uP[4] * TAU * 0.5;
    float env = (0.5 - 0.5 * cos(uPhase * uP[5] - lag)) * uP[1];
    vec2 dirN = vec2(cos(uP[0]), sin(uP[0]));
    float extent = abs(dirN.x) * uHalf.x + abs(dirN.y) * uHalf.y;
    float linePos = (uP[2] * 2.0 - 1.0) * extent;
    float d = dot(pos.xy, dirN) - linePos;
    pos.xy -= dirN * d * env;
    // roll around the collapse line while approaching it
    float a = dot(pos.xy, dirN) - linePos;
    vec2 az = rot2(uP[3] * env) * vec2(a, pos.z);
    pos.xy += dirN * (az.x - a);
    pos.z = az.y;
  }

  /* ---- 7 terrain ripple ---- */
  if (uPreset > 6.5 && uPreset < 7.5) {
    // P0 cx01, P1 cy01, P2 amplitude, P3 frequency, P4 decay, P5 speed
    vec2 cw = vec2((uP[0] * 2.0 - 1.0) * uHalf.x, (uP[1] * 2.0 - 1.0) * uHalf.y);
    float dw = length(pos.xy - cw);
    pos.z += uP[2] * sin(dw * uP[3] * TAU * 0.5 - uPhase * uP[5]) * exp(-dw * uP[4]);
  }

  /* ---- 8 scanline motion ---- */
  if (uPreset > 7.5 && uPreset < 8.5) {
    // P0 dir (0 horizontal rows, 1 vertical), P1 displacement, P2 delay(random stagger),
    // P3 frequency, P4 speed
    float rowCoord = uP[0] < 0.5 ? uv.y : uv.x;
    float lag = (hash1(rowCoord * 977.0) - 0.5) * uP[2] * TAU;
    pos.z += uP[1] * sin(rowCoord * uP[3] * TAU - uPhase * uP[4] - lag);
  }

  vec4 mv = modelViewMatrix * vec4(pos, 1.0);
  vViewZ = -mv.z;
  gl_Position = projectionMatrix * mv;

#ifdef IS_POINTS
  float atten = uSizeAtten > 0.5 ? clamp(uRefDist / max(vViewZ, 0.05), 0.05, 24.0) : 1.0;
  gl_PointSize = max(uPointSize * uDpr * atten, 0.5);
#endif
}
`;

export const FRAG = /* glsl */ `
precision highp float;

uniform float uOpacity;
uniform float uAlphaThresh;
uniform float uRemove;
uniform float uColorMode;    // 0 original 1 mono 2 duotone 3 gray 4 gradient 5 height 6 solid
uniform vec3 uMono;
uniform vec3 uDuoA;
uniform vec3 uDuoB;
uniform vec3 uGradA;
uniform vec3 uGradB;
uniform vec3 uSolid;
uniform float uBrightness;   // -1..1
uniform float uContrast;     // 0..3
uniform float uSaturation;   // 0..2
uniform float uGammaC;       // 0.2..3
uniform float uHue;          // radians
uniform float uQuantize;     // 0 = off, else levels
uniform float uDepthFade;    // 0..1
uniform vec2 uFadeRange;     // view-depth start/end
#ifdef IS_POINTS
uniform float uPointShape;   // 0 square 1 circle 2 soft 3 diamond
#endif

varying vec4 vColor;
varying float vLum;
varying float vHeight;
varying float vRand;
varying float vViewZ;

vec3 hueShift(vec3 c, float a) {
  const vec3 k = vec3(0.57735);
  float cosA = cos(a);
  return c * cosA + cross(k, c) * sin(a) + k * dot(k, c) * (1.0 - cosA);
}

void main() {
  if (vRand < uRemove) discard;
  if (vColor.a < uAlphaThresh) discard;

  float alpha = vColor.a * uOpacity;

#ifdef IS_POINTS
  vec2 pc = gl_PointCoord - 0.5;
  if (uPointShape > 0.5 && uPointShape < 1.5) {
    if (length(pc) > 0.5) discard;
  } else if (uPointShape > 1.5 && uPointShape < 2.5) {
    alpha *= smoothstep(0.5, 0.12, length(pc));
    if (alpha < 0.004) discard;
  } else if (uPointShape > 2.5) {
    if (abs(pc.x) + abs(pc.y) > 0.5) discard;
  }
#endif

  vec3 c;
  if (uColorMode < 0.5)      c = vColor.rgb;
  else if (uColorMode < 1.5) c = uMono * vLum;
  else if (uColorMode < 2.5) c = mix(uDuoA, uDuoB, vLum);
  else if (uColorMode < 3.5) c = vec3(vLum);
  else if (uColorMode < 4.5) c = mix(uGradA, uGradB, smoothstep(0.0, 1.0, vLum));
  else if (uColorMode < 5.5) c = mix(uGradA, uGradB, clamp(vHeight, 0.0, 1.0));
  else                       c = uSolid;

  if (abs(uHue) > 1e-4) c = hueShift(c, uHue);
  float g = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = mix(vec3(g), c, uSaturation);
  c = (c - 0.5) * uContrast + 0.5 + uBrightness;
  c = clamp(c, 0.0, 1.0);
  c = pow(c, vec3(1.0 / max(uGammaC, 0.05)));
  if (uQuantize > 0.5) {
    float q = max(uQuantize, 2.0);
    c = floor(c * (q - 0.001)) / (q - 1.0);
  }

  if (uDepthFade > 0.001) {
    float f = smoothstep(uFadeRange.x, uFadeRange.y, vViewZ);
    alpha *= 1.0 - uDepthFade * f;
    if (alpha < 0.004) discard;
  }

  gl_FragColor = vec4(c, alpha);
}
`;
