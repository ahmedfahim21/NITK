/**
 * Custom building models (.glb/.gltf) from overrides, placed on their OSM
 * footprints and converted to the cel look so they sit in the same world.
 *
 * Placement: the model's origin goes on the footprint centroid at ground
 * level; its +X axis runs along the footprint's long side (the oriented
 * bounding box), then `rotation` degrees and `offset` are applied. Units are
 * metres. See "Working on the campus" in the README.
 */
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { centroid, orientedBox } from "../geo";
import type { CampusMap } from "../osm/types";
import { toon } from "../fx/toon";
import { groundHeight } from "./terrain";
import { merged, osmKey, type ModelRef } from "./overrides";

const loader = new GLTFLoader();
const cache = new Map<string, Promise<THREE.Group>>();

function load(url: string): Promise<THREE.Group> {
  let p = cache.get(url);
  if (!p) {
    p = loader.loadAsync(url).then((g) => {
      const root = g.scene;
      // Cel-convert: keep colour and texture, lose PBR.
      root.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        const src = (Array.isArray(m.material) ? m.material[0] : m.material) as THREE.MeshStandardMaterial;
        m.material = toon(src.color ?? 0xffffff, { map: src.map ?? null, vertexColors: !!m.geometry.attributes.color, side: src.side, flat: false });
        m.castShadow = true;
        m.receiveShadow = true;
      });
      return root;
    });
    cache.set(url, p);
  }
  return p;
}

/** Model's footprint length along X, for auto-fitting. */
export async function modelLength(url: string): Promise<number> {
  const g = await load(url);
  const box = new THREE.Box3().setFromObject(g);
  return Math.max(0.01, box.max.x - box.min.x);
}

export class ModelLayer {
  readonly group = new THREE.Group();
  private placed = new Map<string, THREE.Object3D>();

  constructor(private map: CampusMap) {
    this.group.name = "models";
  }

  /** Match the placed models to the current overrides. */
  async sync(onError?: (key: string, err: unknown) => void) {
    const ov = merged().buildings;
    const want = new Map<string, ModelRef>();
    for (const b of this.map.buildings) {
      const m = ov[osmKey(b)]?.model;
      if (m?.url) want.set(osmKey(b), m);
    }
    for (const [k, obj] of this.placed) {
      if (!want.has(k) || obj.userData.sig !== JSON.stringify(want.get(k))) {
        this.group.remove(obj);
        this.placed.delete(k);
      }
    }
    for (const [k, m] of want) {
      if (this.placed.has(k)) continue;
      const b = this.map.buildings.find((q) => osmKey(q) === k);
      if (!b) continue;
      try {
        const src = await load(m.url);
        const obj = src.clone(true);
        const box = orientedBox(b.outer);
        const [cx, cz] = centroid(b.outer);
        const holder = new THREE.Group();
        holder.position.set(cx, groundHeight(cx, cz), cz);
        holder.rotation.y = -box.angle - THREE.MathUtils.degToRad(m.rotation ?? 0);
        const [ox, oy, oz] = m.offset ?? [0, 0, 0];
        obj.position.set(ox, oy, oz);
        obj.scale.setScalar(m.scale ?? 1);
        holder.add(obj);
        holder.userData.sig = JSON.stringify(m);
        this.group.add(holder);
        this.placed.set(k, holder);
      } catch (err) {
        onError?.(k, err);
      }
    }
  }
}
