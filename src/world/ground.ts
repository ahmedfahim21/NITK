/**
 * Land, land use, the sea and the shore.
 */
import * as THREE from "three";
import { centroid, orientedBox, polylineLength, type Pt } from "../geo";
import type { AreaKind, CampusMap } from "../osm/types";
import { toon } from "../fx/toon";
import type { Preset } from "../fx/presets";

const AREA_COLOUR: Record<AreaKind, number> = {
  campus: 0x9dbb63,
  residential: 0xadb070,
  commercial: 0xc0b793,
  grass: 0x8cc257,
  park: 0x86be52,
  garden: 0x7fbb4e,
  forest: 0x66a047,
  scrub: 0x8aa655,
  farmland: 0xb5cf68,
  wetland: 0x7da77c,
  water: 0x3f8fbf,
  pool: 0x4fc0de,
  sand: 0xecd9a8,
  rock: 0xa0664c,
  pitch: 0x6fb44d,
  track: 0xb9573d,
  parking: 0x9c9c98,
  plaza: 0xd3c9b5,
  dirt: 0xb98a5e,
};

/** Draw order: later kinds sit on top. */
const AREA_LAYER: Record<AreaKind, number> = {
  campus: 0,
  residential: 0,
  commercial: 1,
  farmland: 1,
  dirt: 1,
  grass: 2,
  park: 2,
  garden: 3,
  scrub: 2,
  forest: 3,
  wetland: 3,
  sand: 4,
  rock: 4,
  track: 5,
  pitch: 6,
  parking: 5,
  plaza: 5,
  water: 7,
  pool: 8,
};

const COURT_SPORTS = /basketball|volleyball|tennis|badminton|netball|multi|handball|skating/;

/** Triangulated flat polygon at height y, facing up. */
export function flatPolygon(outer: Pt[], holes: Pt[][], y: number): THREE.BufferGeometry | null {
  if (outer.length < 3) return null;
  const contour = outer.map((p) => new THREE.Vector2(p[0], p[1]));
  const hs = holes.filter((h) => h.length >= 3).map((h) => h.map((p) => new THREE.Vector2(p[0], p[1])));
  let tris: number[][];
  try {
    tris = THREE.ShapeUtils.triangulateShape(contour, hs);
  } catch {
    return null;
  }
  if (!tris.length) return null;
  const all = [...contour, ...hs.flat()];
  const pos = new Float32Array(all.length * 3);
  all.forEach((v, i) => pos.set([v.x, y, v.y], i * 3));
  const idx: number[] = [];
  for (const t of tris) {
    const [a, b, c] = t;
    // Face +y: (b-a) x (c-a) has y = dz1*dx2 - dx1*dz2, which must be positive.
    const cross = (all[b].x - all[a].x) * (all[c].y - all[a].y) - (all[b].y - all[a].y) * (all[c].x - all[a].x);
    if (cross < 0) idx.push(a, b, c);
    else idx.push(a, c, b);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setIndex(idx);
  const n = new Float32Array(all.length * 3);
  for (let i = 0; i < all.length; i++) n[i * 3 + 1] = 1;
  g.setAttribute("normal", new THREE.BufferAttribute(n, 3));
  return g;
}

function paint(g: THREE.BufferGeometry, colour: THREE.Color) {
  const n = g.attributes.position.count;
  const c = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) c.set([colour.r, colour.g, colour.b], i * 3);
  g.setAttribute("color", new THREE.BufferAttribute(c, 3));
}

function merge(geos: THREE.BufferGeometry[]): THREE.BufferGeometry {
  // Manual merge keeps it independent of BufferGeometryUtils attribute rules.
  let vCount = 0;
  let iCount = 0;
  for (const g of geos) {
    vCount += g.attributes.position.count;
    iCount += g.index ? g.index.count : g.attributes.position.count;
  }
  const pos = new Float32Array(vCount * 3);
  const nor = new Float32Array(vCount * 3);
  const col = new Float32Array(vCount * 3);
  const idx = new Uint32Array(iCount);
  let vo = 0;
  let io = 0;
  for (const g of geos) {
    pos.set(g.attributes.position.array as Float32Array, vo * 3);
    nor.set(g.attributes.normal.array as Float32Array, vo * 3);
    if (g.attributes.color) col.set(g.attributes.color.array as Float32Array, vo * 3);
    const n = g.attributes.position.count;
    if (g.index) {
      const src = g.index.array;
      for (let i = 0; i < src.length; i++) idx[io + i] = src[i] + vo;
      io += src.length;
    } else {
      for (let i = 0; i < n; i++) idx[io + i] = vo + i;
      io += n;
    }
    vo += n;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  out.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
  out.setAttribute("color", new THREE.BufferAttribute(col, 3));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  out.computeBoundingSphere();
  return out;
}

/** A ribbon along a polyline, from offset a to offset b (metres, left positive). */
export function ribbon(pts: Pt[], a: number, b: number, y: number, uScale = 0): THREE.BufferGeometry {
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  let dist = 0;
  for (let i = 0; i < pts.length; i++) {
    const prev = pts[Math.max(0, i - 1)];
    const next = pts[Math.min(pts.length - 1, i + 1)];
    let dx = next[0] - prev[0];
    let dz = next[1] - prev[1];
    const l = Math.hypot(dx, dz) || 1;
    dx /= l;
    dz /= l;
    // Left of travel in (x, z-south) is (dz, -dx).
    const nx = dz;
    const nz = -dx;
    if (i > 0) dist += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    pos.push(pts[i][0] + nx * a, y, pts[i][1] + nz * a, pts[i][0] + nx * b, y, pts[i][1] + nz * b);
    const u = uScale ? dist / uScale : dist;
    uv.push(u, 0, u, 1);
    if (i > 0) {
      const k = (i - 1) * 2;
      idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  // Fix winding per quad so every face points up.
  const p = g.attributes.position.array as Float32Array;
  const ix = g.index!.array as Uint16Array | Uint32Array;
  for (let t = 0; t < ix.length; t += 3) {
    const [i0, i1, i2] = [ix[t], ix[t + 1], ix[t + 2]];
    const ax = p[i1 * 3] - p[i0 * 3];
    const az = p[i1 * 3 + 2] - p[i0 * 3 + 2];
    const bx = p[i2 * 3] - p[i0 * 3];
    const bz = p[i2 * 3 + 2] - p[i0 * 3 + 2];
    if (ax * bz - az * bx > 0) {
      ix[t + 1] = i2;
      ix[t + 2] = i1;
    }
  }
  const n = new Float32Array(pos.length);
  for (let i = 1; i < n.length; i += 3) n[i] = 1;
  g.setAttribute("normal", new THREE.BufferAttribute(n, 3));
  return g;
}

export type GroundRig = {
  group: THREE.Group;
  seaUniforms: { uTime: { value: number }; uDeep: { value: THREE.Color }; uShallow: { value: THREE.Color }; uFoam: { value: THREE.Color } };
  apply(p: Preset): void;
  update(t: number): void;
};

export function buildGround(map: CampusMap): GroundRig {
  const group = new THREE.Group();
  group.name = "ground";

  /* ---- land ---- */
  const landGeos: THREE.BufferGeometry[] = [];
  for (const l of map.land) {
    const g = flatPolygon(l, [], 0);
    if (g) {
      paint(g, new THREE.Color(0xa6b56c));
      landGeos.push(g);
    }
  }

  /* ---- land use, layered ---- */
  const sorted = [...map.areas].sort((a, b) => AREA_LAYER[a.kind] - AREA_LAYER[b.kind]);
  for (const a of sorted) {
    const y = 0.02 + AREA_LAYER[a.kind] * 0.012;
    const g = flatPolygon(a.outer, a.holes, y);
    if (!g) continue;
    let c = AREA_COLOUR[a.kind];
    if (a.kind === "pitch" && a.sport && COURT_SPORTS.test(a.sport)) c = a.sport.includes("tennis") ? 0x3f7f9f : 0xb8603f;
    if (a.kind === "pitch" && a.sport === "cricket") c = 0x78b84f;
    paint(g, new THREE.Color(c));
    landGeos.push(g);
  }

  /* ---- beach: a sand strip up from the waterline, under any mapped beach ---- */
  for (const line of map.coast) {
    const g = ribbon(line, 0, 26, 0.035);
    g.deleteAttribute("uv");
    paint(g, new THREE.Color(0xe9d6a2));
    landGeos.push(g);
    const wet = ribbon(line, -0.5, 4, 0.04);
    wet.deleteAttribute("uv");
    paint(wet, new THREE.Color(0xcdb989));
    landGeos.push(wet);
  }

  const groundMat = toon(0xffffff, { vertexColors: true, ramp: "three" });
  const landMesh = new THREE.Mesh(merge(landGeos), groundMat);
  landMesh.receiveShadow = true;
  landMesh.name = "land";
  group.add(landMesh);

  /* ---- pitch markings ---- */
  const lineGeos: THREE.BufferGeometry[] = [];
  for (const a of map.areas) {
    if (a.kind !== "pitch" && a.kind !== "track") continue;
    const box = orientedBox(a.outer);
    if (box.len < 8 || box.wid < 5) continue;
    const c = Math.cos(box.angle);
    const s = Math.sin(box.angle);
    const at = (u: number, v: number): Pt => [box.cx + u * c - v * s, box.cz + u * s + v * c];
    const y = 0.02 + AREA_LAYER[a.kind] * 0.012 + 0.006;
    const inset = a.kind === "track" ? 1.5 : 1;
    const hl = box.len / 2 - inset;
    const hw = box.wid / 2 - inset;
    const loop: Pt[] = [at(-hl, -hw), at(hl, -hw), at(hl, hw), at(-hl, hw), at(-hl, -hw)];
    if (a.kind === "track") {
      // Lane lines round a stadium oval.
      for (let lane = 0; lane < 6; lane++) {
        const r = box.wid / 2 - 1 - lane * 1.2;
        const straight = box.len / 2 - box.wid / 2;
        const oval: Pt[] = [];
        for (let k = 0; k <= 48; k++) {
          const t = (k / 48) * Math.PI * 2;
          const side = Math.cos(t) >= 0 ? 1 : -1;
          oval.push(at(side * straight + Math.cos(t) * r, Math.sin(t) * r));
        }
        lineGeos.push(ribbon(oval, -0.06, 0.06, y));
      }
      continue;
    }
    lineGeos.push(ribbon(loop, -0.08, 0.08, y));
    lineGeos.push(ribbon([at(0, -hw), at(0, hw)], -0.08, 0.08, y));
    if (a.sport === "cricket") {
      const strip = flatPolygon([at(-10, -1.5), at(10, -1.5), at(10, 1.5), at(-10, 1.5)], [], y);
      if (strip) {
        paint(strip, new THREE.Color(0xc9a66b));
        lineGeos.push(strip);
      }
    }
  }
  for (const g of lineGeos) if (!g.attributes.color) paint(g, new THREE.Color(0xf4f4ee));
  lineGeos.forEach((g) => g.deleteAttribute("uv"));
  if (lineGeos.length) {
    const lines = new THREE.Mesh(merge(lineGeos), toon(0xffffff, { vertexColors: true, ramp: "soft" }));
    lines.receiveShadow = true;
    group.add(lines);
  }

  /* ---- sea ---- */
  const seaUniforms = {
    uTime: { value: 0 },
    uDeep: { value: new THREE.Color(0x1f6d9e) },
    uShallow: { value: new THREE.Color(0x45b8bf) },
    uFoam: { value: new THREE.Color(0xffffff) },
    uLine: { value: coastLine(map) },
  };
  const seaGeos: THREE.BufferGeometry[] = [];
  for (const s of map.sea) {
    const g = flatPolygon(s, [], -0.12);
    if (g) seaGeos.push(g);
  }
  if (seaGeos.length) {
    seaGeos.forEach((g) => paint(g, new THREE.Color(1, 1, 1)));
    const seaMat = new THREE.ShaderMaterial({
      uniforms: seaUniforms,
      vertexShader: /* glsl */ `
        varying vec3 vWorld;
        void main() {
          vec4 w = modelMatrix * vec4( position, 1.0 );
          vWorld = w.xyz;
          gl_Position = projectionMatrix * viewMatrix * w;
        }`,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        uniform vec3 uDeep, uShallow, uFoam;
        uniform vec3 uLine;
        varying vec3 vWorld;
        void main() {
          // Distance out to sea from the fitted shoreline.
          float d = abs( uLine.x * vWorld.x + uLine.y * vWorld.z + uLine.z );
          float shallow = 1.0 - smoothstep( 20.0, 180.0, d );
          // Quantise to three cel bands of water colour.
          shallow = floor( shallow * 3.0 + 0.5 ) / 3.0;
          vec3 c = mix( uDeep, uShallow, shallow );
          // Swell lines rolling in.
          float swell = sin( d * 0.09 + uTime * 1.3 + sin( vWorld.x * 0.013 + vWorld.z * 0.02 ) * 2.0 );
          c = mix( c, uFoam, step( 0.965, swell ) * ( 1.0 - smoothstep( 60.0, 420.0, d ) ) * 0.55 );
          // Breakers near the beach.
          float br = sin( d * 0.35 - uTime * 2.2 + sin( vWorld.z * 0.05 ) );
          c = mix( c, uFoam, step( 0.8, br ) * ( 1.0 - smoothstep( 6.0, 45.0, d ) ) * 0.85 );
          // Glints.
          float g = fract( sin( dot( floor( vWorld.xz * 0.35 ), vec2( 12.9898, 78.233 ) ) ) * 43758.5453 );
          c += step( 0.992, g ) * step( 0.5, sin( uTime * 3.0 + g * 40.0 ) ) * 0.25;
          gl_FragColor = vec4( c, 1.0 );
        }`,
    });
    const sea = new THREE.Mesh(merge(seaGeos), seaMat);
    sea.name = "sea";
    group.add(sea);
  }

  /* ---- surf line along the true coast ---- */
  const foamMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { uTime: seaUniforms.uTime, uFoam: seaUniforms.uFoam },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 ); }`,
    fragmentShader: /* glsl */ `
      uniform float uTime; uniform vec3 uFoam; varying vec2 vUv;
      void main() {
        float wash = 0.5 + 0.5 * sin( uTime * 0.9 + vUv.x * 0.08 );
        float edge = step( vUv.y, 0.35 + wash * 0.5 );
        float lace = step( 0.45, fract( vUv.x * 0.25 + sin( vUv.x * 0.7 + uTime ) * 0.2 ) );
        float a = edge * ( 0.55 + 0.35 * lace ) * ( 1.0 - vUv.y * 0.6 );
        if ( a < 0.05 ) discard;
        gl_FragColor = vec4( uFoam, a );
      }`,
  });
  for (const line of map.coast) {
    if (polylineLength(line) < 10) continue;
    const g = ribbon(line, 0.2, -9, -0.06);
    const f = new THREE.Mesh(g, foamMat);
    f.renderOrder = 1;
    group.add(f);
  }

  return {
    group,
    seaUniforms,
    apply(p) {
      seaUniforms.uDeep.value.set(p.sea.deep);
      seaUniforms.uShallow.value.set(p.sea.shallow);
      seaUniforms.uFoam.value.set(p.sea.foam);
    },
    update(t) {
      seaUniforms.uTime.value = t;
    },
  };
}

/** Least-squares line through the coast, as (a, b, c) with a*x + b*z + c = 0 and |(a,b)| = 1. */
function coastLine(map: CampusMap): THREE.Vector3 {
  const pts = map.coast.flat();
  if (pts.length < 2) return new THREE.Vector3(1, 0, 1e5);
  const [mx, mz] = centroid(pts);
  let sxx = 0;
  let szz = 0;
  let sxz = 0;
  for (const [x, z] of pts) {
    sxx += (x - mx) ** 2;
    szz += (z - mz) ** 2;
    sxz += (x - mx) * (z - mz);
  }
  // Direction of the principal axis.
  const ang = 0.5 * Math.atan2(2 * sxz, sxx - szz);
  const dx = Math.cos(ang);
  const dz = Math.sin(ang);
  const a = -dz;
  const b = dx;
  return new THREE.Vector3(a, b, -(a * mx + b * mz));
}
