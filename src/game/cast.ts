/**
 * The named characters of Chapter 1. Fictional people in a real place: none
 * of them is modelled on a real student or staff member.
 */
import * as THREE from "three";
import { makeStudent, type Look } from "../player";
import { groundHeight } from "../world/terrain";

export type CastId =
  | "prakash"
  | "rohan"
  | "shetty"
  | "warden"
  | "vikram"
  | "ananya"
  | "nescafe"
  | "kiran"
  | "meera"
  | "sid"
  | "coach";

export type Def = { name: string; role: string; look: Look; scale?: number };

export const CAST: Record<CastId, Def> = {
  prakash: {
    name: "Prakash",
    role: "3rd-year Mech, Crescendo core, self-appointed fresher guide",
    look: { skin: 0x8d5524, shirt: 0xb85c3e, pants: 0x2d3436, shoe: 0x1b1f2a, hair: 0x1a1512, bag: null },
  },
  rohan: {
    name: "Rohan",
    role: "Your roommate. From Lucknow. Opinions on everything",
    look: { skin: 0xc68642, shirt: 0xf1c40f, pants: 0x2c3e8f, shoe: 0xe8e8e8, hair: 0x241c16, bag: 0x2d3436 },
  },
  shetty: {
    name: "Mrs. Shetty",
    role: "Academic Section. Has seen ten thousand freshers",
    look: { skin: 0xa0623a, shirt: 0x16a085, pants: 0x16a085, shoe: 0x6d5d4b, hair: 0x1a1512, bag: null, longHair: true },
  },
  warden: {
    name: "Warden Rao",
    role: "Karavali's warden. Strict, fair, allergic to excuses",
    look: { skin: 0x9c6a44, shirt: 0xecf0f1, pants: 0x485460, shoe: 0x1b1f2a, hair: 0x6f6f6f, bag: null },
  },
  vikram: {
    name: "Vikram",
    role: "Final year, NITK Racing, selling his cycle",
    look: { skin: 0xb07040, shirt: 0x1d3557, pants: 0x1e272e, shoe: 0xe8e8e8, hair: 0x0f0c0a, bag: 0xb33939 },
  },
  ananya: {
    name: "Ananya",
    role: "3rd-year CSE, IRIS team. Does not do small talk",
    look: { skin: 0xe0ac69, shirt: 0x6c5ce7, pants: 0x2d3436, shoe: 0xe8e8e8, hair: 0x1a1512, bag: 0x2d3436, longHair: true },
  },
  nescafe: {
    name: "Nescafe anna",
    role: "Runs the counter. Knows everyone's order",
    look: { skin: 0x7a4a2a, shirt: 0xc0392b, pants: 0x2d3436, shoe: 0x1b1f2a, hair: 0x1a1512, bag: null },
  },
  kiran: {
    name: "Kiran",
    role: "Aravali fresher. Prankster. Fast.",
    look: { skin: 0xa0623a, shirt: 0x27ae60, pants: 0x1e272e, shoe: 0xe8e8e8, hair: 0x0f0c0a, bag: null },
  },
  meera: {
    name: "Meera",
    role: "2nd-year, Star Gazing Club. Owns a telescope and opinions about light pollution",
    look: { skin: 0xc68642, shirt: 0x1d3557, pants: 0x2d3436, shoe: 0xe8e8e8, hair: 0x1a1512, bag: 0x6c5ce7, longHair: true },
  },
  sid: {
    name: "Sid",
    role: "Linux Users Group. Uses Arch, btw",
    look: { skin: 0xe0ac69, shirt: 0x2d3436, pants: 0x34495e, shoe: 0x1b1f2a, hair: 0x241c16, bag: 0x2d3436 },
  },
  coach: {
    name: "Phoenix captain",
    role: "Runs the Freshers Cup. Whistle always ready",
    look: { skin: 0x8d5524, shirt: 0xf5b400, pants: 0x1e272e, shoe: 0xe8e8e8, hair: 0x1a1512, bag: null },
  },
};

function markerTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#1b1f2a";
  ctx.beginPath();
  ctx.arc(64, 64, 60, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#ffd23f";
  ctx.beginPath();
  ctx.arc(64, 64, 52, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#1b1f2a";
  ctx.font = "900 86px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("!", 64, 70);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class Character {
  readonly root: THREE.Group;
  readonly marker: THREE.Sprite;
  private parts: Record<string, THREE.Object3D>;
  private phase = Math.random() * 6;
  x = 0;
  z = 0;
  face = 0;
  /** Turn to face the player when they come close. */
  watch = true;
  /** When set, runs along these points at `runSpeed`. */
  path: [number, number][] | null = null;
  runSpeed = 6;
  private legs: THREE.Object3D[];
  private arms: THREE.Object3D[];

  constructor(
    readonly id: string,
    readonly def: Def,
    tex: THREE.Texture
  ) {
    const s = makeStudent(def.look);
    this.root = s.root;
    this.parts = s.parts;
    this.marker = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
    this.marker.scale.set(0.75, 0.75, 1);
    this.marker.position.y = 2.55;
    this.marker.renderOrder = 5;
    this.marker.visible = false;
    this.root.add(this.marker);
    this.root.visible = false;
    this.legs = [s.parts.legL, s.parts.legR];
    this.arms = [s.parts.armL, s.parts.armR];
  }

  get name() {
    return this.def.name;
  }

  place(x: number, z: number, face = this.face) {
    this.x = x;
    this.z = z;
    this.face = face;
    this.root.position.set(x, groundHeight(x, z), z);
    this.root.rotation.y = face;
    this.root.visible = true;
  }

  hide() {
    this.root.visible = false;
    this.marker.visible = false;
  }

  update(dt: number, player: THREE.Vector3, t: number) {
    if (!this.root.visible) return;
    if (this.path && this.path.length) {
      // Run to the next waypoint.
      const [tx, tz] = this.path[0];
      const dx = tx - this.x;
      const dz = tz - this.z;
      const d = Math.hypot(dx, dz);
      const step = this.runSpeed * dt;
      if (d <= step) {
        this.x = tx;
        this.z = tz;
        this.path.shift();
      } else {
        this.x += (dx / d) * step;
        this.z += (dz / d) * step;
        this.face = Math.atan2(dx, dz);
      }
      this.root.position.set(this.x, groundHeight(this.x, this.z), this.z);
      this.root.rotation.y = this.face;
      this.phase += dt * (3 + this.runSpeed * 1.3);
      const sw = Math.sin(this.phase) * 0.9;
      this.legs[0].rotation.x = sw;
      this.legs[1].rotation.x = -sw;
      this.arms[0].rotation.x = -sw;
      this.arms[1].rotation.x = sw;
      this.marker.position.y = 2.55 + Math.sin(t * 3) * 0.12;
      return;
    }
    this.phase += dt;
    const p = this.parts;
    // Idle: weight shift and a hand that talks.
    p.hips.position.y = 0.95 + Math.sin(this.phase * 1.6) * 0.01;
    p.armR.rotation.x = Math.sin(this.phase * 2.1) * 0.12;
    p.armL.rotation.x = -Math.sin(this.phase * 1.7) * 0.08;
    p.legL.rotation.x = 0;
    p.legR.rotation.x = 0;
    const d = Math.hypot(player.x - this.x, player.z - this.z);
    if (this.watch && d < 9) {
      const want = Math.atan2(player.x - this.x, player.z - this.z);
      const diff = Math.atan2(Math.sin(want - this.root.rotation.y), Math.cos(want - this.root.rotation.y));
      this.root.rotation.y += diff * Math.min(1, dt * 5);
    }
    this.marker.position.y = 2.55 + Math.sin(t * 3) * 0.12;
  }
}

export class Cast {
  readonly group = new THREE.Group();
  readonly chars = new Map<CastId, Character>();
  /** Unnamed-in-the-story people (stall seniors etc.), created on demand. */
  readonly extras: Character[] = [];
  private tex: THREE.Texture;

  extra(name: string, look: Look): Character {
    const c = new Character(`extra-${this.extras.length}`, { name, role: "", look }, this.tex);
    this.extras.push(c);
    this.group.add(c.root);
    return c;
  }

  removeExtra(c: Character) {
    this.group.remove(c.root);
    const i = this.extras.indexOf(c);
    if (i >= 0) this.extras.splice(i, 1);
  }

  constructor() {
    const tex = markerTexture();
    this.tex = tex;
    for (const id of Object.keys(CAST) as CastId[]) {
      const c = new Character(id, CAST[id], tex);
      this.chars.set(id, c);
      this.group.add(c.root);
    }
  }

  get(id: CastId): Character {
    return this.chars.get(id)!;
  }

  update(dt: number, player: THREE.Vector3, t: number) {
    for (const c of this.chars.values()) c.update(dt, player, t);
    for (const c of this.extras) c.update(dt, player, t);
  }

  /** Is (x, z) inside a visible character? For player collision. */
  blocked(x: number, z: number) {
    for (const c of [...this.chars.values(), ...this.extras]) {
      if (!c.root.visible) continue;
      if ((c.x - x) ** 2 + (c.z - z) ** 2 < 0.22) return true;
    }
    return false;
  }
}
