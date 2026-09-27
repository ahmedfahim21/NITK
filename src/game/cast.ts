/**
 * The named characters of Chapter 1. Fictional people in a real place: none
 * of them is modelled on a real student or staff member.
 */
import * as THREE from "three";
import { makeStudent, type Look } from "../player";
import { groundHeight } from "../world/terrain";

export type CastId = "prakash" | "rohan" | "shetty" | "warden" | "vikram" | "ananya" | "nescafe";

type Def = { name: string; role: string; look: Look; scale?: number };

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

  constructor(
    readonly id: CastId,
    tex: THREE.Texture
  ) {
    const s = makeStudent(CAST[id].look);
    this.root = s.root;
    this.parts = s.parts;
    this.marker = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
    this.marker.scale.set(0.75, 0.75, 1);
    this.marker.position.y = 2.55;
    this.marker.renderOrder = 5;
    this.marker.visible = false;
    this.root.add(this.marker);
    this.root.visible = false;
  }

  get name() {
    return CAST[this.id].name;
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

  constructor() {
    const tex = markerTexture();
    for (const id of Object.keys(CAST) as CastId[]) {
      const c = new Character(id, tex);
      this.chars.set(id, c);
      this.group.add(c.root);
    }
  }

  get(id: CastId): Character {
    return this.chars.get(id)!;
  }

  update(dt: number, player: THREE.Vector3, t: number) {
    for (const c of this.chars.values()) c.update(dt, player, t);
  }

  /** Is (x, z) inside a visible character? For player collision. */
  blocked(x: number, z: number) {
    for (const c of this.chars.values()) {
      if (!c.root.visible) continue;
      if ((c.x - x) ** 2 + (c.z - z) ** 2 < 0.22) return true;
    }
    return false;
  }
}
