/**
 * Cel materials. Every lit surface is a MeshToonMaterial on a hand-authored
 * ramp, with the toon BRDF patched so the shadow bands shift toward a cool
 * tint instead of just darkening. Ported from SADAK's fx/toon.ts, which adapts
 * sakura-crossing (https://github.com/Kenton-GMI/sakura-crossing), MIT
 * License, Copyright (c) 2026 Kenton Wang.
 */
import * as THREE from "three";

export type RampName = "two" | "three" | "four" | "soft";

const RAMPS: Record<RampName, number[]> = {
  two: [130, 255],
  three: [108, 186, 255],
  four: [116, 166, 214, 255],
  soft: [172, 214, 255],
};

const rampCache = new Map<RampName, THREE.DataTexture>();

export function gradientMap(name: RampName = "three"): THREE.DataTexture {
  const hit = rampCache.get(name);
  if (hit) return hit;
  const stops = RAMPS[name];
  const data = new Uint8Array(stops.length * 4);
  stops.forEach((v, i) => {
    data.set([v, v, v, 255], i * 4);
  });
  const tex = new THREE.DataTexture(data, stops.length, 1, THREE.RGBAFormat);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  rampCache.set(name, tex);
  return tex;
}

const TOON_CHUNK = "lights_toon_pars_fragment";
const TOON_LINE =
  "vec3 irradiance = getGradientIrradiance( geometryNormal, directLight.direction ) * directLight.color;";
const TOON_PATCH = `
	vec3 celBand = getGradientIrradiance( geometryNormal, directLight.direction );
	vec3 irradiance = celBand * mix( uShadowTint, vec3( 1.0 ), celBand ) * directLight.color;`;

let patched: string | null = null;
function toonChunk(): string {
  if (patched) return patched;
  const src = THREE.ShaderChunk[TOON_CHUNK as keyof typeof THREE.ShaderChunk] as string | undefined;
  if (!src || !src.includes(TOON_LINE)) {
    throw new Error(`[toon] three.js ${THREE.REVISION} changed ${TOON_CHUNK}; update TOON_LINE`);
  }
  patched = "uniform vec3 uShadowTint;\n" + src.replace(TOON_LINE, TOON_PATCH);
  return patched;
}

/** Shared by every cel material, so a time-of-day change retints the world at once. */
export const shadowTint = { value: new THREE.Color(0x7aa4b8) };

/** Night lighting: windows and lamps read their emissive maps through this. */
export const nightGlow = { value: 0 };

export type ToonOpts = {
  map?: THREE.Texture | null;
  emissiveMap?: THREE.Texture | null;
  /** Emissive colour that scales with nightGlow (lit windows, lamps). */
  glow?: THREE.ColorRepresentation;
  ramp?: RampName;
  side?: THREE.Side;
  vertexColors?: boolean;
  transparent?: boolean;
  opacity?: number;
  flat?: boolean;
  polygonOffset?: number;
  alphaTest?: number;
  /** Dither away within this many metres of the camera (foliage). */
  nearFade?: number;
};

export function toon(color: THREE.ColorRepresentation, o: ToonOpts = {}): THREE.MeshToonMaterial {
  const mat = new THREE.MeshToonMaterial({
    color,
    map: o.map ?? null,
    gradientMap: gradientMap(o.ramp ?? "three"),
    side: o.side ?? THREE.FrontSide,
    vertexColors: o.vertexColors ?? false,
    transparent: o.transparent ?? false,
    opacity: o.opacity ?? 1,
    alphaTest: o.alphaTest ?? 0,
  });
  if (o.polygonOffset) {
    mat.polygonOffset = true;
    mat.polygonOffsetFactor = -o.polygonOffset;
    mat.polygonOffsetUnits = -o.polygonOffset;
  }
  Object.assign(mat, { flatShading: o.flat ?? true });
  const glow = o.glow !== undefined ? new THREE.Color(o.glow) : null;
  if (glow) {
    mat.emissive = glow;
    mat.emissiveMap = o.emissiveMap ?? null;
  }
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uShadowTint = shadowTint;
    shader.fragmentShader = shader.fragmentShader.replace(`#include <${TOON_CHUNK}>`, toonChunk());
    if (glow) {
      shader.uniforms.uNightGlow = nightGlow;
      shader.fragmentShader = "uniform float uNightGlow;\n" + shader.fragmentShader.replace(
        "#include <emissivemap_fragment>",
        "#include <emissivemap_fragment>\n\ttotalEmissiveRadiance *= uNightGlow;"
      );
    }
  };
  const fade = o.nearFade ?? 0;
  if (fade) {
    const prev = mat.onBeforeCompile;
    mat.onBeforeCompile = (shader, r) => {
      prev.call(mat, shader, r);
      shader.vertexShader = "varying float vCamDist;\n" + shader.vertexShader.replace(
        "#include <project_vertex>",
        "#include <project_vertex>\n\tvCamDist = -mvPosition.z;"
      );
      shader.fragmentShader =
        "varying float vCamDist;\n" +
        shader.fragmentShader.replace(
          "void main() {",
          `void main() {
\tvec2 fq = floor( mod( gl_FragCoord.xy, 4.0 ) );
\tfloat th = ( fq.x * 4.0 + fq.y + 0.5 ) / 16.0;
\tif ( smoothstep( ${(fade * 0.45).toFixed(2)}, ${fade.toFixed(2)}, vCamDist ) < th ) discard;`
        );
    };
  }
  mat.customProgramCacheKey = () => (glow ? "celTintGlow" : "celTint") + (fade ? `fade${fade}` : "");
  return mat;
}

/** Unlit, for things that are their own light (sky props, lamp heads, water sparkle). */
export function flat(color: THREE.ColorRepresentation, o: { transparent?: boolean; opacity?: number; map?: THREE.Texture } = {}) {
  return new THREE.MeshBasicMaterial({
    color,
    transparent: o.transparent ?? false,
    opacity: o.opacity ?? 1,
    map: o.map ?? null,
  });
}
