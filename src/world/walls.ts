/**
 * The campus compound wall. OSM maps only a few stretches of it, so the rest
 * follows the campus boundary: broken wherever a road or a path crosses
 * into somewhere you can go (NH66, an underpass, the beach road; that's a
 * gate), wherever OSM already has a wall, and wherever the boundary runs
 * through a building. Everywhere else the world ends at the wall.
 */
import type { CampusMap } from "../osm/types";
import type { Pt } from "../geo";
import type { Region } from "./region";
import { cuts, nearUnderpass } from "./terrain";

const STEP = 2;
/** Boundary rings smaller than this (m²) are enclaves, not the campus. */
const MIN_RING = 20000;

export type Wall = { pts: Pt[]; /** Ends that open onto a gate get a gate pillar. */ gateAtStart: boolean; gateAtEnd: boolean };

/** An opening in the wall where a road crosses, pillar to pillar. */
export type Gate = {
  a: Pt;
  b: Pt;
  /** Into the campus from the gate's middle. */
  inward: Pt;
  /** Opens onto NH66 (these close after the intro; the underpasses and the beach road stay open). */
  nh66: boolean;
};

type Seg = { ax: number; az: number; bx: number; bz: number; r: number };

function segDist(x: number, z: number, s: Seg): number {
  const dx = s.bx - s.ax;
  const dz = s.bz - s.az;
  const t = Math.max(0, Math.min(1, ((x - s.ax) * dx + (z - s.az) * dz) / (dx * dx + dz * dz || 1)));
  return Math.hypot(x - s.ax - t * dx, z - s.az - t * dz);
}

function inPoly(x: number, z: number, r: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, zi] = r[i];
    const [xj, zj] = r[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

const ringArea = (r: Pt[]) => Math.abs(r.reduce((s, [x, z], i) => s + x * r[(i + 1) % r.length][1] - r[(i + 1) % r.length][0] * z, 0)) / 2;

let cached: { map: CampusMap; walls: Wall[]; gates: Gate[] } | null = null;

export function campusGates(map: CampusMap, region: Region): Gate[] {
  campusWalls(map, region);
  return cached!.gates;
}

export function campusWalls(map: CampusMap, region: Region): Wall[] {
  if (cached?.map === map) return cached.walls;
  const segs = (lines: { pts: Pt[]; r: number }[]) =>
    lines.flatMap(({ pts, r }) => pts.slice(1).map((b, i) => ({ ax: pts[i][0], az: pts[i][1], bx: b[0], bz: b[1], r })));
  const trunk = segs(map.roads.filter((r) => r.kind === "trunk").map((r) => ({ pts: r.pts, r: 0 })));
  const toTrunk = (x: number, z: number) => (trunk.length ? Math.min(...trunk.map((s) => segDist(x, z, s))) : Infinity);
  const gates: Gate[] = [];
  // Where roads cross the boundary: a gate the way's width plus a couple of metres each side.
  // (A road running alongside the wall doesn't open it; one ending on the wall line does.)
  const crossings: { x: number; z: number; r: number }[] = [];
  const cross = (p1: Pt, p2: Pt, q1: Pt, q2: Pt): Pt | null => {
    const d = (p2[0] - p1[0]) * (q2[1] - q1[1]) - (p2[1] - p1[1]) * (q2[0] - q1[0]);
    if (Math.abs(d) < 1e-9) return null;
    const t = ((q1[0] - p1[0]) * (q2[1] - q1[1]) - (q1[1] - p1[1]) * (q2[0] - q1[0])) / d;
    const u = ((q1[0] - p1[0]) * (p2[1] - p1[1]) - (q1[1] - p1[1]) * (p2[0] - p1[0])) / d;
    return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? [p1[0] + (p2[0] - p1[0]) * t, p1[1] + (p2[1] - p1[1]) * t] : null;
  };
  for (const ring of map.campus) {
    for (let i = 0; i < ring.length; i++) {
      const [e1, e2] = [ring[i], ring[(i + 1) % ring.length]];
      const edge = { ax: e1[0], az: e1[1], bx: e2[0], bz: e2[1], r: 0 };
      for (const r of map.roads) {
        if (r.kind === "trunk") continue;
        const reach = r.width / 2 + 2.5;
        for (let k = 1; k < r.pts.length; k++) {
          const c = cross(r.pts[k - 1], r.pts[k], e1, e2);
          if (c) crossings.push({ x: c[0], z: c[1], r: reach });
        }
        for (const end of [r.pts[0], r.pts[r.pts.length - 1]]) if (segDist(end[0], end[1], edge) < 4) crossings.push({ x: end[0], z: end[1], r: reach });
      }
    }
  }
  // The underpasses open the wall where they cross it too (a ramp may run on
  // straight where no mapped road does).
  for (const ring of map.campus) {
    for (let i = 0; i < ring.length; i++) {
      const [e1, e2] = [ring[i], ring[(i + 1) % ring.length]];
      for (const c of cuts) {
        for (let k = 1; k < c.pts.length; k++) {
          const x = cross(c.pts[k - 1], c.pts[k], e1, e2);
          if (x) crossings.push({ x: x[0], z: x[1], r: c.hw + 1.5 });
        }
      }
    }
  }
  const atCrossing = (x: number, z: number) => crossings.some((c) => Math.hypot(c.x - x, c.z - z) < c.r);
  const osmWalls = segs(map.barriers.map((b) => ({ pts: b.pts, r: 4 })));
  const buildings = map.buildings.map((b) => {
    const xs = b.outer.map((p) => p[0]);
    const zs = b.outer.map((p) => p[1]);
    return { outer: b.outer, x0: Math.min(...xs) - 1, x1: Math.max(...xs) + 1, z0: Math.min(...zs) - 1, z1: Math.max(...zs) + 1 };
  });
  const near = (x: number, z: number, list: Seg[]) => list.some((s) => segDist(x, z, s) < s.r);
  const inBuilding = (x: number, z: number) => buildings.some((b) => x > b.x0 && x < b.x1 && z > b.z0 && z < b.z1 && inPoly(x, z, b.outer));

  const walls: Wall[] = [];
  for (const ring of map.campus) {
    if (ring.length < 4 || ringArea(ring) < MIN_RING) continue;
    // Sample the boundary every STEP metres, and why (if at all) each sample is open.
    const samples: { p: Pt; open: "" | "gate" | "other" }[] = [];
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i];
      const b = ring[(i + 1) % ring.length];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const n = Math.max(1, Math.round(len / STEP));
      for (let k = 0; k < n; k++) {
        const x = a[0] + ((b[0] - a[0]) * k) / n;
        const z = a[1] + ((b[1] - a[1]) * k) / n;
        // A gate only where the region carries on past the wall.
        const nx = -(b[1] - a[1]) / (len || 1);
        const nz = (b[0] - a[0]) / (len || 1);
        const through = region.contains(x + nx * 3, z + nz * 3) && region.contains(x - nx * 3, z - nz * 3);
        const open = through && atCrossing(x, z) ? "gate" : near(x, z, osmWalls) || inBuilding(x, z) ? "other" : "";
        samples.push({ p: [x, z], open });
      }
    }
    // The gates: each run of gate samples, from its first to the wall that resumes after it.
    const firstWall = samples.findIndex((s) => !s.open);
    if (firstWall >= 0) {
      let gateFrom = -1;
      for (let k = 1; k <= samples.length; k++) {
        const i = (firstWall + k) % samples.length;
        const s = samples[i];
        if (s.open === "gate" && gateFrom < 0) gateFrom = i;
        if (s.open !== "gate" && gateFrom >= 0) {
          const a = samples[gateFrom].p;
          const b = s.p;
          const mid: Pt = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
          const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
          let inward: Pt = [-(b[1] - a[1]) / len, (b[0] - a[0]) / len];
          if (!inPoly(mid[0] + inward[0] * 3, mid[1] + inward[1] * 3, ring)) inward = [-inward[0], -inward[1]];
          gates.push({ a, b, inward, nh66: toTrunk(mid[0], mid[1]) < 30 && !nearUnderpass(mid[0], mid[1], 6) });
          gateFrom = -1;
        }
      }
    }
    // Start the walk at an opening so no wall wraps round the ring's seam.
    const start = samples.findIndex((s) => s.open);
    if (start < 0) {
      walls.push({ pts: [...samples.map((s) => s.p), samples[0].p], gateAtStart: false, gateAtEnd: false });
      continue;
    }
    let run: Pt[] = [];
    let before: "" | "gate" | "other" = samples[start].open;
    for (let k = 1; k <= samples.length; k++) {
      const s = samples[(start + k) % samples.length];
      if (!s.open) {
        run.push(s.p);
        continue;
      }
      if (run.length * STEP >= 6) walls.push({ pts: [...run, s.p], gateAtStart: before === "gate", gateAtEnd: s.open === "gate" });
      run = [];
      before = s.open;
    }
  }
  cached = { map, walls, gates };
  return walls;
}
