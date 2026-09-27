/**
 * Walk-in ground floors for a few buildings. The shell stays a normal
 * building from outside; step through the front door and the shell, its
 * roof and anything standing on it are hidden (a cutaway, as in The Sims),
 * leaving a room with low walls you can look into from above.
 *
 * Each room is laid out in its footprint's own frame (u along the long
 * side, v across it), so it follows the real OSM outline, and furniture is
 * only placed where it fits inside with a margin to spare.
 */
import * as THREE from "three";
import { orientedBox, pointInPoly, distToSeg, type Pt } from "../geo";
import type { Building, CampusMap } from "../osm/types";
import { toon } from "../fx/toon";
import { CLEAR, SOLID, type Grid } from "./grid";
import { flatPolygon } from "./ground";
import { frontOf, mainEntrance, findByName, type Face } from "./landmarks";
import { signTexture } from "./textures";

export type InteriorKind = "lobby" | "library" | "auditorium" | "mess" | "canteen" | "lecture";

/** Which buildings open up, by OSM name. */
const ROOMS: [RegExp, InteriorKind, string][] = [
  [/^NITK Main Building$/i, "lobby", "Main Building"],
  [/^NITK Central Library$/i, "library", "Central Library"],
  [/^Silver Jubilee Auditorium$/i, "auditorium", "Silver Jubilee Auditorium"],
  [/^Mega Mess/i, "mess", "Mega Mess"],
  [/^Night Canteen$/i, "canteen", "Night Canteen"],
  [/^Lecture Hall Complex A$/i, "lecture", "Lecture Hall Complex A"],
];

export function interiorBuildings(map: CampusMap): { b: Building; kind: InteriorKind; label: string }[] {
  const out: { b: Building; kind: InteriorKind; label: string }[] = [];
  for (const [re, kind, label] of ROOMS) {
    const b = findByName(map, re);
    if (b && !b.hidden && b.minHeight < 0.5) out.push({ b, kind, label });
  }
  return out;
}

const WALL_H = 3.6;
const DOOR_W = 3.2;

type Room = {
  label: string;
  building: Building;
  shell: THREE.Object3D[];
  inside: THREE.Group;
  door: Pt;
  /** Grid cells of the outer walls and their obstacle tops, lowered while you're inside. */
  wallCells: { k: number; top: number }[];
};

export type InteriorRig = {
  group: THREE.Group;
  /** Name of the room the point is in, or null. Drives the cutaway. */
  update(pos: THREE.Vector3): string | null;
};

/* ---------------- small builders ---------------- */

class Kit {
  readonly g = new THREE.Group();
  private mats = new Map<string, THREE.Material>();
  constructor(
    private frame: { cx: number; cz: number; angle: number },
    private grid: Grid,
    private fits: (u: number, v: number, r: number) => boolean
  ) {
    this.g.position.set(frame.cx, 0, frame.cz);
    this.g.rotation.y = -frame.angle;
  }

  mat(colour: number, o: Parameters<typeof toon>[1] = {}): THREE.Material {
    const key = `${colour}-${JSON.stringify(o, (k, v) => (k === "map" || k === "emissiveMap" ? v?.uuid : v))}`;
    let m = this.mats.get(key);
    if (!m) {
      // Rooms are lit at night: everything inside glows a little after dusk.
      m = toon(colour, { glow: new THREE.Color(colour).multiplyScalar(0.5), emissiveMap: o.map ?? null, ...o });
      this.mats.set(key, m);
    }
    return m;
  }

  /** World position of a room-frame point. */
  world(u: number, v: number): Pt {
    const c = Math.cos(this.frame.angle);
    const s = Math.sin(this.frame.angle);
    return [this.frame.cx + u * c - v * s, this.frame.cz + u * s + v * c];
  }

  /** A box centred at (u, v) standing on the floor, w along u, d along v. */
  box(u: number, v: number, w: number, h: number, d: number, m: THREE.Material, y = 0, solid = true): THREE.Mesh {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    mesh.position.set(u, y + h / 2, v);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.g.add(mesh);
    if (solid) this.solid(u, v, w, d, y + h);
    return mesh;
  }

  solid(u: number, v: number, w: number, d: number, top: number) {
    const pts: Pt[] = [
      this.world(u - w / 2, v - d / 2),
      this.world(u + w / 2, v - d / 2),
      this.world(u + w / 2, v + d / 2),
      this.world(u - w / 2, v + d / 2),
    ];
    this.grid.fillPolygon([pts], SOLID, top);
  }

  /** True when a w x d rectangle at (u, v) sits inside the room with a margin. */
  room(u: number, v: number, w: number, d: number, margin = 1): boolean {
    const r = margin;
    for (const [du, dv] of [
      [-w / 2, -d / 2],
      [w / 2, -d / 2],
      [w / 2, d / 2],
      [-w / 2, d / 2],
      [0, 0],
    ]) {
      if (!this.fits(u + du, v + dv, r)) return false;
    }
    return true;
  }

  sign(lines: string[], u: number, v: number, w: number, h: number, y: number, faceU: number, bg = "#1d3557", fg = "#ffffff") {
    const tex = signTexture(lines, { bg, fg, w: 1024, h: Math.round((1024 * h) / w) });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), this.mat(0xffffff, { map: tex, ramp: "soft", glow: 0x555555, emissiveMap: tex }));
    m.position.set(u, y, v);
    m.rotation.y = faceU > 0 ? Math.PI / 2 : -Math.PI / 2;
    this.g.add(m);
  }
}

let books: THREE.Texture | null = null;
function bookTexture(): THREE.Texture {
  if (books) return books;
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#6b4a2e";
  ctx.fillRect(0, 0, 128, 128);
  const cols = ["#8e2b2b", "#2b4f8e", "#2f6b3e", "#c9a23a", "#5b3b7a", "#d9d2c0", "#1f2a36", "#b8562f"];
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let shelf = 0; shelf < 4; shelf++) {
    const y0 = shelf * 32 + 4;
    let x = 2;
    while (x < 126) {
      const w = 3 + Math.floor(rnd() * 5);
      const h = 18 + Math.floor(rnd() * 8);
      ctx.fillStyle = cols[Math.floor(rnd() * cols.length)];
      ctx.fillRect(x, y0 + 26 - h, w, h);
      x += w + 1;
    }
    ctx.fillStyle = "#4a321f";
    ctx.fillRect(0, y0 + 26, 128, 4);
  }
  books = new THREE.CanvasTexture(c);
  books.colorSpace = THREE.SRGBColorSpace;
  books.wrapS = books.wrapT = THREE.RepeatWrapping;
  return books;
}

/* ---------------- furnishing, per kind ---------------- */

type Layout = { len: number; wid: number; doorU: number; doorV: number; inU: number; inV: number };

function furnish(kind: InteriorKind, k: Kit, L: Layout) {
  const { len, wid } = L;
  // Keep the way in clear: nothing within 6.5 m of the door.
  const clearOfDoor = (u: number, v: number) => Math.hypot(u - L.doorU, v - L.doorV) > 6.5;
  const wood = k.mat(0x8a5a32);
  const steel = k.mat(0xb9c0c6);

  if (kind === "library") {
    // Issue counter facing the door, then stacks on one side of the hall
    // and reading tables on the other.
    const cu = L.doorU + L.inU * 4;
    const cv = L.doorV + L.inV * 4;
    if (k.room(cu, cv, 1, 1, 0.5)) k.box(cu, cv, L.inU ? 1 : 4, 1.1, L.inU ? 4 : 1, wood);
    const shelfMat = k.mat(0xffffff, { map: bookTexture() });
    for (let u = -len / 2 + 3; u < len / 2 - 3; u += 3) {
      for (let v = -wid / 2 + 2.5; v < wid / 2 - 2; v += 5.5) {
        if (!clearOfDoor(u, v)) continue;
        const left = u < 0;
        if (left && k.room(u, v, 0.7, 4.5)) k.box(u, v, 0.7, 2.3, 4.5, shelfMat);
        else if (!left && (Math.round(u / 3) % 2 === 0) && k.room(u, v, 2.6, 1.3)) {
          k.box(u, v, 2.6, 0.78, 1.3, wood);
          for (const s of [-1, 1]) k.box(u, v + s * 1.05, 2.2, 0.45, 0.5, k.mat(0x2f5a8a), 0, false);
        }
      }
    }
    k.sign(["CENTRAL LIBRARY · SILENCE PLEASE"], -len / 2 + 0.3, 0, Math.min(10, wid * 0.8), 0.9, 2.7, 1);
    return;
  }

  if (kind === "auditorium") {
    // Stage across the far end from the door, seats in two blocks with a centre aisle.
    const far = L.inU !== 0 ? Math.sign(L.inU) : 0;
    const alongU = far !== 0;
    const span = alongU ? len : wid;
    const across = alongU ? wid : len;
    const dir = alongU ? far : Math.sign(L.inV) || 1;
    const stageAt = dir * (span / 2 - 5);
    const P = (a: number, b: number): [number, number] => (alongU ? [a, b] : [b, a]);
    const [su, sv] = P(stageAt, 0);
    const [sw, sd] = alongU ? [7, across - 4] : [across - 4, 7];
    k.box(su, sv, sw, 1.1, sd, k.mat(0x8a5a32));
    const [cu, cv] = P(dir * (span / 2 - 1.3), 0);
    const [cw, cd] = alongU ? [0.4, across - 5] : [across - 5, 0.4];
    k.box(cu, cv, cw, 3.2, cd, k.mat(0x7a1f2b), 1.1);
    // Short seat blocks, so the rows fill SJA's fan-shaped hall; aisle down the middle.
    const seat = k.mat(0x2d4f8f);
    for (let a = stageAt - dir * 6; Math.abs(a) < span / 2 - 1.5; a -= dir * 1.5) {
      for (let b = -across / 2 + 2; b < across / 2 - 2; b += 3.3) {
        if (Math.abs(b + 1.5) < 1.6) continue;
        const [u, v] = P(a, b + 1.5);
        const [bw, bd] = alongU ? [0.7, 3] : [3, 0.7];
        if (clearOfDoor(u, v) && k.room(u, v, bw, bd, 0.6)) k.box(u, v, bw, 0.9, bd, seat);
      }
    }
    const [tu, tv] = P(dir * (span / 2 - 0.6), 0);
    k.sign(["SILVER JUBILEE AUDITORIUM"], tu - (alongU ? dir * 0.1 : 0), tv, Math.min(12, across * 0.5), 1.1, 3.1, -dir);
    return;
  }

  if (kind === "mess") {
    // Rows of steel tables and benches; the serving counter with its vats along the back wall.
    const bench = k.mat(0x8c9399);
    for (let u = -len / 2 + 4; u < len / 2 - 4; u += 4) {
      for (let v = -wid / 2 + 5; v < wid / 2 - 7; v += 6) {
        if (!clearOfDoor(u, v) || !k.room(u, v, 1.1, 4.4)) continue;
        k.box(u, v, 1.1, 0.78, 4.4, steel);
        for (const s of [-1, 1]) k.box(u + s * 0.9, v, 0.35, 0.45, 4.2, bench, 0, false);
      }
    }
    const vb = wid / 2 - 3;
    for (let u = -len / 2 + 4; u < len / 2 - 4; u += 2.2) {
      if (!k.room(u, vb, 2, 1.2, 0.8)) continue;
      k.box(u, vb, 2, 1, 1.2, steel);
      const vat = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.4, 0.5, 12), k.mat(0xdfe4e8));
      vat.position.set(u, 1.25, vb);
      k.g.add(vat);
    }
    k.sign(["MEGA MESS · CHAITANYA"], 0, vb + 0.9, Math.min(10, len * 0.5), 1, 2.8, 0);
    return;
  }

  if (kind === "canteen") {
    // Counter down one long side, red plastic tables along the other.
    const vb = -wid / 2 + 1;
    k.box(0, vb, Math.max(4, len - 8), 1.05, 0.9, k.mat(0x2f6b4f));
    for (let u = -len / 2 + 3; u < len / 2 - 2; u += 3.4) {
      const v = wid / 2 - 1.8;
      if (!clearOfDoor(u, v) || !k.room(u, v, 1, 1, 0.5)) continue;
      k.box(u, v, 1, 0.74, 1, k.mat(0xc0392b));
    }
    k.sign(["NIGHT CANTEEN · MAGGI · EGG ROLL · CHAI"], 0, vb - 0.3, Math.min(9, len * 0.6), 0.8, 2.6, 0, "#c0392b");
    return;
  }

  if (kind === "lecture") {
    // Wooden desk rows facing a green board on the far wall.
    const dir = L.inU !== 0 ? Math.sign(L.inU) : 1;
    for (let u = -len / 2 + 4; u < len / 2 - 5; u += 1.8) {
      for (let v = -wid / 2 + 3; v < wid / 2 - 2; v += 3.4) {
        if (!clearOfDoor(u, v) || !k.room(u, v, 0.7, 2.8)) continue;
        k.box(u, v, 0.7, 0.8, 2.8, wood);
      }
    }
    const bu = dir * (len / 2 - 0.4);
    if (k.room(bu - dir * 0.6, 0, 0.2, 6, 0.3)) {
      const board = new THREE.Mesh(new THREE.PlaneGeometry(6, 2), k.mat(0x2e5a3f));
      board.position.set(bu - dir * 0.6, 1.9, 0);
      board.rotation.y = dir > 0 ? -Math.PI / 2 : Math.PI / 2;
      k.g.add(board);
    }
    return;
  }

  // lobby: the Main Building's entrance hall and the corridors off it.
  const fu = L.doorU + L.inU * 7;
  const fv = L.doorV + L.inV * 7;
  if (k.room(fu, fv, 1, 1, 0.5)) {
    k.box(fu, fv, L.inU ? 1.2 : 6, 1.1, L.inU ? 6 : 1.2, wood);
    k.sign(["NATIONAL INSTITUTE OF TECHNOLOGY KARNATAKA", "ENQUIRY"], fu + L.inU * 3, fv + L.inV * 3, 5, 1.2, 2.8, L.inU ? -L.inU : 0, "#1d3f7a");
  }
  // A broad stair up to the first floor, behind the desk.
  const su = L.doorU + L.inU * 13;
  const sv = L.doorV + L.inV * 13;
  for (let s = 0; s < 6; s++) {
    const u = su + L.inU * s * 0.5;
    const v = sv + L.inV * s * 0.5;
    if (k.room(u, v, 1, 1, 0.3)) k.box(u, v, L.inU ? 0.5 : 5, 0.3 * (s + 1), L.inU ? 5 : 0.5, k.mat(0xd8d2c4));
  }
  // Offices down the long wings: partitions from the outer wall to a 4 m
  // central corridor, with benches and potted palms along the corridor.
  const cross = len >= wid;
  const long = cross ? len : wid;
  const short = cross ? wid : len;
  const wall = k.mat(0xf1e8d0);
  const depth = short / 2 - 2 - 0.5;
  const P = (a: number, b: number): [number, number] => (cross ? [a, b] : [b, a]);
  for (let a = 16; a < long / 2 - 3; a += 8) {
    for (const side of [-1, 1]) {
      const at = side * a;
      for (const half of [-1, 1]) {
        const [u, v] = P(at, half * (2 + depth / 2));
        const [bw, bd] = cross ? [0.25, depth] : [depth, 0.25];
        if (k.room(u, v, bw, bd, 0.2)) k.box(u, v, bw, WALL_H, bd, wall);
      }
      const [pu, pv] = P(at + side * 4, (side > 0 ? 1 : -1) * 1.5);
      if (k.room(pu, pv, 0.6, 0.6, 0.3)) {
        const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.28, 0.6, 8), k.mat(0xb8664a));
        pot.position.set(pu, 0.3, pv);
        const palm = new THREE.Mesh(new THREE.IcosahedronGeometry(0.7, 0), k.mat(0x3f8a3a));
        palm.position.set(pu, 1.2, pv);
        k.g.add(pot, palm);
        k.solid(pu, pv, 0.7, 0.7, 1.6);
      }
      const [bu, bv] = P(at - side * 3, (side > 0 ? -1 : 1) * 1.6);
      const [ww, dd] = cross ? [2.4, 0.5] : [0.5, 2.4];
      if (k.room(bu, bv, ww, dd, 0.3)) k.box(bu, bv, ww, 0.45, dd, wood);
    }
  }
}

/* ---------------- the rig ---------------- */

export function buildInteriors(
  map: CampusMap,
  grid: Grid,
  shells: Map<number, THREE.Object3D>,
  attached: Map<number, THREE.Object3D[]>
): InteriorRig {
  const group = new THREE.Group();
  group.name = "interiors";
  const rooms: Room[] = [];

  for (const { b, kind, label } of interiorBuildings(map)) {
    const box = orientedBox(b.outer);
    const f: Face = kind === "lobby" ? mainEntrance(map, b) : frontOf(map, b);
    const door: Pt = [f.x, f.z];
    const c = Math.cos(box.angle);
    const s = Math.sin(box.angle);
    const toLocal = (x: number, z: number): Pt => {
      const dx = x - box.cx;
      const dz = z - box.cz;
      return [dx * c + dz * s, -dx * s + dz * c];
    };
    const [du, dv] = toLocal(f.x, f.z);
    // Inward direction in the room frame, snapped to its axes.
    const inLocal: Pt = [-f.nx * c - f.nz * s, f.nx * s - f.nz * c];
    const inU = Math.abs(inLocal[0]) > Math.abs(inLocal[1]) ? Math.sign(inLocal[0]) : 0;
    const inV = inU === 0 ? Math.sign(inLocal[1]) : 0;

    const rings = [b.outer, ...b.holes];
    const fits = (u: number, v: number, margin: number) => {
      const [x, z] = [box.cx + u * c - v * s, box.cz + u * s + v * c];
      if (!pointInPoly(x, z, b.outer)) return false;
      for (const h of b.holes) if (pointInPoly(x, z, h)) return false;
      for (const r of rings) for (let i = 0; i < r.length; i++) if (distToSeg(x, z, r[i], r[(i + 1) % r.length]) < margin) return false;
      return true;
    };

    // Floor, and the interior counts as clear ground: no trees inside.
    grid.fillPolygon([b.outer, ...b.holes], CLEAR, 0);
    const inside = new THREE.Group();
    inside.name = `interior-${label}`;
    const floorColour = { lobby: 0xe4ddd0, library: 0xd6cfbf, auditorium: 0x7a2e2e, mess: 0xcfcac0, canteen: 0xc9c3b6, lecture: 0xc8bfae }[kind];
    const fg = flatPolygon(b.outer, b.holes, 0.07);
    if (fg) {
      const floor = new THREE.Mesh(fg, toon(floorColour, { ramp: "soft", glow: new THREE.Color(floorColour).multiplyScalar(0.6) }));
      floor.receiveShadow = true;
      inside.add(floor);
    }

    // Low walls round every ring, with a gap at the door.
    const wallMat = toon(0xf3ead6, { glow: 0x7a7060 });
    const walls = new THREE.Group();
    for (const r of rings) {
      for (let i = 0; i < r.length; i++) {
        const a = r[i];
        const q = r[(i + 1) % r.length];
        const l = Math.hypot(q[0] - a[0], q[1] - a[1]);
        if (l < 0.3) continue;
        const ux = (q[0] - a[0]) / l;
        const uz = (q[1] - a[1]) / l;
        // Split round the door if it lies on this edge.
        const t = (door[0] - a[0]) * ux + (door[1] - a[1]) * uz;
        const onEdge = r === b.outer && distToSeg(door[0], door[1], a, q) < 0.6 && t > 0 && t < l;
        const pieces: [number, number][] = onEdge
          ? [
              [0, Math.max(0, t - DOOR_W / 2)],
              [Math.min(l, t + DOOR_W / 2), l],
            ]
          : [[0, l]];
        for (const [t0, t1] of pieces) {
          if (t1 - t0 < 0.2) continue;
          const w = new THREE.Mesh(new THREE.BoxGeometry(t1 - t0, WALL_H, 0.3), wallMat);
          const m = (t0 + t1) / 2;
          w.position.set(a[0] + ux * m, WALL_H / 2, a[1] + uz * m);
          w.rotation.y = -Math.atan2(uz, ux);
          w.castShadow = true;
          w.receiveShadow = true;
          walls.add(w);
        }
      }
    }
    inside.add(walls);

    // Solid walls in the grid at the full building height (camera occlusion
    // outside), then the doorway carved back out.
    const seen = new Set<number>();
    for (const r of rings) grid.strokeLine([...r, r[0]], 0.9, SOLID, b.height);
    const wallCells: { k: number; top: number }[] = [];
    for (const r of rings) {
      for (let i = 0; i < r.length; i++) {
        const a = r[i];
        const q = r[(i + 1) % r.length];
        const l = Math.hypot(q[0] - a[0], q[1] - a[1]);
        for (let d = 0; d <= l; d += 0.5) {
          for (const off of [-0.5, 0, 0.5]) {
            const x = a[0] + ((q[0] - a[0]) / (l || 1)) * d - ((q[1] - a[1]) / (l || 1)) * off;
            const z = a[1] + ((q[1] - a[1]) / (l || 1)) * d + ((q[0] - a[0]) / (l || 1)) * off;
            const k = grid.idx(x, z);
            if (k < 0 || seen.has(k) || !(grid.flags[k] & SOLID)) continue;
            seen.add(k);
            wallCells.push({ k, top: grid.top[k] });
          }
        }
      }
    }
    grid.carve(door[0], door[1], DOOR_W / 2 - 0.2);
    grid.carve(door[0] - f.nx * 1.2, door[1] - f.nz * 1.2, DOOR_W / 2 - 0.2);

    const kit = new Kit(box, grid, fits);
    furnish(kind, kit, { len: box.len, wid: box.wid, doorU: du, doorV: dv, inU, inV });
    inside.add(kit.g);
    inside.visible = false;
    group.add(inside);

    // The doorway as seen from outside: a lit opening in a frame, with a mat.
    const doorway = new THREE.Group();
    // The Main Building's door is in the entrance block, which stands 0.6 m proud.
    const out = kind === "lobby" ? 0.68 : 0.08;
    doorway.position.set(f.x + f.nx * out, 0, f.z + f.nz * out);
    doorway.rotation.y = Math.atan2(f.nx, f.nz);
    const opening = new THREE.Mesh(new THREE.PlaneGeometry(DOOR_W - 0.4, 2.8), toon(0x3b3328, { glow: 0xffd28a, ramp: "soft" }));
    opening.position.y = 1.4;
    const frame = new THREE.Mesh(new THREE.BoxGeometry(DOOR_W + 0.2, 3.3, 0.12), toon(0x5b3a24));
    frame.position.set(0, 1.65, -0.07);
    const mat = new THREE.Mesh(new THREE.PlaneGeometry(DOOR_W - 0.6, 1.4), toon(0x7a2e2e));
    mat.rotation.x = -Math.PI / 2;
    mat.position.set(0, 0.08, 0.9);
    doorway.add(frame, opening, mat);
    group.add(doorway);

    const shell: THREE.Object3D[] = [doorway];
    const sh = shells.get(b.id);
    if (sh) shell.push(sh);
    shell.push(...(attached.get(b.id) ?? []));
    rooms.push({ label, building: b, shell, inside, door, wallCells });
  }

  let current: Room | null = null;
  const setInside = (room: Room | null) => {
    if (room === current) return;
    if (current) {
      for (const o of current.shell) o.visible = true;
      for (const w of current.wallCells) grid.top[w.k] = w.top;
    }
    current = room;
    if (room) {
      for (const o of room.shell) o.visible = false;
      // Walls drop to room height so the camera can look in over them.
      for (const w of room.wallCells) grid.top[w.k] = Math.min(w.top, Math.round(WALL_H * 2));
    }
  };

  return {
    group,
    update(pos) {
      let hit: Room | null = null;
      for (const r of rooms) {
        const b = r.building;
        const near = Math.hypot(pos.x - r.door[0], pos.z - r.door[1]) < 1.8;
        const inPoly = pointInPoly(pos.x, pos.z, b.outer) && !b.holes.some((h) => pointInPoly(pos.x, pos.z, h));
        if (near || inPoly) hit = r;
        // Furniture only draws near the building.
        const d = Math.hypot(pos.x - r.door[0], pos.z - r.door[1]);
        r.inside.visible = d < 120;
      }
      setInside(hit);
      return hit ? hit.label : null;
    },
  };
}
