/**
 * Land, land use, the sea and the shore.
 */
import * as THREE from "three";
import { centroid, orientedBox, polylineLength, type Pt } from "../geo";
import type { AreaKind, CampusMap } from "../osm/types";
import { toon } from "../fx/toon";
import type { Preset } from "../fx/presets";
import { pointIn, type Region } from "./region";
import { groundHeight, inCut } from "./terrain";

/** Points every `step` metres or closer along a polyline. */
export function resample(pts: Pt[], step: number): Pt[] {
  const out: Pt[] = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const [a, b] = [pts[i - 1], pts[i]];
    const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / step));
    for (let k = 1; k <= n; k++) out.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n]);
  }
  return out;
}

/** The runs of a polyline that lie inside the region. */
export function insideRuns(pts: Pt[], region: Region): Pt[][] {
  const runs: Pt[][] = [];
  let run: Pt[] = [];
  for (const p of pts) {
    if (region.contains(p[0], p[1])) run.push(p);
    else if (run.length) {
      runs.push(run);
      run = [];
    }
  }
  if (run.length) runs.push(run);
  return runs;
}

const AREA_COLOUR: Record<AreaKind, number> = {
  campus: 0x86a95a,
  residential: 0xadb070,
  commercial: 0xc0b793,
  grass: 0x74a44c,
  park: 0x70a24a,
  garden: 0x6c9f47,
  forest: 0x5a8f42,
  scrub: 0x869c55,
  farmland: 0xb5cf68,
  wetland: 0x7da77c,
  water: 0x3f8fbf,
  pool: 0x4fc0de,
  sand: 0xecd9a8,
  rock: 0xa0664c,
  pitch: 0x64a046,
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

/** Kinds drawn as their own flat, crisp-edged polygons over the land (each stands on a level pad). */
const OVERLAY = new Set<AreaKind>(["pitch", "track", "parking", "plaza", "water", "pool"]);

/** Land use that greens up in the monsoon and yellows in summer. */
const VEGETATED = new Set<AreaKind>(["campus", "residential", "grass", "park", "garden", "forest", "scrub", "farmland", "wetland", "pitch"]);

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
  /** Season: tint the land (lush monsoon green .. dry summer straw) and roughen the sea. */
  setSeason(grass: [number, number, number], sea: number): void;
  seaUniforms: { uTime: { value: number }; uDeep: { value: THREE.Color }; uShallow: { value: THREE.Color }; uFoam: { value: THREE.Color } };
  apply(p: Preset): void;
  update(t: number): void;
};

export function buildGround(map: CampusMap, region: Region): GroundRig {
  const group = new THREE.Group();
  group.name = "ground";
  const landGeos: THREE.BufferGeometry[] = [];
  const plainGeos: THREE.BufferGeometry[] = [];

  /* ---- land: one lattice over the region that follows the terrain ---- */
  // Coloured per vertex by the land use under it, top kind winning. The
  // crisp-edged kinds (grounds, courts, car parks, water) are overlays below.
  const layered = map.areas.filter((a) => !OVERLAY.has(a.kind)).sort((p, q) => AREA_LAYER[p.kind] - AREA_LAYER[q.kind]);
  const boxes = layered.map((a) => {
    const xs = a.outer.map((p) => p[0]);
    const zs = a.outer.map((p) => p[1]);
    return { a, x0: Math.min(...xs), x1: Math.max(...xs), z0: Math.min(...zs), z1: Math.max(...zs) };
  });
  const kindAt = (x: number, z: number): AreaKind | null => {
    for (let i = boxes.length - 1; i >= 0; i--) {
      const bx = boxes[i];
      if (x < bx.x0 || x > bx.x1 || z < bx.z0 || z > bx.z1) continue;
      if (pointIn(x, z, bx.a.outer) && !bx.a.holes.some((h) => pointIn(x, z, h))) return bx.a.kind;
    }
    return null;
  };
  const LAND = 0x8fa762;
  const rb = region.bounds;
  const lattice = (
    step: number,
    keep: (cx: number, cz: number) => boolean,
    colour: (x: number, z: number) => number,
    green: (x: number, z: number) => boolean,
    y: number,
    x0 = rb.minX,
    z0 = rb.minZ,
    x1 = rb.maxX,
    z1 = rb.maxZ,
    fine?: (cx: number, cz: number) => boolean,
    terrainSplit = false
  ) => {
    const x0Lat = x0;
    const z0Lat = z0;
    const cols = Math.ceil((x1 - x0) / step) + 1;
    const rows = Math.ceil((z1 - z0) / step) + 1;
    const vx = (c: number) => x0 + c * step;
    const vz = (r: number) => z0 + r * step;
    // Where the 2 m heightfield bends faster than a 4 m quad's two triangles can follow
    // (pad edges, steep blends), split the quad so the ground mesh and groundHeight agree.
    const level: number[] = new Array((rows - 1) * (cols - 1)).fill(1);
    if (terrainSplit) {
      for (let r = 0; r < rows - 1; r++) {
        for (let c = 0; c < cols - 1; c++) {
          const qx = vx(c);
          const qz = vz(r);
          if (!keep(qx + step / 2, qz + step / 2)) continue;
          const h00 = groundHeight(qx, qz);
          const h10 = groundHeight(qx + step, qz);
          const h01 = groundHeight(qx, qz + step);
          const h11 = groundHeight(qx + step, qz + step);
          let dev = 0;
          for (const u of [0.25, 0.5, 0.75]) {
            for (const v of [0.25, 0.5, 0.75]) {
              // The lattice's own triangles: (0,0)(0,1)(1,0) and (1,0)(0,1)(1,1).
              const chord = u + v <= 1 ? h00 + (h10 - h00) * u + (h01 - h00) * v : h11 + (h01 - h11) * (1 - u) + (h10 - h11) * (1 - v);
              dev = Math.max(dev, Math.abs(chord - groundHeight(qx + u * step, qz + v * step)));
            }
          }
          level[r * (cols - 1) + c] = dev > 0.3 ? 4 : dev > 0.05 ? 2 : 1;
        }
      }
      // Neighbours of a split quad split at least once, so their shared edge has matching vertices.
      const own = level.slice();
      for (let r = 0; r < rows - 1; r++) {
        for (let c = 0; c < cols - 1; c++) {
          let around = 1;
          for (let dr = -1; dr <= 1; dr++) {
            for (let dc = -1; dc <= 1; dc++) {
              const rr = r + dr;
              const cc = c + dc;
              if (rr >= 0 && cc >= 0 && rr < rows - 1 && cc < cols - 1) around = Math.max(around, own[rr * (cols - 1) + cc]);
            }
          }
          level[r * (cols - 1) + c] = Math.max(own[r * (cols - 1) + c], Math.min(2, around));
        }
      }
    }
    const vcol: THREE.Color[] = [];
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) vcol.push(new THREE.Color(colour(vx(c), vz(r))));
    const out = { green: { pos: [] as number[], col: [] as number[] }, plain: { pos: [] as number[], col: [] as number[] } };
    for (let r = 0; r < rows - 1; r++) {
      for (let c = 0; c < cols - 1; c++) {
        const cx = vx(c) + step / 2;
        const cz = vz(r) + step / 2;
        // Near a fine edge (an underpass), split the quad into 1 m pieces and test each.
        const n = fine && fine(cx, cz) ? step : level[r * (cols - 1) + c];
        const sub = step / n;
        const tgt = green(cx, cz) ? out.green : out.plain;
        for (let sr = 0; sr < n; sr++) {
          for (let sc = 0; sc < n; sc++) {
            const x0 = vx(c) + sc * sub;
            const z0 = vz(r) + sr * sub;
            if (!keep(x0 + sub / 2, z0 + sub / 2)) continue;
            const quad = [
              [x0, z0],
              [x0, z0 + sub],
              [x0 + sub, z0],
              [x0 + sub, z0],
              [x0, z0 + sub],
              [x0 + sub, z0 + sub],
            ];
            // Colour is the quad's (interpolated corners would need the lattice's own vertices).
            const k = n > 1 ? new THREE.Color(colour(x0 + sub / 2, z0 + sub / 2)) : null;
            for (const [qx, qz] of quad) {
              tgt.pos.push(qx, y, qz);
              const col = k ?? vcol[Math.round((qz - z0Lat) / step) * cols + Math.round((qx - x0Lat) / step)];
              tgt.col.push(col.r, col.g, col.b);
            }
          }
        }
      }
    }
    for (const [key, t] of Object.entries(out)) {
      if (!t.pos.length) continue;
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(t.pos, 3));
      g.setAttribute("color", new THREE.Float32BufferAttribute(t.col, 3));
      const n = new Float32Array(t.pos.length);
      for (let i = 1; i < n.length; i += 3) n[i] = 1;
      g.setAttribute("normal", new THREE.BufferAttribute(n, 3));
      (key === "green" ? landGeos : plainGeos).push(g);
    }
  };
  // Inside the region, at 4 m, minus the underpass trenches (their own walls and floor show there).
  lattice(
    4,
    // Up to the retaining walls' outer face (walls are hw .. hw + 0.9 from the road's centre).
    (x, z) => region.contains(x, z) && !inCut(x, z, 0.9),
    (x, z) => AREA_COLOUR[kindAt(x, z) ?? "campus"] ?? LAND,
    (x, z) => {
      const k = kindAt(x, z);
      return !k || VEGETATED.has(k);
    },
    0,
    rb.minX,
    rb.minZ,
    rb.maxX,
    rb.maxZ,
    (x, z) => inCut(x, z, 6),
    true
  );
  // Beyond the wall: coarse scrubland out to the edge of the map, just under the region's ground.
  const mb = map.bounds;
  // A coarse quad stays if any of it is outside, so no gap opens at the edge (it
  // tucks under the region's ground), but never over an underpass trench.
  lattice(
    16,
    (x, z) => [[0, 0], [-8, -8], [8, -8], [-8, 8], [8, 8]].some(([dx, dz]) => !region.contains(x + dx, z + dz)) && !inCut(x, z, 12),
    () => 0x86a257,
    () => true,
    -0.25,
    mb.minX,
    mb.minZ,
    mb.maxX,
    mb.maxZ
  );

  /* ---- overlays: grounds, courts, car parks, plazas, water (all on level pads) ---- */
  const sorted = map.areas.filter((a) => OVERLAY.has(a.kind)).sort((a, b) => AREA_LAYER[a.kind] - AREA_LAYER[b.kind]);
  for (const a of sorted) {
    const y = 0.02 + AREA_LAYER[a.kind] * 0.012;
    const g = flatPolygon(a.outer, a.holes, y);
    if (!g) continue;
    let c = AREA_COLOUR[a.kind];
    if (a.kind === "pitch" && a.sport && COURT_SPORTS.test(a.sport)) c = a.sport.includes("tennis") ? 0x3f7f9f : 0xb8603f;
    if (a.kind === "pitch" && a.sport === "cricket") c = 0x78b84f;
    // NITK's grounds are bare laterite earth, not turf (virtual tour: the
    // main ground, the lower ground, the clay tennis court); the basketball
    // courts are grey concrete.
    const earth = a.kind === "pitch" && (/^(ground|dirt|compacted|clay|earth|sand)$/.test(a.tags?.surface ?? "") || a.sport === "tennis");
    if (earth) c = 0xc4803f;
    if (a.kind === "pitch" && a.tags?.surface === "concrete") c = 0x8e9196;
    paint(g, new THREE.Color(c));
    const green = VEGETATED.has(a.kind) && !earth && a.tags?.surface !== "concrete" && !(a.kind === "pitch" && a.sport && COURT_SPORTS.test(a.sport));
    (green ? landGeos : plainGeos).push(g);
  }

  /* ---- the waterline: wet sand along the coast, inside the region ---- */
  for (const line of map.coast) {
    for (const run of insideRuns(resample(line, 4), region)) {
      if (run.length < 2) continue;
      const wet = ribbon(run, -0.5, 4, 0.04);
      wet.deleteAttribute("uv");
      paint(wet, new THREE.Color(0xcdb989));
      plainGeos.push(wet);
    }
  }

  // Vegetated ground takes the season's tint; sand, water and paving don't.
  const groundMat = toon(0xffffff, { vertexColors: true, ramp: "three" });
  const landMesh = new THREE.Mesh(merge(landGeos), groundMat);
  landMesh.receiveShadow = true;
  landMesh.name = "land";
  group.add(landMesh);
  if (plainGeos.length) {
    const plain = new THREE.Mesh(merge(plainGeos), toon(0xffffff, { vertexColors: true, ramp: "three" }));
    plain.receiveShadow = true;
    plain.name = "land-plain";
    group.add(plain);
  }

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
    uRough: { value: 0.5 },
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
        uniform float uRough;
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
          c = mix( c, uFoam, step( 0.985 - uRough * 0.05, swell ) * ( 1.0 - smoothstep( 60.0, 300.0 + uRough * 400.0, d ) ) * 0.55 );
          // Breakers near the beach.
          float br = sin( d * 0.35 - uTime * 2.2 + sin( vWorld.z * 0.05 ) );
          c = mix( c, uFoam, step( 0.88 - uRough * 0.18, br ) * ( 1.0 - smoothstep( 6.0, 25.0 + uRough * 55.0, d ) ) * 0.85 );
          // Glints.
          float g = fract( sin( dot( floor( vWorld.xz * 0.35 ), vec2( 12.9898, 78.233 ) ) ) * 43758.5453 );
          c += step( 0.992, g ) * step( 0.5, sin( uTime * 3.0 + g * 40.0 ) ) * 0.25;
          gl_FragColor = vec4( c, 1.0 );
        }`,
    });
    const sea = new THREE.Mesh(merge(seaGeos), seaMat);
    sea.name = "sea";
    sea.userData.fixedHeight = true;
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
    f.userData.fixedHeight = true;
    f.renderOrder = 1;
    group.add(f);
  }

  return {
    group,
    seaUniforms,
    setSeason(grass, sea) {
      groundMat.color.setRGB(...grass);
      seaUniforms.uRough.value = sea;
    },
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
