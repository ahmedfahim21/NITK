/**
 * Campus students. They walk the real footpaths and campus roads as a graph,
 * idle in chatting knots at the hangouts, carry umbrellas when it pours, and
 * complain when you barge through them. Rendered as one InstancedMesh per
 * body part, so the whole crowd costs about a dozen draw calls.
 */
import * as THREE from "three";
import { mulberry32, pointInPoly, type Pt } from "../geo";
import type { CampusMap } from "../osm/types";
import { toon } from "../fx/toon";
import { groundHeight } from "../world/terrain";
import type { Grid } from "../world/grid";

type Node = { x: number; z: number; edges: number[] };
type Edge = { a: number; b: number; len: number; off: number };

type Agent = {
  mode: "walk" | "hang";
  edge: number;
  dir: 1 | -1;
  t: number;
  speed: number;
  side: number;
  x: number;
  z: number;
  face: number;
  phase: number;
  pause: number;
  /** Seconds left of an annoyed stop after a bump. */
  startle: number;
  umbrella: boolean;
  night: boolean;
  visible: boolean;
  look: number;
  long: boolean;
  bag: boolean;
};

const SHIRTS = [0xe74c3c, 0x2e86de, 0x27ae60, 0xf1c40f, 0x8e44ad, 0xecf0f1, 0x34495e, 0xe67e22, 0x16a085, 0xd35400, 0xc0392b, 0x2c3e50, 0xfd79a8, 0x6c5ce7, 0xffffff, 0x00b894];
const PANTS = [0x2d3436, 0x34495e, 0x2c3e8f, 0x3b4f7a, 0x6d5d4b, 0x1e272e, 0x485460];
const SKIN = [0x8d5524, 0xa0623a, 0xc68642, 0xb07040, 0xe0ac69, 0x7a4a2a, 0x9c6a44];
const HAIR = [0x1a1512, 0x241c16, 0x2e2018, 0x0f0c0a];
const BAGS = [0x2d3436, 0x1d3557, 0xb33939, 0x2f7d4f, 0x6c5ce7, 0xe17055];
const UMBRELLA = [0x1b1f2a, 0x1d3557, 0x7a2e1d, 0x6c5ce7, 0x2f7d4f];

export const CHATTER = [
  "Nescafe after class?",
  "Machaa, did you finish the lab record?",
  "IRIS is down again.",
  "Rain again. Obviously.",
  "Maggi or neer dosa?",
  "Engineer registrations open next week!",
  "Sunset at the beach today?",
  "ಊಟ ಆಯ್ತಾ? (Had lunch?)",
  "Mess mein aaj paneer hai!",
  "Karavali > Aravali. No debate.",
  "LHC-A or LHC-B? I'm lost.",
  "Crescendo practice at 9.",
  "Who's on the Freshers Cup team?",
  "Don't go near the lighthouse. Bees.",
  "Attendance 74.9%... pray for me.",
  "Oreo shake at Nandini?",
  "Bus to Mangalore at 5?",
  "Take the overpass. NH66 is not a joke.",
  "ಎಂಚ ಉಲ್ಲರ್? (Tulu: how are you?)",
  "Midsems in two weeks?? Already?",
  "My cycle's been 'borrowed' again.",
  "Placement season stories from the seniors…",
  "Bro the Wi-Fi in the block is dead.",
  "Night canteen at 1 AM, you in?",
  "Did you see the NITK Racing car?",
  "Library closes at 11, move fast.",
];

export const BUMP_LINES = ["Oye! Watch it!", "Fresher, eyes up!", "Arre, careful!", "Dude, my chai!", "Seriously?", "Walk much?"];

function key(p: Pt) {
  return `${Math.round(p[0])},${Math.round(p[1])}`;
}

export class Crowd {
  readonly group = new THREE.Group();
  private nodes: Node[] = [];
  private edges: Edge[] = [];
  private agents: Agent[] = [];
  private parts: { mesh: THREE.InstancedMesh; pivot: THREE.Vector3; kind: string }[] = [];
  private hidden = new THREE.Matrix4().makeScale(0, 0, 0);
  private rand = mulberry32(4242);
  raining = false;
  night = false;

  constructor(map: CampusMap, grid: Grid, hangouts: Pt[], count = 150) {
    this.group.name = "crowd";
    this.buildGraph(map);
    this.buildParts(count + hangouts.length * 4);
    const rand = this.rand;
    if (this.edges.length) {
      for (let i = 0; i < count; i++) {
        const e = Math.floor(rand() * this.edges.length);
        this.agents.push(this.newAgent("walk", e));
      }
    }
    // Chatting knots at the hangouts.
    for (const [hx, hz] of hangouts) {
      const n = 3 + Math.floor(rand() * 2);
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2 + rand() * 0.4;
        const ag = this.newAgent("hang", 0);
        const [fx, fz] = grid.nearestFree(hx + Math.cos(a) * 1.3, hz + Math.sin(a) * 1.3, 20);
        ag.x = fx;
        ag.z = fz;
        ag.face = Math.atan2(hx - fx, hz - fz);
        ag.night = rand() < 0.5;
        this.agents.push(ag);
      }
    }
  }

  private newAgent(mode: Agent["mode"], edge: number): Agent {
    const r = this.rand;
    return {
      mode,
      edge,
      dir: r() < 0.5 ? 1 : -1,
      t: r(),
      speed: 1.05 + r() * 0.55,
      side: r() < 0.5 ? -1 : 1,
      x: 0,
      z: 0,
      face: 0,
      phase: r() * 6,
      pause: 0,
      startle: 0,
      umbrella: r() < 0.75,
      night: r() < 0.3,
      visible: false,
      look: Math.floor(r() * 100000),
      long: r() < 0.38,
      bag: r() < 0.7,
    };
  }

  private buildGraph(map: CampusMap) {
    const index = new Map<string, number>();
    const inCampus = (p: Pt) => !map.campus.length || map.campus.some((c) => pointInPoly(p[0], p[1], c));
    const node = (p: Pt) => {
      const k = key(p);
      let i = index.get(k);
      if (i === undefined) {
        i = this.nodes.length;
        this.nodes.push({ x: p[0], z: p[1], edges: [] });
        index.set(k, i);
      }
      return i;
    };
    for (const r of map.roads) {
      if (r.kind === "trunk" || r.kind === "primary" || r.bridge) continue;
      const off = r.kind === "footway" || r.kind === "steps" || r.kind === "cycleway" ? 0.35 : Math.max(0.6, r.width / 2 - 0.6);
      for (let i = 1; i < r.pts.length; i++) {
        const a = r.pts[i - 1];
        const b = r.pts[i];
        const mid: Pt = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
        if (!inCampus(mid)) continue;
        const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (len < 0.5) continue;
        const ia = node(a);
        const ib = node(b);
        if (ia === ib) continue;
        const e = this.edges.length;
        this.edges.push({ a: ia, b: ib, len, off });
        this.nodes[ia].edges.push(e);
        this.nodes[ib].edges.push(e);
      }
    }
  }

  private buildParts(n: number) {
    const add = (kind: string, geo: THREE.BufferGeometry, pivot: THREE.Vector3, ramp: "three" | "soft" = "three") => {
      const side = kind === "umbrella" ? THREE.DoubleSide : THREE.FrontSide;
      const mesh = new THREE.InstancedMesh(geo, toon(0xffffff, { ramp, side }), n);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.castShadow = kind !== "umbrella";
      mesh.frustumCulled = false;
      for (let i = 0; i < n; i++) mesh.setMatrixAt(i, this.hidden);
      this.group.add(mesh);
      this.parts.push({ mesh, pivot, kind });
    };
    const leg = new THREE.BoxGeometry(0.16, 0.85, 0.18).translate(0, -0.43, 0);
    add("legL", leg, new THREE.Vector3(-0.12, 0.95, 0));
    add("legR", leg.clone(), new THREE.Vector3(0.12, 0.95, 0));
    const shoe = new THREE.BoxGeometry(0.17, 0.1, 0.3).translate(0, -0.88, 0.05);
    add("shoeL", shoe, new THREE.Vector3(-0.12, 0.95, 0));
    add("shoeR", shoe.clone(), new THREE.Vector3(0.12, 0.95, 0));
    add("torso", new THREE.BoxGeometry(0.46, 0.62, 0.26).translate(0, 0.33, 0), new THREE.Vector3(0, 0.95, 0));
    const arm = new THREE.BoxGeometry(0.12, 0.6, 0.13).translate(0, -0.27, 0);
    add("armL", arm, new THREE.Vector3(-0.3, 1.55, 0));
    add("armR", arm.clone(), new THREE.Vector3(0.3, 1.55, 0));
    add("head", new THREE.SphereGeometry(0.17, 10, 8), new THREE.Vector3(0, 1.79, 0));
    add("hair", new THREE.SphereGeometry(0.18, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.55).rotateX(-0.25), new THREE.Vector3(0, 1.82, 0));
    add("tail", new THREE.BoxGeometry(0.26, 0.42, 0.09), new THREE.Vector3(0, 1.61, -0.16));
    add("bag", new THREE.BoxGeometry(0.36, 0.44, 0.18), new THREE.Vector3(0, 1.31, -0.22));
    const umb = new THREE.ConeGeometry(0.75, 0.32, 8, 1, true).translate(0, 0.16, 0);
    const stick = new THREE.CylinderGeometry(0.015, 0.015, 0.9).translate(0, -0.3, 0);
    const merged = mergeUmbrella(umb, stick);
    add("umbrella", merged, new THREE.Vector3(0.18, 2.12, 0.1), "soft");

    // Per-agent colours are fixed; set them once agents exist (lazy in first update).
  }

  private coloured = false;
  private colourAll() {
    const c = new THREE.Color();
    this.agents.forEach((ag, i) => {
      const r = mulberry32(ag.look);
      const shirt = SHIRTS[Math.floor(r() * SHIRTS.length)];
      const pants = PANTS[Math.floor(r() * PANTS.length)];
      const skin = SKIN[Math.floor(r() * SKIN.length)];
      const hair = HAIR[Math.floor(r() * HAIR.length)];
      const bag = BAGS[Math.floor(r() * BAGS.length)];
      const umb = UMBRELLA[Math.floor(r() * UMBRELLA.length)];
      for (const p of this.parts) {
        const hex =
          p.kind === "legL" || p.kind === "legR"
            ? pants
            : p.kind === "shoeL" || p.kind === "shoeR"
              ? 0xe8e8e8
              : p.kind === "torso" || p.kind === "armL" || p.kind === "armR"
                ? shirt
                : p.kind === "head"
                  ? skin
                  : p.kind === "hair" || p.kind === "tail"
                    ? hair
                    : p.kind === "bag"
                      ? bag
                      : umb;
        p.mesh.setColorAt(i, c.set(hex));
      }
    });
    for (const p of this.parts) if (p.mesh.instanceColor) p.mesh.instanceColor.needsUpdate = true;
    this.coloured = true;
  }

  /** True if a student stands at (x, z): the player's extra obstacle. */
  blocked(x: number, z: number): boolean {
    for (const a of this.agents) {
      if (!a.visible) continue;
      const dx = a.x - x;
      const dz = a.z - z;
      if (dx * dx + dz * dz < 0.2) return true;
    }
    return false;
  }

  /** Visible students within r of a point, nearest first. */
  near(x: number, z: number, r: number): { x: number; z: number; i: number; d: number }[] {
    const out: { x: number; z: number; i: number; d: number }[] = [];
    this.agents.forEach((a, i) => {
      if (!a.visible) return;
      const d = Math.hypot(a.x - x, a.z - z);
      if (d < r) out.push({ x: a.x, z: a.z, i, d });
    });
    return out.sort((p, q) => p.d - q.d);
  }

  /** Makes a student stop and turn to face (x, z). */
  startle(i: number, x: number, z: number) {
    const a = this.agents[i];
    a.startle = 1.4;
    a.face = Math.atan2(x - a.x, z - a.z);
  }

  update(dt: number, cam: THREE.Vector3, player: THREE.Vector3) {
    if (!this.coloured) this.colourAll();
    const rot = new THREE.Matrix4();
    const tr = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const root = new THREE.Matrix4();
    const tmp = new THREE.Matrix4();
    const rx = new THREE.Matrix4();

    this.agents.forEach((a, i) => {
      const active = !this.night || a.night;
      // Move.
      if (active && a.mode === "walk" && this.edges.length) {
        if (a.startle > 0) a.startle -= dt;
        else if (a.pause > 0) a.pause -= dt;
        else {
          const pd = Math.hypot(a.x - player.x, a.z - player.z);
          const e = this.edges[a.edge];
          if (pd > 1.1 || a.visible === false) a.t += (a.dir * a.speed * dt) / e.len;
          if (a.t > 1 || a.t < 0) this.nextEdge(a);
        }
        const e = this.edges[a.edge];
        const A = this.nodes[e.a];
        const B = this.nodes[e.b];
        const dx = B.x - A.x;
        const dz = B.z - A.z;
        const l = e.len;
        // Keep to the left of travel, like the traffic.
        const side = a.dir;
        const px = A.x + dx * a.t + (dz / l) * e.off * side;
        const pz = A.z + dz * a.t - (dx / l) * e.off * side;
        a.x = px;
        a.z = pz;
        if (a.startle <= 0 && a.pause <= 0) a.face = Math.atan2(dx * a.dir, dz * a.dir);
      } else if (a.startle > 0) a.startle -= dt;

      const dCam = Math.hypot(a.x - cam.x, a.z - cam.z);
      const show = active && dCam < 170;
      a.visible = show;
      if (!show) {
        for (const p of this.parts) p.mesh.setMatrixAt(i, this.hidden);
        return;
      }
      const moving = active && a.mode === "walk" && a.pause <= 0 && a.startle <= 0;
      if (moving) a.phase += dt * (3 + a.speed * 1.25);
      else a.phase += dt * 0.8;
      const swing = moving ? Math.sin(a.phase) * 0.55 : 0;
      const talk = !moving ? Math.sin(a.phase * 2.2) * 0.15 : 0;
      q.setFromAxisAngle(up, a.face);
      root.compose(new THREE.Vector3(a.x, groundHeight(a.x, a.z), a.z), q, new THREE.Vector3(1, 1, 1));

      for (const p of this.parts) {
        let angle = 0;
        let hide = false;
        switch (p.kind) {
          case "legL":
          case "shoeL":
            angle = swing;
            break;
          case "legR":
          case "shoeR":
            angle = -swing;
            break;
          case "armL":
            angle = -swing * 0.8 + talk;
            break;
          case "armR":
            angle = this.raining && a.umbrella ? -1.9 : swing * 0.8 - talk;
            break;
          case "tail":
            hide = !a.long;
            break;
          case "bag":
            hide = !a.bag || a.mode === "hang";
            break;
          case "umbrella":
            hide = !(this.raining && a.umbrella);
            break;
        }
        if (hide) {
          p.mesh.setMatrixAt(i, this.hidden);
          continue;
        }
        const bob = moving ? Math.abs(Math.cos(a.phase)) * 0.05 : 0;
        tr.makeTranslation(p.pivot.x, p.pivot.y + bob, p.pivot.z);
        rx.makeRotationX(angle);
        tmp.multiplyMatrices(tr, rx);
        rot.multiplyMatrices(root, tmp);
        p.mesh.setMatrixAt(i, rot);
      }
    });
    for (const p of this.parts) p.mesh.instanceMatrix.needsUpdate = true;
  }

  private nextEdge(a: Agent) {
    const e = this.edges[a.edge];
    const at = a.t > 1 ? e.b : e.a;
    const node = this.nodes[at];
    const options = node.edges.filter((k) => k !== a.edge);
    const next = options.length ? options[Math.floor(this.rand() * options.length)] : a.edge;
    const ne = this.edges[next];
    a.edge = next;
    if (ne.a === at) {
      a.dir = 1;
      a.t = 0;
    } else {
      a.dir = -1;
      a.t = 1;
    }
    // Now and then, stop at a junction to chat or check the phone.
    if (this.rand() < 0.08) a.pause = 2 + this.rand() * 5;
  }
}

function mergeUmbrella(canopy: THREE.BufferGeometry, stick: THREE.BufferGeometry): THREE.BufferGeometry {
  const a = canopy.toNonIndexed();
  const b = stick.toNonIndexed();
  const g = new THREE.BufferGeometry();
  const pos = new Float32Array(a.attributes.position.count * 3 + b.attributes.position.count * 3);
  pos.set(a.attributes.position.array as Float32Array, 0);
  pos.set(b.attributes.position.array as Float32Array, a.attributes.position.count * 3);
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}
