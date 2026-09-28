/**
 * Lifts the static world onto the terrain in the vertex shader: every
 * vertex of a displaced mesh moves up by the baked heightfield at its world
 * x, z. Buildings stand on level pads, so they move up as rigid blocks; the
 * ground and roads are subdivided finely enough to bend with the slope.
 *
 * The shadow pass gets the same lift (a displaced depth material), and the
 * meshes skip frustum culling, since their bounding spheres are the
 * unlifted ones.
 */
import * as THREE from "three";
import { terrainTexture } from "./terrain";

let uniforms: {
  uTerrain: { value: THREE.DataTexture };
  uTerrainMin: { value: THREE.Vector2 };
  uTerrainCell: { value: number };
  uTerrainSize: { value: THREE.Vector2 };
} | null = null;

function terrainUniforms() {
  const t = terrainTexture();
  if (!uniforms) {
    uniforms = { uTerrain: { value: t.tex }, uTerrainMin: { value: t.min }, uTerrainCell: { value: t.cell }, uTerrainSize: { value: t.size } };
  } else {
    // Rebaked (a new map): same uniform objects, new values.
    uniforms.uTerrain.value = t.tex;
    uniforms.uTerrainMin.value = t.min;
    uniforms.uTerrainCell.value = t.cell;
    uniforms.uTerrainSize.value = t.size;
  }
  return uniforms;
}

const GLSL_HEAD = /* glsl */ `
uniform sampler2D uTerrain;
uniform vec2 uTerrainMin;
uniform float uTerrainCell;
uniform vec2 uTerrainSize;
float terrainAt( vec2 p ) {
  vec2 g = clamp( ( p - uTerrainMin ) / uTerrainCell, vec2( 0.0 ), uTerrainSize - 1.001 );
  ivec2 i = ivec2( floor( g ) );
  vec2 f = g - vec2( i );
  float a = texelFetch( uTerrain, i, 0 ).r;
  float b = texelFetch( uTerrain, i + ivec2( 1, 0 ), 0 ).r;
  float c = texelFetch( uTerrain, i + ivec2( 0, 1 ), 0 ).r;
  float d = texelFetch( uTerrain, i + ivec2( 1, 1 ), 0 ).r;
  return mix( mix( a, b, f.x ), mix( c, d, f.x ), f.y );
}
`;

// After project_vertex: find this vertex's world x, z and lift it in view space.
const GLSL_LIFT = /* glsl */ `
#include <project_vertex>
vec4 tWorld = vec4( transformed, 1.0 );
#ifdef USE_INSTANCING
tWorld = instanceMatrix * tWorld;
#endif
tWorld = modelMatrix * tWorld;
float tLift = terrainAt( tWorld.xz );
mvPosition += viewMatrix * vec4( 0.0, tLift, 0.0, 0.0 );
gl_Position = projectionMatrix * mvPosition;
`;

// Shadow receiving and anything else that reads the world position.
const GLSL_WORLDPOS = /* glsl */ `
#include <worldpos_vertex>
#if defined( USE_ENVMAP ) || defined( DISTANCE ) || defined ( USE_SHADOWMAP ) || defined ( USE_TRANSMISSION ) || NUM_SPOT_LIGHT_COORDS > 0
worldPosition.y += tLift;
#endif
`;

const patched = new WeakSet<THREE.Material>();

export function displaceMaterial(mat: THREE.Material) {
  if (patched.has(mat)) return;
  patched.add(mat);
  const u = terrainUniforms();
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (shader, r) => {
    prev.call(mat, shader, r);
    Object.assign(shader.uniforms, u);
    shader.vertexShader = GLSL_HEAD + shader.vertexShader.replace("#include <project_vertex>", GLSL_LIFT).replace("#include <worldpos_vertex>", GLSL_WORLDPOS);
  };
  const key = mat.customProgramCacheKey.bind(mat);
  mat.customProgramCacheKey = () => `${key()}|terrain`;
  mat.needsUpdate = true;
}

let depthMat: THREE.MeshDepthMaterial | null = null;

/** Displaces every mesh under `root` (its materials, its shadow). */
export function displaceTree(root: THREE.Object3D) {
  if (!depthMat) {
    depthMat = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
    displaceMaterial(depthMat);
  }
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    // Water keeps its own level (the sea is at 0 whatever the land does).
    if (!m.isMesh || m.userData.fixedHeight) return;
    for (const mat of Array.isArray(m.material) ? m.material : [m.material]) {
      if (mat instanceof THREE.ShaderMaterial) throw new Error(`[displace] ${m.name || "a mesh"} uses a ShaderMaterial; lift it on the CPU instead`);
      displaceMaterial(mat);
    }
    m.customDepthMaterial = depthMat!;
    m.frustumCulled = false;
  });
}
