/**
 * The playable region, shared by the world and the map: the campus inside
 * its boundary, the coast (the beach, a band of sea along its shoreline and
 * the lighthouse knoll), and narrow corridors for the ways that join them:
 * NH66 where it runs along the campus wall, its two underpasses, the foot
 * overbridge and the one road out to the beach. Nothing else exists, the
 * way Bully's and GTA's worlds end at their edges.
 */
import type { CampusMap, Road } from "../osm/types";
import { Grid } from "./grid";

export type Region = {
  polys: [number, number][][];
  bounds: { minX: number; minZ: number; maxX: number; maxZ: number };
  contains(x: number, z: number): boolean;
  /** Grows the region by a corridor along a line (the underpass ramps, known only once the terrain is baked). */
  extend(pts: [number, number][], half: number): void;
  /** Adds the region to the current path, every ring wound the same way so a nonzero clip is their union. */
  trace(g: CanvasRenderingContext2D, X: (x: number) => number, Z: (z: number) => number): void;
};

export function pointIn(x: number, z: number, r: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, zi] = r[i];
    const [xj, zj] = r[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

const signedArea = (r: [number, number][]) => r.reduce((s, [x, z], i) => {
  const [x2, z2] = r[(i + 1) % r.length];
  return s + x * z2 - x2 * z;
}, 0);

/**
 * The campus boundary from OSM; the coast as a band following the beach's
 * outline plus the lighthouse knoll; and a corridor a few metres either
 * side of each connecting way.
 */
export function campusRegion(map: CampusMap): Region {
  const lighthouse = map.lighthouse ? { x: map.lighthouse[0], z: map.lighthouse[1] } : null;
  const polys: [number, number][][] = map.campus.map((c) => [...c]);
  // The coast: the beach itself, the lighthouse knoll, and a band of sea
  // that follows the shoreline between them.
  const beach = map.areas.find((a) => a.kind === "sand" && /beach/i.test(a.name ?? ""));
  const circle = (x: number, z: number, r: number): [number, number][] => Array.from({ length: 24 }, (_, i) => [x + Math.cos((i / 24) * Math.PI * 2) * r, z + Math.sin((i / 24) * Math.PI * 2) * r]);
  if (beach) {
    const zs = beach.outer.map((p) => p[1]);
    const zTop = Math.min(...zs) - 30;
    const zEnd = lighthouse ? lighthouse.z + 160 : Math.max(...zs);
    polys.push(beach.outer.map((p) => [p[0], Math.min(zEnd, p[1])] as [number, number]));
    // A band along the beach's own outline: out to sea on its sea side,
    // a strip of the dunes and casuarinas on its land side, tapering to
    // nothing at the two ends so the coast doesn't end in a straight cut.
    const inSea = (x: number, z: number) => map.sea.some((r) => pointIn(x, z, r));
    const taper = (z: number) => Math.max(0, Math.min(1, (z - zTop) / 150, (zEnd - z) / 150));
    const ring = beach.outer;
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i];
      const b = ring[(i + 1) % ring.length];
      if (Math.min(a[1], b[1]) > zEnd) continue;
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (len < 0.5) continue;
      const nx = -(b[1] - a[1]) / len;
      const nz = (b[0] - a[0]) / len;
      const mx = (a[0] + b[0]) / 2;
      const mz = (a[1] + b[1]) / 2;
      // Which way is out of the sand, and is that the sea?
      const sx = pointIn(mx + nx * 3, mz + nz * 3, ring) ? -1 : 1;
      const seaward = inSea(mx + sx * nx * 25, mz + sx * nz * 25);
      const reach = (p: [number, number]) => (seaward ? 140 : 40) * taper(Math.min(p[1], zEnd));
      const clampZ = (p: [number, number]): [number, number] => [p[0], Math.min(zEnd, p[1])];
      const [pa, pb] = [clampZ(a), clampZ(b)];
      polys.push([
        pa,
        pb,
        [pb[0] + sx * nx * reach(pb), pb[1] + sx * nz * reach(pb)],
        [pa[0] + sx * nx * reach(pa), pa[1] + sx * nz * reach(pa)],
      ]);
    }
  }
  // The lighthouse knoll.
  if (lighthouse) polys.push(circle(lighthouse.x, lighthouse.z, 90));
  if (!polys.length) throw new Error("[map] OSM has no campus boundary to map");
  // The campus and the coast frame the map; the connectors don't widen it.
  const framed = polys.length;

  // Connectors: a corridor a few metres either side of each way.
  const segDist = (x: number, z: number, a: [number, number], b: [number, number]) => {
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz || 1)));
    return Math.hypot(x - a[0] - t * dx, z - a[1] - t * dz);
  };
  const nearCampus = (p: [number, number], within: number) =>
    map.campus.some((r) => r.some((a, i) => segDist(p[0], p[1], a, r[(i + 1) % r.length]) < within));
  const corridor = (a: [number, number], b: [number, number], half: number) => {
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const l = Math.hypot(dx, dz) || 1;
    const nx = (-dz / l) * half;
    const nz = (dx / l) * half;
    // Carried a little past each end, so consecutive pieces overlap at the joints.
    const ex = (dx / l) * half;
    const ez = (dz / l) * half;
    polys.push([
      [a[0] - ex + nx, a[1] - ez + nz],
      [b[0] + ex + nx, b[1] + ez + nz],
      [b[0] + ex - nx, b[1] + ez - nz],
      [a[0] - ex - nx, a[1] - ez - nz],
    ]);
  };
  // The one road out to the beach: the shortest that runs from the campus
  // boundary to within a short walk of the sand.
  const beachRoad = beach ? pickBeachRoad(map, beach.outer) : null;
  let connectors = 0;
  for (const r of map.roads) {
    const nh66 = r.kind === "trunk";
    const link = r.tunnel || /underpass|overpass/i.test(r.name ?? "") || r === beachRoad;
    if (!nh66 && !link) continue;
    for (let i = 1; i < r.pts.length; i++) {
      const a = r.pts[i - 1];
      const b = r.pts[i];
      // NH66 only where it runs along the campus wall.
      if (nh66 && !(nearCampus(a, 45) && nearCampus(b, 45))) continue;
      // NH66 takes in its verges and the service roads either side, up to the campus walls.
      corridor(a, b, r.width / 2 + (nh66 ? 14 : 6));
      connectors++;
    }
  }
  if (!connectors) console.warn("[map] no NH66, underpass or overbridge ways found to connect the campus halves");
  for (const r of polys) if (signedArea(r) < 0) r.reverse();
  const all = polys.slice(0, framed).flat();
  const bounds = {
    minX: Math.min(...all.map((p) => p[0])) - 40,
    maxX: Math.max(...all.map((p) => p[0])) + 40,
    minZ: Math.min(...all.map((p) => p[1])) - 40,
    maxZ: Math.max(...all.map((p) => p[1])) + 40,
  };

  // A 2 m raster of the union, so contains() is a lookup.
  const mb = map.bounds;
  const mask = new Grid(mb.minX, mb.minZ, mb.maxX, mb.maxZ, 2);
  for (const r of polys) mask.fillPolygon([r], 1);
  return {
    extend(line, half) {
      const before = polys.length;
      for (let i = 1; i < line.length; i++) corridor(line[i - 1], line[i], half);
      for (const r of polys.slice(before)) {
        if (signedArea(r) < 0) r.reverse();
        mask.fillPolygon([r], 1);
      }
    },
    polys,
    bounds,
    contains: (x, z) => {
      const k = mask.idx(x, z);
      return k >= 0 && mask.flags[k] === 1;
    },
    trace(g, X, Z) {
      for (const r of polys) {
        r.forEach(([x, z], i) => (i ? g.lineTo(X(x), Z(z)) : g.moveTo(X(x), Z(z))));
        g.closePath();
      }
    },
  };
}

/** The shortest drivable road with one end at the campus boundary and the other near the beach. */
function pickBeachRoad(map: CampusMap, sand: [number, number][]) {
  const segDist = (x: number, z: number, a: [number, number], b: [number, number]) => {
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz || 1)));
    return Math.hypot(x - a[0] - t * dx, z - a[1] - t * dz);
  };
  const ringDist = (p: [number, number], r: [number, number][]) => Math.min(...r.map((a, i) => segDist(p[0], p[1], a, r[(i + 1) % r.length])));
  const campus = map.campus.filter((r) => r.length > 10);
  let best = null as { road: Road; len: number } | null;
  for (const r of map.roads) {
    if (["footway", "steps", "cycleway", "trunk"].includes(r.kind)) continue;
    const ends = [r.pts[0], r.pts[r.pts.length - 1]];
    const toCampus = Math.min(...ends.map((p) => Math.min(...campus.map((c) => ringDist(p, c)))));
    const toBeach = Math.min(...ends.map((p) => ringDist(p, sand)));
    if (toCampus > 40 || toBeach > 60) continue;
    const len = r.pts.slice(1).reduce((s, p, i) => s + Math.hypot(p[0] - r.pts[i][0], p[1] - r.pts[i][1]), 0);
    if (!best || len < best.len) best = { road: r, len };
  }
  if (!best) console.warn("[region] no road found from the campus to the beach");
  return best?.road ?? null;
}
