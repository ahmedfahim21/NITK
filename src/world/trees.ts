/**
 * Vegetation. Coastal Karnataka is coconut palms over everything, with
 * mango/jackfruit/acacia canopy between and a casuarina belt behind the
 * beach. Mapped trees are placed exactly; the rest are scattered by land use
 * on free ground. Instances are bucketed into tiles so the camera and the
 * shadow pass only draw the tiles they can see.
 */
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { mulberry32, pointInPoly, type Pt } from "../geo";
import type { AreaKind, CampusMap, Tree } from "../osm/types";
import { toon } from "../fx/toon";
import { CLEAR, Grid, PATH, ROAD, SOLID, WATER } from "./grid";
import { groundHeight } from "./terrain";

type Kind = Tree["kind"];

function colourise(g: THREE.BufferGeometry, c: number): THREE.BufferGeometry {
  const geo = g.index ? g.toNonIndexed() : g;
  const col = new THREE.Color(c);
  const n = geo.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) arr.set([col.r, col.g, col.b], i * 3);
  geo.setAttribute("color", new THREE.BufferAttribute(arr, 3));
  geo.deleteAttribute("uv");
  return geo;
}

function palmGeometry(lite = false): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  // Gently curved trunk in four segments, 1 unit = 1 m for a 12 m palm.
  const segs = lite ? 2 : 4;
  let x = 0;
  let y = 0;
  for (let i = 0; i < segs; i++) {
    const h = 11 / segs;
    const r0 = 0.24 - i * 0.025;
    const r1 = 0.24 - (i + 1) * 0.025;
    const seg = new THREE.CylinderGeometry(r1, r0, h, 6, 1);
    const lean = 0.1 + i * 0.07;
    seg.rotateZ(-lean);
    seg.translate(x + Math.sin(lean) * h * 0.5, y + h / 2, 0);
    x += Math.sin(lean) * h;
    y += Math.cos(lean) * h;
    parts.push(colourise(seg, i % 2 ? 0x8b6d4f : 0x7d6246));
  }
  const top = new THREE.Vector3(x, y, 0);
  // Fronds: long drooping leaves, each a folded strip.
  const fronds = lite ? 6 : 8;
  for (let k = 0; k < fronds; k++) {
    const a = (k / fronds) * Math.PI * 2 + (k % 2) * 0.2;
    const len = 4.2;
    const pts: number[] = [];
    const idx: number[] = [];
    const steps = lite ? 2 : 4;
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const along = t * len;
      const droop = -Math.pow(t, 1.8) * 2.6 + t * 0.9;
      const w = Math.sin(t * Math.PI) * 0.75 + 0.05;
      // Centre spine plus two leaflet edges, folded into a shallow V.
      pts.push(along, droop, 0, along, droop - 0.25 * w, -w, along, droop - 0.25 * w, w);
      if (s > 0) {
        const b = (s - 1) * 3;
        idx.push(b, b + 3, b + 1, b + 1, b + 3, b + 4, b, b + 2, b + 3, b + 2, b + 5, b + 3);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    g.rotateZ(-0.1 + (k % 3) * 0.12);
    g.rotateY(a);
    g.translate(top.x, top.y, top.z);
    parts.push(colourise(g, k % 3 === 0 ? 0x5f9a3a : k % 3 === 1 ? 0x6fae45 : 0x558d35));
  }
  const nuts = new THREE.IcosahedronGeometry(0.55, 0);
  nuts.translate(top.x, top.y - 0.45, top.z);
  parts.push(colourise(nuts, 0x9a7b2f));
  return mergeGeometries(parts)!;
}

function broadGeometry(variant: number, lite = false): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const trunk = new THREE.CylinderGeometry(0.22, 0.34, 3.2, 6);
  trunk.translate(0, 1.6, 0);
  parts.push(colourise(trunk, 0x6b4f3a));
  const rand = mulberry32(variant * 97 + 3);
  const blobs = lite ? 2 : 4;
  const greens = [0x4f8f3a, 0x5a9c40, 0x467f34, 0x62a547];
  for (let i = 0; i < blobs; i++) {
    const r = 1.6 + rand() * 1.1;
    const b = new THREE.IcosahedronGeometry(r, 0);
    const a = rand() * Math.PI * 2;
    const d = i === 0 ? 0 : 1.3 + rand() * 0.6;
    b.scale(1, 0.8, 1);
    b.translate(Math.cos(a) * d, 4 + rand() * 1.4 + (i === 0 ? 0.8 : 0), Math.sin(a) * d);
    parts.push(colourise(b, greens[(i + variant) % greens.length]));
  }
  return mergeGeometries(parts)!;
}

function casuarinaGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const trunk = new THREE.CylinderGeometry(0.14, 0.26, 7, 5);
  trunk.translate(0, 3.5, 0);
  parts.push(colourise(trunk, 0x6d5a48));
  for (let i = 0; i < 4; i++) {
    const c = new THREE.ConeGeometry(1.9 - i * 0.35, 3.2, 7);
    c.translate(0, 5 + i * 2, 0);
    parts.push(colourise(c, i % 2 ? 0x3f6f45 : 0x4a7c4c));
  }
  return mergeGeometries(parts)!;
}

const DENSITY: Partial<Record<AreaKind, number>> = {
  forest: 1 / 55,
  scrub: 1 / 160,
  park: 1 / 260,
  garden: 1 / 320,
  grass: 1 / 700,
  campus: 1 / 330,
  residential: 1 / 300,
  commercial: 1 / 1200,
  farmland: 1 / 4000,
  wetland: 1 / 600,
};

/** Palm share by land use. */
const PALM: Partial<Record<AreaKind, number>> = {
  forest: 0.25,
  scrub: 0.3,
  residential: 0.6,
  campus: 0.35,
  farmland: 0.9,
  park: 0.3,
  garden: 0.4,
};

const KIND_CODE: AreaKind[] = [
  "campus",
  "residential",
  "commercial",
  "grass",
  "park",
  "garden",
  "forest",
  "scrub",
  "farmland",
  "wetland",
  "water",
  "pool",
  "sand",
  "rock",
  "pitch",
  "track",
  "parking",
  "plaza",
  "dirt",
];

/** Campus trees are bucketed in tiles this big (m); the horizon band is one bucket per kind. */
const TILE = 320;

export type TreeRig = { group: THREE.Group; count: number; cull(cam: THREE.Vector3): void };

export function buildTrees(map: CampusMap, grid: Grid, seed = 1729): TreeRig {
  const rand = mulberry32(seed);
  const b = map.bounds;

  // Land-use raster at 4 m, painted in draw order so the top area wins.
  const kinds = new Grid(b.minX, b.minZ, b.maxX, b.maxZ, 4);
  const order: AreaKind[] = ["campus", "residential", "commercial", "farmland", "dirt", "grass", "park", "scrub", "garden", "forest", "wetland", "sand", "rock", "track", "pitch", "parking", "plaza", "water", "pool"];
  const LEAF_TAG = { palm: 1, needle: 2, broad: 3 } as const;
  const leafAt = new Map<number, "palm" | "needle" | "broad">([
    [1, "palm"],
    [2, "needle"],
    [3, "broad"],
  ]);
  for (const kind of order) {
    for (const a of map.areas) {
      if (a.kind !== kind) continue;
      const code = KIND_CODE.indexOf(kind) + 1;
      const tag = a.leaf ? LEAF_TAG[a.leaf] : 0;
      paint(kinds, [a.outer, ...a.holes], code, tag);
    }
  }

  const placed: { x: number; z: number; kind: Kind; s: number; r: number; v: number; far?: boolean }[] = [];
  const free = (x: number, z: number, pad: number) => {
    for (const [dx, dz] of [
      [0, 0],
      [pad, 0],
      [-pad, 0],
      [0, pad],
      [0, -pad],
    ]) {
      if (grid.get(x + dx, z + dz) & (SOLID | ROAD | WATER | CLEAR | PATH)) return false;
    }
    return true;
  };

  for (const t of map.trees) placed.push({ x: t.x, z: t.z, kind: t.kind, s: 0.9 + rand() * 0.3, r: rand() * 6.28, v: Math.floor(rand() * 3) });

  const step = 6;
  for (let z = b.minZ + step / 2; z < b.maxZ; z += step) {
    for (let x = b.minX + step / 2; x < b.maxX; x += step) {
      const k = kinds.idx(x, z);
      const code = k >= 0 ? kinds.flags[k] : 0;
      const kind = code ? KIND_CODE[code - 1] : undefined;
      const leaf = k >= 0 ? leafAt.get(kinds.top[k]) : undefined;
      let density = kind ? DENSITY[kind] ?? 0 : 1 / 450;
      if (leaf) density = leaf === "palm" ? 1 / 60 : 1 / 45;
      if (!density || rand() > density * step * step) continue;
      const px = x + (rand() - 0.5) * step;
      const pz = z + (rand() - 0.5) * step;
      if (!free(px, pz, 2.2)) continue;
      const palmShare = leaf === "palm" ? 0.95 : leaf === "needle" ? 0 : kind ? PALM[kind] ?? 0.4 : 0.55;
      const kindOf: Kind = leaf === "needle" ? "casuarina" : rand() < palmShare ? "palm" : "broad";
      placed.push({ x: px, z: pz, kind: kindOf, s: 0.75 + rand() * 0.55, r: rand() * 6.28, v: Math.floor(rand() * 3) });
    }
  }

  // Horizon: a band of palms and canopy on the land beyond the map.
  const land = map.land;
  for (let n = 0; n < 9000; n++) {
    const x = b.minX - 1400 + rand() * (b.maxX - b.minX + 2800);
    const z = b.minZ - 1400 + rand() * (b.maxZ - b.minZ + 2800);
    if (x > b.minX - 5 && x < b.maxX + 5 && z > b.minZ - 5 && z < b.maxZ + 5) continue;
    if (!land.some((l: Pt[]) => pointInPoly(x, z, l))) continue;
    placed.push({ x, z, kind: rand() < 0.6 ? "palm" : "broad", s: 0.9 + rand() * 0.5, r: rand() * 6.28, v: 0, far: true });
  }

  for (const p of placed) if (p.x > b.minX && p.x < b.maxX && p.z > b.minZ && p.z < b.maxZ) grid.stampDisc(p.x, p.z, 0.45, SOLID, 8);

  /* ---- instancing by tile and kind ---- */
  const geos: Record<string, THREE.BufferGeometry> = {
    farpalm: palmGeometry(true),
    farbroad0: broadGeometry(0, true),
    palm: palmGeometry(),
    casuarina: casuarinaGeometry(),
    broad0: broadGeometry(0),
    broad1: broadGeometry(1),
    broad2: broadGeometry(2),
  };
  const mat = toon(0xffffff, { vertexColors: true, ramp: "soft", side: THREE.DoubleSide, nearFade: 5 });
  const buckets = new Map<string, typeof placed>();
  for (const p of placed) {
    const kind = p.kind === "broad" ? `broad${p.v}` : p.kind;
    const key = p.far ? `far${kind}|h` : `${kind}|${Math.floor(p.x / TILE)}|${Math.floor(p.z / TILE)}`;
    let list = buckets.get(key);
    if (!list) buckets.set(key, (list = []));
    list.push(p);
  }
  const group = new THREE.Group();
  group.name = "trees";
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const tint = new THREE.Color();
  for (const [key, list] of buckets) {
    const geo = geos[key.split("|")[0]];
    const inst = new THREE.InstancedMesh(geo, mat, list.length);
    list.forEach((p, i) => {
      q.setFromAxisAngle(up, p.r);
      const s = p.s;
      m.compose(new THREE.Vector3(p.x, groundHeight(p.x, p.z), p.z), q, new THREE.Vector3(s, s * (0.9 + (i % 5) * 0.05), s));
      inst.setMatrixAt(i, m);
      tint.setHSL(0, 0, 0.9 + ((i * 7) % 10) * 0.02);
      inst.setColorAt(i, tint);
    });
    inst.computeBoundingSphere();
    const far = !!list[0].far;
    inst.castShadow = !far;
    inst.userData.far = far;
    inst.receiveShadow = true;
    group.add(inst);
  }
  // Hide campus tiles well into the haze; the horizon band stays as a backdrop.
  const tiles = group.children.filter((m) => !(m.userData.far as boolean)) as THREE.InstancedMesh[];
  for (const t of tiles) t.userData.centre = t.boundingSphere!.center.clone();
  return {
    group,
    count: placed.length,
    cull(cam) {
      for (const t of tiles) {
        const c = t.userData.centre as THREE.Vector3;
        t.visible = Math.hypot(c.x - cam.x, c.z - cam.z) < 950;
      }
    },
  };
}

/** Scanline paint that overwrites (flags = code, top = tag). */
function paint(g: Grid, rings: Pt[][], code: number, tag: number) {
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const r of rings) for (const p of r) {
    minZ = Math.min(minZ, p[1]);
    maxZ = Math.max(maxZ, p[1]);
  }
  const j0 = Math.max(0, Math.floor((minZ - g.minZ) / g.cell));
  const j1 = Math.min(g.h - 1, Math.floor((maxZ - g.minZ) / g.cell));
  const xs: number[] = [];
  for (let j = j0; j <= j1; j++) {
    const z = g.minZ + (j + 0.5) * g.cell;
    xs.length = 0;
    for (const r of rings) {
      for (let a = 0, b = r.length - 1; a < r.length; b = a++) {
        const [xa, za] = r[a];
        const [xb, zb] = r[b];
        if (za > z !== zb > z) xs.push(xa + ((z - za) * (xb - xa)) / (zb - za));
      }
    }
    xs.sort((p, q) => p - q);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const i0 = Math.max(0, Math.ceil((xs[k] - g.minX) / g.cell - 0.5));
      const i1 = Math.min(g.w - 1, Math.floor((xs[k + 1] - g.minX) / g.cell - 0.5));
      for (let i = i0; i <= i1; i++) {
        g.flags[j * g.w + i] = code;
        g.top[j * g.w + i] = tag;
      }
    }
  }
}
