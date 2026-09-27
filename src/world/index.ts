/**
 * Builds the whole campus from a CampusMap and owns the per-frame world
 * updates (sea, lighthouse, flags, night glow).
 */
import * as THREE from "three";
import { centroid, clipPolygon, type Pt } from "../geo";
import type { CampusMap } from "../osm/types";
import type { Preset } from "../fx/presets";
import { CLEAR, Grid, PATH, ROAD, SOLID, WATER } from "./grid";
import { buildGround } from "./ground";
import { buildRoads } from "./roads";
import { buildBuildings } from "./buildings";
import { buildLandmarks } from "./landmarks";
import { buildTrees } from "./trees";
import { buildProps } from "./props";
import { clearMounds } from "./terrain";
import { ModelLayer } from "./models";
import { buildInteriors, interiorBuildings } from "./interiors";

export type Place = { name: string; x: number; z: number; y: number; kind: string };

export type World = {
  group: THREE.Group;
  grid: Grid;
  places: Place[];
  spawn: { x: number; z: number; facing: number };
  stats: { buildings: number; roads: number; trees: number };
  /** Season visuals: land tint, sea state, foliage tint, summer blossoms. */
  setSeason(s: { grass: [number, number, number]; foliage: [number, number, number]; sea: number; blossom: boolean }): void;
  /** The walk-in room the player is in (cutaway on), or null. */
  interior(pos: THREE.Vector3): string | null;
  apply(p: Preset): void;
  update(t: number, cam?: THREE.Vector3): void;
};

export function buildWorld(map: CampusMap): World {
  clearMounds();
  const b = map.bounds;
  const grid = new Grid(b.minX, b.minZ, b.maxX, b.maxZ, 1);
  const group = new THREE.Group();

  /* ---- occupancy ---- */
  const box = { minX: b.minX - 2, maxX: b.maxX + 2, minZ: b.minZ - 2, maxZ: b.maxZ + 2 };
  for (const s of map.sea) {
    const clipped = clipPolygon(s, box);
    if (clipped.length >= 3) grid.fillPolygon([clipped], WATER);
  }
  for (const a of map.areas) {
    if (a.kind === "water" || a.kind === "pool") grid.fillPolygon([a.outer, ...a.holes], WATER);
    else if (a.kind === "pitch" || a.kind === "track" || a.kind === "parking" || a.kind === "plaza" || a.kind === "sand")
      grid.fillPolygon([a.outer, ...a.holes], CLEAR);
  }
  for (const c of map.coast) grid.strokeLine(c, 50, CLEAR);
  for (const w of map.waterways) grid.strokeLine(w.pts, w.width, WATER);
  for (const r of map.roads) {
    const path = r.kind === "footway" || r.kind === "steps" || r.kind === "cycleway";
    if (r.bridge && path) continue;
    grid.strokeLine(r.pts, r.width + (path ? 0.5 : 2), path ? PATH : ROAD);
  }
  for (const r of map.roads) {
    if (!r.bridge) continue;
    // Clear the water flag under bridges.
    for (const p of r.pts) grid.clear(p[0], p[1], r.width / 2, WATER);
  }

  /* ---- landmarks first: they claim some footprints and raise terrain ---- */
  const landmarks = buildLandmarks(map, grid);
  const skip = new Set<number>();
  if (map.lighthouse) {
    for (const bl of map.buildings) {
      const c = centroid(bl.outer);
      if (Math.hypot(c[0] - map.lighthouse[0], c[1] - map.lighthouse[1]) < 6 || bl.tags.man_made === "lighthouse") skip.add(bl.id);
    }
  }
  // Walk-in buildings get walls and a doorway in the grid instead of a solid block.
  const rooms = interiorBuildings(map);
  const roomIds = new Set(rooms.map((r) => r.b.id));
  for (const bl of map.buildings) {
    if (skip.has(bl.id) || roomIds.has(bl.id)) continue;
    if (bl.minHeight >= 2.5) {
      grid.fillPolygon([bl.outer, ...bl.holes], 0, bl.height);
      continue;
    }
    grid.fillPolygon([bl.outer, ...bl.holes], SOLID, bl.height);
  }

  const ground = buildGround(map);
  const roads = buildRoads(map);
  const buildings = buildBuildings(map, new Set([...skip, ...roomIds]));
  // Each walk-in building's shell is its own mesh so the cutaway can hide it.
  const shells = new Map<number, THREE.Object3D>();
  for (const { b: bl } of rooms) {
    const shell = buildBuildings({ ...map, buildings: [bl] }, skip).group;
    shell.name = `shell-${bl.id}`;
    shells.set(bl.id, shell);
    buildings.group.add(shell);
  }
  const interiors = buildInteriors(map, grid, shells, landmarks.attached);
  const models = new ModelLayer(map);
  void models.sync((k, err) => console.warn(`[models] ${k}:`, err));
  const trees = buildTrees(map, grid);
  const props = buildProps(map, roads.lamps, grid);
  group.add(ground.group, roads.group, buildings.group, landmarks.group, trees.group, props.group, models.group, interiors.group);

  let glow = 0;

  /* ---- places ---- */
  const places: Place[] = [];
  const seen = new Set<string>();
  const add = (name: string, x: number, z: number, y: number, kind: string) => {
    const key = name.trim().toLowerCase();
    if (!key || seen.has(key)) return;
    // "NITK Main Building" next to the "Main Building" landmark is one place.
    if (places.some((p) => Math.hypot(p.x - x, p.z - z) < 80 && (key.includes(p.name.toLowerCase()) || p.name.toLowerCase().includes(key)))) return;
    seen.add(key);
    places.push({ name: name.trim(), x, z, y, kind });
  };
  for (const s of landmarks.spots) add(s.name, s.x, s.z, 12, "landmark");
  const named = map.buildings.filter((bl) => bl.name).sort((p, q) => q.area - p.area);
  for (const bl of named) {
    const [x, z] = centroid(bl.outer);
    add(bl.name!, x, z, bl.height + 3, "building");
  }
  for (const a of map.areas) {
    if (!a.name || a.kind === "campus" || a.kind === "residential") continue;
    const [x, z] = centroid(a.outer);
    add(a.name, x, z, 3, a.kind);
  }
  for (const p of map.pois) {
    if (!p.name) continue;
    add(p.name, p.x, p.z, 4, p.kind);
  }

  /* ---- spawn: in front of the Main Building, else the gate, else the centre ---- */
  const at = places.find((p) => p.name === "Main Building") ?? places.find((p) => /gate/i.test(p.name)) ?? { x: 0, z: 0 };
  const [sx, sz] = grid.nearestFree(at.x, at.z);
  const mainB = named.find((bl) => /main building/i.test(bl.name!));
  const target: Pt = mainB ? centroid(mainB.outer) : [sx, sz - 10];
  const facing = Math.atan2(target[0] - sx, target[1] - sz);

  return {
    group,
    grid,
    places,
    spawn: { x: sx, z: sz, facing },
    stats: { buildings: map.buildings.length, roads: map.roads.length, trees: trees.count },
    setSeason(s) {
      ground.setSeason(s.grass, s.sea);
      trees.setSeason(s.foliage, s.blossom);
    },
    interior(pos) {
      return interiors.update(pos);
    },
    apply(p) {
      glow = p.glow;
      ground.apply(p);
      props.setGlow(p.glow);
    },
    update(t, cam) {
      ground.update(t);
      if (cam) trees.cull(cam);
      landmarks.update(t, glow);
    },
  };
}

export { SOLID, ROAD, WATER, CLEAR, PATH };
