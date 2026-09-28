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
export function drawMapBase(
  g: CanvasRenderingContext2D,
  map: CampusMap,
  X: (x: number) => number,
  Z: (z: number) => number,
  scale: number,
  buildingKind: (i: number) => PlaceKind | null,
  walls: [number, number][][]
) {
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

  // Compound walls: cream, like the real ones, over a dark casing.
  g.lineCap = "butt";
  for (const [colour, w] of [[MAP_STYLE.casing, Math.max(2.4, 0.9 * scale)], ["#e6dfcb", Math.max(1.2, 0.45 * scale)]] as const) {
    g.strokeStyle = colour;
    g.lineWidth = w;
    for (const pts of walls) {
      g.beginPath();
      path(pts, false);
      g.stroke();
    }
  }
  g.lineCap = "round";
}
