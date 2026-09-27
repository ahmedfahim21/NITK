/**
 * Per-building overrides from public/data/overrides.json (committed), keyed
 * by OSM id ("way/123" or "relation/456"). Anything here wins over OSM tags
 * and the builder's defaults. Improving OSM itself is still the
 * best fix (building:levels, roof:shape, building:colour, name) because
 * everyone benefits; overrides are for what OSM can't hold, like custom models.
 */
import type { Building, CampusMap } from "../osm/types";

export type ModelRef = {
  /** Path under public/, e.g. "models/main-building.glb" (or a blob: URL while testing). */
  url: string;
  /** Original file name when dropped in, for the export. */
  file?: string;
  scale?: number;
  /** Degrees about the vertical, added to the footprint's long-axis angle. */
  rotation?: number;
  /** Metres from the footprint centroid: [x, y, z] in the footprint's frame. */
  offset?: [number, number, number];
  /** Keep the extruded footprint visible under the model. Default false. */
  keepFootprint?: boolean;
};

export type BuildingOverride = {
  name?: string;
  levels?: number;
  height?: number;
  minHeight?: number;
  style?: string;
  colour?: string;
  roofShape?: string;
  roofColour?: string;
  hidden?: boolean;
  model?: ModelRef;
  note?: string;
};

export type Overrides = { version: 1; buildings: Record<string, BuildingOverride> };

const FLOOR = 3.4;

export function osmKey(b: Building): string {
  return `${b.osmType}/${b.id}`;
}

let committed: Overrides = { version: 1, buildings: {} };

/** The committed overrides file. A missing file means no overrides; a broken one throws. */
export async function loadOverrides(): Promise<Overrides> {
  const res = await fetch("./data/overrides.json", { cache: "no-cache" });
  if (res.status === 404) return committed;
  if (!res.ok) throw new Error(`overrides.json: HTTP ${res.status}`);
  const type = res.headers.get("content-type") ?? "";
  // Vite's dev server answers a missing file with index.html.
  if (!type.includes("json")) return committed;
  committed = (await res.json()) as Overrides;
  return committed;
}

export function merged(): Overrides {
  return committed;
}

function applyOverride(b: Building, o: BuildingOverride | undefined) {
  if (!o) return;
  if (o.name !== undefined) b.name = o.name;
  if (o.levels !== undefined) {
    b.levels = o.levels;
    if (o.height === undefined) b.height = o.levels * FLOOR + (o.levels > 1 ? 0.6 : 0.4);
  }
  if (o.height !== undefined) b.height = o.height;
  if (o.minHeight !== undefined) b.minHeight = o.minHeight;
  if (o.style !== undefined) b.style = o.style;
  if (o.colour !== undefined) b.colour = o.colour;
  if (o.roofShape !== undefined) b.roofShape = o.roofShape === "auto" ? undefined : o.roofShape;
  if (o.roofColour !== undefined) b.roofColour = o.roofColour;
  b.hidden = !!o.hidden || (!!o.model && !o.model.keepFootprint);
}

export function applyOverrides(map: CampusMap, ov: Overrides) {
  for (const b of map.buildings) applyOverride(b, ov.buildings[osmKey(b)]);
}
