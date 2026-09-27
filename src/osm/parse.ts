/**
 * Compiles a raw Overpass extract into the CampusMap the world is built from:
 * everything projected to metres, clipped to the map square, classified, and
 * given sensible defaults where OSM is silent (building heights, road widths).
 *
 * Map data (c) OpenStreetMap contributors, ODbL 1.0.
 */
import {
  centroid,
  cleanRing,
  clipPolygon,
  clipPolyline,
  hash,
  mapBounds,
  pointInPoly,
  polyArea,
  project,
  type Pt,
} from "../geo";
import type {
  Area,
  AreaKind,
  Barrier,
  Building,
  CampusMap,
  LatLon,
  MapSource,
  OsmJson,
  OsmRelation,
  OsmWay,
  Poi,
  Road,
  RoadKind,
  Tags,
  Tree,
  Waterway,
} from "./types";

const ROAD_KINDS: Record<string, { kind: RoadKind; width: number; rank: number }> = {
  motorway: { kind: "trunk", width: 12, rank: 9 },
  trunk: { kind: "trunk", width: 12, rank: 9 },
  motorway_link: { kind: "primary", width: 7, rank: 8 },
  trunk_link: { kind: "primary", width: 7, rank: 8 },
  primary: { kind: "primary", width: 10, rank: 8 },
  primary_link: { kind: "primary", width: 7, rank: 8 },
  secondary: { kind: "secondary", width: 8.5, rank: 7 },
  secondary_link: { kind: "secondary", width: 6.5, rank: 7 },
  tertiary: { kind: "tertiary", width: 7, rank: 6 },
  tertiary_link: { kind: "tertiary", width: 6, rank: 6 },
  unclassified: { kind: "residential", width: 6, rank: 5 },
  residential: { kind: "residential", width: 5.5, rank: 5 },
  living_street: { kind: "residential", width: 5, rank: 5 },
  road: { kind: "residential", width: 5.5, rank: 5 },
  service: { kind: "service", width: 4, rank: 4 },
  track: { kind: "track", width: 3.2, rank: 3 },
  pedestrian: { kind: "pedestrian", width: 5, rank: 3 },
  footway: { kind: "footway", width: 2, rank: 2 },
  path: { kind: "footway", width: 1.8, rank: 2 },
  bridleway: { kind: "footway", width: 2, rank: 2 },
  cycleway: { kind: "cycleway", width: 2.2, rank: 2 },
  steps: { kind: "steps", width: 2.4, rank: 2 },
  corridor: { kind: "footway", width: 2, rank: 2 },
};

function num(v: string | undefined): number | undefined {
  if (!v) return undefined;
  const m = v.replace(",", ".").match(/-?\d+(\.\d+)?/);
  if (!m) return undefined;
  let n = parseFloat(m[0]);
  if (/ft|'/.test(v)) n *= 0.3048;
  return Number.isFinite(n) ? n : undefined;
}

function projectLine(g: LatLon[] | undefined): Pt[] {
  return (g ?? []).map((q) => project(q.lat, q.lon));
}

function isClosed(g: LatLon[] | undefined): boolean {
  if (!g || g.length < 4) return false;
  const a = g[0];
  const b = g[g.length - 1];
  return a.lat === b.lat && a.lon === b.lon;
}

/** Joins open member ways of a multipolygon into closed rings. */
function assembleRings(parts: Pt[][]): Pt[][] {
  const rings: Pt[][] = [];
  const open = parts.filter((p) => p.length >= 2).map((p) => [...p]);
  const same = (a: Pt, b: Pt) => Math.abs(a[0] - b[0]) < 0.01 && Math.abs(a[1] - b[1]) < 0.01;
  while (open.length) {
    let ring = open.shift()!;
    let grew = true;
    while (!same(ring[0], ring[ring.length - 1]) && grew) {
      grew = false;
      for (let i = 0; i < open.length; i++) {
        const p = open[i];
        const end = ring[ring.length - 1];
        if (same(p[0], end)) ring = ring.concat(p.slice(1));
        else if (same(p[p.length - 1], end)) ring = ring.concat([...p].reverse().slice(1));
        else if (same(p[p.length - 1], ring[0])) ring = p.concat(ring.slice(1));
        else if (same(p[0], ring[0])) ring = [...p].reverse().concat(ring.slice(1));
        else continue;
        open.splice(i, 1);
        grew = true;
        break;
      }
    }
    if (ring.length >= 4) rings.push(cleanRing(ring));
  }
  return rings;
}

function areaKind(t: Tags): AreaKind | null {
  if (t.amenity === "university" || t.amenity === "college" || t.landuse === "education") return "campus";
  if (t.amenity === "school" || t.amenity === "kindergarten") return "campus";
  if (t.leisure === "swimming_pool" || t.amenity === "swimming_pool") return "pool";
  if (t.natural === "water" || t.landuse === "reservoir" || t.landuse === "basin" || t.water || t.waterway === "riverbank")
    return "water";
  if (t.natural === "beach" || t.natural === "sand" || t.surface === "sand") return "sand";
  if (t.natural === "bare_rock" || t.natural === "rock" || t.natural === "cliff") return "rock";
  if (t.natural === "wetland" || t.landuse === "salt_pond") return "wetland";
  if (t.natural === "wood" || t.landuse === "forest" || t.landuse === "orchard" || t.landuse === "plant_nursery")
    return "forest";
  if (t.natural === "scrub" || t.natural === "heath") return "scrub";
  if (t.leisure === "pitch") return "pitch";
  if (t.leisure === "track") return "track";
  if (t.leisure === "stadium" || t.leisure === "sports_centre") return "grass";
  if (t.leisure === "garden") return "garden";
  if (t.leisure === "park" || t.leisure === "playground" || t.leisure === "recreation_ground") return "park";
  if (
    t.landuse === "grass" ||
    t.landuse === "meadow" ||
    t.landuse === "recreation_ground" ||
    t.landuse === "village_green" ||
    t.natural === "grassland"
  )
    return "grass";
  if (t.landuse === "farmland" || t.landuse === "farmyard" || t.landuse === "allotments") return "farmland";
  if (t.landuse === "residential") return "residential";
  if (t.landuse === "commercial" || t.landuse === "retail") return "commercial";
  if (t.landuse === "construction" || t.landuse === "brownfield" || t.landuse === "industrial") return "dirt";
  if (t.amenity === "parking") return "parking";
  // Open-air theatres (the Students' Activity Centre) are paved bowls.
  if (t.amenity === "theatre" && !t.building) return "plaza";
  if ((t.highway === "pedestrian" && t.area === "yes") || t.place === "square" || t.amenity === "marketplace")
    return "plaza";
  return null;
}

function buildingLevels(t: Tags, name: string, area: number, campus: boolean, id: number): number {
  const lv = num(t["building:levels"]);
  if (lv) return Math.max(1, Math.round(lv));
  const type = t.building ?? "yes";
  const h = hash(id);
  if (/mega\s*tower/i.test(name)) return 11;
  if (/hostel|block|residence/i.test(name) && campus) return 4;
  switch (type) {
    case "house":
    case "detached":
    case "semidetached_house":
    case "bungalow":
      return 1 + (h % 3 === 0 ? 1 : 0);
    case "hut":
    case "shed":
    case "garage":
    case "garages":
    case "kiosk":
    case "toilets":
    case "service":
    case "roof":
    case "carport":
    case "transformer_tower":
      return 1;
    case "dormitory":
    case "apartments":
    case "hotel":
      return 4;
    case "university":
    case "college":
    case "school":
    case "office":
    case "hospital":
    case "public":
    case "government":
      return 3;
    case "commercial":
    case "retail":
      return 2;
    case "industrial":
    case "warehouse":
      return 1;
  }
  if (campus) {
    if (area > 1500) return 3;
    if (area > 300) return 2 + (h % 2);
    if (area > 80) return 2;
    return 1;
  }
  if (area > 600) return 3;
  if (area > 150) return 1 + (h % 3 === 0 ? 1 : 0) + (h % 5 === 0 ? 1 : 0);
  return 1 + (h % 4 === 0 ? 1 : 0);
}

const FLOOR = 3.4;

export function parseOsm(json: OsmJson, source: MapSource): CampusMap {
  const bounds = mapBounds();
  const big = {
    minX: bounds.minX - 5000,
    maxX: bounds.maxX + 5000,
    minZ: bounds.minZ - 5000,
    maxZ: bounds.maxZ + 5000,
  };
  const inBounds = (p: Pt) =>
    p[0] >= bounds.minX && p[0] <= bounds.maxX && p[1] >= bounds.minZ && p[1] <= bounds.maxZ;

  const roads: Road[] = [];
  const areas: Area[] = [];
  const rawBuildings: { id: number; osmType: "way" | "relation"; outer: Pt[]; holes: Pt[][]; tags: Tags }[] = [];
  const trees: Tree[] = [];
  const pois: Poi[] = [];
  const barriers: Barrier[] = [];
  const waterways: Waterway[] = [];
  const coastParts: Pt[][] = [];
  const campus: Pt[][] = [];
  let lighthouse: Pt | undefined;

  const pushArea = (id: number, outer: Pt[], holes: Pt[][], t: Tags, kind: AreaKind) => {
    const clipped = clipPolygon(outer, bounds);
    if (clipped.length < 3 || polyArea(clipped) < 4) return;
    const a: Area = { id, outer: clipped, holes: holes.map((h) => clipPolygon(h, bounds)).filter((h) => h.length >= 3), kind };
    if (t.name) a.name = t.name;
    if (t.sport) a.sport = t.sport;
    if (t.amenity) a.tags = { amenity: t.amenity, ...(t["theatre:type"] ? { "theatre:type": t["theatre:type"] } : {}) };
    if (/coconut|palm|areca/i.test(t.trees ?? "")) a.leaf = "palm";
    else if (t.leaf_type === "needleleaved") a.leaf = "needle";
    areas.push(a);
    if (kind === "campus" && (t.amenity === "university" || t.amenity === "college")) campus.push(outer);
  };

  const handleWay = (w: OsmWay) => {
    const t = w.tags ?? {};
    const pts = projectLine(w.geometry);
    if (pts.length < 2) return;
    const closed = isClosed(w.geometry);

    if (t.building && t.building !== "no") {
      if (closed) rawBuildings.push({ id: w.id, osmType: "way", outer: cleanRing(pts), holes: [], tags: t });
      return;
    }
    if (t["building:part"]) return;

    if (t.man_made === "lighthouse") {
      lighthouse = centroid(cleanRing(pts));
      return;
    }
    if (t.natural === "coastline") {
      coastParts.push(pts);
      return;
    }
    if (t.natural === "tree_row") {
      for (const seg of clipPolyline(pts, bounds)) {
        for (let i = 1; i < seg.length; i++) {
          const [a, b] = [seg[i - 1], seg[i]];
          const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
          for (let d = 0; d < len; d += 7) {
            const f = d / len;
            trees.push({ x: a[0] + (b[0] - a[0]) * f, z: a[1] + (b[1] - a[1]) * f, kind: "broad" });
          }
        }
      }
      return;
    }

    const hw = t.highway ? ROAD_KINDS[t.highway] : undefined;
    if (hw && !(closed && t.area === "yes")) {
      if (t.access === "no" && t.highway === "service" && t.service === "parking_aisle") return;
      const width = num(t.width) ?? (t.lanes ? Math.max(hw.width * 0.6, num(t.lanes)! * 3.3) : hw.width);
      const oneway = t.oneway === "yes" || t.oneway === "1";
      for (const seg of clipPolyline(pts, bounds)) {
        roads.push({
          id: w.id,
          pts: seg,
          kind: hw.kind,
          width: hw.kind === "trunk" && oneway ? Math.min(width, 8) : width,
          name: t.name,
          oneway,
          rank: hw.rank,
          bridge: t.bridge === "yes",
        });
      }
      return;
    }

    if (t.barrier === "wall" || t.barrier === "fence" || t.barrier === "hedge" || t.barrier === "retaining_wall") {
      for (const seg of clipPolyline(pts, bounds))
        barriers.push({ pts: seg, kind: t.barrier === "fence" ? "fence" : t.barrier === "hedge" ? "hedge" : "wall" });
      return;
    }

    if (t.waterway && !closed) {
      const width = num(t.width) ?? (t.waterway === "river" ? 20 : t.waterway === "canal" ? 6 : 2.5);
      for (const seg of clipPolyline(pts, bounds)) waterways.push({ pts: seg, width });
      return;
    }

    if (closed) {
      const kind = areaKind(t);
      if (kind) pushArea(w.id, cleanRing(pts), [], t, kind);
      else if (t.name) {
        // Named places mapped as outlines (shelters, institutional areas): keep them findable.
        const c = centroid(cleanRing(pts));
        if (inBounds(c)) pois.push({ x: c[0], z: c[1], name: t.name, kind: t.amenity ?? t.landuse ?? t.man_made ?? "place", tags: t });
      }
    }
  };

  const handleRelation = (r: OsmRelation) => {
    const t = r.tags ?? {};
    if (t.type !== "multipolygon" && !t.building) return;
    const outers = assembleRings(r.members.filter((m) => m.role !== "inner" && m.geometry).map((m) => projectLine(m.geometry)));
    const inners = assembleRings(r.members.filter((m) => m.role === "inner" && m.geometry).map((m) => projectLine(m.geometry)));
    for (const outer of outers) {
      const holes = inners.filter((h) => pointInPoly(h[0][0], h[0][1], outer));
      if (t.building && t.building !== "no") {
        rawBuildings.push({ id: r.id, osmType: "relation", outer, holes, tags: t });
        continue;
      }
      if (t.natural === "coastline") continue;
      const kind = areaKind(t);
      if (kind) pushArea(r.id, outer, holes, t, kind);
    }
  };

  for (const el of json.elements) {
    if (el.type === "way") handleWay(el);
    else if (el.type === "relation") handleRelation(el);
  }

  // Nodes last, so way-derived lighthouses win over a bare node.
  for (const el of json.elements) {
    if (el.type !== "node") continue;
    const t = el.tags ?? {};
    const p = project(el.lat, el.lon);
    if (t.man_made === "lighthouse" && !lighthouse) lighthouse = p;
    if (!inBounds(p)) continue;
    if (t.natural === "tree") {
      const palm = /cocos|palm|coconut|areca/i.test(`${t.genus ?? ""} ${t.species ?? ""} ${t.taxon ?? ""} ${t["species:en"] ?? ""}`);
      trees.push({ x: p[0], z: p[1], kind: palm ? "palm" : "broad" });
      continue;
    }
    const name = t.name ?? t["name:en"];
    if (!name && !t.man_made && !t.amenity) continue;
    const kind =
      t.amenity ?? t.tourism ?? t.shop ?? t.man_made ?? t.leisure ?? t.historic ?? t.highway ?? t.office ?? "place";
    pois.push({ x: p[0], z: p[1], name: name ?? "", kind, tags: t });
  }

  /* ---- buildings: classify, height, campus membership ---- */
  const campusRings = campus.length ? campus : [];
  const inCampus = (p: Pt) => campusRings.some((ring) => pointInPoly(p[0], p[1], ring));
  const buildings: Building[] = [];
  for (const b of rawBuildings) {
    if (b.outer.length < 3) continue;
    const c = centroid(b.outer);
    if (!inBounds(c)) continue;
    const t = b.tags;
    const name = t.name ?? t["name:en"] ?? "";
    const area = polyArea(b.outer);
    if (area < 6) continue;
    const isCampus = inCampus(c) || /nitk|department|hostel|lecture hall|library|auditorium/i.test(name);
    const levels = buildingLevels(t, name, area, isCampus, b.id);
    let height = num(t.height) ?? levels * FLOOR + (levels > 1 ? 0.6 : 0.4);
    let minHeight = num(t.min_height) ?? (num(t["building:min_level"]) ?? 0) * FLOOR;
    if (t.building === "roof" || t.building === "carport") {
      minHeight = Math.max(minHeight, 3);
      height = Math.max(height, 3.6);
    }
    if (t.man_made === "lighthouse" || t.building === "lighthouse") lighthouse = lighthouse ?? c;
    const out: Building = {
      id: b.id,
      osmType: b.osmType,
      outer: b.outer,
      holes: b.holes,
      height,
      minHeight: Math.min(minHeight, height - 1),
      levels,
      type: t.building,
      campus: isCampus,
      area,
      tags: t,
    };
    if (name) out.name = name;
    if (t["roof:shape"]) out.roofShape = t["roof:shape"];
    if (t["building:colour"]) out.colour = t["building:colour"];
    if (t["roof:colour"]) out.roofColour = t["roof:colour"];
    buildings.push(out);
  }

  /* ---- coast: stitch, extend to the horizon, split the big box ---- */
  const coast: Pt[][] = [];
  const sea: Pt[][] = [];
  const land: Pt[][] = [];
  if (coastParts.length) {
    const lines = stitchLines(coastParts);
    // The longest run is the shore that matters here.
    lines.sort((a, b) => b.length - a.length);
    const main = extendEnds(lines[0], 8000);
    const clipped = clipPolyline(main, big);
    const piece = clipped.sort((a, b) => b.length - a.length)[0];
    if (piece && piece.length >= 2) {
      coast.push(piece);
      const [a, b] = splitBox(piece, big);
      // OSM coastlines keep land on the left; test a point just right of the shore.
      const mid = Math.floor(piece.length / 2);
      const p0 = piece[Math.max(0, mid - 1)];
      const p1 = piece[Math.min(piece.length - 1, mid)];
      const dx = p1[0] - p0[0];
      const dz = p1[1] - p0[1];
      const l = Math.hypot(dx, dz) || 1;
      // In (x, z-south) the right-hand side of travel is (-dz, dx).
      const probe: Pt = [(p0[0] + p1[0]) / 2 - (dz / l) * 20, (p0[1] + p1[1]) / 2 + (dx / l) * 20];
      if (pointInPoly(probe[0], probe[1], a)) {
        sea.push(a);
        land.push(b);
      } else {
        sea.push(b);
        land.push(a);
      }
    }
  }
  if (!land.length) {
    land.push([
      [big.minX, big.minZ],
      [big.maxX, big.minZ],
      [big.maxX, big.maxZ],
      [big.minX, big.maxZ],
    ]);
  }

  // Beach sand and water bodies eat into land; nothing grows or stands in the sea.
  const inSea = (p: Pt) => sea.some((s) => pointInPoly(p[0], p[1], s));
  const keptTrees = trees.filter((t) => !inSea([t.x, t.z]));

  roads.sort((a, b) => a.rank - b.rank);

  return {
    source,
    bounds,
    roads,
    areas,
    buildings: buildings.filter((b) => !inSea(centroid(b.outer))),
    trees: keptTrees,
    pois,
    barriers,
    waterways,
    sea,
    land,
    coast,
    campus,
    lighthouse,
  };
}

function stitchLines(parts: Pt[][]): Pt[][] {
  const open = parts.map((p) => [...p]);
  const out: Pt[][] = [];
  const same = (a: Pt, b: Pt) => Math.abs(a[0] - b[0]) < 0.01 && Math.abs(a[1] - b[1]) < 0.01;
  while (open.length) {
    let line = open.shift()!;
    let grew = true;
    while (grew) {
      grew = false;
      for (let i = 0; i < open.length; i++) {
        const p = open[i];
        // Coastline ways share direction, so only head-to-tail joins are valid.
        if (same(p[0], line[line.length - 1])) line = line.concat(p.slice(1));
        else if (same(p[p.length - 1], line[0])) line = p.concat(line.slice(1));
        else continue;
        open.splice(i, 1);
        grew = true;
        break;
      }
    }
    out.push(line);
  }
  return out;
}

/** Straight extrapolation off both ends, so the sea reaches the horizon. */
function extendEnds(line: Pt[], dist: number): Pt[] {
  if (line.length < 2) return line;
  const ext = (a: Pt, b: Pt): Pt => {
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const l = Math.hypot(dx, dz) || 1;
    return [b[0] + (dx / l) * dist, b[1] + (dz / l) * dist];
  };
  // Use a longer baseline than one segment so a kink at the end does not swing the shore.
  const n = line.length;
  const headRef = line[Math.min(n - 1, 4)];
  const tailRef = line[Math.max(0, n - 5)];
  return [ext(headRef, line[0]), ...line, ext(tailRef, line[n - 1])];
}

type Box = { minX: number; maxX: number; minZ: number; maxZ: number };

/** Perimeter parameter of a point on the box edge, running minX,minZ -> maxX,minZ -> maxX,maxZ -> minX,maxZ. */
function perim(p: Pt, b: Box): number {
  const w = b.maxX - b.minX;
  const h = b.maxZ - b.minZ;
  const eps = 0.5;
  if (Math.abs(p[1] - b.minZ) < eps) return p[0] - b.minX;
  if (Math.abs(p[0] - b.maxX) < eps) return w + (p[1] - b.minZ);
  if (Math.abs(p[1] - b.maxZ) < eps) return w + h + (b.maxX - p[0]);
  return 2 * w + h + (b.maxZ - p[1]);
}

/** Splits the box along a polyline whose two ends lie on its edge. */
function splitBox(line: Pt[], b: Box): [Pt[], Pt[]] {
  const w = b.maxX - b.minX;
  const h = b.maxZ - b.minZ;
  const total = 2 * (w + h);
  const corners: { t: number; p: Pt }[] = [
    { t: 0, p: [b.minX, b.minZ] },
    { t: w, p: [b.maxX, b.minZ] },
    { t: w + h, p: [b.maxX, b.maxZ] },
    { t: 2 * w + h, p: [b.minX, b.maxZ] },
  ];
  const tEnd = perim(line[line.length - 1], b);
  const tStart = perim(line[0], b);
  // Walk forward (increasing t) from the end back round to the start.
  const walk = (from: number, to: number, forward: boolean): Pt[] => {
    const pts: Pt[] = [];
    const span = forward ? (to - from + total) % total : (from - to + total) % total;
    const list = corners
      .map((c) => ({ ...c, d: forward ? (c.t - from + total) % total : (from - c.t + total) % total }))
      .filter((c) => c.d > 0 && c.d < span)
      .sort((x, y) => x.d - y.d);
    for (const c of list) pts.push(c.p);
    return pts;
  };
  const a = [...line, ...walk(tEnd, tStart, true)];
  const c = [...line, ...walk(tEnd, tStart, false)];
  return [a, c];
}
