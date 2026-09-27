/**
 * Per-building overrides: the asset workbench's output.
 *
 * public/data/overrides.json (committed) is merged with edits kept in the
 * browser, keyed by OSM id ("way/123" or "relation/456"). Anything here wins
 * over OSM tags and the builder's defaults. Improving OSM itself is still the
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

const KEY = "nitk-overrides-v1";
const FLOOR = 3.4;

export function osmKey(b: Building): string {
  return `${b.osmType}/${b.id}`;
}

let base: Overrides = { version: 1, buildings: {} };
let local: Overrides = { version: 1, buildings: {} };

/** Committed overrides plus this browser's edits. */
export async function loadOverrides(): Promise<Overrides> {
  try {
    const res = await fetch("./data/overrides.json", { cache: "no-cache" });
    if (res.ok) base = (await res.json()) as Overrides;
  } catch {
    /* none committed */
  }
  try {
    local = JSON.parse(localStorage.getItem(KEY) ?? "null") ?? local;
  } catch {
    /* none local */
  }
  return merged();
}

export function merged(): Overrides {
  return { version: 1, buildings: { ...base.buildings, ...local.buildings } };
}

export function localEdits(): Overrides {
  return local;
}

export function setLocal(key: string, o: BuildingOverride | null) {
  if (o && Object.keys(o).length) local.buildings[key] = o;
  else delete local.buildings[key];
  try {
    localStorage.setItem(KEY, JSON.stringify(local));
  } catch {
    /* not persisted */
  }
}

export function clearLocal() {
  local = { version: 1, buildings: {} };
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* nothing */
  }
}

/** The file to commit as public/data/overrides.json. blob: model URLs become models/<file>. */
export function exportJson(): string {
  const all = merged();
  const out: Overrides = { version: 1, buildings: {} };
  for (const [k, o] of Object.entries(all.buildings)) {
    const c: BuildingOverride = JSON.parse(JSON.stringify(o));
    if (c.model?.url.startsWith("blob:")) c.model.url = `models/${c.model.file ?? "model.glb"}`;
    out.buildings[k] = c;
  }
  return JSON.stringify(out, null, 2);
}

type Snapshot = Pick<Building, "name" | "height" | "minHeight" | "levels" | "style" | "colour" | "roofShape" | "roofColour" | "hidden">;
const originals = new Map<number, Snapshot>();

function snapshot(b: Building): Snapshot {
  return {
    name: b.name,
    height: b.height,
    minHeight: b.minHeight,
    levels: b.levels,
    style: b.style,
    colour: b.colour,
    roofShape: b.roofShape,
    roofColour: b.roofColour,
    hidden: b.hidden,
  };
}

/** The building as OSM and the builder made it, before any override. */
export function original(b: Building): Snapshot {
  return originals.get(b.id) ?? snapshot(b);
}

export function applyOverride(b: Building, o: BuildingOverride | undefined) {
  if (!originals.has(b.id)) originals.set(b.id, snapshot(b));
  Object.assign(b, originals.get(b.id));
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
