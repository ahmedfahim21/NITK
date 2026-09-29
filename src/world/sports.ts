/**
 * The sports facilities, laid out properly on OSM's pitch outlines: the
 * swimming pool with its deck, lanes, blocks and fence; two basketball
 * courts and two volleyball courts in front of it (the open strip beyond
 * them is left bare); two tennis courts opposite Mech and Nandini; and a
 * six-lane running track round Main Ground 2.
 *
 * Built at ground level 0 in each facility's own frame (x along the long
 * axis); world/index.ts lifts the group onto the terrain. Paint sits a hair
 * above the pitch surfaces ground.ts draws (pitch at ~0.09 m, pool ~0.12 m).
 */
import * as THREE from "three";
import { centroid, orientedBox, pointInPoly, type Pt } from "../geo";
import type { Area, CampusMap } from "../osm/types";
import { toon } from "../fx/toon";
import { SOLID, type Grid } from "./grid";
import { signTexture } from "./textures";

const PAINT_Y = 0.1;
const LINE_Y = 0.112;
const LINE_W = 0.08;

type Frame = { g: THREE.Group; len: number; wid: number };

function frameFor(a: Area): Frame {
  const box = orientedBox(a.outer);
  const g = new THREE.Group();
  g.position.set(box.cx, 0, box.cz);
  // Local x runs along the long axis.
  g.rotation.y = -box.angle;
  return { g, len: box.len, wid: box.wid };
}

const white = () => toon(0xf6f6f2, { ramp: "soft" });

/** A flat painted rectangle centred at (x, z), w along x, d along z. */
function patch(g: THREE.Object3D, x: number, z: number, w: number, d: number, colour: number, y = PAINT_Y) {
  const m = new THREE.Mesh(flatGrid(w, d), toon(colour, { ramp: "soft" }));
  m.position.set(x, y, z);
  m.receiveShadow = true;
  g.add(m);
  return m;
}

/**
 * A flat w x d plane, split every 2 m: the terrain lift moves each vertex by
 * the ground under it, so a big quad would cut through a slope between its
 * corners (the pool deck rose over the water that way).
 */
function flatGrid(w: number, d: number): THREE.BufferGeometry {
  return new THREE.PlaneGeometry(w, d, Math.max(1, Math.ceil(w / 2)), Math.max(1, Math.ceil(d / 2))).rotateX(-Math.PI / 2);
}

/** A straight painted line from (x0, z0) to (x1, z1). */
function line(g: THREE.Object3D, x0: number, z0: number, x1: number, z1: number, w = LINE_W) {
  const len = Math.hypot(x1 - x0, z1 - z0);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(len, w).rotateX(-Math.PI / 2), white());
  m.position.set((x0 + x1) / 2, LINE_Y, (z0 + z1) / 2);
  m.rotation.y = -Math.atan2(z1 - z0, x1 - x0);
  g.add(m);
}

/** An outlined rectangle. */
function rect(g: THREE.Object3D, x: number, z: number, w: number, d: number) {
  line(g, x - w / 2, z - d / 2, x + w / 2, z - d / 2);
  line(g, x - w / 2, z + d / 2, x + w / 2, z + d / 2);
  line(g, x - w / 2, z - d / 2, x - w / 2, z + d / 2);
  line(g, x + w / 2, z - d / 2, x + w / 2, z + d / 2);
}

/** A painted arc of radius r round (x, z), from angle a0 to a1 (0 = +x, toward +z). */
function arc(g: THREE.Object3D, x: number, z: number, r: number, a0: number, a1: number) {
  // RingGeometry lies in XY with angle from +x toward +y; laid flat, +y becomes -z, so negate the angles.
  const m = new THREE.Mesh(new THREE.RingGeometry(r - LINE_W / 2, r + LINE_W / 2, 32, 1, -a1, a1 - a0).rotateX(-Math.PI / 2), white());
  m.position.set(x, LINE_Y, z);
  g.add(m);
}

function post(g: THREE.Object3D, x: number, z: number, h: number, r = 0.05, colour = 0x6f7479) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 8), toon(colour));
  m.position.set(x, h / 2, z);
  m.castShadow = true;
  g.add(m);
  return m;
}

/** A net of height `h` from (x, z0) to (x, z1), its top edge at `top`. */
function net(g: THREE.Object3D, x: number, z0: number, z1: number, top: number, h: number) {
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(Math.abs(z1 - z0), h), new THREE.MeshBasicMaterial({ map: netTexture(), transparent: true, side: THREE.DoubleSide, depthWrite: false }));
  mesh.position.set(x, top - h / 2, (z0 + z1) / 2);
  mesh.rotation.y = Math.PI / 2;
  g.add(mesh);
  const band = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.07, Math.abs(z1 - z0)), toon(0xf6f6f2));
  band.position.set(x, top - 0.035, (z0 + z1) / 2);
  g.add(band);
}

let netTex: THREE.Texture | null = null;
function netTexture(): THREE.Texture {
  if (netTex) return netTex;
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const ctx = c.getContext("2d")!;
  ctx.strokeStyle = "rgba(30,30,30,0.85)";
  ctx.lineWidth = 2;
  for (let i = 0; i <= 64; i += 8) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, 64);
    ctx.moveTo(0, i);
    ctx.lineTo(64, i);
    ctx.stroke();
  }
  netTex = new THREE.CanvasTexture(c);
  netTex.wrapS = netTex.wrapT = THREE.RepeatWrapping;
  netTex.repeat.set(20, 2);
  return netTex;
}

/* ---------------- courts ---------------- */

/** A basketball court, `L` along x by `W`, centred at (cx, cz) in g's frame, with its hoops. */
function basketballCourt(g: THREE.Object3D, cx: number, cz: number, L: number, W: number) {
  patch(g, cx, cz, L + 1.5, W + 1.5, 0x3f7f5c);
  patch(g, cx, cz, L, W, 0x2f6fb0, PAINT_Y + 0.003);
  rect(g, cx, cz, L, W);
  line(g, cx, cz - W / 2, cx, cz + W / 2);
  arc(g, cx, cz, 1.8, 0, Math.PI * 2);
  for (const e of [-1, 1]) {
    const ex = cx + e * (L / 2);
    // The key, painted, and its free-throw circle.
    patch(g, ex - e * 2.9, cz, 5.8, 4.9, 0xc0572f, PAINT_Y + 0.006);
    rect(g, ex - e * 2.9, cz, 5.8, 4.9);
    arc(g, ex - e * 5.8, cz, 1.8, e > 0 ? Math.PI / 2 : -Math.PI / 2, e > 0 ? (3 * Math.PI) / 2 : Math.PI / 2);
    // The three-point line: straight sides into an arc round the basket.
    const bx = ex - e * 1.6;
    const r = Math.min(6.75, W / 2 - 0.9);
    arc(g, bx, cz, r, e > 0 ? Math.PI / 2 : -Math.PI / 2, e > 0 ? (3 * Math.PI) / 2 : Math.PI / 2);
    // Pole, arm, backboard, ring.
    const px = ex + e * 1.0;
    post(g, px, cz, 3.4, 0.09, 0x2f3740);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.1, 0.1), toon(0x2f3740));
    arm.position.set(px - e * 0.7, 3.3, cz);
    g.add(arm);
    const board = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1.05, 1.8), toon(0xf6f6f2));
    board.position.set(ex - e * 1.2, 3.35, cz);
    g.add(board);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.23, 0.02, 6, 16).rotateX(Math.PI / 2), toon(0xe25a1c));
    ring.position.set(ex - e * 1.6, 3.05, cz);
    g.add(ring);
  }
}

/** A volleyball court (18 x 9) centred at (cx, cz), with posts and a net across the middle. */
function volleyballCourt(g: THREE.Object3D, cx: number, cz: number) {
  patch(g, cx, cz, 18, 9, 0xc98a55);
  rect(g, cx, cz, 18, 9);
  line(g, cx, cz - 4.5, cx, cz + 4.5);
  line(g, cx - 3, cz - 4.5, cx - 3, cz + 4.5);
  line(g, cx + 3, cz - 4.5, cx + 3, cz + 4.5);
  post(g, cx, cz - 5.5, 2.55, 0.06);
  post(g, cx, cz + 5.5, 2.55, 0.06);
  net(g, cx, cz - 5.5, cz + 5.5, 2.43, 1);
}

/** A tennis court (doubles, 23.77 x 10.97) centred at (cx, cz), with its net. */
function tennisCourt(g: THREE.Object3D, cx: number, cz: number) {
  const L = 23.77;
  const W = 10.97;
  const S = 8.23;
  patch(g, cx, cz, L + 6, W + 5, 0x4f8a57);
  patch(g, cx, cz, L, W, 0x2f6f9a, PAINT_Y + 0.003);
  rect(g, cx, cz, L, W);
  line(g, cx - L / 2, cz - S / 2, cx + L / 2, cz - S / 2);
  line(g, cx - L / 2, cz + S / 2, cx + L / 2, cz + S / 2);
  line(g, cx - 6.4, cz - S / 2, cx - 6.4, cz + S / 2);
  line(g, cx + 6.4, cz - S / 2, cx + 6.4, cz + S / 2);
  line(g, cx - 6.4, cz, cx + 6.4, cz);
  post(g, cx, cz - W / 2 - 0.9, 1.07, 0.04);
  post(g, cx, cz + W / 2 + 0.9, 1.07, 0.04);
  net(g, cx, cz - W / 2 - 0.9, cz + W / 2 + 0.9, 1.0, 0.95);
}

/**
 * Lay out n courts (L long by W wide) in a frame: each court runs across the
 * frame's short side, and they stand side by side down its length, as the
 * real courts do. Shrinks them to fit if the pitch is small.
 */
function across(f: Frame, n: number, L: number, W: number, gap: number, build: (g: THREE.Object3D, L: number, W: number) => void) {
  const l = Math.min(L, f.wid - 1);
  const w = Math.min(W, (f.len - 1 - (n - 1) * gap) / n);
  for (let i = 0; i < n; i++) {
    const sub = new THREE.Group();
    sub.position.x = -((n - 1) * (w + gap)) / 2 + i * (w + gap);
    // The court's own x (its length) along the frame's z.
    sub.rotation.y = Math.PI / 2;
    f.g.add(sub);
    build(sub, l, w);
  }
}

/* ---------------- pool ---------------- */

function pool(a: Area, grid: Grid): THREE.Group {
  const f = frameFor(a);
  const { g, len, wid } = f;
  const deck = 3;
  // Tiled deck round the water, and a white coping on its edge.
  const tiles = patch(g, 0, 0, len + deck * 2, wid + deck * 2, 0xffffff, 0.08);
  (tiles.material as THREE.MeshToonMaterial).map = deckTexture(len + deck * 2, wid + deck * 2);
  const copingMat = toon(0xf4f4ef);
  for (const [x, z, w, d] of [
    [0, -wid / 2 - 0.2, len + 0.8, 0.4],
    [0, wid / 2 + 0.2, len + 0.8, 0.4],
    [-len / 2 - 0.2, 0, 0.4, wid],
    [len / 2 + 0.2, 0, 0.4, wid],
  ]) {
    const c = new THREE.Mesh(new THREE.BoxGeometry(w, 0.18, d), copingMat);
    c.position.set(x, 0.14, z);
    g.add(c);
  }
  // The water itself, over the deck, just under the coping.
  const water = new THREE.Mesh(flatGrid(len, wid), toon(0x3fb6e0, { ramp: "soft", glow: 0x1d6fa8 }));
  water.position.y = 0.12;
  water.receiveShadow = true;
  g.add(water);
  // Lanes: dark T-lines on the floor seen through the water, ropes of alternating floats.
  const lanes = Math.max(4, Math.min(8, Math.floor(wid / 2.5)));
  const lw = wid / lanes;
  for (let k = 0; k < lanes; k++) {
    const z = -wid / 2 + lw * (k + 0.5);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(len - 4, 0.25).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x163f73, transparent: true, opacity: 0.55 }));
    floor.position.set(0, 0.13, z);
    g.add(floor);
    for (const e of [-1, 1]) {
      const t = new THREE.Mesh(new THREE.PlaneGeometry(0.25, 1).rotateX(-Math.PI / 2), floor.material);
      t.position.set(e * (len / 2 - 2), 0.13, z);
      g.add(t);
    }
  }
  const floatMats = [toon(0xd8342c), toon(0xf6f6f2), toon(0x1f5fae)];
  for (let k = 1; k < lanes; k++) {
    const z = -wid / 2 + lw * k;
    const n = Math.floor(len / 0.5);
    for (let i = 0; i < n; i++) {
      const x = -len / 2 + 0.25 + i * 0.5;
      // Red near the ends, alternating blue and white in the middle.
      const end = Math.abs(x) > len / 2 - 5;
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.1, 6, 4), end ? floatMats[0] : floatMats[1 + (i % 2)]);
      b.position.set(x, 0.14, z);
      g.add(b);
    }
  }
  // Backstroke flags, 5 m in from each end.
  for (const e of [-1, 1]) {
    const x = e * (len / 2 - 5);
    for (const side of [-1, 1]) post(g, x, side * (wid / 2 + 1), 1.9, 0.04);
    const pennants = new THREE.Mesh(new THREE.PlaneGeometry(wid + 2, 0.35), new THREE.MeshBasicMaterial({ map: pennantTexture(), transparent: true, side: THREE.DoubleSide }));
    pennants.position.set(x, 1.72, 0);
    pennants.rotation.y = Math.PI / 2;
    g.add(pennants);
  }
  // Starting blocks at one end, each numbered.
  for (let k = 0; k < lanes; k++) {
    const z = -wid / 2 + lw * (k + 0.5);
    const blk = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.72, 0.55), toon(0xf6f6f2));
    blk.position.set(-len / 2 - 0.6, 0.36, z);
    blk.rotation.z = -0.12;
    g.add(blk);
    const top = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.05, 0.57), toon(k % 2 ? 0x1f5fae : 0xd8342c));
    top.position.set(-len / 2 - 0.6, 0.74, z);
    top.rotation.z = -0.12;
    g.add(top);
  }
  // Steel ladders at the corners.
  for (const [ex, ez] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const x = ex * (len / 2 - 1.5);
    const z = ez * (wid / 2 + 0.15);
    for (const s of [-0.25, 0.25]) {
      const rail = new THREE.Mesh(new THREE.TorusGeometry(0.35, 0.03, 6, 12, Math.PI), toon(0xc9ced3));
      rail.position.set(x + s, 0.5, z);
      rail.rotation.y = Math.PI / 2;
      g.add(rail);
    }
  }
  // A lifeguard's chair halfway down one side.
  const chair = new THREE.Group();
  chair.position.set(0, 0, wid / 2 + 1.6);
  for (const [x, z] of [[-0.4, -0.3], [0.4, -0.3], [-0.4, 0.3], [0.4, 0.3]]) post(chair, x, z, 1.8, 0.04, 0xf6f6f2);
  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.08, 0.7), toon(0xd8342c));
  seat.position.y = 1.8;
  const back = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.6, 0.06), toon(0xd8342c));
  back.position.set(0, 2.1, 0.33);
  const shade = new THREE.Mesh(new THREE.ConeGeometry(0.9, 0.4, 10), toon(0xf6f6f2));
  shade.position.set(0, 3.1, 0);
  const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.1, 5), toon(0xc9ced3));
  stick.position.set(0, 2.5, 0);
  chair.add(seat, back, shade, stick);
  g.add(chair);
  // A chain-link fence round the deck, with a gap for the gate on the far side.
  const fx = len / 2 + deck;
  const fz = wid / 2 + deck;
  const fenceMat = new THREE.MeshBasicMaterial({ map: fenceTexture(), transparent: true, side: THREE.DoubleSide, depthWrite: false });
  const fence = (x0: number, z0: number, x1: number, z1: number) => {
    const l = Math.hypot(x1 - x0, z1 - z0);
    const tex = fenceMat.map!.clone();
    tex.repeat.set(l / 2, 1);
    tex.needsUpdate = true;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(l, 1.8), new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide, depthWrite: false }));
    m.position.set((x0 + x1) / 2, 0.9, (z0 + z1) / 2);
    m.rotation.y = -Math.atan2(z1 - z0, x1 - x0);
    g.add(m);
    for (let t = 0; t <= l; t += 3) post(g, x0 + ((x1 - x0) * t) / l, z0 + ((z1 - z0) * t) / l, 1.85, 0.035);
  };
  fence(-fx, -fz, fx, -fz);
  fence(-fx, fz, -1.5, fz);
  fence(1.5, fz, fx, fz);
  fence(-fx, -fz, -fx, fz);
  fence(fx, -fz, fx, fz);
  // Loungers along the far side of the deck.
  for (let i = 0; i < 4; i++) {
    const l = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.35, 0.65), toon(0x2f7ad0));
    l.position.set(-len / 2 + 4 + i * 3, 0.26, -wid / 2 - 1.8);
    g.add(l);
  }
  g.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh && !(m.material as THREE.Material).transparent) m.castShadow = true;
  });
  // The fence keeps people out of the water except through the gate.
  g.updateMatrixWorld(true);
  const w = (x: number, z: number): Pt => {
    const v = new THREE.Vector3(x, 0, z).applyMatrix4(g.matrixWorld);
    return [v.x, v.z];
  };
  for (const [a0, a1] of [
    [w(-fx, -fz), w(fx, -fz)],
    [w(-fx, fz), w(-1.5, fz)],
    [w(1.5, fz), w(fx, fz)],
    [w(-fx, -fz), w(-fx, fz)],
    [w(fx, -fz), w(fx, fz)],
  ]) grid.strokeLine([a0, a1], 0.3, SOLID, 1.8);
  return g;
}

function canvas(w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void, repeat = false): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  draw(c.getContext("2d")!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

function deckTexture(w: number, d: number): THREE.Texture {
  const px = 16;
  return canvas(Math.min(2048, Math.round(w * px)), Math.min(2048, Math.round(d * px)), (ctx) => {
    const W = ctx.canvas.width;
    const H = ctx.canvas.height;
    ctx.fillStyle = "#e6dfcf";
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = "#cfc7b4";
    for (let x = 0; x < W; x += px * 0.5) ctx.strokeRect(x, 0, px * 0.5, H);
    for (let y = 0; y < H; y += px * 0.5) ctx.strokeRect(0, y, W, px * 0.5);
  });
}

function pennantTexture(): THREE.Texture {
  return canvas(512, 32, (ctx) => {
    ctx.fillStyle = "#222";
    ctx.fillRect(0, 0, 512, 2);
    const cols = ["#d8342c", "#f6f6f2", "#1f5fae", "#f2c230"];
    for (let i = 0; i < 32; i++) {
      ctx.fillStyle = cols[i % 4];
      ctx.beginPath();
      ctx.moveTo(i * 16, 2);
      ctx.lineTo(i * 16 + 14, 2);
      ctx.lineTo(i * 16 + 7, 28);
      ctx.fill();
    }
  });
}

function fenceTexture(): THREE.Texture {
  return canvas(
    64,
    64,
    (ctx) => {
      ctx.strokeStyle = "rgba(90,100,105,0.9)";
      ctx.lineWidth = 2;
      for (let i = -64; i <= 128; i += 12) {
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i + 64, 64);
        ctx.moveTo(i + 64, 0);
        ctx.lineTo(i, 64);
        ctx.stroke();
      }
      ctx.fillStyle = "rgba(90,100,105,0.9)";
      ctx.fillRect(0, 0, 64, 3);
    },
    true
  );
}

/* ---------------- running track ---------------- */

/** A six-lane stadium track inset in the frame, reddish-brown with white lane lines. */
function track(f: Frame) {
  const { g, len, wid } = f;
  const lanes = 6;
  const lw = 1.22;
  const tw = lanes * lw;
  // Outer edge of the oval: a stadium shape filling the pitch, 1 m in.
  const ro = wid / 2 - 1;
  const ri = ro - tw;
  const straight = len / 2 - 1 - ro;
  if (straight <= 0 || ri < 5) return;
  const shape = (r: number): Pt[] => {
    const pts: Pt[] = [];
    for (let k = 0; k <= 64; k++) {
      const t = (k / 64) * Math.PI * 2;
      const side = Math.cos(t) >= 0 ? 1 : -1;
      pts.push([side * straight + Math.cos(t) * r, Math.sin(t) * r]);
    }
    return pts;
  };
  const outer = new THREE.Shape(shape(ro).map(([x, z]) => new THREE.Vector2(x, z)));
  outer.holes.push(new THREE.Path(shape(ri).map(([x, z]) => new THREE.Vector2(x, z)).reverse()));
  const surf = new THREE.Mesh(new THREE.ShapeGeometry(outer, 16).rotateX(Math.PI / 2), toon(0xb5553a, { ramp: "soft", side: THREE.DoubleSide }));
  surf.position.y = PAINT_Y;
  surf.receiveShadow = true;
  g.add(surf);
  // The infield stays the pitch's own surface; lane lines on top.
  for (let k = 0; k <= lanes; k++) {
    const r = ri + k * lw;
    const pts = shape(r);
    for (let i = 1; i < pts.length; i++) line(g, pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1], 0.06);
  }
  // Start and finish across the lanes at the end of the home straight.
  line(g, straight, ri, straight, ro, 0.12);
  line(g, -straight, -ri, -straight, -ro, 0.12);
}

/* ---------------- the lot ---------------- */

export function buildSports(map: CampusMap, grid: Grid): THREE.Group {
  const group = new THREE.Group();
  group.name = "sports";
  for (const a of map.areas) {
    const sport = a.sport ?? "";
    if (a.kind === "pool") {
      group.add(pool(a, grid));
    } else if (a.kind === "pitch" && /basketball/.test(sport)) {
      const f = frameFor(a);
      across(f, 2, 28, 15, 1, (g, L, W) => basketballCourt(g, 0, 0, L, W));
      group.add(f.g);
    } else if (a.kind === "pitch" && /^volleyball$/.test(sport)) {
      const f = frameFor(a);
      across(f, 2, 18, 9 + 4, 3, (g) => volleyballCourt(g, 0, 0));
      group.add(f.g);
    } else if (a.kind === "pitch" && /tennis/.test(sport)) {
      const f = frameFor(a);
      across(f, 2, 23.77 + 6, 10.97 + 5, 2, (g) => tennisCourt(g, 0, 0));
      group.add(f.g);
    } else if (a.kind === "pitch" && a.name && /^Main Ground 2$/i.test(a.name)) {
      const f = frameFor(a);
      track(f);
      group.add(f.g);
    }
  }
  // The sports complex between the two big grounds: its name on both long sides, one facing each ground.
  const complex = map.areas.find((a) => a.name && /sports complex/i.test(a.name));
  const hall = complex && map.buildings.find((b) => pointInPoly(centroid(b.outer)[0], centroid(b.outer)[1], complex.outer));
  if (hall) {
    const box = orientedBox(hall.outer);
    const c = Math.cos(box.angle);
    const sn = Math.sin(box.angle);
    const w = Math.min(16, box.len * 0.6);
    const h = w / 8;
    const tex = signTexture(["SPORTS COMPLEX", "NITK · SURATHKAL"], { bg: "#1f5fae", fg: "#ffffff", w: 1024, h: 128 });
    for (const side of [-1, 1]) {
      // The long faces' outward normals are (-sin, cos) and its opposite.
      const nx = -sn * side;
      const nz = c * side;
      const board = new THREE.Mesh(new THREE.PlaneGeometry(w, h), toon(0xffffff, { map: tex, ramp: "soft", glow: 0x666666, emissiveMap: tex }));
      board.position.set(box.cx + nx * (box.wid / 2 + 0.12), Math.min(hall.height - 1.2, 6.5), box.cz + nz * (box.wid / 2 + 0.12));
      board.rotation.y = Math.atan2(nx, nz);
      group.add(board);
    }
  } else console.warn("[sports] no building inside the sports complex area for its sign");

  // Posts and hoops are solid; the painted courts are open ground.
  group.updateMatrixWorld(true);
  group.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || !(m.geometry instanceof THREE.CylinderGeometry)) return;
    const p = new THREE.Vector3().setFromMatrixPosition(m.matrixWorld);
    grid.stampDisc(p.x, p.z, 0.2, SOLID, 2);
  });
  return group;
}
