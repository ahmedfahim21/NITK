/**
 * Cycles: the black roadster every Indian campus runs on (and the odd
 * geared MTB). A handful of students ride the campus roads, racks stand
 * outside the hostels, and the player gets one in Chapter 1.
 */
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { mulberry32, pointInPoly, type Pt } from "../geo";
import type { CampusMap } from "../osm/types";
import { toon } from "../fx/toon";
import { groundHeight } from "../world/terrain";
import { makePerson, type Look } from "../people";
import type { HeroAnimator } from "../hero";

function tube(a: THREE.Vector3, b: THREE.Vector3, r: number): THREE.BufferGeometry {
  const len = a.distanceTo(b);
  const g = new THREE.CylinderGeometry(r, r, len, 6);
  const mid = a.clone().add(b).multiplyScalar(0.5);
  const dir = b.clone().sub(a).normalize();
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
  g.applyQuaternion(q);
  g.translate(mid.x, mid.y, mid.z);
  return g;
}

/** A cycle with forward = +z, origin on the ground between the wheels. */
export function makeCycle(frame = 0x15171a): THREE.Group {
  const g = new THREE.Group();
  const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  const rearHub = V(0, 0.34, -0.55);
  const frontHub = V(0, 0.34, 0.55);
  const bb = V(0, 0.32, -0.05);
  const seatTop = V(0, 0.88, -0.2);
  const headTop = V(0, 0.95, 0.42);
  const headBot = V(0, 0.74, 0.47);
  const frameGeo = mergeGeometries([
    tube(bb, seatTop, 0.022),
    tube(seatTop, headTop, 0.02),
    tube(bb, headBot, 0.024),
    tube(rearHub, bb, 0.016),
    tube(rearHub, seatTop, 0.014),
    tube(headBot, frontHub, 0.018),
    tube(headBot, headTop, 0.024),
    tube(V(-0.28, 1.02, 0.38), V(0.28, 1.02, 0.38), 0.016),
    tube(headTop, V(0, 1.02, 0.38), 0.016),
  ])!;
  const frameMesh = new THREE.Mesh(frameGeo, toon(frame));
  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.06, 0.26), toon(0x2b1d14));
  seat.position.set(0, 0.92, -0.22);
  const carrier = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.03, 0.42), toon(0x9aa3a8));
  carrier.position.set(0, 0.74, -0.5);
  const grips = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.04, 0.05), toon(0x1b1f2a));
  grips.position.set(0, 1.02, 0.38);
  const bell = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), toon(0xd9dde0));
  bell.position.set(0.18, 1.06, 0.38);
  g.add(frameMesh, seat, carrier, grips, bell);
  const wheels: THREE.Object3D[] = [];
  for (const hub of [rearHub, frontHub]) {
    const w = new THREE.Group();
    w.position.copy(hub);
    const tyre = new THREE.Mesh(new THREE.TorusGeometry(0.33, 0.028, 6, 20).rotateY(Math.PI / 2), toon(0x1b1f2a));
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.01, 4, 20).rotateY(Math.PI / 2), toon(0xc9ced1));
    w.add(tyre, rim);
    for (let k = 0; k < 4; k++) {
      const sp = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.6, 0.008), toon(0xc9ced1));
      sp.rotation.x = (k * Math.PI) / 4;
      w.add(sp);
    }
    g.add(w);
    wheels.push(w);
  }
  g.userData.wheels = wheels;
  g.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) o.castShadow = true;
  });
  return g;
}

/** Bakes a group into one vertex-coloured geometry (for static racks). */
function bake(root: THREE.Object3D): THREE.BufferGeometry {
  root.updateMatrixWorld(true);
  const parts: THREE.BufferGeometry[] = [];
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const g = (m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone()).applyMatrix4(m.matrixWorld);
    const c = (m.material as THREE.MeshToonMaterial).color;
    const n = g.attributes.position.count;
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], i * 3);
    g.setAttribute("color", new THREE.BufferAttribute(col, 3));
    g.deleteAttribute("uv");
    parts.push(g);
  });
  return mergeGeometries(parts)!;
}

const FRAMES = [0x15171a, 0x15171a, 0x15171a, 0x8e1b1b, 0x1d3557, 0x2f7d4f];

/** Rows of parked cycles; one draw call per rack. */
export function buildRacks(spots: { x: number; z: number; face: number }[]): THREE.Group {
  const out = new THREE.Group();
  const mat = toon(0xffffff, { vertexColors: true });
  const rand = mulberry32(55);
  for (const s of spots) {
    const rack = new THREE.Group();
    const n = 4 + Math.floor(rand() * 3);
    for (let k = 0; k < n; k++) {
      const c = makeCycle(FRAMES[Math.floor(rand() * FRAMES.length)]);
      c.position.set((k - (n - 1) / 2) * 0.65, 0, (rand() - 0.5) * 0.2);
      c.rotation.set(0, (rand() - 0.5) * 0.15, 0.1);
      rack.add(c);
    }
    const mesh = new THREE.Mesh(bake(rack), mat);
    mesh.position.set(s.x, groundHeight(s.x, s.z), s.z);
    mesh.rotation.y = s.face;
    mesh.castShadow = true;
    out.add(mesh);
  }
  return out;
}

type Rider = { g: THREE.Group; cycle: THREE.Group; anim: HeroAnimator; edge: number; dir: 1 | -1; t: number; speed: number; x: number; z: number };

/** A few students riding the campus roads. */
export class Riders {
  readonly group = new THREE.Group();
  private nodes: { x: number; z: number; edges: number[] }[] = [];
  private edges: { a: number; b: number; len: number; off: number }[] = [];
  private riders: Rider[] = [];
  private rand = mulberry32(808);

  constructor(map: CampusMap, count = 6) {
    const index = new Map<string, number>();
    const inCampus = (p: Pt) => !map.campus.length || map.campus.some((c) => pointInPoly(p[0], p[1], c));
    const node = (p: Pt) => {
      const k = `${Math.round(p[0])},${Math.round(p[1])}`;
      let i = index.get(k);
      if (i === undefined) {
        i = this.nodes.length;
        this.nodes.push({ x: p[0], z: p[1], edges: [] });
        index.set(k, i);
      }
      return i;
    };
    for (const r of map.roads) {
      if (r.kind === "trunk" || r.kind === "primary" || r.rank < 4 || r.bridge) continue;
      for (let i = 1; i < r.pts.length; i++) {
        const [a, b] = [r.pts[i - 1], r.pts[i]];
        if (!inCampus([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2])) continue;
        const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (len < 0.5) continue;
        const ia = node(a);
        const ib = node(b);
        if (ia === ib) continue;
        const e = this.edges.length;
        this.edges.push({ a: ia, b: ib, len, off: Math.max(0.8, r.width / 2 - 1) });
        this.nodes[ia].edges.push(e);
        this.nodes[ib].edges.push(e);
      }
    }
    if (!this.edges.length) return;
    const looks: Look[] = [
      { skin: 0xa0623a, shirt: 0xecf0f1, pants: 0x2c3e8f, shoe: 0xe8e8e8, hair: 0x1a1512, bag: 0x2d3436 },
      { skin: 0xc68642, shirt: 0xe74c3c, pants: 0x2d3436, shoe: 0xe8e8e8, hair: 0x241c16, bag: null },
      { skin: 0x8d5524, shirt: 0x27ae60, pants: 0x485460, shoe: 0xe8e8e8, hair: 0x1a1512, bag: 0x1d3557, longHair: true },
      { skin: 0xe0ac69, shirt: 0xf1c40f, pants: 0x34495e, shoe: 0xe8e8e8, hair: 0x2e2018, bag: 0xb33939 },
      { skin: 0x9c6a44, shirt: 0x6c5ce7, pants: 0x1e272e, shoe: 0xe8e8e8, hair: 0x0f0c0a, bag: null, longHair: true },
      { skin: 0xb07040, shirt: 0x34495e, pants: 0x6d5d4b, shoe: 0xe8e8e8, hair: 0x1a1512, bag: 0x2f7d4f },
    ];
    for (let k = 0; k < count; k++) {
      const g = new THREE.Group();
      const cycle = makeCycle(FRAMES[k % FRAMES.length]);
      const s = makePerson(looks[k % looks.length]);
      g.add(cycle, s.root);
      this.group.add(g);
      this.riders.push({
        g,
        cycle,
        anim: s.anim,
        edge: Math.floor(this.rand() * this.edges.length),
        dir: this.rand() < 0.5 ? 1 : -1,
        t: this.rand(),
        speed: 3.8 + this.rand() * 1.8,
        x: 0,
        z: 0,
      });
    }
  }

  update(dt: number, player: THREE.Vector3, night: boolean) {
    this.group.visible = !night;
    if (night) return;
    for (const r of this.riders) {
      const e = this.edges[r.edge];
      const A = this.nodes[e.a];
      const B = this.nodes[e.b];
      const dx = B.x - A.x;
      const dz = B.z - A.z;
      // Brake for the player.
      const ahead = Math.hypot(r.x - player.x, r.z - player.z) < 3.2;
      const v = ahead ? 0 : r.speed;
      r.t += (r.dir * v * dt) / e.len;
      if (r.t > 1 || r.t < 0) {
        const at = r.t > 1 ? e.b : e.a;
        const opts = this.nodes[at].edges.filter((k) => k !== r.edge);
        const next = opts.length ? opts[Math.floor(this.rand() * opts.length)] : r.edge;
        r.edge = next;
        const ne = this.edges[next];
        r.dir = ne.a === at ? 1 : -1;
        r.t = r.dir === 1 ? 0 : 1;
        continue;
      }
      const l = e.len;
      const x = A.x + dx * r.t + (dz / l) * e.off * r.dir;
      const z = A.z + dz * r.t - (dx / l) * e.off * r.dir;
      r.x = x;
      r.z = z;
      r.g.position.set(x, groundHeight(x, z), z);
      r.g.rotation.y = Math.atan2(dx * r.dir, dz * r.dir);
      const spin = (v * dt) / 0.34;
      for (const w of r.cycle.userData.wheels as THREE.Object3D[]) w.rotation.x += spin;
      const ph = (r.cycle.userData.phase = ((r.cycle.userData.phase as number) ?? 0) + spin * 0.5);
      r.anim.update({ dt, t: ph, speed: v, accel: 0, turn: 0, air: 0, vy: 0, crouch: 0, look: 0, pedal: ph });
    }
  }
}
