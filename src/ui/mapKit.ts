/**
 * Shared by the minimap and the full map: the campus drawn from the OSM
 * data in a dark, coloured style (after SADAK's map), and what kind of place
 * each named place is: its colour, its icon, its name in the key.
 */
import type { AreaKind, CampusMap, RoadKind } from "../osm/types";
import type { IconId } from "./icons";

export const MAP_STYLE = {
  outside: "#12161c",
  ground: "#1c2128",
  campus: "#232a31",
  building: "#39424e",
  buildingEdge: "#262d36",
  casing: "#0d1014",
  sea: "#1b4f78",
  shore: "#4a92c6",
  vignette: "rgba(0,0,0,0.38)",
} as const;

const AREA_FILL: Partial<Record<AreaKind, string>> = {
  campus: MAP_STYLE.campus,
  residential: "#252a31",
  commercial: "#2e2a28",
  grass: "#2b4f33",
  park: "#2c5836",
  garden: "#2f5d39",
  forest: "#244a2d",
  scrub: "#34492e",
  farmland: "#3a4a2c",
  wetland: "#27463f",
  water: "#1e5a88",
  pool: "#2a7fb8",
  sand: "#7a6844",
  rock: "#5a4a42",
  pitch: "#3a6f3f",
  track: "#8a4f3d",
  parking: "#2e343c",
  plaza: "#30363f",
  dirt: "#4a3e2d",
};

/** Road fill by importance: the gold highway, pale campus roads, grey lanes. */
const ROAD_FILL: Record<RoadKind, string> = {
  trunk: "#f0c75e",
  primary: "#f0c75e",
  secondary: "#e3e8ee",
  tertiary: "#cfd6de",
  residential: "#a3adb8",
  service: "#8c96a2",
  track: "#9c7c5c",
  pedestrian: "#b9a58a",
  footway: "#7c8691",
  cycleway: "#6f93d6",
  steps: "#7c8691",
};

/* ------------------------------------------------------------------ *
 * Place kinds
 * ------------------------------------------------------------------ */

export type PlaceKind = "hostel" | "academic" | "food" | "sport" | "health" | "library" | "landmark" | "shop" | "worship" | "coast" | "other";

export const PLACE_KINDS: Record<PlaceKind, { label: string; colour: string; icon: IconId }> = {
  landmark: { label: "Landmarks", colour: "#e3bd52", icon: "landmark" },
  academic: { label: "Academics", colour: "#9b7be0", icon: "grad" },
  library: { label: "Library", colour: "#3ec7b0", icon: "library" },
  hostel: { label: "Hostels", colour: "#5b9bef", icon: "hostel" },
  food: { label: "Food", colour: "#ef8a3c", icon: "thali" },
  sport: { label: "Sport", colour: "#4cc16f", icon: "trophy" },
  health: { label: "Health", colour: "#ef5b6b", icon: "hospital" },
  shop: { label: "Shops, banks", colour: "#e377b5", icon: "store" },
  worship: { label: "Worship", colour: "#d99a6c", icon: "church" },
  coast: { label: "Coast", colour: "#4ab3e8", icon: "sea" },
  other: { label: "Other", colour: "#8a94a2", icon: "door" },
};

const BY_OSM_KIND: Record<string, PlaceKind> = {
  landmark: "landmark",
  pitch: "sport",
  track: "sport",
  sports_centre: "sport",
  fitness_centre: "sport",
  cafe: "food",
  restaurant: "food",
  fast_food: "food",
  bakery: "food",
  dairy: "food",
  canteen: "food",
  shop: "shop",
  convenience: "shop",
  clothes: "shop",
  bank: "shop",
  hairdresser: "shop",
  laundry: "shop",
  tailor: "shop",
  copyshop: "shop",
  clinic: "health",
  place_of_worship: "worship",
  hostel: "hostel",
  sand: "coast",
  research_institute: "academic",
  university: "academic",
  school: "academic",
};

/** What kind of place a named place is, by its name first and its OSM kind second. */
export function placeKind(name: string, osmKind: string): PlaceKind {
  const n = name.toLowerCase();
  if (/lighthouse|beach/.test(n)) return "coast";
  if (/library/.test(n)) return "library";
  if (/health|clinic|hospital/.test(n)) return "health";
  if (/temple|church/.test(n)) return "worship";
  if (/mess|canteen|food court|nescafe|nandini|nandhini|cafe|bakery|restaurant|amul|shawarma|stall|kitchen|crumbs/.test(n)) return "food";
  if (/hostel|block|\bgh-|tower|braahmagiri|pushpagiri|common room/.test(n) && !/lecture/.test(n)) return "hostel";
  if (/ground|gym|sports|pool|playground|chowk/.test(n)) return "sport";
  if (/department|lecture hall|lhc|school of|computer cent|research|lab|workshop|seminar|cids|csd|interdisciplinary|inter-disciplinary|step|wave fume/.test(n)) return "academic";
  if (/bank|co-?operative|post office|laundry|salon|parlour|tailor|store|computers|shop/.test(n)) return "shop";
  if (/main building|main gate|director|auditorium|activity cent|statue/.test(n)) return "landmark";
  return BY_OSM_KIND[osmKind] ?? "other";
}

/* ------------------------------------------------------------------ *
 * The base map
 * ------------------------------------------------------------------ */

const AREA_ORDER: AreaKind[] = ["campus", "residential", "commercial", "farmland", "dirt", "grass", "park", "scrub", "garden", "forest", "wetland", "sand", "rock", "track", "pitch", "parking", "plaza", "water", "pool"];

/**
 * The campus with X and Z turning metres into canvas pixels at `scale`
 * pixels per metre: ground and sea, green spaces and pitches, the roads in
 * their casings, buildings tinted by what they are, landmarks in gold.
 */
export function drawMapBase(g: CanvasRenderingContext2D, map: CampusMap, X: (x: number) => number, Z: (z: number) => number, scale: number, buildingKind: (i: number) => PlaceKind | null) {
  const path = (pts: [number, number][], close: boolean) => {
    pts.forEach(([x, z], i) => (i ? g.lineTo(X(x), Z(z)) : g.moveTo(X(x), Z(z))));
    if (close) g.closePath();
  };
  const b = map.bounds;
  g.fillStyle = MAP_STYLE.ground;
  g.fillRect(X(b.minX), Z(b.minZ), (b.maxX - b.minX) * scale, (b.maxZ - b.minZ) * scale);

  g.fillStyle = MAP_STYLE.sea;
  for (const s of map.sea) {
    g.beginPath();
    path(s, true);
    g.fill();
  }
  g.strokeStyle = MAP_STYLE.shore;
  g.lineWidth = Math.max(1, 1.2 * scale);
  for (const s of map.sea) {
    g.beginPath();
    path(s, true);
    g.stroke();
  }

  g.fillStyle = MAP_STYLE.campus;
  for (const c of map.campus) {
    g.beginPath();
    path(c, true);
    g.fill();
  }
  for (const k of AREA_ORDER) {
    g.fillStyle = AREA_FILL[k] ?? MAP_STYLE.campus;
    for (const a of map.areas) {
      if (a.kind !== k) continue;
      g.beginPath();
      path(a.outer, true);
      a.holes.forEach((h) => path(h, true));
      g.fill("evenodd");
    }
  }

  // Roads, smallest first, each in a dark casing; paths dashed, once there's room.
  g.lineCap = "round";
  g.lineJoin = "round";
  const roads = [...map.roads].sort((p, q) => p.rank - q.rank);
  const isPath = (k: RoadKind) => k === "footway" || k === "steps" || k === "cycleway";
  const width = (w: number) => Math.max(1.4, w * scale);
  const streets = roads.filter((r) => !isPath(r.kind));
  for (const r of streets) {
    g.beginPath();
    path(r.pts, false);
    g.strokeStyle = MAP_STYLE.casing;
    g.lineWidth = width(r.width) + Math.max(1.5, 1.2 * scale);
    g.stroke();
  }
  for (const r of streets) {
    g.beginPath();
    path(r.pts, false);
    g.strokeStyle = ROAD_FILL[r.kind];
    g.lineWidth = width(r.width);
    g.stroke();
  }
  if (scale >= 0.9) {
    g.setLineDash([Math.max(2, 1.6 * scale), Math.max(2, 1.6 * scale)]);
    g.lineWidth = Math.max(1, 0.8 * scale);
    for (const r of roads) {
      if (!isPath(r.kind)) continue;
      g.strokeStyle = ROAD_FILL[r.kind];
      g.beginPath();
      path(r.pts, false);
      g.stroke();
    }
    g.setLineDash([]);
  }

  // Buildings, tinted by what they are; landmarks outlined in gold.
  map.buildings.forEach((bl, i) => {
    const k = buildingKind(i);
    g.beginPath();
    path(bl.outer, true);
    bl.holes.forEach((h) => path(h, true));
    g.fillStyle = MAP_STYLE.building;
    g.fill("evenodd");
    if (k) {
      g.fillStyle = PLACE_KINDS[k].colour;
      g.globalAlpha = k === "landmark" ? 0.42 : 0.3;
      g.fill("evenodd");
      g.globalAlpha = 1;
    }
    g.strokeStyle = k === "landmark" ? "#f0cf6a" : MAP_STYLE.buildingEdge;
    g.lineWidth = k === "landmark" ? Math.max(1, 0.5 * scale) : 1;
    g.stroke();
  });
}

/* ------------------------------------------------------------------ *
 * The mapped region: the campus, plus the beach and the lighthouse hill
 * ------------------------------------------------------------------ */

export type Region = {
  polys: [number, number][][];
  /** Just the campus boundary, for the dashed wall line. */
  campus: [number, number][][];
  bounds: { minX: number; minZ: number; maxX: number; maxZ: number };
  contains(x: number, z: number): boolean;
  /** Adds the region to the current path, every ring wound the same way so a nonzero clip is their union. */
  trace(g: CanvasRenderingContext2D, X: (x: number) => number, Z: (z: number) => number): void;
};

const signedArea = (r: [number, number][]) => r.reduce((s, [x, z], i) => {
  const [x2, z2] = r[(i + 1) % r.length];
  return s + x * z2 - x2 * z;
}, 0);

/**
 * The campus boundary from OSM, and one coastal strip: the beach west of
 * the campus from its southern end to just past the lighthouse, with a
 * margin of sea. The ways between the campus halves are mapped as narrow
 * corridors only: NH66 where it runs past the campus, its two underpasses
 * and the foot overbridge. Nothing else beyond the campus wall is.
 */
export function mapRegion(map: CampusMap, lighthouse: { x: number; z: number } | null): Region {
  const polys: [number, number][][] = map.campus.map((c) => [...c]);
  const beach = map.areas.find((a) => a.kind === "sand" && /beach/i.test(a.name ?? ""));
  if (beach || lighthouse) {
    const xs = [...(beach?.outer.map((p) => p[0]) ?? []), ...(lighthouse ? [lighthouse.x] : [])];
    const zs = [...(beach?.outer.map((p) => p[1]) ?? []), ...(lighthouse ? [lighthouse.z] : [])];
    const minX = Math.min(...xs) - 220;
    const maxX = Math.max(...xs) + 30;
    const minZ = Math.min(...zs) - 40;
    const maxZ = lighthouse ? lighthouse.z + 140 : Math.max(...zs);
    polys.push([[minX, minZ], [maxX, minZ], [maxX, maxZ], [minX, maxZ]]);
  }
  if (!polys.length) throw new Error("[map] OSM has no campus boundary to map");

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
  let connectors = 0;
  for (const r of map.roads) {
    const nh66 = r.kind === "trunk";
    const link = /underpass|overpass/i.test(r.name ?? "");
    if (!nh66 && !link) continue;
    for (let i = 1; i < r.pts.length; i++) {
      const a = r.pts[i - 1];
      const b = r.pts[i];
      // NH66 only where it runs along the campus wall.
      if (nh66 && !(nearCampus(a, 45) && nearCampus(b, 45))) continue;
      corridor(a, b, r.width / 2 + (nh66 ? 4 : 6));
      connectors++;
    }
  }
  if (!connectors) console.warn("[map] no NH66, underpass or overbridge ways found to connect the campus halves");
  for (const r of polys) if (signedArea(r) < 0) r.reverse();
  const campus = polys.slice(0, map.campus.length);
  const all = [...campus, ...polys.slice(campus.length, campus.length + 1)].flat();
  const bounds = {
    minX: Math.min(...all.map((p) => p[0])) - 40,
    maxX: Math.max(...all.map((p) => p[0])) + 40,
    minZ: Math.min(...all.map((p) => p[1])) - 40,
    maxZ: Math.max(...all.map((p) => p[1])) + 40,
  };
  const inPoly = (x: number, z: number, r: [number, number][]) => {
    let inside = false;
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      const [xi, zi] = r[i];
      const [xj, zj] = r[j];
      if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
    }
    return inside;
  };
  return {
    polys,
    campus,
    bounds,
    contains: (x, z) => polys.some((r) => inPoly(x, z, r)),
    trace(g, X, Z) {
      for (const r of polys) {
        r.forEach(([x, z], i) => (i ? g.lineTo(X(x), Z(z)) : g.moveTo(X(x), Z(z))));
        g.closePath();
      }
    },
  };
}
