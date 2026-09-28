/**
 * The campus compound wall. OSM maps only a few stretches of it, so the rest
 * follows the campus boundary: broken wherever a road or a path crosses
 * (that's a gate), wherever OSM already has a wall, and wherever the
 * boundary runs through a building.
 */
import type { CampusMap } from "../osm/types";
import type { Pt } from "../geo";

const STEP = 2;
/** Boundary rings smaller than this (m²) are enclaves, not the campus. */
const MIN_RING = 20000;

export type Wall = { pts: Pt[]; /** Ends that open onto a gate get a gate pillar. */ gateAtStart: boolean; gateAtEnd: boolean };

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

let cached: { map: CampusMap; walls: Wall[] } | null = null;

export function campusWalls(map: CampusMap): Wall[] {
  if (cached?.map === map) return cached.walls;
  const segs = (lines: { pts: Pt[]; r: number }[]) =>
    lines.flatMap(({ pts, r }) => pts.slice(1).map((b, i) => ({ ax: pts[i][0], az: pts[i][1], bx: b[0], bz: b[1], r })));
  // A crossing keeps a gate's width clear: the way plus a couple of metres each side.
  const roads = segs(map.roads.map((r) => ({ pts: r.pts, r: r.width / 2 + 2.5 })));
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
        const open = near(x, z, roads) ? "gate" : near(x, z, osmWalls) || inBuilding(x, z) ? "other" : "";
        samples.push({ p: [x, z], open });
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
  cached = { map, walls };
  return walls;
}
