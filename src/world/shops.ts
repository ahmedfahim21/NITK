/**
 * Campus shop fronts. OSM puts the shops as points inside two buildings (the
 * boys' shopping block by Iyengar Bakery and the girls' co-op block), and a
 * few cafés as their own buildings or as loose points. Each shop gets a bay
 * on its building's front: a lit shutter opening, a counter, a tin awning, a
 * name board in its trade's colour, and a few props for what it sells.
 * Points with no building (Nandini, Nescafe EastSide) get a small kiosk.
 *
 * Built at ground level 0 in each front's frame; world/index.ts lifts the
 * group onto the terrain with the rest of the static world.
 */
import * as THREE from "three";
import { centroid, pointInPoly, type Pt } from "../geo";
import type { Building, CampusMap, Poi } from "../osm/types";
import { toon } from "../fx/toon";
import { frontOf } from "./landmarks";
import { signTexture } from "./textures";
import { SOLID, type Grid } from "./grid";

type Trade = "bakery" | "dairy" | "cafe" | "convenience" | "hair" | "laundry" | "tailor" | "clothes" | "copy" | "food";

const LOOK: Record<Trade, { sign: string; awning: number; counter: number }> = {
  bakery: { sign: "#b5412d", awning: 0xd9822b, counter: 0xe8d4b0 },
  dairy: { sign: "#1f5fae", awning: 0x2f7ad0, counter: 0xf2f4f6 },
  cafe: { sign: "#9c1f1f", awning: 0xc0392b, counter: 0x5a3a28 },
  convenience: { sign: "#2e7d32", awning: 0x3f9a45, counter: 0xd9d2c0 },
  hair: { sign: "#6a1b9a", awning: 0x8e44ad, counter: 0xe6e0ea },
  laundry: { sign: "#00796b", awning: 0x26a69a, counter: 0xe0ece9 },
  tailor: { sign: "#6d4c41", awning: 0x8d6e63, counter: 0xd7c6b5 },
  clothes: { sign: "#ad1457", awning: 0xd81b60, counter: 0xeadbe2 },
  copy: { sign: "#283593", awning: 0x3949ab, counter: 0xdcdff0 },
  food: { sign: "#e65100", awning: 0xef6c00, counter: 0xe9dcc5 },
};

function tradeOf(p: Poi): Trade | null {
  const shop = p.tags.shop ?? "";
  const amenity = p.tags.amenity ?? "";
  if (/nandini|nandhini|amul/i.test(p.name) || shop === "dairy") return "dairy";
  if (shop === "bakery") return "bakery";
  if (shop === "hairdresser" || shop === "beauty") return "hair";
  if (shop === "laundry" || shop === "dry_cleaning") return "laundry";
  if (shop === "tailor") return "tailor";
  if (shop === "clothes") return "clothes";
  if (shop === "copyshop" || shop === "stationery" || shop === "computer") return "copy";
  if (shop) return "convenience";
  if (amenity === "cafe") return "cafe";
  if (amenity === "fast_food" || amenity === "restaurant") return "food";
  return null;
}

const wrapName = (s: string) => s.replace(/\s+/g, " ").trim().toUpperCase();

function board(name: string, w: number, bg: string): THREE.Mesh {
  const h = 0.7;
  const tex = signTexture([wrapName(name)], { bg, fg: "#ffffff", w: 1024, h: Math.round((1024 * h) / w) });
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), toon(0xffffff, { map: tex, ramp: "soft", glow: 0x777777, emissiveMap: tex }));
}

/** Plastic chair: seat, back, four legs. */
function chair(colour: number): THREE.Group {
  const g = new THREE.Group();
  const m = toon(colour);
  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.05, 0.42), m);
  seat.position.y = 0.44;
  const back = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.42, 0.05), m);
  back.position.set(0, 0.68, -0.19);
  g.add(seat, back);
  for (const [x, z] of [[-0.18, -0.18], [0.18, -0.18], [-0.18, 0.18], [0.18, 0.18]]) {
    const l = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.44, 0.04), m);
    l.position.set(x, 0.22, z);
    g.add(l);
  }
  return g;
}

/** A small round table with two chairs, as outside every campus café. */
function tableSet(colour: number): THREE.Group {
  const g = new THREE.Group();
  const top = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.04, 14), toon(0xf1f1ee));
  top.position.y = 0.72;
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.72, 6), toon(0x9aa0a6));
  stem.position.y = 0.36;
  g.add(top, stem);
  for (const s of [-1, 1]) {
    const c = chair(colour);
    c.position.set(0, 0, s * 0.62);
    c.rotation.y = s > 0 ? Math.PI : 0;
    g.add(c);
  }
  return g;
}

/** What stands at the counter for this trade (local frame: +z out of the shop). */
function props(t: Trade, w: number): THREE.Object3D[] {
  const out: THREE.Object3D[] = [];
  const box = (sx: number, sy: number, sz: number, c: number, x: number, y: number, z: number) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), toon(c));
    m.position.set(x, y, z);
    out.push(m);
    return m;
  };
  if (t === "bakery") {
    // A glass-topped display case of puffs and cakes.
    box(1.4, 0.9, 0.6, 0xe8d4b0, -w * 0.15, 0.45, 0.9);
    box(1.36, 0.36, 0.56, 0xbfe3ef, -w * 0.15, 1.08, 0.9).material = toon(0xbfe3ef, { transparent: true, opacity: 0.55 });
    for (let i = 0; i < 4; i++) box(0.22, 0.12, 0.22, [0xd9a441, 0xf2c38b, 0xc76b3a, 0xf5e6c8][i], -w * 0.15 - 0.5 + i * 0.33, 0.97, 0.9);
  } else if (t === "dairy") {
    // A chest freezer of ice creams and milk crates.
    box(1.2, 0.85, 0.7, 0xf4f6f8, w * 0.2, 0.43, 0.95);
    box(1.22, 0.06, 0.72, 0x1f5fae, w * 0.2, 0.88, 0.95);
    box(0.5, 0.3, 0.35, 0x2f7ad0, -w * 0.25, 0.15, 1.0);
    box(0.5, 0.3, 0.35, 0x2f7ad0, -w * 0.25, 0.45, 1.0);
  } else if (t === "convenience" || t === "copy") {
    // Chip packets hung on a stand, cartons stacked by the door.
    box(0.08, 1.8, 0.08, 0x8a8f94, w * 0.3, 0.9, 0.7);
    for (let i = 0; i < 5; i++) box(0.3, 0.22, 0.05, [0xe53935, 0xfdd835, 0x43a047, 0x1e88e5, 0xfb8c00][i], w * 0.3, 0.55 + i * 0.26, 0.75);
    box(0.6, 0.4, 0.45, 0xc9a877, -w * 0.3, 0.2, 0.8);
    box(0.5, 0.35, 0.4, 0xb89565, -w * 0.3, 0.58, 0.8);
    if (t === "copy") box(0.6, 0.45, 0.5, 0xeceff1, 0, 1.25, 0.4);
  } else if (t === "hair") {
    // A barber's pole beside the door.
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.9, 10), toon(0xffffff, { map: poleTexture() }));
    pole.position.set(w * 0.4, 2.0, 0.2);
    out.push(pole);
  } else if (t === "laundry" || t === "tailor" || t === "clothes") {
    // A rail of clothes, and bundles tied up in the laundry.
    box(1.4, 0.04, 0.04, 0x8a8f94, w * 0.18, 1.7, 0.5);
    const cols = [0xef5350, 0x42a5f5, 0xffee58, 0x66bb6a, 0xab47bc, 0xffa726];
    for (let i = 0; i < 5; i++) box(0.24, 0.7, 0.05, cols[(i + t.length) % cols.length], w * 0.18 - 0.55 + i * 0.27, 1.3, 0.5);
    if (t === "laundry") for (let i = 0; i < 3; i++) box(0.4, 0.3, 0.4, 0xf1f1f1, -w * 0.25, 0.15 + i * 0.3, 0.8);
  } else if (t === "cafe" || t === "food") {
    // A steel counter with a tea urn.
    const urn = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.5, 12), toon(0xc9ced3));
    urn.position.set(w * 0.2, 1.3, 0.35);
    out.push(urn);
  }
  return out;
}

let poleTex: THREE.Texture | null = null;
function poleTexture(): THREE.Texture {
  if (poleTex) return poleTex;
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 128;
  const g = c.getContext("2d")!;
  g.fillStyle = "#ffffff";
  g.fillRect(0, 0, 64, 128);
  for (let y = -64; y < 192; y += 32) {
    g.fillStyle = (y / 32) % 2 ? "#c62828" : "#1e4fa3";
    g.beginPath();
    g.moveTo(0, y);
    g.lineTo(64, y + 32);
    g.lineTo(64, y + 44);
    g.lineTo(0, y + 12);
    g.fill();
  }
  poleTex = new THREE.CanvasTexture(c);
  poleTex.colorSpace = THREE.SRGBColorSpace;
  return poleTex;
}

/** One shop bay, `w` wide, centred at local x = 0 on a wall at local z = 0. */
function bay(name: string, t: Trade, w: number, eave: number): THREE.Group {
  const g = new THREE.Group();
  const look = LOOK[t];
  // The rolled-up shutter's box, and the lit shop inside the opening.
  const inside = new THREE.Mesh(new THREE.BoxGeometry(w - 0.5, 2.5, 0.12), toon(0x3a2f26, { glow: 0xffc97a }));
  inside.position.set(0, 1.25, 0.06);
  const shutter = new THREE.Mesh(new THREE.BoxGeometry(w - 0.3, 0.35, 0.3), toon(0x8b9196));
  shutter.position.set(0, 2.68, 0.15);
  g.add(inside, shutter);
  const counter = new THREE.Mesh(new THREE.BoxGeometry(Math.min(w - 0.8, 2.4), 1.0, 0.55), toon(look.counter));
  counter.position.set(-w * 0.1, 0.5, 0.35);
  g.add(counter);
  // A tin awning sloping out over the counter.
  const awning = new THREE.Mesh(new THREE.BoxGeometry(w, 0.05, 1.5), toon(look.awning, { side: THREE.DoubleSide }));
  awning.position.set(0, eave - 0.25, 0.72);
  awning.rotation.x = 0.28;
  g.add(awning);
  const sign = board(name, w - 0.2, look.sign);
  sign.position.set(0, eave + 0.35, 0.08);
  g.add(sign);
  for (const o of props(t, w)) g.add(o);
  g.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  return g;
}

/** A standalone kiosk for a shop OSM has only as a point. */
function kiosk(name: string, t: Trade): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(3.2, 2.9, 2.6), toon(0xe9e2cf));
  body.position.set(0, 1.45, -1.3);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.15, 3.0), toon(LOOK[t].awning));
  roof.position.set(0, 3.0, -1.3);
  g.add(body, roof);
  g.add(bay(name, t, 3.2, 3.1));
  return g;
}

function nearestRoadDir(map: CampusMap, x: number, z: number): Pt {
  let best: Pt = [0, 1];
  let bd = Infinity;
  for (const r of map.roads) {
    if (r.kind === "trunk" || r.bridge || r.tunnel) continue;
    for (let i = 1; i < r.pts.length; i++) {
      const [a, b] = [r.pts[i - 1], r.pts[i]];
      const dx = b[0] - a[0];
      const dz = b[1] - a[1];
      const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz || 1)));
      const px = a[0] + dx * t - x;
      const pz = a[1] + dz * t - z;
      const d = Math.hypot(px, pz);
      if (d < bd && d > 0.01) {
        bd = d;
        best = [px / d, pz / d];
      }
    }
  }
  return best;
}

export function buildShops(map: CampusMap, grid: Grid): THREE.Group {
  const group = new THREE.Group();
  group.name = "shops";
  const shops = map.pois.map((p) => ({ p, t: tradeOf(p) })).filter((s): s is { p: Poi; t: Trade } => !!s.t && !!s.p.name);
  const hostOf = (p: Poi): Building | undefined => map.buildings.find((b) => pointInPoly(p.x, p.z, b.outer));

  // Shops inside a building: bays along its front, in order along the wall.
  const byHost = new Map<Building, { p: Poi; t: Trade }[]>();
  const loose: { p: Poi; t: Trade }[] = [];
  for (const s of shops) {
    const h = hostOf(s.p);
    // Hostels and messes have a canteen or two inside; only real shop blocks get fronts.
    if (h && !/block|hostel|mess/i.test(h.name ?? "") && h.type !== "dormitory") {
      const list = byHost.get(h) ?? [];
      list.push(s);
      byHost.set(h, list);
    } else if (!h) loose.push(s);
  }
  // Café buildings OSM names themselves (Nescafe, Amul EastSide, Nandhini (Boys)).
  for (const b of map.buildings) {
    if (!b.name || byHost.has(b) || b.tags.amenity !== "cafe") continue;
    const c = centroid(b.outer);
    byHost.set(b, [{ p: { x: c[0], z: c[1], name: b.name, kind: "cafe", tags: b.tags }, t: tradeOf({ x: 0, z: 0, name: b.name, kind: "", tags: b.tags }) ?? "cafe" }]);
  }

  for (const [b, list] of byHost) {
    const f = frontOf(map, b);
    // Along the wall: tangent (-nz, nx).
    const tx = -f.nz;
    const tz = f.nx;
    const eave = Math.min(3.3, b.height - 0.4);
    const sorted = list.map((s) => ({ ...s, u: (s.p.x - f.x) * tx + (s.p.z - f.z) * tz })).sort((a, c) => a.u - c.u);
    const w = Math.max(2.8, Math.min(5, (f.width - 1) / sorted.length));
    // Spread evenly across the front, centred, so bays never overlap.
    const span = w * sorted.length;
    sorted.forEach((s, i) => {
      const u = -span / 2 + w * (i + 0.5);
      const g = bay(s.p.name, s.t, w, eave);
      g.position.set(f.x + tx * u, 0, f.z + tz * u);
      g.rotation.y = Math.atan2(f.nx, f.nz);
      group.add(g);
      // Counters are solid; you walk up to them, not through them.
      g.updateMatrixWorld(true);
      const c = new THREE.Vector3(-w * 0.1, 0, 0.45).applyMatrix4(g.matrixWorld);
      grid.stampDisc(c.x, c.z, 0.6, SOLID, 1);
    });
    // Tables out front of cafés and the bakery.
    if (sorted.some((s) => s.t === "cafe" || s.t === "bakery" || s.t === "dairy")) addTables(group, grid, f.x, f.z, f.nx, f.nz, Math.min(span, 10));
  }

  for (const s of loose) {
    const [dx, dz] = nearestRoadDir(map, s.p.x, s.p.z);
    if (grid.blocked(s.p.x, s.p.z)) continue;
    const g = kiosk(s.p.name, s.t);
    g.position.set(s.p.x, 0, s.p.z);
    g.rotation.y = Math.atan2(dx, dz);
    group.add(g);
    g.updateMatrixWorld(true);
    const c = new THREE.Vector3(0, 0, -1.3).applyMatrix4(g.matrixWorld);
    grid.stampDisc(c.x, c.z, 1.9, SOLID, 3);
    if (s.t === "cafe" || s.t === "dairy") addTables(group, grid, s.p.x, s.p.z, dx, dz, 6);
  }
  return group;
}

const CHAIRS = [0xd32f2f, 0x1e88e5, 0xf9a825, 0x2e7d32];

/** Two or three café tables a few metres out from a front at (x, z) facing (nx, nz). */
function addTables(group: THREE.Group, grid: Grid, x: number, z: number, nx: number, nz: number, span: number) {
  const n = Math.max(2, Math.min(3, Math.floor(span / 3)));
  for (let i = 0; i < n; i++) {
    const u = (i - (n - 1) / 2) * 2.6;
    const px = x + nx * 4 - nz * u;
    const pz = z + nz * 4 + nx * u;
    if (grid.blocked(px, pz) || grid.blocked(px + nx, pz + nz)) continue;
    const t = tableSet(CHAIRS[(i + Math.round(x)) % CHAIRS.length]);
    t.position.set(px, 0, pz);
    t.rotation.y = Math.atan2(nx, nz) + Math.PI / 2;
    t.traverse((o) => ((o as THREE.Mesh).isMesh ? ((o as THREE.Mesh).castShadow = true) : 0));
    group.add(t);
    grid.stampDisc(px, pz, 0.5, SOLID, 0.8);
  }
}
