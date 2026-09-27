/**
 * You: a first-year CSE student, modelled for this cel world. Heather-grey
 * NITK tee over dark jeans, white sneakers with a blue stripe, a black
 * backpack with orange zip pulls, the blue IRIS lanyard with your ID card.
 *
 * The rig (pelvis, spine, chest, neck, head; upper arm, forearm, hand;
 * thigh, shin, foot) and its procedural animator are adapted from SADAK's
 * hero.ts (github.com/mittal-parth/sadak): walk to jog to sprint with heel
 * strike and toe-off, counter-rotating spine and chest, a head that steadies
 * itself and glances at whoever is near, a crouch before a jump and a squash
 * on landing, lean into acceleration and bank into turns, and a bag and
 * lanyard on damped springs. Added here: riding a cycle, with the feet held
 * on the pedals by two-bone IK and the hands on the grips.
 */
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { toon } from "./fx/toon";

/* ---------------- look ---------------- */

const SKIN = 0xa86a45;
const SKIN_SHADE = 0x8f5634;
const TEE = 0x8c95a1;
const TEE_TRIM = 0x6f7884;
const CREST = 0xf2b84b;
const JEANS = 0x2a3a58;
const JEANS_SEAM = 0x3b4f74;
const SHOE = 0xf2f0ea;
const SHOE_SOLE = 0xcac4b7;
const SHOE_STRIPE = 0x2b6cc4;
const HAIR = 0x16110d;
const EYE = 0x1a1410;
const BAG = 0x1f2226;
const BAG_ZIP = 0xe0782b;
const LANYARD = 0x2b6cc4;
const CARD = 0xf4f4f0;
const WATCH = 0x2b2d31;

/** Heights, metres from the ground. */
const HIP_Y = 1.02;
const THIGH = 0.44;
const SHIN = 0.43;

/** Vertex-coloured parts merged into one mesh per bone. */
class Kit {
  private parts: THREE.BufferGeometry[] = [];
  add(g: THREE.BufferGeometry, hex: number): this {
    const geo = g.index ? g.toNonIndexed() : g;
    const c = new THREE.Color(hex);
    const n = geo.getAttribute("position").count;
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], i * 3);
    geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
    if (!geo.getAttribute("uv")) geo.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(n * 2), 2));
    this.parts.push(geo);
    return this;
  }
  mesh(mat: THREE.Material): THREE.Mesh {
    const g = mergeGeometries(this.parts, false);
    if (!g) throw new Error("[hero] could not merge a body part");
    this.parts.forEach((p) => p.dispose());
    const m = new THREE.Mesh(g, mat);
    m.castShadow = true;
    m.receiveShadow = true;
    return m;
  }
}

/** A capsule hanging down from its joint: top at y=0, bottom at -len. */
const limb = (r0: number, len: number, r1 = r0) => new THREE.CylinderGeometry(r0, r1, len, 12, 1).translate(0, -len / 2, 0);

export type HeroRig = {
  root: THREE.Group;
  pelvis: THREE.Group;
  spine: THREE.Group;
  chest: THREE.Group;
  neck: THREE.Group;
  head: THREE.Group;
  shoulderL: THREE.Group;
  shoulderR: THREE.Group;
  elbowL: THREE.Group;
  elbowR: THREE.Group;
  wristL: THREE.Group;
  wristR: THREE.Group;
  hipL: THREE.Group;
  hipR: THREE.Group;
  kneeL: THREE.Group;
  kneeR: THREE.Group;
  ankleL: THREE.Group;
  ankleR: THREE.Group;
  bag: THREE.Group;
  lanyard: THREE.Group;
};

/**
 * The bare skeleton: joints only, at the hero's proportions, feet on y=0,
 * facing +z. The hero, the named characters and the crowd all hang their
 * meshes on this, so one animator drives everyone.
 */
export function makeSkeleton(name = "person"): HeroRig {
  const g = (n: string, parent: THREE.Object3D, x = 0, y = 0, z = 0) => {
    const o = new THREE.Group();
    o.name = n;
    o.position.set(x, y, z);
    parent.add(o);
    return o;
  };
  const root = new THREE.Group();
  root.name = name;
  const pelvis = g("pelvis", root, 0, HIP_Y, 0);
  const hipL = g("hipL", pelvis, -0.095, -0.05, 0);
  const hipR = g("hipR", pelvis, 0.095, -0.05, 0);
  const kneeL = g("kneeL", hipL, 0, -THIGH, 0);
  const kneeR = g("kneeR", hipR, 0, -THIGH, 0);
  const ankleL = g("ankleL", kneeL, 0, -SHIN, 0);
  const ankleR = g("ankleR", kneeR, 0, -SHIN, 0);
  const spine = g("spine", pelvis, 0, 0.08, 0);
  const chest = g("chest", spine, 0, 0.14, 0);
  const bag = g("bag", chest, 0, 0.3, -0.17);
  const lanyard = g("lanyard", chest, 0, 0.32, 0.12);
  const neck = g("neck", chest, 0, 0.27, 0.01);
  const head = g("head", neck, 0, 0.08, 0.01);
  const shoulderL = g("shoulderL", chest, -0.212, 0.23, 0);
  const shoulderR = g("shoulderR", chest, 0.212, 0.23, 0);
  const elbowL = g("elbowL", shoulderL, 0, -0.28, 0);
  const elbowR = g("elbowR", shoulderR, 0, -0.28, 0);
  const wristL = g("wristL", elbowL, 0, -0.24, 0);
  const wristR = g("wristR", elbowR, 0, -0.24, 0);
  return { root, pelvis, spine, chest, neck, head, shoulderL, shoulderR, elbowL, elbowR, wristL, wristR, hipL, hipR, kneeL, kneeR, ankleL, ankleR, bag, lanyard };
}

/** The hero, standing, feet on y=0, facing +z. */
export function makeHero(): { root: THREE.Group; rig: HeroRig } {
  const mat = toon(0xffffff, { vertexColors: true, flat: false });
  const rig = makeSkeleton("hero");
  const { root, pelvis, spine, chest, bag, lanyard, neck, head } = rig;

  {
    const k = new Kit();
    // Jeans seat, a belt, and the tee's hem over it.
    k.add(new THREE.CylinderGeometry(0.155, 0.165, 0.2, 14).translate(0, -0.06, 0), JEANS);
    k.add(new THREE.CylinderGeometry(0.163, 0.163, 0.035, 14).translate(0, 0.03, 0), 0x2b2118);
    k.add(new THREE.CylinderGeometry(0.182, 0.19, 0.1, 16, 1, true).translate(0, 0.07, 0), TEE);
    pelvis.add(k.mesh(mat));
  }

  const leg = (side: number) => {
    const hip = side < 0 ? rig.hipL : rig.hipR;
    {
      const k = new Kit();
      k.add(limb(0.078, THIGH, 0.062), JEANS);
      k.add(new THREE.SphereGeometry(0.078, 12, 8), JEANS);
      k.add(new THREE.BoxGeometry(0.006, THIGH * 0.9, 0.02).translate(side * 0.07, -THIGH / 2, 0), JEANS_SEAM);
      hip.add(k.mesh(mat));
    }
    const knee = side < 0 ? rig.kneeL : rig.kneeR;
    {
      const k = new Kit();
      k.add(new THREE.SphereGeometry(0.062, 12, 8), JEANS);
      k.add(limb(0.06, SHIN - 0.03, 0.052), JEANS);
      k.add(new THREE.CylinderGeometry(0.057, 0.057, 0.035, 12).translate(0, -SHIN + 0.05, 0), JEANS_SEAM);
      knee.add(k.mesh(mat));
    }
    const ankle = side < 0 ? rig.ankleL : rig.ankleR;
    {
      const k = new Kit();
      k.add(new THREE.BoxGeometry(0.1, 0.075, 0.25).translate(0, -0.035, 0.05), SHOE);
      k.add(new THREE.SphereGeometry(0.05, 10, 6).scale(1, 0.75, 1).translate(0, -0.03, 0.17), SHOE);
      k.add(new THREE.BoxGeometry(0.108, 0.025, 0.27).translate(0, -0.075, 0.055), SHOE_SOLE);
      k.add(new THREE.BoxGeometry(0.104, 0.016, 0.13).rotateX(0.25).translate(0, -0.02, 0.03), SHOE_STRIPE);
      k.add(new THREE.BoxGeometry(0.07, 0.01, 0.1).translate(0, 0.005, 0.1), 0xdedad0);
      ankle.add(k.mesh(mat));
    }
    return { hip, knee, ankle };
  };
  leg(-1);
  leg(1);

  {
    const k = new Kit();
    k.add(new THREE.CylinderGeometry(0.182, 0.185, 0.2, 16).translate(0, 0.08, 0), TEE);
    spine.add(k.mesh(mat));
  }
  {
    const k = new Kit();
    k.add(new THREE.CylinderGeometry(0.212, 0.182, 0.3, 16).scale(1, 1, 0.78).translate(0, 0.13, 0), TEE);
    k.add(new THREE.SphereGeometry(0.212, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.35, 0.78).translate(0, 0.28, 0), TEE);
    // Crew neck, the NITK crest printed on the chest.
    k.add(new THREE.TorusGeometry(0.058, 0.012, 6, 16).rotateX(Math.PI / 2).translate(0, 0.33, 0.01), TEE_TRIM);
    k.add(new THREE.CylinderGeometry(0.04, 0.04, 0.008, 16).rotateX(Math.PI / 2).translate(-0.08, 0.2, 0.168), CREST);
    k.add(new THREE.BoxGeometry(0.1, 0.014, 0.006).translate(-0.08, 0.15, 0.168), CREST);
    // Backpack straps over the shoulders.
    for (const s of [-1, 1]) {
      k.add(new THREE.BoxGeometry(0.03, 0.3, 0.01).rotateX(0.12).translate(s * 0.135, 0.16, 0.162), 0x2e3238);
      k.add(new THREE.BoxGeometry(0.032, 0.02, 0.2).translate(s * 0.135, 0.305, 0), 0x2e3238);
    }
    chest.add(k.mesh(mat));
  }

  // The backpack, hung from the top of the chest so it can swing.
  {
    const k = new Kit();
    k.add(new THREE.BoxGeometry(0.32, 0.4, 0.15).translate(0, -0.22, -0.035), BAG);
    k.add(new THREE.BoxGeometry(0.26, 0.18, 0.05).translate(0, -0.32, -0.13), 0x2a2e33);
    k.add(new THREE.BoxGeometry(0.3, 0.012, 0.012).translate(0, -0.04, -0.113), BAG_ZIP);
    for (const x of [-0.06, 0.06]) k.add(new THREE.BoxGeometry(0.02, 0.05, 0.01).translate(x, -0.08, -0.118), BAG_ZIP);
    bag.add(k.mesh(mat));
  }

  // The ID card on its lanyard, hanging from the neck.
  {
    const k = new Kit();
    for (const s of [-1, 1]) k.add(new THREE.BoxGeometry(0.016, 0.2, 0.006).rotateZ(s * 0.28).translate(s * 0.03, -0.09, 0.03), LANYARD);
    k.add(new THREE.BoxGeometry(0.075, 0.1, 0.008).translate(0, -0.23, 0.035), CARD);
    k.add(new THREE.BoxGeometry(0.075, 0.024, 0.009).translate(0, -0.19, 0.036), LANYARD);
    lanyard.add(k.mesh(mat));
  }

  {
    const k = new Kit();
    k.add(new THREE.CylinderGeometry(0.048, 0.056, 0.1, 12).translate(0, 0.04, 0), SKIN);
    neck.add(k.mesh(mat));
  }
  {
    const k = new Kit();
    k.add(new THREE.SphereGeometry(0.1, 20, 14).scale(0.92, 1.12, 1.0).translate(0, 0.09, 0), SKIN);
    k.add(new THREE.SphereGeometry(0.07, 14, 8).scale(1, 0.8, 1).translate(0, 0.02, 0.035), SKIN);
    k.add(new THREE.ConeGeometry(0.018, 0.045, 6).rotateX(Math.PI / 2).translate(0, 0.08, 0.105), SKIN_SHADE);
    for (const s of [-1, 1]) {
      k.add(new THREE.SphereGeometry(0.022, 8, 6).scale(0.5, 1, 0.8).translate(s * 0.093, 0.085, 0), SKIN_SHADE);
      k.add(new THREE.SphereGeometry(0.013, 8, 6).scale(1, 0.8, 0.5).translate(s * 0.035, 0.11, 0.092), EYE);
      k.add(new THREE.BoxGeometry(0.04, 0.009, 0.01).rotateZ(s * -0.12).translate(s * 0.036, 0.137, 0.094), HAIR);
    }
    k.add(new THREE.BoxGeometry(0.04, 0.005, 0.01).translate(0, 0.03, 0.094), 0x5a2e1e);
    // Short hair, fuller on top with a side part, faded at the back.
    k.add(new THREE.SphereGeometry(0.108, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.36).scale(0.95, 1.12, 1.05).translate(0, 0.1, -0.008), HAIR);
    k.add(new THREE.SphereGeometry(0.106, 14, 10, Math.PI, Math.PI, 0, Math.PI * 0.72).scale(0.95, 1.1, 1.02).translate(0, 0.1, -0.01), HAIR);
    k.add(new THREE.SphereGeometry(0.075, 12, 8).scale(1.35, 0.55, 1.15).translate(-0.01, 0.205, 0.02), HAIR);
    for (const [x, rz] of [[-0.045, 0.45], [-0.005, 0.3], [0.04, 0.18]] as const) {
      k.add(new THREE.ConeGeometry(0.028, 0.075, 5).rotateX(-1.2).rotateZ(rz).translate(x, 0.175, 0.083), HAIR);
    }
    for (const s of [-1, 1]) k.add(new THREE.BoxGeometry(0.02, 0.045, 0.06).translate(s * 0.093, 0.13, -0.01), HAIR);
    head.add(k.mesh(mat));
  }

  const arm = (side: number) => {
    const shoulder = side < 0 ? rig.shoulderL : rig.shoulderR;
    {
      const k = new Kit();
      // Short tee sleeve, then the bare upper arm.
      k.add(new THREE.SphereGeometry(0.066, 12, 8), TEE);
      k.add(limb(0.066, 0.13, 0.06), TEE);
      k.add(limb(0.05, 0.28, 0.046), SKIN);
      shoulder.add(k.mesh(mat));
    }
    const elbow = side < 0 ? rig.elbowL : rig.elbowR;
    {
      const k = new Kit();
      k.add(new THREE.SphereGeometry(0.046, 10, 6), SKIN);
      k.add(limb(0.044, 0.23, 0.036), SKIN);
      if (side < 0) k.add(new THREE.CylinderGeometry(0.041, 0.041, 0.025, 10).translate(0, -0.2, 0), WATCH);
      elbow.add(k.mesh(mat));
    }
    const wrist = side < 0 ? rig.wristL : rig.wristR;
    {
      const k = new Kit();
      k.add(new THREE.BoxGeometry(0.06, 0.09, 0.035).translate(0, -0.045, 0.005), SKIN);
      k.add(new THREE.BoxGeometry(0.018, 0.045, 0.02).rotateZ(side * 0.4).translate(side * -0.032, -0.03, 0.02), SKIN);
      wrist.add(k.mesh(mat));
    }
    return { shoulder, elbow, wrist };
  };
  arm(-1);
  arm(1);
  return { root, rig };
}

/* ---------------- animation ---------------- */

/** What the body is doing this frame. */
export type HeroMotion = {
  dt: number;
  /** Wall clock, seconds. */
  t: number;
  /** Ground speed, m/s. */
  speed: number;
  /** Forward acceleration, m/s^2 (negative when braking). */
  accel: number;
  /** Turn rate of the body, rad/s (positive = turning left). */
  turn: number;
  /** 0 on the ground .. 1 in the air. */
  air: number;
  /** Vertical velocity while airborne, m/s. */
  vy: number;
  /** 0..1: the crouch before a jump, or the squash of a landing. */
  crouch: number;
  /** Head turn toward something interesting, radians about Y (0 = ahead). */
  look: number;
  /** Riding a cycle: the crank angle (radians); undefined on foot. */
  pedal?: number;
};

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
/** One-sided and C1-continuous, so the knee never kinks at the crossover. */
const pos = (x: number) => (x > 0 ? x * x : 0);

/** A damped spring on one angle, for the bag and the lanyard. */
class Swing {
  angle = 0;
  vel = 0;
  constructor(
    private k: number,
    private damping: number
  ) {}
  step(dt: number, drive: number, rest = 0) {
    const acc = -this.k * (this.angle - rest) - this.damping * this.vel + drive;
    this.vel += acc * dt;
    this.angle += this.vel * dt;
    this.angle = Math.max(-1.1, Math.min(1.1, this.angle));
  }
}

/** Where the cycle puts you (bike frame = body frame, +z forward), from game/cycles.ts. */
const SEAT = { y: 1.0, z: -0.2 };
const CRANK = { y: 0.3, z: 0.02, r: 0.17 };
const GRIP = { y: 1.02, z: 0.38 };

/** Two-bone IK in the leg's plane: hip and knee angles that put the ankle at (dy, dz) from the hip. */
function legIK(dy: number, dz: number): { hip: number; knee: number } {
  const L1 = THIGH;
  const L2 = SHIN;
  const d = Math.min(L1 + L2 - 0.005, Math.max(0.1, Math.hypot(dy, dz)));
  // Forward of straight down, then the thigh lifts further by the triangle's hip angle.
  const line = Math.atan2(dz, -dy);
  const atHip = Math.acos(Math.min(1, (L1 * L1 + d * d - L2 * L2) / (2 * L1 * d)));
  const atKnee = Math.acos(Math.min(1, (L1 * L1 + L2 * L2 - d * d) / (2 * L1 * L2)));
  return { hip: line + atHip, knee: Math.PI - atKnee };
}

/**
 * Drives the hero's rig from its motion. Owns the stride phase so the feet
 * keep pace with the ground: one step per half cycle, the step as long as
 * the leg's swing makes it.
 */
export class HeroAnimator {
  private phase = 0;
  private bagFwd = new Swing(28, 5);
  private bagSide = new Swing(24, 5);
  private card = new Swing(40, 6);
  private headYaw = 0;
  private lastBob = 0;

  constructor(private rig: HeroRig) {}

  /** Metres per step: about 0.9 m at a stroll, 1.9 m at a jog, 2.1 m flat out. */
  static stepLength(speed: number): number {
    return Math.min(2.1, Math.max(0.6, 0.5 + 0.3 * speed));
  }

  update(m: HeroMotion): void {
    if (m.pedal !== undefined) return this.ride(m);
    const r = this.rig;
    const dt = Math.min(m.dt, 0.05);
    const moving = smooth(0.12, 0.9, m.speed);
    const run = smooth(2.2, 4.6, m.speed);
    const sprint = smooth(5.5, 9.5, m.speed);
    this.phase += ((Math.PI * m.speed) / HeroAnimator.stepLength(m.speed)) * dt;
    const ph = this.phase;
    const s = Math.sin(ph);
    const c = Math.cos(ph);

    /* ---- legs ---- */
    const stride = lerp(0.38, 0.55, run) + sprint * 0.12;
    const kneeLift = lerp(0.65, 1.1, run) + sprint * 0.35;
    const swingL = Math.max(0, c) ** 1.5;
    const swingR = Math.max(0, -c) ** 1.5;
    const idleShift = Math.sin(m.t * 0.55);
    let hipL = lerp(idleShift * 0.03, s * stride, moving);
    let hipR = lerp(-idleShift * 0.03, -s * stride, moving);
    let kneeL = lerp(0.04 + Math.max(0, idleShift) * 0.06, 0.08 + run * 0.12 + swingL * kneeLift, moving);
    let kneeR = lerp(0.04 + Math.max(0, -idleShift) * 0.06, 0.08 + run * 0.12 + swingR * kneeLift, moving);
    let ankleL = moving * (swingL * 0.3 - Math.max(0, s) * (1 - swingL) * 0.18 + Math.max(0, -s) * (1 - swingL) * 0.3);
    let ankleR = moving * (swingR * 0.3 - Math.max(0, -s) * (1 - swingR) * 0.18 + Math.max(0, s) * (1 - swingR) * 0.3);

    /* ---- arms ---- */
    const armSwing = lerp(0.35, 0.8, run) + sprint * 0.15;
    const elbowBend = lerp(0.15, 1.2, run) + sprint * 0.2;
    const breath = Math.sin(m.t * 1.5);
    let shL = lerp(0.05 + breath * 0.02, -s * armSwing, moving);
    let shR = lerp(-0.03 + breath * 0.02, s * armSwing, moving);
    let elL = lerp(0.14, pos(-s) * 0.4 + elbowBend, moving);
    let elR = lerp(0.18, pos(s) * 0.4 + elbowBend, moving);
    let armOut = 0.08;

    /* ---- trunk ---- */
    const bob = lerp(breath * 0.006, (1 - Math.abs(s)) * lerp(0.025, 0.05, run) - 0.02, moving);
    let pelvisY = HIP_Y + bob - run * 0.03;
    const pelvisTwist = lerp(idleShift * 0.02, s * lerp(0.08, 0.14, run), moving);
    const pelvisRoll = lerp(idleShift * 0.035, s * lerp(0.03, 0.05, run), moving);
    const lean = Math.max(-0.2, Math.min(0.3, m.accel * 0.018 + run * 0.1 + sprint * 0.12));
    const bank = Math.max(-0.25, Math.min(0.25, -m.turn * m.speed * 0.02));
    let spineX = lean * 0.6;
    const chestX = lean * 0.4 - breath * 0.01;
    const chestTwist = -pelvisTwist * 1.3;
    let headX = -lean * 0.7;

    /* ---- jump and landing ---- */
    if (m.air > 0.001) {
      const rising = m.vy > 0 ? 1 : 0;
      const a = m.air;
      hipL = lerp(hipL, rising ? 0.9 : 0.5, a);
      hipR = lerp(hipR, rising ? -0.2 : 0.25, a);
      kneeL = lerp(kneeL, rising ? 1.3 : 0.6, a);
      kneeR = lerp(kneeR, rising ? 0.4 : 0.5, a);
      ankleL = lerp(ankleL, 0.2, a);
      ankleR = lerp(ankleR, 0.35, a);
      shL = lerp(shL, rising ? 2.4 : 1.1, a);
      shR = lerp(shR, rising ? 2.1 : 0.9, a);
      elL = lerp(elL, 0.6, a);
      elR = lerp(elR, 0.5, a);
      armOut = lerp(armOut, 0.45, a);
      spineX = lerp(spineX, rising ? 0.1 : -0.05, a);
    }
    if (m.crouch > 0.001) {
      const k = m.crouch;
      pelvisY -= 0.2 * k;
      hipL += 0.75 * k;
      hipR += 0.75 * k;
      kneeL += 1.3 * k;
      kneeR += 1.3 * k;
      spineX += 0.35 * k;
      headX -= 0.3 * k;
      shL -= 0.6 * k;
      shR -= 0.6 * k;
    }

    /* ---- head: steady the gaze, glance at what is near ---- */
    this.headYaw += (m.look - this.headYaw) * (1 - Math.exp(-5 * dt));
    const idleGlance = (1 - moving) * Math.sin(m.t * 0.23) * 0.35;

    /* ---- write the rig ---- */
    r.pelvis.position.set(0, pelvisY, 0);
    r.pelvis.rotation.set(lean * 0.4, pelvisTwist, pelvisRoll + bank);
    r.hipL.rotation.set(-hipL - lean * 0.4, 0, 0.02);
    r.hipR.rotation.set(-hipR - lean * 0.4, 0, -0.02);
    r.kneeL.rotation.x = kneeL;
    r.kneeR.rotation.x = kneeR;
    r.ankleL.rotation.x = hipL - kneeL + ankleL;
    r.ankleR.rotation.x = hipR - kneeR + ankleR;
    r.spine.rotation.set(spineX, -pelvisTwist * 0.5, -pelvisRoll * 0.6);
    r.chest.rotation.set(chestX, chestTwist, -pelvisRoll * 0.4 - bank * 0.5);
    r.neck.rotation.set(0, -chestTwist * 0.6 + this.headYaw * 0.4, 0);
    r.head.rotation.set(headX, this.headYaw * 0.6 + idleGlance, -bank * 0.4);
    r.shoulderL.rotation.set(-shL, 0, -armOut);
    r.shoulderR.rotation.set(-shR, 0, armOut);
    r.elbowL.rotation.x = -elL;
    r.elbowR.rotation.x = -elR;
    r.wristL.rotation.set(-0.1 - run * 0.2, 0, 0.1);
    r.wristR.rotation.set(-0.1 - run * 0.2, 0, -0.1);

    /* ---- secondary motion: backpack and ID card on springs ---- */
    const vBob = (bob - this.lastBob) / Math.max(dt, 1e-4);
    this.lastBob = bob;
    this.bagFwd.step(dt, m.accel * 1.2 + vBob * 5 + (m.air > 0 ? -m.vy * 2 : 0), lean * 0.5);
    this.bagSide.step(dt, m.turn * m.speed * 1.0 + Math.cos(ph) * moving * run * 5, 0);
    this.card.step(dt, m.accel * 1.2 + vBob * 10 + m.speed * 0.8, Math.min(0.6, m.speed * 0.06));
    r.bag.rotation.set(-Math.abs(this.bagFwd.angle) * 0.6, 0, -this.bagSide.angle * 0.5);
    r.lanyard.rotation.set(-this.card.angle, 0, -this.bagSide.angle * 0.3);
  }

  /** On the cycle: seated, feet on the pedals (IK), hands on the grips, leaning into turns. */
  private ride(m: HeroMotion) {
    const r = this.rig;
    const dt = Math.min(m.dt, 0.05);
    const crank = m.pedal ?? 0;
    const effort = smooth(0.5, 6, m.speed);
    const lean = 0.32 + effort * 0.12;
    const bank = Math.max(-0.3, Math.min(0.3, -m.turn * m.speed * 0.03));
    // Hips in the pelvis frame sit 0.05 below it; the pelvis tips forward by `lean`.
    const hipY = SEAT.y - 0.05;
    const leg = (angle: number) => {
      const fy = CRANK.y + Math.cos(angle) * CRANK.r;
      const fz = CRANK.z + Math.sin(angle) * CRANK.r;
      return legIK(fy - hipY, fz - SEAT.z);
    };
    const Lk = leg(crank);
    const Rk = leg(crank + Math.PI);
    // Stand on the pedals a little when pushing hard.
    const rock = Math.sin(crank) * effort * 0.05;
    r.pelvis.position.set(0, SEAT.y, SEAT.z);
    r.pelvis.rotation.set(0, rock * 0.5, bank + rock);
    r.hipL.rotation.set(-Lk.hip, 0, 0.06);
    r.hipR.rotation.set(-Rk.hip, 0, -0.06);
    r.kneeL.rotation.x = Lk.knee;
    r.kneeR.rotation.x = Rk.knee;
    r.ankleL.rotation.x = Lk.hip - Lk.knee + 0.15;
    r.ankleR.rotation.x = Rk.hip - Rk.knee + 0.15;
    r.spine.rotation.set(lean, 0, -rock * 0.6);
    r.chest.rotation.set(lean * 0.6, -rock * 0.4, -bank * 0.4);
    this.headYaw += (m.look - this.headYaw) * (1 - Math.exp(-5 * dt));
    r.neck.rotation.set(-lean * 0.6, this.headYaw * 0.4, 0);
    r.head.rotation.set(-lean * 0.5, this.headYaw * 0.6, -bank * 0.5);
    // Reach for the grips: shoulders forward, elbows soft.
    const reach = Math.atan2(GRIP.z - SEAT.z, 0.1) - lean * 1.6;
    for (const [sh, el, wr, side] of [
      [r.shoulderL, r.elbowL, r.wristL, -1],
      [r.shoulderR, r.elbowR, r.wristR, 1],
    ] as const) {
      sh.rotation.set(-reach - 0.35, 0, side * -0.12);
      el.rotation.x = -0.45;
      wr.rotation.set(0.2, 0, 0);
    }
    this.bagFwd.step(dt, m.accel * 1.2, 0.1);
    this.card.step(dt, m.speed * 1.2, Math.min(0.9, m.speed * 0.1));
    r.bag.rotation.set(-0.12 - Math.abs(this.bagFwd.angle) * 0.4, 0, 0);
    r.lanyard.rotation.set(-this.card.angle, 0, 0);
  }
}
