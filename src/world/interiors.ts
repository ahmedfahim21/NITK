/**
 * Walk-in ground floors for a few buildings. The shell stays a normal
 * building from outside; step through the front door and the shell, its
 * roof and anything standing on it are hidden (a cutaway, as in The Sims),
 * leaving a room with low walls you can look into from above.
 *
 * Each room is laid out in its footprint's own frame (u along the long
 * side, v across it), so it follows the real OSM outline, and furniture is
 * only placed where it fits inside with a margin to spare.
 *
 * Fit-out follows NITK's virtual tour (vtour.nitk.ac.in): the Main
 * Building's lobby (square pillars with dark-wood capitals, wood wainscot,
 * coloured-glass jali over the door), the lecture rooms (maroon chairs with
 * writing pads, whiteboard and screen, ceiling fans, white grilled windows)
 * and the Solve lab (workbenches with PCs, maroon office chairs, aluminium
 * glass partitions, blue posters, split ACs) for the computer centre.
 */
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { orientedBox, pointInPoly, distToSeg, type Pt } from "../geo";
import type { Building, CampusMap } from "../osm/types";
import { toon } from "../fx/toon";
import { CLEAR, SOLID, type Grid } from "./grid";
import { flatPolygon } from "./ground";
import { frontOf, mainEntrance, findByName, type Face } from "./landmarks";
import { signTexture } from "./textures";

export type InteriorKind = "lobby" | "library" | "auditorium" | "mess" | "canteen" | "lecture" | "lab" | "chemlab";

/** Which buildings open up, by OSM name. */
const ROOMS: [RegExp, InteriorKind, string][] = [
  [/^NITK Main Building$/i, "lobby", "Main Building"],
  [/^NITK Central Library$/i, "library", "Central Library"],
  [/^Silver Jubilee Auditorium$/i, "auditorium", "Silver Jubilee Auditorium"],
  [/^Mega Mess/i, "mess", "Mega Mess"],
  [/^Night Canteen$/i, "canteen", "Night Canteen"],
  [/^Lecture Hall Complex A$/i, "lecture", "Lecture Hall Complex A"],
  // First-year lectures run in LHC-C and LHC-D (game/courses.ts).
  [/^Lecture Hall Complex - ?C$/i, "lecture", "Lecture Hall Complex C"],
  [/^Lecture Hall Complex D$/i, "lecture", "Lecture Hall Complex D"],
  [/^Central Computer Center$/i, "lab", "Central Computer Centre"],
  // The Science Block: first-year chemistry and physics labs.
  [/^Departments of Chemistry and Physics$/i, "chemlab", "Science Block"],
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
  private batches = new Map<THREE.Material, THREE.BufferGeometry[]>();
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

  /** A box centred at (u, v) standing on the floor, w along u, d along v. Batched by material. */
  box(u: number, v: number, w: number, h: number, d: number, m: THREE.Material, y = 0, solid = true) {
    this.piece(new THREE.BoxGeometry(w, h, d).translate(u, y + h / 2, v), m);
    if (solid) this.solid(u, v, w, d, y + h);
  }

  /** Any geometry already placed in the room frame, merged with others of its material. */
  piece(g: THREE.BufferGeometry, m: THREE.Material) {
    const geo = g.index ? g.toNonIndexed() : g;
    let list = this.batches.get(m);
    if (!list) this.batches.set(m, (list = []));
    list.push(geo);
  }

  /** Merge each material's pieces into one mesh: hundreds of chairs, a handful of draw calls. */
  finish() {
    for (const [m, list] of this.batches) {
      const merged = mergeGeometries(list);
      if (!merged) throw new Error(`[interiors] could not merge ${list.length} pieces`);
      const mesh = new THREE.Mesh(merged, m);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.g.add(mesh);
    }
    this.batches.clear();
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

  /** A signboard at (u, v), its face turned toward the room-frame direction `face`. */
  sign(lines: string[], u: number, v: number, w: number, h: number, y: number, face: [number, number], bg = "#1d3557", fg = "#ffffff") {
    const tex = signTexture(lines, { bg, fg, w: 1024, h: Math.round((1024 * h) / w) });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), this.mat(0xffffff, { map: tex, ramp: "soft", glow: 0x555555, emissiveMap: tex }));
    m.position.set(u, y, v);
    m.rotation.y = Math.atan2(face[0], face[1]);
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

function canvasTex(w: number, h: number, paint: (ctx: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  paint(c.getContext("2d")!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

/** One 1.2 m square of floor: 60 cm vitrified tiles with pale grout, or carpet. */
const FLOOR_TILE = 1.2;
const floorTex = new Map<string, THREE.Texture>();
function floorTexture(kind: InteriorKind): THREE.Texture {
  const key = kind === "auditorium" ? "carpet" : kind === "mess" || kind === "canteen" ? "grey" : "tile";
  const hit = floorTex.get(key);
  if (hit) return hit;
  const t = canvasTex(128, 128, (ctx) => {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, 128, 128);
    if (key === "carpet") {
      ctx.fillStyle = "rgba(0,0,0,0.06)";
      for (let i = 0; i < 128; i += 8) ctx.fillRect(i, 0, 4, 128);
      return;
    }
    // A soft sheen, then the grout grid.
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    ctx.fillRect(6, 6, 40, 20);
    ctx.fillRect(70, 70, 40, 20);
    ctx.fillStyle = key === "grey" ? "rgba(0,0,0,0.22)" : "rgba(120,100,70,0.3)";
    ctx.fillRect(0, 0, 128, 2);
    ctx.fillRect(0, 64, 128, 2);
    ctx.fillRect(0, 0, 2, 128);
    ctx.fillRect(64, 0, 2, 128);
  });
  floorTex.set(key, t);
  return t;
}

/** One 2 m run of inside wall, floor to WALL_H, per room. */
const WALL_RUN = 2;
const wallTex = new Map<InteriorKind, THREE.Texture>();
function wallTexture(kind: InteriorKind): THREE.Texture {
  const hit = wallTex.get(kind);
  if (hit) return hit;
  const W = 128;
  const H = 230;
  const y = (m: number) => H - (m / WALL_H) * H;
  const t = canvasTex(W, H, (ctx) => {
    ctx.fillStyle = kind === "lecture" || kind === "lab" ? "#fbfaf6" : "#f3ead6";
    ctx.fillRect(0, 0, W, H);
    if (kind === "lobby") {
      // Dark teak wainscot to 1.3 m, panelled, with a moulding on top.
      ctx.fillStyle = "#4a2e1e";
      ctx.fillRect(0, y(1.3), W, H - y(1.3));
      ctx.fillStyle = "#5b3a26";
      for (let x = 6; x < W; x += 32) ctx.fillRect(x, y(1.2), 24, y(0.15) - y(1.2));
      ctx.fillStyle = "#2e1c12";
      ctx.fillRect(0, y(1.36), W, 5);
    } else if (kind === "lecture") {
      // A window with white horizontal grilles, as in the lecture rooms.
      ctx.fillStyle = "#cfe0e8";
      ctx.fillRect(24, y(2.6), 80, y(1.0) - y(2.6));
      ctx.fillStyle = "#ffffff";
      for (let k = y(2.6); k < y(1.0); k += 9) ctx.fillRect(24, k, 80, 4);
      ctx.fillStyle = "#e3e0d8";
      ctx.fillRect(20, y(1.0), 88, 4);
    } else if (kind === "lab") {
      // Blue information posters at eye height.
      ctx.fillStyle = "#1f4fa3";
      ctx.fillRect(40, y(2.3), 46, y(1.3) - y(2.3));
      ctx.fillStyle = "rgba(255,255,255,0.8)";
      for (let k = 0; k < 5; k++) ctx.fillRect(46, y(2.2) + k * 9, 34 - (k % 2) * 10, 3);
    }
    ctx.fillStyle = kind === "lobby" ? "#2e1c12" : "#b9b2a2";
    ctx.fillRect(0, H - 5, W, 5);
  });
  wallTex.set(kind, t);
  return t;
}

let glassJali: THREE.Texture | null = null;
/** The coloured-glass block screen over the Main Building's entrance. */
function glassJaliTexture(): THREE.Texture {
  if (glassJali) return glassJali;
  const cols = ["#2b6cc4", "#3f9e5a", "#e2c23a", "#f4f1e8", "#5aa6d8"];
  glassJali = canvasTex(128, 64, (ctx) => {
    ctx.fillStyle = "#e8e2d2";
    ctx.fillRect(0, 0, 128, 64);
    let n = 0;
    for (let y = 2; y < 64; y += 8) {
      for (let x = 2; x < 128; x += 8) {
        ctx.fillStyle = cols[(n++ * 7 + (y >> 3)) % cols.length];
        ctx.fillRect(x, y, 6, 6);
      }
    }
  });
  return glassJali;
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
    k.sign(["CENTRAL LIBRARY · SILENCE PLEASE"], -len / 2 + 0.3, 0, Math.min(10, wid * 0.8), 0.9, 2.7, [1, 0]);
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
    k.sign(["SILVER JUBILEE AUDITORIUM"], tu - (alongU ? dir * 0.1 : 0), tv, Math.min(12, across * 0.5), 1.1, 3.1, alongU ? [-dir, 0] : [0, -dir]);
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
    k.sign(["MEGA MESS · CHAITANYA"], 0, vb + 0.9, Math.min(10, len * 0.5), 1, 2.8, [0, -1]);
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
    k.sign(["NIGHT CANTEEN · MAGGI · EGG ROLL · CHAI"], 0, vb - 0.3, Math.min(9, len * 0.6), 0.8, 2.6, [0, 1], "#c0392b");
    return;
  }

  if (kind === "lecture") {
    classrooms(k, L, clearOfDoor);
    return;
  }

  if (kind === "lab") {
    computerLab(k, L, clearOfDoor);
    return;
  }

  if (kind === "chemlab") {
    chemistryLab(k, L, clearOfDoor);
    return;
  }

  // lobby: the Main Building's entrance hall and the corridors off it.
  // Two square pillars flank the way in: stone base, cream shaft, a flared
  // dark-wood capital. Coloured-glass jali over the door, and the Engineer
  // fest's "Think Create Engineer" display.
  const across: [number, number] = L.inU ? [0, 1] : [1, 0];
  const teak = k.mat(0x4a2e1e);
  for (const side of [-1, 1]) {
    const pu = L.doorU + L.inU * 6 + across[0] * side * 4.5;
    const pv = L.doorV + L.inV * 6 + across[1] * side * 4.5;
    if (!k.room(pu, pv, 1.4, 1.4, 0.3)) continue;
    k.box(pu, pv, 1.5, 0.5, 1.5, k.mat(0xb9a88a));
    k.box(pu, pv, 1.2, WALL_H - 0.6, 1.2, k.mat(0xf1ead8), 0.5, false);
    k.piece(new THREE.CylinderGeometry(1.25, 0.75, 0.8, 4, 1).rotateY(Math.PI / 4).translate(pu, WALL_H + 0.1, pv), teak);
  }
  {
    const jali = new THREE.Mesh(
      new THREE.PlaneGeometry(9, 1.6),
      k.mat(0xffffff, { map: glassJaliTexture(), glow: 0xffffff, emissiveMap: glassJaliTexture(), side: THREE.DoubleSide })
    );
    jali.position.set(L.doorU + L.inU * 0.3, WALL_H - 0.3, L.doorV + L.inV * 0.3);
    jali.rotation.y = L.inU ? Math.PI / 2 : 0;
    k.g.add(jali);
  }
  {
    const du = L.doorU + L.inU * 10 + across[0] * 8;
    const dv = L.doorV + L.inV * 10 + across[1] * 8;
    if (k.room(du, dv, 3, 3, 0.5)) {
      k.box(du, dv, L.inU ? 1.4 : 3, 0.8, L.inU ? 3 : 1.4, k.mat(0x6b6f76));
      // Student projects on the stand: little yellow robots.
      for (let i = 0; i < 4; i++) k.box(du + across[0] * (i * 0.7 - 1.05), dv + across[1] * (i * 0.7 - 1.05), 0.25, 0.6, 0.25, k.mat(0xf2c418), 0.8, false);
      k.sign(["THINK · CREATE · ENGINEER"], du + L.inU * 0.8, dv + L.inV * 0.8, 3, 0.7, 1.9, [-L.inU, -L.inV], "#2b2f36", "#e8553b");
    }
  }
  const fu = L.doorU + L.inU * 7;
  const fv = L.doorV + L.inV * 7;
  if (k.room(fu, fv, 1, 1, 0.5)) {
    k.box(fu, fv, L.inU ? 1.2 : 6, 1.1, L.inU ? 6 : 1.2, wood);
    k.sign(["NATIONAL INSTITUTE OF TECHNOLOGY KARNATAKA", "ENQUIRY"], fu + L.inU * 3, fv + L.inV * 3, 5, 1.2, 2.8, [-L.inU, -L.inV], "#1d3f7a");
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

/** A maroon chair with a writing pad on its right arm, facing -u when face is -1. */
function padChair(k: Kit, u: number, v: number, face: number) {
  const maroon = k.mat(0x7a2a2a);
  k.box(u, v, 0.45, 0.45, 0.45, maroon, 0, false);
  k.box(u - face * 0.2, v, 0.08, 0.5, 0.45, maroon, 0.45, false);
  k.box(u + face * 0.05, v + 0.22, 0.4, 0.04, 0.3, k.mat(0xd8c7a4), 0.7, false);
}

/** A three-blade ceiling fan, seen from above in the cutaway. */
function fan(k: Kit, u: number, v: number) {
  const white = k.mat(0xf2f2ee);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    k.piece(new THREE.BoxGeometry(0.75, 0.03, 0.12).translate(0.45, 0, 0).rotateY(a).translate(u, WALL_H - 0.35, v), white);
  }
  k.piece(new THREE.CylinderGeometry(0.1, 0.1, 0.12, 8).translate(u, WALL_H - 0.35, v), white);
}

/**
 * Lecture rooms, from the tour: partitions every 11 m across the block with a
 * doorway each, and in every room rows of maroon pad chairs facing a
 * whiteboard and projector screen, a teacher's table, fans overhead.
 */
function classrooms(k: Kit, L: Layout, clearOfDoor: (u: number, v: number) => boolean) {
  const { len, wid } = L;
  const partition = k.mat(0xf6f3ea);
  const bay = 11;
  for (let i = 0, u0 = -len / 2; u0 < len / 2 - 4; i++, u0 += bay) {
    // The partition at u0, in 1 m pieces so it follows courtyards; a 2 m
    // doorway in each, alternating sides.
    if (i > 0) {
      for (let v = -wid / 2 + 0.5; v < wid / 2; v += 1) {
        const doorway = Math.abs(v - (i % 2 ? wid / 4 : -wid / 4)) < 1;
        if (doorway || !k.room(u0, v, 0.2, 1, 0.1)) continue;
        k.box(u0, v, 0.2, WALL_H, 1, partition);
      }
    }
    // Whiteboard and projector screen on the partition, the teacher's table.
    const front = u0 + 0.4;
    if (k.room(front + 0.2, 0, 0.1, 5, 0.3)) {
      k.box(front, -1.6, 0.06, 1.3, 3, k.mat(0xf7f7f4), 1, false);
      k.box(front, 1.8, 0.06, 1.6, 2.6, k.mat(0xe9edf2, { glow: 0xb8c8e0 }), 1, false);
      k.box(front + 1.2, -2.5, 1.2, 0.75, 0.6, k.mat(0x8a5a32));
    }
    for (let u = front + 3; u < Math.min(u0 + bay - 1, len / 2 - 1); u += 1.2) {
      for (let v = -wid / 2 + 1.5; v < wid / 2 - 1.2; v += 0.9) {
        if (!clearOfDoor(u, v) || !k.room(u, v, 0.5, 0.5, 0.6)) continue;
        padChair(k, u, v, -1);
        k.solid(u, v, 0.5, 0.5, 0.9);
      }
    }
    for (const fv of [-wid / 4, wid / 4]) {
      const fu = u0 + bay / 2;
      if (k.room(fu, fv, 0.5, 0.5, 0.5)) fan(k, fu, fv);
    }
  }
}

/**
 * The Solve lab, from the tour: wooden workbenches with PCs and circuit kits,
 * maroon office chairs, aluminium-framed glass partitions, split ACs.
 */
function computerLab(k: Kit, L: Layout, clearOfDoor: (u: number, v: number) => boolean) {
  const { len, wid } = L;
  const bench = k.mat(0x9a6a3e);
  const screen = k.mat(0x22262c, { glow: 0x5f86b8 });
  const chair = k.mat(0x6e2430);
  const kits = [k.mat(0x2f7a3a), k.mat(0x2b5fb3), k.mat(0xd9d2c0)];
  let n = 0;
  for (let u = -len / 2 + 3; u < len / 2 - 2.5; u += 3.2) {
    for (let v = -wid / 2 + 2.5; v < wid / 2 - 2; v += 3.6) {
      if (!clearOfDoor(u, v) || !k.room(u, v, 1, 2.8, 0.8)) continue;
      k.box(u, v, 1, 0.78, 2.8, bench);
      for (const dv of [-0.8, 0.8]) {
        k.box(u + 0.2, v + dv, 0.08, 0.42, 0.62, screen, 0.78, false);
        k.box(u - 0.15, v + dv, 0.18, 0.02, 0.45, k.mat(0x3a3d42), 0.78, false);
        k.box(u - 0.95, v + dv, 0.45, 0.45, 0.45, chair, 0, false);
        k.box(u - 1.2, v + dv, 0.08, 0.55, 0.45, chair, 0.45, false);
      }
      k.box(u - 0.1, v, 0.3, 0.08, 0.25, kits[n++ % kits.length], 0.78, false);
    }
  }
  // Glass partitions with aluminium frames, splitting the hall in thirds.
  const glass = k.mat(0xbcd6e0, { transparent: true, opacity: 0.35 });
  const alu = k.mat(0xc4c8cc);
  for (const pu of [-len / 6, len / 6]) {
    for (let v = -wid / 2 + 0.5; v < wid / 2; v += 1) {
      if (Math.abs(v) < 1.2 || !k.room(pu, v, 0.1, 1, 0.1)) continue;
      k.box(pu, v, 0.06, 2.7, 1, glass);
      k.box(pu, v - 0.48, 0.1, 2.7, 0.05, alu, 0, false);
    }
  }
  // Split ACs high on the long walls.
  for (let u = -len / 2 + 4; u < len / 2 - 3; u += 8) {
    for (const side of [-1, 1]) {
      const v = side * (wid / 2 - 0.45);
      if (k.room(u, v - side * 0.2, 0.2, 0.2, 0.05)) k.box(u, v, 1, 0.3, 0.25, k.mat(0xf4f4f2), 2.8, false);
    }
  }
}

/**
 * The first-year chemistry lab in the Science Block: island benches with a
 * reagent shelf down the middle, sinks at the ends, a burette stand at each
 * place, fume hoods along the wall.
 */
function chemistryLab(k: Kit, L: Layout, clearOfDoor: (u: number, v: number) => boolean) {
  const { len, wid } = L;
  const top = k.mat(0x2f3a3f);
  const cabinet = k.mat(0xd9d4c4);
  const shelf = k.mat(0x8a5a32);
  const rod = k.mat(0x9aa1a6);
  const glass = k.mat(0xcfe8f2, { transparent: true, opacity: 0.6 });
  const bottles = [k.mat(0x6b3a1e), k.mat(0x2b6cc4), k.mat(0xe8e2d2), k.mat(0x3f9e5a)];
  let n = 0;
  for (let u = -len / 2 + 4; u < len / 2 - 3; u += 4.2) {
    for (let v = -wid / 2 + 3.5; v < wid / 2 - 3; v += 5) {
      if (!clearOfDoor(u, v) || !k.room(u, v, 1.6, 3.6, 0.8)) continue;
      k.box(u, v, 1.6, 0.85, 3.6, cabinet);
      k.box(u, v, 1.7, 0.05, 3.7, top, 0.85, false);
      k.box(u, v, 0.25, 0.5, 3.2, shelf, 0.9, false);
      for (let b = -1.3; b <= 1.3; b += 0.43) k.box(u, v + b, 0.1, 0.2, 0.1, bottles[n++ % bottles.length], 1.4, false);
      for (const side of [-1, 1]) {
        for (const dv of [-1, 1]) {
          const su = u + side * 0.55;
          const sv = v + dv * 1.1;
          k.box(su, sv, 0.04, 0.9, 0.04, rod, 0.9, false);
          k.box(su, sv, 0.06, 0.55, 0.06, glass, 1.2, false);
          k.box(su, sv, 0.18, 0.02, 0.18, k.mat(0x7a4a2a), 0.9, false);
        }
      }
      k.box(u, v + 1.95, 1.2, 0.1, 0.5, k.mat(0xb9c0c6), 0.85, false);
    }
  }
  for (let u = -len / 2 + 3; u < len / 2 - 3; u += 5) {
    const v = wid / 2 - 0.8;
    if (!k.room(u, v - 0.3, 1.8, 0.2, 0.05)) continue;
    k.box(u, v, 1.8, 2.2, 0.9, k.mat(0xe8e5dc));
    k.box(u, v - 0.46, 1.5, 0.8, 0.02, glass, 1, false);
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
    const floorColour = { lobby: 0xefe9dc, library: 0xd6cfbf, auditorium: 0x7a2e2e, mess: 0xcfcac0, canteen: 0xc9c3b6, lecture: 0xefeae0, lab: 0xf1ede4, chemlab: 0xe9e6de }[kind];
    const fg = flatPolygon(b.outer, b.holes, 0.07);
    if (fg) {
      // Tile UVs in world metres, so tiles line up across the room.
      const p = fg.attributes.position;
      const uv = new Float32Array(p.count * 2);
      for (let i = 0; i < p.count; i++) uv.set([p.getX(i) / FLOOR_TILE, p.getZ(i) / FLOOR_TILE], i * 2);
      fg.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
      const ft = floorTexture(kind);
      const floor = new THREE.Mesh(fg, toon(floorColour, { ramp: "soft", map: ft, glow: new THREE.Color(floorColour).multiplyScalar(0.6), emissiveMap: ft }));
      floor.receiveShadow = true;
      inside.add(floor);
    }

    // Low walls round every ring, with a gap at the door.
    const wt = wallTexture(kind);
    const wallMat = toon(0xffffff, { map: wt, glow: 0x8a8272, emissiveMap: wt });
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
          const wg = new THREE.BoxGeometry(t1 - t0, WALL_H, 0.3);
          // Long faces (+z, -z) repeat the wall texture every WALL_RUN metres.
          const wuv = wg.attributes.uv as THREE.BufferAttribute;
          for (let v = 16; v < 24; v++) wuv.setX(v, (wuv.getX(v) * (t1 - t0)) / WALL_RUN);
          const w = new THREE.Mesh(wg, wallMat);
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
    kit.finish();
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
