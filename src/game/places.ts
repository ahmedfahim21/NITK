/**
 * Story locations. Each resolves from OSM names/tags when the map has them,
 * and otherwise from a sensible stand-in (the nearest hostel block, a spot
 * in front of a building), so missions work on the real map and the
 * approximate one alike.
 */
import { centroid, mulberry32, orientedBox, pointInPoly, type Pt } from "../geo";
import type { Building, CampusMap } from "../osm/types";
import type { World } from "../world";
import { styleFor } from "../world/buildings";
import { ROAD, WATER } from "../world/grid";
import { findByName, frontOf, mainEntrance } from "../world/landmarks";

export type Spot = { x: number; z: number; name: string; /** facing the door */ face?: number };

export type PlaceKey =
  | "busStop"
  | "mainGate"
  | "academicSection"
  | "karavali"
  | "aravali"
  | "sahyadri"
  | "megaMess"
  | "nescafe"
  | "nandini"
  | "freshHonest"
  | "computerCentre"
  | "lhc"
  | "library"
  | "sja"
  | "sac"
  | "mainGround"
  | "lighthouse"
  | "lighthouseView"
  | "beach"
  | "coop"
  | "sbi"
  | "flagpole"
  | "nightCanteen"
  | "lobby"
  | "libraryDesk"
  | "lhcClass"
  | "sjaHall"
  | "labDesk"
  | "lhcC"
  | "lhcD"
  | "scienceBlock";

type Resolver = (ctx: Ctx) => Spot | null;
type Ctx = { map: CampusMap; world: World; cache: Map<PlaceKey, Spot> };

function byName(ctx: Ctx, re: RegExp): Building | undefined {
  return ctx.map.buildings.filter((b) => b.name && re.test(b.name)).sort((a, b) => b.area - a.area)[0];
}

function poi(ctx: Ctx, re: RegExp, tag?: (t: Record<string, string>) => boolean) {
  return ctx.map.pois.find((p) => (p.name && re.test(p.name)) || (tag ? tag(p.tags) : false));
}

/** A walkable point just outside a building's face nearest to `toward`. */
function doorOf(ctx: Ctx, b: Building, toward?: Pt): Spot {
  const box = orientedBox(b.outer);
  const c = centroid(b.outer);
  const t = toward ?? nearestRoad(ctx, c) ?? [c[0], c[1] + 30];
  const dx = t[0] - box.cx;
  const dz = t[1] - box.cz;
  const cs = Math.cos(box.angle);
  const sn = Math.sin(box.angle);
  const u = dx * cs + dz * sn;
  const v = -dx * sn + dz * cs;
  let px: number;
  let pz: number;
  // Step out of whichever face points at the target, 3 m clear of the wall.
  if (Math.abs(u) / (box.len / 2) > Math.abs(v) / (box.wid / 2)) {
    const s = Math.sign(u) * (box.len / 2 + 3);
    px = box.cx + cs * s;
    pz = box.cz + sn * s;
  } else {
    const s = Math.sign(v) * (box.wid / 2 + 3);
    px = box.cx - sn * s;
    pz = box.cz + cs * s;
  }
  const [fx, fz] = ctx.world.grid.nearestFree(px, pz);
  return { x: fx, z: fz, name: b.name ?? "", face: Math.atan2(box.cx - fx, box.cz - fz) };
}

function nearestRoad(ctx: Ctx, p: Pt): Pt | null {
  let best: Pt | null = null;
  let bd = Infinity;
  for (const r of ctx.map.roads) {
    if (r.kind === "trunk") continue;
    for (const q of r.pts) {
      const d = Math.hypot(q[0] - p[0], q[1] - p[1]);
      if (d < bd) {
        bd = d;
        best = q;
      }
    }
  }
  return best;
}

function free(ctx: Ctx, x: number, z: number, name: string): Spot {
  const [fx, fz] = ctx.world.grid.nearestFree(x, z);
  return { x: fx, z: fz, name };
}

/** Hostel buildings, nearest first to a point. */
function hostels(ctx: Ctx, from: Pt): Building[] {
  return ctx.map.buildings
    .filter((b) => styleFor(b) === "hostel" && !/mess|mega\s*tower|girls|gh-?\d|pg/i.test(b.name ?? "") && b.area > 250)
    .sort((a, b) => {
      const ca = centroid(a.outer);
      const cb = centroid(b.outer);
      return Math.hypot(ca[0] - from[0], ca[1] - from[1]) - Math.hypot(cb[0] - from[0], cb[1] - from[1]);
    });
}

function mainBuildingCentre(ctx: Ctx): Pt {
  const mb = byName(ctx, /main building/i);
  if (mb) return centroid(mb.outer);
  return [ctx.world.spawn.x, ctx.world.spawn.z];
}

/** The n-th hostel block (by distance from the Main Building) that is at least 35 m from the ones before it. */
function nthHostel(ctx: Ctx, n: number): Building | undefined {
  const list = hostels(ctx, mainBuildingCentre(ctx));
  const picked: Building[] = [];
  for (const b of list) {
    const c = centroid(b.outer);
    if (picked.every((p) => {
      const q = centroid(p.outer);
      return Math.hypot(q[0] - c[0], q[1] - c[1]) > 35;
    })) picked.push(b);
    if (picked.length > n) break;
  }
  return picked[n];
}

const RESOLVERS: Record<PlaceKey, Resolver> = {
  busStop(ctx) {
    const gate = get(ctx, "mainGate");
    // The bus drops you on the far shoulder of NH66, across from the gate.
    const tr = ctx.map.roads.filter((r) => r.kind === "trunk");
    let best: Pt = [gate.x - 20, gate.z];
    let bd = Infinity;
    for (const r of tr) for (const q of r.pts) {
      const d = Math.hypot(q[0] - gate.x, q[1] - gate.z);
      if (d < bd) {
        bd = d;
        best = q;
      }
    }
    const dx = best[0] - gate.x;
    const dz = best[1] - gate.z;
    const l = Math.hypot(dx, dz) || 1;
    const g = ctx.world.grid;
    let seenRoad = false;
    let clear = 0;
    for (let s = 0; s < 120; s += 0.5) {
      const x = gate.x + (dx / l) * s;
      const z = gate.z + (dz / l) * s;
      const onRoad = (g.get(x, z) & ROAD) !== 0;
      if (onRoad) {
        seenRoad = true;
        clear = 0;
      } else if (seenRoad && !g.blocked(x, z) && ++clear > 4) {
        return { ...free(ctx, x, z, "NH66 bus stop"), face: Math.atan2(-dx, -dz) };
      }
    }
    return free(ctx, best[0] + (dx / l) * 14, best[1] + (dz / l) * 14, "NH66 bus stop");
  },
  mainGate(ctx) {
    const p = ctx.world.places.find((q) => /main gate/i.test(q.name));
    if (p) return free(ctx, p.x, p.z, "Main Gate");
    return free(ctx, ctx.world.spawn.x, ctx.world.spawn.z, "Main Gate");
  },
  academicSection(ctx) {
    const b = byName(ctx, /main building|administrative/i);
    if (!b) return null;
    const lm = ctx.world.places.find((q) => q.name === "Main Building");
    const s = doorOf(ctx, b, lm ? [lm.x, lm.z] : undefined);
    return { ...s, name: "Academic Section, Main Building" };
  },
  karavali(ctx) {
    const b = byName(ctx, /karavali|\bblock[\s-]*(1|i)\b|1st block|first block/i) ?? nthHostel(ctx, 0);
    return b ? { ...doorOf(ctx, b), name: "Karavali (Block 1)" } : null;
  },
  aravali(ctx) {
    const b = byName(ctx, /aravali|\bblock[\s-]*(2|ii)\b|2nd block/i) ?? nthHostel(ctx, 1);
    return b ? { ...doorOf(ctx, b), name: "Aravali (Block 2)" } : null;
  },
  sahyadri(ctx) {
    const b = byName(ctx, /sahyadri|\bblock[\s-]*(7|vii)\b|7th block/i) ?? nthHostel(ctx, 3) ?? nthHostel(ctx, 2);
    return b ? { ...doorOf(ctx, b), name: "Sahyadri (Block 7)" } : null;
  },
  megaMess(ctx) {
    const b = byName(ctx, /mega mess|\bmess\b|dining/i);
    if (b) return { ...doorOf(ctx, b), name: b.name ?? "Mega Mess" };
    const k = get(ctx, "karavali");
    return free(ctx, k.x + 25, k.z, "Mess");
  },
  nescafe(ctx) {
    const b = byName(ctx, /^nescaf[eé]$/i);
    if (b) return { ...doorOf(ctx, b), name: "Nescafe" };
    const p = poi(ctx, /nescafe|nescafé/i);
    if (p) return free(ctx, p.x, p.z, "Nescafe");
    // Right in front of Aravali, the 2nd block.
    const a = get(ctx, "aravali");
    return free(ctx, a.x + 6, a.z + 6, "Nescafe");
  },
  nandini(ctx) {
    const b = byName(ctx, /nandh?ini\s*\(?boys/i) ?? byName(ctx, /nandh?ini/i);
    if (b) return { ...doorOf(ctx, b), name: "Nandini" };
    const p = poi(ctx, /nandh?ini/i, (t) => t.shop === "dairy");
    if (p) return free(ctx, p.x, p.z, "Nandini Milk Parlour");
    const sc = byName(ctx, /shopping|complex|market/i);
    if (sc) return { ...doorOf(ctx, sc), name: "Nandini Milk Parlour" };
    const n = get(ctx, "nescafe");
    return free(ctx, n.x + 60, n.z - 20, "Nandini Milk Parlour");
  },
  freshHonest(ctx) {
    const p = poi(ctx, /fresh\s*(and|&|n)\s*honest/i);
    if (p) return free(ctx, p.x, p.z, "Fresh and Honest");
    const k = get(ctx, "karavali");
    const a = get(ctx, "aravali");
    return free(ctx, (k.x + a.x) / 2 + 10, (k.z + a.z) / 2, "Fresh and Honest");
  },
  computerCentre(ctx) {
    const b =
      byName(ctx, /central computer cent/i) ??
      byName(ctx, /computer cent|\bccc\b/i) ??
      byName(ctx, /information technology|computer science/i) ??
      byName(ctx, /library/i);
    return b ? { ...doorOf(ctx, b), name: b.name ?? "Computer Centre" } : null;
  },
  lhc(ctx) {
    const b = byName(ctx, /lecture hall|\blhc\b/i);
    return b ? { ...doorOf(ctx, b), name: "Lecture Hall Complex" } : null;
  },
  library(ctx) {
    const b = byName(ctx, /central library|library/i);
    return b ? { ...doorOf(ctx, b), name: "Central Library" } : null;
  },
  sja(ctx) {
    const b = byName(ctx, /jubilee|auditorium/i);
    return b ? { ...doorOf(ctx, b), name: "Silver Jubilee Auditorium" } : null;
  },
  sac(ctx) {
    const a = ctx.map.areas.find((q) => q.tags?.amenity === "theatre" || (q.name && /activity cent/i.test(q.name)));
    if (a) {
      const [x, z] = centroid(a.outer);
      const box = orientedBox(a.outer);
      // Stand on the open side of the bowl (away from the tiers), facing the stage.
      const s = free(ctx, x - Math.cos(box.angle) * (box.len / 2 + 10), z - Math.sin(box.angle) * (box.len / 2 + 10), "Students' Activity Centre");
      return { ...s, face: Math.atan2(x - s.x, z - s.z) };
    }
    const sja = get(ctx, "sja");
    return { ...sja, name: "Students' Activity Centre" };
  },
  mainGround(ctx) {
    const named = ctx.map.areas.find((q) => q.name && /main ground 1/i.test(q.name));
    if (named) {
      const [x, z] = centroid(named.outer);
      return free(ctx, x, z, named.name!);
    }
    const a = ctx.map.areas.filter((q) => (q.kind === "pitch" || q.kind === "track") && q.name && /ground/i.test(q.name)).sort((p, q) => {
      const pa = orientedBox(p.outer);
      const qa = orientedBox(q.outer);
      return qa.len * qa.wid - pa.len * pa.wid;
    })[0];
    if (!a) return null;
    const [x, z] = centroid(a.outer);
    return free(ctx, x, z, a.name ?? "Main Ground");
  },
  lighthouse(ctx) {
    const l = ctx.map.lighthouse;
    return l ? free(ctx, l[0], l[1], "Surathkal Lighthouse") : null;
  },
  lighthouseView(ctx) {
    const l = ctx.map.lighthouse;
    if (!l) return get(ctx, "beach");
    // The seaward brow of the hill, clear of the hives at the tower's foot.
    const coast = nearestCoast(ctx, l);
    const dx = coast[0] - l[0];
    const dz = coast[1] - l[1];
    const d = Math.hypot(dx, dz) || 1;
    const k = Math.min(18, d * 0.6);
    const s = free(ctx, l[0] + (dx / d) * k, l[1] + (dz / d) * k, "Lighthouse hill");
    return { ...s, face: Math.atan2(dx, dz) };
  },
  coop(ctx) {
    const b = byName(ctx, /co-?operative society|\bco-?op\b/i);
    if (b) return { ...doorOf(ctx, b), name: "NITK Co-operative Society" };
    const f = get(ctx, "freshHonest");
    return { ...f, name: "NITK Co-operative Society" };
  },
  sbi(ctx) {
    const b = byName(ctx, /state bank|\bsbi\b/i);
    if (b) return { ...doorOf(ctx, b), name: "State Bank of India" };
    const a = get(ctx, "academicSection");
    return free(ctx, a.x + 40, a.z + 20, "State Bank of India");
  },
  flagpole(ctx) {
    // The Main Building's flagpole (landmarks.ts plants one at any OSM flagpole).
    const c = mainBuildingCentre(ctx);
    const pole = ctx.map.pois.filter((p) => p.kind === "flagpole").sort((a, b) => Math.hypot(a.x - c[0], a.z - c[1]) - Math.hypot(b.x - c[0], b.z - c[1]))[0];
    if (pole) {
      const s = free(ctx, pole.x + 4, pole.z + 3, "The flagpole, Main Building");
      return { ...s, face: Math.atan2(pole.x - s.x, pole.z - s.z) };
    }
    const a = get(ctx, "academicSection");
    return { ...free(ctx, a.x + 10, a.z, "The flagpole, Main Building") };
  },
  nightCanteen(ctx) {
    const b = byName(ctx, /night canteen/i);
    if (b) return { ...doorOf(ctx, b), name: "Night Canteen" };
    const n = get(ctx, "nescafe");
    return free(ctx, n.x + 15, n.z + 10, "Night Canteen");
  },
  // Inside the walk-in buildings (world/interiors.ts): a few metres in from the front door.
  lobby(ctx) {
    return inside(ctx, /^NITK Main Building$|main building/i, 9, "Main Building lobby", true) ?? get(ctx, "academicSection");
  },
  libraryDesk(ctx) {
    return inside(ctx, /^NITK Central Library$|central library/i, 6, "Issue desk, Central Library") ?? get(ctx, "library");
  },
  lhcClass(ctx) {
    return inside(ctx, /^Lecture Hall Complex A$/i, 8, "Classroom, LHC-A") ?? get(ctx, "lhc");
  },
  sjaHall(ctx) {
    return inside(ctx, /^Silver Jubilee Auditorium$/i, 8, "Silver Jubilee Auditorium") ?? get(ctx, "sja");
  },
  labDesk(ctx) {
    return inside(ctx, /^Central Computer Cent/i, 7, "Computer lab, Central Computer Centre") ?? get(ctx, "computerCentre");
  },
  lhcC(ctx) {
    return inside(ctx, /^Lecture Hall Complex - ?C$/i, 8, "Classroom, LHC-C") ?? get(ctx, "lhc");
  },
  lhcD(ctx) {
    return inside(ctx, /^Lecture Hall Complex D$/i, 8, "Classroom, LHC-D") ?? get(ctx, "lhc");
  },
  // The Science Block: the Chemistry and Physics departments, where first-year labs run.
  scienceBlock(ctx) {
    return inside(ctx, /chemistry and physics|department of chemistry/i, 7, "Chemistry Lab, Science Block") ?? get(ctx, "lhc");
  },
  beach(ctx) {
    const lm = ctx.world.places.find((q) => /nitk beach/i.test(q.name));
    const from: Pt = lm ? [lm.x, lm.z] : [ctx.world.spawn.x, ctx.world.spawn.z];
    const c = nearestCoast(ctx, from);
    const toLand = mainBuildingCentre(ctx);
    const dx = toLand[0] - c[0];
    const dz = toLand[1] - c[1];
    const d = Math.hypot(dx, dz) || 1;
    return free(ctx, c[0] + (dx / d) * 12, c[1] + (dz / d) * 12, "NITK Beach");
  },
};

function nearestCoast(ctx: Ctx, p: Pt): Pt {
  let best: Pt = [p[0] - 300, p[1]];
  let bd = Infinity;
  const b = ctx.map.bounds;
  for (const line of ctx.map.coast) {
    for (let i = 1; i < line.length; i++) {
      const [a, c] = [line[i - 1], line[i]];
      const steps = Math.max(1, Math.ceil(Math.hypot(c[0] - a[0], c[1] - a[1]) / 10));
      for (let k = 0; k <= steps; k++) {
        const q: Pt = [a[0] + ((c[0] - a[0]) * k) / steps, a[1] + ((c[1] - a[1]) * k) / steps];
        if (q[0] < b.minX || q[0] > b.maxX || q[1] < b.minZ || q[1] > b.maxZ) continue;
        const d = Math.hypot(q[0] - p[0], q[1] - p[1]);
        if (d < bd) {
          bd = d;
          best = q;
        }
      }
    }
  }
  return best;
}

/** The nearest walkable point inside a building, `depth` metres in from its front door. */
function inside(ctx: Ctx, re: RegExp, depth: number, name: string, main = false): Spot | null {
  const b = findByName(ctx.map, re);
  if (!b) return null;
  const f = main ? mainEntrance(ctx.map, b) : frontOf(ctx.map, b);
  const x0 = f.x - f.nx * depth;
  const z0 = f.z - f.nz * depth;
  const g = ctx.world.grid;
  const ok = (x: number, z: number) => pointInPoly(x, z, b.outer) && !b.holes.some((h) => pointInPoly(x, z, h)) && !g.blocked(x, z);
  for (let r = 0; r < 20; r += 0.5) {
    const n = Math.max(1, Math.ceil(r * 6));
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2;
      const x = x0 + Math.cos(a) * r;
      const z = z0 + Math.sin(a) * r;
      if (ok(x, z) && ok(x + 0.5, z) && ok(x - 0.5, z) && ok(x, z + 0.5) && ok(x, z - 0.5)) return { x, z, name, face: Math.atan2(f.nx, f.nz) };
    }
  }
  return null;
}

function get(ctx: Ctx, key: PlaceKey): Spot {
  const hit = ctx.cache.get(key);
  if (hit) return hit;
  const s = RESOLVERS[key](ctx) ?? { x: ctx.world.spawn.x, z: ctx.world.spawn.z, name: key };
  ctx.cache.set(key, s);
  return s;
}

export class Places {
  private ctx: Ctx;
  constructor(map: CampusMap, world: World) {
    this.ctx = { map, world, cache: new Map() };
  }
  get(key: PlaceKey): Spot {
    return get(this.ctx, key);
  }

  /** `n` walkable spots inside a building's footprint, at least `gap` m apart (same every time for a seed). */
  within(re: RegExp, n: number, seed: number, gap = 4, name = ""): Spot[] {
    const b = findByName(this.ctx.map, re);
    if (!b) return [];
    const g = this.ctx.world.grid;
    const box = orientedBox(b.outer);
    const rand = mulberry32(seed);
    const out: Spot[] = [];
    for (let tries = 0; tries < 800 && out.length < n; tries++) {
      const u = (rand() - 0.5) * box.len;
      const v = (rand() - 0.5) * box.wid;
      const x = box.cx + u * Math.cos(box.angle) - v * Math.sin(box.angle);
      const z = box.cz + u * Math.sin(box.angle) + v * Math.cos(box.angle);
      if (!pointInPoly(x, z, b.outer) || b.holes.some((h) => pointInPoly(x, z, h))) continue;
      if (g.blocked(x, z) || g.blocked(x + 0.6, z) || g.blocked(x - 0.6, z) || g.blocked(x, z + 0.6) || g.blocked(x, z - 0.6)) continue;
      if (out.some((o) => Math.hypot(o.x - x, o.z - z) < gap)) continue;
      out.push({ x, z, name: name || (b.name ?? "") });
    }
    return out;
  }

  /** `n` walkable, dry spots within `r` m of a place, at least `gap` m apart. */
  around(key: PlaceKey, n: number, r: number, seed: number, gap = 6, name = ""): Spot[] {
    const c = this.get(key);
    const g = this.ctx.world.grid;
    const rand = mulberry32(seed);
    const out: Spot[] = [];
    for (let tries = 0; tries < 1200 && out.length < n; tries++) {
      const a = rand() * Math.PI * 2;
      const d = Math.sqrt(rand()) * r;
      const x = c.x + Math.cos(a) * d;
      const z = c.z + Math.sin(a) * d;
      if (g.blocked(x, z) || g.get(x, z) & WATER) continue;
      if (out.some((o) => Math.hypot(o.x - x, o.z - z) < gap)) continue;
      out.push({ x, z, name: name || c.name });
    }
    return out;
  }
}
