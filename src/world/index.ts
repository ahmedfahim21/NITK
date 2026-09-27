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

export type Place = { name: string; x: number; z: number; y: number; kind: string };

export type World = {
  group: THREE.Group;
  grid: Grid;
  places: Place[];
  spawn: { x: number; z: number; facing: number };
  stats: { buildings: number; roads: number; trees: number };
  /** Rebuild building meshes and custom models after an override changes. */
  rebuildBuildings(): Promise<void>;
  /** Meshes that can be clicked to select a building. */
  pickables(): THREE.Object3D[];
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
  for (const bl of map.buildings) {
    if (skip.has(bl.id)) continue;
    if (bl.minHeight >= 2.5) {
      grid.fillPolygon([bl.outer, ...bl.holes], 0, bl.height);
      continue;
    }
    grid.fillPolygon([bl.outer, ...bl.holes], SOLID, bl.height);
  }

  const ground = buildGround(map);
  const roads = buildRoads(map);
  let buildings = buildBuildings(map, skip);
  const models = new ModelLayer(map);
  void models.sync((k, err) => console.warn(`[models] ${k}:`, err));
  const trees = buildTrees(map, grid);
  const props = buildProps(map, roads.lamps, grid);
  group.add(ground.group, roads.group, buildings.group, landmarks.group, trees.group, props.group, models.group);

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
    async rebuildBuildings() {
      group.remove(buildings.group);
      buildings.group.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
      buildings = buildBuildings(map, skip);
      group.add(buildings.group);
      await models.sync((k, err) => console.warn(`[models] ${k}:`, err));
    },
    pickables() {
      return [buildings.group, models.group, landmarks.group];
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
