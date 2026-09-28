/**
 * The ground's real shape. NITK sits on a laterite plateau: the beach is at
 * sea level, the land climbs ~25 m within half a kilometre to NH66 and the
 * main campus, then falls away east towards the lake.
 *
 * Heights come from a 30 m elevation model (public/data/nitk-dem.json, see
 * scripts/fetch-dem.mjs), smoothed to take out tree canopy, with the sea
 * and the beach pinned to sea level. On top of that:
 *  - every building, pitch, car park and pond stands on a level pad, blended
 *    into the slope around it (so a building is one rigid block);
 *  - the two NH66 underpasses are cut down below the highway, with a culvert
 *    floor under the road itself;
 *  - mounds (the lighthouse knoll) from the landmarks.
 *
 * It's all baked into one 2 m heightfield. The CPU reads it (groundHeight,
 * for anything placed or moving), and the GPU reads the same numbers as a
 * texture to lift the static world (see displace.ts), so they always agree.
 */
import * as THREE from "three";
import type { CampusMap } from "../osm/types";
import type { Pt } from "../geo";

export type Dem = { spacing: number; minX: number; minZ: number; cols: number; rows: number; h: number[] };
export type Mound = { x: number; z: number; r: number; h: number };

const CELL = 2;
/** Below the sea surface (y = -0.12). */
const SEA_FLOOR = -1.5;
const CUT_DEPTH = 5.2;

let dem: Dem | null = null;
const mounds: Mound[] = [];

type Field = { minX: number; minZ: number; cols: number; rows: number; h: Float32Array; floor: Float32Array };
let field: Field | null = null;
let texture: THREE.DataTexture | null = null;

/** Where the underpasses run, for the ground and the retaining walls. */
export type Cut = {
  pts: Pt[];
  hw: number;
  depthAt: number[];
  /** Points under a deck (the highway, or a road crossing over): a culvert, not an open trench. */
  covered: boolean[];
  /** The road surface down the underpass, per point: the one profile the field, the floor and the player all use. */
  floorAt: number[];
};
export const cuts: Cut[] = [];
/** The NH66 carriageways, which stay up where the underpasses go under. */
let deckSegs: { ax: number; az: number; bx: number; bz: number; r: number }[] = [];

export function setDem(d: Dem) {
  if (!Array.isArray(d.h) || d.h.length !== d.cols * d.rows) throw new Error(`[terrain] elevation grid is ${d.h?.length} values, expected ${d.cols} x ${d.rows}`);
  dem = d;
}

export async function loadDem(url = `${import.meta.env.BASE_URL}data/nitk-dem.json`): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`[terrain] could not load ${url}: HTTP ${res.status}. Run npm run dem:fetch.`);
  setDem(await res.json());
}

export function addMound(m: Mound) {
  mounds.push(m);
}

export function clearMounds() {
  mounds.length = 0;
}

/* ------------------------------------------------------------------ *
 * Reading the field
 * ------------------------------------------------------------------ */

function sample(arr: Float32Array, f: Field, x: number, z: number): number {
  const gx = Math.max(0, Math.min(f.cols - 1.001, (x - f.minX) / CELL));
  const gz = Math.max(0, Math.min(f.rows - 1.001, (z - f.minZ) / CELL));
  const i = Math.floor(gx);
  const j = Math.floor(gz);
  const u = gx - i;
  const v = gz - j;
  const k = j * f.cols + i;
  return (arr[k] * (1 - u) + arr[k + 1] * u) * (1 - v) + (arr[k + f.cols] * (1 - u) + arr[k + f.cols + 1] * u) * v;
}

/** The ground (or floor, on a building's pad) at a point. */
export function groundHeight(x: number, z: number): number {
  if (!field) throw new Error("[terrain] groundHeight called before bakeTerrain");
  return sample(field.h, field, x, z);
}

/** The underpass floor (equal to the ground everywhere but under the highway). */
export function floorHeight(x: number, z: number): number {
  if (!field) throw new Error("[terrain] floorHeight called before bakeTerrain");
  return sample(field.floor, field, x, z);
}

/* ------------------------------------------------------------------ *
 * Layers: the overbridges above the ground, the culverts below it
 * ------------------------------------------------------------------ */

type Span = { ax: number; az: number; ux: number; uz: number; len: number; h: number; stairs: number; ya: number; yb: number };
let spans: Span[] = [];

/** Registers the foot overbridges (after bakeTerrain): deck h above the ground at its ends, stair flights `stairs` long past each end. */
export function setOverbridges(list: { a: Pt; b: Pt }[], h: number, stairs: number) {
  spans = list.map(({ a, b }) => {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    // The deck is lifted like everything else: by the ground under each end of it.
    const ux = (b[0] - a[0]) / len;
    const uz = (b[1] - a[1]) / len;
    const ya = groundHeight(a[0] + ux * 0, a[1] + uz * 0);
    const yb = groundHeight(b[0], b[1]);
    return { ax: a[0], az: a[1], ux, uz, len, h, stairs, ya, yb };
  });
}

/** The walking surface of an overbridge (deck or stairs) at a point, or null off it. */
export function bridgeHeight(x: number, z: number): number | null {
  for (const s of spans) {
    const dx = x - s.ax;
    const dz = z - s.az;
    const u = dx * s.ux + dz * s.uz;
    const v = -dx * s.uz + dz * s.ux;
    if (Math.abs(v) > 1.1 || u < -s.stairs || u > s.len + s.stairs) continue;
    const top = s.h + 0.2;
    if (u >= 0 && u <= s.len) return top + s.ya + (s.yb - s.ya) * (u / s.len);
    // On a flight: down from the deck to the ground at its foot.
    const out = u < 0 ? -u : u - s.len;
    return groundHeight(x, z) + top * (1 - out / s.stairs);
  }
  return null;
}

/**
 * Inside an underpass (between its walls): the floor there, straight from
 * the underpass's own profile (not the 2 m field, which blurs a 6 m trench),
 * and whether a deck is overhead.
 */
export function underpassAt(x: number, z: number): { floor: number; covered: boolean } | null {
  let best: { d: number; floor: number; covered: boolean } | null = null;
  for (const c of cuts) {
    for (let i = 1; i < c.pts.length; i++) {
      if (c.depthAt[i] < 0.05 && c.depthAt[i - 1] < 0.05) continue;
      const [a, b] = [c.pts[i - 1], c.pts[i]];
      const dx = b[0] - a[0];
      const dz = b[1] - a[1];
      const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz || 1)));
      const d = Math.hypot(x - a[0] - t * dx, z - a[1] - t * dz);
      if (d > c.hw + 0.3 || (best && d >= best.d)) continue;
      best = { d, floor: c.floorAt[i - 1] + (c.floorAt[i] - c.floorAt[i - 1]) * t, covered: c.covered[i - 1] || c.covered[i] };
    }
  }
  return best && { floor: best.floor, covered: best.covered };
}

/**
 * Where something at height y stands: on an overbridge if it's up there (or
 * stepping onto its stairs); in an underpass, its floor (or, under the
 * highway, whichever of the floor and the deck you're nearer); otherwise
 * the ground.
 */
export function surfaceAt(x: number, z: number, y: number): number {
  const g = groundHeight(x, z);
  const b = bridgeHeight(x, z);
  if (b !== null && y > b - 0.8) return b;
  const u = underpassAt(x, z);
  if (!u) return g;
  if (!u.covered) return u.floor;
  const deck = Math.max(g, u.floor + 3);
  return Math.abs(y - u.floor) <= Math.abs(y - deck) ? u.floor : deck;
}

let highway: { ax: number; az: number; bx: number; bz: number; r: number }[] = [];

/** On NH66's carriageways or the median between them. */
export function onHighway(x: number, z: number): boolean {
  return highway.some((s) => segDist(x, z, s.ax, s.az, s.bx, s.bz) < s.r);
}

/** The field as a float texture, and where it sits, for the displacement shader. */
export function terrainTexture(): { tex: THREE.DataTexture; min: THREE.Vector2; cell: number; size: THREE.Vector2 } {
  if (!field || !texture) throw new Error("[terrain] terrainTexture called before bakeTerrain");
  return { tex: texture, min: new THREE.Vector2(field.minX, field.minZ), cell: CELL, size: new THREE.Vector2(field.cols, field.rows) };
}

/* ------------------------------------------------------------------ *
 * Baking
 * ------------------------------------------------------------------ */

/** The elevation model, smoothed twice with a 3x3 kernel (~90 m): canopy and roofs out, slopes kept. */
function smoothedDem(d: Dem): Float32Array {
  let a = Float32Array.from(d.h);
  for (let pass = 0; pass < 2; pass++) {
    const b = new Float32Array(a.length);
    for (let r = 0; r < d.rows; r++) {
      for (let c = 0; c < d.cols; c++) {
        let s = 0;
        let w = 0;
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            const rr = r + dr;
            const cc = c + dc;
            if (rr < 0 || cc < 0 || rr >= d.rows || cc >= d.cols) continue;
            const k = dr === 0 && dc === 0 ? 4 : dr === 0 || dc === 0 ? 2 : 1;
            s += a[rr * d.cols + cc] * k;
            w += k;
          }
        }
        b[r * d.cols + c] = s / w;
      }
    }
    a = b;
  }
  return a;
}

function pointIn(x: number, z: number, r: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, zi] = r[i];
    const [xj, zj] = r[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

function segDist(x: number, z: number, ax: number, az: number, bx: number, bz: number): number {
  const dx = bx - ax;
  const dz = bz - az;
  const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)));
  return Math.hypot(x - ax - t * dx, z - az - t * dz);
}

/** Distance to a polygon's edge, 0 inside it. */
function polyDist(x: number, z: number, r: Pt[]): number {
  if (pointIn(x, z, r)) return 0;
  let d = Infinity;
  for (let i = 0; i < r.length; i++) {
    const a = r[i];
    const b = r[(i + 1) % r.length];
    d = Math.min(d, segDist(x, z, a[0], a[1], b[0], b[1]));
  }
  return d;
}

const smooth = (e0: number, e1: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

/**
 * Bakes the field for this map. Call after the landmarks (they add mounds)
 * and before anything asks groundHeight.
 */
export function bakeTerrain(map: CampusMap): void {
  if (!dem) throw new Error("[terrain] no elevation model loaded (loadDem)");
  const d = dem;
  const smoothDem = smoothedDem(d);
  const demAt = (x: number, z: number) => {
    const gx = Math.max(0, Math.min(d.cols - 1.001, (x - d.minX) / d.spacing));
    const gz = Math.max(0, Math.min(d.rows - 1.001, (z - d.minZ) / d.spacing));
    const i = Math.floor(gx);
    const j = Math.floor(gz);
    const u = gx - i;
    const v = gz - j;
    const k = j * d.cols + i;
    return (smoothDem[k] * (1 - u) + smoothDem[k + 1] * u) * (1 - v) + (smoothDem[k + d.cols] * (1 - u) + smoothDem[k + d.cols + 1] * u) * v;
  };

  const b = map.bounds;
  const cols = Math.ceil((b.maxX - b.minX) / CELL) + 1;
  const rows = Math.ceil((b.maxZ - b.minZ) / CELL) + 1;
  const f: Field = { minX: b.minX, minZ: b.minZ, cols, rows, h: new Float32Array(cols * rows), floor: new Float32Array(cols * rows) };
  const X = (c: number) => f.minX + c * CELL;
  const Z = (r: number) => f.minZ + r * CELL;

  // 1. The land: smoothed elevation, the knoll on top.
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = X(c);
      const z = Z(r);
      let y = Math.max(0, demAt(x, z));
      for (const m of mounds) {
        const dd = Math.hypot(x - m.x, z - m.z) / m.r;
        if (dd >= 1) continue;
        const t = 1 - dd * dd;
        y = Math.max(y, demAt(m.x, m.z) + m.h * t * t * (3 - 2 * t));
      }
      f.h[r * cols + c] = y;
    }
  }

  // 2. The sea floor, and the beach sloping gently up from the waterline.
  const beachRings = map.areas.filter((a) => a.kind === "sand").map((a) => a.outer);
  const rasterRing = (ring: Pt[], pad: number, fn: (k: number, x: number, z: number, dist: number) => void) => {
    const xs = ring.map((p) => p[0]);
    const zs = ring.map((p) => p[1]);
    const c0 = Math.max(0, Math.floor((Math.min(...xs) - pad - f.minX) / CELL));
    const c1 = Math.min(cols - 1, Math.ceil((Math.max(...xs) + pad - f.minX) / CELL));
    const r0 = Math.max(0, Math.floor((Math.min(...zs) - pad - f.minZ) / CELL));
    const r1 = Math.min(rows - 1, Math.ceil((Math.max(...zs) + pad - f.minZ) / CELL));
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const x = X(c);
        const z = Z(r);
        const dist = pad > 0 ? polyDist(x, z, ring) : pointIn(x, z, ring) ? 0 : Infinity;
        if (dist <= pad) fn(r * cols + c, x, z, dist);
      }
    }
  };
  for (const s of map.sea) {
    // The sea polygon is huge: only rasterise where it overlaps the field.
    const clipped = s.filter(([x, z]) => x >= b.minX - 500 && x <= b.maxX + 500 && z >= b.minZ - 500 && z <= b.maxZ + 500);
    if (clipped.length < 3) continue;
    rasterRing(s.map(([x, z]) => [Math.max(b.minX - 4, Math.min(b.maxX + 4, x)), Math.max(b.minZ - 4, Math.min(b.maxZ + 4, z))] as Pt), 0, (k) => (f.h[k] = SEA_FLOOR));
  }
  for (const ring of beachRings) rasterRing(ring, 30, (k, _x, _z, dist) => (f.h[k] = Math.min(f.h[k], 0.4 + 2.2 * smooth(0, 30, dist) + (dist === 0 ? 0 : f.h[k] * smooth(8, 30, dist)))));

  // 3. Level pads under buildings, grounds, car parks and ponds, blended out.
  const padW = new Float32Array(cols * rows);
  const padH = new Float32Array(cols * rows);
  const pad = (ring: Pt[], level: number, flat: number, blend: number) =>
    rasterRing(ring, flat + blend, (k, _x, _z, dist) => {
      const w = dist <= flat ? 1 : 1 - smooth(flat, flat + blend, dist);
      if (w > padW[k]) {
        padW[k] = w;
        padH[k] = level;
      }
    });
  const meanOver = (ring: Pt[]) => {
    const pts = [...ring, ring.reduce((a, p) => [a[0] + p[0] / ring.length, a[1] + p[1] / ring.length] as Pt, [0, 0] as Pt)];
    return pts.reduce((s, p) => s + sample(f.h, f, p[0], p[1]), 0) / pts.length;
  };
  const minOver = (ring: Pt[]) => Math.min(...ring.map((p) => sample(f.h, f, p[0], p[1])));
  for (const a of map.areas) {
    if (a.kind === "pitch" || a.kind === "track" || a.kind === "parking") pad(a.outer, meanOver(a.outer), 1, 10);
    else if (a.kind === "water" || a.kind === "pool") pad(a.outer, minOver(a.outer), 2, 8);
  }
  for (const bl of map.buildings) pad(bl.outer, meanOver(bl.outer), 3, 9);
  for (let k = 0; k < f.h.length; k++) if (padW[k] > 0) f.h[k] = f.h[k] * (1 - padW[k]) + padH[k] * padW[k];

  // 4. The underpasses: a trench along each, down to a culvert floor under NH66.
  cuts.length = 0;
  const trunk = map.roads.filter((r) => r.kind === "trunk");
  const segsOf = (pts: Pt[], r: number) => pts.slice(1).map((p, i) => ({ ax: pts[i][0], az: pts[i][1], bx: p[0], bz: p[1], r }));
  // The deck reaches a few metres past each carriageway's edge, so the
  // highway's own vertices never sample a cut cell (and the culvert roof
  // covers all of it).
  const trunkSegs = trunk.flatMap((r) => segsOf(r.pts, r.width / 2 + 4.5));
  // The carriageways, wide enough between the pair to take in the median.
  highway = trunk.flatMap((r) => segsOf(r.pts, r.width / 2 + 2.5));
  const trunkDist = (p: Pt) => Math.min(...trunkSegs.map((s) => segDist(p[0], p[1], s.ax, s.az, s.bx, s.bz) - s.r));
  const resample2 = (src: Pt[]) => {
    const out: Pt[] = [src[0]];
    for (let i = 1; i < src.length; i++) {
      const [a, c] = [src[i - 1], src[i]];
      const n = Math.max(1, Math.ceil(Math.hypot(c[0] - a[0], c[1] - a[1]) / 2));
      for (let k = 1; k <= n; k++) out.push([a[0] + ((c[0] - a[0]) * k) / n, a[1] + ((c[1] - a[1]) * k) / n]);
    }
    return out;
  };
  // Each underpass is a tunnel=yes way under the highway (OSM's own culvert),
  // carried out along the roads joined to each end far enough for the ramps.
  const tunnels = map.roads.filter((r) => r.tunnel && r.kind !== "footway" && r.kind !== "steps" && trunkDist(r.pts[0]) < 30);
  /** The underpass road, and which of its points are the tunnel itself. */
  const lines: { pts: Pt[]; width: number; used: Set<number>; tunnelFrom: number; tunnelTo: number }[] = [];
  const joined = new Set<number>();
  for (const t of tunnels) {
    if (joined.has(t.id)) continue;
    const used = new Set<number>([t.id]);
    let pts = resample2(t.pts);
    // A tunnel mapped as two pieces end to end is one underpass.
    for (const o of tunnels) {
      if (o.id === t.id || joined.has(o.id)) continue;
      const op = resample2(o.pts);
      const [a0, a1] = [pts[0], pts[pts.length - 1]];
      const [b0, b1] = [op[0], op[op.length - 1]];
      const close = (p: Pt, q: Pt) => Math.hypot(p[0] - q[0], p[1] - q[1]) < 3;
      if (close(a1, b0)) pts = [...pts, ...op.slice(1)];
      else if (close(a1, b1)) pts = [...pts, ...op.reverse().slice(1)];
      else if (close(a0, b1)) pts = [...op, ...pts.slice(1)];
      else if (close(a0, b0)) pts = [...op.reverse(), ...pts.slice(1)];
      else continue;
      used.add(o.id);
      joined.add(o.id);
    }
    joined.add(t.id);
    // One tunnel per direction, side by side, is one underpass: build it once,
    // on their shared centreline, wide enough for both.
    let width = t.width;
    for (const o of tunnels) {
      if (joined.has(o.id)) continue;
      const op = resample2(o.pts);
      const sep = op.map((p) => Math.min(...pts.map((q) => Math.hypot(p[0] - q[0], p[1] - q[1]))));
      const mean = sep.reduce((a, b) => a + b, 0) / sep.length;
      if (mean > 14) continue;
      // Same way round as this one, then pair the points by how far along each they are.
      const d0 = Math.hypot(op[0][0] - pts[0][0], op[0][1] - pts[0][1]);
      const d1 = Math.hypot(op[op.length - 1][0] - pts[0][0], op[op.length - 1][1] - pts[0][1]);
      if (d1 < d0) op.reverse();
      const n = Math.max(pts.length, op.length);
      const at = (line: Pt[], f: number): Pt => {
        const k = Math.min(line.length - 1.001, f * (line.length - 1));
        const i = Math.floor(k);
        const u = k - i;
        return [line[i][0] + (line[i + 1][0] - line[i][0]) * u, line[i][1] + (line[i + 1][1] - line[i][1]) * u];
      };
      pts = Array.from({ length: n }, (_, i) => {
        const a = at(pts, i / (n - 1));
        const b = at(op, i / (n - 1));
        return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] as Pt;
      });
      width = mean + Math.max(t.width, o.width);
      used.add(o.id);
      joined.add(o.id);
    }
    const covered = pts.length;
    // Out from each end along the road that carries on straightest, up to 45 m.
    const grow = (from: Pt, heading: Pt): Pt[] => {
      const out: Pt[] = [];
      let tail = from;
      let dir = heading;
      let run = 0;
      while (run < 45) {
        let next: { pts: Pt[]; id: number; score: number } | null = null;
        for (const q of map.roads) {
          if (used.has(q.id) || q.kind === "trunk" || q.kind === "steps") continue;
          let np: Pt[];
          if (Math.hypot(q.pts[0][0] - tail[0], q.pts[0][1] - tail[1]) < 3) np = q.pts;
          else if (Math.hypot(q.pts[q.pts.length - 1][0] - tail[0], q.pts[q.pts.length - 1][1] - tail[1]) < 3) np = [...q.pts].reverse();
          else continue;
          const k = np.findIndex((p) => Math.hypot(p[0] - tail[0], p[1] - tail[1]) > 1);
          if (k < 0) continue;
          const l = Math.hypot(np[k][0] - tail[0], np[k][1] - tail[1]);
          const score = ((np[k][0] - tail[0]) * dir[0] + (np[k][1] - tail[1]) * dir[1]) / l;
          if (!next || score > next.score) next = { pts: np, id: q.id, score };
        }
        // Don't turn a corner sharper than ~60 degrees.
        if (!next || next.score < 0.5) break;
        used.add(next.id);
        for (const p of resample2(next.pts).slice(1)) {
          out.push(p);
          run += 2;
          if (run >= 45) break;
        }
        const a = out[Math.max(0, out.length - 3)];
        const b = out[out.length - 1];
        const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
        dir = [(b[0] - a[0]) / l, (b[1] - a[1]) / l];
        tail = b;
      }
      // No road carries on far enough: the ramp runs on straight to the top.
      for (; run < 36; run += 2) {
        tail = [tail[0] + dir[0] * 2, tail[1] + dir[1] * 2];
        out.push(tail);
      }
      return out;
    };
    const unit = (a: Pt, b: Pt): Pt => {
      const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      return [(b[0] - a[0]) / l, (b[1] - a[1]) / l];
    };
    const before = grow(pts[0], unit(pts[1], pts[0])).reverse();
    const after = grow(pts[pts.length - 1], unit(pts[pts.length - 2], pts[pts.length - 1]));
    lines.push({ pts: [...before, ...pts, ...after], width, used, tunnelFrom: before.length, tunnelTo: before.length + covered - 1 });
  }
  // Anything else crossing a trench is carried over it on a small deck.
  const usedIds = new Set(lines.flatMap((l) => [...l.used]));
  const crossingSegs = map.roads
    .filter((q) => !usedIds.has(q.id) && q.kind !== "trunk" && !/underpass/i.test(q.name ?? ""))
    .flatMap((q) => segsOf(q.pts, q.width / 2 + 2).filter((s) => lines.some((l) => l.pts.some((p) => segDist(p[0], p[1], s.ax, s.az, s.bx, s.bz) < l.width / 2 + 1.2 && trunkDist(p) < 36))));
  deckSegs = [...trunkSegs, ...crossingSegs];
  const nearDeck = (x: number, z: number) => deckSegs.some((s) => segDist(x, z, s.ax, s.az, s.bx, s.bz) < s.r);
  f.floor.set(f.h);
  for (const line of lines) {
    const pts = line.pts;
    const { tunnelFrom, tunnelTo } = line;
    const along: number[] = [0];
    for (let i = 1; i < pts.length; i++) along.push(along[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    // Distance along the road from the nearest tunnel mouth (0 inside the tunnel).
    const fromMouth = pts.map((_, i) => (i < tunnelFrom ? along[tunnelFrom] - along[i] : i > tunnelTo ? along[i] - along[tunnelTo] : 0));
    const ci = Math.round((tunnelFrom + tunnelTo) / 2);
    // Take the deck level from the highway over the tunnel's middle.
    const base = sample(f.h, f, pts[ci][0], pts[ci][1]);
    // Full depth through the tunnel and a few metres out, ramping up to ground over ~30 m.
    const depthAt = fromMouth.map((d) => CUT_DEPTH * (1 - smooth(6, 34, d)));
    const hw = line.width / 2 + 1.2;
    // The tunnel is covered, as is anything under a deck, and any short gap between them.
    // (A road crossing a shallow bit of ramp just dips; only a deep one gets a culvert.)
    const covered = pts.map(([x, z], i) => (i >= tunnelFrom && i <= tunnelTo) || (nearDeck(x, z) && depthAt[i] >= 3.5));
    for (let i = 0; i < pts.length; i++) {
      if (covered[i] || i === 0 || !covered[i - 1]) continue;
      let j = i;
      while (j < pts.length && !covered[j]) j++;
      if (j < pts.length && (j - i) * 2 < 12) for (let q = i; q < j; q++) covered[q] = true;
      i = j;
    }
    // The floor profile, from the ground as it was before any cutting.
    const floorAt = pts.map((p, i) => {
      const orig = sample(f.h, f, p[0], p[1]);
      const depth = depthAt[i];
      return depth < 0.05 ? orig : Math.min(orig, base - depth + (orig - base) * (1 - depth / CUT_DEPTH));
    });
    cuts.push({ pts, hw, depthAt, covered, floorAt });
    const xs = pts.map((p) => p[0]);
    const zs = pts.map((p) => p[1]);
    const c0 = Math.max(0, Math.floor((Math.min(...xs) - hw - f.minX) / CELL));
    const c1 = Math.min(cols - 1, Math.ceil((Math.max(...xs) + hw - f.minX) / CELL));
    const r0 = Math.max(0, Math.floor((Math.min(...zs) - hw - f.minZ) / CELL));
    const r1 = Math.min(rows - 1, Math.ceil((Math.max(...zs) + hw - f.minZ) / CELL));
    for (let rr = r0; rr <= r1; rr++) {
      for (let cc = c0; cc <= c1; cc++) {
        const x = X(cc);
        const z = Z(rr);
        let best = Infinity;
        let bi = 0;
        for (let i = 1; i < pts.length; i++) {
          const dd = segDist(x, z, pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]);
          if (dd < best) {
            best = dd;
            bi = i;
          }
        }
        // Cut the field only well inside the retaining walls, so the 2 m
        // cells don't drag the ground beside the walls down with them.
        if (best > hw - 0.6) continue;
        const k = rr * cols + cc;
        const depth = depthAt[bi];
        if (depth < 0.05) continue;
        const target = Math.min(f.h[k], Math.min(floorAt[bi - 1], floorAt[bi]));
        f.floor[k] = target;
        // Under a deck the ground stays; the culvert floor is below it.
        if (!covered[bi] && !covered[bi - 1]) f.h[k] = target;
      }
    }
  }

  field = f;
  texture?.dispose();
  texture = new THREE.DataTexture(f.h, cols, rows, THREE.RedFormat, THREE.FloatType);
  texture.minFilter = THREE.NearestFilter;
  texture.magFilter = THREE.NearestFilter;
  texture.needsUpdate = true;
}

/** Within r of an underpass's line (trench, culvert or ramp). */
export function nearUnderpass(x: number, z: number, r: number): boolean {
  return cuts.some((c) => c.pts.some((p, i) => c.depthAt[i] > 0.05 && Math.hypot(p[0] - x, p[1] - z) < r + c.hw));
}

/** True if (x, z) is in an underpass trench (outside the culvert under the highway). */
export function inCut(x: number, z: number, margin = 0): boolean {
  for (const c of cuts) {
    for (let i = 1; i < c.pts.length; i++) {
      if (c.depthAt[i] < 0.05 || c.covered[i] || c.covered[i - 1]) continue;
      if (segDist(x, z, c.pts[i - 1][0], c.pts[i - 1][1], c.pts[i][0], c.pts[i][1]) < c.hw + margin) return true;
    }
  }
  return false;
}
